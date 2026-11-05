import { NextRequest, NextResponse } from "next/server";
import { Locale } from "../../../../i18n/country-locale";
import { checkRateLimit, getRateLimitClientIp, verifyTurnstileToken } from "../../../../lib/security";
import { requestDonorCabinetOtp } from "../../../../donor-cabinet/service";

export async function POST(req: NextRequest) {
  const ip = getRateLimitClientIp(req.headers);
  const rl = checkRateLimit(`donor-otp:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const turnstileToken =
      body.turnstileToken || (process.env.NODE_ENV !== "production" ? "dev-turnstile-ok" : "");
    const turnstileOk = await verifyTurnstileToken(turnstileToken);
    if (!turnstileOk) {
      return NextResponse.json({ error: "Turnstile verification failed" }, { status: 400 });
    }

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "ezanvakfi.org";
    const result = await requestDonorCabinetOtp({
      channel: body.channel === "email" ? "email" : "sms",
      target: String(body.target || ""),
      locale: (body.locale || "tr") as Locale,
      originHost: host,
      clientIp: ip
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to send OTP" }, { status: err?.statusCode || 400 });
  }
}
