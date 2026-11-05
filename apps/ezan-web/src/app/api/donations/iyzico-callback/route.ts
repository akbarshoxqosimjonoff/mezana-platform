import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "../../../../db/schema";
import { isAllowedPaymentHost, stripWww } from "../../../../i18n/hosts";
import { IyzicoCheckoutProvider } from "../../../../payments/service";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const token = String(form.get("token") || "").trim();
    const url = new URL(req.url);
    const locale = url.searchParams.get("locale") || "tr";
    const externalId = url.searchParams.get("ext") || "";

    if (!token || !externalId) {
      return NextResponse.json({ error: "Missing token or donation reference" }, { status: 400 });
    }

    const donRes = await dbQuery(`SELECT * FROM donations WHERE external_id = $1::uuid LIMIT 1`, [externalId]);
    const donation = donRes.rows[0];
    if (!donation) {
      return NextResponse.json({ error: "Donation not found" }, { status: 404 });
    }

    const provider = new IyzicoCheckoutProvider();
    const retrieved = await provider.retrievePaymentStatus({
      token,
      conversationId: externalId
    });

    const expectedTry = Number(donation.amount_try);
    if (
      retrieved.status !== "success" ||
      retrieved.paymentStatus !== "SUCCESS" ||
      Math.abs(Number(retrieved.paidPrice) - expectedTry) > 0.01
    ) {
      await dbQuery(
        `UPDATE donations SET status = 'failed', updated_at = NOW() WHERE external_id = $1::uuid AND status != 'paid'`,
        [externalId]
      );
      return NextResponse.json(
        { error: "Payment verification or paidPrice check failed" },
        { status: 400 }
      );
    }

    if (donation.status !== "paid") {
      await dbQuery(
        `UPDATE donations
         SET status = 'paid',
             paid_at = NOW(),
             provider_payment_id = $2,
             synced_to_vaqf_at = NULL,
             updated_at = NOW()
         WHERE external_id = $1::uuid`,
        [externalId, retrieved.paymentId || token]
      );
    }

    const host = donation.origin_host || req.headers.get("host") || "ezanvakfi.org";
    const safeHost = isAllowedPaymentHost(host) ? stripWww(host).cleanHost : "ezanvakfi.org";
    const returnSlug = locale === "uz" ? "rahmat" : locale === "tr" ? "tesekkurler" : "thank-you";
    return NextResponse.redirect(
      `https://${safeHost}/${locale}/${returnSlug}?donation=${encodeURIComponent(donation.public_no)}&ext=${encodeURIComponent(externalId)}`,
      303
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Callback verification error" }, { status: 400 });
  }
}
