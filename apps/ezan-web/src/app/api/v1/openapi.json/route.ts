import { NextResponse } from "next/server";
import { getOpenApiV1Spec } from "@/growth/service";

export async function GET() {
  return NextResponse.json(getOpenApiV1Spec(), { status: 200 });
}
