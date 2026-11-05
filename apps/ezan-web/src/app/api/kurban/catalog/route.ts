import { NextRequest, NextResponse } from "next/server";
import { Locale } from "../../../../i18n/country-locale";
import { getPublicKurbanCatalog } from "../../../../kurban/service";

export async function GET(req: NextRequest) {
  const locale = (req.nextUrl.searchParams.get("locale") || "tr") as Locale;
  // Testlarda salesCloseAt o'tganini tekshirish uchun fakeNowMs qo'llab-quvvatlanadi (faqat non-prod rejimda)
  const fakeNowParam = req.nextUrl.searchParams.get("nowMs");
  const nowMs =
    process.env.NODE_ENV !== "production" && fakeNowParam && Number.isFinite(Number(fakeNowParam))
      ? Number(fakeNowParam)
      : Date.now();

  const catalog = await getPublicKurbanCatalog(locale, nowMs);
  return NextResponse.json(catalog);
}
