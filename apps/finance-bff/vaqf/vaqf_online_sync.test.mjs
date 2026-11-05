import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db, query } from "./db.mjs";
import { runVaqfMigrations } from "./migrate.mjs";
import {
  processOnlineDonationsBatch,
  syncOnlineDonationsFromEzanWeb,
  signEzanSyncRequest,
} from "./automationService.mjs";
import { listDonations } from "./governanceService.mjs";

test.after(async () => {
  await db.rawPool.end();
});

test("1. Migratsiya 007_vaqf_online_donations.sql: vaqf.donations da source va external_ref ustunlari mavjud", async () => {
  await runVaqfMigrations(db, { silent: true });
  const cols = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'vaqf' AND table_name = 'donations'
       AND column_name IN ('source', 'external_ref')`
  );
  assert.equal(cols.rows.length, 2);
});

test("2. Bir xayriya ikki marta kelsa (ON CONFLICT DO NOTHING), vaqf.donations da faqat bitta yozuv yaratiladi", async () => {
  const extRef = `ext-test-${crypto.randomUUID()}`;
  const pubNo = `EZ-2027-${Math.floor(100000 + Math.random() * 899999)}`;

  const sampleItem = {
    external_ref: extRef,
    public_no: pubNo,
    status: "paid",
    amount: 1500,
    currency: "TRY",
    amount_try: 1500,
    purpose_code: "EGITIM-BURS",
    restricted: true,
    received_at: "2026-11-05",
    kvkk_consent: true,
    donor: {
      is_anonymous: false,
      full_name: "Sinxron Test Donor",
      phone: "+905554443322",
      email: "synctest@ezanvakfi.org",
    },
  };

  const first = await processOnlineDonationsBatch([sampleItem]);
  assert.equal(first.inserted, 1);

  const second = await processOnlineDonationsBatch([sampleItem]);
  assert.equal(second.inserted, 0);

  const dbCheck = await query(
    `SELECT id, source, purpose, restricted, status FROM vaqf.donations WHERE external_ref = $1`,
    [extRef]
  );
  assert.equal(dbCheck.rows.length, 1);
  assert.equal(dbCheck.rows[0].source, "online");
  assert.equal(dbCheck.rows[0].restricted, true);
  assert.match(dbCheck.rows[0].purpose, /^Onlayn bağış:/);

  const onlineList = await listDonations({ source: "online", vAccess: { isDirector: true } });
  assert.ok(onlineList.some((d) => d.external_ref === extRef));
});

test("3. Refund kelsa, mavjud onlayn xayriya 'cancelled' holatiga o'tadi va cancelled_reason yoziladi", async () => {
  const extRef = `ext-refund-${crypto.randomUUID()}`;
  const pubNo = `EZ-2027-${Math.floor(100000 + Math.random() * 899999)}`;

  await processOnlineDonationsBatch([
    {
      external_ref: extRef,
      public_no: pubNo,
      status: "paid",
      amount: 750,
      currency: "TRY",
      amount_try: 750,
      purpose_code: "GENEL-BAGIS",
      restricted: false,
      received_at: "2026-11-05",
      kvkk_consent: false,
      donor: { is_anonymous: true, full_name: "Anonim Bağışçı" },
    },
  ]);

  const refRes = await processOnlineDonationsBatch([
    {
      external_ref: extRef,
      public_no: pubNo,
      status: "refunded",
      amount: 750,
      currency: "TRY",
      amount_try: 750,
      purpose_code: "GENEL-BAGIS",
      restricted: false,
      refund_reason: "Mijoz talabi bilan iyzico orqali qaytarildi",
      donor: { is_anonymous: true },
    },
  ]);
  assert.equal(refRes.updatedRefunds, 1);

  const check = await query(
    `SELECT status, cancelled_reason FROM vaqf.donations WHERE external_ref = $1`,
    [extRef]
  );
  assert.equal(check.rows[0].status, "cancelled");
  assert.match(check.rows[0].cancelled_reason, /qaytarildi/);
});

test("4. Sinxronlash 15 daqiqadan ko'p uzilsa, direktorga outbox orqali bitta ogohlantirish tushadi", async () => {
  const res = await syncOnlineDonationsFromEzanWeb({
    simulateOutageMinutes: 20,
  });
  assert.equal(res.ok, false);

  const outbox = await query(
    `SELECT * FROM vaqf.notifications_outbox
     WHERE event_type = 'online_donations_sync_down'
     ORDER BY id DESC LIMIT 1`
  );
  assert.equal(outbox.rows.length, 1);
  assert.equal(outbox.rows[0].recipient_ref, "role:director");
});