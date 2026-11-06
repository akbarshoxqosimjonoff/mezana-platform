import { NextRequest, NextResponse } from "next/server";
import { createDonationOrder } from "@/payments/service";
import { checkRateLimit } from "@/lib/security";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "127.0.0.1";
  const rl = checkRateLimit(`v1_checkout:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await request.json();
    const result = await createDonationOrder({
      originHost: "ezanvakfi.org",
      locale: body.locale || "tr",
      frequency: body.frequency || "one_time",
      items: Array.isArray(body.items) ? body.items : [{ campaignSlug: body.campaignSlug || "genel-bagis", amount: Number(body.amount || 250) }],
      donor: {
        fullName: body.donorName || "Mobil Bağışçı",
        phone: body.donorPhone,
        email: body.donorEmail,
        isAnonymous: Boolean(body.isAnonymous),
        wantReceipt: Boolean(body.wantReceipt ?? true),
        kvkkConsent: Boolean(body.kvkkConsent ?? true)
      }
    });

    return NextResponse.json(
      {
        apiVersion: "v1",
        publicNo: result.donation.public_no,
        externalId: result.donation.external_id,
        webViewCheckoutUrl: result.checkout.checkoutUrl
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Invalid request" }, { status: 400 });
  }
}
