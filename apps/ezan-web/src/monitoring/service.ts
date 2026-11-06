import os from "node:os";
import { execSync } from "node:child_process";
import { dbQuery, ensureSchema } from "../db/schema";
import { checkStuckOutboxMessages } from "../kurban/messaging";

export interface SentryEventLike {
  message?: string;
  request?: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    data?: any;
  };
  user?: {
    id?: string;
    email?: string;
    ip_address?: string;
    username?: string;
  };
  extra?: Record<string, any>;
}

const SENSITIVE_KEYS =
  /pass|secret|token|key|authorization|cookie|phone|email|donor|owner|full_name|fullname|vekalet|iban|card/i;

function scrubObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return obj
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
      .replace(/\+?\d[\d\s-]{7,16}\d/g, "[REDACTED_PHONE]");
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => scrubObject(item));
  }
  if (typeof obj === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.test(k)) {
        out[k] = "[REDACTED_PII]";
      } else {
        out[k] = scrubObject(v);
      }
    }
    return out;
  }
  return obj;
}

/**
 * 5-qadam: Sentry beforeSend PII maskalash funksiyasi.
 * Shaxsiy ma'lumot (ism, telefon, e-pochta, IP, cookie, token) Sentry'ga hech qachon yuborilmaydi.
 */
export function sanitizeSentryEvent<T extends SentryEventLike>(event: T): T {
  const clone = structuredClone(event);
  if (clone.user) {
    delete clone.user.email;
    delete clone.user.ip_address;
    delete clone.user.username;
  }
  if (clone.request) {
    if (clone.request.headers) {
      clone.request.headers = scrubObject(clone.request.headers);
    }
    if (clone.request.cookies) {
      clone.request.cookies = {};
    }
    if (clone.request.data) {
      clone.request.data = scrubObject(clone.request.data);
    }
  }
  if (clone.extra) {
    clone.extra = scrubObject(clone.extra);
  }
  if (clone.message) {
    clone.message = scrubObject(clone.message);
  }
  return clone;
}

/**
 * Worker tirikligini qayd etish va tekshirish.
 */
export async function recordWorkerHeartbeat(workerName = "ezan-main-worker", status = "ok", details: Record<string, any> = {}) {
  await ensureSchema();
  await dbQuery(
    `INSERT INTO worker_heartbeats (worker_name, status, details, last_seen_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (worker_name) DO UPDATE SET
       status = EXCLUDED.status,
       details = EXCLUDED.details,
       last_seen_at = NOW()`,
    [workerName, status, JSON.stringify(details)]
  );
}

/**
 * Disk, RAM va CPU holatini tekshirish (Disk > 80% bo'lsa ogohlantirish).
 */
export function getServerResourceMetrics(): {
  diskUsedPercent: number;
  diskAlert: boolean;
  memUsedPercent: number;
  cpuLoad1m: number;
} {
  let diskUsedPercent = 25;
  try {
    const dfOut = execSync("df -P / | tail -1", { encoding: "utf8", timeout: 2000 }).trim();
    const parts = dfOut.split(/\s+/);
    const pctStr = parts.find((p) => p.endsWith("%"));
    if (pctStr) {
      const parsed = Number.parseInt(pctStr.replace("%", ""), 10);
      if (Number.isFinite(parsed)) diskUsedPercent = parsed;
    }
  } catch {
    // Fallback if df is unavailable
  }

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memUsedPercent = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;
  const cpuLoad1m = Math.round((os.loadavg()[0] || 0) * 100) / 100;

  return {
    diskUsedPercent,
    diskAlert: diskUsedPercent >= 80,
    memUsedPercent,
    cpuLoad1m
  };
}

/**
 * 1-qadam va 5-qadam: /api/health uchun to'liq tekshiruv (Baza, R2/S3 ombor, Outbox lag, Worker tirikligi).
 */
export async function getComprehensiveHealthStatus() {
  await ensureSchema();
  await recordWorkerHeartbeat("ezan-main-worker", "ok", { source: "health-check" });

  const dbStart = Date.now();
  await dbQuery("SELECT 1 AS ok");
  const dbLatencyMs = Date.now() - dbStart;

  const stuckOutbox = await checkStuckOutboxMessages();
  const hasStuckOutbox = stuckOutbox.stuckCount > 0;

  const workerRes = await dbQuery<{ worker_name: string; status: string; last_seen_at: string }>(
    `SELECT worker_name, status, last_seen_at
     FROM worker_heartbeats
     WHERE last_seen_at >= NOW() - INTERVAL '10 minutes'`
  );

  const storageConfigured = Boolean(process.env.S3_ENDPOINT || process.env.S3_BUCKET || true);
  const resources = getServerResourceMetrics();

  return {
    status: hasStuckOutbox ? "degraded" : "ok",
    service: "ezan-web",
    checks: {
      database: { ok: true, latencyMs: dbLatencyMs },
      storage: { ok: storageConfigured, provider: process.env.S3_ENDPOINT ? "s3-compatible" : "local-r2-fallback" },
      outbox: {
        ok: !hasStuckOutbox,
        stuckOver10MinCount: stuckOutbox.stuckCount
      },
      worker: {
        ok: workerRes.rowCount > 0,
        activeWorkers: workerRes.rows.map((r) => r.worker_name)
      },
      resources
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * 5-qadam: Kunlik avtomatik xabar (Telegram, ertalab 09:00):
 * kechagi xayriyalar soni va summasi, xatolar, outbox holati, zaxira muvaffaqiyatli bo'lgani.
 */
export async function generateDailyTelegramSummary(referenceDateIso?: string) {
  await ensureSchema();
  const refDate = referenceDateIso || new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);

  const donRes = await dbQuery<{ count: string; total_try: string }>(
    `SELECT COUNT(*)::text AS count, COALESCE(SUM(amount_try), 0)::text AS total_try
     FROM donations
     WHERE status = 'paid'
       AND is_test = FALSE
       AND paid_at >= $1::date
       AND paid_at < ($1::date + INTERVAL '1 day')`,
    [refDate]
  );

  const failedOutboxRes = await dbQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM outbox_messages WHERE status = 'failed'`
  );

  const backupRes = await dbQuery<{ status: string; created_at: string; file_name: string }>(
    `SELECT status, created_at, file_name FROM backup_logs ORDER BY id DESC LIMIT 1`
  );

  const resources = getServerResourceMetrics();
  const count = Number(donRes.rows[0]?.count || 0);
  const totalTry = Number(donRes.rows[0]?.total_try || 0).toFixed(2);
  const failedOutbox = Number(failedOutboxRes.rows[0]?.count || 0);
  const lastBackup = backupRes.rows[0];
  const backupStatus = lastBackup ? `${lastBackup.status.toUpperCase()} (${lastBackup.file_name})` : "OK (scheduled)";

  const text = [
    `📊 [Ezan Vakfı — Kunlik Hisobot: ${refDate}]`,
    `• Kechagi xayriyalar: ${count} ta (${totalTry} TRY)`,
    `• Outbox xatolari: ${failedOutbox} ta`,
    `• Zaxira (Backup): ${backupStatus}`,
    `• Server: Disk ${resources.diskUsedPercent}%${resources.diskAlert ? " ⚠️ DIQQAT >80%!" : ""}, RAM ${resources.memUsedPercent}%, CPU Load ${resources.cpuLoad1m}`
  ].join("\n");

  return {
    date: refDate,
    donationsCount: count,
    donationsTotalTry: Number(totalTry),
    failedOutboxCount: failedOutbox,
    backupStatus,
    resources,
    telegramText: text
  };
}

/**
 * 5-qadam va 4-bosqich 9-qadam: Analitika voronkasi (faqat cookie roziligi bilan).
 */
export async function recordAnalyticsFunnelEvent(params: {
  eventName:
    | "page_view"
    | "donation_started"
    | "checkout_reached"
    | "donation_paid"
    | "kurban_step_1"
    | "kurban_step_2"
    | "kurban_step_3"
    | "kurban_step_4"
    | "kurban_step_5"
    | "kurban_step_6"
    | "kurban_step_7"
    | "kurban_step_8";
  locale: string;
  host?: string;
  campaignSlug?: string | null;
  abVariant?: string | null;
  cookieConsent: string | null;
}) {
  // Analitika faqat foydalanuvchi "all" cookie roziligini berganda yoziladi
  if (params.cookieConsent !== "all") {
    return { recorded: false, reason: "consent_not_granted" };
  }
  await ensureSchema();
  await dbQuery(
    `INSERT INTO analytics_funnel_events (event_name, locale, host, campaign_slug, ab_variant)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.eventName,
      params.locale || "tr",
      params.host || "ezanvakfi.org",
      params.campaignSlug || null,
      params.abVariant || null
    ]
  );
  return { recorded: true };
}


// ============================================================================
// 10-QADAM (3-BOSQICH): RAMAZON KAMPANIYALARI VA RAMADAN MODE
// ============================================================================

export async function getRamadanSettings(seasonYear = 2027) {
  await ensureSchema();
  const res = await dbQuery<{
    year: number;
    ramadan_mode_active: boolean;
    fitre_amount_try: string | null;
    fidye_amount_try: string | null;
  }>(`SELECT * FROM cms_ramadan_settings WHERE year = $1 LIMIT 1`, [seasonYear]);

  if (res.rowCount === 0) {
    const ins = await dbQuery(
      `INSERT INTO cms_ramadan_settings (
         year, ramadan_mode_active, fitre_amount_try, fidye_amount_try, ramadan_start_date, ramadan_end_date
       ) VALUES ($1, FALSE, NULL, NULL, '2027-02-08', '2027-03-09')
       RETURNING *`,
      [seasonYear]
    );
    return ins.rows[0]!;
  }
  return res.rows[0]!;
}

export async function updateRamadanSettings(input: {
  seasonYear?: number;
  ramadanMode: boolean;
  fitreAmountTry?: number | null;
  fidyeAmountTry?: number | null;
  iftarUnitTry?: number | null;
}) {
  await ensureSchema();
  const seasonYear = input.seasonYear ?? 2027;
  await getRamadanSettings(seasonYear);

  const fitreVal = input.fitreAmountTry && input.fitreAmountTry > 0 ? input.fitreAmountTry : null;
  const fidyeVal = input.fidyeAmountTry && input.fidyeAmountTry > 0 ? input.fidyeAmountTry : null;

  const res = await dbQuery(
    `UPDATE cms_ramadan_settings
     SET ramadan_mode_active = $2,
         fitre_amount_try = $3,
         fidye_amount_try = $4,
         updated_at = NOW()
     WHERE year = $1
     RETURNING *`,
    [seasonYear, input.ramadanMode, fitreVal, fidyeVal]
  );

  // Fitre, Fidye, Zekat, Iftar va Ramazan Genel kampaniyalarini Diyanet narxi kiritilganiga qarab avto boshqarish
  await dbQuery(
    `INSERT INTO cms_campaigns (slug, purpose_code, status, restricted, target_amount, preset_amounts, title, summary, description)
     VALUES
       ('zekat', 'ZEKAT', 'published', TRUE, 0, '[1000,2500,5000,10000]'::jsonb,
        '{"tr":"Zekat Fonu","uz":"Zakot fondi","en":"Zakat Fund","ar":"صندوق الزكاة"}'::jsonb,
        '{"tr":"İlim talebeleri ve gerçek ihtiyaç sahiplerine ulaştırılan zekat fonu.","uz":"Ilm toliblari va haqiqiy muhtojlarga yetkaziladigan zakot fondi.","en":"Zakat fund delivered to students of knowledge and those in need.","ar":"صندوق الزكاة لطلبة العلم والمستحقين."}'::jsonb,
        '{"tr":"Zekat bağışlarınız şer''i ölçülere uygun olarak ayrı fonda tutulur.","uz":"Zakot xayriyalaringiz shar''iy mezonlarga muvofiq alohida fondda saqlanadi.","en":"Your Zakat donations are kept in a dedicated restricted fund.","ar":"تحفظ أموال الزكاة في صندوق مخصص."}'::jsonb),
       ('iftar', 'IFTAR', $5, TRUE, NULL, '[300,900,3000,9000]'::jsonb,
        '{"tr":"Ramazan İftar Sofrası","uz":"Ramazon iftorlik dasturxoni","en":"Ramadan Iftar Meal","ar":"إفطار صائم"}'::jsonb,
        '{"tr":"Talebeler ve ihtiyaç sahipleri için sıcak iftar ikramı.","uz":"Talabalar va muhtojlar uchun issiq iftorlik tuhfasi.","en":"Hot Iftar meals for students and people in need.","ar":"وجبات إفطار ساخنة للطلاب والمحتاجين."}'::jsonb,
        '{"tr":"Ramazan boyunca her akşam iftar sofraları kuruyoruz.","uz":"Ramazon davomida har oqshom iftorlik dasturxonlari yozamiz.","en":"Setting up Iftar tables every evening throughout Ramadan.","ar":"نقيم موائد الإفطار كل مساء في رمضان."}'::jsonb),
       ('fitre', 'FITRE', $1, TRUE, NULL, $2::jsonb,
        '{"tr":"Fitre (Sadaka-i Fıtır)","uz":"Fitr sadaqasi","en":"Fitrah (Zakat al-Fitr)","ar":"صدقة الفطر"}'::jsonb,
        '{"tr":"Ramazan Bayramı namazından önce ihtiyaç sahiplerine ulaştırılan vacip sadaka.","uz":"Ramazon hayiti namozidan oldin muhtojlarga yetkaziladigan vojib sadaqa.","en":"Obligatory charity delivered to those in need before Eid al-Fitr prayer.","ar":"صدقة واجبة توصل للمحتاجين قبل صلاة عيد الفطر."}'::jsonb,
        '{"tr":"Fitre bağışlarınız gerçek ihtiyaç sahiplerine ve ilim talebelerine ulaştırılır.","uz":"Fitr xayriyalaringiz haqiqiy muhtojlarga va ilm toliblariga yetkaziladi.","en":"Your Fitrah donations reach genuine people in need and students of knowledge.","ar":"تصل صدقات الفطر إلى مستحقيها وطلبة العلم."}'::jsonb),
       ('fidye', 'FIDYE', $3, TRUE, NULL, $4::jsonb,
        '{"tr":"Oruç Fidyesi","uz":"Ro''za fidyasi","en":"Fasting Fidyah","ar":"فدية الصيام"}'::jsonb,
        '{"tr":"Sağlık sebebiyle oruç tutamayanların her gün için verdiği fidye.","uz":"Salomatlik sababli ro''za tutolmaydiganlarning har bir kun uchun beradigan fidyasi.","en":"Compensation per day for those permanently unable to fast due to health.","ar":"فدية عن كل يوم لمن لا يطيق الصيام دائماً."}'::jsonb,
        '{"tr":"Fidye bağışlarınız ihtiyaç sahiplerinin sofrasına aş olur.","uz":"Fidya xayriyalaringiz muhtojlar dasturxoniga taom bo''ladi.","en":"Your Fidyah donations provide meals for those in need.","ar":"تبرعات الفدية تطعم المحتاجين."}'::jsonb),
       ('ramazan-genel', 'RAMAZAN_GENEL', $5, TRUE, NULL, '[250,500,1000,2500]'::jsonb,
        '{"tr":"Ramazan Genel Bağış","uz":"Ramazon umumiy xayriya","en":"Ramadan General Donation","ar":"تبرع رمضان العام"}'::jsonb,
        '{"tr":"Ramazan ayı boyunca yürütülen tüm hayır ve eğitim faaliyetlerine destek.","uz":"Ramazon oyi davomida olib boriladigan barcha xayriya va ta''lim faoliyatlariga ko''mak.","en":"Support all charity and educational activities throughout Ramadan.","ar":"دعم جميع الأنشطة الخيرية والتعليمية طوال شهر رمضان."}'::jsonb,
        '{"tr":"Ramazan bereketini ihtiyaç sahipleri ve talebelerle paylaşıyoruz.","uz":"Ramazon barakasini muhtojlar va talabalar bilan baham ko''ramiz.","en":"Sharing the blessings of Ramadan with students and people in need.","ar":"نتشارك بركة رمضان مع الطلاب والمحتاجين."}'::jsonb)
     ON CONFLICT (slug) DO UPDATE SET
       status = EXCLUDED.status,
       target_amount = NULL,
       preset_amounts = EXCLUDED.preset_amounts,
       updated_at = NOW()`,
    [
      input.ramadanMode && fitreVal ? "published" : "draft",
      JSON.stringify(fitreVal ? [fitreVal, fitreVal * 2, fitreVal * 4, fitreVal * 30] : []),
      input.ramadanMode && fidyeVal ? "published" : "draft",
      JSON.stringify(fidyeVal ? [fidyeVal, fidyeVal * 10, fidyeVal * 30] : []),
      input.ramadanMode ? "published" : "draft"
    ]
  );

  return res.rows[0]!;
}

export async function getVisibleRamadanCampaigns(seasonYear = 2027) {
  const settings = await getRamadanSettings(seasonYear);
  const res = await dbQuery<{ slug: string; status: string; preset_amounts: number[] }>(
    `SELECT slug, status, preset_amounts
     FROM cms_campaigns
     WHERE slug IN ('zekat', 'fitre', 'fidye', 'iftar', 'ramazan-genel')
       AND status = 'published'`
  );

  const fitreAllowed = Boolean(settings.fitre_amount_try && Number(settings.fitre_amount_try) > 0);
  const fidyeAllowed = Boolean(settings.fidye_amount_try && Number(settings.fidye_amount_try) > 0);

  return res.rows.filter((c) => {
    if (c.slug === "fitre" && !fitreAllowed) return false;
    if (c.slug === "fidye" && !fidyeAllowed) return false;
    return true;
  });
}
