import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import { dbQuery, ensureSchema } from "../db/schema";
import { Locale } from "../i18n/country-locale";
import { requireEnvSecret, SITE_CONFIG } from "../lib/config";
import { signSessionToken, verifySignedSessionToken } from "../lib/security";
import { getSmsProvider, isValidInternationalPhone, normalizePhoneE164, SMS_SENDER_HEADER } from "../kurban/messaging";
import { generateSignedVideoUrl } from "../kurban/storage";

export const DONOR_SESSION_COOKIE_NAME = "ezan_donor_session";
export const DONOR_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 kun

function hashOtpCode(code: string, target: string): string {
  const secret = requireEnvSecret("ADMIN_SESSION_SECRET", 32);
  return crypto.createHmac("sha256", secret).update(`${target.toLowerCase()}:${code}`).digest("hex");
}

/**
 * 7-qadam: Telefon + 6 xonali SMS kod (5 daqiqa amal qiladi, 5 urinish) yoki e-pochtaga bir martalik havola/kod.
 */
export async function requestDonorCabinetOtp(params: {
  channel: "sms" | "email";
  target: string;
  locale: Locale;
  originHost?: string;
  clientIp?: string | null;
}) {
  await ensureSchema();
  const cleanTarget =
    params.channel === "sms" ? normalizePhoneE164(params.target) : (params.target || "").trim().toLowerCase();

  if (params.channel === "sms" && !isValidInternationalPhone(cleanTarget)) {
    const err: any = new Error("INVALID_PHONE: Xalqaro formatdagi telefon raqam kiritilishi shart.");
    err.statusCode = 400;
    throw err;
  }
  if (params.channel === "email" && (!cleanTarget.includes("@") || cleanTarget.length < 5)) {
    const err: any = new Error("INVALID_EMAIL: To'g'ri e-pochta manzili kiritilishi shart.");
    err.statusCode = 400;
    throw err;
  }

  // 6 xonali tasodifiy OTP kod
  const otpCode = String(crypto.randomInt(100000, 999999));
  const codeHash = hashOtpCode(otpCode, cleanTarget);

  await dbQuery(
    `INSERT INTO donor_otp_codes (target, channel, code_hash, attempts, max_attempts, expires_at, client_ip)
     VALUES ($1, $2, $3, 0, 5, NOW() + INTERVAL '5 minutes', $4)`,
    [cleanTarget, params.channel, codeHash, params.clientIp || null]
  );

  if (params.channel === "sms") {
    const smsBody =
      params.locale === "uz"
        ? `Azon Vaqfi: Kabinetga kirish kodingiz: ${otpCode} (5 daqiqa amal qiladi).`
        : params.locale === "ar"
          ? `وقف الأذان: رمز الدخول: ${otpCode}`
          : params.locale === "en"
            ? `Ezan Foundation: Your login code is ${otpCode} (valid for 5 min).`
            : `Ezan Vakfı: Hesabım giriş kodunuz: ${otpCode} (5 dk geçerlidir).`;

    const provider = getSmsProvider();
    await provider.sendSms({
      to: cleanTarget,
      body: smsBody,
      encoding: params.locale === "ar" ? "UCS-2" : "TURKISH_LATIN",
      senderHeader: SMS_SENDER_HEADER
    });

    await dbQuery(
      `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
       VALUES ('sms_otp', $1, 'Donor Cabinet OTP', $2, 'sent')`,
      [cleanTarget, smsBody]
    );
  } else {
    const host = params.originHost || "ezanvakfi.org";
    const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    const magicUrl = `${proto}://${host}/api/donor-auth/magic-link?email=${encodeURIComponent(cleanTarget)}&code=${encodeURIComponent(otpCode)}&locale=${params.locale}`;
    await dbQuery(
      `INSERT INTO outbox_messages (channel, recipient, subject, body, status)
       VALUES ('email', $1, 'Ezan Vakfı – Hesabım Tek Kullanımlık Giriş Bağlantısı', $2, 'pending')`,
      [cleanTarget, `Giriş Kodu: ${otpCode}\nTek kullanımlık bağlantı: ${magicUrl}`]
    );
  }

  return {
    sent: true,
    channel: params.channel,
    target: cleanTarget,
    expiresInSeconds: 300,
    // Faqat mock/test rejimida E2E/integratsiya testlari uchun qaytariladi (production live rejimda hech qachon qaytarilmaydi)
    ...(process.env.NODE_ENV !== "production" || (process.env.SMS_PROVIDER || "mock") === "mock"
      ? { devMockOtpCode: otpCode }
      : {})
  };
}

/**
 * 7-qadam: OTP kodni tekshirish (5 daqiqa muddat, maksimal 5 urinish) va 30 kunlik sessiya yaratish.
 */
export async function verifyDonorCabinetOtp(params: {
  channel: "sms" | "email";
  target: string;
  code: string;
  host: string;
  locale: Locale;
}) {
  await ensureSchema();
  const cleanTarget =
    params.channel === "sms" ? normalizePhoneE164(params.target) : (params.target || "").trim().toLowerCase();
  const cleanCode = (params.code || "").trim();

  if (!/^\d{6}$/.test(cleanCode)) {
    const err: any = new Error("INVALID_OTP_FORMAT: 6 xonali kod kiritilishi kerak.");
    err.statusCode = 400;
    throw err;
  }

  const otpRes = await dbQuery(
    `SELECT *
     FROM donor_otp_codes
     WHERE target = $1
       AND channel = $2
       AND used_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [cleanTarget, params.channel]
  );

  const otpRow = otpRes.rows[0];
  if (!otpRow) {
    const err: any = new Error("OTP_NOT_FOUND: Kod topilmadi yoki allaqachon ishlatilgan.");
    err.statusCode = 401;
    throw err;
  }

  if (new Date(otpRow.expires_at).getTime() <= Date.now()) {
    const err: any = new Error("OTP_EXPIRED: Kodning amal qilish muddati (5 daqiqa) tugagan.");
    err.statusCode = 401;
    throw err;
  }

  if (Number(otpRow.attempts) >= Number(otpRow.max_attempts)) {
    const err: any = new Error("OTP_MAX_ATTEMPTS: Maksimal urinishlar soni (5) tugadi. Yangi kod so'rang.");
    err.statusCode = 429;
    throw err;
  }

  const expectedHash = hashOtpCode(cleanCode, cleanTarget);
  let match = false;
  try {
    match = crypto.timingSafeEqual(Buffer.from(otpRow.code_hash), Buffer.from(expectedHash));
  } catch {
    match = false;
  }

  if (!match) {
    await dbQuery(`UPDATE donor_otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otpRow.id]);
    const err: any = new Error("OTP_INVALID: Kod noto'g'ri.");
    err.statusCode = 401;
    throw err;
  }

  await dbQuery(`UPDATE donor_otp_codes SET used_at = NOW() WHERE id = $1`, [otpRow.id]);

  // Donor profilini yaratish yoki yangilash
  const phone = params.channel === "sms" ? cleanTarget : null;
  const email = params.channel === "email" ? cleanTarget : null;

  if (phone) {
    await dbQuery(
      `INSERT INTO donor_profiles (phone, preferred_locale, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (phone) DO NOTHING`,
      [phone, params.locale]
    );
  } else if (email) {
    await dbQuery(
      `INSERT INTO donor_profiles (email, preferred_locale, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (email) DO NOTHING`,
      [email, params.locale]
    );
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await dbQuery(
    `INSERT INTO donor_sessions (token_hash, phone, email, host, locale, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 days')`,
    [tokenHash, phone, email, params.host, params.locale]
  );

  return {
    sessionCookieValue: signSessionToken(rawToken),
    phone,
    email,
    expiresInSeconds: DONOR_SESSION_MAX_AGE_SECONDS
  };
}

export async function getAuthenticatedDonorSession(signedCookie: string | null | undefined) {
  const rawToken = verifySignedSessionToken(signedCookie);
  if (!rawToken) return null;

  await ensureSchema();
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const res = await dbQuery(
    `SELECT phone, email, host, locale, expires_at
     FROM donor_sessions
     WHERE token_hash = $1 AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  const row = res.rows[0];
  if (!row) return null;
  return {
    phone: row.phone as string | null,
    email: row.email as string | null,
    host: row.host as string,
    locale: (row.locale || "tr") as Locale
  };
}

/**
 * 7-qadam: Xayriyachi kabineti ma'lumotlari:
 * - Avvalgi barcha xayriyalar (1-bosqichdagilar ham) telefon yoki e-pochta bo'yicha avtomatik bog'lanadi;
 * - Qurbonliklarim: mavsumlar bo'yicha, hisse holati va imzolangan video havolasi;
 * - Ma'lumotlarim va KVKK.
 */
export async function getDonorCabinetDashboard(params: {
  phone?: string | null;
  email?: string | null;
  locale: Locale;
}) {
  await ensureSchema();
  const phone = params.phone ? normalizePhoneE164(params.phone) : null;
  const phoneDigits = phone ? phone.replace(/\D/g, "") : null;
  const email = params.email ? params.email.trim().toLowerCase() : null;

  const [profileRes, donationsRes, kurbanOrdersRes, kvkkReqRes] = await Promise.all([
    dbQuery(
      `SELECT * FROM donor_profiles
       WHERE ($1::varchar IS NOT NULL AND phone = $1)
          OR ($2::varchar IS NOT NULL AND LOWER(email) = $2)
       LIMIT 1`,
      [phone, email]
    ),
    dbQuery(
      `SELECT id, public_no, status, frequency, amount_try, currency, purpose_code, purpose_title, paid_at, created_at
       FROM donations
       WHERE deleted_pii_at IS NULL
         AND (
           ($1::varchar IS NOT NULL AND REGEXP_REPLACE(COALESCE(donor_phone, ''), '\\D', '', 'g') = $1)
           OR ($2::varchar IS NOT NULL AND LOWER(COALESCE(donor_email, '')) = $2)
         )
       ORDER BY id DESC`,
      [phoneDigits, email]
    ),
    dbQuery(
      `SELECT o.id, o.order_no, o.season_year, o.country_code, o.animal_type, o.total_shares,
              o.total_amount_try, o.status, o.created_at,
              s.id AS share_id, s.seq_in_order, s.owner_name, s.intention_type, s.status AS share_status,
              s.tracking_token, a.tag_no, a.slaughtered_at,
              v.storage_key, v.processed_storage_key, v.status AS video_status
       FROM kurban_orders o
       JOIN kurban_shares s ON s.order_id = o.id
       LEFT JOIN kurban_animals a ON a.id = s.animal_id
       LEFT JOIN kurban_videos v ON v.id = a.video_id
       WHERE ($1::varchar IS NOT NULL AND REGEXP_REPLACE(COALESCE(o.donor_phone, ''), '\\D', '', 'g') = $1)
          OR ($2::varchar IS NOT NULL AND LOWER(COALESCE(o.donor_email, '')) = $2)
       ORDER BY o.season_year DESC, o.id DESC, s.seq_in_order ASC`,
      [phoneDigits, email]
    ),
    dbQuery(
      `SELECT id, status, reason, created_at, decided_at
       FROM kvkk_deletion_requests
       WHERE ($1::varchar IS NOT NULL AND donor_phone = $1)
          OR ($2::varchar IS NOT NULL AND LOWER(donor_email) = $2)
       ORDER BY id DESC`,
      [phone, email]
    )
  ]);

  const profile = profileRes.rows[0] || {
    full_name: donationsRes.rows[0]?.donor_name || "",
    phone,
    email,
    preferred_locale: params.locale,
    sms_notifications: true,
    whatsapp_notifications: true,
    email_notifications: true
  };

  const kurbanShares = kurbanOrdersRes.rows.map((r) => {
    const videoReady = r.video_status === "published";
    const key = r.processed_storage_key || r.storage_key;
    const signed = videoReady && key ? generateSignedVideoUrl({ storageKey: key, expiresInSeconds: 3600 }) : null;
    return {
      orderId: r.id,
      orderNo: r.order_no,
      seasonYear: r.season_year,
      countryCode: r.country_code,
      animalType: r.animal_type,
      shareId: r.share_id,
      seqInOrder: r.seq_in_order,
      ownerName: r.owner_name,
      intentionType: r.intention_type,
      shareStatus: r.share_status,
      trackingToken: r.tracking_token,
      tagNo: r.tag_no || null,
      slaughteredAt: r.slaughtered_at ? new Date(r.slaughtered_at).toISOString() : null,
      videoUrl: signed ? signed.url : null
    };
  });

  return {
    profile: {
      fullName: profile.full_name || "",
      phone: profile.phone || phone,
      email: profile.email || email,
      preferredLocale: profile.preferred_locale || params.locale,
      smsNotifications: Boolean(profile.sms_notifications ?? true),
      whatsappNotifications: Boolean(profile.whatsapp_notifications ?? true),
      emailNotifications: Boolean(profile.email_notifications ?? true)
    },
    donations: donationsRes.rows.map((d) => ({
      id: d.id,
      publicNo: d.public_no,
      status: d.status,
      frequency: d.frequency,
      amountTry: Number(d.amount_try),
      currency: d.currency || "TRY",
      purposeCode: d.purpose_code,
      purposeTitle: d.purpose_title,
      date: new Date(d.paid_at || d.created_at).toISOString().slice(0, 10),
      receiptPdfUrl: `/api/donor-cabinet/receipt-pdf?publicNo=${encodeURIComponent(d.public_no)}`
    })),
    kurbanShares,
    kvkkRequests: kvkkReqRes.rows,
    recurringEnabled: SITE_CONFIG.recurringEnabled
  };
}

export async function updateDonorProfileSettings(params: {
  phone?: string | null;
  email?: string | null;
  fullName: string;
  preferredLocale: Locale;
  smsNotifications: boolean;
  whatsappNotifications: boolean;
  emailNotifications: boolean;
}) {
  await ensureSchema();
  const phone = params.phone ? normalizePhoneE164(params.phone) : null;
  const email = params.email ? params.email.trim().toLowerCase() : null;

  if (phone) {
    const res = await dbQuery(
      `INSERT INTO donor_profiles (phone, email, full_name, preferred_locale, sms_notifications, whatsapp_notifications, email_notifications, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (phone) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, donor_profiles.email),
         full_name = EXCLUDED.full_name,
         preferred_locale = EXCLUDED.preferred_locale,
         sms_notifications = EXCLUDED.sms_notifications,
         whatsapp_notifications = EXCLUDED.whatsapp_notifications,
         email_notifications = EXCLUDED.email_notifications,
         updated_at = NOW()
       RETURNING *`,
      [
        phone,
        email,
        params.fullName.trim(),
        params.preferredLocale,
        params.smsNotifications,
        params.whatsappNotifications,
        params.emailNotifications
      ]
    );
    return res.rows[0];
  }

  if (email) {
    const res = await dbQuery(
      `INSERT INTO donor_profiles (email, full_name, preferred_locale, sms_notifications, whatsapp_notifications, email_notifications, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (email) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         preferred_locale = EXCLUDED.preferred_locale,
         sms_notifications = EXCLUDED.sms_notifications,
         whatsapp_notifications = EXCLUDED.whatsapp_notifications,
         email_notifications = EXCLUDED.email_notifications,
         updated_at = NOW()
       RETURNING *`,
      [
        email,
        params.fullName.trim(),
        params.preferredLocale,
        params.smsNotifications,
        params.whatsappNotifications,
        params.emailNotifications
      ]
    );
    return res.rows[0];
  }

  throw new Error("Either phone or email is required");
}

/**
 * 7-qadam: KVKK bo'yicha o'chirishni so'rash (admin tasdiqlaydi; moliyaviy yozuv anonimlashtiriladi, o'chirilmaydi).
 */
export async function createKvkkDeletionRequest(params: {
  phone?: string | null;
  email?: string | null;
  reason: string;
}) {
  await ensureSchema();
  const phone = params.phone ? normalizePhoneE164(params.phone) : null;
  const email = params.email ? params.email.trim().toLowerCase() : null;
  const res = await dbQuery(
    `INSERT INTO kvkk_deletion_requests (donor_phone, donor_email, reason, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING *`,
    [phone, email, (params.reason || "KVKK doirasida shaxsiy ma'lumotlarni anonimlashtirish so'rovi").trim()]
  );
  return res.rows[0];
}

export async function generateDonorKvkkExportPdf(dashboardData: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("EZAN VAKFI - KVKK KISISEL VERI DOKUMU", { align: "center" });
    doc.moveDown(1);
    doc.fontSize(11).text(`Tarih: ${new Date().toISOString().slice(0, 10)}`);
    doc.text(`Ad Soyad: ${dashboardData.profile.fullName || "-"}`);
    doc.text(`Telefon: ${dashboardData.profile.phone || "-"}`);
    doc.text(`E-posta: ${dashboardData.profile.email || "-"}`);
    doc.moveDown(1);

    doc.fontSize(14).text("Bagis Kayitlari:");
    for (const d of dashboardData.donations || []) {
      doc.fontSize(10).text(`- ${d.date} | ${d.publicNo} | ${d.purposeTitle} | ${d.amountTry} ${d.currency} (${d.status})`);
    }
    doc.moveDown(1);

    doc.fontSize(14).text("Kurban Hisseleri:");
    for (const k of dashboardData.kurbanShares || []) {
      doc.fontSize(10).text(`- ${k.seasonYear} | ${k.orderNo} | ${k.countryCode} | ${k.ownerName} (${k.intentionType}) | ${k.shareStatus}`);
    }

    doc.end();
  });
}
