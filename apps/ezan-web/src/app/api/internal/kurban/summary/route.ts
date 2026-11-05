import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSyncAuth } from "../../../../../sync";
import { getKurbanSeasonSummary } from "../../../../../kurban/service";

export async function GET(req: NextRequest) {
  const timestamp = req.headers.get("x-timestamp");
  const signature = req.headers.get("x-signature");
  const pathAndQuery = req.nextUrl.pathname + req.nextUrl.search;

  const auth = verifyInternalSyncAuth({
    timestampHeader: timestamp,
    signatureHeader: signature,
    method: "GET",
    pathAndQuery
  });

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  const seasonYear = Number(req.nextUrl.searchParams.get("season") || 2027);
  const summary = await getKurbanSeasonSummary(seasonYear);
  return NextResponse.json({
    season: summary.season,
    totals: summary.totals,
    countries: summary.countries
  });
}
