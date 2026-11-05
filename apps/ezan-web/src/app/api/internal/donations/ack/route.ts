import { NextRequest, NextResponse } from "next/server";
import { acknowledgeSyncedDonations, verifyInternalSyncAuth } from "../../../../../sync";
import { checkRateLimit } from "../../../../../lib/security";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rl = checkRateLimit(`internal_sync_ack:${ip}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const rawBody = await req.text();
  const timestampHeader = req.headers.get("x-timestamp");
  const signatureHeader = req.headers.get("x-signature");
  const pathAndQuery = `${req.nextUrl.pathname}${req.nextUrl.search}`;

  const auth = verifyInternalSyncAuth({
    timestampHeader,
    signatureHeader,
    method: "POST",
    pathAndQuery,
    rawBody
  });

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  const parsed = rawBody ? JSON.parse(rawBody) : {};
  const ids = Array.isArray(parsed.ids) ? parsed.ids : Array.isArray(parsed.externalRefs) ? parsed.externalRefs : [];
  const res = await acknowledgeSyncedDonations(ids);
  return NextResponse.json(res);
}