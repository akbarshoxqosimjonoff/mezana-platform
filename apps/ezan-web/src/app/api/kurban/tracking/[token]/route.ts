import { NextRequest, NextResponse } from "next/server";
import { Locale } from "../../../../../i18n/country-locale";
import { getKurbanTrackingDetails } from "../../../../../kurban/service";

export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const locale = (req.nextUrl.searchParams.get("locale") || "tr") as Locale;
  const details = await getKurbanTrackingDetails(token, locale);
  if (!details) {
    return NextResponse.json({ error: "Tracking token not found" }, { status: 404 });
  }
  return NextResponse.json(details, {
    headers: {
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    }
  });
}
