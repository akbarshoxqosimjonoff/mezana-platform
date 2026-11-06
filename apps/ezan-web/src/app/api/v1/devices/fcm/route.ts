import { getGrowthFeatureFlags } from "../../../../../growth/service";
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, dbQuery } from "../../../../../db/schema";

export async function POST(request: NextRequest) {
  if (!getGrowthFeatureFlags().API_V1_ENABLED) {
    return NextResponse.json({ error: "Not Found (API_V1_ENABLED=false)" }, { status: 404 });
  }
  await ensureSchema();
  const body = await request.json();
  const deviceId = String(body.deviceId || "").trim();
  const fcmToken = String(body.fcmToken || "").trim();

  if (!deviceId || !fcmToken) {
    return NextResponse.json({ error: "deviceId and fcmToken are required" }, { status: 400 });
  }

  await dbQuery(
    `UPDATE mobile_api_tokens
     SET fcm_token = $2
     WHERE device_id = $1 AND revoked_at IS NULL`,
    [deviceId, fcmToken]
  );

  return NextResponse.json({ apiVersion: "v1", registered: true, deviceId });
}
