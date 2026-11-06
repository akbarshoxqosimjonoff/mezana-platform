import { getGrowthFeatureFlags } from "../../../../growth/service";
import { NextResponse } from "next/server";
import { getOpenApiV1Spec } from "../../../../growth/service";

export async function GET() {
  if (!getGrowthFeatureFlags().API_V1_ENABLED) {
    return NextResponse.json({ error: "Not Found (API_V1_ENABLED=false)" }, { status: 404 });
  }
  return NextResponse.json(getOpenApiV1Spec(), { status: 200 });
}
