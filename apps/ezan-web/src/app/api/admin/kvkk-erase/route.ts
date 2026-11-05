import { NextRequest, NextResponse } from "next/server";
import { verifyAdminNetworkLayer } from "../../../../cms/service";
import { eraseDonorPiiByKvkkRequest, getAuthenticatedAdminSession } from "../../../../lib/security";

export async function POST(req: NextRequest) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const peerIp = req.headers.get("x-real-ip") || req.headers.get("x-peer-ip");
  const cfJwt = req.headers.get("cf-access-jwt-assertion");

  const netCheck = await verifyAdminNetworkLayer({
    cfConnectingIp: cfIp,
    peerIp,
    cfAccessJwt: cfJwt
  });
  if (!netCheck.allowed) {
    return NextResponse.json({ error: netCheck.reason || "Forbidden IP / Cloudflare Access Required" }, { status: 403 });
  }

  const sessionCookie = req.cookies.get("ezan_admin_session")?.value;
  const adminSession = await getAuthenticatedAdminSession(sessionCookie);
  if (!adminSession || adminSession.role !== "admin" || !adminSession.totpVerified) {
    return NextResponse.json(
      { error: "Unauthorized: Admin role with verified 2FA (TOTP) session is required" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const res = await eraseDonorPiiByKvkkRequest({
      target: String(body.target || ""),
      confirm: String(body.confirm || ""),
      reason: String(body.reason || ""),
      actor: adminSession,
      clientIp: cfIp
    });
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "KVKK erase failed" },
      { status: err?.statusCode || 400 }
    );
  }
}
