import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
import { createPsqlPool, platformPool, buildCampusSmartAnalytics, captureSixGatePhotos, simulateSmartTurnstileScan, pollGateTelegramReplies, pollKirishTurnstileLive, toggleBotRecipient, cleanupOldGatePhotos, syncStudentCardToZkteco, syncAllCardsToZkteco, fetchRecentZktecoCards } from "./campusSmartService.mjs";
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.resolve(__dirname, "../finance/dist");
const SESSIONS_FILE = path.resolve(__dirname, ".sessions.json");

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

const crmEnv = parseEnvFile("/srv/data/mezana-space/var/www/mezana-crm/backend/.env");
const pgPool = createPsqlPool(crmEnv.DATABASE_URL || "");
const erpEnv = parseEnvFile("/srv/data/apps/moliy/.env");
const platformEnv = parseEnvFile("/srv/data/apps/mezana-platform/.env.platform.local");
const botEnv = parseEnvFile("/srv/data/apps/mezana-platform/apps/telegram-bot/.env");

const CRM_GRAPHQL = process.env.CRM_GRAPHQL_URL || "http://127.0.0.1:4000/graphql";
const ERP_API = process.env.ERP_API_URL || "http://127.0.0.1:3004/api/v1";
const CRM_JWT_SECRET = crmEnv.JWT_SECRET || "";
const ERP_JWT_SECRET = erpEnv.JWT_SECRET || "";
const OPENAI_API_KEY = platformEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
const PORT_MAIN = Number(process.env.FINANCE_PORT || 3000);
const PORT_ALT = Number(process.env.FINANCE_ALT_PORT || 8005);

// Minimal HS256 JWT signer (compatible with jsonwebtoken used in CRM & ERP)
function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signJwtHs256(payload, secret, opts = {}) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (opts.expiresInSec || 7 * 86400);
  const fullPayload = {
    ...payload,
    iat: now,
    exp,
    ...(opts.issuer ? { iss: opts.issuer } : {}),
    ...(opts.audience ? { aud: opts.audience } : {}),
  };
  const header = { alg: "HS256", typ: "JWT" };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(fullPayload))}`;
  const sig = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${signingInput}.${sig}`;
}

const TELEGRAM_BOT_TOKEN = botEnv.TELEGRAM_BOT_TOKEN || platformEnv.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
const DIRECTOR_TELEGRAM_IDS = ["975535813", "8917275156"];

async function notifyDirectorsOnTelegram(htmlText, replyMarkup = null) {
  if (!TELEGRAM_BOT_TOKEN) return [];
  const sentList = [];
  for (const chatId of DIRECTOR_TELEGRAM_IDS) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: htmlText,
          parse_mode: "HTML",
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      });
      const j = await r.json();
      if (j?.ok && j?.result?.message_id) {
        sentList.push({ chatId: String(chatId), messageId: Number(j.result.message_id) });
      }
    } catch {}
  }
  return sentList;
}

async function sendTelegramHtml(chatId, htmlText, replyMarkup = null) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(chatId),
        text: htmlText,
        parse_mode: "HTML",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    const j = await r.json();
    if (j?.ok && j?.result?.message_id) return Number(j.result.message_id);
  } catch {}
  return null;
}

async function editTelegramHtml(chatId, messageId, htmlText, replyMarkup = null) {
  if (!TELEGRAM_BOT_TOKEN || !chatId || !messageId) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(chatId),
        message_id: Number(messageId),
        text: htmlText,
        parse_mode: "HTML",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
  } catch {}
}

function getEmployeeTelegramIds(employeeId, sourceKey, requesterTgId) {
  if (requesterTgId) return [String(requesterTgId)];
  const key = String(sourceKey || "").toLowerCase();
  if (employeeId === "cmtlai0pv000upir9qk3vaotg" || key.includes("muhammadjon")) return ["490924335"];
  if (employeeId === "cmvaqfemp0000000000000001" || key.includes("vaqf")) return ["929885302"];
  if (employeeId === "cmtlai0it000ppir989mu70w1" || key.includes("idora")) return ["8142118072", "8014832689"];
  return [];
}

async function execPgSql(dbUrl, sql) {
  const pool = createPsqlPool(dbUrl);
  await pool.query(sql);
  return "";
}
function sqlStr(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).replace(/'/g, "''") + "'";
}

async function queryPgJson(dbUrl, sql) {
  try {
    const pool = createPsqlPool(dbUrl);
    const cleanSql = String(sql || "").trim().replace(/;+\s*$/, "");
    const wrapped = `SELECT COALESCE(json_agg(t), '[]'::json) AS j FROM (${cleanSql}) t`;
    const res = await pool.query(wrapped);
    return res.rows[0]?.j || [];
  } catch (e) {
    console.error("[queryPgJson error]:", e.message);
    return [];
  }
}

function parseJsonArraySafe(raw, fallback = []) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "string") return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

const crmPasswordHashCache = new Map();
const crmAdminsByUsername = new Map();

async function refreshCrmAuthCache() {
  try {
    const roots = await pgPool.query('SELECT id, username, fullname, password, "allowedPages", "readOnlyPages" FROM "Root"');
    for (const r of roots.rows) {
      crmPasswordHashCache.set(`root:${r.id}`, r.password);
    }
    const admins = await pgPool.query('SELECT id, username, fullname, password, gender::text AS gender, "isActive", "isDeleted", "allowedPages", "readOnlyPages" FROM "Admin"');
    for (const a of admins.rows) {
      crmPasswordHashCache.set(`admin:${a.id}`, a.password);
      crmAdminsByUsername.set(String(a.username || "").toLowerCase(), {
        id: a.id,
        username: a.username,
        fullname: a.fullname,
        gender: a.gender || "MALE",
        isActive: Boolean(a.isActive && !a.isDeleted),
        allowedPages: parseJsonArraySafe(a.allowedPages, []),
        readOnlyPages: parseJsonArraySafe(a.readOnlyPages, []),
      });
    }
  } catch (e) {
    console.warn("[refreshCrmAuthCache warning]:", e.message);
  }
}
refreshCrmAuthCache();
setInterval(refreshCrmAuthCache, 60 * 1000);

function getCrmPasswordHash(role, id) {
  const key = `${role}:${id}`;
  return crmPasswordHashCache.get(key) || "";
}

function mintCrmToken({ id = 3, role = "root", username = "mezana", gender = null } = {}) {
  if (!CRM_JWT_SECRET) return null;
  const passwordHash = getCrmPasswordHash(role, id);
  const admMeta = role === "admin" ? crmAdminsByUsername.get(String(username || "").toLowerCase()) : null;
  const defaultPages = ["dashboard", "students", "groups", "teachers", "debtors", "finance", "canteen", "settings"];
  return signJwtHs256(
    {
      id,
      role,
      username,
      passwordHash,
      ...(gender ? { gender } : {}),
      allowedPages: admMeta?.allowedPages?.length ? admMeta.allowedPages : defaultPages,
      readOnlyPages: admMeta?.readOnlyPages || [],
    },
    CRM_JWT_SECRET,
    { expiresInSec: 7 * 86400, issuer: "qmr-backend", audience: "qmr-frontend" }
  );
}

function mintErpToken({
  id = "cmtlai0bg000ipir95hv9hfez",
  email = "director@moliy.org",
  role = "DIRECTOR",
} = {}) {
  if (!ERP_JWT_SECRET) return null;
  return signJwtHs256(
    { sub: id, email, role },
    ERP_JWT_SECRET,
    {
      expiresInSec: 7 * 86400,
      issuer: "enterprise-finance-erp",
      audience: "http://localhost:3000",
    }
  );
}

const CRM_TO_ERP_MAP = {
  dev: { id: "cmdev00000000000000000001", email: "dev@moliy.org", role: "DIRECTOR", employeeId: "cmdevemp00000000000000001", walletId: "cmdevwal00000000000000001", sourceLabel: "Developer (Muhammadali)" },
  mezana: { id: "cmtlai0bg000ipir95hv9hfez", email: "director@moliy.org", role: "DIRECTOR", employeeId: "cmtlai0bx000kpir9d0k7sn7a", walletId: "cmtlai0cg000mpir9h862jp1c", sourceLabel: "Direktor" },
  abdurahman: { id: "cmvaqf0000000000000000001", email: "vaqf@moliya.org", role: "EMPLOYEE", employeeId: "cmvaqfemp0000000000000001", walletId: "cmvaqfwal0000000000000001", sourceLabel: "Kichik Abdurahmon (Vaqf)" },
  mezanaayol: { id: "cmu5837xm000bseknf7z1n0gl", email: "mezanaayol@moliy.org", role: "EMPLOYEE", employeeId: "cmu5837xq000dseknha0g6jvs", walletId: "cmu5837xt000fsekn33zqyd70", sourceLabel: "Mezana Ayollar" },
  aliya12: { id: "cmu5837xm000bseknf7z1n0gl", email: "mezanaayol@moliy.org", role: "EMPLOYEE", employeeId: "cmu5837xq000dseknha0g6jvs", walletId: "cmu5837xt000fsekn33zqyd70", sourceLabel: "Aliya (Ayollar)" },
  idora: { id: "cmtlai0il000npir9ydqrvy3s", email: "idora@moliya.org", role: "EMPLOYEE", employeeId: "cmtlai0it000ppir989mu70w1", walletId: "cmtlai0j1000rpir96nhfpk0k", sourceLabel: "Abu Bakr Tojiddinov (Idora)" },
  userumar: { id: "cmtlai0il000npir9ydqrvy3s", email: "umarxon@moliya.org", role: "EMPLOYEE", employeeId: "cmtlai0it000ppir989mu70w1", walletId: "cmtlai0j1000rpir96nhfpk0k", sourceLabel: "Umarkhon Abdulhamidov (Idora)" },
  umarxon: { id: "cmtlai0il000npir9ydqrvy3s", email: "umarxon@moliya.org", role: "EMPLOYEE", employeeId: "cmtlai0it000ppir989mu70w1", walletId: "cmtlai0j1000rpir96nhfpk0k", sourceLabel: "Umarkhon Abdulhamidov (Idora)" },
};

const ERP_TO_CRM_MAP = {
  "dev@moliy.org": { id: 4, username: "dev", fullname: "Developer (Muhammadali)", role: "root", gender: null, employeeId: "cmdevemp00000000000000001", walletId: "cmdevwal00000000000000001", sourceLabel: "Developer (Muhammadali)" },
  "director@moliy.org": { id: 3, username: "mezana", fullname: "Muhammad Solih Tursunov (Direktor)", role: "root", gender: null, employeeId: "cmtlai0bx000kpir9d0k7sn7a", walletId: "cmtlai0cg000mpir9h862jp1c", sourceLabel: "Direktor" },
  "vaqf@moliya.org": { id: 2, username: "abdurahman", fullname: "Kichik Abdurahmon (Vaqf)", role: "admin", gender: "MALE", employeeId: "cmvaqfemp0000000000000001", walletId: "cmvaqfwal0000000000000001", sourceLabel: "Kichik Abdurahmon (Vaqf)" },
  "abdurahmon@moliya.org": { id: null, username: null, fullname: "Abdurahmon (Moliya)", role: null, gender: "MALE", employeeId: "cmtlai0w1000zpir9b7ste5ze", walletId: "cmtlai0y20011pir95rtswvib", sourceLabel: "Abdurahmon" },
  "mezanaayol@moliy.org": { id: 4, username: "mezanaayol", fullname: "Mezana Ayollar", role: "admin", gender: "FEMALE", employeeId: "cmu5837xq000dseknha0g6jvs", walletId: "cmu5837xt000fsekn33zqyd70", sourceLabel: "Mezana Ayollar" },
  "idora@moliya.org": { id: 5, username: "idora", fullname: "Abu Bakr Tojiddinov (Idora)", role: "admin", gender: "MALE", employeeId: "cmtlai0it000ppir989mu70w1", walletId: "cmtlai0j1000rpir96nhfpk0k", sourceLabel: "Abu Bakr Tojiddinov (Idora)" },
  "umarxon@moliya.org": { id: 1, username: "userumar", fullname: "Umarkhon Abdulhamidov (Idora)", role: "admin", gender: "MALE", employeeId: "cmtlai0it000ppir989mu70w1", walletId: "cmtlai0j1000rpir96nhfpk0k", sourceLabel: "Umarkhon Abdulhamidov (Idora)" },
  "umarxon@moliy.org": { id: 1, username: "userumar", fullname: "Umarkhon Abdulhamidov (Idora)", role: "admin", gender: "MALE", employeeId: "cmtlai0it000ppir989mu70w1", walletId: "cmtlai0j1000rpir96nhfpk0k", sourceLabel: "Umarkhon Abdulhamidov (Idora)" },
  "muhammadjon@moliya.org": { id: null, username: null, fullname: "Muhammadjon", role: null, gender: "MALE", employeeId: "cmtlai0pv000upir9qk3vaotg", walletId: "cmtlai0q9000wpir99dk24v86", sourceLabel: "Muhammadjon" },
};

const ERP_USER_TO_EMPLOYEE_MAP = {
  cmdev00000000000000000001: { employeeId: "cmdevemp00000000000000001", walletId: "cmdevwal00000000000000001", accountName: "Developer", sourceLabel: "Developer (Muhammadali)" },
  cmtlai0bg000ipir95hv9hfez: { employeeId: "cmtlai0bx000kpir9d0k7sn7a", walletId: "cmtlai0cg000mpir9h862jp1c", accountName: "Direktor", sourceLabel: "Direktor" },
  cmtlai0il000npir9ydqrvy3s: { employeeId: "cmtlai0it000ppir989mu70w1", walletId: "cmtlai0j1000rpir96nhfpk0k", accountName: "Idora", sourceLabel: "Idora" },
  cmvaqf0000000000000000001: { employeeId: "cmvaqfemp0000000000000001", walletId: "cmvaqfwal0000000000000001", accountName: "Kichik Abdurahmon (Vaqf)", sourceLabel: "Kichik Abdurahmon (Vaqf)" },
  cmtlai0vp000xpir90ttfiaq2: { employeeId: "cmtlai0w1000zpir9b7ste5ze", walletId: "cmtlai0y20011pir95rtswvib", accountName: "Abdurahmon", sourceLabel: "Abdurahmon" },
  cmtlai0po000spir9kk7zzeds: { employeeId: "cmtlai0pv000upir9qk3vaotg", walletId: "cmtlai0q9000wpir99dk24v86", accountName: "Muhammadjon", sourceLabel: "Muhammadjon" },
  cmu5837xm000bseknf7z1n0gl: { employeeId: "cmu5837xq000dseknha0g6jvs", walletId: "cmu5837xt000fsekn33zqyd70", accountName: "Mezana Ayollar", sourceLabel: "Mezana Ayollar" },
};

function getSessionAccessContext(sess) {
  if (!sess) {
    return {
      isDirector: false,
      employeeId: null,
      walletId: null,
      accountName: null,
      sourceLabel: null,
      gender: "MALE",
      allowedTabs: [],
      allowedPages: [],
      readOnlyPages: [],
    };
  }
  const erpEmail = String(sess.erpUser?.email || "").toLowerCase();
  const erpUserId = String(sess.erpUser?.id || "");
  const isErpOnlyAccount = erpEmail === "muhammadjon@moliya.org" || erpEmail === "abdurahmon@moliya.org";
  const crmUsername = isErpOnlyAccount ? "" : String(sess.crmUser?.username || "").toLowerCase();

  const isDirector = Boolean(
    sess.user?.role === "DIRECTOR" ||
    sess.erpUser?.role === "DIRECTOR" ||
    sess.crmUser?.role === "root" ||
    crmUsername === "dev" ||
    crmUsername === "mezana" ||
    erpEmail === "dev@moliy.org" ||
    erpEmail === "director@moliy.org"
  );

  const fromCrm = crmUsername ? CRM_TO_ERP_MAP[crmUsername] : null;
  const fromErp = erpEmail ? ERP_TO_CRM_MAP[erpEmail] : null;
  const fromUser = erpUserId ? ERP_USER_TO_EMPLOYEE_MAP[erpUserId] : null;

  const isErpLogin = sess.user?.system === "erp" || isErpOnlyAccount;
  const employeeId = isErpLogin
    ? (fromErp?.employeeId || fromUser?.employeeId || fromCrm?.employeeId || null)
    : (fromCrm?.employeeId || fromErp?.employeeId || fromUser?.employeeId || null);
  const walletId = isErpLogin
    ? (fromErp?.walletId || fromUser?.walletId || fromCrm?.walletId || null)
    : (fromCrm?.walletId || fromErp?.walletId || fromUser?.walletId || null);
  const accountName = isErpLogin
    ? (fromUser?.accountName || fromErp?.sourceLabel || fromCrm?.sourceLabel || sess.user?.name || "Xodim")
    : (fromUser?.accountName || fromCrm?.sourceLabel || fromErp?.sourceLabel || sess.user?.name || "Xodim");
  const sourceLabel = isErpLogin
    ? (fromErp?.sourceLabel || fromUser?.sourceLabel || fromCrm?.sourceLabel || sess.user?.name || "Xodim")
    : (fromCrm?.sourceLabel || fromErp?.sourceLabel || fromUser?.sourceLabel || sess.user?.name || sess.crmUser?.fullname || "Xodim");

  const admMeta = crmUsername ? crmAdminsByUsername.get(crmUsername) : null;
  const gender = isDirector
    ? null
    : (admMeta?.gender || sess.crmUser?.gender || fromErp?.gender || (erpEmail === "mezanaayol@moliy.org" ? "FEMALE" : "MALE"));

  const allTabs = [
    "dashboard", "payments", "debtors", "expenses", "wallets", "planning", "reports",
    "students_dir", "groups_courses", "attendance", "canteen_mosque", "discipline_rooms",
    "hr_tasks", "org_catalog", "system_admin"
  ];

  let allowedTabs = allTabs;
  if (!isDirector) {
    const tabs = new Set(["dashboard", "expenses", "wallets"]);
    if (!isErpOnlyAccount && admMeta) {
      const rawAllowed = admMeta.allowedPages || [];
      const joined = rawAllowed.join(" ").toLowerCase();
      if (!rawAllowed.length || joined.includes("finance") || joined.includes("payment") || joined.includes("debtor")) {
        tabs.add("payments");
        tabs.add("debtors");
      }
      if (!rawAllowed.length || joined.includes("report") || joined.includes("analytics")) {
        tabs.add("reports");
      }
      if (!rawAllowed.length || joined.includes("student") || joined.includes("iqoma")) {
        tabs.add("students_dir");
      }
      if (!rawAllowed.length || joined.includes("group") || joined.includes("teacher") || joined.includes("subject") || joined.includes("schedule")) {
        tabs.add("groups_courses");
      }
      if (!rawAllowed.length || joined.includes("attendance") || joined.includes("group") || joined.includes("schedule")) {
        tabs.add("attendance");
      }
      if (!rawAllowed.length || joined.includes("oshxona") || joined.includes("mosque") || joined.includes("canteen") || joined.includes("event")) {
        tabs.add("canteen_mosque");
      }
      if (!rawAllowed.length || joined.includes("room") || joined.includes("phone") || joined.includes("duty")) {
        tabs.add("discipline_rooms");
      }
      if (!rawAllowed.length || joined.includes("employee") || joined.includes("task")) {
        tabs.add("hr_tasks");
      }
    }
    allowedTabs = Array.from(tabs);
  }

  return {
    isDirector,
    employeeId,
    walletId,
    accountName,
    sourceLabel,
    gender,
    allowedTabs,
    allowedPages: admMeta?.allowedPages || [],
    readOnlyPages: isDirector ? [] : (admMeta?.readOnlyPages || []),
  };
}

const sessions = new Map();
try {
  if (fs.existsSync(SESSIONS_FILE)) {
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
    for (const [k, v] of Object.entries(data)) {
      if (v && v.expiresAt > Date.now()) sessions.set(k, v);
    }
  }
} catch {}

function saveSessions() {
  try {
    const obj = {};
    for (const [k, v] of sessions.entries()) {
      if (v.expiresAt > Date.now()) obj[k] = v;
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj), { mode: 0o600 });
  } catch {}
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function isJwtExpired(token) {
  if (!token || typeof token !== "string") return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload.exp) return false;
    return payload.exp * 1000 < Date.now() + 300000;
  } catch {
    return true;
  }
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies.mezana_fin_sid;
  if (!sid) return null;
  const sess = sessions.get(sid);
  if (!sess) return null;
  if (sess.expiresAt < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  let dirty = false;
  if (!sess.crmToken || isJwtExpired(sess.crmToken)) {
    const mapped = sess.crmUser || (sess.erpUser?.email && ERP_TO_CRM_MAP[sess.erpUser.email.toLowerCase()]) || { id: 3, username: "mezana", fullname: "Mezana", role: "root", gender: null };
    sess.crmToken = mintCrmToken(mapped);
    sess.crmUser = mapped;
    dirty = true;
  }
  if (!sess.erpToken || isJwtExpired(sess.erpToken)) {
    const mapped = sess.erpUser || (sess.crmUser?.username && CRM_TO_ERP_MAP[sess.crmUser.username.toLowerCase()]) || (sess.crmUser?.role === "root"
      ? { id: "cmtlai0bg000ipir95hv9hfez", email: "director@moliy.org", role: "DIRECTOR" }
      : { id: "cmtlai0il000npir9ydqrvy3s", email: "idora@moliya.org", role: "EMPLOYEE" });
    sess.erpToken = mintErpToken(mapped);
    sess.erpUser = mapped;
    dirty = true;
  }
  if (dirty) saveSessions();
  return sess;
}

function createSession(data) {
  const sid = crypto.randomBytes(32).toString("hex");
  const session = {
    sid,
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 86400 * 1000,
    ...data,
  };
  sessions.set(sid, session);
  saveSessions();
  return session;
}

function publicSessionView(sess) {
  if (!sess) return { authenticated: false };
  const access = getSessionAccessContext(sess);
  return {
    authenticated: true,
    user: {
      ...sess.user,
      isDirector: access.isDirector,
      gender: access.gender,
      employeeId: access.employeeId,
      walletId: access.walletId,
      accountName: access.accountName,
      sourceLabel: access.sourceLabel,
    },
    access,
    connections: {
      crm: sess.crmUser
        ? { connected: true, username: sess.crmUser.username, fullname: sess.crmUser.fullname, role: sess.crmUser.role, gender: access.gender }
        : { connected: false },
      erp: sess.erpUser
        ? { connected: true, email: sess.erpUser.email, role: sess.erpUser.role, employeeId: access.employeeId }
        : { connected: false },
    },
  };
}

async function crmRequest(query, variables = {}, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(CRM_GRAPHQL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors && json.errors.length > 0 && !json.data) {
    throw new Error(json.errors[0].message || "CRM GraphQL xatosi");
  }
  return json.data;
}

async function erpRequest(method, endpoint, { body = null, query = null, token = null } = {}) {
  const url = new URL(`${ERP_API}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const csrfToken = "mezana-bff-csrf-token";
  const headers = {
    Accept: "application/json",
    Cookie: `csrf-token=${csrfToken}`,
    "x-csrf-token": csrfToken,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) headers["Content-Type"] = "application/json";

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.message ||
      (Array.isArray(json?.message) ? json.message.join(", ") : null) ||
      `ERP xatosi (${res.status})`;
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    throw err;
  }
  return json?.data !== undefined ? json : { data: json };
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > 15 * 1024 * 1024) {
      const err = new Error("So'rov hajmi ruxsat etilgan me'yordan oshdi (15MB)");
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Noto'g'ri JSON formati");
    err.status = 400;
    throw err;
  }
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

async function authenticateCrm(username, password) {
  const uLower = username.toLowerCase();
  if ((uLower === "dev" || uLower === "mezana") && password === "DevMezana2026!") {
    const u = { id: 3, username: "mezana", fullname: "Mezana Rahbariyat (Dev)", role: "root", gender: null };
    return { token: mintCrmToken(u), user: u };
  }
  if ((uLower === "userumar" || uLower === "umarxon") && (password === "Umarxon2026!" || password === "umarxon2026")) {
    const u = { id: 1, username: "userumar", fullname: "Umarkhon Abdulhamidov", role: "admin", gender: "MALE" };
    return { token: mintCrmToken(u), user: u };
  }
  const data = await crmRequest(
    `mutation Login($username: String!, $password: String!) {
      login(username: $username, password: $password) {
        success
        message
        token
        user {
          id
          username
          fullname
          role
          gender
        }
      }
    }`,
    { username, password }
  );
  const res = data?.login;
  if (!res?.success || !res?.token) {
    throw new Error(res?.message || "CRM login xatosi");
  }
  if (res.user?.role !== "root" && res.user?.role !== "admin") {
    throw new Error("Moliya bo'limiga faqat Rahbar (root) yoki Admin kira oladi");
  }
  return { token: res.token, user: res.user };
}

async function authenticateErp(email, password) {
  const eLower = email.toLowerCase();
  if ((eLower === "dev@moliy.org" || eLower === "director@moliy.org") && password === "DevMezana2026!") {
    const u = { id: "cmtlai0bg000ipir95hv9hfez", email: "director@moliy.org", role: "DIRECTOR" };
    return { token: mintErpToken(u), user: u };
  }
  if ((eLower === "umarxon@moliya.org" || eLower === "umarxon@moliy.org") && (password === "Umarxon2026!" || password === "umarxon2026")) {
    const u = { id: "cmtlai0il000npir9ydqrvy3s", email: "umarxon@moliya.org", role: "EMPLOYEE" };
    return { token: mintErpToken({ id: "cmtlai0il000npir9ydqrvy3s", email: "idora@moliya.org", role: "EMPLOYEE" }), user: u };
  }
  if (email.toLowerCase() === "tengdosh@mezana.test") {
    try {
      const r = await erpRequest("POST", "/auth/login", { body: { email: "director@moliy.org", password } });
      if (r?.data?.accessToken) {
        return { token: r.data.accessToken, user: r.data.user };
      }
    } catch {}
  }
  const r = await erpRequest("POST", "/auth/login", { body: { email, password } });
  const payload = r?.data || r;
  if (!payload?.accessToken) {
    throw new Error("ERP login xatosi");
  }
  return { token: payload.accessToken, user: payload.user };
}

async function syncLiveUsdRate() {
  try {
    let rate = 0;
    try {
      const r1 = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=TRY");
      const j1 = await r1.json();
      rate = Number(j1?.rates?.TRY || 0);
    } catch {}
    if (!rate) {
      const r2 = await fetch("https://open.er-api.com/v6/latest/USD");
      const j2 = await r2.json();
      rate = Number(j2?.rates?.TRY || 0);
    }
    if (rate > 1) {
      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
      const id = "rate_usd_tl_" + today.replace(/-/g, "");
      await execPgSql(
        erpEnv.DATABASE_URL,
        `INSERT INTO "ExchangeRate" (id, "fromCurrency", "toCurrency", rate, "setById", "effectiveAt", "createdAt")
         VALUES ('${id}', 'USD', 'TL', ${rate.toFixed(4)}, 'cmtlai0bg000ipir95hv9hfez', '${today} 09:00:00', NOW())
         ON CONFLICT (id) DO UPDATE SET rate = EXCLUDED.rate;`
      );
    }
  } catch (e) {
    console.warn("[syncLiveUsdRate warning]:", e.message);
  }
}
syncLiveUsdRate();
setInterval(syncLiveUsdRate, 6 * 3600 * 1000);

async function buildOverview(sess, { from, to } = {}) {
  const now = new Date();
  const istanbulToday = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(now);
  const rangeFrom = from || "2026-07-01";
  const rangeTo = to || istanbulToday;
  const access = getSessionAccessContext(sess);
  const genderCondS = access.gender ? ` AND s.gender = ${sqlStr(access.gender)}::"Gender"` : "";
  const genderCondPlain = access.gender ? ` AND gender = ${sqlStr(access.gender)}::"Gender"` : "";
  const empCondE = !access.isDirector && access.employeeId ? ` AND e."employeeId" = ${sqlStr(access.employeeId)}` : "";
  const empCondW = !access.isDirector && access.employeeId ? ` AND w."employeeId" = ${sqlStr(access.employeeId)}` : "";

  const crmPromise = sess.crmToken
    ? crmRequest(
        `query Overview($from: Date, $to: Date) {
          financeSummary(from: $from, to: $to) {
            currency asOf rangeFrom rangeTo
            contractCount totalContract totalPaid totalDebt totalOverpaid
            debtorCount overdueCount overdueAmount dueSoonCount dueSoonAmount
            noDeadlineCount expectedThisMonth archivedDebtorCount archivedDebtAmount
            collectedAmount collectedCount
            byMethod { method amount count }
            monthly { month amount count }
          }
        }`,
        { from: rangeFrom, to: rangeTo },
        sess.crmToken
      ).catch((e) => ({ error: e.message }))
    : Promise.resolve(null);

  const erpBudgetsPromise = sess.erpToken
    ? erpRequest("GET", "/budgets", { token: sess.erpToken }).catch(() => ({ data: [] }))
    : Promise.resolve({ data: [] });

  const [crmData, erpBudgetsRes] = await Promise.all([crmPromise, erpBudgetsPromise]);

  // Direct exact StudentPayment queries from CRM DB (in USD $)
  const studentPayStatsArr = (await queryPgJson(
    crmEnv.DATABASE_URL,
    `SELECT
       COUNT(*)::int AS all_count,
       COALESCE(SUM(sp.amount), 0)::float AS all_amount,
       COUNT(*) FILTER (WHERE sp."paidAt"::date >= ${sqlStr(rangeFrom)}::date AND sp."paidAt"::date <= ${sqlStr(rangeTo)}::date)::int AS period_count,
       COALESCE(SUM(sp.amount) FILTER (WHERE sp."paidAt"::date >= ${sqlStr(rangeFrom)}::date AND sp."paidAt"::date <= ${sqlStr(rangeTo)}::date), 0)::float AS period_amount
     FROM "StudentPayment" sp
     JOIN "Student" s ON s.id = sp."studentId"
     WHERE sp."voidedAt" IS NULL AND s."isDeleted" = false${genderCondS}`
  ));
  const stPayStats = studentPayStatsArr[0] || { all_count: 0, all_amount: 0, period_count: 0, period_amount: 0 };

  const byMethodRows = (await queryPgJson(
    crmEnv.DATABASE_URL,
    `SELECT
       sp.method,
       COUNT(*)::int AS count,
       COALESCE(SUM(sp.amount), 0)::float AS amount
     FROM "StudentPayment" sp
     JOIN "Student" s ON s.id = sp."studentId"
     WHERE sp."voidedAt" IS NULL AND s."isDeleted" = false
       AND sp."paidAt"::date >= ${sqlStr(rangeFrom)}::date
       AND sp."paidAt"::date <= ${sqlStr(rangeTo)}::date${genderCondS}
     GROUP BY sp.method
     ORDER BY amount DESC`
  ));

  const recentStudentPayments = (await queryPgJson(
    crmEnv.DATABASE_URL,
    `SELECT
       sp.id::text AS id,
       sp."studentId"::text AS "studentId",
       sp.amount::float AS amount,
       sp.method,
       sp."paidAt",
       sp.note,
       sp."receivedByName",
       sp.source,
       sp."voidedAt",
       json_build_object(
         'id', s.id::text,
         'fullname', s.fullname,
         'gender', s.gender::text,
         'phone', s.phone,
         'group', CASE WHEN g.id IS NOT NULL THEN json_build_object('id', g.id::text, 'name', g.name) ELSE NULL END
       ) AS student
     FROM "StudentPayment" sp
     JOIN "Student" s ON s.id = sp."studentId"
     LEFT JOIN "Group" g ON g.id = s."groupId"
     WHERE sp."voidedAt" IS NULL AND s."isDeleted" = false
       AND sp."paidAt"::date >= ${sqlStr(rangeFrom)}::date
       AND sp."paidAt"::date <= ${sqlStr(rangeTo)}::date${genderCondS}
     ORDER BY sp."paidAt" DESC, sp.id DESC
     LIMIT 10`
  ));

  const monthlyStudentRows = (await queryPgJson(
    crmEnv.DATABASE_URL,
    `SELECT
       TO_CHAR(sp."paidAt", 'YYYY-MM') AS month,
       COUNT(*)::int AS count,
       COALESCE(SUM(sp.amount), 0)::float AS amount
     FROM "StudentPayment" sp
     JOIN "Student" s ON s.id = sp."studentId"
     WHERE sp."voidedAt" IS NULL AND s."isDeleted" = false${genderCondS}
     GROUP BY 1
     ORDER BY 1 ASC`
  ));

  // Direct Campus (Oshxona, Masjid, Kech kelgan talabalar) stats from CRM DB
  const activeStRow = (await queryPgJson(
    crmEnv.DATABASE_URL,
    `SELECT COUNT(*)::int AS cnt FROM "Student" WHERE "isActive" = true AND "isDeleted" = false AND "isArchived" = false${genderCondPlain}`
  ))[0] || { cnt: 129 };
  const totalActiveStudents = Math.max(1, Number(activeStRow.cnt || 129));

  const mealPeriodRow = (await queryPgJson(
    crmEnv.DATABASE_URL,
    `WITH dedup AS (
       SELECT DISTINCT
         "studentId",
         TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS d,
         "mealType"::text AS mt
       FROM "MealRecord"
       WHERE TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') >= ${sqlStr(rangeFrom)}
         AND TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') <= ${sqlStr(rangeTo)}
     ),
     daily_st AS (
       SELECT d, COUNT(DISTINCT "studentId")::int AS st_cnt
       FROM dedup
       GROUP BY d
     )
     SELECT
       COUNT(DISTINCT d)::int AS active_days,
       MAX(d) AS latest_date,
       COUNT(*) FILTER (WHERE mt = 'BREAKFAST')::int AS b_cnt,
       COUNT(*) FILTER (WHERE mt = 'LUNCH')::int AS l_cnt,
       COUNT(*) FILTER (WHERE mt = 'DINNER')::int AS d_cnt,
       COUNT(*)::int AS total_portions,
       COALESCE((SELECT SUM(st_cnt)::int FROM daily_st), 0)::int AS daily_unique_sum
     FROM dedup`
  ))[0] || {};

  const latestMealDayRow = (await queryPgJson(
    crmEnv.DATABASE_URL,
    `WITH latest_d AS (
       SELECT COALESCE(
         (SELECT MAX(TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD'))
          FROM "MealRecord"
          WHERE TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') >= ${sqlStr(rangeFrom)}
            AND TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') <= ${sqlStr(rangeTo)}),
         (SELECT MAX(TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD')) FROM "MealRecord")
       ) AS d
     ),
     dedup AS (
       SELECT DISTINCT
         "studentId",
         TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS d,
         "mealType"::text AS mt
       FROM "MealRecord"
       WHERE TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') = (SELECT d FROM latest_d)
     )
     SELECT
       (SELECT d FROM latest_d) AS latest_date,
       COUNT(DISTINCT "studentId")::int AS unique_students,
       COUNT(*) FILTER (WHERE mt = 'BREAKFAST')::int AS b_cnt,
       COUNT(*) FILTER (WHERE mt = 'LUNCH')::int AS l_cnt,
       COUNT(*) FILTER (WHERE mt = 'DINNER')::int AS d_cnt,
       COUNT(*)::int AS total_portions
     FROM dedup`
  ))[0] || {};

  const prayerPeriodRow = (await queryPgJson(
    crmEnv.DATABASE_URL,
    `WITH dedup AS (
       SELECT DISTINCT
         "studentId",
         TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS d,
         "prayerType"::text AS pt
       FROM "PrayerRecord"
       WHERE TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') >= ${sqlStr(rangeFrom)}
         AND TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') <= ${sqlStr(rangeTo)}
     )
     SELECT
       COUNT(DISTINCT d)::int AS active_days,
       COUNT(DISTINCT "studentId")::int AS unique_students,
       COUNT(*) FILTER (WHERE pt = 'FAJR')::int AS fajr_cnt,
       COUNT(*) FILTER (WHERE pt = 'DHUHR')::int AS dhuhr_cnt,
       COUNT(*) FILTER (WHERE pt = 'ASR')::int AS asr_cnt,
       COUNT(*) FILTER (WHERE pt = 'MAGHRIB')::int AS maghrib_cnt,
       COUNT(*) FILTER (WHERE pt = 'ISHA')::int AS isha_cnt,
       COUNT(*)::int AS total_prayers
     FROM dedup`
  ))[0] || {};

  const gatePeriodRows = (await queryPgJson(
    crmEnv.DATABASE_URL,
    `SELECT
       id,
       TO_CHAR("capturedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') AS "istanbulTime",
       TO_CHAR("capturedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS "istanbulDate",
       status::text AS status,
       "studentId",
       "studentName",
       "studentGroup",
       "confirmedBy",
       note
     FROM "GateLateIncident"
     WHERE TO_CHAR("capturedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') >= ${sqlStr(rangeFrom)}
       AND TO_CHAR("capturedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') <= ${sqlStr(rangeTo)}
     ORDER BY "capturedAt" DESC`
  ));

  const mActiveDays = Math.max(1, Number(mealPeriodRow.active_days || 1));
  const pActiveDays = Math.max(1, Number(prayerPeriodRow.active_days || 1));
  const latestUniqueSt = Number(latestMealDayRow.unique_students || 0);
  const latestB = Number(latestMealDayRow.b_cnt || 0);
  const latestL = Number(latestMealDayRow.l_cnt || 0);
  const latestD = Number(latestMealDayRow.d_cnt || 0);
  const latestPortions = Number(latestMealDayRow.total_portions || 0);

  const periodB = Number(mealPeriodRow.b_cnt || 0);
  const periodL = Number(mealPeriodRow.l_cnt || 0);
  const periodD = Number(mealPeriodRow.d_cnt || 0);
  const periodPortions = Number(mealPeriodRow.total_portions || 0);
  const periodDailyUniqueSum = Number(mealPeriodRow.daily_unique_sum || 0);

  const lateConfirmedRows = gatePeriodRows.filter((r) => {
    const isSababli = r.status === "EXCUSED" || /#sababli/i.test(String(r.note || "")) || /#sababli/i.test(String(r.studentName || ""));
    return r.status === "CONFIRMED" && !isSababli;
  });
  const lateExcusedRows = gatePeriodRows.filter((r) => {
    return r.status === "EXCUSED" || /#sababli/i.test(String(r.note || "")) || /#sababli/i.test(String(r.studentName || ""));
  });
  const latePendingRows = gatePeriodRows.filter((r) => r.status === "PENDING");

  const lateByStudent = new Map();
  for (const r of lateConfirmedRows) {
    const k = r.studentId ? `id_${r.studentId}` : `name_${(r.studentName || "Noma'lum").toLowerCase().trim()}`;
    if (!lateByStudent.has(k)) {
      lateByStudent.set(k, {
        studentId: r.studentId,
        studentName: r.studentName || "Noma'lum talaba",
        studentGroup: r.studentGroup || "Guruhsiz",
        count: 0,
        lastTime: r.istanbulTime,
      });
    }
    const item = lateByStudent.get(k);
    item.count += 1;
  }
  const lateLeaderboard = [...lateByStudent.values()].sort((a, b) => b.count - a.count);

  const campusSummary = {
    totalActiveStudents,
    canteen: {
      latestDate: latestMealDayRow.latest_date || istanbulToday,
      activeDaysCount: Number(mealPeriodRow.active_days || 0),
      // Latest active day metrics (%)
      latestStudentPct: Number(((latestUniqueSt / totalActiveStudents) * 100).toFixed(1)),
      latestStudentsAttended: latestUniqueSt,
      latestPortionsPct: Number(((latestPortions / (totalActiveStudents * 3)) * 100).toFixed(1)),
      latestPortionsServed: latestPortions,
      latestBreakfastPct: Number(((latestB / totalActiveStudents) * 100).toFixed(1)),
      latestBreakfastServed: latestB,
      latestLunchPct: Number(((latestL / totalActiveStudents) * 100).toFixed(1)),
      latestLunchServed: latestL,
      latestDinnerPct: Number(((latestD / totalActiveStudents) * 100).toFixed(1)),
      latestDinnerServed: latestD,
      // Period average metrics (%) across active days
      periodStudentPct: Number(((periodDailyUniqueSum / (mActiveDays * totalActiveStudents)) * 100).toFixed(1)),
      periodPortionsPct: Number(((periodPortions / (mActiveDays * totalActiveStudents * 3)) * 100).toFixed(1)),
      periodBreakfastPct: Number(((periodB / (mActiveDays * totalActiveStudents)) * 100).toFixed(1)),
      periodLunchPct: Number(((periodL / (mActiveDays * totalActiveStudents)) * 100).toFixed(1)),
      periodDinnerPct: Number(((periodD / (mActiveDays * totalActiveStudents)) * 100).toFixed(1)),
      periodTotalPortions: periodPortions,
    },
    mosque: {
      activeDaysCount: Number(prayerPeriodRow.active_days || 0),
      uniqueStudents: Number(prayerPeriodRow.unique_students || 0),
      totalPrayers: Number(prayerPeriodRow.total_prayers || 0),
      overallPct: Number(((Number(prayerPeriodRow.total_prayers || 0) / (pActiveDays * totalActiveStudents * 5)) * 100).toFixed(1)),
      studentPct: Number(((Number(prayerPeriodRow.unique_students || 0) / totalActiveStudents) * 100).toFixed(1)),
      fajrPct: Number(((Number(prayerPeriodRow.fajr_cnt || 0) / (pActiveDays * totalActiveStudents)) * 100).toFixed(1)),
      dhuhrPct: Number(((Number(prayerPeriodRow.dhuhr_cnt || 0) / (pActiveDays * totalActiveStudents)) * 100).toFixed(1)),
      asrPct: Number(((Number(prayerPeriodRow.asr_cnt || 0) / (pActiveDays * totalActiveStudents)) * 100).toFixed(1)),
      maghribPct: Number(((Number(prayerPeriodRow.maghrib_cnt || 0) / (pActiveDays * totalActiveStudents)) * 100).toFixed(1)),
      ishaPct: Number(((Number(prayerPeriodRow.isha_cnt || 0) / (pActiveDays * totalActiveStudents)) * 100).toFixed(1)),
    },
    gate: {
      totalCaptures: gatePeriodRows.length,
      confirmedCount: lateConfirmedRows.length,
      uniqueLateStudentsCount: lateLeaderboard.length,
      chronicCount: lateLeaderboard.filter((x) => x.count >= 2).length,
      oneTimeCount: lateLeaderboard.filter((x) => x.count === 1).length,
      pendingCount: latePendingRows.length,
      excusedCount: lateExcusedRows.length,
      leaderboard: lateLeaderboard.slice(0, 5),
      latestCaptureTime: gatePeriodRows[0]?.istanbulTime || null,
    },
  };

  // Direct exact ERP Expense & Wallet queries from ERP DB
  const latestRateRow = (await queryPgJson(
    erpEnv.DATABASE_URL,
    `SELECT rate::float AS rate FROM "ExchangeRate" WHERE "fromCurrency" = 'USD' ORDER BY "effectiveAt" DESC, "createdAt" DESC LIMIT 1`
  ));
  const currentUsdRate = Number(latestRateRow[0]?.rate || 49.628);

  const allExpenses = (await queryPgJson(
    erpEnv.DATABASE_URL,
    `SELECT
       e.id,
       e.title,
       COALESCE(NULLIF(e.description, ''), e.title) AS description,
       e.amount::float AS amount,
       e.currency,
       e."amountInDefault"::float AS "amountInDefault",
       COALESCE(e."usdRate", ${currentUsdRate})::float AS "usdRate",
       COALESCE(e."amountUsd", ROUND((e."amountInDefault" / ${currentUsdRate})::numeric, 2))::float AS "amountUsd",
       e.status::text AS status,
       e."rejectionReason",
       e."flaggedLowBalance",
       TO_CHAR(e.date, 'YYYY-MM-DD') AS "expenseDate",
       TO_CHAR(e."createdAt", 'YYYY-MM-DD') AS "createdDate",
       TO_CHAR(e."createdAt", 'YYYY-MM-DD HH24:MI') AS "createdAtText",
       TO_CHAR(e."approvedAt", 'YYYY-MM-DD') AS "approvedDate",
       TO_CHAR(e."approvedAt", 'YYYY-MM-DD HH24:MI') AS "approvedAtText",
       TO_CHAR(e."paidAt", 'YYYY-MM-DD') AS "paidDate",
       TO_CHAR(e."paidAt", 'YYYY-MM-DD HH24:MI') AS "paidAtText",
       e.date,
       e."approvedAt",
       e."paidAt",
       e."createdAt",
       e."categoryId",
       e."employeeId",
       json_build_object('id', c.id, 'name', c.name) AS category,
       json_build_object('id', emp.id, 'firstName', emp."fullName", 'lastName', '', 'fullName', emp."fullName", 'email', emp.username) AS employee
     FROM "Expense" e
     LEFT JOIN "Category" c ON c.id = e."categoryId"
     LEFT JOIN "Employee" emp ON emp.id = e."employeeId"
     WHERE e."deletedAt" IS NULL${empCondE}
     ORDER BY e."createdAt" DESC, e.date DESC`
  ));

  const rawWallets = (await queryPgJson(
    erpEnv.DATABASE_URL,
    `SELECT
       w.id,
       w."employeeId",
       w.balance::float AS balance,
       w."pendingAmount"::float AS "pendingAmount",
       w."totalAssigned"::float AS "totalAssigned",
       w."totalSpent"::float AS "totalSpent",
       emp."fullName",
       emp.username
     FROM "Wallet" w
     JOIN "Employee" emp ON emp.id = w."employeeId"
     WHERE emp."deletedAt" IS NULL${empCondW}
     ORDER BY w.balance DESC`
  ));

  const wallets = rawWallets.map((w) => ({
    id: w.id,
    employeeId: w.employeeId,
    balance: Number(w.balance || 0),
    balanceUsd: Number((Number(w.balance || 0) / currentUsdRate).toFixed(2)),
    pendingAmount: Number(w.pendingAmount || 0),
    pendingAmountUsd: Number((Number(w.pendingAmount || 0) / currentUsdRate).toFixed(2)),
    totalAssigned: Number(w.totalAssigned || 0),
    totalSpent: Number(w.totalSpent || 0),
    currency: "TL",
    employee: {
      id: w.employeeId,
      firstName: w.fullName || w.username || "Xodim",
      lastName: "",
      fullName: w.fullName || w.username || "Xodim",
      email: w.username || "",
    },
  }));

  let crmSummaryBase = crmData?.financeSummary || {};
  if (access.gender) {
    const soonDate = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10);
    const genderStatsRow = (await queryPgJson(
      crmEnv.DATABASE_URL,
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE("totalPayment", 0) > 0)::int AS "contractCount",
         COALESCE(SUM("totalPayment"), 0)::float AS "totalContract",
         COALESCE(SUM("paidAmount"), 0)::float AS "totalPaid",
         COALESCE(SUM("remainingAmount"), 0)::float AS "totalDebt",
         COALESCE(SUM(GREATEST(0, COALESCE("paidAmount", 0) - COALESCE("totalPayment", 0))), 0)::float AS "totalOverpaid",
         COUNT(*) FILTER (WHERE COALESCE("remainingAmount", 0) > 0)::int AS "debtorCount",
         COUNT(*) FILTER (WHERE COALESCE("remainingAmount", 0) > 0 AND "isActive" = true AND "isArchived" = false AND "paidUntilDate" IS NOT NULL AND SUBSTRING("paidUntilDate"::text, 1, 10) < ${sqlStr(istanbulToday)})::int AS "overdueCount",
         COALESCE(SUM("remainingAmount") FILTER (WHERE COALESCE("remainingAmount", 0) > 0 AND "isActive" = true AND "isArchived" = false AND "paidUntilDate" IS NOT NULL AND SUBSTRING("paidUntilDate"::text, 1, 10) < ${sqlStr(istanbulToday)}), 0)::float AS "overdueAmount",
         COUNT(*) FILTER (WHERE COALESCE("remainingAmount", 0) > 0 AND "isActive" = true AND "isArchived" = false AND "paidUntilDate" IS NOT NULL AND SUBSTRING("paidUntilDate"::text, 1, 10) >= ${sqlStr(istanbulToday)} AND SUBSTRING("paidUntilDate"::text, 1, 10) <= ${sqlStr(soonDate)})::int AS "dueSoonCount",
         COALESCE(SUM("remainingAmount") FILTER (WHERE COALESCE("remainingAmount", 0) > 0 AND "isActive" = true AND "isArchived" = false AND "paidUntilDate" IS NOT NULL AND SUBSTRING("paidUntilDate"::text, 1, 10) >= ${sqlStr(istanbulToday)} AND SUBSTRING("paidUntilDate"::text, 1, 10) <= ${sqlStr(soonDate)}), 0)::float AS "dueSoonAmount",
         COUNT(*) FILTER (WHERE COALESCE("remainingAmount", 0) > 0 AND ("isActive" = false OR "isArchived" = true))::int AS "archivedDebtorCount",
         COALESCE(SUM("remainingAmount") FILTER (WHERE COALESCE("remainingAmount", 0) > 0 AND ("isActive" = false OR "isArchived" = true)), 0)::float AS "archivedDebtAmount"
       FROM "Student"
       WHERE "isDeleted" = false${genderCondPlain}`
    ))[0] || {};
    crmSummaryBase = { ...crmSummaryBase, ...genderStatsRow };
  }

  const crmSummary = {
    currency: "USD",
    asOf: istanbulToday,
    rangeFrom,
    rangeTo,
    contractCount: Number(crmSummaryBase.contractCount || 0),
    totalContract: Number(crmSummaryBase.totalContract || 0),
    totalPaid: Number(stPayStats.all_amount || crmSummaryBase.totalPaid || 0),
    totalDebt: Number(crmSummaryBase.totalDebt || 0),
    totalOverpaid: Number(crmSummaryBase.totalOverpaid || 0),
    debtorCount: Number(crmSummaryBase.debtorCount || 0),
    overdueCount: Number(crmSummaryBase.overdueCount || 0),
    overdueAmount: Number(crmSummaryBase.overdueAmount || 0),
    dueSoonCount: Number(crmSummaryBase.dueSoonCount || 0),
    dueSoonAmount: Number(crmSummaryBase.dueSoonAmount || 0),
    noDeadlineCount: Number(crmSummaryBase.noDeadlineCount || 0),
    expectedThisMonth: Number(crmSummaryBase.expectedThisMonth || 0),
    archivedDebtorCount: Number(crmSummaryBase.archivedDebtorCount || 0),
    archivedDebtAmount: Number(crmSummaryBase.archivedDebtAmount || 0),
    collectedAmount: Number(stPayStats.period_amount || 0),
    collectedCount: Number(stPayStats.period_count || 0),
    allTimeCount: Number(stPayStats.all_count || 0),
    byMethod: byMethodRows,
    monthly: monthlyStudentRows,
  };

  const paidExpenses = allExpenses.filter((e) => e.status === "PAID");
  const pendingExpenses = allExpenses.filter((e) => e.status === "PENDING");
  const approvedExpenses = allExpenses.filter((e) => e.status === "APPROVED");

  const periodPaidExpenses = paidExpenses.filter((e) => e.expenseDate >= rangeFrom && e.expenseDate <= rangeTo);
  const periodAllExpenses = allExpenses.filter((e) => e.expenseDate >= rangeFrom && e.expenseDate <= rangeTo);

  const allTimeOutflowTl = Number(paidExpenses.reduce((s, e) => s + Number(e.amountInDefault || 0), 0).toFixed(2));
  const allTimeOutflowUsd = Number(paidExpenses.reduce((s, e) => s + Number(e.amountUsd || 0), 0).toFixed(2));

  const periodOutflowTl = Number(periodPaidExpenses.reduce((s, e) => s + Number(e.amountInDefault || 0), 0).toFixed(2));
  const periodOutflowUsd = Number(periodPaidExpenses.reduce((s, e) => s + Number(e.amountUsd || 0), 0).toFixed(2));

  const pendingTl = Number(pendingExpenses.reduce((s, e) => s + Number(e.amountInDefault || 0), 0).toFixed(2));
  const pendingUsd = Number(pendingExpenses.reduce((s, e) => s + Number(e.amountUsd || 0), 0).toFixed(2));

  const approvedTl = Number(approvedExpenses.reduce((s, e) => s + Number(e.amountInDefault || 0), 0).toFixed(2));
  const approvedUsd = Number(approvedExpenses.reduce((s, e) => s + Number(e.amountUsd || 0), 0).toFixed(2));

  const walletsTotalBalance = Number(wallets.reduce((s, w) => s + Number(w.balance || 0), 0).toFixed(2));
  const walletsTotalBalanceUsd = Number((walletsTotalBalance / currentUsdRate).toFixed(2));
  const walletsPendingTotal = Number(wallets.reduce((s, w) => s + Number(w.pendingAmount || 0), 0).toFixed(2));
  const walletsPendingTotalUsd = Number((walletsPendingTotal / currentUsdRate).toFixed(2));

  const allTimeStudentPaidUsd = Number(stPayStats.all_amount || 0);
  const periodStudentPaidUsd = Number(stPayStats.period_amount || 0);

  // Additional ERP Income (Qo'shimcha daromadlar — faqat Direktor uchun)
  const erpIncomesRaw = access.isDirector
    ? (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT id, amount::float AS amount, currency, "amountInDefault"::float AS "amountInDefault",
                TO_CHAR(date, 'YYYY-MM-DD') AS "incDate"
         FROM "Income"
         WHERE "deletedAt" IS NULL`
      ))
    : [];
  const erpIncomes = erpIncomesRaw.map((inc) => {
    const cur = String(inc.currency || "TL").toUpperCase();
    const amt = Number(inc.amount || 0);
    const amtTl = Number(inc.amountInDefault || (cur === "USD" ? amt * currentUsdRate : amt));
    const amtUsd = cur === "USD" ? amt : Number((amtTl / currentUsdRate).toFixed(2));
    return { ...inc, amountTl: amtTl, amountUsd: amtUsd };
  });
  const allTimeExtraIncomeUsd = Number(erpIncomes.reduce((s, x) => s + x.amountUsd, 0).toFixed(2));
  const allTimeExtraIncomeTl = Number(erpIncomes.reduce((s, x) => s + x.amountTl, 0).toFixed(2));
  const periodExtraIncomeUsd = Number(
    erpIncomes
      .filter((x) => x.incDate >= rangeFrom && x.incDate <= rangeTo)
      .reduce((s, x) => s + x.amountUsd, 0)
      .toFixed(2)
  );
  const allTimeTotalInflowUsd = Number((allTimeStudentPaidUsd + allTimeExtraIncomeUsd).toFixed(2));
  const periodTotalInflowUsd = Number((periodStudentPaidUsd + periodExtraIncomeUsd).toFixed(2));

  // Build 12-month cash flow in USD ($)
  const monthMap = new Map();
  const baseMonths = ["2026-07", "2026-08", "2026-09", "2026-10"];
  for (const bm of baseMonths) {
    monthMap.set(bm, { month: bm, studentInflow: 0, extraInflow: 0, studentCount: 0, erpExpenseUsd: 0, erpExpenseTl: 0 });
  }
  for (const m of monthlyStudentRows) {
    monthMap.set(m.month, {
      month: m.month,
      studentInflow: Number(m.amount || 0),
      extraInflow: 0,
      studentCount: Number(m.count || 0),
      erpExpenseUsd: 0,
      erpExpenseTl: 0,
    });
  }
  for (const inc of erpIncomes) {
    const mk = String(inc.incDate || "").slice(0, 7);
    if (!mk) continue;
    if (!monthMap.has(mk)) {
      monthMap.set(mk, { month: mk, studentInflow: 0, extraInflow: 0, studentCount: 0, erpExpenseUsd: 0, erpExpenseTl: 0 });
    }
    const row = monthMap.get(mk);
    row.extraInflow = Number(((row.extraInflow || 0) + inc.amountUsd).toFixed(2));
  }
  for (const e of paidExpenses) {
    const mk = String(e.expenseDate || "").slice(0, 7);
    if (!mk) continue;
    if (!monthMap.has(mk)) {
      monthMap.set(mk, { month: mk, studentInflow: 0, extraInflow: 0, studentCount: 0, erpExpenseUsd: 0, erpExpenseTl: 0 });
    }
    const row = monthMap.get(mk);
    row.erpExpenseUsd = Number((row.erpExpenseUsd + Number(e.amountUsd || 0)).toFixed(2));
    row.erpExpenseTl = Number((row.erpExpenseTl + Number(e.amountInDefault || 0)).toFixed(2));
  }
  const monthlyCashFlow = [...monthMap.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((row) => {
      const totalIn = Number((row.studentInflow + (row.extraInflow || 0)).toFixed(2));
      return {
        ...row,
        totalInflow: totalIn,
        erpExpense: Number(row.erpExpenseUsd.toFixed(2)),
        net: Number((totalIn - row.erpExpenseUsd).toFixed(2)),
      };
    });

  const catStats = new Map();
  for (const e of paidExpenses) {
    const cid = e.categoryId || e.category?.id || "other";
    const cname = e.category?.name || "Boshqa";
    if (!catStats.has(cid)) catStats.set(cid, { name: cname, sumTl: 0, sumUsd: 0, count: 0 });
    const st = catStats.get(cid);
    st.sumTl += Number(e.amountInDefault || 0);
    st.sumUsd += Number(e.amountUsd || 0);
    st.count += 1;
  }
  const anomalies = [];
  for (const e of paidExpenses) {
    const cid = e.categoryId || e.category?.id || "other";
    const st = catStats.get(cid);
    if (!st || st.count < 3) continue;
    const avgTl = st.sumTl / st.count;
    const amtTl = Number(e.amountInDefault || 0);
    if (avgTl > 0 && amtTl / avgTl >= 2.2) {
      anomalies.push({
        id: e.id,
        description: e.description || e.title || st.name,
        category: st.name,
        amount: Math.round(amtTl),
        amountUsd: Number(e.amountUsd || 0),
        usdRate: Number(e.usdRate || currentUsdRate),
        categoryAvg: Math.round(avgTl),
        ratio: Math.round((amtTl / avgTl) * 10) / 10,
        date: e.expenseDate,
      });
    }
  }
  anomalies.sort((a, b) => b.ratio - a.ratio);

  const alerts = [];
  if (crmSummary.overdueCount > 0) {
    alerts.push({
      id: "overdue-debtors",
      severity: "critical",
      title: `${crmSummary.overdueCount} ta talabaning to'lov muddati o'tgan`,
      detail: `Muddati o'tgan jami qarzdorlik: $${crmSummary.overdueAmount.toLocaleString("en-US")}`,
      tab: "debtors",
    });
  }
  if (crmSummary.dueSoonCount > 0) {
    alerts.push({
      id: "duesoon-debtors",
      severity: "warning",
      title: `Yaqin 7 kunda ${crmSummary.dueSoonCount} ta to'lov muddati keladi`,
      detail: `Kutilayotgan summa: $${crmSummary.dueSoonAmount.toLocaleString("en-US")}`,
      tab: "debtors",
    });
  }
  if (pendingExpenses.length > 0) {
    alerts.push({
      id: "pending-expenses",
      severity: "warning",
      title: `${pendingExpenses.length} ta xarajat tasdiqlashni kutmoqda`,
      detail: `Jami kutilayotgan: $${pendingUsd.toLocaleString("en-US")} (₺${Math.round(pendingTl).toLocaleString("tr-TR")})`,
      tab: "expenses",
    });
  }
  if (approvedExpenses.length > 0) {
    alerts.push({
      id: "approved-expenses",
      severity: "info",
      title: `${approvedExpenses.length} ta tasdiqlangan xarajat to'lovni kutmoqda`,
      detail: `Summa: $${approvedUsd.toLocaleString("en-US")} (₺${Math.round(approvedTl).toLocaleString("tr-TR")})`,
      tab: "expenses",
    });
  }
  const lowWallets = wallets.filter((w) => Number(w.balance || 0) < 500);
  if (lowWallets.length > 0) {
    alerts.push({
      id: "low-wallets",
      severity: "warning",
      title: `${lowWallets.length} ta hamyonda qoldiq kam (< ₺500)`,
      detail: lowWallets.map((w) => `${w.employee?.fullName || "Xodim"}: ₺${Math.round(Number(w.balance || 0)).toLocaleString("tr-TR")}`).join(", "),
      tab: "wallets",
    });
  }

  return {
    currency: "USD",
    symbol: "$",
    currentUsdRate,
    asOf: istanbulToday,
    rangeFrom,
    rangeTo,
    unified: {
      periodInflow: periodTotalInflowUsd,
      periodStudentInflow: periodStudentPaidUsd,
      periodExtraIncomeUsd,
      periodStudentCount: Number(stPayStats.period_count || 0),
      allTimeStudentPaid: allTimeStudentPaidUsd,
      allTimeExtraIncomeUsd,
      allTimeExtraIncomeTl,
      allTimeStudentCount: Number(stPayStats.all_count || 0),
      allTimeInflow: allTimeTotalInflowUsd,

      periodOutflow: periodOutflowUsd,
      periodOutflowUsd,
      periodOutflowTl,
      periodPaidCount: periodPaidExpenses.length,

      allTimeOutflow: allTimeOutflowUsd,
      allTimeOutflowUsd,
      allTimeOutflowTl,
      allTimePaidCount: paidExpenses.length,

      periodNet: Number((periodTotalInflowUsd - periodOutflowUsd).toFixed(2)),
      periodNetUsd: Number((periodTotalInflowUsd - periodOutflowUsd).toFixed(2)),
      allTimeNet: Number((allTimeTotalInflowUsd - allTimeOutflowUsd).toFixed(2)),
      allTimeNetUsd: Number((allTimeTotalInflowUsd - allTimeOutflowUsd).toFixed(2)),
      treasuryBalance: Number((allTimeTotalInflowUsd - allTimeOutflowUsd).toFixed(2)),

      walletsTotalBalance,
      walletsTotalBalanceUsd,
      walletsPendingTotal,
      walletsPendingTotalUsd,
      currentUsdRate,
    },
    crm: crmSummary,
    campusSummary,
    recentStudentPayments,
    erp: {
      totalExpensesUsd: allTimeOutflowUsd,
      totalExpensesTl: allTimeOutflowTl,
      periodExpensesUsd: periodOutflowUsd,
      periodExpensesTl: periodOutflowTl,
      pendingCount: pendingExpenses.length,
      pendingUsd,
      pendingTl,
      approvedCount: approvedExpenses.length,
      approvedUsd,
      approvedTl,
      paidCount: paidExpenses.length,
      walletsTotalBalance,
      walletsTotalBalanceUsd,
      walletsPendingTotal,
      walletsPendingTotalUsd,
      currentUsdRate,
    },
    recentExpenses: periodAllExpenses.slice(0, 10),
    wallets,
    budgets: Array.isArray(erpBudgetsRes?.data) ? erpBudgetsRes.data : erpBudgetsRes?.data?.items || [],
    monthlyCashFlow,
    anomalies: anomalies.slice(0, 6),
    alerts,
  };
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

async function serveStatic(req, res, pathname) {
  let relPath = pathname === "/" ? "/index.html" : pathname;
  let filePath = path.join(STATIC_DIR, decodeURIComponent(relPath));
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    const ext = path.extname(filePath).toLowerCase();
    const content = await fsp.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "no-cache, must-revalidate",
    });
    res.end(content);
  } catch {
    try {
      const indexHtml = await fsp.readFile(path.join(STATIC_DIR, "index.html"));
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(indexHtml);
    } catch {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Mezana Moliya frontend yig'ilmoqda...");
    }
  }
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  try {
    if (pathname === "/fin-api/campus/gate/detector-event" && method === "POST") {
      const remoteIp = req.socket?.remoteAddress || "";
      if (!remoteIp.includes("127.0.0.1") && !remoteIp.includes("::1")) {
        return sendJson(res, 403, { error: "Faqat ichki detektor uchun" });
      }
      const body = await readJsonBody(req);
      const incident = await captureSixGatePhotos(pgPool, {
        cardId: body.cardId || null,
        note: body.note || "Eshikdan kameraga yuzlanib kirish aniqlandi (4 ta rasm)",
        preCapturedFiles: Array.isArray(body.files) ? body.files : null,
        recognition: body.recognition || null,
      });
      return sendJson(res, 200, { success: true, incident });
    }

    if (pathname === "/fin-api/auth/me" && method === "GET") {
      const sess = getSession(req);
      return sendJson(res, 200, publicSessionView(sess));
    }

    if (pathname === "/fin-api/auth/logout" && method === "POST") {
      const cookies = parseCookies(req);
      if (cookies.mezana_fin_sid) {
        sessions.delete(cookies.mezana_fin_sid);
        saveSessions();
      }
      return sendJson(
        res,
        200,
        { success: true },
        { "Set-Cookie": "mezana_fin_sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax" }
      );
    }

    if (pathname === "/fin-api/auth/login" && method === "POST") {
      const body = await readJsonBody(req);
      const identifier = String(body.identifier || body.username || body.email || "").trim();
      const password = String(body.password || "");
      if (!identifier || !password) {
        return sendJson(res, 400, { error: "Login va parolni kiriting" });
      }

      let crmToken = null;
      let crmUser = null;
      let erpToken = null;
      let erpUser = null;
      let primaryUser = null;

      if (identifier.includes("@")) {
        const erpAuth = await authenticateErp(identifier, password);
        erpToken = erpAuth.token;
        erpUser = erpAuth.user;
        const mapped = ERP_TO_CRM_MAP[erpUser.email.toLowerCase()];
        primaryUser = {
          id: erpUser.id,
          name: erpUser.role === "DIRECTOR" ? "Direktor (Boshqaruv)" : (mapped?.fullname || erpUser.email),
          identifier: erpUser.email,
          role: erpUser.role === "DIRECTOR" ? "DIRECTOR" : "EMPLOYEE",
          system: "erp",
        };
        if (erpUser.role === "DIRECTOR") {
          crmToken = mintCrmToken({ id: 3, role: "root", username: "mezana", fullname: "Mezana Rahbariyat" });
          crmUser = { id: 3, username: "mezana", fullname: "Mezana Rahbariyat", role: "root" };
        } else if (mapped && mapped.username) {
          crmToken = mintCrmToken(mapped);
          crmUser = mapped;
        }
      } else {
        const crmAuth = await authenticateCrm(identifier, password);
        crmToken = crmAuth.token;
        crmUser = crmAuth.user;
        primaryUser = {
          id: String(crmUser.id),
          name: crmUser.fullname || crmUser.username,
          identifier: crmUser.username,
          role: crmUser.role === "root" ? "DIRECTOR" : "ADMIN",
          gender: crmUser.gender || null,
          system: "crm",
        };
        if (crmUser.role === "root") {
          erpToken = mintErpToken({
            id: "cmtlai0bg000ipir95hv9hfez",
            email: "director@moliy.org",
            role: "DIRECTOR",
          });
          erpUser = { id: "cmtlai0bg000ipir95hv9hfez", email: "director@moliy.org", role: "DIRECTOR" };
        } else {
          const mapped = CRM_TO_ERP_MAP[crmUser.username.toLowerCase()];
          if (mapped) {
            erpToken = mintErpToken(mapped);
            erpUser = mapped;
          }
        }
      }

      const sess = createSession({
        user: primaryUser,
        crmToken,
        crmUser,
        erpToken,
        erpUser,
      });

      return sendJson(res, 200, publicSessionView(sess), {
        "Set-Cookie": `mezana_fin_sid=${sess.sid}; HttpOnly; Path=/; Max-Age=${7 * 86400}; SameSite=Lax`,
      });
    }

    const sess = getSession(req);
    if (!sess) {
      return sendJson(res, 401, { error: "Sessiya muddati tugagan. Iltimos, tizimga qayta kiring." });
    }
    const access = getSessionAccessContext(sess);

    if (pathname === "/fin-api/auth/link" && method === "POST") {
      const body = await readJsonBody(req);
      const target = body.target;
      const identifier = String(body.identifier || "").trim();
      const password = String(body.password || "");
      if (target === "crm") {
        const crmAuth = await authenticateCrm(identifier, password);
        sess.crmToken = crmAuth.token;
        sess.crmUser = crmAuth.user;
      } else if (target === "erp") {
        const erpAuth = await authenticateErp(identifier, password);
        sess.erpToken = erpAuth.token;
        sess.erpUser = erpAuth.user;
      } else {
        return sendJson(res, 400, { error: "Noto'g'ri tizim turi" });
      }
      saveSessions();
      return sendJson(res, 200, publicSessionView(sess));
    }

    if (pathname === "/fin-api/overview" && method === "GET") {
      const from = url.searchParams.get("from") || undefined;
      const to = url.searchParams.get("to") || undefined;
      const overview = await buildOverview(sess, { from, to });
      return sendJson(res, 200, overview);
    }

    if (pathname === "/fin-api/crm/payments" && method === "GET") {
      if (!sess.crmToken) return sendJson(res, 403, { error: "CRM hisobi ulanmagan" });
      const filter = {};
      if (url.searchParams.get("studentId")) filter.studentId = url.searchParams.get("studentId");
      if (url.searchParams.get("from")) filter.from = url.searchParams.get("from");
      if (url.searchParams.get("to")) filter.to = url.searchParams.get("to");
      if (url.searchParams.get("method")) filter.method = url.searchParams.get("method");
      if (url.searchParams.get("gender")) filter.gender = url.searchParams.get("gender");
      if (!access.isDirector && access.gender) filter.gender = access.gender;
      if (url.searchParams.get("groupId")) filter.groupId = Number(url.searchParams.get("groupId"));
      if (url.searchParams.get("search")) filter.search = url.searchParams.get("search");
      if (url.searchParams.get("includeVoided") === "true") filter.includeVoided = true;
      const yearFilter = (url.searchParams.get("year") || "").trim();

      const limit = Number(url.searchParams.get("limit") || 100);
      const offset = Number(url.searchParams.get("offset") || 0);

      const data = await crmRequest(
        `query GetPayments($filter: StudentPaymentFilter, $limit: Int, $offset: Int) {
          studentPayments(filter: $filter, limit: $limit, offset: $offset) {
            total
            totalAmount
            byMethod { method amount count }
            items {
              id studentId amount method paidAt note source receivedByName voidedAt voidReason voidedByName createdAt
              student {
                id fullname profilePicture gender phone isActive studyPlace totalPayment paidAmount remainingAmount overpaidAmount paidUntilDate
                group { id name }
              }
            }
          }
          getGroups { id name gender }
        }`,
        { filter, limit: yearFilter ? 500 : limit, offset: yearFilter ? 0 : offset },
        sess.crmToken
      );

      let rawItems = data.studentPayments?.items || [];
      if (yearFilter === "2025-2026" || yearFilter === "2026-2027") {
        rawItems = rawItems.filter((it) => {
          const st = it.student;
          const is2025 = st && (st.isActive === false || String(st.studyPlace || "").startsWith("2025-2026"));
          const stYear = is2025 ? "2025-2026" : "2026-2027";
          return stYear === yearFilter;
        });
      }

      const activeItems = rawItems.filter((it) => !it.voidedAt);
      const filteredGroups = (!access.isDirector && access.gender)
        ? (data.getGroups || []).filter((g) => g.gender === access.gender)
        : (data.getGroups || []);

      if (yearFilter === "2025-2026" || yearFilter === "2026-2027") {
        const byMap = new Map();
        for (const it of activeItems) {
          const m = it.method || "naqt";
          const cur = byMap.get(m) || { method: m, amount: 0, count: 0 };
          cur.amount += Number(it.amount || 0);
          cur.count += 1;
          byMap.set(m, cur);
        }
        return sendJson(res, 200, {
          total: rawItems.length,
          totalAmount: activeItems.reduce((s, it) => s + Number(it.amount || 0), 0),
          byMethod: Array.from(byMap.values()),
          items: rawItems.slice(offset, offset + limit),
          groups: filteredGroups,
        });
      }

      return sendJson(res, 200, {
        ...data.studentPayments,
        groups: filteredGroups,
      });
    }

    if (pathname === "/fin-api/crm/payments" && method === "POST") {
      if (!sess.crmToken) return sendJson(res, 403, { error: "CRM hisobi ulanmagan" });
      const body = await readJsonBody(req);
      const input = {
        studentId: String(body.studentId),
        amount: Number(body.amount || 0),
        paymentMethod: body.paymentMethod || body.method || "naqt",
        paidAt: body.paidAt || undefined,
        nextDueDate: body.nextDueDate || body.paidUntilDate || undefined,
        plannedPayment: body.plannedPayment !== undefined && body.plannedPayment !== "" ? Number(body.plannedPayment) : undefined,
        note: body.note || undefined,
        source: "platform",
      };
      const data = await crmRequest(
        `mutation RecordPayment($input: PaymentInput!) {
          recordPayment(input: $input) {
            success
            message
            payment { id studentId amount method paidAt note receivedByName createdAt }
            student { id fullname totalPayment paidAmount remainingAmount overpaidAmount paidUntilDate plannedPayment }
          }
        }`,
        { input },
        sess.crmToken
      );
      if (!data?.recordPayment?.success) {
        return sendJson(res, 400, { error: data?.recordPayment?.message || "To'lovni saqlashda xatolik" });
      }
      return sendJson(res, 200, data.recordPayment);
    }

    const voidPaymentMatch = pathname.match(/^\/fin-api\/crm\/payments\/([^/]+)\/void$/);
    if (voidPaymentMatch && method === "POST") {
      if (!access.isDirector) {
        return sendJson(res, 403, { error: "Tasdiqlangan to'lovni faqat Direktor bekor qila oladi" });
      }
      if (!sess.crmToken) return sendJson(res, 403, { error: "CRM hisobi ulanmagan" });
      const paymentId = voidPaymentMatch[1];
      const body = await readJsonBody(req);
      if (!body.reason || !String(body.reason).trim()) {
        return sendJson(res, 400, { error: "Bekor qilish sababini kiriting" });
      }
      const data = await crmRequest(
        `mutation VoidPayment($paymentId: ID!, $reason: String!) {
          voidStudentPayment(paymentId: $paymentId, reason: $reason) {
            success
            message
            payment { id voidedAt voidReason voidedByName }
            student { id fullname totalPayment paidAmount remainingAmount overpaidAmount }
          }
        }`,
        { paymentId, reason: String(body.reason).trim() },
        sess.crmToken
      );
      if (!data?.voidStudentPayment?.success) {
        return sendJson(res, 400, { error: data?.voidStudentPayment?.message || "Bekor qilishda xatolik" });
      }
      return sendJson(res, 200, data.voidStudentPayment);
    }

    if (pathname === "/fin-api/crm/debtors" && method === "GET") {
      if (!sess.crmToken) return sendJson(res, 403, { error: "CRM hisobi ulanmagan" });
      const data = await crmRequest(
        `query GetDebtors {
          debtorStudents {
            id fullname profilePicture username phone gender studyPlace isActive isDeleted isArchived
            totalPayment paidAmount remainingAmount overpaidAmount paidUntilDate plannedPayment
            fatherFullname fatherPhone motherFullname motherPhone
            groupId group { id name gender }
            payments(includeVoided: true) {
              id amount method paidAt note receivedByName source voidedAt voidReason voidedByName createdAt
            }
          }
          financeSummary {
            contractCount totalContract totalPaid totalDebt totalOverpaid
            debtorCount overdueCount overdueAmount dueSoonCount dueSoonAmount
            noDeadlineCount expectedThisMonth archivedDebtorCount archivedDebtAmount
          }
          getGroups { id name gender }
        }`,
        {},
        sess.crmToken
      );
      let debtors = data.debtorStudents || [];
      let groups = data.getGroups || [];
      if (!access.isDirector && access.gender) {
        debtors = debtors.filter((d) => d.gender === access.gender);
        groups = groups.filter((g) => g.gender === access.gender);
      }
      const yearFilter = (url.searchParams.get("year") || "").trim();
      if (yearFilter === "2025-2026" || yearFilter === "2026-2027") {
        debtors = debtors.filter((d) => {
          const is2025 = d.isArchived || d.isActive === false || String(d.studyPlace || "").startsWith("2025-2026");
          const dYear = is2025 ? "2025-2026" : "2026-2027";
          return dYear === yearFilter;
        });
      }
      return sendJson(res, 200, {
        debtors,
        summary: data.financeSummary,
        groups,
      });
    }

    if (pathname === "/fin-api/crm/students" && method === "GET") {
      const genderCond = (!access.isDirector && access.gender) ? `WHERE s.gender::text = ${sqlStr(access.gender)}` : "";
      const allStudents = (await queryPgJson(crmEnv.DATABASE_URL, `
        SELECT
          s.id::text AS id,
          s.fullname,
          s."profilePicture",
          s.username,
          s.phone,
          s.gender::text AS gender,
          s."isActive",
          s."isDeleted",
          s."studyPlace",
          COALESCE(s."totalPayment", 0)::float AS "totalPayment",
          COALESCE(s."paidAmount", 0)::float AS "paidAmount",
          COALESCE(s."remainingAmount", 0)::float AS "remainingAmount",
          GREATEST(0, COALESCE(s."paidAmount", 0) - COALESCE(s."totalPayment", 0))::float AS "overpaidAmount",
          s."paidUntilDate",
          s."plannedPayment",
          s."groupId"::text AS "groupId",
          CASE WHEN COALESCE(s."studyPlace", '') LIKE '2025-2026%' OR s."isActive" = false THEN '2025-2026' ELSE '2026-2027' END AS "academicYearName",
          CASE
            WHEN s."isDeleted" = true THEN 'DELETED'
            WHEN s."isActive" = false OR COALESCE(s."studyPlace", '') LIKE '2025-2026%' THEN 'ARCHIVED_YEAR'
            ELSE 'ACTIVE'
          END AS "archiveStatus",
          CASE WHEN g.id IS NOT NULL THEN json_build_object('id', g.id::text, 'name', g.name, 'gender', g.gender::text) ELSE NULL END AS "group"
        FROM "Student" s
        LEFT JOIN "Group" g ON g.id = s."groupId"
        ${genderCond}
        ORDER BY s."isDeleted" ASC, s."isActive" DESC, s.fullname ASC
      `));
      return sendJson(res, 200, { students: allStudents });
    }

    if (pathname === "/fin-api/erp/expenses" && method === "GET") {
      const latestRateRow = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT rate::float AS rate FROM "ExchangeRate" WHERE "fromCurrency" = 'USD' ORDER BY "effectiveAt" DESC, "createdAt" DESC LIMIT 1`
      ));
      const currentUsdRate = Number(latestRateRow[0]?.rate || 49.628);
      const empFilterSql = (!access.isDirector && access.employeeId) ? `AND e."employeeId" = ${sqlStr(access.employeeId)}` : "";

      const rawItems = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT
           e.id,
           e.title,
           COALESCE(NULLIF(e.description, ''), e.title) AS description,
           e.amount::float AS amount,
           e.currency,
           e."amountInDefault"::float AS "amountInDefault",
           COALESCE(e."usdRate", ${currentUsdRate})::float AS "usdRate",
           COALESCE(e."amountUsd", ROUND((e."amountInDefault" / ${currentUsdRate})::numeric, 2))::float AS "amountUsd",
           e.status::text AS status,
           e."rejectionReason",
           e."flaggedLowBalance",
           TO_CHAR(e.date, 'YYYY-MM-DD') AS "expenseDate",
           TO_CHAR(e."createdAt", 'YYYY-MM-DD') AS "createdDate",
           TO_CHAR(e."createdAt", 'YYYY-MM-DD HH24:MI') AS "createdAtText",
           TO_CHAR(e."approvedAt", 'YYYY-MM-DD') AS "approvedDate",
           TO_CHAR(e."approvedAt", 'YYYY-MM-DD HH24:MI') AS "approvedAtText",
           TO_CHAR(e."paidAt", 'YYYY-MM-DD') AS "paidDate",
           TO_CHAR(e."paidAt", 'YYYY-MM-DD HH24:MI') AS "paidAtText",
           e.date,
           e."approvedAt",
           e."paidAt",
           e."createdAt",
           e."categoryId",
           e."employeeId",
           json_build_object('id', c.id, 'name', c.name) AS category,
           json_build_object('id', emp.id, 'firstName', emp."fullName", 'lastName', '', 'fullName', emp."fullName", 'email', emp.username) AS employee
         FROM "Expense" e
         LEFT JOIN "Category" c ON c.id = e."categoryId"
         LEFT JOIN "Employee" emp ON emp.id = e."employeeId"
         WHERE e."deletedAt" IS NULL ${empFilterSql}
         ORDER BY e."createdAt" DESC, e.date DESC`
      ));

      const categories = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT id, name, description, "isDefault" FROM "Category" ORDER BY name ASC`
      ));
      const empListFilterSql = (!access.isDirector && access.employeeId) ? `AND id = ${sqlStr(access.employeeId)}` : "";
      const employees = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT id, "fullName", username FROM "Employee" WHERE "deletedAt" IS NULL ${empListFilterSql} ORDER BY "fullName" ASC`
      ));

      const allReceipts = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT id, "expenseId", url, "fileName", "mimeType", "fileSizeBytes", "createdAt" FROM "ExpenseReceipt" ORDER BY "createdAt" DESC`
      ));
      const receiptsByExp = new Map();
      for (const r of allReceipts) {
        if (!receiptsByExp.has(r.expenseId)) receiptsByExp.set(r.expenseId, []);
        receiptsByExp.get(r.expenseId).push(r);
      }

      const allItems = rawItems.map((it) => ({
        ...it,
        receipts: receiptsByExp.get(it.id) || [],
      }));

      const filterStatus = (url.searchParams.get("status") || "").trim().toUpperCase();
      const filterCategoryId = (url.searchParams.get("categoryId") || "").trim();
      const items = allItems.filter((it) => {
        if (filterStatus && it.status !== filterStatus) return false;
        if (filterCategoryId && it.categoryId !== filterCategoryId) return false;
        return true;
      });

      const paidItems = allItems.filter((e) => e.status === "PAID");
      const approvedItems = allItems.filter((e) => e.status === "APPROVED");
      const pendingItems = allItems.filter((e) => e.status === "PENDING");

      const summary = {
        currentUsdRate,
        paidCount: paidItems.length,
        paidTl: Number(paidItems.reduce((s, e) => s + Number(e.amountInDefault || 0), 0).toFixed(2)),
        paidUsd: Number(paidItems.reduce((s, e) => s + Number(e.amountUsd || 0), 0).toFixed(2)),
        approvedCount: approvedItems.length,
        approvedTl: Number(approvedItems.reduce((s, e) => s + Number(e.amountInDefault || 0), 0).toFixed(2)),
        approvedUsd: Number(approvedItems.reduce((s, e) => s + Number(e.amountUsd || 0), 0).toFixed(2)),
        pendingCount: pendingItems.length,
        pendingTl: Number(pendingItems.reduce((s, e) => s + Number(e.amountInDefault || 0), 0).toFixed(2)),
        pendingUsd: Number(pendingItems.reduce((s, e) => s + Number(e.amountUsd || 0), 0).toFixed(2)),
      };

      return sendJson(res, 200, {
        items,
        summary,
        meta: { total: items.length },
        categories,
        employees,
      });
    }

    if (pathname === "/fin-api/erp/expenses" && method === "POST") {
      const body = await readJsonBody(req);
      const rawCur = String(body.currency || "TL").toUpperCase();
      const cur = rawCur === "TRY" ? "TL" : rawCur;
      const amt = Number(body.amount || 0);
      if (!(amt > 0)) return sendJson(res, 400, { error: "Xarajat summasi 0 dan katta bo'lishi kerak" });

      const latestRateRow = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT rate::float AS rate FROM "ExchangeRate" WHERE "fromCurrency" = 'USD' ORDER BY "effectiveAt" DESC, "createdAt" DESC LIMIT 1`
      ));
      const currentUsdRate = Number(latestRateRow[0]?.rate || 49.628);

      let foreignToTlRate = 1;
      if (cur === "USD") {
        foreignToTlRate = currentUsdRate;
      } else if (cur !== "TL") {
        const curRateRow = (await queryPgJson(
          erpEnv.DATABASE_URL,
          `SELECT rate::float AS rate FROM "ExchangeRate" WHERE "fromCurrency" = ${sqlStr(cur)} ORDER BY "effectiveAt" DESC, "createdAt" DESC LIMIT 1`
        ));
        foreignToTlRate = Number(curRateRow[0]?.rate || (cur === "EUR" ? currentUsdRate * 1.09 : currentUsdRate));
      }

      const amountInDefault = cur === "TL" ? amt : Number((amt * foreignToTlRate).toFixed(2));
      const amountUsd = cur === "USD" ? amt : Number((amountInDefault / currentUsdRate).toFixed(2));

      const catRows = (await queryPgJson(erpEnv.DATABASE_URL, `SELECT id, name FROM "Category" ORDER BY "isDefault" DESC, name ASC`));
      const categoryId = body.categoryId || catRows[0]?.id;
      const catName = catRows.find((c) => c.id === categoryId)?.name || "Xarajat";

      const empRows = (await queryPgJson(erpEnv.DATABASE_URL, `SELECT id, "fullName" FROM "Employee" WHERE "deletedAt" IS NULL ORDER BY CASE WHEN username = 'idora' THEN 0 ELSE 1 END, "createdAt" ASC`));
      const employeeId = (!access.isDirector && access.employeeId)
        ? access.employeeId
        : (body.employeeId || access.employeeId || empRows[0]?.id);
      const empName = empRows.find((e) => e.id === employeeId)?.fullName || access.accountName || "Xodim";

      const offRows = (await queryPgJson(erpEnv.DATABASE_URL, `SELECT id FROM "Office" LIMIT 1`));
      const officeId = offRows[0]?.id || "main-office";

      const wRows = employeeId
        ? (await queryPgJson(erpEnv.DATABASE_URL, `SELECT id, balance::float AS balance FROM "Wallet" WHERE "employeeId" = ${sqlStr(employeeId)} LIMIT 1`))
        : [];
      const wallet = wRows[0] || null;
      const flaggedLowBalance = wallet ? Number(wallet.balance || 0) < amountInDefault : false;

      const expId = "exp_" + crypto.randomBytes(10).toString("hex");
      const rawTitle = String(body.title || body.description || "Xarajat").trim();
      let desc = body.description ? String(body.description).trim() : rawTitle;
      if (!access.isDirector && access.sourceLabel && !desc.includes("[Manba:")) {
        desc = `${desc} [Manba: ${access.sourceLabel}]`;
      }
      const title = rawTitle;
      const expDate = body.date || body.expenseDate || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
      // Regular employees always submit as PENDING for Director approval unless Director explicitly creates PAID
      const status = !access.isDirector ? "PENDING" : (body.status === "PENDING" ? "PENDING" : "PAID");

      await execPgSql(
        erpEnv.DATABASE_URL,
        `INSERT INTO "Expense" (id, "employeeId", "officeId", "categoryId", title, description, amount, currency, "amountInDefault", "defaultCurrency", "usdRate", "amountUsd", date, status, "flaggedLowBalance", "approvedAt", "paidAt", "createdAt", "updatedAt")
         VALUES (${sqlStr(expId)}, ${sqlStr(employeeId)}, ${sqlStr(officeId)}, ${sqlStr(categoryId)}, ${sqlStr(title)}, ${sqlStr(desc)}, ${amt}, ${sqlStr(cur)}, ${amountInDefault}, 'TL', ${currentUsdRate}, ${amountUsd}, ${sqlStr(expDate)}::timestamp, ${sqlStr(status)}::"ExpenseStatus", ${flaggedLowBalance ? "true" : "false"}, ${status === "PAID" ? "NOW()" : "NULL"}, ${status === "PAID" ? "NOW()" : "NULL"}, NOW(), NOW());`
      );

      if (wallet?.id) {
        if (status === "PAID") {
          const txId = "wtx_" + crypto.randomBytes(10).toString("hex");
          const refId = "ref_" + crypto.randomBytes(10).toString("hex");
          const balBefore = Number(wallet.balance || 0);
          const balAfter = balBefore - amountInDefault;
          await execPgSql(
            erpEnv.DATABASE_URL,
            `UPDATE "Wallet" SET balance = balance - ${amountInDefault}, "totalSpent" = "totalSpent" + ${amountInDefault}, "updatedAt" = NOW() WHERE id = ${sqlStr(wallet.id)};
             INSERT INTO "WalletTransaction" (id, "referenceId", "walletId", type, amount, "balanceBefore", "balanceAfter", currency, description, "expenseId", "createdAt", "occurredAt")
             VALUES (${sqlStr(txId)}, ${sqlStr(refId)}, ${sqlStr(wallet.id)}, 'EXPENSE_DEBIT'::"TransactionType", ${amountInDefault}, ${balBefore}, ${balAfter}, 'TL', ${sqlStr(desc)}, ${sqlStr(expId)}, NOW(), NOW());`
          );
          if (categoryId) {
            const [expYear, expMonth] = String(expDate).slice(0, 7).split("-").map(Number);
            if (expYear && expMonth) {
              await execPgSql(
                erpEnv.DATABASE_URL,
                `UPDATE "Budget" SET spent = spent + ${amountInDefault}, "updatedAt" = NOW() WHERE "categoryId" = ${sqlStr(categoryId)} AND year = ${expYear} AND month = ${expMonth};`
              );
            }
          }
        } else if (status === "PENDING") {
          await execPgSql(
            erpEnv.DATABASE_URL,
            `UPDATE "Wallet" SET "pendingAmount" = "pendingAmount" + ${amountInDefault}, "updatedAt" = NOW() WHERE id = ${sqlStr(wallet.id)};`
          );
        }
      }

      if (status === "PENDING") {
        const notifId = "ntf_" + crypto.randomBytes(10).toString("hex");
        const notifTitle = `Yangi xarajat so'rovi: ${empName}`;
        const notifMsg = `${desc} — ₺${amountInDefault.toLocaleString("tr-TR")} ($${amountUsd.toLocaleString("en-US")})`;
        execPgSql(
          erpEnv.DATABASE_URL,
          `INSERT INTO "Notification" (id, "userId", type, title, message, "isRead", "createdAt")
           VALUES (${sqlStr(notifId)}, 'cmtlai0bg000ipir95hv9hfez', 'EXPENSE_SUBMITTED', ${sqlStr(notifTitle)}, ${sqlStr(notifMsg)}, false, NOW());`
        ).catch(() => {});
        const nowIstStr = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Europe/Istanbul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date());
        notifyDirectorsOnTelegram(
          `🔔 <b>Yangi xarajat kiritildi (Web Tizim)</b>\n\n` +
          `👤 Hisob: <b>${empName}</b> (${access.sourceLabel || sess.user?.name || "Xodim"})\n` +
          `📂 Toifa: <b>${catName}</b>\n` +
          `📝 Izoh: <b>${desc}</b>\n` +
          `💰 Summa: <b>₺${amountInDefault.toLocaleString("tr-TR")}</b> ($${amountUsd.toLocaleString("en-US")})\n` +
          `📅 Asl xarajat sanasi: <b>${expDate}</b>\n` +
          `🕒 Tizimga kiritilgan vaqti: <b>${nowIstStr}</b>\n` +
          `${flaggedLowBalance ? `⚠️ <b>Hamyon balansi yetarli emas!</b>\n` : ""}` +
          `\n<i>Botdagi «👑 Direktor Paneli -> ⏳ Kutilayotgan xarajatlar» yoki Web tizim orqali tasdiqlashingiz mumkin.</i>`
        ).catch(() => {});
      }

      return sendJson(res, 201, { id: expId, title, description: desc, amount: amt, currency: cur, amountInDefault, amountUsd, usdRate: currentUsdRate, status, flaggedLowBalance });
    }

    const expActionMatch = pathname.match(/^\/fin-api\/erp\/expenses\/([^/]+)\/(approve|reject|pay|adjust|void)$/);
    if (expActionMatch && method === "POST") {
      if (!access.isDirector) {
        return sendJson(res, 403, { error: "Xarajatni tasdiqlash, to'lash yoki bekor qilish faqat Direktor uchun ruxsat etilgan" });
      }
      if (!sess.erpToken) return sendJson(res, 403, { error: "ERP hisobi ulanmagan" });
      const [, id, action] = expActionMatch;
      const body = await readJsonBody(req);
      const r = await erpRequest("POST", `/expenses/${id}/${action}`, { body, token: sess.erpToken });
      if (action === "approve") {
        await execPgSql(
          erpEnv.DATABASE_URL,
          `UPDATE "Expense" SET "approvedAt" = COALESCE("approvedAt", NOW()), "updatedAt" = NOW() WHERE id = ${sqlStr(id)};`
        ).catch(() => {});
      } else if (action === "pay") {
        await execPgSql(
          erpEnv.DATABASE_URL,
          `UPDATE "Expense" SET "paidAt" = COALESCE("paidAt", NOW()), "approvedAt" = COALESCE("approvedAt", NOW()), "updatedAt" = NOW() WHERE id = ${sqlStr(id)};`
        ).catch(() => {});
      }
      return sendJson(res, 200, r.data);
    }

    const expItemMatch = pathname.match(/^\/fin-api\/erp\/expenses\/([^/]+)$/);
    if (expItemMatch && (method === "PUT" || method === "PATCH")) {
      const expId = expItemMatch[1];
      const body = await readJsonBody(req);
      const rows = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT id, "employeeId", "categoryId", amount::float AS amount, currency, "amountInDefault"::float AS "amountInDefault", status::text AS status, description, TO_CHAR(date, 'YYYY-MM-DD') AS "expenseDate"
         FROM "Expense" WHERE id = ${sqlStr(expId)} AND "deletedAt" IS NULL LIMIT 1`
      );
      const exp = rows[0];
      if (!exp) return sendJson(res, 404, { error: "Xarajat topilmadi" });

      if (!access.isDirector) {
        if (exp.employeeId !== access.employeeId) {
          return sendJson(res, 403, { error: "Faqat o'zingiz kiritgan xarajatni tahrirlay olasiz" });
        }
        if (exp.status !== "PENDING" && exp.status !== "REJECTED") {
          return sendJson(res, 403, { error: "Tasdiqlangan yoki to'langan xarajatni faqat Direktor o'zgartira oladi" });
        }
      }

      const categoryId = body.categoryId || exp.categoryId;
      const amt = body.amount !== undefined ? Number(body.amount) : Number(exp.amount);
      if (!(amt > 0)) return sendJson(res, 400, { error: "Xarajat summasi 0 dan katta bo'lishi shart" });
      const rawCur = String(body.currency || exp.currency || "TL").toUpperCase();
      const cur = rawCur === "TRY" ? "TL" : rawCur;
      const expDate = body.date || body.expenseDate || exp.expenseDate || new Date().toISOString().slice(0, 10);

      let desc = String(body.description !== undefined ? body.description : exp.description || "Xarajat").trim();
      if (!access.isDirector && access.sourceLabel) {
        desc = desc.replace(/\s*\[Manba:[^\]]+\]/gi, "").trim();
        desc = `${desc} [Manba: ${access.sourceLabel}]`;
      }
      const title = desc.slice(0, 100);

      const rateRow = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT rate::float AS rate FROM "ExchangeRate" WHERE "fromCurrency" = 'USD' ORDER BY "effectiveAt" DESC, "createdAt" DESC LIMIT 1`
      );
      const currentUsdRate = Number(rateRow[0]?.rate || 49.628);
      const amountInDefault = cur === "USD" ? Number((amt * currentUsdRate).toFixed(2)) : amt;
      const amountUsd = cur === "USD" ? amt : Number((amt / currentUsdRate).toFixed(2));
      const deltaTl = Number((amountInDefault - Number(exp.amountInDefault || 0)).toFixed(2));
      const nextStatus = !access.isDirector && exp.status === "REJECTED" ? "PENDING" : exp.status;

      await execPgSql(
        erpEnv.DATABASE_URL,
        `UPDATE "Expense"
         SET "categoryId" = ${sqlStr(categoryId)},
             title = ${sqlStr(title)},
             description = ${sqlStr(desc)},
             amount = ${amt},
             currency = ${sqlStr(cur)},
             "amountInDefault" = ${amountInDefault},
             "usdRate" = ${currentUsdRate},
             "amountUsd" = ${amountUsd},
             date = ${sqlStr(expDate)}::timestamp,
             status = ${sqlStr(nextStatus)}::"ExpenseStatus",
             "updatedAt" = NOW()
         WHERE id = ${sqlStr(expId)};`
      );

      if (exp.status === "PENDING") {
        await execPgSql(
          erpEnv.DATABASE_URL,
          `UPDATE "Wallet" SET "pendingAmount" = GREATEST(0, "pendingAmount" + (${deltaTl})), "updatedAt" = NOW() WHERE "employeeId" = ${sqlStr(exp.employeeId)};`
        );
      } else if (exp.status === "REJECTED" && nextStatus === "PENDING") {
        await execPgSql(
          erpEnv.DATABASE_URL,
          `UPDATE "Wallet" SET "pendingAmount" = "pendingAmount" + ${amountInDefault}, "updatedAt" = NOW() WHERE "employeeId" = ${sqlStr(exp.employeeId)};`
        );
      } else if (access.isDirector && exp.status === "PAID" && deltaTl !== 0) {
        await execPgSql(
          erpEnv.DATABASE_URL,
          `UPDATE "Wallet" SET balance = balance - (${deltaTl}), "totalSpent" = "totalSpent" + (${deltaTl}), "updatedAt" = NOW() WHERE "employeeId" = ${sqlStr(exp.employeeId)};`
        );
      }

      return sendJson(res, 200, { success: true, id: expId, description: desc, amount: amt, amountInDefault, amountUsd });
    }

    if (expItemMatch && method === "DELETE") {
      const expId = expItemMatch[1];
      if (!access.isDirector) {
        const rows = await queryPgJson(
          erpEnv.DATABASE_URL,
          `SELECT id, "employeeId", status::text AS status, "amountInDefault"::float AS "amountInDefault" FROM "Expense" WHERE id = ${sqlStr(expId)} AND "deletedAt" IS NULL LIMIT 1`
        );
        const exp = rows[0];
        if (!exp || exp.employeeId !== access.employeeId) {
          return sendJson(res, 403, { error: "Faqat o'zingiz kiritgan xarajatni o'chira olasiz" });
        }
        if (exp.status !== "PENDING" && exp.status !== "REJECTED") {
          return sendJson(res, 403, { error: "Tasdiqlangan yoki to'langan xarajatni faqat Direktor bekor qila oladi" });
        }
        await execPgSql(
          erpEnv.DATABASE_URL,
          `UPDATE "Expense" SET "deletedAt" = NOW(), "updatedAt" = NOW() WHERE id = ${sqlStr(expId)};
           ${exp.status === "PENDING" ? `UPDATE "Wallet" SET "pendingAmount" = GREATEST(0, "pendingAmount" - ${Number(exp.amountInDefault || 0)}), "updatedAt" = NOW() WHERE "employeeId" = ${sqlStr(access.employeeId)};` : ""}`
        );
        return sendJson(res, 200, { success: true, message: "Xarajat o'chirildi" });
      }
      if (!sess.erpToken) return sendJson(res, 403, { error: "ERP hisobi ulanmagan" });
      const r = await erpRequest("DELETE", `/expenses/${expId}`, { token: sess.erpToken });
      return sendJson(res, 200, r.data);
    }

    // =========================================================================
    // XARAJATGA TALABNOMALAR (EXPENSE REQUESTS) ENDPOINTS
    // =========================================================================
    if (pathname === "/fin-api/erp/expense-requests" && method === "GET") {
      const latestRateRow = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT rate::float AS rate FROM "ExchangeRate" WHERE "fromCurrency" = 'USD' ORDER BY "effectiveDate" DESC, "createdAt" DESC LIMIT 1`
      );
      const currentUsdRate = Number(latestRateRow[0]?.rate || 49.628);

      const empFilterSql =
        !access.isDirector && access.employeeId
          ? `AND (r."employeeId" = ${sqlStr(access.employeeId)} OR r."sourceKey" = ${sqlStr(access.accountKey || "")})`
          : "";

      const rows = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT
           r.id,
           r."requestNumber",
           r.amount::float AS amount,
           r."approvedAmount"::float AS "approvedAmount",
           r.currency,
           COALESCE(r."exchangeRate", 1)::float AS "exchangeRate",
           r."amountInDefault"::float AS "amountInDefault",
           r.description,
           COALESCE(r.urgency, 'NORMAL') AS urgency,
           r.status,
           r."rejectionReason",
           r."directorNote",
           r."categoryId",
           COALESCE(c.name, 'Boshqa') AS "categoryName",
           r."employeeId",
           COALESCE(emp."fullName", r."requesterName", 'Xodim') AS "employeeName",
           r."walletId",
           COALESCE(w.balance, 0)::float AS "walletBalanceTry",
           r."requesterName",
           r."requesterTgId",
           r."sourceKey",
           r."sourceLabel",
           r."approvedByName",
           r."expenseId",
           TO_CHAR((r."neededDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS "neededDate",
           TO_CHAR((r."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS "createdDate",
           TO_CHAR((r."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') AS "createdAtText",
           CASE WHEN r."approvedAt" IS NOT NULL THEN TO_CHAR((r."approvedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') ELSE NULL END AS "approvedDate",
           CASE WHEN r."approvedAt" IS NOT NULL THEN TO_CHAR((r."approvedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') ELSE NULL END AS "approvedAtText",
           CASE WHEN r."rejectedAt" IS NOT NULL THEN TO_CHAR((r."rejectedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') ELSE NULL END AS "rejectedAtText",
           CASE WHEN r."completedAt" IS NOT NULL THEN TO_CHAR((r."completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') ELSE NULL END AS "completedDate",
           CASE WHEN r."completedAt" IS NOT NULL THEN TO_CHAR((r."completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') ELSE NULL END AS "completedAtText"
         FROM "ExpenseRequest" r
         LEFT JOIN "Category" c ON c.id = r."categoryId"
         LEFT JOIN "Employee" emp ON emp.id = r."employeeId"
         LEFT JOIN "Wallet" w ON w.id = r."walletId"
         WHERE r."deletedAt" IS NULL
           ${empFilterSql}
         ORDER BY
           CASE WHEN r.status = 'PENDING' THEN 0 WHEN r.status = 'APPROVED' THEN 1 ELSE 2 END ASC,
           r."createdAt" DESC
         LIMIT 500`
      );

      const items = rows.map((r) => {
        const amtTry = Number(r.amountInDefault || r.amount || 0);
        const appTry = r.approvedAmount != null ? Number(r.approvedAmount) : amtTry;
        return {
          ...r,
          requestCode: `#T-${r.requestNumber}`,
          amountTry: amtTry,
          amountUsd: Number((amtTry / currentUsdRate).toFixed(2)),
          approvedAmountTry: appTry,
          approvedAmountUsd: Number((appTry / currentUsdRate).toFixed(2)),
        };
      });

      const summary = {
        totalCount: items.length,
        pendingCount: items.filter((i) => i.status === "PENDING").length,
        pendingTotalTry: items.filter((i) => i.status === "PENDING").reduce((s, i) => s + i.amountTry, 0),
        pendingTotalUsd: items.filter((i) => i.status === "PENDING").reduce((s, i) => s + i.amountUsd, 0),
        approvedCount: items.filter((i) => i.status === "APPROVED").length,
        approvedTotalTry: items.filter((i) => i.status === "APPROVED").reduce((s, i) => s + i.approvedAmountTry, 0),
        completedCount: items.filter((i) => i.status === "COMPLETED").length,
        completedTotalTry: items.filter((i) => i.status === "COMPLETED").reduce((s, i) => s + i.approvedAmountTry, 0),
        rejectedCount: items.filter((i) => i.status === "REJECTED").length,
      };

      return sendJson(res, 200, { items, summary, usdRate: currentUsdRate });
    }

    if (pathname === "/fin-api/erp/expense-requests" && method === "POST") {
      const body = await readJsonBody(req);
      const amt = Number(body.amount);
      if (!(amt > 0)) {
        return sendJson(res, 400, { error: "Talabnoma summasi 0 dan katta bo'lishi shart" });
      }
      const rawCur = String(body.currency || "TRY").toUpperCase();
      const cur = rawCur === "TL" ? "TRY" : rawCur;

      const latestRateRow = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT rate::float AS rate FROM "ExchangeRate" WHERE "fromCurrency" = 'USD' ORDER BY "effectiveDate" DESC, "createdAt" DESC LIMIT 1`
      );
      const currentUsdRate = Number(latestRateRow[0]?.rate || 49.628);
      const exchangeRate = cur === "USD" ? currentUsdRate : 1;
      const amountInDefault = cur === "USD" ? Number((amt * currentUsdRate).toFixed(2)) : amt;
      const amountUsd = Number((amountInDefault / currentUsdRate).toFixed(2));

      const catRows = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT id, name FROM "Category" ORDER BY "isDefault" DESC, name ASC`
      );
      const categoryId = body.categoryId || catRows[0]?.id || null;
      const catName = catRows.find((c) => c.id === categoryId)?.name || "Xarajat";

      const empRows = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT id, "fullName" FROM "Employee" WHERE "deletedAt" IS NULL ORDER BY CASE WHEN username = 'idora' THEN 0 ELSE 1 END, "createdAt" ASC`
      );
      const employeeId =
        !access.isDirector && access.employeeId
          ? access.employeeId
          : body.employeeId || access.employeeId || empRows[0]?.id;
      const empName = empRows.find((e) => e.id === employeeId)?.fullName || access.accountName || "Xodim";

      const wRows = employeeId
        ? await queryPgJson(
            erpEnv.DATABASE_URL,
            `SELECT id, balance::float AS balance FROM "Wallet" WHERE "employeeId" = ${sqlStr(employeeId)} LIMIT 1`
          )
        : [];
      const wallet = wRows[0] || null;
      const walletBal = Number(wallet?.balance || 0);

      const reqId = "req_" + crypto.randomBytes(10).toString("hex");
      const desc = String(body.description || body.title || "Xarajat talabnomasi").trim();
      const urgency = String(body.urgency || "NORMAL").toUpperCase() === "URGENT" ? "URGENT" : "NORMAL";
      const neededDate =
        body.neededDate ||
        new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
      const sourceKey = access.accountKey || empName;
      const sourceLabel = access.sourceLabel || sess.user?.name || empName;
      const requesterName = sess.user?.name || access.sourceLabel || empName;

      const inserted = await queryPgJson(
        erpEnv.DATABASE_URL,
        `INSERT INTO "ExpenseRequest"
          (id, amount, "approvedAmount", currency, "exchangeRate", "amountInDefault", description, urgency, status, "categoryId", "employeeId", "walletId", "requesterName", "sourceKey", "sourceLabel", "neededDate", "createdAt", "updatedAt")
         VALUES (
           ${sqlStr(reqId)},
           ${amt},
           ${amountInDefault},
           ${sqlStr(cur)},
           ${exchangeRate},
           ${amountInDefault},
           ${sqlStr(desc)},
           ${sqlStr(urgency)},
           'PENDING',
           ${sqlStr(categoryId)},
           ${sqlStr(employeeId)},
           ${sqlStr(wallet?.id || null)},
           ${sqlStr(requesterName)},
           ${sqlStr(sourceKey)},
           ${sqlStr(sourceLabel)},
           ${sqlStr(neededDate)}::timestamp,
           NOW(),
           NOW()
         )
         RETURNING id, "requestNumber"`
      );
      const reqNum = inserted[0]?.requestNumber || 1;
      const reqCode = `#T-${reqNum}`;

      const nowIstStr = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Istanbul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());

      const lowBalWarn =
        walletBal < amountInDefault
          ? `⚠️ <b>Diqqat: Hamyonda mablag' kam! (Balans: ₺${walletBal.toLocaleString("tr-TR")})</b>\n`
          : `💳 Hamyon balansi: <b>₺${walletBal.toLocaleString("tr-TR")}</b> (Yetarli ✅)\n`;

      const dirHtml =
        `${urgency === "URGENT" ? "🔥 <b>SHOSHILINCH XARAJAT TALABNOMASI" : "📝 <b>YANGI XARAJAT TALABNOMASI"} (${reqCode})</b>\n\n` +
        `👤 So'rovchi: <b>${sourceLabel}</b>\n` +
        lowBalWarn +
        `💰 So'ralgan summa: <b>₺${amountInDefault.toLocaleString("tr-TR")}</b> (~$${amountUsd.toLocaleString("en-US")})\n` +
        `📂 Kategoriya: <b>${catName}</b>\n` +
        `📋 Maqsad / Izoh: <b>${desc}</b>\n` +
        `📅 Kerakli sana: <b>${neededDate}</b>\n` +
        `🕒 Yuborilgan vaqt: <b>${nowIstStr}</b>\n\n` +
        `<i>👇 Tasdiqlash yoki rad etish uchun quyidagi tugmalarni bosing (yoki ushbu xabarga Reply qilib boshqa summani yozing):</i>`;

      const dirMarkup = {
        inline_keyboard: [
          [
            { text: `✅ Tasdiqlash (₺${amountInDefault.toLocaleString("tr-TR")})`, callback_data: `req:app:${reqId}` },
            { text: `❌ Rad etish`, callback_data: `req:rej:${reqId}` },
          ],
          [{ text: `✏️ Boshqa summani tasdiqlash`, callback_data: `req:amt:${reqId}` }],
        ],
      };

      const sentMsgs = await notifyDirectorsOnTelegram(dirHtml, dirMarkup);
      if (sentMsgs.length > 0) {
        await execPgSql(
          erpEnv.DATABASE_URL,
          `UPDATE "ExpenseRequest" SET "directorMessages" = ${sqlStr(JSON.stringify(sentMsgs))}::jsonb WHERE id = ${sqlStr(reqId)};`
        ).catch(() => {});
      }

      return sendJson(res, 201, {
        id: reqId,
        requestNumber: reqNum,
        requestCode: reqCode,
        status: "PENDING",
        amountTry: amountInDefault,
        amountUsd,
      });
    }

    const reqActionMatch = pathname.match(/^\/fin-api\/erp\/expense-requests\/([^/]+)\/(approve|reject|complete)$/);
    if (reqActionMatch && method === "POST") {
      const [, reqId, action] = reqActionMatch;
      const body = await readJsonBody(req);

      const rows = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT r.*, COALESCE(c.name, 'Boshqa') AS "categoryName",
                TO_CHAR((r."neededDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS "neededDateStr"
         FROM "ExpenseRequest" r
         LEFT JOIN "Category" c ON c.id = r."categoryId"
         WHERE r.id = ${sqlStr(reqId)} AND r."deletedAt" IS NULL LIMIT 1`
      );
      const reqRow = rows[0];
      if (!reqRow) return sendJson(res, 404, { error: "Talabnoma topilmadi" });

      const latestRateRow = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT rate::float AS rate FROM "ExchangeRate" WHERE "fromCurrency" = 'USD' ORDER BY "effectiveDate" DESC, "createdAt" DESC LIMIT 1`
      );
      const currentUsdRate = Number(latestRateRow[0]?.rate || 49.628);
      const reqCode = `#T-${reqRow.requestNumber}`;

      if (action === "approve") {
        if (!access.isDirector) {
          return sendJson(res, 403, { error: "Talabnomani faqat Direktor tasdiqlay oladi" });
        }
        const appAmt =
          body.approvedAmount !== undefined && Number(body.approvedAmount) > 0
            ? Number(body.approvedAmount)
            : Number(reqRow.amountInDefault || reqRow.amount);
        const dirNote = body.directorNote ? String(body.directorNote).trim() : null;
        const approverName = sess.user?.name || "Direktor";

        await execPgSql(
          erpEnv.DATABASE_URL,
          `UPDATE "ExpenseRequest"
           SET status = 'APPROVED',
               "approvedAmount" = ${appAmt},
               "directorNote" = COALESCE(${sqlStr(dirNote)}, "directorNote"),
               "approvedByName" = ${sqlStr(approverName)},
               "approvedAt" = NOW(),
               "updatedAt" = NOW()
           WHERE id = ${sqlStr(reqId)};`
        );

        const dirMsgs = Array.isArray(reqRow.directorMessages) ? reqRow.directorMessages : [];
        const updatedDirHtml =
          `✅ <b>TALABNOMA TASDIQLANDI (${reqCode})</b>\n\n` +
          `👤 So'rovchi: <b>${reqRow.sourceLabel || reqRow.requesterName || "Xodim"}</b>\n` +
          `💰 Tasdiqlangan summa: <b>₺${appAmt.toLocaleString("tr-TR")}</b> (~$${(appAmt / currentUsdRate).toFixed(2)})\n` +
          `📂 Kategoriya: <b>${reqRow.categoryName}</b>\n` +
          `📋 Maqsad: <b>${reqRow.description}</b>\n` +
          (dirNote ? `💬 Direktor izohi: <b>${dirNote}</b>\n` : "") +
          `👑 Tasdiqladi: <b>${approverName}</b>`;
        for (const dm of dirMsgs) {
          await editTelegramHtml(dm.chatId, dm.messageId, updatedDirHtml);
        }

        // Notify requesting employee on Telegram
        const empTgIds = getEmployeeTelegramIds(reqRow.employeeId, reqRow.sourceKey, reqRow.requesterTgId);
        const empHtml =
          `🎉 <b>TALABNOMANGIZ TASDIQLANDI! (${reqCode})</b>\n\n` +
          `💰 Ruxsat etilgan summa: <b>₺${appAmt.toLocaleString("tr-TR")}</b>\n` +
          `📂 Kategoriya: <b>${reqRow.categoryName}</b>\n` +
          `📋 Maqsad: <b>${reqRow.description}</b>\n` +
          (dirNote ? `💬 Direktor izohi: <b>${dirNote}</b>\n` : "") +
          `\n👇 <i>Xaridni amalga oshirgach, quyidagi tugmani bosib chekni biriktiring va haqiqiy xarajatga o'tkazing:</i>`;
        const empMarkup = {
          inline_keyboard: [
            [{ text: `💸 Xarid qilindi (Xarajatga o'tkazish)`, callback_data: `req:done:${reqId}` }],
          ],
        };
        for (const tgId of empTgIds) {
          await sendTelegramHtml(tgId, empHtml, empMarkup);
        }

        return sendJson(res, 200, { success: true, status: "APPROVED", approvedAmount: appAmt });
      }

      if (action === "reject") {
        if (!access.isDirector) {
          return sendJson(res, 403, { error: "Talabnomani faqat Direktor rad eta oladi" });
        }
        const reason = String(body.reason || body.rejectionReason || "Sabab ko'rsatilmadi").trim();
        const approverName = sess.user?.name || "Direktor";

        await execPgSql(
          erpEnv.DATABASE_URL,
          `UPDATE "ExpenseRequest"
           SET status = 'REJECTED',
               "rejectionReason" = ${sqlStr(reason)},
               "approvedByName" = ${sqlStr(approverName)},
               "rejectedAt" = NOW(),
               "updatedAt" = NOW()
           WHERE id = ${sqlStr(reqId)};`
        );

        const dirMsgs = Array.isArray(reqRow.directorMessages) ? reqRow.directorMessages : [];
        const updatedDirHtml =
          `❌ <b>TALABNOMA RAD ETILDI (${reqCode})</b>\n\n` +
          `👤 So'rovchi: <b>${reqRow.sourceLabel || reqRow.requesterName || "Xodim"}</b>\n` +
          `💰 So'ralgan summa: <b>₺${Number(reqRow.amountInDefault || reqRow.amount).toLocaleString("tr-TR")}</b>\n` +
          `📋 Maqsad: <b>${reqRow.description}</b>\n` +
          `🚫 Sabab: <b>${reason}</b>`;
        for (const dm of dirMsgs) {
          await editTelegramHtml(dm.chatId, dm.messageId, updatedDirHtml);
        }

        const empTgIds = getEmployeeTelegramIds(reqRow.employeeId, reqRow.sourceKey, reqRow.requesterTgId);
        const empHtml =
          `❌ <b>TALABNOMANGIZ RAD ETILDI (${reqCode})</b>\n\n` +
          `💰 So'ralgan summa: <b>₺${Number(reqRow.amountInDefault || reqRow.amount).toLocaleString("tr-TR")}</b>\n` +
          `📂 Kategoriya: <b>${reqRow.categoryName}</b>\n` +
          `📋 Maqsad: <b>${reqRow.description}</b>\n` +
          `🚫 Rad etish sababi: <b>${reason}</b>`;
        for (const tgId of empTgIds) {
          await sendTelegramHtml(tgId, empHtml);
        }

        return sendJson(res, 200, { success: true, status: "REJECTED", reason });
      }

      if (action === "complete") {
        // Convert APPROVED (or PENDING if Director) request into a real PAID Expense
        if (reqRow.status === "COMPLETED") {
          return sendJson(res, 400, { error: "Bu talabnoma allaqachon xarajatga o'tkazilgan" });
        }
        if (reqRow.status !== "APPROVED" && !access.isDirector) {
          return sendJson(res, 403, { error: "Talabnoma avval Direktor tomonidan tasdiqlanishi kerak" });
        }

        const spentTry =
          body.amount !== undefined && Number(body.amount) > 0
            ? Number(body.amount)
            : Number(reqRow.approvedAmount || reqRow.amountInDefault || reqRow.amount);
        const spentUsd = Number((spentTry / currentUsdRate).toFixed(2));
        const finalDesc = String(body.description || reqRow.description || "Xarajat").trim();
        const descWithTag = finalDesc.includes(reqCode) ? finalDesc : `${finalDesc} (${reqCode})`;
        const expDate =
          body.date ||
          body.expenseDate ||
          new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());

        const offRows = await queryPgJson(erpEnv.DATABASE_URL, `SELECT id FROM "Office" LIMIT 1`);
        const officeId = offRows[0]?.id || "main-office";
        const employeeId = reqRow.employeeId || access.employeeId;
        const categoryId = body.categoryId || reqRow.categoryId;

        const wRows = employeeId
          ? await queryPgJson(
              erpEnv.DATABASE_URL,
              `SELECT id, balance::float AS balance FROM "Wallet" WHERE "employeeId" = ${sqlStr(employeeId)} LIMIT 1`
            )
          : [];
        const wallet = wRows[0] || null;
        const flaggedLowBalance = wallet ? Number(wallet.balance || 0) < spentTry : false;

        const expId = "exp_" + crypto.randomBytes(10).toString("hex");
        await execPgSql(
          erpEnv.DATABASE_URL,
          `INSERT INTO "Expense"
            (id, "employeeId", "officeId", "categoryId", title, description, amount, currency, "amountInDefault", "defaultCurrency", "usdRate", "amountUsd", date, status, "flaggedLowBalance", "approvedAt", "paidAt", "requestId", "createdAt", "updatedAt")
           VALUES (
             ${sqlStr(expId)},
             ${sqlStr(employeeId)},
             ${sqlStr(officeId)},
             ${sqlStr(categoryId)},
             ${sqlStr(descWithTag.slice(0, 100))},
             ${sqlStr(descWithTag)},
             ${spentTry},
             'TL',
             ${spentTry},
             'TL',
             ${currentUsdRate},
             ${spentUsd},
             ${sqlStr(expDate)}::timestamp,
             'PAID'::"ExpenseStatus",
             ${flaggedLowBalance ? "true" : "false"},
             COALESCE(${sqlStr(reqRow.approvedAt)}::timestamp, NOW()),
             NOW(),
             ${sqlStr(reqId)},
             NOW(),
             NOW()
           );`
        );

        if (wallet?.id) {
          const txId = "wtx_" + crypto.randomBytes(10).toString("hex");
          const refId = "ref_" + crypto.randomBytes(10).toString("hex");
          const balBefore = Number(wallet.balance || 0);
          const balAfter = balBefore - spentTry;
          await execPgSql(
            erpEnv.DATABASE_URL,
            `UPDATE "Wallet" SET balance = balance - ${spentTry}, "totalSpent" = "totalSpent" + ${spentTry}, "updatedAt" = NOW() WHERE id = ${sqlStr(wallet.id)};
             INSERT INTO "WalletTransaction" (id, "referenceId", "walletId", type, amount, "balanceBefore", "balanceAfter", currency, description, "expenseId", "createdAt", "occurredAt")
             VALUES (${sqlStr(txId)}, ${sqlStr(refId)}, ${sqlStr(wallet.id)}, 'EXPENSE_DEBIT'::"TransactionType", ${spentTry}, ${balBefore}, ${balAfter}, 'TL', ${sqlStr(descWithTag)}, ${sqlStr(expId)}, NOW(), NOW());`
          );
        }

        // Optional receipt upload from Web UI (receiptBase64)
        let savedReceiptUrl = null;
        if (body.receiptBase64 && typeof body.receiptBase64 === "string") {
          try {
            const rawB64 = body.receiptBase64.replace(/^data:[^;]+;base64,/, "");
            const buf = Buffer.from(rawB64, "base64");
            const fname = `receipt_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.jpg`;
            const uploadDir = "/srv/data/apps/mezana-platform/apps/finance/dist/uploads";
            fs.mkdirSync(uploadDir, { recursive: true });
            fs.writeFileSync(path.join(uploadDir, fname), buf);
            savedReceiptUrl = `/uploads/${fname}`;
            const recId = "rec_" + crypto.randomBytes(10).toString("hex");
            await execPgSql(
              erpEnv.DATABASE_URL,
              `INSERT INTO "ExpenseReceipt" (id, "expenseId", "cloudinaryId", url, "fileName", "mimeType", "fileSizeBytes", "createdAt")
               VALUES (${sqlStr(recId)}, ${sqlStr(expId)}, ${sqlStr(fname)}, ${sqlStr(savedReceiptUrl)}, ${sqlStr(fname)}, 'image/jpeg', ${buf.length}, NOW());`
            );
          } catch {}
        }

        await execPgSql(
          erpEnv.DATABASE_URL,
          `UPDATE "ExpenseRequest"
           SET status = 'COMPLETED',
               "approvedAmount" = ${spentTry},
               "completedAt" = NOW(),
               "expenseId" = ${sqlStr(expId)},
               "updatedAt" = NOW()
           WHERE id = ${sqlStr(reqId)};`
        );

        notifyDirectorsOnTelegram(
          `💸 <b>Talabnoma bo'yicha xarid bajarildi (${reqCode})</b>\n\n` +
          `👤 Xodim: <b>${reqRow.sourceLabel || reqRow.requesterName || "Xodim"}</b>\n` +
          `💰 Sarflangan summa: <b>₺${spentTry.toLocaleString("tr-TR")}</b> ($${spentUsd.toLocaleString("en-US")})\n` +
          `📂 Kategoriya: <b>${reqRow.categoryName}</b>\n` +
          `📋 Izoh: <b>${descWithTag}</b>\n` +
          `🧾 Chek: ${savedReceiptUrl ? "Biriktirildi ✅" : "Chek yo'q ⚠️"}`
        ).catch(() => {});

        return sendJson(res, 200, {
          success: true,
          status: "COMPLETED",
          expenseId: expId,
          amountTry: spentTry,
          amountUsd: spentUsd,
        });
      }
    }

    const reqItemMatch = pathname.match(/^\/fin-api\/erp\/expense-requests\/([^/]+)$/);
    if (reqItemMatch && (method === "PUT" || method === "PATCH")) {
      const reqId = reqItemMatch[1];
      const body = await readJsonBody(req);
      const rows = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT * FROM "ExpenseRequest" WHERE id = ${sqlStr(reqId)} AND "deletedAt" IS NULL LIMIT 1`
      );
      const reqRow = rows[0];
      if (!reqRow) return sendJson(res, 404, { error: "Talabnoma topilmadi" });

      if (!access.isDirector && reqRow.status !== "PENDING") {
        return sendJson(res, 403, { error: "Faqat kutilayotgan (PENDING) talabnomani tahrirlash mumkin" });
      }

      const latestRateRow = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT rate::float AS rate FROM "ExchangeRate" WHERE "fromCurrency" = 'USD' ORDER BY "effectiveDate" DESC, "createdAt" DESC LIMIT 1`
      );
      const currentUsdRate = Number(latestRateRow[0]?.rate || 49.628);

      const amt = body.amount !== undefined ? Number(body.amount) : Number(reqRow.amountInDefault || reqRow.amount);
      if (!(amt > 0)) return sendJson(res, 400, { error: "Summa 0 dan katta bo'lishi kerak" });
      const desc = body.description !== undefined ? String(body.description).trim() : reqRow.description;
      const categoryId = body.categoryId || reqRow.categoryId;
      const neededDate = body.neededDate || new Date(reqRow.neededDate).toISOString().slice(0, 10);
      const urgency = body.urgency ? String(body.urgency).toUpperCase() : reqRow.urgency;

      await execPgSql(
        erpEnv.DATABASE_URL,
        `UPDATE "ExpenseRequest"
         SET amount = ${amt},
             "approvedAmount" = ${amt},
             "amountInDefault" = ${amt},
             description = ${sqlStr(desc)},
             "categoryId" = ${sqlStr(categoryId)},
             "neededDate" = ${sqlStr(neededDate)}::timestamp,
             urgency = ${sqlStr(urgency)},
             "updatedAt" = NOW()
         WHERE id = ${sqlStr(reqId)};`
      );

      return sendJson(res, 200, {
        success: true,
        id: reqId,
        amountTry: amt,
        amountUsd: Number((amt / currentUsdRate).toFixed(2)),
      });
    }

    if (reqItemMatch && method === "DELETE") {
      const reqId = reqItemMatch[1];
      const rows = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT * FROM "ExpenseRequest" WHERE id = ${sqlStr(reqId)} AND "deletedAt" IS NULL LIMIT 1`
      );
      const reqRow = rows[0];
      if (!reqRow) return sendJson(res, 404, { error: "Talabnoma topilmadi" });
      if (!access.isDirector && reqRow.status !== "PENDING" && reqRow.status !== "REJECTED") {
        return sendJson(res, 403, { error: "Tasdiqlangan talabnomani faqat Direktor o'chira oladi" });
      }
      await execPgSql(
        erpEnv.DATABASE_URL,
        `UPDATE "ExpenseRequest" SET "deletedAt" = NOW(), "updatedAt" = NOW() WHERE id = ${sqlStr(reqId)};`
      );
      return sendJson(res, 200, { success: true });
    }

    if (pathname === "/fin-api/erp/wallets" && method === "GET") {
      const now = new Date();
      const year = Number(url.searchParams.get("year") || now.getFullYear());
      const month = Number(url.searchParams.get("month") || (now.getMonth() + 1));
      const empFilterSql = (!access.isDirector && access.employeeId) ? `AND emp.id = ${sqlStr(access.employeeId)}` : "";

      const dbWallets = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT
           w.id,
           w."employeeId",
           COALESCE(w.balance, 0)::float AS balance,
           COALESCE(w."pendingAmount", 0)::float AS "pendingAmount",
           COALESCE(w."totalAssigned", 0)::float AS "totalAssigned",
           COALESCE(w."totalSpent", 0)::float AS "totalSpent",
           COALESCE(w.currency, 'TL') AS currency,
           emp."fullName",
           emp.username,
           COALESCE((
             SELECT SUM(wt.amount)::float FROM "WalletTransaction" wt
             WHERE wt."walletId" = w.id AND wt.type = 'ASSIGNMENT'
               AND EXTRACT(YEAR FROM wt."occurredAt")::int = ${year}
               AND EXTRACT(MONTH FROM wt."occurredAt")::int = ${month}
           ), 0) AS "monthAssigned",
           COALESCE((
             SELECT SUM(wt.amount)::float FROM "WalletTransaction" wt
             WHERE wt."walletId" = w.id AND wt.type = 'EXPENSE_DEBIT'
               AND EXTRACT(YEAR FROM wt."occurredAt")::int = ${year}
               AND EXTRACT(MONTH FROM wt."occurredAt")::int = ${month}
           ), 0) AS "monthSpent",
           COALESCE((
             SELECT SUM(wt.amount)::float FROM "WalletTransaction" wt
             WHERE wt."walletId" = w.id AND wt.type = 'ADJUSTMENT'
               AND EXTRACT(YEAR FROM wt."occurredAt")::int = ${year}
               AND EXTRACT(MONTH FROM wt."occurredAt")::int = ${month}
           ), 0) AS "monthAdjustments"
         FROM "Wallet" w
         JOIN "Employee" emp ON emp.id = w."employeeId"
         WHERE emp."deletedAt" IS NULL ${empFilterSql}
         ORDER BY emp."fullName" ASC`
      );

      const wallets = dbWallets.map((w) => ({
        id: w.id,
        employeeId: w.employeeId,
        balance: Number(w.balance || 0),
        pendingAmount: Number(w.pendingAmount || 0),
        totalAssigned: Number(w.totalAssigned || 0),
        totalSpent: Number(w.totalSpent || 0),
        currency: w.currency || "TRY",
        employee: {
          id: w.employeeId,
          firstName: w.fullName || w.username || "Xodim",
          lastName: "",
          fullName: w.fullName || w.username || "Xodim",
          email: w.username || "",
        },
      }));

      const statements = dbWallets.map((w) => ({
        walletId: w.id,
        employeeId: w.employeeId,
        employeeName: w.fullName || w.username || "Xodim",
        openingBalance: Number((Number(w.balance || 0) - Number(w.monthAssigned || 0) + Number(w.monthSpent || 0)).toFixed(2)),
        totalAssigned: Number(w.monthAssigned || 0),
        totalSpent: Number(w.monthSpent || 0),
        adjustments: Number(w.monthAdjustments || 0),
        closingBalance: Number(w.balance || 0),
        pendingAmount: Number(w.pendingAmount || 0),
      }));

      return sendJson(res, 200, {
        wallets,
        statements,
        totals: null,
        year,
        month,
      });
    }

    const walletTxMatch = pathname.match(/^\/fin-api\/erp\/wallets\/([^/]+)\/transactions$/);
    if (walletTxMatch && method === "GET") {
      const targetId = walletTxMatch[1];
      const wRows = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT id, "employeeId" FROM "Wallet" WHERE id = ${sqlStr(targetId)} OR "employeeId" = ${sqlStr(targetId)} LIMIT 1`
      );
      const wallet = wRows[0];
      if (!wallet) return sendJson(res, 200, { items: [] });
      if (!access.isDirector && access.employeeId && wallet.employeeId !== access.employeeId) {
        return sendJson(res, 403, { error: "Faqat o'z hamyoningiz tarixini ko'ra olasiz" });
      }
      const items = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT id, "walletId", type::text AS type, amount::float AS amount, "balanceBefore"::float AS "balanceBefore", "balanceAfter"::float AS "balanceAfter", currency, description, "expenseId", "occurredAt", "createdAt"
         FROM "WalletTransaction"
         WHERE "walletId" = ${sqlStr(wallet.id)}
         ORDER BY "occurredAt" DESC, "createdAt" DESC
         LIMIT 200`
      );
      return sendJson(res, 200, { items });
    }

    const walletAssignMatch = pathname.match(/^\/fin-api\/erp\/wallets\/([^/]+)\/assign$/);
    if (walletAssignMatch && method === "POST") {
      if (!access.isDirector) {
        return sendJson(res, 403, { error: "Hamyonga mablag' ajratish faqat Direktor uchun ruxsat etilgan" });
      }
      if (!sess.erpToken) return sendJson(res, 403, { error: "ERP hisobi ulanmagan" });
      const body = await readJsonBody(req);
      const cur = !body.currency || body.currency === "TRY" ? "TL" : body.currency;
      const r = await erpRequest("POST", `/wallets/${walletAssignMatch[1]}/assign`, {
        body: {
          amount: Number(body.amount),
          currency: cur,
          description: body.description || "Mablag' berildi",
          ...(body.date || body.occurredAt ? { date: body.date || body.occurredAt } : {}),
        },
        token: sess.erpToken,
      });
      return sendJson(res, 201, r.data);
    }

    if (pathname === "/fin-api/erp/income" && method === "GET") {
      if (!access.isDirector) {
        return sendJson(res, 200, { items: [], offices: [] });
      }
      if (!sess.erpToken) return sendJson(res, 403, { error: "ERP hisobi ulanmagan" });
      const [incRes, offRes] = await Promise.all([
        erpRequest("GET", "/income", { query: { limit: 100 }, token: sess.erpToken }),
        erpRequest("GET", "/offices", { token: sess.erpToken }).catch(() => ({ data: [] })),
      ]);
      const rawItems = Array.isArray(incRes.data) ? incRes.data : incRes.data?.items || [];
      const items = rawItems.map((it) => ({
        ...it,
        incomeDate: it.incomeDate || it.date || it.createdAt,
        date: it.date || it.incomeDate || it.createdAt,
      }));
      return sendJson(res, 200, {
        items,
        offices: Array.isArray(offRes.data) ? offRes.data : [],
      });
    }

    if (pathname === "/fin-api/erp/income" && method === "POST") {
      if (!access.isDirector) {
        return sendJson(res, 403, { error: "Qo'shimcha daromad kiritish faqat Direktor uchun ruxsat etilgan" });
      }
      if (!sess.erpToken) return sendJson(res, 403, { error: "ERP hisobi ulanmagan" });
      const body = await readJsonBody(req);
      const cur = !body.currency || body.currency === "TRY" ? "TL" : body.currency;
      const payload = {
        source: String(body.source || "Daromad").trim(),
        amount: Number(body.amount),
        currency: cur,
        date: body.date || body.incomeDate || new Date().toISOString().slice(0, 10),
        ...(body.officeId ? { officeId: String(body.officeId) } : {}),
        ...(body.description ? { description: String(body.description) } : {}),
      };
      const r = await erpRequest("POST", "/income", { body: payload, token: sess.erpToken });
      return sendJson(res, 201, r.data);
    }

    const incDeleteMatch = pathname.match(/^\/fin-api\/erp\/income\/([^/]+)$/);
    if (incDeleteMatch && method === "DELETE") {
      if (!access.isDirector) {
        return sendJson(res, 403, { error: "Daromadni o'chirish faqat Direktor uchun ruxsat etilgan" });
      }
      if (!sess.erpToken) return sendJson(res, 403, { error: "ERP hisobi ulanmagan" });
      const r = await erpRequest("DELETE", `/income/${incDeleteMatch[1]}`, { token: sess.erpToken });
      return sendJson(res, 200, r.data);
    }

    if (pathname === "/fin-api/erp/budgets" && method === "GET") {
      const categories = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT id, name, description, "isDefault" FROM "Category" ORDER BY name ASC`
      ));
      if (!access.isDirector) {
        return sendJson(res, 200, { items: [], categories });
      }
      const catById = new Map(categories.map((c) => [c.id, c]));
      const dbBudgets = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT b.id, b."categoryId", b.amount::float AS amount, b.spent::float AS spent,
                EXTRACT(MONTH FROM b."periodStart")::int AS month,
                EXTRACT(YEAR FROM b."periodStart")::int AS year,
                b."periodStart", b."periodEnd", b."createdAt",
                COALESCE((
                  SELECT SUM(e."amountInDefault")::float
                  FROM "Expense" e
                  WHERE e."deletedAt" IS NULL AND e.status = 'PAID'
                    AND e."categoryId" = b."categoryId"
                    AND e.date >= b."periodStart"
                    AND e.date <= b."periodEnd"
                ), b.spent::float, 0) AS "actualSpent"
         FROM "Budget" b
         ORDER BY b."periodStart" DESC, b."createdAt" DESC`
      ));
      const items = dbBudgets.map((b) => ({
        ...b,
        spent: Number(b.actualSpent ?? b.spent ?? 0),
        category: catById.get(b.categoryId) || { id: b.categoryId, name: "Toifa" },
      }));
      return sendJson(res, 200, {
        items,
        categories,
      });
    }

    if (pathname === "/fin-api/erp/budgets" && method === "POST") {
      if (!access.isDirector) {
        return sendJson(res, 403, { error: "Byudjet belgilash faqat Direktor uchun ruxsat etilgan" });
      }
      const body = await readJsonBody(req);
      const nowIst = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
      const [curYear, curMonth] = nowIst.slice(0, 7).split("-").map(Number);
      const categoryId = body.categoryId || body.scopeId;
      const amount = Number(body.amount || 0);
      const month = Number(body.month || curMonth);
      const year = Number(body.year || curYear);
      if (!categoryId || !(amount > 0)) {
        return sendJson(res, 400, { error: "Toifa va byudjet summasini kiriting" });
      }
      const periodStart = `${year}-${String(month).padStart(2, "0")}-01 00:00:00`;
      const lastDay = new Date(year, month, 0).getDate();
      const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")} 23:59:59`;
      const spentRows = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT COALESCE(SUM("amountInDefault"), 0)::float AS spent
         FROM "Expense"
         WHERE "deletedAt" IS NULL AND status = 'PAID'
           AND "categoryId" = ${sqlStr(categoryId)}
           AND date >= ${sqlStr(periodStart)}::timestamp
           AND date <= ${sqlStr(periodEnd)}::timestamp`
      ));
      const spent = Number(spentRows[0]?.spent || 0);
      const existing = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT id FROM "Budget" WHERE "categoryId" = ${sqlStr(categoryId)} AND EXTRACT(YEAR FROM "periodStart")::int = ${year} AND EXTRACT(MONTH FROM "periodStart")::int = ${month} LIMIT 1`
      );
      let budId = existing[0]?.id;
      if (budId) {
        await execPgSql(
          erpEnv.DATABASE_URL,
          `UPDATE "Budget" SET amount = ${amount}, spent = ${spent}, "updatedAt" = NOW() WHERE id = ${sqlStr(budId)};`
        );
      } else {
        budId = "bud_" + crypto.randomBytes(10).toString("hex");
        await execPgSql(
          erpEnv.DATABASE_URL,
          `INSERT INTO "Budget" (id, scope, "scopeId", "categoryId", amount, currency, period, spent, "periodStart", "periodEnd", "createdAt", "updatedAt")
           VALUES (${sqlStr(budId)}, 'CATEGORY'::"BudgetScope", ${sqlStr(categoryId)}, ${sqlStr(categoryId)}, ${amount}, 'TL', 'MONTHLY'::"BudgetPeriod", ${spent}, ${sqlStr(periodStart)}::timestamp, ${sqlStr(periodEnd)}::timestamp, NOW(), NOW());`
        );
      }
      return sendJson(res, 201, { id: budId, categoryId, amount, spent, month, year });
    }

    const budgetItemMatch = pathname.match(/^\/fin-api\/erp\/budgets\/([^/]+)$/);
    if (budgetItemMatch && method === "DELETE") {
      if (!access.isDirector) {
        return sendJson(res, 403, { error: "Byudjetni o'chirish faqat Direktor uchun ruxsat etilgan" });
      }
      if (!sess.erpToken) return sendJson(res, 403, { error: "ERP hisobi ulanmagan" });
      const r = await erpRequest("DELETE", `/budgets/${budgetItemMatch[1]}`, { token: sess.erpToken });
      return sendJson(res, 200, r.data);
    }

    if (pathname === "/fin-api/erp/currencies" && method === "GET") {
      const items = await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT id, "fromCurrency", "toCurrency", rate::float AS rate, "effectiveAt", "createdAt" FROM "ExchangeRate" ORDER BY "effectiveAt" DESC, "createdAt" DESC LIMIT 50`
      );
      return sendJson(res, 200, { items });
    }

    if (pathname === "/fin-api/erp/currencies" && method === "POST") {
      if (!access.isDirector) {
        return sendJson(res, 403, { error: "Valyuta kursini yangilash faqat Direktor uchun ruxsat etilgan" });
      }
      if (!sess.erpToken) return sendJson(res, 403, { error: "ERP hisobi ulanmagan" });
      const body = await readJsonBody(req);
      const payload = {
        fromCurrency: body.fromCurrency || "USD",
        toCurrency: !body.toCurrency || body.toCurrency === "TRY" ? "TL" : body.toCurrency,
        rate: Number(body.rate),
      };
      const r = await erpRequest("POST", "/currencies/rates", { body: payload, token: sess.erpToken });
      return sendJson(res, 201, r.data);
    }

    if (pathname === "/fin-api/reports/cashflow" && method === "GET") {
      const now = new Date();
      const istanbulToday = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(now);
      const from = url.searchParams.get("from") || "2026-07-01";
      const to = url.searchParams.get("to") || istanbulToday;
      const format = url.searchParams.get("format") || "json";

      const latestRateRow = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT rate::float AS rate FROM "ExchangeRate" WHERE "fromCurrency" = 'USD' ORDER BY "effectiveAt" DESC, "createdAt" DESC LIMIT 1`
      ));
      const currentUsdRate = Number(latestRateRow[0]?.rate || 49.628);

      const crmPayments = (await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT
           sp.id::text AS id,
           sp.amount::float AS amount,
           sp.method,
           TO_CHAR(sp."paidAt", 'YYYY-MM-DD') AS date,
           sp.note,
           sp."receivedByName",
           s.fullname AS "studentName",
           g.name AS "groupName"
         FROM "StudentPayment" sp
         JOIN "Student" s ON s.id = sp."studentId"
         LEFT JOIN "Group" g ON g.id = s."groupId"
         WHERE sp."voidedAt" IS NULL AND s."isDeleted" = false
           AND sp."paidAt"::date >= ${sqlStr(from)}::date
           AND sp."paidAt"::date <= ${sqlStr(to)}::date
         ORDER BY sp."paidAt" DESC`
      ));

      const erpExpenses = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT
           e.id,
           COALESCE(NULLIF(e.description, ''), e.title) AS description,
           e."amountInDefault"::float AS "amountTl",
           COALESCE(e."usdRate", ${currentUsdRate})::float AS "usdRate",
           COALESCE(e."amountUsd", ROUND((e."amountInDefault" / ${currentUsdRate})::numeric, 2))::float AS "amountUsd",
           TO_CHAR(e.date, 'YYYY-MM-DD') AS date,
           c.name AS "categoryName",
           emp."fullName" AS "employeeName",
           o.name AS "officeName"
         FROM "Expense" e
         LEFT JOIN "Category" c ON c.id = e."categoryId"
         LEFT JOIN "Employee" emp ON emp.id = e."employeeId"
         LEFT JOIN "Office" o ON o.id = e."officeId"
         WHERE e."deletedAt" IS NULL AND e.status = 'PAID'
           AND e.date::date >= ${sqlStr(from)}::date
           AND e.date::date <= ${sqlStr(to)}::date
         ORDER BY e.date DESC`
      ));

      const erpIncomes = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT
           i.id,
           i.source,
           i.description,
           i.amount::float AS amount,
           i.currency,
           i."amountInDefault"::float AS "amountTl",
           TO_CHAR(i.date, 'YYYY-MM-DD') AS date,
           NULL AS "officeName"
         FROM "Income" i
         WHERE i."deletedAt" IS NULL
           AND i.date::date >= ${sqlStr(from)}::date
           AND i.date::date <= ${sqlStr(to)}::date
         ORDER BY i.date DESC`
      ));

      const rows = [];
      for (const p of crmPayments) {
        rows.push({
          id: `PAY-${p.id}`,
          date: p.date,
          system: "CRM",
          direction: "INFLOW",
          category: "Talaba to'lovi",
          counterparty: p.studentName || "Talaba",
          groupOrDept: p.groupName || "—",
          method: p.method || "naqt",
          amount: Number(p.amount || 0),
          amountUsd: Number(p.amount || 0),
          amountTl: null,
          usdRate: null,
          note: p.note || "",
          actor: p.receivedByName || "CRM",
        });
      }

      for (const inc of erpIncomes) {
        const cur = String(inc.currency || "TL").toUpperCase();
        const amt = Number(inc.amount || 0);
        const amtTl = Number(inc.amountTl || (cur === "USD" ? amt * currentUsdRate : amt));
        const amtUsd = cur === "USD" ? amt : Number((amtTl / currentUsdRate).toFixed(2));
        rows.push({
          id: `INC-${String(inc.id).slice(-6)}`,
          date: inc.date,
          system: "ERP",
          direction: "INFLOW",
          category: "Qo'shimcha daromad",
          counterparty: inc.source || "Daromad manbasi",
          groupOrDept: inc.officeName || "Akademiya",
          method: "kirim",
          amount: amtUsd,
          amountUsd: amtUsd,
          amountTl: cur === "USD" ? null : amtTl,
          usdRate: cur === "USD" ? null : currentUsdRate,
          note: inc.description || inc.source || "",
          actor: "Moliya",
        });
      }

      for (const exp of erpExpenses) {
        rows.push({
          id: `EXP-${exp.id.slice(-6)}`,
          date: exp.date,
          system: "ERP",
          direction: "OUTFLOW",
          category: exp.categoryName || "Xarajat",
          counterparty: exp.employeeName || "Xodim",
          groupOrDept: exp.officeName || "Akademiya",
          method: "hamyon",
          amount: Number(exp.amountUsd || 0),
          amountUsd: Number(exp.amountUsd || 0),
          amountTl: Number(exp.amountTl || 0),
          usdRate: Number(exp.usdRate || currentUsdRate),
          note: `${exp.description || ""} (Asl: ₺${Math.round(exp.amountTl).toLocaleString("tr-TR")} • Kurs: 1$=${Number(exp.usdRate).toFixed(2)}₺)`,
          actor: exp.employeeName || "ERP",
        });
      }

      rows.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date)));

      const totalInflow = Number(rows.filter((r) => r.direction === "INFLOW").reduce((s, r) => s + r.amountUsd, 0).toFixed(2));
      const totalOutflow = Number(rows.filter((r) => r.direction === "OUTFLOW").reduce((s, r) => s + r.amountUsd, 0).toFixed(2));
      const totalOutflowTl = Number(rows.filter((r) => r.direction === "OUTFLOW").reduce((s, r) => s + Number(r.amountTl || 0), 0).toFixed(2));
      const netFlow = Number((totalInflow - totalOutflow).toFixed(2));

      if (format === "csv" || format === "xlsx") {
        const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [
          ["ID", "Sana", "Bo'lim", "Yo'nalish", "Toifa", "Talaba / Xodim", "Guruh / Filial", "Usul", "Summa (USD $)", "Summa (TL ₺)", "Kurs (1$)", "Izoh"].map(esc).join(","),
          ...rows.map((r) =>
            [
              r.id,
              r.date,
              r.system === "CRM" ? "O'quv markazi" : "Moliya",
              r.direction === "INFLOW" ? "Kirim (+)" : "Chiqim (-)",
              r.category,
              r.counterparty,
              r.groupOrDept,
              r.method,
              r.direction === "INFLOW" ? r.amountUsd : -r.amountUsd,
              r.amountTl ? -r.amountTl : "",
              r.usdRate ? r.usdRate : "",
              r.note,
            ]
              .map(esc)
              .join(",")
          ),
        ];
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="mezana-cashflow-${from}-to-${to}.csv"`,
        });
        res.end("\uFEFF" + lines.join("\r\n"));
        return;
      }

      return sendJson(res, 200, {
        from,
        to,
        totalInflow,
        totalOutflow,
        totalOutflowTl,
        netFlow,
        rows,
      });
    }

    if (pathname === "/fin-api/search" && method === "GET") {
      const qRaw = (url.searchParams.get("q") || "").trim();
      const q = qRaw.toLowerCase().replace(/'/g, "''");
      if (!q) return sendJson(res, 200, { results: [] });

      const matchedStudents = (await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT s.id::text AS id, s.fullname, s.username, s.phone, s."studyPlace",
                s."remainingAmount", s."isActive", s."isDeleted", s."roomNumber",
                g.name AS "groupName"
         FROM "Student" s
         LEFT JOIN "Group" g ON g.id = s."groupId"
         WHERE LOWER(COALESCE(s.fullname, '')) LIKE '%${q}%'
            OR LOWER(COALESCE(s.username, '')) LIKE '%${q}%'
            OR LOWER(COALESCE(s.phone, '')) LIKE '%${q}%'
            OR LOWER(COALESCE(s."passportNumber", '')) LIKE '%${q}%'
            OR LOWER(COALESCE(s."iqomaNumber", '')) LIKE '%${q}%'
            OR LOWER(COALESCE(s."studyPlace", '')) LIKE '%${q}%'
         ORDER BY s."isDeleted" ASC, s."isActive" DESC
         LIMIT 10`
      ));

      const matchedPayments = (await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT sp.id::text AS id, sp.amount, sp.method, sp."paidAt", sp.note, sp."voidedAt",
                s.fullname AS "studentName"
         FROM "StudentPayment" sp
         LEFT JOIN "Student" s ON s.id = sp."studentId"
         WHERE LOWER(COALESCE(s.fullname, '')) LIKE '%${q}%'
            OR LOWER(COALESCE(sp.note, '')) LIKE '%${q}%'
            OR CAST(sp.amount AS text) LIKE '%${q}%'
         ORDER BY sp."paidAt" DESC
         LIMIT 6`
      ));

      const matchedExpenses = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT ex.id, ex.description, ex."amountInDefault", ex.status, ex."deletedAt",
                c.name AS "categoryName", emp."fullName" AS "employeeName"
         FROM "Expense" ex
         LEFT JOIN "Category" c ON c.id = ex."categoryId"
         LEFT JOIN "Employee" emp ON emp.id = ex."employeeId"
         WHERE LOWER(COALESCE(ex.description, '')) LIKE '%${q}%'
            OR LOWER(COALESCE(c.name, '')) LIKE '%${q}%'
            OR LOWER(COALESCE(emp."fullName", '')) LIKE '%${q}%'
         ORDER BY ex."createdAt" DESC
         LIMIT 6`
      ));

      const matchedEmployees = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT e.id, e."fullName", e.username, e.department, e.position, e."deletedAt",
                COALESCE(w.balance, 0) AS balance
         FROM "Employee" e
         LEFT JOIN "Wallet" w ON w."employeeId" = e.id
         WHERE LOWER(COALESCE(e."fullName", '')) LIKE '%${q}%'
            OR LOWER(COALESCE(e.username, '')) LIKE '%${q}%'
            OR LOWER(COALESCE(e.department, '')) LIKE '%${q}%'
         LIMIT 5`
      ));

      const results = [];
      for (const st of matchedStudents) {
        const isArchYear = !st.isActive || String(st.studyPlace || "").startsWith("2025-2026");
        const badge = st.isDeleted ? "O'chirilgan arxiv" : isArchYear ? "2025-2026 arxiv" : "Faol";
        results.push({
          type: "Talaba",
          rawType: "student",
          id: `stu-${st.id}`,
          title: st.fullname,
          badge,
          subtitle: `${st.studyPlace || st.groupName || "Guruhsiz"} • Qarz: $${Number(st.remainingAmount || 0).toLocaleString("en-US")} • ${st.phone || "@" + st.username}`,
          tab: "students_dir",
        });
      }

      for (const p of matchedPayments) {
        results.push({
          type: "To'lov",
          rawType: "payment",
          id: `pay-${p.id}`,
          title: `${p.studentName || "Talaba"} — $${Number(p.amount).toLocaleString("en-US")}`,
          badge: p.voidedAt ? "Bekor qilingan" : "Qabul qilingan",
          subtitle: `${String(p.paidAt).slice(0, 10)} • ${p.method}${p.note ? " • " + p.note : ""}`,
          tab: "payments",
        });
      }

      for (const e of matchedExpenses) {
        const stMap = { PAID: "To'langan", APPROVED: "Tasdiqlangan", PENDING: "Kutilmoqda", REJECTED: "Rad etilgan" };
        results.push({
          type: "Xarajat",
          rawType: "expense",
          id: `exp-${e.id}`,
          title: `${e.description || e.categoryName || "Xarajat"} — ₺${Math.round(Number(e.amountInDefault || 0)).toLocaleString("tr-TR")}`,
          badge: e.deletedAt ? "Arxiv" : (stMap[e.status] || e.status),
          subtitle: `${e.categoryName || "Toifasiz"} • ${e.employeeName || "Xodim"}`,
          tab: "expenses",
        });
      }

      for (const emp of matchedEmployees) {
        results.push({
          type: "Xodim",
          rawType: "employee",
          id: `emp-${emp.id}`,
          title: `${emp.fullName} (${emp.position || "Xodim"})`,
          badge: emp.deletedAt ? "Arxiv" : "Faol",
          subtitle: `Hamyon: ₺${Math.round(Number(emp.balance || 0)).toLocaleString("tr-TR")} • ${emp.department || ""}`,
          tab: "hr_tasks",
        });
      }

      return sendJson(res, 200, { results });
    }

    if (pathname === "/fin-api/ai/ask" && method === "POST") {
      const body = await readJsonBody(req);
      const question = String(body.question || "Tizimdagi umumiy holat va arxiv ma'lumotlari bo'yicha xulosa ber.").trim();
      const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
      const overview = await buildOverview(sess);

      // Gather rich active + archive summary from both PostgreSQL databases
      const studentBreakdown = (await queryPgJson(crmEnv.DATABASE_URL, `
        SELECT
          CASE
            WHEN "isDeleted" = true THEN 'O_chirilgan_arxiv'
            WHEN "isActive" = false OR COALESCE("studyPlace", '') LIKE '2025-2026%' THEN 'Arxiv_2025_2026'
            ELSE 'Faol_2026_2027'
          END AS holat,
          COALESCE("studyPlace", 'Belgilanmagan') AS oquv_joyi,
          gender::text AS jinsi,
          COUNT(*)::int AS talabalar_soni,
          COALESCE(SUM("totalPayment"), 0)::float AS jami_shartnoma,
          COALESCE(SUM("paidAmount"), 0)::float AS jami_tolangan,
          COALESCE(SUM("remainingAmount"), 0)::float AS jami_qarz,
          COUNT(*) FILTER (WHERE COALESCE("remainingAmount", 0) > 0)::int AS qarzdorlar_soni
        FROM "Student"
        GROUP BY 1, 2, 3
        ORDER BY 4 DESC
      `));

      const groupsSummary = (await queryPgJson(crmEnv.DATABASE_URL, `
        SELECT g.id::text AS id, g.name, g.gender::text AS gender, g."studyPlace", g."isActive",
               t.fullname AS ustoz,
               COUNT(s.id)::int AS talabalar_soni
        FROM "Group" g
        LEFT JOIN "Teacher" t ON t.id = g."teacherId"
        LEFT JOIN "Student" s ON s."groupId" = g.id AND s."isDeleted" = false
        GROUP BY g.id, g.name, g.gender, g."studyPlace", g."isActive", t.fullname
        ORDER BY g.id ASC
      `));

      const erpCategoriesList = (await queryPgJson(erpEnv.DATABASE_URL, `
        SELECT id, name FROM "Category" ORDER BY name ASC
      `));

      const erpEmployeesList = (await queryPgJson(erpEnv.DATABASE_URL, `
        SELECT e.id, e."fullName", e.username, e.department, e.position,
               (e."deletedAt" IS NOT NULL) AS arxivlangan,
               COALESCE(w.balance, 0)::float AS hamyon_balansi,
               COALESCE(w."pendingAmount", 0)::float AS kutilayotgan_xarajat
        FROM "Employee" e
        LEFT JOIN "Wallet" w ON w."employeeId" = e.id
        ORDER BY e."deletedAt" NULLS FIRST, e."fullName" ASC
      `));

      const erpExpenseStats = (await queryPgJson(erpEnv.DATABASE_URL, `
        SELECT status, ("deletedAt" IS NOT NULL) AS arxivlangan,
               COUNT(*)::int AS soni,
               COALESCE(SUM("amountInDefault"), 0)::float AS jami_summa_tl
        FROM "Expense"
        GROUP BY 1, 2
      `));

      const mealStatsSummary = (await queryPgJson(crmEnv.DATABASE_URL, `
        SELECT COUNT(*)::int AS jami_ovqat_yozuvlari,
               COUNT(DISTINCT DATE(timestamp))::int AS kunlar_soni,
               MIN(timestamp)::text AS eng_eski_sana,
               MAX(timestamp)::text AS eng_yangi_sana
        FROM "MealRecord"
      `));

      const snapshotForAi = {
        bugungiSana: overview.asOf,
        sorovYuborayotganXodim: {
          ism: sess.user?.name || "Boshqaruvchi",
          login: sess.user?.identifier || "dev",
          lavozim: sess.user?.role === "DIRECTOR" || sess.user?.role === "root" ? "Bosh rahbar (To'liq ruxsat)" : (sess.user?.role || "Ma'mur"),
          ruxsatlar: "Barcha faol va arxiv ma'lumotlarni o'qish, birlashtirib tahlil qilish hamda tasdiq orqali ma'lumot kiritish va o'zgartirish huquqiga ega.",
        },
        umumiyMoliya: overview.unified,
        talabalarMoliyasi: overview.crm,
        talabalarArxivVaFaolKesimi: studentBreakdown,
        guruhlarVaUstozlar: groupsSummary,
        oshxonaArxivi: mealStatsSummary[0] || {},
        xodimlarVaHamyonlar: erpEmployeesList,
        xarajatlarKesimi: erpExpenseStats,
        xarajatToifalari: erpCategoriesList,
        ogohlantirishlar: overview.alerts,
      };

      if (!OPENAI_API_KEY) {
        return sendJson(res, 200, {
          answer: `**Tizim xulosasi (${overview.asOf}):**\n- Jami talabalar (faol + arxiv): **309 nafar**\n- Jami talaba tushumlari: **$${overview.unified.allTimeStudentPaid.toLocaleString("en-US")}**\n- Jami xarajatlar: **$${overview.unified.allTimeOutflow.toLocaleString("en-US")} (₺${Math.round(overview.unified.allTimeOutflowTl || 0).toLocaleString("tr-TR")})**\n- Sof qoldiq: **$${overview.unified.allTimeNet.toLocaleString("en-US")}**`,
        });
      }

      const tools = [
        {
          type: "function",
          function: {
            name: "query_database",
            description: "O'quv markazi (talabalar, arxiv talabalar 2025-2026, o'chirilgan talabalar, to'lovlar, guruhlar, ustozlar, oshxona ovqatlanish tarixi, dars va davomat, yotoqxona xonalari, vazifalar, audit) yoki Moliya (xarajatlar, arxiv xarajatlar, xodimlar, hamyonlar, tranzaksiyalar, daromadlar, byudjetlar, filiallar) ma'lumotlar bazasidan SELECT so'rovi orqali istalgan aniq ma'lumotni olish.",
            parameters: {
              type: "object",
              properties: {
                database: {
                  type: "string",
                  enum: ["oquv_markazi", "moliya"],
                  description: "Qaysi bazadan o'qish: 'oquv_markazi' (talabalar, guruhlar, to'lovlar, oshxona, xonalar, davomat) yoki 'moliya' (xarajatlar, hamyonlar, xodimlar, daromad, byudjet)",
                },
                sql: {
                  type: "string",
                  description: "PostgreSQL SELECT so'rovi (oxiriga ; qo'ymang, ism qidirishda ILIKE '%ism%' ishlating). Jadval va ustun nomlarini qo'shtirnoq ichida yozing, masalan: SELECT id, fullname, \"studyPlace\", \"totalPayment\", \"paidAmount\", \"remainingAmount\", \"isActive\", \"isDeleted\" FROM \"Student\" WHERE ...",
                },
              },
              required: ["database", "sql"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "propose_data_change",
            description: "Foydalanuvchi ma'lumot qo'shishni yoki o'zgartirishni so'raganda (masalan: talabaga to'lov kiritish, yangi talaba qo'shish, talaba ma'lumotini o'zgartirish, xarajat qo'shish, xarajatni tasdiqlash/to'lash/bekor qilish, xodim hamyoniga pul o'tkazish, yangi guruh yoki vazifa qo'shish) ma'lumotni tayyorlab foydalanuvchidan tasdiq so'rash uchun chaqiriladi.",
            parameters: {
              type: "object",
              properties: {
                actionType: {
                  type: "string",
                  enum: [
                    "record_payment",
                    "create_student",
                    "update_student",
                    "create_expense",
                    "approve_expense",
                    "pay_expense",
                    "void_expense",
                    "assign_wallet",
                    "create_group",
                    "create_task",
                  ],
                  description: "Bajariladigan amal turi",
                },
                title: {
                  type: "string",
                  description: "Amal sarlavhasi (sof o'zbek tilida, masalan: 'Talaba to\'lovini kiritish')",
                },
                summary: {
                  type: "string",
                  description: "Foydalanuvchiga ko'rsatiladigan qisqa tushuntirish (masalan: 'Abdulbosit Hikmatxonov hisobiga $1 000 naqt to\'lov kiritilsinmi?')",
                },
                fields: {
                  type: "array",
                  description: "Tasdiqlash oynasida ko'rsatiladigan maydonlar ro'yxati",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      value: { type: "string" },
                    },
                    required: ["label", "value"],
                  },
                },
                payload: {
                  type: "object",
                  description: "Amalni bajarish uchun kerakli parametrlar: record_payment uchun { studentId, amount, paymentMethod ('naqt'|'karta'|'otkazma'), paidAt, nextDueDate, note }; update_student uchun { id, fullname, phone, totalPayment, plannedPayment, paidUntilDate, groupId, roomNumber, studyPlace }; create_student uchun { fullname, username, password, gender ('MALE'|'FEMALE'), phone, studyPlace, totalPayment, groupId }; create_expense uchun { description, amount, currency ('TRY'|'USD'|'EUR'), categoryId, date }; approve_expense/pay_expense/void_expense uchun { expenseId, reason }; assign_wallet uchun { employeeId, amount, description }; create_group uchun { name, gender ('MALE'|'FEMALE'), studyPlace }; create_task uchun { title, description, priority ('LOW'|'MEDIUM'|'HIGH'|'URGENT') }",
                },
              },
              required: ["actionType", "title", "summary", "fields", "payload"],
            },
          },
        },
      ];

      const systemPrompt = `Sen Mezana tizimining Bosh Aqlli Yordamchisisan (AI).
Senga murojaat qilayotgan foydalanuvchi: ${sess.user?.name || "Rahbar"} (Lavozimi: Bosh rahbar — barcha bo'limlar va barcha arxivlarga 100% ruxsati bor).

MUHIM QOIDALAR:
1. SOF O'ZBEK TILI VA TUSHUNARLI USLUB:
   - Javoblaringda texnik atamalarni (masalan: CRM, ERP, SQL, GraphQL, ID, boolean, isActive, isDeleted, null, PENDING, PAID, payload, mutation) ISHLATMA!
   - Ularning o'rniga oddiy foydalanuvchi tushunadigan sof o'zbek tilidagi so'zlarni ishlat: "O'quv markazi", "Moliya bo'limi", "Faol talabalar", "2025-2026 o'quv yili arxivi", "O'chirilgan talabalar arxivi", "To'langan", "Tasdiq kutilmoqda", "Naqt", "Karta", "O'tkazma".
   - O'zbek tili imlo qoidalariga qat'iy amal qil. Valyutalar: Talaba shartnomalari va talaba to'lovlari AQSh dollarida ($), Moliya bo'limidagi xarajatlar va hamyonlar esa Turk lirasida (₺) hamda dollar ($) ekvivalentida yuritiladi.

2. TO'LIQ ARXIV VA BARCHA MA'LUMOTLARNI O'QISH:
   - Senda barcha faol hamda arxiv ma'lumotlarni o'qish huquqi bor! Hech qachon "arxivni o'qiy olmayman" yoki "huquqim yo'q" demagin!
   - Boshlang'ich umumiy ma'lumot quyida berilgan, lekin foydalanuvchi aniq talabalar, arxivdagi (2025-2026 yoki o'chirilgan) talabalar, qarzdorlar, to'lovlar, oshxona tarixi, xonalar, guruhlar, xarajatlar yoki xodimlar haqida so'rasa, darhol "query_database" vositasini chaqirib bazadan aniq ro'yxat va raqamlarni ol!
   - PostgreSQL jadvallari sxemasi:
     * database="oquv_markazi":
       - "Student": id, fullname, username, phone, "uzbPhone", "turkPhone", gender ('MALE'|'FEMALE'), "studyPlace" ('2026-2027 Akademiya', '2026-2027 Madrasa', '2025-2026 Akademiya', '2025-2026 Madrasa'), "courseYear", "roomNumber", "totalPayment", "paidAmount", "remainingAmount", "paidUntilDate", "plannedPayment", "isActive" (false bo'lsa 2025-2026 arxiv), "isDeleted" (true bo'lsa o'chirilgan arxiv), "isArchived", "hasIqoma", "iqomaNumber", "iqomaExpiryDate", "fatherFullname", "fatherPhone", "motherFullname", "motherPhone", "groupId", "createdAt"
       - "StudentPayment": id, "studentId", amount, method ('naqt'|'karta'|'otkazma'), "paidAt", note, "receivedByName", "voidedAt", "voidReason", "createdAt"
       - "Group": id, name, gender, "studyPlace", "institutionType", "teacherId", "isActive"
       - "Teacher": id, fullname, username, phone, gender, "isActive"
       - "Room": id, "roomNumber", floor, capacity, gender, "isActive"
       - "MealRecord": id, "studentId", "mealType" ('BREAKFAST'|'LUNCH'|'DINNER'), timestamp
       - "PrayerRecord": id, "studentId", "cardId", "prayerType" ('FAJR'|'DHUHR'|'ASR'|'MAGHRIB'|'ISHA'), timestamp
       - "GateLateIncident": id, "capturedAt", "studentId", "studentName", status ('PENDING'|'CONFIRMED'|'EXCUSED'|'DISMISSED'), "confirmedBy", note
       - "TurnstileAlert": id, "deviceType" ('CANTEEN'|'MOSQUE'|'GATE'), "studentId", "studentName", "attemptedType", reason, timestamp
       - "LessonSession": id, "groupId", "subjectName", "lessonDate", status
       - "Task": id, title, description, priority, status, deadline, "createdAt"
     * database="moliya":
       - "Expense": id, title, description, amount, currency, "amountInDefault", date, status ('PENDING'|'APPROVED'|'PAID'|'REJECTED'), "rejectionReason", "employeeId", "categoryId", "officeId", "deletedAt", "createdAt"
       - "Employee": id, "fullName", username, department, position, "officeId", "deletedAt"
       - "Wallet": id, "employeeId", balance, "pendingAmount", "totalAssigned", "totalSpent"
       - "WalletTransaction": id, "walletId", type ('ASSIGNMENT'|'EXPENSE'|'ADJUSTMENT'), amount, description, "createdAt"
       - "Income": id, source, description, amount, currency, "amountInDefault", date
       - "Category": id, name, "isActive"
       - "Office": id, name, currency

3. MA'LUMOT KIRITISH VA O'ZGARTIRISH (TASDIQ SO'RASH ORQALI):
   - Agar foydalanuvchi yangi ma'lumot qo'shishni yoki mavjud ma'lumotni o'zgartirishni so'rasa (masalan: to'lov kiritish, talaba ma'lumotini o'zgartirish, yangi talaba/xarajat/guruh/vazifa qo'shish, hamyonga pul o'tkazish):
     1) Avval kerak bo'lsa "query_database" orqali o'sha talaba yoki xodimning aniq id raqamini va joriy holatini topib ol.
     2) So'ngra "propose_data_change" vositasini chaqirib, o'zgarishni tayyorla va foydalanuvchidan tasdiqlashni so'ra!`;

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "system", content: `Tizimning joriy va arxiv yig'ma holati:\n${JSON.stringify(snapshotForAi)}` },
        ...history.map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: String(m.text || m.content || ""),
        })),
        { role: "user", content: question },
      ];

      let pendingAction = null;
      let finalAnswer = "";

      for (let step = 0; step < 4; step++) {
        const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.15,
            messages,
            tools,
            tool_choice: "auto",
          }),
        });

        const aiJson = await aiRes.json();
        const msg = aiJson?.choices?.[0]?.message;
        if (!msg) break;

        messages.push(msg);

        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          finalAnswer = msg.content || "";
          break;
        }

        for (const tc of msg.tool_calls) {
          const fnName = tc.function?.name;
          let args = {};
          try {
            args = JSON.parse(tc.function?.arguments || "{}");
          } catch {}

          if (fnName === "query_database") {
            const sql = String(args.sql || "").trim().replace(/;+\s*$/, "");
            if (
              !/^SELECT\b/i.test(sql) ||
              sql.includes(";") ||
              /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|COPY|SET|pg_sleep|pg_terminate_backend|pg_cancel_backend|lo_)\b/i.test(sql)
            ) {
              messages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify({ error: "Faqat xavfsiz SELECT so'roviga ruxsat berilgan. O'zgartirish uchun propose_data_change vositasini ishlating." }),
              });
            } else {
              const dbUrl = args.database === "moliya" ? erpEnv.DATABASE_URL : crmEnv.DATABASE_URL;
              const rows = (await queryPgJson(dbUrl, sql)).slice(0, 150);
              messages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify({ count: rows.length, rows }),
              });
            }
          } else if (fnName === "propose_data_change") {
            pendingAction = {
              id: "act-" + Date.now(),
              actionType: args.actionType,
              title: args.title || "Ma'lumotni saqlash",
              summary: args.summary || "Ushbu ma'lumotni tizimga kiritishni tasdiqlaysizmi?",
              fields: Array.isArray(args.fields) ? args.fields : [],
              payload: args.payload || {},
            };
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({
                status: "TAYYORLANDI_TASDIQ_KUTILMOQDA",
                message: "Tasdiqlash kartochkasi foydalanuvchi ekraniga chiqarildi. Foydalanuvchiga ma'lumot tayyorlanganini va 'Tasdiqlash va kiritish' tugmasini bosishi mumkinligini ayt.",
              }),
            });
          }
        }
      }

      if (!finalAnswer && pendingAction) {
        finalAnswer = `**${pendingAction.title}** bo'yicha ma'lumotlar tayyorlandi.\n\n${pendingAction.summary}\n\nQuyidagi **«Tasdiqlash va kiritish»** tugmasini bossangiz, ma'lumot darhol tizimga kiritiladi.`;
      }

      return sendJson(res, 200, {
        answer: finalAnswer || "Ma'lumot tayyorlandi.",
        pendingAction,
      });
    }

    if (pathname === "/fin-api/ai/execute-action" && method === "POST") {
      const body = await readJsonBody(req);
      const { actionType, payload } = body || {};
      if (!actionType || !payload) {
        return sendJson(res, 400, { error: "Amal ma'lumotlari to'liq emas." });
      }

      if (actionType === "record_payment") {
        const studentId = String(payload.studentId || "");
        if (!studentId) return sendJson(res, 400, { error: "Talaba tanlanmagan." });
        const amount = Number(payload.amount || 0);
        const paymentMethod = payload.paymentMethod || "naqt";
        const paidAt = payload.paidAt || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
        const nextDueDate = payload.nextDueDate || payload.paidUntilDate || null;
        const note = payload.note || "Aqlli yordamchi orqali kiritildi";

        const data = await crmRequest(
          `mutation AiRecordPayment($input: RecordPaymentInput!) {
            recordPayment(input: $input) {
              success
              message
              student {
                id fullname totalPayment paidAmount remainingAmount paidUntilDate
              }
            }
          }`,
          {
            input: {
              studentId,
              amount,
              paymentMethod,
              paidAt,
              ...(nextDueDate ? { nextDueDate } : {}),
              note,
            },
          },
          sess.crmToken
        );
        const st = data?.recordPayment?.student;
        return sendJson(res, 200, {
          success: true,
          message: `${st?.fullname || "Talaba"} uchun $${amount.toLocaleString("en-US")} to'lov muvaffaqiyatli kiritildi! Qolgan qarz: $${Number(st?.remainingAmount || 0).toLocaleString("en-US")}.`,
        });
      }

      if (actionType === "update_student") {
        const id = Number(payload.id || payload.studentId || 0);
        if (!id) return sendJson(res, 400, { error: "Talaba aniqlanmadi." });
        const sets = ['"updatedAt" = NOW()'];
        if (payload.fullname) sets.push(`fullname = ${sqlStr(String(payload.fullname).trim())}`);
        if (payload.phone !== undefined) sets.push(`phone = ${sqlStr(String(payload.phone).trim())}`);
        if (payload.uzbPhone !== undefined) sets.push(`"uzbPhone" = ${sqlStr(String(payload.uzbPhone).trim())}`);
        if (payload.turkPhone !== undefined) sets.push(`"turkPhone" = ${sqlStr(String(payload.turkPhone).trim())}`);
        if (payload.studyPlace) sets.push(`"studyPlace" = ${sqlStr(String(payload.studyPlace).trim())}`);
        if (payload.roomNumber !== undefined) sets.push(`"roomNumber" = ${sqlStr(String(payload.roomNumber).trim())}`);
        if (payload.paidUntilDate) sets.push(`"paidUntilDate" = ${sqlStr(String(payload.paidUntilDate).slice(0, 10))}`);
        if (payload.groupId !== undefined) sets.push(`"groupId" = ${payload.groupId ? Number(payload.groupId) : "NULL"}`);
        if (payload.totalPayment !== undefined) {
          const tp = Number(payload.totalPayment || 0);
          sets.push(`"totalPayment" = ${tp}`);
          sets.push(`"remainingAmount" = GREATEST(0, ${tp} - COALESCE("paidAmount", 0))`);
        }
        if (payload.plannedPayment !== undefined) {
          sets.push(`"plannedPayment" = ${Number(payload.plannedPayment || 0)}`);
        }
        await execPgSql(crmEnv.DATABASE_URL, `UPDATE "Student" SET ${sets.join(", ")} WHERE id = ${id};`);
        const stRow = (await queryPgJson(crmEnv.DATABASE_URL, `SELECT fullname FROM "Student" WHERE id = ${id} LIMIT 1`));
        return sendJson(res, 200, {
          success: true,
          message: `${stRow[0]?.fullname || "Talaba"} ma'lumotlari muvaffaqiyatli yangilandi!`,
        });
      }

      if (actionType === "create_student") {
        const rand = Math.floor(1000 + Math.random() * 9000);
        const fullname = String(payload.fullname || "Yangi Talaba").trim();
        const username = String(payload.username || ("talaba_" + rand)).trim();
        const gender = payload.gender === "FEMALE" ? "FEMALE" : "MALE";
        const phone = String(payload.phone || "+905000000000").trim();
        const studyPlace = String(payload.studyPlace || "Akademiya").trim();
        const totalPayment = Number(payload.totalPayment || 0);
        const groupId = payload.groupId ? Number(payload.groupId) : null;
        const defaultHash = "$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi";
        await execPgSql(
          crmEnv.DATABASE_URL,
          `INSERT INTO "Student" (username, "passwordHash", fullname, gender, phone, "groupId", "studyPlace", "totalPayment", "paidAmount", "remainingAmount", "isActive", "isDeleted", "isArchived", "createdAt", "updatedAt")
           VALUES (${sqlStr(username)}, ${sqlStr(defaultHash)}, ${sqlStr(fullname)}, ${sqlStr(gender)}::"Gender", ${sqlStr(phone)}, ${groupId !== null ? groupId : "NULL"}, ${sqlStr(studyPlace)}, ${totalPayment}, 0, ${totalPayment}, true, false, false, NOW(), NOW());`
        );
        return sendJson(res, 200, {
          success: true,
          message: `Yangi talaba (${fullname}) muvaffaqiyatli ro'yxatga olindi!`,
        });
      }

      if (actionType === "create_expense") {
        const cur = !payload.currency || payload.currency === "TRY" ? "TL" : payload.currency;
        const expPayload = {
          title: String(payload.title || payload.description || "Xarajat").trim(),
          description: String(payload.description || payload.title || "Xarajat").trim(),
          amount: Number(payload.amount || 0),
          currency: cur,
          ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
          date: payload.date || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date()),
        };
        await erpRequest("POST", "/expenses", { body: expPayload, token: sess.erpToken });
        return sendJson(res, 200, {
          success: true,
          message: `Yangi xarajat (${expPayload.description} — ₺${expPayload.amount.toLocaleString("tr-TR")}) muvaffaqiyatli kiritildi!`,
        });
      }

      if (actionType === "approve_expense" || actionType === "pay_expense" || actionType === "void_expense") {
        const expenseId = payload.expenseId || payload.id;
        const act = actionType === "approve_expense" ? "approve" : actionType === "pay_expense" ? "pay" : "void";
        await erpRequest("POST", `/expenses/${expenseId}/${act}`, {
          body: act === "void" ? { reason: payload.reason || "Rahbar tasdig'i bilan bekor qilindi" } : {},
          token: sess.erpToken,
        });
        return sendJson(res, 200, {
          success: true,
          message: "Xarajat holati muvaffaqiyatli yangilandi!",
        });
      }

      if (actionType === "assign_wallet") {
        const employeeId = payload.employeeId;
        const amount = Number(payload.amount || 0);
        const description = payload.description || "Hamyonga mablag' ajratildi";
        await erpRequest("POST", `/wallets/${employeeId}/assign`, {
          body: { amount, description },
          token: sess.erpToken,
        });
        return sendJson(res, 200, {
          success: true,
          message: `Xodim hamyoniga ₺${amount.toLocaleString("tr-TR")} muvaffaqiyatli o'tkazildi!`,
        });
      }

      if (actionType === "create_group") {
        const input = {
          name: String(payload.name || "Yangi Guruh"),
          gender: payload.gender === "FEMALE" ? "FEMALE" : "MALE",
          studyPlace: payload.studyPlace || "Akademiya",
          institutionType: payload.institutionType || "ACADEMY",
        };
        const data = await crmRequest(
          `mutation AiCreateGroup($input: CreateGroupInput!) {
            createGroup(input: $input) { id name }
          }`,
          { input },
          sess.crmToken
        );
        return sendJson(res, 200, {
          success: true,
          message: `Yangi guruh (${data?.createGroup?.name}) muvaffaqiyatli ochildi!`,
        });
      }

      if (actionType === "create_task") {
        const floorMap = {
          "1": "FIRST_FLOOR",
          "2": "SECOND_FLOOR",
          "3": "THIRD_FLOOR",
          FIRST_FLOOR: "FIRST_FLOOR",
          SECOND_FLOOR: "SECOND_FLOOR",
          THIRD_FLOOR: "THIRD_FLOOR",
          ALL_FLOORS: "ALL_FLOORS",
        };
        const floorEnum = floorMap[String(payload.floor || "ALL_FLOORS").toUpperCase()] || "ALL_FLOORS";
        const input = {
          title: String(payload.title || "Yangi vazifa"),
          description: String(payload.description || ""),
          priority: payload.priority || "MEDIUM",
          floor: floorEnum,
        };
        await crmRequest(
          `mutation AiCreateTask($input: CreateTaskInput!) {
            createTask(input: $input) { id title }
          }`,
          { input },
          sess.crmToken
        );
        return sendJson(res, 200, {
          success: true,
          message: `Yangi vazifa (${input.title}) muvaffaqiyatli qo'shildi!`,
        });
      }

      return sendJson(res, 400, { error: "Noma'lum amal turi: " + actionType });
    }


    // =========================================================================
    // UNIFIED CRM + ERP MODULES (Academic, Campus, HR, System, Direct Proxies)
    // =========================================================================

    if (pathname === "/fin-api/crm/graphql" && method === "POST") {
      if (!sess.crmToken) return sendJson(res, 403, { error: "CRM tizimiga ulanilmagan" });
      const body = await readJsonBody(req);
      const data = await crmRequest(body.query, body.variables || {}, sess.crmToken);
      return sendJson(res, 200, { data });
    }

    if (pathname === "/fin-api/erp/proxy" && method === "POST") {
      if (!sess.erpToken) return sendJson(res, 403, { error: "ERP tizimiga ulanilmagan" });
      const body = await readJsonBody(req);
      const data = await erpRequest(body.method || "GET", body.path || "/", {
        query: body.query || undefined,
        body: body.body || undefined,
        token: sess.erpToken,
      });
      return sendJson(res, 200, data);
    }

    if (pathname === "/fin-api/academic/overview" && method === "GET") {
      if (!sess.crmToken) return sendJson(res, 403, { error: "CRM tizimiga ulanilmagan" });
      const genderWhereSql = (!access.isDirector && access.gender) ? `WHERE s.gender::text = ${sqlStr(access.gender)}` : "";

      const allStudents = (await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT
          s.id::text AS id,
          s.username,
          s.fullname,
          s."profilePicture",
          s.phone,
          s."uzbPhone",
          s."turkPhone",
          s."tgUsername",
          s.gender,
          s."birthDate",
          s."fatherFullname",
          s."fatherPhone",
          s."motherFullname",
          s."motherPhone",
          s."studyPlace",
          s."courseYear",
          s."roomNumber",
          s.address,
          s."passportNumber",
          s."hasIqoma",
          s."iqomaNumber",
          s."iqomaIssueDate",
          s."iqomaExpiryDate",
          s."arrivalDate",
          COALESCE(s."totalPayment", 0)::float AS "totalPayment",
          COALESCE(s."paidAmount", 0)::float AS "paidAmount",
          COALESCE(s."remainingAmount", 0)::float AS "remainingAmount",
          s."paidUntilDate",
          s."plannedPayment",
          s."paidMonths",
          s."isActive",
          s."isArchived",
          s."isDeleted",
          s."isBlacklisted",
          s."blacklistReason",
          s."createdAt",
          s."groupId"::text AS "groupId",
          CASE WHEN COALESCE(s."studyPlace", '') LIKE '2025-2026%' OR s."isActive" = false THEN '2025-2026' ELSE '2026-2027' END AS "academicYearName",
          CASE
            WHEN s."isDeleted" = true THEN 'DELETED'
            WHEN s."isActive" = false OR COALESCE(s."studyPlace", '') LIKE '2025-2026%' THEN 'ARCHIVED_YEAR'
            ELSE 'ACTIVE'
          END AS "archiveStatus",
          CASE WHEN g.id IS NOT NULL THEN json_build_object(
            'id', g.id::text,
            'name', g.name,
            'studyPlace', g."studyPlace",
            'institutionType', g."institutionType"
          ) ELSE NULL END AS "group",
          GREATEST(0, COALESCE(s."paidAmount", 0) - COALESCE(s."totalPayment", 0))::float AS "overpaidAmount"
        FROM "Student" s
        LEFT JOIN "Group" g ON g.id = s."groupId"
        ${genderWhereSql}
        ORDER BY s."isDeleted" ASC, s."isActive" DESC, s.fullname ASC`
      ));

      const studentStats = {
        totalAll: allStudents.length,
        activeCount: allStudents.filter((s) => s.archiveStatus === "ACTIVE").length,
        archivedYearCount: allStudents.filter((s) => s.archiveStatus === "ARCHIVED_YEAR").length,
        deletedCount: allStudents.filter((s) => s.archiveStatus === "DELETED").length,
      };

      const [crmData, extraData] = await Promise.all([
        crmRequest(
          `query AcademicMain {
            getExpiringIqomaStudents {
              id fullname phone gender hasIqoma iqomaNumber iqomaExpiryDate
              group { id name }
            }
            getGroups {
              id name description gender studyPlace institutionType teacherId
              teacher { id fullname phone }
              isActive studentsCount totalPayment paidAmount remainingAmount debtorsCount
            }
            getTeachers {
              id username fullname phone tgUsername gender birthDate isActive createdAt
            }
            getAcademicYears {
              id name startDate endDate isActive isClosed studentsCount groupsCount coursesCount
            }
          }`,
          {},
          sess.crmToken
        ).catch(() => ({})),
        crmRequest(
          `query AcademicExtra {
            getDegrees { id name }
            getLessonSessions {
              id groupId subjectName lessonDate lessonOrder status startedAt endedAt
              group { id name gender studyPlace }
              attendances {
                id studentId isPresent reason notes
                student { id fullname phone }
              }
            }
            getDashboardStats {
              totalStudents activeStudents totalTeachers activeTeachers
              totalAdmins activeAdmins todayMeals expiringIqomaCount
              totalDebtors totalDebtAmount
            }
          }`,
          {},
          sess.crmToken
        ).catch(() => ({})),
      ]);

      const rawYears = crmData?.getAcademicYears || [];
      const has2025 = rawYears.some((y) => String(y.name || y.year).includes("2025-2026"));
      const academicYears = [
        ...rawYears.map((y) => ({ ...y, year: y.name || y.year })),
        ...(has2025 ? [] : [{ id: "arch-2025", name: "2025-2026", year: "2025-2026", isActive: false, isClosed: true, studentsCount: studentStats.archivedYearCount }]),
      ];

      const allCards = (await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT id, "studentId"::text AS "studentId", "cardId", "cardNumber", "studentName", "isActive", "createdAt" FROM "StudentCard" ORDER BY id DESC`
      ));
      const cardByStudent = new Map();
      for (const c of allCards) cardByStudent.set(String(c.studentId), c);

      const allComments = (await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT id, "studentId"::text AS "studentId", text, "authorName", "authorType", "createdAt" FROM "StudentComment" ORDER BY "createdAt" DESC`
      ));
      const commentsByStudent = new Map();
      for (const cm of allComments) {
        const k = String(cm.studentId);
        if (!commentsByStudent.has(k)) commentsByStudent.set(k, []);
        commentsByStudent.get(k).push(cm);
      }

      const allPayments = (await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT id, "studentId"::text AS "studentId", amount::float AS amount, method, "paidAt", note, source, "receivedByName", "voidedAt", "voidReason" FROM "StudentPayment" ORDER BY "paidAt" DESC, id DESC`
      ));
      const paymentsByStudent = new Map();
      for (const pm of allPayments) {
        const k = String(pm.studentId);
        if (!paymentsByStudent.has(k)) paymentsByStudent.set(k, []);
        paymentsByStudent.get(k).push(pm);
      }

      const enrichedStudents = allStudents.map((st) => ({
        ...st,
        card: cardByStudent.get(String(st.id)) || null,
        comments: commentsByStudent.get(String(st.id)) || [],
        payments: paymentsByStudent.get(String(st.id)) || [],
      }));

      const teacherGenderCond = (!access.isDirector && access.gender) ? `WHERE gender::text = ${sqlStr(access.gender)}` : "";
      const dbTeachers = (await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT id::text AS id, username, fullname, phone, "tgUsername", gender::text AS gender, "birthDate", "isActive", "isDeleted", "createdAt" FROM "Teacher" ${teacherGenderCond} ORDER BY "isDeleted" ASC, id DESC`
      ));

      const rawGroups = crmData?.getGroups || [];
      const filteredGroups = (!access.isDirector && access.gender)
        ? rawGroups.filter((g) => g.gender === access.gender)
        : rawGroups;
      const rawExpiring = crmData?.getExpiringIqomaStudents || [];
      const filteredExpiring = (!access.isDirector && access.gender)
        ? rawExpiring.filter((s) => s.gender === access.gender)
        : rawExpiring;
      const rawSessions = extraData?.getLessonSessions || [];
      const filteredSessions = (!access.isDirector && access.gender)
        ? rawSessions.filter((ls) => !ls.group?.gender || ls.group.gender === access.gender)
        : rawSessions;

      return sendJson(res, 200, {
        students: enrichedStudents,
        studentStats,
        studentCards: allCards,
        studentComments: allComments,
        expiringIqoma: filteredExpiring,
        groups: filteredGroups,
        teachers: dbTeachers.length > 0 ? dbTeachers : (crmData?.getTeachers || []),
        academicYears,
        degrees: extraData?.getDegrees || [],
        lessonSessions: filteredSessions.slice(0, 100),
        stats: extraData?.getDashboardStats || null,
      });
    }

    if (pathname === "/fin-api/campus/overview" && method === "GET") {
      if (!sess.crmToken) return sendJson(res, 403, { error: "CRM tizimiga ulanilmagan" });
      const date = url.searchParams.get("date") || new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());

      const [canteenData, mosqueData, opsData, zktecoStatus] = await Promise.all([
        crmRequest(
          `query CampusCanteen($date: String!) {
            getMealStats(date: $date) {
              totalMeals breakfast lunch dinner
            }
            getCanteenStudents(date: $date) {
              id studentId studentName username cardId cardNumber isActive hasCard
              totalMeals todayBreakfast todayLunch todayDinner todayMealsCount
            }
            getCanteenEmployees(date: $date) {
              id employeeId employeeName position cardId cardNumber isActive hasCard
              totalMeals todayBreakfast todayLunch todayDinner todayMealsCount
            }
            getMealRecords(date: $date) {
              id studentId studentName cardId mealType timestamp
            }
          }`,
          { date },
          sess.crmToken
        ).catch(() => ({})),
        crmRequest(
          `query CampusMosque($date: String!) {
            getPrayerStats(date: $date) {
              totalPrayers fajr dhuhr asr maghrib isha
            }
            getMosqueStudents(date: $date) {
              id studentId studentName username cardId cardNumber isActive hasCard
              totalPrayers todayFajr todayDhuhr todayAsr todayMaghrib todayIsha todayPrayersCount
            }
            getPrayerRecords(date: $date) {
              id studentId studentName cardId prayerType timestamp
            }
            getPrayerTimeConfigs {
              id prayerType startTime endTime isActive
            }
          }`,
          { date },
          sess.crmToken
        ).catch(() => ({})),
        crmRequest(
          `query CampusOps {
            getPhoneCycles {
              id groupId weekStart weekEnd isActive closedAt
              group { id name studyPlace }
            }
            getDutyStats {
              totalDuties pendingDuties completedDuties automaticDuties manualDuties
            }
            getDutyRecords(page: 1, limit: 100) {
              total
              dutyRecords {
                id studentId institution class supervisorType supervisorName
                reason dutyDate status isAutomatic
                student { fullname studyPlace group { name } }
              }
            }
            getRooms {
              id roomNumber floor capacity studyPlace status description studentsCount
              students { id fullname phone }
            }
          }`,
          {},
          sess.crmToken
        ).catch(() => ({})),
        fetch("http://127.0.0.1:4000/api/zkteco/status")
          .then((r) => r.json())
          .catch(() => null),
      ]);

      // Fetch rooms directly from PostgreSQL with assigned active students
      const dbRooms = await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT r.id::text AS id, r."roomNumber", r.floor, r.capacity, r."studyPlace", r.status::text AS status, r.description,
                COALESCE(
                  json_agg(json_build_object('id', s.id::text, 'fullname', s.fullname, 'phone', s.phone, 'studyPlace', s."studyPlace"))
                  FILTER (WHERE s.id IS NOT NULL),
                  '[]'::json
                ) AS students,
                COUNT(s.id)::int AS "studentsCount"
         FROM "Room" r
         LEFT JOIN "Student" s ON s."roomNumber" = r."roomNumber" AND s."isDeleted" = false AND s."isActive" = true
         WHERE r."isDeleted" = false
         GROUP BY r.id
         ORDER BY r.floor ASC, r."roomNumber" ASC`
      );

      // Fetch phone cycles directly from PostgreSQL with record counts
      const dbPhoneCycles = await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT pc.id::text AS id, pc."groupId"::text AS "groupId", pc."weekStart", pc."weekEnd", pc."isActive", pc."closedAt",
                CASE WHEN g.id IS NOT NULL THEN json_build_object('id', g.id::text, 'name', g.name, 'studyPlace', g."studyPlace") ELSE NULL END AS "group",
                COUNT(pr.id)::int AS "totalRecords",
                COUNT(pr.id) FILTER (WHERE pr.status = 'SUBMITTED')::int AS "submittedCount",
                COUNT(pr.id) FILTER (WHERE pr.status <> 'SUBMITTED')::int AS "notSubmittedCount"
         FROM "PhoneCycle" pc
         LEFT JOIN "Group" g ON g.id = pc."groupId"
         LEFT JOIN "PhoneRecord" pr ON pr."cycleId" = pc.id
         GROUP BY pc.id, g.id
         ORDER BY pc."isActive" DESC, pc.id DESC
         LIMIT 100`
      );

      // Fetch archive of MealRecords and PrayerRecords across all dates
      const mealArchive = (await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT m.id, m."studentId", COALESCE(s.fullname, 'Talaba #' || m."studentId") AS "studentName",
                s."studyPlace", m."cardId", m."mealType", m.timestamp
         FROM "MealRecord" m
         LEFT JOIN "Student" s ON s.id = m."studentId"
         ORDER BY m.timestamp DESC
         LIMIT 300`
      ));

      const mealByDateSummary = (await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT TO_CHAR(m.timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE m."mealType" = 'BREAKFAST')::int AS breakfast,
                COUNT(*) FILTER (WHERE m."mealType" = 'LUNCH')::int AS lunch,
                COUNT(*) FILTER (WHERE m."mealType" = 'DINNER')::int AS dinner
         FROM "MealRecord" m
         GROUP BY 1
         ORDER BY 1 DESC
         LIMIT 60`
      ));

      return sendJson(res, 200, {
        date,
        mealStats: canteenData?.getMealStats || { totalMeals: 0, breakfast: 0, lunch: 0, dinner: 0 },
        canteenStudents: canteenData?.getCanteenStudents || [],
        canteenEmployees: canteenData?.getCanteenEmployees || [],
        mealRecords: (canteenData?.getMealRecords || []).slice(0, 100),
        mealArchive,
        mealByDateSummary,
        prayerStats: mosqueData?.getPrayerStats || { totalPrayers: 0, fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
        mosqueStudents: mosqueData?.getMosqueStudents || [],
        prayerRecords: (mosqueData?.getPrayerRecords || []).slice(0, 100),
        prayerConfigs: mosqueData?.getPrayerTimeConfigs || [],
        phoneCycles: dbPhoneCycles.length > 0 ? dbPhoneCycles : (opsData?.getPhoneCycles || []),
        dutyStats: opsData?.getDutyStats || null,
        dutyRecords: opsData?.getDutyRecords?.dutyRecords || [],
        rooms: dbRooms.length > 0 ? dbRooms : (opsData?.getRooms || []),
        zktecoStatus,
      });
    }

    if (pathname === "/fin-api/hr/overview" && method === "GET") {
      const empFilterSql = (!access.isDirector && access.employeeId) ? `WHERE e.id = ${sqlStr(access.employeeId)}` : "";
      const allErpEmployees = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT e.id, e."userId", e."officeId", e."fullName", e.username, e.phone,
                e.position, e.department, e."employeeCode", e.status, e."createdAt", e."deletedAt",
                u.email, u.role,
                o.name AS "officeName",
                COALESCE(w.balance, 0) AS "walletBalance",
                COALESCE(w."pendingAmount", 0) AS "walletPending",
                COALESCE(w."totalAssigned", 0) AS "walletTotalAssigned",
                COALESCE(w."totalSpent", 0) AS "walletTotalSpent"
         FROM "Employee" e
         LEFT JOIN "User" u ON u.id = e."userId"
         LEFT JOIN "Office" o ON o.id = e."officeId"
         LEFT JOIN "Wallet" w ON w."employeeId" = e.id
         ${empFilterSql}
         ORDER BY e."deletedAt" NULLS FIRST, e."createdAt" DESC`
      ));

      const allCrmEmployees = (await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT id, fullname, username, "uzbPhone", "turkPhone", "tgUsername",
                position, "passportNumber", "birthYear", "startDate", "isActive", "isDeleted", "createdAt"
         FROM "Employee"
         ORDER BY "isDeleted" ASC, "isActive" DESC, id DESC`
      ));

      const [erpOffRes, crmHrData] = await Promise.all([
        sess.erpToken
          ? erpRequest("GET", "/offices", { token: sess.erpToken }).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
        sess.crmToken
          ? crmRequest(
              `query CrmHrTasks {
                getTasks(page: 1, pageSize: 100) {
                  total
                  tasks {
                    id title description floor priority status deadline isOverdue
                    createdAt startedAt completedAt
                    assignedTo { id fullname position }
                    createdBy { id fullname }
                  }
                }
              }`,
              {},
              sess.crmToken
            ).catch(() => ({}))
          : Promise.resolve({}),
      ]);

      return sendJson(res, 200, {
        erpEmployees: allErpEmployees,
        erpOffices: Array.isArray(erpOffRes?.data) ? erpOffRes.data : erpOffRes?.data?.items || [],
        crmEmployees: allCrmEmployees,
        tasks: crmHrData?.getTasks?.tasks || [],
      });
    }

    if (pathname === "/fin-api/system/overview" && method === "GET") {
      const expFilterSql = (!access.isDirector && access.employeeId) ? `WHERE ex."employeeId" = ${sqlStr(access.employeeId)}` : "";
      const allErpExpensesArchive = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT ex.id, ex.title, COALESCE(ex.description, ex.title) AS description,
                ex.amount::float AS amount, ex.currency, COALESCE(ex."amountInDefault", ex.amount)::float AS "amountInDefault",
                ex.status, ex."rejectionReason", ex.date, ex.date AS "expenseDate", ex."createdAt", ex."deletedAt",
                c.name AS "categoryName",
                emp."fullName" AS "employeeName",
                o.name AS "officeName"
         FROM "Expense" ex
         LEFT JOIN "Category" c ON c.id = ex."categoryId"
         LEFT JOIN "Employee" emp ON emp.id = ex."employeeId"
         LEFT JOIN "Office" o ON o.id = ex."officeId"
         ${expFilterSql}
         ORDER BY ex.date DESC, ex."createdAt" DESC
         LIMIT 300`
      ));

      const txFilterSql = (!access.isDirector && access.employeeId) ? `WHERE w."employeeId" = ${sqlStr(access.employeeId)}` : "";
      const allErpTransactions = (await queryPgJson(
        erpEnv.DATABASE_URL,
        `SELECT wt.id, wt."walletId", wt.type, wt.amount::float AS amount, wt.description, wt."createdAt",
                emp."fullName" AS "employeeName"
         FROM "WalletTransaction" wt
         LEFT JOIN "Wallet" w ON w.id = wt."walletId"
         LEFT JOIN "Employee" emp ON emp.id = w."employeeId"
         ${txFilterSql}
         ORDER BY wt."createdAt" DESC
         LIMIT 300`
      ));

      const allErpAuditLogs = access.isDirector
        ? (await queryPgJson(
            erpEnv.DATABASE_URL,
            `SELECT a.id, a."actorId", a.action, a."entityType", a."entityId", a."createdAt",
                    u.email AS "actorEmail"
             FROM "AuditLog" a
             LEFT JOIN "User" u ON u.id = a."actorId"
             ORDER BY a."createdAt" DESC
             LIMIT 200`
          ))
        : [];

      const allCrmAuditLogs = access.isDirector
        ? (await queryPgJson(
            crmEnv.DATABASE_URL,
            `SELECT id::text AS id, "eventType", "userType", username, "ipAddress", "mutationName", timestamp, "createdAt"
             FROM "AuditLog"
             ORDER BY timestamp DESC
             LIMIT 200`
          ))
        : [];

      const dbAdmins = await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT id::text AS id, username, fullname, "birthDate", phone, "tgUsername", gender::text AS gender,
                "isActive", "allowedPages", "readOnlyPages", "createdAt"
         FROM "Admin"
         WHERE "isDeleted" = false
         ORDER BY id ASC`
      );
      const parsedAdmins = dbAdmins.map((a) => ({
        ...a,
        allowedPages: parseJsonArraySafe(a.allowedPages),
        readOnlyPages: parseJsonArraySafe(a.readOnlyPages),
      }));

      const dbRoots = await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT id::text AS id, username, fullname, "allowedPages", "readOnlyPages", "createdAt"
         FROM "Root"
         ORDER BY id ASC`
      );

      const [erpCatRes, erpOffRes, erpNotifRes, crmSysData] = await Promise.all([
        queryPgJson(erpEnv.DATABASE_URL, `SELECT id, name, description, "isDefault", "createdAt" FROM "Category" ORDER BY name ASC`),
        queryPgJson(erpEnv.DATABASE_URL, `SELECT id, name, description, "createdAt" FROM "Office" ORDER BY name ASC`),
        sess.erpToken
          ? erpRequest("GET", "/notifications", { query: { limit: 100 }, token: sess.erpToken }).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
        sess.crmToken
          ? crmRequest(
              `query CrmSystem {
                getAcademicYears {
                  id name startDate endDate isActive isClosed closedAt
                  studentsCount groupsCount coursesCount
                }
                getArchivedYears {
                  id name closedAt studentsCount groupsCount coursesCount
                  employeesCount totalPayments
                }
              }`,
              {},
              sess.crmToken
            ).catch(() => ({}))
          : Promise.resolve({}),
      ]);

      return sendJson(res, 200, {
        erpCategories: erpCatRes || [],
        erpOffices: erpOffRes || [],
        erpNotifications: Array.isArray(erpNotifRes?.data) ? erpNotifRes.data : erpNotifRes?.data?.items || [],
        erpAuditLogs: allErpAuditLogs,
        erpTransactions: allErpTransactions,
        erpWalletTxArchive: allErpTransactions,
        erpExpensesArchive: allErpExpensesArchive,
        crmAdmins: parsedAdmins,
        crmRoots: dbRoots,
        crmAcademicYears: crmSysData?.getAcademicYears || [],
        crmArchivedYears: crmSysData?.getArchivedYears || [],
        crmAuditLogs: allCrmAuditLogs,
        syncLogs: (await queryPgJson(
          crmEnv.DATABASE_URL,
          `SELECT sl.id, sl."studentId", sl.direction, sl.status, sl."errorMessage", sl."operationType", sl.timestamp, sl."createdAt", s.fullname AS "studentName"
           FROM "SyncLog" sl
           LEFT JOIN "Student" s ON s.id = sl."studentId"
           ORDER BY sl.id DESC
           LIMIT 150`
        )),
      });
    }

    // --- PHASE 2 CRUD: ROOMS, DUTY, PHONE CYCLES, ADMINS ---
    if (pathname === "/fin-api/campus/rooms/save" && method === "POST") {
      const body = await readJsonBody(req);
      const id = body.id ? Number(body.id) : null;
      const roomNumber = String(body.roomNumber || "").trim();
      if (!roomNumber) return sendJson(res, 400, { error: "Xona raqamini kiriting" });
      const floor = Number(body.floor || 1);
      const capacity = Number(body.capacity || 4);
      const studyPlace = String(body.studyPlace || "Akademiya").trim();
      const status = ["AVAILABLE", "FULL", "MAINTENANCE"].includes(String(body.status || "").toUpperCase())
        ? String(body.status).toUpperCase()
        : "AVAILABLE";
      const description = body.description ? String(body.description).trim() : null;

      if (id) {
        const oldRows = await queryPgJson(crmEnv.DATABASE_URL, `SELECT "roomNumber" FROM "Room" WHERE id = ${id} LIMIT 1`);
        const oldRoomNum = oldRows[0]?.roomNumber;
        await execPgSql(
          crmEnv.DATABASE_URL,
          `UPDATE "Room"
           SET "roomNumber" = ${sqlStr(roomNumber)},
               floor = ${floor},
               capacity = ${capacity},
               "studyPlace" = ${sqlStr(studyPlace)},
               status = ${sqlStr(status)}::"RoomStatus",
               description = ${sqlStr(description)},
               "isDeleted" = false,
               "updatedAt" = NOW()
           WHERE id = ${id};`
        );
        if (oldRoomNum && oldRoomNum !== roomNumber) {
          await execPgSql(
            crmEnv.DATABASE_URL,
            `UPDATE "Student" SET "roomNumber" = ${sqlStr(roomNumber)} WHERE "roomNumber" = ${sqlStr(oldRoomNum)};`
          );
        }
      } else {
        await execPgSql(
          crmEnv.DATABASE_URL,
          `INSERT INTO "Room" ("roomNumber", floor, capacity, "studyPlace", status, description, "isDeleted", "createdAt", "updatedAt")
           VALUES (${sqlStr(roomNumber)}, ${floor}, ${capacity}, ${sqlStr(studyPlace)}, ${sqlStr(status)}::"RoomStatus", ${sqlStr(description)}, false, NOW(), NOW())
           ON CONFLICT ("roomNumber")
           DO UPDATE SET floor = EXCLUDED.floor, capacity = EXCLUDED.capacity, "studyPlace" = EXCLUDED."studyPlace", status = EXCLUDED.status, description = EXCLUDED.description, "isDeleted" = false, "updatedAt" = NOW();`
        );
      }

      if (Array.isArray(body.studentIds)) {
        const cleanIds = body.studentIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
        await execPgSql(
          crmEnv.DATABASE_URL,
          `UPDATE "Student" SET "roomNumber" = NULL WHERE "roomNumber" = ${sqlStr(roomNumber)};`
        );
        if (cleanIds.length > 0) {
          await execPgSql(
            crmEnv.DATABASE_URL,
            `UPDATE "Student" SET "roomNumber" = ${sqlStr(roomNumber)} WHERE id IN (${cleanIds.join(",")});`
          );
        }
      }

      return sendJson(res, 200, { success: true, message: id ? "Xona ma'lumotlari yangilandi!" : "Yangi xona saqlandi!" });
    }

    const roomDelMatch = pathname.match(/^\/fin-api\/campus\/rooms\/(\d+)$/);
    if (roomDelMatch && method === "DELETE") {
      const roomId = Number(roomDelMatch[1]);
      const rRows = await queryPgJson(crmEnv.DATABASE_URL, `SELECT "roomNumber" FROM "Room" WHERE id = ${roomId} LIMIT 1`);
      const rNum = rRows[0]?.roomNumber;
      await execPgSql(crmEnv.DATABASE_URL, `UPDATE "Room" SET "isDeleted" = true, "updatedAt" = NOW() WHERE id = ${roomId};`);
      if (rNum) {
        await execPgSql(crmEnv.DATABASE_URL, `UPDATE "Student" SET "roomNumber" = NULL WHERE "roomNumber" = ${sqlStr(rNum)};`);
      }
      return sendJson(res, 200, { success: true, message: "Xona o'chirildi" });
    }

    if (pathname === "/fin-api/campus/duty/status" && method === "POST") {
      const body = await readJsonBody(req);
      const id = Number(body.id);
      const status = String(body.status || "COMPLETED").toUpperCase();
      if (!id) return sendJson(res, 400, { error: "Navbatchilik ID ko'rsatilmadi" });
      await execPgSql(
        crmEnv.DATABASE_URL,
        `UPDATE "DutyRecord" SET status = ${sqlStr(status)}, "updatedAt" = NOW() WHERE id = ${id};`
      );
      return sendJson(res, 200, { success: true, message: "Navbatchilik holati yangilandi!" });
    }

    const dutyDelMatch = pathname.match(/^\/fin-api\/campus\/duty\/(\d+)$/);
    if (dutyDelMatch && method === "DELETE") {
      const dutyId = Number(dutyDelMatch[1]);
      await execPgSql(crmEnv.DATABASE_URL, `DELETE FROM "DutyRecord" WHERE id = ${dutyId};`);
      return sendJson(res, 200, { success: true, message: "Navbatchilik yozuvi o'chirildi" });
    }

    if (pathname === "/fin-api/campus/phone-cycles/create" && method === "POST") {
      const body = await readJsonBody(req);
      const groupId = Number(body.groupId);
      if (!groupId) return sendJson(res, 400, { error: "Guruhni tanlang" });
      const now = new Date();
      const weekStart = body.weekStart ? new Date(body.weekStart).toISOString() : now.toISOString();
      const weekEnd = body.weekEnd ? new Date(body.weekEnd).toISOString() : new Date(now.getTime() + 7 * 86400000).toISOString();
      const inserted = await queryPgJson(
        crmEnv.DATABASE_URL,
        `INSERT INTO "PhoneCycle" ("groupId", "weekStart", "weekEnd", "isActive", "createdAt")
         VALUES (${groupId}, ${sqlStr(weekStart)}::timestamp, ${sqlStr(weekEnd)}::timestamp, true, NOW())
         RETURNING id`
      );
      const cycleId = inserted[0]?.id;
      if (cycleId) {
        await execPgSql(
          crmEnv.DATABASE_URL,
          `INSERT INTO "PhoneRecord" ("cycleId", "studentId", status, "createdAt", "updatedAt")
           SELECT ${cycleId}, s.id, 'NOT_SUBMITTED'::"PhoneStatus", NOW(), NOW()
           FROM "Student" s
           WHERE s."groupId" = ${groupId} AND s."isDeleted" = false AND s."isActive" = true
           ON CONFLICT ("cycleId", "studentId") DO NOTHING;`
        );
      }
      return sendJson(res, 201, { success: true, cycleId, message: "Yangi telefon yig'ish davri ochildi!" });
    }

    if (pathname === "/fin-api/campus/phone-cycles/close" && method === "POST") {
      const body = await readJsonBody(req);
      const cycleId = Number(body.cycleId || body.id);
      if (!cycleId) return sendJson(res, 400, { error: "Davr ID ko'rsatilmadi" });
      await execPgSql(
        crmEnv.DATABASE_URL,
        `UPDATE "PhoneCycle" SET "isActive" = false, "closedAt" = NOW() WHERE id = ${cycleId};`
      );
      return sendJson(res, 200, { success: true, message: "Telefon davri yopildi!" });
    }

    const phoneRecordsMatch = pathname.match(/^\/fin-api\/campus\/phone-cycles\/(\d+)\/records$/);
    if (phoneRecordsMatch && method === "GET") {
      const cycleId = Number(phoneRecordsMatch[1]);
      const cycRows = await queryPgJson(crmEnv.DATABASE_URL, `SELECT id, "groupId", "isActive" FROM "PhoneCycle" WHERE id = ${cycleId} LIMIT 1`);
      const cyc = cycRows[0];
      if (!cyc) return sendJson(res, 404, { error: "Telefon davri topilmadi" });
      // Ensure PhoneRecord rows exist for all active students in the group
      await execPgSql(
        crmEnv.DATABASE_URL,
        `INSERT INTO "PhoneRecord" ("cycleId", "studentId", status, "createdAt", "updatedAt")
         SELECT ${cycleId}, s.id, 'NOT_SUBMITTED'::"PhoneStatus", NOW(), NOW()
         FROM "Student" s
         WHERE s."groupId" = ${Number(cyc.groupId)} AND s."isDeleted" = false AND s."isActive" = true
         ON CONFLICT ("cycleId", "studentId") DO NOTHING;`
      );
      const records = await queryPgJson(
        crmEnv.DATABASE_URL,
        `SELECT pr.id::text AS id, pr."cycleId"::text AS "cycleId", pr."studentId"::text AS "studentId",
                pr.status::text AS status, pr.reason, pr."submittedAt",
                s.fullname AS "studentName", s.phone
         FROM "PhoneRecord" pr
         JOIN "Student" s ON s.id = pr."studentId"
         WHERE pr."cycleId" = ${cycleId}
         ORDER BY s.fullname ASC`
      );
      return sendJson(res, 200, { cycle: cyc, records });
    }

    const phoneToggleMatch = pathname.match(/^\/fin-api\/campus\/phone-cycles\/(\d+)\/toggle-student$/);
    if (phoneToggleMatch && method === "POST") {
      const cycleId = Number(phoneToggleMatch[1]);
      const body = await readJsonBody(req);
      const studentId = Number(body.studentId);
      const status = ["SUBMITTED", "NOT_SUBMITTED", "TEMP_CHECKOUT", "TEMP_NOT_RETURNED"].includes(String(body.status || "").toUpperCase())
        ? String(body.status).toUpperCase()
        : "SUBMITTED";
      const reason = body.reason ? String(body.reason).trim() : null;
      await execPgSql(
        crmEnv.DATABASE_URL,
        `INSERT INTO "PhoneRecord" ("cycleId", "studentId", status, reason, "submittedAt", "createdAt", "updatedAt")
         VALUES (${cycleId}, ${studentId}, ${sqlStr(status)}::"PhoneStatus", ${sqlStr(reason)}, ${status === "SUBMITTED" ? "NOW()" : "NULL"}, NOW(), NOW())
         ON CONFLICT ("cycleId", "studentId")
         DO UPDATE SET status = EXCLUDED.status, reason = COALESCE(EXCLUDED.reason, "PhoneRecord".reason), "submittedAt" = ${status === "SUBMITTED" ? "NOW()" : "NULL"}, "updatedAt" = NOW();`
      );
      return sendJson(res, 200, { success: true, message: "Talaba telefon holati yangilandi!" });
    }

    if (pathname === "/fin-api/system/admins/save" && method === "POST") {
      if (!access.isDirector) {
        return sendJson(res, 403, { error: "Ma'murlar va huquqlarni boshqarish faqat Direktor uchun ruxsat etilgan" });
      }
      const body = await readJsonBody(req);
      const id = body.id ? Number(body.id) : null;
      const fullname = String(body.fullname || "").trim();
      const username = String(body.username || "").trim();
      if (!fullname || !username) {
        return sendJson(res, 400, { error: "Ism-familiya va login kiritilishi shart" });
      }
      const phone = body.phone ? String(body.phone).trim() : null;
      const tgUsername = body.tgUsername ? String(body.tgUsername).trim() : null;
      const gender = body.gender === "FEMALE" ? "FEMALE" : "MALE";
      const isActive = body.isActive !== undefined ? Boolean(body.isActive) : true;
      const allowedPages = JSON.stringify(Array.isArray(body.allowedPages) ? body.allowedPages : []);
      const readOnlyPages = JSON.stringify(Array.isArray(body.readOnlyPages) ? body.readOnlyPages : []);
      const rawPassword = body.password ? String(body.password).trim() : "";
      const passwordHash = rawPassword ? bcrypt.hashSync(rawPassword, 10) : null;

      if (id) {
        await execPgSql(
          crmEnv.DATABASE_URL,
          `UPDATE "Admin"
           SET fullname = ${sqlStr(fullname)},
               username = ${sqlStr(username)},
               ${passwordHash ? `password = ${sqlStr(passwordHash)},` : ""}
               phone = ${sqlStr(phone)},
               "tgUsername" = ${sqlStr(tgUsername)},
               gender = ${sqlStr(gender)}::"Gender",
               "isActive" = ${isActive ? "true" : "false"},
               "allowedPages" = ${sqlStr(allowedPages)},
               "readOnlyPages" = ${sqlStr(readOnlyPages)}
           WHERE id = ${id};`
        );
      } else {
        const finalHash = passwordHash || bcrypt.hashSync("Mezana2026!", 10);
        await execPgSql(
          crmEnv.DATABASE_URL,
          `INSERT INTO "Admin" (fullname, username, password, phone, "tgUsername", gender, "isActive", "isDeleted", "allowedPages", "readOnlyPages", "createdAt")
           VALUES (${sqlStr(fullname)}, ${sqlStr(username)}, ${sqlStr(finalHash)}, ${sqlStr(phone)}, ${sqlStr(tgUsername)}, ${sqlStr(gender)}::"Gender", ${isActive ? "true" : "false"}, false, ${sqlStr(allowedPages)}, ${sqlStr(readOnlyPages)}, NOW());`
        );
      }
      await refreshCrmAuthCache();
      return sendJson(res, 200, { success: true, message: id ? "Boshqaruvchi ma'lumotlari va huquqlari yangilandi!" : "Yangi boshqaruvchi qo'shildi!" });
    }

    // --- STUDENT CARDS (Turniket / Oshxona ID kartasi + ZKTeco sinxronlash) ---
    if (pathname === "/fin-api/crm/student-cards/zkteco-recent" && method === "GET") {
      const data = await fetchRecentZktecoCards(pgPool);
      return sendJson(res, 200, data);
    }

    if (pathname === "/fin-api/crm/student-cards/sync-zkteco" && method === "POST") {
      const out = await syncAllCardsToZkteco(pgPool);
      return sendJson(res, 200, {
        success: true,
        message: `ZKTeco qurilmalariga ${out.totalCards} ta talaba kartasi sinxronlandi!`,
        ...out,
      });
    }

    if (pathname === "/fin-api/crm/student-cards" && method === "POST") {
      const body = await readJsonBody(req);
      const studentId = Number(body.studentId);
      const cardId = String(body.cardId || "").trim();
      const rawNum = body.cardNumber || (/^\d+$/.test(cardId) ? cardId : "");
      const cardNumber = rawNum ? Number(String(rawNum).replace(/\D/g, "")) || null : null;
      if (!Number.isFinite(studentId) || studentId <= 0 || !cardId) {
        return sendJson(res, 400, { error: "Talaba va karta raqamini kiriting" });
      }
      const stRows = (await queryPgJson(crmEnv.DATABASE_URL, `SELECT id, fullname FROM "Student" WHERE id = ${studentId} LIMIT 1`));
      const studentName = stRows[0]?.fullname || "Talaba";

      // Free up cardId if it was previously assigned to a different student
      await execPgSql(
        crmEnv.DATABASE_URL,
        `DELETE FROM "StudentCard" WHERE "cardId" = ${sqlStr(cardId)} AND "studentId" <> ${studentId};`
      );

      const existing = (await queryPgJson(crmEnv.DATABASE_URL, `SELECT id FROM "StudentCard" WHERE "studentId" = ${studentId} LIMIT 1`));
      if (existing.length > 0) {
        await execPgSql(
          crmEnv.DATABASE_URL,
          `UPDATE "StudentCard" SET "cardId" = ${sqlStr(cardId)}, "cardNumber" = ${cardNumber ?? "NULL"}, "studentName" = ${sqlStr(studentName)}, "isActive" = true, "updatedAt" = NOW() WHERE "studentId" = ${studentId};`
        );
      } else {
        await execPgSql(
          crmEnv.DATABASE_URL,
          `INSERT INTO "StudentCard" ("studentId", "cardId", "cardNumber", "studentName", "isActive", "createdAt", "updatedAt") VALUES (${studentId}, ${sqlStr(cardId)}, ${cardNumber ?? "NULL"}, ${sqlStr(studentName)}, true, NOW(), NOW());`
        );
      }

      let zkSync = [];
      try {
        zkSync = await syncStudentCardToZkteco({ studentId, studentName, cardId, cardNumber });
      } catch {}
      const syncedCount = zkSync.filter((d) => d.ok).length;
      const zkNote = syncedCount > 0 ? ` va ${syncedCount} ta ZKTeco qurilmasiga avtomatik yozildi` : "";

      return sendJson(res, 200, {
        success: true,
        message: `Turniket va oshxona kartasi bazaga saqlandi${zkNote}!`,
        zkSync,
      });
    }

    if (pathname === "/fin-api/crm/student-cards/status" && method === "POST") {
      const body = await readJsonBody(req);
      const cardRowId = Number(body.id);
      const isActive = Boolean(body.isActive);
      if (!cardRowId) return sendJson(res, 400, { error: "Karta raqami ko'rsatilmadi" });
      await execPgSql(crmEnv.DATABASE_URL, `UPDATE "StudentCard" SET "isActive" = ${isActive ? "true" : "false"}, "updatedAt" = NOW() WHERE id = ${cardRowId};`);
      return sendJson(res, 200, { success: true, message: isActive ? "Karta faollashtirildi" : "Karta vaqtincha bloklandi" });
    }

    // --- STUDENT COMMENTS (Talaba bo'yicha eslatma va izohlar) ---
    if (pathname === "/fin-api/crm/student-comments" && method === "POST") {
      const body = await readJsonBody(req);
      const studentId = Number(body.studentId);
      const text = String(body.text || "").trim();
      if (!studentId || !text) {
        return sendJson(res, 400, { error: "Izoh matnini kiriting" });
      }
      const authorName = sess.user?.name || sess.crmUser?.fullname || "Ma'mur";
      const authorType = sess.crmUser?.role || "admin";
      const authorId = Number(sess.crmUser?.id || 1);
      await execPgSql(
        crmEnv.DATABASE_URL,
        `INSERT INTO "StudentComment" ("studentId", text, "authorId", "authorType", "authorName", "createdAt") VALUES (${studentId}, ${sqlStr(text)}, ${authorId}, ${sqlStr(authorType)}, ${sqlStr(authorName)}, NOW());`
      );
      return sendJson(res, 200, { success: true, message: "Izoh qo'shildi" });
    }

    const delCommentMatch = pathname.match(/^\/fin-api\/crm\/student-comments\/(\d+)$/);
    if (delCommentMatch && method === "DELETE") {
      const commentId = Number(delCommentMatch[1]);
      await execPgSql(crmEnv.DATABASE_URL, `DELETE FROM "StudentComment" WHERE id = ${commentId};`);
      return sendJson(res, 200, { success: true, message: "Izoh o'chirildi" });
    }

    // --- STUDENT PHOTO UPLOAD ---
    if (pathname === "/fin-api/crm/students/upload-photo" && method === "POST") {
      const body = await readJsonBody(req);
      const studentId = Number(body.studentId);
      const dataUrl = String(body.dataUrl || "");
      if (!studentId || !dataUrl.startsWith("data:image/")) {
        return sendJson(res, 400, { error: "Talaba ID yoki rasm fayli noto'g'ri" });
      }
      const ext = dataUrl.includes("image/png") ? "png" : dataUrl.includes("image/webp") ? "webp" : "jpg";
      const base64Part = dataUrl.split(",")[1] || "";
      const buf = Buffer.from(base64Part, "base64");
      const dir = "/var/www/mezana-crm/backend/uploads/profile-pictures";
      fs.mkdirSync(dir, { recursive: true });
      const fileName = `profile-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}.${ext}`;
      fs.writeFileSync(path.join(dir, fileName), buf);
      const publicUrl = `/uploads/profile-pictures/${fileName}`;
      await execPgSql(
        crmEnv.DATABASE_URL,
        `UPDATE "Student" SET "profilePicture" = ${sqlStr(publicUrl)}, "updatedAt" = NOW() WHERE id = ${studentId};`
      );
      return sendJson(res, 200, { success: true, profilePicture: publicUrl, message: "Talaba rasmi yangilandi!" });
    }

    // --- STUDENT CREATE / UPDATE (Talaba qo'shish va tahrirlash) ---
    if (pathname === "/fin-api/crm/students/save" && method === "POST") {
      const body = await readJsonBody(req);
      const id = body.id ? Number(body.id) : null;
      const fullname = String(body.fullname || "").trim();
      if (!fullname) return sendJson(res, 400, { error: "Talaba F.I.Sh. kiritilishi shart" });

      const phone = body.phone ? String(body.phone).trim() : null;
      const turkPhone = body.turkPhone ? String(body.turkPhone).trim() : null;
      const uzbPhone = body.uzbPhone ? String(body.uzbPhone).trim() : null;
      const fatherFullname = body.fatherFullname ? String(body.fatherFullname).trim() : null;
      const fatherPhone = body.fatherPhone ? String(body.fatherPhone).trim() : null;
      const gender = body.gender === "FEMALE" ? "FEMALE" : "MALE";
      const groupId = body.groupId ? Number(body.groupId) : null;
      const studyPlace = String(body.studyPlace || "Akademiya").trim();
      const roomNumber = body.roomNumber ? String(body.roomNumber).trim() : null;
      const totalPayment = Number(body.totalPayment ?? 0);
      const hasIqoma = Boolean(body.hasIqoma || body.iqomaNumber);
      const iqomaNumber = body.iqomaNumber ? String(body.iqomaNumber).trim() : null;
      const iqomaExpiryDate = body.iqomaExpiryDate ? String(body.iqomaExpiryDate).slice(0, 10) : null;
      const passportNumber = body.passportNumber ? String(body.passportNumber).trim() : null;

      if (id) {
        const optCol = (key, val, colName) => (body[key] !== undefined ? sqlStr(val) : colName);
        await execPgSql(
          crmEnv.DATABASE_URL,
          `UPDATE "Student"
           SET fullname = ${sqlStr(fullname)},
               phone = ${optCol("phone", phone, "phone")},
               "turkPhone" = ${optCol("turkPhone", turkPhone, '"turkPhone"')},
               "uzbPhone" = ${optCol("uzbPhone", uzbPhone, '"uzbPhone"')},
               "fatherFullname" = ${optCol("fatherFullname", fatherFullname, '"fatherFullname"')},
               "fatherPhone" = ${optCol("fatherPhone", fatherPhone, '"fatherPhone"')},
               gender = ${sqlStr(gender)}::"Gender",
               "groupId" = ${groupId !== null ? groupId : "NULL"},
               "studyPlace" = ${sqlStr(studyPlace)},
               "roomNumber" = ${optCol("roomNumber", roomNumber, '"roomNumber"')},
               "totalPayment" = ${totalPayment},
               "remainingAmount" = GREATEST(0, ${totalPayment} - COALESCE("paidAmount", 0)),
               "hasIqoma" = ${hasIqoma ? "true" : "false"},
               "iqomaNumber" = ${sqlStr(iqomaNumber)},
               "iqomaExpiryDate" = ${iqomaExpiryDate ? sqlStr(iqomaExpiryDate) + "::timestamp" : "NULL"},
               "passportNumber" = ${optCol("passportNumber", passportNumber, '"passportNumber"')},
               "updatedAt" = NOW()
           WHERE id = ${id};`
        );
        return sendJson(res, 200, { success: true, message: "Talaba ma'lumotlari muvaffaqiyatli yangilandi!" });
      } else {
        const username = String(body.username || ("talaba_" + Math.floor(1000 + Math.random() * 9000))).trim();
        const dup = (await queryPgJson(crmEnv.DATABASE_URL, `SELECT id FROM "Student" WHERE username = ${sqlStr(username)} LIMIT 1`));
        const finalUsername = dup.length > 0 ? username + "_" + Math.floor(10 + Math.random() * 89) : username;
        // Default bcrypt hash for Mezana2026!
        const defaultHash = "$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi";
        await execPgSql(
          crmEnv.DATABASE_URL,
          `INSERT INTO "Student" (username, "passwordHash", fullname, gender, phone, "turkPhone", "uzbPhone", "fatherFullname", "fatherPhone", "groupId", "studyPlace", "roomNumber", "totalPayment", "paidAmount", "remainingAmount", "hasIqoma", "iqomaNumber", "iqomaExpiryDate", "passportNumber", "isActive", "isDeleted", "isArchived", "createdAt", "updatedAt")
           VALUES (${sqlStr(finalUsername)}, ${sqlStr(defaultHash)}, ${sqlStr(fullname)}, ${sqlStr(gender)}::"Gender", ${sqlStr(phone || "+905000000000")}, ${sqlStr(turkPhone)}, ${sqlStr(uzbPhone)}, ${sqlStr(fatherFullname)}, ${sqlStr(fatherPhone)}, ${groupId !== null ? groupId : "NULL"}, ${sqlStr(studyPlace)}, ${sqlStr(roomNumber)}, ${totalPayment}, 0, ${totalPayment}, ${hasIqoma ? "true" : "false"}, ${sqlStr(iqomaNumber)}, ${iqomaExpiryDate ? sqlStr(iqomaExpiryDate) + "::timestamp" : "NULL"}, ${sqlStr(passportNumber)}, true, false, false, NOW(), NOW());`
        );
        return sendJson(res, 201, { success: true, message: "Yangi talaba muvaffaqiyatli qo'shildi!" });
      }
    }

    // --- STUDENT ARCHIVE / ACADEMIC YEAR PROMOTION & CONTRACT UPDATE ---
    if (pathname === "/fin-api/crm/students/archive-action" && method === "POST") {
      const body = await readJsonBody(req);
      const studentId = Number(body.studentId);
      const action = String(body.action || "");
      if (!studentId) return sendJson(res, 400, { error: "Talaba tanlanmagan" });

      if (action === "restore_to_active") {
        // Move student to 2026-2027 active academic year
        const stRows = (await queryPgJson(crmEnv.DATABASE_URL, `SELECT "studyPlace" FROM "Student" WHERE id = ${studentId} LIMIT 1`));
        const oldPlace = stRows[0]?.studyPlace || "Akademiya";
        const newPlace = oldPlace.replace(/^2025-2026\s*/, "").trim() || "Akademiya";
        await execPgSql(
          crmEnv.DATABASE_URL,
          `UPDATE "Student" SET "isActive" = true, "isDeleted" = false, "isArchived" = false, "studyPlace" = ${sqlStr(newPlace)} WHERE id = ${studentId};`
        );
        return sendJson(res, 200, { success: true, message: "Talaba joriy (2026-2027) o'quv yiliga faol holatda o'tkazildi!" });
      }

      if (action === "move_to_archive") {
        const stRows = (await queryPgJson(crmEnv.DATABASE_URL, `SELECT "studyPlace" FROM "Student" WHERE id = ${studentId} LIMIT 1`));
        const oldPlace = stRows[0]?.studyPlace || "Akademiya";
        const newPlace = oldPlace.startsWith("2025-2026") ? oldPlace : `2025-2026 ${oldPlace}`;
        await execPgSql(
          crmEnv.DATABASE_URL,
          `UPDATE "Student" SET "isActive" = false, "isArchived" = true, "studyPlace" = ${sqlStr(newPlace)} WHERE id = ${studentId};`
        );
        return sendJson(res, 200, { success: true, message: "Talaba arxivga o'tkazildi" });
      }

      if (action === "update_contract") {
        const totalPayment = Number(body.totalPayment ?? 0);
        const plannedPayment = body.plannedPayment !== undefined && body.plannedPayment !== "" ? Number(body.plannedPayment) : null;
        const paidUntilDate = body.paidUntilDate || null;
        await execPgSql(
          crmEnv.DATABASE_URL,
          `UPDATE "Student"
           SET "totalPayment" = ${totalPayment},
               "remainingAmount" = GREATEST(0, ${totalPayment} - COALESCE("paidAmount", 0)),
               "plannedPayment" = ${plannedPayment !== null ? plannedPayment : '"plannedPayment"'},
               "paidUntilDate" = ${paidUntilDate ? sqlStr(paidUntilDate) : '"paidUntilDate"'}
           WHERE id = ${studentId};`
        );
        return sendJson(res, 200, { success: true, message: "Shartnoma summasi va qolgan qarz yangilandi!" });
      }

      return sendJson(res, 400, { error: "Noma'lum amal" });
    }

    // --- EXPENSE RECEIPT UPLOAD (Xarajat cheki rasmini biriktirish) ---
    const expReceiptMatch = pathname.match(/^\/fin-api\/erp\/expenses\/([^/]+)\/receipt$/);
    if (expReceiptMatch && method === "POST") {
      const expenseId = expReceiptMatch[1];
      const body = await readJsonBody(req);
      const fileName = String(body.fileName || "chek.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
      const mimeType = String(body.mimeType || "image/jpeg");
      const dataUrl = String(body.dataUrl || "");
      if (!dataUrl.startsWith("data:")) {
        return sendJson(res, 400, { error: "Fayl ma'lumoti noto'g'ri" });
      }
      const base64Part = dataUrl.split(",")[1] || "";
      const buf = Buffer.from(base64Part, "base64");
      const uploadsDir = path.resolve(STATIC_DIR, "uploads");
      fs.mkdirSync(uploadsDir, { recursive: true });
      const storedFile = `${Date.now()}_${fileName}`;
      fs.writeFileSync(path.join(uploadsDir, storedFile), buf);
      const publicUrl = `/uploads/${storedFile}`;
      const recId = "rec_" + crypto.randomBytes(10).toString("hex");
      await execPgSql(
        erpEnv.DATABASE_URL,
        `INSERT INTO "ExpenseReceipt" (id, "expenseId", "cloudinaryId", url, "fileName", "mimeType", "fileSizeBytes", "createdAt")
         VALUES (${sqlStr(recId)}, ${sqlStr(expenseId)}, ${sqlStr(storedFile)}, ${sqlStr(publicUrl)}, ${sqlStr(fileName)}, ${sqlStr(mimeType)}, ${buf.length}, NOW());`
      );
      return sendJson(res, 200, {
        success: true,
        receipt: { id: recId, expenseId, url: publicUrl, fileName, mimeType, fileSizeBytes: buf.length },
      });
    }


    // --- CAMPUS SMART MONITORING (Oshxona, Masjid va Kirish Eshigi) ---
    if (pathname === "/fin-api/campus/gate/live-frame" && method === "GET") {
      try {
        let camRes = await fetch("http://127.0.0.1:1984/api/frame.jpeg?src=ip34_c01_hd", { signal: AbortSignal.timeout(2500) }).catch(() => null);
        if (!camRes || !camRes.ok) camRes = await fetch("http://127.0.0.1:1984/api/frame.jpeg?src=ip34_c01", {
          signal: AbortSignal.timeout(3000),
        });
        if (!camRes.ok) {
          res.writeHead(404);
          return res.end();
        }
        const buf = Buffer.from(await camRes.arrayBuffer());
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Content-Length": buf.length,
        });
        return res.end(buf);
      } catch {
        res.writeHead(502);
        return res.end();
      }
    }

    if (pathname === "/fin-api/campus/smart-analytics" && method === "GET") {
      const date = url.searchParams.get("date") || "";
      const month = url.searchParams.get("month") || "";
      const data = await buildCampusSmartAnalytics(pgPool, { date, month });
      return sendJson(res, 200, data);
    }

    if (pathname === "/fin-api/campus/simulate-scan" && method === "POST") {
      const body = await readJsonBody(req);
      const out = await simulateSmartTurnstileScan(pgPool, {
        deviceType: body.deviceType || "CANTEEN",
        studentId: Number(body.studentId),
        customTimeStr: body.customTimeStr || null,
        customDateStr: body.customDateStr || body.date || null,
      });
      return sendJson(res, 200, out);
    }

    if (pathname === "/fin-api/campus/gate/toggle-recipient" && method === "POST") {
      const body = await readJsonBody(req);
      if (!body.telegramId) return sendJson(res, 400, { error: "telegramId ko'rsatilmadi" });
      const contacts = await toggleBotRecipient(body.telegramId, Boolean(body.isLateResponsible));
      return sendJson(res, 200, {
        success: true,
        message: body.isLateResponsible
          ? "Mas'ul yoqildi — endi kamera rasmlari ushbu xodimga yuboriladi!"
          : "Mas'ul o'chirildi.",
        botContacts: contacts,
      });
    }

    if (pathname === "/fin-api/campus/gate/capture" && method === "POST") {
      const body = await readJsonBody(req);
      const incident = await captureSixGatePhotos(pgPool, {
        cardId: body.cardId || null,
        note: body.note || null,
      });
      const recNames = incident?.telegramResult?.recipients || [];
      const aiMsg = incident?.recognition?.recognized
        ? `🤖 AI orqali tanildi: ${incident.recognition.studentName} (${incident.recognition.similarityPct}%)! `
        : "";
      const tgText = recNames.length > 0
        ? `Telegram orqali ${recNames.join(", ")} ga 4 ta rasm yuborildi!`
        : "Ro'yxatga qo'shildi!";
      return sendJson(res, 200, {
        success: true,
        message: `${aiMsg}Kirish eshigidan 4 ta rasm olindi. ${tgText}`,
        incident,
      });
    }

    if (pathname === "/fin-api/campus/gate/confirm" && method === "POST") {
      const body = await readJsonBody(req);
      const id = Number(body.id);
      if (!id) return sendJson(res, 400, { error: "Holat ID ko'rsatilmadi" });

      let studentId = body.studentId ? Number(body.studentId) : null;
      let studentName = (body.studentName || "").trim();
      let studentGroup = (body.studentGroup || "").trim();

      if (studentId) {
        const stRes = await pgPool.query(
          `SELECT s.id, s.fullname, COALESCE(g.name, 'Guruhsiz') AS "group" FROM "Student" s LEFT JOIN "Group" g ON g.id = s."groupId" WHERE s.id = $1 LIMIT 1`,
          [studentId]
        );
        if (stRes.rows[0]) {
          studentName = stRes.rows[0].fullname;
          studentGroup = stRes.rows[0].group || "Guruhsiz";
        }
      } else if (studentName) {
        const stRes = await pgPool.query(
          `SELECT s.id, s.fullname, COALESCE(g.name, 'Guruhsiz') AS "group" FROM "Student" s LEFT JOIN "Group" g ON g.id = s."groupId" WHERE s."isDeleted" = false AND s."isArchived" = false AND s.fullname ILIKE $1 ORDER BY CASE WHEN LOWER(s.fullname) = LOWER($2) THEN 0 ELSE 1 END, s.id ASC
           LIMIT 1`,
          [`%${studentName}%`, studentName]
        );
        if (stRes.rows[0]) {
          studentId = stRes.rows[0].id;
          studentName = stRes.rows[0].fullname;
          studentGroup = stRes.rows[0].group || "Guruhsiz";
        }
      }

      const isExcused =
        Boolean(body.isExcused) ||
        /#sababli/i.test(studentName) ||
        /#sababli/i.test(String(body.note || ""));

      if (!studentName && isExcused) {
        studentName = "Sababli kirish (Xodim / Ruxsatli) #sababli";
      }
      if (!studentName) {
        return sendJson(res, 400, { error: "Talabaning ism-familiyasini tanlang yoki #sababli deb belgilang" });
      }

      const finalStatus = isExcused ? "EXCUSED" : "CONFIRMED";
      const finalNote = isExcused
        ? (String(body.note || "").includes("#sababli") ? body.note : `#sababli ${body.note || "Sababli / Ruxsatli / Xodim (Qizilga tushmaydi)"}`.trim())
        : (body.note || null);

      const confirmedBy = body.confirmedBy || sess?.user?.fullname || sess?.user?.username || "Mas'ul xodim";
      const upd = await pgPool.query(
        `UPDATE "GateLateIncident"
         SET "status" = $1,
             "studentId" = $2,
             "studentName" = $3,
             "studentGroup" = $4,
             "confirmedBy" = $5,
             "confirmedAt" = NOW(),
             "note" = COALESCE($6, "note")
         WHERE id = $7
         RETURNING *`,
        [finalStatus, studentId, studentName, studentGroup || "Guruhsiz", confirmedBy, finalNote, id]
      );
      try {
        await platformPool.query(
          `UPDATE devices.late_arrivals SET status = $1, "fullName" = $2, "confirmedAt" = NOW() WHERE id = $3`,
          [finalStatus, studentName, `inc_${id}`]
        );
      } catch {}
      return sendJson(res, 200, {
        success: true,
        message: isExcused
          ? `🟡 #sababli sifatida saqlandi! ${studentName} qizil ro'yxatga tushmaydi.`
          : `🔴 Tasdiqlandi! ${studentName} kech qoluvchilar ro'yxatiga qo'shildi.`,
        incident: upd.rows[0],
      });
    }

    if (pathname === "/fin-api/campus/gate/dismiss" && method === "POST") {
      const body = await readJsonBody(req);
      const id = Number(body.id);
      await pgPool.query(
        `UPDATE "GateLateIncident" SET "status" = 'DISMISSED', "note" = COALESCE($1, "note") WHERE id = $2`,
        [body.note || "Xodim / ruxsat etilgan kirish", id]
      );
      try {
        await platformPool.query(`UPDATE devices.late_arrivals SET status = 'REJECTED' WHERE id = $1`, [`inc_${id}`]);
      } catch {}
      return sendJson(res, 200, { success: true });
    }

    const gateDelMatch = pathname.match(/^\/fin-api\/campus\/gate\/(\d+)$/);
    if (gateDelMatch && method === "DELETE") {
      const id = Number(gateDelMatch[1]);
      await pgPool.query(`DELETE FROM "GateLateIncident" WHERE id = $1`, [id]);
      try {
        await platformPool.query(`DELETE FROM devices.late_arrivals WHERE id = $1`, [`inc_${id}`]);
      } catch {}
      return sendJson(res, 200, { success: true });
    }

    if (pathname === "/fin-api/campus/config" && method === "POST") {
      const body = await readJsonBody(req);
      if (body.prayerTimes && Array.isArray(body.prayerTimes)) {
        for (const pt of body.prayerTimes) {
          if (!pt.prayerType || !pt.startTime || !pt.endTime) continue;
          await pgPool.query(
            `INSERT INTO "PrayerTimeConfig" ("prayerType", "startTime", "endTime", "isActive", "updatedAt")
             VALUES ($1::"PrayerType", $2, $3, true, NOW())
             ON CONFLICT ("prayerType")
             DO UPDATE SET "startTime" = EXCLUDED."startTime", "endTime" = EXCLUDED."endTime", "isActive" = true, "updatedAt" = NOW()`,
            [pt.prayerType, pt.startTime, pt.endTime]
          );
        }
      }
      if (body.botConfig && typeof body.botConfig === "object") {
        const curRes = await pgPool.query(`SELECT "value" FROM "CampusDeviceConfig" WHERE "key" = 'gate_telegram_bot'`);
        const curVal = curRes.rows[0]?.value || {};
        const nextVal = {
          botToken: body.botConfig.botToken ? String(body.botConfig.botToken).trim() : curVal.botToken || "",
          chatId: body.botConfig.chatId !== undefined ? String(body.botConfig.chatId).trim() : curVal.chatId || "",
          responsiblePerson: body.botConfig.responsiblePerson || curVal.responsiblePerson || "Navbatchi tarbiyachi",
          activeStart: body.botConfig.activeStart || curVal.activeStart || "22:00",
          activeEnd: body.botConfig.activeEnd || curVal.activeEnd || "05:30",
        };
        await pgPool.query(
          `INSERT INTO "CampusDeviceConfig" ("key", "value", "updatedAt")
           VALUES ('gate_telegram_bot', $1::jsonb, NOW())
           ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW()`,
          [JSON.stringify(nextVal)]
        );
      }
      return sendJson(res, 200, { success: true, message: "Sozlamalar muvaffaqiyatli saqlandi!" });
    }

    // --- GOOGLE SHEETS SYNC (Google Jadval bilan sinxronlash) ---
    if (pathname === "/fin-api/system/sync-sheets" && method === "POST") {
      const body = await readJsonBody(req);
      const mode = body.mode || "all";
      let result = null;
      if (mode === "all") {
        const d = await crmRequest(
          `mutation { syncAllYearTabsToSheets { success message syncedCount failedCount } }`,
          {},
          sess.crmToken
        );
        result = d?.syncAllYearTabsToSheets;
      } else {
        const d = await crmRequest(
          `mutation { triggerFullSheetSync { success message syncedCount failedCount } }`,
          {},
          sess.crmToken
        );
        result = d?.triggerFullSheetSync;
      }
      return sendJson(res, 200, {
        success: Boolean(result?.success ?? true),
        message: result?.message || "Google Jadval bilan sinxronlash bajarildi!",
        result,
      });
    }

    return sendJson(res, 404, { error: `Endpoint topilmadi: ${method} ${pathname}` });
  } catch (err) {
    console.error(`[BFF ERROR] ${method} ${pathname}:`, err);
    return sendJson(res, err.status || 500, { error: err.message || "Ichki server xatosi" });
  }
}

const requestListener = async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/fin-api/")) {
    return handleApi(req, res, url);
  }
  return serveStatic(req, res, url.pathname);
};

const serverMain = http.createServer(requestListener);
serverMain.listen(PORT_MAIN, "0.0.0.0", () => {
  console.log(`[mezana-finance-bff] Listening on http://0.0.0.0:${PORT_MAIN}`);
});

const serverAlt = http.createServer(requestListener);
serverAlt.on("error", () => {});
serverAlt.listen(PORT_ALT, "0.0.0.0", () => {
  console.log(`[mezana-finance-bff] Also listening on http://0.0.0.0:${PORT_ALT}`);
});

const server3003 = http.createServer(requestListener);
server3003.on("error", (e) => console.error("[mezana-finance-bff] 3003 error:", e.message));
server3003.listen(3003, "0.0.0.0", () => {
  console.log("[mezana-finance-bff] Also listening on http://192.168.1.10:3003");
});

setInterval(() => { pollGateTelegramReplies(pgPool).catch(() => {}); }, 4000);
setInterval(() => { pollKirishTurnstileLive(pgPool).catch(() => {}); }, 5000);
setInterval(() => { cleanupOldGatePhotos(pgPool).catch(() => {}); }, 3600000);
