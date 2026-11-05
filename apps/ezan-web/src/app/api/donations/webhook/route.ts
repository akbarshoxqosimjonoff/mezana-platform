import { NextRequest, NextResponse } from "next/server";
import { processPaymentWebhook } from "../../../../payments/service";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-iyz-signature") || req.headers.get("x-webhook-signature");
    const result = await processPaymentWebhook({ rawBody, signatureHeader: signature });
    return NextResponse.json(result);
  } catch (err: any) {
    const status = err?.statusCode || 400;
    return NextResponse.json({ error: err?.message || "Webhook error" }, { status });
  }
}