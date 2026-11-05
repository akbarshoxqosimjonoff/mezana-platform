import { NextRequest, NextResponse } from "next/server";
import { dbQuery, ensureSchema } from "../../../../db/schema";
import { canAccessAdminCms, getAuthenticatedAdminSession } from "../../../../lib/security";
import {
  approveAndPublishKurbanVideo,
  assignPaidSharesToAnimals,
  expireStaleKurbanReservations,
  getKurbanSeasonSummary
} from "../../../../kurban/service";
import { resendKurbanMessageLog } from "../../../../kurban/messaging";
import { runVideoWorkerTick } from "../../../../kurban/video-worker";

export async function GET(req: NextRequest) {
  await ensureSchema();
  const cookie = req.cookies.get("ezan_admin_session")?.value;
  const session = await getAuthenticatedAdminSession(cookie);
  if (!session || !session.totpVerified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessAdminCms(session.role)) {
    return NextResponse.json({ error: "Forbidden: Field role cannot access Admin Kurban panel" }, { status: 403 });
  }

  const seasonYear = Number(req.nextUrl.searchParams.get("season") || 2027);
  const [summary, animals, videos, messageLogs, kvkkRequests] = await Promise.all([
    getKurbanSeasonSummary(seasonYear),
    dbQuery("SELECT * FROM kurban_animals WHERE season_year = $1 ORDER BY id DESC LIMIT 100", [seasonYear]),
    dbQuery("SELECT * FROM kurban_videos WHERE season_year = $1 ORDER BY id DESC LIMIT 100", [seasonYear]),
    dbQuery("SELECT * FROM kurban_message_logs ORDER BY id DESC LIMIT 100"),
    dbQuery("SELECT * FROM kvkk_deletion_requests ORDER BY id DESC LIMIT 50")
  ]);

  return NextResponse.json({
    summary,
    animals: animals.rows,
    videos: videos.rows,
    messageLogs: messageLogs.rows,
    kvkkRequests: kvkkRequests.rows
  });
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const cookie = req.cookies.get("ezan_admin_session")?.value;
  const session = await getAuthenticatedAdminSession(cookie);
  if (!session || !session.totpVerified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessAdminCms(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "ezanvakfi.org";
    const originBaseUrl = `https://${host}`;

    if (body.action === "assign_animals") {
      const result = await assignPaidSharesToAnimals({
        seasonYear: Number(body.seasonYear || 2027),
        countryCode: String(body.countryCode || "TD"),
        animalType: body.animalType || "cattle",
        actorEmail: session.email,
        actorRole: session.role,
        manualBucketsOverride: body.manualBucketsOverride
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "approve_video") {
      const result = await approveAndPublishKurbanVideo({
        videoId: Number(body.videoId),
        actorEmail: session.email,
        actorRole: session.role,
        originBaseUrl
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "resend_message") {
      const result = await resendKurbanMessageLog(Number(body.logId));
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "run_video_worker") {
      const result = await runVideoWorkerTick();
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "expire_reservations") {
      const result = await expireStaleKurbanReservations();
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Action failed" }, { status: err?.statusCode || 400 });
  }
}
