import { dbQuery, ensureSchema } from "../db/schema";
import { Locale } from "../i18n/country-locale";
import { isAdminIpAllowed, verifyCloudflareAccessJwt } from "../lib/security";

export type CmsRole = "admin" | "editor" | "translator" | "finance";

export const PAYLOAD_COLLECTIONS = [
  { slug: "pages", label: "Sayfalar (Pages)", localized: true, supportsDraft: true, supportsVersions: true },
  { slug: "projects", label: "Projeler ve Faaliyetler", localized: true, supportsDraft: true, supportsVersions: true },
  { slug: "campaigns", label: "Bağış Kampanyaları", localized: true, supportsDraft: true, supportsVersions: true },
  { slug: "news", label: "Haberler ve Duyurular", localized: true, supportsDraft: true, supportsVersions: true },
  { slug: "videos", label: "Videolar (YouTube Lite)", localized: true, supportsDraft: false, supportsVersions: false },
  { slug: "reports", label: "Şeffaflık Raporları (PDF)", localized: true, supportsDraft: false, supportsVersions: false },
  { slug: "faqs", label: "Sıkça Sorulan Sorular", localized: true, supportsDraft: false, supportsVersions: false },
  { slug: "team", label: "Yönetim Kurulu ve Ekip", localized: true, supportsDraft: false, supportsVersions: false },
  { slug: "media", label: "Medya (Alt Metin Zorunlu)", localized: true, supportsDraft: false, supportsVersions: false },
  { slug: "qurbanCountries", label: "Kurban Ülkeleri (2. Aşama)", localized: true, supportsDraft: false, supportsVersions: false },
  { slug: "qurbanPrices", label: "Kurban Hisse Fiyatları (2. Aşama)", localized: true, supportsDraft: false, supportsVersions: false },
  { slug: "siteSettings", label: "Site Ayarları (Global)", localized: true, supportsDraft: false, supportsVersions: true }
] as const;

export function canRolePerform(role: CmsRole, action: "read" | "edit_content" | "edit_translation" | "view_donations" | "manage_settings"): boolean {
  if (role === "admin") return true;
  if (role === "editor") {
    return action === "read" || action === "edit_content" || action === "edit_translation";
  }
  if (role === "translator") {
    return action === "read" || action === "edit_translation";
  }
  if (role === "finance") {
    return action === "read" || action === "view_donations";
  }
  return false;
}

/**
 * Admin tarmoq / Cloudflare Access qatlami:
 * - IP faqat `cf-connecting-ip` dan olinadi va faqat `peerIp` Cloudflare CIDR diapazonidan kelgan bo'lsa ishoniladi;
 * - IP bo'lmasa, rad etiladi (`false`);
 * - Cloudflare Access ishlatilsa, JWT imzosi team domenining JWKS'i bilan tekshiriladi.
 */
export async function verifyAdminNetworkLayer(params: {
  cfConnectingIp?: string | null;
  peerIp?: string | null;
  cfAccessJwt?: string | null;
  jwksKeysOverride?: any[];
}): Promise<{ allowed: boolean; reason?: string }> {
  const ipOk = isAdminIpAllowed({
    cfConnectingIp: params.cfConnectingIp,
    peerIp: params.peerIp
  });

  if (!ipOk) {
    return { allowed: false, reason: "Untrusted peer IP or client IP not in ADMIN_ALLOWED_IPS" };
  }

  if (process.env.ADMIN_REQUIRE_CF_ACCESS === "true" || params.cfAccessJwt) {
    const jwtCheck = await verifyCloudflareAccessJwt(params.cfAccessJwt, {
      jwksKeysOverride: params.jwksKeysOverride
    });
    if (!jwtCheck.valid) {
      return { allowed: false, reason: jwtCheck.error || "Cloudflare Access JWT invalid" };
    }
  }

  return { allowed: true };
}

let schemaEnsured = false;
async function ensureCmsSchemaOnly() {
  if (!schemaEnsured) {
    await ensureSchema();
    schemaEnsured = true;
  }
}

export function pickLocalized(field: Record<string, string> | null | undefined, locale: Locale): string {
  if (!field || typeof field !== "object") return "";
  return field[locale] || field.tr || field.en || field.uz || "";
}

export async function getPublicSiteData(locale: Locale) {
  await ensureCmsSchemaOnly();

  const [settingsRes, campaignsRes, projectsRes, newsRes, videosRes, faqsRes, qurbanRes] = await Promise.all([
    dbQuery(`SELECT value FROM cms_site_settings WHERE key = 'siteSettings' LIMIT 1`),
    dbQuery(`SELECT * FROM cms_campaigns WHERE status = 'published' ORDER BY id ASC`),
    dbQuery(`SELECT * FROM cms_projects WHERE status = 'published' ORDER BY id ASC`),
    dbQuery(`SELECT * FROM cms_news WHERE status = 'published' ORDER BY published_at DESC, id DESC`),
    dbQuery(`SELECT * FROM cms_videos ORDER BY id ASC`),
    dbQuery(`SELECT * FROM cms_faqs ORDER BY sort_order ASC, id ASC`),
    dbQuery(`SELECT * FROM cms_qurban_countries ORDER BY id ASC`)
  ]);

  const rawSettings = settingsRes.rows[0]?.value || {};
  const socialLinks = rawSettings.socialLinks || {};
  const activeSocials = Object.entries(socialLinks).filter(
    ([, url]) => typeof url === "string" && url.trim().length > 0
  ) as [string, string][];

  return {
    settings: {
      foundationName: pickLocalized(rawSettings.foundationName, locale) || "Ezan Vakfı",
      contact: rawSettings.contact || {},
      bankAccounts: Array.isArray(rawSettings.bankAccounts) ? rawSettings.bankAccounts : [],
      activeSocials,
      stats: Array.isArray(rawSettings.stats) ? rawSettings.stats : [],
      announcement: rawSettings.announcementBanner?.enabled
        ? pickLocalized(rawSettings.announcementBanner.text, locale)
        : ""
    },
    campaigns: campaignsRes.rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      purposeCode: c.purpose_code,
      restricted: Boolean(c.restricted),
      currency: c.currency || "TRY",
      targetAmount: Number(c.target_amount || 0),
      collectedAmount: Number(c.collected_amount || 0),
      presetAmounts: Array.isArray(c.preset_amounts) ? c.preset_amounts : [250, 500, 1000, 2500],
      title: pickLocalized(c.title, locale),
      summary: pickLocalized(c.summary, locale),
      description: pickLocalized(c.description, locale),
      needsReview: Boolean(c.needs_review?.[locale])
    })),
    projects: projectsRes.rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      category: p.category,
      projectStatus: p.project_status,
      locationName: p.location_name || "",
      title: pickLocalized(p.title, locale),
      summary: pickLocalized(p.summary, locale),
      needsReview: Boolean(p.needs_review?.[locale])
    })),
    news: newsRes.rows.map((n) => ({
      id: n.id,
      slug: n.slug,
      category: n.category,
      publishedAt: new Date(n.published_at).toISOString().slice(0, 10),
      title: pickLocalized(n.title, locale),
      excerpt: pickLocalized(n.excerpt, locale),
      needsReview: Boolean(n.needs_review?.[locale])
    })),
    videos: videosRes.rows.map((v) => ({
      id: v.id,
      youtubeId: v.youtube_id,
      category: v.category,
      projectSlug: v.project_slug,
      title: pickLocalized(v.title, locale),
      needsReview: Boolean(v.needs_review?.[locale])
    })),
    faqs: faqsRes.rows.map((f) => ({
      id: f.id,
      category: f.category,
      question: pickLocalized(f.question, locale),
      answer: pickLocalized(f.answer, locale)
    })),
    qurbanCountries: qurbanRes.rows.map((q) => ({
      code: q.code,
      active: Boolean(q.active,
      ),
      name: pickLocalized(q.name, locale)
    }))
  };
}
