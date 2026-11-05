import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { query, withTransaction } from "./db.mjs";
import {
  httpError,
  getActor,
  PHOTOS_DIR,
  createAsset,
  addAssetDocument,
  getAssetDetail,
} from "./service.mjs";
import {
  resolveFullVaqfAccess,
  extractSessionCandidateRefs,
  approveDocument,
  rejectDocument,
  confirmDocumentByRecipient,
  createDocument,
  submitDocument,
  getDocumentDetail,
} from "./lifecycleService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseEnvFile(filePath) {
  const out = {};
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {}
  return out;
}

const platformEnv = parseEnvFile("/srv/data/apps/mezana-platform/.env.platform.local");
const bffEnv = parseEnvFile("/srv/data/apps/mezana-platform/apps/finance-bff/.env");
const vaqfBotEnv = parseEnvFile("/srv/data/apps/mezana-platform/apps/vaqf-bot/.env");
const botEnv = parseEnvFile("/srv/data/apps/mezana-platform/apps/telegram-bot/.env");
const erpEnv = parseEnvFile("/srv/data/apps/moliy/.env");

/**
 * 6-bosqich 0-qadam & 1-qadam:
 * Vaqf xabarlari va Mini App imzosi FAQAT yangi alohida bot tokeni (`VAQF_TELEGRAM_BOT_TOKEN`)
 * bilan ishlaydi. Eski `TELEGRAM_BOT_TOKEN` ga hech qachon fallback qilinmaydi!
 */
export function getVaqfTelegramBotToken() {
  return (
    process.env.VAQF_TELEGRAM_BOT_TOKEN ||
    bffEnv.VAQF_TELEGRAM_BOT_TOKEN ||
    vaqfBotEnv.VAQF_TELEGRAM_BOT_TOKEN ||
    platformEnv.VAQF_TELEGRAM_BOT_TOKEN ||
    botEnv.VAQF_TELEGRAM_BOT_TOKEN ||
    ""
  );
}

// Backward-compatible alias inside Vaqf module — always returns ONLY the dedicated Vaqf bot token
export function getTelegramBotToken() {
  return getVaqfTelegramBotToken();
}

export function getLegacyMezanaBotToken() {
  return (
    process.env.TELEGRAM_BOT_TOKEN ||
    botEnv.TELEGRAM_BOT_TOKEN ||
    platformEnv.TELEGRAM_BOT_TOKEN ||
    ""
  );
}

export function getVaqfBotUsername() {
  return (
    process.env.VAQF_TELEGRAM_BOT_USERNAME ||
    bffEnv.VAQF_TELEGRAM_BOT_USERNAME ||
    platformEnv.VAQF_TELEGRAM_BOT_USERNAME ||
    "ezanvakfitizimbot"
  ).replace(/^@/, "");
}

export function maskBotToken(token) {
  const s = String(token || "").trim();
  if (!s) return "";
  return `***${s.slice(-4)}`;
}

export function sanitizeSecretFromText(input) {
  let text = String(input ?? "");
  text = text.replace(/[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}/g, (m) => `***${m.slice(-4)}`);
  const vaqfTok = getVaqfTelegramBotToken();
  if (vaqfTok && text.includes(vaqfTok)) {
    text = text.split(vaqfTok).join(`***${vaqfTok.slice(-4)}`);
  }
  const legTok = getLegacyMezanaBotToken();
  if (legTok && text.includes(legTok)) {
    text = text.split(legTok).join(`***${legTok.slice(-4)}`);
  }
  return text;
}

export function getVaqfBotSecret() {
  return (
    process.env.VAQF_BOT_SECRET ||
    bffEnv.VAQF_BOT_SECRET ||
    vaqfBotEnv.VAQF_BOT_SECRET ||
    botEnv.VAQF_BOT_SECRET ||
    platformEnv.VAQF_BOT_SECRET ||
    "vaqf_internal_bot_secret_2026"
  );
}

// ============================================================================
// 0-QADAM.3 & 2-QADAM: TELEGRAM LINK RESOLUTION (NO GUESSING BY PHONE/USERNAME)
// ============================================================================
/**
 * Resolves a Telegram user ID strictly via `identity.telegram_links` (one-time code links only).
 * Never uses `identity.telegram_contacts` and never guesses by phone number or @username.
 */
export async function resolveLinkedUserByTelegramId(telegramId) {
  const tgId = String(telegramId || "").trim();
  if (!tgId) return null;

  const res = await query(
    `SELECT
       u.id AS user_id,
       u.email,
       e.id AS employee_id,
       e."fullName" AS employee_name,
       e.username AS employee_username,
       e.position AS employee_position,
       tl."telegramId" AS link_tg_id
     FROM identity.telegram_links tl
     INNER JOIN identity."User" u ON u.id = tl."userId"
     LEFT JOIN people."Employee" e ON e."userId" = u.id AND e."deletedAt" IS NULL
     WHERE tl."telegramId" = $1
     LIMIT 1`,
    [tgId]
  );

  const row = res.rows[0];
  if (!row) return null;

  const isDirectorUser =
    row.user_id === "cmtlai0bg000ipir95hv9hfez" ||
    row.user_id === "cmdev00000000000000000001" ||
    String(row.email || "").toLowerCase() === "director@moliy.org" ||
    String(row.email || "").toLowerCase() === "dev@moliy.org";

  let crmUser = null;
  const emailLower = String(row.email || "").toLowerCase();
  if (isDirectorUser) {
    crmUser = { id: 3, username: "mezana", role: "root" };
  } else if (emailLower === "idora@moliya.org") {
    crmUser = tgId === "8014832689" ? { id: 1, username: "userumar", role: "admin" } : { id: 5, username: "idora", role: "admin" };
  } else if (emailLower === "vaqf@moliya.org") {
    crmUser = { id: 2, username: "abdurahman", role: "admin" };
  }

  const displayName =
    row.employee_name ||
    row.email ||
    `Foydalanuvchi (${tgId})`;

  const sess = {
    user: {
      id: row.user_id,
      name: displayName,
      email: row.email,
      role: isDirectorUser ? "DIRECTOR" : "EMPLOYEE",
      identifier: row.email || row.user_id,
    },
    erpUser: {
      id: row.user_id,
      email: row.email,
      role: isDirectorUser ? "DIRECTOR" : "EMPLOYEE",
      employeeId: row.employee_id || null,
    },
    crmUser,
    telegramId: tgId,
  };

  const accessContext = {
    isDirector: isDirectorUser,
    employeeId: row.employee_id || null,
    accountName: displayName,
    sourceLabel: displayName,
  };

  const vaqfAccess = await resolveFullVaqfAccess(sess, accessContext);

  return {
    telegramId: tgId,
    userId: row.user_id,
    employeeId: row.employee_id,
    email: row.email,
    displayName,
    sess,
    accessContext,
    vaqfAccess,
  };
}

/**
 * Resolves a Vaqf `recipient_ref` (e.g. `role:director`, `role:inventory_manager`, `userumar`,
 * `muhammadjon@moliya.org`, `erp:cmtlai0pv000upir9qk3vaotg`, `<userId>`) to linked Telegram chat IDs.
 * Strictly uses `identity.telegram_links` (one-time code links only). Never uses `telegram_contacts`
 * and never guesses by phone number or @username!
 */
export async function resolveTelegramIdsForRecipientRef(recipientRef) {
  const ref = String(recipientRef || "").trim().toLowerCase();
  if (!ref) return [];

  // Role-based broadcast targets
  if (
    ref === "role:director" ||
    ref === "director" ||
    ref === "mezana" ||
    ref === "direktor@moliya.org" ||
    ref === "director@moliy.org"
  ) {
    const dirRes = await query(
      `SELECT DISTINCT tl."telegramId" AS tg_id
       FROM identity.telegram_links tl
       INNER JOIN identity."User" u ON u.id = tl."userId"
       LEFT JOIN vaqf.user_roles ur ON (LOWER(ur.user_ref) = LOWER(u.id) OR LOWER(ur.user_ref) = LOWER(u.email)) AND ur.role = 'director'
       WHERE (u.id IN ('cmtlai0bg000ipir95hv9hfez', 'cmdev00000000000000000001') OR ur.id IS NOT NULL)
         AND tl."telegramId" IS NOT NULL`
    );
    return dirRes.rows.map((r) => String(r.tg_id));
  }

  if (ref === "role:inventory_manager") {
    const mgrRoles = await query(
      `SELECT user_ref, alternate_refs FROM vaqf.user_roles WHERE role = 'inventory_manager'`
    );
    const tgIds = new Set();
    for (const r of mgrRoles.rows) {
      const ids = await resolveTelegramIdsForRecipientRef(r.user_ref);
      for (const id of ids) tgIds.add(id);
    }
    // If no inventory_manager is assigned yet, fallback to director so notifications aren't lost
    if (tgIds.size === 0) {
      return resolveTelegramIdsForRecipientRef("role:director");
    }
    return Array.from(tgIds);
  }

  // Strip prefixes like `erp:emp:`, `erp:`, `crm:admin:`
  const cleanRef = ref
    .replace(/^erp:emp:/, "")
    .replace(/^erp:user:/, "")
    .replace(/^erp:/, "")
    .replace(/^crm:emp:/, "");

  // Also check if ref matches a user_roles entry's alternate_refs
  const candidateTokens = new Set([ref, cleanRef]);
  if (ref === "userumar" || ref === "crm:admin:1" || cleanRef === "umarxon@moliya.org") {
    candidateTokens.add("idora@moliya.org");
    candidateTokens.add("cmtlai0il000npir9ydqrvy3s");
    candidateTokens.add("cmtlai0it000ppir989mu70w1");
  }
  if (ref === "idora" || ref === "crm:admin:5") {
    candidateTokens.add("idora@moliya.org");
    candidateTokens.add("cmtlai0il000npir9ydqrvy3s");
    candidateTokens.add("cmtlai0it000ppir989mu70w1");
  }
  if (ref === "abdurahman" || ref === "crm:admin:2") {
    candidateTokens.add("vaqf@moliya.org");
    candidateTokens.add("cmvaqf0000000000000000001");
    candidateTokens.add("cmvaqfemp0000000000000001");
  }

  const roleAliasRes = await query(
    `SELECT user_ref, alternate_refs
     FROM vaqf.user_roles
     WHERE LOWER(user_ref) = ANY($1::text[])
        OR LOWER(user_name) = ANY($1::text[])`,
    [Array.from(candidateTokens)]
  );
  for (const row of roleAliasRes.rows) {
    candidateTokens.add(String(row.user_ref).toLowerCase());
    if (Array.isArray(row.alternate_refs)) {
      for (const a of row.alternate_refs) {
        const s = String(a).toLowerCase().trim();
        candidateTokens.add(s);
        candidateTokens.add(s.replace(/^erp:emp:/, "").replace(/^erp:/, ""));
      }
    }
  }

  const tokensArr = Array.from(candidateTokens);

  const linkRes = await query(
    `SELECT DISTINCT tl."telegramId" AS tg_id
     FROM identity.telegram_links tl
     INNER JOIN identity."User" u ON u.id = tl."userId"
     LEFT JOIN people."Employee" e ON e."userId" = u.id AND e."deletedAt" IS NULL
     WHERE tl."telegramId" IS NOT NULL
       AND (
         LOWER(u.id) = ANY($1::text[])
         OR LOWER(COALESCE(u.email, '')) = ANY($1::text[])
         OR LOWER(COALESCE(e.id, '')) = ANY($1::text[])
         OR LOWER(COALESCE(e.username, '')) = ANY($1::text[])
         OR LOWER(COALESCE(e."fullName", '')) = ANY($1::text[])
       )`,
    [tokensArr]
  );

  let tgIds = linkRes.rows.map((r) => String(r.tg_id));
  // If specifically targeting userumar vs idora on the shared Idora ERP user:
  if ((ref === "userumar" || ref === "crm:admin:1") && tgIds.includes("8014832689")) {
    return ["8014832689"];
  }
  return tgIds;
}

/**
 * Verifies Telegram Mini App `initData` HMAC-SHA256 signature on the server.
 */
export function verifyTelegramWebAppInitData(initDataRaw, botToken = getTelegramBotToken()) {
  if (!initDataRaw || typeof initDataRaw !== "string" || !botToken) {
    return { valid: false, error: "initData yoki bot token mavjud emas" };
  }
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  if (!hash) {
    return { valid: false, error: "initData ichida hash imzosi topilmadi" };
  }

  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (k === "hash") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const hashBuf = Buffer.from(hash, "hex");
  const compBuf = Buffer.from(computedHash, "hex");
  if (hashBuf.length !== compBuf.length || !crypto.timingSafeEqual(hashBuf, compBuf)) {
    return { valid: false, error: "Telegram WebApp initData imzosi noto'g'ri" };
  }

  let userObj = null;
  try {
    userObj = JSON.parse(params.get("user") || "null");
  } catch {}
  if (!userObj || !userObj.id) {
    return { valid: false, error: "initData ichida foydalanuvchi ID topilmadi" };
  }

  return {
    valid: true,
    telegramId: String(userObj.id),
    user: userObj,
  };
}

/**
 * Generates valid Telegram WebApp `initData` for automated testing.
 */
export function signTelegramWebAppInitDataForTest(userObj, botToken = getTelegramBotToken()) {
  const authDate = String(Math.floor(Date.now() / 1000));
  const userJson = JSON.stringify(userObj);
  const params = new URLSearchParams();
  params.set("auth_date", authDate);
  params.set("query_id", "AAHdF6IQAAAAAN0XohDhrOrc");
  params.set("user", userJson);

  const pairs = [];
  for (const [k, v] of params.entries()) {
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

// ============================================================================
// 1-QADAM: OUTBOX SERVICE & WORKER (`vaqf.notifications_outbox`)
// ============================================================================
function buildDefaultOutboxTitleAndBody(eventType, payload = {}) {
  const p = payload || {};
  const docId = p.document_id || p.doc_id;
  if (eventType === "approval_needed") {
    return {
      title: `Direktor tasdig'i kutilmoqda: ${p.doc_no || `#${docId}`}`,
      body:
        `📄 Hujjat: <b>${p.doc_no || `#${docId}`}</b> (${p.type || "amal"})\n` +
        (p.items_summary ? `📦 Buyumlar: <b>${p.items_summary}</b>\n` : "") +
        (p.reason ? `📝 Sabab: ${p.reason}\n` : "") +
        `👤 Kiritdi: <b>${p.created_by_name || "Mas'ul"}</b>`,
    };
  }
  if (eventType === "assigned_to_you") {
    return {
      title: `Sizning zimmangizga buyum biriktirildi (${p.doc_no || `#${docId}`})`,
      body:
        `📄 Dalolatnoma: <b>${p.doc_no || `#${docId}`}</b>\n` +
        (p.items_summary ? `📦 Buyumlar: <b>${p.items_summary}</b>\n` : "") +
        `👤 Topshiruvchi: <b>${p.from_person_name || "Vaqf mas'uli"}</b>\n\n` +
        `<i>Buyumlarni qabul qilib olganingizni tasdiqlang:</i>`,
    };
  }
  if (eventType === "document_decided") {
    const isApp = p.decision === "approved";
    return {
      title: isApp
        ? `✅ Hujjat tasdiqlandi: ${p.doc_no || `#${docId}`}`
        : `❌ Hujjat rad etildi: ${p.doc_no || `#${docId}`}`,
      body:
        `📄 Hujjat: <b>${p.doc_no || `#${docId}`}</b>\n` +
        `👤 Qaror: <b>${isApp ? "Tasdiqlandi" : "Rad etildi"}</b> (${p.decided_by_name || "Direktor"})\n` +
        (p.reason ? `📝 Sabab: ${p.reason}` : ""),
    };
  }
  if (eventType === "fault_reported") {
    return {
      title: `⚠️ Yangi nosozlik xabari: ${p.inventory_no || ""} ${p.asset_name || ""}`.trim(),
      body:
        `📦 Buyum: <b>${p.asset_name || "Buyum"} (${p.inventory_no || ""})</b>\n` +
        `⚠️ Muammo: <b>${p.description || ""}</b>\n` +
        `👤 Xabar berdi: <b>${p.reported_by_name || "Xodim"}</b>`,
    };
  }
  if (eventType === "count_submitted") {
    return {
      title: `📋 Inventarizatsiya ko'rib chiqishga yuborildi: ${p.count_code || ""}`,
      body:
        `📋 Sanoq: <b>${p.count_code || ""} — ${p.title || ""}</b>\n` +
        `📊 Kutilgan: <b>${p.expected_cards ?? 0}</b> | Topilgan: <b>${p.present_cards ?? 0}</b> | Farqlar: <b>${p.discrepancy_count ?? 0} ta</b>\n` +
        `👤 Yubordi: <b>${p.submitted_by || "Mas'ul"}</b>`,
    };
  }
  if (eventType === "count_location_assigned") {
    return {
      title: `📷 Inventarizatsiya: xonani sanash vazifasi (${p.count_code || ""})`,
      body:
        `📋 Sanoq: <b>${p.count_code || ""} — ${p.title || ""}</b>\n` +
        `📍 Sizga biriktirilgan joylar: <b>${p.location_name || ""}</b>\n` +
        `<i>Telefonda QR skanerlashni boshlashingiz mumkin.</i>`,
    };
  }
  return {
    title: "Vaqf xabarnomasi",
    body: p.message || p.description || "",
  };
}

export async function enqueueOutboxNotification(txOrDb, opts = {}) {
  const dbRunner = txOrDb && typeof txOrDb.query === "function" ? txOrDb : { query };
  const evType = opts.event_type || opts.eventType;
  const cleanRef = String(opts.recipient_ref || opts.recipientRef || "role:director").trim();
  const dedupeKey = opts.dedupe_key || opts.dedupeKey || null;
  const rawPayload = { ...(opts.payload || {}) };
  if (rawPayload.doc_id && !rawPayload.document_id) {
    rawPayload.document_id = rawPayload.doc_id;
  }
  const defaults = buildDefaultOutboxTitleAndBody(evType, rawPayload);
  const title = opts.title || defaults.title;
  const body = opts.body || defaults.body;

  const res = await dbRunner.query(
    `INSERT INTO vaqf.notifications_outbox (
       event_type, recipient_ref, title, body, payload, status, dedupe_key
     ) VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', $6)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING *`,
    [
      evType,
      cleanRef,
      title || "Vaqf xabarnomasi",
      body || "",
      JSON.stringify(rawPayload),
      dedupeKey,
    ]
  );
  return res.rows[0] || null;
}

/**
 * Checks whether a given Date is inside quiet hours (default 22:00-07:00 Europe/Istanbul).
 */
export function isWithinIstanbulQuietHours(now = new Date(), quietStart = "22:00", quietEnd = "07:00") {
  const istStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [h, m] = istStr.split(":").map(Number);
  const curMins = h * 60 + m;

  const [sh, sm] = String(quietStart || "22:00").split(":").map(Number);
  const [eh, em] = String(quietEnd || "07:00").split(":").map(Number);
  const startMins = sh * 60 + (sm || 0);
  const endMins = eh * 60 + (em || 0);

  if (startMins > endMins) {
    // Crosses midnight (e.g., 22:00 to 07:00)
    return curMins >= startMins || curMins < endMins;
  }
  return curMins >= startMins && curMins < endMins;
}

export async function getUserNotificationPrefs(userRef) {
  const ref = String(userRef || "").trim().toLowerCase();
  const res = await query(
    `SELECT * FROM vaqf.user_notification_prefs WHERE LOWER(user_ref) = $1 LIMIT 1`,
    [ref]
  );
  const row = res.rows[0];
  return {
    user_ref: ref,
    enabled_events: row?.enabled_events || ["*"],
    quiet_hours_enabled: row ? Boolean(row.quiet_hours_enabled) : true,
    quiet_start: row?.quiet_start || "22:00",
    quiet_end: row?.quiet_end || "07:00",
  };
}

export async function updateUserNotificationPrefs(userRef, body = {}) {
  const cur = await getUserNotificationPrefs(userRef);
  const enabledEvents = Array.isArray(body.enabled_events) ? body.enabled_events : cur.enabled_events;
  const quietEnabled =
    body.quiet_hours_enabled !== undefined ? Boolean(body.quiet_hours_enabled) : cur.quiet_hours_enabled;
  const quietStart = body.quiet_start || cur.quiet_start || "22:00";
  const quietEnd = body.quiet_end || cur.quiet_end || "07:00";

  await query(
    `INSERT INTO vaqf.user_notification_prefs (
       user_ref, enabled_events, quiet_hours_enabled, quiet_start, quiet_end, updated_at
     ) VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
     ON CONFLICT (user_ref) DO UPDATE
       SET enabled_events = EXCLUDED.enabled_events,
           quiet_hours_enabled = EXCLUDED.quiet_hours_enabled,
           quiet_start = EXCLUDED.quiet_start,
           quiet_end = EXCLUDED.quiet_end,
           updated_at = NOW()`,
    [cur.user_ref, JSON.stringify(enabledEvents), quietEnabled, quietStart, quietEnd]
  );
  return getUserNotificationPrefs(cur.user_ref);
}

function buildTelegramInlineKeyboardForOutbox(row) {
  const p = row.payload || {};
  const ev = row.event_type;

  if (ev === "approval_needed" && p.document_id) {
    return {
      inline_keyboard: [
        [
          { text: "✅ Tasdiqlash", callback_data: `vaqf:app:${p.document_id}:${row.id}` },
          { text: "❌ Rad etish", callback_data: `vaqf:rej:${p.document_id}:${row.id}` },
        ],
        [{ text: "🔎 Batafsil", callback_data: `vaqf:doc:${p.document_id}` }],
      ],
    };
  }

  if (ev === "assigned_to_you" && p.document_id) {
    return {
      inline_keyboard: [
        [
          { text: "✅ Qabul qildim", callback_data: `vaqf:cfm:${p.document_id}:${row.id}` },
          { text: "🔎 Ro'yxat", callback_data: `vaqf:doc:${p.document_id}` },
        ],
      ],
    };
  }

  if (ev === "document_decided" && p.document_id) {
    return {
      inline_keyboard: [[{ text: "🔎 Batafsil", callback_data: `vaqf:doc:${p.document_id}` }]],
    };
  }

  if (ev === "fault_reported" && p.fault_id) {
    return {
      inline_keyboard: [
        [
          { text: "🛠 Ta'mirga berish", callback_data: `vaqf:rep:${p.fault_id}:${row.id}` },
          { text: "🔎 Batafsil", callback_data: `vaqf:flt:${p.fault_id}` },
        ],
      ],
    };
  }

  if (ev === "count_submitted" && p.count_id) {
    return {
      inline_keyboard: [[{ text: "🔎 Farqlarni ko'rish", callback_data: `vaqf:cnt:${p.count_id}` }]],
    };
  }

  if (ev === "count_location_assigned" && p.count_id) {
    return {
      inline_keyboard: [[{ text: "📷 Skanerlashni boshlash", callback_data: `vaqf:cnt:${p.count_id}` }]],
    };
  }

  if (ev === "unregistered_expense" && p.pending_expense_id) {
    return {
      inline_keyboard: [[{ text: "📝 Ro'yxatga olish", callback_data: `vaqf:pexp:${p.pending_expense_id}` }]],
    };
  }

  if (ev === "schedule_due" && p.schedule_id) {
    return {
      inline_keyboard: [
        [
          { text: "✔️ Bajarildi", callback_data: `vaqf:schdone:${p.schedule_id}:${row.id}` },
          { text: "⏰ 3 kunga keyinga", callback_data: `vaqf:schsnooze:${p.schedule_id}:${row.id}` },
        ],
      ],
    };
  }

  return null;
}

export async function recordVaqfBotStart(arg1 = {}, arg2 = null) {
  let telegramId = null;
  let username = null;
  let fullName = null;
  let lang = null;
  if (typeof arg1 === "string" || typeof arg1 === "number") {
    telegramId = String(arg1);
    lang = arg2;
  } else if (arg1 && typeof arg1 === "object") {
    telegramId = arg1.telegramId || arg1.telegram_id;
    username = arg1.username || null;
    fullName = arg1.fullName || arg1.full_name || null;
    lang = arg1.lang || null;
  }
  const tgId = String(telegramId || "").trim();
  if (!tgId) return null;
  const linked = await resolveLinkedUserByTelegramId(tgId);
  const userRef = linked?.email || linked?.userId || null;
  const resolvedName = fullName || linked?.displayName || null;

  const res = await query(
    `INSERT INTO vaqf.bot_chats (telegram_id, user_ref, username, full_name, lang, started_at, blocked_at, last_seen_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'uz'), NOW(), NULL, NOW())
     ON CONFLICT (telegram_id) DO UPDATE
       SET user_ref = COALESCE($2, vaqf.bot_chats.user_ref),
           username = COALESCE($3, vaqf.bot_chats.username),
           full_name = COALESCE($4, vaqf.bot_chats.full_name),
           lang = COALESCE($5, vaqf.bot_chats.lang),
           blocked_at = NULL,
           last_seen_at = NOW()
     RETURNING *`,
    [tgId, userRef, username || null, resolvedName, lang === "tr" ? "tr" : lang === "uz" ? "uz" : null]
  );
  return {
    chat: res.rows[0],
    linked,
  };
}

export async function markVaqfBotChatBlocked(telegramId) {
  const tgId = String(telegramId || "").trim();
  if (!tgId) return;
  await query(
    `INSERT INTO vaqf.bot_chats (telegram_id, started_at, blocked_at, last_seen_at)
     VALUES ($1, NOW(), NOW(), NOW())
     ON CONFLICT (telegram_id) DO UPDATE
       SET blocked_at = NOW(),
           last_seen_at = NOW()`,
    [tgId]
  );
}

export async function setVaqfBotChatLang(telegramId, lang = "uz") {
  const tgId = String(telegramId || "").trim();
  const safeLang = lang === "tr" ? "tr" : "uz";
  const res = await query(
    `INSERT INTO vaqf.bot_chats (telegram_id, lang, started_at, last_seen_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (telegram_id) DO UPDATE
       SET lang = $2,
           last_seen_at = NOW()
     RETURNING *`,
    [tgId, safeLang]
  );
  return res.rows[0];
}

export async function getVaqfBotChatLang(telegramId) {
  const tgId = String(telegramId || "").trim();
  if (!tgId) return "uz";
  const res = await query(`SELECT lang FROM vaqf.bot_chats WHERE telegram_id = $1 LIMIT 1`, [tgId]);
  return res.rows[0]?.lang === "tr" ? "tr" : "uz";
}

export async function getVaqfBotChatInfo(telegramId) {
  const tgId = String(telegramId || "").trim();
  if (!tgId) return null;
  const res = await query(`SELECT * FROM vaqf.bot_chats WHERE telegram_id = $1 LIMIT 1`, [tgId]);
  return res.rows[0] || null;
}

export async function getVaqfBotStatusForWebUser(sess, accessContext) {
  const botUsername = getVaqfBotUsername();
  const botUrl = `https://t.me/${botUsername}`;
  const candidateRefs = Array.from(extractSessionCandidateRefs(sess, accessContext));
  let tgIds = [];
  for (const ref of candidateRefs) {
    const found = await resolveTelegramIdsForRecipientRef(ref);
    for (const id of found) {
      if (!tgIds.includes(id)) tgIds.push(id);
    }
  }
  if (tgIds.length === 0) {
    return {
      isLinked: false,
      telegram_linked: false,
      telegramId: null,
      telegram_id: null,
      botStarted: false,
      bot_started: false,
      botBlocked: false,
      bot_blocked: false,
      botUsername,
      bot_username: botUsername,
      botUrl,
      bot_url: botUrl,
    };
  }
  const chatRes = await query(
    `SELECT telegram_id, started_at, blocked_at, lang FROM vaqf.bot_chats WHERE telegram_id = ANY($1::text[]) ORDER BY last_seen_at DESC LIMIT 1`,
    [tgIds]
  );
  const chatRow = chatRes.rows[0] || null;
  const botStarted = Boolean(chatRow && !chatRow.blocked_at);
  return {
    isLinked: true,
    telegram_linked: true,
    telegramId: tgIds[0],
    telegram_id: tgIds[0],
    botStarted,
    bot_started: botStarted,
    botBlocked: Boolean(chatRow?.blocked_at),
    bot_blocked: Boolean(chatRow?.blocked_at),
    lang: chatRow?.lang || "uz",
    botUsername,
    bot_username: botUsername,
    botUrl,
    bot_url: botUrl,
  };
}

export async function createVaqfTelegramLinkCode(sess, accessContext) {
  const botUsername = getVaqfBotUsername();
  const candidateRefs = Array.from(extractSessionCandidateRefs(sess, accessContext));
  let identityUserId = sess?.erpUser?.id || sess?.user?.id || null;

  if (!identityUserId || String(identityUserId).startsWith("crm:")) {
    const uRes = await query(
      `SELECT u.id
       FROM identity."User" u
       LEFT JOIN people."Employee" e ON e."userId" = u.id AND e."deletedAt" IS NULL
       WHERE LOWER(u.id) = ANY($1::text[])
          OR LOWER(COALESCE(u.email, '')) = ANY($1::text[])
          OR LOWER(COALESCE(e.username, '')) = ANY($1::text[])
       LIMIT 1`,
      [candidateRefs]
    );
    identityUserId = uRes.rows[0]?.id || null;
  }

  if (!identityUserId && sess?.crmUser?.role === "root") {
    identityUserId = "cmtlai0bg000ipir95hv9hfez";
  }
  if (!identityUserId) {
    throw httpError(400, "Bog'lash kodi yaratish uchun foydalanuvchi profili topilmadi");
  }

  const code = crypto.randomBytes(5).toString("hex").toUpperCase();
  const id = `vaqflnk_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  const ins = await query(
    `INSERT INTO identity.telegram_link_codes (id, code, "userId", "expiresAt", "usedAt", "createdAt")
     VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes', NULL, NOW())
     RETURNING code, "expiresAt"`,
    [id, code, identityUserId]
  );

  const deepLink = `https://t.me/${botUsername}?start=link_${ins.rows[0].code}`;
  return {
    code: ins.rows[0].code,
    expiresAt: ins.rows[0].expiresAt,
    expires_at: ins.rows[0].expiresAt,
    expiresInMinutes: 10,
    botUsername,
    bot_username: botUsername,
    deepLink,
    deep_link: deepLink,
  };
}

export async function redeemVaqfTelegramLinkCode(arg1 = {}, arg2 = null, arg3 = {}) {
  let code = null;
  let telegramId = null;
  let telegramUsername = null;
  let fullName = null;
  if (typeof arg1 === "string" || typeof arg1 === "number") {
    telegramId = String(arg1);
    code = arg2;
    telegramUsername = arg3?.username || arg3?.telegramUsername || null;
    fullName = arg3?.fullName || [arg3?.first_name, arg3?.last_name].filter(Boolean).join(" ") || null;
  } else if (arg1 && typeof arg1 === "object") {
    code = arg1.code;
    telegramId = arg1.telegramId || arg1.telegram_id;
    telegramUsername = arg1.telegramUsername || arg1.username || null;
    fullName = arg1.fullName || arg1.full_name || null;
  }
  const rawCode = String(code || "")
    .trim()
    .replace(/^link_/i, "")
    .toUpperCase();
  const tgId = String(telegramId || "").trim();
  if (!rawCode || !tgId) {
    throw httpError(400, "Bog'lash kodi va Telegram ID kiritilishi shart");
  }

  return withTransaction(async (tx) => {
    const cRes = await tx.query(
      `SELECT id, code, "userId", "expiresAt", "usedAt",
              ("expiresAt" < NOW()) AS is_expired
       FROM identity.telegram_link_codes
       WHERE UPPER(code) = $1
       FOR UPDATE`,
      [rawCode]
    );
    const row = cRes.rows[0];
    if (!row) {
      throw httpError(404, "Bog'lash kodi topilmadi");
    }
    if (row.usedAt) {
      throw httpError(400, "Ushbu bog'lash kodi allaqachon ishlatilgan (bir martalik kod)");
    }
    if (row.is_expired) {
      throw httpError(400, "Bog'lash kodining amal qilish muddati (10 daqiqa) tugagan");
    }

    await tx.query(`UPDATE identity.telegram_link_codes SET "usedAt" = NOW() WHERE id = $1`, [row.id]);

    // Remove previous link for this userId or telegramId so 1-to-1 link stays clean
    await tx.query(`DELETE FROM identity.telegram_links WHERE "userId" = $1 OR "telegramId" = $2`, [
      row.userId,
      tgId,
    ]);
    await tx.query(
      `INSERT INTO identity.telegram_links (id, "userId", "telegramId", "telegramUsername", "linkedAt")
       VALUES ($1, $2, $3, $4, NOW())`,
      [`tglink_vaqf_${Date.now()}_${tgId}`, row.userId, tgId, telegramUsername || null]
    );

    await tx.query(
      `INSERT INTO vaqf.bot_chats (telegram_id, user_ref, username, full_name, started_at, blocked_at, last_seen_at)
       VALUES ($1, $2, $3, $4, NOW(), NULL, NOW())
       ON CONFLICT (telegram_id) DO UPDATE
         SET user_ref = $2,
             username = COALESCE($3, vaqf.bot_chats.username),
             full_name = COALESCE($4, vaqf.bot_chats.full_name),
             blocked_at = NULL,
             last_seen_at = NOW()`,
      [tgId, row.userId, telegramUsername || null, fullName || null]
    );

    return {
      ok: true,
      linked: true,
      userId: row.userId,
      user_ref: row.userId,
      telegramId: tgId,
    };
  });
}

export async function sendOneTimeBotMigrationNotice({ sender = null } = {}) {
  const botUsername = getVaqfBotUsername();
  const legacyToken = getLegacyMezanaBotToken();

  // Gather all Vaqf users (director, user_roles, and employees with active assignments) who have linked Telegram IDs
  const refs = new Set(["role:director"]);
  const rolesRes = await query(`SELECT DISTINCT user_ref FROM vaqf.user_roles`);
  for (const r of rolesRes.rows) {
    if (r.user_ref) refs.add(r.user_ref);
  }
  const assignRes = await query(
    `SELECT DISTINCT person_ref FROM vaqf.assignments WHERE returned_at IS NULL AND person_ref IS NOT NULL`
  );
  for (const r of assignRes.rows) {
    if (r.person_ref) refs.add(r.person_ref);
  }

  const targetTgIds = new Set();
  for (const ref of refs) {
    const ids = await resolveTelegramIdsForRecipientRef(ref);
    for (const id of ids) targetTgIds.add(String(id));
  }

  const notified = [];
  const skipped = [];

  for (const tgId of targetTgIds) {
    const chRes = await query(`SELECT migration_notified_at FROM vaqf.bot_chats WHERE telegram_id = $1`, [tgId]);
    if (chRes.rows[0]?.migration_notified_at) {
      skipped.push(tgId);
      continue;
    }

    const html =
      `🏛 <b>Ezan Vakfı — Muhim xabar!</b>\n\n` +
      `Vaqf xabarlari, buyumlar zimmati, QR skanerlash va tasdiqlar endi alohida <b>@${botUsername}</b> boti orqali ishlaydi.\n\n` +
      `Iltimos, yangi botni ochib <b>/start</b> tugmasini bosing (qayta kod kiritish shart emas, bog'lanishingiz tayyor).`;
    const replyMarkup = {
      inline_keyboard: [[{ text: `🏛 @${botUsername} ni ochish`, url: `https://t.me/${botUsername}?start=welcome` }]],
    };

    try {
      if (sender) {
        await sender(tgId, html, replyMarkup);
      } else if (legacyToken) {
        await fetch(`https://api.telegram.org/bot${legacyToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: tgId,
            text: html,
            parse_mode: "HTML",
            reply_markup: replyMarkup,
          }),
        });
      }
      await query(
        `INSERT INTO vaqf.bot_chats (telegram_id, started_at, last_seen_at, migration_notified_at)
         VALUES ($1, NOW(), NOW(), NOW())
         ON CONFLICT (telegram_id) DO UPDATE SET migration_notified_at = NOW()`,
        [tgId]
      );
      notified.push(tgId);
    } catch {
      skipped.push(tgId);
    }
  }

  return { botUsername, notifiedCount: notified.length, notified, skipped };
}

async function defaultTelegramSender(chatId, htmlText, replyMarkup = null, fetchImpl = null) {
  const token = getVaqfTelegramBotToken();
  if (!token) throw new Error("VAQF_TELEGRAM_BOT_TOKEN mavjud emas");

  const doFetch = fetchImpl || fetch;
  const r = await doFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: String(chatId),
      text: htmlText,
      parse_mode: "HTML",
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) {
    const err = new Error(sanitizeSecretFromText(j?.description || `Telegram HTTP ${r.status}`));
    err.status = r.status || j?.error_code || 500;
    throw err;
  }
  return {
    messageId: Number(j.result?.message_id || 0),
    chatId: String(chatId),
    tokenMasked: maskBotToken(token),
  };
}

let customOutboxSender = null;
export function setCustomOutboxSenderForTest(fn) {
  customOutboxSender = fn;
}

/**
 * Outbox worker processor: processes pending rows in `vaqf.notifications_outbox`.
 * - Sends ONLY with `VAQF_TELEGRAM_BOT_TOKEN` (@ezanvakfitizimbot).
 * - If user has not started the Vaqf bot (`vaqf.bot_chats`), marks `skipped` (`skip_reason = 'bot_not_started'`, `last_error = 'bot_not_started'`).
 * - If bot is blocked (HTTP 403), sets `vaqf.bot_chats.blocked_at = NOW()` and stops retrying (`status = 'failed'`).
 * - Retries transient errors up to 5 times, then marks `failed`.
 */
export async function processOutboxBatch({
  limit = 20,
  forceSendQuietHours = false,
  forceIgnoreQuietHours = false,
  now = new Date(),
  sender = null,
  fetchImpl = null,
} = {}) {
  const ignoreQuietHours = Boolean(forceSendQuietHours || forceIgnoreQuietHours);
  const sendFn =
    sender ||
    customOutboxSender ||
    ((chatId, htmlText, replyMarkup) => defaultTelegramSender(chatId, htmlText, replyMarkup, fetchImpl));
  const pendingRes = await query(
    `SELECT * FROM vaqf.notifications_outbox
     WHERE status = 'pending' AND next_attempt_at <= $1
     ORDER BY id ASC
     LIMIT $2`,
    [now, limit]
  );

  const stats = { processed: 0, sent: 0, skipped: 0, deferred: 0, failed: 0, retried: 0 };

  for (const row of pendingRes.rows) {
    stats.processed += 1;
    const prefs = await getUserNotificationPrefs(row.recipient_ref);
    const enabledList = Array.isArray(prefs.enabled_events) ? prefs.enabled_events : ["*"];
    if (!enabledList.includes("*") && !enabledList.includes(row.event_type)) {
      await query(
        `UPDATE vaqf.notifications_outbox
         SET status = 'skipped',
             skip_reason = 'user_disabled_event',
             last_error = 'Foydalanuvchi ushbu xabar turini o''chirib qo''ygan'
         WHERE id = $1`,
        [row.id]
      );
      stats.skipped += 1;
      continue;
    }

    const isUrgent = Boolean(row.payload?.urgent);
    if (
      !ignoreQuietHours &&
      !isUrgent &&
      prefs.quiet_hours_enabled &&
      isWithinIstanbulQuietHours(now, prefs.quiet_start, prefs.quiet_end)
    ) {
      await query(
        `UPDATE vaqf.notifications_outbox
         SET next_attempt_at = NOW() + INTERVAL '30 minutes'
         WHERE id = $1`,
        [row.id]
      );
      stats.deferred += 1;
      continue;
    }

    const tgIds = await resolveTelegramIdsForRecipientRef(row.recipient_ref);
    if (!tgIds || tgIds.length === 0) {
      await query(
        `UPDATE vaqf.notifications_outbox
         SET status = 'skipped',
             skip_reason = 'telegram_not_linked',
             last_error = 'Telegram bog''lanmagan'
         WHERE id = $1`,
        [row.id]
      );
      stats.skipped += 1;
      continue;
    }

    // Check vaqf.bot_chats for whether the recipient has /start'ed the dedicated Vaqf bot or blocked it
    const chatRowsRes = await query(
      `SELECT telegram_id, started_at, blocked_at FROM vaqf.bot_chats WHERE telegram_id = ANY($1::text[])`,
      [tgIds]
    );
    const chatMap = new Map(chatRowsRes.rows.map((r) => [String(r.telegram_id), r]));
    const activeTgIds = [];
    let anyBlocked = false;
    for (const id of tgIds) {
      const ch = chatMap.get(String(id));
      if (!ch) continue;
      if (ch.blocked_at) {
        anyBlocked = true;
        continue;
      }
      activeTgIds.push(String(id));
    }

    if (activeTgIds.length === 0) {
      if (anyBlocked) {
        await query(
          `UPDATE vaqf.notifications_outbox
           SET status = 'failed',
               skip_reason = 'bot_blocked',
               last_error = 'bot_blocked'
           WHERE id = $1`,
          [row.id]
        );
        stats.failed += 1;
      } else {
        await query(
          `UPDATE vaqf.notifications_outbox
           SET status = 'skipped',
               skip_reason = 'bot_not_started',
               last_error = 'bot_not_started'
           WHERE id = $1`,
          [row.id]
        );
        stats.skipped += 1;
      }
      continue;
    }

    const htmlText = `🏛 <b>${row.title || "Ezan Vakfı"}</b>\n\n${row.body || ""}`;
    const replyMarkup = buildTelegramInlineKeyboardForOutbox(row);

    try {
      let firstMsgId = null;
      let firstChatId = null;
      for (const chatId of activeTgIds) {
        try {
          const sent = await sendFn(chatId, htmlText, replyMarkup);
          if (!firstMsgId && sent?.messageId) {
            firstMsgId = sent.messageId;
            firstChatId = String(chatId);
          }
        } catch (sendErr) {
          const errStr = sanitizeSecretFromText(sendErr?.message || sendErr || "");
          const isBlocked403 =
            Number(sendErr?.status) === 403 ||
            /403|forbidden|blocked by the user|user is deactivated/i.test(errStr);
          if (isBlocked403) {
            await markVaqfBotChatBlocked(chatId);
            const blockedErr = new Error(`403 Forbidden: bot_blocked (${chatId})`);
            blockedErr.isBlocked403 = true;
            throw blockedErr;
          }
          throw sendErr;
        }
      }
      await query(
        `UPDATE vaqf.notifications_outbox
         SET status = 'sent',
             sent_at = NOW(),
             attempts = attempts + 1,
             recipient_telegram_id = $1,
             telegram_chat_id = $1,
             telegram_message_id = $2,
             skip_reason = NULL,
             last_error = NULL
         WHERE id = $3`,
        [firstChatId || activeTgIds[0], firstMsgId || null, row.id]
      );
      stats.sent += 1;
    } catch (err) {
      const nextAttempts = Number(row.attempts || 0) + 1;
      const isBlocked = Boolean(err?.isBlocked403) || /403|forbidden|bot_blocked/i.test(String(err?.message || ""));
      const nextStatus = isBlocked || nextAttempts >= 5 ? "failed" : "pending";
      const errMsg = sanitizeSecretFromText(err?.message || err || "Telegram send error").slice(0, 500);
      await query(
        `UPDATE vaqf.notifications_outbox
         SET status = $1::varchar,
             attempts = $2,
             skip_reason = CASE WHEN $5::boolean THEN 'bot_blocked' ELSE skip_reason END,
             last_error = $3,
             next_attempt_at = CASE WHEN $1::varchar = 'pending' THEN NOW() + INTERVAL '10 seconds' ELSE next_attempt_at END
         WHERE id = $4`,
        [nextStatus, nextAttempts, errMsg, row.id, isBlocked]
      );
      if (nextStatus === "failed") stats.failed += 1;
      else stats.retried += 1;
    }
  }

  return stats;
}

/**
 * Lists in-app web notifications for the bell icon in `apps/vaqf` (works even if Telegram is not linked!).
 */
export async function listWebNotificationsForUser(sess, accessContext, vAccess) {
  const userRefs = Array.from(extractSessionCandidateRefs(sess, accessContext));
  if (vAccess?.isDirector) {
    userRefs.push("role:director", "director");
  }
  if (vAccess?.role === "inventory_manager" || vAccess?.isDirector) {
    userRefs.push("role:inventory_manager");
  }

  const res = await query(
    `SELECT *
     FROM vaqf.notifications_outbox
     WHERE LOWER(recipient_ref) = ANY($1::text[])
     ORDER BY created_at DESC, id DESC
     LIMIT 60`,
    [userRefs]
  );

  const unreadCount = res.rows.filter((r) => !r.is_read).length;
  return {
    items: res.rows,
    unreadCount,
  };
}

export async function markWebNotificationRead(notifId, sess, accessContext, vAccess) {
  if (notifId === "all") {
    const userRefs = Array.from(extractSessionCandidateRefs(sess, accessContext));
    if (vAccess?.isDirector) userRefs.push("role:director", "director");
    if (vAccess?.role === "inventory_manager" || vAccess?.isDirector) userRefs.push("role:inventory_manager");
    await query(
      `UPDATE vaqf.notifications_outbox
       SET is_read = TRUE, read_at = NOW()
       WHERE LOWER(recipient_ref) = ANY($1::text[]) AND is_read = FALSE`,
      [userRefs]
    );
    return { ok: true };
  }
  await query(
    `UPDATE vaqf.notifications_outbox SET is_read = TRUE, read_at = NOW() WHERE id = $1`,
    [Number(notifId)]
  );
  return { ok: true };
}

// ============================================================================
// 2-QADAM: BOT INLINE CALLBACK EXECUTION (IDEMPOTENT + PERMISSION CHECKED)
// ============================================================================
export async function executeBotCallbackAction({
  telegramId,
  action,
  targetId,
  outboxId = null,
  reason = null,
  req = null,
}) {
  const resolved = await resolveLinkedUserByTelegramId(telegramId);
  if (!resolved) {
    throw httpError(403, "Telegram akkauntingiz Vaqf tizimiga bog'lanmagan");
  }

  const { sess, accessContext, vaqfAccess, displayName } = resolved;
  const actor = getActor(sess, accessContext);
  const nowTimeStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  // Check idempotency on outbox row if outboxId is provided
  if (outboxId) {
    const obRes = await query(`SELECT * FROM vaqf.notifications_outbox WHERE id = $1`, [Number(outboxId)]);
    const obRow = obRes.rows[0];
    if (obRow?.action_taken) {
      return {
        alreadyProcessed: true,
        action_taken: obRow.action_taken,
        statusLine: `ℹ️ Amal allaqachon bajarilgan (${obRow.action_taken})`,
      };
    }
  }

  if (action === "approve_doc") {
    const doc = await getDocumentDetail(targetId);
    if (doc.status === "completed") {
      return {
        alreadyProcessed: true,
        statusLine: `✅ Tasdiqlandi — ${doc.approved_by_name || "Direktor"}`,
        document: doc,
      };
    }
    const updated = await approveDocument(targetId, {}, actor, vaqfAccess);
    if (outboxId) {
      await query(
        `UPDATE vaqf.notifications_outbox
         SET action_taken = 'approved', action_taken_at = NOW(), action_taken_by = $1, is_read = TRUE
         WHERE id = $2`,
        [displayName, Number(outboxId)]
      );
    }
    return {
      alreadyProcessed: false,
      statusLine: `✅ Tasdiqlandi — ${nowTimeStr}, ${displayName}`,
      document: updated,
    };
  }

  if (action === "reject_doc") {
    const doc = await getDocumentDetail(targetId);
    if (doc.status === "rejected") {
      return {
        alreadyProcessed: true,
        statusLine: `❌ Rad etildi (${doc.rejected_reason || "Sababsiz"})`,
        document: doc,
      };
    }
    const updated = await rejectDocument(
      targetId,
      { reason: reason || "Direktor tomonidan rad etildi" },
      actor,
      vaqfAccess
    );
    if (outboxId) {
      await query(
        `UPDATE vaqf.notifications_outbox
         SET action_taken = 'rejected', action_taken_at = NOW(), action_taken_by = $1, is_read = TRUE
         WHERE id = $2`,
        [displayName, Number(outboxId)]
      );
    }
    return {
      alreadyProcessed: false,
      statusLine: `❌ Rad etildi — ${nowTimeStr}, ${displayName}\nSabab: ${updated.rejected_reason}`,
      document: updated,
    };
  }

  if (action === "confirm_doc") {
    const doc = await getDocumentDetail(targetId);
    if (doc.status === "completed") {
      return {
        alreadyProcessed: true,
        statusLine: `✅ Qabul qilindi — ${doc.to_person_name || displayName}`,
        document: doc,
      };
    }
    const updated = await confirmDocumentByRecipient(
      targetId,
      { comment: "Telegram bot orqali tasdiqlandi" },
      req || { headers: { "user-agent": "TelegramBot/1.0" }, socket: { remoteAddress: "127.0.0.1" } },
      sess,
      accessContext
    );
    if (outboxId) {
      await query(
        `UPDATE vaqf.notifications_outbox
         SET action_taken = 'confirmed', action_taken_at = NOW(), action_taken_by = $1, is_read = TRUE
         WHERE id = $2`,
        [displayName, Number(outboxId)]
      );
    }
    return {
      alreadyProcessed: false,
      statusLine: `✅ Qabul qilindi — ${nowTimeStr}, ${displayName}`,
      document: updated,
    };
  }

  if (action === "create_repair_from_fault") {
    if (!vaqfAccess.canEdit) {
      throw httpError(403, "Ta'mir hujjati yaratish huquqi yo'q");
    }
    const fRes = await query(
      `SELECT f.*, a.institution_id, a.inventory_no, a.name AS asset_name
       FROM vaqf.fault_reports f
       JOIN vaqf.assets a ON a.id = f.asset_id
       WHERE f.id = $1`,
      [Number(targetId)]
    );
    const fault = fRes.rows[0];
    if (!fault) throw httpError(404, "Nosozlik xabari topilmadi");
    if (fault.document_id) {
      const existingDoc = await getDocumentDetail(fault.document_id);
      return {
        alreadyProcessed: true,
        statusLine: `🛠 Ta'mirga berilgan (${existingDoc.doc_no})`,
        document: existingDoc,
      };
    }
    const created = await createDocument(
      {
        type: "repair",
        institution_id: fault.institution_id || 1,
        reason: fault.description,
        fault_report_id: fault.id,
        items: [{ asset_id: fault.asset_id, qty: 1 }],
      },
      actor
    );
    const submitted = await submitDocument(created.id, {}, actor);
    if (outboxId) {
      await query(
        `UPDATE vaqf.notifications_outbox
         SET action_taken = 'repair_created', action_taken_at = NOW(), action_taken_by = $1, is_read = TRUE
         WHERE id = $2`,
        [displayName, Number(outboxId)]
      );
    }
    return {
      alreadyProcessed: false,
      statusLine: `🛠 Ta'mir hujjati ochildi (${submitted.doc_no}) — ${nowTimeStr}, ${displayName}`,
      document: submitted,
    };
  }

  if (action === "schedule_done") {
    const updated = await completeSchedule(targetId, { note: "Telegram bot orqali bajarildi" }, actor);
    if (outboxId) {
      await query(
        `UPDATE vaqf.notifications_outbox
         SET action_taken = 'schedule_done', action_taken_at = NOW(), action_taken_by = $1, is_read = TRUE
         WHERE id = $2`,
        [displayName, Number(outboxId)]
      );
    }
    return {
      alreadyProcessed: false,
      statusLine: `✔️ Bajarildi — ${nowTimeStr}, ${displayName}` + (updated.next_due_str ? ` (Keyingi muddat: ${updated.next_due_str})` : ""),
      schedule: updated,
    };
  }

  if (action === "schedule_snooze") {
    const updated = await snoozeSchedule(targetId, 3, actor);
    if (outboxId) {
      await query(
        `UPDATE vaqf.notifications_outbox
         SET action_taken = 'schedule_snoozed', action_taken_at = NOW(), action_taken_by = $1, is_read = TRUE
         WHERE id = $2`,
        [displayName, Number(outboxId)]
      );
    }
    return {
      alreadyProcessed: false,
      statusLine: `⏰ 3 kunga surildi (Yangi muddat: ${updated.next_due_str}) — ${nowTimeStr}, ${displayName}`,
      schedule: updated,
    };
  }

  throw httpError(400, `Noma'lum bot amali: ${action}`);
}

// ============================================================================
// 3-QADAM: FINANCE INTEGRATION ("Ro'yxatga olinishi kerak" navbati)
// ============================================================================
export async function getFinanceIntegrationSettings() {
  const [setRes, catRes] = await Promise.all([
    query(`SELECT value FROM vaqf.settings WHERE key = 'finance_integration'`),
    query(`SELECT id, name FROM finance."Category" ORDER BY name ASC`),
  ]);
  const val = setRes.rows[0]?.value || {};
  return {
    inventory_category_names: val.inventory_category_names || [
      "Jihozlar",
      "Ofis buyumlari",
      "Mebel",
      "Texnika",
      "Oshxona anjomlari",
    ],
    inventory_category_ids: val.inventory_category_ids || [
      "cmtlai03s000bpir9obtjanbc",
      "cmtlai03k000apir91b9usxw2",
    ],
    recommended_count_interval_months: Number(val.recommended_count_interval_months || 12),
    available_finance_categories: catRes.rows,
  };
}

export async function updateFinanceIntegrationSettings(body, actor) {
  const cur = await getFinanceIntegrationSettings();
  const nextVal = {
    inventory_category_names: Array.isArray(body.inventory_category_names)
      ? body.inventory_category_names
      : cur.inventory_category_names,
    inventory_category_ids: Array.isArray(body.inventory_category_ids)
      ? body.inventory_category_ids
      : cur.inventory_category_ids,
    recommended_count_interval_months:
      body.recommended_count_interval_months !== undefined
        ? Math.max(1, Number(body.recommended_count_interval_months) || 12)
        : cur.recommended_count_interval_months,
  };

  await query(
    `INSERT INTO vaqf.settings (key, value, updated_by, updated_by_name, updated_at)
     VALUES ('finance_integration', $1::jsonb, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_by_name = EXCLUDED.updated_by_name,
           updated_at = NOW()`,
    [JSON.stringify(nextVal), actor?.actorId || null, actor?.actorName || "Direktor"]
  );

  return getFinanceIntegrationSettings();
}

/**
 * Safely captures an approved/paid Finance Expense or ExpenseRequest if its category is in the
 * configured inventory-eligible categories. Never throws to caller so Finance approval never fails!
 */
export async function captureApprovedFinanceExpenseSafe(expenseData = {}) {
  try {
    if (expenseData._simulateVaqfHookError) {
      throw new Error("Simulated Vaqf hook failure during Finance approval");
    }

    const finSettings = await getFinanceIntegrationSettings();
    const catId = String(expenseData.categoryId || expenseData.category_id || "").trim();
    const catName = String(expenseData.categoryName || expenseData.category_name || expenseData.category || "").trim();

    if (!catName && catId) {
      const cRes = await query(`SELECT name FROM finance."Category" WHERE id = $1 LIMIT 1`, [catId]);
      if (cRes.rows[0]?.name) expenseData.categoryName = cRes.rows[0].name;
    }
    const resolvedCatName = String(expenseData.categoryName || catName || "").trim();

    const eligibleIds = new Set((finSettings.inventory_category_ids || []).map((x) => String(x).trim()));
    const eligibleNames = new Set(
      (finSettings.inventory_category_names || []).map((x) => String(x).trim().toLowerCase())
    );

    const isEligible =
      (catId && eligibleIds.has(catId)) ||
      (resolvedCatName && eligibleNames.has(resolvedCatName.toLowerCase())) ||
      /jihoz|mebel|texnika|kompyuter|noutbuk|oshxona anjom|ofis buyum/i.test(resolvedCatName);

    if (!isEligible) {
      return { captured: false, reason: "not_inventory_category" };
    }

    const expenseId = String(expenseData.id || expenseData.expense_id || expenseData.expense_ref || "").trim();
    if (!expenseId) return { captured: false, reason: "missing_expense_id" };

    const title = String(expenseData.title || expenseData.item_name || expenseData.description || "Jihoz xaridi").trim().slice(0, 300);
    const description = String(expenseData.description || title).trim();
    const amount = Number(expenseData.amount || expenseData.approvedAmount || 0);
    const rawCur = String(expenseData.currency || "TRY").toUpperCase();
    const currency = rawCur === "USD" ? "USD" : "TRY";
    const amountTry = Number(expenseData.amountInDefault || expenseData.amountTry || amount);
    const rawExpDate = expenseData.date || expenseData.expenseDate || expenseData.expense_date;
    const expenseDate = rawExpDate instanceof Date
      ? rawExpDate.toISOString().slice(0, 10)
      : String(rawExpDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const buyerEmployeeId = expenseData.employeeId || expenseData.buyer_employee_id || null;
    let buyerName = expenseData.buyerName || expenseData.sourceLabel || expenseData.requesterName || null;

    if (!buyerName && buyerEmployeeId) {
      const empRes = await query(`SELECT "fullName" FROM people."Employee" WHERE id = $1 LIMIT 1`, [buyerEmployeeId]);
      buyerName = empRes.rows[0]?.fullName || null;
    }

    const receiptUrl = expenseData.receiptUrl || expenseData.receipt_url || null;
    const receiptFileName = expenseData.receiptFileName || expenseData.receipt_file_name || null;

    const capturedRow = await withTransaction(async (tx) => {
      const ins = await tx.query(
        `INSERT INTO vaqf.pending_finance_expenses (
           expense_id, source_type, title, description,
           category_id, category_name, amount, currency, amount_try,
           expense_date, buyer_employee_id, buyer_name,
           receipt_url, receipt_file_name, status
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8, $9,
           $10::date, $11, $12,
           $13, $14, 'pending'
         )
         ON CONFLICT (expense_id) DO UPDATE
           SET title = EXCLUDED.title,
               amount = EXCLUDED.amount,
               receipt_url = COALESCE(EXCLUDED.receipt_url, vaqf.pending_finance_expenses.receipt_url)
         RETURNING *`,
        [
          expenseId,
          expenseData.source_type || "expense",
          title,
          description,
          catId || null,
          resolvedCatName || "Jihozlar",
          amount,
          currency,
          amountTry,
          expenseDate,
          buyerEmployeeId,
          buyerName || "Xodim",
          receiptUrl,
          receiptFileName,
        ]
      );
      const row = ins.rows[0];

      await enqueueOutboxNotification(tx, {
        event_type: "unregistered_expense",
        recipient_ref: "role:inventory_manager",
        title: "Ro'yxatdan o'tkazilmagan yangi jihoz xaridi",
        body:
          `📦 <b>${title}</b>\n` +
          `💰 Summa: <b>${amount.toLocaleString("tr-TR")} ${currency}</b>\n` +
          `📂 Kategoriya: <b>${resolvedCatName || "Jihozlar"}</b>\n` +
          `👤 Xarid qiluvchi: <b>${buyerName || "Xodim"}</b>\n` +
          `📅 Sana: <b>${expenseDate}</b>\n\n` +
          `<i>Inventar kartochkasini ochib ro'yxatga oling:</i>`,
        payload: {
          pending_expense_id: row.id,
          expense_id: expenseId,
          title,
          amount,
          currency,
        },
        dedupe_key: `unregistered_expense:${expenseId}`,
      });

      return row;
    });

    return { captured: true, item: capturedRow };
  } catch (err) {
    console.error("[VAQF FINANCE HOOK ERROR - NON-FATAL]:", err?.message || err);
    return { captured: false, nonBlockingError: true, error: err?.message || "Vaqf hook error" };
  }
}
export const captureApprovedFinanceExpense = captureApprovedFinanceExpenseSafe;

export async function listPendingFinanceExpenses(filters = {}) {
  const where = ["1=1"];
  const params = [];
  if (filters.status && ["pending", "registered", "not_inventory"].includes(filters.status)) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  const res = await query(
    `SELECT
       p.*,
       p.amount::float AS amount,
       p.amount_try::float AS amount_try,
       TO_CHAR(p.expense_date, 'YYYY-MM-DD') AS expense_date_str,
       (CURRENT_DATE - COALESCE(p.expense_date, p.created_at::date))::int AS days_waiting
     FROM vaqf.pending_finance_expenses p
     WHERE ${where.join(" AND ")}
     ORDER BY CASE WHEN p.status = 'pending' THEN 0 ELSE 1 END, p.created_at DESC`,
    params
  );
  return res.rows;
}

/**
 * Registers 1 or multiple assets from a pending Finance expense (`mode: 'single_or_batch' | 'multiple_individual'`).
 */
export async function registerAssetsFromPendingExpense(pendingId, body = {}, actor) {
  const id = Number(pendingId);
  const pRes = await query(`SELECT * FROM vaqf.pending_finance_expenses WHERE id = $1`, [id]);
  const pending = pRes.rows[0];
  if (!pending) throw httpError(404, "Moliya xarajati navbatda topilmadi");
  if (pending.status === "registered") {
    throw httpError(400, "Ushbu xarajat allaqachon inventarga ro'yxatga olingan");
  }

  const countCards = body.split_cards ? Math.min(100, Math.max(1, Number(body.cards_count || body.quantity || 1))) : 1;
  const totalQty = Math.max(1, Number(body.quantity || 1));
  const unitPrice =
    body.purchase_price !== undefined && body.purchase_price !== ""
      ? Number(body.purchase_price)
      : Number((Number(pending.amount || 0) / (countCards > 1 ? countCards : totalQty)).toFixed(2));

  const createdAssets = [];
  for (let i = 0; i < countCards; i++) {
    const assetPayload = {
      institution_id: Number(body.institution_id || 1),
      category_id: Number(body.category_id),
      location_id: body.location_id ? Number(body.location_id) : null,
      name:
        countCards > 1
          ? `${body.name || pending.title} #${i + 1}`
          : String(body.name || pending.title).trim(),
      tracking: countCards > 1 ? "individual" : body.tracking || (totalQty > 1 ? "batch" : "individual"),
      quantity: countCards > 1 ? 1 : totalQty,
      unit: body.unit || "dona",
      status: body.status || "in_use",
      condition: body.condition || "new",
      acquisition_type: "purchase",
      acquired_at:
        body.acquired_at ||
        (pending.expense_date ? new Date(pending.expense_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
      purchase_price: unitPrice,
      currency: body.currency || pending.currency || "TRY",
      responsible_name: body.responsible_name || pending.buyer_name || null,
      responsible_ref: body.responsible_ref || pending.buyer_employee_id || null,
      brand: body.brand || null,
      model: body.model || null,
      serial_no: countCards === 1 ? body.serial_no || null : null,
      supplier: body.supplier || null,
      warranty_until: body.warranty_until || null,
      notes: body.notes || pending.description || null,
    };

    const created = await createAsset(assetPayload, actor);

    // Link expense_ref and log expense_linked event
    await query(
      `UPDATE vaqf.assets SET expense_ref = $1, updated_at = NOW() WHERE id = $2`,
      [pending.expense_id, created.id]
    );
    created.expense_ref = pending.expense_id;
    await query(
      `INSERT INTO vaqf.asset_events (asset_id, event_type, new_value, note, actor_id, actor_name)
       VALUES ($1, 'expense_linked', $2::jsonb, $3, $4, $5)`,
      [
        created.id,
        JSON.stringify({ expense_ref: pending.expense_id, amount: pending.amount, currency: pending.currency }),
        `Moliya xarajati (${pending.expense_id}) asosida inventarga olindi`,
        actor?.actorId || null,
        actor?.actorName || "Inventar mas'uli",
      ]
    );

    if (assetPayload.warranty_until) {
      await ensureWarrantyScheduleForAsset(null, {
        ...created,
        warranty_until_str: assetPayload.warranty_until,
      });
    }

    createdAssets.push(created);
  }

  const assetIds = createdAssets.map((a) => a.id);
  const invNos = createdAssets.map((a) => a.inventory_no);

  const upd = await query(
    `UPDATE vaqf.pending_finance_expenses
     SET status = 'registered',
         registered_asset_ids = $1::jsonb,
         registered_inventory_nos = $2::jsonb,
         processed_by = $3,
         processed_by_name = $4,
         processed_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [
      JSON.stringify(assetIds),
      JSON.stringify(invNos),
      actor?.actorId || null,
      actor?.actorName || "Inventar mas'uli",
      id,
    ]
  );

  return {
    pendingExpense: upd.rows[0],
    assets: createdAssets,
  };
}

export async function markPendingExpenseNotInventory(pendingId, reason, actor) {
  const id = Number(pendingId);
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    throw httpError(400, "'Bu inventar emas' deb belgilash uchun sabab (izoh) kiritilishi shart");
  }
  const upd = await query(
    `UPDATE vaqf.pending_finance_expenses
     SET status = 'not_inventory',
         not_inventory_reason = $1,
         processed_by = $2,
         processed_by_name = $3,
         processed_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [cleanReason, actor?.actorId || null, actor?.actorName || "Inventar mas'uli", id]
  );
  if (upd.rowCount === 0) throw httpError(404, "Moliya xarajati topilmadi");
  return upd.rows[0];
}

/**
 * Returns a map `{ [expenseId]: ["EV-MZN-000001", ...] }` for displaying "inventarda: EV-MZN-..." badges in Finance UI.
 */
export async function getInventoryLinksByExpenseIds() {
  const [assetsRes, repairsRes] = await Promise.all([
    query(
      `SELECT id, inventory_no, name, expense_ref
       FROM vaqf.assets
       WHERE expense_ref IS NOT NULL AND deleted_at IS NULL`
    ),
    query(
      `SELECT r.expense_ref, a.id, a.inventory_no, a.name
       FROM vaqf.repairs r
       JOIN vaqf.assets a ON a.id = r.asset_id
       WHERE r.expense_ref IS NOT NULL AND a.deleted_at IS NULL`
    ),
  ]);

  const byExpenseId = {};
  for (const row of [...assetsRes.rows, ...repairsRes.rows]) {
    const ref = String(row.expense_ref || "").trim();
    if (!ref) continue;
    if (!byExpenseId[ref]) byExpenseId[ref] = [];
    if (!byExpenseId[ref].some((x) => x.inventory_no === row.inventory_no)) {
      byExpenseId[ref].push({
        asset_id: row.id,
        inventory_no: row.inventory_no,
        name: row.name,
      });
    }
  }
  return byExpenseId;
}

// ============================================================================
// 4-QADAM: SCHEDULES & REMINDERS (`vaqf.schedules`)
// ============================================================================
export const SCHEDULE_TEMPLATES = [
  {
    code: "fire_extinguisher_check",
    title: "O't o'chirgich tekshiruvi (6 oylik)",
    kind: "inspection",
    interval_months: 6,
    remind_days_before: [14, 3],
    notes: "Bosim manometri, plomba va korpus butunligini tekshirish",
  },
  {
    code: "fire_extinguisher_refill",
    title: "O't o'chirgichni qayta to'ldirish (Yillik)",
    kind: "maintenance",
    interval_months: 12,
    remind_days_before: [14, 3],
    notes: "Yillik qayta zaryadlash va sertifikat yangilash",
  },
  {
    code: "elevator_inspection",
    title: "Lift texnik ko'rigi",
    kind: "inspection",
    interval_months: 6,
    remind_days_before: [14, 3],
    notes: "Lift xavfsizlik tormozi, tros va avtomatika tekshiruvi",
  },
  {
    code: "boiler_heating_service",
    title: "Qozon va isitish tizimi xizmati",
    kind: "maintenance",
    interval_months: 12,
    remind_days_before: [14, 3],
    notes: "Kuz-qish mavsumi oldidan qozonxona va isitish tizimi profilaktikasi",
  },
  {
    code: "ac_filter_cleaning",
    title: "Konditsioner filtrlari va freon tekshiruvi",
    kind: "maintenance",
    interval_months: 3,
    remind_days_before: [14, 3],
    notes: "Ichki blok filtrlarini yuvish va drenaj yo'lini tozalash",
  },
  {
    code: "generator_check",
    title: "Generator texnik ko'rigi va moy almashtirish",
    kind: "maintenance",
    interval_months: 6,
    remind_days_before: [14, 3],
    notes: "Akkumulyator, yoqilg'i va moy darajasini tekshirish, test ishga tushirish",
  },
  {
    code: "water_tank_cleaning",
    title: "Suv baki tozalash va dezinfeksiya",
    kind: "maintenance",
    interval_months: 6,
    remind_days_before: [14, 3],
    notes: "Suv zaxira bakini yuvish va sanitariya tozalovi",
  },
  {
    code: "electrical_panel_check",
    title: "Elektr shitlarini tekshirish (Termovizor / Kontaktlar)",
    kind: "inspection",
    interval_months: 6,
    remind_days_before: [14, 3],
    notes: "Avtomatlar, klemmalar qizishi va yerga ulanishni tekshirish",
  },
];

export async function ensureWarrantyScheduleForAsset(txOrDb, asset) {
  const dbRunner = txOrDb && typeof txOrDb.query === "function" ? txOrDb : { query };
  const rawW = asset?.warranty_until_str || asset?.warranty_until;
  const warrantyDate =
    rawW instanceof Date
      ? rawW.toISOString().slice(0, 10)
      : rawW && /^\d{4}-\d{2}-\d{2}/.test(String(rawW))
      ? String(rawW).slice(0, 10)
      : rawW && !Number.isNaN(new Date(rawW).getTime())
      ? new Date(rawW).toISOString().slice(0, 10)
      : null;
  if (!warrantyDate || !asset?.id) return null;

  const existing = await dbRunner.query(
    `SELECT id FROM vaqf.schedules WHERE asset_id = $1 AND kind = 'warranty' AND status = 'active' LIMIT 1`,
    [asset.id]
  );
  if (existing.rowCount > 0) {
    const upd = await dbRunner.query(
      `UPDATE vaqf.schedules
       SET next_due = $1::date,
           title = $2,
           responsible_ref = COALESCE($3, responsible_ref),
           responsible_name = COALESCE($4, responsible_name),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        warrantyDate,
        `Kafolat muddati tugashi: ${asset.name} (${asset.inventory_no})`,
        asset.responsible_ref || "role:inventory_manager",
        asset.responsible_name || "Inventar mas'uli",
        existing.rows[0].id,
      ]
    );
    return upd.rows[0];
  }

  const ins = await dbRunner.query(
    `INSERT INTO vaqf.schedules (
       institution_id, asset_id, title, kind, interval_months,
       next_due, remind_days_before, responsible_ref, responsible_name, notes
     ) VALUES ($1, $2, $3, 'warranty', NULL, $4::date, '[14, 3]'::jsonb, $5, $6, $7)
     RETURNING *`,
    [
      asset.institution_id || 1,
      asset.id,
      `Kafolat muddati tugashi: ${asset.name} (${asset.inventory_no})`,
      warrantyDate,
      asset.responsible_ref || "role:inventory_manager",
      asset.responsible_name || "Inventar mas'uli",
      "Buyum kartochkasidagi kafolat muddati asosida avtomatik yaratildi",
    ]
  );
  return ins.rows[0];
}

export async function listSchedules(filters = {}) {
  const where = ["s.status != 'cancelled'"];
  const params = [];

  if (filters.institution_id && filters.institution_id !== "all") {
    params.push(Number(filters.institution_id));
    where.push(`s.institution_id = $${params.length}`);
  }
  if (filters.kind) {
    params.push(filters.kind);
    where.push(`s.kind = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`s.status = $${params.length}`);
  }
  if (filters.asset_id) {
    params.push(Number(filters.asset_id));
    where.push(`s.asset_id = $${params.length}`);
  }

  const res = await query(
    `SELECT
       s.*,
       TO_CHAR(s.next_due, 'YYYY-MM-DD') AS next_due_str,
       (s.next_due - CURRENT_DATE)::int AS days_until_due,
       a.inventory_no,
       a.name AS asset_name,
       l.name AS location_name,
       l.code AS location_code
     FROM vaqf.schedules s
     LEFT JOIN vaqf.assets a ON a.id = s.asset_id
     LEFT JOIN vaqf.locations l ON l.id = s.location_id
     WHERE ${where.join(" AND ")}
     ORDER BY
       CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
       s.next_due ASC,
       s.id DESC`,
    params
  );

  return {
    items: res.rows,
    templates: SCHEDULE_TEMPLATES,
  };
}

export async function createSchedule(body = {}, actor) {
  const tpl = SCHEDULE_TEMPLATES.find((t) => t.code === body.template_code) || null;
  const title = String(body.title || tpl?.title || "").trim();
  if (!title) throw httpError(400, "Muddat / ko'rik sarlavhasi (title) majburiy");

  const assetId = body.asset_id ? Number(body.asset_id) : null;
  const locationId = body.location_id ? Number(body.location_id) : null;
  if (!assetId && !locationId) {
    throw httpError(400, "Eslatma buyumga (asset_id) yoki joyga (location_id) biriktirilishi shart");
  }

  const kind = body.kind || tpl?.kind || "maintenance";
  const intervalMonths =
    body.interval_months !== undefined && body.interval_months !== "" && body.interval_months !== null
      ? Number(body.interval_months)
      : tpl?.interval_months ?? null;

  const nextDue = String(body.next_due || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) {
    throw httpError(400, "Keyingi muddat sanasi (next_due: YYYY-MM-DD) kiritilishi shart");
  }

  const remindDays = Array.isArray(body.remind_days_before)
    ? body.remind_days_before.map(Number)
    : tpl?.remind_days_before || [14, 3];

  const ins = await query(
    `INSERT INTO vaqf.schedules (
       institution_id, asset_id, location_id, title, kind,
       template_code, interval_months, next_due, remind_days_before,
       responsible_ref, responsible_name, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::jsonb, $10, $11, $12)
     RETURNING *, TO_CHAR(next_due, 'YYYY-MM-DD') AS next_due_str`,
    [
      Number(body.institution_id || 1),
      assetId,
      locationId,
      title,
      kind,
      body.template_code || null,
      intervalMonths,
      nextDue,
      JSON.stringify(remindDays),
      body.responsible_ref || "role:inventory_manager",
      body.responsible_name || "Inventar mas'uli",
      body.notes || tpl?.notes || null,
    ]
  );

  return ins.rows[0];
}

function addMonthsToDateStr(dateStr, months) {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + Number(months), d));
  return dt.toISOString().slice(0, 10);
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + Number(days)));
  return dt.toISOString().slice(0, 10);
}

/**
 * Marks a schedule as done: calculates the next `next_due` date (if `interval_months > 0`),
 * saves optional photo/note, and logs `schedule_completed` to `vaqf.asset_events`.
 */
export async function completeSchedule(scheduleId, body = {}, actor) {
  const id = Number(scheduleId);
  const sRes = await query(
    `SELECT s.*, TO_CHAR(s.next_due, 'YYYY-MM-DD') AS next_due_str
     FROM vaqf.schedules s WHERE s.id = $1`,
    [id]
  );
  const sched = sRes.rows[0];
  if (!sched) throw httpError(404, "Muddat topilmadi");

  let photoPath = null;
  if (body.dataUrl && String(body.dataUrl).startsWith("data:")) {
    await fsp.mkdir(PHOTOS_DIR, { recursive: true });
    const base64 = String(body.dataUrl).split(",")[1] || "";
    const fileName = `sched_${id}_${Date.now()}.jpg`;
    photoPath = path.join(PHOTOS_DIR, fileName);
    await fsp.writeFile(photoPath, Buffer.from(base64, "base64"));
  }

  const prevDueStr = sched.next_due_str;
  const interval = sched.interval_months ? Number(sched.interval_months) : null;
  const nextDueStr = interval && interval > 0 ? addMonthsToDateStr(prevDueStr, interval) : prevDueStr;
  const nextStatus = interval && interval > 0 ? "active" : "completed";

  const updated = await withTransaction(async (tx) => {
    const upd = await tx.query(
      `UPDATE vaqf.schedules
       SET next_due = $1::date,
           status = $2,
           last_done_at = NOW(),
           last_done_by = $3,
           last_done_by_name = $4,
           last_reminded_for_date = NULL,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *, TO_CHAR(next_due, 'YYYY-MM-DD') AS next_due_str`,
      [nextDueStr, nextStatus, actor?.actorId || null, actor?.actorName || "Mas'ul", id]
    );

    await tx.query(
      `INSERT INTO vaqf.schedule_logs (
         schedule_id, done_by, done_by_name, previous_due, next_due, note, photo_path
       ) VALUES ($1, $2, $3, $4::date, $5::date, $6, $7)`,
      [
        id,
        actor?.actorId || null,
        actor?.actorName || "Mas'ul",
        prevDueStr,
        interval && interval > 0 ? nextDueStr : null,
        body.note || "Texnik ko'rik / muddat bajarildi",
        photoPath,
      ]
    );

    if (sched.asset_id) {
      await tx.query(
        `INSERT INTO vaqf.asset_events (asset_id, event_type, old_value, new_value, note, actor_id, actor_name)
         VALUES ($1, 'schedule_completed', $2::jsonb, $3::jsonb, $4, $5, $6)`,
        [
          sched.asset_id,
          JSON.stringify({ schedule_id: id, title: sched.title, previous_due: prevDueStr }),
          JSON.stringify({ schedule_id: id, title: sched.title, next_due: interval ? nextDueStr : null, status: nextStatus }),
          `${sched.title} bajarildi${body.note ? `: ${body.note}` : ""}`,
          actor?.actorId || null,
          actor?.actorName || "Mas'ul",
        ]
      );
    }

    return upd.rows[0];
  });

  return updated;
}

export async function snoozeSchedule(scheduleId, days = 3, actor) {
  const id = Number(scheduleId);
  const sRes = await query(
    `SELECT *, TO_CHAR(next_due, 'YYYY-MM-DD') AS next_due_str FROM vaqf.schedules WHERE id = $1`,
    [id]
  );
  const sched = sRes.rows[0];
  if (!sched) throw httpError(404, "Muddat topilmadi");

  const baseDate =
    new Date(sched.next_due_str) < new Date()
      ? new Date().toISOString().slice(0, 10)
      : sched.next_due_str;
  const nextDueStr = addDaysToDateStr(baseDate, days);

  const upd = await query(
    `UPDATE vaqf.schedules
     SET next_due = $1::date, last_reminded_for_date = NULL, updated_at = NOW()
     WHERE id = $2
     RETURNING *, TO_CHAR(next_due, 'YYYY-MM-DD') AS next_due_str`,
    [nextDueStr, id]
  );
  return upd.rows[0];
}

export async function deleteSchedule(scheduleId) {
  const id = Number(scheduleId);
  const upd = await query(
    `UPDATE vaqf.schedules SET status = 'cancelled', is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
    [id]
  );
  if (upd.rowCount === 0) throw httpError(404, "Muddat topilmadi");
  return { deleted: true, id };
}

/**
 * Daily 09:00 Istanbul check: finds schedules due within `remind_days_before` (default 14 & 3 days, or 1 day / today)
 * or overdue (`days_until_due < 0`). Overdue schedules also notify `role:director`.
 */
export async function runDailySchedulesReminderCheck({ referenceDateStr = null } = {}) {
  const refDate =
    referenceDateStr ||
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());

  const res = await query(
    `SELECT
       s.*,
       TO_CHAR(s.next_due, 'YYYY-MM-DD') AS next_due_str,
       (s.next_due - $1::date)::int AS days_until_due,
       a.inventory_no,
       a.name AS asset_name,
       l.name AS location_name
     FROM vaqf.schedules s
     LEFT JOIN vaqf.assets a ON a.id = s.asset_id
     LEFT JOIN vaqf.locations l ON l.id = s.location_id
     WHERE s.status = 'active'
       AND (s.next_due - $1::date)::int <= 14`,
    [refDate]
  );

  let enqueuedCount = 0;
  for (const s of res.rows) {
    const daysLeft = Number(s.days_until_due);
    const remindDays = Array.isArray(s.remind_days_before) ? s.remind_days_before.map(Number) : [14, 3];
    const shouldRemind =
      daysLeft < 0 ||
      daysLeft === 0 ||
      daysLeft === 1 ||
      remindDays.includes(daysLeft);

    if (!shouldRemind) continue;

    const targetLabel = s.asset_name
      ? `${s.inventory_no} — ${s.asset_name}`
      : s.location_name || "Muassasa obyekti";

    const statusBadge =
      daysLeft < 0
        ? `🚨 <b>MUDDATI O'TIB KETGAN (${Math.abs(daysLeft)} kun kechikdi!)</b>`
        : daysLeft === 0
        ? `⚠️ <b>BUGUN OXIRGI MUDDAT!</b>`
        : `⏰ <b>Muddatga ${daysLeft} kun qoldi</b>`;

    const bodyHtml =
      `${statusBadge}\n` +
      `📌 Vazifa: <b>${s.title}</b>\n` +
      `🏛 Obyekt / Buyum: <b>${targetLabel}</b>\n` +
      `📅 Rejadagi sana: <b>${s.next_due_str}</b>\n` +
      (s.notes ? `📝 Izoh: ${s.notes}\n` : "");

    await withTransaction(async (tx) => {
      const n1 = await enqueueOutboxNotification(tx, {
        event_type: "schedule_due",
        recipient_ref: s.responsible_ref || "role:inventory_manager",
        title: daysLeft < 0 ? `Muddati o'tgan ko'rik: ${s.title}` : `Eslatma: ${s.title}`,
        body: bodyHtml,
        payload: {
          schedule_id: s.id,
          asset_id: s.asset_id,
          location_id: s.location_id,
          days_until_due: daysLeft,
          urgent: daysLeft < 0,
        },
        dedupe_key: `schedule_due:${s.id}:${s.next_due_str}:d${daysLeft}`,
      });
      if (n1) enqueuedCount += 1;

      // If overdue, also escalate to Director
      if (daysLeft < 0) {
        const n2 = await enqueueOutboxNotification(tx, {
          event_type: "schedule_due",
          recipient_ref: "role:director",
          title: `🚨 Muddati o'tgan ko'rik (Nazorat): ${s.title}`,
          body: bodyHtml + `\n👤 Mas'ul: <b>${s.responsible_name || s.responsible_ref || "Inventar mas'uli"}</b>`,
          payload: {
            schedule_id: s.id,
            days_until_due: daysLeft,
            urgent: true,
          },
          dedupe_key: `schedule_overdue_dir:${s.id}:${s.next_due_str}:d${daysLeft}`,
        });
        if (n2) enqueuedCount += 1;
      }
    });
  }

  return { checked: res.rowCount, enqueued: enqueuedCount };
}

// ============================================================================
// 5-QADAM: DIRECTOR DASHBOARD & WEEKLY SUMMARY
// ============================================================================
export async function getDirectorDashboardData({ institutionId = 1 } = {}) {
  const isAll = String(institutionId) === "all" || !institutionId;
  const instParams = isAll ? [] : [Number(institutionId)];
  const instFilterA = isAll ? "1=1" : "a.institution_id = $1";
  const instFilterD = isAll ? "1=1" : "d.institution_id = $1";
  const instFilterS = isAll ? "1=1" : "s.institution_id = $1";
  const instFilterC = isAll ? "1=1" : "c.institution_id = $1";

  const [
    totalsRes,
    thisYearAddedRes,
    thisYearWriteoffRes,
    attentionRes,
    byCategoryRes,
    byLocationRes,
    byStatusRes,
    monthlyAcqRes,
    monthlyWoRes,
    monthlyRepRes,
    lastCountRes,
    finSettings,
  ] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS total_cards,
         COALESCE(SUM(a.quantity), 0)::float AS total_items,
         COUNT(*) FILTER (WHERE a.tracking = 'batch')::int AS batch_cards_count,
         COUNT(*) FILTER (WHERE a.acquisition_type = 'donation')::int AS donation_count,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS total_value_try,
         COALESCE(SUM(CASE WHEN a.currency = 'USD' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS total_value_usd,
         COUNT(*) FILTER (WHERE a.location_id IS NULL AND a.status != 'written_off')::int AS unassigned_location_count,
         COUNT(*) FILTER (WHERE (a.responsible_name IS NULL OR BTRIM(a.responsible_name) = '') AND a.status != 'written_off')::int AS unassigned_responsible_count,
         COUNT(*) FILTER (WHERE a.status = 'missing')::int AS missing_assets_count
       FROM vaqf.assets a
       WHERE a.deleted_at IS NULL AND a.status != 'written_off' AND ${instFilterA}`,
      instParams
    ),
    query(
      `SELECT
         COUNT(*)::int AS cards_count,
         COALESCE(SUM(a.quantity), 0)::float AS items_count,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_try
       FROM vaqf.assets a
       WHERE a.deleted_at IS NULL
         AND EXTRACT(YEAR FROM COALESCE(a.acquired_at, a.created_at::date)) = EXTRACT(YEAR FROM CURRENT_DATE)
         AND ${instFilterA}`,
      instParams
    ),
    query(
      `SELECT
         COUNT(*)::int AS count,
         COALESCE(SUM(w.qty), 0)::float AS units,
         COALESCE(SUM(COALESCE(w.book_value, 0)), 0)::float AS value_try
       FROM vaqf.writeoffs w
       JOIN vaqf.assets a ON a.id = w.asset_id
       WHERE EXTRACT(YEAR FROM w.created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
         AND ${instFilterA}`,
      instParams
    ),
    query(
      `SELECT
         (SELECT COUNT(*)::int FROM vaqf.documents d WHERE d.status = 'pending_approval' AND ${instFilterD}) AS pending_approvals_count,
         (SELECT COUNT(*)::int FROM vaqf.fault_reports f JOIN vaqf.assets a ON a.id = f.asset_id WHERE f.status IN ('new', 'in_repair') AND ${instFilterA}) AS open_faults_count,
         (SELECT COUNT(*)::int FROM vaqf.pending_finance_expenses p WHERE p.status = 'pending') AS unregistered_expenses_count,
         (SELECT COUNT(*)::int FROM vaqf.pending_finance_expenses p WHERE p.status = 'pending' AND (CURRENT_DATE - COALESCE(p.expense_date, p.created_at::date)) >= 7) AS unregistered_over_7d_count,
         (SELECT COUNT(*)::int FROM vaqf.schedules s WHERE s.status = 'active' AND s.next_due < CURRENT_DATE AND ${instFilterS}) AS overdue_schedules_count,
         (SELECT COUNT(*)::int FROM vaqf.schedules s WHERE s.status = 'active' AND s.next_due BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '14 days') AND ${instFilterS}) AS due_14d_schedules_count`,
      instParams
    ),
    query(
      `SELECT
         c.id AS category_id,
         c.name AS category_name,
         COUNT(a.id)::int AS cards_count,
         COALESCE(SUM(a.quantity), 0)::float AS items_count,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_try,
         COALESCE(SUM(CASE WHEN a.currency = 'USD' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_usd
       FROM vaqf.assets a
       JOIN vaqf.asset_categories c ON c.id = a.category_id
       WHERE a.deleted_at IS NULL AND a.status != 'written_off' AND ${instFilterA}
       GROUP BY c.id, c.name
       ORDER BY value_try DESC, items_count DESC`,
      instParams
    ),
    query(
      `SELECT
         COALESCE(l.id, 0) AS location_id,
         COALESCE(l.name, 'Joyi belgilanmagan') AS location_name,
         COUNT(a.id)::int AS cards_count,
         COALESCE(SUM(a.quantity), 0)::float AS items_count,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_try
       FROM vaqf.assets a
       LEFT JOIN vaqf.locations l ON l.id = a.location_id
       WHERE a.deleted_at IS NULL AND a.status != 'written_off' AND ${instFilterA}
       GROUP BY l.id, l.name
       ORDER BY value_try DESC, items_count DESC
       LIMIT 12`,
      instParams
    ),
    query(
      `SELECT
         a.status,
         COUNT(*)::int AS cards_count,
         COALESCE(SUM(a.quantity), 0)::float AS items_count,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_try
       FROM vaqf.assets a
       WHERE a.deleted_at IS NULL AND ${instFilterA}
       GROUP BY a.status`,
      instParams
    ),
    query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', COALESCE(a.acquired_at, a.created_at::date)), 'YYYY-MM') AS month,
         COUNT(*)::int AS count,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_try
       FROM vaqf.assets a
       WHERE a.deleted_at IS NULL AND ${instFilterA}
       GROUP BY 1
       ORDER BY 1 DESC
       LIMIT 6`,
      instParams
    ),
    query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', w.created_at), 'YYYY-MM') AS month,
         COUNT(*)::int AS count,
         COALESCE(SUM(COALESCE(w.book_value, 0)), 0)::float AS value_try
       FROM vaqf.writeoffs w
       JOIN vaqf.assets a ON a.id = w.asset_id
       WHERE ${instFilterA}
       GROUP BY 1
       ORDER BY 1 DESC
       LIMIT 6`,
      instParams
    ),
    query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', r.sent_at), 'YYYY-MM') AS month,
         COUNT(*)::int AS count,
         COALESCE(SUM(CASE WHEN r.currency = 'TRY' THEN COALESCE(r.cost, 0) ELSE 0 END), 0)::float AS value_try
       FROM vaqf.repairs r
       JOIN vaqf.assets a ON a.id = r.asset_id
       WHERE ${instFilterA}
       GROUP BY 1
       ORDER BY 1 DESC
       LIMIT 6`,
      instParams
    ),
    query(
      `SELECT
         c.id, c.code, c.title, c.approved_at, c.started_at,
         (SELECT COUNT(*)::int FROM vaqf.inventory_count_items ci WHERE ci.count_id = c.id AND ci.asset_id IS NOT NULL) AS expected_count,
         (SELECT COUNT(*)::int FROM vaqf.inventory_count_items ci WHERE ci.count_id = c.id AND ci.result IN ('found', 'moved', 'qty_diff', 'damaged')) AS present_count
       FROM vaqf.inventory_counts c
       WHERE c.status = 'approved' AND ${instFilterC}
       ORDER BY c.approved_at DESC NULLS LAST, c.id DESC
       LIMIT 1`,
      instParams
    ),
    getFinanceIntegrationSettings(),
  ]);

  const tot = totalsRes.rows[0] || {};
  const att = attentionRes.rows[0] || {};
  const addedYr = thisYearAddedRes.rows[0] || {};
  const woYr = thisYearWriteoffRes.rows[0] || {};

  // Missing assets count (since written_off is excluded in totalsRes, missing is included)
  const missingRow = byStatusRes.rows.find((r) => r.status === "missing");
  const missingCardsCount = Number(missingRow?.cards_count || tot.missing_assets_count || 0);

  const lastCount = lastCountRes.rows[0] || null;
  let lastInventorySummary = null;
  const intervalMonths = Number(finSettings.recommended_count_interval_months || 12);
  if (lastCount) {
    const exp = Number(lastCount.expected_count || 0);
    const pres = Number(lastCount.present_count || 0);
    const matchPct = exp > 0 ? Math.round((pres / exp) * 100) : 100;
    const approvedDateStr = new Date(lastCount.approved_at || lastCount.started_at || Date.now())
      .toISOString()
      .slice(0, 10);
    const nextRecommendedDate = addMonthsToDateStr(approvedDateStr, intervalMonths);
    lastInventorySummary = {
      id: lastCount.id,
      code: lastCount.code,
      title: lastCount.title,
      approved_date: approvedDateStr,
      match_pct: matchPct,
      expected_count: exp,
      present_count: pres,
      recommended_interval_months: intervalMonths,
      next_recommended_date: nextRecommendedDate,
    };
  }

  return {
    totals: {
      ...tot,
      added_this_year_cards: Number(addedYr.cards_count || 0),
      added_this_year_items: Number(addedYr.items_count || 0),
      added_this_year_try: Number(addedYr.value_try || 0),
      written_off_this_year_cards: Number(woYr.count || 0),
      written_off_this_year_items: Number(woYr.units || 0),
      written_off_this_year_try: Number(woYr.value_try || 0),
    },
    attention: {
      pending_approvals_count: Number(att.pending_approvals_count || 0),
      open_faults_count: Number(att.open_faults_count || 0),
      unregistered_expenses_count: Number(att.unregistered_expenses_count || 0),
      unregistered_over_7d_count: Number(att.unregistered_over_7d_count || 0),
      overdue_schedules_count: Number(att.overdue_schedules_count || 0),
      due_14d_schedules_count: Number(att.due_14d_schedules_count || 0),
      unassigned_location_count: Number(tot.unassigned_location_count || 0),
      unassigned_responsible_count: Number(tot.unassigned_responsible_count || 0),
      missing_assets_count: missingCardsCount,
    },
    byCategory: byCategoryRes.rows,
    byLocation: byLocationRes.rows,
    byStatus: byStatusRes.rows,
    trends: {
      acquisitions: monthlyAcqRes.rows,
      writeoffs: monthlyWoRes.rows,
      repairs: monthlyRepRes.rows,
    },
    lastInventory: lastInventorySummary,
  };
}

/**
 * Enqueues weekly Monday 09:00 summary to Director in `vaqf.notifications_outbox`.
 */
export async function enqueueWeeklyDirectorSummary({ weekKey = null } = {}) {
  const dash = await getDirectorDashboardData({ institutionId: "all" });
  const a = dash.attention;
  const t = dash.totals;
  const dateKey = weekKey || new Date().toISOString().slice(0, 10);

  const bodyHtml =
    `📊 <b>Ezan Vakfı — Haftalik mulk va nazorat xulosasi</b>\n\n` +
    `📦 Jami mulk: <b>${t.total_items || 0} birlik (${t.total_cards || 0} kartochka)</b>\n` +
    `💰 Umumiy qiymat: <b>₺${Math.round(t.total_value_try || 0).toLocaleString("tr-TR")}</b>\n\n` +
    `🔔 <b>Diqqat talab qiladigan masalalar:</b>\n` +
    `• Kutilayotgan tasdiqlar: <b>${a.pending_approvals_count} ta</b>\n` +
    `• Ochiq nosozliklar: <b>${a.open_faults_count} ta</b>\n` +
    `• Ro'yxatga olinmagan xaridlar: <b>${a.unregistered_expenses_count} ta</b> (7+ kun: ${a.unregistered_over_7d_count} ta)\n` +
    `• Muddati o'tgan ko'riklar: <b>${a.overdue_schedules_count} ta</b> (14 kun ichida: ${a.due_14d_schedules_count} ta)\n` +
    `• Joyi / javobgari belgilanmaganlar: <b>${a.unassigned_location_count} / ${a.unassigned_responsible_count} ta</b>\n` +
    `• Topilmadi ('missing') holatidagilar: <b>${a.missing_assets_count} ta</b>\n\n` +
    `🔗 Batafsil ko'rish: Web panel (/vaqf/)`;

  return enqueueOutboxNotification(null, {
    event_type: "weekly_summary",
    recipient_ref: "role:director",
    title: "Haftalik Vaqf nazorat xulosasi",
    body: bodyHtml,
    payload: { attention: a, totals: t },
    dedupe_key: `weekly_summary:${dateKey}`,
  });
}

// ============================================================================
// BACKGROUND WORKER LOOP (10s Outbox Worker + Daily 09:00 & Monday 09:00 Cron)
// ============================================================================
let workerInterval = null;
let lastDailyCheckDate = "";
let lastWeeklySummaryDate = "";

export function startVaqfBackgroundWorkers() {
  if (workerInterval) return;

  workerInterval = setInterval(async () => {
    try {
      await processOutboxBatch();

      const now = new Date();
      const istParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Istanbul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(now);

      const part = (type) => istParts.find((p) => p.type === type)?.value || "";
      const dateStr = `${part("year")}-${part("month")}-${part("day")}`;
      const hour = Number(part("hour") || 0);
      const weekday = part("weekday");

      if (hour >= 9 && lastDailyCheckDate !== dateStr) {
        lastDailyCheckDate = dateStr;
        await runDailySchedulesReminderCheck({ referenceDateStr: dateStr });
      }

      if (weekday === "Mon" && hour >= 9 && lastWeeklySummaryDate !== dateStr) {
        lastWeeklySummaryDate = dateStr;
        await enqueueWeeklyDirectorSummary({ weekKey: dateStr });
      }
    } catch (err) {
      console.error("[VAQF WORKER ERROR]:", err?.message || err);
    }
  }, 10000);

  if (workerInterval.unref) workerInterval.unref();
}
