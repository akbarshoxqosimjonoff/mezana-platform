import { getGrowthFeatureFlags } from "../../../../growth/service";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { ensureSchema, dbQuery } from "../../../../db/schema";

export async function GET(request: NextRequest) {
  if (!getGrowthFeatureFlags().API_V1_ENABLED) {
    return NextResponse.json({ error: "Not Found (API_V1_ENABLED=false)" }, { status: 404 });
  }
  await ensureSchema();
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawToken = authHeader.slice("Bearer ".length).trim();
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const tokRes = await dbQuery<{
    donor_phone: string | null;
    donor_email: string | null;
    device_id: string;
  }>(
    `SELECT donor_phone, donor_email, device_id
     FROM mobile_api_tokens
     WHERE access_token_hash = $1
       AND revoked_at IS NULL
       AND access_expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  if (tokRes.rowCount === 0) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const tok = tokRes.rows[0]!;
  const donations = await dbQuery(
    `SELECT public_no, amount_try, currency, purpose_code, purpose_title, status, created_at
     FROM donations
     WHERE (donor_phone = $1 AND $1 IS NOT NULL) OR (donor_email = $2 AND $2 IS NOT NULL)
     ORDER BY created_at DESC LIMIT 50`,
    [tok.donor_phone, tok.donor_email]
  );

  const kurbanOrders = await dbQuery(
    `SELECT public_order_no, country_code, animal_type, shares_count, status, video_token, created_at
     FROM kurban_orders
     WHERE (donor_phone = $1 AND $1 IS NOT NULL) OR (donor_email = $2 AND $2 IS NOT NULL)
     ORDER BY created_at DESC LIMIT 20`,
    [tok.donor_phone, tok.donor_email]
  );

  return NextResponse.json({
    apiVersion: "v1",
    deviceId: tok.device_id,
    donations: donations.rows,
    kurbanOrders: kurbanOrders.rows
  });
}
