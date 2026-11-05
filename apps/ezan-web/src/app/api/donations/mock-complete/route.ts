import { NextRequest, NextResponse } from "next/server";
import { processPaymentWebhook, signWebhookPayload } from "../../../../payments/service";

export async function POST(req: NextRequest) {
  // mock-complete faqat NODE_ENV=development da mavjud bo'ladi. Productionda 404 qaytaradi (DONATIONS_LIVE qiymatidan qat'i nazar).
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
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
