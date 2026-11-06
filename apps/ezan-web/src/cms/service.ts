import { z } from "zod";
import { dbQuery, ensureSchema } from "../db/schema";
import { Locale } from "../i18n/country-locale";
import { isAdminIpAllowed, verifyCloudflareAccessJwt } from "../lib/security";

export type CmsRole = "admin" | "editor" | "translator" | "finance" | "field";

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
  { slug: "kurbanSeasons", label: "Kurban Sezonu ve Tarihleri (2. Aşama)", localized: true, supportsDraft: false, supportsVersions: true },
  { slug: "siteSettings", label: "Site Ayarları (Global)", localized: true, supportsDraft: false, supportsVersions: true }
] as const;

let cachedPayloadInstance: any = null;
export async function getPayloadRuntimeInstance() {
  if (!cachedPayloadInstance) {
    const [{ getPayload }, { default: payloadConfig }] = await Promise.all([
      import("payload"),
      import("../payload.config")
    ]);
    cachedPayloadInstance = await getPayload({ config: payloadConfig });
  }
  return cachedPayloadInstance;
}

export function canRolePerform(
  role: CmsRole,
  action: "read" | "edit_content" | "edit_translation" | "view_donations" | "manage_settings" | "dala_upload"
): boolean {
  if (role === "field") {
    // Dala jamoasi (field) faqat qurbonlik ro'yxati va video yuklashga kira oladi, boshqa hech narsaga kira olmaydi
    return action === "dala_upload";
  }
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

export function containsTaslikOrFakeData(val: unknown): boolean {
  if (!val) return false;
  const str = typeof val === "string" ? val : JSON.stringify(val);
  return /\[TASLIK\]|TR00\s*0000|lorem\s+ipsum/i.test(str);
}

export function sanitizePublicField(str: string | null | undefined): string {
  if (!str || typeof str !== "string") return "";
  if (containsTaslikOrFakeData(str)) return "";
  return str.trim();
}

export function pickLocalized(field: Record<string, string> | null | undefined, locale: Locale): string {
  if (!field || typeof field !== "object") return "";
  const raw = field[locale] || field.tr || field.en || field.uz || "";
  return sanitizePublicField(raw);
}

export async function getPublicSiteData(locale: Locale) {
  await ensureCmsSchemaOnly();

  const [
    settingsRes,
    campaignsRes,
    projectsRes,
    newsRes,
    videosRes,
    faqsRes,
    qurbanRes,
    pagesRes,
    teamRes,
    ramadanRes,
    mediaRes
  ] = await Promise.all([
    dbQuery(`SELECT key, value FROM cms_site_settings WHERE key IN ('siteSettings', 'catalog_quotes', 'homepage_catalog_numbers')`),
    dbQuery(`SELECT * FROM cms_campaigns WHERE status = 'published' ORDER BY id ASC`),
    dbQuery(`SELECT * FROM cms_projects WHERE status = 'published' ORDER BY id ASC`),
    dbQuery(`SELECT * FROM cms_news WHERE status = 'published' ORDER BY published_at DESC, id DESC`),
    dbQuery(`SELECT * FROM cms_videos WHERE status = 'published' ORDER BY id ASC`),
    dbQuery(`SELECT * FROM cms_faqs ORDER BY sort_order ASC, id ASC`),
    dbQuery(`SELECT * FROM kurban_countries ORDER BY id ASC`),
    dbQuery(`SELECT * FROM cms_pages WHERE status = 'published' ORDER BY id ASC`),
    dbQuery(`SELECT * FROM cms_team ORDER BY sort_order ASC, id ASC`),
    dbQuery(`SELECT * FROM cms_ramadan_settings WHERE year = 2027 LIMIT 1`),
    dbQuery(`SELECT file_key, file_url, consent_verified FROM cms_media`)
  ]);

  const mediaUrlMap = new Map<string, { fileUrl: string; consentVerified: boolean }>();
  for (const m of mediaRes.rows) {
    mediaUrlMap.set(m.file_key, { fileUrl: m.file_url, consentVerified: Boolean(m.consent_verified) });
  }
  const resolveCatalogMediaUrl = (fileKey: string): string => {
    if (
      !fileKey ||
      fileKey === "rasmlar/egitim/kuran-kursu-cocuklar.jpg" ||
      fileKey === "rasmlar/yardim/mezana-konteyner-cocuklar.jpg"
    ) {
      return "/media/katalog/egitim/mushaf-okuyan-talebe-800.webp";
    }
    const found = mediaUrlMap.get(fileKey);
    if (found) {
      if (!found.consentVerified) {
        return "/media/katalog/egitim/mushaf-okuyan-talebe-800.webp";
      }
      if (found.fileUrl) {
        return found.fileUrl;
      }
    }
    const rel = fileKey.replace(/^rasmlar\//, "");
    const dot = rel.lastIndexOf(".");
    if (dot > 0) {
      const stem = rel.slice(0, dot);
      const size =
        stem.endsWith("azon-studyo-roportaj") || stem.endsWith("kadin-medresesi-talebeler")
          ? "480"
          : "800";
      return `/media/katalog/${stem}-${size}.webp`;
    }
    return "/media/katalog/egitim/sinav-salonu-genis-800.webp";
  };

  const settingsMap = new Map<string, any>();
  for (const row of settingsRes.rows) {
    settingsMap.set(row.key, row.value);
  }

  const rawSettings = settingsMap.get("siteSettings") || {};
  const rawQuotes = Array.isArray(settingsMap.get("catalog_quotes")) ? settingsMap.get("catalog_quotes") : [];
  const rawHomepageNumbers = settingsMap.get("homepage_catalog_numbers") || null;
  const rawCurrentStatsObj = rawHomepageNumbers?.currentStats || rawHomepageNumbers?.vakfimizRakamlarla || null;
  const ramadanRow = ramadanRes.rows[0] || null;
  const fitreReady = ramadanRow && ramadanRow.fitre_amount_try != null && Number(ramadanRow.fitre_amount_try) > 0;

  const socialLinks = rawSettings.socialLinks || {};
  const activeSocials = Object.entries(socialLinks).filter(
    ([, url]) => typeof url === "string" && url.trim().length > 0 && !containsTaslikOrFakeData(url)
  ) as [string, string][];

  const rawContact = rawSettings.contact || {};
  const cleanContact = {
    address: sanitizePublicField(rawContact.address),
    phone: sanitizePublicField(rawContact.phone),
    email: sanitizePublicField(rawContact.email),
    whatsapp: sanitizePublicField(rawContact.whatsapp),
    mapEmbedUrl: sanitizePublicField(rawContact.mapEmbedUrl)
  };

  const cleanBankAccounts = (Array.isArray(rawSettings.bankAccounts) ? rawSettings.bankAccounts : []).filter(
    (b: any) =>
      b &&
      sanitizePublicField(b.iban) &&
      sanitizePublicField(b.bankName) &&
      !containsTaslikOrFakeData(b)
  );

  const cleanStats = (Array.isArray(rawSettings.stats) ? rawSettings.stats : []).filter(
    (st: any) => st && !containsTaslikOrFakeData(st)
  );

  const announcementText = rawSettings.announcementBanner?.enabled
    ? pickLocalized(rawSettings.announcementBanner.text, locale)
    : "";

  return {
    settings: {
      foundationName: pickLocalized(rawSettings.foundationName, locale) || "Ezan Vakfı",
      contact: cleanContact,
      bankAccounts: cleanBankAccounts,
      activeSocials,
      stats: cleanStats,
      announcement: announcementText,
      homepageCatalogNumbers: {
        currentStats: (Array.isArray(rawCurrentStatsObj?.items)
          ? rawCurrentStatsObj.items
          : []
        ).map((it: any) => ({
          value: String(it.value || ""),
          label: pickLocalized(it.label, locale),
          badge: String(rawCurrentStatsObj?.asOf || pickLocalized(rawCurrentStatsObj?.badgeLabel, locale) || "Katalog verisi (2025/2026)")
        })),
        futureTargets: (Array.isArray(rawHomepageNumbers?.plannedTargets?.items)
          ? rawHomepageNumbers.plannedTargets.items
          : []
        ).map((it: any) => ({
          value: String(it.value || ""),
          label: pickLocalized(it.label, locale)
        }))
      },
      quotes: rawQuotes.map((q: any) => ({
        id: q.id,
        type: q.type,
        source: q.sourceTr || "",
        sourceTr: q.sourceTr || "",
        targetPages: Array.isArray(q.targetPages) ? q.targetPages : [],
        text: pickLocalized(q.text, locale)
      }))
    },
    campaigns: campaignsRes.rows
      .filter((c) => {
        if (containsTaslikOrFakeData(c.title) || containsTaslikOrFakeData(c.summary) || containsTaslikOrFakeData(c.description)) {
          return false;
        }
        if ((c.requires_fitre_amount || c.slug === "fitre" || c.slug === "fidye") && !fitreReady) {
          return false;
        }
        return Boolean(pickLocalized(c.title, locale));
      })
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        purposeCode: c.purpose_code,
        restricted: Boolean(c.restricted),
        currency: c.currency || "TRY",
        targetAmount: c.target_amount != null && Number(c.target_amount) > 0 ? Number(c.target_amount) : 0,
        collectedAmount: Number(c.collected_amount || 0),
        presetAmounts: Array.isArray(c.preset_amounts) ? c.preset_amounts : [250, 500, 1000, 2500],
        coverImage: c.cover_image || "",
        sideImage: c.side_image || "",
        title: pickLocalized(c.title, locale),
        summary: pickLocalized(c.summary, locale),
        description: pickLocalized(c.description, locale),
        needsReview: Boolean(c.needs_review?.[locale])
      })),
    projects: projectsRes.rows
      .filter((p) => !containsTaslikOrFakeData(p.title) && !containsTaslikOrFakeData(p.summary) && !containsTaslikOrFakeData(p.content) && Boolean(pickLocalized(p.title, locale)))
      .map((p) => {
        const heroKey = p.hero_image || "";
        return {
          id: p.id,
          slug: p.slug,
          category: p.category,
          projectStatus: p.project_status,
          projectState: p.project_state || p.project_status,
          locationName: sanitizePublicField(p.location_name),
          title: pickLocalized(p.title, locale),
          summary: pickLocalized(p.summary, locale),
          content: pickLocalized(p.content, locale),
          contentTr: p.content?.tr || "",
          heroImage: resolveCatalogMediaUrl(heroKey),
          gallery: (Array.isArray(p.gallery) ? p.gallery : [])
            .filter((g: string) => g !== "rasmlar/egitim/kuran-kursu-cocuklar.jpg" && g !== "rasmlar/yardim/mezana-konteyner-cocuklar.jpg")
            .map((g: string) => resolveCatalogMediaUrl(g)),
          statsBadge: (Array.isArray(p.stats_badge?.metrics) ? p.stats_badge.metrics : []).map((m: any) => ({
            key: String(m.key || ""),
            value: String(m.value || ""),
            label: pickLocalized(m.label, locale)
          })),
          hadithQuote: p.hadith_quote?.text
            ? `${pickLocalized(p.hadith_quote.text, locale)}${p.hadith_quote.sourceTr ? ` — ${p.hadith_quote.sourceTr}` : ""}`
            : "",
          supportCampaignSlug: p.support_campaign_slug || "genel-bagis",
          externalLinks: Array.isArray(p.external_links) ? p.external_links : [],
          needsReview: Boolean(p.needs_review?.[locale])
        };
      }),
    news: newsRes.rows
      .filter((n) => !containsTaslikOrFakeData(n.title) && !containsTaslikOrFakeData(n.excerpt) && !containsTaslikOrFakeData(n.body) && Boolean(pickLocalized(n.title, locale)))
      .map((n) => ({
        id: n.id,
        slug: n.slug,
        category: n.category,
        publishedAt: new Date(n.published_at).toISOString().slice(0, 10),
        title: pickLocalized(n.title, locale),
        excerpt: pickLocalized(n.excerpt, locale),
        needsReview: Boolean(n.needs_review?.[locale])
      })),
    videos: videosRes.rows
      .filter((v) => !containsTaslikOrFakeData(v.title) && Boolean(pickLocalized(v.title, locale)))
      .map((v) => ({
        id: v.id,
        youtubeId: v.youtube_id,
        category: v.category,
        projectSlug: v.project_slug,
        title: pickLocalized(v.title, locale),
        needsReview: Boolean(v.needs_review?.[locale])
      })),
    faqs: faqsRes.rows
      .filter((f) => !containsTaslikOrFakeData(f.question) && !containsTaslikOrFakeData(f.answer) && Boolean(pickLocalized(f.question, locale)))
      .map((f) => ({
        id: f.id,
        category: f.category,
        question: pickLocalized(f.question, locale),
        answer: pickLocalized(f.answer, locale)
      })),
    pages: pagesRes.rows
      .filter((pg) => !containsTaslikOrFakeData(pg.title) && !containsTaslikOrFakeData(pg.body))
      .map((pg) => ({
        slug: pg.slug,
        title: pickLocalized(pg.title, locale),
        summary: pickLocalized(pg.summary, locale),
        body: pickLocalized(pg.body, locale)
      })),
    team: teamRes.rows
      .filter((t) => !containsTaslikOrFakeData(t.full_name))
      .map((t) => ({
        id: t.id,
        groupType: t.group_type,
        fullName: t.full_name,
        photoUrl: t.photo_url,
        roleTitle: pickLocalized(t.role_title, locale),
        bio: pickLocalized(t.bio, locale)
      })),
    qurbanCountries: qurbanRes.rows
      .filter((q) => Boolean(q.is_active) && !containsTaslikOrFakeData(q.name))
      .map((q) => ({
        code: q.code,
        active: Boolean(q.is_active),
        name: pickLocalized(q.name, locale)
      }))
  };
}

// ============================================================================
// 0-QADAM: ZOD VALIDATSIYALI ADMIN CRUD VA AUDIT LOG (PAYLOAD 3 BILAN UYGHUN)
// ============================================================================

export const LocalizedMapSchema = z.object({
  tr: z.string().min(1),
  uz: z.string().optional().default(""),
  en: z.string().optional().default(""),
  ar: z.string().optional().default("")
});

export const KurbanSeasonUpdateSchema = z.object({
  year: z.number().int().min(2026).max(2035),
  eidDay1: z.string().nullable().optional(),
  eidDay2: z.string().nullable().optional(),
  eidDay3: z.string().nullable().optional(),
  eidDay4: z.string().nullable().optional(),
  salesOpenAt: z.string().nullable().optional(),
  salesCloseAt: z.string().nullable().optional(),
  isActive: z.boolean(),
  autoApproveVideos: z.boolean().optional().default(false),
  videoRetentionDays: z.number().int().min(30).max(3650).optional().default(365),
  originalRetentionDays: z.number().int().min(7).max(365).optional().default(30),
  vekaletVersion: z.string().min(1).max(32).optional().default("v2027.1"),
  vekaletText: z
    .object({
      tr: z.string().default(""),
      uz: z.string().default(""),
      en: z.string().default(""),
      ar: z.string().default("")
    })
    .optional()
    .default({ tr: "", uz: "", en: "", ar: "" })
});

export const KurbanCountryUpdateSchema = z.object({
  code: z.string().min(2).max(16).toUpperCase(),
  flag: z.string().min(1).max(24).optional().default("🏳️"),
  partnerInternal: z.string().max(200).optional().nullable(),
  isActive: z.boolean(),
  name: LocalizedMapSchema,
  description: LocalizedMapSchema,
  needsReview: z
    .object({
      tr: z.boolean().default(false),
      uz: z.boolean().default(true),
      en: z.boolean().default(true),
      ar: z.boolean().default(true)
    })
    .optional()
});

export const KurbanOfferUpdateSchema = z.object({
  seasonYear: z.number().int().min(2026).max(2035),
  countryCode: z.string().min(2).max(16).toUpperCase(),
  animalType: z.enum(["sheep", "goat", "cattle", "camel"]),
  sharesPerAnimal: z.union([z.literal(1), z.literal(7)]),
  pricePerShareTry: z.number().min(0),
  quotaShares: z.number().int().min(0),
  isActive: z.boolean()
});

export const CmsCampaignUpdateSchema = z.object({
  slug: z.string().min(2).max(120),
  purposeCode: z.string().min(2).max(80),
  status: z.enum(["draft", "published", "scheduled"]).default("published"),
  restricted: z.boolean().default(true),
  targetAmount: z.number().min(0),
  presetAmounts: z.array(z.number().positive()).default([250, 500, 1000, 2500]),
  title: LocalizedMapSchema,
  summary: LocalizedMapSchema,
  description: LocalizedMapSchema,
  needsReview: z
    .object({
      tr: z.boolean().default(false),
      uz: z.boolean().default(true),
      en: z.boolean().default(true),
      ar: z.boolean().default(true)
    })
    .optional()
});

export interface CmsActor {
  userId?: number;
  email: string;
  role: CmsRole;
  totpVerified: boolean;
  clientIp?: string | null;
}

function assertActorPermission(actor: CmsActor, requiredAction: "edit_content" | "edit_translation" | "manage_settings") {
  if (!actor || !actor.totpVerified) {
    const err: any = new Error("Forbidden: Mandatory 2FA session required");
    err.statusCode = 403;
    throw err;
  }
  if (!canRolePerform(actor.role, requiredAction)) {
    const err: any = new Error(`Forbidden: Role '${actor.role}' cannot perform '${requiredAction}'`);
    err.statusCode = 403;
    throw err;
  }
}

async function logAdminAudit(actor: CmsActor, action: string, targetRef: string, metadata: Record<string, any>) {
  await dbQuery(
    `INSERT INTO admin_audit_logs (actor_user_id, actor_email, actor_role, action, target_ref, client_ip, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [actor.userId || null, actor.email, actor.role, action, targetRef, actor.clientIp || null, JSON.stringify(metadata)]
  );
}

export async function updateKurbanSeasonByAdmin(actor: CmsActor, rawInput: unknown) {
  await ensureCmsSchemaOnly();
  assertActorPermission(actor, "edit_content");
  const input = KurbanSeasonUpdateSchema.parse(rawInput);

  const res = await dbQuery(
    `INSERT INTO kurban_seasons (
       year, eid_day_1, eid_day_2, eid_day_3, eid_day_4,
       sales_open_at, sales_close_at, is_active, auto_approve_videos,
       video_retention_days, original_retention_days, vekalet_version, vekalet_text, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW())
     ON CONFLICT (year) DO UPDATE SET
       eid_day_1 = EXCLUDED.eid_day_1,
       eid_day_2 = EXCLUDED.eid_day_2,
       eid_day_3 = EXCLUDED.eid_day_3,
       eid_day_4 = EXCLUDED.eid_day_4,
       sales_open_at = EXCLUDED.sales_open_at,
       sales_close_at = EXCLUDED.sales_close_at,
       is_active = EXCLUDED.is_active,
       auto_approve_videos = EXCLUDED.auto_approve_videos,
       video_retention_days = EXCLUDED.video_retention_days,
       original_retention_days = EXCLUDED.original_retention_days,
       vekalet_version = EXCLUDED.vekalet_version,
       vekalet_text = EXCLUDED.vekalet_text,
       updated_at = NOW()
     RETURNING *`,
    [
      input.year,
      input.eidDay1 || null,
      input.eidDay2 || null,
      input.eidDay3 || null,
      input.eidDay4 || null,
      input.salesOpenAt || null,
      input.salesCloseAt || null,
      input.isActive,
      input.autoApproveVideos,
      input.videoRetentionDays,
      input.originalRetentionDays,
      input.vekaletVersion,
      JSON.stringify(input.vekaletText)
    ]
  );

  await logAdminAudit(actor, "CMS_UPDATE_KURBAN_SEASON", String(input.year), {
    isActive: input.isActive,
    salesOpenAt: input.salesOpenAt,
    salesCloseAt: input.salesCloseAt,
    autoApproveVideos: input.autoApproveVideos
  });

  return res.rows[0];
}

export async function updateKurbanCountryByAdmin(actor: CmsActor, rawInput: unknown) {
  await ensureCmsSchemaOnly();
  assertActorPermission(actor, "edit_translation");
  const input = KurbanCountryUpdateSchema.parse(rawInput);

  // Translator faqat matnlarni o'zgartira oladi, faollikni faqat admin/editor o'zgartiradi
  if (actor.role === "translator") {
    const existing = await dbQuery(`SELECT * FROM kurban_countries WHERE code = $1`, [input.code]);
    if (existing.rowCount === 0) {
      throw new Error("Translator cannot create new country");
    }
    const res = await dbQuery(
      `UPDATE kurban_countries
       SET name = $2::jsonb,
           description = $3::jsonb,
           needs_review = COALESCE($4::jsonb, needs_review),
           updated_at = NOW()
       WHERE code = $1
       RETURNING *`,
      [input.code, JSON.stringify(input.name), JSON.stringify(input.description), input.needsReview ? JSON.stringify(input.needsReview) : null]
    );
    await logAdminAudit(actor, "CMS_TRANSLATE_KURBAN_COUNTRY", input.code, { needsReview: input.needsReview });
    return res.rows[0];
  }

  const res = await dbQuery(
    `INSERT INTO kurban_countries (code, flag, partner_internal, is_active, name, description, needs_review, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, COALESCE($7::jsonb, '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb), NOW())
     ON CONFLICT (code) DO UPDATE SET
       flag = EXCLUDED.flag,
       partner_internal = COALESCE(EXCLUDED.partner_internal, kurban_countries.partner_internal),
       is_active = EXCLUDED.is_active,
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       needs_review = COALESCE($7::jsonb, kurban_countries.needs_review),
       updated_at = NOW()
     RETURNING *`,
    [
      input.code,
      input.flag,
      input.partnerInternal ?? null,
      input.isActive,
      JSON.stringify(input.name),
      JSON.stringify(input.description),
      input.needsReview ? JSON.stringify(input.needsReview) : null
    ]
  );

  await logAdminAudit(actor, "CMS_UPDATE_KURBAN_COUNTRY", input.code, {
    isActive: input.isActive
  });

  return res.rows[0];
}

export async function upsertKurbanOfferByAdmin(actor: CmsActor, rawInput: unknown) {
  await ensureCmsSchemaOnly();
  assertActorPermission(actor, "edit_content");
  const input = KurbanOfferUpdateSchema.parse(rawInput);

  // sharesPerAnimal qoidasi: qo'y/echki = 1, sigir/tuya = 7
  const expectedShares = input.animalType === "sheep" || input.animalType === "goat" ? 1 : 7;
  if (input.sharesPerAnimal !== expectedShares) {
    throw new Error(`Invalid sharesPerAnimal for ${input.animalType}: expected ${expectedShares}`);
  }

  const res = await dbQuery(
    `INSERT INTO kurban_offers (
       season_year, country_code, animal_type, shares_per_animal,
       price_per_share_try, quota_shares, is_active, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (season_year, country_code, animal_type) DO UPDATE SET
       shares_per_animal = EXCLUDED.shares_per_animal,
       price_per_share_try = EXCLUDED.price_per_share_try,
       quota_shares = GREATEST(kurban_offers.sold_shares, EXCLUDED.quota_shares),
       is_active = EXCLUDED.is_active,
       updated_at = NOW()
     RETURNING *`,
    [
      input.seasonYear,
      input.countryCode,
      input.animalType,
      expectedShares,
      input.pricePerShareTry,
      input.quotaShares,
      input.isActive
    ]
  );

  await logAdminAudit(actor, "CMS_UPSERT_KURBAN_OFFER", `${input.seasonYear}:${input.countryCode}:${input.animalType}`, {
    pricePerShareTry: input.pricePerShareTry,
    quotaShares: input.quotaShares,
    isActive: input.isActive
  });

  return res.rows[0];
}

export async function upsertCmsCampaignByAdmin(actor: CmsActor, rawInput: unknown) {
  await ensureCmsSchemaOnly();
  assertActorPermission(actor, "edit_translation");
  const input = CmsCampaignUpdateSchema.parse(rawInput);

  if (actor.role === "translator") {
    const res = await dbQuery(
      `UPDATE cms_campaigns
       SET title = $2::jsonb,
           summary = $3::jsonb,
           description = $4::jsonb,
           needs_review = COALESCE($5::jsonb, needs_review),
           updated_at = NOW()
       WHERE slug = $1
       RETURNING *`,
      [
        input.slug,
        JSON.stringify(input.title),
        JSON.stringify(input.summary),
        JSON.stringify(input.description),
        input.needsReview ? JSON.stringify(input.needsReview) : null
      ]
    );
    await logAdminAudit(actor, "CMS_TRANSLATE_CAMPAIGN", input.slug, { status: input.status });
    return res.rows[0];
  }

  const res = await dbQuery(
    `INSERT INTO cms_campaigns (
       slug, purpose_code, status, restricted, target_amount, preset_amounts,
       title, summary, description, needs_review, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, COALESCE($10::jsonb, '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb), NOW())
     ON CONFLICT (slug) DO UPDATE SET
       purpose_code = EXCLUDED.purpose_code,
       status = EXCLUDED.status,
       restricted = EXCLUDED.restricted,
       target_amount = EXCLUDED.target_amount,
       preset_amounts = EXCLUDED.preset_amounts,
       title = EXCLUDED.title,
       summary = EXCLUDED.summary,
       description = EXCLUDED.description,
       needs_review = COALESCE($10::jsonb, cms_campaigns.needs_review),
       updated_at = NOW()
     RETURNING *`,
    [
      input.slug,
      input.purposeCode,
      input.status,
      input.restricted,
      input.targetAmount,
      JSON.stringify(input.presetAmounts),
      JSON.stringify(input.title),
      JSON.stringify(input.summary),
      JSON.stringify(input.description),
      input.needsReview ? JSON.stringify(input.needsReview) : null
    ]
  );

  await logAdminAudit(actor, "CMS_UPSERT_CAMPAIGN", input.slug, {
    status: input.status,
    targetAmount: input.targetAmount
  });

  return res.rows[0];
}
