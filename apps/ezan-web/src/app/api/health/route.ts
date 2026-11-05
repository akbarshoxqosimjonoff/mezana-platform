import { NextResponse } from "next/server";
import { dbQuery } from "../../../db/schema";
import { SITE_CONFIG } from "../../../lib/config";

export async function GET() {
  try {
    await dbQuery("SELECT 1");
    return NextResponse.json({
      ok: true,
      service: "ezan-web",
      donationsLive: SITE_CONFIG.donationsLive,
      paymentProvider: SITE_CONFIG.paymentProvider,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Database unreachable" },
      { status: 500 }
    );
  }
}