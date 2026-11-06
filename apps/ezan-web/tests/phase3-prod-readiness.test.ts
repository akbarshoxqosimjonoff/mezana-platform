import { describe, it, expect, beforeAll } from "vitest";
import { ensureSchema, dbQuery } from "../src/db/schema";
import { seedDatabase } from "../src/db/seed";
import {
  createDonationOrder,
  processPaymentWebhook,
  generateReceiptPdfBuffer,
  signWebhookPayload,
  type PaymentProvider
} from "../src/payments/service";
import { LEGACY_301_REDIRECTS, evaluateLocaleRouting } from "../src/middleware";
import {
  sanitizeSentryEvent,
  recordWorkerHeartbeat,
  getComprehensiveHealthStatus,
  generateDailyTelegramSummary,
  recordAnalyticsFunnelEvent,
  getRamadanSettings,
  updateRamadanSettings,
  getVisibleRamadanCampaigns
} from "../src/monitoring/service";

const mockSandboxProvider: PaymentProvider = {
  name: "iyzico",
  async createCheckoutSession(req) {
    return {
      provider: "iyzico",
      sandbox: true,
      threeDSecureRequired: true,
      checkoutUrl: `https://sandbox-api.iyzipay.com/checkout/${req.publicNo}`,
      providerReference: `sbx_tok_${req.publicNo}`
    };
  },
  verifyWebhookSignature(rawBody, signatureHeader) {
    if (!signatureHeader) return false;
    const expected = signWebhookPayload(rawBody);
    return signatureHeader === expected;
  },
  async retrievePaymentStatus(params) {
    return {
      status: "success",
      paymentStatus: "SUCCESS",
      paymentId: params.paymentId || "sbx_pay_1",
      paidPrice: 1500,
      price: 1500,
      currency: "TRY",
      conversationId: params.conversationId
    };
  }
};

describe("Phase 3 — Production Readiness, Security, Ramadan & 300-User Load Tests", () => {
  beforeAll(async () => {
    process.env.DONATIONS_LIVE = "false";
    process.env.PAYMENT_PROVIDER = "mock";
    process.env.PAYMENT_WEBHOOK_SECRET = "sandbox_webhook_secret_32_bytes_minimum_ok";
    process.env.IYZICO_SANDBOX_API_KEY = "sandbox_api_key_32_bytes_minimum_length_ok";
    process.env.IYZICO_SANDBOX_SECRET_KEY = "sandbox_secret_key_32_bytes_minimum_len_ok";
    process.env.EZAN_SYNC_SECRET = "sync_secret_key_at_least_32_bytes_long_2027";
    await ensureSchema();
    await seedDatabase();
    await updateRamadanSettings({ seasonYear: 2027, ramadanMode: false, fitreAmountTry: null });
  });

  it("1. 6 ta to'lov holatini sandbox'da tekshiradi (muvaffaqiyatli, rad etilgan, 3DS bekor, dublikat webhook, noto'g'ri imzo, qaytarilgan refund)", async () => {
    // 1) Muvaffaqiyatli to'lov
    const d1 = await createDonationOrder({
      originHost: "ezanvakfi.org",
      locale: "tr",
      frequency: "one_time",
      items: [{ campaignSlug: "zekat", amount: 1500 }],
      donor: {
        fullName: "Ahmet Yılmaz",
        email: "ahmet@example.com",
        phone: "+905551112233",
        isAnonymous: false,
        kvkkConsent: true,
        wantReceipt: true
      }
    });

    const body1 = JSON.stringify({
      eventId: `evt_ok_${Date.now()}`,
      donationExternalId: d1.donation.external_id,
      status: "paid",
      paymentId: "iyz_tx_ok_1"
    });
    const sig1 = signWebhookPayload(body1);
    const res1 = await processPaymentWebhook({
      rawBody: body1,
      signatureHeader: sig1,
      providerOverride: mockSandboxProvider
    });
    expect(res1.status).toBe("paid");
    expect(res1.duplicate).toBe(false);

    const pdfBuf = await generateReceiptPdfBuffer(d1.donation);
    expect(pdfBuf.byteLength).toBeGreaterThan(500);

    // 4) Ikki marta yuborilgan bir xil webhook (idempotentlik: ikkinchisi duplicate=true qaytaradi)
    const resDup = await processPaymentWebhook({
      rawBody: body1,
      signatureHeader: sig1,
      providerOverride: mockSandboxProvider
    });
    expect(resDup.duplicate).toBe(true);

    // 2) Rad etilgan karta (failed)
    const d2 = await createDonationOrder({
      originHost: "ezanvakfi.org",
      locale: "tr",
      frequency: "one_time",
      items: [{ campaignSlug: "genel-bagis", amount: 500 }],
      donor: {
        fullName: "Mehmet Kaya",
        isAnonymous: false,
        kvkkConsent: true,
        wantReceipt: false
      }
    });
    const body2 = JSON.stringify({
      eventId: `evt_fail_${Date.now()}`,
      donationExternalId: d2.donation.external_id,
      status: "failed",
      paymentId: "iyz_tx_fail_2"
    });
    const sig2 = signWebhookPayload(body2);
    const res2 = await processPaymentWebhook({
      rawBody: body2,
      signatureHeader: sig2,
      providerOverride: mockSandboxProvider
    });
    expect(res2.status).toBe("failed");

    // 3) 3DS oynasini yopib ketish -> status 'pending' bo'lib qoladi
    const d3 = await createDonationOrder({
      originHost: "ezanvakfi.org",
      locale: "tr",
      frequency: "one_time",
      items: [{ campaignSlug: "iftar", amount: 300 }],
      donor: {
        fullName: "Zeynep Demir",
        isAnonymous: false,
        kvkkConsent: true,
        wantReceipt: false
      }
    });
    const row3 = await dbQuery<{ status: string }>(`SELECT status FROM donations WHERE external_id = $1::uuid`, [
      d3.donation.external_id
    ]);
    expect(row3.rows[0]?.status).toBe("pending");

    // 5) Noto'g'ri imzoli webhook -> 401
    await expect(
      processPaymentWebhook({
        rawBody: body1,
        signatureHeader: "00".repeat(32),
        providerOverride: mockSandboxProvider
      })
    ).rejects.toThrow(/Invalid or missing webhook signature/);

    // 6) Refund holati -> status 'refunded'
    const bodyRefund = JSON.stringify({
      eventId: `evt_ref_${Date.now()}`,
      donationExternalId: d1.donation.external_id,
      status: "refunded",
      reason: "Sinov qaytarish"
    });
    const sigRefund = signWebhookPayload(bodyRefund);
    const resRefund = await processPaymentWebhook({
      rawBody: bodyRefund,
      signatureHeader: sigRefund,
      providerOverride: mockSandboxProvider
    });
    expect(resRefund.status).toBe("refunded");
  });

  it("2. /api/health, worker heartbeat, kunlik Telegram xulosasi va Sentry PII tozalashni tekshiradi", async () => {
    await recordWorkerHeartbeat("outbox-worker", "ok", { processed: 12 });
    await recordWorkerHeartbeat("video-worker", "ok", { processed: 3 });

    const health = await getComprehensiveHealthStatus();
    expect(health.checks.database.ok).toBe(true);
    expect(health.checks.storage.ok).toBe(true);
    expect(health.checks.worker.activeWorkers.length).toBeGreaterThanOrEqual(2);
    expect(health.checks.resources.diskUsedPercent).toBeLessThan(95);

    const summary = await generateDailyTelegramSummary();
    expect(summary.telegramText).toContain("Ezan Vakfı — Kunlik Hisobot");

    // Sentry PII scrubber testi
    const dirtyEvent: Record<string, any> = {
      message: "Payment failed for +905321234567 and user ali.veli@example.org",
      extra: {
        donorName: "Ali Veli",
        donorPhone: "+905321234567",
        donorEmail: "ali.veli@example.org",
        vekaletText: "Ali Veli adına vekalet",
        cardNumber: "4543600012345678",
        safeField: "ZEKAT"
      }
    };
    const scrubbed = sanitizeSentryEvent(dirtyEvent);
    expect(scrubbed.message).not.toContain("+905321234567");
    expect(scrubbed.message).not.toContain("ali.veli@example.org");
    expect(scrubbed.extra.donorName).toBe("[REDACTED_PII]");
    expect(scrubbed.extra.vekaletText).toBe("[REDACTED_PII]");
    expect(scrubbed.extra.cardNumber).toBe("[REDACTED_PII]");
    expect(scrubbed.extra.safeField).toBe("ZEKAT");
  });

  it("3. Cookie roziligisiz analitika yozmasligini va 301 redirectlarni tekshiradi", async () => {
    const noConsent = await recordAnalyticsFunnelEvent({
      eventName: "donation_started",
      locale: "tr",
      cookieConsent: "essential"
    });
    expect(noConsent.recorded).toBe(false);

    const withConsent = await recordAnalyticsFunnelEvent({
      eventName: "donation_started",
      locale: "tr",
      cookieConsent: "all"
    });
    expect(withConsent.recorded).toBe(true);

    expect(LEGACY_301_REDIRECTS["/hakkimizda.html"]).toBe("/tr/hakkimizda");
    expect(LEGACY_301_REDIRECTS["/bagis.php"]).toBe("/tr/bagis");
    expect(LEGACY_301_REDIRECTS["/tr/faaliyetler/istanbul-ogrenci-yurdu"]).toBe("/tr/faaliyetler/talebe-yurdu");

    const decision = evaluateLocaleRouting({
      host: "ezanvakfi.org",
      pathname: "/hakkimizda.html",
      search: "",
      cookieLang: undefined,
      acceptLanguage: "tr-TR"
    });
    expect(decision.action).toBe("redirect");
    expect(decision.status).toBe(301);
  });

  it("4. Ramazon tayyorgarligi: fitre miqdori bo'sh bo'lsa yashirin, Diyanet e'lon qilganda ochiq bo'lishini tekshiradi", async () => {
    await updateRamadanSettings({
      seasonYear: 2027,
      ramadanMode: false,
      fitreAmountTry: null,
      fidyeAmountTry: null,
      iftarUnitTry: 250
    });
    const listHidden = await getVisibleRamadanCampaigns(2027);
    expect(listHidden.some((c) => c.slug === "fitre")).toBe(false);

    await updateRamadanSettings({
      seasonYear: 2027,
      ramadanMode: true,
      fitreAmountTry: 250,
      fidyeAmountTry: 250,
      iftarUnitTry: 300
    });
    const settings = await getRamadanSettings(2027);
    expect(settings.ramadan_mode_active).toBe(true);
    expect(Number(settings.fitre_amount_try)).toBe(250);

    const listVisible = await getVisibleRamadanCampaigns(2027);
    expect(listVisible.some((c) => c.slug === "fitre")).toBe(true);
    expect(listVisible.some((c) => c.slug === "fidye")).toBe(true);
  });

  it("5. Yuklama sinovi: 300 parallel foydalanuvchi (p50, p95, p99 o'lchovi, 0 xato)", async () => {
    const concurrency = 300;
    const durations: number[] = [];
    let errors = 0;

    const tasks = Array.from({ length: concurrency }, async (_, idx) => {
      const t0 = performance.now();
      try {
        if (idx % 5 === 0) {
          await createDonationOrder({
            originHost: "ezanvakfi.org",
            locale: "tr",
            frequency: "one_time",
            items: [{ campaignSlug: "iftar", amount: 300 }],
            donor: {
              fullName: `Load Tester ${idx}`,
              isAnonymous: false,
              kvkkConsent: true,
              wantReceipt: false
            }
          });
        } else {
          await getVisibleRamadanCampaigns(2027);
        }
      } catch {
        errors++;
      } finally {
        durations.push(performance.now() - t0);
      }
    });

    await Promise.all(tasks);
    durations.sort((a, b) => a - b);

    const p50 = durations[Math.floor(durations.length * 0.5)] ?? 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;
    const p99 = durations[Math.floor(durations.length * 0.99)] ?? 0;

    console.log(
      `[LOAD TEST 300 CONCURRENT USERS] errors=${errors}, p50=${p50.toFixed(1)}ms, p95=${p95.toFixed(1)}ms, p99=${p99.toFixed(1)}ms`
    );

    expect(errors).toBe(0);
    expect(p95).toBeLessThan(1500);
  });
});
