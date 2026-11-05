import { NextRequest, NextResponse } from "next/server";
import { Locale } from "../../../../i18n/country-locale";
import {
  DONOR_SESSION_COOKIE_NAME,
  DONOR_SESSION_MAX_AGE_SECONDS,
  verifyDonorCabinetOtp
} from "../../../../donor-cabinet/service";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") || "";
  const code = req.nextUrl.searchParams.get("code") || "";
  const locale = (req.nextUrl.searchParams.get("locale") || "tr") as Locale;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "ezanvakfi.org";

  try {
    const result = await verifyDonorCabinetOtp({
      channel: "email",
      target: email,
      code,
      host,
      locale
    });

    const slug = locale === "uz" ? "kabinet" : locale === "en" ? "account" : "hesabim";
    const res = NextResponse.redirect(new URL(`/${locale}/${slug}`, req.url));
    res.cookies.set(DONOR_SESSION_COOKIE_NAME, result.sessionCookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DONOR_SESSION_MAX_AGE_SECONDS
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Invalid or expired magic link" }, { status: 401 });
  }
}
