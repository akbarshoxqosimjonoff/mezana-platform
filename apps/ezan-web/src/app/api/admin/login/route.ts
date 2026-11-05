import { NextRequest, NextResponse } from "next/server";
import { verifyAdminNetworkLayer } from "../../../../cms/service";
import { checkRateLimit, getRateLimitClientIp, loginAdminWithTotp } from "../../../../lib/security";

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
    return NextResponse.json({ error: netCheck.reason || "Forbidden network layer" }, { status: 403 });
  }

  const rlKey = `admin_login:${getRateLimitClientIp(req.headers)}`;
  const rl = checkRateLimit(rlKey, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many login attempts" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { sessionCookieValue, user } = await loginAdminWithTotp({
      email: String(body.email || ""),
      password: String(body.password || ""),
      totpCode: String(body.totpCode || ""),
      clientIp: cfIp
    });

    const res = NextResponse.json({ ok: true, user });
    res.cookies.set("ezan_admin_session", sessionCookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 3600
    });
    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Authentication failed" },
      { status: err?.statusCode || 401 }
    );
  }
}
