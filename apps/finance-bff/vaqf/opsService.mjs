import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { query, withTransaction } from "./db.mjs";
import { httpError } from "./service.mjs";
import {
  enqueueOutboxNotification,
  getVaqfTelegramBotToken,
  getVaqfBotUsername,
  maskBotToken,
  sanitizeSecretFromText,
} from "./automationService.mjs";
import {
  getRawPiiSecret,
  getPiiKeyFingerprint,
  encryptPii,
  decryptPii,
} from "./governanceService.mjs";
import { refreshVaqfRoleCache } from "./lifecycleService.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const apiRequire = createRequire(path.join(rootDir, "apps/api/package.json"));
const ExcelJS = apiRequire("exceljs");

const CANARY_PLAINTEXT = "EZAN_VAKFI_PII_CANARY_2026_OK";

// ============================================================================
// 4-QADAM.2: VAQF_PII_KEY TEKSHIRISH VA ALMASHTIRISH (ROTATION)
// ============================================================================
export async function ensurePiiCanaryInitialized(overrideSecret = null) {
  const res = await query(`SELECT value FROM vaqf.settings WHERE key = 'pii_key_canary' LIMIT 1`);
  if (res.rows[0]?.value?.cipher) {
    return res.rows[0].value;
  }
  const secret = getRawPiiSecret(overrideSecret);
  const cipher = encryptPii(CANARY_PLAINTEXT, secret);
  const fp = getPiiKeyFingerprint(secret);
  const val = {
    cipher,
    fingerprint: fp,
    created_at: new Date().toISOString(),
  };
  await query(
    `INSERT INTO vaqf.settings (key, value, updated_by_name, updated_at)
     VALUES ('pii_key_canary', $1::jsonb, 'Tizim', NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(val)]
  );
  return val;
}

export async function verifyVaqfPiiKey(arg = {}) {
  const candidateKey =
    typeof arg === "string"
      ? arg
      : arg && typeof arg === "object"
      ? arg.candidateKey
      : null;
  const secret =
    candidateKey !== null && candidateKey !== undefined
      ? String(candidateKey).trim()
      : getRawPiiSecret();

  if (!secret || secret.length < 8) {
    return {
      ok: false,
      valid: false,
      error: "VAQF_PII_KEY bo'sh yoki juda qisqa",
      keyFingerprint: null,
    };
  }

  // 1. Round-trip self-test
  const samplePlain = `kvkk-check-${Date.now()}`;
  const sampleEnc = encryptPii(samplePlain, secret);
  const sampleDec = decryptPii(sampleEnc, secret);
  if (sampleDec !== samplePlain) {
    return {
      ok: false,
      valid: false,
      error: "AES-256-GCM shifrlash/ochish sinovi muvaffaqiyatsiz tugadi",
      keyFingerprint: getPiiKeyFingerprint(secret),
    };
  }

  // 2. Verify against stored canary in vaqf.settings
  const canary = await ensurePiiCanaryInitialized();
  const canaryDec = decryptPii(canary.cipher, secret);
  if (canaryDec !== CANARY_PLAINTEXT) {
    return {
      ok: false,
      valid: false,
      error: "VAQF_PII_KEY noto'g'ri: bazadagi nazorat yozuvini (pii_key_canary) ochib bo'lmadi",
      keyFingerprint: getPiiKeyFingerprint(secret),
      expectedFingerprint: canary.fingerprint || null,
    };
  }

  // 3. Verify against existing encrypted rows in vaqf.donors & vaqf.leases
  const donorsRes = await query(
    `SELECT id, tax_or_id_encrypted, phone_encrypted, email_encrypted, address_encrypted
     FROM vaqf.donors
     WHERE tax_or_id_encrypted IS NOT NULL OR phone_encrypted IS NOT NULL OR email_encrypted IS NOT NULL
     LIMIT 25`
  );
  for (const row of donorsRes.rows) {
    for (const col of ["tax_or_id_encrypted", "phone_encrypted", "email_encrypted", "address_encrypted"]) {
      if (row[col]) {
        const dec = decryptPii(row[col], secret);
        if (dec === null) {
          return {
            ok: false,
            valid: false,
            error: `vaqf.donors (id=${row.id}, ${col}) shifrini ushbu kalit bilan ochib bo'lmadi`,
            keyFingerprint: getPiiKeyFingerprint(secret),
          };
        }
      }
    }
  }

  const leasesRes = await query(
    `SELECT id, counterparty_tax_or_id_encrypted, counterparty_phone_encrypted, counterparty_address_encrypted
     FROM vaqf.leases
     WHERE counterparty_tax_or_id_encrypted IS NOT NULL OR counterparty_phone_encrypted IS NOT NULL
     LIMIT 25`
  );
  for (const row of leasesRes.rows) {
    for (const col of ["counterparty_tax_or_id_encrypted", "counterparty_phone_encrypted", "counterparty_address_encrypted"]) {
      if (row[col]) {
        const dec = decryptPii(row[col], secret);
        if (dec === null) {
          return {
            ok: false,
            valid: false,
            error: `vaqf.leases (id=${row.id}, ${col}) shifrini ushbu kalit bilan ochib bo'lmadi`,
            keyFingerprint: getPiiKeyFingerprint(secret),
          };
        }
      }
    }
  }

  return {
    ok: true,
    valid: true,
    keyFingerprint: getPiiKeyFingerprint(secret),
    verifiedDonorsCount: donorsRes.rowCount,
    verifiedLeasesCount: leasesRes.rowCount,
  };
}

export async function rotateVaqfPiiKey({ oldKey = null, currentKey = null, nextKey = null } = {}) {
  const currentSecret = oldKey || currentKey || getRawPiiSecret();
  const targetSecret = nextKey || process.env.VAQF_PII_KEY_NEXT || "";
  if (!targetSecret || String(targetSecret).trim().length < 16) {
    throw httpError(400, "Yangi kalit (VAQF_PII_KEY_NEXT) kamida 16 belgidan iborat bo'lishi shart");
  }

  const checkOld = await verifyVaqfPiiKey({ candidateKey: currentSecret });
  if (!checkOld.valid) {
    throw httpError(400, `Joriy VAQF_PII_KEY tekshiruvdan o'tmadi: ${checkOld.error}`);
  }

  return withTransaction(async (tx) => {
    const donorsRes = await tx.query(`SELECT * FROM vaqf.donors FOR UPDATE`);
    let rotatedDonors = 0;
    for (const d of donorsRes.rows) {
      const nextPhone = d.phone_encrypted ? encryptPii(decryptPii(d.phone_encrypted, currentSecret), targetSecret) : null;
      const nextEmail = d.email_encrypted ? encryptPii(decryptPii(d.email_encrypted, currentSecret), targetSecret) : null;
      const nextAddr = d.address_encrypted ? encryptPii(decryptPii(d.address_encrypted, currentSecret), targetSecret) : null;
      const nextTax = d.tax_or_id_encrypted ? encryptPii(decryptPii(d.tax_or_id_encrypted, currentSecret), targetSecret) : null;

      await tx.query(
        `UPDATE vaqf.donors
         SET phone_encrypted = $1,
             email_encrypted = $2,
             address_encrypted = $3,
             tax_or_id_encrypted = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [nextPhone, nextEmail, nextAddr, nextTax, d.id]
      );
      rotatedDonors += 1;
    }

    const leasesRes = await tx.query(`SELECT * FROM vaqf.leases FOR UPDATE`);
    let rotatedLeases = 0;
    for (const l of leasesRes.rows) {
      const nextTax = l.counterparty_tax_or_id_encrypted
        ? encryptPii(decryptPii(l.counterparty_tax_or_id_encrypted, currentSecret), targetSecret)
        : null;
      const nextPhone = l.counterparty_phone_encrypted
        ? encryptPii(decryptPii(l.counterparty_phone_encrypted, currentSecret), targetSecret)
        : null;
      const nextAddr = l.counterparty_address_encrypted
        ? encryptPii(decryptPii(l.counterparty_address_encrypted, currentSecret), targetSecret)
        : null;

      await tx.query(
        `UPDATE vaqf.leases
         SET counterparty_tax_or_id_encrypted = $1,
             counterparty_phone_encrypted = $2,
             counterparty_address_encrypted = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [nextTax, nextPhone, nextAddr, l.id]
      );
      rotatedLeases += 1;
    }

    const newCanary = {
      cipher: encryptPii(CANARY_PLAINTEXT, targetSecret),
      fingerprint: getPiiKeyFingerprint(targetSecret),
      rotated_at: new Date().toISOString(),
    };
    await tx.query(
      `INSERT INTO vaqf.settings (key, value, updated_by_name, updated_at)
       VALUES ('pii_key_canary', $1::jsonb, 'Tizim (Key Rotation)', NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(newCanary)]
    );

    return {
      ok: true,
      oldFingerprint: getPiiKeyFingerprint(currentSecret),
      newFingerprint: getPiiKeyFingerprint(targetSecret),
      rotatedDonors,
      rotatedLeases,
    };
  });
}

// ============================================================================
// 5-QADAM: MONITORING SOZLAMALARI VA TEXNIK MAS'UL OGOHLANTIRISHLARI
// ============================================================================
export async function getSystemMonitoringConfig() {
  const res = await query(`SELECT value FROM vaqf.settings WHERE key = 'system_monitoring' LIMIT 1`);
  const defaults = {
    tech_admin_user_ref: "userumar",
    vaqf_bot_username: getVaqfBotUsername(),
    vaqf_bot_name: "Ezan Vakfi Tizim",
    backup_disk_mount: "/backup",
    backup_local_dir: "/srv/data/backup/vaqf",
    require_separate_backup_disk: true,
    min_free_disk_percent: 15,
    max_backup_age_hours: 26,
    max_pending_outbox_minutes: 15,
    max_failed_outbox_count: 5,
  };
  return {
    ...defaults,
    ...(res.rows[0]?.value || {}),
  };
}

export async function updateSystemMonitoringConfig(patch = {}, actor = null) {
  const cur = await getSystemMonitoringConfig();
  const next = {
    ...cur,
    ...patch,
  };
  await query(
    `INSERT INTO vaqf.settings (key, value, updated_by, updated_by_name, updated_at)
     VALUES ('system_monitoring', $1::jsonb, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_by_name = EXCLUDED.updated_by_name,
           updated_at = NOW()`,
    [JSON.stringify(next), actor?.actorId || null, actor?.actorName || "Direktor"]
  );
  return next;
}

/**
 * Sends a monitoring alert via `vaqf.notifications_outbox` strictly to `tech_admin_user_ref`
 * (NEVER to the director, per 4-qadam & 5-qadam rules!).
 * Rate-limited to at most once per hour per `alertType`.
 */
export async function enqueueTechAdminMonitoringAlert({
  alertType,
  title,
  body,
  details = {},
  force = false,
} = {}) {
  const cfg = await getSystemMonitoringConfig();
  const techAdminRef = cfg.tech_admin_user_ref || "userumar";

  if (!force) {
    const recentRes = await query(
      `SELECT alert_type, last_sent_at
       FROM vaqf.monitoring_alerts
       WHERE alert_type = $1 AND last_sent_at > NOW() - INTERVAL '60 minutes'
       LIMIT 1`,
      [alertType]
    );
    if (recentRes.rowCount > 0) {
      return { throttled: true, alertType, recipientRef: techAdminRef };
    }
  }

  await query(
    `INSERT INTO vaqf.monitoring_alerts (alert_type, last_sent_at, last_message, details)
     VALUES ($1, NOW(), $2, $3::jsonb)
     ON CONFLICT (alert_type) DO UPDATE
       SET last_sent_at = NOW(),
           last_message = EXCLUDED.last_message,
           details = EXCLUDED.details`,
    [alertType, `${title}: ${body}`, JSON.stringify(details || {})]
  );

  const hourBucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const dedupeKey = `tech_alert:${alertType}:${hourBucket}`;

  const outboxRow = await enqueueOutboxNotification(null, {
    eventType: "system_alert",
    recipientRef: techAdminRef,
    dedupeKey,
    title: sanitizeSecretFromText(title),
    body: sanitizeSecretFromText(body),
    payload: {
      urgent: true,
      alert_type: alertType,
      ...details,
    },
  });

  return {
    throttled: false,
    alertType,
    recipientRef: techAdminRef,
    outboxId: outboxRow?.id || null,
  };
}

// ============================================================================
// 4-QADAM.1 & 4-QADAM.3: DISK VA ZAXIRA TEKSHIRUVI + SINOV TIKLASH
// ============================================================================
export async function inspectDiskAndBackupMount() {
  const cfg = await getSystemMonitoringConfig();
  const backupMount = cfg.backup_disk_mount || "/backup";
  const localBackupDir = cfg.backup_local_dir || "/srv/data/backup/vaqf";

  let rootDev = null;
  let backupDev = null;
  let separateDiskMounted = false;
  try {
    const stRoot = await fsp.stat("/");
    const stBackup = await fsp.stat(backupMount);
    rootDev = stRoot.dev;
    backupDev = stBackup.dev;
    separateDiskMounted = stRoot.dev !== stBackup.dev;
  } catch {
    separateDiskMounted = false;
  }

  let freeDiskPercent = 100;
  let totalGb = 0;
  let availGb = 0;
  try {
    const { stdout } = await execFileAsync("df", ["-P", "-B1", "/srv/data"]);
    const lines = stdout.trim().split(/\r?\n/);
    if (lines[1]) {
      const parts = lines[1].trim().split(/\s+/);
      const totalBytes = Number(parts[1] || 0);
      const availBytes = Number(parts[3] || 0);
      if (totalBytes > 0) {
        freeDiskPercent = Math.round((availBytes / totalBytes) * 1000) / 10;
        totalGb = Math.round((totalBytes / 1024 ** 3) * 10) / 10;
        availGb = Math.round((availBytes / 1024 ** 3) * 10) / 10;
      }
    }
  } catch {}

  const lastBackupRes = await query(
    `SELECT * FROM vaqf.backup_logs
     WHERE backup_type IN ('daily', 'manual') AND status = 'success'
     ORDER BY created_at DESC LIMIT 1`
  );
  const lastRestoreRes = await query(
    `SELECT * FROM vaqf.backup_logs
     WHERE backup_type = 'weekly_restore_test'
     ORDER BY created_at DESC LIMIT 1`
  );

  let lastSuccessAt = lastBackupRes.rows[0]?.created_at || null;
  let latestFileSize = Number(lastBackupRes.rows[0]?.size_bytes || 0);

  if (!lastSuccessAt) {
    try {
      const st = await fsp.stat(path.join(localBackupDir, "latest-vaqf-schema.dump"));
      lastSuccessAt = st.mtime;
      latestFileSize = st.size;
    } catch {}
  }

  const ageHours = lastSuccessAt
    ? Math.round(((Date.now() - new Date(lastSuccessAt).getTime()) / 3_600_000) * 10) / 10
    : null;

  return {
    backupMount,
    localBackupDir,
    separateDiskMounted,
    freeDiskPercent,
    totalGb,
    availGb,
    lastSuccessAt,
    ageHours,
    latestFileSize,
    lastRestoreTestAt: lastRestoreRes.rows[0]?.created_at || null,
    lastRestoreStatus: lastRestoreRes.rows[0]?.status || null,
    lastRestoreTables: lastRestoreRes.rows[0]?.tables_restored || null,
  };
}

export async function runVaqfBackup({
  backupType = "manual",
  requireSeparateDisk = false,
} = {}) {
  const diskInfo = await inspectDiskAndBackupMount();
  const cfg = await getSystemMonitoringConfig();

  if (diskInfo.freeDiskPercent < Number(cfg.min_free_disk_percent || 15)) {
    const errMsg = `Diskda bo'sh joy kam qoldi: ${diskInfo.freeDiskPercent}% (< ${cfg.min_free_disk_percent}%)`;
    await query(
      `INSERT INTO vaqf.backup_logs (backup_type, status, error_message) VALUES ($1, 'failed', $2)`,
      [backupType, errMsg]
    );
    await enqueueTechAdminMonitoringAlert({
      alertType: "disk_space_low",
      title: "⚠️ Vaqf Server: Diskda bo'sh joy 15% dan kam!",
      body: `Bo'sh joy: <b>${diskInfo.freeDiskPercent}%</b> (${diskInfo.availGb} GB / ${diskInfo.totalGb} GB).`,
      details: { freeDiskPercent: diskInfo.freeDiskPercent },
    });
    throw httpError(500, errMsg);
  }

  if (requireSeparateDisk && !diskInfo.separateDiskMounted) {
    const errMsg = `Alohida zaxira diski (${diskInfo.backupMount}) ulanmagan (mount qilinmagan)`;
    await query(
      `INSERT INTO vaqf.backup_logs (backup_type, status, error_message) VALUES ($1, 'failed', $2)`,
      [backupType, errMsg]
    );
    await enqueueTechAdminMonitoringAlert({
      alertType: "backup_disk_unmounted",
      title: "🚨 Vaqf Zaxira Xatosi: /backup diski ulanmagan!",
      body: `4 TB zaxira diski (<code>${diskInfo.backupMount}</code>) serverga ulanmagan yoki mount bo'lmagan. Zaxira faqat lokal diskda qolmoqda.`,
      details: { backupMount: diskInfo.backupMount },
    });
    throw httpError(500, errMsg);
  }

  const scriptPath = "/srv/data/backup/vaqf/backup_vaqf.sh";
  const { stdout } = await execFileAsync("bash", [scriptPath]);
  const st = await fsp.stat("/srv/data/backup/vaqf/latest-vaqf-schema.dump");

  let secondaryPath = null;
  if (diskInfo.separateDiskMounted) {
    const targetDir = path.join(diskInfo.backupMount, "vaqf");
    await fsp.mkdir(targetDir, { recursive: true });
    const destDump = path.join(targetDir, path.basename(await fsp.realpath("/srv/data/backup/vaqf/latest-vaqf-schema.dump")));
    await fsp.copyFile("/srv/data/backup/vaqf/latest-vaqf-schema.dump", destDump);
    secondaryPath = destDump;
  }

  const ins = await query(
    `INSERT INTO vaqf.backup_logs (backup_type, status, primary_path, secondary_path, size_bytes)
     VALUES ($1, 'success', $2, $3, $4)
     RETURNING *`,
    [
      backupType,
      "/srv/data/backup/vaqf/latest-vaqf-schema.dump",
      secondaryPath,
      st.size,
    ]
  );

  return {
    ok: true,
    log: ins.rows[0],
    separateDiskMounted: diskInfo.separateDiskMounted,
    output: sanitizeSecretFromText(stdout.trim()),
  };
}

export async function runWeeklyRestoreTest() {
  const dumpPath = "/srv/data/backup/vaqf/latest-vaqf-schema.dump";
  const envFile = "/srv/data/apps/mezana-platform/apps/finance-bff/.env";
  const rawEnv = await fsp.readFile(envFile, "utf8");
  const m = rawEnv.match(/^PLATFORM_DB_URL=(.+)$/m);
  if (!m) throw new Error("PLATFORM_DB_URL topilmadi");
  const dbUrl = m[1].trim().replace(/^["']|["']$/g, "");

  try {
    await query(`DROP SCHEMA IF EXISTS vaqf_restore_test CASCADE`);
    await execFileAsync(
      "bash",
      [
        "-c",
        `set -euo pipefail; pg_restore --no-owner --no-privileges -f - "$DUMP_PATH" | sed -e 's/CREATE SCHEMA vaqf;/CREATE SCHEMA vaqf_restore_test;/g' -e 's/vaqf\\./vaqf_restore_test./g' | psql "$DB_URL" >/dev/null`,
      ],
      {
        env: { ...process.env, DUMP_PATH: dumpPath, DB_URL: dbUrl },
      }
    );
    const cntRes = await query(
      `SELECT count(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'vaqf_restore_test'`
    );
    const tablesRestored = Number(cntRes.rows[0]?.cnt || 0);
    await query(`DROP SCHEMA IF EXISTS vaqf_restore_test CASCADE`);

    const st = await fsp.stat(dumpPath);
    const logRes = await query(
      `INSERT INTO vaqf.backup_logs (backup_type, status, primary_path, size_bytes, tables_restored)
       VALUES ('weekly_restore_test', 'success', $1, $2, $3)
       RETURNING *`,
      [dumpPath, st.size, tablesRestored]
    );
    return { ok: true, tablesRestored, log: logRes.rows[0] };
  } catch (err) {
    await query(`DROP SCHEMA IF EXISTS vaqf_restore_test CASCADE`).catch(() => {});
    const errMsg = sanitizeSecretFromText(err?.message || err);
    await query(
      `INSERT INTO vaqf.backup_logs (backup_type, status, primary_path, error_message)
       VALUES ('weekly_restore_test', 'failed', $1, $2)`,
      [dumpPath, errMsg]
    );
    await enqueueTechAdminMonitoringAlert({
      alertType: "weekly_restore_failed",
      title: "🚨 Vaqf Haftalik Zaxira Tiklash Sinovi Xatosi!",
      body: `Haftalik sinov tiklash (restore test) xato bilan tugadi: <code>${errMsg}</code>`,
      details: { error: errMsg },
    });
    throw err;
  }
}

// ============================================================================
// 5-QADAM: /vaqf-api/health VA TIZIM MONITORINGI
// ============================================================================
export function isHealthRequestAllowed(req, vAccess = null) {
  if (vAccess?.isDirector) return true;
  const forwardedFor = req?.headers?.["x-forwarded-for"] || req?.headers?.["x-real-ip"] || "";
  if (forwardedFor) {
    const firstIp = String(forwardedFor).split(",")[0].trim();
    if (firstIp && firstIp !== "127.0.0.1" && firstIp !== "::1" && firstIp !== "::ffff:127.0.0.1") {
      return false;
    }
  }
  const remoteAddr = String(req?.socket?.remoteAddress || "");
  return (
    remoteAddr === "127.0.0.1" ||
    remoteAddr === "::1" ||
    remoteAddr === "::ffff:127.0.0.1"
  );
}

let cachedGitCommit = null;
async function getGitCommitShort() {
  if (cachedGitCommit) return cachedGitCommit;
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: rootDir });
    cachedGitCommit = stdout.trim();
    return cachedGitCommit;
  } catch {
    return "unknown";
  }
}

async function checkVaqfBotPm2Online() {
  try {
    const { stdout } = await execFileAsync("pm2", ["jlist"]);
    const list = JSON.parse(stdout);
    const proc = list.find((p) => p.name === "mezana-vaqf-bot");
    if (!proc) return { exists: false, online: false, status: "not_registered" };
    const status = proc.pm2_env?.status || "unknown";
    return {
      exists: true,
      online: status === "online",
      status,
      pid: proc.pid || null,
      uptimeMs: proc.pm2_env?.pm_uptime ? Date.now() - proc.pm2_env.pm_uptime : 0,
    };
  } catch {
    return { exists: false, online: false, status: "unknown" };
  }
}

export async function getVaqfSystemHealth({ runAlerts = false } = {}) {
  const t0 = Date.now();
  const [
    dbCheckRes,
    outboxStatsRes,
    botChatsStatsRes,
    diskBackupInfo,
    piiVerify,
    gitCommit,
    botPm2,
    cfg,
  ] = await Promise.all([
    query(
      `SELECT
         (SELECT count(*)::int FROM vaqf.schema_migrations) AS migrations_count,
         (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'vaqf') AS tables_count`
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
         COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60) FILTER (WHERE status = 'pending'), 0)::float AS oldest_pending_minutes,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
         COUNT(*) FILTER (WHERE status = 'sent' AND sent_at > NOW() - INTERVAL '24 hours')::int AS sent_24h_count,
         COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped_count
       FROM vaqf.notifications_outbox`
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE blocked_at IS NULL)::int AS active_chats,
         COUNT(*) FILTER (WHERE blocked_at IS NOT NULL)::int AS blocked_chats
       FROM vaqf.bot_chats`
    ),
    inspectDiskAndBackupMount(),
    verifyVaqfPiiKey(),
    getGitCommitShort(),
    checkVaqfBotPm2Online(),
    getSystemMonitoringConfig(),
  ]);

  const dbLatencyMs = Date.now() - t0;
  const ob = outboxStatsRes.rows[0] || {};
  const bc = botChatsStatsRes.rows[0] || {};
  const tok = getVaqfTelegramBotToken();

  const issues = [];
  if (Number(ob.oldest_pending_minutes || 0) > Number(cfg.max_pending_outbox_minutes || 15)) {
    issues.push(`Outbox'da ${Math.round(ob.oldest_pending_minutes)} daqiqadan beri kutayotgan xabar bor`);
  }
  if (Number(ob.failed_count || 0) >= Number(cfg.max_failed_outbox_count || 5)) {
    issues.push(`Outbox'da ${ob.failed_count} ta failed xabar to'plangan`);
  }
  if (diskBackupInfo.ageHours === null || diskBackupInfo.ageHours > Number(cfg.max_backup_age_hours || 26)) {
    issues.push(`Oxirgi zaxira ${diskBackupInfo.ageHours ?? "yo'q"} soat oldin olingan (> 26 soat)`);
  }
  if (diskBackupInfo.freeDiskPercent < Number(cfg.min_free_disk_percent || 15)) {
    issues.push(`Disk bo'sh joyi ${diskBackupInfo.freeDiskPercent}% (< 15%)`);
  }
  if (!piiVerify.valid) {
    issues.push(`VAQF_PII_KEY xatosi: ${piiVerify.error}`);
  }

  if (runAlerts) {
    await runSystemMonitoringChecks({
      outbox: ob,
      diskBackupInfo,
      botPm2,
      cfg,
    });
  }

  return {
    status: issues.length === 0 ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    version: {
      gitCommit,
      branch: "main",
      phase: 6,
    },
    database: {
      ok: true,
      latencyMs: dbLatencyMs,
      migrationsCount: dbCheckRes.rows[0]?.migrations_count || 0,
      tablesCount: dbCheckRes.rows[0]?.tables_count || 0,
    },
    outbox: {
      pendingCount: Number(ob.pending_count || 0),
      oldestPendingMinutes: Math.round(Number(ob.oldest_pending_minutes || 0) * 10) / 10,
      failedCount: Number(ob.failed_count || 0),
      sentLast24h: Number(ob.sent_24h_count || 0),
      skippedCount: Number(ob.skipped_count || 0),
    },
    bot: {
      username: getVaqfBotUsername(),
      tokenConfigured: Boolean(tok),
      tokenMasked: maskBotToken(tok),
      activeChatsCount: Number(bc.active_chats || 0),
      blockedChatsCount: Number(bc.blocked_chats || 0),
      pm2: botPm2,
    },
    backup: diskBackupInfo,
    piiKey: {
      valid: piiVerify.valid,
      keyFingerprint: piiVerify.keyFingerprint,
    },
    monitoringConfig: cfg,
    issues,
  };
}

export async function runSystemMonitoringChecks(precomputed = null) {
  const cfg = precomputed?.cfg || (await getSystemMonitoringConfig());
  const obRes = precomputed?.outbox
    ? { rows: [precomputed.outbox] }
    : await query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
           COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60) FILTER (WHERE status = 'pending'), 0)::float AS oldest_pending_minutes,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count
         FROM vaqf.notifications_outbox`
      );
  const ob = obRes.rows[0] || {};
  const diskBackupInfo = precomputed?.diskBackupInfo || (await inspectDiskAndBackupMount());
  const botPm2 = precomputed?.botPm2 || (await checkVaqfBotPm2Online());

  const alertsSent = [];

  if (
    Number(ob.oldest_pending_minutes || 0) > Number(cfg.max_pending_outbox_minutes || 15) ||
    Number(ob.failed_count || 0) >= Number(cfg.max_failed_outbox_count || 5)
  ) {
    const r = await enqueueTechAdminMonitoringAlert({
      alertType: "outbox_backlog",
      title: "⚠️ Vaqf Outbox Ogohlantirishi",
      body:
        `Outbox'da kechikkan yoki xato xabarlar aniqlandi:\n` +
        `• Pending: <b>${ob.pending_count} ta</b> (eng eskisi: <b>${Math.round(ob.oldest_pending_minutes)} daq</b>)\n` +
        `• Failed: <b>${ob.failed_count} ta</b>`,
      details: ob,
    });
    alertsSent.push(r);
  }

  if (botPm2.exists && !botPm2.online) {
    const r = await enqueueTechAdminMonitoringAlert({
      alertType: "vaqf_bot_down",
      title: "🚨 Vaqf Boti (mezana-vaqf-bot) To'xtab Qoldi!",
      body: `PM2 da <b>mezana-vaqf-bot</b> jarayoni holati: <code>${botPm2.status}</code>.`,
      details: botPm2,
    });
    alertsSent.push(r);
  }

  if (diskBackupInfo.ageHours === null || diskBackupInfo.ageHours > Number(cfg.max_backup_age_hours || 26)) {
    const r = await enqueueTechAdminMonitoringAlert({
      alertType: "backup_stale",
      title: "⚠️ Vaqf Zaxira Nusxasi Eskirgan (> 26 soat)",
      body: `Oxirgi muvaffaqiyatli zaxira yoshi: <b>${diskBackupInfo.ageHours ?? "mavjud emas"} soat</b>.`,
      details: { ageHours: diskBackupInfo.ageHours },
    });
    alertsSent.push(r);
  }

  if (diskBackupInfo.freeDiskPercent < Number(cfg.min_free_disk_percent || 15)) {
    const r = await enqueueTechAdminMonitoringAlert({
      alertType: "disk_space_low",
      title: "⚠️ Vaqf Server: Diskda bo'sh joy 15% dan kam!",
      body: `Bo'sh joy: <b>${diskBackupInfo.freeDiskPercent}%</b> (${diskBackupInfo.availGb} GB bo'sh).`,
      details: { freeDiskPercent: diskBackupInfo.freeDiskPercent },
    });
    alertsSent.push(r);
  }

  return { alertsSent };
}

// ============================================================================
// 6-QADAM: 5 TA EXCEL IMPORT SHABLONLARI (TR + UZ SARLAVHALAR, 3 NAMUNA QATOR)
// ============================================================================
const TEMPLATE_SPECS = {
  locations: {
    sheetName: "Joylar_Mekanlar",
    fileName: "vaqf-import-1-joylar-mekanlar.xlsx",
    columns: [
      { header: "Bino kodi / Bina Kodu *", key: "building_code", width: 24 },
      { header: "Bino nomi / Bina Adı *", key: "building_name", width: 30 },
      { header: "Qavat kodi / Kat Kodu", key: "floor_code", width: 20 },
      { header: "Qavat nomi / Kat Adı", key: "floor_name", width: 24 },
      { header: "Xona kodi / Oda Kodu *", key: "room_code", width: 22 },
      { header: "Xona nomi / Oda Adı *", key: "room_name", width: 32 },
      { header: "Turi / Tür (room|storage|outdoor)", key: "kind", width: 28 },
    ],
    sampleRows: [
      {
        building_code: "MZN-BLD-1",
        building_name: "Asosiy o'quv va yotoqxona binosi",
        floor_code: "Q1",
        floor_name: "1-qavat",
        room_code: "101",
        room_name: "101-xona (Kutubxona / Kütüphane)",
        kind: "room",
      },
      {
        building_code: "MZN-BLD-1",
        building_name: "Asosiy o'quv va yotoqxona binosi",
        floor_code: "Q1",
        floor_name: "1-qavat",
        room_code: "102",
        room_name: "102-xona (O'qituvchilar xonasi / Öğretmenler Odası)",
        kind: "room",
      },
      {
        building_code: "MZN-BLD-1",
        building_name: "Asosiy o'quv va yotoqxona binosi",
        floor_code: "Q2",
        floor_name: "2-qavat",
        room_code: "201",
        room_name: "201-xona (Majlislar zali / Toplantı Salonu)",
        kind: "room",
      },
    ],
  },
  assets: {
    sheetName: "Buyumlar_Demirbaslar",
    fileName: "vaqf-import-2-buyumlar-demirbaslar.xlsx",
    columns: [
      { header: "Buyum nomi / Eşya Adı *", key: "name", width: 32 },
      { header: "Kategoriya kodi / Kategori Kodu *", key: "category_code", width: 26 },
      { header: "Xona kodi / Oda Kodu *", key: "location_code", width: 22 },
      { header: "Miqdor / Miktar *", key: "quantity", width: 16 },
      { header: "Birlik / Birim (dona|komplekt)", key: "unit", width: 22 },
      { header: "Kelib tushish / Edinme (purchase|donation)", key: "acquisition_type", width: 32 },
      { header: "Xarid narxi / Fiyat", key: "purchase_price", width: 18 },
      { header: "Valyuta / Para Birimi (TRY|USD)", key: "currency", width: 24 },
      { header: "Holati / Durum (new|good|fair|poor)", key: "condition", width: 28 },
      { header: "Seriya № / Seri No", key: "serial_no", width: 22 },
    ],
    sampleRows: [
      {
        name: "Lenovo ThinkPad E16 Noutbuk",
        category_code: "IT",
        location_code: "202",
        quantity: 1,
        unit: "dona",
        acquisition_type: "purchase",
        purchase_price: 32000,
        currency: "TRY",
        condition: "new",
        serial_no: "PF-4K9901",
      },
      {
        name: "O'quv xonasi partasi (2 kishilik)",
        category_code: "MEB",
        location_code: "301",
        quantity: 15,
        unit: "dona",
        acquisition_type: "purchase",
        purchase_price: 2500,
        currency: "TRY",
        condition: "good",
        serial_no: "",
      },
      {
        name: "Arçelik 18000 BTU Konditsioner",
        category_code: "MAI",
        location_code: "203",
        quantity: 1,
        unit: "dona",
        acquisition_type: "donation",
        purchase_price: 28500,
        currency: "TRY",
        condition: "new",
        serial_no: "ARC-2026-881",
      },
    ],
  },
  roles: {
    sheetName: "Xodimlar_Rollar",
    fileName: "vaqf-import-3-xodimlar-rollar.xlsx",
    columns: [
      { header: "Foydalanuvchi ID yoki Email / Kullanıcı Ref *", key: "user_ref", width: 34 },
      { header: "F.I.Sh. / Ad Soyad *", key: "user_name", width: 30 },
      { header: "Rol / Rolü (director|inventory_manager|accountant|staff|board_member) *", key: "role", width: 48 },
      { header: "Muassasa ID / Kurum ID (1 = Mezana, bo'sh = Barchasi)", key: "institution_id", width: 36 },
    ],
    sampleRows: [
      {
        user_ref: "userumar",
        user_name: "Umarxon (Inventar mas'uli)",
        role: "inventory_manager",
        institution_id: "",
      },
      {
        user_ref: "abdurahman",
        user_name: "Abdurahman (Hisobchi / Muhasebe)",
        role: "accountant",
        institution_id: 1,
      },
      {
        user_ref: "muhammadjon@moliya.org",
        user_name: "Muhammadjon Sobirjonov",
        role: "staff",
        institution_id: 1,
      },
    ],
  },
  properties: {
    sheetName: "Kochmas_Mulk_Gayrimenkul",
    fileName: "vaqf-import-4-kochmas-mulk-gayrimenkul.xlsx",
    columns: [
      { header: "Mulk kodi / Taşınmaz Kodu *", key: "code", width: 24 },
      { header: "Mulk nomi / Taşınmaz Adı *", key: "name", width: 34 },
      { header: "Turi / Tür (building|land|apartment|shop) *", key: "kind", width: 32 },
      { header: "Shahar / Şehir", key: "city", width: 18 },
      { header: "Tuman / İlçe", key: "district", width: 18 },
      { header: "Ada / Parsel", key: "parcel_ada", width: 20 },
      { header: "Maydon m2 / Alan m2", key: "area_m2", width: 18 },
      { header: "Foydalanish / Kullanım (own_use|leased_out|vacant)", key: "usage", width: 36 },
      { header: "Qiymati / Değer", key: "value", width: 20 },
      { header: "Valyuta / Para Birimi (TRY|USD)", key: "currency", width: 22 },
    ],
    sampleRows: [
      {
        code: "MLK-001",
        name: "Mezana Akademiyasi Bosh Binosi",
        kind: "building",
        city: "İstanbul",
        district: "Üsküdar",
        parcel_ada: "120/4",
        area_m2: 1200,
        usage: "own_use",
        value: 45000000,
        currency: "TRY",
      },
      {
        code: "MLK-002",
        name: "Fatih Vaqf Do'koni #1",
        kind: "shop",
        city: "İstanbul",
        district: "Fatih",
        parcel_ada: "305/12",
        area_m2: 85,
        usage: "leased_out",
        value: 6500000,
        currency: "TRY",
      },
      {
        code: "MLK-003",
        name: "Ümraniye Xizmat Kvartirasi",
        kind: "apartment",
        city: "İstanbul",
        district: "Ümraniye",
        parcel_ada: "88/3",
        area_m2: 110,
        usage: "leased_out",
        value: 4800000,
        currency: "TRY",
      },
    ],
  },
  schedules: {
    sheetName: "Eslatmalar_Hatirlatmalar",
    fileName: "vaqf-import-5-eslatmalar-hatirlatmalar.xlsx",
    columns: [
      { header: "Eslatma sarlavhasi / Başlık *", key: "title", width: 38 },
      { header: "Turi / Tür (inspection|maintenance|warranty|insurance|license) *", key: "kind", width: 42 },
      { header: "Davriylik (oy) / Periyot (Ay)", key: "interval_months", width: 24 },
      { header: "Keyingi sana / Sonraki Tarih (YYYY-MM-DD) *", key: "next_due", width: 32 },
      { header: "Xona kodi / Oda Kodu", key: "location_code", width: 22 },
      { header: "Javobgar / Sorumlu Ref", key: "responsible_ref", width: 26 },
      { header: "Izoh / Açıklama", key: "notes", width: 34 },
    ],
    sampleRows: [
      {
        title: "O't o'chirgichlar bosimi va plombasini tekshirish (1–6 qavatlar)",
        kind: "inspection",
        interval_months: 6,
        next_due: "2026-12-01",
        location_code: "MZN-BLD-1",
        responsible_ref: "userumar",
        notes: "Yangın tüpleri 6 aylık kontrol",
      },
      {
        title: "Asosiy bino lifti texnik ko'rigi (Asansör Bakımı)",
        kind: "maintenance",
        interval_months: 3,
        next_due: "2026-11-25",
        location_code: "MZN-BLD-1",
        responsible_ref: "userumar",
        notes: "Sertifikatlangan servis ko'rigi",
      },
      {
        title: "Qozonxona va isitish tizimi mavsumiy profilaktikasi",
        kind: "maintenance",
        interval_months: 12,
        next_due: "2027-09-15",
        location_code: "MZN-BLD-1",
        responsible_ref: "userumar",
        notes: "Kuz-qish mavsumi oldidan tekshiruv",
      },
    ],
  },
};

export async function generateMultiImportTemplateBuffer(type = "assets") {
  const spec = TEMPLATE_SPECS[type];
  if (!spec) {
    throw httpError(400, `Noma'lum import shablon turi: ${type}. Ruxsat etilgan: ${Object.keys(TEMPLATE_SPECS).join(", ")}`);
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(spec.sheetName);
  ws.columns = spec.columns;
  ws.getRow(1).font = { bold: true };
  for (const sample of spec.sampleRows) {
    ws.addRow(sample);
  }
  const buf = await wb.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buf),
    fileName: spec.fileName,
  };
}

async function parseRowsFromImportBody(type, body = {}) {
  if (Array.isArray(body.rows)) {
    return body.rows;
  }
  if (!body.file_base64 && !body.fileBase64) {
    throw httpError(400, "Excel fayl (file_base64) yoki rows massivi yuborilishi shart");
  }
  const b64 = String(body.file_base64 || body.fileBase64).replace(/^data:[^;]+;base64,/, "");
  const buf = Buffer.from(b64, "base64");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw httpError(400, "Excel faylda ishchi varaq (worksheet) topilmadi");

  const spec = TEMPLATE_SPECS[type];
  const keys = spec.columns.map((c) => c.key);
  const out = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header row
    const obj = { _rowNumber: rowNumber };
    let nonEmpty = false;
    keys.forEach((k, idx) => {
      const cellVal = row.getCell(idx + 1).value;
      const strVal =
        cellVal && typeof cellVal === "object" && "text" in cellVal
          ? String(cellVal.text).trim()
          : cellVal instanceof Date
          ? cellVal.toISOString().slice(0, 10)
          : cellVal !== null && cellVal !== undefined
          ? String(cellVal).trim()
          : "";
      if (strVal !== "") nonEmpty = true;
      obj[k] = strVal;
    });
    if (nonEmpty) out.push(obj);
  });
  return out;
}

export async function previewOrCommitMultiImport(type, body = {}, actor = null, vAccess = {}) {
  if (!vAccess.canEdit && !vAccess.isDirector) {
    throw httpError(403, "Excel import bajarish uchun yetarli huquq yo'q");
  }
  const spec = TEMPLATE_SPECS[type];
  if (!spec) {
    throw httpError(400, `Noma'lum import turi: ${type}`);
  }

  const rawRows = await parseRowsFromImportBody(type, body);
  const commit = Boolean(body.commit);
  const errors = [];
  const validRows = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    const rowNum = r._rowNumber || i + 2;

    if (type === "locations") {
      if (!r.room_code || !r.room_name) {
        errors.push({ row: rowNum, error: "Xona kodi (room_code) va xona nomi (room_name) majburiy" });
        continue;
      }
      validRows.push({
        rowNum,
        building_code: r.building_code || "MZN-BLD-1",
        building_name: r.building_name || "Asosiy bino",
        floor_code: r.floor_code || null,
        floor_name: r.floor_name || null,
        room_code: String(r.room_code).trim(),
        room_name: String(r.room_name).trim(),
        kind: ["room", "storage", "outdoor", "floor", "building"].includes(r.kind) ? r.kind : "room",
      });
    } else if (type === "assets") {
      const qty = Number(r.quantity || 1);
      if (!r.name || !Number.isFinite(qty) || qty <= 0) {
        errors.push({ row: rowNum, error: "Buyum nomi (name) va musbat miqdor (quantity > 0) majburiy" });
        continue;
      }
      validRows.push({
        rowNum,
        name: String(r.name).trim(),
        category_code: String(r.category_code || "BSH").trim().toUpperCase(),
        location_code: String(r.location_code || "").trim(),
        quantity: qty,
        unit: r.unit || "dona",
        acquisition_type: ["purchase", "donation", "unknown"].includes(r.acquisition_type)
          ? r.acquisition_type
          : "purchase",
        purchase_price: r.purchase_price !== "" && r.purchase_price !== undefined ? Number(r.purchase_price) : null,
        currency: r.currency === "USD" ? "USD" : "TRY",
        condition: ["new", "good", "fair", "poor"].includes(r.condition) ? r.condition : "good",
        serial_no: r.serial_no || null,
      });
    } else if (type === "roles") {
      const validRoleList = ["director", "inventory_manager", "accountant", "staff", "board_member"];
      if (!r.user_ref || !r.user_name || !validRoleList.includes(r.role)) {
        errors.push({
          row: rowNum,
          error: `user_ref, user_name va to'g'ri role (${validRoleList.join("|")}) majburiy`,
        });
        continue;
      }
      validRows.push({
        rowNum,
        user_ref: String(r.user_ref).trim(),
        user_name: String(r.user_name).trim(),
        role: r.role,
        institution_id: r.institution_id ? Number(r.institution_id) : null,
      });
    } else if (type === "properties") {
      if (!r.code || !r.name) {
        errors.push({ row: rowNum, error: "Mulk kodi (code) va nomi (name) majburiy" });
        continue;
      }
      validRows.push({
        rowNum,
        code: String(r.code).trim().toUpperCase(),
        name: String(r.name).trim(),
        kind: ["building", "land", "apartment", "shop", "other"].includes(r.kind) ? r.kind : "building",
        city: r.city || "İstanbul",
        district: r.district || null,
        parcel_ada: r.parcel_ada || null,
        area_m2: r.area_m2 ? Number(r.area_m2) : null,
        usage: ["own_use", "leased_out", "vacant", "under_renovation"].includes(r.usage) ? r.usage : "own_use",
        value: Number(r.value || 0),
        currency: r.currency === "USD" ? "USD" : "TRY",
      });
    } else if (type === "schedules") {
      if (!r.title || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.next_due || ""))) {
        errors.push({ row: rowNum, error: "Sarlavha (title) va YYYY-MM-DD formatidagi next_due sanasi majburiy" });
        continue;
      }
      validRows.push({
        rowNum,
        title: String(r.title).trim(),
        kind: ["inspection", "maintenance", "warranty", "insurance", "license", "certificate", "other"].includes(r.kind)
          ? r.kind
          : "inspection",
        interval_months: r.interval_months ? Number(r.interval_months) : null,
        next_due: String(r.next_due).slice(0, 10),
        location_code: r.location_code || null,
        responsible_ref: r.responsible_ref || "role:inventory_manager",
        notes: r.notes || null,
      });
    }
  }

  if (!commit) {
    return {
      mode: "preview",
      type,
      totalRows: rawRows.length,
      validCount: validRows.length,
      errorCount: errors.length,
      errors,
      previewRows: validRows.slice(0, 50),
    };
  }

  if (errors.length > 0) {
    throw httpError(400, `Import tasdiqlanmadi: ${errors.length} ta qatorda xato bor`, { errors });
  }

  let importedCount = 0;
  await withTransaction(async (tx) => {
    if (type === "locations") {
      for (const r of validRows) {
        let parentId = null;
        if (r.building_code) {
          const bRes = await tx.query(
            `SELECT id FROM vaqf.locations WHERE institution_id = 1 AND code = $1 LIMIT 1`,
            [r.building_code]
          );
          if (bRes.rows[0]) {
            parentId = bRes.rows[0].id;
          } else {
            const bIns = await tx.query(
              `INSERT INTO vaqf.locations (institution_id, code, name, kind) VALUES (1, $1, $2, 'building') RETURNING id`,
              [r.building_code, r.building_name]
            );
            parentId = bIns.rows[0].id;
          }
        }
        if (r.floor_code) {
          const fRes = await tx.query(
            `SELECT id FROM vaqf.locations WHERE institution_id = 1 AND code = $1 LIMIT 1`,
            [r.floor_code]
          );
          if (fRes.rows[0]) {
            parentId = fRes.rows[0].id;
          } else {
            const fIns = await tx.query(
              `INSERT INTO vaqf.locations (institution_id, parent_id, code, name, kind) VALUES (1, $1, $2, $3, 'floor') RETURNING id`,
              [parentId, r.floor_code, r.floor_name || r.floor_code]
            );
            parentId = fIns.rows[0].id;
          }
        }
        await tx.query(
          `INSERT INTO vaqf.locations (institution_id, parent_id, code, name, kind)
           VALUES (1, $1, $2, $3, $4)
           ON CONFLICT (institution_id, code) DO UPDATE
             SET name = EXCLUDED.name,
                 parent_id = COALESCE(EXCLUDED.parent_id, vaqf.locations.parent_id)`,
          [parentId, r.room_code, r.room_name, r.kind]
        );
        importedCount += 1;
      }
    } else if (type === "assets") {
      for (const r of validRows) {
        const catRes = await tx.query(`SELECT id FROM vaqf.asset_categories WHERE UPPER(code) = $1 LIMIT 1`, [
          r.category_code,
        ]);
        const catId = catRes.rows[0]?.id || 1;
        let locId = null;
        if (r.location_code) {
          const lRes = await tx.query(`SELECT id FROM vaqf.locations WHERE code = $1 LIMIT 1`, [r.location_code]);
          locId = lRes.rows[0]?.id || null;
        }
        const assetIns = await tx.query(
          `INSERT INTO vaqf.assets (
             institution_id, category_id, location_id, name, tracking, quantity, unit,
             acquisition_type, purchase_price, currency, condition, serial_no, status
           ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'in_use')
           RETURNING id, inventory_no`,
          [
            catId,
            locId,
            r.name,
            r.quantity > 1 ? "batch" : "individual",
            r.quantity,
            r.unit,
            r.acquisition_type,
            r.purchase_price,
            r.currency,
            r.condition,
            r.serial_no,
          ]
        );
        await tx.query(
          `INSERT INTO vaqf.asset_events (asset_id, event_type, new_value, note, actor_id, actor_name)
           VALUES ($1, 'created', $2::jsonb, 'Excel import orqali kiritildi', $3, $4)`,
          [
            assetIns.rows[0].id,
            JSON.stringify({ inventory_no: assetIns.rows[0].inventory_no, name: r.name }),
            actor?.actorId || null,
            actor?.actorName || "Direktor",
          ]
        );
        importedCount += 1;
      }
    } else if (type === "roles") {
      for (const r of validRows) {
        await tx.query(`DELETE FROM vaqf.user_roles WHERE LOWER(user_ref) = LOWER($1)`, [r.user_ref]);
        await tx.query(
          `INSERT INTO vaqf.user_roles (user_ref, user_name, role, institution_id, granted_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [r.user_ref, r.user_name, r.role, r.institution_id, actor?.actorName || "Direktor"]
        );
        importedCount += 1;
      }
    } else if (type === "properties") {
      for (const r of validRows) {
        const valTry = r.currency === "USD" ? r.value * 35 : r.value;
        await tx.query(
          `INSERT INTO vaqf.properties (
             code, name, kind, city, district, parcel_ada, area_m2, usage, value, currency, value_try, institution_id, created_by_name
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, $12)
           ON CONFLICT (code) DO UPDATE
             SET name = EXCLUDED.name,
                 kind = EXCLUDED.kind,
                 city = EXCLUDED.city,
                 district = EXCLUDED.district,
                 area_m2 = EXCLUDED.area_m2,
                 usage = EXCLUDED.usage,
                 value = EXCLUDED.value,
                 value_try = EXCLUDED.value_try,
                 updated_at = NOW()`,
          [
            r.code,
            r.name,
            r.kind,
            r.city,
            r.district,
            r.parcel_ada,
            r.area_m2,
            r.usage,
            r.value,
            r.currency,
            valTry,
            actor?.actorName || "Direktor",
          ]
        );
        importedCount += 1;
      }
    } else if (type === "schedules") {
      for (const r of validRows) {
        let locId = null;
        if (r.location_code) {
          const lRes = await tx.query(`SELECT id FROM vaqf.locations WHERE code = $1 LIMIT 1`, [r.location_code]);
          locId = lRes.rows[0]?.id || null;
        }
        await tx.query(
          `INSERT INTO vaqf.schedules (
             institution_id, location_id, title, kind, interval_months, next_due, remind_days_before, responsible_ref, responsible_name, notes
           ) VALUES (1, $1, $2, $3, $4, $5::date, '[14, 3]'::jsonb, $6, $7, $8)`,
          [
            locId,
            r.title,
            r.kind,
            r.interval_months,
            r.next_due,
            r.responsible_ref,
            r.responsible_ref,
            r.notes,
          ]
        );
        importedCount += 1;
      }
    }
  });

  if (type === "roles") {
    await refreshVaqfRoleCache();
  }

  return {
    mode: "commit",
    type,
    importedCount,
  };
}
