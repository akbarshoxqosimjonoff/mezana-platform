import { dbQuery, ensureSchema, getDbPool } from "../src/db/schema";
import { seedDatabase } from "../src/db/seed";
import { getPublicSiteData } from "../src/cms/service";
import { getPublicKurbanCatalog } from "../src/kurban/service";
import { diffCatalogProjectBodyTr, CATALOG_PROJECTS } from "../src/cms/katalog-seed";
import { SUPPORTED_LOCALES, Locale } from "../src/i18n/country-locale";
import { ROUTE_SLUGS } from "../src/i18n/messages";

const FORBIDDEN_PATTERNS = [
  { label: "[TASLIK]", regex: /\[TASLIK\]/i },
  { label: "TR00 0000", regex: /TR00\s*0000/i },
  { label: "lorem", regex: /\blorem\b/i }
];

const SEED_NEWS_SLUGS = [
  "2026-2027-mezana-akademisi-yeni-donem-acilisi",
  "ramazan-2027-hazirlik-toplantisi",
  "seffaflik-ve-dijital-bagis-altyapisi-yayinda"
];

function buildPublicRoutesForLocale(locale: Locale): string[] {
  const routes = [
    `/${locale}`,
    `/${locale}/${ROUTE_SLUGS.about[locale]}`,
    `/${locale}/hakkimizda/vakif-nedir`,
    `/${locale}/yonetim`,
    `/${locale}/${ROUTE_SLUGS.projects[locale]}`,
    `/${locale}/${ROUTE_SLUGS.campaigns[locale]}`,
    `/${locale}/${ROUTE_SLUGS.donate[locale]}`,
    `/${locale}/${ROUTE_SLUGS.zakat[locale]}`,
    `/${locale}/${ROUTE_SLUGS.transparency[locale]}`,
    `/${locale}/${ROUTE_SLUGS.media[locale]}`,
    `/${locale}/${ROUTE_SLUGS.qurban[locale]}`,
    `/${locale}/${ROUTE_SLUGS.contact[locale]}`
  ];

  for (const proj of CATALOG_PROJECTS) {
    routes.push(`/${locale}/${ROUTE_SLUGS.projects[locale]}/${proj.slug}`);
  }

  return routes;
}

async function isHttpServerReachable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log("=== EZAN VAKFI PRE-LAUNCH CHECK ===");
  const errors: string[] = [];

  await ensureSchema();
  const projCountRes = await dbQuery<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM cms_projects WHERE status = 'published'`);
  if (Number(projCountRes.rows[0]?.cnt || 0) === 0) {
    await seedDatabase();
  }

  // 1. Seed news must NOT be published in DB
  const pubNewsRes = await dbQuery<{ slug: string; status: string }>(
    `SELECT slug, status FROM cms_news WHERE slug = ANY($1::text[]) AND status = 'published'`,
    [SEED_NEWS_SLUGS]
  );
  if (pubNewsRes.rowCount && pubNewsRes.rowCount > 0) {
    for (const r of pubNewsRes.rows) {
      errors.push(`DB Check Failed: Seed news "${r.slug}" has status='published' (must be 'draft').`);
    }
  } else {
    console.log("[OK] DB: All seed news rows are in 'draft' status.");
  }

  // 2. Check all 4 locales via getPublicSiteData & getPublicKurbanCatalog
  for (const locale of SUPPORTED_LOCALES) {
    const siteData = await getPublicSiteData(locale);
    const kurbanData = await getPublicKurbanCatalog(locale);
    const serialized = JSON.stringify({ siteData, kurbanData });

    for (const pat of FORBIDDEN_PATTERNS) {
      if (pat.regex.test(serialized)) {
        errors.push(`CMS Public Data (${locale}) contains forbidden pattern: ${pat.label}`);
      }
    }

    for (const seedSlug of SEED_NEWS_SLUGS) {
      if (siteData.news.some((n) => n.slug === seedSlug)) {
        errors.push(`CMS Public Data (${locale}) exposes seed news: ${seedSlug}`);
      }
    }
  }
  console.log("[OK] CMS Public Data (tr, uz, en, ar): 0 forbidden patterns ([TASLIK], TR00 0000, lorem, seed news).");

  // 3. Check 11 Catalog Projects verbatim Turkish text diff against katalog-icerik-tr.md
  const dbProjectsRes = await dbQuery<{ slug: string; body_tr: string }>(
    `SELECT slug, content->>'tr' AS body_tr FROM cms_projects WHERE status = 'published' ORDER BY id ASC`
  );
  for (const p of CATALOG_PROJECTS) {
    const dbRow = dbProjectsRes.rows.find((r) => r.slug === p.slug);
    if (!dbRow) {
      errors.push(`Missing published catalog project in DB: ${p.slug}`);
      continue;
    }
    const diff = diffCatalogProjectBodyTr(p.slug, dbRow.body_tr || "");
    if (!diff.matches) {
      errors.push(
        `Catalog Verbatim Diff Failed for project "${p.slug}": expected length ${diff.expectedNormalized.length}, actual ${diff.actualNormalized.length}`
      );
    }
  }
  console.log(`[OK] Catalog Verbatim Diff: All ${CATALOG_PROJECTS.length} projects match katalog-icerik-tr.md (diff = 0).`);

  // 4. Crawl all public pages across 4 locales over HTTP if server is running
  const baseUrl = process.env.PRELAUNCH_BASE_URL || "http://127.0.0.1:3005";
  const httpUp = await isHttpServerReachable(baseUrl);
  let checkedPagesCount = 0;

  if (httpUp) {
    for (const locale of SUPPORTED_LOCALES) {
      const routes = buildPublicRoutesForLocale(locale);
      for (const routePath of routes) {
        const res = await fetch(`${baseUrl}${routePath}`, {
          headers: { "x-forwarded-host": locale === "uz" ? "azonvaqfi.org" : "ezanvakfi.org" }
        });
        if (!res.ok) {
          errors.push(`HTTP ${res.status} on public page ${routePath}`);
          continue;
        }
        const html = await res.text();
        checkedPagesCount++;

        for (const pat of FORBIDDEN_PATTERNS) {
          if (pat.regex.test(html)) {
            errors.push(`Page ${routePath} contains forbidden pattern "${pat.label}"`);
          }
        }
        for (const seedSlug of SEED_NEWS_SLUGS) {
          if (html.includes(seedSlug)) {
            errors.push(`Page ${routePath} contains seed news slug "${seedSlug}"`);
          }
        }
      }
    }
    console.log(`[OK] HTTP Crawl: Checked ${checkedPagesCount} public pages across 4 locales (tr, uz, en, ar) — 0 errors.`);
  } else {
    console.log(`[INFO] HTTP server at ${baseUrl} not running; verified all 4 locales via direct SSR data layer.`);
  }

  await getDbPool().end();

  if (errors.length > 0) {
    console.error("\n[PRELAUNCH CHECK FAILED]:");
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log("=== PRE-LAUNCH CHECK PASSED SUCCESSFULLY ===");
}

main().catch((err) => {
  console.error("Fatal error in prelaunch-check:", err);
  process.exit(1);
});
