import { getGrowthFeatureFlags } from "../../../../growth/service";
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, dbQuery } from "../../../../db/schema";
import { checkRateLimit } from "../../../../lib/security";

export async function GET(request: NextRequest) {
  if (!getGrowthFeatureFlags().API_V1_ENABLED) {
    return NextResponse.json({ error: "Not Found (API_V1_ENABLED=false)" }, { status: 404 });
  }
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "127.0.0.1";
  const rl = checkRateLimit(`v1_campaigns:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await ensureSchema();
  const locale = request.nextUrl.searchParams.get("locale") || "tr";
  const campaigns = await dbQuery(
    `SELECT slug, purpose_code, restricted, target_amount, collected_amount, preset_amounts, title, summary
     FROM cms_campaigns
     WHERE status = 'published'
     ORDER BY id ASC`
  );
  const projects = await dbQuery(
    `SELECT slug, project_status, location_name, title, summary
     FROM cms_projects
     WHERE status = 'published'
     ORDER BY id ASC`
  );

  return NextResponse.json({
    apiVersion: "v1",
    locale,
    campaigns: campaigns.rows,
    projects: projects.rows
  });
}
