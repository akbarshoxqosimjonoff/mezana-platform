import { NextRequest, NextResponse } from "next/server";
import { listUnsyncedDonationsForVaqf, verifyInternalSyncAuth } from "../../../../sync";
import { checkRateLimit } from "../../../../lib/security";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rl = checkRateLimit(`internal_sync:${ip}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const timestampHeader = req.headers.get("x-timestamp");
  const signatureHeader = req.headers.get("x-signature");
  const pathAndQuery = `${req.nextUrl.pathname}${req.nextUrl.search}`;

  const auth = verifyInternalSyncAuth({
    timestampHeader,
    signatureHeader,
    method: "GET",
    pathAndQuery
  });

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  const cursor = Number(req.nextUrl.searchParams.get("cursor") || 0);
  const data = await listUnsyncedDonationsForVaqf(cursor, 100);
  return NextResponse.json(data);
}