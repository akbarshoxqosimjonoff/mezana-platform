import fs from "node:fs";
import crypto from "node:crypto";
import { Bot, InlineKeyboard, Keyboard } from "grammy";
import { prisma, moliyPrisma } from "../db/client.js";

function readPlatformEnvKey(key: string): string {
  if (process.env[key]) return process.env[key]!;
  const paths = [
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
  return "";
}

const OPENAI_API_KEY = readPlatformEnvKey("OPENAI_API_KEY");
const DEFAULT_USD_RATE = 49.738;

export interface AuthorizedUserConfig {
  telegramId: string;
  personName: string;
  roleTitle: string;
  isDirector?: boolean;
  accountKey: string;
  accountLabel: string;
  crmUsername: string;
  erpEmail: string;
  userId: string;
  employeeId: string;
  walletId: string;
}

// Muhammadjon added
export const AUTHORIZED_USERS: Record<string, AuthorizedUserConfig> = {
    "490924335": {
    telegramId: "490924335",
    personName: "Muhammadjon",
    roleTitle: "Moliya (Muhammadjon)",
    accountKey: "Muhammadjon",
    accountLabel: "Muhammadjon (Moliya)",
    crmUsername: "muhammadjon",
    erpEmail: "muhammadjon@moliya.org",
    userId: "cmtlai0po000spir9kk7zzeds",
    employeeId: "cmtlai0pv000upir9qk3vaotg",
    walletId: "cmtlai0q9000wpir99dk24v86",
  },
  "8014832689": {
    telegramId: "8014832689",
    personName: "Umarxon Abdulhamidov",
    roleTitle: "Idora (1-manba)",
    accountKey: "Idora",
    accountLabel: "Idora",
    crmUsername: "userumar",
    erpEmail: "idora@moliya.org",
    userId: "cmtlai0il000npir9ydqrvy3s",
    employeeId: "cmtlai0it000ppir989mu70w1",
    walletId: "cmtlai0j1000rpir96nhfpk0k",
  },
  "8142118072": {
    telegramId: "8142118072",
    personName: "Abu Bakr Tojiddinov",
    roleTitle: "Idora (2-manba)",
    accountKey: "Idora",
    accountLabel: "Idora",
    crmUsername: "idora",
    erpEmail: "idora@moliya.org",
    userId: "cmtlai0il000npir9ydqrvy3s",
    employeeId: "cmtlai0it000ppir989mu70w1",
    walletId: "cmtlai0j1000rpir96nhfpk0k",
  },
  "929885302": {
    telegramId: "929885302",
    personName: "Kichik Abdurahmon (Abdurrahman Mamajonov)",
    roleTitle: "Vaqf",
    accountKey: "Vaqf",
    accountLabel: "Vaqf (Kichik Abdurahmon)",
    crmUsername: "abdurahman",
    erpEmail: "vaqf@moliya.org",
    userId: "cmvaqf0000000000000000001",
    employeeId: "cmvaqfemp0000000000000001",
    walletId: "cmvaqfwal0000000000000001",
  },
  "975535813": {
    telegramId: "975535813",
    personName: "Muhammad Solih Tursunov",
    roleTitle: "Direktor",
    isDirector: true,
    accountKey: "Direktor",
    accountLabel: "Direktor",
    crmUsername: "mezana",
    erpEmail: "director@moliy.org",
    userId: "cmtlai0bg000ipir95hv9hfez",
    employeeId: "cmtlai0bx000kpir9d0k7sn7a",
    walletId: "cmtlai0cg000mpir9h862jp1c",
  },
  "8917275156": {
    telegramId: "8917275156",
    personName: "Muhammad Solih Tursunov",
    roleTitle: "Direktor",
    isDirector: true,
    accountKey: "Direktor",
    accountLabel: "Direktor",
    crmUsername: "mezana",
    erpEmail: "director@moliy.org",
    userId: "cmtlai0bg000ipir95hv9hfez",
    employeeId: "cmtlai0bx000kpir9d0k7sn7a",
    walletId: "cmtlai0cg000mpir9h862jp1c",
  },
  "387178074": {
    telegramId: "387178074",
    personName: "Muhammadali Akramjonov",
    roleTitle: "Developer",
    isDirector: true,
    accountKey: "Developer",
    accountLabel: "Developer (Muhammadali)",
    crmUsername: "dev",
    erpEmail: "dev@moliy.org",
    userId: "cmdev00000000000000000001",
    employeeId: "cmdevemp00000000000000001",
    walletId: "cmdevwal00000000000000001",
  },
};

export interface AccountTargetInfo {
  key: string;
  label: string;
  userId: string;
  employeeId: string;
  walletId: string;
  erpEmail: string;
}

export const ACCOUNT_TARGETS: Record<string, AccountTargetInfo> = {
  Idora: {
    key: "Idora",
    label: "Idora",
    userId: "cmtlai0il000npir9ydqrvy3s",
    employeeId: "cmtlai0it000ppir989mu70w1",
    walletId: "cmtlai0j1000rpir96nhfpk0k",
    erpEmail: "idora@moliya.org",
  },
  Vaqf: {
    key: "Vaqf",
    label: "Vaqf (Kichik Abdurahmon)",
    userId: "cmvaqf0000000000000000001",
    employeeId: "cmvaqfemp0000000000000001",
    walletId: "cmvaqfwal0000000000000001",
    erpEmail: "vaqf@moliya.org",
  },
  Abdurahmon: {
    key: "Abdurahmon",
    label: "Abdurahmon (Moliya)",
    userId: "cmtlai0vp000xpir90ttfiaq2",
    employeeId: "cmtlai0w1000zpir9b7ste5ze",
    walletId: "cmtlai0y20011pir95rtswvib",
    erpEmail: "abdurahmon@moliya.org",
  },
  Muhammadjon: {
    key: "Muhammadjon",
    label: "Muhammadjon (Moliya)",
    userId: "cmtlai0po000spir9kk7zzeds",
    employeeId: "cmtlai0pv000upir9qk3vaotg",
    walletId: "cmtlai0q9000wpir99dk24v86",
    erpEmail: "muhammadjon@moliya.org",
  },
  Mezana: {
    key: "Mezana",
    label: "Mezana (Ayollar)",
    userId: "cmu5837xm000bseknf7z1n0gl",
    employeeId: "cmu5837xq000dseknha0g6jvs",
    walletId: "cmu5837xt000fsekn33zqyd70",
    erpEmail: "mezanaayol@moliy.org",
  },
  Direktor: {
    key: "Direktor",
    label: "Direktor",
    userId: "cmtlai0bg000ipir95hv9hfez",
    employeeId: "cmtlai0bx000kpir9d0k7sn7a",
    walletId: "cmtlai0cg000mpir9h862jp1c",
    erpEmail: "director@moliy.org",
  },
  Developer: {
    key: "Developer",
    label: "Developer (Muhammadali)",
    userId: "cmdev00000000000000000001",
    employeeId: "cmdevemp00000000000000001",
    walletId: "cmdevwal00000000000000001",
    erpEmail: "dev@moliy.org",
  },
};

export const EMPLOYEES = Object.keys(ACCOUNT_TARGETS);

export const CATEGORY_ID_MAP: Record<string, string> = {
  "Nonushta": "cmtlai01i0000pir99fl83u5c",
  "Tushlik": "cmtlai01r0001pir9wuuigscx",
  "Kechki ovqat": "cmtlai01w0002pir9eo4n2cdz",
  "Yoqilg'i": "cmtlai0200003pir9iljrg8oe",
  "Taksi": "cmtlai02d0004pir9l3sbzwwi",
  "Transport": "cmtlai02l0005pir9qnqcyrz9",
  "Mehmonxona": "cmtlai02x0006pir94cmgzjre",
  "Ijara": "cmtlai0330007pir9dsaymmvi",
  "Elektr energiya": "cmtlai0380008pir9w7d7xlgx",
  "Internet": "cmtlai03f0009pir9jdmerrnn",
  "Ofis buyumlari": "cmtlai03k000apir91b9usxw2",
  "Jihozlar": "cmtlai03s000bpir9obtjanbc",
  "Marketing": "cmtlai03x000cpir9flrso393",
  "Dasturiy ta'minot": "cmtlai04f000dpir9g141pk3w",
  "Maosh": "cmtlai04o000epir9up9mdqct",
  "Bonus": "cmtlai04w000fpir9f9nv08lq",
  "Ta'mirlash": "cmtlai050000gpir9foelvn9v",
  "Boshqa": "cmtlai056000hpir90qtlfcx3",
};

export const CATEGORIES = Object.keys(CATEGORY_ID_MAP);

export function isDirectorUser(userId: string): boolean {
  return Boolean(AUTHORIZED_USERS[String(userId)]?.isDirector);
}

export function getDirectorTelegramIds(): string[] {
  return Object.values(AUTHORIZED_USERS)
    .filter((u) => u.isDirector)
    .map((u) => u.telegramId);
}

// Load dynamic links from DB on startup so newly approved users in DB also work!
export async function refreshDynamicAuthorizedUsers() {
  try {
    const contacts = await prisma.telegramContact.findMany({
      where: { userId: { not: null } },
    });
    for (const c of contacts) {
      if (AUTHORIZED_USERS[c.telegramId]) continue;
      const targetEntry = Object.values(ACCOUNT_TARGETS).find((t) => t.userId === c.userId);
      if (targetEntry) {
        AUTHORIZED_USERS[c.telegramId] = {
          telegramId: c.telegramId,
          personName: c.fullName || c.firstName || "Xodim",
          roleTitle: targetEntry.key,
          isDirector: targetEntry.key === "Direktor" || targetEntry.key === "Developer",
          accountKey: targetEntry.key,
          accountLabel: targetEntry.label,
          crmUsername: targetEntry.key.toLowerCase(),
          erpEmail: targetEntry.erpEmail,
          userId: targetEntry.userId,
          employeeId: targetEntry.employeeId,
          walletId: targetEntry.walletId,
        };
      }
    }
  } catch (e) {
    console.error("[refreshDynamicAuthorizedUsers error]:", e);
  }
}

export interface ExpenseDraftItem {
  id: string;
  dbExpenseId?: string;
  dbWalletTxId?: string;
  dbRequestId?: string;
  dbRequestCode?: string;
  isRequest?: boolean;
  urgency?: "NORMAL" | "URGENT";
  neededDate?: string;
  linkedRequestId?: string;
  linkedRequestCode?: string;
  chatId: number;
  userId: string;
  sourcePersonName: string;
  title: string;
  description: string;
  amount: number;
  currency: "TL" | "USD";
  usdRate: number;
  amountTl: number;
  amountUsd: number;
  category: string;
  employee: string;
  paymentMethod: "Naqd" | "Karta";
  date: string;
  sourceType: "text" | "voice" | "photo";
  rawInput: string;
  status: "DRAFT" | "CONFIRMED" | "CANCELLED" | "VOIDED";
  walletBalanceAfter?: number;
  receiptBuffer?: Buffer;
  receiptFileId?: string;
  receiptFileName?: string;
  receiptMimeType?: string;
  receiptPublicUrl?: string;
  awaitingReceipt?: boolean;
  createdAt: Date;
  confirmedAt?: Date;
  messageId?: number;
}

export interface DirectorPendingAction {
  type:
    | "assign_amount"
    | "income_entry"
    | "set_rate"
    | "set_budget"
    | "edit_expense_amount"
    | "approve_request_amount"
    | "reject_request_reason";
  targetKey?: string;
  categoryName?: string;
  expenseId?: string;
  requestId?: string;
}

const draftsById = new Map<string, ExpenseDraftItem>();
const activeDraftByUser = new Map<string, string>();
const awaitingLaterReceiptByUser = new Map<string, string>();
const directorPendingByUser = new Map<string, DirectorPendingAction>();
const userRequestMode = new Set<string>();
let seqCounter = 1;

const RECEIPT_UPLOADS_DIR = "/srv/data/apps/mezana-platform/apps/finance/dist/uploads";

async function saveReceiptToDiskAndDb(
  expenseId: string,
  buf: Buffer,
  fileName?: string,
  mimeType?: string
): Promise<string> {
  fs.mkdirSync(RECEIPT_UPLOADS_DIR, { recursive: true });
  const ext = (mimeType || "").includes("png")
    ? "png"
    : (mimeType || "").includes("pdf")
    ? "pdf"
    : "jpg";
  const cleanFileName = fileName || `chek_${expenseId}.${ext}`;
  const storedFile = `tg_${Date.now()}_${expenseId}.${ext}`;
  fs.writeFileSync(`${RECEIPT_UPLOADS_DIR}/${storedFile}`, buf);
  const publicUrl = `/uploads/${storedFile}`;
  const recId = "rec_tg_" + crypto.randomBytes(8).toString("hex");
  const mime = mimeType || "image/jpeg";

  await moliyPrisma.$executeRawUnsafe(
    `INSERT INTO "ExpenseReceipt" (id, "expenseId", "cloudinaryId", url, "fileName", "mimeType", "fileSizeBytes", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    recId,
    expenseId,
    storedFile,
    publicUrl,
    cleanFileName,
    mime,
    buf.length
  );

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO finance."ExpenseReceipt" (id, "expenseId", "cloudinaryId", url, "fileName", "mimeType", "fileSizeBytes", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      recId,
      expenseId,
      storedFile,
      publicUrl,
      cleanFileName,
      mime,
      buf.length
    );
  } catch {}

  return publicUrl;
}

function getIstanbulDateStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fmtNum(n: number, decimals = 2): string {
  return Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

async function fetchLiveUsdRate(): Promise<number> {
  try {
    const rows: any[] = await moliyPrisma.$queryRawUnsafe(
      `SELECT rate::float AS rate FROM "ExchangeRate" WHERE "fromCurrency" = 'USD' AND "toCurrency" = 'TL' ORDER BY "effectiveDate" DESC, "createdAt" DESC LIMIT 1`
    );
    const r = Number(rows?.[0]?.rate || 0);
    if (r > 1) return r;
  } catch {}
  return DEFAULT_USD_RATE;
}

function recalcAmounts(item: ExpenseDraftItem) {
  const rate = item.usdRate > 0 ? item.usdRate : DEFAULT_USD_RATE;
  if (item.currency === "USD") {
    item.amountUsd = Number(item.amount.toFixed(2));
    item.amountTl = Number((item.amount * rate).toFixed(2));
  } else {
    item.amountTl = Number(item.amount.toFixed(2));
    item.amountUsd = Number((item.amount / rate).toFixed(2));
  }
}

export const CAMERA_OWNER_IDS = new Set(["387178074", "8142118072", "8014832689"]);

export async function setIdoraCameraBlock(blocked: boolean): Promise<boolean> {
  const resp = await fetch("http://127.0.0.1:1985/api/block?name=idora", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocked,
      message: "Kameraga qarama, mumkin emas!",
    }),
  });
  if (!resp.ok) {
    throw new Error("Arxiv server javob bermadi (HTTP " + resp.status + ")");
  }
  const data: any = await resp.json();
  return Boolean(data?.blocked);
}

export function buildReplyKeyboard(userId: string): Keyboard {
  const auth = AUTHORIZED_USERS[String(userId)];
  const accLabel = auth ? auth.accountKey : "Hisob";
  const kb = new Keyboard();

  if (auth?.isDirector) {
    kb.text("📊 Umumiy Kassa va Hisobot")
      .text("💸 Pul ajratish / Kirim")
      .row()
      .text("🏦 Hamyonlar balansi")
      .text("🧾 Barcha xarajatlar")
      .row()
      .text("📋 Talabnomalar")
      .text("🎯 Byudjet va 💱 Kurs")
      .row()
      .text("👥 Xodimlar va Ruxsatlar")
      .text("➕ Xarajat kiritish")
      .row()
      .text("📝 Talabnoma yaratish")
      .text(`💼 Hisobim (${accLabel})`);
  } else {
    kb.text("➕ Xarajat kiritish")
      .text("📝 Talabnoma yaratish")
      .row()
      .text("📋 Talabnomalarim")
      .text(`💼 Hisobim (${accLabel})`)
      .row()
      .text("📊 Oxirgi xarajatlar")
      .text("📂 Kategoriyalar");
  }

  if (CAMERA_OWNER_IDS.has(String(userId))) {
    kb.row().text("Kamera!!!");
  }
  return kb.resized().persistent();
}

function buildDraftCardText(item: ExpenseDraftItem, noteBanner?: string): string {
  const sourceBadge =
    item.sourceType === "voice"
      ? "🎙 Ovozli xabardan"
      : item.sourceType === "photo"
      ? "📸 Chek rasmidan (OCR)"
      : "💬 Matnli xabardan";

  const targetInfo = ACCOUNT_TARGETS[item.employee] || ACCOUNT_TARGETS.Idora!;

  const lines: string[] = [];
  if (item.isRequest) {
    const urgIcon = item.urgency === "URGENT" ? "🔥 SHOSHILINCH " : "📝 ";
    lines.push(`${urgIcon}XARAJATGA TALABNOMA QORALAMASI #${item.id} (${sourceBadge})`);
    if (noteBanner) {
      lines.push(`✨ ${noteBanner}`);
    }
    lines.push("────────────────────");
    lines.push(`📋 Maqsad: ${item.title}`);
    if (item.description && item.description !== item.title) {
      lines.push(`💬 Izoh: ${item.description}`);
    }
    lines.push(`📂 Kategoriya: ${item.category}`);
    lines.push(`🏦 So'ralayotgan hisob (Hamyon): ${targetInfo.label}`);
    lines.push(`👤 So'rovchi: ${item.sourcePersonName}`);
    lines.push(`⚡ Muhimlik: ${item.urgency === "URGENT" ? "🔥 Shoshilinch (Urgent)" : "🟢 Oddiy"}`);
    lines.push(`📅 Kerakli sana: ${item.neededDate || item.date}`);
    lines.push("────────────────────");
    if (item.currency === "TL") {
      lines.push(`💰 So'ralgan summa (TL): ₺${fmtNum(item.amountTl)} TL`);
      lines.push(`💵 USD ekvivalenti: $${fmtNum(item.amountUsd)} USD`);
    } else {
      lines.push(`💵 So'ralgan summa (USD): $${fmtNum(item.amountUsd)} USD`);
      lines.push(`💰 TL ekvivalenti: ₺${fmtNum(item.amountTl)} TL`);
    }
    lines.push(`📈 Kurs: 1$ = ${item.usdRate.toFixed(4)} ₺`);
    lines.push("────────────────────");
    lines.push(
      "💡 Tasdiqlasangiz, ushbu talabnoma Direktorga yuboriladi. (Hozir chek talab qilinmaydi — Direktor ruxsat bergach va xarid amalga oshirilgach chek biriktiriladi)."
    );
    return lines.join("\n");
  }

  lines.push(`🧾 XARAJAT QORALAMASI #${item.id} (${sourceBadge})`);
  if (item.linkedRequestCode) {
    lines.push(`🔗 Bog'langan tasdiqlangan talabnoma: ${item.linkedRequestCode}`);
  }
  if (noteBanner) {
    lines.push(`✨ ${noteBanner}`);
  }
  lines.push("────────────────────");
  lines.push(`📝 Nomi: ${item.title}`);
  if (item.description && item.description !== item.title) {
    lines.push(`💬 Izoh: ${item.description}`);
  }
  lines.push(`📂 Kategoriya: ${item.category}`);
  lines.push(`🏦 Yoziladigan hisob (Hamyon): ${targetInfo.label}`);
  lines.push(`✍️ Kirituvchi (Manba): ${item.sourcePersonName}`);
  lines.push(`💳 To'lov usuli: ${item.paymentMethod}`);
  lines.push(`📅 Sana: ${item.date}`);
  lines.push("────────────────────");
  if (item.currency === "TL") {
    lines.push(`💰 Summa (TL): ₺${fmtNum(item.amountTl)} TL`);
    lines.push(`💵 USD ekvivalenti: $${fmtNum(item.amountUsd)} USD`);
  } else {
    lines.push(`💵 Summa (USD): $${fmtNum(item.amountUsd)} USD`);
    lines.push(`💰 TL ekvivalenti: ₺${fmtNum(item.amountTl)} TL`);
  }
  lines.push(`📈 Kurs: 1$ = ${item.usdRate.toFixed(4)} ₺`);
  lines.push(
    item.receiptBuffer
      ? `📎 Chek rasmi: ✅ Biriktirilgan (${Math.max(1, Math.round(item.receiptBuffer.length / 1024))} KB)`
      : `📎 Chek rasmi: ⏳ Biriktirilmagan (chek rasmini tashlang yoki "🚫 Chek yo'q" ni bosing)`
  );
  lines.push("────────────────────");
  lines.push(
    item.receiptBuffer
      ? "💡 Chek biriktirilgan! O'zgartirish kerak bo'lsa yozing yoki «✅ Tasdiqlash va Saqlash» tugmasini bosing."
      : "📸 Shu yerga *chek rasmini yuborsangiz* avtomatik biriktiriladi, yoki chek bo'lmasa *«🚫 Chek yo'q (Saqlash)»* tugmasini bosing!"
  );
  return lines.join("\n");
}

function buildDraftKeyboard(item: ExpenseDraftItem): InlineKeyboard {
  const nextPay = item.paymentMethod === "Naqd" ? "Karta" : "Naqd";
  const nextCur = item.currency === "TL" ? "USD ($)" : "TL (₺)";
  const targetInfo = ACCOUNT_TARGETS[item.employee] || ACCOUNT_TARGETS.Idora!;
  const kb = new InlineKeyboard();

  if (item.isRequest) {
    kb.text("📨 Direktorga yuborish", `exp:sendreq:${item.id}`)
      .text("❌ Bekor qilish", `exp:cancel:${item.id}`)
      .row()
      .text("🔄 Tur: 📝 Talabnoma ↔ 🧾 Xarajat", `exp:toggletype:${item.id}`)
      .row()
      .text(
        item.urgency === "URGENT" ? "🔥 Shoshilinch 🔄 Oddiy" : "🟢 Oddiy 🔄 Shoshilinch",
        `exp:toggleurg:${item.id}`
      )
      .text(`💱 ${item.currency} 🔄 ${nextCur}`, `exp:togglecur:${item.id}`)
      .row()
      .text(`📂 ${item.category} ▾`, `exp:catmenu:${item.id}`)
      .text(`🏦 ${targetInfo.key} ▾`, `exp:empmenu:${item.id}`);
    return kb;
  }

  if (item.receiptBuffer) {
    kb.text("✅ Tasdiqlash va Saqlash (Chek bilan)", `exp:ok:${item.id}`)
      .text("❌ Bekor qilish", `exp:cancel:${item.id}`)
      .row();
  } else {
    kb.text("📸 Chek rasmini yuborish", `exp:askreceipt:${item.id}`)
      .text("🚫 Chek yo'q (Saqlash)", `exp:ok_noreceipt:${item.id}`)
      .row()
      .text("✅ Tasdiqlash", `exp:ok:${item.id}`)
      .text("❌ Bekor qilish", `exp:cancel:${item.id}`)
      .row();
  }
  if (!item.linkedRequestId) {
    kb.text("🔄 Tur: 🧾 Xarajat ↔ 📝 Talabnoma", `exp:toggletype:${item.id}`).row();
  }
  kb.text(`📂 ${item.category} ▾`, `exp:catmenu:${item.id}`)
    .text(`🏦 ${targetInfo.key} ▾`, `exp:empmenu:${item.id}`)
    .row()
    .text(`💳 ${item.paymentMethod} 🔄 ${nextPay}`, `exp:togglepay:${item.id}`)
    .text(`💱 ${item.currency} 🔄 ${nextCur}`, `exp:togglecur:${item.id}`);
  return kb;
}

function buildConfirmedCardText(item: ExpenseDraftItem): string {
  const targetInfo = ACCOUNT_TARGETS[item.employee] || ACCOUNT_TARGETS.Idora!;
  const lines: string[] = [];
  lines.push("✅ TIZIM BAZASIGA MUVAFFAQIYATLI SAQLANDI!");
  lines.push(`🧾 Xarajat ID: ${item.dbExpenseId || item.id}`);
  if (item.linkedRequestCode) {
    lines.push(`🔗 Bajarilgan talabnoma: ${item.linkedRequestCode} (COMPLETED)`);
  }
  lines.push("────────────────────");
  lines.push(`📝 Nomi: ${item.title}`);
  if (item.description && item.description !== item.title) {
    lines.push(`💬 Izoh: ${item.description}`);
  }
  lines.push(`📂 Kategoriya: ${item.category}`);
  lines.push(`🏦 Yozilgan hisob (Hamyon): ${targetInfo.label} (${targetInfo.erpEmail})`);
  lines.push(`✍️ Kiritdi (Manba): ${item.sourcePersonName}`);
  lines.push(`💳 To'lov usuli: ${item.paymentMethod}`);
  lines.push(`📅 Sana: ${item.date}`);
  lines.push(`💰 Summa (TL): ₺${fmtNum(item.amountTl)} TL`);
  lines.push(`💵 Summa (USD): $${fmtNum(item.amountUsd)} USD (kurs: ${item.usdRate.toFixed(4)})`);
  lines.push(
    item.receiptBuffer || item.receiptPublicUrl
      ? `📎 Chek rasmi: ✅ Tizimga saqlandi`
      : `📎 Chek rasmi: 🚫 Chek yo'q (cheksiz saqlandi)`
  );
  if (typeof item.walletBalanceAfter === "number") {
    lines.push("────────────────────");
    lines.push(`💳 "${targetInfo.label}" hamyonining joriy qoldig'i: ₺${fmtNum(item.walletBalanceAfter)} TL`);
  }
  return lines.join("\n");
}

function buildConfirmedKeyboard(item: ExpenseDraftItem): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (!item.receiptBuffer && !item.receiptPublicUrl) {
    kb.text("📸 Chek rasmini qo'shish", `exp:attachlater:${item.id}`).row();
  }
  kb.text("↩️ Bekor qilish (Bazadan o'chirish)", `exp:undo:${item.id}`);
  return kb;
}

// =========================================================================
// EXPENSE REQUEST (XARAJATGA TALABNOMA) BOT HELPERS
// =========================================================================
function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getEmployeeTelegramIdsForRequest(
  employeeId?: string | null,
  sourceKey?: string | null,
  requesterTgId?: string | null
): string[] {
  const set = new Set<string>();
  if (requesterTgId && /^\d+$/.test(String(requesterTgId))) {
    set.add(String(requesterTgId));
  }
  for (const u of Object.values(AUTHORIZED_USERS)) {
    if (u.isDirector) continue;
    if (
      (sourceKey && u.accountKey.toLowerCase() === String(sourceKey).toLowerCase()) ||
      (employeeId && u.employeeId === employeeId)
    ) {
      set.add(u.telegramId);
    }
  }
  return Array.from(set);
}

async function saveExpenseRequestToDatabase(
  bot: Bot,
  item: ExpenseDraftItem
): Promise<{ reqId: string; reqCode: string; walletBalance: number }> {
  const target = ACCOUNT_TARGETS[item.employee] || ACCOUNT_TARGETS.Idora!;
  const categoryId = CATEGORY_ID_MAP[item.category] || CATEGORY_ID_MAP["Boshqa"]!;
  const reqId = "req_tg_" + crypto.randomBytes(8).toString("hex");
  const baseDesc =
    item.description && item.description !== item.title
      ? `${item.title} — ${item.description}`
      : item.title;
  const amtOrig = item.currency === "USD" ? item.amountUsd : item.amountTl;
  const amtTl = item.amountTl;
  const amtUsd = item.amountUsd;
  const exRate = item.currency === "USD" ? item.usdRate : 1;
  const curCode = item.currency === "USD" ? "USD" : "TRY";
  const urgency = item.urgency === "URGENT" ? "URGENT" : "NORMAL";
  const neededDate = item.neededDate || item.date || getIstanbulDateStr();

  const wRows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT id, balance::float AS balance FROM "Wallet" WHERE id = $1 LIMIT 1`,
    target.walletId
  );
  const walletBalance = Number(wRows?.[0]?.balance || 0);

  const inserted: any[] = await moliyPrisma.$queryRawUnsafe(
    `INSERT INTO "ExpenseRequest" (
       id, amount, "approvedAmount", currency, "exchangeRate", "amountInDefault",
       description, urgency, status, "categoryId", "employeeId", "walletId",
       "requesterName", "requesterTgId", "sourceKey", "sourceLabel", "neededDate",
       "requesterMessageId", "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, 'PENDING', $9, $10, $11,
       $12, $13, $14, $15, $16::timestamp,
       $17, NOW(), NOW()
     ) RETURNING id, "requestNumber"`,
    reqId,
    amtOrig,
    amtTl,
    curCode,
    exRate,
    amtTl,
    baseDesc,
    urgency,
    categoryId,
    target.employeeId,
    target.walletId,
    item.sourcePersonName,
    String(item.userId),
    target.key,
    `${item.sourcePersonName} (${target.label})`,
    `${neededDate}T12:00:00.000Z`,
    item.messageId ? String(item.messageId) : null
  );

  const reqNum = inserted?.[0]?.requestNumber || 1;
  const reqCode = `#T-${reqNum}`;

  const nowIstStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const lowBalLine =
    walletBalance < amtTl
      ? `⚠️ <b>Diqqat: Hamyonda mablag' kam! (Balans: ₺${fmtNum(walletBalance)})</b>\n`
      : `💳 Hamyon balansi: <b>₺${fmtNum(walletBalance)} TL</b> (Yetarli ✅)\n`;

  const dirHtml =
    `${
      urgency === "URGENT"
        ? "🔥 <b>SHOSHILINCH XARAJAT TALABNOMASI"
        : "📝 <b>YANGI XARAJAT TALABNOMASI"
    } (${reqCode})</b>\n\n` +
    `👤 So'rovchi: <b>${escapeHtml(item.sourcePersonName)} (${escapeHtml(target.label)})</b>\n` +
    lowBalLine +
    `💰 So'ralgan summa: <b>₺${fmtNum(amtTl)} TL</b> (~$${fmtNum(amtUsd)} USD)\n` +
    `📂 Kategoriya: <b>${escapeHtml(item.category)}</b>\n` +
    `📋 Maqsad / Izoh: <b>${escapeHtml(baseDesc)}</b>\n` +
    `📅 Kerakli sana: <b>${neededDate}</b>\n` +
    `🕒 Yuborilgan vaqt: <b>${nowIstStr}</b>\n\n` +
    `<i>👇 Tasdiqlash yoki rad etish uchun quyidagi tugmalarni bosing (yoki ushbu xabarga Reply qilib boshqa summani yozing):</i>`;

  const dirKb = new InlineKeyboard()
    .text(`✅ Tasdiqlash (₺${fmtNum(amtTl)})`, `req:app:${reqId}`)
    .text("❌ Rad etish", `req:rej:${reqId}`)
    .row()
    .text("✏️ Boshqa summani tasdiqlash", `req:amt:${reqId}`);

  const sentMsgs: Array<{ chatId: string; messageId: number }> = [];
  for (const dirTgId of getDirectorTelegramIds()) {
    try {
      const sent = await bot.api.sendMessage(Number(dirTgId), dirHtml, {
        parse_mode: "HTML",
        reply_markup: dirKb,
      });
      if (sent?.message_id) {
        sentMsgs.push({ chatId: String(dirTgId), messageId: sent.message_id });
      }
    } catch {}
  }

  if (sentMsgs.length > 0) {
    try {
      await moliyPrisma.$executeRawUnsafe(
        `UPDATE "ExpenseRequest" SET "directorMessages" = $1::jsonb WHERE id = $2`,
        JSON.stringify(sentMsgs),
        reqId
      );
    } catch {}
  }

  return { reqId, reqCode, walletBalance };
}

export async function approveExpenseRequestInBot(
  bot: Bot,
  reqId: string,
  approverName: string,
  customAmountTry?: number,
  directorNote?: string | null
): Promise<{ reqCode: string; approvedAmount: number; description: string; sourceLabel: string }> {
  const rows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT r.*, COALESCE(c.name, 'Boshqa') AS "categoryName"
     FROM "ExpenseRequest" r
     LEFT JOIN "Category" c ON c.id = r."categoryId"
     WHERE r.id = $1 AND r."deletedAt" IS NULL LIMIT 1`,
    reqId
  );
  const reqRow = rows?.[0];
  if (!reqRow) throw new Error("Talabnoma bazada topilmadi");
  if (reqRow.status === "COMPLETED") {
    throw new Error("Ushbu talabnoma allaqachon xarajatga o'tkazilgan");
  }

  const rate = await fetchLiveUsdRate();
  const appAmt =
    customAmountTry !== undefined && customAmountTry > 0
      ? Number(customAmountTry.toFixed(2))
      : Number(reqRow.amountInDefault || reqRow.amount || 0);
  const reqCode = `#T-${reqRow.requestNumber}`;
  const noteClean = directorNote ? String(directorNote).trim() : null;

  await moliyPrisma.$executeRawUnsafe(
    `UPDATE "ExpenseRequest"
     SET status = 'APPROVED',
         "approvedAmount" = $1,
         "directorNote" = COALESCE($2, "directorNote"),
         "approvedByName" = $3,
         "approvedAt" = NOW(),
         "updatedAt" = NOW()
     WHERE id = $4`,
    appAmt,
    noteClean,
    approverName,
    reqId
  );

  const dirMsgs = Array.isArray(reqRow.directorMessages) ? reqRow.directorMessages : [];
  const updatedDirHtml =
    `✅ <b>TALABNOMA TASDIQLANDI (${reqCode})</b>\n\n` +
    `👤 So'rovchi: <b>${escapeHtml(reqRow.sourceLabel || reqRow.requesterName || "Xodim")}</b>\n` +
    `💰 Tasdiqlangan summa: <b>₺${fmtNum(appAmt)} TL</b> (~$${fmtNum(appAmt / rate)} USD)\n` +
    `📂 Kategoriya: <b>${escapeHtml(reqRow.categoryName || "Boshqa")}</b>\n` +
    `📋 Maqsad: <b>${escapeHtml(reqRow.description)}</b>\n` +
    (noteClean ? `💬 Direktor izohi: <b>${escapeHtml(noteClean)}</b>\n` : "") +
    `👑 Tasdiqladi: <b>${escapeHtml(approverName)}</b>`;

  for (const dm of dirMsgs) {
    try {
      await bot.api.editMessageText(Number(dm.chatId), Number(dm.messageId), updatedDirHtml, {
        parse_mode: "HTML",
      });
    } catch {}
  }

  const empTgIds = getEmployeeTelegramIdsForRequest(
    reqRow.employeeId,
    reqRow.sourceKey,
    reqRow.requesterTgId
  );
  const empHtml =
    `🎉 <b>TALABNOMANGIZ TASDIQLANDI! (${reqCode})</b>\n\n` +
    `💰 Ruxsat etilgan summa: <b>₺${fmtNum(appAmt)} TL</b> (~$${fmtNum(appAmt / rate)} USD)\n` +
    `📂 Kategoriya: <b>${escapeHtml(reqRow.categoryName || "Boshqa")}</b>\n` +
    `📋 Maqsad: <b>${escapeHtml(reqRow.description)}</b>\n` +
    (noteClean ? `💬 Direktor izohi: <b>${escapeHtml(noteClean)}</b>\n` : "") +
    `\n👇 <i>Xaridni amalga oshirgach, quyidagi tugmani bosib chekni biriktiring va haqiqiy xarajatga o'tkazing:</i>`;

  const empKb = new InlineKeyboard().text(
    "💸 Xarid qilindi (Xarajatga o'tkazish)",
    `req:done:${reqId}`
  );

  for (const tgId of empTgIds) {
    try {
      await bot.api.sendMessage(Number(tgId), empHtml, {
        parse_mode: "HTML",
        reply_markup: empKb,
      });
    } catch {}
  }

  return {
    reqCode,
    approvedAmount: appAmt,
    description: reqRow.description,
    sourceLabel: reqRow.sourceLabel || reqRow.requesterName || "Xodim",
  };
}

export async function rejectExpenseRequestInBot(
  bot: Bot,
  reqId: string,
  approverName: string,
  reason: string
): Promise<{ reqCode: string; description: string; sourceLabel: string }> {
  const rows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT r.*, COALESCE(c.name, 'Boshqa') AS "categoryName"
     FROM "ExpenseRequest" r
     LEFT JOIN "Category" c ON c.id = r."categoryId"
     WHERE r.id = $1 AND r."deletedAt" IS NULL LIMIT 1`,
    reqId
  );
  const reqRow = rows?.[0];
  if (!reqRow) throw new Error("Talabnoma bazada topilmadi");

  const reqCode = `#T-${reqRow.requestNumber}`;
  const cleanReason = String(reason || "Sabab ko'rsatilmadi").trim();
  const amtTry = Number(reqRow.amountInDefault || reqRow.amount || 0);

  await moliyPrisma.$executeRawUnsafe(
    `UPDATE "ExpenseRequest"
     SET status = 'REJECTED',
         "rejectionReason" = $1,
         "approvedByName" = $2,
         "rejectedAt" = NOW(),
         "updatedAt" = NOW()
     WHERE id = $3`,
    cleanReason,
    approverName,
    reqId
  );

  const dirMsgs = Array.isArray(reqRow.directorMessages) ? reqRow.directorMessages : [];
  const updatedDirHtml =
    `❌ <b>TALABNOMA RAD ETILDI (${reqCode})</b>\n\n` +
    `👤 So'rovchi: <b>${escapeHtml(reqRow.sourceLabel || reqRow.requesterName || "Xodim")}</b>\n` +
    `💰 So'ralgan summa: <b>₺${fmtNum(amtTry)} TL</b>\n` +
    `📋 Maqsad: <b>${escapeHtml(reqRow.description)}</b>\n` +
    `🚫 Sabab: <b>${escapeHtml(cleanReason)}</b>\n` +
    `👑 Rad etdi: <b>${escapeHtml(approverName)}</b>`;

  for (const dm of dirMsgs) {
    try {
      await bot.api.editMessageText(Number(dm.chatId), Number(dm.messageId), updatedDirHtml, {
        parse_mode: "HTML",
      });
    } catch {}
  }

  const empTgIds = getEmployeeTelegramIdsForRequest(
    reqRow.employeeId,
    reqRow.sourceKey,
    reqRow.requesterTgId
  );
  const empHtml =
    `❌ <b>TALABNOMANGIZ RAD ETILDI (${reqCode})</b>\n\n` +
    `💰 So'ralgan summa: <b>₺${fmtNum(amtTry)} TL</b>\n` +
    `📂 Kategoriya: <b>${escapeHtml(reqRow.categoryName || "Boshqa")}</b>\n` +
    `📋 Maqsad: <b>${escapeHtml(reqRow.description)}</b>\n` +
    `🚫 Rad etish sababi: <b>${escapeHtml(cleanReason)}</b>`;

  for (const tgId of empTgIds) {
    try {
      await bot.api.sendMessage(Number(tgId), empHtml, {
        parse_mode: "HTML",
      });
    } catch {}
  }

  return {
    reqCode,
    description: reqRow.description,
    sourceLabel: reqRow.sourceLabel || reqRow.requesterName || "Xodim",
  };
}

async function sendExpenseRequestsListCard(
  bot: Bot,
  chatId: number,
  userId: string,
  editMsgId?: number
) {
  const auth = AUTHORIZED_USERS[String(userId)];
  if (!auth) return;

  const whereSql = auth.isDirector
    ? `WHERE r."deletedAt" IS NULL`
    : `WHERE r."deletedAt" IS NULL AND (r."employeeId" = '${auth.employeeId}' OR r."sourceKey" = '${auth.accountKey}' OR r."requesterTgId" = '${userId}')`;

  const rows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT r.id, r."requestNumber", r."amountInDefault"::float AS amount_tl,
            r."approvedAmount"::float AS approved_tl, r.description, r.urgency,
            r.status, r."rejectionReason", r."directorNote", r."sourceLabel",
            r."requesterName", COALESCE(c.name, 'Boshqa') AS category_name,
            TO_CHAR((r."neededDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS needed_date,
            TO_CHAR((r."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') AS created_str
     FROM "ExpenseRequest" r
     LEFT JOIN "Category" c ON c.id = r."categoryId"
     ${whereSql}
     ORDER BY
       CASE WHEN r.status = 'PENDING' THEN 0 WHEN r.status = 'APPROVED' THEN 1 ELSE 2 END ASC,
       r."createdAt" DESC
     LIMIT 10`
  );

  const lines: string[] = [
    auth.isDirector
      ? "📋 <b>BARCHA XARAJAT TALABNOMALARI (Oxirgi 10 ta)</b>"
      : `📋 <b>MENING TALABNOMALARIM (${escapeHtml(auth.accountLabel)})</b>`,
    "────────────────────",
  ];

  const kb = new InlineKeyboard();

  if (!rows || rows.length === 0) {
    lines.push("Hozircha xarajat talabnomalari mavjud emas.");
    lines.push(
      "\n💡 <i>Yangi talabnoma yuborish uchun «📝 Talabnoma yaratish» tugmasini bosing yoki shunchaki «Ofisga suv olish kerak 300 lira» deb yozing!</i>"
    );
  } else {
    for (const r of rows) {
      const code = `#T-${r.requestNumber}`;
      const statusBadge =
        r.status === "PENDING"
          ? "⏳ Kutilmoqda"
          : r.status === "APPROVED"
          ? "✅ Tasdiqlangan (Xaridga ruxsat)"
          : r.status === "COMPLETED"
          ? "💸 Xarid bajarilgan"
          : "❌ Rad etilgan";
      const urgIcon = r.urgency === "URGENT" ? "🔥 " : "";
      const amtShow =
        r.status === "APPROVED" || r.status === "COMPLETED"
          ? Number(r.approved_tl || r.amount_tl)
          : Number(r.amount_tl);
      const whoStr = auth.isDirector
        ? ` • 👤 ${escapeHtml(r.sourceLabel || r.requesterName || "Xodim")}`
        : "";

      lines.push(
        `${urgIcon}<b>${code}</b> — <b>${escapeHtml(r.description)}</b>\n` +
          `   💰 <b>₺${fmtNum(amtShow)} TL</b> • 📂 ${escapeHtml(r.category_name)}${whoStr}\n` +
          `   📅 Kerakli: ${r.needed_date} • 📌 Holat: <b>${statusBadge}</b>` +
          (r.rejectionReason ? `\n   🚫 Sabab: <i>${escapeHtml(r.rejectionReason)}</i>` : "") +
          (r.directorNote ? `\n   💬 Izoh: <i>${escapeHtml(r.directorNote)}</i>` : "")
      );

      if (auth.isDirector && r.status === "PENDING") {
        kb.text(`✅ ${code} Tasdiqlash`, `req:app:${r.id}`)
          .text(`❌ ${code} Rad`, `req:rej:${r.id}`)
          .row();
      } else if (r.status === "APPROVED") {
        kb.text(`💸 ${code} — Xarid qilindi (Xarajatga o'tkazish)`, `req:done:${r.id}`).row();
      }
    }
  }

  kb.text("🔄 Yangilash", "req:list:refresh");

  if (editMsgId) {
    try {
      await bot.api.editMessageText(chatId, editMsgId, lines.join("\n"), {
        parse_mode: "HTML",
        reply_markup: kb,
      });
      return;
    } catch {}
  }
  await bot.api.sendMessage(chatId, lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: kb,
  });
}

// Notify Directors on Telegram & in ERP DB whenever an employee records an expense!
async function notifyDirectorsOfNewExpense(
  bot: Bot,
  item: ExpenseDraftItem,
  expId: string,
  balanceAfter: number,
  flaggedLowBalance: boolean
) {
  const targetInfo = ACCOUNT_TARGETS[item.employee] || ACCOUNT_TARGETS.Idora!;

  // 1. Insert Notification row into moliy_db."Notification" for Director web UI
  try {
    const notifId = "ntf_tg_" + crypto.randomBytes(8).toString("hex");
    await moliyPrisma.$executeRawUnsafe(
      `INSERT INTO "Notification" (id, "userId", title, message, type, "isRead", metadata, "createdAt")
       VALUES ($1, 'cmtlai0bg000ipir95hv9hfez', $2, $3, 'EXPENSE_SUBMITTED', false, $4::jsonb, NOW())`,
      notifId,
      `Yangi xarajat: ${item.title} (₺${fmtNum(item.amountTl)})`,
      `${item.sourcePersonName} (${targetInfo.label}) tomonidan ₺${fmtNum(item.amountTl)} TL ($${fmtNum(item.amountUsd)}) xarajat kiritildi.`,
      JSON.stringify({
        expenseId: expId,
        employeeId: targetInfo.employeeId,
        amountTl: item.amountTl,
        amountUsd: item.amountUsd,
        source: item.sourcePersonName,
      })
    );
  } catch {}

  // 2. Send interactive Telegram notification to Director(s) (except if the Director themselves entered it in the same chat)
  const lines: string[] = [
    "🔔 *YANGI XARAJAT KIRITILDI (Tizim bazasiga yozildi)*",
    "────────────────────",
    `🏦 Hisob (Hamyon): *${targetInfo.label}*`,
    `✍️ Kiritdi (Manba): *${item.sourcePersonName}*`,
    `📝 Nomi: *${item.title}*`,
  ];
  if (item.description && item.description !== item.title) {
    lines.push(`💬 Izoh: ${item.description}`);
  }
  lines.push(
    `📂 Kategoriya: *${item.category}* • 💳 *${item.paymentMethod}*`,
    `📅 Sana: ${item.date}`,
    `💰 Summa: *₺${fmtNum(item.amountTl)} TL* ($${fmtNum(item.amountUsd)} USD)`,
    `📎 Chek: ${item.receiptBuffer || item.receiptFileId ? "✅ *Chek rasmi biriktirilgan*" : "🚫 *Chek yo'q*"}`,
    "────────────────────",
    `💳 "${targetInfo.label}" hamyoni qoldig'i: *₺${fmtNum(balanceAfter)} TL*`
  );
  if (flaggedLowBalance) {
    lines.push("⚠️ *Diqqat: Hamyon balansida mablag' yetarli emas (minusda)!*");
  }

  const kb = new InlineKeyboard()
    .text("✏️ Summani to'g'rilash", `dir:editamt:${expId}`)
    .text("📂 Kategoriya", `dir:editcat:${expId}`)
    .row()
    .text("❌ Bekor qilish (Hamyonga qaytarish)", `dir:void:${expId}`)
    .text(`💸 ${targetInfo.key}ga pul berish`, `dir:assign:emp:${targetInfo.key}`);

  for (const dirTgId of getDirectorTelegramIds()) {
    if (String(dirTgId) === String(item.userId)) continue;
    try {
      if (item.receiptFileId && (!item.receiptMimeType || item.receiptMimeType.startsWith("image/"))) {
        await bot.api.sendPhoto(Number(dirTgId), item.receiptFileId, {
          caption: lines.join("\n"),
          parse_mode: "Markdown",
          reply_markup: kb,
        });
      } else {
        await bot.api.sendMessage(Number(dirTgId), lines.join("\n"), {
          parse_mode: "Markdown",
          reply_markup: kb,
        });
      }
    } catch {
      try {
        await bot.api.sendMessage(Number(dirTgId), lines.join("\n"), {
          parse_mode: "Markdown",
          reply_markup: kb,
        });
      } catch {}
    }
  }
}

export async function notifyDirectorsOfPendingUser(
  bot: Bot,
  telegramId: string,
  fullName: string,
  username: string | null
) {
  const kb = new InlineKeyboard()
    .text("🏦 Idora ga ulash", `dir:link:${telegramId}:Idora`)
    .text("🏦 Vaqf ga ulash", `dir:link:${telegramId}:Vaqf`)
    .row()
    .text("🏦 Abdurahmon (Moliya)", `dir:link:${telegramId}:Abdurahmon`)
    .text("🏦 Muhammadjon", `dir:link:${telegramId}:Muhammadjon`)
    .row()
    .text("🏦 Mezana (Ayollar)", `dir:link:${telegramId}:Mezana`);

  const msg = [
    "👤 *YANGI XODIM BOTDA RO'YXATDAN O'TDI*",
    "────────────────────",
    `📝 Ism-familiyasi: *${fullName}*`,
    `🆔 Telegram ID: \`${telegramId}\``,
    username ? `🔗 Username: @${username}` : "",
    "",
    "👇 Ushbu xodimni tizimdagi qaysi hisob (hamyon)ga biriktiramiz?",
  ]
    .filter(Boolean)
    .join("\n");

  for (const dirTgId of getDirectorTelegramIds()) {
    try {
      await bot.api.sendMessage(Number(dirTgId), msg, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
    } catch {}
  }
}

async function saveExpenseToDatabases(
  bot: Bot,
  item: ExpenseDraftItem
): Promise<{
  expId: string;
  txId: string;
  balanceAfter: number;
}> {
  const target = ACCOUNT_TARGETS[item.employee] || ACCOUNT_TARGETS.Idora!;
  const categoryId = CATEGORY_ID_MAP[item.category] || CATEGORY_ID_MAP["Boshqa"]!;
  const expId = "exp_tg_" + crypto.randomBytes(8).toString("hex");
  const txId = "wtx_tg_" + crypto.randomBytes(8).toString("hex");
  const refId = "ref_tg_" + crypto.randomBytes(8).toString("hex");

  const baseDesc = item.description && item.description !== item.title ? item.description : item.title;
  const fullDesc = `${baseDesc} [Manba: ${item.sourcePersonName} | ${item.paymentMethod}]`;
  const amtOrig = item.currency === "USD" ? item.amountUsd : item.amountTl;
  const amtTl = item.amountTl;
  const amtUsd = item.amountUsd;
  const usdRate = item.usdRate;
  const expDateIso = `${item.date}T12:00:00.000Z`;

  // 1. Read current wallet balance in moliy_db
  const wRows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT balance::float AS balance FROM "Wallet" WHERE id = $1 LIMIT 1`,
    target.walletId
  );
  const balBefore = Number(wRows?.[0]?.balance || 0);
  const balAfter = Number((balBefore - amtTl).toFixed(4));
  const flaggedLowBalance = balBefore < amtTl;

  // 2. Write to moliy_db
  await moliyPrisma.$transaction([
    moliyPrisma.$executeRawUnsafe(
      `INSERT INTO "Expense" (
        id, "employeeId", "officeId", "categoryId", title, description,
        amount, currency, "amountInDefault", "defaultCurrency",
        "usdRate", "amountUsd", date, status, "flaggedLowBalance",
        "approvedById", "approvedAt", "paidAt", "requestId", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, 'main-office', $3, $4, $5,
        $6, $7, $8, 'TL',
        $9, $10, $11::timestamp, 'PAID'::"ExpenseStatus", $12,
        'cmtlai0bg000ipir95hv9hfez', NOW(), NOW(), $13, NOW(), NOW()
      )`,
      expId,
      target.employeeId,
      categoryId,
      item.title,
      fullDesc,
      amtOrig,
      item.currency,
      amtTl,
      usdRate,
      amtUsd,
      expDateIso,
      flaggedLowBalance,
      item.linkedRequestId || null
    ),
    moliyPrisma.$executeRawUnsafe(
      `UPDATE "Wallet"
       SET balance = balance - $1,
           "totalSpent" = "totalSpent" + $1,
           "updatedAt" = NOW()
       WHERE id = $2`,
      amtTl,
      target.walletId
    ),
    moliyPrisma.$executeRawUnsafe(
      `INSERT INTO "WalletTransaction" (
        id, "referenceId", "walletId", type, amount,
        "balanceBefore", "balanceAfter", currency, description,
        "expenseId", "createdAt", "occurredAt"
      ) VALUES (
        $1, $2, $3, 'EXPENSE_DEBIT'::"TransactionType", $4,
        $5, $6, 'TL', $7,
        $8, NOW(), NOW()
      )`,
      txId,
      refId,
      target.walletId,
      amtTl,
      balBefore,
      balAfter,
      fullDesc,
      expId
    ),
  ]);

  if (item.linkedRequestId) {
    try {
      await moliyPrisma.$executeRawUnsafe(
        `UPDATE "ExpenseRequest"
         SET status = 'COMPLETED',
             "approvedAmount" = $1,
             "completedAt" = NOW(),
             "expenseId" = $2,
             "updatedAt" = NOW()
         WHERE id = $3`,
        amtTl,
        expId,
        item.linkedRequestId
      );
    } catch {}
  }

  const [expYear, expMonth] = item.date.slice(0, 7).split("-").map(Number);
  if (expYear && expMonth) {
    try {
      await moliyPrisma.$executeRawUnsafe(
        `UPDATE "Budget" SET spent = spent + $1, "updatedAt" = NOW() WHERE "categoryId" = $2 AND year = $3 AND month = $4`,
        amtTl,
        categoryId,
        expYear,
        expMonth
      );
    } catch {}
  }

  // 3. Mirror to mezana_platform
  try {
    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `INSERT INTO finance."Expense" (
          id, "employeeId", "officeId", "categoryId", title, description,
          amount, currency, "amountInDefault", "defaultCurrency",
          date, status, "flaggedLowBalance",
          "approvedById", "approvedAt", "paidAt", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, 'main-office', $3, $4, $5,
          $6, $7, $8, 'TL',
          $9::timestamp, 'PAID'::finance."ExpenseStatus", $10,
          'cmtlai0bg000ipir95hv9hfez', NOW(), NOW(), NOW(), NOW()
        )`,
        expId,
        target.employeeId,
        categoryId,
        item.title,
        fullDesc,
        amtOrig,
        item.currency,
        amtTl,
        expDateIso,
        flaggedLowBalance
      ),
      prisma.$executeRawUnsafe(
        `UPDATE finance."Wallet"
         SET balance = balance - $1,
             "totalSpent" = "totalSpent" + $1,
             "updatedAt" = NOW()
         WHERE id = $2`,
        amtTl,
        target.walletId
      ),
      prisma.$executeRawUnsafe(
        `INSERT INTO finance."WalletTransaction" (
          id, "referenceId", "walletId", type, amount,
          "balanceBefore", "balanceAfter", currency, description,
          "expenseId", "createdAt", "occurredAt"
        ) VALUES (
          $1, $2, $3, 'EXPENSE_DEBIT'::finance."TransactionType", $4,
          $5, $6, 'TL', $7,
          $8, NOW(), NOW()
        )`,
        txId,
        refId,
        target.walletId,
        amtTl,
        balBefore,
        balAfter,
        fullDesc,
        expId
      ),
    ]);
  } catch (mirrorErr: any) {
    console.error("[mezana_platform mirror error]:", mirrorErr?.message || mirrorErr);
  }

  // 3.5 Save receipt image file and DB row if attached
  if (item.receiptBuffer && item.receiptBuffer.length > 0) {
    try {
      item.receiptPublicUrl = await saveReceiptToDiskAndDb(
        expId,
        item.receiptBuffer,
        item.receiptFileName,
        item.receiptMimeType
      );
    } catch (recErr: any) {
      console.error("[saveReceiptToDiskAndDb error]:", recErr?.message || recErr);
    }
  }

  // 4. Notify Directors
  await notifyDirectorsOfNewExpense(bot, item, expId, balAfter, flaggedLowBalance);

  return { expId, txId, balanceAfter: balAfter };
}

async function voidExpenseByIdFromDatabases(
  expenseId: string,
  actorName: string
): Promise<{
  title: string;
  amountTl: number;
  amountUsd: number;
  targetLabel: string;
  restoredBalance: number;
}> {
  const expRows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT id, "employeeId", "categoryId", title, "amountInDefault"::float AS amount_tl,
            "amountUsd"::float AS amount_usd, date, status, "deletedAt"
     FROM "Expense" WHERE id = $1 LIMIT 1`,
    expenseId
  );
  const exp = expRows?.[0];
  if (!exp) throw new Error("Xarajat bazada topilmadi");
  if (exp.deletedAt || exp.status === "REJECTED") {
    throw new Error("Ushbu xarajat allaqachon bekor qilingan");
  }

  const target =
    Object.values(ACCOUNT_TARGETS).find((t) => t.employeeId === exp.employeeId) ||
    ACCOUNT_TARGETS.Idora!;
  const amtTl = Number(exp.amount_tl || 0);
  const amtUsd = Number(exp.amount_usd || 0);
  const revTxId = "wtx_rev_" + crypto.randomBytes(8).toString("hex");
  const revRefId = "ref_rev_" + crypto.randomBytes(8).toString("hex");

  const wRows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT balance::float AS balance FROM "Wallet" WHERE id = $1 LIMIT 1`,
    target.walletId
  );
  const balBefore = Number(wRows?.[0]?.balance || 0);
  const balAfter = Number((balBefore + amtTl).toFixed(4));

  await moliyPrisma.$transaction([
    moliyPrisma.$executeRawUnsafe(
      `UPDATE "Expense"
       SET status = 'REJECTED'::"ExpenseStatus",
           "rejectionReason" = $2,
           "deletedAt" = NOW(),
           "updatedAt" = NOW()
       WHERE id = $1`,
      expenseId,
      `[BEKOR QILINDI: ${actorName}]`
    ),
    moliyPrisma.$executeRawUnsafe(
      `UPDATE "Wallet"
       SET balance = balance + $1,
           "totalSpent" = GREATEST(0, "totalSpent" - $1),
           "updatedAt" = NOW()
       WHERE id = $2`,
      amtTl,
      target.walletId
    ),
    moliyPrisma.$executeRawUnsafe(
      `INSERT INTO "WalletTransaction" (
        id, "referenceId", "walletId", type, amount,
        "balanceBefore", "balanceAfter", currency, description,
        "expenseId", "createdAt", "occurredAt"
      ) VALUES (
        $1, $2, $3, 'ADJUSTMENT'::"TransactionType", $4,
        $5, $6, 'TL', $7,
        $8, NOW(), NOW()
      )`,
      revTxId,
      revRefId,
      target.walletId,
      amtTl,
      balBefore,
      balAfter,
      `[BEKOR QILINDI] ${exp.title} (${actorName})`,
      expenseId
    ),
  ]);

  try {
    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `UPDATE finance."Expense"
         SET status = 'REJECTED'::finance."ExpenseStatus",
             "rejectionReason" = $2,
             "deletedAt" = NOW(),
             "updatedAt" = NOW()
         WHERE id = $1`,
        expenseId,
        `[BEKOR QILINDI: ${actorName}]`
      ),
      prisma.$executeRawUnsafe(
        `UPDATE finance."Wallet"
         SET balance = balance + $1,
             "totalSpent" = GREATEST(0, "totalSpent" - $1),
             "updatedAt" = NOW()
         WHERE id = $2`,
        amtTl,
        target.walletId
      ),
    ]);
  } catch {}

  return {
    title: exp.title,
    amountTl: amtTl,
    amountUsd: amtUsd,
    targetLabel: target.label,
    restoredBalance: balAfter,
  };
}

// Director action: Assign funds to an employee's wallet
async function assignFundsToWallet(
  bot: Bot,
  targetKey: string,
  amountTl: number,
  description: string,
  directorName: string
): Promise<{ balanceBefore: number; balanceAfter: number }> {
  const target = ACCOUNT_TARGETS[targetKey];
  if (!target) throw new Error("Hisob topilmadi: " + targetKey);

  const wRows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT balance::float AS balance FROM "Wallet" WHERE id = $1 LIMIT 1`,
    target.walletId
  );
  const balBefore = Number(wRows?.[0]?.balance || 0);
  const balAfter = Number((balBefore + amountTl).toFixed(4));
  const txId = "wtx_asg_" + crypto.randomBytes(8).toString("hex");
  const refId = "ref_asg_" + crypto.randomBytes(8).toString("hex");
  const fullDesc = `${description || "Hamyonga mablag' ajratildi"} [Direktor: ${directorName}]`;

  await moliyPrisma.$transaction([
    moliyPrisma.$executeRawUnsafe(
      `UPDATE "Wallet"
       SET balance = balance + $1,
           "totalAssigned" = "totalAssigned" + $1,
           "updatedAt" = NOW()
       WHERE id = $2`,
      amountTl,
      target.walletId
    ),
    moliyPrisma.$executeRawUnsafe(
      `INSERT INTO "WalletTransaction" (
        id, "referenceId", "walletId", type, amount,
        "balanceBefore", "balanceAfter", currency, description,
        "createdAt", "occurredAt"
      ) VALUES (
        $1, $2, $3, 'ASSIGNMENT'::"TransactionType", $4,
        $5, $6, 'TL', $7,
        NOW(), NOW()
      )`,
      txId,
      refId,
      target.walletId,
      amountTl,
      balBefore,
      balAfter,
      fullDesc
    ),
  ]);

  try {
    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `UPDATE finance."Wallet"
         SET balance = balance + $1,
             "totalAssigned" = "totalAssigned" + $1,
             "updatedAt" = NOW()
         WHERE id = $2`,
        amountTl,
        target.walletId
      ),
      prisma.$executeRawUnsafe(
        `INSERT INTO finance."WalletTransaction" (
          id, "referenceId", "walletId", type, amount,
          "balanceBefore", "balanceAfter", currency, description,
          "createdAt", "occurredAt"
        ) VALUES (
          $1, $2, $3, 'ASSIGNMENT'::finance."TransactionType", $4,
          $5, $6, 'TL', $7,
          NOW(), NOW()
        )`,
        txId,
        refId,
        target.walletId,
        amountTl,
        balBefore,
        balAfter,
        fullDesc
      ),
    ]);
  } catch {}

  // Notify the recipient employee(s) on Telegram!
  const recipients = Object.values(AUTHORIZED_USERS).filter(
    (u) => u.accountKey === targetKey && !u.isDirector
  );
  for (const r of recipients) {
    try {
      await bot.api.sendMessage(
        Number(r.telegramId),
        [
          "💳 *HAMYONINGIZGA MABLAG' AJRATILDI!*",
          "────────────────────",
          `🏦 Hisob: *${target.label}*`,
          `➕ Qo'shilgan summa: *+₺${fmtNum(amountTl)} TL*`,
          `📝 Izoh: ${description || "Hamyon to'ldirildi"}`,
          `👑 Tasdiqladi: *${directorName}*`,
          "────────────────────",
          `💰 Hamyon yangi balansi: *₺${fmtNum(balAfter)} TL*`,
        ].join("\n"),
        { parse_mode: "Markdown" }
      );
    } catch {}
  }

  return { balanceBefore: balBefore, balanceAfter: balAfter };
}

// Director action: Record Treasury Income (Kirim)
async function recordTreasuryIncome(
  amount: number,
  currency: "TL" | "USD",
  sourceTitle: string,
  description: string,
  directorName: string
): Promise<{ id: string; amountTl: number; amountUsd: number; usdRate: number }> {
  const rate = await fetchLiveUsdRate();
  const amountTl = currency === "USD" ? Number((amount * rate).toFixed(2)) : Number(amount.toFixed(2));
  const amountUsd = currency === "USD" ? Number(amount.toFixed(2)) : Number((amount / rate).toFixed(2));
  const incId = "inc_tg_" + crypto.randomBytes(8).toString("hex");
  const fullDesc = `${description || sourceTitle} [Kiritdi: ${directorName}]`;

  await moliyPrisma.$executeRawUnsafe(
    `INSERT INTO "Income" (
      id, "officeId", source, description, amount, currency,
      "amountInDefault", "defaultCurrency", "usdRate", "amountUsd",
      date, "createdById", "createdAt", "updatedAt"
    ) VALUES (
      $1, 'main-office', $2, $3, $4, $5,
      $6, 'TL', $7, $8,
      NOW(), 'cmtlai0bg000ipir95hv9hfez', NOW(), NOW()
    )`,
    incId,
    sourceTitle || "Kirim",
    fullDesc,
    amount,
    currency,
    amountTl,
    rate,
    amountUsd
  );

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO finance."Income" (
        id, "officeId", source, description, amount, currency,
        "amountInDefault", "defaultCurrency", date, "createdById", "createdAt", "updatedAt"
      ) VALUES (
        $1, 'main-office', $2, $3, $4, $5,
        $6, 'TL', NOW(), 'cmtlai0bg000ipir95hv9hfez', NOW(), NOW()
      )`,
      incId,
      sourceTitle || "Kirim",
      fullDesc,
      amount,
      currency,
      amountTl
    );
  } catch {}

  return { id: incId, amountTl, amountUsd, usdRate: rate };
}

// Director action: Build & send comprehensive Dashboard
async function buildDirectorDashboardData() {
  const rate = await fetchLiveUsdRate();
  const todayStr = getIstanbulDateStr();
  const monthPrefix = todayStr.slice(0, 7);

  const [incRows, asgRows, expStatsRows, walletRows]: any = await Promise.all([
    moliyPrisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM("amountInDefault"), 0)::float AS total_tl,
              COALESCE(SUM("amountUsd"), 0)::float AS total_usd
       FROM "Income" WHERE "deletedAt" IS NULL`
    ),
    moliyPrisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(amount), 0)::float AS total_assigned
       FROM "WalletTransaction" WHERE type = 'ASSIGNMENT'`
    ),
    moliyPrisma.$queryRawUnsafe(
      `SELECT
         COUNT(*)::int AS total_cnt,
         COALESCE(SUM("amountInDefault"), 0)::float AS total_tl,
         COALESCE(SUM("amountUsd"), 0)::float AS total_usd,
         COUNT(*) FILTER (WHERE date::date = $1::date)::int AS today_cnt,
         COALESCE(SUM("amountInDefault") FILTER (WHERE date::date = $1::date), 0)::float AS today_tl,
         COALESCE(SUM("amountUsd") FILTER (WHERE date::date = $1::date), 0)::float AS today_usd,
         COUNT(*) FILTER (WHERE to_char(date, 'YYYY-MM') = $2)::int AS month_cnt,
         COALESCE(SUM("amountInDefault") FILTER (WHERE to_char(date, 'YYYY-MM') = $2), 0)::float AS month_tl,
         COALESCE(SUM("amountUsd") FILTER (WHERE to_char(date, 'YYYY-MM') = $2), 0)::float AS month_usd
       FROM "Expense"
       WHERE "deletedAt" IS NULL AND status != 'REJECTED'`,
      todayStr,
      monthPrefix
    ),
    moliyPrisma.$queryRawUnsafe(
      `SELECT e.id AS emp_id, e."fullName" AS name, e.department,
              w.balance::float AS balance, w."totalAssigned"::float AS assigned, w."totalSpent"::float AS spent
       FROM "Employee" e
       JOIN "Wallet" w ON w."employeeId" = e.id
       WHERE e."deletedAt" IS NULL
       ORDER BY e."createdAt" ASC`
    ),
  ]);

  const totalIncomeTl = Number(incRows?.[0]?.total_tl || 0);
  const totalIncomeUsd = Number(incRows?.[0]?.total_usd || totalIncomeTl / rate);
  const totalAssignedTl = Number(asgRows?.[0]?.total_assigned || 0);
  const treasuryBalanceTl = totalIncomeTl - totalAssignedTl;
  const expSt = expStatsRows?.[0] || {};
  const walletsTotalBalance = (walletRows || []).reduce(
    (s: number, w: any) => s + Number(w.balance || 0),
    0
  );

  return {
    rate,
    todayStr,
    monthPrefix,
    totalIncomeTl,
    totalIncomeUsd,
    totalAssignedTl,
    treasuryBalanceTl,
    walletsTotalBalance,
    expSt,
    walletRows: walletRows || [],
  };
}

export async function sendDirectorDashboard(bot: Bot, chatId: number, editMsgId?: number) {
  const d = await buildDirectorDashboardData();

  const lines: string[] = [
    `👑 *DIREKTOR Boshqaruv Paneli (${d.todayStr})*`,
    `💱 Kurs: \`1$ = ${d.rate.toFixed(4)} ₺\``,
    "────────────────────",
    "🏛 *XAZINA VA UMUMIY BALANS:*",
    `• Jami Kirim (Income): *₺${fmtNum(d.totalIncomeTl)} TL* ($${fmtNum(d.totalIncomeUsd)})`,
    `• Hamyonlarga berilgan: *₺${fmtNum(d.totalAssignedTl)} TL*`,
    `• Xazina sof qoldig'i: *₺${fmtNum(d.treasuryBalanceTl)} TL*`,
    `• Hamyonlardagi jami qoldiq: *₺${fmtNum(d.walletsTotalBalance)} TL*`,
    "────────────────────",
    "📉 *XARAJATLAR STATISTIKASI:*",
    `• Bugun (${d.expSt.today_cnt || 0} ta): *₺${fmtNum(d.expSt.today_tl)} TL* ($${fmtNum(d.expSt.today_usd)})`,
    `• Shu oy (${d.expSt.month_cnt || 0} ta): *₺${fmtNum(d.expSt.month_tl)} TL* ($${fmtNum(d.expSt.month_usd)})`,
    `• Jami (${d.expSt.total_cnt || 0} ta): *₺${fmtNum(d.expSt.total_tl)} TL* ($${fmtNum(d.expSt.total_usd)})`,
    "────────────────────",
    "🏦 *MAS'UL HISOBLAR (HAMYONLAR):*",
  ];

  for (const w of d.walletRows) {
    const deptStr = w.department ? ` (${w.department})` : "";
    const warn = Number(w.balance) < 0 ? " ⚠️" : "";
    lines.push(
      `• *${w.name}${deptStr}:* Balans: \`₺${fmtNum(w.balance)}\`${warn} | Sarf: \`₺${fmtNum(w.spent)}\``
    );
  }

  const kb = new InlineKeyboard()
    .text("🔄 Yangilash", "dir:dash:refresh")
    .text("📂 Kategoriyalar kesimi", "dir:dash:cats")
    .row()
    .text("💸 Hamyonga pul berish", "dir:assign:menu")
    .text("💰 Xazinaga kirim", "dir:income:start")
    .row()
    .text("🧾 Oxirgi xarajatlar (Boshqaruv)", "dir:exp:list:all");

  if (editMsgId) {
    try {
      await bot.api.editMessageText(chatId, editMsgId, lines.join("\n"), {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    } catch {}
  }
  await bot.api.sendMessage(chatId, lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: kb,
  });
}

async function sendDirectorWalletsMenu(bot: Bot, chatId: number, editMsgId?: number) {
  const walletRows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT e.id AS emp_id, e."fullName" AS name, e.department,
            w.balance::float AS balance, w."totalAssigned"::float AS assigned, w."totalSpent"::float AS spent
     FROM "Employee" e
     JOIN "Wallet" w ON w."employeeId" = e.id
     WHERE e."deletedAt" IS NULL
     ORDER BY e."createdAt" ASC`
  );

  const lines: string[] = [
    "🏦 *BARCHA HAMYONLAR VA BALANSLAR*",
    "────────────────────",
  ];

  for (const w of walletRows) {
    const deptStr = w.department ? ` (${w.department})` : "";
    const warn = Number(w.balance) < 0 ? " ⚠️ *[MINUSDA]*" : "";
    lines.push(
      `👤 *${w.name}${deptStr}*${warn}\n` +
        `   💳 Balans: *₺${fmtNum(w.balance)} TL*\n` +
        `   📥 Berilgan: ₺${fmtNum(w.assigned)} | 📤 Sarflangan: ₺${fmtNum(w.spent)}`
    );
  }
  lines.push("────────────────────");
  lines.push("👇 Qaysi hamyonga pul ajratmoqchisiz yoki xarajatlarini ko'rmoqchisiz?");

  const kb = new InlineKeyboard();
  const mainKeys = ["Idora", "Vaqf", "Abdurahmon", "Muhammadjon", "Mezana"];
  for (const k of mainKeys) {
    const info = ACCOUNT_TARGETS[k]!;
    kb.text(`💸 ${info.key} (+Pul)`, `dir:assign:emp:${k}`).text(
      `📜 ${info.key} xarajatlari`,
      `dir:exp:list:${k}`
    );
    kb.row();
  }

  if (editMsgId) {
    try {
      await bot.api.editMessageText(chatId, editMsgId, lines.join("\n"), {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    } catch {}
  }
  await bot.api.sendMessage(chatId, lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: kb,
  });
}

async function sendDirectorExpensesList(
  bot: Bot,
  chatId: number,
  filterKey = "all",
  editMsgId?: number
) {
  const target = filterKey !== "all" ? ACCOUNT_TARGETS[filterKey] : null;
  const whereClause = target
    ? `WHERE e."deletedAt" IS NULL AND e.status != 'REJECTED' AND e."employeeId" = '${target.employeeId}'`
    : `WHERE e."deletedAt" IS NULL AND e.status != 'REJECTED'`;

  const rows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT e.id, e.title, e.description, e."amountInDefault"::float AS amount_tl,
            e."amountUsd"::float AS amount_usd, e.date,
            c.name AS category_name, emp."fullName" AS emp_name
     FROM "Expense" e
     LEFT JOIN "Category" c ON c.id = e."categoryId"
     LEFT JOIN "Employee" emp ON emp.id = e."employeeId"
     ${whereClause}
     ORDER BY e.date DESC, e."createdAt" DESC
     LIMIT 8`
  );

  const titleLabel = target ? target.label : "Barcha hisoblar";
  const lines: string[] = [
    `🧾 *OXIRGI XARAJATLAR (${titleLabel})*`,
    "────────────────────",
  ];

  const kb = new InlineKeyboard();
  // Filter tabs
  kb.text(filterKey === "all" ? "✅ Barchasi" : "Barchasi", "dir:exp:list:all")
    .text(filterKey === "Idora" ? "✅ Idora" : "Idora", "dir:exp:list:Idora")
    .text(filterKey === "Vaqf" ? "✅ Vaqf" : "Vaqf", "dir:exp:list:Vaqf")
    .row()
    .text(filterKey === "Abdurahmon" ? "✅ Abdurahmon" : "Abdurahmon", "dir:exp:list:Abdurahmon")
    .text(filterKey === "Muhammadjon" ? "✅ Muhammadjon" : "Muhammadjon", "dir:exp:list:Muhammadjon")
    .row();

  if (!rows || rows.length === 0) {
    lines.push("Hozircha xarajatlar topilmadi.");
  } else {
    rows.forEach((r, idx) => {
      const dStr = r.date ? new Date(r.date).toISOString().slice(0, 10) : "";
      const srcMatch = String(r.description || "").match(/\[Manba:\s*([^\]]+)\]/);
      const srcStr = srcMatch ? ` (${srcMatch[1]})` : "";
      lines.push(
        `*#${idx + 1}.* *${r.title}* — \`₺${fmtNum(r.amount_tl)}\` ($${fmtNum(r.amount_usd)})\n` +
          `   🏦 ${r.emp_name}${srcStr} • 📂 ${r.category_name || "Boshqa"} • 📅 ${dStr}`
      );
      kb.text(`⚙️ #${idx + 1} (${r.title.slice(0, 12)})`, `dir:exp:view:${r.id}`);
      if ((idx + 1) % 2 === 0) kb.row();
    });
    if (rows.length % 2 !== 0) kb.row();
    lines.push("────────────────────");
    lines.push("💡 Xarajatni tahrirlash yoki bekor qilish uchun pastdagi `⚙️ #...` tugmasini bosing:");
  }

  if (editMsgId) {
    try {
      await bot.api.editMessageText(chatId, editMsgId, lines.join("\n"), {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    } catch {}
  }
  await bot.api.sendMessage(chatId, lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: kb,
  });
}

async function sendDirectorRateAndBudgetMenu(bot: Bot, chatId: number, editMsgId?: number) {
  const rate = await fetchLiveUsdRate();
  const todayStr = getIstanbulDateStr();
  const [year, month] = todayStr.slice(0, 7).split("-").map(Number);

  const budgets: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT b.id, b.amount::float AS limit_tl, b.spent::float AS spent_tl, c.name AS category_name
     FROM "Budget" b
     JOIN "Category" c ON c.id = b."categoryId"
     WHERE b.year = $1 AND b.month = $2
     ORDER BY b.spent DESC`,
    year,
    month
  );

  const lines: string[] = [
    `🎯 *OYLIK BYUDJET VA 💱 VALYUTA KURSI (${year}-${String(month).padStart(2, "0")})*`,
    "────────────────────",
    `💱 Joriy rasmiy kurs: *1 USD ($) = ${rate.toFixed(4)} TL (₺)*`,
    "────────────────────",
    "📊 *Oylik Kategoriya Limitlari (Byudjet):*",
  ];

  if (!budgets || budgets.length === 0) {
    lines.push("Hozircha joriy oy uchun kategoriya limitlari belgilanmagan.");
  } else {
    for (const b of budgets) {
      const pct = b.limit_tl > 0 ? Math.round((b.spent_tl / b.limit_tl) * 100) : 0;
      const icon = pct >= 100 ? "🔴" : pct >= 80 ? "🟡" : "🟢";
      lines.push(
        `${icon} *${b.category_name}:* ₺${fmtNum(b.spent_tl)} / ₺${fmtNum(b.limit_tl)} (${pct}%)`
      );
    }
  }

  const kb = new InlineKeyboard()
    .text("💱 USD Kursini yangilash", "dir:rate:prompt")
    .text("🎯 Byudjet belgilash", "dir:budget:catmenu");

  if (editMsgId) {
    try {
      await bot.api.editMessageText(chatId, editMsgId, lines.join("\n"), {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    } catch {}
  }
  await bot.api.sendMessage(chatId, lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: kb,
  });
}

async function sendDirectorStaffMenu(bot: Bot, chatId: number, editMsgId?: number) {
  await refreshDynamicAuthorizedUsers();
  const contacts = await prisma.telegramContact.findMany({
    orderBy: { createdAt: "asc" },
  });

  const linkedList = Object.values(AUTHORIZED_USERS);
  const pendingList = contacts.filter((c) => !AUTHORIZED_USERS[c.telegramId]);

  const lines: string[] = [
    "👥 *XODIMLAR VA TELEGRAM RUXSATLARI*",
    "────────────────────",
    "✅ *Faol biriktirilgan mas'ullar:*",
  ];

  const seenTg = new Set<string>();
  for (const u of linkedList) {
    if (seenTg.has(u.telegramId)) continue;
    seenTg.add(u.telegramId);
    lines.push(`• *${u.personName}* (\`${u.telegramId}\`) ➡️ *${u.accountLabel}*`);
  }

  lines.push("────────────────────");
  lines.push("⏳ *Tasdiqlashni kutayotganlar (Botga start bosganlar):*");

  const kb = new InlineKeyboard();
  if (pendingList.length === 0) {
    lines.push("Hozircha kutayotgan yangi so'rovlar yo'q.");
  } else {
    for (const p of pendingList) {
      const name = p.fullName || [p.firstName, p.lastName].filter(Boolean).join(" ") || "Noma'lum";
      const uname = p.username ? ` (@${p.username})` : "";
      lines.push(`• *${name}*${uname} — ID: \`${p.telegramId}\``);
      kb.text(`🔗 ${name.slice(0, 18)} ni ulash`, `dir:staff:pick:${p.telegramId}`).row();
    }
  }

  if (editMsgId) {
    try {
      await bot.api.editMessageText(chatId, editMsgId, lines.join("\n"), {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    } catch {}
  }
  await bot.api.sendMessage(chatId, lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: kb,
  });
}

interface AiParsedResult {
  intent:
    | "new_expense"
    | "update_draft"
    | "assign_wallet"
    | "treasury_income"
    | "set_rate"
    | "not_expense";
  replyMessage?: string;
  walletAssign?: {
    targetAccount: string;
    amount: number;
    currency: "TL" | "USD";
    description: string;
  };
  treasuryIncome?: {
    source: string;
    amount: number;
    currency: "TL" | "USD";
    description: string;
  };
  newUsdRate?: number;
  items: Array<{
    title: string;
    description: string;
    amount: number;
    currency: "TL" | "USD";
    category: string;
    employee?: string;
    paymentMethod: "Naqd" | "Karta";
    date: string;
    isRequest?: boolean;
    urgency?: "NORMAL" | "URGENT";
    neededDate?: string;
  }>;
  updates?: {
    title?: string;
    description?: string;
    amount?: number;
    currency?: "TL" | "USD";
    category?: string;
    employee?: string;
    paymentMethod?: "Naqd" | "Karta";
    date?: string;
    isRequest?: boolean;
    urgency?: "NORMAL" | "URGENT";
    neededDate?: string;
  };
}

function detectRequestIntentFromText(text: string): boolean {
  if (!text) return false;
  return /\b(kerak|olish\s+kerak|olmoqchi\w*|ruxsat|talabnoma|so['`’]?rov|olaylik|zarur|xarid\s+qilmoqchi\w*|byudjet\s+kerak|pul\s+kerak|ajratish\s+kerak)\b/i.test(
    text
  );
}

function detectUrgencyFromText(text: string): "NORMAL" | "URGENT" {
  if (!text) return "NORMAL";
  return /\b(shoshilinch|tezda|zudlik\s+bilan|srochno|urgent|hoziroq)\b/i.test(text)
    ? "URGENT"
    : "NORMAL";
}

async function analyzeExpenseWithAi(params: {
  text: string;
  defaultEmployee: string;
  isDirector: boolean;
  todayStr: string;
  currentDraft?: ExpenseDraftItem | null;
  imageBase64Url?: string | null;
}): Promise<AiParsedResult> {
  const { text, defaultEmployee, isDirector, todayStr, currentDraft, imageBase64Url } = params;

  const draftContext = currentDraft
    ? `FOYDALANUVCHIDA HOZIR OCHIQ QORALAMA BOR (#${currentDraft.id}):
- Tur: ${currentDraft.isRequest ? "XARAJATGA TALABNOMA (isRequest=true)" : "HAQIQIY XARAJAT (isRequest=false)"}
- Nomi: "${currentDraft.title}"
- Summa: ${currentDraft.amount} ${currentDraft.currency}
- Kategoriya: "${currentDraft.category}"
- Hisob (Hamyon): "${currentDraft.employee}"
- To'lov usuli: "${currentDraft.paymentMethod}"
- Sana: "${currentDraft.date}"

Agar foydalanuvchi xabari shu ochiq qoralamani tuzatishga qaratilgan bo'lsa (masalan: "450 emas 550 edi", "karta orqali", "kategoriyasi Taksi bo'lsin", "dollarda edi", "talabnoma qil", "shoshilinch"), intent="update_draft" qaytaring va "updates" ichida faqat o'zgargan maydonlarni bering.`
    : `Foydalanuvchida hozir ochiq qoralama yo'q.`;

  const directorRules = isDirector
    ? `FOYDALANUVCHI — DIREKTOR (RAHBAR):
1) Agar Direktor biror xodim/bo'lim hamyoniga pul ajratayotgan bo'lsa (masalan: "Idoraga 20000 lira berdim", "Vaqf hamyoniga 10000 tl o'tkaz", "Muhammadjonga 5000 tl ajrat"):
   intent="assign_wallet" qaytaring va "walletAssign": { "targetAccount": "Idora"|"Vaqf"|"Abdurahmon"|"Muhammadjon"|"Mezana", "amount": ..., "currency": "TL"|"USD", "description": "..." } to'ldiring.
2) Agar Direktor xazinaga kirim kiritayotgan bo'lsa (masalan: "Xazinaga 5000 dollar kirim bo'ldi", "Kassaga 100000 lira tushdi"):
   intent="treasury_income" qaytaring va "treasuryIncome": { "source": "...", "amount": ..., "currency": "TL"|"USD", "description": "..." } to'ldiring.
3) Agar Direktor dollar kursini o'zgartirmoqchi bo'lsa (masalan: "Kursni 50.15 qil", "1 dollar 50 lira"):
   intent="set_rate" va "newUsdRate": 50.15 qaytaring.`
    : "";

  const systemPrompt = `Siz Mezana moliya tizimining aqlli AI yordamchisisiz.
Vazifangiz: foydalanuvchi yozgan matn, ovozli xabar matni yoki chek rasmidan moliyaviy amalni aniqlash.

MAVJUD 18 TA KATEGORIYA (faqat shulardan eng mosini tanlang):
${CATEGORIES.join(", ")}

MAVJUD HISOBLAR (HAMYONLAR):
${EMPLOYEES.join(", ")}
MUHIM QOIDA: Foydalanuvchining o'ziga biriktirilgan asosiy hisobi "${defaultEmployee}". Oddiy xarajatda yoki talabnomada "employee" maydoniga DOIM "${defaultEmployee}" qo'ying (faqatgina foydalanuvchi hisobni ochiq aytgan holat bundan mustasno).

XARAJAT vs TALABNOMA (isRequest):
- Agar xarajat ALLAQACHON QILINGAN bo'lsa ("oldim", "ketdi", "ishlatdim", "berdim", "to'ladim" yoki chek rasmi bo'lsa): "isRequest": false.
- Agar foydalanuvchi HALI XARID QILMAGAN bo'lib, ruxsat/mablag' so'rayotgan yoki kelajakda olishni rejalashtirayotgan bo'lsa ("olish kerak", "kerak", "olmoqchimiz", "ruxsat bering", "talabnoma", "so'rov", "zarur", "ertaga olamiz"): "isRequest": true!
- Agar "shoshilinch", "tezda", "zudlik bilan" deyilsa: "urgency": "URGENT", aks holda "NORMAL".

TO'LOV USULI: "Naqd" yoki "Karta" (agar aytilmagan bo'lsa "Naqd").
VALYUTA: "TL" yoki "USD" (agar valyuta aytilmagan bo'lsa yoki "lira", "tl", "₺" deyilsa -> "TL"; agar "dollar", "usd", "$" deyilsa -> "USD").
BUGUNGI SANA: ${todayStr}

${directorRules}

${draftContext}

Javobni FAQAT JSON formatda qaytaring:
{
  "intent": "new_expense" | "update_draft" | "assign_wallet" | "treasury_income" | "set_rate" | "not_expense",
  "replyMessage": "qisqa o'zbekcha xabar",
  "walletAssign": { "targetAccount": "Idora", "amount": 20000, "currency": "TL", "description": "Hamyon to'ldirildi" },
  "treasuryIncome": { "source": "Kirim", "amount": 5000, "currency": "USD", "description": "Xazinaga kirim" },
  "newUsdRate": 49.738,
  "items": [
    {
      "title": "Qisqa sarlavha",
      "description": "Batafsil izoh",
      "amount": 450,
      "currency": "TL",
      "category": "Tushlik",
      "employee": "${defaultEmployee}",
      "paymentMethod": "Naqd",
      "date": "${todayStr}",
      "isRequest": false,
      "urgency": "NORMAL",
      "neededDate": "${todayStr}"
    }
  ],
  "updates": {}
}`;

  const userContent: any[] = [];
  if (text && text.trim()) {
    userContent.push({ type: "text", text: text.trim() });
  } else if (imageBase64Url) {
    userContent.push({
      type: "text",
      text: "Ushbu chek/kvitansiya rasmini o'qing va xarajat ma'lumotlarini ajratib bering.",
    });
  }
  if (imageBase64Url) {
    userContent.push({
      type: "image_url",
      image_url: { url: imageBase64Url, detail: "high" },
    });
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI xatosi (${resp.status}): ${errText.slice(0, 150)}`);
  }

  const data: any = await resp.json();
  const rawJson = data?.choices?.[0]?.message?.content || "{}";
  return JSON.parse(rawJson) as AiParsedResult;
}

async function transcribeTelegramVoice(bot: Bot, fileId: string): Promise<string> {
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) throw new Error("Ovozli fayl topilmadi");
  const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
  const audioResp = await fetch(fileUrl);
  if (!audioResp.ok) throw new Error("Ovozli faylni yuklab bo'lmadi");
  const arrayBuffer = await audioResp.arrayBuffer();

  const form = new FormData();
  const blob = new Blob([arrayBuffer], { type: "audio/ogg" });
  form.append("file", blob, "voice.ogg");
  form.append("model", "whisper-1");
  form.append(
    "prompt",
    "Mezana moliya xarajatlari: lira, TL, dollar, USD, tushlik, nonushta, kechki ovqat, taksi, transport, ijara, jihozlar, ofis buyumlari, Idora, Vaqf, Abdurahmon, Muhammadjon, Direktor, xazina, kirim, hamyon, naqd, karta."
  );

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Whisper xatosi (${resp.status}): ${errText.slice(0, 150)}`);
  }
  const data: any = await resp.json();
  return String(data?.text || "").trim();
}

async function downloadTelegramPhotoWithBuffer(
  bot: Bot,
  fileId: string
): Promise<{ dataUrl: string; buffer: Buffer; filePath: string }> {
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) throw new Error("Rasm fayli topilmadi");
  const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
  const imgResp = await fetch(fileUrl);
  if (!imgResp.ok) throw new Error("Rasmni yuklab bo'lmadi");
  const buf = Buffer.from(await imgResp.arrayBuffer());
  return {
    dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}`,
    buffer: buf,
    filePath: file.file_path,
  };
}

function normalizeCategory(cat?: string): string {
  if (!cat) return "Boshqa";
  const found = CATEGORIES.find((c) => c.toLowerCase() === cat.trim().toLowerCase());
  return found || "Boshqa";
}

function normalizeEmployee(emp?: string, fallback = "Idora"): string {
  if (!emp) return fallback;
  const lower = emp.trim().toLowerCase();
  if (lower.includes("vaqf") || lower.includes("kichik")) return "Vaqf";
  if (lower.includes("abdurahmon") || lower.includes("abdurrahman")) return "Abdurahmon";
  if (lower.includes("muhammadjon")) return "Muhammadjon";
  if (lower.includes("idora") || lower.includes("umar") || lower.includes("abubakr")) return "Idora";
  if (lower.includes("mezana") || lower.includes("ayol")) return "Mezana";
  if (lower.includes("direktor") || lower.includes("solih")) return "Direktor";
  if (lower.includes("dev") || lower.includes("muhammadali")) return "Developer";
  const found = EMPLOYEES.find((e) => e.toLowerCase() === lower);
  return found || fallback;
}

export async function sendAccountWelcome(bot: Bot, chatId: number, userId: string) {
  await refreshDynamicAuthorizedUsers();
  const auth = AUTHORIZED_USERS[String(userId)];
  if (!auth) return;

  if (auth.isDirector) {
    await bot.api.sendMessage(
      chatId,
      [
        `👑 Assalomu alaykum, *${auth.personName}*!`,
        "",
        "Siz *Direktor Boshqaruv Rejimi*dasiz. Quyidagi barcha imkoniyatlar interaktiv va ovoz/matn orqali ishlaydi:",
        "• 📊 *Umumiy Kassa va Hisobot* — Xazina, hamyonlar va barcha xarajatlar jonli hisoboti",
        "• 💸 *Pul ajratish / Kirim* — Xodimlar hamyoniga pul berish yoki xazinaga kirim kiritish",
        "• 🏦 *Hamyonlar balansi* — Barcha mas'ullarning balansini ko'rish va to'ldirish",
        "• 🧾 *Barcha xarajatlar* — Xodimlar kiritgan xarajatlarni ko'rish, tahrirlash yoki bekor qilish",
        "• 🎯 *Byudjet va 💱 Kurs* — Valyuta kursini va oylik limitlarni boshqarish",
        "• 👥 *Xodimlar va Ruxsatlar* — Yangi xodimlarni tasdiqlash va hisobga ulash",
      ].join("\n"),
      {
        parse_mode: "Markdown",
        reply_markup: buildReplyKeyboard(userId),
      }
    );
    await sendDirectorDashboard(bot, chatId);
    return;
  }

  let walletBalance = 0;
  let totalSpent = 0;
  try {
    const rows: any[] = await moliyPrisma.$queryRawUnsafe(
      `SELECT balance::float AS balance, "totalSpent"::float AS "totalSpent" FROM "Wallet" WHERE id = $1 LIMIT 1`,
      auth.walletId
    );
    walletBalance = Number(rows?.[0]?.balance || 0);
    totalSpent = Number(rows?.[0]?.totalSpent || 0);
  } catch {}

  const text = [
    `👋 Assalomu alaykum, *${auth.personName}*!`,
    "",
    "✅ Sizning Telegram profilingiz yagona tizimdagi hisobingizga ulandi:",
    `👤 Xodim: *${auth.personName}*`,
    `🏦 Tizimdagi hisob (Hamyon): *${auth.accountLabel}* (\`${auth.erpEmail}\`)`,
    `💳 Hamyon joriy balansi: *₺${fmtNum(walletBalance)} TL*`,
    `📊 Jami sarflangan: *₺${fmtNum(totalSpent)} TL*`,
    "",
    "🚀 *Xarajat kiritish:*",
    "1️⃣ *Matn yozing:* _\"Tushlikka 450 lira ketdi\"_ yoki _\"Ofis uchun qog'oz 850 tl karta\"_",
    "2️⃣ *Ovozli xabar yuboring (🎙):* Xarajatingizni oddiy gapirib bering",
    "3️⃣ *Chek rasmini yuboring (📸):* Kvitansiya yoki chek rasmini tashlang",
    "",
    `📌 Siz kiritgan va tasdiqlagan har bir xarajat to'g'ridan-to'g'ri *${auth.accountLabel}* hisobiga yoziladi!`,
  ].join("\n");

  await bot.api.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: buildReplyKeyboard(userId),
  });
}

async function sendAccountStatusCard(bot: Bot, chatId: number, userId: string) {
  const auth = AUTHORIZED_USERS[String(userId)];
  if (!auth) return;

  const wRows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT balance::float AS balance, "totalAssigned"::float AS "totalAssigned", "totalSpent"::float AS "totalSpent"
     FROM "Wallet" WHERE id = $1 LIMIT 1`,
    auth.walletId
  );
  const w = wRows?.[0] || { balance: 0, totalAssigned: 0, totalSpent: 0 };

  const countRows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS cnt, COALESCE(SUM("amountInDefault"), 0)::float AS total_tl
     FROM "Expense"
     WHERE "employeeId" = $1 AND "deletedAt" IS NULL AND status != 'REJECTED'`,
    auth.employeeId
  );
  const st = countRows?.[0] || { cnt: 0, total_tl: 0 };

  const lines = [
    `💼 *BOG'LANGAN TIZIM HISOBI MA'LUMOTLARI*`,
    "────────────────────",
    `👤 Mas'ul shaxs: *${auth.personName}*`,
    `🆔 Telegram ID: \`${auth.telegramId}\``,
    `🏦 Moliya hisobi (Hamyon): *${auth.accountLabel}*`,
    `📧 Tizim loginlari: ERP \`${auth.erpEmail}\` | CRM \`${auth.crmUsername}\``,
    "────────────────────",
    `💳 Hamyon joriy balansi: *₺${fmtNum(w.balance)} TL*`,
    `💵 Jami ajratilgan mablag': *₺${fmtNum(w.totalAssigned)} TL*`,
    `💸 Jami sarflangan: *₺${fmtNum(w.totalSpent)} TL*`,
    `🧾 Bazadagi faol xarajatlar soni: *${st.cnt} ta* (₺${fmtNum(st.total_tl)} TL)`,
  ];

  if (auth.accountKey === "Idora") {
    lines.push(
      "────────────────────",
      "ℹ️ *Eslatma:* Umarxon Abdulhamidov va Abu Bakr Tojiddinov kiritgan barcha xarajatlar ikkita manbadan yagona *Idora* hisobiga yoziladi."
    );
  }

  await bot.api.sendMessage(chatId, lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: buildReplyKeyboard(userId),
  });
}

async function sendRecentExpensesCard(bot: Bot, chatId: number, userId: string) {
  const auth = AUTHORIZED_USERS[String(userId)];
  if (!auth) return;

  const rows: any[] = await moliyPrisma.$queryRawUnsafe(
    `SELECT e.id, e.title, e.description, e."amountInDefault"::float AS amount_tl,
            e."amountUsd"::float AS amount_usd, e.date, c.name AS category_name
     FROM "Expense" e
     LEFT JOIN "Category" c ON c.id = e."categoryId"
     WHERE e."employeeId" = $1 AND e."deletedAt" IS NULL AND e.status != 'REJECTED'
     ORDER BY e.date DESC, e."createdAt" DESC
     LIMIT 10`,
    auth.employeeId
  );

  if (!rows || rows.length === 0) {
    await bot.api.sendMessage(
      chatId,
      `📊 *${auth.accountLabel}* hisobida hozircha xarajatlar yo'q.\n\nYangi xarajat kiritish uchun shunchaki xabar yozing (masalan: \`Tushlikka 450 lira\`)!`,
      { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
    );
    return;
  }

  const lines: string[] = [];
  lines.push(`📊 "${auth.accountLabel.toUpperCase()}" HISOBIDAGI OXIRGI ${rows.length} TA XARAJAT (Bazadan):`);
  lines.push("────────────────────");

  rows.forEach((r, idx) => {
    const dStr = r.date ? new Date(r.date).toISOString().slice(0, 10) : "";
    const srcMatch = String(r.description || "").match(/\[Manba:\s*([^\]]+)\]/);
    const srcBadge = srcMatch ? ` • ✍️ ${srcMatch[1]}` : "";
    lines.push(
      `${idx + 1}. ${r.title} (${r.category_name || "Boshqa"})\n` +
        `   📅 ${dStr}${srcBadge}\n` +
        `   💰 ₺${fmtNum(r.amount_tl)} TL  ≈  💵 $${fmtNum(r.amount_usd)} USD`
    );
  });

  await bot.api.sendMessage(chatId, lines.join("\n"), {
    reply_markup: buildReplyKeyboard(userId),
  });
}

async function processUserExpenseInput(params: {
  bot: Bot;
  chatId: number;
  userId: string;
  text: string;
  sourceType: "text" | "voice" | "photo";
  imageBase64Url?: string | null;
  receiptBuffer?: Buffer;
  receiptFileId?: string;
  receiptFileName?: string;
  receiptMimeType?: string;
}) {
  const {
    bot,
    chatId,
    userId,
    text,
    sourceType,
    imageBase64Url,
    receiptBuffer,
    receiptFileId,
    receiptFileName,
    receiptMimeType,
  } = params;
  const auth = AUTHORIZED_USERS[String(userId)];
  if (!auth) return;

  const defaultEmp = auth.accountKey;
  const todayStr = getIstanbulDateStr();
  const liveUsdRate = await fetchLiveUsdRate();

  const activeDraftId = activeDraftByUser.get(userId);
  const currentDraft = activeDraftId ? draftsById.get(activeDraftId) : null;
  const openDraft = currentDraft && currentDraft.status === "DRAFT" ? currentDraft : null;

  const result = await analyzeExpenseWithAi({
    text,
    defaultEmployee: defaultEmp,
    isDirector: Boolean(auth.isDirector),
    todayStr,
    currentDraft: openDraft,
    imageBase64Url,
  });

  // Director AI intents: Wallet Assignment, Treasury Income, or Exchange Rate update
  if (auth.isDirector && result.intent === "assign_wallet" && result.walletAssign) {
    const wa = result.walletAssign;
    const targetKey = normalizeEmployee(wa.targetAccount, "Idora");
    const targetInfo = ACCOUNT_TARGETS[targetKey] || ACCOUNT_TARGETS.Idora!;
    const amt = Number(wa.amount || 0);
    if (amt > 0) {
      const amtTl = wa.currency === "USD" ? Number((amt * liveUsdRate).toFixed(2)) : amt;
      const kb = new InlineKeyboard()
        .text(
          `✅ Tasdiqlash (+₺${fmtNum(amtTl)} TL)`,
          `dir:assign:do:${targetKey}:${amtTl}`
        )
        .text("❌ Bekor qilish", "dir:cancel");

      await bot.api.sendMessage(
        chatId,
        [
          "💸 *HAMYONGA MABLAG' AJRATISH (Tasdiqlash)*",
          "────────────────────",
          `🏦 Qabul qiluvchi hisob: *${targetInfo.label}*`,
          `💰 Summa: *₺${fmtNum(amtTl)} TL*` +
            (wa.currency === "USD" ? ` ($${fmtNum(amt)} USD @ ${liveUsdRate.toFixed(2)})` : ""),
          `📝 Izoh: ${wa.description || "Hamyon to'ldirildi"}`,
          "",
          "👇 Tasdiqlasangiz, mablag' darhol hamyon balansiga qo'shiladi:",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }
  }

  if (auth.isDirector && result.intent === "treasury_income" && result.treasuryIncome) {
    const inc = result.treasuryIncome;
    const amt = Number(inc.amount || 0);
    const cur: "TL" | "USD" = inc.currency === "USD" ? "USD" : "TL";
    if (amt > 0) {
      const saved = await recordTreasuryIncome(
        amt,
        cur,
        inc.source || "Kirim",
        inc.description || text,
        auth.personName
      );
      await bot.api.sendMessage(
        chatId,
        [
          "✅ *XAZINAGA KIRIM MUVAFFAQIYATLI YOZILDI!*",
          "────────────────────",
          `🏛 Manba: *${inc.source || "Kirim"}*`,
          `💬 Izoh: ${inc.description || text}`,
          `💰 Summa (TL): *₺${fmtNum(saved.amountTl)} TL*`,
          `💵 Summa (USD): *$${fmtNum(saved.amountUsd)} USD* (kurs: ${saved.usdRate.toFixed(4)})`,
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
      );
      return;
    }
  }

  if (auth.isDirector && result.intent === "set_rate" && result.newUsdRate && result.newUsdRate > 1) {
    const newRate = Number(result.newUsdRate);
    const rateId = "rate_tg_" + crypto.randomBytes(8).toString("hex");
    await moliyPrisma.$executeRawUnsafe(
      `INSERT INTO "ExchangeRate" (id, "fromCurrency", "toCurrency", rate, "effectiveDate", "createdAt")
       VALUES ($1, 'USD', 'TL', $2, NOW(), NOW())`,
      rateId,
      newRate
    );
    await bot.api.sendMessage(
      chatId,
      `✅ *Yangi valyuta kursi o'rnatildi:* \`1 USD ($) = ${newRate.toFixed(4)} TL (₺)\``,
      { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
    );
    return;
  }

  if (result.intent === "update_draft" && openDraft && result.updates) {
    const u = result.updates;
    if (u.title) openDraft.title = u.title;
    if (u.description) openDraft.description = u.description;
    if (typeof u.amount === "number" && u.amount > 0) openDraft.amount = u.amount;
    if (u.currency === "TL" || u.currency === "USD") openDraft.currency = u.currency;
    if (u.category) openDraft.category = normalizeCategory(u.category);
    if (u.employee) openDraft.employee = normalizeEmployee(u.employee, openDraft.employee);
    if (u.paymentMethod === "Naqd" || u.paymentMethod === "Karta") openDraft.paymentMethod = u.paymentMethod;
    if (u.date) openDraft.date = u.date;
    if (typeof u.isRequest === "boolean" && !openDraft.linkedRequestId) {
      openDraft.isRequest = u.isRequest;
    }
    if (u.urgency === "URGENT" || u.urgency === "NORMAL") {
      openDraft.urgency = u.urgency;
    }
    if (u.neededDate) {
      openDraft.neededDate = u.neededDate;
    }
    recalcAmounts(openDraft);

    const cardText = buildDraftCardText(openDraft, "AI orqali qoralama yangilandi!");
    const sent = await bot.api.sendMessage(chatId, cardText, {
      reply_markup: buildDraftKeyboard(openDraft),
    });
    openDraft.messageId = sent.message_id;
    return;
  }

  if (result.intent === "new_expense" && Array.isArray(result.items) && result.items.length > 0) {
    const forceRequestMode = userRequestMode.has(userId);
    if (forceRequestMode) {
      userRequestMode.delete(userId);
    }

    for (const rawItem of result.items) {
      const amt = Number(rawItem.amount || 0);
      if (!(amt > 0)) continue;
      const id = String(seqCounter++);
      const currency: "TL" | "USD" = rawItem.currency === "USD" ? "USD" : "TL";
      const chosenEmp = auth.isDirector && rawItem.employee
        ? normalizeEmployee(rawItem.employee, defaultEmp)
        : defaultEmp;

      const isReq =
        sourceType !== "photo" &&
        Boolean(rawItem.isRequest || forceRequestMode || detectRequestIntentFromText(text));
      const urgency: "NORMAL" | "URGENT" =
        rawItem.urgency === "URGENT" || detectUrgencyFromText(text) === "URGENT"
          ? "URGENT"
          : "NORMAL";

      const draft: ExpenseDraftItem = {
        id,
        isRequest: isReq,
        urgency,
        neededDate: rawItem.neededDate || rawItem.date || todayStr,
        chatId,
        userId,
        sourcePersonName: auth.personName,
        title: String(rawItem.title || (isReq ? "Talabnoma" : "Xarajat")).trim(),
        description: String(rawItem.description || rawItem.title || "").trim(),
        amount: amt,
        currency,
        usdRate: liveUsdRate,
        amountTl: 0,
        amountUsd: 0,
        category: normalizeCategory(rawItem.category),
        employee: chosenEmp,
        paymentMethod: rawItem.paymentMethod === "Karta" ? "Karta" : "Naqd",
        date: rawItem.date || todayStr,
        sourceType,
        rawInput: text,
        status: "DRAFT",
        receiptBuffer,
        receiptFileId,
        receiptFileName: receiptFileName || (receiptBuffer ? "chek_ocr.jpg" : undefined),
        receiptMimeType: receiptMimeType || (receiptBuffer ? "image/jpeg" : undefined),
        awaitingReceipt: false,
        createdAt: new Date(),
      };
      recalcAmounts(draft);
      draftsById.set(id, draft);
      activeDraftByUser.set(userId, id);

      const cardText = buildDraftCardText(draft);
      const sent = await bot.api.sendMessage(chatId, cardText, {
        reply_markup: buildDraftKeyboard(draft),
      });
      draft.messageId = sent.message_id;
    }
    return;
  }

  const helpReply =
    result.replyMessage ||
    "Xarajat yoki talabnoma summasi va maqsadini yozing (masalan: \"Tushlikka 450 lira ketdi\" yoki \"Ofis uchun printer qog'ozi olish kerak 850 tl\"). Yoki ovozli xabar / chek rasmini yuboring!";
  await bot.api.sendMessage(chatId, `🤖 ${helpReply}`, {
    reply_markup: buildReplyKeyboard(userId),
  });
}

export function registerExpenseSandboxFlow(bot: Bot) {
  refreshDynamicAuthorizedUsers().catch(() => {});

  bot.command(["xarajat", "hisob", "direktor"], async (ctx) => {
    const userId = String(ctx.from?.id || "");
    await sendAccountWelcome(bot, ctx.chat.id, userId);
  });

  // Director interactive callbacks (`dir:...`)
  bot.callbackQuery(/^dir:(.+)$/, async (ctx) => {
    const userId = String(ctx.from.id);
    const auth = AUTHORIZED_USERS[userId];
    if (!auth?.isDirector) {
      await ctx.answerCallbackQuery({ text: "⛔ Faqat Direktor uchun ruxsat etilgan!", show_alert: true });
      return;
    }

    const parts = ctx.match[1]!.split(":");
    const sub = parts[0]!;
    const p1 = parts[1];
    const p2 = parts[2];

    if (sub === "cancel") {
      directorPendingByUser.delete(userId);
      await ctx.answerCallbackQuery({ text: "Bekor qilindi" });
      await ctx.editMessageText("❌ Amal bekor qilindi.");
      return;
    }

    if (sub === "dash") {
      await ctx.answerCallbackQuery();
      if (p1 === "refresh") {
        await sendDirectorDashboard(bot, ctx.chat!.id, ctx.callbackQuery.message?.message_id);
        return;
      }
      if (p1 === "cats") {
        const todayStr = getIstanbulDateStr();
        const monthPrefix = todayStr.slice(0, 7);
        const rows: any[] = await moliyPrisma.$queryRawUnsafe(
          `SELECT c.name AS cat, COUNT(*)::int AS cnt,
                  COALESCE(SUM(e."amountInDefault"), 0)::float AS tl,
                  COALESCE(SUM(e."amountUsd"), 0)::float AS usd
           FROM "Expense" e
           JOIN "Category" c ON c.id = e."categoryId"
           WHERE e."deletedAt" IS NULL AND e.status != 'REJECTED'
             AND to_char(e.date, 'YYYY-MM') = $1
           GROUP BY c.name
           ORDER BY tl DESC`,
          monthPrefix
        );
        const lines = [
          `📂 *SHU OYDAGI XARAJATLAR — KATEGORIYALAR KESIMIDA (${monthPrefix}):*`,
          "────────────────────",
        ];
        if (!rows.length) {
          lines.push("Shu oyda xarajatlar yo'q.");
        } else {
          rows.forEach((r, i) => {
            lines.push(
              `${i + 1}. *${r.cat}* (${r.cnt} ta): *₺${fmtNum(r.tl)} TL* ($${fmtNum(r.usd)})`
            );
          });
        }
        const kb = new InlineKeyboard().text("⬅️ Dashboardga qaytish", "dir:dash:refresh");
        await ctx.editMessageText(lines.join("\n"), { parse_mode: "Markdown", reply_markup: kb });
        return;
      }
    }

    if (sub === "assign") {
      if (p1 === "menu") {
        await ctx.answerCallbackQuery();
        await sendDirectorWalletsMenu(bot, ctx.chat!.id, ctx.callbackQuery.message?.message_id);
        return;
      }
      if (p1 === "emp" && p2) {
        const target = ACCOUNT_TARGETS[p2];
        if (!target) return;
        directorPendingByUser.set(userId, { type: "assign_amount", targetKey: p2 });
        const kb = new InlineKeyboard()
          .text("+5,000 ₺", `dir:assign:do:${p2}:5000`)
          .text("+10,000 ₺", `dir:assign:do:${p2}:10000`)
          .text("+20,000 ₺", `dir:assign:do:${p2}:20000`)
          .row()
          .text("+50,000 ₺", `dir:assign:do:${p2}:50000`)
          .text("+100,000 ₺", `dir:assign:do:${p2}:100000`)
          .row()
          .text("❌ Bekor qilish", "dir:cancel");

        await ctx.answerCallbackQuery();
        await ctx.reply(
          [
            `💸 *${target.label}* hamyoniga qancha mablag' ajratamiz?`,
            "",
            "👇 Tayyor tugmalardan birini bosing yoki *istalgan summani yozib yuboring* (masalan: `15000` yoki `500 dollar`):",
          ].join("\n"),
          { parse_mode: "Markdown", reply_markup: kb }
        );
        return;
      }
      if (p1 === "do" && p2 && parts[3]) {
        const targetKey = p2;
        const amountTl = Number(parts[3]);
        if (!(amountTl > 0)) return;
        directorPendingByUser.delete(userId);
        const target = ACCOUNT_TARGETS[targetKey]!;
        const res = await assignFundsToWallet(
          bot,
          targetKey,
          amountTl,
          "Hamyonga mablag' ajratildi",
          auth.personName
        );
        await ctx.answerCallbackQuery({ text: "✅ Mablag' hamyonga o'tkazildi!" });
        await ctx.editMessageText(
          [
            "✅ *HAMYONGA MABLAG' MUVAFFAQIYATLI O'TKAZILDI!*",
            "────────────────────",
            `🏦 Hisob: *${target.label}*`,
            `➕ Ajratilgan summa: *+₺${fmtNum(amountTl)} TL*`,
            `📊 Avvalgi balans: ₺${fmtNum(res.balanceBefore)} TL`,
            `💳 Yangi balans: *₺${fmtNum(res.balanceAfter)} TL*`,
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
        return;
      }
    }

    if (sub === "income" && p1 === "start") {
      directorPendingByUser.set(userId, { type: "income_entry" });
      await ctx.answerCallbackQuery();
      await ctx.reply(
        [
          "💰 *Xazinaga yangi Kirim (Income) kiritish:*",
          "",
          "Iltimos, kirim summasi va manbasini yozing (masalan: `5000 dollar homiydan kirim` yoki `150000 lira kassa kirimi`):",
        ].join("\n"),
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "dir:cancel"),
        }
      );
      return;
    }

    if (sub === "exp") {
      if (p1 === "list") {
        await ctx.answerCallbackQuery();
        await sendDirectorExpensesList(
          bot,
          ctx.chat!.id,
          p2 || "all",
          ctx.callbackQuery.message?.message_id
        );
        return;
      }
      if (p1 === "view" && p2) {
        const expId = p2;
        const rows: any[] = await moliyPrisma.$queryRawUnsafe(
          `SELECT e.id, e.title, e.description, e."amountInDefault"::float AS amount_tl,
                  e."amountUsd"::float AS amount_usd, e."usdRate"::float AS usd_rate,
                  e.date, e.status, c.name AS category_name, emp."fullName" AS emp_name
           FROM "Expense" e
           LEFT JOIN "Category" c ON c.id = e."categoryId"
           LEFT JOIN "Employee" emp ON emp.id = e."employeeId"
           WHERE e.id = $1 LIMIT 1`,
          expId
        );
        const r = rows?.[0];
        if (!r) {
          await ctx.answerCallbackQuery({ text: "Xarajat topilmadi", show_alert: true });
          return;
        }
        const dStr = r.date ? new Date(r.date).toISOString().slice(0, 10) : "";
        const kb = new InlineKeyboard()
          .text("✏️ Summani to'g'rilash", `dir:editamt:${r.id}`)
          .text("📂 Kategoriyani o'zgartirish", `dir:editcat:${r.id}`)
          .row()
          .text("❌ Bekor qilish (Hamyonga qaytarish)", `dir:void:${r.id}`)
          .row()
          .text("⬅️ Ro'yxatga qaytish", "dir:exp:list:all");

        await ctx.answerCallbackQuery();
        await ctx.editMessageText(
          [
            `🧾 *XARAJAT TAFSILOTI (${r.id})*`,
            "────────────────────",
            `📝 Nomi: *${r.title}*`,
            `💬 Izoh: ${r.description || "-"}`,
            `🏦 Hisob: *${r.emp_name}*`,
            `📂 Kategoriya: *${r.category_name || "Boshqa"}*`,
            `📅 Sana: ${dStr}`,
            `💰 Summa: *₺${fmtNum(r.amount_tl)} TL* ($${fmtNum(r.amount_usd)} USD)`,
          ].join("\n"),
          { parse_mode: "Markdown", reply_markup: kb }
        );
        return;
      }
    }

    if (sub === "void" && p1) {
      try {
        const v = await voidExpenseByIdFromDatabases(p1, auth.personName);
        await ctx.answerCallbackQuery({ text: "✅ Xarajat bekor qilindi va balans tiklandi!" });
        await ctx.editMessageText(
          [
            `❌ *XARAJAT DIREKTOR TOMONIDAN BEKOR QILINDI!*`,
            "────────────────────",
            `📝 Xarajat: *${v.title}*`,
            `💰 Qaytarilgan summa: *+₺${fmtNum(v.amountTl)} TL* ($${fmtNum(v.amountUsd)})`,
            `🏦 "${v.targetLabel}" hamyonining yangi balansi: *₺${fmtNum(v.restoredBalance)} TL*`,
          ].join("\n"),
          { parse_mode: "Markdown" }
        );
      } catch (e: any) {
        await ctx.answerCallbackQuery({
          text: "Xatolik: " + (e?.message || "Noma'lum"),
          show_alert: true,
        });
      }
      return;
    }

    if (sub === "editamt" && p1) {
      directorPendingByUser.set(userId, { type: "edit_expense_amount", expenseId: p1 });
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `✏️ Xarajat (\`${p1}\`) uchun *yangi summani* yozib yuboring (masalan: \`650\` yoki \`25 dollar\`):`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "dir:cancel"),
        }
      );
      return;
    }

    if (sub === "editcat" && p1) {
      const expId = p1;
      const kb = new InlineKeyboard();
      CATEGORIES.forEach((cat, idx) => {
        kb.text(cat, `dir:setcat:${expId}:${idx}`);
        if ((idx + 1) % 3 === 0) kb.row();
      });
      if (CATEGORIES.length % 3 !== 0) kb.row();
      kb.text("❌ Bekor qilish", "dir:cancel");
      await ctx.answerCallbackQuery();
      await ctx.reply(`📂 Xarajat uchun yangi kategoriyani tanlang:`, { reply_markup: kb });
      return;
    }

    if (sub === "setcat" && p1 && p2 !== undefined) {
      const expId = p1;
      const catName = CATEGORIES[Number(p2)];
      const catId = catName ? CATEGORY_ID_MAP[catName] : null;
      if (!catName || !catId) return;
      await moliyPrisma.$executeRawUnsafe(
        `UPDATE "Expense" SET "categoryId" = $1, "updatedAt" = NOW() WHERE id = $2`,
        catId,
        expId
      );
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE finance."Expense" SET "categoryId" = $1, "updatedAt" = NOW() WHERE id = $2`,
          catId,
          expId
        );
      } catch {}
      await ctx.answerCallbackQuery({ text: `✅ Kategoriya: ${catName}` });
      await ctx.editMessageText(`✅ Xarajat (\`${expId}\`) kategoriyasi *${catName}* ga o'zgartirildi!`, {
        parse_mode: "Markdown",
      });
      return;
    }

    if (sub === "rate" && p1 === "prompt") {
      directorPendingByUser.set(userId, { type: "set_rate" });
      const curRate = await fetchLiveUsdRate();
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `💱 Hozirgi kurs: \`1$ = ${curRate.toFixed(4)} ₺\`\n\nYangi kursni raqam bilan yozib yuboring (masalan: \`50.25\`):`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "dir:cancel"),
        }
      );
      return;
    }

    if (sub === "budget") {
      if (p1 === "catmenu") {
        const kb = new InlineKeyboard();
        CATEGORIES.forEach((cat, idx) => {
          kb.text(cat, `dir:budget:pick:${idx}`);
          if ((idx + 1) % 3 === 0) kb.row();
        });
        if (CATEGORIES.length % 3 !== 0) kb.row();
        kb.text("❌ Bekor qilish", "dir:cancel");
        await ctx.answerCallbackQuery();
        await ctx.reply("🎯 Qaysi kategoriya uchun oylik byudjet (limit) belgilaymiz?", {
          reply_markup: kb,
        });
        return;
      }
      if (p1 === "pick" && p2 !== undefined) {
        const catName = CATEGORIES[Number(p2)];
        if (!catName) return;
        directorPendingByUser.set(userId, { type: "set_budget", categoryName: catName });
        await ctx.answerCallbackQuery();
        await ctx.reply(
          `🎯 *${catName}* kategoriyasi uchun shu oylik limit summasini (TL da) yozing (masalan: \`25000\`):`,
          {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "dir:cancel"),
          }
        );
        return;
      }
    }

    if (sub === "staff" && p1 === "pick" && p2) {
      const targetTgId = p2;
      const contact = await prisma.telegramContact.findUnique({
        where: { telegramId: targetTgId },
      });
      const name = contact?.fullName || targetTgId;
      const kb = new InlineKeyboard()
        .text("🏦 Idora", `dir:link:${targetTgId}:Idora`)
        .text("🏦 Vaqf", `dir:link:${targetTgId}:Vaqf`)
        .row()
        .text("🏦 Abdurahmon (Moliya)", `dir:link:${targetTgId}:Abdurahmon`)
        .text("🏦 Muhammadjon", `dir:link:${targetTgId}:Muhammadjon`)
        .row()
        .text("🏦 Mezana (Ayollar)", `dir:link:${targetTgId}:Mezana`)
        .row()
        .text("❌ Bekor qilish", "dir:cancel");

      await ctx.answerCallbackQuery();
      await ctx.reply(
        `👤 *${name}* (\`${targetTgId}\`) ni qaysi tizim hisobiga biriktiramiz?`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (sub === "link" && p1 && p2) {
      const targetTgId = p1;
      const accKey = p2;
      const target = ACCOUNT_TARGETS[accKey];
      if (!target) return;

      const contact = await prisma.telegramContact.upsert({
        where: { telegramId: targetTgId },
        create: {
          telegramId: targetTgId,
          fullName: target.label,
          userId: target.userId,
          awaitingName: false,
          lastStartAt: new Date(),
        },
        update: {
          userId: target.userId,
          awaitingName: false,
        },
      });

      const personName = contact.fullName || target.label;
      AUTHORIZED_USERS[targetTgId] = {
        telegramId: targetTgId,
        personName,
        roleTitle: target.key,
        isDirector: target.key === "Direktor" || target.key === "Developer",
        accountKey: target.key,
        accountLabel: target.label,
        crmUsername: target.key.toLowerCase(),
        erpEmail: target.erpEmail,
        userId: target.userId,
        employeeId: target.employeeId,
        walletId: target.walletId,
      };

      await ctx.answerCallbackQuery({ text: "✅ Hisob muvaffaqiyatli biriktirildi!" });
      await ctx.editMessageText(
        `✅ *${personName}* (\`${targetTgId}\`) muvaffaqiyatli *${target.label}* hisobiga biriktirildi!`,
        { parse_mode: "Markdown" }
      );

      // Notify the newly approved user!
      try {
        await sendAccountWelcome(bot, Number(targetTgId), targetTgId);
      } catch {}
      return;
    }
  });

  // Callback queries for interactive Draft Card & Confirmed Card buttons
  bot.callbackQuery(/^exp:([a-z_]+):([^:]+)(?::(.+))?$/, async (ctx) => {
    const action = ctx.match[1]!;
    const draftId = ctx.match[2]!;
    const extra = ctx.match[3];
    const userId = String(ctx.from.id);

    const draft = draftsById.get(draftId);
    if (!draft) {
      await ctx.answerCallbackQuery({ text: "Bu qoralama topilmadi (eskirgan bo'lishi mumkin)" });
      return;
    }

    if (action === "sendreq") {
      if (draft.status === "CONFIRMED") {
        await ctx.answerCallbackQuery({ text: "Allaqachon Direktorga yuborilgan!" });
        return;
      }
      try {
        const saved = await saveExpenseRequestToDatabase(bot, draft);
        draft.status = "CONFIRMED";
        draft.confirmedAt = new Date();
        draft.dbRequestId = saved.reqId;
        draft.dbRequestCode = saved.reqCode;

        if (activeDraftByUser.get(userId) === draft.id) {
          activeDraftByUser.delete(userId);
        }

        const targetInfo = ACCOUNT_TARGETS[draft.employee] || ACCOUNT_TARGETS.Idora!;
        const kb = new InlineKeyboard().text(
          "❌ Talabnomani qaytarib olish (Bekor qilish)",
          `req:cancel_own:${saved.reqId}`
        );

        await ctx.answerCallbackQuery({ text: "📨 Talabnoma Direktorga yuborildi!" });
        await ctx.editMessageText(
          [
            `📨 TALABNOMA DIREKTORGA YUBORILDI! (${saved.reqCode})`,
            "────────────────────",
            `📋 Maqsad: ${draft.title}`,
            draft.description && draft.description !== draft.title ? `💬 Izoh: ${draft.description}` : "",
            `📂 Kategoriya: ${draft.category}`,
            `🏦 Hisob (Hamyon): ${targetInfo.label}`,
            `👤 So'rovchi: ${draft.sourcePersonName}`,
            `📅 Kerakli sana: ${draft.neededDate || draft.date}`,
            `💰 So'ralgan summa: ₺${fmtNum(draft.amountTl)} TL (~$${fmtNum(draft.amountUsd)} USD)`,
            "────────────────────",
            `⏳ Holat: Direktor tasdiqlashi kutilmoqda...`,
            `💡 Direktor tasdiqlashi bilan sizga shu yerga xabar va «💸 Xarid qilindi» tugmasi keladi!`,
          ]
            .filter(Boolean)
            .join("\n"),
          { reply_markup: kb }
        );
      } catch (err: any) {
        console.error("[saveExpenseRequestToDatabase error]:", err);
        await ctx.answerCallbackQuery({
          text: "❌ Talabnoma yuborishda xato: " + (err?.message || "Noma'lum").slice(0, 120),
          show_alert: true,
        });
      }
      return;
    }

    if (action === "toggletype") {
      draft.isRequest = !draft.isRequest;
      if (draft.isRequest && !draft.neededDate) {
        draft.neededDate = draft.date;
      }
      const modeLabel = draft.isRequest ? "📝 Talabnoma (So'rov)" : "🧾 Haqiqiy Xarajat";
      await ctx.answerCallbackQuery({ text: `Tur o'zgardi: ${modeLabel}` });
      await ctx.editMessageText(
        buildDraftCardText(draft, `Tur "${modeLabel}" ga o'zgartirildi`),
        { reply_markup: buildDraftKeyboard(draft) }
      );
      return;
    }

    if (action === "toggleurg") {
      draft.urgency = draft.urgency === "URGENT" ? "NORMAL" : "URGENT";
      const urgLabel = draft.urgency === "URGENT" ? "🔥 Shoshilinch" : "🟢 Oddiy";
      await ctx.answerCallbackQuery({ text: `Muhimlik: ${urgLabel}` });
      await ctx.editMessageText(
        buildDraftCardText(draft, `Muhimlik darajasi "${urgLabel}" ga o'zgartirildi`),
        { reply_markup: buildDraftKeyboard(draft) }
      );
      return;
    }

    if (action === "askreceipt" || (action === "ok" && !draft.receiptBuffer)) {
      if (draft.status === "CONFIRMED") {
        await ctx.answerCallbackQuery({ text: "Allaqachon bazaga saqlangan!" });
        return;
      }
      draft.awaitingReceipt = true;
      activeDraftByUser.set(userId, draft.id);
      const kb = new InlineKeyboard()
        .text("🚫 Chek yo'q (Cheksiz saqlash)", `exp:ok_noreceipt:${draft.id}`)
        .row()
        .text("⬅️ Qoralamaga qaytish", `exp:back:${draft.id}`)
        .text("❌ Bekor qilish", `exp:cancel:${draft.id}`);

      await ctx.answerCallbackQuery({ text: "📸 Chek rasmini yuboring yoki «Chek yo'q» ni bosing" });
      await ctx.editMessageText(
        [
          `📸 *CHEK RASMINI YUBORING (Qoralama #${draft.id})*`,
          "────────────────────",
          `📝 Xarajat: *${draft.title}*`,
          `📂 Kategoriya: *${draft.category}* • 💳 *${draft.paymentMethod}*`,
          `💰 Summa: *₺${fmtNum(draft.amountTl)} TL* ($${fmtNum(draft.amountUsd)} USD)`,
          "────────────────────",
          "👇 Iltimos, ushbu xarajatning *chek (kvitansiya) rasmini* shu yerga yuboring — rasm tushishi bilan chek va xarajat avtomatik bazaga saqlanadi!",
          "",
          "Agar bu xarajat uchun chek mavjud bo'lmasa, pastdagi **«🚫 Chek yo'q (Cheksiz saqlash)»** tugmasini bosing:",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (action === "ok" || action === "ok_noreceipt") {
      if (draft.status === "CONFIRMED") {
        await ctx.answerCallbackQuery({ text: "Allaqachon bazaga saqlangan!" });
        return;
      }
      try {
        draft.awaitingReceipt = false;
        const saved = await saveExpenseToDatabases(bot, draft);
        draft.status = "CONFIRMED";
        draft.confirmedAt = new Date();
        draft.dbExpenseId = saved.expId;
        draft.dbWalletTxId = saved.txId;
        draft.walletBalanceAfter = saved.balanceAfter;

        if (activeDraftByUser.get(userId) === draft.id) {
          activeDraftByUser.delete(userId);
        }

        await ctx.answerCallbackQuery({ text: "✅ Xarajat tizim bazasiga saqlandi!" });
        await ctx.editMessageText(buildConfirmedCardText(draft), {
          reply_markup: buildConfirmedKeyboard(draft),
        });
      } catch (err: any) {
        console.error("[saveExpenseToDatabases error]:", err);
        await ctx.answerCallbackQuery({
          text: "❌ Bazaga yozishda xato: " + (err?.message || "Noma'lum").slice(0, 120),
          show_alert: true,
        });
      }
      return;
    }

    if (action === "attachlater") {
      if (!draft.dbExpenseId) {
        await ctx.answerCallbackQuery({ text: "Xarajat ID topilmadi" });
        return;
      }
      awaitingLaterReceiptByUser.set(userId, draft.id);
      await ctx.answerCallbackQuery({ text: "📸 Chek rasmini yuboring" });
      await ctx.reply(
        `📸 Marhamat, *${draft.title}* (₺${fmtNum(draft.amountTl)} TL) xarajati uchun chek rasmini shu yerga yuboring:`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action === "undo") {
      if (draft.status !== "CONFIRMED" || !draft.dbExpenseId) {
        await ctx.answerCallbackQuery({ text: "Bu xarajat allaqachon bekor qilingan." });
        return;
      }
      try {
        const v = await voidExpenseByIdFromDatabases(draft.dbExpenseId, draft.sourcePersonName);
        draft.status = "VOIDED";
        await ctx.answerCallbackQuery({ text: "↩️ Xarajat bazadan o'chirildi va balans qaytarildi!" });
        await ctx.editMessageText(
          [
            `↩️ BAZADAN BEKOR QILINDI (#${draft.dbExpenseId})`,
            `📝 ${draft.title} — ₺${fmtNum(draft.amountTl)} TL ($${fmtNum(draft.amountUsd)} USD)`,
            `🏦 "${v.targetLabel}" hamyonining tiklangan balansi: ₺${fmtNum(v.restoredBalance)} TL`,
          ].join("\n")
        );
      } catch (err: any) {
        await ctx.answerCallbackQuery({
          text: "❌ Bekor qilishda xato: " + (err?.message || "Noma'lum").slice(0, 120),
          show_alert: true,
        });
      }
      return;
    }

    if (action === "cancel") {
      draft.status = "CANCELLED";
      if (activeDraftByUser.get(userId) === draft.id) {
        activeDraftByUser.delete(userId);
      }
      await ctx.answerCallbackQuery({ text: "❌ Qoralama bekor qilindi" });
      await ctx.editMessageText(
        `❌ BEKOR QILINDI (Qoralama #${draft.id})\n📝 ${draft.title} — ${
          draft.currency === "TL" ? `₺${fmtNum(draft.amountTl)} TL` : `$${fmtNum(draft.amountUsd)} USD`
        }`
      );
      return;
    }

    if (action === "togglepay") {
      draft.paymentMethod = draft.paymentMethod === "Naqd" ? "Karta" : "Naqd";
      await ctx.answerCallbackQuery({ text: `To'lov usuli: ${draft.paymentMethod}` });
      await ctx.editMessageText(buildDraftCardText(draft, `To'lov usuli "${draft.paymentMethod}" ga o'zgartirildi`), {
        reply_markup: buildDraftKeyboard(draft),
      });
      return;
    }

    if (action === "togglecur") {
      draft.currency = draft.currency === "TL" ? "USD" : "TL";
      recalcAmounts(draft);
      await ctx.answerCallbackQuery({ text: `Valyuta: ${draft.currency}` });
      await ctx.editMessageText(buildDraftCardText(draft, `Valyuta "${draft.currency}" ga o'zgartirildi`), {
        reply_markup: buildDraftKeyboard(draft),
      });
      return;
    }

    if (action === "catmenu") {
      const kb = new InlineKeyboard();
      CATEGORIES.forEach((cat, idx) => {
        const label = cat === draft.category ? `✅ ${cat}` : cat;
        kb.text(label, `exp:setcat:${draft.id}:${idx}`);
        if ((idx + 1) % 3 === 0) kb.row();
      });
      if (CATEGORIES.length % 3 !== 0) kb.row();
      kb.text("⬅️ Orqaga", `exp:back:${draft.id}`);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `📂 Qoralama #${draft.id} uchun kategoriyani tanlang (hozirgi: ${draft.category}):`,
        { reply_markup: kb }
      );
      return;
    }

    if (action === "setcat" && extra !== undefined) {
      const idx = Number(extra);
      const chosen = CATEGORIES[idx];
      if (chosen) {
        draft.category = chosen;
      }
      await ctx.answerCallbackQuery({ text: `Kategoriya: ${draft.category}` });
      await ctx.editMessageText(buildDraftCardText(draft, `Kategoriya "${draft.category}" ga o'zgartirildi`), {
        reply_markup: buildDraftKeyboard(draft),
      });
      return;
    }

    if (action === "empmenu") {
      const kb = new InlineKeyboard();
      EMPLOYEES.forEach((empKey, idx) => {
        const info = ACCOUNT_TARGETS[empKey]!;
        const label = empKey === draft.employee ? `✅ ${info.label}` : `🏦 ${info.label}`;
        kb.text(label, `exp:setemp:${draft.id}:${idx}`);
        if ((idx + 1) % 2 === 0) kb.row();
      });
      if (EMPLOYEES.length % 2 !== 0) kb.row();
      kb.text("⬅️ Orqaga", `exp:back:${draft.id}`);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `🏦 Qoralama #${draft.id} qaysi hisob (hamyon)ga yozilsin?`,
        { reply_markup: kb }
      );
      return;
    }

    if (action === "setemp" && extra !== undefined) {
      const idx = Number(extra);
      const chosen = EMPLOYEES[idx];
      if (chosen) {
        draft.employee = chosen;
      }
      const info = ACCOUNT_TARGETS[draft.employee] || ACCOUNT_TARGETS.Idora!;
      await ctx.answerCallbackQuery({ text: `Hisob: ${info.label}` });
      await ctx.editMessageText(buildDraftCardText(draft, `Hisob "${info.label}" ga o'zgartirildi`), {
        reply_markup: buildDraftKeyboard(draft),
      });
      return;
    }

    if (action === "back") {
      draft.awaitingReceipt = false;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(buildDraftCardText(draft), {
        reply_markup: buildDraftKeyboard(draft),
      });
      return;
    }
  });

  // Callback queries for Expense Requests (`req:...`)
  bot.callbackQuery(/^req:(.+)$/, async (ctx) => {
    const userId = String(ctx.from.id);
    const auth = AUTHORIZED_USERS[userId];
    if (!auth) {
      await ctx.answerCallbackQuery({ text: "Ruxsat yo'q", show_alert: true });
      return;
    }

    const parts = ctx.match[1]!.split(":");
    const action = parts[0]!;
    const reqId = parts[1] || "";
    const extra = parts.slice(2).join(":");

    if (action === "list" && reqId === "refresh") {
      await ctx.answerCallbackQuery({ text: "🔄 Yangilandi" });
      await sendExpenseRequestsListCard(
        bot,
        ctx.chat!.id,
        userId,
        ctx.callbackQuery.message?.message_id
      );
      return;
    }

    if (action === "cancel_own" && reqId) {
      try {
        const rows: any[] = await moliyPrisma.$queryRawUnsafe(
          `SELECT * FROM "ExpenseRequest" WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1`,
          reqId
        );
        const reqRow = rows?.[0];
        if (!reqRow) {
          await ctx.answerCallbackQuery({ text: "Talabnoma topilmadi", show_alert: true });
          return;
        }
        if (reqRow.status !== "PENDING" && !auth.isDirector) {
          await ctx.answerCallbackQuery({
            text: "Ushbu talabnoma allaqachon ko'rib chiqilgan!",
            show_alert: true,
          });
          return;
        }
        await moliyPrisma.$executeRawUnsafe(
          `UPDATE "ExpenseRequest" SET "deletedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
          reqId
        );
        const dirMsgs = Array.isArray(reqRow.directorMessages) ? reqRow.directorMessages : [];
        for (const dm of dirMsgs) {
          try {
            await bot.api.editMessageText(
              Number(dm.chatId),
              Number(dm.messageId),
              `↩️ <b>Talabnoma (#T-${reqRow.requestNumber}) so'rovchi tomonidan qaytarib olindi (bekor qilindi).</b>`,
              { parse_mode: "HTML" }
            );
          } catch {}
        }
        await ctx.answerCallbackQuery({ text: "✅ Talabnoma bekor qilindi" });
        await ctx.editMessageText(
          `❌ Talabnoma (#T-${reqRow.requestNumber} — ${reqRow.description}) qaytarib olindi va bekor qilindi.`
        );
      } catch (e: any) {
        await ctx.answerCallbackQuery({
          text: "Xatolik: " + (e?.message || "Noma'lum"),
          show_alert: true,
        });
      }
      return;
    }

    if (action === "app" && reqId) {
      if (!auth.isDirector) {
        await ctx.answerCallbackQuery({
          text: "⛔ Talabnomani faqat Direktor tasdiqlay oladi!",
          show_alert: true,
        });
        return;
      }
      try {
        const res = await approveExpenseRequestInBot(bot, reqId, auth.personName);
        await ctx.answerCallbackQuery({
          text: `✅ ${res.reqCode} tasdiqlandi (₺${fmtNum(res.approvedAmount)})!`,
        });
      } catch (e: any) {
        await ctx.answerCallbackQuery({
          text: "Xatolik: " + (e?.message || "Noma'lum"),
          show_alert: true,
        });
      }
      return;
    }

    if (action === "amt" && reqId) {
      if (!auth.isDirector) {
        await ctx.answerCallbackQuery({
          text: "⛔ Faqat Direktor uchun!",
          show_alert: true,
        });
        return;
      }
      directorPendingByUser.set(userId, { type: "approve_request_amount", requestId: reqId });
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `✏️ Talabnoma uchun *tasdiqlanadigan summani* (va xohlasangiz izohni) yozib yuboring:\n\nMisol: \`2000\` yoki \`1800 Arzonroq do'kondan oling\``,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("❌ Bekor qilish", "dir:cancel"),
        }
      );
      return;
    }

    if (action === "rej" && reqId) {
      if (!auth.isDirector) {
        await ctx.answerCallbackQuery({
          text: "⛔ Faqat Direktor uchun!",
          show_alert: true,
        });
        return;
      }
      directorPendingByUser.set(userId, { type: "reject_request_reason", requestId: reqId });
      const kb = new InlineKeyboard()
        .text("⏳ Keyingi oyga qoldirilsin", `req:rejdo:${reqId}:Keyingi oyga qoldirilsin`)
        .row()
        .text("💰 Qimmat, arzonrog'ini toping", `req:rejdo:${reqId}:Qimmat, arzonrog'ini toping`)
        .row()
        .text("🚫 Hozir zarur emas", `req:rejdo:${reqId}:Hozir zarur emas`)
        .row()
        .text("❌ Bekor qilish", "dir:cancel");

      await ctx.answerCallbackQuery();
      await ctx.reply(
        `❌ Talabnomani rad etish sababini tanlang yoki *o'zingiz sababini yozib yuboring*:`,
        { parse_mode: "Markdown", reply_markup: kb }
      );
      return;
    }

    if (action === "rejdo" && reqId && extra) {
      if (!auth.isDirector) {
        await ctx.answerCallbackQuery({ text: "⛔ Faqat Direktor uchun!", show_alert: true });
        return;
      }
      directorPendingByUser.delete(userId);
      try {
        const res = await rejectExpenseRequestInBot(bot, reqId, auth.personName, extra);
        await ctx.answerCallbackQuery({ text: `❌ ${res.reqCode} rad etildi` });
        await ctx.editMessageText(
          `❌ Talabnoma *${res.reqCode}* rad etildi.\nSabab: _${extra}_`,
          { parse_mode: "Markdown" }
        );
      } catch (e: any) {
        await ctx.answerCallbackQuery({
          text: "Xatolik: " + (e?.message || "Noma'lum"),
          show_alert: true,
        });
      }
      return;
    }

    if (action === "done" && reqId) {
      try {
        const rows: any[] = await moliyPrisma.$queryRawUnsafe(
          `SELECT r.*, COALESCE(c.name, 'Boshqa') AS "categoryName"
           FROM "ExpenseRequest" r
           LEFT JOIN "Category" c ON c.id = r."categoryId"
           WHERE r.id = $1 AND r."deletedAt" IS NULL LIMIT 1`,
          reqId
        );
        const reqRow = rows?.[0];
        if (!reqRow) {
          await ctx.answerCallbackQuery({ text: "Talabnoma topilmadi", show_alert: true });
          return;
        }
        if (reqRow.status === "COMPLETED") {
          await ctx.answerCallbackQuery({
            text: "✅ Bu talabnoma allaqachon xarajatga o'tkazilgan!",
            show_alert: true,
          });
          return;
        }
        if (reqRow.status !== "APPROVED" && !auth.isDirector) {
          await ctx.answerCallbackQuery({
            text: "⏳ Talabnoma hali Direktor tomonidan tasdiqlanmagan!",
            show_alert: true,
          });
          return;
        }

        const rate = await fetchLiveUsdRate();
        const reqCode = `#T-${reqRow.requestNumber}`;
        const appAmt = Number(reqRow.approvedAmount || reqRow.amountInDefault || reqRow.amount || 0);
        const draftId = String(seqCounter++);
        const empKey = normalizeEmployee(reqRow.sourceKey || auth.accountKey, auth.accountKey);
        const todayStr = getIstanbulDateStr();

        const draft: ExpenseDraftItem = {
          id: draftId,
          linkedRequestId: reqRow.id,
          linkedRequestCode: reqCode,
          isRequest: false,
          chatId: ctx.chat!.id,
          userId,
          sourcePersonName: auth.personName,
          title: String(reqRow.description || "Xarajat").trim(),
          description: `${String(reqRow.description || "Xarajat").trim()} (${reqCode})`,
          amount: appAmt,
          currency: "TL",
          usdRate: rate,
          amountTl: appAmt,
          amountUsd: Number((appAmt / rate).toFixed(2)),
          category: normalizeCategory(reqRow.categoryName),
          employee: empKey,
          paymentMethod: "Naqd",
          date: todayStr,
          sourceType: "text",
          rawInput: reqRow.description,
          status: "DRAFT",
          awaitingReceipt: true,
          createdAt: new Date(),
        };
        recalcAmounts(draft);
        draftsById.set(draftId, draft);
        activeDraftByUser.set(userId, draftId);

        const kb = new InlineKeyboard()
          .text("🚫 Chek yo'q (Cheksiz saqlash)", `exp:ok_noreceipt:${draft.id}`)
          .row()
          .text("⚙️ Summa / To'lov usulini o'zgartirish", `exp:back:${draft.id}`)
          .text("❌ Bekor qilish", `exp:cancel:${draft.id}`);

        await ctx.answerCallbackQuery({ text: "📸 Chek rasmini yuboring yoki «Chek yo'q» ni bosing" });
        const sent = await ctx.reply(
          [
            `💸 *TASDIQLANGAN TALABNOMA BO'YICHA XARID (${reqCode})*`,
            "────────────────────",
            `📝 Maqsad: *${draft.title}*`,
            `📂 Kategoriya: *${draft.category}*`,
            `💰 Ruxsat etilgan summa: *₺${fmtNum(draft.amountTl)} TL* ($${fmtNum(draft.amountUsd)} USD)`,
            "────────────────────",
            "📸 **Iltimos, xarid cheki (kvitansiya) rasmini shu yerga yuboring** — rasm tushishi bilan xarajat bazaga yoziladi va hamyondan ayriladi!",
            "",
            "• Agar chek bo'lmasa: **«🚫 Chek yo'q (Cheksiz saqlash)»** tugmasini bosing.",
            "• Agar haqiqiy xarid summasi boshqacha chiqqan bo'lsa, shunchaki yangi summani yozib yuboring (masalan: `1850 lira bo'ldi`).",
          ].join("\n"),
          { parse_mode: "Markdown", reply_markup: kb }
        );
        draft.messageId = sent.message_id;
      } catch (e: any) {
        await ctx.answerCallbackQuery({
          text: "Xatolik: " + (e?.message || "Noma'lum"),
          show_alert: true,
        });
      }
      return;
    }
  });

  bot.callbackQuery("idora_cam_unblock", async (ctx) => {
    const userId = String(ctx.from.id);
    if (!CAMERA_OWNER_IDS.has(userId)) {
      await ctx.answerCallbackQuery({ text: "Ruxsat yo'q", show_alert: true });
      return;
    }
    try {
      await setIdoraCameraBlock(false);
      await ctx.answerCallbackQuery({ text: "✅ Kameralar to'riga qaytarildi!" });
      const kb = new InlineKeyboard().text("🚨 Qayta yopish (Kamera!!!)", "idora_cam_block");
      await ctx.editMessageText(
        "✅ **\"Idora\" monitorida qizil ogohlantirish o'chirildi va kameralar to'ri qayta tiklandi!**",
        { parse_mode: "Markdown", reply_markup: kb }
      );
    } catch (e: any) {
      await ctx.answerCallbackQuery({ text: "Xatolik: " + (e?.message || "Noma'lum"), show_alert: true });
    }
  });

  bot.callbackQuery("idora_cam_block", async (ctx) => {
    const userId = String(ctx.from.id);
    if (!CAMERA_OWNER_IDS.has(userId)) {
      await ctx.answerCallbackQuery({ text: "Ruxsat yo'q", show_alert: true });
      return;
    }
    try {
      await setIdoraCameraBlock(true);
      await ctx.answerCallbackQuery({ text: "🚨 Idora monitorida kameralar yopildi!" });
      const kb = new InlineKeyboard().text("✕ O'chirish (Kameralar to'riga qaytish)", "idora_cam_unblock");
      await ctx.editMessageText(
        [
          "🚨 **\"Idora\" monitorida kameralar to'ri yopildi!**",
          "",
          "🖥 Faqatgina **Idora** monitorida kameralar to'ri yo'qolib, qizil ogohlantirish chiqdi:",
          "🚫 **«KAMERAGA QARAMA, MUMKIN EMAS!»**",
          "",
          "👇 Kameralar to'riga qaytarish uchun monitordagi yoki quyidagi **O'chirish** tugmasini bosing:",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: kb }
      );
    } catch (e: any) {
      await ctx.answerCallbackQuery({ text: "Xatolik: " + (e?.message || "Noma'lum"), show_alert: true });
    }
  });

  // Voice / Audio messages
  bot.on(["message:voice", "message:audio"], async (ctx) => {
    const userId = String(ctx.from.id);
    const fileId = ctx.message.voice?.file_id || ctx.message.audio?.file_id;
    if (!fileId) return;

    const waitMsg = await ctx.reply("🎙 Ovozli xabar eshitilmoqda va AI tahlil qilmoqda...");
    try {
      const transcript = await transcribeTelegramVoice(bot, fileId);
      if (!transcript) {
        await bot.api.editMessageText(
          ctx.chat.id,
          waitMsg.message_id,
          "⚠️ Ovozli xabardan so'z aniqlanmadi. Iltimos, qaytadan aniqroq gapirib yuboring."
        );
        return;
      }
      await bot.api.editMessageText(
        ctx.chat.id,
        waitMsg.message_id,
        `🎙 Eshitildi: "${transcript}"\n🧠 AI tahlil qilmoqda...`
      );
      await processUserExpenseInput({
        bot,
        chatId: ctx.chat.id,
        userId,
        text: transcript,
        sourceType: "voice",
      });
    } catch (e: any) {
      await bot.api.editMessageText(
        ctx.chat.id,
        waitMsg.message_id,
        `❌ Ovozni tahlil qilishda xatolik: ${e?.message || "Noma'lum xato"}`
      );
    }
  });

  // Photo messages (Receipt attachment to existing draft/expense OR Receipt OCR for new expense)
  bot.on("message:photo", async (ctx) => {
    const userId = String(ctx.from.id);
    const photos = ctx.message.photo;
    if (!photos || photos.length === 0) return;
    const largest = photos[photos.length - 1]!;
    const caption = (ctx.message.caption || "").trim();

    // 1. Check if user is attaching a receipt to an already-confirmed expense
    const laterDraftId = awaitingLaterReceiptByUser.get(userId);
    if (laterDraftId) {
      const laterDraft = draftsById.get(laterDraftId);
      awaitingLaterReceiptByUser.delete(userId);
      if (laterDraft && laterDraft.dbExpenseId) {
        const waitMsg = await ctx.reply("📸 Chek rasmi tizimga saqlanmoqda...");
        try {
          const dl = await downloadTelegramPhotoWithBuffer(bot, largest.file_id);
          const pubUrl = await saveReceiptToDiskAndDb(
            laterDraft.dbExpenseId,
            dl.buffer,
            "chek.jpg",
            "image/jpeg"
          );
          laterDraft.receiptBuffer = dl.buffer;
          laterDraft.receiptFileId = largest.file_id;
          laterDraft.receiptPublicUrl = pubUrl;
          await bot.api.editMessageText(
            ctx.chat.id,
            waitMsg.message_id,
            `✅ Chek rasmi *${laterDraft.title}* (₺${fmtNum(laterDraft.amountTl)} TL) xarajatiga muvaffaqiyatli biriktirildi va tizimga saqlandi!`,
            { parse_mode: "Markdown" }
          );
          // Also send receipt photo to Director(s)
          for (const dirTgId of getDirectorTelegramIds()) {
            if (String(dirTgId) === String(userId)) continue;
            try {
              await bot.api.sendPhoto(Number(dirTgId), largest.file_id, {
                caption: `📎 *Qo'shimcha chek rasmi biriktirildi:*\n📝 Xarajat: *${laterDraft.title}* (₺${fmtNum(laterDraft.amountTl)} TL)\n✍️ Kiritdi: *${laterDraft.sourcePersonName}*`,
                parse_mode: "Markdown",
              });
            } catch {}
          }
          return;
        } catch (e: any) {
          await bot.api.editMessageText(
            ctx.chat.id,
            waitMsg.message_id,
            `❌ Chekni saqlashda xatolik: ${e?.message || "Noma'lum xato"}`
          );
          return;
        }
      }
    }

    // 2. Check if user has an open DRAFT waiting for a receipt photo (or without a receipt yet)
    const activeDraftId = activeDraftByUser.get(userId);
    const currentDraft = activeDraftId ? draftsById.get(activeDraftId) : null;
    const openDraft = currentDraft && currentDraft.status === "DRAFT" ? currentDraft : null;

    if (openDraft && (openDraft.awaitingReceipt || (!openDraft.receiptBuffer && !caption))) {
      const waitMsg = await ctx.reply("📸 Chek rasmi xarajatga biriktirilmoqda...");
      try {
        const dl = await downloadTelegramPhotoWithBuffer(bot, largest.file_id);
        openDraft.receiptBuffer = dl.buffer;
        openDraft.receiptFileId = largest.file_id;
        openDraft.receiptFileName = "chek.jpg";
        openDraft.receiptMimeType = "image/jpeg";

        if (openDraft.awaitingReceipt) {
          openDraft.awaitingReceipt = false;
          const saved = await saveExpenseToDatabases(bot, openDraft);
          openDraft.status = "CONFIRMED";
          openDraft.confirmedAt = new Date();
          openDraft.dbExpenseId = saved.expId;
          openDraft.dbWalletTxId = saved.txId;
          openDraft.walletBalanceAfter = saved.balanceAfter;
          activeDraftByUser.delete(userId);

          try {
            await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
          } catch {}
          await ctx.reply(buildConfirmedCardText(openDraft), {
            reply_markup: buildConfirmedKeyboard(openDraft),
          });
          return;
        } else {
          try {
            await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
          } catch {}
          const sent = await ctx.reply(
            buildDraftCardText(openDraft, "📎 Chek rasmi qoralamaga biriktirildi!"),
            { reply_markup: buildDraftKeyboard(openDraft) }
          );
          openDraft.messageId = sent.message_id;
          return;
        }
      } catch (e: any) {
        await bot.api.editMessageText(
          ctx.chat.id,
          waitMsg.message_id,
          `❌ Chek rasmini biriktirishda xatolik: ${e?.message || "Noma'lum xato"}`
        );
        return;
      }
    }

    // 3. Otherwise, treat photo as a new expense receipt (AI OCR + attach receipt to draft)
    const waitMsg = await ctx.reply("📸 Chek / kvitansiya rasmi AI orqali o'qilmoqda va saqlashga tayyorlanmoqda...");
    try {
      const dl = await downloadTelegramPhotoWithBuffer(bot, largest.file_id);
      await processUserExpenseInput({
        bot,
        chatId: ctx.chat.id,
        userId,
        text: caption,
        sourceType: "photo",
        imageBase64Url: dl.dataUrl,
        receiptBuffer: dl.buffer,
        receiptFileId: largest.file_id,
        receiptFileName: "chek_ocr.jpg",
        receiptMimeType: "image/jpeg",
      });
      try {
        await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
      } catch {}
    } catch (e: any) {
      await bot.api.editMessageText(
        ctx.chat.id,
        waitMsg.message_id,
        `❌ Chek rasmini o'qishda xatolik: ${e?.message || "Noma'lum xato"}`
      );
    }
  });

  // Text messages
  bot.on("message:text", async (ctx) => {
    const raw = ctx.message.text.trim();
    if (raw.startsWith("/")) return;

    const userId = String(ctx.from.id);
    const auth = AUTHORIZED_USERS[userId];
    if (!auth) return;

    if (/^(mening\s+id|my\s+id|id)$/i.test(raw)) {
      await ctx.reply(
        `🆔 Sizning Telegram ID raqamingiz: \`${userId}\`\n🏦 Biriktirilgan hisob: *${auth.accountLabel}*`,
        {
          parse_mode: "Markdown",
          reply_markup: buildReplyKeyboard(userId),
        }
      );
      return;
    }

    if (
      (/^\?*\s*kamera!*$/i.test(raw) || raw === "Kamera!!!" || raw === "🚨 Kamera!!!") &&
      CAMERA_OWNER_IDS.has(userId)
    ) {
      try {
        await setIdoraCameraBlock(true);
        const kb = new InlineKeyboard().text("✕ O'chirish (Kameralar to'riga qaytish)", "idora_cam_unblock");
        await ctx.reply(
          [
            "🚨 **\"Idora\" monitorida kameralar to'ri yopildi!**",
            "",
            "🖥 Faqatgina **Idora** monitorida kameralar to'ri yo'qolib, qizil ogohlantirish chiqdi:",
            "🚫 **«KAMERAGA QARAMA, MUMKIN EMAS!»**",
            "",
            "👇 Kameralar to'riga qaytarish uchun monitordagi yoki quyidagi **O'chirish** tugmasini bosing:",
          ].join("\n"),
          { parse_mode: "Markdown", reply_markup: kb }
        );
      } catch (e: any) {
        await ctx.reply("❌ Monitor bilan bog'lanishda xatolik: " + (e?.message || "Noma'lum xato"), {
          reply_markup: buildReplyKeyboard(userId),
        });
      }
      return;
    }

    // Director Reply Keyboard Buttons & Request Reply/Pending Handlers
    if (auth.isDirector) {
      if (raw === "📊 Umumiy Kassa va Hisobot") {
        directorPendingByUser.delete(userId);
        await sendDirectorDashboard(bot, ctx.chat.id);
        return;
      }
      if (raw === "💸 Pul ajratish / Kirim") {
        directorPendingByUser.delete(userId);
        const kb = new InlineKeyboard()
          .text("🏦 Xodim hamyoniga pul berish", "dir:assign:menu")
          .row()
          .text("💰 Xazinaga Kirim (Income) kiritish", "dir:income:start");
        await ctx.reply(
          [
            "💸 *PUL AJRATISH YOKI XAZINAGA KIRIM:*",
            "",
            "Quyidagi tugmalardan birini tanlang yoki shunchaki yozib yuboring:",
            "• _\"Idoraga 20000 lira berdim\"_",
            "• _\"Vaqfga 10000 tl o'tkaz\"_",
            "• _\"Xazinaga 5000 dollar kirim bo'ldi\"_",
          ].join("\n"),
          { parse_mode: "Markdown", reply_markup: kb }
        );
        return;
      }
      if (raw === "🏦 Hamyonlar balansi") {
        directorPendingByUser.delete(userId);
        await sendDirectorWalletsMenu(bot, ctx.chat.id);
        return;
      }
      if (raw === "🧾 Barcha xarajatlar") {
        directorPendingByUser.delete(userId);
        await sendDirectorExpensesList(bot, ctx.chat.id, "all");
        return;
      }
      if (raw === "📋 Talabnomalar" || raw === "📋 Talabnomalarim") {
        directorPendingByUser.delete(userId);
        await sendExpenseRequestsListCard(bot, ctx.chat.id, userId);
        return;
      }
      if (raw === "🎯 Byudjet va 💱 Kurs") {
        directorPendingByUser.delete(userId);
        await sendDirectorRateAndBudgetMenu(bot, ctx.chat.id);
        return;
      }
      if (raw === "👥 Xodimlar va Ruxsatlar") {
        directorPendingByUser.delete(userId);
        await sendDirectorStaffMenu(bot, ctx.chat.id);
        return;
      }

      // Check if Director replied directly to an Expense Request notification message
      const replyToMsgId = ctx.message.reply_to_message?.message_id;
      if (replyToMsgId) {
        try {
          const reqRows: any[] = await moliyPrisma.$queryRawUnsafe(
            `SELECT id, "requestNumber", status
             FROM "ExpenseRequest"
             WHERE "deletedAt" IS NULL
               AND "directorMessages" @> $1::jsonb
             LIMIT 1`,
            JSON.stringify([{ chatId: String(ctx.chat.id), messageId: Number(replyToMsgId) }])
          );
          const matchedReq = reqRows?.[0];
          if (matchedReq) {
            const numMatch = raw.match(/^\s*([0-9]+(?:[.,][0-9]+)?)\s*(.*)$/);
            if (numMatch) {
              const numVal = parseFloat(numMatch[1]!.replace(",", "."));
              const restNote = (numMatch[2] || "").replace(/^(tl|try|lira|\₺)\s*/i, "").trim();
              if (numVal > 0) {
                const res = await approveExpenseRequestInBot(
                  bot,
                  matchedReq.id,
                  auth.personName,
                  numVal,
                  restNote || null
                );
                await ctx.reply(
                  `✅ Talabnoma *${res.reqCode}* (*${res.sourceLabel}*) *₺${fmtNum(res.approvedAmount)} TL* miqdorida tasdiqlandi va xodimga yuborildi!`,
                  { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
                );
                return;
              }
            } else if (/^(ha|ok|tasdiq|tasdiqlayman|ruxsat|\+)$/i.test(raw)) {
              const res = await approveExpenseRequestInBot(bot, matchedReq.id, auth.personName);
              await ctx.reply(
                `✅ Talabnoma *${res.reqCode}* (*₺${fmtNum(res.approvedAmount)} TL*) tasdiqlandi va xodimga yuborildi!`,
                { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
              );
              return;
            } else {
              const res = await rejectExpenseRequestInBot(
                bot,
                matchedReq.id,
                auth.personName,
                raw
              );
              await ctx.reply(
                `❌ Talabnoma *${res.reqCode}* rad etildi.\nSabab: _${raw}_`,
                { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
              );
              return;
            }
          }
        } catch {}
      }

      // Check if Director has an interactive prompt open
      const pending = directorPendingByUser.get(userId);
      if (pending) {
        if (pending.type === "approve_request_amount" && pending.requestId) {
          const isUsd = /dollar|usd|\$/i.test(raw);
          const numMatch = raw.match(/([0-9]+(?:[.,][0-9]+)?)/);
          const num = numMatch ? parseFloat(numMatch[1]!.replace(",", ".")) : 0;
          if (num > 0) {
            const reqId = pending.requestId;
            directorPendingByUser.delete(userId);
            const rate = await fetchLiveUsdRate();
            const amtTl = isUsd ? Number((num * rate).toFixed(2)) : num;
            const notePart = raw
              .replace(numMatch![0], "")
              .replace(/\b(tl|try|lira|dollar|usd)\b/gi, "")
              .trim();
            try {
              const res = await approveExpenseRequestInBot(
                bot,
                reqId,
                auth.personName,
                amtTl,
                notePart || null
              );
              await ctx.reply(
                `✅ Talabnoma *${res.reqCode}* (*${res.sourceLabel}*) *₺${fmtNum(res.approvedAmount)} TL* etib tasdiqlandi va xodimga yuborildi!`,
                { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
              );
            } catch (e: any) {
              await ctx.reply("❌ Xatolik: " + (e?.message || "Noma'lum"), {
                reply_markup: buildReplyKeyboard(userId),
              });
            }
            return;
          }
        }

        if (pending.type === "reject_request_reason" && pending.requestId) {
          const reqId = pending.requestId;
          directorPendingByUser.delete(userId);
          try {
            const res = await rejectExpenseRequestInBot(bot, reqId, auth.personName, raw);
            await ctx.reply(
              `❌ Talabnoma *${res.reqCode}* rad etildi va xodimga xabar yuborildi.\nSabab: _${raw}_`,
              { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
            );
          } catch (e: any) {
            await ctx.reply("❌ Xatolik: " + (e?.message || "Noma'lum"), {
              reply_markup: buildReplyKeyboard(userId),
            });
          }
          return;
        }

        if (pending.type === "set_rate") {
          const num = parseFloat(raw.replace(/,/g, "."));
          if (num > 1 && num < 500) {
            directorPendingByUser.delete(userId);
            const rateId = "rate_tg_" + crypto.randomBytes(8).toString("hex");
            await moliyPrisma.$executeRawUnsafe(
              `INSERT INTO "ExchangeRate" (id, "fromCurrency", "toCurrency", rate, "effectiveDate", "createdAt")
               VALUES ($1, 'USD', 'TL', $2, NOW(), NOW())`,
              rateId,
              num
            );
            await ctx.reply(
              `✅ *Yangi valyuta kursi saqlandi:* \`1 USD ($) = ${num.toFixed(4)} TL (₺)\``,
              { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
            );
            return;
          }
        }

        if (pending.type === "set_budget" && pending.categoryName) {
          const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
          if (num > 0) {
            directorPendingByUser.delete(userId);
            const catId = CATEGORY_ID_MAP[pending.categoryName]!;
            const todayStr = getIstanbulDateStr();
            const [year, month] = todayStr.slice(0, 7).split("-").map(Number);
            const bId = "bdg_tg_" + crypto.randomBytes(8).toString("hex");
            await moliyPrisma.$executeRawUnsafe(
              `INSERT INTO "Budget" (id, "officeId", "categoryId", year, month, amount, currency, spent, "createdAt", "updatedAt")
               VALUES ($1, 'main-office', $2, $3, $4, $5, 'TL', 0, NOW(), NOW())
               ON CONFLICT ("officeId", "categoryId", "employeeId", month, year)
               DO UPDATE SET amount = EXCLUDED.amount, "updatedAt" = NOW()`,
              bId,
              catId,
              year,
              month,
              num
            ).catch(async () => {
              const ex: any[] = await moliyPrisma.$queryRawUnsafe(
                `SELECT id FROM "Budget" WHERE "categoryId" = $1 AND year = $2 AND month = $3 LIMIT 1`,
                catId,
                year,
                month
              );
              if (ex?.[0]?.id) {
                await moliyPrisma.$executeRawUnsafe(
                  `UPDATE "Budget" SET amount = $1, "updatedAt" = NOW() WHERE id = $2`,
                  num,
                  ex[0].id
                );
              } else {
                await moliyPrisma.$executeRawUnsafe(
                  `INSERT INTO "Budget" (id, "officeId", "categoryId", year, month, amount, currency, spent, "createdAt", "updatedAt")
                   VALUES ($1, 'main-office', $2, $3, $4, $5, 'TL', 0, NOW(), NOW())`,
                  bId,
                  catId,
                  year,
                  month,
                  num
                );
              }
            });
            await ctx.reply(
              `✅ *${pending.categoryName}* kategoriyasi uchun oylik byudjet limiti *₺${fmtNum(num)} TL* etib belgilandi!`,
              { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
            );
            return;
          }
        }

        if (pending.type === "assign_amount" && pending.targetKey) {
          const isUsd = /dollar|usd|\$/i.test(raw);
          const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
          if (num > 0) {
            directorPendingByUser.delete(userId);
            const rate = await fetchLiveUsdRate();
            const amtTl = isUsd ? Number((num * rate).toFixed(2)) : num;
            const res = await assignFundsToWallet(
              bot,
              pending.targetKey,
              amtTl,
              raw,
              auth.personName
            );
            const target = ACCOUNT_TARGETS[pending.targetKey]!;
            await ctx.reply(
              [
                "✅ *HAMYONGA MABLAG' MUVAFFAQIYATLI O'TKAZILDI!*",
                "────────────────────",
                `🏦 Hisob: *${target.label}*`,
                `➕ Ajratilgan summa: *+₺${fmtNum(amtTl)} TL*` +
                  (isUsd ? ` ($${fmtNum(num)} USD)` : ""),
                `💳 Yangi balans: *₺${fmtNum(res.balanceAfter)} TL*`,
              ].join("\n"),
              { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
            );
            return;
          }
        }

        if (pending.type === "edit_expense_amount" && pending.expenseId) {
          const isUsd = /dollar|usd|\$/i.test(raw);
          const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
          if (num > 0) {
            const expId = pending.expenseId;
            directorPendingByUser.delete(userId);
            const rows: any[] = await moliyPrisma.$queryRawUnsafe(
              `SELECT id, "employeeId", "amountInDefault"::float AS old_tl, "usdRate"::float AS usd_rate
               FROM "Expense" WHERE id = $1 LIMIT 1`,
              expId
            );
            const exp = rows?.[0];
            if (exp) {
              const rate = Number(exp.usd_rate || (await fetchLiveUsdRate()));
              const newTl = isUsd ? Number((num * rate).toFixed(2)) : Number(num.toFixed(2));
              const newUsd = isUsd ? Number(num.toFixed(2)) : Number((num / rate).toFixed(2));
              const deltaTl = newTl - Number(exp.old_tl || 0);
              const target =
                Object.values(ACCOUNT_TARGETS).find((t) => t.employeeId === exp.employeeId) ||
                ACCOUNT_TARGETS.Idora!;

              await moliyPrisma.$transaction([
                moliyPrisma.$executeRawUnsafe(
                  `UPDATE "Expense"
                   SET amount = $1, currency = $2, "amountInDefault" = $3, "amountUsd" = $4, "updatedAt" = NOW()
                   WHERE id = $5`,
                  num,
                  isUsd ? "USD" : "TL",
                  newTl,
                  newUsd,
                  expId
                ),
                moliyPrisma.$executeRawUnsafe(
                  `UPDATE "Wallet"
                   SET balance = balance - $1, "totalSpent" = GREATEST(0, "totalSpent" + $1), "updatedAt" = NOW()
                   WHERE id = $2`,
                  deltaTl,
                  target.walletId
                ),
              ]);
              try {
                await prisma.$transaction([
                  prisma.$executeRawUnsafe(
                    `UPDATE finance."Expense"
                     SET amount = $1, currency = $2, "amountInDefault" = $3, "updatedAt" = NOW()
                     WHERE id = $4`,
                    num,
                    isUsd ? "USD" : "TL",
                    newTl,
                    expId
                  ),
                  prisma.$executeRawUnsafe(
                    `UPDATE finance."Wallet"
                     SET balance = balance - $1, "totalSpent" = GREATEST(0, "totalSpent" + $1), "updatedAt" = NOW()
                     WHERE id = $2`,
                    deltaTl,
                    target.walletId
                  ),
                ]);
              } catch {}

              await ctx.reply(
                `✅ Xarajat (\`${expId}\`) summasi *₺${fmtNum(newTl)} TL* ($${fmtNum(newUsd)} USD) ga o'zgartirildi va hamyon balansi qayta hisoblandi!`,
                { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
              );
              return;
            }
          }
        }
      }
    }

    if (raw === "📝 Talabnoma yaratish") {
      userRequestMode.add(userId);
      await ctx.reply(
        [
          `📝 *Xarajatga talabnoma yaratish (${auth.accountLabel})*`,
          "",
          "Nima xarid qilmoqchi ekaningizni va taxminiy summani yozing yoki ovozli xabar yuboring:",
          "• 💬 _\"Ofis uchun printer qog'ozi va kantselyariya olish kerak 2500 lira\"_",
          "• 💬 _\"Oshxonaga 10 kg go'sht olishga 4500 tl ruxsat bering\"_",
          "• 💬 _\"Shoshilinch: internet router olish kerak 1800 tl\"_",
          "• 🎙 *Ovozli xabar* yuboring",
          "",
          "📌 *Tartibi:* Tasdiqlaganingizda talabnoma Direktorga boradi. Direktor tasdiqlagach sizga xabar keladi va xaridni amalga oshirib chekni biriktirasiz!",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
      );
      return;
    }

    if (raw === "📋 Talabnomalarim" || raw === "📋 Talabnomalar") {
      await sendExpenseRequestsListCard(bot, ctx.chat.id, userId);
      return;
    }

    if (raw === "➕ Xarajat kiritish") {
      userRequestMode.delete(userId);
      await ctx.reply(
        [
          `➕ *Yangi xarajat kiritish (${auth.accountLabel} hisobiga)*`,
          "",
          "Shunchaki xuddi odamga yozgandek yuboring:",
          "• 💬 _\"Tushlikka 450 lira ishlatdim\"_",
          "• 💬 _\"Printer qog'ozi 850 tl karta orqali\"_",
          "• 💬 _\"Mehmonxona 120 dollar naqd\"_",
          "• 💬 _\"Nonushta 220 tl, taksi 180 tl\"_ (bir nechta xarajat birdaniga)",
          "• 🎙 *Ovozli xabar* yuboring",
          "• 📸 *Chek rasmini* yuboring",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
      );
      return;
    }

    if (raw.startsWith("💼 Hisobim")) {
      await sendAccountStatusCard(bot, ctx.chat.id, userId);
      return;
    }

    if (raw === "📊 Oxirgi xarajatlar") {
      await sendRecentExpensesCard(bot, ctx.chat.id, userId);
      return;
    }

    if (raw === "📂 Kategoriyalar") {
      const rate = await fetchLiveUsdRate();
      await ctx.reply(
        [
          "📂 *Mavjud 18 ta Xarajat Kategoriyasi:*",
          CATEGORIES.map((c) => `• ${c}`).join("\n"),
          "",
          `🏦 *Sizning biriktirilgan hisobingiz:* ${auth.accountLabel} (\`${auth.erpEmail}\`)`,
          `💱 *Joriy Valyuta Kursi:* 1 USD ($) = ${rate.toFixed(4)} TL (₺)`,
          "💳 *To'lov usullari:* Naqd | Karta",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: buildReplyKeyboard(userId) }
      );
      return;
    }

    const waitMsg = await ctx.reply("🧠 AI tahlil qilmoqda...");
    try {
      await processUserExpenseInput({
        bot,
        chatId: ctx.chat.id,
        userId,
        text: raw,
        sourceType: "text",
      });
      try {
        await bot.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
      } catch {}
    } catch (e: any) {
      await bot.api.editMessageText(
        ctx.chat.id,
        waitMsg.message_id,
        `❌ Xatolik yuz berdi: ${e?.message || "Noma'lum xato"}`
      );
    }
  });
}
