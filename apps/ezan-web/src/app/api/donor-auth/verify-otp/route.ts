import { NextRequest, NextResponse } from "next/server";
import { Locale } from "../../../../i18n/country-locale";
import {
  DONOR_SESSION_COOKIE_NAME,
  DONOR_SESSION_MAX_AGE_SECONDS,
  verifyDonorCabinetOtp
} from "../../../../donor-cabinet/service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "ezanvakfi.org";
    const result = await verifyDonorCabinetOtp({
      channel: body.channel === "email" ? "email" : "sms",
      target: String(body.target || ""),
      code: String(body.code || ""),
      host,
      locale: (body.locale || "tr") as Locale
    });

    const res = NextResponse.json({
      ok: true,
      phone: result.phone,
      email: result.email,
      expiresInSeconds: result.expiresInSeconds
    });

    res.cookies.set(DONOR_SESSION_COOKIE_NAME, result.sessionCookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DONOR_SESSION_MAX_AGE_SECONDS
    });

    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "OTP verification failed" }, { status: err?.statusCode || 401 });
  }
}
