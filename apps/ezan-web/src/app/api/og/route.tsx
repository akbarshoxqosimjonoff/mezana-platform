import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get("title") || "Ezan Vakfı – İlim ve Hayırda Öncü";
  const locale = request.nextUrl.searchParams.get("locale") || "tr";
  const progress = Number(request.nextUrl.searchParams.get("progress") || "0");
  const isRtl = locale === "ar";
  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" dir="${isRtl ? "rtl" : "ltr"}">
    <rect width="1200" height="630" fill="#0B3B2E" />
    <rect x="40" y="40" width="1120" height="550" rx="24" fill="#114B3B" stroke="#C89D54" stroke-width="3" />
    <text x="${isRtl ? 1100 : 100}" y="140" fill="#C89D54" font-family="sans-serif" font-size="32" font-weight="bold">EZAN VAKFI • ${locale.toUpperCase()}</text>
    <text x="${isRtl ? 1100 : 100}" y="260" fill="#FFFFFF" font-family="sans-serif" font-size="48" font-weight="bold">${title.replace(/[<>&"]/g, "")}</text>
    ${
      pct > 0
        ? `<rect x="100" y="380" width="1000" height="28" rx="14" fill="#082920" />
           <rect x="100" y="380" width="${pct * 10}" height="28" rx="14" fill="#C89D54" />
           <text x="${isRtl ? 1100 : 100}" y="455" fill="#E2E8F0" font-family="sans-serif" font-size="28">%${pct} tamamlandı</text>`
        : ""
    }
    <text x="${isRtl ? 1100 : 100}" y="530" fill="#94A3B8" font-family="sans-serif" font-size="24">ezanvakfi.org • azonvaqfi.org</text>
  </svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
