import { describe, it, expect, beforeAll } from "vitest";
import { ensureSchema } from "../src/db/schema";
import { seedDatabase } from "../src/db/seed";
import { signWebhookPayload } from "../src/payments/service";
import {
  getGrowthFeatureFlags,
  generateKurbanSeasonRetrospective,
  cloneKurbanSeasonForNextYear,
  createRecurringSubscription,
  manageRecurringSubscription,
  processRecurringSubscriptionWebhook,
  createRamadanAutopayPlan,
  simulateAccelerated30NightsSandbox,
  createP2pCampaign,
  moderateP2pCampaign,
  contributeToP2pCampaign,
  createGiftDonationCard,
  createOrUpdateNamedProject,
  publishProjectUpdate,
  getDonorImpactSummary,
  upsertAnnualReport,
  getAnnualReportPageData,
  subscribeNewsletterDoubleOptIn,
  confirmNewsletterSubscription,
  unsubscribeNewsletterOneClick,
  generateBankTransferCode,
  importBankStatementCsvRows,
  syncYouTubeVideosToDrafts,
  syncInstagramPostsCache,
  buildSocialShareLinksWithUtm,
  issueMobileApiTokens,
  revokeMobileDeviceTokens,
  getOpenApiV1Spec,
  getAdminMonthlyAnalyticsDashboard,
  assignAbTestPresetVariant
} from "../src/growth/service";

describe("Phase 4 — Growth, Recurring, 30-Night Ramadan, P2P, Impact, Bank CSV & Mobile API v1", () => {
  beforeAll(async () => {
    process.env.DONATIONS_LIVE = "false";
    process.env.PAYMENT_PROVIDER = "mock";
    process.env.PAYMENT_WEBHOOK_SECRET = "sandbox_webhook_secret_32_bytes_minimum_ok";
    process.env.IYZICO_SANDBOX_API_KEY = "sandbox_api_key_32_bytes_minimum_length_ok";
    process.env.IYZICO_SANDBOX_SECRET_KEY = "sandbox_secret_key_32_bytes_minimum_len_ok";
    process.env.EZAN_SYNC_SECRET = "sync_secret_key_at_least_32_bytes_long_2027";
    await ensureSchema();
    await seedDatabase();
  });

  it("0-qadam va 1-qadam: Feature flaglar va Kurban 2027 -> 2028 mavsumini 0 narx/kvota bilan klonlashni tekshiradi", async () => {
    const flags = getGrowthFeatureFlags();
    expect(typeof flags.RECURRING_ENABLED).toBe("boolean");

    const retro = await generateKurbanSeasonRetrospective(2027);
    expect(retro.seasonYear).toBe(2027);
    expect(Array.isArray(retro.byCountry)).toBe(true);

    const cloned = await cloneKurbanSeasonForNextYear(2027, 2028);
    expect(cloned.toYear).toBe(2028);
    expect(cloned.datesCleared).toBe(true);
    expect(cloned.pricesCleared).toBe(true);
  });

  it("2-qadam: Oylik obuna (Recurring), dunning (1, 3, 7-kun) va 3 marta xatodan so'ng avtomatik to'xtashni tekshiradi", async () => {
    process.env.RECURRING_ENABLED = "true";
    const sub = await createRecurringSubscription({
      donorName: "Selim Aydın",
      donorEmail: "selim@example.com",
      donorPhone: "+905331112233",
      campaignSlug: "genel-bagis",
      amountTry: 500,
      billingDay: 5
    });
    expect(sub.status).toBe("active");

    // 1-muvaffaqiyatsiz urinish -> 1 kunlik dunning
    const b1 = JSON.stringify({
      eventId: `rec_fail_1_${Date.now()}`,
      subscriptionExternalId: sub.external_id,
      status: "failed"
    });
    const fail1 = await processRecurringSubscriptionWebhook({
      rawBody: b1,
      signatureHeader: signWebhookPayload(b1)
    });
    expect(fail1.dunningAttempt).toBe(1);
    expect(fail1.nextRetryInDays).toBe(1);

    // 2-muvaffaqiyatsiz urinish -> 3 kunlik dunning
    const b2 = JSON.stringify({
      eventId: `rec_fail_2_${Date.now()}`,
      subscriptionExternalId: sub.external_id,
      status: "failed"
    });
    const fail2 = await processRecurringSubscriptionWebhook({
      rawBody: b2,
      signatureHeader: signWebhookPayload(b2)
    });
    expect(fail2.dunningAttempt).toBe(2);
    expect(fail2.nextRetryInDays).toBe(3);

    // 3-muvaffaqiyatsiz urinish -> 7 kunlik dunning va paused
    const b3 = JSON.stringify({
      eventId: `rec_fail_3_${Date.now()}`,
      subscriptionExternalId: sub.external_id,
      status: "failed"
    });
    const fail3 = await processRecurringSubscriptionWebhook({
      rawBody: b3,
      signatureHeader: signWebhookPayload(b3)
    });
    expect(fail3.dunningAttempt).toBe(3);
    expect(fail3.status).toBe("paused");

    // Kabinetdan bekor qilish
    const canceled = await manageRecurringSubscription({
      subscriptionExternalId: sub.external_id,
      action: "cancel"
    });
    expect(canceled.status).toBe("cancelled");
  });

  it("3-qadam: Ramazon 30 kecha avto-xayriya va oxirgi 10 kecha ko'paytirgichi hamda sandbox simulyatsiyasini tekshiradi", async () => {
    process.env.RAMADAN_AUTOPAY_ENABLED = "true";
    const plan = await createRamadanAutopayPlan({
      donorName: "Fatma Şahin",
      donorEmail: "fatma@example.com",
      donorPhone: "+905441112233",
      nightlyAmountTry: 100,
      lastTenMultiplier: 2,
      campaignSlug: "ramazan-genel"
    });
    expect(plan.nights_schedule).toHaveLength(30);
    const night27 = plan.nights_schedule.find((n: any) => n.night === 27);
    const night2 = plan.nights_schedule.find((n: any) => n.night === 2);
    expect(Number(night27.amountTry)).toBeGreaterThan(Number(night2.amountTry));

    const sim = await simulateAccelerated30NightsSandbox(plan.external_id);
    expect(sim.chargedNightsCount).toBe(30);
    expect(sim.status).toBe("completed");
  });

  it("4-qadam: P2P kampaniya moderatsiyasi, Sovg'a e-kartasi va Nomlangan loyiha (Suv qudug'i) bosqichlarini tekshiradi", async () => {
    const slug = `p2p-yusuf-${Date.now()}`;
    const p2p = await createP2pCampaign({
      slug,
      ownerName: "Yusuf Demir",
      ownerEmail: "yusuf@example.com",
      targetCampaignSlug: "mezana-akademisi-egitim-bursu",
      title: {
        tr: "Mezana Talebeleri İçin Doğum Günü Kampanyam",
        uz: "Mezana talabalari uchun kampaniyam",
        en: "My Birthday Campaign for Mezana Students",
        ar: "حملتي لطلاب ميزانا"
      },
      story: {
        tr: "Hediyelerinizi ilim talebelerine bağışlayın.",
        uz: "Sovg'alaringizni ilm toliblariga xayriya qiling.",
        en: "Donate your gifts to students of knowledge.",
        ar: "تبرعوا بهداياكم لطلبة العلم."
      },
      goalAmountTry: 2000
    });
    expect(p2p.status).toBe("pending_review");

    // Moderatsiyadan oldin hissa qo'shib bo'lmaydi
    await expect(contributeToP2pCampaign(p2p.slug, 500)).rejects.toThrow();

    await moderateP2pCampaign(p2p.slug, "approved");
    const c1 = await contributeToP2pCampaign(p2p.slug, 2000);
    expect(c1.reachedGoal).toBe(true);

    // Sovg'a xayriya e-kartasi
    const gift = await createGiftDonationCard({
      senderName: "Ayşe Yılmaz",
      recipientName: "Zehra Kaya",
      recipientEmail: "zehra@example.com",
      occasion: "wedding",
      personalMessage: "Mutluluklar dilerim",
      locale: "tr"
    });
    expect(gift.eCardUrl).toContain("/tr/bagis/hediye/");

    // Nomlangan loyiha: collecting -> building -> completed
    const wellCode = `WELL-${Date.now().toString().slice(-5)}`;
    const s1 = await createOrUpdateNamedProject({
      code: wellCode,
      category: "water_well",
      dedicationName: "Merhum Hacı Hasan Efendi",
      sponsorEmail: "sponsor@example.com",
      targetAmountTry: 75000,
      fundedAmountTry: 25000,
      stage: "collecting",
      title: { tr: "Çad Su Kuyusu", uz: "Chad suv qudug'i", en: "Chad Water Well", ar: "بئر ماء تشاد" }
    });
    expect(s1.stage).toBe("collecting");

    const s3 = await createOrUpdateNamedProject({
      code: wellCode,
      category: "water_well",
      dedicationName: "Merhum Hacı Hasan Efendi",
      sponsorEmail: "sponsor@example.com",
      targetAmountTry: 75000,
      fundedAmountTry: 75000,
      stage: "completed",
      title: { tr: "Çad Su Kuyusu", uz: "Chad suv qudug'i", en: "Chad Water Well", ar: "بئر ماء تشاد" },
      reportNote: "Su kuyusu açıldı ve hizmete girdi."
    });
    expect(s3.stage).toBe("completed");
  });

  it("5-qadam: Ta'sir hisoboti ([TASLIK] filtr bilan) va Yillik Faoliyat Hisoboti (/faaliyet-raporu/2027) ni tekshiradi", async () => {
    const upd = await publishProjectUpdate({
      projectSlug: "mezana-akademisi-egitim-programi",
      locale: "tr",
      title: { tr: "2027 Bahar Dönemi Raporu", uz: "2027 bahor hisoboti", en: "Spring 2027 Report", ar: "تقرير ربيع ٢٠٢٧" },
      summary: { tr: "Yeni derslikler tamamlandı.", uz: "Yangi sinfxonalar bitdi.", en: "New classrooms completed.", ar: "اكتملت الفصول الجديدة." },
      metrics: [
        { label: { tr: "Mezun Talebe", uz: "Bitiruvchi", en: "Graduates", ar: "الخريجون" }, value: "45", isVerified: true },
        { label: { tr: "Taslak Veri", uz: "Taslak", en: "Draft", ar: "مسودة" }, value: "[TASLIK] 999", isVerified: false }
      ],
      photos: ["/media/katalog/egitim/mezana-ders-1-800.webp"],
      status: "published"
    });
    expect(upd.metrics).toHaveLength(1);

    await getDonorImpactSummary("ahmet@example.com");

    await upsertAnnualReport({
      year: 2027,
      status: "published",
      title: { tr: "2027 Yıllık Faaliyet Raporu", uz: "2027 yillik faoliyat hisoboti", en: "2027 Annual Report", ar: "التقرير السنوي ٢٠٢٧" },
      summary: { tr: "Şeffaf ve hesap verebilir vakıf yönetimi.", uz: "Shaffof va hisobdor vaqf boshqaruvi.", en: "Transparent foundation governance.", ar: "إدارة وقفية شفافة." },
      incomeBreakdown: [{ source: "Online Bağışlar", amountTry: 1250000 }],
      expenseBreakdown: [{ category: "Eğitim ve Burs", amountTry: 980000 }]
    });
    const rep = await getAnnualReportPageData(2027);
    expect(rep).not.toBeNull();
    expect(rep?.year).toBe(2027);
  });

  it("6, 7, 8, 9, 10-qadamlar: Newsletter Double Opt-In, Bank CSV solishtirish, YouTube/IG, Mobile /api/v1 va A/B testlarni tekshiradi", async () => {
    process.env.IYS_ENABLED = "true";
    const sub = await subscribeNewsletterDoubleOptIn({
      email: `bulten_${Date.now()}@example.com`,
      locale: "tr",
      interests: ["egitim", "ramazan"]
    });
    expect(sub.status).toBe("pending_confirm");

    const conf = await confirmNewsletterSubscription(sub.confirm_token);
    expect(conf?.status).toBe("confirmed");
    expect(conf?.iys_status).toBe("iys_registered_onay");

    const unsub = await unsubscribeNewsletterOneClick(sub.unsubscribe_token);
    expect(unsub?.status).toBe("unsubscribed");
    expect(unsub?.iys_status).toBe("iys_revoked_ret");

    // Bank CSV solishtirish + dublikat himoyasi
    const code = await generateBankTransferCode({
      donorName: "Mustafa Kılıç",
      donorEmail: "mustafa@example.com",
      campaignSlug: "zekat"
    });
    expect(code).toMatch(/^EZ[A-Z0-9]{4}$/);

    const csvRows = [
      {
        txDate: "2027-02-15",
        amountTry: 5000,
        senderName: "Mustafa Kılıç",
        description: `Zekat bagisi ref ${code} tx-${Date.now()}`
      }
    ];
    const firstImport = await importBankStatementCsvRows(csvRows);
    expect(firstImport.inserted).toBe(1);
    expect(firstImport.autoMatched).toBe(1);

    const secondImport = await importBankStatementCsvRows(csvRows);
    expect(secondImport.duplicatesSkipped).toBe(1);
    expect(secondImport.inserted).toBe(0);

    // YouTube -> draft, Instagram cache, UTM share links
    const yt = await syncYouTubeVideosToDrafts([
      {
        videoId: `vid_${Date.now()}`,
        title: "Ezan Vakfı Tanıtım",
        description: "Vakıf faaliyetlerimiz",
        publishedAt: "2027-01-15T10:00:00Z",
        thumbnailUrl: "https://i.ytimg.com/vi/test/hqdefault.jpg"
      }
    ]);
    expect(yt.createdDrafts).toBe(1);

    const ig = await syncInstagramPostsCache([
      {
        externalId: `ig_${Date.now()}`,
        permalink: "https://instagram.com/p/test1",
        caption: "Cuma mesajı",
        mediaUrl: "/media/test.jpg",
        publishedAt: "2027-01-16T12:00:00Z"
      }
    ]);
    expect(ig.length).toBeGreaterThanOrEqual(1);

    const utm = buildSocialShareLinksWithUtm({
      pageUrl: "https://ezanvakfi.org/tr/bagis",
      title: "Ezan Vakfı Bağış",
      campaignSlug: "zekat"
    });
    expect(utm.copyLink).toContain("utm_source=copy_link");
    expect(decodeURIComponent(utm.whatsapp)).toContain("utm_campaign=zekat");

    // Mobile API v1 token & OpenAPI 3.1
    const spec = getOpenApiV1Spec();
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths["/api/v1/campaigns"]).toBeDefined();

    const devId = `ios_dev_${Date.now()}`;
    const tokens = await issueMobileApiTokens({
      donorEmail: "mustafa@example.com",
      deviceId: devId
    });
    expect(tokens.accessToken).toMatch(/^ezm_at_/);

    const rev = await revokeMobileDeviceTokens(devId);
    expect(rev.revokedCount).toBe(1);

    // Analytics & A/B test
    const dash = await getAdminMonthlyAnalyticsDashboard();
    expect(Array.isArray(dash.byCampaign)).toBe(true);

    const ab = assignAbTestPresetVariant("anon-session-123");
    expect(["A", "B"]).toContain(ab.variant);
    expect(ab.presetsTry.length).toBe(4);
  });
});
