import { describe, it, expect, beforeAll } from "vitest";
import {
  createDonationOrder,
  processPaymentWebhook,
  signWebhookPayload,
  generateReceiptPdfBuffer
} from "../src/payments/service";
import {
  computeInternalHmac,
  verifyInternalSyncAuth,
  listUnsyncedDonationsForVaqf,
  acknowledgeSyncedDonations
} from "../src/sync";
import { calculateZakat } from "../src/lib/zakat";
import { eraseDonorPiiByKvkkRequest, sanitizeLogObject } from "../src/lib/security";
import { SITE_CONFIG } from "../src/lib/config";
import { ensureSchema, dbQuery } from "../src/db/schema";
import { seedDatabase } from "../src/db/seed";

describe("5, 6, 7-qadamlar: Xayriya, Webhook, Zakot, Sinxronlash va KVKK testlari", () => {
  beforeAll(async () => {
    await ensureSchema();
    await seedDatabase();
  });

  it("DONATIONS_LIVE=false bo'lganda sinov (sandbox) rejimi yoqilgan va haqiqiy kalitlar ishlatilmaydi", async () => {
    expect(SITE_CONFIG.donationsLive).toBe(false);
    const res = await createDonationOrder({
      originHost: "ezanvakfi.org",
      locale: "tr",
      frequency: "one_time",
      items: [{ campaignSlug: "mezana-akademisi-egitim-bursu", amount: 500 }],
      donor: {
        fullName: "Ahmet Yılmaz",
        phone: "+905551112233",
        email: "ahmet@example.com",
        wantReceipt: true,
        kvkkConsent: true
      }
    });
    expect(res.checkout.sandbox).toBe(true);
    expect(res.checkout.threeDSecureRequired).toBe(true);
    expect(res.donation.status).toBe("pending");
    expect(res.donation.public_no).toMatch(/^EZ-2027-\d{6}$/);
  });

  it("Narx va summani mijoz tomonidan manfiy yoki kampaniya chegarasidan tashqari qilib o'zgartirib bo'lmaydi", async () => {
    await expect(
      createDonationOrder({
        originHost: "ezanvakfi.org",
        locale: "tr",
        frequency: "one_time",
        items: [{ campaignSlug: "mezana-akademisi-egitim-bursu", amount: -100 }],
        donor: { kvkkConsent: true }
      })
    ).rejects.toThrow();

    await expect(
      createDonationOrder({
        originHost: "ezanvakfi.org",
        locale: "tr",
        frequency: "one_time",
        items: [{ campaignSlug: "mezana-akademisi-egitim-bursu", amount: 5 }],
        donor: { kvkkConsent: true }
      })
    ).rejects.toThrow(/chegarasidan tashqarida/);
  });

  it("Imzosiz yoki noto'g'ri imzoli webhook rad etiladi (401)", async () => {
    const rawBody = JSON.stringify({
      eventId: "evt_invalid_sig_1",
      donationExternalId: "00000000-0000-0000-0000-000000000000",
      status: "paid"
    });

    await expect(
      processPaymentWebhook({ rawBody, signatureHeader: null })
    ).rejects.toThrow(/signature/);

    await expect(
      processPaymentWebhook({ rawBody, signatureHeader: "bad_signature_hex" })
    ).rejects.toThrow(/signature/);
  });

  it("To'g'ri imzoli webhook xayriyani 'paid' qiladi, takror webhook esa dublikat yaratmaydi (idempotent)", async () => {
    const order = await createDonationOrder({
      originHost: "azonvaqfi.org",
      locale: "uz",
      frequency: "one_time",
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

    expect(Number(order.donation.amount_try)).toBe(550);
    expect(order.checkout.checkoutUrl).toContain("azonvaqfi.org/uz/rahmat");

    const rawBody = JSON.stringify({
      eventId: `evt_paid_${order.donation.external_id}`,
      paymentId: `pay_${order.donation.public_no}`,
      donationExternalId: order.donation.external_id,
      status: "paid"
    });
    const sig = signWebhookPayload(rawBody);

    const firstCall = await processPaymentWebhook({ rawBody, signatureHeader: sig });
    expect(firstCall.duplicate).toBe(false);
    expect(firstCall.status).toBe("paid");

    const secondCall = await processPaymentWebhook({ rawBody, signatureHeader: sig });
    expect(secondCall.duplicate).toBe(true);
    expect(secondCall.status).toBe("ignored");

    const outboxRes = await dbQuery(
      `SELECT * FROM outbox_messages WHERE recipient = $1 AND subject LIKE $2`,
      ["abdulloh@example.com", `%${order.donation.public_no}%`]
    );
    expect(outboxRes.rowCount).toBe(1);
  });

  it("Makbuz (Bağış Alındı Belgesi) PDF generatsiya qilinadi va soliq imtiyozi haqida hech narsa yozilmaydi", async () => {
    const buf = await generateReceiptPdfBuffer({
      public_no: "EZ-2027-000999",
      donor_name: "Test Bağışçı",
      amount_try: 1000,
      currency: "TRY",
      purpose_title: "Genel Bağış"
    });
    expect(buf.byteLength).toBeGreaterThan(500);
    expect(SITE_CONFIG.receiptTemplate.includeTaxExemptionClause).toBe(false);
  });

  it("Zakot kalkulyatori 85g oltin nisobi va 2.5% stavka bo'yicha to'g'ri hisoblaydi", () => {
    const belowNisab = calculateZakat({
      cashTry: 50000,
      foreignCashTry: 0,
      goldGrams: 10,
      silverGrams: 0,
      tradeGoodsTry: 0,
      receivablesTry: 0,
      debtsTry: 10000,
      goldGramPriceTry: 3000
    });
    expect(belowNisab.isEligible).toBe(false);
    expect(belowNisab.zakatDueTry).toBe(0);

    const aboveNisab = calculateZakat({
      cashTry: 300000,
      foreignCashTry: 0,
      goldGrams: 20,
      silverGrams: 0,
      tradeGoodsTry: 40000,
      receivablesTry: 0,
      debtsTry: 0,
      goldGramPriceTry: 3000
    });
    expect(aboveNisab.isEligible).toBe(true);
    expect(aboveNisab.zakatDueTry).toBe(10000);
    expect(aboveNisab.disclaimer).toContain("[TASLIK]");
  });

  it("Ichki vaqf tizimiga sinxronlash HMAC-SHA256 imzo va ±5 daqiqa oynasini tekshiradi", async () => {
    const nowMs = Date.now();
    const ts = String(Math.floor(nowMs / 1000));
    const pathAndQuery = "/api/internal/donations?cursor=0";
    const validSig = computeInternalHmac(ts, "GET", pathAndQuery, "");

    expect(
      verifyInternalSyncAuth({
        timestampHeader: ts,
        signatureHeader: validSig,
        method: "GET",
        pathAndQuery,
        nowMs
      }).ok
    ).toBe(true);

    expect(
      verifyInternalSyncAuth({
        timestampHeader: ts,
        signatureHeader: null,
        method: "GET",
        pathAndQuery,
        nowMs
      }).ok
    ).toBe(false);

    const oldTs = String(Math.floor((nowMs - 10 * 60 * 1000) / 1000));
    const oldSig = computeInternalHmac(oldTs, "GET", pathAndQuery, "");
    expect(
      verifyInternalSyncAuth({
        timestampHeader: oldTs,
        signatureHeader: oldSig,
        method: "GET",
        pathAndQuery,
        nowMs
      }).ok
    ).toBe(false);

    const syncList = await listUnsyncedDonationsForVaqf(0, 50);
    expect(syncList.items.length).toBeGreaterThan(0);
    const first = syncList.items[0]!;
    expect(first.purpose.startsWith("Onlayn bağış:")).toBe(true);

    const ackRes = await acknowledgeSyncedDonations([first.external_ref]);
    expect(ackRes.acknowledged).toBe(1);
  });

  it("KVKK bo'yicha donor shaxsiy ma'lumotlarini o'chirish va loglarda telefon/email/IP maskalash ishlaydi", async () => {
    const masked = sanitizeLogObject({
      donorPhone: "+905559876543",
      donorEmail: "mehmet@ezanvakfi.org",
      clientIp: "195.175.39.42",
      cardNumber: "4543600011112222"
    });
    expect(masked.donorPhone).toBe("***6543");
    expect(masked.donorEmail).toBe("me***@ezanvakfi.org");
    expect(masked.clientIp).toBe("195.175.***.***");
    expect(masked.cardNumber).toBe("[REDACTED-CARD-PROHIBITED]");

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

    const erased = await eraseDonorPiiByKvkkRequest(ord.donation.public_no);
    expect(erased.erasedCount).toBe(1);
  });
});