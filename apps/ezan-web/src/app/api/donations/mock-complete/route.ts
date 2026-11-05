import { NextRequest, NextResponse } from "next/server";
import { processPaymentWebhook, signWebhookPayload } from "../../../../payments/service";
import { SITE_CONFIG } from "../../../../lib/config";

export async function POST(req: NextRequest) {
  if (SITE_CONFIG.donationsLive) {
    return NextResponse.json({ error: "Mock completion disabled in live mode" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const payload = JSON.stringify({
      eventId: `mock_evt_${body.donationExternalId}`,
      paymentId: `mock_pay_${body.publicNo}`,
      donationExternalId: body.donationExternalId,
      status: "paid"
    });
    const sig = signWebhookPayload(payload);
    const res = await processPaymentWebhook({ rawBody: payload, signatureHeader: sig });
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Mock complete error" }, { status: 400 });
  }
}