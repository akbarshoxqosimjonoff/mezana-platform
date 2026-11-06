import { describe, it, expect, beforeAll } from "vitest";
import { ensureSchema, dbQuery } from "../src/db/schema";
import { runKatalogMediaImport } from "../scripts/import-katalog-media";
import {
  CATALOG_HADITHS_AND_QUOTES,
  CATALOG_PROJECTS,
  seedCatalogContentIntoCms,
  getPublicProjectHeroImage,
  getHomepageCatalogNumbers,
  hasCyrillicCharacters
} from "../src/cms/katalog-seed";
import { LEGACY_301_REDIRECTS } from "../src/middleware";

describe("Phase 5 — Real Catalog Media & 4-Locale Verbatim Content Import", () => {
  beforeAll(async () => {
    await ensureSchema();
  });

  it("1. Katalog media import skripti 55 ta faylni (62 - 7 arxiv) yuklaydi va ikkinchi marta ishga tushganda dublikat yaratmaydi (idempotent)", async () => {
    await dbQuery(`DELETE FROM cms_media WHERE file_key IS NOT NULL`);

    const firstRun = await runKatalogMediaImport({
      sourceRootDir: "/tmp/katalog_inspect/ezan-katalog"
    });
    expect(firstRun.totalInManifest).toBe(62);
    expect(firstRun.skippedArxivCount).toBe(7);
    expect(firstRun.insertedCount).toBe(55);

    // Ikkinchi marta ishga tushirish -> 0 ta yangi yozuv
    const secondRun = await runKatalogMediaImport({
      sourceRootDir: "/tmp/katalog_inspect/ezan-katalog"
    });
    expect(secondRun.insertedCount).toBe(0);
    expect(secondRun.skippedExistingCount).toBe(55);

    // Arxivdagi 7 ta skrinshot bazaga tushmaganini tekshirish
    const arxivCheck = await dbQuery(`SELECT * FROM cms_media WHERE file_key LIKE 'rasmlar/arxiv/%'`);
    expect(arxivCheck.rowCount).toBe(0);

    // usulus-sunan-kitaplari.jpg pastki 8% qismi kesilganini tekshirish (602 -> 553)
    const usulusRes = await dbQuery<{ width: number; height: number }>(
      `SELECT width, height FROM cms_media WHERE file_key = 'rasmlar/yayincilik/usulus-sunan-kitaplari.jpg'`
    );
    expect(usulusRes.rows[0]?.height).toBe(Math.floor(602 * 0.92));
  }, 60_000);

  it("2. Bolalar qatnashgan 2 ta fotoda consent_verified=false bo'lishini va production'da kuran-kursu hero avtomatik almashishini tekshiradi", async () => {
    const kidsRes = await dbQuery<{ file_key: string; consent_verified: boolean }>(
      `SELECT file_key, consent_verified FROM cms_media WHERE consent_verified = FALSE ORDER BY file_key ASC`
    );
    expect(kidsRes.rows.map((r) => r.file_key)).toEqual([
      "rasmlar/egitim/kuran-kursu-cocuklar.jpg",
      "rasmlar/yardim/mezana-konteyner-cocuklar.jpg"
    ]);

    const prodHero = await getPublicProjectHeroImage("kuran-kursu", "production");
    expect(prodHero).not.toContain("kuran-kursu-cocuklar");
    expect(prodHero).toContain("mushaf-okuyan-talebe");

    // Alt matnlarda tasdiqlanmagan shaxs ismlari yo'qligini tekshirish
    const baskanMedia = await dbQuery<{ alt_text: Record<string, string> }>(
      `SELECT alt_text FROM cms_media WHERE file_key = 'rasmlar/hakkimizda/mutevelli-heyet-baskani.jpg'`
    );
    expect(JSON.stringify(baskanMedia.rows[0]?.alt_text)).not.toContain("Mübeşşir");
  });

  it("3. 10 ta stok rasm is_stock=true bo'lishini va hech bir loyiha galereyasiga ('gallery') kirmasligini tekshiradi", async () => {
    const stockRes = await dbQuery<{ file_key: string }>(
      `SELECT file_key FROM cms_media WHERE is_stock = TRUE`
    );
    expect(stockRes.rowCount).toBe(10);
    const stockKeys = new Set(stockRes.rows.map((r) => r.file_key));

    for (const proj of CATALOG_PROJECTS) {
      for (const gKey of proj.galleryImageKeys) {
        expect(stockKeys.has(gKey)).toBe(false);
      }
    }
  });

  it("4. 11 ta katalog loyihasi (10 davom etmoqda + 1 planlanan), sahifalar, rahbariyat va hadislarni seed qiladi hamda kirill harflari yo'qligini tekshiradi", async () => {
    const res = await seedCatalogContentIntoCms();
    expect(res.upsertedProjects).toBe(11);
    expect(res.activeProjectsCount).toBe(10);
    expect(res.plannedProjectsCount).toBe(1);

    // 1-bosqichdagi eski namunaviy loyihalar 'draft' holatiga o'tgan bo'lishi shart
    const oldDrafts = await dbQuery<{ slug: string; status: string }>(
      `SELECT slug, status FROM cms_projects WHERE slug IN ('istanbul-ogrenci-yurdu', 'turkistan-egitim-merkezi', 'dijital-kutuphane')`
    );
    for (const row of oldDrafts.rows) {
      expect(row.status).toBe("draft");
    }

    // 301 redirectlar
    expect(LEGACY_301_REDIRECTS["/tr/faaliyetler/istanbul-ogrenci-yurdu"]).toBe("/tr/faaliyetler/talebe-yurdu");
    expect(LEGACY_301_REDIRECTS["/tr/faaliyetler/turkistan-egitim-merkezi"]).toBe("/tr/faaliyetler/mezana-akademisi");
    expect(LEGACY_301_REDIRECTS["/tr/faaliyetler/dijital-kutuphane"]).toBe("/tr/faaliyetler/yayincilik");

    // Gelecek planlarımız loyihasi 'planlanan' ekanini va 'Rakamlarla Vakfımız' ga qo'shilmaganini tekshirish
    const gelecek = await dbQuery<{ project_state: string; stats_badge: any }>(
      `SELECT project_state, stats_badge FROM cms_projects WHERE slug = 'gelecek-planlarimiz'`
    );
    expect(gelecek.rows[0]?.project_state).toBe("planlanan");
    expect(gelecek.rows[0]?.stats_badge?.isPlannedTarget).toBe(true);

    const homeNums = getHomepageCatalogNumbers();
    expect(homeNums.currentStats.source).toBe("katalog-2026");
    expect(homeNums.currentStats.badgeLabel.tr).toBe("Katalog verisi");
    const currentKeys = homeNums.currentStats.items.map((i) => i.key);
    expect(currentKeys).not.toContain("planned_iftar");
    expect(currentKeys).not.toContain("planned_gida");
    expect(homeNums.plannedTargets.isPlannedTarget).toBe(true);

    // O'zbek lotin yozuvi tekshiruvi: 0 ta kirill harfi!
    for (const proj of CATALOG_PROJECTS) {
      expect(hasCyrillicCharacters(proj.title.uz)).toBe(false);
      expect(hasCyrillicCharacters(proj.summary.uz)).toBe(false);
      expect(hasCyrillicCharacters(proj.bodyUz)).toBe(false);
    }
    for (const q of CATALOG_HADITHS_AND_QUOTES) {
      expect(hasCyrillicCharacters(q.text.uz)).toBe(false);
      expect(q.arabicOriginal).toBeNull();
    }

    // "Bir oğul eğitirsen..." iqtibosi hadis emas ('quote') ekanini tekshirish
    const kizQuote = CATALOG_HADITHS_AND_QUOTES.find((q) => q.id === "bir-kiz-egitirsen-milleti-egitirsin");
    expect(kizQuote?.type).toBe("quote");
  });
});
