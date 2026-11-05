import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import { dbQuery, ensureSchema } from "../db/schema";
import { seedDatabase } from "../db/seed";
import { SITE_CONFIG } from "../lib/config";
import { isAllowedPaymentHost, stripWww } from "../i18n/hosts";

export interface PaymentCheckoutRequest {
  donationExternalId: string;
  publicNo: string;
  amountTry: number;
  frequency: "one_time" | "monthly";
  donorName: string;
  donorEmail?: string;
  donorPhone?: string;
  originHost: string;
  locale: string;
}

export interface PaymentCheckoutResponse {
  provider: string;
  sandbox: boolean;
  threeDSecureRequired: boolean;
  checkoutUrl: string;
  providerReference: string;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckoutSession(req: PaymentCheckoutRequest): Promise<PaymentCheckoutResponse>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
}

export function getWebhookSecret(): string {
  if (SITE_CONFIG.donationsLive) {
    return process.env.IYZICO_SECRET_KEY || process.env.WEBHOOK_SECRET || "live-secret-not-configured";
  }
  return process.env.SANDBOX_WEBHOOK_SECRET || "ezan-sandbox-webhook-secret-2027";
}

export function signWebhookPayload(rawBody: string, secret = getWebhookSecret()): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createCheckoutSession(req: PaymentCheckoutRequest): Promise<PaymentCheckoutResponse> {
    if (!isAllowedPaymentHost(req.originHost)) {
      throw new Error(`Disallowed origin host for payment callback: ${req.originHost}`);
    }
    const { cleanHost } = stripWww(req.originHost);
    const proto = cleanHost.startsWith("localhost") || cleanHost.startsWith("127.0.0.1") || cleanHost.startsWith("192.168.") ? "http" : "https";
    const returnSlug = req.locale === "uz" ? "rahmat" : req.locale === "tr" ? "tesekkurler" : "thank-you";
    const checkoutUrl = `${proto}://${cleanHost}/${req.locale}/${returnSlug}?donation=${encodeURIComponent(req.publicNo)}&ext=${encodeURIComponent(req.donationExternalId)}`;
    return {
      provider: "mock",
      sandbox: !SITE_CONFIG.donationsLive,
      threeDSecureRequired: true,
      checkoutUrl,
      providerReference: `MOCK-3DS-${req.publicNo}`
    };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader) return false;
    const expected = signWebhookPayload(rawBody);
    try {
      return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}

class IyzicoSandboxProvider implements PaymentProvider {
  readonly name = "iyzico";

  async createCheckoutSession(req: PaymentCheckoutRequest): Promise<PaymentCheckoutResponse> {
    if (!isAllowedPaymentHost(req.originHost)) {
      throw new Error(`Disallowed origin host for payment callback: ${req.originHost}`);
    }
    // DONATIONS_LIVE=false bo'lganda haqiqiy production kalitlar hech qachon ishlatilmaydi
    const apiBase = SITE_CONFIG.donationsLive
      ? "https://api.iyzipay.com"
      : "https://sandbox-api.iyzipay.com";
    const apiKeyUsed = SITE_CONFIG.donationsLive
      ? process.env.IYZICO_LIVE_API_KEY || "missing-live-key"
      : process.env.IYZICO_SANDBOX_API_KEY || "sandbox-iyzico-key";

    if (!SITE_CONFIG.donationsLive && apiKeyUsed.startsWith("live_")) {
      throw new Error("SECURITY: Live iyzico key cannot be used when DONATIONS_LIVE=false");
    }

    const { cleanHost } = stripWww(req.originHost);
    const proto = cleanHost.startsWith("localhost") || cleanHost.startsWith("127.0.0.1") || cleanHost.startsWith("192.168.") ? "http" : "https";
    const returnSlug = req.locale === "uz" ? "rahmat" : req.locale === "tr" ? "tesekkurler" : "thank-you";
    const callbackUrl = `${proto}://${cleanHost}/${req.locale}/${returnSlug}?donation=${encodeURIComponent(req.publicNo)}&ext=${encodeURIComponent(req.donationExternalId)}&gateway=${encodeURIComponent(apiBase)}`;

    return {
      provider: "iyzico",
      sandbox: !SITE_CONFIG.donationsLive,
      threeDSecureRequired: true,
      checkoutUrl: callbackUrl,
      providerReference: `IYZ-3DS-${req.publicNo}`
    };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader) return false;
    const expected = signWebhookPayload(rawBody);
    try {
      return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}

export function getPaymentProvider(): PaymentProvider {
  if (SITE_CONFIG.paymentProvider === "iyzico") {
    return new IyzicoSandboxProvider();
  }
  return new MockPaymentProvider();
}

export interface DonationItemInput {
  campaignSlug: string;
  amount: number;
}

export interface CreateDonationInput {
  originHost: string;
  locale: string;
  frequency: "one_time" | "monthly";
  items: DonationItemInput[];
  donor: {
    fullName?: string;
    phone?: string;
    email?: string;
    isAnonymous?: boolean;
    wantReceipt?: boolean;
    kvkkConsent: boolean;
  };
}

let initialized = false;
async function ensureReady() {
  if (!initialized) {
    await ensureSchema();
    await seedDatabase();
    initialized = true;
  }
}

export async function generateNextPublicNo(): Promise<string> {
  const year = 2027;
  const prefix = `EZ-${year}-`;
  const res = await dbQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM donations`
  );
  const nextNum = Number.parseInt(res.rows[0]?.count || "0", 10) + 1;
  return `${prefix}${String(nextNum).padStart(6, "0")}`;
}

export async function createDonationOrder(input: CreateDonationInput) {
  await ensureReady();

  if (!input.donor?.kvkkConsent) {
    throw new Error("KVKK roziligi (checkbox) belgilanishi shart");
  }
  if (!isAllowedPaymentHost(input.originHost)) {
    throw new Error(`Host ruxsat etilmagan (SITE_HOSTS allowlist): ${input.originHost}`);
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Kamida bitta xayriya yo'nalishi tanlanishi kerak");
  }

  // Narx va summa FAQAT serverda kampaniya chegaralari bilan tekshiriladi va hisoblanadi
  let totalTry = 0;
  const validatedItems: Array<{
    campaignSlug: string;
    purposeCode: string;
    titleTr: string;
    restricted: boolean;
    amountTry: number;
  }> = [];

  for (const item of input.items) {
    const rawAmount = Number(item.amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      throw new Error("Xayriya summasi musbat son bo'lishi shart");
    }

    const campRes = await dbQuery<{
      slug: string;
      purpose_code: string;
      restricted: boolean;
      min_amount: string;
      max_amount: string;
      title: Record<string, string>;
    }>(
      `SELECT slug, purpose_code, restricted, min_amount, max_amount, title
       FROM cms_campaigns
       WHERE slug = $1 AND status = 'published'
       LIMIT 1`,
      [item.campaignSlug]
    );

    const camp = campRes.rows[0];
    if (!camp) {
      throw new Error(`Kampaniya topilmadi yoki faol emas: ${item.campaignSlug}`);
    }

    const minAmt = Number(camp.min_amount || 50);
    const maxAmt = Number(camp.max_amount || 5000000);
    if (rawAmount < minAmt || rawAmount > maxAmt) {
      throw new Error(
        `Summa kampaniya chegarasidan tashqarida (${minAmt} TRY ? ${maxAmt} TRY): ${rawAmount} TRY`
      );
    }

    const rounded = Math.round(rawAmount * 100) / 100;
    totalTry += rounded;
    validatedItems.push({
      campaignSlug: camp.slug,
      purposeCode: camp.purpose_code,
      titleTr: camp.title?.tr || camp.slug,
      restricted: Boolean(camp.restricted),
      amountTry: rounded
    });
  }

  totalTry = Math.round(totalTry * 100) / 100;
  const primaryItem = validatedItems[0]!;
  const allRestricted = validatedItems.some((i) => i.restricted);
  const purposeCode = validatedItems.length === 1 ? primaryItem.purposeCode : "MULTI-CART";
  const purposeTitle =
    validatedItems.length === 1
      ? primaryItem.titleTr.replace(/\s*\[TASLIK\]\s*/g, "").trim()
      : validatedItems.map((i) => i.titleTr.replace(/\s*\[TASLIK\]\s*/g, "").trim()).join(" + ");

  const externalId = crypto.randomUUID();
  const publicNo = await generateNextPublicNo();
  const isAnon = Boolean(input.donor.isAnonymous);
  const donorName = isAnon
    ? "Anonim Ba?????"
    : (input.donor.fullName || "").trim() || "Hay?rsever Ba?????";

  const provider = getPaymentProvider();
  const checkout = await provider.createCheckoutSession({
    donationExternalId: externalId,
    publicNo,
    amountTry: totalTry,
    frequency: input.frequency || "one_time",
    donorName,
    donorEmail: input.donor.email,
    donorPhone: input.donor.phone,
    originHost: input.originHost,
    locale: input.locale || "tr"
  });

  const subToken =
    input.frequency === "monthly" ? `SUB-TOKEN-${crypto.randomBytes(6).toString("hex")}` : null;

  const ins = await dbQuery(
    `INSERT INTO donations (
       external_id, public_no, origin_host, locale, frequency, provider,
       provider_payment_id, provider_subscription_token,
       amount, currency, amount_try, purpose_code, purpose_title, restricted, items,
       donor_name, donor_phone, donor_email, is_anonymous, want_receipt,
       kvkk_consent, kvkk_consent_at, status
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8,
       $9, 'TRY', $9, $10, $11, $12, $13::jsonb,
       $14, $15, $16, $17, $18,
       TRUE, NOW(), 'pending'
     ) RETURNING *`,
    [
      externalId,
      publicNo,
      stripWww(input.originHost).cleanHost,
      input.locale || "tr",
      input.frequency || "one_time",
      checkout.provider,
      checkout.providerReference,
      subToken,
      totalTry,
      purposeCode,
      purposeTitle,
      allRestricted,
      JSON.stringify(validatedItems),
      donorName,
      input.donor.phone || null,
      input.donor.email || null,
      isAnon,
      Boolean(input.donor.wantReceipt)
    ]
  );

  return {
    donation: ins.rows[0],
    checkout
  };
}

export async function generateReceiptPdfBuffer(donation: {
  public_no: string;
  donor_name: string;
  amount_try: string | number;
  currency: string;
  purpose_title: string;
  paid_at?: string | Date | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(SITE_CONFIG.receiptTemplate.foundationName, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(15).text(SITE_CONFIG.receiptTemplate.titleTr, { align: "center" });
    doc.moveDown(1.5);

    doc.fontSize(11);
    doc.text(`Belge No: ${donation.public_no}`);
    doc.text(`Tarih: ${new Date(donation.paid_at || Date.now()).toISOString().slice(0, 10)}`);
    doc.text(`Bagisci: ${donation.donor_name}`);
    doc.text(`Tutar: ${Number(donation.amount_try).toFixed(2)} ${donation.currency || "TRY"}`);
    doc.text(`Bagis Amaci: ${donation.purpose_title}`);
    doc.moveDown(1.5);

    // Soliq imtiyozi haqida hech narsa yozilmaydi
    doc.fontSize(9).fillColor("#475569").text(SITE_CONFIG.receiptTemplate.footnoteTr);
    doc.end();
  });
}

export async function processPaymentWebhook(params: {
  rawBody: string;
  signatureHeader: string | null;
}) {
  await ensureReady();
  const provider = getPaymentProvider();

  if (!provider.verifyWebhookSignature(params.rawBody, params.signatureHeader)) {
    const err: any = new Error("Invalid or missing webhook signature");
    err.statusCode = 401;
    throw err;
  }

  const payload = JSON.parse(params.rawBody);
  const eventId = String(payload.eventId || payload.paymentId || "");
  const externalId = String(payload.donationExternalId || "");
  const eventStatus = String(payload.status || "paid");

  if (!eventId || !externalId) {
    const err: any = new Error("Missing eventId or donationExternalId");
    err.statusCode = 400;
    throw err;
  }

  // Idempotent tekshiruv: bir xil event_id yoki allaqachon paid bo'lgan to'lov ikkinchi marta kelsa e'tiborsiz qoldiriladi
  const insEvent = await dbQuery(
    `INSERT INTO webhook_events (provider, event_id, donation_external_id, payload)
     VALUES ($1, $2, $3::uuid, $4::jsonb)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [provider.name, eventId, externalId, JSON.stringify(payload)]
  );

  if (insEvent.rowCount === 0) {
    return { duplicate: true, status: "ignored" };
  }

  const donRes = await dbQuery(`SELECT * FROM donations WHERE external_id = $1::uuid LIMIT 1`, [externalId]);
  const donation = donRes.rows[0];
  if (!donation) {
    const err: any = new Error("Donation not found");
    err.statusCode = 404;
    throw err;
  }

  if (eventStatus === "paid") {
    if (donation.status === "paid") {
      return { duplicate: true, status: "already_paid" };
    }

    await dbQuery(
      `UPDATE donations
       SET status = 'paid',
           paid_at = NOW(),
           provider_payment_id = COALESCE($2, provider_payment_id),
           synced_to_vaqf_at = NULL,
           updated_at = NOW()
       WHERE external_id = $1::uuid`,
      [externalId, payload.paymentId || null]
    );

    // Kampaniya yig'ilgan summasini yangilash
    const items = Array.isArray(donation.items) ? donation.items : [];
    for (const it of items) {
      if (it.campaignSlug && Number(it.amountTry) > 0) {
        await dbQuery(
          `UPDATE cms_campaigns
           SET collected_amount = collected_amount + $1,
               updated_at = NOW()
           WHERE slug = $2`,
          [Number(it.amountTry), it.campaignSlug]
        );
      }
    }

    // Agar e-pochta va makbuz so'ralgan bo'lsa outbox jadvaliga qo'shamiz
    if (donation.donor_email) {
      const pdfBuf = donation.want_receipt ? await generateReceiptPdfBuffer(donation) : null;
      const attachments = pdfBuf
        ? [{ filename: `${donation.public_no}.pdf`, contentBase64: pdfBuf.toString("base64") }]
        : [];
      await dbQuery(
        `INSERT INTO outbox_messages (channel, recipient, subject, body, attachments, status)
         VALUES ('email', $1, $2, $3, $4::jsonb, 'pending')`,
        [
          donation.donor_email,
          `Ezan Vakf? ? Ba??? Al?nd? Belgesi (${donation.public_no})`,
          `Say?n ${donation.donor_name}, ${donation.amount_try} TRY tutar?ndaki ba????n?z i?in te?ekk?r ederiz. Kay?t No: ${donation.public_no}`,
          JSON.stringify(attachments)
        ]
      );
    }

    return { duplicate: false, status: "paid", publicNo: donation.public_no };
  }

  if (eventStatus === "refunded") {
    await dbQuery(
      `UPDATE donations
       SET status = 'refunded',
           refunded_at = NOW(),
           refund_reason = $2,
           synced_to_vaqf_at = NULL,
           updated_at = NOW()
       WHERE external_id = $1::uuid`,
      [externalId, payload.reason || "Provayder orqali qaytarildi (Refund)"]
    );
    return { duplicate: false, status: "refunded", publicNo: donation.public_no };
  }

  if (eventStatus === "failed") {
    await dbQuery(
      `UPDATE donations
       SET status = 'failed',
           updated_at = NOW()
       WHERE external_id = $1::uuid`,
      [externalId]
    );
    return { duplicate: false, status: "failed", publicNo: donation.public_no };
  }

  return { duplicate: false, status: donation.status };
}
