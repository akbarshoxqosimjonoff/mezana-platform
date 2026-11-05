import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { describe, it, expect, beforeAll } from "vitest";
import {
  createDonationOrder,
  processPaymentWebhook,
  signWebhookPayload,
  generateReceiptPdfBuffer,
  getWebhookSecret,
  getPaymentProvider,
  computeIyzicoV3WebhookSignature,
  PaymentProvider
} from "../src/payments/service";
import {
  computeInternalHmac,
  verifyInternalSyncAuth,
  listUnsyncedDonationsForVaqf,
  acknowledgeSyncedDonations,
  getSyncSecret
} from "../src/sync";
import { calculateZakat } from "../src/lib/zakat";
import {
  eraseDonorPiiByKvkkRequest,
  sanitizeLogObject,
  isAdminIpAllowed,
  verifyCloudflareAccessJwt,
  generateTotpCode,
  verifyTotpCode,
  hashPasswordScrypt,
  loginAdminWithTotp,
  verifyTurnstileToken
} from "../src/lib/security";
import { SITE_CONFIG, validateStartupEnvironment } from "../src/lib/config";
import { ensureSchema, dbQuery } from "../src/db/schema";
import { seedDatabase } from "../src/db/seed";
import { POST as mockCompletePost } from "../src/app/api/donations/mock-complete/route";

const TEST_WEBHOOK_SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const TEST_SYNC_SECRET = "f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f";
const TEST_ADMIN_SECRET = "99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa";

describe("1–9-bandlar: Xavfsizlik, Sinov Xayriyalari Izolyatsiyasi, Admin 2FA/JWKS/IP, iyzico va Sinxronlash testlari", () => {
  beforeAll(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.EZAN_SYNC_SECRET = TEST_SYNC_SECRET;
    process.env.ADMIN_SESSION_SECRET = TEST_ADMIN_SECRET;
    await ensureSchema();
    await seedDatabase();
    // Bazadagi barcha eski sinov yozuvlarini is_test = TRUE qilib belgilaymiz
    await dbQuery(`UPDATE donations SET is_test = TRUE`);
  });

  it("1-band: Env sirlari yo'q yoki 32 belgidan qisqa bo'lsa, getWebhookSecret() va getSyncSecret() xato beradi", () => {
    const prevWebhook = process.env.PAYMENT_WEBHOOK_SECRET;
    const prevSandbox = process.env.SANDBOX_WEBHOOK_SECRET;
    const prevSync = process.env.EZAN_SYNC_SECRET;

    try {
      delete process.env.PAYMENT_WEBHOOK_SECRET;
      delete process.env.SANDBOX_WEBHOOK_SECRET;
      expect(() => getWebhookSecret()).toThrow(/at least 32 characters/);

      process.env.PAYMENT_WEBHOOK_SECRET = "short-secret";
      expect(() => getWebhookSecret()).toThrow(/at least 32 characters/);

      delete process.env.EZAN_SYNC_SECRET;
      expect(() => getSyncSecret()).toThrow(/at least 32 characters/);

      process.env.EZAN_SYNC_SECRET = "too-short-sync-secret";
      expect(() =>
        verifyInternalSyncAuth({
          timestampHeader: String(Math.floor(Date.now() / 1000)),
          signatureHeader: "abc",
          method: "GET",
          pathAndQuery: "/api/internal/donations"
        })
      ).toThrow(/at least 32 characters/);
    } finally {
      process.env.PAYMENT_WEBHOOK_SECRET = prevWebhook;
      process.env.SANDBOX_WEBHOOK_SECRET = prevSandbox;
      process.env.EZAN_SYNC_SECRET = prevSync;
    }
  });

  it("2-band: Productionda POST /api/donations/mock-complete 404 qaytaradi (DONATIONS_LIVE qiymatidan qat'i nazar)", async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      const req = new NextRequest("https://ezanvakfi.org/api/donations/mock-complete", {
        method: "POST",
        body: JSON.stringify({ donationExternalId: "test", publicNo: "EZ-2027-000001" })
      });
      const res = await mockCompletePost(req);
      expect(res.status).toBe(404);
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
    }
  });

  it("2-band: DONATIONS_LIVE=false da yaratilgan xayriya is_test=true bo'ladi va sync javobiga hech qachon chiqmaydi", async () => {
    expect(SITE_CONFIG.donationsLive).toBe(false);
    const testOrder = await createDonationOrder({
      originHost: "ezanvakfi.org",
      locale: "tr",
      frequency: "one_time",
      items: [{ campaignSlug: "mezana-akademisi-egitim-bursu", amount: 500 }],
      donor: {
        fullName: "Sinov Bağışçı",
        phone: "+905551112233",
        email: "sinov@example.com",
        wantReceipt: true,
        kvkkConsent: true
      }
    });

    expect(testOrder.donation.is_test).toBe(true);

    // Webhook orqali 'paid' qilamiz
    const rawBody = JSON.stringify({
      eventId: `evt_test_${testOrder.donation.external_id}`,
      paymentId: `pay_${testOrder.donation.public_no}`,
      donationExternalId: testOrder.donation.external_id,
      status: "paid"
    });
    await processPaymentWebhook({ rawBody, signatureHeader: signWebhookPayload(rawBody) });

    // Sync javobida test xayriyasi yo'qligini tekshiramiz
    const syncList = await listUnsyncedDonationsForVaqf(0, 100);
    expect(syncList.items.some((x) => x.external_ref === testOrder.donation.external_id)).toBe(false);
  });

  it("2 va 6-qadam: Faqat is_test=false bo'lgan haqiqiy xayriya sync javobiga chiqadi va ack qilinadi", async () => {
    const liveOrder = await createDonationOrder({
      originHost: "azonvaqfi.org",
      locale: "uz",
      frequency: "one_time",
      isTestOverride: false,
      items: [
        { campaignSlug: "mezana-akademisi-egitim-bursu", amount: 250 },
        { campaignSlug: "ramazan-2027-iftar-ve-kumanya", amount: 300 }
      ],
      donor: {
        fullName: "Abdulloh Karimov",
        phone: "+998901234567",
        email: "abdulloh@example.com",
        wantReceipt: true,
        kvkkConsent: true
      }
    });

    expect(liveOrder.donation.is_test).toBe(false);

    const rawBody = JSON.stringify({
      eventId: `evt_live_${liveOrder.donation.external_id}`,
      paymentId: `pay_${liveOrder.donation.public_no}`,
      donationExternalId: liveOrder.donation.external_id,
      status: "paid"
    });
    const sig = signWebhookPayload(rawBody);

    const firstCall = await processPaymentWebhook({ rawBody, signatureHeader: sig });
    expect(firstCall.duplicate).toBe(false);
    expect(firstCall.status).toBe("paid");

    const secondCall = await processPaymentWebhook({ rawBody, signatureHeader: sig });
    expect(secondCall.duplicate).toBe(true);

    const syncList = await listUnsyncedDonationsForVaqf(0, 100);
    const found = syncList.items.find((x) => x.external_ref === liveOrder.donation.external_id);
    expect(found).toBeDefined();
    expect(found?.donor.full_name).toBe("Abdulloh Karimov");

    const ackRes = await acknowledgeSyncedDonations([liveOrder.donation.external_id]);
    expect(ackRes.acknowledged).toBe(1);
  });

  it("3-band: Admin IP filtri — IP bo'lmasa, Cloudflare peer bo'lmasa yoki 127.0.0.1 bo'lsa rad etadi", () => {
    const prevAllowed = process.env.ADMIN_ALLOWED_IPS;
    try {
      process.env.ADMIN_ALLOWED_IPS = "195.175.39.42,127.0.0.1";

      // 1. IP bo'lmasa rad etiladi
      expect(isAdminIpAllowed({ cfConnectingIp: null, peerIp: "172.64.0.10" })).toBe(false);

      // 2. Peer IP Cloudflare CIDR diapazonidan bo'lmasa rad etiladi (mijoz x-forwarded-for / cf-connecting-ip ni soxtalashtirsa)
      expect(isAdminIpAllowed({ cfConnectingIp: "195.175.39.42", peerIp: "8.8.8.8" })).toBe(false);

      // 3. 127.0.0.1 har doim rad etiladi
      expect(isAdminIpAllowed({ cfConnectingIp: "127.0.0.1", peerIp: "172.64.0.10" })).toBe(false);

      // 4. Haqiqiy Cloudflare peer IP (172.64.0.10) + ADMIN_ALLOWED_IPS dagi cf-connecting-ip ruxsat etiladi
      expect(isAdminIpAllowed({ cfConnectingIp: "195.175.39.42", peerIp: "172.64.0.10" })).toBe(true);
    } finally {
      process.env.ADMIN_ALLOWED_IPS = prevAllowed;
    }
  });

  it("3-band: Cloudflare Access JWT imzosi team domenining RSA JWKS kaliti bilan tekshiriladi", async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" });
    const kid = "cf-test-kid-2027";
    const jwksKeys = [{ ...jwk, kid, kty: "RSA", alg: "RS256", use: "sig" }];

    const nowSec = Math.floor(Date.now() / 1000);
    const headerB64 = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
    const payloadB64 = Buffer.from(
      JSON.stringify({
        iss: "https://ezanvakfi.cloudflareaccess.com",
        aud: ["cf-aud-tag-12345"],
        email: "admin@ezanvakfi.org",
        iat: nowSec - 10,
        exp: nowSec + 3600
      })
    ).toString("base64url");

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(`${headerB64}.${payloadB64}`);
    sign.end();
    const validSigB64 = sign.sign(privateKey).toString("base64url");
    const validJwt = `${headerB64}.${payloadB64}.${validSigB64}`;

    const okRes = await verifyCloudflareAccessJwt(validJwt, {
      teamDomain: "ezanvakfi.cloudflareaccess.com",
      expectedAud: "cf-aud-tag-12345",
      jwksKeysOverride: jwksKeys,
      nowSec
    });
    expect(okRes.valid).toBe(true);
    expect(okRes.email).toBe("admin@ezanvakfi.org");

    // Soxta imzoli JWT rad etiladi
    const tamperedJwt = `${headerB64}.${payloadB64}.${Buffer.from("forged-signature").toString("base64url")}`;
    const badRes = await verifyCloudflareAccessJwt(tamperedJwt, {
      teamDomain: "ezanvakfi.cloudflareaccess.com",
      expectedAud: "cf-aud-tag-12345",
      jwksKeysOverride: jwksKeys,
      nowSec
    });
    expect(badRes.valid).toBe(false);
  });

  it("3-band: Admin TOTP 2FA login, rol tekshiruvi va KVKK PII o'chirish audit logi", async () => {
    const totpSecret = crypto.randomBytes(20).toString("hex");
    const pwdHash = hashPasswordScrypt("StrongAdminPass!2027");

    await dbQuery(
      `INSERT INTO cms_users (email, full_name, role, password_hash, totp_secret, totp_enabled)
       VALUES ('secadmin@ezanvakfi.org', 'Security Admin', 'admin', $1, $2, TRUE)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, totp_secret = EXCLUDED.totp_secret, role = 'admin'`,
      [pwdHash, totpSecret]
    );

    // Noto'g'ri TOTP kod bilan login rad etiladi
    await expect(
      loginAdminWithTotp({
        email: "secadmin@ezanvakfi.org",
        password: "StrongAdminPass!2027",
        totpCode: "000000"
      })
    ).rejects.toThrow(/2FA/);

    // To'g'ri TOTP kod bilan login muvaffaqiyatli bo'ladi
    const validTotp = generateTotpCode(totpSecret);
    expect(verifyTotpCode(totpSecret, validTotp)).toBe(true);

    const loginRes = await loginAdminWithTotp({
      email: "secadmin@ezanvakfi.org",
      password: "StrongAdminPass!2027",
      totpCode: validTotp,
      clientIp: "195.175.39.42"
    });
    expect(loginRes.user.role).toBe("admin");

    const ord = await createDonationOrder({
      originHost: "ezanvakfi.org",
      locale: "tr",
      frequency: "one_time",
      items: [{ campaignSlug: "genel-bagis", amount: 250 }],
      donor: {
        fullName: "Silinecek İsim",
        phone: "+905320001122",
        email: "kvkk-delete@example.com",
        kvkkConsent: true
      }
    });

    // Editor roli kvkk-erase chaqira olmaydi
    await expect(
      eraseDonorPiiByKvkkRequest({
        target: ord.donation.public_no,
        confirm: "KVKK_SILME_ONAYLIYORUM",
        reason: "Bağışçı yazılı KVKK başvuru talebi",
        actor: { email: "editor@ezanvakfi.org", role: "editor", totpVerified: true }
      })
    ).rejects.toThrow(/Forbidden/);

    // Tasdiq maydoni bo'lmasa rad etiladi
    await expect(
      eraseDonorPiiByKvkkRequest({
        target: ord.donation.public_no,
        confirm: "WRONG_CONFIRM",
        reason: "Bağışçı yazılı KVKK başvuru talebi",
        actor: { userId: loginRes.user.id, email: loginRes.user.email, role: "admin", totpVerified: true }
      })
    ).rejects.toThrow(/Confirmation/);

    // Admin + 2FA + tasdiq maydoni bilan bajariladi va admin_audit_logs ga yoziladi
    const erased = await eraseDonorPiiByKvkkRequest({
      target: ord.donation.public_no,
      confirm: "KVKK_SILME_ONAYLIYORUM",
      reason: "Bağışçı yazılı KVKK başvuru talebi #2027-01",
      actor: { userId: loginRes.user.id, email: loginRes.user.email, role: "admin", totpVerified: true },
      clientIp: "195.175.39.42"
    });
    expect(erased.erasedCount).toBe(1);
    expect(erased.auditId).toBeGreaterThan(0);

    const auditCheck = await dbQuery(`SELECT * FROM admin_audit_logs WHERE id = $1`, [erased.auditId]);
    expect(auditCheck.rows[0]?.action).toBe("KVKK_PII_ERASE");
    expect(auditCheck.rows[0]?.actor_email).toBe("secadmin@ezanvakfi.org");
  });

  it("5-band: iyzico V3 webhook imzosi, retrieve tekshiruvi va paidPrice mos kelmasa rad etilishi", async () => {
    const order = await createDonationOrder({
      originHost: "ezanvakfi.org",
      locale: "tr",
      frequency: "one_time",
      items: [{ campaignSlug: "genel-bagis", amount: 1000 }],
      donor: { kvkkConsent: true }
    });

    const iyzSecret = "sandbox-iyzico-secret-key-test-123456";
    const webhookPayload = {
      iyziEventType: "CHECKOUTFORM_AUTH",
      iyziPaymentId: "99887766",
      token: "tok_test_123",
      paymentConversationId: order.donation.external_id,
      status: "SUCCESS"
    };
    const rawBody = JSON.stringify(webhookPayload);
    const sig = computeIyzicoV3WebhookSignature(webhookPayload, iyzSecret);

    // paidPrice (400 TRY) != expected (1000 TRY) bo'lganda xato beradi va 'paid' bo'lmaydi
    const fakeIyzicoMismatchProvider: PaymentProvider = {
      name: "iyzico",
      async createCheckoutSession() {
        throw new Error("not used");
      },
      verifyWebhookSignature(raw, hdr) {
        return hdr === sig && raw === rawBody;
      },
      async retrievePaymentStatus() {
        return {
          status: "success",
          paymentStatus: "SUCCESS",
          paymentId: "99887766",
          paidPrice: 400, // Mismatch! Expected 1000 TRY
          price: 1000,
          currency: "TRY",
          conversationId: order.donation.external_id
        };
      }
    };

    await expect(
      processPaymentWebhook({
        rawBody,
        signatureHeader: sig,
        providerOverride: fakeIyzicoMismatchProvider
      })
    ).rejects.toThrow(/Paid price mismatch/);

    const dbAfterMismatch = await dbQuery(`SELECT status FROM donations WHERE external_id = $1::uuid`, [
      order.donation.external_id
    ]);
    expect(dbAfterMismatch.rows[0]?.status).toBe("pending");
  });

  it("5-band: RECURRING_ENABLED=false bo'lganda oylik xayriya rad etiladi va kalitsiz iyzico ishga tushmaydi", async () => {
    expect(SITE_CONFIG.recurringEnabled).toBe(false);
    await expect(
      createDonationOrder({
        originHost: "ezanvakfi.org",
        locale: "tr",
        frequency: "monthly",
        items: [{ campaignSlug: "genel-bagis", amount: 500 }],
        donor: { kvkkConsent: true }
      })
    ).rejects.toThrow(/RECURRING_ENABLED=false/);

    const prevProv = process.env.PAYMENT_PROVIDER;
    try {
      process.env.PAYMENT_PROVIDER = "iyzico";
      delete process.env.IYZICO_API_KEY;
      expect(() => getPaymentProvider()).toThrow(/IYZICO_API_KEY/);
    } finally {
      process.env.PAYMENT_PROVIDER = prevProv;
    }
  });

  it("6-band: Turnstile productionda kalit bo'lmasa xato beradi (4 belgili token qabul qilinmaydi)", async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevSecret = process.env.TURNSTILE_SECRET_KEY;
    try {
      (process.env as any).NODE_ENV = "production";
      delete process.env.TURNSTILE_SECRET_KEY;
      expect(() => validateStartupEnvironment()).toThrow(/TURNSTILE_SECRET_KEY/);
      await expect(verifyTurnstileToken("dev-turnstile-ok")).rejects.toThrow(/TURNSTILE_SECRET_KEY/);
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
      process.env.TURNSTILE_SECRET_KEY = prevSecret;
    }
  });

  it("Zakot kalkulyatori va PDF makbuz (soliq imtiyozi da'vosisiz) to'g'ri ishlaydi", async () => {
    const above = calculateZakat({
      cashTry: 300_000,
      goldGrams: 10,
      debtsTry: 20_000,
      goldGramPriceTry: 3000
    });
    expect(above.isEligible).toBe(true);
    expect(above.zakatDueTry).toBe(7750);

    const buf = await generateReceiptPdfBuffer({
      public_no: "EZ-2027-000999",
      donor_name: "Test Bağışçı",
      amount_try: 1000,
      currency: "TRY",
      purpose_title: "Genel Bağış"
    });
    expect(buf.byteLength).toBeGreaterThan(500);
    expect(SITE_CONFIG.receiptTemplate.includeTaxExemptionClause).toBe(false);

    const masked = sanitizeLogObject({
      donorPhone: "+905559876543",
      donorEmail: "mehmet@ezanvakfi.org",
      clientIp: "195.175.39.42",
      cardNumber: "4543600011112222"
    });
    expect(masked.donorPhone).toBe("***6543");
    expect(masked.donorEmail).toBe("me***@ezanvakfi.org");
    expect(masked.cardNumber).toBe("[REDACTED-CARD-PROHIBITED]");
  });
});
