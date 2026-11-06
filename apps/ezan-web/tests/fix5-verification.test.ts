import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { dbQuery, ensureSchema } from "../src/db/schema";
import { seedDatabase } from "../src/db/seed";
import {
  containsTaslikOrFakeData,
  getPublicSiteData,
  updateKurbanCountryByAdmin,
  upsertKurbanOfferByAdmin,
  updateKurbanSeasonByAdmin
} from "../src/cms/service";
import {
  CATALOG_PROJECTS,
  diffCatalogProjectBodyTr
} from "../src/cms/katalog-seed";
import {
  createKurbanOrderWithQuotaLock,
  getPublicKurbanCatalog
} from "../src/kurban/service";
import { createDonationOrder } from "../src/payments/service";
import {
  assignAbTestPresetVariant,
  createGiftDonationCard,
  createOrUpdateNamedProject,
  createP2pCampaign,
  createRamadanAutopayPlan,
  createRecurringSubscription,
  generateBankTransferCode,
  getGrowthFeatureFlags,
  getOpenApiV1Spec,
  importBankStatementCsvRows,
  subscribeNewsletterDoubleOptIn,
  syncInstagramPostsCache
} from "../src/growth/service";
import { GET as v1CampaignsGet } from "../src/app/api/v1/campaigns/route";
import { GET as ogGet } from "../src/app/api/og/route";
import { POST as contactPost } from "../src/app/api/contact/route";

describe("Fix-5 Verification — Catalog Verbatim Diff, [TASLIK] Filter, Vekalet Rule, Test Isolation & 10 Feature Flags", () => {
  beforeAll(async () => {
    process.env.DONATIONS_LIVE = "false";
    process.env.PAYMENT_PROVIDER = "mock";
    process.env.PAYMENT_WEBHOOK_SECRET = "sandbox_webhook_secret_32_bytes_minimum_ok";
    process.env.EZAN_SYNC_SECRET = "sync_secret_key_at_least_32_bytes_long_2027";
    process.env.ADMIN_SESSION_SECRET = "admin_session_secret_at_least_32_bytes_2027";

    // Sukut bo'yicha 4-bosqichning barcha 10 ta bayrog'i o'chiq (false)
    process.env.RECURRING_ENABLED = "false";
    process.env.RAMADAN_AUTOPAY_ENABLED = "false";
    process.env.P2P_ENABLED = "false";
    process.env.GIFT_ENABLED = "false";
    process.env.NAMED_PROJECTS_ENABLED = "false";
    process.env.NEWSLETTER_ENABLED = "false";
    process.env.BANK_IMPORT_ENABLED = "false";
    process.env.INSTAGRAM_ENABLED = "false";
    process.env.API_V1_ENABLED = "false";
    process.env.AB_TESTS_ENABLED = "false";

    await ensureSchema();
    await seedDatabase();
  });

  it("1 & 6-band: Bazadagi 11 ta katalog loyihasining turkcha matni icerik/katalog-icerik-tr.md bilan so'zma-so'z (farq = 0) mos keladi", async () => {
    expect(CATALOG_PROJECTS.length).toBe(11);

    const dbProjects = await dbQuery<{ slug: string; status: string; body_tr: string }>(
      `SELECT slug, status, content->>'tr' AS body_tr FROM cms_projects WHERE status = 'published' ORDER BY id ASC`
    );
    expect(dbProjects.rows.map((r) => r.slug)).toEqual(CATALOG_PROJECTS.map((p) => p.slug));

    for (const proj of CATALOG_PROJECTS) {
      const row = dbProjects.rows.find((r) => r.slug === proj.slug);
      expect(row).toBeDefined();
      const diff = diffCatalogProjectBodyTr(proj.slug, row!.body_tr);
      expect(diff.matches).toBe(true);
      expect(diff.actualNormalized).toBe(diff.expectedNormalized);
    }
  });

  it("2-band: Kampaniyalarda target_amount=NULL, seed yangiliklar draft holatda, aloqa/IBAN bo'sh, rahbariyat va needs_review to'g'ri", async () => {
    const camps = await dbQuery<{ slug: string; target_amount: string | null }>(
      `SELECT slug, target_amount FROM cms_campaigns WHERE status = 'published'`
    );
    expect(camps.rowCount).toBeGreaterThanOrEqual(4);
    for (const c of camps.rows) {
      expect(c.target_amount).toBeNull();
    }

    const seedNews = await dbQuery<{ slug: string; status: string }>(
      `SELECT slug, status FROM cms_news WHERE slug IN (
         '2026-2027-mezana-akademisi-yeni-donem-acilisi',
         'ramazan-2027-hazirlik-toplantisi',
         'seffaflik-ve-dijital-bagis-altyapisi-yayinda'
       )`
    );
    for (const n of seedNews.rows) {
      expect(n.status).toBe("draft");
    }

    const siteDataTr = await getPublicSiteData("tr");
    expect(siteDataTr.settings.contact.address).toBe("");
    expect(siteDataTr.settings.contact.phone).toBe("");
    expect(siteDataTr.settings.contact.email).toBe("");
    expect(siteDataTr.settings.bankAccounts).toEqual([]);
    expect(siteDataTr.settings.announcement).toBe("");

    // Rahbariyat: Üstad Mübeşşir AHMED va Ramazan ÇAMLICA
    expect(siteDataTr.team.map((t) => t.fullName)).toEqual([
      "Üstad Mübeşşir AHMED",
      "Ramazan ÇAMLICA"
    ]);

    // mutevelli-heyet-baskani.jpg: alt matnida shaxs ismi yo'q va needs_review = true
    const mediaRes = await dbQuery<{ alt_text: any; needs_review: any }>(
      `SELECT alt_text, needs_review FROM cms_media WHERE file_key = 'rasmlar/hakkimizda/mutevelli-heyet-baskani.jpg' LIMIT 1`
    );
    if (mediaRes.rowCount && mediaRes.rowCount > 0) {
      expect(JSON.stringify(mediaRes.rows[0]!.alt_text)).not.toContain("Mübeşşir");
      expect(mediaRes.rows[0]!.needs_review?.tr).toBe(true);
    }
  });

  it("3-band: Render qatlamida [TASLIK], TR00 0000 yoki lorem bo'lgan matn va hujjat hech qachon chiqmaydi", async () => {
    expect(containsTaslikOrFakeData("[TASLIK] Sinov matni")).toBe(true);
    expect(containsTaslikOrFakeData("TR00 0000 0000 0000 0000 0000 01")).toBe(true);
    expect(containsTaslikOrFakeData("Lorem ipsum dolor sit amet")).toBe(true);
    expect(containsTaslikOrFakeData("Hakka Davetin Kutlu Sedası")).toBe(false);

    // Vaqtincha [TASLIK] yangilik qo'shib, getPublicSiteData uni yashirishini tekshiramiz
    await dbQuery(
      `INSERT INTO cms_news (slug, status, published_at, title, excerpt, body)
       VALUES ('taslik-test-news', 'published', '2027-01-01',
         '{"tr":"[TASLIK] Test Haber","uz":"[TASLIK] Test","en":"[TASLIK] Test","ar":"[TASLIK] Test"}'::jsonb,
         '{"tr":"Özet","uz":"Qisqa","en":"Excerpt","ar":"ملخص"}'::jsonb,
         '{"tr":"İçerik","uz":"Matn","en":"Body","ar":"محتوى"}'::jsonb)
       ON CONFLICT (slug) DO UPDATE SET status = 'published'`
    );

    try {
      for (const loc of ["tr", "uz", "en", "ar"] as const) {
        const publicData = await getPublicSiteData(loc);
        expect(publicData.news.some((n) => n.slug === "taslik-test-news")).toBe(false);
        const serialized = JSON.stringify(publicData);
        expect(serialized).not.toMatch(/\[TASLIK\]/i);
        expect(serialized).not.toMatch(/TR00\s*0000/i);
        expect(serialized).not.toMatch(/\blorem\b/i);
      }
    } finally {
      await dbQuery(`DELETE FROM cms_news WHERE slug = 'taslik-test-news'`);
    }
  });

  it("3-band (Vekalet qoidasi): vekalet_text bo'sh yoki [TASLIK] bo'lsa, qurbonlik oqimi butunlay yopiq bo'ladi", async () => {
    const adminActor = {
      userId: 1,
      email: "admin@ezanvakfi.org",
      role: "admin" as const,
      totpVerified: true,
      clientIp: "127.0.0.1"
    };

    // Mavsumni faol qilamiz va taklif qo'shamiz, lekin vekalet_text bo'sh bo'ladi
    await updateKurbanSeasonByAdmin(adminActor, {
      year: 2027,
      eidDay1: "2027-05-16",
      salesOpenAt: "2026-01-01T00:00:00Z",
      salesCloseAt: "2027-05-14T20:59:00Z",
      isActive: true,
      vekaletVersion: "v2027.1",
      vekaletText: { tr: "", uz: "", en: "", ar: "" }
    });
    await updateKurbanCountryByAdmin(adminActor, {
      code: "TD",
      flag: "🇹🇩",
      isActive: true,
      name: { tr: "Çad", uz: "Chad", en: "Chad", ar: "تشاد" },
      description: { tr: "Çad kurban", uz: "Chad qurbonlik", en: "Chad Qurbani", ar: "أضاحي تشاد" }
    });
    const offer = await upsertKurbanOfferByAdmin(adminActor, {
      seasonYear: 2027,
      countryCode: "TD",
      animalType: "sheep",
      sharesPerAnimal: 1,
      pricePerShareTry: 5200,
      quotaShares: 20,
      isActive: true
    });

    try {
      // 1) Bo'sh vekalet_text -> salesOpen = false va buyurtma 400 beradi
      const emptyVekaletCatalog = await getPublicKurbanCatalog("tr");
      expect(emptyVekaletCatalog.vekaletText).toBe("");
      expect(emptyVekaletCatalog.salesOpen).toBe(false);

      await expect(
        createKurbanOrderWithQuotaLock({
          originHost: "ezanvakfi.org",
          locale: "tr",
          offerId: offer.id,
          shares: [{ ownerName: "Test Hissedar", intentionType: "vacip" }],
          vekaletAccepted: true,
          readNamesAloudConsent: true,
          kvkkConsent: true,
          donor: { name: "Test Hissedar", phone: "+905551112233" }
        })
      ).rejects.toThrow(/VEKALET_TEXT_MISSING/);

      // 2) [TASLIK] vekalet_text -> salesOpen = false va buyurtma 400 beradi
      await updateKurbanSeasonByAdmin(adminActor, {
        year: 2027,
        isActive: true,
        vekaletText: {
          tr: "[TASLIK] Vekalet metni",
          uz: "[TASLIK] Vekalet matni",
          en: "[TASLIK] Proxy text",
          ar: "[TASLIK] نص التوكيل"
        }
      });
      const taslikVekaletCatalog = await getPublicKurbanCatalog("tr");
      expect(taslikVekaletCatalog.vekaletText).toBe("");
      expect(taslikVekaletCatalog.salesOpen).toBe(false);
    } finally {
      await dbQuery(
        `UPDATE kurban_seasons SET is_active = FALSE, vekalet_text = '{"tr":"","uz":"","en":"","ar":""}'::jsonb WHERE year = 2027`
      );
      await dbQuery(`UPDATE kurban_offers SET price_per_share_try = 0, quota_shares = 0, sold_shares = 0, is_active = FALSE`);
      await dbQuery(`UPDATE kurban_countries SET is_active = FALSE`);
    }
  });

  it("4-band: DONATIONS_LIVE=false da har qanday xayriya (hatto isTestOverride=false va Bank CSV import ham) is_test=true bo'ladi", async () => {
    process.env.DONATIONS_LIVE = "false";

    const ord = await createDonationOrder({
      originHost: "ezanvakfi.org",
      locale: "tr",
      frequency: "one_time",
      isTestOverride: false,
      items: [{ campaignSlug: "genel-bagis", amount: 250 }],
      donor: { fullName: "Test Override Check", kvkkConsent: true }
    });
    expect(ord.donation.is_test).toBe(true);

    // Bank CSV import ham DONATIONS_LIVE=false da is_test=true yozishi shart
    process.env.BANK_IMPORT_ENABLED = "true";
    try {
      const code = await generateBankTransferCode({
        donorName: "Bank Test",
        donorEmail: "banktest@example.com",
        campaignSlug: "genel-bagis"
      });
      const txDesc = `Bagis ref ${code} fix5-${Date.now()}`;
      const imp = await importBankStatementCsvRows([
        { txDate: "2027-02-20", amountTry: 1000, senderName: "Bank Test", description: txDesc }
      ]);
      expect(imp.autoMatched).toBe(1);

      const bankDon = await dbQuery<{ is_test: boolean }>(
        `SELECT is_test FROM donations WHERE provider = 'bank_eft' ORDER BY id DESC LIMIT 1`
      );
      expect(bankDon.rows[0]?.is_test).toBe(true);
    } finally {
      process.env.BANK_IMPORT_ENABLED = "false";
    }
  });

  it("5-band: 4-bosqichning barcha 10 ta bayrog'i sukut bo'yicha false (404 / yopiq) va true qilinganda ishlaydi", async () => {
    const flagsDefault = getGrowthFeatureFlags();
    expect(flagsDefault.RECURRING_ENABLED).toBe(false);
    expect(flagsDefault.RAMADAN_AUTOPAY_ENABLED).toBe(false);
    expect(flagsDefault.P2P_ENABLED).toBe(false);
    expect(flagsDefault.GIFT_ENABLED).toBe(false);
    expect(flagsDefault.NAMED_PROJECTS_ENABLED).toBe(false);
    expect(flagsDefault.NEWSLETTER_ENABLED).toBe(false);
    expect(flagsDefault.BANK_IMPORT_ENABLED).toBe(false);
    expect(flagsDefault.INSTAGRAM_ENABLED).toBe(false);
    expect(flagsDefault.API_V1_ENABLED).toBe(false);
    expect(flagsDefault.AB_TESTS_ENABLED).toBe(false);

    // 1. RECURRING_ENABLED: false -> 404, true -> works
    await expect(
      createRecurringSubscription({
        donorName: "Test",
        campaignSlug: "genel-bagis",
        amountTry: 250,
        billingDay: 1
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    process.env.RECURRING_ENABLED = "true";
    const sub = await createRecurringSubscription({
      donorName: "Test",
      campaignSlug: "genel-bagis",
      amountTry: 250,
      billingDay: 1
    });
    expect(sub.status).toBe("active");
    process.env.RECURRING_ENABLED = "false";

    // 2. RAMADAN_AUTOPAY_ENABLED: false -> 404, true -> works
    await expect(
      createRamadanAutopayPlan({
        donorName: "Test",
        campaignSlug: "genel-bagis",
        nightlyAmountTry: 100
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    process.env.RAMADAN_AUTOPAY_ENABLED = "true";
    const plan = await createRamadanAutopayPlan({
      donorName: "Test",
      campaignSlug: "genel-bagis",
      nightlyAmountTry: 100
    });
    expect(plan.nights_schedule).toHaveLength(30);
    process.env.RAMADAN_AUTOPAY_ENABLED = "false";

    // 3. P2P_ENABLED: false -> 404, true -> works
    await expect(
      createP2pCampaign({
        slug: `p2p-fix5-${Date.now()}`,
        ownerName: "Test",
        targetCampaignSlug: "genel-bagis",
        title: { tr: "T", uz: "T", en: "T", ar: "T" },
        story: { tr: "S", uz: "S", en: "S", ar: "S" },
        goalAmountTry: 5000
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    process.env.P2P_ENABLED = "true";
    const p2p = await createP2pCampaign({
      slug: `p2p-fix5-${Date.now()}`,
      ownerName: "Test",
      targetCampaignSlug: "genel-bagis",
      title: { tr: "T", uz: "T", en: "T", ar: "T" },
      story: { tr: "S", uz: "S", en: "S", ar: "S" },
      goalAmountTry: 5000
    });
    expect(p2p.status).toBe("pending_review");
    process.env.P2P_ENABLED = "false";

    // 4. GIFT_ENABLED: false -> 404 (service + /api/og?type=gift), true -> works
    await expect(
      createGiftDonationCard({
        occasion: "eid",
        senderName: "A",
        recipientName: "B",
        locale: "tr"
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    const ogResFalse = await ogGet(new NextRequest("https://ezanvakfi.org/api/og?type=gift&title=Test"));
    expect(ogResFalse.status).toBe(404);
    process.env.GIFT_ENABLED = "true";
    const gift = await createGiftDonationCard({
      occasion: "eid",
      senderName: "A",
      recipientName: "B",
      locale: "tr"
    });
    expect(gift.eCardUrl).toContain("/bagis/hediye/");
    const ogResTrue = await ogGet(new NextRequest("https://ezanvakfi.org/api/og?type=gift&title=Test"));
    expect(ogResTrue.status).toBe(200);
    process.env.GIFT_ENABLED = "false";

    // 5. NAMED_PROJECTS_ENABLED: false -> 404, true -> works
    await expect(
      createOrUpdateNamedProject({
        code: `NP-${Date.now()}`,
        category: "bookshelf",
        dedicationName: "Test",
        targetAmountTry: 10000,
        title: { tr: "T", uz: "T", en: "T", ar: "T" }
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    process.env.NAMED_PROJECTS_ENABLED = "true";
    const np = await createOrUpdateNamedProject({
      code: `NP-${Date.now()}`,
      category: "bookshelf",
      dedicationName: "Test",
      targetAmountTry: 10000,
      title: { tr: "T", uz: "T", en: "T", ar: "T" }
    });
    expect(np.stage).toBe("collecting");
    process.env.NAMED_PROJECTS_ENABLED = "false";

    // 6. NEWSLETTER_ENABLED: false -> 404 (service + /api/contact kind=newsletter), true -> works
    await expect(
      subscribeNewsletterDoubleOptIn({
        email: `nl_${Date.now()}@example.com`,
        locale: "tr",
        interests: ["egitim"]
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    const nlApiFalse = await contactPost(
      new NextRequest("https://ezanvakfi.org/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "newsletter", email: "nl@example.com", turnstileToken: "dev-turnstile-ok" })
      })
    );
    expect(nlApiFalse.status).toBe(404);
    process.env.NEWSLETTER_ENABLED = "true";
    const nl = await subscribeNewsletterDoubleOptIn({
      email: `nl_${Date.now()}@example.com`,
      locale: "tr",
      interests: ["egitim"]
    });
    expect(nl.status).toBe("pending_confirm");
    process.env.NEWSLETTER_ENABLED = "false";

    // 7. BANK_IMPORT_ENABLED: false -> 404, true -> works
    await expect(
      generateBankTransferCode({ campaignSlug: "genel-bagis" })
    ).rejects.toMatchObject({ statusCode: 404 });
    process.env.BANK_IMPORT_ENABLED = "true";
    const bCode = await generateBankTransferCode({ campaignSlug: "genel-bagis" });
    expect(bCode).toMatch(/^EZ/);
    process.env.BANK_IMPORT_ENABLED = "false";

    // 8. INSTAGRAM_ENABLED: false -> 404, true -> works
    await expect(syncInstagramPostsCache([])).rejects.toMatchObject({ statusCode: 404 });
    process.env.INSTAGRAM_ENABLED = "true";
    const igRows = await syncInstagramPostsCache([]);
    expect(Array.isArray(igRows)).toBe(true);
    process.env.INSTAGRAM_ENABLED = "false";

    // 9. API_V1_ENABLED: false -> 404 (service + /api/v1/campaigns), true -> 200
    expect(() => getOpenApiV1Spec()).toThrow(/API_V1_ENABLED=false/);
    const v1False = await v1CampaignsGet(new NextRequest("https://ezanvakfi.org/api/v1/campaigns"));
    expect(v1False.status).toBe(404);
    process.env.API_V1_ENABLED = "true";
    const v1True = await v1CampaignsGet(new NextRequest("https://ezanvakfi.org/api/v1/campaigns"));
    expect(v1True.status).toBe(200);
    process.env.API_V1_ENABLED = "false";

    // 10. AB_TESTS_ENABLED: false -> 404, true -> works
    expect(() => assignAbTestPresetVariant("seed-1")).toThrow(/AB_TESTS_ENABLED=false/);
    process.env.AB_TESTS_ENABLED = "true";
    const ab = assignAbTestPresetVariant("seed-1");
    expect(["A", "B"]).toContain(ab.variant);
    process.env.AB_TESTS_ENABLED = "false";
  });
});
