import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { query, withTransaction } from "./db.mjs";
import { httpError, recordAssetEvent } from "./service.mjs";
import { enqueueOutboxNotification } from "./automationService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const apiRequire = createRequire(path.join(rootDir, "apps/api/package.json"));
const PDFDocument = apiRequire("pdfkit");
const ExcelJS = apiRequire("exceljs");

const VAQF_STORAGE_ROOT = process.env.VAQF_STORAGE_DIR || "/srv/data/vaqf";
const ARCHIVE_DIR = path.join(VAQF_STORAGE_ROOT, "archive");
const PROPERTY_DOCS_DIR = path.join(VAQF_STORAGE_ROOT, "properties");
const RECEIPTS_DIR = path.join(VAQF_STORAGE_ROOT, "receipts");
const BOARD_DIR = path.join(VAQF_STORAGE_ROOT, "board");

for (const d of [ARCHIVE_DIR, PROPERTY_DOCS_DIR, RECEIPTS_DIR, BOARD_DIR]) {
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch {}
}

const FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const HAS_UNICODE_FONT = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);

// ============================================================================
// KVKK SHIFRLASH (AES-256-GCM), MASKALASH VA ANONIMLASHTIRISH
// ============================================================================
function readEnvValueFromFiles(varName) {
  for (const p of [
    "/srv/data/apps/mezana-platform/apps/finance-bff/.env",
    "/srv/data/apps/mezana-platform/.env.platform.local",
  ]) {
    try {
      const raw = fs.readFileSync(p, "utf8");
      const m = raw.match(new RegExp(`^${varName}=(.+)$`, "m"));
      if (m && m[1]) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch {}
  }
  return "";
}

export function getRawPiiSecret(overrideSecret = null) {
  if (overrideSecret !== null && overrideSecret !== undefined) {
    return String(overrideSecret).trim();
  }
  return (
    process.env.VAQF_PII_KEY ||
    process.env.VAQF_PII_ENCRYPTION_KEY ||
    readEnvValueFromFiles("VAQF_PII_KEY") ||
    readEnvValueFromFiles("VAQF_PII_ENCRYPTION_KEY") ||
    process.env.SESSION_SECRET ||
    "mezana-vaqf-kvkk-fallback-key-change-in-env"
  );
}

export function getPiiKey(overrideSecret = null) {
  const rawSecret = getRawPiiSecret(overrideSecret);
  return crypto.createHash("sha256").update(String(rawSecret)).digest();
}

export function getPiiKeyFingerprint(overrideSecret = null) {
  const rawSecret = getRawPiiSecret(overrideSecret);
  return crypto.createHash("sha256").update(String(rawSecret)).digest("hex").slice(0, 12);
}

export function encryptPii(plainText, overrideSecret = null) {
  if (plainText === undefined || plainText === null || String(plainText).trim() === "") {
    return null;
  }
  const text = String(plainText).trim();
  const key = getPiiKey(overrideSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptPii(cipherText, overrideSecret = null) {
  if (!cipherText || typeof cipherText !== "string") return null;
  if (!cipherText.startsWith("v1:")) return null;
  try {
    const [, ivB64, tagB64, dataB64] = cipherText.split(":");
    const key = getPiiKey(overrideSecret);
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

export function extractLast4(val) {
  if (!val) return null;
  const digits = String(val).replace(/\s+/g, "");
  if (!digits) return null;
  return digits.slice(-4);
}

export function maskWithLast4(last4) {
  if (!last4) return null;
  return `***${last4}`;
}

export function maskEmail(email) {
  if (!email || !String(email).includes("@")) return null;
  const [user, dom] = String(email).trim().split("@");
  const prefix = user.slice(0, 2);
  return `${prefix}***@${dom}`;
}

async function logGovernanceEvent(txOrPool, { entityType, entityId, eventType, actor, summary, payload = {} }) {
  const runner = txOrPool?.query ? txOrPool : { query };
  await runner.query(
    `INSERT INTO vaqf.governance_events (entity_type, entity_id, event_type, actor_ref, actor_name, summary, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      entityType,
      Number(entityId || 0),
      eventType,
      actor?.actorId || "system",
      actor?.actorName || "Tizim",
      summary || eventType,
      JSON.stringify(payload || {}),
    ]
  );
}

export async function getGovernanceSettings() {
  const res = await query(
    `SELECT key, value FROM vaqf.settings
     WHERE key IN ('donation_receipt_template', 'lease_finance_mapping', 'board_decision_rules', 'annual_report_template')`
  );
  const map = {};
  for (const r of res.rows) {
    map[r.key] = r.value;
  }
  return {
    donation_receipt_template: map.donation_receipt_template || {
      status_notice: "MUHASIB TASDIQLASHI KERAK",
      foundation_name: "EZAN VAKFI",
      title_tr: "BAĞIŞ MAKBUZU",
      title_uz: "HADYA QABUL KVITANSIYASI (BAĞIŞ MAKBUZU)",
      legal_note_tr:
        "MUHASIB TASDIQLASHI KERAK: Vakıflar Genel Müdürlüğü / Vergi Muafiyeti ve Resmi Makbuz Seri/Sıra Bilgileri muhasebeci tarafından onaylanmalıdır.",
      legal_note_uz:
        "MUHASIB TASDIQLASHI KERAK: Vaqf muhasibi tomonidan rasmiy kvitansiya seriyasi va huquqiy matni tasdiqlanishi lozim.",
    },
    lease_finance_mapping: map.lease_finance_mapping || {
      status_notice: "MUHASIB TASDIQLASHI KERAK",
      rent_income_category_name: "Ijara tushumi (Kira Geliri) — MUHASIB TASDIQLASHI KERAK",
      rent_expense_category_name: "Ijara xarajati (Kira Gideri) — MUHASIB TASDIQLASHI KERAK",
      default_increase_rule: "TÜFE 12 Aylık Ortalama — MUHASIB TASDIQLASHI KERAK",
      expiry_remind_days: [60, 30],
    },
    board_decision_rules: map.board_decision_rules || {
      status_notice: "MUHASIB va kurul tasdiqlashi kerak",
      writeoff_above_threshold: "recommended",
      writeoff_threshold_try: 50000,
      property_transaction: "recommended",
      lease_contract: "recommended",
      restricted_donation_acceptance: "recommended",
      inter_institution_transfer: "recommended",
    },
    annual_report_template: map.annual_report_template || {
      status_notice: "MUHASIB TASDIQLASHI KERAK",
      title_tr: "EZAN VAKFI YILLIK FAALİYET VE MALİ RAPORU",
      title_uz: "EZAN VAKFI YILLIK FAOLIYAT VA MULK HISOBOTI",
      accountant_disclaimer:
        "MUHASIB TASDIQLASHI KERAK: Ushbu hisobot shakli va VGM (Vakıflar Genel Müdürlüğü) beyanname bandlari vaqf muhasibi tomonidan rasmiy tasdiqlanishi shart.",
      sections: [
        { code: "general_info", enabled: true, title_tr: "1. Vakıf Genel Bilgileri, Kurumlar ve Yönetim Kurulu", title_uz: "1. Vaqf umumiy ma'lumotlari, muassasalar va Yönetim Kurulu tarkibi" },
        { code: "real_estate", enabled: true, title_tr: "2. Gayrimenkul (Taşınmaz) Listesi ve Kullanım Durumu", title_uz: "2. Ko'chmas mulk ro'yxati, qiymati va foydalanish holati" },
        { code: "inventory_summary", enabled: true, title_tr: "3. Demirbaş ve Envanter Özeti", title_uz: "3. Asosiy vositalar (jihozlar) yig'ma jadvali" },
        { code: "donations_summary", enabled: true, title_tr: "4. Bağışlar (Nakit, Ayni, Şartlı Bağışlar)", title_uz: "4. Hadyalar: pul, buyum va maqsadli hadyalar sarflanishi" },
        { code: "leases_summary", enabled: true, title_tr: "5. Kira Sözleşmeleri ve Kira Gelir/Giderleri", title_uz: "5. Ijara shartnomalari va ijara tushumi/xarajati" },
        { code: "finance_summary", enabled: true, title_tr: "6. Kurumlar Bazında Gelir ve Gider Özeti", title_uz: "6. Muassasalar kesimida daromad va xarajatlar xulosasi" },
        { code: "board_decisions", enabled: true, title_tr: "7. Yönetim Kurulu Kararları Özeti", title_uz: "7. Yönetim Kurulu qarorlari ro'yxati" },
      ],
    },
  };
}

export async function updateGovernanceSetting(key, value, actor) {
  const allowedKeys = [
    "donation_receipt_template",
    "lease_finance_mapping",
    "board_decision_rules",
    "annual_report_template",
  ];
  if (!allowedKeys.includes(key)) {
    throw httpError(400, `Ruxsat etilmagan sozlama kaliti: ${key}`);
  }
  await query(
    `INSERT INTO vaqf.settings (key, value, updated_by, updated_by_name, updated_at)
     VALUES ($1, $2::jsonb, $3, $4, NOW())
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_by = EXCLUDED.updated_by,
       updated_by_name = EXCLUDED.updated_by_name,
       updated_at = NOW()`,
    [key, JSON.stringify(value || {}), actor?.actorId || null, actor?.actorName || "Direktor"]
  );
  await logGovernanceEvent(null, {
    entityType: "settings",
    entityId: 0,
    eventType: "setting_updated",
    actor,
    summary: `Sozlama yangilandi: ${key}`,
    payload: { key, value },
  });
  return getGovernanceSettings();
}

async function assertMandatoryBoardDecision(ruleKey, boardDecisionId, txOrPool = null) {
  const runner = txOrPool?.query ? txOrPool : { query };
  const rulesRes = await runner.query(`SELECT value FROM vaqf.settings WHERE key = 'board_decision_rules' LIMIT 1`);
  const rules = rulesRes.rows[0]?.value || {};
  if (rules[ruleKey] !== "mandatory") {
    return null;
  }
  const id = Number(boardDecisionId || 0);
  if (!id) {
    throw httpError(
      409,
      `Ushbu amal (${ruleKey}) uchun Yönetim Kurulu qarori majburiy qilib belgilangan. Qabul qilingan ('adopted') qarorni tanlang (MUHASIB va kurul tasdiqlashi kerak).`
    );
  }
  const bdRes = await runner.query(
    `SELECT id, decision_no, status FROM vaqf.board_decisions WHERE id = $1 LIMIT 1`,
    [id]
  );
  const bd = bdRes.rows[0];
  if (!bd || bd.status !== "adopted") {
    throw httpError(
      409,
      `Tanlangan Yönetim Kurulu qarori topilmadi yoki hali tasdiqlanmagan ('adopted' emas).`
    );
  }
  return bd;
}

// ============================================================================
// 1-QADAM: HADYALAR (BAĞIŞ) REESTRI VA DONORLAR
// ============================================================================
export function sanitizeDonorForView(row, vAccess = {}, { includeDecryptedPii = false } = {}) {
  if (!row) return null;
  const canViewPii = Boolean(vAccess?.canViewPii || vAccess?.isDirector || vAccess?.role === "accountant");
  const isAnon = Boolean(row.is_anonymous);

  if (!canViewPii) {
    return {
      id: row.id,
      type: row.type,
      full_name: isAnon ? "Anonim" : row.full_name,
      is_anonymous: isAnon,
      phone_masked: null,
      email_masked: null,
      tax_or_id_masked: null,
      kvkk_consent_at: row.kvkk_consent_at,
      anonymized_at: row.anonymized_at,
      created_at: row.created_at,
    };
  }

  const base = {
    id: row.id,
    type: row.type,
    full_name: row.full_name,
    is_anonymous: isAnon,
    phone_masked: maskWithLast4(row.phone_last4),
    email_masked: row.email_masked || null,
    tax_or_id_masked: maskWithLast4(row.tax_or_id_last4),
    kvkk_consent_at: row.kvkk_consent_at,
    anonymized_at: row.anonymized_at,
    notes: row.notes,
    created_at: row.created_at,
  };

  if (includeDecryptedPii && !row.anonymized_at) {
    base.phone = decryptPii(row.phone_encrypted);
    base.email = decryptPii(row.email_encrypted);
    base.address = decryptPii(row.address_encrypted);
    base.tax_or_id_no = decryptPii(row.tax_or_id_encrypted);
  }

  return base;
}

export async function listDonors({ search = "", vAccess = {} } = {}) {
  const params = [];
  let where = "WHERE 1=1";
  if (search && String(search).trim()) {
    params.push(`%${String(search).trim().toLowerCase()}%`);
    where += ` AND LOWER(d.full_name) LIKE $${params.length}`;
  }
  const res = await query(
    `SELECT d.*,
            COUNT(dn.id)::int AS donations_count,
            COALESCE(SUM(dn.amount_try) FILTER (WHERE dn.status != 'cancelled'), 0)::float AS total_donated_try
     FROM vaqf.donors d
     LEFT JOIN vaqf.donations dn ON dn.donor_id = d.id
     ${where}
     GROUP BY d.id
     ORDER BY d.id DESC`,
    params
  );
  return res.rows.map((r) => ({
    ...sanitizeDonorForView(r, vAccess, { includeDecryptedPii: false }),
    donations_count: r.donations_count,
    total_donated_try: r.total_donated_try,
  }));
}

export async function getDonorDetail(donorId, vAccess = {}) {
  const res = await query(`SELECT * FROM vaqf.donors WHERE id = $1 LIMIT 1`, [Number(donorId)]);
  const row = res.rows[0];
  if (!row) throw httpError(404, "Hadya qiluvchi (donor) topilmadi");
  return sanitizeDonorForView(row, vAccess, { includeDecryptedPii: true });
}

export async function createDonor(body = {}, actor, vAccess = {}) {
  if (!vAccess.canManageDonationsLeases && !vAccess.isDirector) {
    throw httpError(403, "Hadya qiluvchi qo'shish faqat Direktor yoki Hisobchi (muhasib) vakolatida");
  }
  const type = body.type === "organization" ? "organization" : "person";
  const isAnonymous = Boolean(body.is_anonymous);
  const fullName = String(body.full_name || (isAnonymous ? "Anonim Bağışçı" : "")).trim();
  if (!fullName) {
    throw httpError(400, "Hadya qiluvchi F.I.Sh yoki tashkilot nomi kiritilishi shart");
  }

  const phoneEnc = encryptPii(body.phone);
  const phoneLast4 = extractLast4(body.phone);
  const emailEnc = encryptPii(body.email);
  const emailMasked = maskEmail(body.email);
  const addrEnc = encryptPii(body.address);
  const taxEnc = encryptPii(body.tax_or_id_no);
  const taxLast4 = extractLast4(body.tax_or_id_no);
  const kvkkConsentAt = body.kvkk_consent ? new Date().toISOString() : body.kvkk_consent_at || new Date().toISOString();

  const ins = await query(
    `INSERT INTO vaqf.donors (
       type, full_name, phone_encrypted, phone_last4, email_encrypted, email_masked,
       address_encrypted, tax_or_id_encrypted, tax_or_id_last4,
       is_anonymous, kvkk_consent_at, notes, created_by, created_by_name
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      type,
      fullName,
      phoneEnc,
      phoneLast4,
      emailEnc,
      emailMasked,
      addrEnc,
      taxEnc,
      taxLast4,
      isAnonymous,
      kvkkConsentAt,
      body.notes || null,
      actor?.actorId || null,
      actor?.actorName || "Mas'ul",
    ]
  );

  const donor = ins.rows[0];
  await logGovernanceEvent(null, {
    entityType: "donor",
    entityId: donor.id,
    eventType: "created",
    actor,
    summary: `Hadya qiluvchi qo'shildi: ${donor.full_name}`,
  });

  return sanitizeDonorForView(donor, vAccess, { includeDecryptedPii: true });
}

export async function anonymizeDonor(donorId, actor, vAccess = {}) {
  if (!vAccess.isDirector && !vAccess.canManageDonationsLeases) {
    throw httpError(403, "KVKK bo'yicha shaxsiy ma'lumotlarni anonimlashtirish faqat Direktor yoki Hisobchi vakolatida");
  }
  const id = Number(donorId);
  const ex = await query(`SELECT * FROM vaqf.donors WHERE id = $1 LIMIT 1`, [id]);
  if (!ex.rows[0]) throw httpError(404, "Hadya qiluvchi topilmadi");

  const upd = await query(
    `UPDATE vaqf.donors
     SET full_name = $1,
         phone_encrypted = NULL,
         phone_last4 = NULL,
         email_encrypted = NULL,
         email_masked = NULL,
         address_encrypted = NULL,
         tax_or_id_encrypted = NULL,
         tax_or_id_last4 = NULL,
         is_anonymous = TRUE,
         anonymized_at = NOW(),
         anonymized_by = $2,
         notes = 'KVKK talabiga binoan shaxsiy ma''lumotlar o''chirildi (moliyaviy summalar saqlab qolindi)',
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [`Anonim (KVKK #${id})`, actor?.actorId || "director", id]
  );

  await logGovernanceEvent(null, {
    entityType: "donor",
    entityId: id,
    eventType: "kvkk_anonymized",
    actor,
    summary: `Donor #${id} KVKK talabiga ko'ra anonimlashtirildi (moliyaviy summalar saqlandi)`,
  });

  return sanitizeDonorForView(upd.rows[0], vAccess, { includeDecryptedPii: true });
}

async function generateNextDonationNo(tx, year = new Date().getFullYear()) {
  const prefix = `BGS-${year}-`;
  const res = await tx.query(
    `SELECT donation_no FROM vaqf.donations WHERE donation_no LIKE $1 ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );
  let seq = 1;
  if (res.rows[0]?.donation_no) {
    const num = Number.parseInt(res.rows[0].donation_no.replace(prefix, ""), 10);
    if (Number.isFinite(num)) seq = num + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

async function generateNextAssetInventoryNo(tx, instCode = "MZN", catCode = "BSH") {
  const cleanInst = String(instCode || "MZN").toUpperCase().slice(0, 5);
  const cleanCat = String(catCode || "BSH").toUpperCase().slice(0, 5);
  const prefix = `EV-${cleanInst}-${cleanCat}-`;
  const res = await tx.query(
    `SELECT inventory_no FROM vaqf.assets WHERE inventory_no LIKE $1 ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );
  let seq = 1;
  if (res.rows[0]?.inventory_no) {
    const tail = res.rows[0].inventory_no.replace(prefix, "");
    const parsed = Number.parseInt(tail, 10);
    if (Number.isFinite(parsed)) seq = parsed + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createDonation(body = {}, actor, vAccess = {}) {
  if (!vAccess.canManageDonationsLeases && !vAccess.isDirector) {
    throw httpError(403, "Hadya (bağış) qayd etish faqat Direktor yoki Hisobchi (muhasib) vakolatida");
  }

  const kind = ["cash", "in_kind", "property", "other"].includes(body.kind) ? body.kind : "cash";
  const currency = body.currency === "USD" ? "USD" : body.currency === "EUR" ? "EUR" : "TRY";
  const usdRate = Number(body.fx_rate || 35);
  const rawItems = Array.isArray(body.items) ? body.items : [];

  let amount = Number(body.amount || 0);
  if (kind === "in_kind" && amount <= 0 && rawItems.length > 0) {
    amount = rawItems.reduce(
      (acc, it) => acc + Number(it.estimated_value || 0) * Number(it.quantity || 1),
      0
    );
  }
  if (!Number.isFinite(amount) || amount < 0) {
    throw httpError(400, "Hadya summasi/qiymati manfiy bo'lishi mumkin emas");
  }
  const amountTry = currency === "TRY" ? amount : amount * usdRate;
  const restricted = Boolean(body.restricted);
  const purpose = String(body.purpose || (restricted ? "" : "Umumiy vaqf faoliyati")).trim();
  if (restricted && !purpose) {
    throw httpError(400, "Shartli / maqsadli (restricted) hadya uchun maqsad (purpose) kiritilishi shart");
  }

  const receivedAt = body.received_at
    ? String(body.received_at).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const institutionId = body.institution_id ? Number(body.institution_id) : 1;

  const createdId = await withTransaction(async (tx) => {
    if (restricted) {
      await assertMandatoryBoardDecision("restricted_donation_acceptance", body.board_decision_id, tx);
    }

    let donorId = body.donor_id ? Number(body.donor_id) : null;
    if (!donorId && body.donor && typeof body.donor === "object") {
      const dBody = body.donor;
      const dIns = await tx.query(
        `INSERT INTO vaqf.donors (
           type, full_name, phone_encrypted, phone_last4, email_encrypted, email_masked,
           address_encrypted, tax_or_id_encrypted, tax_or_id_last4,
           is_anonymous, kvkk_consent_at, notes, created_by, created_by_name
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12, $13)
         RETURNING id`,
        [
          dBody.type === "organization" ? "organization" : "person",
          String(dBody.full_name || (dBody.is_anonymous ? "Anonim Bağışçı" : "Bağışçı")).trim(),
          encryptPii(dBody.phone),
          extractLast4(dBody.phone),
          encryptPii(dBody.email),
          maskEmail(dBody.email),
          encryptPii(dBody.address),
          encryptPii(dBody.tax_or_id_no),
          extractLast4(dBody.tax_or_id_no),
          Boolean(dBody.is_anonymous),
          dBody.notes || null,
          actor?.actorId || null,
          actor?.actorName || "Mas'ul",
        ]
      );
      donorId = dIns.rows[0].id;
    }

    let donorNameForAsset = "Bağışçı";
    if (donorId) {
      const dr = await tx.query(`SELECT full_name, is_anonymous FROM vaqf.donors WHERE id = $1`, [donorId]);
      if (dr.rows[0]) {
        donorNameForAsset = dr.rows[0].is_anonymous ? "Anonim Bağışçı" : dr.rows[0].full_name;
      }
    }

    const year = Number(receivedAt.slice(0, 4)) || new Date().getFullYear();
    const donationNo = await generateNextDonationNo(tx, year);
    const incomeRef = body.income_ref ? String(body.income_ref).trim() : null;

    const insDon = await tx.query(
      `INSERT INTO vaqf.donations (
         donation_no, donor_id, institution_id, kind, amount, currency, amount_try,
         purpose, restricted, received_at, income_ref, board_decision_id, notes,
         created_by, created_by_name
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        donationNo,
        donorId,
        institutionId,
        kind,
        amount,
        currency,
        amountTry,
        purpose,
        restricted,
        receivedAt,
        incomeRef,
        body.board_decision_id ? Number(body.board_decision_id) : null,
        body.notes || null,
        actor?.actorId || null,
        actor?.actorName || "Mas'ul",
      ]
    );
    const donation = insDon.rows[0];

    // If kind === 'in_kind', automatically create asset cards in vaqf.assets (`acquisition_type = 'donation'`)
    if (kind === "in_kind") {
      const itemsToCreate =
        rawItems.length > 0
          ? rawItems
          : [
              {
                name: body.item_name || purpose || `Hadya buyum (${donationNo})`,
                category_id: body.category_id || 1,
                location_id: body.location_id || null,
                quantity: Number(body.quantity || 1),
                unit: body.unit || "dona",
                estimated_value: amount,
                currency,
                condition: "good",
              },
            ];

      const instRes = await tx.query(`SELECT code FROM vaqf.institutions WHERE id = $1 LIMIT 1`, [institutionId]);
      const instCode = instRes.rows[0]?.code || "MZN";

      for (const it of itemsToCreate) {
        const catId = Number(it.category_id || 1);
        const catRes = await tx.query(`SELECT id, code FROM vaqf.asset_categories WHERE id = $1 LIMIT 1`, [catId]);
        const effectiveCatId = catRes.rows[0]?.id || 1;
        const catCode = catRes.rows[0]?.code || "BSH";
        const invNo = await generateNextAssetInventoryNo(tx, instCode, catCode);
        const qty = Number(it.quantity || 1);
        const tracking = qty > 1 && it.tracking === "batch" ? "batch" : qty > 1 ? "batch" : "individual";
        const estVal = Number(it.estimated_value ?? amount ?? 0);

        const assetIns = await tx.query(
          `INSERT INTO vaqf.assets (
             inventory_no, institution_id, category_id, location_id,
             name, description, tracking, quantity, unit,
             acquisition_type, acquired_at, purchase_price, currency,
             donor_name, condition, status, notes
           ) VALUES (
             $1, $2, $3, $4,
             $5, $6, $7, $8, $9,
             'donation', $10, $11, $12,
             $13, $14, 'in_use', $15
           ) RETURNING *`,
          [
            invNo,
            institutionId,
            effectiveCatId,
            it.location_id ? Number(it.location_id) : null,
            String(it.name || "Hadya buyum").trim(),
            `Hadya (bağış) reestri orqali qabul qilindi: ${donationNo}`,
            tracking,
            qty,
            it.unit || "dona",
            receivedAt,
            estVal,
            it.currency || currency,
            donorNameForAsset,
            it.condition || "good",
            `Bağış No: ${donationNo}`,
          ]
        );
        const createdAsset = assetIns.rows[0];

        await tx.query(
          `INSERT INTO vaqf.asset_events (asset_id, event_type, new_value, note, actor_id, actor_name)
           VALUES ($1, 'created', $2::jsonb, $3, $4, $5)`,
          [
            createdAsset.id,
            JSON.stringify({
              inventory_no: createdAsset.inventory_no,
              acquisition_type: "donation",
              donation_id: donation.id,
              donation_no: donationNo,
            }),
            `Hadya (${donationNo}) asosida avtomatik mulk kartochkasi ochildi`,
            actor?.actorId || null,
            actor?.actorName || "Tizim",
          ]
        );

        await tx.query(
          `INSERT INTO vaqf.donation_items (
             donation_id, name, category_id, location_id, quantity, unit,
             estimated_value, currency, condition, asset_id, notes
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            donation.id,
            createdAsset.name,
            effectiveCatId,
            createdAsset.location_id,
            qty,
            createdAsset.unit,
            estVal,
            it.currency || currency,
            createdAsset.condition,
            createdAsset.id,
            it.notes || null,
          ]
        );
      }
    }

    await logGovernanceEvent(tx, {
      entityType: "donation",
      entityId: donation.id,
      eventType: "created",
      actor,
      summary: `Hadya qayd etildi: ${donationNo} (${kind}, ${amount} ${currency})`,
      payload: { donation_no: donationNo, kind, amount, currency, restricted, purpose },
    });

    return donation.id;
  });

  return getDonationDetail(createdId, vAccess);
}

export async function getDonationDetail(donationId, vAccess = {}) {
  const id = Number(donationId);
  const res = await query(
    `SELECT dn.*, i.name AS institution_name
     FROM vaqf.donations dn
     LEFT JOIN vaqf.institutions i ON i.id = dn.institution_id
     WHERE dn.id = $1 LIMIT 1`,
    [id]
  );
  const row = res.rows[0];
  if (!row) throw httpError(404, "Hadya yozuvi topilmadi");

  let donor = null;
  if (row.donor_id) {
    const dRes = await query(`SELECT * FROM vaqf.donors WHERE id = $1 LIMIT 1`, [row.donor_id]);
    if (dRes.rows[0]) {
      donor = sanitizeDonorForView(dRes.rows[0], vAccess, { includeDecryptedPii: true });
    }
  } else {
    donor = { id: null, full_name: "Anonim", is_anonymous: true };
  }

  const [itemsRes, spendRes] = await Promise.all([
    query(
      `SELECT di.*, a.inventory_no, c.name AS category_name, l.name AS location_name
       FROM vaqf.donation_items di
       LEFT JOIN vaqf.assets a ON a.id = di.asset_id
       LEFT JOIN vaqf.asset_categories c ON c.id = di.category_id
       LEFT JOIN vaqf.locations l ON l.id = di.location_id
       WHERE di.donation_id = $1
       ORDER BY di.id ASC`,
      [id]
    ),
    query(
      `SELECT * FROM vaqf.donation_spend_links WHERE donation_id = $1 ORDER BY spent_at DESC, id DESC`,
      [id]
    ),
  ]);

  const spentTry = spendRes.rows.reduce((acc, s) => acc + Number(s.amount_try || s.amount || 0), 0);
  const remainingTry = Math.max(0, Number(row.amount_try || 0) - spentTry);

  return {
    ...row,
    donor,
    items: itemsRes.rows,
    spend_links: spendRes.rows,
    spent_try: spentTry,
    remaining_try: remainingTry,
  };
}

export async function listDonations({ institutionId = null, kind = null, restricted = null, source = null, vAccess = {} } = {}) {
  const params = [];
  const conds = [];
  if (institutionId && institutionId !== "all") {
    params.push(Number(institutionId));
    conds.push(`dn.institution_id = $${params.length}`);
  }
  if (kind) {
    params.push(String(kind));
    conds.push(`dn.kind = $${params.length}`);
  }
  if (source) {
    params.push(String(source));
    conds.push(`dn.source = $${params.length}`);
  }
  if (restricted !== null && restricted !== undefined && restricted !== "") {
    params.push(restricted === true || restricted === "true");
    conds.push(`dn.restricted = $${params.length}`);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

  const res = await query(
    `SELECT dn.*,
            i.name AS institution_name,
            d.type AS donor_type,
            d.full_name AS donor_full_name,
            d.is_anonymous AS donor_is_anonymous,
            d.phone_last4 AS donor_phone_last4,
            d.tax_or_id_last4 AS donor_tax_last4,
            d.email_masked AS donor_email_masked,
            d.anonymized_at AS donor_anonymized_at,
            COALESCE((SELECT SUM(s.amount_try) FROM vaqf.donation_spend_links s WHERE s.donation_id = dn.id), 0)::float AS spent_try,
            (SELECT JSON_AGG(JSON_BUILD_OBJECT('id', di.id, 'name', di.name, 'asset_id', di.asset_id, 'inventory_no', a.inventory_no))
             FROM vaqf.donation_items di
             LEFT JOIN vaqf.assets a ON a.id = di.asset_id
             WHERE di.donation_id = dn.id) AS items
     FROM vaqf.donations dn
     LEFT JOIN vaqf.institutions i ON i.id = dn.institution_id
     LEFT JOIN vaqf.donors d ON d.id = dn.donor_id
     ${where}
     ORDER BY dn.received_at DESC, dn.id DESC`,
    params
  );

  const canViewPii = Boolean(vAccess?.canViewPii || vAccess?.isDirector || vAccess?.role === "accountant");

  return res.rows.map((r) => {
    const isAnon = Boolean(r.donor_is_anonymous || !r.donor_id);
    const donorDisplay = !canViewPii
      ? {
          id: r.donor_id,
          full_name: isAnon ? "Anonim" : r.donor_full_name || "Anonim",
          is_anonymous: isAnon,
          tax_or_id_masked: null,
          phone_masked: null,
        }
      : {
          id: r.donor_id,
          full_name: r.donor_full_name || "Anonim",
          is_anonymous: isAnon,
          tax_or_id_masked: maskWithLast4(r.donor_tax_last4),
          phone_masked: maskWithLast4(r.donor_phone_last4),
        };
    return {
      ...r,
      donor: donorDisplay,
      items: r.items || [],
      remaining_try: Math.max(0, Number(r.amount_try || 0) - Number(r.spent_try || 0)),
    };
  });
}

export async function addDonationSpendLink(donationId, body = {}, actor, vAccess = {}) {
  if (!vAccess.canManageDonationsLeases && !vAccess.isDirector) {
    throw httpError(403, "Maqsadli hadya xarajatini bog'lash faqat Direktor yoki Hisobchi vakolatida");
  }
  const id = Number(donationId);
  const dnRes = await query(`SELECT * FROM vaqf.donations WHERE id = $1 LIMIT 1`, [id]);
  const dn = dnRes.rows[0];
  if (!dn) throw httpError(404, "Hadya topilmadi");
  if (dn.status === "cancelled") throw httpError(400, "Bekor qilingan hadyaga xarajat bog'lab bo'lmaydi");

  const amount = Number(body.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError(400, "Sarflangan summa 0 dan katta bo'lishi kerak");
  }
  const currency = body.currency || dn.currency || "TRY";
  const amountTry = currency === "TRY" ? amount : amount * Number(body.fx_rate || 35);
  if (dn.restricted) {
    const spentRes = await query(
      `SELECT COALESCE(SUM(amount_try), 0)::float AS spent_try FROM vaqf.donation_spend_links WHERE donation_id = $1`,
      [id]
    );
    const currentSpentTry = Number(spentRes.rows[0]?.spent_try || 0);
    if (currentSpentTry + amountTry > Number(dn.amount_try || 0) + 0.01) {
      throw httpError(400, "Sarflanayotgan summa maqsadli hadyaning qoldiq summasidan oshib ketdi");
    }
  }
  const title = String(body.title || body.description || "Maqsadli hadya hisobidan xarajat").trim();
  const spentAt = body.spent_at ? String(body.spent_at).slice(0, 10) : new Date().toISOString().slice(0, 10);

  await query(
    `INSERT INTO vaqf.donation_spend_links (
       donation_id, expense_ref, title, amount, currency, amount_try, spent_at, notes, created_by, created_by_name
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      body.expense_ref || null,
      title,
      amount,
      currency,
      amountTry,
      spentAt,
      body.notes || null,
      actor?.actorId || null,
      actor?.actorName || "Mas'ul",
    ]
  );

  await logGovernanceEvent(null, {
    entityType: "donation",
    entityId: id,
    eventType: "spend_linked",
    actor,
    summary: `Maqsadli hadyadan xarajat bog'landi: ${amount} ${currency} (${title})`,
  });

  return getDonationDetail(id, vAccess);
}

export async function generateDonationReceiptPdf(donationId, { lang = "tr", actor = null, vAccess = {} } = {}) {
  const detail = await getDonationDetail(donationId, { ...vAccess, canViewPii: true });
  const settings = await getGovernanceSettings();
  const tpl = settings.donation_receipt_template || {};

  const receiptNo = detail.receipt_no || `MKB-${detail.donation_no}`;
  const pdfFileName = `${receiptNo}.pdf`;
  const pdfFullPath = path.join(RECEIPTS_DIR, pdfFileName);

  const buf = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 45 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (HAS_UNICODE_FONT) {
      doc.registerFont("Reg", FONT_REGULAR);
      doc.registerFont("Bold", FONT_BOLD);
      doc.font("Bold");
    }

    const isUz = lang === "uz";
    doc.fontSize(16).text(tpl.foundation_name || "EZAN VAKFI", { align: "center" });
    doc.moveDown(0.3);
    doc
      .fontSize(13)
      .text(isUz ? tpl.title_uz || "HADYA QABUL KVITANSIYASI (BAĞIŞ MAKBUZU)" : tpl.title_tr || "BAĞIŞ MAKBUZU", {
        align: "center",
      });
    doc.moveDown(0.3);

    if (HAS_UNICODE_FONT) doc.font("Reg");
    doc
      .fontSize(8)
      .fillColor("#b45309")
      .text(
        isUz
          ? tpl.legal_note_uz || "MUHASIB TASDIQLASHI KERAK: Rasmiy kvitansiya shabloni muhasib tomonidan tasdiqlanishi lozim."
          : tpl.legal_note_tr || "MUHASIB TASDIQLASHI KERAK: Resmi makbuz şablonu vakıf muhasebecisi tarafından onaylanmalıdır.",
        { align: "center" }
      );
    doc.fillColor("#000000");
    doc.moveDown(1);

    const rows = [
      [isUz ? "Kvitansiya № / Makbuz No" : "Makbuz No", receiptNo],
      [isUz ? "Hadya reestr № / Bağış No" : "Bağış Kayıt No", detail.donation_no],
      [
        isUz ? "Qabul sanasi / Tarih" : "Kabul Tarihi",
        detail.received_at instanceof Date ? detail.received_at.toISOString().slice(0, 10) : String(detail.received_at).slice(0, 10),
      ],
      [
        isUz ? "Hadya qiluvchi / Bağışçı" : "Bağışçı Adı / Ünvanı",
        detail.donor?.is_anonymous ? "Anonim Bağışçı" : detail.donor?.full_name || "Anonim",
      ],
      [
        isUz ? "Vergi / Kimlik No (oxirgi 4)" : "TCKN / VKN (Son 4 Hane)",
        detail.donor?.tax_or_id_masked || "—",
      ],
      [
        isUz ? "Hadya turi / Bağış Türü" : "Bağış Türü",
        detail.kind === "cash"
          ? isUz ? "Pul (Nakit)" : "Nakit Bağış"
          : detail.kind === "in_kind"
          ? isUz ? "Buyum (Ayni)" : "Ayni Bağış (Eşya/Demirbaş)"
          : detail.kind === "property"
          ? isUz ? "Ko'chmas mulk (Taşınmaz)" : "Taşınmaz (Gayrimenkul) Bağışı"
          : detail.kind,
      ],
      [
        isUz ? "Summa / Qiymat (Tutar)" : "Bağış Tutarı / Değeri",
        `${Number(detail.amount || 0).toLocaleString("tr-TR")} ${detail.currency}`,
      ],
      [
        isUz ? "Maqsadi / Bağış Amacı" : "Bağış Amacı / Şartı",
        `${detail.purpose}${detail.restricted ? (isUz ? " (Maqsadli / Şartlı)" : " (Şartlı Bağış)") : ""}`,
      ],
      [isUz ? "Muassasa / Kurum" : "İlgili Kurum", detail.institution_name || "Ezan Vakfı (Genel)"],
    ];

    for (const [k, v] of rows) {
      if (HAS_UNICODE_FONT) doc.font("Bold");
      doc.fontSize(10).text(`${k}: `, { continued: true });
      if (HAS_UNICODE_FONT) doc.font("Reg");
      doc.text(String(v || "—"));
      doc.moveDown(0.35);
    }

    if (detail.items && detail.items.length > 0) {
      doc.moveDown(0.5);
      if (HAS_UNICODE_FONT) doc.font("Bold");
      doc.fontSize(11).text(isUz ? "Qabul qilingan buyumlar ro'yxati:" : "Teslim Alınan Ayni Bağış Kalemleri:");
      if (HAS_UNICODE_FONT) doc.font("Reg");
      for (const it of detail.items) {
        doc
          .fontSize(9.5)
          .text(
            `• ${it.name} — ${it.quantity} ${it.unit} (${Number(it.estimated_value || 0).toLocaleString("tr-TR")} ${it.currency}) [Inventar №: ${it.inventory_no || "—"}]`
          );
      }
    }

    doc.moveDown(2.5);
    const ySig = doc.y;
    doc.fontSize(10).text(tpl.signature_left_tr || "Bağışı Teslim Eden", 55, ySig);
    doc.fontSize(10).text(tpl.signature_right_tr || "Vakıf Yetkilisi / Muhasebe", 340, ySig);
    doc.moveDown(2);
    doc.fontSize(8).fillColor("#64748b").text("İmza / Kaşe", 55, doc.y);
    doc.fontSize(8).fillColor("#64748b").text("İmza / Kaşe", 340, doc.y - 10);

    doc.end();
  });

  await fsp.writeFile(pdfFullPath, buf);

  if (detail.status === "recorded") {
    await query(
      `UPDATE vaqf.donations
       SET status = 'receipt_issued',
           receipt_no = $1,
           receipt_pdf_path = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [receiptNo, pdfFullPath, detail.id]
    );
    await logGovernanceEvent(null, {
      entityType: "donation",
      entityId: detail.id,
      eventType: "receipt_issued",
      actor,
      summary: `Bağış makbuzu shakllantirildi: ${receiptNo}`,
    });
  }

  return { buffer: buf, fileName: pdfFileName, receiptNo };
}

export async function exportDonationsExcel({ institutionId = null, vAccess = {} } = {}) {
  const items = await listDonations({ institutionId, vAccess });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Hadyalar (Bagislar)");
  ws.columns = [
    { header: "Hadya №", key: "donation_no", width: 18 },
    { header: "Sana", key: "received_at", width: 14 },
    { header: "Hadya qiluvchi", key: "donor_name", width: 28 },
    { header: "Vergi/ID (Oxirgi 4)", key: "donor_tax", width: 18 },
    { header: "Turi", key: "kind", width: 14 },
    { header: "Summa", key: "amount", width: 16 },
    { header: "Valyuta", key: "currency", width: 10 },
    { header: "Maqsadi", key: "purpose", width: 30 },
    { header: "Shartli (Restricted)", key: "restricted", width: 18 },
    { header: "Sarflandi (TRY)", key: "spent_try", width: 16 },
    { header: "Qoldiq (TRY)", key: "remaining_try", width: 16 },
    { header: "Holat", key: "status", width: 16 },
  ];
  for (const r of items) {
    ws.addRow({
      donation_no: r.donation_no,
      received_at: r.received_at instanceof Date ? r.received_at.toISOString().slice(0, 10) : String(r.received_at).slice(0, 10),
      donor_name: r.donor?.full_name || "Anonim",
      donor_tax: r.donor?.tax_or_id_masked || "—",
      kind: r.kind,
      amount: Number(r.amount || 0),
      currency: r.currency,
      purpose: r.purpose,
      restricted: r.restricted ? "Ha (Şartlı)" : "Yo'q",
      spent_try: Number(r.spent_try || 0),
      remaining_try: Number(r.remaining_try || 0),
      status: r.status,
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ============================================================================
// 2-QADAM: KO'CHMAS MULK (PROPERTIES) VA IJARA (LEASES)
// ============================================================================
export async function listProperties({ institutionId = null } = {}) {
  const params = [];
  let where = "";
  if (institutionId && institutionId !== "all") {
    params.push(Number(institutionId));
    where = `WHERE p.institution_id = $1`;
  }
  const res = await query(
    `SELECT p.*,
            i.name AS institution_name,
            (SELECT COUNT(*)::int FROM vaqf.locations l WHERE l.property_id = p.id) AS locations_count,
            (SELECT COUNT(*)::int FROM vaqf.assets a JOIN vaqf.locations l ON l.id = a.location_id WHERE l.property_id = p.id AND a.deleted_at IS NULL AND a.status != 'written_off') AS assets_count,
            (SELECT COUNT(*)::int FROM vaqf.leases ls WHERE ls.property_id = p.id AND ls.status = 'active') AS active_leases_count
     FROM vaqf.properties p
     LEFT JOIN vaqf.institutions i ON i.id = p.institution_id
     ${where}
     ORDER BY p.id ASC`,
    params
  );
  return res.rows;
}

export async function getPropertyDetail(propertyId, vAccess = {}) {
  const id = Number(propertyId);
  const res = await query(
    `SELECT p.*, i.name AS institution_name
     FROM vaqf.properties p
     LEFT JOIN vaqf.institutions i ON i.id = p.institution_id
     WHERE p.id = $1 LIMIT 1`,
    [id]
  );
  const prop = res.rows[0];
  if (!prop) throw httpError(404, "Ko'chmas mulk obyekti topilmadi");

  const [docsRes, locsRes, leasesRes] = await Promise.all([
    query(`SELECT * FROM vaqf.property_documents WHERE property_id = $1 ORDER BY id DESC`, [id]),
    query(
      `SELECT l.*,
              (SELECT COUNT(*)::int FROM vaqf.assets a WHERE a.location_id = l.id AND a.deleted_at IS NULL AND a.status != 'written_off') AS assets_count
       FROM vaqf.locations l
       WHERE l.property_id = $1
       ORDER BY l.sort_order ASC, l.id ASC`,
      [id]
    ),
    listLeases({ propertyId: id, vAccess }),
  ]);

  return {
    ...prop,
    documents: docsRes.rows,
    locations: locsRes.rows,
    leases: leasesRes,
  };
}

export async function createProperty(body = {}, actor, vAccess = {}) {
  if (!vAccess.isDirector && !vAccess.canManageDonationsLeases) {
    throw httpError(403, "Ko'chmas mulk qo'shish faqat Direktor yoki Hisobchi vakolatida");
  }
  await assertMandatoryBoardDecision("property_transaction", body.board_decision_id);

  const name = String(body.name || "").trim();
  if (!name) throw httpError(400, "Ko'chmas mulk nomi kiritilishi shart");

  const kind = ["building", "land", "apartment", "shop", "other"].includes(body.kind) ? body.kind : "building";
  const ownership = ["owned", "endowed", "leased_in", "usufruct"].includes(body.ownership) ? body.ownership : "owned";
  const acqType = ["purchase", "donation", "endowment"].includes(body.acquisition_type)
    ? body.acquisition_type
    : "purchase";
  const usage = ["own_use", "leased_out", "vacant", "under_renovation"].includes(body.usage) ? body.usage : "own_use";
  const value = Number(body.value || 0);
  const currency = body.currency === "USD" ? "USD" : "TRY";
  const valueTry = currency === "TRY" ? value : value * Number(body.fx_rate || 35);

  const seqRes = await query(`SELECT COUNT(*)::int + 1 AS next_num FROM vaqf.properties`);
  const code = body.code
    ? String(body.code).trim().toUpperCase()
    : `MLK-${String(seqRes.rows[0].next_num).padStart(3, "0")}`;

  const ins = await query(
    `INSERT INTO vaqf.properties (
       code, name, kind, address, city, district, parcel_ada, parcel_no,
       deed_date, deed_no, share, area_m2, ownership, acquisition_type,
       donation_id, value, currency, value_try, valuation_date, usage,
       institution_id, insurance_until, permit_until, board_decision_id,
       notes, created_by, created_by_name
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19, $20,
       $21, $22, $23, $24,
       $25, $26, $27
     ) RETURNING *`,
    [
      code,
      name,
      kind,
      body.address || null,
      body.city || "İstanbul",
      body.district || null,
      body.parcel_ada || null,
      body.parcel_no || null,
      body.deed_date ? String(body.deed_date).slice(0, 10) : null,
      body.deed_no || null,
      body.share || "Tam (1/1)",
      body.area_m2 ? Number(body.area_m2) : null,
      ownership,
      acqType,
      body.donation_id ? Number(body.donation_id) : null,
      value,
      currency,
      valueTry,
      body.valuation_date ? String(body.valuation_date).slice(0, 10) : null,
      usage,
      body.institution_id ? Number(body.institution_id) : 1,
      body.insurance_until ? String(body.insurance_until).slice(0, 10) : null,
      body.permit_until ? String(body.permit_until).slice(0, 10) : null,
      body.board_decision_id ? Number(body.board_decision_id) : null,
      body.notes || null,
      actor?.actorId || null,
      actor?.actorName || "Mas'ul",
    ]
  );

  const prop = ins.rows[0];

  // Auto-create insurance schedule if insurance_until is provided
  if (prop.insurance_until) {
    const dueStr =
      prop.insurance_until instanceof Date
        ? prop.insurance_until.toISOString().slice(0, 10)
        : String(prop.insurance_until).slice(0, 10);
    await query(
      `INSERT INTO vaqf.schedules (
         institution_id, property_id, title, kind, interval_months, next_due, remind_days_before, responsible_ref, responsible_name
       ) VALUES ($1, $2, $3, 'property_insurance', 12, $4, '[30, 14]'::jsonb, 'role:director', 'Direktor')`,
      [prop.institution_id || 1, prop.id, `Bino sug'urtasi (DASK/Sigorta): ${prop.name}`, dueStr]
    );
  }

  await logGovernanceEvent(null, {
    entityType: "property",
    entityId: prop.id,
    eventType: "created",
    actor,
    summary: `Ko'chmas mulk qo'shildi: ${prop.code} — ${prop.name}`,
  });

  return getPropertyDetail(prop.id, vAccess);
}

export function sanitizeLeaseForView(row, vAccess = {}, { includeDecryptedPii = false } = {}) {
  if (!row) return null;
  const canViewPii = Boolean(vAccess?.canViewPii || vAccess?.isDirector || vAccess?.role === "accountant");
  const out = {
    ...row,
    counterparty_tax_or_id_encrypted: undefined,
    counterparty_phone_encrypted: undefined,
    counterparty_address_encrypted: undefined,
    counterparty_tax_masked: canViewPii ? maskWithLast4(row.counterparty_tax_or_id_last4) : null,
    counterparty_phone_masked: canViewPii ? maskWithLast4(row.counterparty_phone_last4) : null,
  };
  if (includeDecryptedPii && canViewPii && !row.anonymized_at) {
    out.counterparty_tax_or_id = decryptPii(row.counterparty_tax_or_id_encrypted);
    out.counterparty_phone = decryptPii(row.counterparty_phone_encrypted);
    out.counterparty_address = decryptPii(row.counterparty_address_encrypted);
  }
  return out;
}

export async function listLeases({ propertyId = null, institutionId = null, direction = null, vAccess = {} } = {}) {
  const params = [];
  const conds = [];
  if (propertyId) {
    params.push(Number(propertyId));
    conds.push(`l.property_id = $${params.length}`);
  }
  if (institutionId && institutionId !== "all") {
    params.push(Number(institutionId));
    conds.push(`l.institution_id = $${params.length}`);
  }
  if (direction) {
    params.push(String(direction));
    conds.push(`l.direction = $${params.length}`);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

  const res = await query(
    `SELECT l.*,
            p.code AS property_code,
            p.name AS property_name,
            (SELECT COUNT(*)::int FROM vaqf.lease_payments lp WHERE lp.lease_id = l.id AND lp.status = 'overdue') AS overdue_payments_count,
            COALESCE((SELECT SUM(lp.expected_amount - COALESCE(lp.paid_amount, 0)) FROM vaqf.lease_payments lp WHERE lp.lease_id = l.id AND lp.status IN ('overdue', 'partial')), 0)::float AS overdue_amount
     FROM vaqf.leases l
     JOIN vaqf.properties p ON p.id = l.property_id
     ${where}
     ORDER BY l.id DESC`,
    params
  );

  return res.rows.map((r) => sanitizeLeaseForView(r, vAccess, { includeDecryptedPii: false }));
}

export async function getLeaseDetail(leaseId, vAccess = {}) {
  const id = Number(leaseId);
  const res = await query(
    `SELECT l.*, p.code AS property_code, p.name AS property_name
     FROM vaqf.leases l
     JOIN vaqf.properties p ON p.id = l.property_id
     WHERE l.id = $1 LIMIT 1`,
    [id]
  );
  const row = res.rows[0];
  if (!row) throw httpError(404, "Ijara shartnomasi topilmadi");

  const paymentsRes = await query(
    `SELECT * FROM vaqf.lease_payments WHERE lease_id = $1 ORDER BY expected_date ASC, id ASC`,
    [id]
  );

  return {
    ...sanitizeLeaseForView(row, vAccess, { includeDecryptedPii: true }),
    payments: paymentsRes.rows,
  };
}

export async function createLease(body = {}, actor, vAccess = {}) {
  if (!vAccess.canManageDonationsLeases && !vAccess.isDirector) {
    throw httpError(403, "Ijara shartnomasi yaratish faqat Direktor yoki Hisobchi vakolatida");
  }
  const propertyId = Number(body.property_id);
  if (!propertyId) throw httpError(400, "Ko'chmas mulk (property_id) tanlanishi shart");

  const counterpartyName = String(body.counterparty_name || "").trim();
  if (!counterpartyName) throw httpError(400, "Ikkinchi tomon (ijarachi / mulk egasi) nomi kiritilishi shart");

  const startDate = String(body.start_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const endDate = String(body.end_date || "").slice(0, 10);
  if (!endDate || endDate < startDate) {
    throw httpError(400, "Ijara tugash sanasi (end_date) boshlanish sanasidan keyin bo'lishi kerak");
  }

  const monthlyRent = Number(body.monthly_rent || 0);
  if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
    throw httpError(400, "Oylik ijara summasi 0 dan katta bo'lishi kerak");
  }
  const currency = body.currency === "USD" ? "USD" : "TRY";
  const monthlyRentTry = currency === "TRY" ? monthlyRent : monthlyRent * Number(body.fx_rate || 35);
  const paymentDay = Math.min(28, Math.max(1, Number(body.payment_day || 5)));
  const direction = body.direction === "in" ? "in" : "out";

  const createdLeaseId = await withTransaction(async (tx) => {
    await assertMandatoryBoardDecision("lease_contract", body.board_decision_id, tx);

    const year = Number(startDate.slice(0, 4)) || new Date().getFullYear();
    const seqRes = await tx.query(`SELECT COUNT(*)::int + 1 AS next_num FROM vaqf.leases`);
    const leaseNo = `IJR-${year}-${String(seqRes.rows[0].next_num).padStart(4, "0")}`;

    const ins = await tx.query(
      `INSERT INTO vaqf.leases (
         lease_no, property_id, institution_id, direction, counterparty_name,
         counterparty_tax_or_id_encrypted, counterparty_tax_or_id_last4,
         counterparty_phone_encrypted, counterparty_phone_last4,
         counterparty_address_encrypted, kvkk_consent_at,
         start_date, end_date, monthly_rent, currency, monthly_rent_try,
         payment_day, increase_rule, annual_increase_date,
         deposit_amount, deposit_status, board_decision_id, notes,
         created_by, created_by_name
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7,
         $8, $9,
         $10, NOW(),
         $11, $12, $13, $14, $15,
         $16, $17, $18,
         $19, $20, $21, $22,
         $23, $24
       ) RETURNING *`,
      [
        leaseNo,
        propertyId,
        body.institution_id ? Number(body.institution_id) : 1,
        direction,
        counterpartyName,
        encryptPii(body.counterparty_tax_or_id),
        extractLast4(body.counterparty_tax_or_id),
        encryptPii(body.counterparty_phone),
        extractLast4(body.counterparty_phone),
        encryptPii(body.counterparty_address),
        startDate,
        endDate,
        monthlyRent,
        currency,
        monthlyRentTry,
        paymentDay,
        body.increase_rule || "TÜFE (12 oylik o'rtacha) — MUHASIB TASDIQLASHI KERAK",
        body.annual_increase_date ? String(body.annual_increase_date).slice(0, 10) : endDate,
        Number(body.deposit_amount || 0),
        body.deposit_status || "held",
        body.board_decision_id ? Number(body.board_decision_id) : null,
        body.notes || null,
        actor?.actorId || null,
        actor?.actorName || "Mas'ul",
      ]
    );
    const lease = ins.rows[0];

    // Generate monthly payment rows in vaqf.lease_payments (up to 12 months or until endDate)
    const startParts = startDate.split("-").map(Number);
    const endParts = endDate.split("-").map(Number);
    let y = startParts[0];
    let m = startParts[1];
    const maxMonths = Number(body.generate_months || 12);

    for (let i = 0; i < maxMonths; i++) {
      const periodMonth = `${y}-${String(m).padStart(2, "0")}`;
      const expectedDate = `${periodMonth}-${String(paymentDay).padStart(2, "0")}`;
      if (expectedDate > endDate && i > 0) break;

      const todayStr = new Date().toISOString().slice(0, 10);
      const initialStatus = expectedDate < todayStr ? "overdue" : "pending";

      await tx.query(
        `INSERT INTO vaqf.lease_payments (
           lease_id, period_month, expected_date, expected_amount, currency, status
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (lease_id, period_month) DO NOTHING`,
        [lease.id, periodMonth, expectedDate, monthlyRent, currency, initialStatus]
      );

      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      if (y > endParts[0] || (y === endParts[0] && m > endParts[1])) break;
    }

    // Create 60 & 30-day lease expiry schedule in vaqf.schedules
    await tx.query(
      `INSERT INTO vaqf.schedules (
         institution_id, property_id, lease_id, title, kind, next_due, remind_days_before, responsible_ref, responsible_name
       ) VALUES ($1, $2, $3, $4, 'lease_expiry', $5, '[60, 30]'::jsonb, 'role:director', 'Direktor')`,
      [
        lease.institution_id || 1,
        propertyId,
        lease.id,
        `Ijara shartnomasi tugashi (${leaseNo} — ${counterpartyName})`,
        endDate,
      ]
    );

    await logGovernanceEvent(tx, {
      entityType: "lease",
      entityId: lease.id,
      eventType: "created",
      actor,
      summary: `Ijara shartnomasi ochildi: ${leaseNo} (${counterpartyName}, ${monthlyRent} ${currency}/oy)`,
    });

    return lease.id;
  });

  return getLeaseDetail(createdLeaseId, vAccess);
}

export async function recordLeasePayment(leaseId, paymentId, body = {}, actor, vAccess = {}) {
  if (!vAccess.canManageDonationsLeases && !vAccess.isDirector) {
    throw httpError(403, "Ijara to'lovini qayd etish faqat Direktor yoki Hisobchi vakolatida");
  }
  const lId = Number(leaseId);
  const pId = Number(paymentId);

  const pRes = await query(
    `SELECT lp.*, l.direction, l.lease_no, l.counterparty_name
     FROM vaqf.lease_payments lp
     JOIN vaqf.leases l ON l.id = lp.lease_id
     WHERE lp.id = $1 AND lp.lease_id = $2 LIMIT 1`,
    [pId, lId]
  );
  const payment = pRes.rows[0];
  if (!payment) throw httpError(404, "Ijara to'lovi qatori topilmadi");

  const paidAmount = Number(body.paid_amount ?? payment.expected_amount);
  const paidDate = body.paid_date ? String(body.paid_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const status =
    body.status || (paidAmount >= Number(payment.expected_amount) ? "paid" : paidAmount > 0 ? "partial" : "overdue");

  await query(
    `UPDATE vaqf.lease_payments
     SET paid_date = $1,
         paid_amount = $2,
         income_ref = COALESCE($3, income_ref),
         expense_ref = COALESCE($4, expense_ref),
         status = $5,
         notes = COALESCE($6, notes),
         recorded_by = $7,
         recorded_by_name = $8,
         updated_at = NOW()
     WHERE id = $9`,
    [
      paidDate,
      paidAmount,
      body.income_ref || null,
      body.expense_ref || null,
      status,
      body.notes || null,
      actor?.actorId || null,
      actor?.actorName || "Mas'ul",
      pId,
    ]
  );

  await logGovernanceEvent(null, {
    entityType: "lease",
    entityId: lId,
    eventType: "payment_recorded",
    actor,
    summary: `Ijara to'lovi qayd etildi (${payment.lease_no} — ${payment.period_month}): ${paidAmount} ${payment.currency}`,
  });

  return getLeaseDetail(lId, vAccess);
}

export async function checkLeaseRemindersAndOverdue({ referenceDateStr = null } = {}) {
  const todayStr = referenceDateStr || new Date().toISOString().slice(0, 10);

  // 1. Mark pending payments whose expected_date < todayStr as 'overdue'
  const overdueUpd = await query(
    `UPDATE vaqf.lease_payments
     SET status = 'overdue', updated_at = NOW()
     WHERE status = 'pending' AND expected_date < $1::date
     RETURNING id, lease_id, period_month, expected_date, expected_amount, currency`,
    [todayStr]
  );

  // Find all currently overdue payments that haven't generated an outbox notification yet
  const overdueRows = await query(
    `SELECT lp.*, l.lease_no, l.counterparty_name, l.direction, p.name AS property_name
     FROM vaqf.lease_payments lp
     JOIN vaqf.leases l ON l.id = lp.lease_id
     JOIN vaqf.properties p ON p.id = l.property_id
     WHERE lp.status = 'overdue' AND l.status = 'active'`
  );

  let enqueued = 0;
  for (const row of overdueRows.rows) {
    const dedupeKey = `lease_overdue:${row.id}:${row.period_month}`;
    const r = await enqueueOutboxNotification(null, {
      event_type: "schedule_due",
      recipient_ref: "role:director",
      dedupe_key: dedupeKey,
      title: `⚠️ Ijara to'lovi kechikdi: ${row.lease_no}`,
      body:
        `🏢 <b>Ijara to'lovi muddati o'tdi!</b>\n` +
        `• Shartnoma: <b>${row.lease_no}</b> (${row.property_name})\n` +
        `• Tomon: <b>${row.counterparty_name}</b>\n` +
        `• Oy: <b>${row.period_month}</b>\n` +
        `• Summa: <b>${Number(row.expected_amount).toLocaleString("tr-TR")} ${row.currency}</b>`,
      payload: {
        lease_id: row.lease_id,
        payment_id: row.id,
        period_month: row.period_month,
        urgent: true,
      },
    });
    if (r?.id) enqueued += 1;
  }

  return { newlyMarkedOverdue: overdueUpd.rowCount, enqueued };
}

// ============================================================================
// 3-QADAM: SHARTNOMALAR VA HUJJATLAR ARXIVI (KO'P VERSIYALI + MAXFIYLIK)
// ============================================================================
export async function listArchiveDocuments({ category = null, institutionId = null, vAccess = {} } = {}) {
  const params = [];
  const conds = [];
  if (category) {
    params.push(String(category));
    conds.push(`ad.category = $${params.length}`);
  }
  if (institutionId && institutionId !== "all") {
    params.push(Number(institutionId));
    conds.push(`ad.institution_id = $${params.length}`);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

  const res = await query(
    `SELECT ad.*, i.name AS institution_name, p.name AS property_name
     FROM vaqf.archive_documents ad
     LEFT JOIN vaqf.institutions i ON i.id = ad.institution_id
     LEFT JOIN vaqf.properties p ON p.id = ad.property_id
     ${where}
     ORDER BY ad.id DESC`,
    params
  );

  const canAccessRestricted = Boolean(vAccess?.canAccessRestrictedArchive || vAccess?.isDirector);
  return res.rows.map((r) => ({
    ...r,
    file_path: undefined,
    can_download: r.confidentiality === "restricted" ? canAccessRestricted : true,
  }));
}

export async function getArchiveDocumentDetail(docId, vAccess = {}) {
  const id = Number(docId);
  const res = await query(
    `SELECT ad.*, i.name AS institution_name, p.name AS property_name
     FROM vaqf.archive_documents ad
     LEFT JOIN vaqf.institutions i ON i.id = ad.institution_id
     LEFT JOIN vaqf.properties p ON p.id = ad.property_id
     WHERE ad.id = $1 LIMIT 1`,
    [id]
  );
  const doc = res.rows[0];
  if (!doc) throw httpError(404, "Arxiv hujjati topilmadi");

  const canAccessRestricted = Boolean(vAccess?.canAccessRestrictedArchive || vAccess?.isDirector);
  if (doc.confidentiality === "restricted" && !canAccessRestricted) {
    throw httpError(403, "Maxfiy ('restricted') arxiv hujjatini ko'rish va yuklab olish faqat Direktor vakolatida");
  }

  const [versRes, logsRes] = await Promise.all([
    query(
      `SELECT id, archive_doc_id, version_no, file_name, file_size, mime_type, change_note, uploaded_by, uploaded_by_name, created_at
       FROM vaqf.archive_document_versions
       WHERE archive_doc_id = $1
       ORDER BY version_no DESC`,
      [id]
    ),
    query(
      `SELECT * FROM vaqf.archive_access_logs
       WHERE archive_doc_id = $1
       ORDER BY accessed_at DESC
       LIMIT 50`,
      [id]
    ),
  ]);

  return {
    ...doc,
    file_path: undefined,
    versions: versRes.rows,
    access_logs: logsRes.rows,
  };
}

export async function createArchiveDocument(body = {}, actor, vAccess = {}) {
  if (!vAccess.canEdit && !vAccess.canManageDonationsLeases && !vAccess.isDirector) {
    throw httpError(403, "Arxivga hujjat yuklash uchun yetarli huquq yo'q");
  }
  const title = String(body.title || "").trim();
  if (!title) throw httpError(400, "Hujjat sarlavhasi (title) kiritilishi shart");

  const category = ["charter", "deed", "contract", "permit", "tax", "insurance", "protocol", "other"].includes(
    body.category
  )
    ? body.category
    : "contract";
  const confidentiality = body.confidentiality === "restricted" ? "restricted" : "normal";
  if (confidentiality === "restricted" && !vAccess.isDirector) {
    throw httpError(403, "Maxfiy ('restricted') darajadagi hujjatni faqat Direktor yuklashi mumkin");
  }

  const fileName = String(body.file_name || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
  const contentBuffer = body.file_base64
    ? Buffer.from(String(body.file_base64).replace(/^data:[^;]+;base64,/, ""), "base64")
    : Buffer.from(String(body.file_text || `%PDF-1.4\n% Archive Document: ${title}\n`), "utf8");

  const year = new Date().getFullYear();
  const seqRes = await query(`SELECT COUNT(*)::int + 1 AS next_num FROM vaqf.archive_documents`);
  const docCode = `ARX-${year}-${String(seqRes.rows[0].next_num).padStart(4, "0")}`;
  const storedFileName = `${docCode}_v1_${Date.now()}_${fileName}`;
  const fullPath = path.join(ARCHIVE_DIR, storedFileName);
  await fsp.writeFile(fullPath, contentBuffer);

  const validUntil = body.valid_until ? String(body.valid_until).slice(0, 10) : null;
  const institutionId = body.institution_id ? Number(body.institution_id) : 1;

  const createdDocId = await withTransaction(async (tx) => {
    const ins = await tx.query(
      `INSERT INTO vaqf.archive_documents (
         doc_code, title, category, counterparty, doc_date, valid_until,
         institution_id, property_id, tags, confidentiality, current_version,
         file_path, file_name, file_size, mime_type, notes, uploaded_by, uploaded_by_name
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9::jsonb, $10, 1,
         $11, $12, $13, $14, $15, $16, $17
       ) RETURNING *`,
      [
        docCode,
        title,
        category,
        body.counterparty || null,
        body.doc_date ? String(body.doc_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
        validUntil,
        institutionId,
        body.property_id ? Number(body.property_id) : null,
        JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
        confidentiality,
        fullPath,
        fileName,
        contentBuffer.length,
        body.mime_type || "application/pdf",
        body.notes || null,
        actor?.actorId || null,
        actor?.actorName || "Mas'ul",
      ]
    );
    const doc = ins.rows[0];

    await tx.query(
      `INSERT INTO vaqf.archive_document_versions (
         archive_doc_id, version_no, file_path, file_name, file_size, mime_type, change_note, uploaded_by, uploaded_by_name
       ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        doc.id,
        fullPath,
        fileName,
        contentBuffer.length,
        body.mime_type || "application/pdf",
        "Dastlabki versiya (v1)",
        actor?.actorId || null,
        actor?.actorName || "Mas'ul",
      ]
    );

    // If valid_until is set, automatically create an expiry reminder in vaqf.schedules!
    if (validUntil) {
      const schedIns = await tx.query(
        `INSERT INTO vaqf.schedules (
           institution_id, property_id, archive_doc_id, title, kind, next_due, remind_days_before, responsible_ref, responsible_name
         ) VALUES ($1, $2, $3, $4, 'archive_expiry', $5, '[30, 7]'::jsonb, 'role:director', 'Direktor')
         RETURNING id`,
        [
          institutionId,
          doc.property_id,
          doc.id,
          `Hujjat amal qilish muddati (${docCode}: ${title})`,
          validUntil,
        ]
      );
      await tx.query(`UPDATE vaqf.archive_documents SET schedule_id = $1 WHERE id = $2`, [
        schedIns.rows[0].id,
        doc.id,
      ]);
    }

    await logGovernanceEvent(tx, {
      entityType: "archive_document",
      entityId: doc.id,
      eventType: "created",
      actor,
      summary: `Arxiv hujjati yuklandi: ${docCode} — ${title} (${confidentiality})`,
    });

    return doc.id;
  });

  return getArchiveDocumentDetail(createdDocId, { ...vAccess, canAccessRestrictedArchive: true });
}

export async function uploadArchiveNewVersion(docId, body = {}, actor, vAccess = {}) {
  if (!vAccess.canEdit && !vAccess.canManageDonationsLeases && !vAccess.isDirector) {
    throw httpError(403, "Arxiv hujjatiga yangi versiya yuklash uchun huquq yo'q");
  }
  const id = Number(docId);
  const curRes = await query(`SELECT * FROM vaqf.archive_documents WHERE id = $1 LIMIT 1`, [id]);
  const cur = curRes.rows[0];
  if (!cur) throw httpError(404, "Arxiv hujjati topilmadi");
  if (cur.confidentiality === "restricted" && !vAccess.isDirector) {
    throw httpError(403, "Maxfiy ('restricted') hujjatni faqat Direktor yangilay oladi");
  }

  const nextVer = Number(cur.current_version || 1) + 1;
  const fileName = String(body.file_name || cur.file_name || `v${nextVer}.pdf`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const contentBuffer = body.file_base64
    ? Buffer.from(String(body.file_base64).replace(/^data:[^;]+;base64,/, ""), "base64")
    : Buffer.from(String(body.file_text || `%PDF-1.4\n% Archive Document ${cur.doc_code} v${nextVer}\n`), "utf8");

  const storedFileName = `${cur.doc_code}_v${nextVer}_${Date.now()}_${fileName}`;
  const fullPath = path.join(ARCHIVE_DIR, storedFileName);
  await fsp.writeFile(fullPath, contentBuffer);

  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO vaqf.archive_document_versions (
         archive_doc_id, version_no, file_path, file_name, file_size, mime_type, change_note, uploaded_by, uploaded_by_name
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        nextVer,
        fullPath,
        fileName,
        contentBuffer.length,
        body.mime_type || cur.mime_type || "application/pdf",
        body.change_note || `Yangi versiya (v${nextVer})`,
        actor?.actorId || null,
        actor?.actorName || "Mas'ul",
      ]
    );

    await tx.query(
      `UPDATE vaqf.archive_documents
       SET current_version = $1,
           file_path = $2,
           file_name = $3,
           file_size = $4,
           valid_until = COALESCE($5::date, valid_until),
           updated_at = NOW()
       WHERE id = $6`,
      [
        nextVer,
        fullPath,
        fileName,
        contentBuffer.length,
        body.valid_until ? String(body.valid_until).slice(0, 10) : null,
        id,
      ]
    );

    await logGovernanceEvent(tx, {
      entityType: "archive_document",
      entityId: id,
      eventType: "version_uploaded",
      actor,
      summary: `Arxiv hujjati (${cur.doc_code}) yangi versiyasi yuklandi: v${nextVer}`,
    });
  });

  return getArchiveDocumentDetail(id, vAccess);
}

export async function downloadArchiveDocument(docId, { versionNo = null, actor = null, vAccess = {}, ipAddress = null } = {}) {
  const id = Number(docId);
  const res = await query(`SELECT * FROM vaqf.archive_documents WHERE id = $1 LIMIT 1`, [id]);
  const doc = res.rows[0];
  if (!doc) throw httpError(404, "Arxiv hujjati topilmadi");

  const canAccessRestricted = Boolean(vAccess?.canAccessRestrictedArchive || vAccess?.isDirector);
  if (doc.confidentiality === "restricted" && !canAccessRestricted) {
    throw httpError(403, "Maxfiy ('restricted') hujjatni yuklab olish faqat Direktor uchun ruxsat etilgan");
  }

  let targetVer = Number(versionNo || doc.current_version || 1);
  const vRes = await query(
    `SELECT * FROM vaqf.archive_document_versions WHERE archive_doc_id = $1 AND version_no = $2 LIMIT 1`,
    [id, targetVer]
  );
  const verRow = vRes.rows[0] || {
    version_no: doc.current_version,
    file_path: doc.file_path,
    file_name: doc.file_name,
    mime_type: doc.mime_type,
  };

  // Record audit log for download (mandatory for restricted documents, helpful for all)
  await query(
    `INSERT INTO vaqf.archive_access_logs (
       archive_doc_id, version_no, action, confidentiality, user_ref, user_name, user_role, ip_address
     ) VALUES ($1, $2, 'download', $3, $4, $5, $6, $7)`,
    [
      id,
      verRow.version_no,
      doc.confidentiality,
      actor?.actorId || "unknown",
      actor?.actorName || "Foydalanuvchi",
      vAccess?.role || "unknown",
      ipAddress || null,
    ]
  );

  if (doc.confidentiality === "restricted") {
    await logGovernanceEvent(null, {
      entityType: "archive_document",
      entityId: id,
      eventType: "restricted_downloaded",
      actor,
      summary: `Maxfiy ('restricted') hujjat yuklab olindi: ${doc.doc_code} (v${verRow.version_no})`,
    });
  }

  const buffer = await fsp.readFile(verRow.file_path);
  return {
    buffer,
    fileName: verRow.file_name || `${doc.doc_code}.pdf`,
    mimeType: verRow.mime_type || "application/pdf",
  };
}

// ============================================================================
// 4-QADAM: YÖNETİM KURULU QARORLARI (KARAR DEFTERİ)
// ============================================================================
export async function listBoardMembers() {
  const res = await query(`SELECT * FROM vaqf.board_members ORDER BY is_active DESC, id ASC`);
  return res.rows;
}

export async function createBoardMember(body = {}, actor, vAccess = {}) {
  if (!vAccess.isDirector) {
    throw httpError(403, "Yönetim Kurulu a'zolarini boshqarish faqat Direktor vakolatida");
  }
  const fullName = String(body.full_name || "").trim();
  if (!fullName) throw httpError(400, "Kengash a'zosi F.I.Sh kiritilishi shart");

  const ins = await query(
    `INSERT INTO vaqf.board_members (full_name, role_title, user_ref, phone, email, term_start, term_end, is_active, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      fullName,
      body.role_title || "A'zo",
      body.user_ref || null,
      body.phone || null,
      body.email || null,
      body.term_start ? String(body.term_start).slice(0, 10) : null,
      body.term_end ? String(body.term_end).slice(0, 10) : null,
      body.is_active !== false,
      body.notes || null,
    ]
  );
  return ins.rows[0];
}

export async function listBoardMeetings() {
  const res = await query(
    `SELECT bm.*,
            (SELECT COUNT(*)::int FROM vaqf.board_decisions bd WHERE bd.meeting_id = bm.id) AS decisions_count
     FROM vaqf.board_meetings bm
     ORDER BY bm.meeting_date DESC, bm.id DESC`
  );
  return res.rows;
}

export async function createBoardMeeting(body = {}, actor, vAccess = {}) {
  if (!vAccess.isDirector) {
    throw httpError(403, "Yönetim Kurulu yig'ilishini qayd etish faqat Direktor vakolatida");
  }
  const meetingDate = body.meeting_date
    ? String(body.meeting_date).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const year = meetingDate.slice(0, 4);
  const seqRes = await query(`SELECT COUNT(*)::int + 1 AS next_num FROM vaqf.board_meetings`);
  const meetingNo = body.meeting_no || `YKM-${year}-${String(seqRes.rows[0].next_num).padStart(3, "0")}`;

  const ins = await query(
    `INSERT INTO vaqf.board_meetings (
       meeting_no, meeting_date, location, attendees, agenda, status, notes, created_by, created_by_name
     ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      meetingNo,
      meetingDate,
      body.location || "Ezan Vakfı Majlislar zali",
      JSON.stringify(Array.isArray(body.attendees) ? body.attendees : []),
      body.agenda || null,
      body.status || "completed",
      body.notes || null,
      actor?.actorId || null,
      actor?.actorName || "Direktor",
    ]
  );
  return ins.rows[0];
}

export async function listBoardDecisions({ year = null, status = null } = {}) {
  const params = [];
  const conds = [];
  if (year) {
    params.push(Number(year));
    conds.push(`EXTRACT(YEAR FROM bd.decision_date) = $${params.length}`);
  }
  if (status) {
    params.push(String(status));
    conds.push(`bd.status = $${params.length}`);
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

  const res = await query(
    `SELECT bd.*, bm.meeting_no, bm.meeting_date
     FROM vaqf.board_decisions bd
     LEFT JOIN vaqf.board_meetings bm ON bm.id = bd.meeting_id
     ${where}
     ORDER BY bd.decision_date DESC, bd.id DESC`,
    params
  );
  return res.rows;
}

export async function createBoardDecision(body = {}, actor, vAccess = {}) {
  if (!vAccess.isDirector) {
    throw httpError(403, "Yönetim Kurulu qarorini yaratish va tasdiqlash faqat Direktor vakolatida");
  }
  const title = String(body.title || "").trim();
  const bodyText = String(body.body_text || body.text || "").trim();
  if (!title || !bodyText) {
    throw httpError(400, "Qaror sarlavhasi (title) va matni (body_text) kiritilishi shart");
  }
  const decisionDate = body.decision_date
    ? String(body.decision_date).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const year = decisionDate.slice(0, 4);

  let decisionNo = body.decision_no ? String(body.decision_no).trim() : null;
  if (!decisionNo) {
    const seqRes = await query(
      `SELECT COUNT(*)::int + 1 AS next_num FROM vaqf.board_decisions WHERE decision_no LIKE $1`,
      [`${year}/%`]
    );
    decisionNo = `${year}/${String(seqRes.rows[0].next_num).padStart(3, "0")}`;
  }

  const status = ["draft", "adopted", "cancelled"].includes(body.status) ? body.status : "adopted";
  const linkedEntity = body.linked_entity && typeof body.linked_entity === "object" ? body.linked_entity : {};

  const ins = await query(
    `INSERT INTO vaqf.board_decisions (
       decision_no, meeting_id, decision_date, title, body_text,
       vote_for, vote_against, vote_abstain, status, linked_entity,
       created_by, created_by_name, adopted_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::varchar, $10::jsonb, $11, $12, CASE WHEN $9::varchar = 'adopted' THEN NOW() ELSE NULL END)
     RETURNING *`,
    [
      decisionNo,
      body.meeting_id ? Number(body.meeting_id) : null,
      decisionDate,
      title,
      bodyText,
      Number(body.vote_for ?? 5),
      Number(body.vote_against ?? 0),
      Number(body.vote_abstain ?? 0),
      status,
      JSON.stringify(linkedEntity),
      actor?.actorId || null,
      actor?.actorName || "Direktor",
    ]
  );
  const decision = ins.rows[0];

  // If linked to a vaqf.documents row, update its board_decision_id
  if (["document", "writeoff", "transfer"].includes(linkedEntity.type) && linkedEntity.id) {
    await query(`UPDATE vaqf.documents SET board_decision_id = $1 WHERE id = $2`, [
      decision.id,
      Number(linkedEntity.id),
    ]);
  }

  await logGovernanceEvent(null, {
    entityType: "board_decision",
    entityId: decision.id,
    eventType: "created",
    actor,
    summary: `Yönetim Kurulu qarori: ${decision.decision_no} — ${decision.title} (${decision.status})`,
  });

  return decision;
}

export async function generateBoardDecisionPdf(decisionId, { lang = "tr" } = {}) {
  const id = Number(decisionId);
  const res = await query(
    `SELECT bd.*, bm.meeting_no, bm.location AS meeting_location
     FROM vaqf.board_decisions bd
     LEFT JOIN vaqf.board_meetings bm ON bm.id = bd.meeting_id
     WHERE bd.id = $1 LIMIT 1`,
    [id]
  );
  const d = res.rows[0];
  if (!d) throw httpError(404, "Yönetim Kurulu qarori topilmadi");
  const members = await listBoardMembers();

  const buf = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (HAS_UNICODE_FONT) {
      doc.registerFont("Reg", FONT_REGULAR);
      doc.registerFont("Bold", FONT_BOLD);
      doc.font("Bold");
    }

    const isUz = lang === "uz";
    doc.fontSize(15).text("EZAN VAKFI YÖNETİM KURULU KARARI", { align: "center" });
    if (isUz) {
      doc.fontSize(11).text("(BOSHQARUV KENGASHI QARORI MATNI)", { align: "center" });
    }
    doc.moveDown(1);

    if (HAS_UNICODE_FONT) doc.font("Bold");
    doc.fontSize(10.5).text(`Karar No: ${d.decision_no}`);
    const dtStr = d.decision_date instanceof Date ? d.decision_date.toISOString().slice(0, 10) : String(d.decision_date).slice(0, 10);
    doc.text(`Karar Tarihi: ${dtStr}`);
    doc.text(`Toplantı No: ${d.meeting_no || "—"}`);
    doc.text(`Oylama Sonucu: Kabul: ${d.vote_for} | Ret: ${d.vote_against} | Çekimser: ${d.vote_abstain}`);
    doc.moveDown(0.8);

    doc.fontSize(12).text(`Konu / Mavzu: ${d.title}`);
    doc.moveDown(0.5);
    if (HAS_UNICODE_FONT) doc.font("Reg");
    doc.fontSize(10.5).text(d.body_text, { align: "justify", lineGap: 3 });

    doc.moveDown(2);
    if (HAS_UNICODE_FONT) doc.font("Bold");
    doc.fontSize(10.5).text(isUz ? "Yönetim Kurulu A'zolari Imzolari:" : "Yönetim Kurulu Üyeleri İmzaları:");
    doc.moveDown(0.8);
    if (HAS_UNICODE_FONT) doc.font("Reg");

    const sigMembers =
      members.length > 0
        ? members
        : [
            { full_name: "Kengash Raisi (Başkan)", role_title: "Başkan" },
            { full_name: "Rais o'rinbosari (Başkan Vekili)", role_title: "Başkan Vekili" },
            { full_name: "Kengash A'zosi (Üye)", role_title: "Üye" },
          ];
    for (const m of sigMembers) {
      doc.fontSize(10).text(`• ${m.full_name} (${m.role_title}): ___________________________`);
      doc.moveDown(0.6);
    }

    doc.end();
  });

  return { buffer: buf, fileName: `Karar_${String(d.decision_no).replace(/\//g, "-")}.pdf` };
}

// ============================================================================
// 5-QADAM: VAQF DARAJASIDAGI YIG'MA HISOBOT VA DASHBOARD METRIKALARI
// ============================================================================
export async function getGovernanceDashboardSummary({ institutionId = "all" } = {}) {
  const isAll = !institutionId || institutionId === "all";
  const instParams = isAll ? [] : [Number(institutionId)];
  const instFilterP = isAll ? "1=1" : "p.institution_id = $1";
  const instFilterDn = isAll ? "1=1" : "dn.institution_id = $1";
  const instFilterL = isAll ? "1=1" : "l.institution_id = $1";
  const instFilterAd = isAll ? "1=1" : "ad.institution_id = $1";

  const [propRes, donRes, restrictedRes, leaseRes, arrearsRes, expArchiveRes, boardRes] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS properties_count,
         COALESCE(SUM(p.value_try), 0)::float AS total_real_estate_try,
         COUNT(*) FILTER (WHERE p.usage = 'leased_out')::int AS leased_out_count,
         COUNT(*) FILTER (WHERE p.usage = 'own_use')::int AS own_use_count
       FROM vaqf.properties p
       WHERE ${instFilterP}`,
      instParams
    ),
    query(
      `SELECT
         COUNT(*)::int AS ytd_count,
         COALESCE(SUM(dn.amount_try), 0)::float AS ytd_total_try,
         COALESCE(SUM(dn.amount_try) FILTER (WHERE dn.kind = 'cash'), 0)::float AS cash_try,
         COALESCE(SUM(dn.amount_try) FILTER (WHERE dn.kind = 'in_kind'), 0)::float AS in_kind_try,
         COALESCE(SUM(dn.amount_try) FILTER (WHERE dn.kind = 'property'), 0)::float AS property_try
       FROM vaqf.donations dn
       WHERE dn.status != 'cancelled'
         AND EXTRACT(YEAR FROM dn.received_at) = EXTRACT(YEAR FROM CURRENT_DATE)
         AND ${instFilterDn}`,
      instParams
    ),
    query(
      `SELECT
         COUNT(*)::int AS restricted_count,
         COALESCE(SUM(dn.amount_try), 0)::float AS restricted_total_try,
         COALESCE(SUM((SELECT COALESCE(SUM(s.amount_try), 0) FROM vaqf.donation_spend_links s WHERE s.donation_id = dn.id)), 0)::float AS restricted_spent_try
       FROM vaqf.donations dn
       WHERE dn.status != 'cancelled' AND dn.restricted = TRUE AND ${instFilterDn}`,
      instParams
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE l.direction = 'out' AND l.status = 'active')::int AS active_out_leases,
         COUNT(*) FILTER (WHERE l.direction = 'in' AND l.status = 'active')::int AS active_in_leases,
         COALESCE(SUM(l.monthly_rent_try) FILTER (WHERE l.direction = 'out' AND l.status = 'active'), 0)::float AS monthly_expected_rent_income_try,
         COALESCE(SUM(l.monthly_rent_try) FILTER (WHERE l.direction = 'in' AND l.status = 'active'), 0)::float AS monthly_expected_rent_expense_try
       FROM vaqf.leases l
       WHERE ${instFilterL}`,
      instParams
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE lp.status = 'overdue')::int AS overdue_payments_count,
         COALESCE(SUM(lp.expected_amount - COALESCE(lp.paid_amount, 0)) FILTER (WHERE lp.status IN ('overdue', 'partial') AND l.direction = 'out'), 0)::float AS rent_arrears_try,
         COALESCE(SUM(lp.paid_amount) FILTER (WHERE lp.status IN ('paid', 'partial') AND l.direction = 'out' AND EXTRACT(YEAR FROM COALESCE(lp.paid_date, lp.expected_date)) = EXTRACT(YEAR FROM CURRENT_DATE)), 0)::float AS collected_rent_ytd_try
       FROM vaqf.lease_payments lp
       JOIN vaqf.leases l ON l.id = lp.lease_id
       WHERE ${instFilterL}`,
      instParams
    ),
    query(
      `SELECT COUNT(*)::int AS expiring_60d_count
       FROM vaqf.archive_documents ad
       WHERE ad.valid_until IS NOT NULL
         AND ad.valid_until BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '60 days')
         AND ${instFilterAd}`,
      instParams
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_decisions_count,
         COUNT(*) FILTER (WHERE status = 'adopted' AND EXTRACT(YEAR FROM decision_date) = EXTRACT(YEAR FROM CURRENT_DATE))::int AS adopted_ytd_count
       FROM vaqf.board_decisions`
    ),
  ]);

  const pr = propRes.rows[0] || {};
  const dn = donRes.rows[0] || {};
  const rs = restrictedRes.rows[0] || {};
  const ls = leaseRes.rows[0] || {};
  const ar = arrearsRes.rows[0] || {};
  const ex = expArchiveRes.rows[0] || {};
  const bd = boardRes.rows[0] || {};

  return {
    realEstate: {
      properties_count: Number(pr.properties_count || 0),
      total_real_estate_try: Number(pr.total_real_estate_try || 0),
      leased_out_count: Number(pr.leased_out_count || 0),
      own_use_count: Number(pr.own_use_count || 0),
    },
    donationsYtd: {
      ytd_count: Number(dn.ytd_count || 0),
      ytd_total_try: Number(dn.ytd_total_try || 0),
      cash_try: Number(dn.cash_try || 0),
      in_kind_try: Number(dn.in_kind_try || 0),
      property_try: Number(dn.property_try || 0),
      restricted_count: Number(rs.restricted_count || 0),
      restricted_total_try: Number(rs.restricted_total_try || 0),
      restricted_spent_try: Number(rs.restricted_spent_try || 0),
      restricted_remaining_try: Math.max(0, Number(rs.restricted_total_try || 0) - Number(rs.restricted_spent_try || 0)),
    },
    leases: {
      active_out_leases: Number(ls.active_out_leases || 0),
      active_in_leases: Number(ls.active_in_leases || 0),
      monthly_expected_rent_income_try: Number(ls.monthly_expected_rent_income_try || 0),
      monthly_expected_rent_expense_try: Number(ls.monthly_expected_rent_expense_try || 0),
      collected_rent_ytd_try: Number(ar.collected_rent_ytd_try || 0),
      overdue_payments_count: Number(ar.overdue_payments_count || 0),
      rent_arrears_try: Number(ar.rent_arrears_try || 0),
    },
    archive: {
      expiring_60d_count: Number(ex.expiring_60d_count || 0),
    },
    board: {
      draft_decisions_count: Number(bd.draft_decisions_count || 0),
      adopted_ytd_count: Number(bd.adopted_ytd_count || 0),
    },
  };
}

export async function getAnnualVaqfReportData({ year = new Date().getFullYear(), vAccess = {} } = {}) {
  const yr = Number(year) || new Date().getFullYear();
  const settings = await getGovernanceSettings();
  const template = settings.annual_report_template || {};

  const [
    institutionsRes,
    boardMembersRes,
    propertiesRes,
    inventoryByInstRes,
    donationsRes,
    leasesRes,
    boardDecisionsRes,
  ] = await Promise.all([
    query(`SELECT * FROM vaqf.institutions ORDER BY id ASC`),
    query(`SELECT * FROM vaqf.board_members WHERE is_active = TRUE ORDER BY id ASC`),
    query(`SELECT p.*, i.name AS institution_name FROM vaqf.properties p LEFT JOIN vaqf.institutions i ON i.id = p.institution_id ORDER BY p.id ASC`),
    query(
      `SELECT
         i.id AS institution_id,
         i.name AS institution_name,
         COUNT(a.id) FILTER (WHERE a.status != 'written_off')::int AS active_cards,
         COALESCE(SUM(a.quantity) FILTER (WHERE a.status != 'written_off'), 0)::float AS active_units,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END) FILTER (WHERE a.status != 'written_off'), 0)::float AS active_value_try,
         COUNT(a.id) FILTER (WHERE EXTRACT(YEAR FROM COALESCE(a.acquired_at, a.created_at::date)) = $1)::int AS added_year_cards,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END) FILTER (WHERE EXTRACT(YEAR FROM COALESCE(a.acquired_at, a.created_at::date)) = $1 AND a.expense_ref IS NULL AND a.acquisition_type != 'donation'), 0)::float AS direct_asset_additions_try,
         COUNT(a.id) FILTER (WHERE a.status = 'written_off' AND EXTRACT(YEAR FROM a.updated_at) = $1)::int AS written_off_year_cards
       FROM vaqf.institutions i
       LEFT JOIN vaqf.assets a ON a.institution_id = i.id AND a.deleted_at IS NULL
       GROUP BY i.id, i.name
       ORDER BY i.id ASC`,
      [yr]
    ),
    listDonations({ vAccess }),
    listLeases({ vAccess }),
    listBoardDecisions({ year: yr }),
  ]);

  const yearDonations = donationsRes.filter((d) => {
    const dt = d.received_at instanceof Date ? d.received_at.toISOString().slice(0, 4) : String(d.received_at).slice(0, 4);
    return Number(dt) === yr && d.status !== "cancelled";
  });

  // Read Finance income/expenses read-only without double counting `income_ref` or `expense_ref`
  let financeSummary = {
    note: "MUHASIB TASDIQLASHI KERAK: Moliyaviy daromad/xarajat satrlari ikki marta sanalmasligi uchun income_ref va expense_ref bog'lamalari chegirilgan holda ko'rsatiladi.",
    linked_donation_incomes_count: yearDonations.filter((d) => Boolean(d.income_ref)).length,
    unlinked_cash_donations_try: yearDonations
      .filter((d) => d.kind === "cash" && !d.income_ref)
      .reduce((a, b) => a + Number(b.amount_try || 0), 0),
    linked_cash_donations_try: yearDonations
      .filter((d) => d.kind === "cash" && Boolean(d.income_ref))
      .reduce((a, b) => a + Number(b.amount_try || 0), 0),
  };

  return {
    year: yr,
    status_notice: "MUHASIB TASDIQLASHI KERAK",
    template,
    general: {
      foundation_name: "Ezan Vakfı",
      institutions: institutionsRes.rows,
      board_members: boardMembersRes.rows,
    },
    real_estate: propertiesRes.rows,
    inventory_summary: inventoryByInstRes.rows,
    donations_summary: {
      total_count: yearDonations.length,
      total_try: yearDonations.reduce((a, b) => a + Number(b.amount_try || 0), 0),
      cash_try: yearDonations.filter((d) => d.kind === "cash").reduce((a, b) => a + Number(b.amount_try || 0), 0),
      in_kind_try: yearDonations.filter((d) => d.kind === "in_kind").reduce((a, b) => a + Number(b.amount_try || 0), 0),
      property_try: yearDonations.filter((d) => d.kind === "property").reduce((a, b) => a + Number(b.amount_try || 0), 0),
      restricted_items: yearDonations.filter((d) => d.restricted),
      items: yearDonations,
    },
    leases_summary: {
      items: leasesRes,
      active_out_count: leasesRes.filter((l) => l.direction === "out" && l.status === "active").length,
      active_in_count: leasesRes.filter((l) => l.direction === "in" && l.status === "active").length,
      monthly_rent_out_try: leasesRes
        .filter((l) => l.direction === "out" && l.status === "active")
        .reduce((a, b) => a + Number(b.monthly_rent_try || 0), 0),
    },
    finance_summary: financeSummary,
    board_decisions: boardDecisionsRes,
  };
}

export async function generateAnnualVaqfReportPdf({ year = new Date().getFullYear(), lang = "tr", vAccess = {} } = {}) {
  const data = await getAnnualVaqfReportData({ year, vAccess });
  const tpl = data.template || {};
  const isUz = lang === "uz";

  const buf = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (HAS_UNICODE_FONT) {
      doc.registerFont("Reg", FONT_REGULAR);
      doc.registerFont("Bold", FONT_BOLD);
      doc.font("Bold");
    }

    doc
      .fontSize(15)
      .text(
        `${isUz ? tpl.title_uz || "EZAN VAKFI YILLIK HISOBOTI" : tpl.title_tr || "EZAN VAKFI YILLIK FAALİYET RAPORU"} (${data.year})`,
        { align: "center" }
      );
    doc.moveDown(0.3);
    if (HAS_UNICODE_FONT) doc.font("Reg");
    doc
      .fontSize(8.5)
      .fillColor("#b45309")
      .text(tpl.accountant_disclaimer || "MUHASIB TASDIQLASHI KERAK", { align: "center" });
    doc.fillColor("#000000");
    doc.moveDown(1);

    const enabledSections = Array.isArray(tpl.sections)
      ? tpl.sections.filter((s) => s.enabled !== false)
      : [];

    for (const sec of enabledSections) {
      if (HAS_UNICODE_FONT) doc.font("Bold");
      doc.fontSize(11.5).text(isUz ? sec.title_uz || sec.title_tr : sec.title_tr);
      doc.moveDown(0.3);
      if (HAS_UNICODE_FONT) doc.font("Reg");
      doc.fontSize(9.5);

      if (sec.code === "general_info") {
        doc.text(
          `Muassasalar soni: ${data.general.institutions.length} ta (${data.general.institutions.map((i) => i.name).join(", ")})`
        );
        doc.text(`Yönetim Kurulu a'zolari: ${data.general.board_members.length} nafar`);
      } else if (sec.code === "real_estate") {
        for (const p of data.real_estate) {
          doc.text(
            `• [${p.code}] ${p.name} (${p.kind}) — Qiymati: ${Number(p.value || 0).toLocaleString("tr-TR")} ${p.currency} | Holati: ${p.usage}`
          );
        }
      } else if (sec.code === "inventory_summary") {
        for (const inv of data.inventory_summary) {
          doc.text(
            `• ${inv.institution_name}: Faol ${inv.active_cards} kartochka (${inv.active_units} birlik), Jami: ₺${Number(inv.active_value_try || 0).toLocaleString("tr-TR")} | Yil davomida qo'shilgan: ${inv.added_year_cards} ta, hisobdan chiqarilgan: ${inv.written_off_year_cards} ta`
          );
        }
      } else if (sec.code === "donations_summary") {
        const ds = data.donations_summary;
        doc.text(
          `Jami hadyalar (${data.year}): ${ds.total_count} ta — ₺${Number(ds.total_try || 0).toLocaleString("tr-TR")} (Nakit: ₺${Number(ds.cash_try || 0).toLocaleString("tr-TR")}, Ayni: ₺${Number(ds.in_kind_try || 0).toLocaleString("tr-TR")})`
        );
      } else if (sec.code === "leases_summary") {
        const ls = data.leases_summary;
        doc.text(
          `Faol ijaraga berilgan (out): ${ls.active_out_count} ta | Oylik kutilayotgan ijara tushumi: ₺${Number(ls.monthly_rent_out_try || 0).toLocaleString("tr-TR")}`
        );
      } else if (sec.code === "finance_summary") {
        doc.text(data.finance_summary.note);
        doc.text(
          `• Moliya tushumiga bog'langan (income_ref) hadyalar: ${data.finance_summary.linked_donation_incomes_count} ta (₺${Number(data.finance_summary.linked_cash_donations_try || 0).toLocaleString("tr-TR")})`
        );
      } else if (sec.code === "board_decisions") {
        doc.text(`${data.year}-yilda qabul qilingan Yönetim Kurulu qarorlari: ${data.board_decisions.length} ta`);
        for (const bd of data.board_decisions.slice(0, 15)) {
          doc.text(`• [${bd.decision_no}] ${bd.title} (${bd.status})`);
        }
      }
      doc.moveDown(0.8);
    }

    doc.end();
  });

  return { buffer: buf, fileName: `Ezan_Vakfi_Yillik_Rapor_${data.year}_${lang}.pdf` };
}

export async function exportAnnualVaqfReportExcel({ year = new Date().getFullYear(), vAccess = {} } = {}) {
  const data = await getAnnualVaqfReportData({ year, vAccess });
  const wb = new ExcelJS.Workbook();

  const ws1 = wb.addWorksheet("1_Kochmas_Mulk");
  ws1.columns = [
    { header: "Kod", key: "code", width: 14 },
    { header: "Nomi", key: "name", width: 32 },
    { header: "Turi", key: "kind", width: 14 },
    { header: "Egalik", key: "ownership", width: 14 },
    { header: "Foydalanish", key: "usage", width: 16 },
    { header: "Qiymat", key: "value", width: 18 },
    { header: "Valyuta", key: "currency", width: 10 },
  ];
  for (const p of data.real_estate) ws1.addRow(p);

  const ws2 = wb.addWorksheet("2_Hadyalar_Bagis");
  ws2.columns = [
    { header: "Hadya №", key: "donation_no", width: 18 },
    { header: "Hadya qiluvchi", key: "donor_name", width: 26 },
    { header: "Turi", key: "kind", width: 14 },
    { header: "Summa (TRY)", key: "amount_try", width: 16 },
    { header: "Maqsad", key: "purpose", width: 28 },
    { header: "Shartli", key: "restricted", width: 12 },
  ];
  for (const d of data.donations_summary.items) {
    ws2.addRow({
      donation_no: d.donation_no,
      donor_name: d.donor?.full_name || "Anonim",
      kind: d.kind,
      amount_try: Number(d.amount_try || 0),
      purpose: d.purpose,
      restricted: d.restricted ? "Ha" : "Yo'q",
    });
  }

  const ws3 = wb.addWorksheet("3_Karar_Defteri");
  ws3.columns = [
    { header: "Qaror №", key: "decision_no", width: 16 },
    { header: "Sana", key: "decision_date", width: 14 },
    { header: "Sarlavha", key: "title", width: 36 },
    { header: "Holat", key: "status", width: 14 },
  ];
  for (const bd of data.board_decisions) {
    ws3.addRow({
      decision_no: bd.decision_no,
      decision_date: bd.decision_date instanceof Date ? bd.decision_date.toISOString().slice(0, 10) : String(bd.decision_date).slice(0, 10),
      title: bd.title,
      status: bd.status,
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
