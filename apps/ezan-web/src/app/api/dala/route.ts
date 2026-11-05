import { NextRequest, NextResponse } from "next/server";
import { dbQuery, ensureSchema } from "../../../db/schema";
import {
  canAccessDalaPortal,
  checkRateLimit,
  getAuthenticatedAdminSession,
  getRateLimitClientIp,
  loginAdminWithTotp
} from "../../../lib/security";
import { markAnimalSlaughtered } from "../../../kurban/service";
import {
  finalizeMultipartVideoUpload,
  getMultipartUploadStatus,
  initiateMultipartVideoUpload,
  recordMultipartPartUploaded
} from "../../../kurban/storage";
import { runVideoWorkerTick } from "../../../kurban/video-worker";

export async function GET(req: NextRequest) {
  await ensureSchema();
  const cookie = req.cookies.get("ezan_admin_session")?.value;
  const session = await getAuthenticatedAdminSession(cookie);
  if (!session || !session.totpVerified || !canAccessDalaPortal(session.role)) {
    return NextResponse.json({ error: "Unauthorized: Field 2FA login required" }, { status: 401 });
  }

  const tagQuery = (req.nextUrl.searchParams.get("tagNo") || "").trim();
  const countryFilter = session.role === "field" ? session.assignedCountryCode : req.nextUrl.searchParams.get("country") || null;

  const animalsRes = await dbQuery(
    `SELECT a.*,
            v.status AS video_status,
            v.processed_storage_key,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', s.id,
                  'seq', s.seq_in_order,
                  'ownerName', s.owner_name,
                  'intentionType', s.intention_type,
                  'status', s.status
                ) ORDER BY s.id ASC
              ) FILTER (WHERE s.id IS NOT NULL),
              '[]'::json
            ) AS shares
     FROM kurban_animals a
     LEFT JOIN kurban_videos v ON v.id = a.video_id
     LEFT JOIN kurban_shares s ON s.animal_id = a.id
     WHERE ($1::varchar IS NULL OR a.country_code = $1)
       AND ($2::varchar = '' OR a.tag_no ILIKE '%' || $2 || '%')
     GROUP BY a.id, v.status, v.processed_storage_key
     ORDER BY a.tag_no ASC`,
    [countryFilter, tagQuery]
  );

  return NextResponse.json({
    user: {
      email: session.email,
      role: session.role,
      assignedCountryCode: session.assignedCountryCode
    },
    animals: animalsRes.rows
  });
}

export async function POST(req: NextRequest) {
  await ensureSchema();

  try {
    const body = await req.json();

    if (body.action === "login") {
      const rlKey = `dala_login:${getRateLimitClientIp(req.headers)}`;
      const rl = checkRateLimit(rlKey, 5, 60_000);
      if (!rl.allowed) {
        return NextResponse.json({ error: "Too many login attempts" }, { status: 429 });
      }

      const { sessionCookieValue, user } = await loginAdminWithTotp({
        email: String(body.email || ""),
        password: String(body.password || ""),
        totpCode: String(body.totpCode || ""),
        clientIp: req.headers.get("cf-connecting-ip") || "127.0.0.1"
      });

      if (!canAccessDalaPortal(user.role)) {
        return NextResponse.json({ error: "Role not permitted on /dala" }, { status: 403 });
      }

      const isHttps = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol).includes("https");
      const res = NextResponse.json({ ok: true, user });
      res.cookies.set("ezan_admin_session", sessionCookieValue, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "lax",
        path: "/",
        maxAge: user.role === "field" ? 4 * 24 * 3600 : 8 * 3600
      });
      return res;
    }

    const cookie = req.cookies.get("ezan_admin_session")?.value;
    const session = await getAuthenticatedAdminSession(cookie);
    if (!session || !session.totpVerified || !canAccessDalaPortal(session.role)) {
      return NextResponse.json({ error: "Unauthorized: Field 2FA login required" }, { status: 401 });
    }

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "ezanvakfi.org";
    const originBaseUrl = `https://${host}`;

    if (body.action === "mark_slaughtered") {
      const res = await markAnimalSlaughtered({
        animalId: Number(body.animalId),
        actorEmail: session.email,
        actorRole: session.role,
        assignedCountryCode: session.role === "field" ? session.assignedCountryCode : null,
        originBaseUrl
      });
      return NextResponse.json({ ok: true, ...res });
    }

    if (body.action === "initiate_upload") {
      const res = await initiateMultipartVideoUpload({
        animalId: Number(body.animalId),
        fileName: String(body.fileName || "kurban.mp4"),
        mimeType: String(body.mimeType || "video/mp4"),
        totalSizeBytes: Number(body.totalSizeBytes || 0),
        uploadedBy: session.email,
        assignedCountryCode: session.role === "field" ? session.assignedCountryCode : null
      });
      return NextResponse.json({ ok: true, ...res });
    }

    if (body.action === "upload_part") {
      const res = await recordMultipartPartUploaded({
        uploadId: String(body.uploadId),
        partNumber: Number(body.partNumber),
        etag: body.etag,
        sizeBytes: body.sizeBytes,
        chunkDataBase64: body.chunkDataBase64
      });
      return NextResponse.json({ ok: true, ...res });
    }

    if (body.action === "upload_status") {
      const res = await getMultipartUploadStatus(String(body.uploadId));
      return NextResponse.json({ ok: true, ...res });
    }

    if (body.action === "finalize_upload") {
      const res = await finalizeMultipartVideoUpload({
        uploadId: String(body.uploadId),
        uploadedBy: session.email
      });
      // Worker navbatini darhol ishga tushiramiz
      await runVideoWorkerTick(2);
      return NextResponse.json({ ok: true, ...res });
    }

    return NextResponse.json({ error: "Unknown /dala action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Dala operation failed" }, { status: err?.statusCode || 400 });
  }
}
