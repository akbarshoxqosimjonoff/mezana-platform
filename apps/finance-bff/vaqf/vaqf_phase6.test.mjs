import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { query } from "./db.mjs";
import { runVaqfMigrations } from "./migrate.mjs";
import {
  getVaqfTelegramBotToken as getVaqfBotToken,
  getLegacyMezanaBotToken,
  maskBotToken as maskSecretToken,
  sanitizeSecretFromText as sanitizeLogText,
  enqueueOutboxNotification,
  processOutboxBatch,
  listWebNotificationsForUser,
  recordVaqfBotStart,
  createVaqfTelegramLinkCode,
  redeemVaqfTelegramLinkCode,
  verifyTelegramWebAppInitData,
  executeBotCallbackAction,
  getVaqfBotSecret,
} from "./automationService.mjs";
import {
  verifyVaqfPiiKey,
  rotateVaqfPiiKey,
  isHealthRequestAllowed,
  getVaqfSystemHealth,
  generateMultiImportTemplateBuffer,
  previewOrCommitMultiImport,
} from "./opsService.mjs";
import { handleVaqfApi } from "./routes.mjs";

function createSignedInitData(botToken, telegramUserId = 1919070720, authDateSec = Math.floor(Date.now() / 1000)) {
  const userJson = JSON.stringify({
    id: Number(telegramUserId),
    first_name: "Test",
    username: "test_vaqf",
  });
  const params = new URLSearchParams();
  params.set("auth_date", String(authDateSec));
  params.set("query_id", "AAHdF6IQAAAAAN0XohDhrOrc");
  params.set("user", userJson);

  const entries = [];
  for (const [k, v] of params.entries()) {
    entries.push([k, v]);
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

const directorSess = {
  user: { id: "userdirektor", name: "Solih Direktor", username: "direktor", email: "direktor@moliya.org" },
  crmUser: { id: 1, username: "direktor", role: "root", full_name: "Solih Direktor" },
  erpUser: { id: "cmtlai0bg000ipir95hv9hfez", email: "direktor@moliya.org", name: "Solih Direktor" },
};

const directorAccessContext = {
  isDirector: true,
  accountName: "Direktor",
  sourceLabel: "Solih Direktor",
};

// ============================================================================
// TEST 1: Vaqf xabarlari faqat VAQF_TELEGRAM_BOT_TOKEN bilan yuborilishi,
//         TELEGRAM_BOT_TOKEN ishlatilmasligi
// ============================================================================
test("1. Vaqf xabarlari faqat VAQF_TELEGRAM_BOT_TOKEN bilan yuborilishi, TELEGRAM_BOT_TOKEN ishlatilmasligi", async () => {
  await runVaqfMigrations();
  const vaqfToken = getVaqfBotToken();
  const legacyToken = getLegacyMezanaBotToken();
  assert.ok(vaqfToken && vaqfToken.length > 20, "VAQF_TELEGRAM_BOT_TOKEN sozlangan bo'lishi kerak");
  assert.notEqual(vaqfToken, legacyToken, "VAQF_TELEGRAM_BOT_TOKEN eski TELEGRAM_BOT_TOKEN dan farqli bo'lishi shart");

  // Ensure test user (Solih Direktor -> tg 1919070720) is linked in identity.telegram_links and has started the Vaqf bot
  await query(
    `INSERT INTO identity.telegram_links (id, "userId", "telegramId", "telegramUsername", "linkedAt")
     VALUES ('tglink_dir_p6', 'cmtlai0bg000ipir95hv9hfez', '1919070720', 'direktor_tg', NOW())
     ON CONFLICT DO NOTHING`
  );
  await query(
    `INSERT INTO identity.telegram_links (id, "userId", "telegramId", "telegramUsername", "linkedAt")
     VALUES ('tglink_vaqf_p6', 'cmvaqf0000000000000000001', '929885302', 'abdurahman_tg', NOW())
     ON CONFLICT DO NOTHING`
  );
  await recordVaqfBotStart({
    telegramId: "1919070720",
    username: "direktor_tg",
    fullName: "Solih Direktor",
  });

  const calledUrls = [];
  const mockFetch = async (url) => {
    calledUrls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 777001 } }),
    };
  };

  const dedupeKey = `p6_test1_token_${Date.now()}`;
  const outboxRow = await enqueueOutboxNotification(null, {
    event_type: "phase6_token_test",
    recipient_ref: "direktor@moliya.org",
    title: "Phase 6 Token Test",
    body: "<b>Token tekshiruvi</b>",
    payload: { test: 1 },
    dedupe_key: dedupeKey,
  });

  await processOutboxBatch({ fetchImpl: mockFetch, forceIgnoreQuietHours: true });

  assert.ok(calledUrls.length >= 1, "Telegram sendMessage chaqirilgan bo'lishi kerak");
  for (const u of calledUrls) {
    assert.ok(
      u.includes(`/bot${vaqfToken}/sendMessage`),
      "Faqat VAQF_TELEGRAM_BOT_TOKEN ishlatilishi shart"
    );
    if (legacyToken) {
      assert.ok(
        !u.includes(legacyToken),
        "Eski TELEGRAM_BOT_TOKEN hech qachon ishlatilmasligi shart"
      );
    }
  }

  const checkRes = await query(`SELECT status, telegram_message_id FROM vaqf.notifications_outbox WHERE id = $1`, [
    outboxRow.id,
  ]);
  assert.equal(checkRes.rows[0].status, "sent");
  assert.equal(String(checkRes.rows[0].telegram_message_id), "777001");
});

// ============================================================================
// TEST 2: Yangi botga /start bosmagan foydalanuvchiga xabar
//         skipped (bot_not_started) bo'lishi va web xabarnoma chiqishi
// ============================================================================
test("2. Yangi botga /start bosmagan foydalanuvchiga xabar skipped (bot_not_started) bo'lishi va web xabarnoma chiqishi", async () => {
  // Remove 929885302 (vaqf@moliya.org) from vaqf.bot_chats to simulate user who hasn't pressed /start on @ezanvakfitizimbot
  await query(`DELETE FROM vaqf.bot_chats WHERE telegram_id = $1`, ["929885302"]);

  let fetchCalled = false;
  const mockFetch = async () => {
    fetchCalled = true;
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  };

  const dedupeKey = `p6_test2_not_started_${Date.now()}`;
  const outboxRow = await enqueueOutboxNotification(null, {
    event_type: "assigned_to_you",
    recipient_ref: "vaqf@moliya.org",
    title: "Yangi zimmat dalolatnomasi",
    body: "Sizga buyum biriktirildi",
    payload: { test: 2 },
    dedupe_key: dedupeKey,
  });

  await processOutboxBatch({ fetchImpl: mockFetch, forceIgnoreQuietHours: true });
  assert.equal(fetchCalled, false, "/start bosmagan foydalanuvchiga Telegram API so'rovi yuborilmasligi kerak");

  const rowRes = await query(
    `SELECT status, skip_reason, last_error, is_read FROM vaqf.notifications_outbox WHERE id = $1`,
    [outboxRow.id]
  );
  assert.equal(rowRes.rows[0].status, "skipped");
  assert.equal(rowRes.rows[0].skip_reason, "bot_not_started");
  assert.equal(rowRes.rows[0].last_error, "bot_not_started");

  // Verify web notification is visible for vaqf@moliya.org
  const vaqfUserSess = {
    user: { id: "cmvaqf0000000000000000001", email: "vaqf@moliya.org", name: "Kichik Abdurahmon" },
    erpUser: { id: "cmvaqf0000000000000000001", email: "vaqf@moliya.org", name: "Kichik Abdurahmon" },
  };
  const webNotifs = await listWebNotificationsForUser(
    vaqfUserSess,
    { isDirector: false, accountName: "Vaqf" },
    { isDirector: false, canEdit: true }
  );
  const foundInWeb = webNotifs.items.some((n) => Number(n.id) === Number(outboxRow.id));
  assert.ok(foundInWeb, "Skipped (bot_not_started) xabar web qo'ng'iroqchada ko'rinishi shart");

  // Restore 929885302 in bot_chats
  await recordVaqfBotStart({ telegramId: "929885302", fullName: "Kichik Abdurahmon" });
});

// ============================================================================
// TEST 3: Bot bloklanganda (403) blocked_at belgilanishi va qayta urinmasligi
// ============================================================================
test("3. Bot bloklanganda (403) blocked_at belgilanishi va qayta urinmasligi", async () => {
  await recordVaqfBotStart({ telegramId: "929885302", fullName: "Kichik Abdurahmon" });

  let attemptsMade = 0;
  const mockFetch403 = async () => {
    attemptsMade += 1;
    return {
      ok: false,
      status: 403,
      json: async () => ({
        ok: false,
        error_code: 403,
        description: "Forbidden: bot was blocked by the user",
      }),
    };
  };

  const dedupeKey = `p6_test3_blocked_${Date.now()}`;
  const outboxRow = await enqueueOutboxNotification(null, {
    event_type: "schedule_due",
    recipient_ref: "vaqf@moliya.org",
    title: "Ko'rik muddati",
    body: "Kombi tekshiruvi",
    payload: { test: 3 },
    dedupe_key: dedupeKey,
  });

  await processOutboxBatch({ fetchImpl: mockFetch403, forceIgnoreQuietHours: true });
  assert.equal(attemptsMade, 1, "Birinchi urinishda 403 qaytdi");

  // Check vaqf.bot_chats.blocked_at is set
  const chatRes = await query(`SELECT blocked_at FROM vaqf.bot_chats WHERE telegram_id = $1`, ["929885302"]);
  assert.ok(chatRes.rows[0]?.blocked_at, "403 xatodan keyin vaqf.bot_chats.blocked_at belgilanishi shart");

  // Check outbox row status is failed (no further retries)
  const outRes = await query(`SELECT status, attempts FROM vaqf.notifications_outbox WHERE id = $1`, [outboxRow.id]);
  assert.equal(outRes.rows[0].status, "failed", "403 bo'lganda status darhol 'failed' bo'lib qayta urinmasligi shart");

  // Run worker again -> should not retry
  await processOutboxBatch({ fetchImpl: mockFetch403, forceIgnoreQuietHours: true });
  assert.equal(attemptsMade, 1, "Keyingi worker siklida qayta urinmasligi shart");

  // Unblock for subsequent tests
  await recordVaqfBotStart({ telegramId: "929885302", fullName: "Kichik Abdurahmon" });
});

// ============================================================================
// TEST 4: Mini App eski bot tokeni bilan imzolangan initData'ni rad etishi,
//         yangi token bilan qabul qilishi
// ============================================================================
test("4. Mini App eski bot tokeni bilan imzolangan initData'ni rad etishi, yangi token bilan qabul qilishi", async () => {
  const vaqfToken = getVaqfBotToken();
  const oldToken = getLegacyMezanaBotToken() || "legacy_dummy_token_for_hmac_test";

  const oldInitData = createSignedInitData(oldToken, 1919070720);
  const oldVerified = verifyTelegramWebAppInitData(oldInitData);
  assert.equal(oldVerified.valid, false, "Eski bot tokeni bilan imzolangan initData rad etilishi shart");

  const newInitData = createSignedInitData(vaqfToken, 1919070720);
  const newVerified = verifyTelegramWebAppInitData(newInitData);
  assert.equal(newVerified.valid, true, "Yangi VAQF_TELEGRAM_BOT_TOKEN bilan imzolangan initData qabul qilinishi shart");
  assert.equal(newVerified.telegramId, "1919070720");
});

// ============================================================================
// TEST 5: Bog'lash kodi 10 daqiqadan keyin va ikkinchi marta ishlatilganda rad etilishi
// ============================================================================
test("5. Bog'lash kodi 10 daqiqadan keyin va ikkinchi marta ishlatilganda rad etilishi", async () => {
  // 5a. Create a link code and redeem it once -> succeeds; redeem a second time -> fails
  const created = await createVaqfTelegramLinkCode(directorSess, directorAccessContext);
  assert.ok(created.code && created.code.length >= 6);
  assert.ok(created.deepLink.includes(`t.me/ezanvakfitizimbot?start=link_${created.code}`));

  const firstRedeem = await redeemVaqfTelegramLinkCode({
    code: created.code,
    telegramId: "1919070720",
    telegramUsername: "direktor_tg",
    fullName: "Solih Direktor",
  });
  assert.equal(firstRedeem.linked, true);

  await assert.rejects(
    async () => {
      await redeemVaqfTelegramLinkCode({
        code: created.code,
        telegramId: "1919070720",
      });
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /allaqachon ishlatilgan/i);
      return true;
    },
    "Ikkinchi marta ishlatilgan kod rad etilishi shart"
  );

  // 5b. Create another code, expire it (> 10 minutes), and verify it is rejected
  const expiredCodeObj = await createVaqfTelegramLinkCode(directorSess, directorAccessContext);
  await query(
    `UPDATE identity.telegram_link_codes SET "expiresAt" = NOW() - INTERVAL '1 minute' WHERE code = $1`,
    [expiredCodeObj.code]
  );

  await assert.rejects(
    async () => {
      await redeemVaqfTelegramLinkCode({
        code: expiredCodeObj.code,
        telegramId: "1919070720",
      });
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /muddati.*tugagan/i);
      return true;
    },
    "10 daqiqadan o'tgan kod rad etilishi shart"
  );
});

// ============================================================================
// TEST 6: Eski xabardagi inline tugma bosilganda xato chiqmasligi
// ============================================================================
test("6. Eski xabardagi inline tugma bosilganda xato chiqmasligi", async () => {
  // Find any existing schedule or create one to test idempotent legacy callback execution
  let schedRes = await query(`SELECT id FROM vaqf.schedules ORDER BY id DESC LIMIT 1`);
  if (schedRes.rows.length === 0) {
    schedRes = await query(
      `INSERT INTO vaqf.schedules (kind, title, due_date, remind_days, status, created_by)
       VALUES ('inspection', 'Phase 6 Test Schedule', CURRENT_DATE + 7, '[30,7,1]'::jsonb, 'active', 'direktor')
       RETURNING id`
    );
  }
  const scheduleId = schedRes.rows[0]?.id;
  assert.ok(scheduleId, "Test uchun kamida bitta schedule bo'lishi kerak");

  const res1 = await executeBotCallbackAction({
    telegramId: "1919070720",
    action: "schedule_snooze",
    targetId: scheduleId,
    outboxId: null,
  });
  assert.ok(res1.statusLine.includes("3 kunga"), "Birinchi bosishda muvaffaqiyatli bajarilishi kerak");

  // Second click on old inline button must also return cleanly without error
  const res2 = await executeBotCallbackAction({
    telegramId: "1919070720",
    action: "schedule_snooze",
    targetId: scheduleId,
    outboxId: null,
  });
  assert.ok(res2.statusLine, "Eski inline tugma qayta bosilganda xato bermasligi kerak");
});

// ============================================================================
// TEST 7: @mezanatizimbot da vaqf menyusi yo'qligi va boshqa menyular buzilmagani
// ============================================================================
test("7. @mezanatizimbot da vaqf menyusi yo'qligi va boshqa menyular buzilmagani", async () => {
  const mezanaVaqfFlowSrc = fs.readFileSync(
    "/srv/data/apps/mezana-platform/apps/telegram-bot/src/vaqf/flow.ts",
    "utf8"
  );
  const mezanaIndexSrc = fs.readFileSync(
    "/srv/data/apps/mezana-platform/apps/telegram-bot/src/index.ts",
    "utf8"
  );
  const mezanaSandboxSrc = fs.readFileSync(
    "/srv/data/apps/mezana-platform/apps/telegram-bot/src/expense/sandboxFlow.ts",
    "utf8"
  );
  const vaqfBotIndexSrc = fs.readFileSync(
    "/srv/data/apps/mezana-platform/apps/vaqf-bot/src/index.ts",
    "utf8"
  );

  // 1) @mezanatizimbot flow.ts no longer contains the full Vaqf submenu builder; instead it redirects to @ezanvakfitizimbot
  assert.ok(
    !mezanaVaqfFlowSrc.includes("buildVaqfSubmenuInlineKeyboard"),
    "@mezanatizimbot ichida eski Vaqf menyusi qolmasligi kerak"
  );
  assert.ok(
    mezanaVaqfFlowSrc.includes("Vaqf endi alohida botda"),
    "@mezanatizimbot 'Vaqf endi alohida botda' javobini va havolasini qaytarishi kerak"
  );

  // 2) @mezanatizimbot other flows (late arrival, expense sandbox) are intact
  assert.ok(mezanaIndexSrc.includes("registerLateArrivalFlow(bot)"), "Kech qolish oqimi buzilmagan");
  assert.ok(mezanaIndexSrc.includes("registerExpenseSandboxFlow(bot)"), "Moliya/xarajat oqimi buzilmagan");
  assert.ok(mezanaSandboxSrc.includes("➕ Xarajat kiritish"), "Moliya menyusi tugmalari joyida");
  assert.ok(mezanaSandboxSrc.includes("🏛 Vaqf endi alohida botda"), "Yangi yo'naltiruvchi tugma mavjud");

  // 3) Dedicated Vaqf bot (apps/vaqf-bot) has all required commands
  for (const cmd of ["start", "buyumlarim", "nosozlik", "tasdiqlar", "qidir", "skan", "muddatlar", "yordam"]) {
    assert.ok(
      vaqfBotIndexSrc.includes(`bot.command("${cmd}"`) || vaqfBotIndexSrc.includes(`"${cmd}"`),
      `apps/vaqf-bot da /${cmd} buyrug'i bo'lishi shart`
    );
  }
});

// ============================================================================
// TEST 8: Bot tokeni loglarda, xato xabarlarida va health javobida to'liq ko'rinmasligi
// ============================================================================
test("8. Bot tokeni loglarda, xato xabarlarida va health javobida to'liq ko'rinmasligi", async () => {
  const vaqfToken = getVaqfBotToken();
  const masked = maskSecretToken(vaqfToken);
  assert.equal(masked, `***${vaqfToken.slice(-4)}`, "Maskalangan token faqat oxirgi 4 belgini ko'rsatishi kerak");
  assert.ok(!masked.includes(vaqfToken.slice(0, 10)), "Token boshi ko'rinmasligi shart");

  const sampleErr = `FetchError: request to https://api.telegram.org/bot${vaqfToken}/sendMessage failed`;
  const sanitized = sanitizeLogText(sampleErr);
  assert.ok(!sanitized.includes(vaqfToken), "sanitizeLogText xato xabaridan to'liq tokenni olib tashlashi shart");
  assert.ok(sanitized.includes(masked), "sanitizeLogText oxirgi 4 belgini qoldirishi kerak");

  const health = await getVaqfSystemHealth();
  const healthStr = JSON.stringify(health);
  assert.ok(!healthStr.includes(vaqfToken), "Health javobida to'liq bot tokeni hech qachon chiqmasligi shart");
  assert.equal(health.bot.tokenMasked, masked);
});

// ============================================================================
// TEST 9: VAQF_PII_KEY tekshiruvi to'g'ri kalitda o'tishi va noto'g'ri kalitda xato qaytarishi
// ============================================================================
test("9. VAQF_PII_KEY tekshiruvi to'g'ri kalitda o'tishi va noto'g'ri kalitda xato qaytarishi", async () => {
  const validCheck = await verifyVaqfPiiKey();
  assert.equal(validCheck.valid, true, "To'g'ri VAQF_PII_KEY tekshiruvdan o'tishi shart");
  assert.equal(validCheck.ok, true);
  assert.ok(validCheck.keyFingerprint, "Kalit fingerprint qaytishi kerak");

  const wrongCheck = await verifyVaqfPiiKey("wrong_secret_key_for_phase6_test_000000");
  assert.equal(wrongCheck.valid, false, "Noto'g'ri kalitda tekshiruv xato qaytarishi shart");
  assert.equal(wrongCheck.ok, false);
  assert.ok(wrongCheck.error, "Xato sababi ko'rsatilishi kerak");
});

// ============================================================================
// TEST 10: /vaqf-api/health tashqi IP'dan rad etilishi (403)
// ============================================================================
test("10. /vaqf-api/health tashqi IP'dan rad etilishi (403) va 127.0.0.1 yoki Direktordan ruxsat berilishi", async () => {
  // 1) External IP without Director session -> forbidden
  const extReq = {
    method: "GET",
    socket: { remoteAddress: "203.0.113.50" },
    headers: { "x-forwarded-for": "203.0.113.50" },
  };
  assert.equal(
    isHealthRequestAllowed(extReq, null),
    false,
    "Tashqi IP (203.0.113.50) rad etilishi shart"
  );

  // Verify HTTP 403 via handleVaqfApi
  let statusCode = 0;
  let responseBody = "";
  const mockRes = {
    writeHead(st) {
      statusCode = st;
    },
    end(b) {
      responseBody = b;
    },
  };
  await handleVaqfApi(extReq, mockRes, new URL("http://127.0.0.1:3000/vaqf-api/health"), {
    getSession: () => null,
    getSessionAccessContext: () => null,
  });
  assert.equal(statusCode, 403, "Tashqi IP uchun /vaqf-api/health 403 qaytarishi shart");

  // 2) Proxied external request over 127.0.0.1 with X-Forwarded-For external IP -> also 403!
  const proxiedExtReq = {
    method: "GET",
    socket: { remoteAddress: "127.0.0.1" },
    headers: { "x-forwarded-for": "185.100.87.10" },
  };
  assert.equal(
    isHealthRequestAllowed(proxiedExtReq, null),
    false,
    "Nginx orqali kelgan tashqi X-Forwarded-For so'rovi ham sessiyasiz 403 bo'lishi shart"
  );

  // 3) Direct 127.0.0.1 without X-Forwarded-For -> allowed (200)
  const localReq = {
    method: "GET",
    socket: { remoteAddress: "127.0.0.1" },
    headers: {},
  };
  assert.equal(isHealthRequestAllowed(localReq, null), true, "To'g'ridan-to'g'ri 127.0.0.1 ruxsat etilishi kerak");

  // 4) Director session -> allowed (200)
  assert.equal(
    isHealthRequestAllowed(proxiedExtReq, { isDirector: true, role: "director" }),
    true,
    "Direktor sessiyasi uchun ruxsat etilishi kerak"
  );

  // Also verify 5 multi-import templates generate valid Excel buffers
  for (const tplType of ["locations", "assets", "roles", "properties", "schedules"]) {
    const tpl = await generateMultiImportTemplateBuffer(tplType);
    assert.ok(Buffer.isBuffer(tpl.buffer) && tpl.buffer.length > 5000, `${tplType} Excel shabloni yaratilishi kerak`);
  }
});
