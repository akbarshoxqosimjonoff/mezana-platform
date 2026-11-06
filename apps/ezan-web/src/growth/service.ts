import crypto from "node:crypto";
import { dbQuery, ensureSchema, getDbPool } from "../db/schema";
import { Locale } from "../i18n/country-locale";
import { signWebhookPayload } from "../payments/service";

export interface GrowthFeatureFlags {
  RECURRING_ENABLED: boolean;
  RAMADAN_AUTOPAY_ENABLED: boolean;
  P2P_ENABLED: boolean;
  GIFT_ENABLED: boolean;
  NAMED_PROJECTS_ENABLED: boolean;
  NEWSLETTER_ENABLED: boolean;
  BANK_IMPORT_ENABLED: boolean;
  INSTAGRAM_ENABLED: boolean;
  API_V1_ENABLED: boolean;
  AB_TESTS_ENABLED: boolean;
  // Backward-compatible aliases
  P2P_CAMPAIGNS_ENABLED: boolean;
  GIFT_DONATIONS_ENABLED: boolean;
  IMPACT_REPORTS_ENABLED: boolean;
  IYS_ENABLED: boolean;
  BANK_RECONCILIATION_ENABLED: boolean;
  SOCIAL_SYNC_ENABLED: boolean;
  PUBLIC_API_V1_ENABLED: boolean;
  AB_TESTING_ENABLED: boolean;
}

export function getGrowthFeatureFlags(): GrowthFeatureFlags {
  const recurring = process.env.RECURRING_ENABLED === "true";
  const ramadanAutopay = process.env.RAMADAN_AUTOPAY_ENABLED === "true";
  const p2p = process.env.P2P_ENABLED === "true" || process.env.P2P_CAMPAIGNS_ENABLED === "true";
  const gift = process.env.GIFT_ENABLED === "true" || process.env.GIFT_DONATIONS_ENABLED === "true";
  const namedProjects = process.env.NAMED_PROJECTS_ENABLED === "true";
  const newsletter = process.env.NEWSLETTER_ENABLED === "true";
  const bankImport =
    process.env.BANK_IMPORT_ENABLED === "true" || process.env.BANK_RECONCILIATION_ENABLED === "true";
  const instagram =
    process.env.INSTAGRAM_ENABLED === "true" || process.env.SOCIAL_SYNC_ENABLED === "true";
  const apiV1 = process.env.API_V1_ENABLED === "true" || process.env.PUBLIC_API_V1_ENABLED === "true";
  const abTests = process.env.AB_TESTS_ENABLED === "true" || process.env.AB_TESTING_ENABLED === "true";

  return {
    RECURRING_ENABLED: recurring,
    RAMADAN_AUTOPAY_ENABLED: ramadanAutopay,
    P2P_ENABLED: p2p,
    GIFT_ENABLED: gift,
    NAMED_PROJECTS_ENABLED: namedProjects,
    NEWSLETTER_ENABLED: newsletter,
    BANK_IMPORT_ENABLED: bankImport,
    INSTAGRAM_ENABLED: instagram,
    API_V1_ENABLED: apiV1,
    AB_TESTS_ENABLED: abTests,
    P2P_CAMPAIGNS_ENABLED: p2p,
    GIFT_DONATIONS_ENABLED: gift,
    IMPACT_REPORTS_ENABLED: process.env.IMPACT_REPORTS_ENABLED === "true",
    IYS_ENABLED: process.env.IYS_ENABLED === "true",
    BANK_RECONCILIATION_ENABLED: bankImport,
    SOCIAL_SYNC_ENABLED: instagram,
    PUBLIC_API_V1_ENABLED: apiV1,
    AB_TESTING_ENABLED: abTests
  };
}

export function requireFeatureFlag(flagName: keyof GrowthFeatureFlags): void {
  const flags = getGrowthFeatureFlags();
  if (!flags[flagName]) {
    const err: any = new Error(`Feature is disabled (${String(flagName)}=false)`);
    err.statusCode = 404;
    throw err;
  }
}

// ============================================================================
// 0-QADAM: HAYIT XULOSASI VA YANGI MAVSUM YARATISH (CLONE SEASON)
// ============================================================================

export async function generateKurbanSeasonRetrospective(seasonYear = 2027) {
  await ensureSchema();

  const byCountryRes = await dbQuery<{ country_code: string; sold_shares: string; paid_orders: string }>(
    `SELECT o.country_code,
            COALESCE(SUM(o.total_shares) FILTER (WHERE o.status = 'paid'), 0)::text AS sold_shares,
            COUNT(*) FILTER (WHERE o.status = 'paid')::text AS paid_orders
     FROM kurban_orders o
     WHERE o.season_year = $1
     GROUP BY o.country_code
     ORDER BY o.country_code ASC`,
    [seasonYear]
  );

  const avgVideoTimeRes = await dbQuery<{ avg_hours: string | null }>(
    `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (v.approved_at - d.paid_at)) / 3600.0)::numeric, 2)::text AS avg_hours
     FROM kurban_shares s
     JOIN kurban_orders o ON o.id = s.order_id
     JOIN donations d ON d.id = o.donation_id
     JOIN kurban_animals a ON a.id = s.animal_id
     JOIN kurban_videos v ON v.id = a.video_id
     WHERE o.season_year = $1
       AND v.approved_at IS NOT NULL
       AND d.paid_at IS NOT NULL`,
    [seasonYear]
  );

  const missingVideoRes = await dbQuery<{ missing_count: string }>(
    `SELECT COUNT(*)::text AS missing_count
     FROM kurban_shares s
     JOIN kurban_orders o ON o.id = s.order_id
     WHERE o.season_year = $1
       AND o.status = 'paid'
       AND s.status != 'video_ready'`,
    [seasonYear]
  );

  const msgStatsRes = await dbQuery<{ channel: string; total: string; delivered_or_sent: string; failed: string }>(
    `SELECT channel,
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE status IN ('sent', 'delivered'))::text AS delivered_or_sent,
            COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
     FROM kurban_message_logs
     GROUP BY channel`
  );

  const funnelRes = await dbQuery<{ event_name: string; cnt: string }>(
    `SELECT event_name, COUNT(*)::text AS cnt
     FROM analytics_funnel_events
     WHERE event_name LIKE 'kurban_step_%'
     GROUP BY event_name
     ORDER BY event_name ASC`
  );

  return {
    seasonYear,
    byCountry: byCountryRes.rows.map((r) => ({
      countryCode: r.country_code,
      soldShares: Number(r.sold_shares),
      paidOrders: Number(r.paid_orders)
    })),
    avgHoursPaymentToVideo: avgVideoTimeRes.rows[0]?.avg_hours ? Number(avgVideoTimeRes.rows[0].avg_hours) : null,
    sharesWithoutVideoCount: Number(missingVideoRes.rows[0]?.missing_count || 0),
    messagingDelivery: msgStatsRes.rows.map((r) => {
      const total = Number(r.total);
      const ok = Number(r.delivered_or_sent);
      return {
        channel: r.channel,
        total,
        deliveredOrSent: ok,
        failed: Number(r.failed),
        deliveryRatePercent: total > 0 ? Math.round((ok / total) * 1000) / 10 : 100
      };
    }),
    stepFunnel: funnelRes.rows.map((r) => ({
      step: r.event_name,
      count: Number(r.cnt)
    }))
  };
}

/**
 * 0-qadam: `kurbanSeason` uchun "Yangi mavsum yaratish" — davlatlar va takliflarni nusxalaydi,
 * narx va sanalarni bo'sh (`0` / `NULL`) qoldiradi.
 */
export async function cloneKurbanSeasonForNextYear(fromYear: number, toYear: number) {
  await ensureSchema();
  const prevSeason = await dbQuery(`SELECT * FROM kurban_seasons WHERE year = $1 LIMIT 1`, [fromYear]);
  const vekaletText = prevSeason.rows[0]?.vekalet_text || {
    tr: "",
    uz: "",
    en: "",
    ar: ""
  };

  await dbQuery(
    `INSERT INTO kurban_seasons (year, eid_day_1, eid_day_2, eid_day_3, eid_day_4, sales_open_at, sales_close_at, is_active, auto_approve_videos, vekalet_version, vekalet_text)
     VALUES ($1, NULL, NULL, NULL, NULL, NULL, NULL, FALSE, FALSE, $2, $3::jsonb)
     ON CONFLICT (year) DO UPDATE SET
       eid_day_1 = NULL,
       sales_open_at = NULL,
       sales_close_at = NULL,
       is_active = FALSE,
       updated_at = NOW()`,
    [toYear, `v${toYear}.1`, JSON.stringify(vekaletText)]
  );

  const prevOffers = await dbQuery(
    `SELECT country_code, animal_type, shares_per_animal
     FROM kurban_offers
     WHERE season_year = $1`,
    [fromYear]
  );

  let copiedOffers = 0;
  for (const off of prevOffers.rows) {
    await dbQuery(
      `INSERT INTO kurban_offers (season_year, country_code, animal_type, shares_per_animal, price_per_share_try, quota_shares, sold_shares, is_active)
       VALUES ($1, $2, $3, $4, 0, 0, 0, FALSE)
       ON CONFLICT (season_year, country_code, animal_type) DO UPDATE SET
         price_per_share_try = 0,
         quota_shares = 0,
         sold_shares = 0,
         is_active = FALSE`,
      [toYear, off.country_code, off.animal_type, off.shares_per_animal]
    );
    copiedOffers++;
  }

  return { fromYear, toYear, copiedOffers, datesCleared: true, pricesCleared: true };
}

// ============================================================================
// 1-QADAM: OYLIK TAKRORIY XAYRIYA (RECURRING SUBSCRIPTIONS & DUNNING)
// ============================================================================

export async function createRecurringSubscription(input: {
  donorPhone?: string;
  donorEmail?: string;
  donorName: string;
  campaignSlug: string;
  amountTry: number;
  billingDay: number;
  cardToken?: string;
}) {
  requireFeatureFlag("RECURRING_ENABLED");
  if (!Number.isInteger(input.billingDay) || input.billingDay < 1 || input.billingDay > 28) {
    throw new Error("Billing day must be between 1 and 28");
  }
  if (!Number.isFinite(input.amountTry) || input.amountTry <= 0) {
    throw new Error("Monthly amount must be greater than 0");
  }

  await ensureSchema();
  const externalId = crypto.randomUUID();
  const cardToken = input.cardToken || `iyzi_card_tok_${crypto.randomBytes(8).toString("hex")}`;
  const providerSubRef = `iyzi_sub_${crypto.randomBytes(8).toString("hex")}`;

  const res = await dbQuery(
    `INSERT INTO recurring_subscriptions (
       external_id, donor_phone, donor_email, donor_name, campaign_slug,
       amount_try, billing_day, card_token, provider_sub_ref, status
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
     RETURNING *`,
    [
      externalId,
      input.donorPhone || null,
      input.donorEmail || null,
      input.donorName.trim(),
      input.campaignSlug,
      input.amountTry,
      input.billingDay,
      cardToken,
      providerSubRef
    ]
  );

  if (input.donorEmail) {
    await dbQuery(
      `UPDATE newsletter_subscribers SET is_monthly_donor = TRUE, updated_at = NOW() WHERE email = $1`,
      [input.donorEmail.toLowerCase()]
    );
  }

  return res.rows[0]!;
}

export async function manageRecurringSubscription(params: {
  subscriptionExternalId: string;
  action: "update_amount" | "pause" | "cancel" | "update_card";
  newAmountTry?: number;
  pauseMonths?: 1 | 2 | 3;
  newCardToken?: string;
}) {
  requireFeatureFlag("RECURRING_ENABLED");
  await ensureSchema();

  if (params.action === "update_amount") {
    if (!params.newAmountTry || params.newAmountTry <= 0) {
      throw new Error("Invalid newAmountTry");
    }
    const res = await dbQuery(
      `UPDATE recurring_subscriptions
       SET amount_try = $2, updated_at = NOW()
       WHERE external_id = $1::uuid
       RETURNING *`,
      [params.subscriptionExternalId, params.newAmountTry]
    );
    return res.rows[0];
  }

  if (params.action === "pause") {
    const months = Math.min(3, Math.max(1, Number(params.pauseMonths || 1)));
    const res = await dbQuery(
      `UPDATE recurring_subscriptions
       SET status = 'paused',
           pause_until = (CURRENT_DATE + ($2 || ' months')::interval)::date,
           updated_at = NOW()
       WHERE external_id = $1::uuid
       RETURNING *`,
      [params.subscriptionExternalId, String(months)]
    );
    return res.rows[0];
  }

  if (params.action === "cancel") {
    const res = await dbQuery(
      `UPDATE recurring_subscriptions
       SET status = 'cancelled',
           next_retry_at = NULL,
           updated_at = NOW()
       WHERE external_id = $1::uuid
       RETURNING *`,
      [params.subscriptionExternalId]
    );
    return res.rows[0];
  }

  if (params.action === "update_card") {
    if (!params.newCardToken) throw new Error("newCardToken required");
    const res = await dbQuery(
      `UPDATE recurring_subscriptions
       SET card_token = $2,
           status = CASE WHEN status = 'paused' THEN 'active' ELSE status END,
           dunning_attempt = 0,
           next_retry_at = NULL,
           updated_at = NOW()
       WHERE external_id = $1::uuid
       RETURNING *`,
      [params.subscriptionExternalId, params.newCardToken]
    );
    return res.rows[0];
  }

  throw new Error("Unknown subscription action");
}

/**
 * Oylik to'lov webhook va Dunning (1, 3 va 7 kundan keyin qayta urinish -> 3-urinishdan keyin paused).
 */
export async function processRecurringSubscriptionWebhook(params: {
  rawBody: string;
  signatureHeader: string | null;
}) {
  requireFeatureFlag("RECURRING_ENABLED");
  await ensureSchema();
  const expectedSig = signWebhookPayload(params.rawBody);
  if (!params.signatureHeader || params.signatureHeader !== expectedSig) {
    const err: any = new Error("Invalid subscription webhook signature");
    err.statusCode = 401;
    throw err;
  }

  const payload = JSON.parse(params.rawBody);
  const eventId = String(payload.eventId || "");
  const subExternalId = String(payload.subscriptionExternalId || "");
  const eventStatus = String(payload.status || "").toLowerCase();

  if (!eventId || !subExternalId) {
    throw new Error("Missing eventId or subscriptionExternalId");
  }

  const evIns = await dbQuery(
    `INSERT INTO webhook_events (provider, event_id, payload)
     VALUES ('iyzico-subscription', $1, $2::jsonb)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [eventId, JSON.stringify(payload)]
  );
  if (evIns.rowCount === 0) {
    return { duplicate: true, status: "ignored" };
  }

  const subRes = await dbQuery(`SELECT * FROM recurring_subscriptions WHERE external_id = $1::uuid LIMIT 1`, [
    subExternalId
  ]);
  const sub = subRes.rows[0];
  if (!sub) {
    throw new Error("Subscription not found");
  }

  // Bekor qilingan abonelikdan to'lov olinmaydi!
  if (sub.status === "cancelled") {
    return { duplicate: false, status: "rejected_cancelled_subscription" };
  }

  if (eventStatus === "paid" || eventStatus === "success") {
    const donationExtId = crypto.randomUUID();
    const publicNo = `EZ-SUB-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 899)}`;
    const isTest = process.env.DONATIONS_LIVE !== "true";

    await dbQuery(
      `INSERT INTO donations (
         external_id, public_no, origin_host, locale, status, is_test, frequency, provider,
         amount, currency, amount_try, purpose_code, purpose_title, restricted,
         donor_name, donor_phone, donor_email, is_anonymous, kvkk_consent, want_receipt, paid_at
       ) VALUES (
         $1::uuid, $2, 'ezanvakfi.org', 'tr', 'paid', $3, 'monthly', 'iyzico',
         $4, 'TRY', $4, $5, $6, TRUE,
         $7, $8, $9, FALSE, TRUE, FALSE, NOW()
       )`,
      [
        donationExtId,
        publicNo,
        isTest,
        Number(sub.amount_try),
        sub.campaign_slug.toUpperCase(),
        `Aylık Düzenli Bağış: ${sub.campaign_slug}`,
        sub.donor_name,
        sub.donor_phone,
        sub.donor_email
      ]
    );

    await dbQuery(
      `UPDATE recurring_subscriptions
       SET dunning_attempt = 0,
           next_retry_at = NULL,
           last_charged_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [sub.id]
    );

    return { duplicate: false, status: "paid", donationExternalId: donationExtId, publicNo };
  }

  // To'lov o'tmasa (Dunning): 1, 3 va 7 kundan keyin qayta urinish, har birida SMS + e-pochta
  const nextAttempt = Number(sub.dunning_attempt || 0) + 1;
  const retryDaysMap: Record<number, number> = { 1: 1, 2: 3, 3: 7 };
  const retryDays = retryDaysMap[nextAttempt] || null;
  const newStatus = nextAttempt >= 3 ? "paused" : sub.status;
  const updateLink = `https://ezanvakfi.org/tr/hesabim?sub=${sub.external_id}&action=update_card`;

  await dbQuery(
    `UPDATE recurring_subscriptions
     SET dunning_attempt = $2,
         status = $3,
         next_retry_at = CASE WHEN $4::int IS NOT NULL THEN NOW() + ($4 || ' days')::interval ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1`,
    [sub.id, nextAttempt, newStatus, retryDays]
  );

  if (sub.donor_phone) {
    await dbQuery(
      `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
       VALUES ('sms', $1, 'Dunning SMS', $2, 'sent')`,
      [sub.donor_phone, `Ezan Vakfi aylik bagis odemesi alinamadi (Deneme ${nextAttempt}/3). Kart guncelleme: ${updateLink}`]
    );
  }
  if (sub.donor_email) {
    await dbQuery(
      `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
       VALUES ('email', $1, 'Ezan Vakfı – Aylık Bağış Kart Güncelleme Hatırlatması', $2, 'sent')`,
      [
        sub.donor_email,
        `Sayın ${sub.donor_name}, aylık bağış ödemeniz (${sub.amount_try} TRY) tahsil edilemedi (Deneme ${nextAttempt}/3). Kartınızı güncellemek için: ${updateLink}`
      ]
    );
  }

  return {
    duplicate: false,
    status: newStatus,
    dunningAttempt: nextAttempt,
    nextRetryInDays: retryDays
  };
}

// ============================================================================
// 2-QADAM: RAMAZON AVTOMATIK XAYRIYASI (30 KECHA)
// ============================================================================

export async function createRamadanAutopayPlan(input: {
  year?: number;
  donorPhone?: string;
  donorEmail?: string;
  donorName: string;
  campaignSlug: string;
  nightlyAmountTry: number;
  lastTenMultiplier?: number;
  cardToken?: string;
}) {
  requireFeatureFlag("RAMADAN_AUTOPAY_ENABLED");
  await ensureSchema();
  const year = input.year || 2027;
  const ramadanRes = await dbQuery(`SELECT * FROM cms_ramadan_settings WHERE year = $1 LIMIT 1`, [year]);
  const startDateStr = ramadanRes.rows[0]?.ramadan_start_date
    ? new Date(ramadanRes.rows[0].ramadan_start_date).toISOString().slice(0, 10)
    : `${year}-02-08`;

  const multiplier = Math.max(1, Number(input.lastTenMultiplier || 1));
  const baseDate = new Date(`${startDateStr}T00:00:00Z`);

  const nightsSchedule = Array.from({ length: 30 }, (_, idx) => {
    const night = idx + 1;
    const isLastTen = night >= 21;
    const amountTry = Math.round(input.nightlyAmountTry * (isLastTen ? multiplier : 1) * 100) / 100;
    const nightDate = new Date(baseDate.getTime() + idx * 24 * 3600 * 1000).toISOString().slice(0, 10);
    return {
      night,
      date: nightDate,
      isLastTen,
      amountTry,
      status: "scheduled" as "scheduled" | "paid" | "skipped",
      donationExternalId: null as string | null
    };
  });

  const externalId = crypto.randomUUID();
  const cardToken = input.cardToken || `iyzi_ramadan_tok_${crypto.randomBytes(8).toString("hex")}`;

  const ins = await dbQuery(
    `INSERT INTO ramadan_autopay_plans (
       external_id, year, donor_phone, donor_email, donor_name, campaign_slug,
       nightly_amount_try, last_ten_multiplier, card_token, status, nights_schedule
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10::jsonb)
     RETURNING *`,
    [
      externalId,
      year,
      input.donorPhone || null,
      input.donorEmail || null,
      input.donorName.trim(),
      input.campaignSlug,
      input.nightlyAmountTry,
      multiplier,
      cardToken,
      JSON.stringify(nightsSchedule)
    ]
  );

  return ins.rows[0]!;
}

export async function simulateAccelerated30NightsSandbox(planExternalId: string) {
  requireFeatureFlag("RAMADAN_AUTOPAY_ENABLED");
  await ensureSchema();
  const planRes = await dbQuery(`SELECT * FROM ramadan_autopay_plans WHERE external_id = $1::uuid LIMIT 1`, [
    planExternalId
  ]);
  const plan = planRes.rows[0];
  if (!plan) throw new Error("Ramadan autopay plan not found");

  const schedule: Array<any> = Array.isArray(plan.nights_schedule) ? [...plan.nights_schedule] : [];
  let totalChargedTry = 0;
  let chargedNightsCount = 0;

  for (const item of schedule) {
    if (item.status === "paid") continue;
    const donationExtId = crypto.randomUUID();
    const publicNo = `EZ-RMZ-${plan.year}-N${String(item.night).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 8999)}`;

    await dbQuery(
      `INSERT INTO donations (
         external_id, public_no, origin_host, locale, status, is_test, frequency, provider,
         amount, currency, amount_try, purpose_code, purpose_title, restricted,
         donor_name, donor_phone, donor_email, is_anonymous, kvkk_consent, want_receipt, paid_at
       ) VALUES (
         $1::uuid, $2, 'ezanvakfi.org', 'tr', 'paid', TRUE, 'one_time', 'mock',
         $3, 'TRY', $3, $4, $5, TRUE,
         $6, $7, $8, FALSE, TRUE, FALSE, NOW()
       )`,
      [
        donationExtId,
        publicNo,
        Number(item.amountTry),
        plan.campaign_slug.toUpperCase(),
        `Ramazan ${plan.year} Otomatik Bağış (${item.night}. Gece)`,
        plan.donor_name,
        plan.donor_phone,
        plan.donor_email
      ]
    );

    item.status = "paid";
    item.donationExternalId = donationExtId;
    totalChargedTry += Number(item.amountTry);
    chargedNightsCount++;
  }

  await dbQuery(
    `UPDATE ramadan_autopay_plans
     SET status = 'completed',
         nights_schedule = $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [plan.id, JSON.stringify(schedule)]
  );

  // Ramazon tugagach bitta umumiy makbuz va rahmat xati
  if (plan.donor_email) {
    await dbQuery(
      `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
       VALUES ('email', $1, $2, $3, 'sent')`,
      [
        plan.donor_email,
        `Ezan Vakfı – Ramazan ${plan.year} 30 Gece Toplu Bağış Makbuzu ve Teşekkür Mektubu`,
        `Sayın ${plan.donor_name}, Ramazan boyunca 30 gece (Kadir Gecesi ve son 10 gece dahil) toplam ${totalChargedTry.toFixed(2)} TRY tutarındaki bağışlarınız kabul edilmiştir. Allah kabul etsin.`
      ]
    );
  }

  return {
    planExternalId,
    chargedNightsCount,
    totalChargedTry: Math.round(totalChargedTry * 100) / 100,
    status: "completed"
  };
}

// ============================================================================
// 3-QADAM: SHAXSIY YIG'IM (P2P), SOVG'A XAYRIYA VA NOMLI LOYIHALAR
// ============================================================================

export async function createP2pCampaign(input: {
  slug: string;
  ownerPhone?: string;
  ownerEmail?: string;
  ownerName: string;
  targetCampaignSlug: string;
  title: Record<Locale, string>;
  story: Record<Locale, string>;
  photoUrl?: string;
  goalAmountTry: number;
}) {
  requireFeatureFlag("P2P_ENABLED");
  await ensureSchema();
  const cleanSlug = input.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const res = await dbQuery(
    `INSERT INTO p2p_campaigns (
       slug, owner_phone, owner_email, owner_name, target_campaign_slug,
       title, story, photo_url, goal_amount_try, status
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, 'pending_review')
     RETURNING *`,
    [
      cleanSlug,
      input.ownerPhone || null,
      input.ownerEmail || null,
      input.ownerName.trim(),
      input.targetCampaignSlug,
      JSON.stringify(input.title),
      JSON.stringify(input.story),
      input.photoUrl || null,
      input.goalAmountTry
    ]
  );
  return res.rows[0]!;
}

export async function moderateP2pCampaign(slug: string, status: "approved" | "rejected") {
  requireFeatureFlag("P2P_ENABLED");
  await ensureSchema();
  const res = await dbQuery(
    `UPDATE p2p_campaigns SET status = $2, updated_at = NOW() WHERE slug = $1 RETURNING *`,
    [slug, status]
  );
  return res.rows[0];
}

export async function contributeToP2pCampaign(slug: string, amountTry: number) {
  requireFeatureFlag("P2P_ENABLED");
  await ensureSchema();
  const p2pRes = await dbQuery(`SELECT * FROM p2p_campaigns WHERE slug = $1 AND status = 'approved' LIMIT 1`, [slug]);
  const p2p = p2pRes.rows[0];
  if (!p2p) throw new Error("Approved P2P campaign not found");

  const updated = await dbQuery(
    `UPDATE p2p_campaigns
     SET collected_amount_try = collected_amount_try + $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [p2p.id, amountTry]
  );
  const row = updated.rows[0]!;
  const reachedGoal = Number(row.collected_amount_try) >= Number(row.goal_amount_try);

  if (row.owner_email) {
    await dbQuery(
      `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
       VALUES ('email', $1, $2, $3, 'sent')`,
      [
        row.owner_email,
        reachedGoal ? "Hedefinize Ulaştınız! – Ezan Vakfı Destek Sayfası" : "Destek Sayfanıza Yeni Bağış Geldi!",
        `Sayın ${row.owner_name}, destek sayfanıza ${amountTry} TRY bağış yapıldı. Toplam: ${row.collected_amount_try} / ${row.goal_amount_try} TRY.`
      ]
    );
  }

  return { p2p: row, reachedGoal, targetCampaignSlug: row.target_campaign_slug };
}

export async function createGiftDonationCard(input: {
  donationId?: number;
  occasion: "birthday" | "wedding" | "condolence" | "eid";
  senderName: string;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  personalMessage?: string;
  locale: Locale;
}) {
  requireFeatureFlag("GIFT_ENABLED");
  await ensureSchema();
  const cardToken = crypto.randomBytes(24).toString("hex");
  const res = await dbQuery(
    `INSERT INTO gift_donations (
       donation_id, occasion, sender_name, recipient_name, recipient_email, recipient_phone,
       personal_message, locale, card_token
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.donationId || null,
      input.occasion,
      input.senderName,
      input.recipientName,
      input.recipientEmail || null,
      input.recipientPhone || null,
      input.personalMessage || null,
      input.locale,
      cardToken
    ]
  );

  const shareUrl = `https://ezanvakfi.org/${input.locale}/bagis/hediye/${cardToken}`;
  if (input.recipientEmail) {
    await dbQuery(
      `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
       VALUES ('email', $1, $2, $3, 'sent')`,
      [
        input.recipientEmail,
        `Ezan Vakfı – ${input.senderName} Adınıza Hayır Bağışında Bulundu`,
        `Sayın ${input.recipientName}, ${input.senderName} sizin adınıza Ezan Vakfı'na bağışta bulundu. E-Kartınız: ${shareUrl}`
      ]
    );
  }

  return { gift: res.rows[0]!, eCardUrl: shareUrl };
}

export async function createOrUpdateNamedProject(input: {
  code: string;
  category: "water_well" | "classroom" | "bookshelf";
  dedicationName: string;
  sponsorPhone?: string;
  sponsorEmail?: string;
  targetAmountTry: number;
  fundedAmountTry?: number;
  stage?: "collecting" | "building" | "completed";
  title: Record<Locale, string>;
  reportNote?: string;
  reportMediaUrl?: string;
}) {
  requireFeatureFlag("NAMED_PROJECTS_ENABLED");
  await ensureSchema();
  const existing = await dbQuery(`SELECT * FROM named_projects WHERE code = $1 LIMIT 1`, [input.code]);
  const prevUpdates = Array.isArray(existing.rows[0]?.updates) ? existing.rows[0].updates : [];
  const nextUpdates = input.reportNote
    ? [
        ...prevUpdates,
        {
          stage: input.stage || "collecting",
          note: input.reportNote,
          mediaUrl: input.reportMediaUrl || null,
          at: new Date().toISOString()
        }
      ]
    : prevUpdates;

  const res = await dbQuery(
    `INSERT INTO named_projects (
       code, category, dedication_name, sponsor_phone, sponsor_email,
       target_amount_try, funded_amount_try, stage, title, updates
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
     ON CONFLICT (code) DO UPDATE SET
       funded_amount_try = COALESCE($7, named_projects.funded_amount_try),
       stage = COALESCE($8, named_projects.stage),
       updates = $10::jsonb,
       updated_at = NOW()
     RETURNING *`,
    [
      input.code,
      input.category,
      input.dedicationName,
      input.sponsorPhone || null,
      input.sponsorEmail || null,
      input.targetAmountTry,
      input.fundedAmountTry ?? 0,
      input.stage || "collecting",
      JSON.stringify(input.title),
      JSON.stringify(nextUpdates)
    ]
  );

  if (input.sponsorEmail && input.reportNote) {
    await dbQuery(
      `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
       VALUES ('email', $1, $2, $3, 'sent')`,
      [
        input.sponsorEmail,
        `Ezan Vakfı – Kalıcı Eser (${input.code}) Durum Güncellemesi: ${input.stage}`,
        `Sayın Bağışçımız, "${input.dedicationName}" adına yürütülen ${input.code} kodlu eser "${input.stage}" aşamasına geçmiştir. Rapor: ${input.reportNote}`
      ]
    );
  }

  return res.rows[0]!;
}

// ============================================================================
// 5-QADAM: OBUNACHILARGA XATLAR (DOUBLE OPT-IN) VA IYS INTEGRATSIYASI
// ============================================================================

export async function subscribeNewsletterDoubleOptIn(input: {
  email: string;
  phone?: string;
  locale: Locale;
  interests: string[];
}) {
  requireFeatureFlag("NEWSLETTER_ENABLED");
  await ensureSchema();
  const cleanEmail = input.email.trim().toLowerCase();
  const confirmToken = crypto.randomBytes(24).toString("hex");
  const unsubscribeToken = crypto.randomBytes(24).toString("hex");

  const res = await dbQuery(
    `INSERT INTO newsletter_subscribers (
       email, phone, locale, interests, status, confirm_token, unsubscribe_token, iys_status
     ) VALUES ($1, $2, $3, $4::jsonb, 'pending_confirm', $5, $6, 'not_synced')
     ON CONFLICT (email) DO UPDATE SET
       locale = EXCLUDED.locale,
       interests = EXCLUDED.interests,
       confirm_token = EXCLUDED.confirm_token,
       updated_at = NOW()
     RETURNING *`,
    [cleanEmail, input.phone || null, input.locale, JSON.stringify(input.interests), confirmToken, unsubscribeToken]
  );

  await dbQuery(
    `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
     VALUES ('email', $1, 'Ezan Vakfı Bülten Aboneliği Onayı (Double Opt-In)', $2, 'sent')`,
    [
      cleanEmail,
      `Aboneliğinizi onaylamak için tıklayın: https://news.ezanvakfi.org/confirm?token=${confirmToken}`
    ]
  );

  return res.rows[0]!;
}

export async function confirmNewsletterSubscription(confirmToken: string) {
  requireFeatureFlag("NEWSLETTER_ENABLED");
  await ensureSchema();
  const iysEnabled = getGrowthFeatureFlags().IYS_ENABLED;
  const iysStatus = iysEnabled ? "iys_registered_onay" : "local_consent_only";

  const res = await dbQuery(
    `UPDATE newsletter_subscribers
     SET status = 'confirmed',
         iys_status = $2,
         iys_consent_at = NOW(),
         updated_at = NOW()
     WHERE confirm_token = $1
     RETURNING *`,
    [confirmToken, iysStatus]
  );
  return res.rows[0];
}

export async function unsubscribeNewsletterOneClick(unsubscribeToken: string) {
  requireFeatureFlag("NEWSLETTER_ENABLED");
  await ensureSchema();
  const iysEnabled = getGrowthFeatureFlags().IYS_ENABLED;
  const iysStatus = iysEnabled ? "iys_revoked_ret" : "unsubscribed_local";

  const res = await dbQuery(
    `UPDATE newsletter_subscribers
     SET status = 'unsubscribed',
         iys_status = $2,
         updated_at = NOW()
     WHERE unsubscribe_token = $1
     RETURNING *`,
    [unsubscribeToken, iysStatus]
  );
  return res.rows[0];
}

// ============================================================================
// 6-QADAM: BANK O'TKAZMALARINI SOLISHTIRISH (HAVALE / EFT RECONCILIATION)
// ============================================================================

export async function generateBankTransferCode(input: {
  donorPhone?: string;
  donorEmail?: string;
  donorName?: string;
  campaignSlug: string;
}) {
  requireFeatureFlag("BANK_IMPORT_ENABLED");
  await ensureSchema();
  const rawHash = crypto
    .createHash("sha256")
    .update(`${input.donorPhone || ""}:${input.donorEmail || ""}:${input.campaignSlug}`)
    .digest("hex")
    .toUpperCase();
  const code = `EZ${rawHash.slice(0, 4)}`;

  await dbQuery(
    `INSERT INTO bank_transfer_codes (code, donor_phone, donor_email, donor_name, campaign_slug)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (code) DO UPDATE SET
       campaign_slug = EXCLUDED.campaign_slug`,
    [code, input.donorPhone || null, input.donorEmail || null, input.donorName || null, input.campaignSlug]
  );

  return code;
}

export async function importBankStatementCsvRows(
  rows: Array<{ txDate: string; amountTry: number; senderName: string; description: string }>
) {
  requireFeatureFlag("BANK_IMPORT_ENABLED");
  await ensureSchema();
  let inserted = 0;
  let duplicatesSkipped = 0;
  let autoMatched = 0;

  for (const r of rows) {
    const rowHash = crypto
      .createHash("sha256")
      .update(`${r.txDate}|${Number(r.amountTry).toFixed(2)}|${r.description.trim()}`)
      .digest("hex");

    const codeMatch = r.description.toUpperCase().match(/\b(EZ[A-Z0-9]{3,6})\b/);
    let matchedCode: string | null = null;
    let matchedDonationId: number | null = null;
    let status: "unmatched" | "matched" | "confirmed" = "unmatched";

    if (codeMatch?.[1]) {
      const codeLookup = await dbQuery(`SELECT * FROM bank_transfer_codes WHERE code = $1 LIMIT 1`, [codeMatch[1]]);
      if (codeLookup.rowCount > 0) {
        matchedCode = codeMatch[1];
        status = "confirmed";
      }
    }

    const ins = await dbQuery(
      `INSERT INTO bank_statement_rows (row_hash, tx_date, amount_try, sender_name, description, matched_code, status)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7)
       ON CONFLICT (row_hash) DO NOTHING
       RETURNING *`,
      [rowHash, r.txDate, r.amountTry, r.senderName, r.description, matchedCode, status]
    );

    if (ins.rowCount === 0) {
      duplicatesSkipped++;
      continue;
    }

    inserted++;

    if (matchedCode) {
      const codeRow = (await dbQuery(`SELECT * FROM bank_transfer_codes WHERE code = $1 LIMIT 1`, [matchedCode]))
        .rows[0]!;
      const extId = crypto.randomUUID();
      const pubNo = `EZ-BNK-${Date.now().toString().slice(-6)}-${inserted}`;
      const isTest = process.env.DONATIONS_LIVE !== "true";
      const donIns = await dbQuery<{ id: number }>(
        `INSERT INTO donations (
           external_id, public_no, origin_host, locale, status, is_test, frequency, provider,
           amount, currency, amount_try, purpose_code, purpose_title, restricted,
           donor_name, donor_phone, donor_email, is_anonymous, kvkk_consent, want_receipt, paid_at
         ) VALUES (
           $1::uuid, $2, 'ezanvakfi.org', 'tr', 'paid', $3, 'one_time', 'bank_eft',
           $4, 'TRY', $4, $5, $6, TRUE,
           $7, $8, $9, FALSE, TRUE, TRUE, NOW()
         )
         RETURNING id`,
        [
          extId,
          pubNo,
          isTest,
          r.amountTry,
          codeRow.campaign_slug.toUpperCase(),
          `Banka Havale/EFT: ${codeRow.campaign_slug} (${matchedCode})`,
          codeRow.donor_name || r.senderName || "Banka Bağışçısı",
          codeRow.donor_phone || null,
          codeRow.donor_email || null
        ]
      );
      matchedDonationId = donIns.rows[0]!.id;
      await dbQuery(`UPDATE bank_statement_rows SET matched_donation_id = $2 WHERE id = $1`, [
        ins.rows[0]!.id,
        matchedDonationId
      ]);
      autoMatched++;
    }
  }

  return { inserted, duplicatesSkipped, autoMatched };
}

// ============================================================================
// 8-QADAM: MOBIL ILOVA UCHUN OCHIQ API (/api/v1 & OPENAPI 3.1)
// ============================================================================

export async function issueMobileApiTokens(params: {
  donorPhone?: string;
  donorEmail?: string;
  deviceId: string;
}) {
  requireFeatureFlag("API_V1_ENABLED");
  await ensureSchema();
  const accessToken = `ezm_at_${crypto.randomBytes(24).toString("hex")}`;
  const refreshToken = `ezm_rt_${crypto.randomBytes(32).toString("hex")}`;
  const accessHash = crypto.createHash("sha256").update(accessToken).digest("hex");
  const refreshHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

  await dbQuery(
    `INSERT INTO mobile_api_tokens (
       donor_phone, donor_email, device_id, access_token_hash, refresh_token_hash,
       access_expires_at, refresh_expires_at
     ) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 hour', NOW() + INTERVAL '30 days')`,
    [params.donorPhone || null, params.donorEmail || null, params.deviceId, accessHash, refreshHash]
  );

  return {
    accessToken,
    refreshToken,
    expiresInSeconds: 3600,
    tokenType: "Bearer"
  };
}

export async function revokeMobileDeviceTokens(deviceId: string) {
  requireFeatureFlag("API_V1_ENABLED");
  await ensureSchema();
  const res = await dbQuery(
    `UPDATE mobile_api_tokens SET revoked_at = NOW() WHERE device_id = $1 AND revoked_at IS NULL RETURNING id`,
    [deviceId]
  );
  return { revokedCount: res.rowCount };
}

export function getOpenApiV1Spec() {
  requireFeatureFlag("API_V1_ENABLED");
  return {
    openapi: "3.1.0",
    info: {
      title: "Ezan Vakfı Public & Mobile API",
      version: "1.0.0",
      description: "Barqaror, versiyalangan mobil va integratsiya API (/api/v1)"
    },
    paths: {
      "/api/v1/campaigns": {
        get: {
          summary: "Kampaniyalar va loyihalar ro'yxati (4 tilda)",
          parameters: [{ name: "locale", in: "query", schema: { type: "string", enum: ["tr", "uz", "en", "ar"] } }],
          responses: { "200": { description: "OK" } }
        }
      },
      "/api/v1/content": {
        get: {
          summary: "Videolar va yangiliklar ro'yxati",
          responses: { "200": { description: "OK" } }
        }
      },
      "/api/v1/donations/checkout": {
        post: {
          summary: "Xayriya boshlash (iyzico WebView checkout havolasini qaytaradi)",
          responses: { "201": { description: "Checkout initialized" } }
        }
      },
      "/api/v1/cabinet": {
        get: {
          summary: "Mobil kabinet (Bearer accessToken orqali xayriyalar, qurbonliklar, makbuzlar)",
          responses: { "200": { description: "OK" }, "401": { description: "Unauthorized" } }
        }
      },
      "/api/v1/devices/fcm": {
        post: {
          summary: "Push bildirishnomalar uchun FCM qurilma tokenini ro'yxatdan o'tkazish",
          responses: { "200": { description: "Registered" } }
        }
      }
    }
  };
}


// ============================================================================
// 4-QADAM: TA'SIR HISOBOTI ("XAYRIYANGIZ QAYERGA KETDI") VA YILLIK HISOBOT
// ============================================================================

export async function publishProjectUpdate(input: {
  projectSlug: string;
  locale: Locale;
  title: Record<Locale, string>;
  summary: Record<Locale, string>;
  metrics: Array<{ label: Record<Locale, string>; value: string; isVerified: boolean }>;
  photos: string[];
  pdfReportUrl?: string;
  status: "draft" | "published";
}) {
  await ensureSchema();
  const cleanMetrics = input.metrics.filter((m) => m.isVerified && m.value && !m.value.includes("[TASLIK]"));
  const bodyPayload = {
    summary: input.summary,
    metrics: cleanMetrics,
    pdfReportUrl: input.pdfReportUrl || null,
    status: input.status
  };
  const res = await dbQuery(
    `INSERT INTO project_updates (
       project_slug, title, body, media_urls, notified_at
     ) VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, CASE WHEN $5 = 'published' THEN NOW() ELSE NULL END)
     RETURNING *`,
    [
      input.projectSlug,
      JSON.stringify(input.title),
      JSON.stringify(bodyPayload),
      JSON.stringify(input.photos),
      input.status
    ]
  );

  if (input.status === "published") {
    const donors = await dbQuery<{ donor_email: string | null }>(
      `SELECT DISTINCT donor_email
       FROM donations
       WHERE status = 'paid'
         AND is_test = FALSE
         AND donor_email IS NOT NULL
         AND LOWER(purpose_code) = LOWER($1)`,
      [input.projectSlug]
    );
    for (const d of donors.rows) {
      if (d.donor_email) {
        await dbQuery(
          `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
           VALUES ('email', $1, $2, $3, 'sent')`,
          [
            d.donor_email,
            `Ezan Vakfı – Desteklediğiniz "${input.title.tr}" Projesinden Yeni Rapor`,
            `${input.summary.tr}\nDetaylar: https://ezanvakfi.org/${input.locale}/projeler/${input.projectSlug}`
          ]
        );
      }
    }
  }

  return {
    ...res.rows[0]!,
    metrics: cleanMetrics
  };
}

export async function getDonorImpactSummary(donorEmailOrPhone: string) {
  await ensureSchema();
  const donationsRes = await dbQuery<{
    purpose_code: string;
    purpose_title: string;
    total_try: string;
    tx_count: string;
  }>(
    `SELECT purpose_code, MAX(purpose_title) AS purpose_title,
            COALESCE(SUM(amount_try), 0)::text AS total_try,
            COUNT(*)::text AS tx_count
     FROM donations
     WHERE status = 'paid'
       AND is_test = FALSE
       AND (donor_email = $1 OR donor_phone = $1)
     GROUP BY purpose_code`,
    [donorEmailOrPhone]
  );

  const updatesRes = await dbQuery(
    `SELECT * FROM project_updates ORDER BY created_at DESC LIMIT 20`
  );

  return {
    supportedPurposes: donationsRes.rows.map((r) => ({
      purposeCode: r.purpose_code,
      purposeTitle: r.purpose_title,
      totalTry: Number(r.total_try),
      donationCount: Number(r.tx_count),
      updates: updatesRes.rows.filter(
        (u) => String(u.project_slug).toLowerCase() === String(r.purpose_code).toLowerCase()
      )
    }))
  };
}

export async function upsertAnnualReport(input: {
  year: number;
  status: "draft" | "published";
  title: Record<Locale, string>;
  summary: Record<Locale, string>;
  incomeBreakdown: Array<{ source: string; amountTry: number }>;
  expenseBreakdown: Array<{ category: string; amountTry: number }>;
  auditPdfUrl?: string;
}) {
  await ensureSchema();
  const totalDonationsTry = input.incomeBreakdown.reduce((acc, i) => acc + Number(i.amountTry || 0), 0);
  const res = await dbQuery(
    `INSERT INTO annual_reports (
       year, is_published, total_donations_try, allocation_breakdown, kurban_stats, projects_map, auditor_pdf_url
     ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)
     ON CONFLICT (year) DO UPDATE SET
       is_published = EXCLUDED.is_published,
       total_donations_try = EXCLUDED.total_donations_try,
       allocation_breakdown = EXCLUDED.allocation_breakdown,
       kurban_stats = EXCLUDED.kurban_stats,
       projects_map = EXCLUDED.projects_map,
       auditor_pdf_url = EXCLUDED.auditor_pdf_url,
       updated_at = NOW()
     RETURNING *`,
    [
      input.year,
      input.status === "published",
      totalDonationsTry,
      JSON.stringify(input.expenseBreakdown),
      JSON.stringify({ title: input.title, summary: input.summary }),
      JSON.stringify(input.incomeBreakdown),
      input.auditPdfUrl || null
    ]
  );
  return res.rows[0]!;
}

export async function getAnnualReportPageData(year: number) {
  await ensureSchema();
  const res = await dbQuery(`SELECT * FROM annual_reports WHERE year = $1 AND is_published = TRUE LIMIT 1`, [year]);
  const row = res.rows[0];
  if (!row) return null;
  return {
    ...row,
    title: row.kurban_stats?.title || {},
    summary: row.kurban_stats?.summary || {},
    income_breakdown: row.projects_map || [],
    expense_breakdown: row.allocation_breakdown || [],
    audit_pdf_url: row.auditor_pdf_url
  };
}

// ============================================================================
// 7-QADAM: YOUTUBE / INSTAGRAM AVTOMATIK SINXRON VA ULASHISH KARTALARI
// ============================================================================

export async function syncYouTubeVideosToDrafts(
  videos: Array<{
    videoId: string;
    title: string;
    description: string;
    publishedAt: string;
    thumbnailUrl: string;
  }>
) {
  await ensureSchema();
  let createdDrafts = 0;
  for (const v of videos) {
    const existing = await dbQuery(`SELECT id FROM cms_videos WHERE youtube_id = $1 LIMIT 1`, [v.videoId]);
    if (existing.rowCount === 0) {
      await dbQuery(
        `INSERT INTO cms_videos (
           youtube_id, status, category, title, description
         ) VALUES ($1, 'draft', 'youtube_sync', $2::jsonb, $3::jsonb)`,
        [
          v.videoId,
          JSON.stringify({ tr: v.title, uz: v.title, en: v.title, ar: v.title }),
          JSON.stringify({ tr: v.description, uz: v.description, en: v.description, ar: v.description })
        ]
      );
      createdDrafts++;
    }
  }
  return { syncedCount: videos.length, createdDrafts };
}

export async function syncInstagramPostsCache(
  posts: Array<{
    externalId: string;
    permalink: string;
    caption: string;
    mediaUrl: string;
    publishedAt: string;
  }>
) {
  requireFeatureFlag("INSTAGRAM_ENABLED");
  await ensureSchema();
  for (const p of posts.slice(0, 6)) {
    await dbQuery(
      `INSERT INTO social_posts_cache (platform, external_id, url, caption, thumbnail_url, published_at)
       VALUES ('instagram', $1, $2, $3, $4, $5::timestamptz)
       ON CONFLICT (external_id) DO UPDATE SET
         caption = EXCLUDED.caption,
         thumbnail_url = EXCLUDED.thumbnail_url,
         fetched_at = NOW()`,
      [p.externalId, p.permalink, p.caption, p.mediaUrl, p.publishedAt]
    );
  }
  const latest = await dbQuery(
    `SELECT * FROM social_posts_cache WHERE platform = 'instagram' ORDER BY published_at DESC LIMIT 6`
  );
  return latest.rows;
}

export function buildSocialShareLinksWithUtm(params: {
  pageUrl: string;
  title: string;
  campaignSlug: string;
}) {
  const makeUtmUrl = (source: string) => {
    const u = new URL(params.pageUrl);
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", "social_share");
    u.searchParams.set("utm_campaign", params.campaignSlug);
    return u.toString();
  };

  const waUrl = makeUtmUrl("whatsapp");
  const tgUrl = makeUtmUrl("telegram");
  const xUrl = makeUtmUrl("x");
  const copyUrl = makeUtmUrl("copy_link");

  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${params.title} - ${waUrl}`)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(tgUrl)}&text=${encodeURIComponent(params.title)}`,
    x: `https://x.com/intent/tweet?url=${encodeURIComponent(xUrl)}&text=${encodeURIComponent(params.title)}`,
    copyLink: copyUrl
  };
}

// ============================================================================
// 9-QADAM: ANALITIKA PANELI VA A/B TESTLAR (PII YO'Q)
// ============================================================================

export async function getAdminMonthlyAnalyticsDashboard() {
  await ensureSchema();
  const byCampaign = await dbQuery<{
    purpose_code: string;
    total_try: string;
    avg_try: string;
    tx_count: string;
  }>(
    `SELECT purpose_code,
            COALESCE(SUM(amount_try), 0)::text AS total_try,
            COALESCE(AVG(amount_try), 0)::text AS avg_try,
            COUNT(*)::text AS tx_count
     FROM donations
     WHERE status = 'paid' AND is_test = FALSE
     GROUP BY purpose_code
     ORDER BY SUM(amount_try) DESC`
  );

  const byLocale = await dbQuery<{ locale: string; total_try: string; tx_count: string }>(
    `SELECT locale, COALESCE(SUM(amount_try), 0)::text AS total_try, COUNT(*)::text AS tx_count
     FROM donations
     WHERE status = 'paid' AND is_test = FALSE
     GROUP BY locale`
  );

  const recurringVsOneTime = await dbQuery<{ frequency: string; total_try: string; tx_count: string }>(
    `SELECT frequency, COALESCE(SUM(amount_try), 0)::text AS total_try, COUNT(*)::text AS tx_count
     FROM donations
     WHERE status = 'paid' AND is_test = FALSE
     GROUP BY frequency`
  );

  const funnelSteps = await dbQuery<{ step: string; cnt: string }>(
    `SELECT event_name AS step, COUNT(*)::text AS cnt
     FROM analytics_funnel_events
     GROUP BY event_name`
  );

  return {
    byCampaign: byCampaign.rows.map((r) => ({
      purposeCode: r.purpose_code,
      totalTry: Number(r.total_try),
      avgTry: Math.round(Number(r.avg_try)),
      count: Number(r.tx_count)
    })),
    byLocale: byLocale.rows.map((r) => ({
      locale: r.locale,
      totalTry: Number(r.total_try),
      count: Number(r.tx_count)
    })),
    recurringVsOneTime: recurringVsOneTime.rows.map((r) => ({
      frequency: r.frequency,
      totalTry: Number(r.total_try),
      count: Number(r.tx_count)
    })),
    funnel: funnelSteps.rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.step] = Number(r.cnt);
      return acc;
    }, {})
  };
}

export function assignAbTestPresetVariant(sessionSeed: string): {
  experimentKey: "preset_amounts_2027" | "cta_copy_2027";
  variant: "A" | "B";
  presetsTry: number[];
  ctaLabel: Record<Locale, string>;
} {
  requireFeatureFlag("AB_TESTS_ENABLED");
  const hashByte = crypto.createHash("sha256").update(sessionSeed).digest()[0] ?? 0;
  const variant: "A" | "B" = hashByte % 2 === 0 ? "A" : "B";
  return {
    experimentKey: "preset_amounts_2027",
    variant,
    presetsTry: variant === "A" ? [250, 500, 1000, 2500] : [300, 750, 1500, 3000],
    ctaLabel:
      variant === "A"
        ? { tr: "Hemen Bağış Yap", uz: "Hozir xayriya qiling", en: "Donate Now", ar: "تبرع الآن" }
        : { tr: "Hayra Ortak Ol", uz: "Ezgu ishga sherik bo'ling", en: "Join the Good", ar: "شارك في الخير" }
  };
}
