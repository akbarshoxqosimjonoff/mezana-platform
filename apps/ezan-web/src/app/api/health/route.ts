import { NextResponse } from "next/server";
import { getComprehensiveHealthStatus } from "../../../monitoring/service";

export async function GET() {
  try {
    const health = await getComprehensiveHealthStatus();
    return NextResponse.json(health, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: "error",
        service: "ezan-web",
        error: err?.message || "Health check failed",
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}
