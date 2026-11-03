import fs from "node:fs";
import path from "node:path";
import { Bot, InlineKeyboard, InputFile } from "grammy";
import { prisma, crmPrisma } from "../db/client.js";
import { LATE, fmtLocal, isNightTime } from "./config.js";
import { captureBurst } from "./capture.js";
import { AUTHORIZED_USERS } from "../expense/sandboxFlow.js";

export interface CrmStudentRow {
  id: number;
  fullname: string;
  group: string;
  isActive: boolean;
  isArchived: boolean;
}

const ALWAYS_ALLOWED_LATE_IDS = new Set([
  "8142118072", // Abu Bakr Idora
  "8014832689", // Umarxon Idora
  "975535813",  // Direktor
  "8917275156", // Direktor (2)
  "387178074",  // Muhammadali Akramjonov
]);

async function getResponsibles() {
  const list = await prisma.telegramContact.findMany({
    where: { isLateResponsible: true },
    orderBy: { lastStartAt: "desc" },
  });
  const sorted = [...list].sort((a, b) => {
    if (String(a.telegramId) === "8142118072") return -1;
    if (String(b.telegramId) === "8142118072") return 1;
    return 0;
  });
  if (sorted.length > 0) return sorted;
  return prisma.telegramContact.findMany({
    where: { fullName: { not: null } },
    orderBy: { lastStartAt: "desc" },
  });
}

async function isAuthorizedForLate(tgId: string): Promise<{ allowed: boolean; label: string }> {
  const contact = await prisma.telegramContact.findUnique({ where: { telegramId: tgId } });
  const auth = AUTHORIZED_USERS[tgId];
  const allowed = Boolean(contact?.isLateResponsible || ALWAYS_ALLOWED_LATE_IDS.has(tgId) || auth?.isDirector);
  const label = contact?.fullName || auth?.personName || contact?.firstName || contact?.username || tgId;
  return { allowed, label };
}

/**
 * Normalize Uzbek / Turkish / English transliteration & spelling differences
 */
export function normalizePersonName(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  const charMap: Array<[string, string]> = [
    ["\u0131", "i"],
    ["\u0130", "i"],
    ["I", "i"],
    ["\u015f", "sh"],
    ["\u015e", "sh"],
    ["\u00e7", "ch"],
    ["\u00c7", "ch"],
    ["\u011f", "g"],
    ["\u011e", "g"],
    ["\u00f6", "o"],
    ["\u00d6", "o"],
    ["\u00fc", "u"],
    ["\u00dc", "u"],
  ];
  for (const [k, v] of charMap) {
    s = s.split(k).join(v);
  }
  s = s.toLowerCase();
  // Normalize apostrophes
  s = s.replace(/[\u2018\u2019`\u02bc']/g, "'");
  s = s.replace(/o'/g, "o").replace(/g'/g, "g").replace(/'/g, "");
  if (s === "suhayb" || s.includes("suhayb")) s = s.replace(/suhayb/g, "faizov saidazam");

  // Phonetic & transliteration equivalents
  s = s
    .replace(/kh/g, "h")
    .replace(/x/g, "h")
    .replace(/q/g, "k")
    .replace(/dj/g, "j")
    .replace(/zh/g, "j")
    .replace(/hoja/g, "huja")
    .replace(/hodja/g, "huja")
    .replace(/hujaev/g, "hujaev")
    .replace(/hujayev/g, "hujaev")
    .replace(/ayev\b/g, "aev")
    .replace(/iyev\b/g, "iev")
    .replace(/yev\b/g, "ev")
    .replace(/ov\b/g, "ev")
    .replace(/ulloh\b/g, "ulla")
    .replace(/ullo\b/g, "ulla")
    .replace(/ullokh\b/g, "ulla")
    .replace(/illoh\b/g, "illa")
    .replace(/illo\b/g, "illa")
    .replace(/hon\b/g, "han")
    .replace(/jon\b/g, "han")
    .replace(/jan\b/g, "han")
    .replace(/abdu\b/g, "abdu")
    .replace(/abdul/g, "abdu")
    .replace(/abdir/g, "abdur")
    .replace(/dost/g, "dust")
    .replace(/po'lat/g, "pulat")
    .replace(/polat/g, "pulat")
    .replace(/yoldosh/g, "yuldash")
    .replace(/yuldosh/g, "yuldash")
    .replace(/tori/g, "buri")
    .replace(/bori/g, "buri")
    .replace(/iy\b/g, "i")
    .replace(/y\b/g, "i");

  // Keep only alphanumeric and spaces
  s = s.replace(/[^a-z0-9\s]/g, " ");
  // Collapse double letters
  s = s.replace(/([a-z])\1+/g, "$1");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function levenshteinSim(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  const dist = dp[m]![n]!;
  return 1 - dist / Math.max(m, n);
}

function diceBigrams(a: string, b: string): number {
  const s1 = a.replace(/\s+/g, "");
  const s2 = b.replace(/\s+/g, "");
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return s1 === s2 ? 1 : 0;
  const bg1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bg1.set(bg, (bg1.get(bg) || 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const cnt = bg1.get(bg) || 0;
    if (cnt > 0) {
      intersection++;
      bg1.set(bg, cnt - 1);
    }
  }
  return (2 * intersection) / (s1.length - 1 + (s2.length - 1));
}

function pairSimilarity(qNorm: string, targetNorm: string): number {
  if (!qNorm || !targetNorm) return 0;
  if (qNorm === targetNorm) return 1.0;

  const fullLev = levenshteinSim(qNorm, targetNorm);
  const fullDice = diceBigrams(qNorm, targetNorm);
  let best = 0.55 * fullLev + 0.45 * fullDice;

  const qTokens = qNorm.split(" ").filter(Boolean);
  const tTokens = targetNorm.split(" ").filter(Boolean);

  if (qTokens.length >= 2 && tTokens.length >= 2) {
    const revTarget = [...tTokens].reverse().join(" ");
    const revLev = levenshteinSim(qNorm, revTarget);
    const revDice = diceBigrams(qNorm, revTarget);
    best = Math.max(best, 0.55 * revLev + 0.45 * revDice);

    // Token-to-token best matching average
    let sumTok = 0;
    const usedT = new Set<number>();
    for (const qt of qTokens) {
      let bestTok = 0;
      let bestIdx = -1;
      for (let i = 0; i < tTokens.length; i++) {
        if (usedT.has(i)) continue;
        const ts = 0.6 * levenshteinSim(qt, tTokens[i]!) + 0.4 * diceBigrams(qt, tTokens[i]!);
        if (ts > bestTok) {
          bestTok = ts;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) usedT.add(bestIdx);
      sumTok += bestTok;
    }
    const tokAvg = sumTok / qTokens.length;
    best = Math.max(best, tokAvg * 0.96);
  } else if (qTokens.length === 1 && tTokens.length >= 1) {
    // Single-word query (e.g. "Abdunosir", "Muhammadsolih", "Sharofiddin")
    const qt = qTokens[0]!;
    for (const tt of tTokens) {
      const ts = 0.6 * levenshteinSim(qt, tt) + 0.4 * diceBigrams(qt, tt);
      best = Math.max(best, ts * 0.92);
    }
  }

  return best;
}

export async function matchStudentInCrm(rawQuery: string): Promise<{
  best: CrmStudentRow | null;
  score: number;
  candidates: Array<{ student: CrmStudentRow; score: number }>;
}> {
  const qNorm = normalizePersonName(rawQuery);
  if (!qNorm || qNorm.length < 2) {
    return { best: null, score: 0, candidates: [] };
  }

  const rows = await crmPrisma.$queryRawUnsafe<CrmStudentRow[]>(`
    SELECT
      s.id,
      s.fullname,
      COALESCE(g.name, 'Guruhsiz') AS "group",
      s."isActive",
      s."isArchived"
    FROM "Student" s
    LEFT JOIN "Group" g ON g.id = s."groupId"
    WHERE s."isDeleted" = false
    ORDER BY s."isActive" DESC, s."isArchived" ASC, s.id ASC
  `);

  const scored: Array<{ student: CrmStudentRow; score: number }> = [];

  for (const st of rows) {
    const rawFull = (st.fullname || "").trim();
    if (!rawFull) continue;

    // Extract main name and optional parenthetical nickname e.g. "Tursunboy Soliyev (Muhammadsolih)"
    const parenMatch = rawFull.match(/\(([^)]+)\)/);
    const nickRaw = parenMatch ? parenMatch[1]!.trim() : "";
    const mainRaw = rawFull.replace(/\([^)]*\)/g, " ").trim();

    const fullNorm = normalizePersonName(rawFull);
    const mainNorm = normalizePersonName(mainRaw);
    const nickNorm = nickRaw ? normalizePersonName(nickRaw) : "";

    let sim = Math.max(pairSimilarity(qNorm, fullNorm), pairSimilarity(qNorm, mainNorm));
    if (nickNorm) {
      sim = Math.max(sim, pairSimilarity(qNorm, nickNorm));
    }

    // Small active student preference so active records win over old duplicates
    const activeBonus = st.isActive && !st.isArchived ? 0.035 : 0;
    const totalScore = Math.min(1.0, sim + (sim >= 0.65 ? activeBonus : 0));

    scored.push({ student: st, score: totalScore });
  }

  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by normalized fullname in candidates list
  const uniqueCandidates: Array<{ student: CrmStudentRow; score: number }> = [];
  const seenNames = new Set<string>();
  for (const item of scored) {
    const key = normalizePersonName(item.student.fullname);
    if (!seenNames.has(key)) {
      seenNames.add(key);
      uniqueCandidates.push(item);
    }
    if (uniqueCandidates.length >= 5) break;
  }

  const top = uniqueCandidates[0] || null;
  if (top && top.score >= 0.54) {
    return { best: top.student, score: top.score, candidates: uniqueCandidates.slice(0, 3) };
  }
  return { best: null, score: top?.score || 0, candidates: uniqueCandidates.slice(0, 3) };
}

export async function getCrmStudentById(studentId: number): Promise<CrmStudentRow | null> {
  const rows = await crmPrisma.$queryRawUnsafe<CrmStudentRow[]>(
    `
    SELECT
      s.id,
      s.fullname,
      COALESCE(g.name, 'Guruhsiz') AS "group",
      s."isActive",
      s."isArchived"
    FROM "Student" s
    LEFT JOIN "Group" g ON g.id = s."groupId"
    WHERE s.id = $1
    LIMIT 1
  `,
    Number(studentId)
  );
  return rows[0] || null;
}

/**
 * Confirm or Skip an incident in BOTH mezana_platform (devices.late_arrivals) AND mezana ("GateLateIncident")
 */
async function applyLateDecision(
  bot: Bot,
  lateId: string,
  decision: "CONFIRM" | "SKIP",
  student: CrmStudentRow | null,
  fallbackName: string | null,
  tgId: string,
  respLabel: string
) {
  const row = await prisma.lateArrival.findUnique({ where: { id: lateId } });
  const occurredAt = row?.occurredAt || new Date();
  const night = isNightTime(occurredAt);
  const prefix = night ? "" : "#sinov\n";

  const incId = lateId.startsWith("inc_") && /^\d+$/.test(lateId.slice(4)) ? Number(lateId.slice(4)) : null;

  if (decision === "SKIP") {
    if (row) {
      await prisma.lateArrival.update({
        where: { id: lateId },
        data: {
          status: "REJECTED",
          responsibleTgId: tgId,
          confirmedAt: new Date(),
        },
      });
    }
    if (incId) {
      await crmPrisma.$executeRawUnsafe(
        `UPDATE "GateLateIncident"
         SET "status" = 'DISMISSED',
             "confirmedBy" = $1,
             "confirmedAt" = NOW(),
             "note" = $2
         WHERE id = $3`,
        `Telegram (${respLabel})`,
        `Telegram botda ${respLabel} tomonidan o'tkazib yuborildi (kech qolgan emas)`,
        incId
      );
    }

    const candName = student?.fullname || row?.draftName || row?.fullName || fallbackName || null;
    const newCaption =
      `${prefix}\u{23ED} O'TKAZIB YUBORILDI (Kech qolgan deb qayd qilinmadi)\n` +
      `\u{1F552} Vaqti: ${fmtLocal(occurredAt)} (Istanbul)\n` +
      (candName ? `\u{1F464} Shaxs: ${candName}\n` : "") +
      `\u{1F46E} Belgiladi: ${respLabel}\n\n` +
      `\u{270F}\u{FE0F} (Agar kech qolgan talaba bo'lsa, shu xabarga Reply qilib ism-familiyasini yozishingiz mumkin)`;

    const undoKb = new InlineKeyboard();
    if (candName) {
      undoKb.text(`\u{1F534} Qayta kech qoldi deb tasdiqlash (${candName})`, `late:ok:${lateId}`);
    }

    await updateTelegramMessagesForLateId(bot, lateId, newCaption, candName ? undoKb : undefined);
    await syncAmirConfirmedNotification(bot, lateId, "SKIP");
    return { caption: newCaption, kb: candName ? undoKb : undefined };
  }

  // decision === "CONFIRM"
  const finalName = student?.fullname || fallbackName || row?.draftName || row?.fullName || "Noma'lum talaba";
  const finalGroup = student?.group || "Guruhsiz";
  const finalStudentId = student?.id ? String(student.id) : row?.studentId || null;

  if (row) {
    await prisma.lateArrival.update({
      where: { id: lateId },
      data: {
        status: "CONFIRMED",
        draftName: finalName,
        fullName: finalName,
        studentId: finalStudentId,
        responsibleTgId: tgId,
        confirmedAt: new Date(),
      },
    });
  }

  if (incId) {
    await crmPrisma.$executeRawUnsafe(
      `UPDATE "GateLateIncident"
       SET "status" = 'CONFIRMED',
           "studentId" = $1,
           "studentName" = $2,
           "studentGroup" = $3,
           "confirmedBy" = $4,
           "confirmedAt" = NOW(),
           "note" = $5
       WHERE id = $6`,
      student?.id ? Number(student.id) : finalStudentId && /^\d+$/.test(finalStudentId) ? Number(finalStudentId) : null,
      finalName,
      finalGroup,
      `Telegram (${respLabel})`,
      `Telegram bot orqali ${respLabel} tomonidan kech qolgan deb tasdiqlandi`,
      incId
    );
  }

  const newCaption =
    `${prefix}\u{1F534} KECH QOLGAN DEB TASDIQLANDI\n` +
    `\u{1F552} Kirgan vaqti: ${fmtLocal(occurredAt)} (Istanbul)\n\n` +
    `\u{1F464} Talaba: ${finalName}\n` +
    `\u{1F465} Guruh: ${finalGroup}\n` +
    `\u{2705} Tasdiqladi: ${respLabel}\n\n` +
    `\u{270F}\u{FE0F} (Ism-familiya xato bo'lsa, shu xabarga Reply qilib to'g'ri ism-familiyani yozing)`;

  const skipKb = new InlineKeyboard().text(`\u{23ED} O'tkazib yuborish (Kech qolmagan)`, `late:skip:${lateId}`);

  await updateTelegramMessagesForLateId(bot, lateId, newCaption, skipKb);
  await syncAmirConfirmedNotification(bot, lateId, "CONFIRM", finalName, finalGroup, occurredAt, row?.photoPaths);
  return { caption: newCaption, kb: skipKb, finalName, finalGroup };
}

const AMIR_CHAT_IDS = ["1178330042"];
const GATE_DIST_DIR = "/srv/data/apps/mezana-platform/apps/finance/dist";

async function resolveLatePhotoPath(lateId: string, photoPaths?: string[] | null): Promise<string | null> {
  if (Array.isArray(photoPaths)) {
    for (const p of photoPaths) {
      if (p && fs.existsSync(p)) return p;
    }
  }
  const incId = lateId.startsWith("inc_") && /^\d+$/.test(lateId.slice(4)) ? Number(lateId.slice(4)) : null;
  if (incId) {
    try {
      const rows = await crmPrisma.$queryRawUnsafe<Array<{ photos: any }>>(
        `SELECT photos FROM "GateLateIncident" WHERE id = $1 LIMIT 1`,
        incId
      );
      const photos = rows[0]?.photos;
      const arr = Array.isArray(photos) ? photos : typeof photos === "string" ? JSON.parse(photos) : [];
      for (const rel of arr) {
        if (typeof rel === "string") {
          const full = path.join(GATE_DIST_DIR, rel.replace(/^\/+/, ""));
          if (fs.existsSync(full)) return full;
        }
      }
    } catch {}
  }
  return null;
}

async function syncAmirConfirmedNotification(
  bot: Bot,
  lateId: string,
  decision: "CONFIRM" | "SKIP",
  finalName?: string,
  finalGroup?: string,
  occurredAt?: Date,
  photoPaths?: string[] | null
) {
  for (const amirChatId of AMIR_CHAT_IDS) {
    try {
      const existing = await prisma.$queryRawUnsafe<
        Array<{ id: number; messageId: number; isPhoto: boolean }>
      >(
        `SELECT id, "messageId", "isPhoto" FROM devices.late_arrival_messages WHERE "lateId" = $1 AND "chatId" = $2 LIMIT 1`,
        lateId,
        amirChatId
      );

      if (decision === "SKIP") {
        if (existing[0]) {
          try {
            await bot.api.deleteMessage(Number(amirChatId), Number(existing[0].messageId));
          } catch {}
          await prisma.$executeRawUnsafe(
            `DELETE FROM devices.late_arrival_messages WHERE id = $1`,
            existing[0].id
          );
        }
        continue;
      }

      // decision === "CONFIRM"
      const amirCaption =
        `\u{1F534} Kech qolgan talaba:\n\n` +
        `\u{1F464} Ism-familiya: ${finalName || "Noma'lum"}\n` +
        `\u{1F465} Guruh: ${finalGroup || "Guruhsiz"}\n` +
        `\u{1F552} Vaqti: ${fmtLocal(occurredAt || new Date())} (Istanbul)`;

      if (existing[0]) {
        try {
          if (existing[0].isPhoto) {
            await bot.api.editMessageCaption(Number(amirChatId), Number(existing[0].messageId), {
              caption: amirCaption,
            });
          } else {
            await bot.api.editMessageText(Number(amirChatId), Number(existing[0].messageId), amirCaption);
          }
          continue;
        } catch {}
      }

      const photoFile = await resolveLatePhotoPath(lateId, photoPaths);
      let sentMsgId: number | null = null;
      let isPhoto = false;
      if (photoFile) {
        const sent = await bot.api.sendPhoto(Number(amirChatId), new InputFile(photoFile), {
          caption: amirCaption,
        });
        sentMsgId = sent.message_id;
        isPhoto = true;
      } else {
        const sent = await bot.api.sendMessage(Number(amirChatId), amirCaption);
        sentMsgId = sent.message_id;
        isPhoto = false;
      }

      if (sentMsgId) {
        const incId = lateId.startsWith("inc_") && /^\d+$/.test(lateId.slice(4)) ? Number(lateId.slice(4)) : null;
        await prisma.$executeRawUnsafe(
          `INSERT INTO devices.late_arrival_messages ("lateId", "incidentId", "chatId", "messageId", "isPhoto")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ("chatId", "messageId") DO UPDATE SET "lateId" = EXCLUDED."lateId"`,
          lateId,
          incId,
          amirChatId,
          sentMsgId,
          isPhoto
        );
      }
    } catch (e) {
      console.error("[syncAmirConfirmedNotification] error:", (e as Error).message);
    }
  }
}

async function updateTelegramMessagesForLateId(
  bot: Bot,
  lateId: string,
  newCaption: string,
  kb?: InlineKeyboard
) {
  try {
    const msgs = await prisma.$queryRawUnsafe<
      Array<{ chatId: string; messageId: number; isPhoto: boolean }>
    >(
      `SELECT "chatId", "messageId", "isPhoto" FROM devices.late_arrival_messages WHERE "lateId" = $1`,
      lateId
    );
    for (const m of msgs) {
      if (AMIR_CHAT_IDS.includes(String(m.chatId))) continue;
      try {
        if (m.isPhoto) {
          await bot.api.editMessageCaption(Number(m.chatId), Number(m.messageId), {
            caption: newCaption,
            ...(kb ? { reply_markup: kb } : {}),
          });
        } else {
          await bot.api.editMessageText(Number(m.chatId), Number(m.messageId), newCaption, {
            ...(kb ? { reply_markup: kb } : {}),
          });
        }
      } catch {}
    }
  } catch {}
}

/**
 * Find the exact LateArrival row that a Telegram Reply points to, even if replied hours/days later or after other bot actions
 */
async function resolveLateArrivalFromReply(
  chatId: string,
  replyMsgId: number,
  repliedCaptionOrText: string,
  hasPhotoInReplied: boolean
) {
  // 1. Exact match in devices.late_arrival_messages by (chatId, messageId)
  const exactRows = await prisma.$queryRawUnsafe<Array<{ lateId: string }>>(
    `SELECT "lateId" FROM devices.late_arrival_messages WHERE "chatId" = $1 AND "messageId" = $2 LIMIT 1`,
    chatId,
    replyMsgId
  );
  if (exactRows[0]?.lateId) {
    const found = await prisma.lateArrival.findUnique({ where: { id: exactRows[0].lateId } });
    if (found) return found;
  }

  // 2. Match in devices.late_arrival_messages by messageId across any chat
  const anyChatRows = await prisma.$queryRawUnsafe<Array<{ lateId: string }>>(
    `SELECT "lateId" FROM devices.late_arrival_messages WHERE "messageId" = $1 ORDER BY id DESC LIMIT 1`,
    replyMsgId
  );
  if (anyChatRows[0]?.lateId) {
    const found = await prisma.lateArrival.findUnique({ where: { id: anyChatRows[0].lateId } });
    if (found) return found;
  }

  // 3. Direct promptMessageId match in devices.late_arrivals
  const directRow = await prisma.lateArrival.findFirst({
    where: { promptMessageId: replyMsgId },
  });
  if (directRow) return directRow;

  // 4. Match in GateLateIncident.telegramMessageId
  const incRows = await crmPrisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT id FROM "GateLateIncident" WHERE "telegramMessageId" = $1 LIMIT 1`,
    String(replyMsgId)
  );
  if (incRows[0]?.id) {
    const lateId = `inc_${incRows[0].id}`;
    const found = await prisma.lateArrival.findUnique({ where: { id: lateId } });
    if (found) return found;
  }

  // 5. Fallback for older messages (e.g. 4-photo media groups or messages sent to 2nd/3rd recipient where promptMessageId was offset)
  const looksLikeGateMessage =
    hasPhotoInReplied ||
    /(kirish eshigidan|kechki payt|kech qolgan|o'tkazib yuboril|tizim aniqladi|vaqti:)/i.test(repliedCaptionOrText);

  if (looksLikeGateMessage) {
    // Check if caption has exact timestamp "Vaqti: YYYY-MM-DD, soat HH:MM"
    const tsMatch = repliedCaptionOrText.match(/Vaqti:\s*(\d{4}-\d{2}-\d{2}),\s*soat\s*(\d{2}:\d{2})/i);
    if (tsMatch) {
      const [, datePart, timePart] = tsMatch;
      const byTimeRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM devices.late_arrivals
         WHERE TO_CHAR("occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') = $1
           AND TO_CHAR("occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'HH24:MI') = $2
         ORDER BY ABS(COALESCE("promptMessageId", $3) - $3) ASC, "occurredAt" DESC
         LIMIT 1`,
        datePart,
        timePart,
        replyMsgId
      );
      if (byTimeRows[0]?.id) {
        const found = await prisma.lateArrival.findUnique({ where: { id: byTimeRows[0].id } });
        if (found) return found;
      }
    }

    // Closest promptMessageId within [-6, +25]
    const nearRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM devices.late_arrivals
       WHERE "promptMessageId" IS NOT NULL
         AND $1 BETWEEN ("promptMessageId" - 6) AND ("promptMessageId" + 25)
       ORDER BY ABS("promptMessageId" - $1) ASC
       LIMIT 1`,
      replyMsgId
    );
    if (nearRows[0]?.id) {
      const found = await prisma.lateArrival.findUnique({ where: { id: nearRows[0].id } });
      if (found) return found;
    }
  }

  return null;
}

export interface NightArrivalInput {
  occurredAt: Date;
  attendanceLogId?: string;
  cardNumber?: number;
  studentName?: string | null;
  force?: boolean;
}

export async function onNightArrival(bot: Bot, input: NightArrivalInput): Promise<string | null> {
  const night = isNightTime(input.occurredAt);
  if (!input.force && !night) return null;
  const responsibles = await getResponsibles();
  if (responsibles.length === 0) {
    console.warn("[late] mas'ul belgilanmagan");
    return null;
  }
  if (
    input.attendanceLogId &&
    (await prisma.lateArrival.findUnique({ where: { attendanceLogId: input.attendanceLogId } }))
  ) {
    return null;
  }
  if (input.cardNumber != null) {
    const recent = await prisma.lateArrival.findFirst({
      where: {
        cardNumber: input.cardNumber,
        occurredAt: { gte: new Date(input.occurredAt.getTime() - LATE.dedupeSec * 1000) },
      },
    });
    if (recent) return null;
  }

  const row = await prisma.lateArrival.create({
    data: {
      occurredAt: input.occurredAt,
      source: LATE.deviceName,
      attendanceLogId: input.attendanceLogId,
      cardNumber: input.cardNumber,
      draftName: input.studentName ?? undefined,
      status: input.studentName ? "AWAITING_CONFIRM" : "AWAITING_NAME",
      responsibleTgId: responsibles[0]!.telegramId,
    },
  });

  const files = await captureBurst(row.id);
  await prisma.lateArrival.update({ where: { id: row.id }, data: { photoPaths: files } });

  const testPrefix = night ? "" : "#sinov\n";
  const headerLine = night
    ? "\u{1F6A8} Kechki payt kirish eshigidan talaba kirdi!"
    : "\u{1F6AA} Kirish eshigidan talaba kirdi (Sinov rejimi)";

  const candName = input.studentName?.trim() || null;
  const caption =
    `${testPrefix}${headerLine}\n` +
    `\u{1F552} Vaqti: ${fmtLocal(input.occurredAt)} (Istanbul)\n\n` +
    (candName
      ? `\u{1F916} Tizim aniqladi: ${candName}\n\u{23F3} Holat: Tasdiqlash kutilmoqda\n\n`
      : `\u{23F3} Holat: Tasdiqlash kutilmoqda\n\n`) +
    `\u{1F447} Amal tanlang:\n` +
    (candName ? `\u{2705} Rostdan kech qolgan bo'lsa ? "Tasdiqlash" ni bosing.\n` : "") +
    `\u{23ED} Shunchaki pastga tushgan / xodim bo'lsa ? "O'tkazib yuborish" ni bosing.\n` +
    `\u{270F}\u{FE0F} Ism-familiyani kiritish yoki to'g'rilash uchun ? shu xabarga Reply qilib Ism Familiyani yozing.`;

  const inlineKb = new InlineKeyboard();
  if (candName) {
    inlineKb.text(`\u{2705} Tasdiqlash: ${candName}`, `late:ok:${row.id}`).row();
  }
  inlineKb.text(`\u{23ED} O'tkazib yuborish (Kech qolmagan)`, `late:skip:${row.id}`);

  const seenChatIds = new Set<string>();
  let firstPromptMsgId: number | undefined;
  for (const resp of responsibles) {
    const tgIdStr = String(resp.telegramId || "").trim();
    if (!tgIdStr || seenChatIds.has(tgIdStr)) continue;
    seenChatIds.add(tgIdStr);
    const chatId = Number(tgIdStr);
    try {
      let sentMsgId: number | undefined;
      let isPhoto = false;
      if (files.length >= 1) {
        const sent = await bot.api.sendPhoto(chatId, new InputFile(files[0]!), {
          caption,
          reply_markup: inlineKb,
        });
        sentMsgId = sent.message_id;
        isPhoto = true;
      } else {
        const sent = await bot.api.sendMessage(chatId, caption, { reply_markup: inlineKb });
        sentMsgId = sent.message_id;
        isPhoto = false;
      }
      if (sentMsgId) {
        if (!firstPromptMsgId) firstPromptMsgId = sentMsgId;
        await prisma.$executeRawUnsafe(
          `INSERT INTO devices.late_arrival_messages ("lateId", "incidentId", "chatId", "messageId", "isPhoto")
           VALUES ($1, NULL, $2, $3, $4)
           ON CONFLICT ("chatId", "messageId") DO UPDATE SET "lateId" = EXCLUDED."lateId"`,
          row.id,
          tgIdStr,
          sentMsgId,
          isPhoto
        );
      }
    } catch (e) {
      console.error(`[late] mas'ulga (${resp.telegramId}) yuborib bo'lmadi:`, (e as Error).message);
    }
  }

  if (firstPromptMsgId) {
    await prisma.lateArrival.update({
      where: { id: row.id },
      data: { promptMessageId: firstPromptMsgId },
    });
  }

  return row.id;
}

export function startLatePoller(_bot: Bot) {}

export function registerLateArrivalFlow(bot: Bot) {
  // 1. Reply handler (works at ANY time, even after other bot actions!)
  bot.on("message:text", async (ctx, next) => {
    const rawMsg = ctx.message.text.trim();
    if (rawMsg.startsWith("/")) return next();

    const tgId = String(ctx.from.id);
    const { allowed, label: respLabel } = await isAuthorizedForLate(tgId);
    if (!allowed) return next();

    const repliedMsg = ctx.message.reply_to_message;
    let row = null;

    if (repliedMsg?.message_id) {
      const repliedCaptionOrText = (repliedMsg.caption || repliedMsg.text || "").trim();
      const hasPhoto = Boolean(repliedMsg.photo && repliedMsg.photo.length > 0);
      row = await resolveLateArrivalFromReply(
        String(ctx.chat.id),
        repliedMsg.message_id,
        repliedCaptionOrText,
        hasPhoto
      );
      // Save this (chatId, replyMsgId) mapping so future replies to the same message are instant
      if (row) {
        try {
          const incId =
            row.id.startsWith("inc_") && /^\d+$/.test(row.id.slice(4)) ? Number(row.id.slice(4)) : null;
          await prisma.$executeRawUnsafe(
            `INSERT INTO devices.late_arrival_messages ("lateId", "incidentId", "chatId", "messageId", "isPhoto")
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT ("chatId", "messageId") DO NOTHING`,
            row.id,
            incId,
            String(ctx.chat.id),
            repliedMsg.message_id,
            hasPhoto
          );
        } catch {}
      }
    }

    // If NOT a reply to a late arrival message, do not intercept menu buttons or expense messages!
    if (!row) {
      if (
        rawMsg.startsWith("\u2795") || rawMsg.startsWith("\u{1F4CA}") || rawMsg.startsWith("\u{1F4C2}") || rawMsg.startsWith("\u2753") ||
        rawMsg.startsWith("??") ||
        rawMsg.startsWith("??") ||
        rawMsg.startsWith("\u2795") || rawMsg.startsWith("\u{1F4CA}") || rawMsg.startsWith("\u{1F4C2}") || rawMsg.startsWith("\u2753") ||
        /^\?*\s*kamera!*$/i.test(rawMsg) ||
        rawMsg.toLowerCase().includes("kamera") ||
        /^(mening\s+id|my\s+id|id)$/i.test(rawMsg) ||
        /\d/.test(rawMsg)
      ) {
        return next();
      }
      // Only fall back to recent unconfirmed late arrival if no reply_to_message was used during night hours
      if (!repliedMsg && isNightTime(new Date())) {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        row = await prisma.lateArrival.findFirst({
          where: {
            status: { in: ["AWAITING_NAME", "AWAITING_CONFIRM"] },
            createdAt: { gte: fiveMinAgo },
          },
          orderBy: { createdAt: "desc" },
        });
      }
    }

    if (!row) return next();

    const rawText = rawMsg.replace(/\s+/g, " ").trim();
    const isSkipKeyword =
      /#sababli\b/i.test(rawText) ||
      /^(o'?tkazib\s*yubor|otkazib\s*yubor|kech\s*qolmagan|xodim|bekor)/i.test(rawText);

    if (isSkipKeyword) {
      await applyLateDecision(bot, row.id, "SKIP", null, row.draftName, tgId, respLabel);
      await ctx.reply(
        `\u{23ED} O'tkazib yuborildi (kech qolgan deb qayd qilinmadi).\n` +
          `\u{1F552} Vaqti: ${fmtLocal(row.occurredAt)} (Istanbul)\n` +
          `\u{1F46E} Belgiladi: ${respLabel}`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    const cleanName = rawText.replace(/#sababli\b/gi, "").trim();
    if (cleanName.length < 3) {
      await ctx.reply(
        "\u{270F}\u{FE0F} Iltimos, talabaning Ism va Familiyasini yozing (masalan: Abdulloh Bahromov).",
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    // Match student in CRM database (with typo & transliteration tolerance)
    const matchRes = await matchStudentInCrm(cleanName);

    if (matchRes.best) {
      const res = await applyLateDecision(
        bot,
        row.id,
        "CONFIRM",
        matchRes.best,
        cleanName,
        tgId,
        respLabel
      );
      const writtenDiff =
        normalizePersonName(matchRes.best.fullname) !== normalizePersonName(cleanName)
          ? ` (Bazadan topildi)`
          : "";
      await ctx.reply(
        `\u{1F534} Kech qolgan sifatida tasdiqlandi va bazaga yozildi!\n\n` +
          `\u{1F464} Talaba: ${matchRes.best.fullname}${writtenDiff}\n` +
          `\u{1F465} Guruh: ${matchRes.best.group}\n` +
          `\u{1F552} Kirgan vaqti: ${fmtLocal(row.occurredAt)} (Istanbul)\n` +
          `\u{2705} Tasdiqladi: ${respLabel}`,
        {
          reply_to_message_id: ctx.message.message_id,
          ...(res.kb ? { reply_markup: res.kb } : {}),
        }
      );
      return;
    }

    // If score was too low to auto-pick, offer top 3 closest students as 1-click buttons!
    const pickKb = new InlineKeyboard();
    for (const c of matchRes.candidates) {
      pickKb
        .text(`\u{1F464} ${c.student.fullname} (${c.student.group})`, `late:pick:${row.id}:${c.student.id}`)
        .row();
    }
    pickKb.text(`\u{23ED} O'tkazib yuborish (Kech qolmagan)`, `late:skip:${row.id}`);

    await ctx.reply(
      `\u{1F50D} "${cleanName}" bo'yicha bazadan eng yaqin talabalardan birini tanlang (yoki xabarga qaytadan Reply qilib yozing):`,
      {
        reply_to_message_id: ctx.message.message_id,
        reply_markup: pickKb,
      }
    );
  });

  // 2. Callback button handler:
  // - late:ok:<id> -> Confirm AI-detected student as late
  // - late:skip:<id> / late:no:<id> / late:excused:<id> -> Skip (not late)
  // - late:pick:<id>:<studentId> -> Confirm specific student from candidate buttons
  bot.callbackQuery(/^late:(ok|skip|excused|redo|no|pick):([^:]+)(?::(\d+))?$/, async (ctx) => {
    const [, action, id, pickStudentIdStr] = ctx.match as unknown as [
      string,
      string,
      string,
      string | undefined
    ];
    const tgId = String(ctx.from.id);
    const { allowed, label: respLabel } = await isAuthorizedForLate(tgId);
    if (!allowed) {
      await ctx.answerCallbackQuery({ text: "Ruxsat yo'q", show_alert: true });
      return;
    }

    // Ensure the clicked message is recorded in late_arrival_messages so caption updates work
    if (ctx.callbackQuery.message && ctx.chat) {
      try {
        const incId = id.startsWith("inc_") && /^\d+$/.test(id.slice(4)) ? Number(id.slice(4)) : null;
        const isPhoto = Boolean((ctx.callbackQuery.message as any).photo);
        await prisma.$executeRawUnsafe(
          `INSERT INTO devices.late_arrival_messages ("lateId", "incidentId", "chatId", "messageId", "isPhoto")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ("chatId", "messageId") DO NOTHING`,
          id,
          incId,
          String(ctx.chat.id),
          ctx.callbackQuery.message.message_id,
          isPhoto
        );
      } catch {}
    }

    const row = await prisma.lateArrival.findUnique({ where: { id } });
    if (!row) {
      await ctx.answerCallbackQuery({ text: "Yozuv topilmadi", show_alert: true });
      return;
    }

    if (action === "skip" || action === "no" || action === "excused") {
      await applyLateDecision(bot, id, "SKIP", null, row.draftName, tgId, respLabel);
      await ctx.answerCallbackQuery({ text: "\u23ED O'tkazib yuborildi (kech qolgan emas)" });
      return;
    }

    if (action === "redo") {
      await ctx.answerCallbackQuery({
        text: "\u270F\uFE0F Rasmga Reply qilib talabaning Ism va Familiyasini yozib yuboring",
        show_alert: true,
      });
      return;
    }

    if (action === "pick" && pickStudentIdStr) {
      const st = await getCrmStudentById(Number(pickStudentIdStr));
      if (!st) {
        await ctx.answerCallbackQuery({ text: "Talaba topilmadi", show_alert: true });
        return;
      }
      const res = await applyLateDecision(bot, id, "CONFIRM", st, st.fullname, tgId, respLabel);
      await ctx.answerCallbackQuery({ text: `?? Tasdiqlandi: ${st.fullname}` });
      try {
        await ctx.editMessageText(
          `\u{1F534} Kech qolgan sifatida tasdiqlandi va bazaga yozildi!\n\n` +
            `\u{1F464} Talaba: ${st.fullname}\n` +
            `\u{1F465} Guruh: ${st.group}\n` +
            `\u{1F552} Kirgan vaqti: ${fmtLocal(row.occurredAt)} (Istanbul)\n` +
            `\u{2705} Tasdiqladi: ${respLabel}`,
          res.kb ? { reply_markup: res.kb } : undefined
        );
      } catch {}
      return;
    }

    // action === "ok" (Confirm AI-detected student)
    let matchedStudent: CrmStudentRow | null = null;
    if (row.studentId && /^\d+$/.test(String(row.studentId))) {
      matchedStudent = await getCrmStudentById(Number(row.studentId));
    }
    if (!matchedStudent && id.startsWith("inc_") && /^\d+$/.test(id.slice(4))) {
      const incId = Number(id.slice(4));
      const incRows = await crmPrisma.$queryRawUnsafe<
        Array<{ studentId: number | null; studentName: string | null }>
      >(`SELECT "studentId", "studentName" FROM "GateLateIncident" WHERE id = $1 LIMIT 1`, incId);
      if (incRows[0]?.studentId) {
        matchedStudent = await getCrmStudentById(Number(incRows[0].studentId));
      } else if (incRows[0]?.studentName) {
        const m = await matchStudentInCrm(incRows[0].studentName);
        matchedStudent = m.best;
      }
    }
    if (!matchedStudent && (row.draftName || row.fullName)) {
      const m = await matchStudentInCrm(row.draftName || row.fullName || "");
      matchedStudent = m.best;
    }

    if (!matchedStudent && !row.draftName && !row.fullName) {
      await ctx.answerCallbackQuery({
        text: "\u270F\uFE0F Tizim ismni aniqlamagan. Shu xabarga Reply qilib talabaning Ism Familiyasini yozing!",
        show_alert: true,
      });
      return;
    }

    await applyLateDecision(
      bot,
      id,
      "CONFIRM",
      matchedStudent,
      matchedStudent?.fullname || row.draftName || row.fullName,
      tgId,
      respLabel
    );
    await ctx.answerCallbackQuery({
      text: `?? Kech qolgan deb tasdiqlandi: ${matchedStudent?.fullname || row.draftName || row.fullName}`,
    });
  });
}
