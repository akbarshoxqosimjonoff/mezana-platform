import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, query, withTransaction } from "./db.mjs";
import { refreshVaqfRoleCache } from "./lifecycleService.mjs";
import {
  enqueueOutboxNotification,
  processOutboxBatch,
  captureApprovedFinanceExpenseSafe,
  runDailySchedulesReminderCheck,
  signTelegramWebAppInitDataForTest,
  verifyTelegramWebAppInitData,
  getVaqfBotSecret,
} from "./automationService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BFF_DIR = path.resolve(__dirname, "..");
const BASE_URL = process.env.VAQF_TEST_BASE_URL || "http://127.0.0.1:3000";
const SESSIONS_PATH = path.join(BFF_DIR, ".sessions.json");

function getTestSessions() {
  const raw = JSON.parse(fs.readFileSync(SESSIONS_PATH, "utf8"));
  let directorSid = null;
  let managerSid = null; // userumar -> inventory_manager
  let staffSid = null; // muhammadjon@moliya.org -> staff
  let otherSid = null; // abdurahman -> other employee

  for (const [sid, sess] of Object.entries(raw)) {
    if (!directorSid && sess?.crmUser?.role === "root" && sess?.erpUser?.role === "DIRECTOR") {
      directorSid = sid;
    }
    if (!managerSid && sess?.crmUser?.username === "userumar") {
      managerSid = sid;
    }
    if (!staffSid && sess?.erpUser?.email === "muhammadjon@moliya.org") {
      staffSid = sid;
    }
    if (!otherSid && sess?.crmUser?.username === "abdurahman") {
      otherSid = sid;
    }
  }
  assert.ok(directorSid, "Director session topilmadi");
  assert.ok(managerSid, "Manager (userumar) session topilmadi");
  assert.ok(staffSid, "Staff (muhammadjon) session topilmadi");
  assert.ok(otherSid, "Other employee (abdurahman) session topilmadi");
  return { directorSid, managerSid, staffSid, otherSid };
}

async function apiRequest(urlPath, { sid, method = "GET", body, extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders };
  if (sid) headers["Cookie"] = `mezana_fin_sid=${sid}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, data };
}

async function botRequest(urlPath, { telegramId, method = "GET", body } = {}) {
  return apiRequest(urlPath, {
    method,
    body,
    extraHeaders: {
      "X-Vaqf-Bot-Secret": getVaqfBotSecret(),
      "X-Telegram-Id": String(telegramId),
    },
  });
}

async function botCallback({ telegramId, action, targetId, outboxId = null, reason = null }) {
  return apiRequest("/vaqf-api/bot/callback", {
    method: "POST",
    extraHeaders: {
      "X-Vaqf-Bot-Secret": getVaqfBotSecret(),
    },
    body: {
      telegramId: String(telegramId),
      action,
      targetId,
      outboxId,
      reason,
    },
  });
}

const TEST_TG_DIRECTOR = "990001001";
const TEST_TG_MANAGER = "8014832689";
const TEST_TG_STAFF = "990001003";
const TEST_TG_OTHER = "990001004";

const ctx = {
  directorSid: null,
  managerSid: null,
  staffSid: null,
  otherSid: null,
  savedLinks: [],
  testDedupeKeySent: null,
  testDedupeKeySkip: null,
  testDedupeKeyFail: null,
  testExpenseId: null,
  nonInvExpId: null,
  pendingExp: null,
  createdAssets: [],
  firstLaptop: null,
  zmtDoc: null,
  zmtOutboxId: null,
  hchDoc: null,
  hchOutboxId: null,
  createdSchedule: null,
  roomLoc: null,
};

test.before(async () => {
  Object.assign(ctx, getTestSessions());

  await apiRequest("/vaqf-api/roles", {
    sid: ctx.directorSid,
    method: "POST",
    body: {
      user_ref: "userumar",
      user_name: "Umarxon",
      role: "inventory_manager",
      institution_id: null,
      alternate_refs: ["crm:admin:1", "idora@moliya.org"],
    },
  });
  await apiRequest("/vaqf-api/roles", {
    sid: ctx.directorSid,
    method: "POST",
    body: {
      user_ref: "muhammadjon@moliya.org",
      user_name: "Muhammadjon Sobirjonov",
      role: "staff",
      institution_id: 1,
    },
  });
  await apiRequest("/vaqf-api/roles", {
    sid: ctx.directorSid,
    method: "POST",
    body: {
      user_ref: "abdurahman",
      user_name: "Abdurahman",
      role: "accountant",
      institution_id: 1,
      alternate_refs: ["crm:admin:2", "vaqf@moliya.org"],
    },
  });
  await refreshVaqfRoleCache();

  const usersRes = await query(`SELECT id, email FROM identity."User"`);
  const directorIdentity =
    usersRes.rows.find((u) => u.id === "cmtlai0bg000ipir95hv9hfez") ||
    usersRes.rows.find((u) => String(u.email).toLowerCase() === "director@moliy.org") ||
    usersRes.rows[0];
  const staffIdentity = usersRes.rows.find((u) => String(u.email).toLowerCase() === "muhammadjon@moliya.org");
  const managerIdentity = usersRes.rows.find((u) => String(u.email).toLowerCase() === "idora@moliya.org");
  const otherIdentity = usersRes.rows.find((u) => String(u.email).toLowerCase() === "vaqf@moliya.org");

  const savedLinks = await query(
    `SELECT * FROM identity.telegram_links
     WHERE "userId" IN ($1, $2, $3, $4)
        OR "telegramId" IN ($5, $6, $7, $8)`,
    [
      directorIdentity.id,
      staffIdentity.id,
      managerIdentity.id,
      otherIdentity.id,
      TEST_TG_DIRECTOR,
      TEST_TG_MANAGER,
      TEST_TG_STAFF,
      TEST_TG_OTHER,
    ]
  );
  ctx.savedLinks = savedLinks.rows;

  await query(
    `DELETE FROM identity.telegram_links
     WHERE "userId" IN ($1, $2, $3, $4)
        OR "telegramId" IN ($5, $6, $7, $8)`,
    [
      directorIdentity.id,
      staffIdentity.id,
      managerIdentity.id,
      otherIdentity.id,
      TEST_TG_DIRECTOR,
      TEST_TG_MANAGER,
      TEST_TG_STAFF,
      TEST_TG_OTHER,
    ]
  );
  await query(
    `INSERT INTO identity.telegram_links (id, "userId", "telegramId", "telegramUsername", "linkedAt")
     VALUES
       ('test_tg_link_dir', $1, $2, 'test_director', NOW()),
       ('test_tg_link_staff', $3, $4, 'test_staff', NOW()),
       ('test_tg_link_mgr', $5, $6, 'userumar_tg', NOW()),
       ('test_tg_link_oth', $7, $8, 'abdurahman_tg', NOW())`,
    [
      directorIdentity.id,
      TEST_TG_DIRECTOR,
      staffIdentity.id,
      TEST_TG_STAFF,
      managerIdentity.id,
      TEST_TG_MANAGER,
      otherIdentity.id,
      TEST_TG_OTHER,
    ]
  );
  await query(
    `INSERT INTO vaqf.bot_chats (telegram_id, user_ref, started_at, blocked_at, last_seen_at)
     VALUES
       ($1, 'director@moliy.org', NOW(), NULL, NOW()),
       ($2, 'muhammadjon@moliya.org', NOW(), NULL, NOW()),
       ($3, 'userumar', NOW(), NULL, NOW()),
       ($4, 'abdurahman', NOW(), NULL, NOW())
     ON CONFLICT (telegram_id) DO UPDATE SET blocked_at = NULL, last_seen_at = NOW()`,
    [TEST_TG_DIRECTOR, TEST_TG_STAFF, TEST_TG_MANAGER, TEST_TG_OTHER]
  );
});

test.after(async () => {
  try {
    const createdAssetIds = ctx.createdAssets.map((a) => a.id);
    if (createdAssetIds.length > 0) {
      await query(
        `DELETE FROM vaqf.schedule_logs WHERE schedule_id IN (SELECT id FROM vaqf.schedules WHERE asset_id = ANY($1::int[]))`,
        [createdAssetIds]
      );
      await query(`DELETE FROM vaqf.schedules WHERE asset_id = ANY($1::int[])`, [createdAssetIds]);
      await query(`DELETE FROM vaqf.assignments WHERE asset_id = ANY($1::int[])`, [createdAssetIds]);
      await query(`DELETE FROM vaqf.writeoffs WHERE asset_id = ANY($1::int[])`, [createdAssetIds]);
      await query(`DELETE FROM vaqf.document_items WHERE asset_id = ANY($1::int[])`, [createdAssetIds]);
      if (ctx.zmtDoc?.id || ctx.hchDoc?.id) {
        await query(`DELETE FROM vaqf.documents WHERE id = ANY($1::int[])`, [
          [ctx.zmtDoc?.id, ctx.hchDoc?.id].filter(Boolean),
        ]);
      }
      await query(`DELETE FROM vaqf.fault_reports WHERE asset_id = ANY($1::int[])`, [createdAssetIds]);
      await query(`DELETE FROM vaqf.asset_events WHERE asset_id = ANY($1::int[])`, [createdAssetIds]);
      await query(`DELETE FROM vaqf.assets WHERE id = ANY($1::int[])`, [createdAssetIds]);
    }
    if (ctx.testExpenseId || ctx.nonInvExpId) {
      await query(`DELETE FROM vaqf.pending_finance_expenses WHERE expense_id = ANY($1::text[])`, [
        [ctx.testExpenseId, ctx.nonInvExpId].filter(Boolean),
      ]);
    }
    await query(
      `DELETE FROM vaqf.notifications_outbox
       WHERE dedupe_key = ANY($1::text[])
          OR (payload->>'document_id')::int = ANY($2::int[])
          OR (payload->>'schedule_id')::int = $3
          OR payload->>'inventory_no' = $4`,
      [
        [ctx.testDedupeKeySent, ctx.testDedupeKeySkip, ctx.testDedupeKeyFail, `unregistered_expense:${ctx.testExpenseId}`].filter(Boolean),
        [ctx.zmtDoc?.id, ctx.hchDoc?.id].filter(Boolean),
        ctx.createdSchedule?.id || -1,
        ctx.firstLaptop?.inventory_no || "__none__",
      ]
    );
  } finally {
    await query(
      `DELETE FROM identity.telegram_links
       WHERE id IN ('test_tg_link_dir', 'test_tg_link_staff', 'test_tg_link_mgr', 'test_tg_link_oth')`
    );
    for (const row of ctx.savedLinks) {
      await query(
        `INSERT INTO identity.telegram_links (id, "userId", "telegramId", "telegramUsername", "linkedAt")
         VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
         ON CONFLICT (id) DO NOTHING`,
        [row.id, row.userId, row.telegramId, row.telegramUsername, row.linkedAt]
      );
    }
    await query(
      `DELETE FROM vaqf.user_roles WHERE user_ref IN ('userumar', 'muhammadjon@moliya.org', 'abdurahman')`
    );
    await refreshVaqfRoleCache();
    await db.rawPool.end();
  }
});

test("4-bosqich 1 (Outbox): Tranzaksiya ichida yozilishi, dedupe_key idempotentligi, sent, skipped (bog'lanmagan) va 5 marta xatoda failed bo'lishi", async () => {
  ctx.testDedupeKeySent = `test_p4_sent_${Date.now()}`;
  ctx.testDedupeKeySkip = `test_p4_skip_${Date.now()}`;
  ctx.testDedupeKeyFail = `test_p4_fail_${Date.now()}`;

  await withTransaction(async (client) => {
    const r1 = await enqueueOutboxNotification(client, {
      event_type: "assigned_to_you",
      recipient_ref: "muhammadjon@moliya.org",
      dedupe_key: ctx.testDedupeKeySent,
      title: "📦 Test Zimmat Xabari",
      body: "Sizga test noutbuk biriktirildi",
      payload: { urgent: true },
    });
    assert.ok(r1?.id, "Outbox qatori tranzaksiya ichida yaratilishi kerak");

    const r1Dup = await enqueueOutboxNotification(client, {
      event_type: "assigned_to_you",
      recipient_ref: "muhammadjon@moliya.org",
      dedupe_key: ctx.testDedupeKeySent,
      title: "Dup",
      body: "Dup",
    });
    assert.equal(r1Dup, null, "Duplicate dedupe_key ikkinchi marta yozilmasligi kerak");

    await enqueueOutboxNotification(client, {
      event_type: "assigned_to_you",
      recipient_ref: "unlinked_ghost_user_999@moliya.org",
      dedupe_key: ctx.testDedupeKeySkip,
      title: "Ghost Xabar",
      body: "Telegram bog'lanmagan xodim",
      payload: { urgent: true },
    });

    await enqueueOutboxNotification(client, {
      event_type: "approval_needed",
      recipient_ref: "role:director",
      dedupe_key: ctx.testDedupeKeyFail,
      title: "Xato sinovi",
      body: "5 marta urinib failed bo'lishi kerak",
      payload: { urgent: true },
    });
  });

  await processOutboxBatch({
    limit: 50,
    forceSendQuietHours: true,
    sender: async (chatId, htmlText) => {
      if (htmlText.includes("5 marta urinib failed")) {
        throw new Error("Simulated Telegram 500 error");
      }
      return { messageId: 777888, chatId: String(chatId) };
    },
  });

  const sentRow = await query(`SELECT * FROM vaqf.notifications_outbox WHERE dedupe_key = $1`, [ctx.testDedupeKeySent]);
  assert.equal(sentRow.rows[0].status, "sent");
  assert.equal(String(sentRow.rows[0].telegram_message_id), "777888");

  const skipRow = await query(`SELECT * FROM vaqf.notifications_outbox WHERE dedupe_key = $1`, [ctx.testDedupeKeySkip]);
  assert.equal(skipRow.rows[0].status, "skipped", "Telegram'ga bog'lanmagan foydalanuvchi 'skipped' bo'lishi shart");

  for (let i = 0; i < 4; i++) {
    await query(
      `UPDATE vaqf.notifications_outbox SET next_attempt_at = NOW() - INTERVAL '1 minute' WHERE dedupe_key = $1`,
      [ctx.testDedupeKeyFail]
    );
    await processOutboxBatch({
      limit: 50,
      forceSendQuietHours: true,
      sender: async () => {
        throw new Error("Simulated Telegram 500 error");
      },
    });
  }
  const failRow = await query(`SELECT * FROM vaqf.notifications_outbox WHERE dedupe_key = $1`, [ctx.testDedupeKeyFail]);
  assert.equal(failRow.rows[0].attempts, 5);
  assert.equal(failRow.rows[0].status, "failed", "5 marta xatodan so'ng 'failed' bo'lishi shart");
});

test("4-bosqich 2 (Mini App HMAC Xavfsizligi): To'g'ri initData qabul qilinadi (200), buzilgan (tampered) initData rad etiladi (401)", async () => {
  const validInitData = signTelegramWebAppInitDataForTest({
    id: Number(TEST_TG_STAFF),
    first_name: "Muhammadjon",
    username: "test_staff",
  });
  const verified = verifyTelegramWebAppInitData(validInitData);
  assert.equal(verified.valid, true);

  const tamperedInitData = validInitData.replace("Muhammadjon", "Hacker");
  const tamperedResult = verifyTelegramWebAppInitData(tamperedInitData);
  assert.equal(tamperedResult.valid, false);

  const unauthMiniApp = await apiRequest("/vaqf-api/me", {
    extraHeaders: { "X-Telegram-Init-Data": tamperedInitData },
  });
  assert.equal(unauthMiniApp.status, 401, "Buzilgan initData HTTP 401 qaytarishi shart");

  const authMiniApp = await apiRequest("/vaqf-api/me", {
    extraHeaders: { "X-Telegram-Init-Data": validInitData },
  });
  assert.equal(authMiniApp.status, 200, "To'g'ri initData orqali sessiyasiz Mini App 200 qaytarishi shart");
  assert.equal(authMiniApp.data.authenticated, true);
});

test("4-bosqich 3 (Moliya xavfsizligi): Vaqf hook xato qaytarsa ham moliya xarajati to'xtab qolmasligi (non-blocking)", async () => {
  const safeHookErr = await captureApprovedFinanceExpenseSafe({
    id: "test_err_exp",
    categoryName: "Jihozlar",
    amount: 5000,
    _simulateVaqfHookError: true,
  });
  assert.equal(safeHookErr.captured, false);
  assert.equal(safeHookErr.nonBlockingError, true, "Vaqf hook xatosi moliyani to'xtatib qo'ymasligi kerak");
});

test("4-bosqich 4 (Moliya integratsiyasi): Jihozlar xarajati navbatga tushishi va 'Bu inventar emas' sababsiz rad etilmasligi (400)", async () => {
  ctx.testExpenseId = `exp_p4_laptops_${Date.now()}`;
  const capRes = await captureApprovedFinanceExpenseSafe({
    id: ctx.testExpenseId,
    source_type: "expense",
    categoryName: "Jihozlar",
    title: "Lenovo ThinkPad L15 (5 ta noutbuk)",
    description: "O'qituvchilar xonasi uchun 5 ta noutbuk xaridi",
    amount: 125000,
    currency: "TRY",
    date: "2026-11-05",
    buyerName: "Umarxon",
  });
  assert.equal(capRes.captured, true);

  const queueRes = await apiRequest("/vaqf-api/finance/pending-expenses?status=pending", { sid: ctx.managerSid });
  assert.equal(queueRes.status, 200);
  ctx.pendingExp = queueRes.data.items.find((x) => x.expense_id === ctx.testExpenseId);
  assert.ok(ctx.pendingExp, "Xarajat 'Ro'yxatga olinishi kerak' navbatida ko'rinishi kerak");

  ctx.nonInvExpId = `exp_p4_paper_${Date.now()}`;
  const capPaper = await captureApprovedFinanceExpenseSafe({
    id: ctx.nonInvExpId,
    categoryName: "Jihozlar",
    title: "Mayda sarf materiallari",
    amount: 450,
    currency: "TRY",
  });
  const noReasonRes = await apiRequest(`/vaqf-api/finance/pending-expenses/${capPaper.item.id}/not-inventory`, {
    sid: ctx.managerSid,
    method: "POST",
    body: { reason: "" },
  });
  assert.equal(noReasonRes.status, 400, "Sabab ko'rsatilmasa 400 xato qaytishi kerak");

  const withReasonRes = await apiRequest(`/vaqf-api/finance/pending-expenses/${capPaper.item.id}/not-inventory`, {
    sid: ctx.managerSid,
    method: "POST",
    body: { reason: "Bir martalik sarf materiali, asosiy vosita emas" },
  });
  assert.equal(withReasonRes.status, 200);
  assert.equal(withReasonRes.data.item.status, "not_inventory");
});

test("4-bosqich 5 (1 bosishda 5 ta kartochka + Ikki tomonlama moliya havolasi): 5 ta alohida noutbuk kartochkasi va kafolat jadvali avtomatik yaratilishi", async () => {
  const catsRes = await apiRequest("/vaqf-api/categories", { sid: ctx.managerSid });
  const itCat = catsRes.data.items.find((c) => c.code === "IT") || catsRes.data.items[0];
  const locsRes = await apiRequest("/vaqf-api/locations?institution_id=1", { sid: ctx.managerSid });
  ctx.roomLoc = locsRes.data.items.find((l) => l.kind === "room") || locsRes.data.items[0];

  const regRes = await apiRequest(`/vaqf-api/finance/pending-expenses/${ctx.pendingExp.id}/register`, {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      name: "Lenovo ThinkPad L15",
      category_id: itCat.id,
      institution_id: 1,
      location_id: ctx.roomLoc.id,
      split_cards: true,
      cards_count: 5,
      unit: "dona",
      purchase_price: 25000,
      currency: "TRY",
      warranty_until: "2027-11-05",
    },
  });
  assert.equal(regRes.status, 201);
  ctx.createdAssets = regRes.data.assets;
  assert.equal(ctx.createdAssets.length, 5, "Aynan 5 ta alohida kartochka yaratilishi shart");
  ctx.firstLaptop = ctx.createdAssets[0];
  assert.equal(ctx.firstLaptop.expense_ref, ctx.testExpenseId);

  const finLinksRes = await apiRequest("/vaqf-api/finance/expense-links", { sid: ctx.managerSid });
  assert.equal(finLinksRes.status, 200);
  assert.ok(finLinksRes.data.links[ctx.testExpenseId], "Moliyada xarajat qarshisida inventar belgisi qaytishi kerak");

  const autoWarranty = await query(
    `SELECT * FROM vaqf.schedules WHERE asset_id = $1 AND kind = 'warranty'`,
    [ctx.firstLaptop.id]
  );
  assert.equal(autoWarranty.rows.length, 1, "warranty_until kiritilganda avtomatik kafolat jadvali yaratilishi shart");
});

test("4-bosqich 6 (Telegram Bot Xavfsizligi): Zimmatni boshqa xodim Telegram tugmasi orqali tasdiqlay olmaydi (403)", async () => {
  const zmtRes = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "assignment",
      institution_id: 1,
      to_person_ref: "muhammadjon@moliya.org",
      to_person_name: "Muhammadjon Sobirjonov",
      to_location_id: ctx.roomLoc.id,
      reason: "O'quv ishlari uchun noutbuk zimmatga berildi",
      submit: true,
      items: [{ asset_id: ctx.firstLaptop.id, qty: 1 }],
    },
  });
  assert.equal(zmtRes.status, 201);
  ctx.zmtDoc = zmtRes.data;

  const zmtOutbox = await query(
    `SELECT * FROM vaqf.notifications_outbox WHERE event_type = 'assigned_to_you' AND (payload->>'document_id')::int = $1`,
    [ctx.zmtDoc.id]
  );
  assert.equal(zmtOutbox.rows.length, 1);
  ctx.zmtOutboxId = zmtOutbox.rows[0].id;

  const wrongConfirm = await botCallback({
    telegramId: TEST_TG_OTHER,
    action: "confirm_doc",
    targetId: ctx.zmtDoc.id,
    outboxId: ctx.zmtOutboxId,
  });
  assert.equal(wrongConfirm.status, 403, "Boshqa xodimning 'Qabul qildim' tugmasini bosishi 403 bilan rad etilishi shart");
});

test("4-bosqich 7 (Telegram Bot Zimmat + Idempotentlik): O'z xodimi tasdiqlaydi (200) va ikkinchi marta bosilganda qayta bajarilmaydi", async () => {
  const rightConfirm = await botCallback({
    telegramId: TEST_TG_STAFF,
    action: "confirm_doc",
    targetId: ctx.zmtDoc.id,
    outboxId: ctx.zmtOutboxId,
  });
  assert.equal(rightConfirm.status, 200);
  assert.equal(rightConfirm.data.alreadyProcessed, false);
  assert.ok(rightConfirm.data.statusLine.includes("Qabul qilindi"));

  const dupConfirm = await botCallback({
    telegramId: TEST_TG_STAFF,
    action: "confirm_doc",
    targetId: ctx.zmtDoc.id,
    outboxId: ctx.zmtOutboxId,
  });
  assert.equal(dupConfirm.status, 200);
  assert.equal(dupConfirm.data.alreadyProcessed, true, "Ikkinchi marta bosilganda qayta bajarilmasligi shart");
});

test("4-bosqich 8 (Telegram Bot Nosozlik): Xodim bot orqali nosozlik xabar qiladi va mas'ulga xabar tushadi", async () => {
  const faultBotRes = await botRequest(`/vaqf-api/assets/${ctx.firstLaptop.id}/fault`, {
    telegramId: TEST_TG_STAFF,
    method: "POST",
    body: {
      description: "Ekran shleyfi uzildi, tasvir miltillayapti",
    },
  });
  assert.equal(faultBotRes.status, 201);

  const faultOutbox = await query(
    `SELECT * FROM vaqf.notifications_outbox WHERE event_type = 'fault_reported' AND payload->>'inventory_no' = $1`,
    [ctx.firstLaptop.inventory_no]
  );
  assert.ok(faultOutbox.rows.length >= 1, "Inventar mas'uliga fault_reported outbox xabari tushishi kerak");
});

test("4-bosqich 9 (Telegram Bot Direktor tasdig'i + Xavfsizlik + Idempotentlik): Direktor bo'lmagan tasdiqlay olmaydi (403), Direktor tasdiqlaydi (200) va ikkinchi bosish idempotent", async () => {
  const hchRes = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "writeoff",
      institution_id: 1,
      from_location_id: ctx.roomLoc.id,
      from_person_ref: "muhammadjon@moliya.org",
      from_person_name: "Muhammadjon Sobirjonov",
      reason: "unrepairable",
      notes: "Servis markazi tiklab bo'lmasligini tasdiqladi",
      submit: true,
      items: [{ asset_id: ctx.firstLaptop.id, qty: 1, note: "Yaroqsiz" }],
    },
  });
  assert.equal(hchRes.status, 201);
  ctx.hchDoc = hchRes.data;

  const hchOutbox = await query(
    `SELECT * FROM vaqf.notifications_outbox WHERE event_type = 'approval_needed' AND (payload->>'document_id')::int = $1`,
    [ctx.hchDoc.id]
  );
  assert.equal(hchOutbox.rows.length, 1);
  ctx.hchOutboxId = hchOutbox.rows[0].id;

  const nonDirApprove = await botCallback({
    telegramId: TEST_TG_MANAGER,
    action: "approve_doc",
    targetId: ctx.hchDoc.id,
    outboxId: ctx.hchOutboxId,
  });
  assert.equal(nonDirApprove.status, 403, "Direktor bo'lmagan foydalanuvchi tasdiqlamoqchi bo'lsa 403 qaytarishi shart");

  const dirApprove = await botCallback({
    telegramId: TEST_TG_DIRECTOR,
    action: "approve_doc",
    targetId: ctx.hchDoc.id,
    outboxId: ctx.hchOutboxId,
  });
  assert.equal(dirApprove.status, 200);
  assert.equal(dirApprove.data.alreadyProcessed, false);

  const dirApproveDup = await botCallback({
    telegramId: TEST_TG_DIRECTOR,
    action: "approve_doc",
    targetId: ctx.hchDoc.id,
    outboxId: ctx.hchOutboxId,
  });
  assert.equal(dirApproveDup.status, 200);
  assert.equal(dirApproveDup.data.alreadyProcessed, true, "Ikkinchi marta bosilganda qayta bajarilmasligi shart");

  const afterWriteoff = await apiRequest(`/vaqf-api/assets/${ctx.firstLaptop.id}`, { sid: ctx.directorSid });
  assert.equal(afterWriteoff.data.asset.status, "written_off");
});

test("4-bosqich 10 (Muddatli ishlar va Eslatmalar): Muddati o'tganda Direktorga ogohlantirish va 'Bajarildi' bosilganda keyingi sanaga surilishi", async () => {
  const secondLaptop = ctx.createdAssets[1];
  const yesterdayStr = new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10);
  const schedCreateRes = await apiRequest("/vaqf-api/schedules", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      institution_id: 1,
      asset_id: secondLaptop.id,
      kind: "maintenance",
      title: "Test Kompyuter Profilaktikasi",
      interval_months: 6,
      next_due: yesterdayStr,
      responsible_ref: "muhammadjon@moliya.org",
      responsible_name: "Muhammadjon Sobirjonov",
    },
  });
  assert.equal(schedCreateRes.status, 201);
  ctx.createdSchedule = schedCreateRes.data.item;

  const dueCheck = await runDailySchedulesReminderCheck();
  assert.ok(dueCheck.enqueued >= 1);

  const dirOverdueOutbox = await query(
    `SELECT * FROM vaqf.notifications_outbox WHERE event_type = 'schedule_due' AND recipient_ref = 'role:director' AND (payload->>'schedule_id')::int = $1`,
    [ctx.createdSchedule.id]
  );
  assert.equal(dirOverdueOutbox.rows.length, 1, "Muddati o'tganda direktorga ham ogohlantirish tushishi shart");

  const markDoneRes = await apiRequest(`/vaqf-api/schedules/${ctx.createdSchedule.id}/done`, {
    sid: ctx.managerSid,
    method: "POST",
    body: { note: "Termal pasta almashtirildi va changdan tozalandi" },
  });
  assert.equal(markDoneRes.status, 200);
  assert.ok(markDoneRes.data.item.next_due_str > yesterdayStr, "Bajarildi bosilganda next_due oldinga surilishi shart");
});

test("4-bosqich 11 (Bosh sahifa / Dashboard): Muassasa va 'Barcha muassasalar' kesimida ko'rsatkichlar va diqqat talab qiluvchi bloklar", async () => {
  const dashSingle = await apiRequest("/vaqf-api/dashboard?institution_id=1", { sid: ctx.directorSid });
  assert.equal(dashSingle.status, 200);
  assert.ok(dashSingle.data.totals);
  assert.ok(dashSingle.data.attention);

  const dashAll = await apiRequest("/vaqf-api/dashboard?institution_id=all", { sid: ctx.directorSid });
  assert.equal(dashAll.status, 200);
});
