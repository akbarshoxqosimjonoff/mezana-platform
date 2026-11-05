import fs from "node:fs";

export function readBotEnvKey(key, fallback = "") {
  if (process.env[key]) return process.env[key];
  const paths = [
    "/srv/data/apps/mezana-platform/apps/vaqf-bot/.env",
    "/srv/data/apps/mezana-platform/apps/finance-bff/.env",
    "/srv/data/apps/mezana-platform/.env.platform.local",
    "/srv/data/apps/mezana-platform/apps/telegram-bot/.env",
  ];
  for (const p of paths) {
    try {
      const raw = fs.readFileSync(p, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const k = trimmed.slice(0, eq).trim();
        let v = trimmed.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (k === key && v) return v;
      }
    } catch {}
  }
  return fallback;
}

export const VAQF_BFF_BASE = process.env.VAQF_BFF_BASE_URL || "http://127.0.0.1:3000";
export const VAQF_PUBLIC_WEB_URL =
  readBotEnvKey("VAQF_PUBLIC_WEB_URL") || "https://moliya.mezana.org/vaqf/";
export const VAQF_BOT_SECRET = readBotEnvKey("VAQF_BOT_SECRET", "vaqf_internal_bot_secret_2026");
export const VAQF_BOT_USERNAME = readBotEnvKey("VAQF_TELEGRAM_BOT_USERNAME", "ezanvakfitizimbot").replace(/^@/, "");

export function maskSecretToken(token) {
  const s = String(token || "").trim();
  if (!s) return "yo'q";
  if (s.length <= 4) return "***";
  return `***${s.slice(-4)}`;
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const vaqfAccessCache = new Map();

export async function callVaqfBff(telegramId, path, options = {}) {
  const method = options.method || "GET";
  const headers = {
    "X-Vaqf-Bot-Secret": VAQF_BOT_SECRET,
    "X-Telegram-Id": String(telegramId || ""),
  };
  let bodyStr;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyStr = JSON.stringify(options.body);
  }
  try {
    const resp = await fetch(`${VAQF_BFF_BASE}${path}`, {
      method,
      headers,
      body: bodyStr,
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      data: { error: err?.message || "Vaqf BFF bilan ulanishda xato" },
    };
  }
}

export async function checkUserVaqfAccess(telegramId, forceRefresh = false) {
  const key = String(telegramId);
  const cached = vaqfAccessCache.get(key);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached;
  }
  const res = await callVaqfBff(key, "/vaqf-api/me");
  if (!res.ok || !res.data?.vaqfAccess) {
    const neg = {
      hasAccess: false,
      isDirector: false,
      canEdit: false,
      role: "none",
      user: null,
      expiresAt: Date.now() + 15_000,
    };
    vaqfAccessCache.set(key, neg);
    return neg;
  }
  const va = res.data.vaqfAccess;
  const pos = {
    hasAccess: Boolean(va.canAccess || va.canView || va.canCount),
    isDirector: Boolean(va.isDirector || va.canApprove),
    canEdit: Boolean(va.canEdit),
    role: va.role || "staff",
    user: res.data.user || null,
    expiresAt: Date.now() + 45_000,
  };
  vaqfAccessCache.set(key, pos);
  return pos;
}

export function formatAssetCardHtml(a, lang = "uz") {
  const isTr = lang === "tr";
  const statusMap = isTr
    ? {
        in_use: "🟢 Kullanımda",
        in_storage: "📦 Depoda",
        under_repair: "🛠 Tamirde",
        missing: "🔴 Kayıp",
        written_off: "⚫ Kayıttan Düşüldü",
      }
    : {
        in_use: "🟢 Foydalanishda",
        in_storage: "📦 Omborda",
        under_repair: "🛠 Ta'mirda",
        missing: "🔴 Topilmadi",
        written_off: "⚫ Hisobdan chiqarilgan",
      };
  const condMap = isTr
    ? { new: "Yeni", good: "İyi", fair: "Orta", poor: "Kötü / Arızalı" }
    : { new: "Yangi", good: "Yaxshi", fair: "O'rtacha", poor: "Yomon / Nosoz" };

  return (
    `🏛 <b>${escapeHtml(a.name)}</b>\n` +
    `🏷 ${isTr ? "Envanter No" : "Inventar №"}: <code>${escapeHtml(a.inventory_no)}</code>\n` +
    `📂 ${isTr ? "Kategori" : "Kategoriya"}: <b>${escapeHtml(a.category_name || "—")}</b>\n` +
    `📍 ${isTr ? "Konum" : "Joylashuv"}: <b>${escapeHtml(a.location_name || (isTr ? "Belirtilmemiş" : "Belgilanmagan"))}</b> (${escapeHtml(a.institution_name || "Mezana")})\n` +
    `👤 ${isTr ? "Zimmetli" : "Javobgar"}: <b>${escapeHtml(a.responsible_name || (isTr ? "Atanmamış" : "Biriktirilmagan"))}</b>\n` +
    `📊 ${isTr ? "Miktar" : "Miqdor"}: <b>${a.quantity} ${escapeHtml(a.unit || "dona")}</b>\n` +
    `📌 ${isTr ? "Durum" : "Holati"}: <b>${statusMap[a.status] || a.status}</b> (${condMap[a.condition] || a.condition})\n` +
    (a.brand || a.model ? `🔧 ${isTr ? "Marka/Model" : "Rusumi"}: ${escapeHtml([a.brand, a.model].filter(Boolean).join(" "))}\n` : "") +
    (a.warranty_until_str ? `🛡 ${isTr ? "Garanti Bitiş" : "Kafolat muddati"}: <b>${escapeHtml(a.warranty_until_str)}</b>\n` : "")
  );
}
