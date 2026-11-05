import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const BACKUP_DIR = "/srv/data/backup/daily";
const CRM_ENV_PATH = "/srv/data/mezana-space/var/www/mezana-crm/backend/.env";
const ERP_ENV_PATH = "/srv/data/apps/moliy/.env";
const BOT_ENV_PATH = "/srv/data/apps/mezana-platform/apps/telegram-bot/.env";
const BFF_ENV_PATH = "/srv/data/apps/mezana-platform/apps/finance-bff/.env";

function readEnvFile(filePath) {
  const map = {};
  try {
    if (!fs.existsSync(filePath)) return map;
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      map[key] = val;
    }
  } catch {}
  return map;
}

function getDbUrls() {
  const crmEnv = readEnvFile(CRM_ENV_PATH);
  const erpEnv = readEnvFile(ERP_ENV_PATH);
  const botEnv = readEnvFile(BOT_ENV_PATH);

  const cleanUrl = (u, fallback) => {
    const raw = u || fallback;
    return raw.split("?")[0];
  };

  let erpUrl = cleanUrl(erpEnv.DATABASE_URL, "postgresql://moliy_user:Moliy2026Secure2026@127.0.0.1:5432/moliy_db");
  erpUrl = erpUrl
    .replace("@host.docker.internal:", "@127.0.0.1:")
    .replace("@postgres:", "@127.0.0.1:")
    .replace("@localhost:", "@127.0.0.1:");

  return {
    crmMezana: cleanUrl(crmEnv.DATABASE_URL, "postgresql://postgres@127.0.0.1:5432/mezana"),
    erpFinancebot: erpUrl,
    mezanaPlatform: cleanUrl(botEnv.DATABASE_URL, "postgresql://mezana:mezana_local_2026@127.0.0.1:5432/mezana_platform"),
  };
}

function getBotToken() {
  const botEnv = readEnvFile(BOT_ENV_PATH);
  const bffEnv = readEnvFile(BFF_ENV_PATH);
  const platEnv = readEnvFile("/srv/data/apps/mezana-platform/.env.platform.local");
  return (
    process.env.TELEGRAM_BOT_TOKEN ||
    bffEnv.TELEGRAM_BOT_TOKEN ||
    botEnv.TELEGRAM_BOT_TOKEN ||
    platEnv.GATE_TELEGRAM_BOT_TOKEN ||
    botEnv.BOT_TOKEN ||
    ""
  );
}

function getBackupRecipientChatIds() {
  // Director (Dr. Omir: 975535813) and Developer/Admin (8917275156)
  const ids = new Set(["975535813", "8917275156"]);
  const extra = process.env.BACKUP_TELEGRAM_CHAT_IDS || "";
  for (const part of extra.split(",")) {
    const clean = part.trim();
    if (clean) ids.add(clean);
  }
  return Array.from(ids);
}

function getIstanbulParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    parts[p.type] = p.value;
  }
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    timeStr: `${parts.hour}:${parts.minute}:${parts.second}`,
    compactTime: `${parts.hour}${parts.minute}`,
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
  };
}

export function listBackups() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".tar.gz") && f.startsWith("mezana_full_backup_"))
      .map((fileName) => {
        const fullPath = path.join(BACKUP_DIR, fileName);
        const stat = fs.statSync(fullPath);
        const sizeMb = Number((stat.size / (1024 * 1024)).toFixed(2));
        let meta = null;
        const metaPath = fullPath.replace(/\.tar\.gz$/, ".json");
        if (fs.existsSync(metaPath)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          } catch {}
        }
        return {
          fileName,
          fullPath,
          sizeBytes: stat.size,
          sizeMb,
          createdAt: stat.mtime.toISOString(),
          meta,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return files;
  } catch (e) {
    console.error("[backupService] listBackups error:", e?.message);
    return [];
  }
}

function pruneOldBackups(keepCount = 14) {
  const all = listBackups();
  if (all.length <= keepCount) return;
  for (const item of all.slice(keepCount)) {
    try {
      fs.unlinkSync(item.fullPath);
      const metaPath = item.fullPath.replace(/\.tar\.gz$/, ".json");
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    } catch {}
  }
}

async function sendBackupToTelegram({ filePath, fileName, meta }) {
  const token = getBotToken();
  if (!token) {
    console.warn("[backupService] No TELEGRAM_BOT_TOKEN found, skipping Telegram upload");
    return { sent: false, error: "Token topilmadi" };
  }

  const chatIds = getBackupRecipientChatIds();
  const fileBuffer = fs.readFileSync(filePath);
  const results = [];

  const captionLines = [
    `🛡 <b>MEZANA TO'LIQ ZAHIRA NUSXASI (FULL BACKUP)</b>`,
    `📅 <b>Sana:</b> ${meta.istanbulDate} (${meta.istanbulTime} IST)`,
    `📦 <b>Umumiy hajmi:</b> <b>${meta.totalSizeMb} MB</b>`,
    ``,
    `📊 <b>Tarkibi:</b>`,
    `• 🗄 <b>Ma'lumotlar bazalari (3 ta DB):</b> ${meta.dbSizeMb} MB`,
    `   ├ CRM (<code>mezana</code>): ${meta.Breakdown?.crmDbMb ?? "-"} MB`,
    `   ├ Moliya ERP (<code>financebot</code>): ${meta.Breakdown?.erpDbMb ?? "-"} MB`,
    `   └ Platforma & Vaqf (<code>mezana_platform</code>): ${meta.Breakdown?.platformDbMb ?? "-"} MB`,
    `• 💻 <b>Barcha tizim kodlari (Frontend, BFF, Bot, Vaqf, CRM):</b> ${meta.codeSizeMb} MB`,
    `• 🔑 <b>Tokenlar, parollar, .env va sessiyalar:</b> ${meta.secretsSizeKb} KB`,
    ``,
    `💡 <i>Mabodo tizimni shu nuqtaga qaytarish kerak bo'lsa, pastdagi tugmani bosing:</i>`,
  ];
  const caption = captionLines.join("\n");

  const replyMarkup = JSON.stringify({
    inline_keyboard: [
      [
        {
          text: "♻️ Shu zahiradan qayta tiklash (1-Click Restore)",
          callback_data: `sys:restore:ask:${fileName}`,
        },
      ],
      [
        {
          text: "📦 Yangi zahira olish",
          callback_data: `sys:backup:now`,
        },
      ],
    ],
  });

  for (const chatId of chatIds) {
    try {
      const form = new FormData();
      form.append("chat_id", String(chatId));
      form.append("caption", caption);
      form.append("parse_mode", "HTML");
      form.append("reply_markup", replyMarkup);
      const blob = new Blob([fileBuffer], { type: "application/gzip" });
      form.append("document", blob, fileName);

      const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      results.push({ chatId, ok: Boolean(data?.ok), messageId: data?.result?.message_id, description: data?.description });
    } catch (err) {
      results.push({ chatId, ok: false, error: err?.message });
    }
  }

  return { sent: results.some((r) => r.ok), results };
}

export async function createFullBackup({ sendToTelegram = true, reason = "scheduled" } = {}) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const { dateStr, timeStr, compactTime } = getIstanbulParts(new Date());
  const baseName = `mezana_full_backup_${dateStr}_${compactTime}`;
  const fileName = `${baseName}.tar.gz`;
  const finalTarPath = path.join(BACKUP_DIR, fileName);
  const metaPath = path.join(BACKUP_DIR, `${baseName}.json`);
  const workDir = path.join(BACKUP_DIR, `tmp_${baseName}_${Date.now()}`);

  const dbDir = path.join(workDir, "databases");
  const secretsDir = path.join(workDir, "secrets_and_env");
  const codeDir = path.join(workDir, "code");

  fs.mkdirSync(dbDir, { recursive: true });
  fs.mkdirSync(secretsDir, { recursive: true });
  fs.mkdirSync(codeDir, { recursive: true });

  const dbUrls = getDbUrls();

  try {
    // 1. Dump all 3 PostgreSQL databases
    const crmDumpPath = path.join(dbDir, "crm_mezana.sql.gz");
    const erpDumpPath = path.join(dbDir, "erp_financebot.sql.gz");
    const platDumpPath = path.join(dbDir, "mezana_platform.sql.gz");

    execSync(`pg_dump --clean --if-exists --no-owner --no-privileges "${dbUrls.crmMezana}" | gzip -9 > "${crmDumpPath}"`, {
      stdio: "pipe",
      timeout: 120000,
    });
    execSync(`pg_dump --clean --if-exists --no-owner --no-privileges "${dbUrls.erpFinancebot}" | gzip -9 > "${erpDumpPath}"`, {
      stdio: "pipe",
      timeout: 120000,
    });
    execSync(`pg_dump --clean --if-exists --no-owner --no-privileges "${dbUrls.mezanaPlatform}" | gzip -9 > "${platDumpPath}"`, {
      stdio: "pipe",
      timeout: 120000,
    });

    // 2. Copy all secrets, tokens, passwords, .env files, and PM2 configs
    const secretFilesToCopy = [
      { src: "/srv/data/apps/mezana-platform/apps/finance-bff/.env", dst: "finance-bff.env" },
      { src: "/srv/data/apps/mezana-platform/apps/finance-bff/.sessions.json", dst: "finance-bff.sessions.json" },
      { src: "/srv/data/apps/mezana-platform/apps/finance-bff/.user_passwords.json", dst: "finance-bff.user_passwords.json" },
      { src: "/srv/data/apps/mezana-platform/apps/finance-bff/.staff_extra.json", dst: "finance-bff.staff_extra.json" },
      { src: "/srv/data/apps/mezana-platform/apps/telegram-bot/.env", dst: "telegram-bot.env" },
      { src: "/srv/data/apps/moliy/.env", dst: "moliy-erp.env" },
      { src: "/srv/data/mezana-space/var/www/mezana-crm/backend/.env", dst: "mezana-crm-backend.env" },
      { src: "/home/mezana/.pm2/dump.pm2", dst: "pm2-dump.pm2" },
    ];

    for (const item of secretFilesToCopy) {
      try {
        if (fs.existsSync(item.src)) {
          fs.copyFileSync(item.src, path.join(secretsDir, item.dst));
        }
      } catch {}
    }

    // Also write a human-readable credentials & recovery manifest inside secrets_and_env
    const manifestTxt = [
      `MEZANA PLATFORM FULL RECOVERY MANIFEST`,
      `Generated: ${dateStr} ${timeStr} (Europe/Istanbul)`,
      `Reason: ${reason}`,
      ``,
      `1. DATABASES:`,
      `   - CRM (mezana): ${dbUrls.crmMezana}`,
      `   - ERP (financebot): ${dbUrls.erpFinancebot}`,
      `   - Platform & Vaqf (mezana_platform): ${dbUrls.mezanaPlatform}`,
      ``,
      `2. RESTORE COMMANDS (if restoring manually via CLI):`,
      `   gunzip -c databases/crm_mezana.sql.gz | psql "${dbUrls.crmMezana}"`,
      `   gunzip -c databases/erp_financebot.sql.gz | psql "${dbUrls.erpFinancebot}"`,
      `   gunzip -c databases/mezana_platform.sql.gz | psql "${dbUrls.mezanaPlatform}"`,
    ].join("\n");
    fs.writeFileSync(path.join(secretsDir, "RECOVERY_README.txt"), manifestTxt, "utf8");

    // 3. Archive source code (mezana-platform + mezana-crm backend/frontend src)
    const codeTarPath = path.join(codeDir, "mezana_platform_code.tar.gz");
    execSync(
      `tar -czf "${codeTarPath}" ` +
        `--exclude="node_modules" --exclude=".git" --exclude="dist" --exclude=".next" --exclude="*.log" ` +
        `--exclude="late-photos" --exclude="*.onnx" --exclude=".venv" --exclude="venv" --exclude="uploads" ` +
        `-C /srv/data/apps mezana-platform`,
      { stdio: "pipe", timeout: 120000 }
    );

    const crmCodeTarPath = path.join(codeDir, "mezana_crm_code.tar.gz");
    if (fs.existsSync("/srv/data/mezana-space/var/www/mezana-crm")) {
      try {
        execSync(
          `tar -czf "${crmCodeTarPath}" ` +
            `--exclude="node_modules" --exclude=".git" --exclude="dist" --exclude="uploads" --exclude="*.log" ` +
            `-C /srv/data/mezana-space/var/www mezana-crm`,
          { stdio: "pipe", timeout: 120000 }
        );
      } catch {}
    }

    // Calculate sizes
    const crmDbBytes = fs.existsSync(crmDumpPath) ? fs.statSync(crmDumpPath).size : 0;
    const erpDbBytes = fs.existsSync(erpDumpPath) ? fs.statSync(erpDumpPath).size : 0;
    const platDbBytes = fs.existsSync(platDumpPath) ? fs.statSync(platDumpPath).size : 0;
    const totalDbBytes = crmDbBytes + erpDbBytes + platDbBytes;

    const codeBytes =
      (fs.existsSync(codeTarPath) ? fs.statSync(codeTarPath).size : 0) +
      (fs.existsSync(crmCodeTarPath) ? fs.statSync(crmCodeTarPath).size : 0);

    let secretsBytes = 0;
    for (const f of fs.readdirSync(secretsDir)) {
      secretsBytes += fs.statSync(path.join(secretsDir, f)).size;
    }

    // 4. Create final single .tar.gz bundle
    execSync(`tar -czf "${finalTarPath}" -C "${workDir}" databases secrets_and_env code`, {
      stdio: "pipe",
      timeout: 120000,
    });

    const finalStat = fs.statSync(finalTarPath);
    const meta = {
      fileName,
      reason,
      createdAt: new Date().toISOString(),
      istanbulDate: dateStr,
      istanbulTime: timeStr,
      totalBytes: finalStat.size,
      totalSizeMb: Number((finalStat.size / (1024 * 1024)).toFixed(2)),
      dbSizeMb: Number((totalDbBytes / (1024 * 1024)).toFixed(2)),
      codeSizeMb: Number((codeBytes / (1024 * 1024)).toFixed(2)),
      secretsSizeKb: Number((secretsBytes / 1024).toFixed(1)),
      Breakdown: {
        crmDbMb: Number((crmDbBytes / (1024 * 1024)).toFixed(2)),
        erpDbMb: Number((erpDbBytes / (1024 * 1024)).toFixed(2)),
        platformDbMb: Number((platDbBytes / (1024 * 1024)).toFixed(2)),
      },
    };

    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");

    // Cleanup temp workDir
    execSync(`rm -rf "${workDir}"`);
    pruneOldBackups(14);

    let telegramResult = null;
    if (sendToTelegram) {
      telegramResult = await sendBackupToTelegram({ filePath: finalTarPath, fileName, meta });
    }

    return {
      ok: true,
      fileName,
      fullPath: finalTarPath,
      meta,
      telegram: telegramResult,
    };
  } catch (err) {
    try {
      if (fs.existsSync(workDir)) execSync(`rm -rf "${workDir}"`);
    } catch {}
    console.error("[backupService] createFullBackup failed:", err);
    return {
      ok: false,
      error: err?.message || "Zahira nusxa olishda xatolik",
    };
  }
}

export async function restoreFromBackup(fileName, { restoreCode = false } = {}) {
  const safeName = path.basename(String(fileName || "").trim());
  const tarPath = path.join(BACKUP_DIR, safeName);
  if (!safeName || !fs.existsSync(tarPath)) {
    throw new Error(`Zahira fayli topilmadi: ${safeName}`);
  }

  // First take a quick safety backup before restoring (without sending to Telegram)
  await createFullBackup({ sendToTelegram: false, reason: `pre_restore_before_${safeName}` });

  const extractDir = path.join(BACKUP_DIR, `restore_tmp_${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });
  const dbUrls = getDbUrls();
  const restored = { databases: [], secrets: [], codeRestored: false };

  try {
    execSync(`tar -xzf "${tarPath}" -C "${extractDir}"`, { stdio: "pipe", timeout: 120000 });

    const crmDump = path.join(extractDir, "databases", "crm_mezana.sql.gz");
    const erpDump = path.join(extractDir, "databases", "erp_financebot.sql.gz");
    const platDump = path.join(extractDir, "databases", "mezana_platform.sql.gz");

    if (fs.existsSync(crmDump)) {
      execSync(`gunzip -c "${crmDump}" | psql "${dbUrls.crmMezana}"`, { stdio: "pipe", timeout: 180000 });
      restored.databases.push("crm_mezana");
    }
    if (fs.existsSync(erpDump)) {
      execSync(`gunzip -c "${erpDump}" | psql "${dbUrls.erpFinancebot}"`, { stdio: "pipe", timeout: 180000 });
      restored.databases.push("erp_financebot");
    }
    if (fs.existsSync(platDump)) {
      execSync(`gunzip -c "${platDump}" | psql "${dbUrls.mezanaPlatform}"`, { stdio: "pipe", timeout: 180000 });
      restored.databases.push("mezana_platform");
    }

    // Restore user passwords & extra staff metadata
    const secretsDir = path.join(extractDir, "secrets_and_env");
    const restoreSecretsMap = [
      { src: "finance-bff.user_passwords.json", dst: "/srv/data/apps/mezana-platform/apps/finance-bff/.user_passwords.json" },
      { src: "finance-bff.staff_extra.json", dst: "/srv/data/apps/mezana-platform/apps/finance-bff/.staff_extra.json" },
    ];
    for (const item of restoreSecretsMap) {
      const sPath = path.join(secretsDir, item.src);
      if (fs.existsSync(sPath)) {
        fs.copyFileSync(sPath, item.dst);
        restored.secrets.push(item.src);
      }
    }

    if (restoreCode) {
      const codeArchive = path.join(extractDir, "code", "mezana_platform_code.tar.gz");
      if (fs.existsSync(codeArchive)) {
        execSync(`tar -xzf "${codeArchive}" -C /srv/data/apps`, { stdio: "pipe", timeout: 120000 });
        restored.codeRestored = true;
      }
    }

    execSync(`rm -rf "${extractDir}"`);
    return {
      ok: true,
      fileName: safeName,
      restored,
      restoredAt: new Date().toISOString(),
    };
  } catch (err) {
    try {
      if (fs.existsSync(extractDir)) execSync(`rm -rf "${extractDir}"`);
    } catch {}
    throw new Error(`Qayta tiklashda xatolik: ${err?.message}`);
  }
}

let lastMidnightBackupDate = "";

export function startMidnightBackupScheduler() {
  // Check every 45 seconds if Istanbul time is 00:00..00:04 and we haven't run today's midnight backup yet
  setInterval(async () => {
    try {
      const { dateStr, hour, minute } = getIstanbulParts(new Date());
      if (hour === 0 && minute <= 4 && lastMidnightBackupDate !== dateStr) {
        lastMidnightBackupDate = dateStr;
        console.log(`[backupService] Starting automatic midnight backup for ${dateStr}...`);
        const res = await createFullBackup({ sendToTelegram: true, reason: `midnight_auto_${dateStr}` });
        console.log(`[backupService] Midnight backup completed:`, res?.fileName, `${res?.meta?.totalSizeMb} MB`);
      }
    } catch (e) {
      console.error("[backupService] Scheduler error:", e?.message);
    }
  }, 45 * 1000);
}
