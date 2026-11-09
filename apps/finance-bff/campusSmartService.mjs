import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const execFileAsync = promisify(execFile);
const _apiRequire = createRequire("/srv/data/apps/mezana-platform/apps/api/package.json");
const { Pool: PgPool, types: pgTypes } = _apiRequire("pg");
const ZKLibTCP = _apiRequire("zklib-js/zklibtcp.js");

// Ensure BIGINT (OID 20) and NUMERIC (OID 1700) return JS numbers just like json_agg
pgTypes.setTypeParser(20, (val) => (val === null ? null : Number(val)));
pgTypes.setTypeParser(1700, (val) => (val === null ? null : Number(val)));

const _poolsByUrl = new Map();

export function createPsqlPool(dbUrl) {
  const cleanUrl = (dbUrl || "").split("?")[0].replace("host.docker.internal", "127.0.0.1");
  if (_poolsByUrl.has(cleanUrl)) {
    return _poolsByUrl.get(cleanUrl);
  }
  const pgPoolInstance = new PgPool({
    connectionString: cleanUrl,
    max: 12,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  pgPoolInstance.on("error", (err) => {
    console.error("[pgPool background error]:", err.message);
  });
  const wrapper = {
    async query(sql, params) {
      const cleanSql = String(sql || "").trim().replace(/;+\s*$/, "");
      const res =
        Array.isArray(params) && params.length > 0
          ? await pgPoolInstance.query(cleanSql, params)
          : await pgPoolInstance.query(cleanSql);
      const rows = Array.isArray(res) ? res[res.length - 1]?.rows || [] : res.rows || [];
      return { rows, rowCount: res.rowCount || 0 };
    },
    rawPool: pgPoolInstance,
  };
  _poolsByUrl.set(cleanUrl, wrapper);
  return wrapper;
}

import fs from "node:fs";
import path from "node:path";

const GATE_UPLOAD_DIR = "/srv/data/apps/mezana-platform/apps/finance/dist/uploads/gate";
const BOT_LATE_PHOTOS_DIR = "/srv/data/apps/mezana-platform/apps/telegram-bot/late-photos";
const GO2RTC_FRAME_URLS = [
  "http://127.0.0.1:1984/api/frame.jpeg?src=ip34_c01_hd",
  "http://127.0.0.1:1984/api/frame.jpeg?src=ip34_c01",
];
function _readLocalEnv(fp) {
  const out = {};
  try {
    for (const l of fs.readFileSync(fp, "utf8").split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}
const _localEnv = {
  ..._readLocalEnv("/srv/data/apps/mezana-platform/.env.platform.local"),
  ..._readLocalEnv("/srv/data/apps/mezana-platform/apps/finance-bff/.env"),
};
for (const [k, v] of Object.entries(_localEnv)) {
  if (!process.env[k] && v !== undefined && v !== "") process.env[k] = v;
}
const ACTIVE_BOT_TOKEN = process.env.GATE_TELEGRAM_BOT_TOKEN || "";
const PLATFORM_DB_URL = process.env.PLATFORM_DB_URL || process.env.DATABASE_URL || "";
if (!PLATFORM_DB_URL) {
  throw new Error("XATO: PLATFORM_DB_URL (yoki DATABASE_URL) muhit o'zgaruvchisi topilmadi! (.env faylni tekshiring)");
}

export const platformPool = createPsqlPool(PLATFORM_DB_URL);

try {
  fs.mkdirSync(GATE_UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(BOT_LATE_PHOTOS_DIR, { recursive: true });
} catch {}

export function parseDbUtcDate(val) {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  const s = String(val).trim().replace(" ", "T");
  if (s.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  return new Date(s + "Z");
}

export function getIstanbulParts(date = new Date()) {
  date = parseDbUtcDate(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const hour = Number(map.hour === "24" ? "0" : map.hour);
  const minute = Number(map.minute);
  const second = Number(map.second || 0);
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const monthStr = `${map.year}-${map.month}`;
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const timeSecStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute,
    second,
    timeInMinutes: hour * 60 + minute,
    dateStr,
    monthStr,
    timeStr,
    timeSecStr,
    startOfDayUtc: new Date(`${dateStr}T00:00:00.000+03:00`),
    endOfDayUtc: new Date(`${dateStr}T23:59:59.999+03:00`),
  };
}

export async function getBotContacts() {
  try {
    const res = await platformPool.query(
      `SELECT id, "telegramId", username, "firstName", "lastName", "fullName", "awaitingName", "isLateResponsible",
              TO_CHAR("lastStartAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') AS "lastStartIstanbul"
       FROM identity.telegram_contacts
       ORDER BY "isLateResponsible" DESC, "lastStartAt" DESC`
    );
    return res.rows;
  } catch (e) {
    console.error("[getBotContacts] error:", e.message);
    return [];
  }
}

export async function toggleBotRecipient(telegramId, isLateResponsible) {
  await platformPool.query(
    `UPDATE identity.telegram_contacts
     SET "isLateResponsible" = $1, "updatedAt" = NOW()
     WHERE "telegramId" = $2`,
    [Boolean(isLateResponsible), String(telegramId)]
  );
  return getBotContacts();
}

/**
 * 7 kundan oshgan kirish eshigi rasmlarini avtomatik tozalash
 * ("Bazada bu rasmlar bir haftadan ko'p saqlanmaydi")
 */
export async function cleanupOldGatePhotos(pgPool) {
  try {
    const oldRes = await pgPool.query(
      `SELECT id, photos FROM "GateLateIncident"
       WHERE "photosCleaned" = false
         AND "capturedAt" < (NOW() - INTERVAL '7 days')`
    );
    let cleanedCount = 0;
    for (const row of oldRes.rows) {
      const photos = Array.isArray(row.photos) ? row.photos : [];
      for (const relUrl of photos) {
        if (typeof relUrl === "string" && relUrl.startsWith("/uploads/gate/")) {
          const fileName = path.basename(relUrl);
          const fullPath = path.join(GATE_UPLOAD_DIR, fileName);
          try {
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
          } catch {}
        }
      }
      await pgPool.query(
        `UPDATE "GateLateIncident"
         SET "photosCleaned" = true, "photos" = '[]'::jsonb
         WHERE id = $1`,
        [row.id]
      );
      cleanedCount++;
    }
    return cleanedCount;
  } catch (err) {
    console.error("[cleanupOldGatePhotos] error:", err.message);
    return 0;
  }
}

async function grabGateCameraFrame() {
  for (const url of GO2RTC_FRAME_URLS) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        return Buffer.from(await resp.arrayBuffer());
      }
    } catch {}
  }
  return null;
}

/**
 * Kirish eshigi kamerasidan (ip34_c01_hd / ip34_c01) 3 soniya davomida soniyasiga 2 martadan = 6 ta rasm olish
 * va botda ism-familiyasini yozgan mas'ul xodimlarga yuborish
 */
export async function captureSixGatePhotos(pgPool, { cardId = null, note = null, customTimestamp = null, preCapturedFiles = null, recognition = null } = {}) {
  fs.mkdirSync(GATE_UPLOAD_DIR, { recursive: true });
  const batchId = Date.now();
  const photoUrls = [];
  const rawBuffers = [];
  const savedDiskPaths = [];

  if (Array.isArray(preCapturedFiles) && preCapturedFiles.length > 0) {
    for (let i = 0; i < preCapturedFiles.length; i++) {
      const srcPath = preCapturedFiles[i];
      if (fs.existsSync(srcPath)) {
        const buf = fs.readFileSync(srcPath);
        const fileName = path.basename(srcPath);
        const destPath = path.join(GATE_UPLOAD_DIR, fileName);
        if (srcPath !== destPath) fs.writeFileSync(destPath, buf);
        photoUrls.push(`/uploads/gate/${fileName}`);
        rawBuffers.push({ idx: i + 1, fileName, buf });
        savedDiskPaths.push(destPath);
      }
    }
  } else {
    for (let i = 1; i <= 4; i++) {
      const startMs = Date.now();
      try {
        const buf = await grabGateCameraFrame();
        if (buf) {
          const fileName = `gate_${batchId}_${i}.jpg`;
          const destPath = path.join(GATE_UPLOAD_DIR, fileName);
          fs.writeFileSync(destPath, buf);
          photoUrls.push(`/uploads/gate/${fileName}`);
          rawBuffers.push({ idx: i, fileName, buf });
          savedDiskPaths.push(destPath);
        }
      } catch (e) {
        console.error(`[captureSixGatePhotos] frame ${i} error:`, e.message);
      }
      if (i < 4) {
        const elapsed = Date.now() - startMs;
        const waitMs = Math.max(50, 1000 - elapsed);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  let faceRec = recognition;
  if (!faceRec && savedDiskPaths.length > 0) {
    try {
      const { stdout } = await execFileAsync(
        "/srv/data/apps/mezana-platform/apps/finance-bff/.venv/bin/python",
        ["/srv/data/apps/mezana-platform/apps/finance-bff/face_recognizer.py", ...savedDiskPaths],
        { timeout: 15000 }
      );
      const lines = String(stdout || "").trim().split("\n");
      const lastLine = lines[lines.length - 1] || "";
      if (lastLine.startsWith("{")) {
        faceRec = JSON.parse(lastLine);
      }
    } catch (e) {
      console.error("[captureSixGatePhotos face_recognizer] error:", e.message);
    }
  }

  const capturedAt = customTimestamp ? new Date(customTimestamp) : new Date();
  const bestCand =
    faceRec?.studentId && faceRec?.studentName
      ? faceRec
      : Array.isArray(faceRec?.candidates) && faceRec.candidates[0]?.studentId
        ? faceRec.candidates[0]
        : null;
  const initStatus = "PENDING";
  const initStudentId = bestCand?.studentId ? Number(bestCand.studentId) : null;
  const initStudentName = bestCand?.studentName ? String(bestCand.studentName) : null;
  const initStudentGroup = bestCand?.studentGroup ? String(bestCand.studentGroup || "Guruhsiz") : null;
  const initConfirmedBy = null;
  const initConfirmedAt = null;
  const initNote = bestCand
    ? `AI aniqladi: ${bestCand.studentName} (${bestCand.similarityPct || 80}%) ? Tasdiqlash kutilmoqda`
    : (note || "Soat 22:00 - 05:30 oralig'ida kirish eshigida harakat aniqlandi ? Tasdiqlash kutilmoqda");

  const ins = await pgPool.query(
    `INSERT INTO "GateLateIncident"
      ("capturedAt", "status", "studentId", "studentName", "studentGroup", "confirmedBy", "confirmedAt", "cardId", "cameraName", "cameraStream", "photos", "note")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Kirish eshigi', 'ip34_c01_hd', $9::jsonb, $10)
     RETURNING *`,
    [
      capturedAt,
      initStatus,
      initStudentId,
      initStudentName,
      initStudentGroup,
      initConfirmedBy,
      initConfirmedAt,
      cardId,
      JSON.stringify(photoUrls),
      initNote,
    ]
  );

  const incident = ins.rows[0];
  const lateId = `inc_${incident.id}`;

  // Save copies for telegram-bot late_arrivals table
  const botCaseDir = path.join(BOT_LATE_PHOTOS_DIR, lateId);
  fs.mkdirSync(botCaseDir, { recursive: true });
  const botPhotoPaths = [];
  for (const item of rawBuffers) {
    const p = path.join(botCaseDir, `${item.idx}.jpg`);
    try {
      fs.writeFileSync(p, item.buf);
      botPhotoPaths.push(p);
    } catch {}
  }

  // Send to responsible contacts on Telegram and record in devices.late_arrivals
  let tgResult = { sent: false, sentCount: 0, recipients: [] };
  try {
    tgResult = await sendGateIncidentToTelegram(pgPool, incident, lateId, botPhotoPaths, faceRec);
  } catch (e) {
    console.error("[sendGateIncidentToTelegram] error:", e.message);
  }

  const updatedRes = await pgPool.query(`SELECT * FROM "GateLateIncident" WHERE id = $1`, [incident.id]);
  return {
    ...(updatedRes.rows[0] || incident),
    recognition: faceRec || null,
    telegramResult: tgResult,
  };
}

export async function getBotConfig(pgPool) {
  try {
    const res = await pgPool.query(`SELECT "value" FROM "CampusDeviceConfig" WHERE "key" = 'gate_telegram_bot'`);
    const val = res.rows[0]?.value || {};
    const contacts = await getBotContacts();
    const activeContacts = contacts.filter((c) => c.isLateResponsible);
    const names = activeContacts.map((c) => c.fullName || c.firstName || c.username || c.telegramId).join(", ");
    return {
      botToken: val.botToken || ACTIVE_BOT_TOKEN,
      botUsername: "@mezanatizimbot",
      chatId: val.chatId || (activeContacts[0]?.telegramId ?? ""),
      activeStart: val.activeStart || "22:00",
      activeEnd: val.activeEnd || "05:30",
      responsiblePerson: names || val.responsiblePerson || "Mas'ul tanlanmagan",
    };
  } catch {
    return {
      botToken: ACTIVE_BOT_TOKEN,
      botUsername: "@mezanatizimbot",
      chatId: "",
      activeStart: "22:00",
      activeEnd: "05:30",
      responsiblePerson: "Navbatchi tarbiyachi",
    };
  }
}

export async function sendGateIncidentToTelegram(pgPool, incident, lateId = null, botPhotoPaths = [], faceRec = null) {
  const cfg = await getBotConfig(pgPool);
  const botToken = cfg.botToken || ACTIVE_BOT_TOKEN;
  const contacts = await getBotContacts();
  let recipients = contacts.filter((c) => c.isLateResponsible);
  if (recipients.length === 0) {
    recipients = contacts.filter((c) => Boolean(c.fullName));
  }
  // Deduplicate recipients by telegramId and put Abu Bakr Idora (8142118072) first
  const seenTg = new Set();
  recipients = recipients.filter((r) => {
    if (!r.telegramId || seenTg.has(String(r.telegramId))) return false;
    seenTg.add(String(r.telegramId));
    return true;
  });
  recipients.sort((a, b) => {
    if (String(a.telegramId) === "8142118072") return -1;
    if (String(b.telegramId) === "8142118072") return 1;
    return 0;
  });

  if (!botToken || recipients.length === 0) {
    return { sent: false, sentCount: 0, recipients: [] };
  }

  const targetLateId = lateId || `inc_${incident.id}`;
  const capturedDateUtc = parseDbUtcDate(incident.capturedAt);
  const ist = getIstanbulParts(capturedDateUtc);

  const bestCand =
    faceRec?.studentId && faceRec?.studentName
      ? faceRec
      : Array.isArray(faceRec?.candidates) && faceRec.candidates[0]?.studentId
        ? faceRec.candidates[0]
        : incident?.studentId && incident?.studentName
          ? {
              studentId: incident.studentId,
              studentName: incident.studentName,
              studentGroup: incident.studentGroup || "Guruhsiz",
              similarityPct: faceRec?.similarityPct || null,
            }
          : null;

  const pgArrLiteral = "{" + botPhotoPaths.map((p) => `"${String(p).replace(/"/g, '\"')}"`).join(",") + "}";
  try {
    await platformPool.query(
      `INSERT INTO devices.late_arrivals
        (id, "occurredAt", source, "cardNumber", status, "draftName", "fullName", "studentId", "confirmedAt", "photoPaths", "responsibleTgId", "createdAt", "updatedAt")
       VALUES ($1, $2, 'kirish', $3, $4, $5, NULL, $6, NULL, $7::text[], $8, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         "draftName" = COALESCE(EXCLUDED."draftName", devices.late_arrivals."draftName"),
         "studentId" = COALESCE(EXCLUDED."studentId", devices.late_arrivals."studentId"),
         "updatedAt" = NOW()`,
      [
        targetLateId,
        capturedDateUtc,
        incident.cardId && /^\d+$/.test(String(incident.cardId)) ? Number(incident.cardId) : null,
        bestCand ? "AWAITING_CONFIRM" : "AWAITING_NAME",
        bestCand ? String(bestCand.studentName) : null,
        bestCand?.studentId ? String(bestCand.studentId) : null,
        pgArrLiteral,
        recipients[0].telegramId,
      ]
    );
  } catch (e) {
    console.error("[late_arrivals insert] error:", e.message);
  }

  const photos = Array.isArray(incident.photos) ? incident.photos : [];
  const isNight = ist.hour >= 22 || ist.hour < 5 || (ist.hour === 5 && ist.minute <= 30);
  const testPrefix = isNight ? "" : "#sinov\n";
  const headerLine = isNight
    ? "\u{1F6A8} Kechki payt kirish eshigidan talaba kirdi!"
    : "\u{1F6AA} Kirish eshigidan talaba kirdi (Sinov rejimi)";

  const candidatesList = Array.isArray(faceRec?.candidates) ? faceRec.candidates : [];
  const candidatesLine =
    candidatesList.length > 1
      ? `\u{1F4A1} Yaqin nomzodlar: ` +
        candidatesList
          .slice(0, 3)
          .map((c, idx) => `${idx + 1}) ${c.studentName} (${c.similarityPct}%)`)
          .join(", ") +
        "\n"
      : "";

  let caption = "";
  let replyMarkup = null;

  if (bestCand) {
    const pctStr = bestCand.similarityPct ? ` (${bestCand.similarityPct}%)` : "";
    caption =
      `${testPrefix}${headerLine}\n` +
      `\u{1F552} Vaqti: ${ist.dateStr}, soat ${ist.timeSecStr} (Istanbul)\n\n` +
      `\u{1F916} Tizim aniqladi: ${bestCand.studentName}${pctStr}\n` +
      `\u{1F465} Guruh: ${bestCand.studentGroup || "Guruhsiz"}\n` +
      `\u{23F3} Holat: Tasdiqlash kutilmoqda\n` +
      candidatesLine +
      `\n\u{1F447} Amal tanlang:\n` +
      `\u{2705} Rostdan kech qolgan bo'lsa ? "Tasdiqlash" tugmasini bosing.\n` +
      `\u{23ED} Shunchaki pastga tushgan / xodim bo'lsa ? "O'tkazib yuborish" ni bosing.\n` +
      `\u{270F}\u{FE0F} Ism-familiya xato bo'lsa ? shu xabarga Reply qilib to'g'ri Ism Familiyani yozing.`;
    replyMarkup = {
      inline_keyboard: [
        [{ text: `\u{2705} Tasdiqlash: ${bestCand.studentName}`, callback_data: `late:ok:${targetLateId}` }],
        [{ text: `\u{23ED} O'tkazib yuborish (Kech qolmagan)`, callback_data: `late:skip:${targetLateId}` }],
      ],
    };
  } else {
    caption =
      `${testPrefix}${headerLine}\n` +
      `\u{1F552} Vaqti: ${ist.dateStr}, soat ${ist.timeSecStr} (Istanbul)\n\n` +
      `\u{1F916} Tizim yuzni aniq taniy olmadi.\n` +
      `\u{23F3} Holat: Tasdiqlash kutilmoqda\n\n` +
      `\u{1F447} Amal tanlang:\n` +
      `\u{270F}\u{FE0F} Kech qolgan talaba bo'lsa ? shu xabarga Reply qilib Ism Familiyasini yozing.\n` +
      `\u{23ED} Shunchaki pastga tushgan / xodim bo'lsa ? "O'tkazib yuborish" ni bosing.`;
    replyMarkup = {
      inline_keyboard: [
        [{ text: `\u{23ED} O'tkazib yuborish (Kech qolmagan)`, callback_data: `late:skip:${targetLateId}` }],
      ],
    };
  }

  // Pick sharpest photo from photos list so sendPhoto always attaches the inline buttons right below the photo
  const validPhotoPaths = [];
  for (let i = 0; i < photos.length; i++) {
    const fileName = path.basename(photos[i]);
    const fullPath = path.join(GATE_UPLOAD_DIR, fileName);
    if (fs.existsSync(fullPath)) {
      validPhotoPaths.push({ fileName, fullPath });
    }
  }
  const bestFrameIdx =
    typeof faceRec?.bestFrameIdx === "number" &&
    faceRec.bestFrameIdx >= 0 &&
    faceRec.bestFrameIdx < validPhotoPaths.length
      ? faceRec.bestFrameIdx
      : 0;
  const chosenPhoto = validPhotoPaths[bestFrameIdx] || validPhotoPaths[0] || null;

  let firstMsgId = null;
  const sentRecipients = [];

  for (const r of recipients) {
    try {
      let sentMsgId = null;
      let sentIsPhoto = false;
      if (chosenPhoto) {
        const singleForm = new FormData();
        singleForm.append("chat_id", String(r.telegramId));
        singleForm.append("caption", caption);
        singleForm.append("reply_markup", JSON.stringify(replyMarkup));
        singleForm.append(
          "photo",
          new Blob([fs.readFileSync(chosenPhoto.fullPath)], { type: "image/jpeg" }),
          chosenPhoto.fileName
        );
        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: "POST",
          body: singleForm,
        });
        const tgJson = await tgRes.json();
        if (tgJson.ok && tgJson.result?.message_id) {
          sentMsgId = Number(tgJson.result.message_id);
          sentIsPhoto = true;
        }
      } else {
        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: String(r.telegramId),
            text: caption,
            reply_markup: replyMarkup,
          }),
        });
        const tgJson = await tgRes.json();
        if (tgJson.ok && tgJson.result?.message_id) {
          sentMsgId = Number(tgJson.result.message_id);
          sentIsPhoto = false;
        }
      }

      if (sentMsgId) {
        if (!firstMsgId) firstMsgId = sentMsgId;
        sentRecipients.push(r.fullName || r.firstName || r.telegramId);
        try {
          await platformPool.query(
            `INSERT INTO devices.late_arrival_messages ("lateId", "incidentId", "chatId", "messageId", "isPhoto")
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT ("chatId", "messageId") DO UPDATE SET "lateId" = EXCLUDED."lateId", "incidentId" = EXCLUDED."incidentId"`,
            [targetLateId, Number(incident.id) || null, String(r.telegramId), sentMsgId, sentIsPhoto]
          );
        } catch (dbErr) {
          console.error("[late_arrival_messages insert] error:", dbErr.message);
        }
      }
    } catch (err) {
      console.error(`[sendGateIncidentToTelegram] failed for ${r.telegramId}:`, err.message);
    }
  }

  if (firstMsgId) {
    const noteText = bestCand
      ? `AI aniqladi (${bestCand.similarityPct || 80}%): ${bestCand.studentName} | Tasdiqlash kutilmoqda (${sentRecipients.join(", ")})`
      : `Tasdiqlash kutilmoqda (${sentRecipients.join(", ")})`;
    await pgPool.query(
      `UPDATE "GateLateIncident"
       SET "telegramSent" = true,
           "telegramMessageId" = $1,
           "note" = $2
       WHERE id = $3`,
      [String(firstMsgId), noteText, incident.id]
    );
    try {
      await platformPool.query(
        `UPDATE devices.late_arrivals SET "promptMessageId" = $1 WHERE id = $2`,
        [Number(firstMsgId), targetLateId]
      );
    } catch {}
    return { sent: true, sentCount: sentRecipients.length, recipients: sentRecipients };
  }
  return { sent: false, sentCount: 0, recipients: [] };
}

/**
 * mezana-telegram-bot.service orqali mas'ullar tasdiqlagan (devices.late_arrivals) yozuvlarni
 * GateLateIncident bilan real vaqtda sinxronlash (getUpdates konflikti bo'lmasligi uchun DB orqali)
 */
export async function pollGateTelegramReplies(pgPool) {
  try {
    const res = await platformPool.query(
      `SELECT la.id, la."occurredAt", la."cardNumber", la.status, la."draftName", la."fullName",
              la."photoPaths", la."responsibleTgId", la."confirmedAt",
              tc."fullName" AS "responsibleName", tc.username AS "responsibleUsername"
       FROM devices.late_arrivals la
       LEFT JOIN identity.telegram_contacts tc ON tc."telegramId" = la."responsibleTgId"
       ORDER BY la."createdAt" DESC
       LIMIT 100`
    );

    const incIds = res.rows
      .filter((r) => String(r.id).startsWith("inc_"))
      .map((r) => Number(String(r.id).slice(4)))
      .filter((n) => Number.isFinite(n));
    if (incIds.length === 0) return;

    const allCurRes = await pgPool.query(
      `SELECT id, status, "studentName", "confirmedBy", note FROM "GateLateIncident" WHERE id IN (${incIds.join(",")})`
    );
    const curMap = new Map(allCurRes.rows.map((r) => [Number(r.id), r]));

    for (const row of res.rows) {
      if (String(row.id).startsWith("inc_")) {
        const incId = Number(String(row.id).slice(4));
        if (!Number.isFinite(incId)) continue;

        const cur = curMap.get(incId);
        if (!cur) continue;

        const respLabel = row.responsibleName || row.responsibleUsername || row.responsibleTgId || "Mas'ul";
        const queryName = (row.fullName || row.draftName || "").trim();
        const isAiConfirmed = String(cur.confirmedBy || "").startsWith("AI FaceID");
        const nameChangedByHuman = Boolean(queryName && cur.studentName !== queryName);

        if (
          (row.status === "CONFIRMED" || row.status === "EXCUSED") &&
          (cur.status !== row.status || (isAiConfirmed && nameChangedByHuman))
        ) {
          const isExcused = row.status === "EXCUSED" || /#sababli/i.test(String(row.fullName || ""));
          if (!queryName) continue;
          const stRes = await pgPool.query(
            `SELECT s.id, s.fullname, COALESCE(g.name, 'Guruhsiz') AS "group"
             FROM "Student" s
             LEFT JOIN "Group" g ON g.id = s."groupId"
             WHERE s."isDeleted" = false AND s."isArchived" = false AND s.fullname ILIKE $1
             ORDER BY CASE WHEN LOWER(s.fullname) = LOWER($2) THEN 0 ELSE 1 END, s.id ASC
             LIMIT 1`,
            [`%${queryName}%`, queryName]
          );
          const matched = stRes.rows[0] || null;
          const finalName = matched ? matched.fullname : queryName;
          const finalGroup = matched ? matched.group : "Guruhsiz";

          await pgPool.query(
            `UPDATE "GateLateIncident"
             SET "status" = $1,
                 "studentId" = $2,
                 "studentName" = $3,
                 "studentGroup" = $4,
                 "confirmedBy" = $5,
                 "confirmedAt" = COALESCE($6, NOW()),
                 "note" = $7
             WHERE id = $8`,
            [
              isExcused ? "EXCUSED" : "CONFIRMED",
              matched?.id || null,
              finalName,
              finalGroup,
              `Telegram (${respLabel})`,
              row.confirmedAt ? new Date(row.confirmedAt) : new Date(),
              isExcused
                ? `#sababli — Telegram orqali ${respLabel} tomonidan sababli (qizilga tushmaydi) deb belgilandi`
                : `Telegram bot orqali ${respLabel} tomonidan tasdiqlandi`,
              incId,
            ]
          );
        } else if (row.status === "REJECTED" && (cur.status === "PENDING" || isAiConfirmed)) {
          await pgPool.query(
            `UPDATE "GateLateIncident"
             SET "status" = 'DISMISSED',
                 "confirmedBy" = $1,
                 "note" = $2
             WHERE id = $3`,
            [`Telegram (${respLabel})`, `Telegram botda "${respLabel}" tomonidan kech kelgan emas deb belgilandi`, incId]
          );
        } else if (row.status === "AWAITING_CONFIRM" && row.draftName && (cur.status === "PENDING" || isAiConfirmed)) {
          const draftNote = `Telegramda ism yozildi ("${row.draftName}") — ${respLabel} tasdiqlashi kutilmoqda`;
          if (cur.note !== draftNote) {
            await pgPool.query(
              `UPDATE "GateLateIncident" SET "studentName" = $1, "note" = $2 WHERE id = $3`,
              [row.draftName, draftNote, incId]
            );
          }
        }
      }
    }
  } catch (e) {
    console.error("[pollGateTelegramReplies sync] error:", e.message);
  }
}

export async function buildCampusSmartAnalytics(pgPool, { date: reqDate, month: reqMonth } = {}) {
  await cleanupOldGatePhotos(pgPool);
  await pollGateTelegramReplies(pgPool);

  // 1. Active students
  const stRes = await pgPool.query(
    `SELECT s.id, s.fullname, COALESCE(g.name, 'Guruhsiz') AS "group", COALESCE(s."roomNumber", '—') AS room, s.phone, s."profilePicture" AS photo,
            sc."cardId", sc."cardNumber"
     FROM "Student" s
     LEFT JOIN "Group" g ON g.id = s."groupId"
     LEFT JOIN "StudentCard" sc ON sc."studentId" = s.id AND sc."isActive" = true
     WHERE s."isActive" = true AND s."isDeleted" = false AND s."isArchived" = false
     ORDER BY s.fullname ASC`
  );
  const activeStudents = stRes.rows;
  const totalStudents = Math.max(1, activeStudents.length);

  // 2. Available dates in MealRecord / PrayerRecord
  const datesRes = await pgPool.query(
    `SELECT DISTINCT TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS d
     FROM "MealRecord"
     ORDER BY d DESC`
  );
  const availableDates = datesRes.rows.map((r) => r.d).filter(Boolean);
  const todayIst = getIstanbulParts(new Date()).dateStr;
  const currentMonthIst = todayIst.slice(0, 7);

  const latestActiveDate = availableDates[0] || todayIst;
  const selectedDate = reqDate || latestActiveDate;
  const selectedMonth = reqMonth || selectedDate.slice(0, 7) || currentMonthIst;

  const availableMonths = Array.from(
    new Set([currentMonthIst, ...availableDates.map((d) => d.slice(0, 7))])
  ).sort().reverse();

  // Days in selectedMonth
  const [mYear, mMonth] = selectedMonth.split("-").map(Number);
  const daysInMonth = new Date(mYear, mMonth, 0).getDate();

  // 3. Query all MealRecords for selectedMonth AND 7-day window around selectedDate
  const mealRes = await pgPool.query(
    `SELECT
       id,
       "studentId",
       "studentName",
       "cardId",
       "mealType"::text AS "mealType",
       "timestamp",
       TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS d,
       TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'HH24:MI') AS t,
       EXTRACT(HOUR FROM ("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul'))::int AS hr
     FROM "MealRecord"
     WHERE TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM') = $1
        OR (
          ("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date >= ($2::date - INTERVAL '7 days')
          AND ("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date <= $2::date
        )
     ORDER BY "timestamp" ASC`,
    [selectedMonth, selectedDate]
  );

  // Deduplicate by (studentId, d, mealType) just in case
  const seenMealKey = new Set();
  const cleanMeals = [];
  for (const r of mealRes.rows) {
    const key = `${r.studentId}_${r.d}_${r.mealType}`;
    if (seenMealKey.has(key)) continue;
    seenMealKey.add(key);
    cleanMeals.push(r);
  }

  // Group meals by date
  const mealsByDate = new Map();
  for (const r of cleanMeals) {
    if (!mealsByDate.has(r.d)) mealsByDate.set(r.d, []);
    mealsByDate.get(r.d).push(r);
  }

  // Helper to compute daily stats for any date d
  const computeDayMealStats = (dStr) => {
    const rows = mealsByDate.get(dStr) || [];
    const bSet = new Set();
    const lSet = new Set();
    const dSet = new Set();
    const anySet = new Set();
    for (const r of rows) {
      anySet.add(r.studentId);
      if (r.mealType === "BREAKFAST") bSet.add(r.studentId);
      else if (r.mealType === "LUNCH") lSet.add(r.studentId);
      else if (r.mealType === "DINNER") dSet.add(r.studentId);
    }
    let allThreeCount = 0;
    for (const sid of bSet) {
      if (lSet.has(sid) && dSet.has(sid)) allThreeCount++;
    }
    const bServed = bSet.size;
    const lServed = lSet.size;
    const dServed = dSet.size;
    const totalServed = bServed + lServed + dServed;
    const expectedPerMeal = totalStudents;
    const expectedTotal = totalStudents * 3;
    const unservedTotal = Math.max(0, expectedTotal - totalServed);

    return {
      date: dStr,
      breakfast: {
        served: bServed,
        expected: expectedPerMeal,
        unserved: Math.max(0, expectedPerMeal - bServed),
        pct: Number(((bServed / expectedPerMeal) * 100).toFixed(1)),
        cs2Diff: bServed - expectedPerMeal,
      },
      lunch: {
        served: lServed,
        expected: expectedPerMeal,
        unserved: Math.max(0, expectedPerMeal - lServed),
        pct: Number(((lServed / expectedPerMeal) * 100).toFixed(1)),
        cs2Diff: lServed - expectedPerMeal,
      },
      dinner: {
        served: dServed,
        expected: expectedPerMeal,
        unserved: Math.max(0, expectedPerMeal - dServed),
        pct: Number(((dServed / expectedPerMeal) * 100).toFixed(1)),
        cs2Diff: dServed - expectedPerMeal,
      },
      allThreeMeals: {
        count: allThreeCount,
        pct: Number(((allThreeCount / totalStudents) * 100).toFixed(1)),
      },
      atLeastOneMeal: {
        count: anySet.size,
        pct: Number(((anySet.size / totalStudents) * 100).toFixed(1)),
      },
      portions: {
        expected: expectedTotal,
        served: totalServed,
        unserved: unservedTotal,
        pct: Number(((totalServed / expectedTotal) * 100).toFixed(1)),
        cs2Diff: totalServed - expectedTotal,
      },
    };
  };

  const selectedDayStats = computeDayMealStats(selectedDate);

  // Selected Day Student Matrix & Group Breakdown & Hourly Breakdown
  const selectedDayRows = mealsByDate.get(selectedDate) || [];
  const stMealMap = new Map();
  const hourlyMap = new Map();
  for (const r of selectedDayRows) {
    if (!stMealMap.has(r.studentId)) {
      stMealMap.set(r.studentId, { BREAKFAST: null, LUNCH: null, DINNER: null });
    }
    stMealMap.get(r.studentId)[r.mealType] = r.t;
    const hKey = `${String(r.hr).padStart(2, "0")}:00`;
    hourlyMap.set(hKey, (hourlyMap.get(hKey) || 0) + 1);
  }

  const groupStatsMap = new Map();
  const studentMatrix = activeStudents.map((st) => {
    const m = stMealMap.get(st.id) || { BREAKFAST: null, LUNCH: null, DINNER: null };
    const mealsCount = (m.BREAKFAST ? 1 : 0) + (m.LUNCH ? 1 : 0) + (m.DINNER ? 1 : 0);
    const grp = st.group || "Guruhsiz";
    if (!groupStatsMap.has(grp)) {
      groupStatsMap.set(grp, {
        group: grp,
        studentCount: 0,
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        allThree: 0,
        atLeastOne: 0,
        servedPortions: 0,
      });
    }
    const g = groupStatsMap.get(grp);
    g.studentCount++;
    if (m.BREAKFAST) g.breakfast++;
    if (m.LUNCH) g.lunch++;
    if (m.DINNER) g.dinner++;
    if (mealsCount === 3) g.allThree++;
    if (mealsCount >= 1) g.atLeastOne++;
    g.servedPortions += mealsCount;

    return {
      id: st.id,
      fullname: st.fullname,
      photo: st.photo || null,
      group: grp,
      room: st.room || "—",
      cardId: st.cardId || "—",
      breakfastTime: m.BREAKFAST,
      lunchTime: m.LUNCH,
      dinnerTime: m.DINNER,
      mealsCount,
      expectedPortions: 3,
      unservedPortions: 3 - mealsCount,
      cs2Diff: mealsCount - 3,
    };
  });

  const byGroup = Array.from(groupStatsMap.values())
    .map((g) => {
      const expectedPortions = g.studentCount * 3;
      const unservedPortions = Math.max(0, expectedPortions - g.servedPortions);
      return {
        ...g,
        expectedPortions,
        unservedPortions,
        pct: expectedPortions > 0 ? Number(((g.servedPortions / expectedPortions) * 100).toFixed(1)) : 0,
        breakfastPct: g.studentCount > 0 ? Number(((g.breakfast / g.studentCount) * 100).toFixed(1)) : 0,
        lunchPct: g.studentCount > 0 ? Number(((g.lunch / g.studentCount) * 100).toFixed(1)) : 0,
        dinnerPct: g.studentCount > 0 ? Number(((g.dinner / g.studentCount) * 100).toFixed(1)) : 0,
        allThreePct: g.studentCount > 0 ? Number(((g.allThree / g.studentCount) * 100).toFixed(1)) : 0,
        cs2Diff: g.servedPortions - expectedPortions,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  // Weekly stats (last 7 calendar days ending on selectedDate)
  const weekDays = [];
  const baseDateObj = new Date(`${selectedDate}T12:00:00Z`);
  for (let i = 6; i >= 0; i--) {
    const dObj = new Date(baseDateObj.getTime() - i * 86400000);
    const dStr = dObj.toISOString().slice(0, 10);
    weekDays.push(computeDayMealStats(dStr));
  }
  const activeWeekDays = weekDays.filter((d) => d.portions.served > 0);
  const weekServed = weekDays.reduce((s, d) => s + d.portions.served, 0);
  const weekExpected7 = totalStudents * 3 * 7;
  const weekExpectedActive = totalStudents * 3 * Math.max(1, activeWeekDays.length);
  const weekBreakfast = weekDays.reduce((s, d) => s + d.breakfast.served, 0);
  const weekLunch = weekDays.reduce((s, d) => s + d.lunch.served, 0);
  const weekDinner = weekDays.reduce((s, d) => s + d.dinner.served, 0);
  const weekAllThree = weekDays.reduce((s, d) => s + d.allThreeMeals.count, 0);

  // Compare selectedDay vs active week average (CS2 style vs-average delta)
  const avgDailyServed = activeWeekDays.length > 0 ? Math.round(weekServed / activeWeekDays.length) : 0;
  selectedDayStats.portions.vsAvgDiff = selectedDayStats.portions.served - avgDailyServed;

  // Monthly stats & Week-by-Week -> Day-by-Day drill-down for selectedMonth
  const monthDaysAll = [];
  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const dStr = `${selectedMonth}-${String(dayNum).padStart(2, "0")}`;
    monthDaysAll.push(computeDayMealStats(dStr));
  }
  const activeMonthDays = monthDaysAll.filter((d) => d.portions.served > 0);
  const activeDaysCount = activeMonthDays.length;

  const monthServed = monthDaysAll.reduce((s, d) => s + d.portions.served, 0);
  const monthBreakfast = monthDaysAll.reduce((s, d) => s + d.breakfast.served, 0);
  const monthLunch = monthDaysAll.reduce((s, d) => s + d.lunch.served, 0);
  const monthDinner = monthDaysAll.reduce((s, d) => s + d.dinner.served, 0);
  const monthAllThree = monthDaysAll.reduce((s, d) => s + d.allThreeMeals.count, 0);

  const expectedFullMonth = totalStudents * 3 * daysInMonth;
  const expectedActiveMonth = totalStudents * 3 * Math.max(1, activeDaysCount);

  // Group monthDaysAll into weeks (1-hafta: 1..7, 2-hafta: 8..14, 3-hafta: 15..21, 4-hafta: 22..28, 5-hafta: 29..end)
  const monthWeeks = [];
  for (let w = 0; w < Math.ceil(daysInMonth / 7); w++) {
    const slice = monthDaysAll.slice(w * 7, (w + 1) * 7);
    const activeSlice = slice.filter((d) => d.portions.served > 0);
    const wServed = slice.reduce((s, d) => s + d.portions.served, 0);
    const wExpectedFull = slice.length * totalStudents * 3;
    const wExpectedActive = Math.max(1, activeSlice.length) * totalStudents * 3;
    const wB = slice.reduce((s, d) => s + d.breakfast.served, 0);
    const wL = slice.reduce((s, d) => s + d.lunch.served, 0);
    const wD = slice.reduce((s, d) => s + d.dinner.served, 0);
    const wAll3 = slice.reduce((s, d) => s + d.allThreeMeals.count, 0);
    monthWeeks.push({
      weekNum: w + 1,
      label: `${w + 1}-hafta (${slice[0].date.slice(8)}-${slice[slice.length - 1].date.slice(8)}.${selectedMonth.slice(5)})`,
      startDate: slice[0].date,
      endDate: slice[slice.length - 1].date,
      daysCount: slice.length,
      activeDaysCount: activeSlice.length,
      breakfast: wB,
      lunch: wL,
      dinner: wD,
      allThreeCount: wAll3,
      servedPortions: wServed,
      expectedPortions: wExpectedFull,
      expectedActivePortions: wExpectedActive,
      unservedPortions: Math.max(0, wExpectedFull - wServed),
      pct: Number(((wServed / wExpectedFull) * 100).toFixed(1)),
      activePct: activeSlice.length > 0 ? Number(((wServed / wExpectedActive) * 100).toFixed(1)) : 0,
      cs2Diff: wServed - wExpectedFull,
      activeCs2Diff: activeSlice.length > 0 ? wServed - wExpectedActive : 0,
      days: slice,
    });
  }

  // Canteen Red Signals
  const canteenAlertsRes = await pgPool.query(
    `SELECT id, "deviceType", "studentId", "studentName", "cardId", "attemptedType", "reason",
            "timestamp",
            TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI:SS') AS "istanbulTime"
     FROM "TurnstileAlert"
     WHERE "deviceType" = 'CANTEEN'
     ORDER BY "timestamp" DESC
     LIMIT 100`
  );

  // ============================================================================
  // 4. MASJID ? 5 MAHAL NAMOZ ANALYTICS
  // ============================================================================
  const prayerCfgRes = await pgPool.query(
    `SELECT "prayerType"::text AS "prayerType", "startTime", "endTime", "isActive"
     FROM "PrayerTimeConfig"
     ORDER BY id ASC`
  );
  const prayerOrder = [
    { type: "FAJR", label: "Bomdod", defaultStart: "05:00", defaultEnd: "06:45" },
    { type: "DHUHR", label: "Peshin", defaultStart: "12:30", defaultEnd: "14:00" },
    { type: "ASR", label: "Asr", defaultStart: "15:30", defaultEnd: "17:15" },
    { type: "MAGHRIB", label: "Shom", defaultStart: "18:00", defaultEnd: "19:30" },
    { type: "ISHA", label: "Xufton", defaultStart: "19:45", defaultEnd: "21:45" },
  ];
  const cfgByType = new Map(prayerCfgRes.rows.map((r) => [r.prayerType, r]));

  const prayerRes = await pgPool.query(
    `SELECT
       id,
       "studentId",
       "studentName",
       "cardId",
       "prayerType"::text AS "prayerType",
       "timestamp",
       TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS d,
       TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'HH24:MI') AS t
     FROM "PrayerRecord"
     WHERE TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM') = $1
        OR TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') = $2
     ORDER BY "timestamp" ASC`,
    [selectedMonth, selectedDate]
  );

  // Strict anti-cheat deduplication: 1 record per (studentId, date, prayerType)
  const seenPrayerKey = new Set();
  const cleanPrayers = [];
  for (const r of prayerRes.rows) {
    const k = `${r.studentId}_${r.d}_${r.prayerType}`;
    if (seenPrayerKey.has(k)) continue;
    seenPrayerKey.add(k);
    cleanPrayers.push(r);
  }

  const dayPrayerRows = cleanPrayers.filter((r) => r.d === selectedDate);
  const stPrayerMap = new Map();
  for (const r of dayPrayerRows) {
    if (!stPrayerMap.has(r.studentId)) {
      stPrayerMap.set(r.studentId, { FAJR: null, DHUHR: null, ASR: null, MAGHRIB: null, ISHA: null });
    }
    stPrayerMap.get(r.studentId)[r.prayerType] = r.t;
  }

  const mosqueStudentRows = activeStudents
    .map((st) => {
      const p = stPrayerMap.get(st.id) || { FAJR: null, DHUHR: null, ASR: null, MAGHRIB: null, ISHA: null };
      const missedList = [];
      let attendedCount = 0;
      for (const po of prayerOrder) {
        if (p[po.type]) attendedCount++;
        else missedList.push(po.label);
      }
      return {
        id: st.id,
        fullname: st.fullname,
        photo: st.photo || null,
        group: st.group || "Guruhsiz",
        room: st.room || "—",
        phone: st.phone || "—",
        cardId: st.cardId || "—",
        prayers: p,
        attendedCount,
        missedCount: 5 - attendedCount,
        missedList,
      };
    })
    .sort((a, b) => b.missedCount - a.missedCount || a.fullname.localeCompare(b.fullname));

  const prayersSummary = prayerOrder.map((po) => {
    const cfg = cfgByType.get(po.type);
    const startTime = cfg?.startTime || po.defaultStart;
    const endTime = cfg?.endTime || po.defaultEnd;
    let attendedCount = 0;
    for (const st of mosqueStudentRows) {
      if (st.prayers[po.type]) attendedCount++;
    }
    const missingCount = totalStudents - attendedCount;
    const monthCount = cleanPrayers.filter((r) => r.prayerType === po.type && r.d.startsWith(selectedMonth)).length;
    return {
      prayerType: po.type,
      label: po.label,
      startTime,
      endTime,
      attendedCount,
      missingCount,
      pct: Number(((attendedCount / totalStudents) * 100).toFixed(1)),
      cs2Diff: attendedCount - totalStudents,
      monthTotal: monthCount,
    };
  });

  const allFiveAttendedCount = mosqueStudentRows.filter((s) => s.attendedCount === 5).length;
  const missedAtLeastOneCount = mosqueStudentRows.filter((s) => s.missedCount > 0).length;

  const mosqueAlertsRes = await pgPool.query(
    `SELECT id, "deviceType", "studentId", "studentName", "cardId", "attemptedType", "reason",
            "timestamp",
            TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI:SS') AS "istanbulTime"
     FROM "TurnstileAlert"
     WHERE "deviceType" = 'MOSQUE'
     ORDER BY "timestamp" DESC
     LIMIT 100`
  );

  // ============================================================================
  // 5. KIRISH ESHIGI (22:00 - 05:30) & KECH QOLUVCHILAR REYTINGI
  // ============================================================================
  const gateIncRes = await pgPool.query(
    `SELECT
       id,
       "capturedAt",
       TO_CHAR("capturedAt", 'YYYY-MM-DD HH24:MI:SS') AS "istanbulTime",
       "status",
       "studentId",
       "studentName",
       "studentGroup",
       "cardId",
       "cameraName",
       "cameraStream",
       "photos",
       "photosCleaned",
       "telegramSent",
       "telegramMessageId",
       "confirmedBy",
       "confirmedAt",
       "note"
     FROM "GateLateIncident"
     ORDER BY "capturedAt" DESC
     LIMIT 200`
  );

  const incidents = gateIncRes.rows.map((r) => ({
    ...r,
    photos: Array.isArray(r.photos) ? r.photos : [],
  }));

  // Build Kech Qoluvchilar Leaderboard (from CONFIRMED incidents)
  const stById = new Map(activeStudents.map((s) => [s.id, s]));
  const lateMap = new Map();

  for (const inc of incidents) {
    const isSababli = inc.status === "EXCUSED" || /#sababli/i.test(String(inc.note || "")) || /#sababli/i.test(String(inc.studentName || ""));
    if (inc.status !== "CONFIRMED" || isSababli) continue;
    const key = inc.studentId ? `id_${inc.studentId}` : `name_${(inc.studentName || "Noma'lum").toLowerCase().trim()}`;
    const stObj = inc.studentId ? stById.get(inc.studentId) : null;
    if (!lateMap.has(key)) {
      lateMap.set(key, {
        key,
        studentId: inc.studentId || null,
        studentName: stObj?.fullname || inc.studentName || "Noma'lum talaba",
        photo: stObj?.photo || null,
        studentGroup: stObj?.group || inc.studentGroup || "Guruhsiz",
        room: stObj?.room || "—",
        phone: stObj?.phone || "—",
        totalLateCount: 0,
        lastLateAt: inc.istanbulTime,
        incidents: [],
      });
    }
    const entry = lateMap.get(key);
    entry.totalLateCount++;
    if (inc.istanbulTime > entry.lastLateAt) entry.lastLateAt = inc.istanbulTime;
    entry.incidents.push({
      id: inc.id,
      istanbulTime: inc.istanbulTime,
      confirmedBy: inc.confirmedBy || "Tizim",
      note: inc.note || "",
      photos: inc.photos,
    });
  }

  const leaderboard = Array.from(lateMap.values())
    .map((item) => ({
      ...item,
      category: item.totalLateCount >= 2 ? "CHRONIC" : "ONE_TIME",
      categoryLabel: item.totalLateCount >= 2 ? "Surunkali kech qoluvchi" : "Bir martalik",
    }))
    .sort((a, b) => b.totalLateCount - a.totalLateCount || b.lastLateAt.localeCompare(a.lastLateAt));

  const botCfg = await getBotConfig(pgPool);

  return {
    meta: {
      selectedDate,
      selectedMonth,
      todayIstanbul: todayIst,
      latestActiveDate,
      availableDates,
      availableMonths,
      totalActiveStudents: totalStudents,
      devices: [
        { id: "canteen", name: "Oshxona Turniketi", ip: "192.168.1.52", port: 8081, windows: "Nonushta 05:00 - 07:00, Tushlik 12:00 - 14:00, Kechki 17:30 - 19:30" },
        { id: "mosque", name: "Masjid Turniketi", ip: "192.168.1.172", port: 8082, windows: "5 mahal namoz vaqtlari (1 talaba = 1 mahal = 1 marta)" },
        { id: "gate", name: "Kirish eshigi IP Kamera + Turniket", ip: "192.168.1.32 / 192.168.1.53", port: 1984, windows: "Kechki rejim: 22:00 - 05:30 (AI FaceID + 4 kadr)" },
      ],
    },
    activeStudents: activeStudents.map((s) => ({
      id: s.id,
      fullname: s.fullname,
      photo: s.photo || null,
      group: s.group || "Guruhsiz",
      room: s.room || "—",
      cardId: s.cardId || "",
    })),
    canteen: {
      windows: {
        BREAKFAST: "05:00 - 07:00",
        LUNCH: "12:00 - 14:00",
        DINNER: "17:30 - 19:30",
      },
      daily: selectedDayStats,
      weekly: {
        startDate: weekDays[0]?.date,
        endDate: weekDays[weekDays.length - 1]?.date,
        activeDaysCount: activeWeekDays.length,
        breakfastServed: weekBreakfast,
        lunchServed: weekLunch,
        dinnerServed: weekDinner,
        allThreeCount: weekAllThree,
        servedPortions: weekServed,
        expectedPortions7Days: weekExpected7,
        unservedPortions7Days: Math.max(0, weekExpected7 - weekServed),
        pct7Days: Number(((weekServed / weekExpected7) * 100).toFixed(1)),
        cs2Diff7Days: weekServed - weekExpected7,
        expectedPortionsActiveDays: weekExpectedActive,
        unservedPortionsActiveDays: Math.max(0, weekExpectedActive - weekServed),
        pctActiveDays: activeWeekDays.length > 0 ? Number(((weekServed / weekExpectedActive) * 100).toFixed(1)) : 0,
        cs2DiffActiveDays: activeWeekDays.length > 0 ? weekServed - weekExpectedActive : 0,
        days: weekDays,
      },
      monthly: {
        month: selectedMonth,
        daysInMonth,
        activeDaysCount,
        perStudent: {
          expectedFullMonth: daysInMonth * 3,
          expectedActiveDays: activeDaysCount * 3,
          servedAvg: Number((monthServed / totalStudents).toFixed(1)),
          unservedFullMonthAvg: Number((( expectedFullMonth - monthServed ) / totalStudents).toFixed(1)),
          unservedActiveDaysAvg: Number((Math.max(0, expectedActiveMonth - monthServed) / totalStudents).toFixed(1)),
          cs2DiffFullMonth: Number(((monthServed - expectedFullMonth) / totalStudents).toFixed(1)),
          cs2DiffActiveDays: activeDaysCount > 0 ? Number(((monthServed - expectedActiveMonth) / totalStudents).toFixed(1)) : 0,
        },
        totals: {
          breakfastServed: monthBreakfast,
          lunchServed: monthLunch,
          dinnerServed: monthDinner,
          allThreeStudentDays: monthAllThree,
          servedPortions: monthServed,
          expectedFullMonth,
          unservedFullMonth: Math.max(0, expectedFullMonth - monthServed),
          pctFullMonth: Number(((monthServed / expectedFullMonth) * 100).toFixed(1)),
          cs2DiffFullMonth: monthServed - expectedFullMonth,
          expectedActiveDays: expectedActiveMonth,
          unservedActiveDays: Math.max(0, expectedActiveMonth - monthServed),
          pctActiveDays: activeDaysCount > 0 ? Number(((monthServed / expectedActiveMonth) * 100).toFixed(1)) : 0,
          cs2DiffActiveDays: activeDaysCount > 0 ? monthServed - expectedActiveMonth : 0,
        },
        weeks: monthWeeks,
      },
      byGroup,
      hourlyBreakdown: Array.from(hourlyMap.entries())
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => a.hour.localeCompare(b.hour)),
      studentMatrix,
      alerts: canteenAlertsRes.rows,
      recentLiveScans: (
        await pgPool.query(
          `SELECT * FROM (
             SELECT
               m.id,
               'CANTEEN' AS "deviceType",
               m."studentId",
               COALESCE(s.fullname, m."studentName") AS "studentName",
               s.photo,
               COALESCE(g.name, 'Guruhsiz') AS "group",
               COALESCE(s."roomNumber", '-') AS "room",
               m."cardId",
               m."mealType"::text AS "eventType",
               TO_CHAR(m."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS "date",
               TO_CHAR(m."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'HH24:MI:SS') AS "time",
               m."timestamp"
             FROM "MealRecord" m
             LEFT JOIN "Student" s ON s.id = m."studentId"
             LEFT JOIN "Group" g ON g.id = s."groupId"
             UNION ALL
             SELECT
               em.id + 1000000 AS id,
               'CANTEEN' AS "deviceType",
               em."employeeId" AS "studentId",
               COALESCE(e.fullname, em."employeeName") || ' (Xodim)' AS "studentName",
               e."profilePicture" AS photo,
               'Xodim: ' || COALESCE(e.position, 'Xizmat') AS "group",
               'Xodimlar' AS "room",
               em."cardId",
               em."mealType"::text AS "eventType",
               TO_CHAR(em."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS "date",
               TO_CHAR(em."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'HH24:MI:SS') AS "time",
               em."timestamp"
             FROM "EmployeeMealRecord" em
             LEFT JOIN "Employee" e ON e.id = em."employeeId"
           ) combined_meals
           ORDER BY "timestamp" DESC
           LIMIT 35`
        )
      ).rows,
    },
    mosque: {
      selectedDate,
      totalStudents,
      allFiveAttendedCount,
      allFiveAttendedPct: Number(((allFiveAttendedCount / totalStudents) * 100).toFixed(1)),
      missedAtLeastOneCount,
      missedAtLeastOnePct: Number(((missedAtLeastOneCount / totalStudents) * 100).toFixed(1)),
      prayers: prayersSummary,
      studentRows: mosqueStudentRows,
      alerts: mosqueAlertsRes.rows,
      recentLiveScans: (
        await pgPool.query(
          `SELECT
             p.id,
             'MOSQUE' AS "deviceType",
             p."studentId",
             COALESCE(s.fullname, p."studentName") AS "studentName",
             s.photo,
             COALESCE(g.name, 'Guruhsiz') AS "group",
             COALESCE(r.name, '-') AS "room",
             p."cardId",
             p."prayerType"::text AS "eventType",
             TO_CHAR(p."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS "date",
             TO_CHAR(p."timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'HH24:MI:SS') AS "time",
             p."timestamp"
           FROM "PrayerRecord" p
           LEFT JOIN "Student" s ON s.id = p."studentId"
           LEFT JOIN "Group" g ON g.id = s."groupId"
           LEFT JOIN "Room" r ON r.id = s."roomId"
           ORDER BY p."timestamp" DESC
           LIMIT 35`
        )
      ).rows,
    },
    gate: {
      cameraName: "Kirish eshigi",
      cameraIp: "192.168.1.32",
      turnstileIp: "192.168.1.53:4370",
      cameraStream: "ip34_c01_hd",
      botUsername: "@mezanatizimbot",
      botContacts: await getBotContacts(),
      activeWindow: `${botCfg.activeStart} - ${botCfg.activeEnd}`,
      retentionDays: 7,
      botConfig: {
        hasBotToken: Boolean(botCfg.botToken),
        botTokenMasked: botCfg.botToken ? `${botCfg.botToken.slice(0, 6)}...${botCfg.botToken.slice(-4)}` : "",
        chatId: botCfg.chatId || "",
        responsiblePerson: botCfg.responsiblePerson || "Navbatchi tarbiyachi",
        activeStart: botCfg.activeStart || "22:00",
        activeEnd: botCfg.activeEnd || "05:30",
      },
      summary: {
        totalIncidents: incidents.length,
        pendingCount: incidents.filter((i) => i.status === "PENDING").length,
        confirmedCount: incidents.filter((i) => i.status === "CONFIRMED" && !/#sababli/i.test(String(i.note || "")) && !/#sababli/i.test(String(i.studentName || ""))).length,
        excusedCount: incidents.filter((i) => i.status === "EXCUSED" || /#sababli/i.test(String(i.note || "")) || /#sababli/i.test(String(i.studentName || ""))).length,
        chronicStudentsCount: leaderboard.filter((l) => l.category === "CHRONIC").length,
        oneTimeStudentsCount: leaderboard.filter((l) => l.category === "ONE_TIME").length,
      },
      incidents,
      leaderboard,
    },
  };
}

export async function simulateSmartTurnstileScan(pgPool, { deviceType = "CANTEEN", studentId, customTimeStr = null, customDateStr = null }) {
  const stRes = await pgPool.query(
    `SELECT s.id, s.fullname, COALESCE(g.name, 'Guruhsiz') AS "group", sc."cardId"
     FROM "Student" s
     LEFT JOIN "Group" g ON g.id = s."groupId"
     LEFT JOIN "StudentCard" sc ON sc."studentId" = s.id AND sc."isActive" = true
     WHERE s.id = $1 LIMIT 1`,
    [Number(studentId)]
  );
  const st = stRes.rows[0];
  if (!st) throw new Error("Talaba topilmadi");
  const cardId = st.cardId || `CARD-${st.id}`;

  const nowIst = getIstanbulParts(new Date());
  const dateStr = (customDateStr && /^\d{4}-\d{2}-\d{2}$/.test(customDateStr)) ? customDateStr : nowIst.dateStr;
  const timeStr = customTimeStr || nowIst.timeStr;
  const [hh, mm] = timeStr.split(":").map(Number);
  const mins = hh * 60 + mm;
  const scanTimestamp = new Date(`${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000+03:00`);
  const startOfDayUtc = new Date(`${dateStr}T00:00:00.000+03:00`);
  const endOfDayUtc = new Date(`${dateStr}T23:59:59.999+03:00`);

  if (deviceType === "CANTEEN") {
    let mealType = null;
    if (mins >= 5 * 60 && mins <= 7 * 60) mealType = "BREAKFAST";
    else if (mins >= 12 * 60 && mins <= 14 * 60) mealType = "LUNCH";
    else if (mins >= 17 * 60 + 30 && mins <= 19 * 60 + 30) mealType = "DINNER";

    if (!mealType) {
      const reason = `Qizil signal: Ovqatlanish vaqtidan tashqarida karta urildi (${timeStr}). Ruxsat etilgan vaqtlar: Nonushta 05:00 - 07:00, Tushlik 12:00 - 14:00, Kechki ovqat 17:30 - 19:30`;
      await pgPool.query(
        `INSERT INTO "TurnstileAlert" ("deviceType", "studentId", "studentName", "cardId", "attemptedType", "reason", "timestamp")
         VALUES ('CANTEEN', $1, $2, $3, 'OUT_OF_WINDOW', $4, $5)`,
        [st.id, st.fullname, cardId, reason, scanTimestamp]
      );
      return { accepted: false, alert: true, reason };
    }

    const dup = await pgPool.query(
      `SELECT id FROM "MealRecord"
       WHERE "studentId" = $1 AND "mealType"::text = $2
         AND "timestamp" >= $3 AND "timestamp" <= $4
       LIMIT 1`,
      [st.id, mealType, startOfDayUtc, endOfDayUtc]
    );
    if (dup.rows.length > 0) {
      const mealLabel = mealType === "BREAKFAST" ? "Nonushta" : mealType === "LUNCH" ? "Tushlik" : "Kechki ovqat";
      const reason = `Qizil signal: ${mealLabel} (${timeStr}) uchun ikkinchi marta karta urildi! 1 talaba = 1 porsiya (Takroriy urinish rad etildi)`;
      await pgPool.query(
        `INSERT INTO "TurnstileAlert" ("deviceType", "studentId", "studentName", "cardId", "attemptedType", "reason", "timestamp")
         VALUES ('CANTEEN', $1, $2, $3, $4, $5, $6)`,
        [st.id, st.fullname, cardId, mealType, reason, scanTimestamp]
      );
      return { accepted: false, alert: true, reason, mealType };
    }

    await pgPool.query(
      `INSERT INTO "MealRecord" ("studentId", "studentName", "cardId", "mealType", "timestamp")
       VALUES ($1, $2, $3, $4::"MealType", $5)`,
      [st.id, st.fullname, cardId, mealType, scanTimestamp]
    );
    const mealLabel = mealType === "BREAKFAST" ? "Nonushta" : mealType === "LUNCH" ? "Tushlik" : "Kechki ovqat";
    return {
      accepted: true,
      alert: false,
      mealType,
      message: `🟢 Yashil signal: ${st.fullname} — ${mealLabel} (${timeStr}) uchun 1 porsiya qabul qilindi!`,
    };
  }

  // MOSQUE
  const cfgRes = await pgPool.query(`SELECT "prayerType"::text AS "prayerType", "startTime", "endTime" FROM "PrayerTimeConfig" WHERE "isActive" = true`);
  let matchedPrayer = null;
  for (const c of cfgRes.rows) {
    const [sh, sm] = String(c.startTime).split(":").map(Number);
    const [eh, em] = String(c.endTime).split(":").map(Number);
    if (mins >= sh * 60 + sm && mins <= eh * 60 + em) {
      matchedPrayer = c.prayerType;
      break;
    }
  }

  if (!matchedPrayer) {
    const reason = `Qizil signal: Namoz vaqti oralig'idan tashqarida karta urildi (${timeStr}). Belgilangan 5 mahal namoz vaqtidan tashqarida karta o'qilmaydi!`;
    await pgPool.query(
      `INSERT INTO "TurnstileAlert" ("deviceType", "studentId", "studentName", "cardId", "attemptedType", "reason", "timestamp")
       VALUES ('MOSQUE', $1, $2, $3, 'OUT_OF_WINDOW', $4, $5)`,
      [st.id, st.fullname, cardId, reason, scanTimestamp]
    );
    return { accepted: false, alert: true, reason };
  }

  const dupPrayer = await pgPool.query(
    `SELECT id FROM "PrayerRecord"
     WHERE "studentId" = $1 AND "prayerType"::text = $2
       AND "timestamp" >= $3 AND "timestamp" <= $4
     LIMIT 1`,
    [st.id, matchedPrayer, startOfDayUtc, endOfDayUtc]
  );
  const prayerLabels = { FAJR: "Bomdod", DHUHR: "Peshin", ASR: "Asr", MAGHRIB: "Shom", ISHA: "Xufton" };
  if (dupPrayer.rows.length > 0) {
    const reason = `Qizil signal: ${prayerLabels[matchedPrayer] || matchedPrayer} namozi (${timeStr}) uchun bugun karta allaqachon urilgan! Ertalab ketma-ket bir necha marta urish 5 mahal namozga o'tmaydi.`;
    await pgPool.query(
      `INSERT INTO "TurnstileAlert" ("deviceType", "studentId", "studentName", "cardId", "attemptedType", "reason", "timestamp")
       VALUES ('MOSQUE', $1, $2, $3, $4, $5, $6)`,
      [st.id, st.fullname, cardId, matchedPrayer, reason, scanTimestamp]
    );
    return { accepted: false, alert: true, reason, prayerType: matchedPrayer };
  }

  await pgPool.query(
    `INSERT INTO "PrayerRecord" ("studentId", "studentName", "cardId", "prayerType", "timestamp")
     VALUES ($1, $2, $3, $4::"PrayerType", $5)`,
    [st.id, st.fullname, cardId, matchedPrayer, scanTimestamp]
  );
  return {
    accepted: true,
    alert: false,
    prayerType: matchedPrayer,
    message: `🟢 Yashil signal: ${st.fullname} — ${prayerLabels[matchedPrayer] || matchedPrayer} namozi (${timeStr}) davomati qabul qilindi!`,
  };
}

const ZKTECO_DEVICES = [
  { id: "canteen", name: "Oshxona (192.168.1.52:8081)", ip: "192.168.1.52", port: 8081, commKey: 2026 },
  { id: "gate", name: "Kirish (192.168.1.53:4370)", ip: "192.168.1.53", port: 4370, commKey: 0 },
  { id: "mosque", name: "Masjid (192.168.1.172:8082)", ip: "192.168.1.172", port: 8082, commKey: 2026 },
];

function makeCommKey(key, sessionId, ticks = 50) {
  let k = 0;
  for (let i = 0; i < 32; i++) {
    if (key & (1 << i)) {
      k = ((k << 1) | 1) >>> 0;
    } else {
      k = (k << 1) >>> 0;
    }
  }
  k = (k + sessionId) >>> 0;
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(k, 0);
  buf[0] ^= "Z".charCodeAt(0);
  buf[1] ^= "K".charCodeAt(0);
  buf[2] ^= "S".charCodeAt(0);
  buf[3] ^= "O".charCodeAt(0);
  const h0 = buf.readUInt16LE(0);
  const h1 = buf.readUInt16LE(2);
  buf.writeUInt16LE(h1, 0);
  buf.writeUInt16LE(h0, 2);
  const B = ticks & 0xff;
  buf[0] ^= B;
  buf[1] ^= B;
  buf[2] = B;
  buf[3] ^= B;
  return buf;
}

async function connectZkWithAuth(zk, commKey = 2026) {
  await zk.createSocket(() => {}, () => {});
  const reply = await zk.executeCmd(1000, ""); // CMD_CONNECT = 1000
  const cmdCode = reply && reply.length >= 2 ? reply.readUInt16LE(0) : 0;
  if (cmdCode === 2005 || commKey > 0) {
    // CMD_ACK_UNAUTH = 2005 -> send CMD_AUTH = 1102
    const authBuf = makeCommKey(commKey || 2026, zk.sessionId);
    await zk.executeCmd(1102, authBuf);
  }
}

function buildZkUserBuffer72({ uid, userId, name, cardno = 0, role = 0, password = "" }) {
  const buf = Buffer.alloc(72, 0);
  const safeUid = Math.max(1, Math.min(65534, Number(uid) || 1));
  buf.writeUInt16LE(safeUid, 0);
  buf.writeUInt8(role & 0xff, 2);
  if (password) {
    buf.write(String(password).slice(0, 8), 3, 8, "ascii");
  }
  const cleanName = String(name || "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, 23);
  buf.write(cleanName, 11, 24, "ascii");
  const numCard = Number(String(cardno || "0").replace(/\D/g, "")) || 0;
  buf.writeUInt32LE(numCard >>> 0, 35);
  buf.writeUInt8(1, 39);
  const cleanUserId = String(userId || safeUid).slice(0, 8);
  buf.write(cleanUserId, 48, 9, "ascii");
  return buf;
}

function withZkTimeout(promise, ms, zk) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { zk?.socket?.destroy(); } catch {}
      reject(new Error("ZKTeco timeout"));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

function resolveDeviceUidForCard(existingUsers, { preferredUid, userId, numericCard }) {
  const strUserId = String(userId || "").trim();
  // 1. Check if this exact cardno already exists on the device
  if (numericCard > 0) {
    const byCard = existingUsers.find((u) => Number(u.cardno) === numericCard);
    if (byCard && Number(byCard.uid) > 0) {
      return { uid: Number(byCard.uid), userId: String(byCard.userId || strUserId || byCard.uid) };
    }
  }
  // 2. Check if this userId already exists on the device
  if (strUserId) {
    const byUserId = existingUsers.find((u) => String(u.userId) === strUserId);
    if (byUserId && Number(byUserId.uid) > 0) {
      return { uid: Number(byUserId.uid), userId: strUserId };
    }
  }
  // 3. Otherwise pick preferredUid if unused, or maxUid + 1
  const usedUids = new Set(existingUsers.map((u) => Number(u.uid)).filter((n) => n > 0));
  let safePref = Math.max(1, Math.min(65000, Number(preferredUid) || 1));
  if (!usedUids.has(safePref)) {
    return { uid: safePref, userId: strUserId || String(safePref) };
  }
  let maxUid = 0;
  for (const u of usedUids) {
    if (u > maxUid && u < 65000) maxUid = u;
  }
  const nextUid = Math.min(65534, maxUid + 1);
  return { uid: nextUid, userId: strUserId || String(nextUid) };
}

async function queueAdmsUserSync({ userId, name, cardno }) {
  if (!cardno || Number(cardno) <= 0) return;
  try {
    await fetch("http://127.0.0.1:8081/api/zkteco/add-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: String(userId),
        name: String(name || "").slice(0, 23),
        cardno: Number(cardno),
      }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {}
}

export async function syncCardToZktecoDevices({ preferredUid, userId, name, cardNumber, role = 0 }) {
  const rawCard = String(cardNumber || "").replace(/\D/g, "");
  const numericCard = Number(rawCard) || 0;
  const cleanUserId = String(userId || preferredUid || 1).trim();
  const cleanName = String(name || `User ${cleanUserId}`).trim();

  await queueAdmsUserSync({ userId: cleanUserId, name: cleanName, cardno: numericCard });

  const results = [];
  for (const dev of ZKTECO_DEVICES) {
    const zk = new ZKLibTCP(dev.ip, dev.port, 3000);
    try {
      let assignedSlot = null;
      await withZkTimeout((async () => {
        await connectZkWithAuth(zk, dev.commKey);
        let existingUsers = [];
        try {
          const uResp = await zk.getUsers();
          existingUsers = uResp?.data || [];
        } catch {}
        const resolved = resolveDeviceUidForCard(existingUsers, {
          preferredUid: Number(preferredUid) || 1,
          userId: cleanUserId,
          numericCard,
        });
        assignedSlot = resolved;
        const userBuf = buildZkUserBuffer72({
          uid: resolved.uid,
          userId: resolved.userId,
          name: cleanName,
          cardno: numericCard,
          role,
        });
        await zk.executeCmd(8, userBuf); // CMD_USER_WRQ = 8
        await zk.executeCmd(1013, "");   // CMD_REFRESHDATA = 1013
        await zk.disconnect();
      })(), 4500, zk);
      results.push({ device: dev.name, ok: true, uid: assignedSlot?.uid, userId: assignedSlot?.userId, cardno: numericCard });
    } catch (err) {
      try { zk?.socket?.destroy(); } catch {}
      results.push({ device: dev.name, ok: false, error: err.message, queuedInAdms: true });
    }
  }
  return results;
}

export async function syncStudentCardToZkteco({ studentId, studentName, cardId, cardNumber }) {
  const rawCard = String(cardNumber || cardId || "").replace(/\D/g, "");
  return syncCardToZktecoDevices({
    preferredUid: Number(studentId) || 1,
    userId: String(studentId || cardId),
    name: studentName || `Student ${studentId}`,
    cardNumber: rawCard,
    role: 0,
  });
}

export async function syncStaffCardToZkteco({ staffId, fullName, cardNumber, deviceUserId }) {
  const rawCard = String(cardNumber || "").replace(/\D/g, "");
  const staffUid = Number(deviceUserId) || (9000 + (Number(staffId) || 1));
  return syncCardToZktecoDevices({
    preferredUid: staffUid,
    userId: String(staffUid),
    name: fullName || `Xodim ${staffId}`,
    cardNumber: rawCard,
    role: 0,
  });
}

export async function syncAllCardsToZkteco(pgPool) {
  const stRes = await pgPool.query(
    `SELECT sc."studentId", sc."cardId", sc."cardNumber", s.fullname
     FROM "StudentCard" sc
     JOIN "Student" s ON s.id = sc."studentId"
     WHERE sc."isActive" = true AND s."isDeleted" = false`
  );
  const staffRes = await pgPool.query(
    `SELECT id AS "staffId", "fullName", "rfidCardNumber", COALESCE("zktecoUid", 9000 + id) AS "zktecoUid"
     FROM "StaffAccount"
     WHERE "isDeleted" = false AND "isActive" = true
       AND "rfidCardNumber" IS NOT NULL AND TRIM("rfidCardNumber") <> ''`
  );
  const empCardRes = await pgPool.query(
    `SELECT ec."employeeId", ec."cardId", ec."cardNumber", e.fullname
     FROM "EmployeeCard" ec
     JOIN "Employee" e ON e.id = ec."employeeId"
     WHERE ec."isActive" = true AND e."isDeleted" = false`
  );

  const itemsToSync = [];
  for (const c of stRes.rows || []) {
    const rawCard = String(c.cardNumber || c.cardId || "").replace(/\D/g, "");
    if (!rawCard) continue;
    itemsToSync.push({
      preferredUid: Number(c.studentId),
      userId: String(c.studentId),
      name: c.fullname || `Student ${c.studentId}`,
      numericCard: Number(rawCard) || 0,
    });
  }
  const seenStaffCards = new Set();
  for (const s of staffRes.rows || []) {
    const rawCard = String(s.rfidCardNumber || "").replace(/\D/g, "");
    const numCard = Number(rawCard) || 0;
    if (!numCard) continue;
    seenStaffCards.add(numCard);
    itemsToSync.push({
      preferredUid: Number(s.zktecoUid) || (9000 + Number(s.staffId)),
      userId: String(s.zktecoUid || (9000 + Number(s.staffId))),
      name: s.fullName || `Xodim ${s.staffId}`,
      numericCard: numCard,
    });
  }
  for (const ec of empCardRes.rows || []) {
    const rawCard = String(ec.cardNumber || ec.cardId || "").replace(/\D/g, "");
    const numCard = Number(rawCard) || 0;
    if (!numCard || seenStaffCards.has(numCard)) continue;
    itemsToSync.push({
      preferredUid: 9500 + Number(ec.employeeId),
      userId: String(ec.cardId || (9500 + Number(ec.employeeId))),
      name: ec.fullname || `Xodim ${ec.employeeId}`,
      numericCard: numCard,
    });
  }

  const summary = [];
  for (const dev of ZKTECO_DEVICES) {
    const zk = new ZKLibTCP(dev.ip, dev.port, 4000);
    let synced = 0;
    try {
      await withZkTimeout((async () => {
        await connectZkWithAuth(zk, dev.commKey);
        let existingUsers = [];
        try {
          const uResp = await zk.getUsers();
          existingUsers = uResp?.data || [];
        } catch {}
        for (const item of itemsToSync) {
          const resolved = resolveDeviceUidForCard(existingUsers, {
            preferredUid: item.preferredUid,
            userId: item.userId,
            numericCard: item.numericCard,
          });
          const cleanName = String(item.name || "")
            .normalize("NFKD")
            .replace(/[^\x20-\x7E]/g, "")
            .trim()
            .slice(0, 23);
          const existingIdx = existingUsers.findIndex((u) => Number(u.uid) === resolved.uid);
          const cur = existingIdx >= 0 ? existingUsers[existingIdx] : null;
          if (
            cur &&
            Number(cur.cardno) === Number(item.numericCard) &&
            String(cur.userId) === String(resolved.userId) &&
            String(cur.name || "").trim() === cleanName
          ) {
            synced++;
            continue;
          }
          const userBuf = buildZkUserBuffer72({
            uid: resolved.uid,
            userId: resolved.userId,
            name: item.name,
            cardno: item.numericCard,
          });
          await zk.executeCmd(8, userBuf);
          const updatedEntry = { uid: resolved.uid, userId: resolved.userId, name: cleanName, cardno: item.numericCard };
          if (existingIdx >= 0) existingUsers[existingIdx] = updatedEntry;
          else existingUsers.push(updatedEntry);
          synced++;
        }
        await zk.executeCmd(1013, "");
        await zk.disconnect();
      })(), 45000, zk);
      summary.push({ device: dev.name, ok: true, synced });
    } catch (err) {
      try { zk?.socket?.destroy(); } catch {}
      summary.push({ device: dev.name, ok: false, synced, error: err.message });
    }
  }
  return {
    totalCards: itemsToSync.length,
    studentCardsCount: (stRes.rows || []).length,
    staffCardsCount: itemsToSync.length - (stRes.rows || []).length,
    devices: summary,
  };
}

export async function fetchRecentZktecoCards(pgPool) {
  const assignedRes = await pgPool.query(
    `SELECT sc."cardId", sc."cardNumber", sc."studentId", s.fullname
     FROM "StudentCard" sc
     LEFT JOIN "Student" s ON s.id = sc."studentId"
     WHERE sc."isActive" = true`
  );
  const staffRes = await pgPool.query(
    `SELECT id AS "staffId", "fullName", "rfidCardNumber", COALESCE("zktecoUid", 9000 + id) AS "zktecoUid"
     FROM "StaffAccount"
     WHERE "isDeleted" = false AND "rfidCardNumber" IS NOT NULL AND TRIM("rfidCardNumber") <> ''`
  );

  const assignedByCard = new Map();
  const assignedByUid = new Map();
  for (const r of assignedRes.rows || []) {
    const entry = { studentId: r.studentId, fullname: r.fullname, ownerType: "STUDENT" };
    if (r.cardId) assignedByCard.set(String(r.cardId), entry);
    if (r.cardNumber) {
      assignedByCard.set(String(r.cardNumber), entry);
      assignedByCard.set(String(r.cardNumber).padStart(10, "0"), entry);
    }
    if (r.studentId) assignedByUid.set(String(r.studentId), entry);
  }
  for (const s of staffRes.rows || []) {
    const cleanNum = String(s.rfidCardNumber || "").replace(/\D/g, "");
    const numVal = Number(cleanNum) || 0;
    const entry = {
      studentId: s.zktecoUid,
      staffId: s.staffId,
      fullname: `${s.fullName} (Xodim)`,
      ownerType: "STAFF",
    };
    if (numVal > 0) {
      assignedByCard.set(String(numVal), entry);
      assignedByCard.set(String(numVal).padStart(10, "0"), entry);
    }
    if (s.zktecoUid) assignedByUid.set(String(s.zktecoUid), entry);
  }

  const deviceUsers = [];
  const recentLogs = [];

  await Promise.all(
    ZKTECO_DEVICES.map(async (dev) => {
      const zk = new ZKLibTCP(dev.ip, dev.port, 3000);
      try {
        await withZkTimeout((async () => {
          await connectZkWithAuth(zk, dev.commKey);
          const info = await zk.getInfo();
          const userById = new Map();
          if (info?.userCounts > 0) {
            const usersResp = await zk.getUsers();
            const users = (usersResp?.data || []).slice().reverse();
            for (const u of users) {
              userById.set(String(u.userId), u);
              if ((u.cardno && Number(u.cardno) > 0) || u.userId) {
                const cardStr = u.cardno && Number(u.cardno) > 0 ? String(u.cardno) : "";
                const card10 = cardStr ? cardStr.padStart(10, "0") : "";
                const dbMatch =
                  (cardStr && assignedByCard.get(cardStr)) ||
                  (card10 && assignedByCard.get(card10)) ||
                  assignedByCard.get(String(u.userId)) ||
                  assignedByUid.get(String(u.userId));
                deviceUsers.push({
                  device: dev.name,
                  uid: u.uid,
                  userId: String(u.userId),
                  nameOnDevice: u.name || "",
                  cardNumber: cardStr || String(u.userId),
                  cardNumber10: card10 || String(u.userId).padStart(10, "0"),
                  ownerType: dbMatch?.ownerType || null,
                  studentId: dbMatch?.studentId || null,
                  studentName: dbMatch?.fullname || null,
                  assignedStudentId: dbMatch?.studentId || null,
                  assignedStudentName: dbMatch?.fullname || null,
                });
              }
            }
          }
          if (info?.logCounts > 0) {
            const attResp = await zk.getAttendances();
            const logs = (attResp?.data || []).slice(-25).reverse();
            for (const l of logs) {
              const u = userById.get(String(l.deviceUserId));
              const cardStr = u?.cardno ? String(u.cardno) : String(l.deviceUserId);
              const card10 = u?.cardno ? String(u.cardno).padStart(10, "0") : "";
              const dbMatch =
                assignedByCard.get(cardStr) ||
                (card10 && assignedByCard.get(card10)) ||
                assignedByUid.get(String(l.deviceUserId));
              recentLogs.push({
                device: dev.name,
                userId: String(l.deviceUserId),
                deviceUserId: String(l.deviceUserId),
                cardNumber: cardStr,
                cardNumber10: card10 || cardStr.padStart(10, "0"),
                nameOnDevice: u?.name || "",
                recordTime: l.recordTime,
                ownerType: dbMatch?.ownerType || null,
                studentId: dbMatch?.studentId || null,
                studentName: dbMatch?.fullname || null,
                assignedStudentId: dbMatch?.studentId || null,
                assignedStudentName: dbMatch?.fullname || null,
              });
            }
          }
          await zk.disconnect();
        })(), 5000, zk);
      } catch {
        try { zk?.socket?.destroy(); } catch {}
      }
    })
  );

  const unassigned = deviceUsers.filter((u) => !u.studentId);
  const assigned = deviceUsers.filter((u) => u.studentId);
  const items = [...recentLogs, ...unassigned, ...assigned].slice(0, 40);

  return {
    items,
    recentLogs: recentLogs.slice(0, 25),
    unassignedDeviceCards: unassigned,
    allDeviceCards: deviceUsers,
  };
}

let _lastKirishSize = null;
let _kirishPollBusy = false;

export async function pollKirishTurnstileLive(pgPool) {
  if (_kirishPollBusy) return;
  _kirishPollBusy = true;
  const zk = new ZKLibTCP("192.168.1.53", 4370, 3000);
  try {
    await connectZkWithAuth(zk, 0);
    const size = await zk.getAttendanceSize();
    if (!Number.isFinite(size)) {
      await zk.disconnect();
      return;
    }
    if (_lastKirishSize === null) {
      _lastKirishSize = size;
      await zk.disconnect();
      return;
    }
    if (size > _lastKirishSize) {
      let lastDeviceUserId = null;
      try {
        const attResp = await zk.getAttendances();
        const logs = attResp?.data || [];
        if (logs.length > 0) {
          lastDeviceUserId = String(logs[logs.length - 1].deviceUserId || "").trim();
        }
      } catch {}
      await zk.disconnect();
      _lastKirishSize = size;

      // Check if the card scanned at Kirish belongs to a Staff / Employee
      if (lastDeviceUserId) {
        const staffRes = await pgPool.query(
          `SELECT s.id, s."fullName", s."rfidCardNumber"
           FROM "StaffAccount" s
           LEFT JOIN "EmployeeCard" ec ON ec."employeeId" = s."crmEmployeeId"
           WHERE s."isDeleted" = false AND s."isActive" = true
             AND (
               COALESCE(s."zktecoUid", 9000 + s.id)::text = $1
               OR REGEXP_REPLACE(COALESCE(s."rfidCardNumber", ), D, , g) = REGEXP_REPLACE($1, ^0+, )
               OR ec."cardId" = $1
               OR ec."cardNumber"::text = $1
             )
           LIMIT 1`,
          [lastDeviceUserId]
        );
        if (staffRes.rows[0]) {
          console.log(`[Kirish Turnstile] Xodim kartasi tasdiqlandi: ${staffRes.rows[0].fullName} (ID=${lastDeviceUserId})`);
          return;
        }
      }

      const ist = getIstanbulParts(new Date());
      const isNight = ist.hour >= 22 || ist.hour < 5 || (ist.hour === 5 && ist.minute <= 30);
      if (isNight) {
        console.log(`[Kirish Turnstile] Kechki kirish aniqlandi (size=${size}, userId=${lastDeviceUserId}, vaqt=${ist.timeStr}) -> 4 ta rasm olinmoqda...`);
        await captureSixGatePhotos(pgPool, {
          cardId: lastDeviceUserId || null,
          note: `Kirish eshigi turniketidan karta urildi (${ist.timeStr})`,
        });
      }
    } else {
      await zk.disconnect();
    }
  } catch {
    try { await zk.disconnect(); } catch {}
  } finally {
    _kirishPollBusy = false;
  }
}

let _canteenMasjidBusy = false;
const _lastLogCountByDevice = new Map();

export async function pollOshxonaAndMasjidTurnstilesLive(pgPool, { forceFullScan = false } = {}) {
  if (_canteenMasjidBusy) return;
  _canteenMasjidBusy = true;

  try {
    const devicesToPoll = [
      { id: "canteen", type: "CANTEEN", ip: "192.168.1.52", port: 8081, commKey: 2026, clockOffsetHours: -5 },
      { id: "mosque", type: "MOSQUE", ip: "192.168.1.172", port: 8082, commKey: 2026, clockOffsetHours: 0 },
    ];

    // Load student cards mapping
    const cardsRes = await pgPool.query(
      `SELECT sc."cardId", sc."cardNumber", sc."studentId", s.fullname
       FROM "StudentCard" sc
       JOIN "Student" s ON s.id = sc."studentId"
       WHERE sc."isActive" = true`
    );
    const mapByKey = new Map();
    for (const r of cardsRes.rows || []) {
      const entry = { ...r, isStaff: false };
      if (r.cardId) mapByKey.set(String(r.cardId), entry);
      if (r.cardNumber) {
        mapByKey.set(String(r.cardNumber), entry);
        mapByKey.set(String(r.cardNumber).padStart(10, "0"), entry);
      }
      if (r.studentId) mapByKey.set(String(r.studentId), entry);
    }

    // Load staff / employee cards mapping
    const staffCardsRes = await pgPool.query(
      `SELECT
         s.id AS "staffId",
         s."fullName" AS fullname,
         s."rfidCardNumber",
         COALESCE(s."zktecoUid", 9000 + s.id) AS "zktecoUid",
         s."crmEmployeeId"
       FROM "StaffAccount" s
       WHERE s."isDeleted" = false AND s."isActive" = true
         AND s."rfidCardNumber" IS NOT NULL AND TRIM(s."rfidCardNumber") <> ''`
    );
    for (const sr of staffCardsRes.rows || []) {
      const cleanCard = String(sr.rfidCardNumber || "").replace(/\D/g, "");
      const numCard = Number(cleanCard) || 0;
      const entry = {
        isStaff: true,
        staffId: sr.staffId,
        employeeId: sr.crmEmployeeId || null,
        fullname: sr.fullName,
        cardId: cleanCard ? cleanCard.padStart(10, "0") : String(sr.zktecoUid),
        cardNumber: numCard,
      };
      mapByKey.set(String(sr.zktecoUid), entry);
      if (numCard > 0) {
        mapByKey.set(String(numCard), entry);
        mapByKey.set(String(numCard).padStart(10, "0"), entry);
      }
    }

    const empCardsRes = await pgPool.query(
      `SELECT ec."employeeId", ec."cardId", ec."cardNumber", e.fullname
       FROM "EmployeeCard" ec
       JOIN "Employee" e ON e.id = ec."employeeId"
       WHERE ec."isActive" = true AND e."isDeleted" = false`
    );
    for (const er of empCardsRes.rows || []) {
      const entry = {
        isStaff: true,
        employeeId: er.employeeId,
        fullname: er.fullname,
        cardId: String(er.cardId || er.cardNumber || ""),
        cardNumber: er.cardNumber,
      };
      if (er.cardId && !mapByKey.has(String(er.cardId))) mapByKey.set(String(er.cardId), entry);
      if (er.cardNumber) {
        if (!mapByKey.has(String(er.cardNumber))) mapByKey.set(String(er.cardNumber), entry);
        const p10 = String(er.cardNumber).padStart(10, "0");
        if (!mapByKey.has(p10)) mapByKey.set(p10, entry);
      }
    }

    for (const dev of devicesToPoll) {
      const zk = new ZKLibTCP(dev.ip, dev.port, 3500);
      try {
        await withZkTimeout((async () => {
          await connectZkWithAuth(zk, dev.commKey);
          const info = await zk.getInfo();
          const currentCount = Number(info?.logCounts || 0);
          const prevCount = _lastLogCountByDevice.get(dev.id);

          if (!forceFullScan && prevCount !== undefined && currentCount <= prevCount) {
            await zk.disconnect();
            return;
          }

          const newCount = prevCount !== undefined ? Math.max(5, currentCount - prevCount + 5) : 30;
          const attResp = await zk.getAttendances();
          let devUsersById = new Map();
          try {
            const uResp = await zk.getUsers();
            for (const u of uResp?.data || []) {
              devUsersById.set(String(u.userId), u);
            }
          } catch {}
          await zk.disconnect();
          _lastLogCountByDevice.set(dev.id, currentCount);

          const logs = (attResp?.data || []).slice(-newCount);
          for (const log of logs) {
            const devUserId = String(log.deviceUserId || "").trim();
            const devUser = devUsersById.get(devUserId);
            const devCardNo = devUser?.cardno ? String(devUser.cardno) : null;
            const match = mapByKey.get(devUserId) || (devCardNo ? mapByKey.get(devCardNo) : null);
            if (!match) continue;

            const rawDate = new Date(log.recordTime);
            if (isNaN(rawDate.getTime())) continue;

            // Apply device clock offset (Oshxona 192.168.1.52 is 5 hours ahead of Istanbul time)
            const adjustedUtc = new Date(rawDate.getTime() + (dev.clockOffsetHours || 0) * 3600 * 1000);
            const ist = getIstanbulParts(adjustedUtc);
            const mins = ist.hour * 60 + ist.minute;

            if (dev.type === "CANTEEN") {
              let mealType = null;
              if (mins >= 5 * 60 && mins <= 10 * 60 + 30) mealType = "BREAKFAST";
              else if (mins >= 11 * 60 + 30 && mins <= 15 * 60 + 30) mealType = "LUNCH";
              else if (mins >= 17 * 60 && mins <= 22 * 60) mealType = "DINNER";

              if (!mealType) continue;

              if (match.isStaff) {
                if (!match.employeeId) continue;
                const empExists = await pgPool.query(
                  `SELECT id FROM "EmployeeMealRecord"
                   WHERE "employeeId" = $1
                     AND "mealType"::text = $2
                     AND TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') = $3
                   LIMIT 1`,
                  [match.employeeId, mealType, ist.dateStr]
                );
                if (empExists.rows.length === 0) {
                  await pgPool.query(
                    `INSERT INTO "EmployeeMealRecord" ("employeeId", "employeeName", "cardId", "mealType", "timestamp")
                     VALUES ($1, $2, $3, $4::"MealType", $5)`,
                    [match.employeeId, match.fullname, match.cardId || devUserId, mealType, adjustedUtc]
                  );
                  console.log(`[Live Turnstile Oshxona - Xodim] ${match.fullname} (${devUserId}) -> ${mealType} (${ist.dateStr} ${ist.timeSecStr})`);
                }
                continue;
              }

              if (!match.studentId) continue;
              const existsRes = await pgPool.query(
                `SELECT id FROM "MealRecord"
                 WHERE "studentId" = $1
                   AND "mealType"::text = $2
                   AND TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') = $3
                 LIMIT 1`,
                [match.studentId, mealType, ist.dateStr]
              );
              if (existsRes.rows.length === 0) {
                await pgPool.query(
                  `INSERT INTO "MealRecord" ("studentId", "studentName", "cardId", "mealType", "timestamp")
                   VALUES ($1, $2, $3, $4::"MealType", $5)`,
                  [match.studentId, match.fullname, match.cardId || devUserId, mealType, adjustedUtc]
                );
                console.log(`[Live Turnstile Oshxona] ${match.fullname} (${devUserId}) -> ${mealType} (${ist.dateStr} ${ist.timeSecStr})`);
              }
            } else if (dev.type === "MOSQUE") {
              const cfgRes = await pgPool.query(
                `SELECT "prayerType"::text AS "prayerType", "startTime", "endTime"
                 FROM "PrayerTimeConfig" WHERE "isActive" = true`
              );
              let matchedPrayer = null;
              for (const c of cfgRes.rows) {
                const [sh, sm] = String(c.startTime).split(":").map(Number);
                const [eh, em] = String(c.endTime).split(":").map(Number);
                if (mins >= sh * 60 + sm && mins <= eh * 60 + em) {
                  matchedPrayer = c.prayerType;
                  break;
                }
              }
              if (!matchedPrayer) continue;

              if (match.isStaff) {
                console.log(`[Live Turnstile Masjid - Xodim] ${match.fullname} (${devUserId}) -> ${matchedPrayer} (${ist.dateStr} ${ist.timeSecStr})`);
                continue;
              }

              if (!match.studentId) continue;
              const existsPrayer = await pgPool.query(
                `SELECT id FROM "PrayerRecord"
                 WHERE "studentId" = $1
                   AND "prayerType"::text = $2
                   AND TO_CHAR("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') = $3
                 LIMIT 1`,
                [match.studentId, matchedPrayer, ist.dateStr]
              );
              if (existsPrayer.rows.length === 0) {
                await pgPool.query(
                  `INSERT INTO "PrayerRecord" ("studentId", "studentName", "cardId", "prayerType", "timestamp")
                   VALUES ($1, $2, $3, $4::"PrayerType", $5)`,
                  [match.studentId, match.fullname, match.cardId || devUserId, matchedPrayer, adjustedUtc]
                );
                console.log(`[Live Turnstile Masjid] ${match.fullname} (${devUserId}) -> ${matchedPrayer} (${ist.dateStr} ${ist.timeSecStr})`);
              }
            }
          }
        })(), 6000, zk);
      } catch {
        try { zk?.socket?.destroy(); } catch {}
      }
    }
  } catch (err) {
    console.error("[pollOshxonaAndMasjidTurnstilesLive] error:", err?.message);
  } finally {
    _canteenMasjidBusy = false;
  }
}
