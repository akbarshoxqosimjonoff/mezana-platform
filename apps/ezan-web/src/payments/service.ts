import { markKurbanOrderPaidByDonation, markKurbanOrderRefundedByDonation } from "../kurban/service";
import crypto from "node:crypto";
import Iyzipay from "iyzipay";
import PDFDocument from "pdfkit";
import { dbQuery, ensureSchema } from "../db/schema";
import { requireEnvSecret, SITE_CONFIG } from "../lib/config";
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
  checkoutFormContent?: string;
}

export interface RetrievedPaymentInfo {
  status: "success" | "failure";
  paymentStatus: "SUCCESS" | "FAILURE" | string;
  paymentId: string;
  paidPrice: number;
  price: number;
  currency: string;
  conversationId: string;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckoutSession(req: PaymentCheckoutRequest): Promise<PaymentCheckoutResponse>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
  retrievePaymentStatus?(params: {
    token?: string;
    paymentId?: string;
    conversationId: string;
    expectedAmountTry?: number;
  }): Promise<RetrievedPaymentInfo>;
}

/**
 * Webhook maxfiy kaliti. Hech qanday standart qiymat yo'q; env bo'lmasa yoki < 32 belgi bo'lsa xato beradi.
 */
export function getWebhookSecret(): string {
  const raw =
    process.env.PAYMENT_WEBHOOK_SECRET ||
    (SITE_CONFIG.donationsLive ? process.env.WEBHOOK_SECRET : process.env.SANDBOX_WEBHOOK_SECRET) ||
    "";
  if (!raw || raw.trim().length < 32) {
    throw new Error(
      "Configuration error: PAYMENT_WEBHOOK_SECRET (or SANDBOX_WEBHOOK_SECRET / WEBHOOK_SECRET) must be set and at least 32 characters long."
    );
  }
  return raw.trim();
}

export function signWebhookPayload(rawBody: string, secret = getWebhookSecret()): string {
  if (!secret || secret.trim().length < 32) {
    throw new Error("Configuration error: Webhook secret must be at least 32 characters long.");
  }
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * Rasmiy iyzico V3 Webhook imzosini hisoblash (`X-IYZ-SIGNATURE-V3`):
 * - Checkout Form (token mavjud): HMAC-SHA256(secretKey, secretKey + iyziEventType + iyziPaymentId + token + paymentConversationId + status)
 * - Direct API (token yo'q): HMAC-SHA256(secretKey, secretKey + iyziEventType + paymentId + paymentConversationId + status)
 */
export function computeIyzicoV3WebhookSignature(payload: Record<string, any>, iyzicoSecretKey: string): string {
  if (!iyzicoSecretKey || iyzicoSecretKey.trim().length < 10) {
    throw new Error("Configuration error: IYZICO_SECRET_KEY must be set.");
  }
  const eventType = String(payload.iyziEventType || "");
  const paymentConversationId = String(payload.paymentConversationId || payload.donationExternalId || "");
  const status = String(payload.status || "");

  const keyToSign = payload.token
    ? `${iyzicoSecretKey}${eventType}${String(payload.iyziPaymentId || payload.paymentId || "")}${String(payload.token)}${paymentConversationId}${status}`
    : `${iyzicoSecretKey}${eventType}${String(payload.paymentId || payload.iyziPaymentId || "")}${paymentConversationId}${status}`;

  return crypto.createHmac("sha256", iyzicoSecretKey).update(keyToSign).digest("hex");
}

class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createCheckoutSession(req: PaymentCheckoutRequest): Promise<PaymentCheckoutResponse> {
    if (!isAllowedPaymentHost(req.originHost)) {
      throw new Error(`Disallowed origin host for payment callback: ${req.originHost}`);
    }
    const { cleanHost } = stripWww(req.originHost);
    const proto =
      cleanHost.startsWith("localhost") || cleanHost.startsWith("127.0.0.1") || cleanHost.startsWith("192.168.")
        ? "http"
        : "https";
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
    const secret = getWebhookSecret();
    if (!signatureHeader) return false;
    const expected = signWebhookPayload(rawBody, secret);
    try {
      return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}

export class IyzicoCheckoutProvider implements PaymentProvider {
  readonly name = "iyzico";
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly uri: string;
  private readonly client: Iyzipay;

  constructor() {
    this.apiKey = requireEnvSecret("IYZICO_API_KEY", 10);
    this.secretKey = requireEnvSecret("IYZICO_SECRET_KEY", 10);

    if (!SITE_CONFIG.donationsLive && this.apiKey.startsWith("live_")) {
      throw new Error("SECURITY: Live iyzico key cannot be used when DONATIONS_LIVE=false");
    }

    this.uri = SITE_CONFIG.donationsLive
      ? process.env.IYZICO_BASE_URL || "https://api.iyzipay.com"
      : process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com";

    this.client = new Iyzipay({
      apiKey: this.apiKey,
      secretKey: this.secretKey,
      uri: this.uri
    });
  }

  async createCheckoutSession(req: PaymentCheckoutRequest): Promise<PaymentCheckoutResponse> {
    if (!isAllowedPaymentHost(req.originHost)) {
      throw new Error(`Disallowed origin host for payment callback: ${req.originHost}`);
    }

    const { cleanHost } = stripWww(req.originHost);
    const proto =
      cleanHost.startsWith("localhost") || cleanHost.startsWith("127.0.0.1") || cleanHost.startsWith("192.168.")
        ? "http"
        : "https";
    const callbackUrl = `${proto}://${cleanHost}/api/donations/iyzico-callback?locale=${encodeURIComponent(req.locale)}&ext=${encodeURIComponent(req.donationExternalId)}`;

    const nameParts = (req.donorName || "Hayırsever Bağışçı").trim().split(/\s+/);
    const firstName = nameParts[0] || "Hayırsever";
    const lastName = nameParts.slice(1).join(" ") || "Bağışçı";
    const priceStr = req.amountTry.toFixed(2);

    const initializeReq = {
      locale: req.locale === "tr" ? Iyzipay.LOCALE.TR : Iyzipay.LOCALE.EN,
      conversationId: req.donationExternalId,
      price: priceStr,
      paidPrice: priceStr,
      currency: Iyzipay.CURRENCY.TRY,
      basketId: req.publicNo,
      paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
      callbackUrl,
      enabledInstallments: [1],
      buyer: {
        id: req.donationExternalId.slice(0, 16),
        name: firstName,
        surname: lastName,
        gsmNumber: req.donorPhone || "+905000000000",
        email: req.donorEmail || "bagis@ezanvakfi.org",
        identityNumber: "11111111111",
        registrationAddress: "İstanbul, Türkiye",
        ip: "127.0.0.1",
        city: "Istanbul",
        country: "Turkey"
      },
      shippingAddress: {
        contactName: `${firstName} ${lastName}`,
        city: "Istanbul",
        country: "Turkey",
        address: "İstanbul, Türkiye"
      },
      billingAddress: {
        contactName: `${firstName} ${lastName}`,
        city: "Istanbul",
        country: "Turkey",
        address: "İstanbul, Türkiye"
      },
      basketItems: [
        {
          id: req.publicNo,
          name: `Ezan Vakfı Bağış (${req.publicNo})`,
          category1: "Bağış",
          itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
          price: priceStr
        }
      ]
    };

    const result: any = await new Promise((resolve, reject) => {
      this.client.checkoutFormInitialize.create(initializeReq, (err: any, res: any) => {
        if (err) return reject(err);
        resolve(res);
      });
    });

    if (!result || result.status !== "success" || (!result.paymentPageUrl && !result.checkoutFormContent)) {
      throw new Error(`iyzico checkoutFormInitialize failed: ${result?.errorMessage || "Unknown iyzico error"}`);
    }

    return {
      provider: "iyzico",
      sandbox: !SITE_CONFIG.donationsLive,
      threeDSecureRequired: true,
      checkoutUrl: result.paymentPageUrl || callbackUrl,
      providerReference: result.token,
      checkoutFormContent: result.checkoutFormContent
    };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader) return false;
    try {
      const payload = JSON.parse(rawBody);
      const expected = computeIyzicoV3WebhookSignature(payload, this.secretKey);
      return crypto.timingSafeEqual(Buffer.from(signatureHeader.trim()), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async retrievePaymentStatus(params: {
    token?: string;
    paymentId?: string;
    conversationId: string;
  }): Promise<RetrievedPaymentInfo> {
    if (params.token) {
      const res: any = await new Promise((resolve, reject) => {
        this.client.checkoutForm.retrieve(
          {
            locale: Iyzipay.LOCALE.TR,
            conversationId: params.conversationId,
            token: params.token!
          },
          (err: any, r: any) => (err ? reject(err) : resolve(r))
        );
      });
      return {
        status: res?.status === "success" ? "success" : "failure",
        paymentStatus: String(res?.paymentStatus || ""),
        paymentId: String(res?.paymentId || ""),
        paidPrice: Number(res?.paidPrice || 0),
        price: Number(res?.price || 0),
        currency: String(res?.currency || "TRY"),
        conversationId: String(res?.conversationId || params.conversationId)
      };
    }

    if (params.paymentId) {
      const res: any = await new Promise((resolve, reject) => {
        this.client.payment.retrieve(
          {
            locale: Iyzipay.LOCALE.TR,
            conversationId: params.conversationId,
            paymentId: params.paymentId!
          },
          (err: any, r: any) => (err ? reject(err) : resolve(r))
        );
      });
      return {
        status: res?.status === "success" ? "success" : "failure",
        paymentStatus: res?.status === "success" ? "SUCCESS" : "FAILURE",
        paymentId: String(res?.paymentId || params.paymentId),
        paidPrice: Number(res?.paidPrice || 0),
        price: Number(res?.price || 0),
        currency: String(res?.currency || "TRY"),
        conversationId: String(res?.conversationId || params.conversationId)
      };
    }

    throw new Error("Either token or paymentId is required for iyzico retrieve");
  }
}

export function getPaymentProvider(): PaymentProvider {
  const providerName = process.env.PAYMENT_PROVIDER || SITE_CONFIG.paymentProvider;
  if (providerName === "iyzico") {
    return new IyzicoCheckoutProvider();
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
  isTestOverride?: boolean;
  donor: {
    fullName?: string;
    phone?: string;
    email?: string;
    isAnonymous?: boolean;
    wantReceipt?: boolean;
    kvkkConsent: boolean;
  };
}

let schemaReady = false;
async function ensureReady() {
  if (!schemaReady) {
    await ensureSchema();
    schemaReady = true;
  }
}

export async function generateNextPublicNo(): Promise<string> {
  const year = 2027;
  const prefix = `EZ-${year}-`;
  const res = await dbQuery<{ seq: string }>(`SELECT nextval('donation_public_no_seq')::text AS seq`);
  const nextNum = Number.parseInt(res.rows[0]?.seq || "1", 10);
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
  if (input.frequency === "monthly" && process.env.RECURRING_ENABLED !== "true") {
    throw new Error("Oylik (abonement) xayriya hozircha o'chirilgan (RECURRING_ENABLED=false)");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Kamida bitta xayriya yo'nalishi tanlanishi kerak");
  }

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
        `Summa kampaniya chegarasidan tashqarida (${minAmt} TRY – ${maxAmt} TRY): ${rawAmount} TRY`
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
    ? "Anonim Bağışçı"
    : (input.donor.fullName || "").trim() || "Hayırsever Bağışçı";

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

  const isTest = process.env.DONATIONS_LIVE === "true" ? (typeof input.isTestOverride === "boolean" ? input.isTestOverride : false) : true;

  const ins = await dbQuery(
    `INSERT INTO donations (
       external_id, public_no, origin_host, locale, frequency, provider,
       provider_payment_id, provider_subscription_token,
       amount, currency, amount_try, purpose_code, purpose_title, restricted, items,
       donor_name, donor_phone, donor_email, is_anonymous, want_receipt,
       kvkk_consent, kvkk_consent_at, status, is_test
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, NULL,
       $8, 'TRY', $8, $9, $10, $11, $12::jsonb,
       $13, $14, $15, $16, $17,
       TRUE, NOW(), 'pending', $18
     ) RETURNING *`,
    [
      externalId,
      publicNo,
      stripWww(input.originHost).cleanHost,
      input.locale || "tr",
      input.frequency || "one_time",
      checkout.provider,
      checkout.providerReference,
      totalTry,
      purposeCode,
      purposeTitle,
      allRestricted,
      JSON.stringify(validatedItems),
      donorName,
      input.donor.phone || null,
      input.donor.email || null,
      isAnon,
      Boolean(input.donor.wantReceipt),
      isTest
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

    doc.fontSize(9).fillColor("#475569").text(SITE_CONFIG.receiptTemplate.footnoteTr);
    doc.end();
  });
}

export async function processPaymentWebhook(params: {
  rawBody: string;
  signatureHeader: string | null;
  providerOverride?: PaymentProvider;
}) {
  await ensureReady();
  const provider = params.providerOverride || getPaymentProvider();

  if (!provider.verifyWebhookSignature(params.rawBody, params.signatureHeader)) {
    const err: any = new Error("Invalid or missing webhook signature");
    err.statusCode = 401;
    throw err;
  }

  const payload = JSON.parse(params.rawBody);
  const eventId = String(payload.eventId || payload.iyziEventTime || payload.paymentId || payload.iyziPaymentId || "");
  const externalId = String(payload.donationExternalId || payload.paymentConversationId || "");
  const rawStatus = String(payload.status || "paid").toLowerCase();
  const eventStatus = rawStatus === "success" ? "paid" : rawStatus;

  if (!eventId || !externalId) {
    const err: any = new Error("Missing eventId or donationExternalId");
    err.statusCode = 400;
    throw err;
  }

  const donRes = await dbQuery(`SELECT * FROM donations WHERE external_id = $1::uuid LIMIT 1`, [externalId]);
  const donation = donRes.rows[0];
  if (!donation) {
    const err: any = new Error("Donation not found");
    err.statusCode = 404;
    throw err;
  }

  // Serverdan retrieve bilan holatni va paidPrice summasini qayta tasdiqlash
  if (eventStatus === "paid" && provider.retrievePaymentStatus) {
    const retrieved = await provider.retrievePaymentStatus({
      token: payload.token || undefined,
      paymentId: String(payload.paymentId || payload.iyziPaymentId || ""),
      conversationId: externalId,
      expectedAmountTry: Number(donation.amount_try)
    });

    if (retrieved.status !== "success" || retrieved.paymentStatus !== "SUCCESS") {
      const err: any = new Error("Payment status verification via retrieve failed");
      err.statusCode = 400;
      throw err;
    }

    const expectedTry = Number(donation.amount_try);
    if (!Number.isFinite(retrieved.paidPrice) || Math.abs(retrieved.paidPrice - expectedTry) > 0.01) {
      const err: any = new Error(
        `Paid price mismatch: expected ${expectedTry.toFixed(2)} TRY, retrieved ${Number(retrieved.paidPrice).toFixed(2)} TRY`
      );
      err.statusCode = 400;
      throw err;
    }
  } else if (eventStatus === "paid" && payload.paidPrice !== undefined) {
    const expectedTry = Number(donation.amount_try);
    const paidPriceNum = Number(payload.paidPrice);
    if (!Number.isFinite(paidPriceNum) || Math.abs(paidPriceNum - expectedTry) > 0.01) {
      const err: any = new Error(
        `Paid price mismatch: expected ${expectedTry.toFixed(2)} TRY, got ${paidPriceNum.toFixed(2)} TRY`
      );
      err.statusCode = 400;
      throw err;
    }
  }

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
      [externalId, payload.paymentId || payload.iyziPaymentId || null]
    );

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
          `Ezan Vakfı – Bağış Alındı Belgesi (${donation.public_no})`,
          `Sayın ${donation.donor_name}, ${donation.amount_try} TRY tutarındaki bağışınız için teşekkür ederiz. Kayıt No: ${donation.public_no}`,
          JSON.stringify(attachments)
        ]
      );
    }

    const receiptPdfBuf = donation.want_receipt ? await generateReceiptPdfBuffer(donation) : null;
    await markKurbanOrderPaidByDonation({
      donationExternalId: externalId,
      receiptPdfBase64: receiptPdfBuf ? receiptPdfBuf.toString("base64") : null
    });

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
    await markKurbanOrderRefundedByDonation({
      donationExternalId: externalId,
      reason: payload.reason || "Provayder orqali qaytarildi (Refund)"
    });

    return { duplicate: false, status: "refunded", publicNo: donation.public_no };
  }

  if (eventStatus === "failed" || eventStatus === "failure") {
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
