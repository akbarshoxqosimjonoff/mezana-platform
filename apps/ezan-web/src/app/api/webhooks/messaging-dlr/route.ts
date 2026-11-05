import { NextRequest, NextResponse } from "next/server";
import { processMessagingDlrWebhook } from "../../../../kurban/messaging";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("x-dlr-signature");
    const result = await processMessagingDlrWebhook({ rawBody, signatureHeader });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "DLR webhook error" }, { status: err?.statusCode || 400 });
  }
}
