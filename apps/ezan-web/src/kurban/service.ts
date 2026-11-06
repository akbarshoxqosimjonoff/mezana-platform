import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import { dbQuery, ensureSchema, getDbPool } from "../db/schema";
import { pickLocalized } from "../cms/service";
import { Locale } from "../i18n/country-locale";
import { SITE_CONFIG } from "../lib/config";
import { getPaymentProvider } from "../payments/service";
import { enqueueKurbanOrderStageMessages } from "./messaging";
import { generateSignedVideoUrl } from "./storage";

export type KurbanIntentionType = "vacip" | "adak" | "akika" | "sukur" | "nafile";
export type KurbanAnimalType = "sheep" | "goat" | "cattle" | "camel";

export const INTENTION_TYPES: { code: KurbanIntentionType; labels: Record<Locale, string> }[] = [
  { code: "vacip", labels: { tr: "Vacip Kurbanı", uz: "Vojib qurbonlik", en: "Wajib Qurbani", ar: "أضحية واجبة" } },
  { code: "adak", labels: { tr: "Adak Kurbanı", uz: "Atalgan (Nazr) qurbonlik", en: "Vow (Nadhr) Qurbani", ar: "أضحية نذر" } },
  { code: "akika", labels: { tr: "Akika Kurbanı", uz: "Aqiqa qurbonligi", en: "Aqiqah Qurbani", ar: "عقيقة" } },
  { code: "sukur", labels: { tr: "Şükür Kurbanı", uz: "Shukrona qurbonligi", en: "Gratitude (Shukr) Qurbani", ar: "أضحية شكر" } },
  { code: "nafile", labels: { tr: "Nafile Kurbanı", uz: "Nafl qurbonlik", en: "Voluntary (Nafl) Qurbani", ar: "أضحية نافلة" } }
];

/**
 * 6-qadam: Kuzatuv tokeni 32 bayt tasodifiy (64 ta hex belgi). Ketma-ket ID ishlatilmaydi.
 */
export function generateTrackingToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Dala ro'yxati (PDF) uchun ismlarni o'qishga qulay lotin yozuviga keltirish yordamchisi.
 */
export function transliterateToLatinForField(name: string): string {
  const cyrMap: Record<string, string> = {
    А: "A", Б: "B", В: "V", Г: "G", Ғ: "G'", Д: "D", Е: "E", Ё: "Yo", Ж: "J", З: "Z",
    И: "I", Й: "Y", К: "K", Қ: "Q", Л: "L", М: "M", Н: "N", О: "O", П: "P", Р: "R",
    С: "S", Т: "T", У: "U", Ў: "O'", Ф: "F", Х: "X", Ҳ: "H", Ц: "Ts", Ч: "Ch", Ш: "Sh",
    Ъ: "'", Э: "E", Ю: "Yu", Я: "Ya",
    а: "a", б: "b", в: "v", г: "g", ғ: "g'", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
    и: "i", й: "й", к: "k", қ: "q", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ў: "o'", ф: "f", х: "x", ҳ: "h", ц: "ts", ч: "ch", ш: "sh",
    ъ: "'", э: "e", ю: "yu", я: "ya"
  };
  return Array.from(name || "")
    .map((ch) => cyrMap[ch] ?? ch)
    .join("");
}

/**
 * 1-qadam va 2-qadam: Ommaviy Qurbonlik katalogi.
 * - Muddat faqat `kurban_seasons` jadvalidagi `sales_open_at` va `sales_close_at` bo'yicha tekshiriladi;
 * - Narxi (`price_per_share_try > 0`) va kvotasi (`quota_shares > 0`) kiritilmagan davlat saytda ko'rinmaydi;
 * - Ichki maydon (`partner_internal`) ommaviy javobga hech qachon qo'shilmaydi.
 */
export async function getPublicKurbanCatalog(locale: Locale, nowMs = Date.now()) {
  await ensureSchema();

  const seasonRes = await dbQuery(`SELECT * FROM kurban_seasons ORDER BY is_active DESC, year DESC LIMIT 1`);
  const season = seasonRes.rows[0];
  if (!season) {
    return {
      seasonYear: 2027,
      isActive: false,
      salesOpen: false,
      salesClosed: false,
      salesOpenAt: null,
      salesCloseAt: null,
      vekaletVersion: "v2027.1-taslik",
      vekaletText: "",
      countries: [],
      intentionTypes: INTENTION_TYPES.map((i) => ({ code: i.code, label: i.labels[locale] || i.labels.tr }))
    };
  }

  const salesOpenAtMs = season.sales_open_at ? new Date(season.sales_open_at).getTime() : null;
  const salesCloseAtMs = season.sales_close_at ? new Date(season.sales_close_at).getTime() : null;

  const cleanVekaletText = pickLocalized(season.vekalet_text, locale);
  const salesClosed = Boolean(salesCloseAtMs && nowMs > salesCloseAtMs);
  const salesNotOpenYet = Boolean(salesOpenAtMs && nowMs < salesOpenAtMs);
  // Vekalet matni bo'sh bo'lsa (yoki [TASLIK] bo'lsa), qurbonlik oqimi to'liq yopiq!
  const salesOpen = Boolean(season.is_active && !salesClosed && !salesNotOpenYet && cleanVekaletText.length > 0);

  const countriesRes = await dbQuery(
    `SELECT code, flag, is_active, name, description, gallery, needs_review
     FROM kurban_countries
     WHERE is_active = TRUE
     ORDER BY id ASC`
  );

  const offersRes = await dbQuery(
    `SELECT id, season_year, country_code, animal_type, shares_per_animal,
            price_per_share_try, quota_shares, sold_shares, is_active
     FROM kurban_offers
     WHERE season_year = $1
       AND is_active = TRUE
       AND price_per_share_try > 0
       AND quota_shares > 0
     ORDER BY id ASC`,
    [season.year]
  );

  const offersByCountry = new Map<string, any[]>();
  for (const off of offersRes.rows) {
    const list = offersByCountry.get(off.country_code) || [];
    const remainingShares = Math.max(0, Number(off.quota_shares) - Number(off.sold_shares));
    list.push({
      id: off.id,
      animalType: off.animal_type as KurbanAnimalType,
      sharesPerAnimal: Number(off.shares_per_animal),
      pricePerShareTry: Number(off.price_per_share_try),
      quotaShares: Number(off.quota_shares),
      soldShares: Number(off.sold_shares),
      remainingShares
    });
    offersByCountry.set(off.country_code, list);
  }

  // Faqat narxi va kvotasi kiritilgan davlatlar ommaviy ro'yxatga chiqadi
  const visibleCountries = countriesRes.rows
    .map((c) => {
      const offers = offersByCountry.get(c.code) || [];
      if (offers.length === 0) return null;
      const minPriceTry = Math.min(...offers.map((o) => o.pricePerShareTry));
      const totalRemainingShares = offers.reduce((acc, o) => acc + o.remainingShares, 0);
      return {
        code: c.code,
        flag: c.flag,
        name: pickLocalized(c.name, locale),
        description: pickLocalized(c.description, locale),
        gallery: Array.isArray(c.gallery) ? c.gallery : [],
        minPriceTry,
        totalRemainingShares,
        offers,
        needsReview: Boolean(c.needs_review?.[locale])
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    seasonYear: Number(season.year),
    isActive: Boolean(season.is_active),
    salesOpen,
    salesClosed,
    salesOpenAt: season.sales_open_at ? new Date(season.sales_open_at).toISOString() : null,
    salesCloseAt: season.sales_close_at ? new Date(season.sales_close_at).toISOString() : null,
    vekaletVersion: season.vekalet_version,
    vekaletText: pickLocalized(season.vekalet_text, locale),
    countries: visibleCountries,
    intentionTypes: INTENTION_TYPES.map((i) => ({ code: i.code, label: i.labels[locale] || i.labels.tr }))
  };
}

/**
 * 10-qadam (Unit): Serverda narx hisoblash. Mijoz yuborgan narxga hech qachon ishonilmaydi.
 */
export function calculateKurbanSharesTotalTry(pricePerShareTry: number, shareCount: number): number {
  if (!Number.isFinite(pricePerShareTry) || pricePerShareTry <= 0) {
    throw new Error("Invalid pricePerShareTry");
  }
  if (!Number.isInteger(shareCount) || shareCount <= 0 || shareCount > 50) {
    throw new Error("Invalid shareCount: must be an integer between 1 and 50");
  }
  return Math.round(pricePerShareTry * shareCount * 100) / 100;
}

export interface CreateKurbanOrderInput {
  originHost: string;
  locale: Locale;
  offerId: number;
  shares: {
    ownerName: string;
    intentionType: KurbanIntentionType;
  }[];
  vekaletAccepted: boolean;
  readNamesAloudConsent: boolean;
  kvkkConsent: boolean;
  donor: {
    name: string;
    phone: string;
    email?: string;
  };
  extraCartItems?: {
    campaignSlug: string;
    amountTry: number;
  }[];
  clientIp?: string | null;
  nowMs?: number;
}

/**
 * 1-qadam va 2-qadam: Atomik kvota tekshiruvi (`UPDATE ... WHERE sold_shares + n <= quota_shares`),
 * 15 daqiqalik `reserved` holati, vekalet qayd etish va savatcha/to'lov yaratish.
 */
export async function createKurbanOrderWithQuotaLock(input: CreateKurbanOrderInput) {
  await ensureSchema();
  const nowMs = input.nowMs ?? Date.now();

  if (!input.vekaletAccepted) {
    const err: any = new Error("VEKALET_REQUIRED: Vekalet roziligi berilishi shart.");
    err.statusCode = 400;
    throw err;
  }
  if (!input.kvkkConsent) {
    const err: any = new Error("KVKK_REQUIRED: KVKK roziligi berilishi shart.");
    err.statusCode = 400;
    throw err;
  }
  if (!input.readNamesAloudConsent) {
    const err: any = new Error("READ_NAMES_CONSENT_REQUIRED: Ismlarni videoda ovoz chiqarib o'qish roziligi talab qilinadi.");
    err.statusCode = 400;
    throw err;
  }

  if (!Array.isArray(input.shares) || input.shares.length === 0 || input.shares.length > 21) {
    const err: any = new Error("SHARES_INVALID: Hisse soni 1 dan 21 gacha bo'lishi kerak.");
    err.statusCode = 400;
    throw err;
  }

  const validIntentions = new Set(["vacip", "adak", "akika", "sukur", "nafile"]);
  for (const sh of input.shares) {
    const cleanOwner = (sh.ownerName || "").trim();
    if (cleanOwner.length < 2 || cleanOwner.length > 80) {
      const err: any = new Error("OWNER_NAME_LENGTH: Har bir hisse egasining ismi 2 dan 80 belgigacha bo'lishi shart.");
      err.statusCode = 400;
      throw err;
    }
    if (!validIntentions.has(sh.intentionType)) {
      const err: any = new Error(`INVALID_INTENTION: Noto'g'ri niyat turi (${sh.intentionType})`);
      err.statusCode = 400;
      throw err;
    }
  }

  const donorPhone = (input.donor?.phone || "").trim();
  if (donorPhone.length < 7) {
    const err: any = new Error("PHONE_REQUIRED: Xalqaro formatdagi telefon raqam kiritilishi shart.");
    err.statusCode = 400;
    throw err;
  }

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Offer va mavsumni tekshiramiz (`FOR UPDATE` bilan)
    const offerLookup = await client.query(
      `SELECT o.*, s.is_active AS season_active, s.sales_open_at, s.sales_close_at, s.vekalet_version, s.vekalet_text,
              c.is_active AS country_active, c.name AS country_name
       FROM kurban_offers o
       JOIN kurban_seasons s ON s.year = o.season_year
       JOIN kurban_countries c ON c.code = o.country_code
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [input.offerId]
    );

    const offer = offerLookup.rows[0];
    if (!offer || !offer.is_active || !offer.country_active || Number(offer.price_per_share_try) <= 0) {
      const err: any = new Error("OFFER_INACTIVE: Tanlangan qurbonlik taklifi faol emas.");
      err.statusCode = 400;
      throw err;
    }

    if (!offer.season_active) {
      const err: any = new Error("SEASON_INACTIVE: Qurbonlik mavsumi hali ochilmagan.");
      err.statusCode = 400;
      throw err;
    }

    const cleanVekaletTextForOrder = pickLocalized(offer.vekalet_text, input.locale);
    if (!cleanVekaletTextForOrder) {
      const err: any = new Error("VEKALET_TEXT_MISSING: Vekalet matni tasdiqlanmaganligi sababli qurbonlik qabul qilinmaydi.");
      err.statusCode = 400;
      throw err;
    }

    if (offer.sales_close_at && nowMs > new Date(offer.sales_close_at).getTime()) {
      const err: any = new Error("SALES_CLOSED: Bu yilgi qabul yakunlandi.");
      err.statusCode = 400;
      throw err;
    }

    if (offer.sales_open_at && nowMs < new Date(offer.sales_open_at).getTime()) {
      const err: any = new Error("SALES_NOT_OPEN: Qurbonlik qabuli hali boshlanmagan.");
      err.statusCode = 400;
      throw err;
    }

    const shareCount = input.shares.length;

    // 2. Atomik kvota yangilash: sold_shares + shareCount <= quota_shares
    const quotaUpdate = await client.query(
      `UPDATE kurban_offers
       SET sold_shares = sold_shares + $2,
           updated_at = NOW()
       WHERE id = $1
         AND sold_shares + $2 <= quota_shares
       RETURNING id, sold_shares, quota_shares, price_per_share_try`,
      [offer.id, shareCount]
    );

    if (quotaUpdate.rowCount === 0) {
      const err: any = new Error("QUOTA_EXCEEDED: Tanlangan davlat va hayvon bo'yicha yetarli hisse qolmadi.");
      err.statusCode = 409;
      throw err;
    }

    const pricePerShareTry = Number(offer.price_per_share_try);
    const kurbanTotalTry = calculateKurbanSharesTotalTry(pricePerShareTry, shareCount);

    // Qo'shimcha savatcha xayriyalari (agar qurbonlik savatchada boshqa xayriyalar bilan birga bo'lsa)
    let extraTry = 0;
    const extraResolvedItems: any[] = [];
    if (Array.isArray(input.extraCartItems)) {
      for (const ex of input.extraCartItems) {
        const amt = Number(ex.amountTry);
        if (amt > 0 && ex.campaignSlug) {
          extraTry += amt;
          extraResolvedItems.push({
            campaignSlug: ex.campaignSlug,
            purposeCode: "GENEL-BAGIS",
            amountTry: amt
          });
        }
      }
    }

    const grandTotalTry = Math.round((kurbanTotalTry + extraTry) * 100) / 100;
    const countryNameTr = (offer.country_name?.tr || offer.country_code).replace(/\s*\[TASLIK\]/g, "").trim();
    const purposeCode = `KURBAN-${offer.country_code}-${offer.season_year}`;
    const purposeTitle = `Onlayn kurban: ${countryNameTr} ${offer.season_year}`;
    const notes = `${shareCount} hisse (${offer.animal_type})`;
    const isTest = !SITE_CONFIG.donationsLive;

    const suffix = crypto.randomBytes(6).toString("hex").toUpperCase();
    const publicNo = `EZ-${offer.season_year}-KRB-${suffix}`;
    const orderNo = `KRB-${offer.season_year}-${suffix}`;
    const donorName = (input.donor?.name || input.shares[0]!.ownerName).trim();

    // 3. Donations jadvaliga yozuv (8-qadam ichki vaqf sinxronlash uchun)
    const externalUuid = crypto.randomUUID();
    const donationIns = await client.query(
      `INSERT INTO donations (
         external_id, public_no, origin_host, locale, status, is_test, frequency, provider, amount, currency, amount_try,
         purpose_code, purpose_title, restricted, notes, items,
         donor_name, donor_phone, donor_email, is_anonymous, kvkk_consent, want_receipt
       ) VALUES (
         $13::uuid, $1, 'ezanvakfi.org', $14, 'pending', $2, 'one_time', $3, $4, 'TRY', $4,
         $5, $6, TRUE, $7, $8::jsonb,
         $9, $10, $11, FALSE, $12, TRUE
       )
       RETURNING *`,
      [
        publicNo,
        isTest,
        SITE_CONFIG.paymentProvider,
        grandTotalTry,
        purposeCode,
        purposeTitle,
        notes,
        JSON.stringify([
          {
            type: "kurban",
            offerId: offer.id,
            countryCode: offer.country_code,
            animalType: offer.animal_type,
            shareCount,
            pricePerShareTry,
            amountTry: kurbanTotalTry
          },
          ...extraResolvedItems
        ]),
        donorName,
        donorPhone,
        input.donor?.email || null,
        Boolean(input.kvkkConsent),
        externalUuid,
        input.locale || "tr"
      ]
    );

    const donation = donationIns.rows[0]!;
    const ipHash = crypto
      .createHash("sha256")
      .update(String(input.clientIp || "no-ip"))
      .digest("hex");
    const reservedUntil = new Date(nowMs + 15 * 60 * 1000).toISOString();

    // 4. kurban_orders jadvaliga yozuv
    const orderIns = await client.query(
      `INSERT INTO kurban_orders (
         order_no, donation_id, donation_external_id, season_year, country_code,
         animal_type, offer_id, locale, donor_name, donor_phone, donor_email,
         vekalet_accepted, vekalet_accepted_at, vekalet_ip_hash, vekalet_text_version,
         read_names_aloud_consent, kvkk_consent, total_shares, price_per_share_try,
         total_amount_try, status, reserved_until, is_test
       ) VALUES (
         $1, $2, $3::uuid, $4, $5,
         $6, $7, $8, $9, $10, $11,
         TRUE, NOW(), $12, $13,
         $14, $15, $16, $17,
         $18, 'reserved', $19, $20
       )
       RETURNING *`,
      [
        orderNo,
        donation.id,
        donation.external_id,
        offer.season_year,
        offer.country_code,
        offer.animal_type,
        offer.id,
        input.locale || "tr",
        donorName,
        donorPhone,
        input.donor?.email || null,
        ipHash,
        offer.vekalet_version || "v2027.1-taslik",
        Boolean(input.readNamesAloudConsent),
        Boolean(input.kvkkConsent),
        shareCount,
        pricePerShareTry,
        kurbanTotalTry,
        reservedUntil,
        isTest
      ]
    );

    const order = orderIns.rows[0]!;
    const createdShares: any[] = [];

    // 5. Har bir hisse uchun kurban_shares qatori va 32-baytli tasodifiy trackingToken
    for (let idx = 0; idx < input.shares.length; idx++) {
      const s = input.shares[idx]!;
      const token = generateTrackingToken();
      const shareIns = await client.query(
        `INSERT INTO kurban_shares (
           order_id, offer_id, season_year, country_code, animal_type,
           seq_in_order, owner_name, intention_type, status, tracking_token, reserved_until
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reserved', $9, $10)
         RETURNING *`,
        [
          order.id,
          offer.id,
          offer.season_year,
          offer.country_code,
          offer.animal_type,
          idx + 1,
          s.ownerName.trim(),
          s.intentionType,
          token,
          reservedUntil
        ]
      );
      const shareRow = shareIns.rows[0]!;
      createdShares.push(shareRow);

      await client.query(
        `INSERT INTO kurban_events (share_id, order_id, actor_email, actor_role, event_type, old_status, new_status, metadata)
         VALUES ($1, $2, $3, 'donor', 'SHARE_RESERVED', NULL, 'reserved', $4::jsonb)`,
        [
          shareRow.id,
          order.id,
          input.donor?.email || donorPhone,
          JSON.stringify({ intentionType: s.intentionType, reservedUntil })
        ]
      );
    }

    await client.query("COMMIT");

    const provider = getPaymentProvider();
    const checkout = await provider.createCheckoutSession({
      donationExternalId: donation.external_id,
      publicNo: donation.public_no,
      amountTry: grandTotalTry,
      frequency: "one_time",
      donorName,
      donorEmail: input.donor?.email,
      donorPhone,
      originHost: input.originHost,
      locale: input.locale || "tr"
    });

    const primaryToken = createdShares[0]!.tracking_token;
    return {
      order: {
        id: order.id,
        orderNo: order.order_no,
        status: order.status,
        seasonYear: order.season_year,
        countryCode: order.country_code,
        animalType: order.animal_type,
        totalShares: order.total_shares,
        pricePerShareTry,
        totalAmountTry: kurbanTotalTry,
        grandTotalTry,
        reservedUntil: order.reserved_until,
        primaryTrackingToken: primaryToken
      },
      shares: createdShares.map((sh) => ({
        id: sh.id,
        seqInOrder: sh.seq_in_order,
        ownerName: sh.owner_name,
        intentionType: sh.intention_type,
        status: sh.status,
        trackingToken: sh.tracking_token
      })),
      donation: {
        id: donation.id,
        external_id: donation.external_id,
        public_no: donation.public_no,
        amount_try: grandTotalTry,
        is_test: donation.is_test
      },
      checkout
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 1-qadam: To'lov vaqtida hisse 15 daqiqa `reserved` turadi.
 * To'lov bo'lmasa, avtomatik bo'shaydi va kvota qaytariladi.
 */
export async function expireStaleKurbanReservations(nowMs = Date.now()): Promise<{ expiredOrders: number; releasedShares: number }> {
  await ensureSchema();
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const staleOrders = await client.query(
      `SELECT id, offer_id, total_shares
       FROM kurban_orders
       WHERE status = 'reserved'
         AND reserved_until <= $1
       FOR UPDATE SKIP LOCKED`,
      [new Date(nowMs).toISOString()]
    );

    let releasedShares = 0;
    for (const ord of staleOrders.rows) {
      await client.query(
        `UPDATE kurban_orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [ord.id]
      );
      const shRes = await client.query(
        `UPDATE kurban_shares
         SET status = 'cancelled', updated_at = NOW()
         WHERE order_id = $1 AND status = 'reserved'
         RETURNING id`,
        [ord.id]
      );
      const count = shRes.rowCount || Number(ord.total_shares);
      releasedShares += count;

      await client.query(
        `UPDATE kurban_offers
         SET sold_shares = GREATEST(0, sold_shares - $2),
             updated_at = NOW()
         WHERE id = $1`,
        [ord.offer_id, count]
      );

      await client.query(
        `INSERT INTO kurban_events (order_id, actor_role, event_type, old_status, new_status, metadata)
         VALUES ($1, 'system', 'RESERVATION_EXPIRED', 'reserved', 'cancelled', $2::jsonb)`,
        [ord.id, JSON.stringify({ releasedShares: count })]
      );
    }

    await client.query("COMMIT");
    return { expiredOrders: staleOrders.rowCount || 0, releasedShares };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * To'lov tasdiqlanganda (`paid`):
 * - `kurban_orders` va `kurban_shares` -> `paid`;
 * - 1-xabar (`payment_confirmed`: vekalet + kuzatuv havolasi + makbuz PDF) outbox'ga tushadi.
 */
export async function markKurbanOrderPaidByDonation(params: {
  donationExternalId: string;
  originBaseUrl?: string;
  receiptPdfBase64?: string | null;
}) {
  await ensureSchema();
  const ordRes = await dbQuery(`SELECT * FROM kurban_orders WHERE donation_external_id = $1::uuid LIMIT 1`, [
    params.donationExternalId
  ]);
  const order = ordRes.rows[0];
  if (!order) return null;

  if (order.status === "reserved") {
    await dbQuery(`UPDATE kurban_orders SET status = 'paid', updated_at = NOW() WHERE id = $1`, [order.id]);
    await dbQuery(
      `UPDATE kurban_shares
       SET status = 'paid', updated_at = NOW()
       WHERE order_id = $1 AND status = 'reserved'`,
      [order.id]
    );
    await dbQuery(
      `INSERT INTO kurban_events (order_id, actor_role, event_type, old_status, new_status)
       VALUES ($1, 'payment_webhook', 'ORDER_PAID', 'reserved', 'paid')`,
      [order.id]
    );
  }

  await enqueueKurbanOrderStageMessages({
    orderId: order.id,
    stage: "payment_confirmed",
    originBaseUrl: params.originBaseUrl,
    receiptPdfAttachmentBase64: params.receiptPdfBase64 || null
  });

  return order;
}

/**
 * To'lov qaytarilganda (`refunded`):
 * - `kurban_orders` va `kurban_shares` -> `refunded`;
 * - `kurban_offers.sold_shares` kamaytiriladi.
 */
export async function markKurbanOrderRefundedByDonation(params: {
  donationExternalId: string;
  reason?: string;
}) {
  await ensureSchema();
  const ordRes = await dbQuery(`SELECT * FROM kurban_orders WHERE donation_external_id = $1::uuid LIMIT 1`, [
    params.donationExternalId
  ]);
  const order = ordRes.rows[0];
  if (!order || order.status === "refunded") return null;

  const oldStatus = order.status;
  await dbQuery(`UPDATE kurban_orders SET status = 'refunded', updated_at = NOW() WHERE id = $1`, [order.id]);
  await dbQuery(`UPDATE kurban_shares SET status = 'refunded', animal_id = NULL, updated_at = NOW() WHERE order_id = $1`, [
    order.id
  ]);
  await dbQuery(
    `UPDATE kurban_offers
     SET sold_shares = GREATEST(0, sold_shares - $2),
         updated_at = NOW()
     WHERE id = $1`,
    [order.offer_id, order.total_shares]
  );
  await dbQuery(
    `INSERT INTO kurban_events (order_id, actor_role, event_type, old_status, new_status, metadata)
     VALUES ($1, 'payment_webhook', 'ORDER_REFUNDED', $2, 'refunded', $3::jsonb)`,
    [order.id, oldStatus, JSON.stringify({ reason: params.reason || "Refunded" })]
  );

  return order;
}

/**
 * 3-qadam (va 10-qadam Unit test): Hisselarni hayvonlarga biriktirish algoritmi.
 * - Sigir/tuya (`sharesPerAnimal = 7`): 7 tadan, bir buyurtmaning hisselari iloji boricha bitta hayvonda bo'linmasdan joylashadi;
 * - Qo'y/echki (`sharesPerAnimal = 1`): bittadan.
 */
export interface ShareForAssignment {
  shareId: number;
  orderId: number;
  ownerName: string;
  intentionType: KurbanIntentionType;
}

export interface PlannedAnimalBucket {
  tagNo: string;
  sharesCapacity: 1 | 7;
  shares: ShareForAssignment[];
}

export function planAnimalAssignmentBuckets(params: {
  countryCode: string;
  seasonYear: number;
  animalType: KurbanAnimalType;
  shares: ShareForAssignment[];
  startingIndex?: number;
}): PlannedAnimalBucket[] {
  const capacity: 1 | 7 = params.animalType === "sheep" || params.animalType === "goat" ? 1 : 7;
  const prefix = `${params.countryCode.toUpperCase()}-${params.seasonYear}-${params.animalType === "cattle" || params.animalType === "camel" ? "B" : "K"}`;
  let nextAnimalSeq = params.startingIndex ?? 1;

  if (capacity === 1) {
    return params.shares.map((sh) => ({
      tagNo: `${prefix}${String(nextAnimalSeq++).padStart(3, "0")}`,
      sharesCapacity: 1,
      shares: [sh]
    }));
  }

  // Sigir/tuya (7 hisse): Buyurtmalar bo'yicha guruhlaymiz va buyurtmani bo'lmasdan joylaymiz (First-Fit Decreasing)
  const byOrder = new Map<number, ShareForAssignment[]>();
  for (const sh of params.shares) {
    const arr = byOrder.get(sh.orderId) || [];
    arr.push(sh);
    byOrder.set(sh.orderId, arr);
  }

  // Agar bitta buyurtmada > 7 hisse bo'lsa, 7 tadan bo'laklarga ajratamiz; <= 7 bo'lsa butunligicha qoladi
  const orderChunks: ShareForAssignment[][] = [];
  for (const [, group] of byOrder.entries()) {
    for (let i = 0; i < group.length; i += 7) {
      orderChunks.push(group.slice(i, i + 7));
    }
  }

  // Katta guruhlarni oldin joylashtiramiz (lekin teng o'lchamdagilarni buyurtma tartibida saqlaymiz)
  orderChunks.sort((a, b) => b.length - a.length);

  const buckets: PlannedAnimalBucket[] = [];
  for (const chunk of orderChunks) {
    let placed = false;
    for (const bucket of buckets) {
      if (bucket.shares.length + chunk.length <= 7) {
        bucket.shares.push(...chunk);
        placed = true;
        break;
      }
    }
    if (!placed) {
      buckets.push({
        tagNo: `${prefix}${String(nextAnimalSeq++).padStart(3, "0")}`,
        sharesCapacity: 7,
        shares: [...chunk]
      });
    }
  }

  return buckets;
}

/**
 * 3-qadam: Admin tomonidan `paid` hisselarni hayvonlarga biriktirishni tasdiqlash (qo'lda o'zgartirish imkoniyati bilan).
 */
export async function assignPaidSharesToAnimals(params: {
  seasonYear: number;
  countryCode: string;
  animalType: KurbanAnimalType;
  actorEmail: string;
  actorRole: string;
  manualBucketsOverride?: PlannedAnimalBucket[];
}) {
  await ensureSchema();
  const existingAnimalsRes = await dbQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM kurban_animals WHERE season_year = $1 AND country_code = $2`,
    [params.seasonYear, params.countryCode]
  );
  const startSeq = Number(existingAnimalsRes.rows[0]?.count || 0) + 1;

  let buckets: PlannedAnimalBucket[] = [];
  if (params.manualBucketsOverride && params.manualBucketsOverride.length > 0) {
    buckets = params.manualBucketsOverride;
  } else {
    const paidSharesRes = await dbQuery(
      `SELECT id, order_id, owner_name, intention_type
       FROM kurban_shares
       WHERE season_year = $1
         AND country_code = $2
         AND animal_type = $3
         AND status = 'paid'
         AND animal_id IS NULL
       ORDER BY order_id ASC, seq_in_order ASC, id ASC`,
      [params.seasonYear, params.countryCode, params.animalType]
    );

    const shares: ShareForAssignment[] = paidSharesRes.rows.map((r) => ({
      shareId: r.id,
      orderId: r.order_id,
      ownerName: r.owner_name,
      intentionType: r.intention_type as KurbanIntentionType
    }));

    buckets = planAnimalAssignmentBuckets({
      countryCode: params.countryCode,
      seasonYear: params.seasonYear,
      animalType: params.animalType,
      shares,
      startingIndex: startSeq
    });
  }

  const createdAnimals: any[] = [];
  for (const b of buckets) {
    if (b.shares.length === 0) continue;
    const animalIns = await dbQuery(
      `INSERT INTO kurban_animals (season_year, country_code, animal_type, shares_capacity, tag_no, status)
       VALUES ($1, $2, $3, $4, $5, 'assigned')
       ON CONFLICT (season_year, country_code, tag_no) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [params.seasonYear, params.countryCode, params.animalType, b.sharesCapacity, b.tagNo]
    );
    const animal = animalIns.rows[0]!;
    const shareIds = b.shares.map((s) => s.shareId);

    await dbQuery(
      `UPDATE kurban_shares
       SET animal_id = $1,
           status = 'assigned',
           updated_at = NOW()
       WHERE id = ANY($2::int[])`,
      [animal.id, shareIds]
    );

    for (const s of b.shares) {
      await dbQuery(
        `INSERT INTO kurban_events (share_id, order_id, animal_id, actor_email, actor_role, event_type, old_status, new_status, metadata)
         VALUES ($1, $2, $3, $4, $5, 'SHARE_ASSIGNED_TO_ANIMAL', 'paid', 'assigned', $6::jsonb)`,
        [s.shareId, s.orderId, animal.id, params.actorEmail, params.actorRole, JSON.stringify({ tagNo: animal.tag_no })]
      );
    }

    createdAnimals.push({
      ...animal,
      shares: b.shares
    });
  }

  return { assignedAnimalsCount: createdAnimals.length, animals: createdAnimals };
}

/**
 * 3-qadam: Dala ro'yxati (PDF, A4, katta shrift).
 * Har bir hayvon uchun `tagNo`, hayvon turi, hissedorlar ismlari (lotin yozuvida) va niyat turlari.
 */
export async function generateFieldSheetPdfBuffer(params: {
  seasonYear: number;
  countryCode?: string;
}): Promise<Buffer> {
  await ensureSchema();
  const animalsRes = await dbQuery(
    `SELECT a.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'seq', s.seq_in_order,
                  'ownerName', s.owner_name,
                  'intentionType', s.intention_type
                ) ORDER BY s.id ASC
              ) FILTER (WHERE s.id IS NOT NULL),
              '[]'::json
            ) AS shares
     FROM kurban_animals a
     LEFT JOIN kurban_shares s ON s.animal_id = a.id
     WHERE a.season_year = $1
       AND ($2::varchar IS NULL OR a.country_code = $2)
     GROUP BY a.id
     ORDER BY a.country_code ASC, a.tag_no ASC`,
    [params.seasonYear, params.countryCode || null]
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(22).text(`EZAN VAKFI - SAHA KURBAN KESIM LISTESI (${params.seasonYear})`, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(12).text("Kesimden once tahtaya Tag No yaziniz ve hissedar isimlerini sesli okuyunuz.", {
      align: "center"
    });
    doc.moveDown(1);

    if (animalsRes.rowCount === 0) {
      doc.fontSize(16).text("Henuz atanmis kurbanlik hayvan bulunmamaktadir.", { align: "center" });
      doc.end();
      return;
    }

    for (const animal of animalsRes.rows) {
      doc
        .rect(40, doc.y, 515, 34)
        .fillAndStroke("#f0f4f1", "#1d4d3c");
      doc
        .fillColor("#0f291e")
        .fontSize(18)
        .text(
          `TAG NO: ${animal.tag_no}   |   ULKE: ${animal.country_code}   |   TUR: ${String(animal.animal_type).toUpperCase()} (${animal.shares_capacity} Hisse)`,
          50,
          doc.y - 26
        );
      doc.moveDown(1.2);

      const shares: any[] = Array.isArray(animal.shares) ? animal.shares : [];
      shares.forEach((sh, idx) => {
        const latinName = transliterateToLatinForField(sh.ownerName);
        const intention = String(sh.intentionType || "vacip").toUpperCase();
        doc
          .fillColor("#000000")
          .fontSize(15)
          .text(`  ${idx + 1}. ${latinName}   —   [${intention}]`);
      });

      doc.moveDown(1.2);
      if (doc.y > 700) {
        doc.addPage();
      }
    }

    doc.end();
  });
}

/**
 * 3-qadam: Dala jamoasi `/dala` sahifasida hayvonni "kesildi" deb belgilaydi.
 * Shu hayvonning hamma hisselari `slaughtered` bo'ladi va 2-xabar (`animal_slaughtered`) ketadi.
 */
export async function markAnimalSlaughtered(params: {
  animalId: number;
  actorEmail: string;
  actorRole: string;
  assignedCountryCode?: string | null;
  originBaseUrl?: string;
}) {
  await ensureSchema();
  const animalRes = await dbQuery(`SELECT * FROM kurban_animals WHERE id = $1 LIMIT 1`, [params.animalId]);
  const animal = animalRes.rows[0];
  if (!animal) {
    const err: any = new Error("Animal not found");
    err.statusCode = 404;
    throw err;
  }

  if (params.assignedCountryCode && animal.country_code !== params.assignedCountryCode) {
    const err: any = new Error(`Forbidden: Field user for ${params.assignedCountryCode} cannot modify ${animal.country_code}`);
    err.statusCode = 403;
    throw err;
  }

  await dbQuery(
    `UPDATE kurban_animals
     SET status = CASE WHEN status = 'assigned' THEN 'slaughtered' ELSE status END,
         slaughtered_at = COALESCE(slaughtered_at, NOW()),
         slaughtered_by = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [animal.id, params.actorEmail]
  );

  const sharesRes = await dbQuery<{ id: number; order_id: number; status: string }>(
    `UPDATE kurban_shares
     SET status = 'slaughtered',
         updated_at = NOW()
     WHERE animal_id = $1
       AND status IN ('paid', 'assigned')
     RETURNING id, order_id, status`,
    [animal.id]
  );

  const orderIds = new Set<number>();
  for (const sh of sharesRes.rows) {
    orderIds.add(sh.order_id);
    await dbQuery(
      `INSERT INTO kurban_events (share_id, order_id, animal_id, actor_email, actor_role, event_type, old_status, new_status)
       VALUES ($1, $2, $3, $4, $5, 'ANIMAL_SLAUGHTERED', 'assigned', 'slaughtered')`,
      [sh.id, sh.order_id, animal.id, params.actorEmail, params.actorRole]
    );
  }

  const allOrderIdsRes = await dbQuery<{ order_id: number }>(
    `SELECT DISTINCT order_id FROM kurban_shares WHERE animal_id = $1`,
    [animal.id]
  );
  for (const r of allOrderIdsRes.rows) {
    orderIds.add(r.order_id);
  }

  for (const orderId of orderIds) {
    await enqueueKurbanOrderStageMessages({
      orderId,
      stage: "animal_slaughtered",
      originBaseUrl: params.originBaseUrl
    });
  }

  return {
    animalId: animal.id,
    tagNo: animal.tag_no,
    status: "slaughtered",
    notifiedOrderIds: Array.from(orderIds)
  };
}

/**
 * 4-qadam va 5-qadam: Admin yoki koordinator videoni ko'rib "Tasdiqlash" bosadi (`published`).
 * Shundan keyingina hisselar `video_ready` bo'ladi va 3-xabar (`video_published`) ketadi.
 */
export async function approveAndPublishKurbanVideo(params: {
  videoId: number;
  actorEmail: string;
  actorRole: string;
  originBaseUrl?: string;
}) {
  await ensureSchema();
  const vidRes = await dbQuery(`SELECT * FROM kurban_videos WHERE id = $1 LIMIT 1`, [params.videoId]);
  const video = vidRes.rows[0];
  if (!video) {
    const err: any = new Error("Video not found");
    err.statusCode = 404;
    throw err;
  }

  await dbQuery(
    `UPDATE kurban_videos
     SET status = 'published',
         approved_by = $2,
         approved_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [video.id, params.actorEmail]
  );

  await dbQuery(
    `UPDATE kurban_animals
     SET status = 'video_ready',
         video_id = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [video.animal_id, video.id]
  );

  const sharesRes = await dbQuery<{ id: number; order_id: number }>(
    `UPDATE kurban_shares
     SET status = 'video_ready',
         updated_at = NOW()
     WHERE animal_id = $1
       AND status IN ('paid', 'assigned', 'slaughtered', 'video_ready')
     RETURNING id, order_id`,
    [video.animal_id]
  );

  const orderIds = new Set<number>();
  for (const sh of sharesRes.rows) {
    orderIds.add(sh.order_id);
    await dbQuery(
      `INSERT INTO kurban_events (share_id, order_id, animal_id, actor_email, actor_role, event_type, old_status, new_status, metadata)
       VALUES ($1, $2, $3, $4, $5, 'VIDEO_PUBLISHED', 'slaughtered', 'video_ready', $6::jsonb)`,
      [sh.id, sh.order_id, video.animal_id, params.actorEmail, params.actorRole, JSON.stringify({ videoId: video.id })]
    );
  }

  const triggeredOrders: number[] = [];
  const waitingOrders: number[] = [];
  for (const orderId of orderIds) {
    const qRes = await enqueueKurbanOrderStageMessages({
      orderId,
      stage: "video_published",
      originBaseUrl: params.originBaseUrl
    });
    if ((qRes as any).waitingForRemainingAnimals) {
      waitingOrders.push(orderId);
    } else {
      triggeredOrders.push(orderId);
    }
  }

  return {
    videoId: video.id,
    animalId: video.animal_id,
    status: "published",
    triggeredOrders,
    waitingOrders
  };
}

/**
 * 2-qadam va 6-qadam: Kuzatuv sahifasi (`/[locale]/kurban/takip/{trackingToken}`).
 * - Login talab qilmaydi, 32-baytli token yetarli;
 * - Ismlar faqat shu xayriyachiga (`order_id`) tegishli hisselar uchun ko'rinadi. Boshqa hissedorlarning ismi HECH QACHON ko'rsatilmaydi;
 * - Video tayyor (`published`) bo'lsa, 1 soatlik imzolangan ko'rish va yuklab olish havolalari yangilanadi.
 */
export async function getKurbanTrackingDetails(trackingToken: string, locale: Locale, nowMs = Date.now()) {
  await ensureSchema();
  if (!trackingToken || trackingToken.length < 32) {
    return null;
  }

  const targetShareRes = await dbQuery(`SELECT * FROM kurban_shares WHERE tracking_token = $1 LIMIT 1`, [
    trackingToken.trim()
  ]);
  const targetShare = targetShareRes.rows[0];
  if (!targetShare) return null;

  const [orderRes, seasonRes, countryRes, orderSharesRes] = await Promise.all([
    dbQuery(`SELECT * FROM kurban_orders WHERE id = $1 LIMIT 1`, [targetShare.order_id]),
    dbQuery(`SELECT * FROM kurban_seasons WHERE year = $1 LIMIT 1`, [targetShare.season_year]),
    dbQuery(`SELECT code, flag, name FROM kurban_countries WHERE code = $1 LIMIT 1`, [targetShare.country_code]),
    dbQuery(
      `SELECT s.id, s.seq_in_order, s.owner_name, s.intention_type, s.status, s.tracking_token,
              s.animal_id, s.created_at, s.updated_at,
              a.tag_no, a.slaughtered_at,
              v.id AS video_id, v.storage_key, v.processed_storage_key, v.poster_storage_key,
              v.status AS video_status, v.video_expires_at
       FROM kurban_shares s
       LEFT JOIN kurban_animals a ON a.id = s.animal_id
       LEFT JOIN kurban_videos v ON v.id = a.video_id
       WHERE s.order_id = $1
       ORDER BY s.seq_in_order ASC, s.id ASC`,
      [targetShare.order_id]
    )
  ]);

  const order = orderRes.rows[0]!;
  const season = seasonRes.rows[0];
  const country = countryRes.rows[0];
  const retentionDays = Number(season?.video_retention_days || 365);

  const shares = orderSharesRes.rows.map((sh) => {
    const videoReady = sh.video_status === "published";
    const activeStorageKey = sh.processed_storage_key || sh.storage_key;
    const signedView = videoReady && activeStorageKey
      ? generateSignedVideoUrl({ storageKey: activeStorageKey, expiresInSeconds: 3600, download: false, nowMs })
      : null;
    const signedDownload = videoReady && activeStorageKey
      ? generateSignedVideoUrl({ storageKey: activeStorageKey, expiresInSeconds: 3600, download: true, nowMs })
      : null;

    return {
      id: sh.id,
      seqInOrder: sh.seq_in_order,
      ownerName: sh.owner_name,
      intentionType: sh.intention_type,
      status: sh.status,
      trackingToken: sh.tracking_token,
      tagNo: sh.tag_no || null,
      slaughteredAt: sh.slaughtered_at ? new Date(sh.slaughtered_at).toISOString() : null,
      video: signedView
        ? {
            videoId: sh.video_id,
            streamUrl: signedView.url,
            downloadUrl: signedDownload!.url,
            s3PresignedUrl: signedView.s3PresignedUrl,
            expiresAt: signedView.expiresAt,
            expiresInSeconds: signedView.expiresInSeconds,
            retentionDays,
            videoExpiresAt: sh.video_expires_at ? new Date(sh.video_expires_at).toISOString() : null
          }
        : null
    };
  });

  return {
    orderNo: order.order_no,
    seasonYear: order.season_year,
    countryCode: order.country_code,
    countryName: country ? pickLocalized(country.name, locale).replace(/\s*\[TASLIK\]/g, "") : order.country_code,
    countryFlag: country?.flag || "🏳️",
    animalType: order.animal_type,
    totalShares: Number(order.total_shares),
    totalAmountTry: Number(order.total_amount_try),
    orderStatus: order.status,
    vekaletVersion: order.vekalet_text_version,
    vekaletAcceptedAt: new Date(order.vekalet_accepted_at).toISOString(),
    videoRetentionDays: retentionDays,
    shares
  };
}

/**
 * 3-qadam va 8-qadam: Davlatlar bo'yicha sotilgan, biriktirilgan, kesilgan, videosi bor va xabar yuborilgan sonlar
 * hamda "Videosi yo'q hayvonlar" ro'yxati.
 */
export async function getKurbanSeasonSummary(seasonYear = 2027) {
  await ensureSchema();

  const [byCountryRes, animalsWithoutVideoRes, invalidPhonesRes] = await Promise.all([
    dbQuery(
      `SELECT
         c.code AS country_code,
         c.flag,
         c.name,
         COUNT(s.id) FILTER (WHERE s.status IN ('paid', 'assigned', 'slaughtered', 'video_ready', 'notified'))::int AS sold_shares,
         COUNT(s.id) FILTER (WHERE s.status IN ('assigned', 'slaughtered', 'video_ready', 'notified'))::int AS assigned_shares,
         COUNT(s.id) FILTER (WHERE s.status IN ('slaughtered', 'video_ready', 'notified'))::int AS slaughtered_shares,
         COUNT(s.id) FILTER (WHERE s.status IN ('video_ready', 'notified'))::int AS video_ready_shares,
         COUNT(s.id) FILTER (WHERE s.status = 'notified')::int AS notified_shares
       FROM kurban_countries c
       LEFT JOIN kurban_shares s ON s.country_code = c.code AND s.season_year = $1
       GROUP BY c.code, c.flag, c.name
       ORDER BY c.code ASC`,
      [seasonYear]
    ),
    dbQuery(
      `SELECT a.id, a.country_code, a.animal_type, a.tag_no, a.status, a.slaughtered_at
       FROM kurban_animals a
       LEFT JOIN kurban_videos v ON v.id = a.video_id
       WHERE a.season_year = $1
         AND (a.video_id IS NULL OR v.status = 'rejected')
       ORDER BY a.country_code ASC, a.tag_no ASC`,
      [seasonYear]
    ),
    dbQuery(
      `SELECT id, order_no, donor_name, donor_phone, country_code, created_at
       FROM kurban_orders
       WHERE season_year = $1
         AND id IN (SELECT order_id FROM kurban_message_logs WHERE status = 'invalid_phone')
       ORDER BY id DESC`,
      [seasonYear]
    )
  ]);

  const countries = byCountryRes.rows.map((r) => ({
    countryCode: r.country_code,
    flag: r.flag,
    nameTr: (r.name?.tr || r.country_code).replace(/\s*\[TASLIK\]/g, ""),
    soldShares: Number(r.sold_shares || 0),
    assignedShares: Number(r.assigned_shares || 0),
    slaughteredShares: Number(r.slaughtered_shares || 0),
    videoReadyShares: Number(r.video_ready_shares || 0),
    notifiedShares: Number(r.notified_shares || 0)
  }));

  const totals = countries.reduce(
    (acc, c) => ({
      soldShares: acc.soldShares + c.soldShares,
      assignedShares: acc.assignedShares + c.assignedShares,
      slaughteredShares: acc.slaughteredShares + c.slaughteredShares,
      videoReadyShares: acc.videoReadyShares + c.videoReadyShares,
      notifiedShares: acc.notifiedShares + c.notifiedShares
    }),
    { soldShares: 0, assignedShares: 0, slaughteredShares: 0, videoReadyShares: 0, notifiedShares: 0 }
  );

  return {
    season: seasonYear,
    totals,
    countries,
    animalsWithoutVideo: animalsWithoutVideoRes.rows,
    invalidPhoneOrders: invalidPhonesRes.rows
  };
}
