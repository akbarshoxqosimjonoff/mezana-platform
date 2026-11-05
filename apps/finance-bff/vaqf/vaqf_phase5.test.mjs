import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db.mjs";
import { refreshVaqfRoleCache } from "./lifecycleService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BFF_DIR = path.resolve(__dirname, "..");
const BASE_URL = process.env.VAQF_TEST_BASE_URL || "http://127.0.0.1:3000";
const SESSIONS_PATH = path.join(BFF_DIR, ".sessions.json");

function getTestSessions() {
  const raw = JSON.parse(fs.readFileSync(SESSIONS_PATH, "utf8"));
  let directorSid = null;
  let managerSid = null; // userumar -> inventory_manager
  let staffSid = null; // muhammadjon@moliya.org -> staff
  let otherSid = null; // abdurahman -> temporary role target (board_member / accountant)

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

const sessions = getTestSessions();
let institutionId = 1;
let categoryId = 1;
let locationId = 1;

const createdDonorIds = [];
const createdDonationIds = [];
const createdAssetIds = [];
const createdPropertyIds = [];
const createdLeaseIds = [];
const createdArchiveIds = [];
const createdDecisionIds = [];
const createdMeetingIds = [];
const createdMemberIds = [];
const createdDocumentIds = [];
let originalBoardRules = null;

test.before(async () => {
  await apiRequest("/vaqf-api/roles", {
    sid: sessions.directorSid,
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
    sid: sessions.directorSid,
    method: "POST",
    body: {
      user_ref: "muhammadjon@moliya.org",
      user_name: "Muhammadjon Sobirjonov",
      role: "staff",
      institution_id: 1,
    },
  });
  await refreshVaqfRoleCache();

  const instRes = await query(`SELECT id FROM vaqf.institutions ORDER BY id ASC LIMIT 1`);
  if (instRes.rows[0]) institutionId = Number(instRes.rows[0].id);
  const catRes = await query(`SELECT id FROM vaqf.asset_categories ORDER BY id ASC LIMIT 1`);
  if (catRes.rows[0]) categoryId = Number(catRes.rows[0].id);
  const locRes = await query(`SELECT id FROM vaqf.locations WHERE institution_id = $1 ORDER BY id ASC LIMIT 1`, [institutionId]);
  if (locRes.rows[0]) locationId = Number(locRes.rows[0].id);

  const rulesRes = await query(`SELECT value FROM vaqf.settings WHERE key = 'board_decision_rules'`);
  originalBoardRules = rulesRes.rows[0]?.value || null;
});

test.after(async () => {
  try {
    if (originalBoardRules) {
      await apiRequest("/vaqf-api/governance/settings", {
        sid: sessions.directorSid,
        method: "PATCH",
        body: { key: "board_decision_rules", value: originalBoardRules },
      });
    }
    const existingRoles = await apiRequest("/vaqf-api/roles", { sid: sessions.directorSid });
    for (const r of existingRoles.data?.roles || []) {
      if (r.user_ref === "abdurahman") {
        await apiRequest(`/vaqf-api/roles/${r.id}`, { sid: sessions.directorSid, method: "DELETE" });
      }
    }
    await apiRequest("/vaqf-api/roles", {
      sid: sessions.directorSid,
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

    if (createdDocumentIds.length) {
      await query(`DELETE FROM vaqf.writeoffs WHERE document_id = ANY($1::int[])`, [createdDocumentIds]);
      await query(`DELETE FROM vaqf.document_items WHERE document_id = ANY($1::int[])`, [createdDocumentIds]);
      await query(`DELETE FROM vaqf.documents WHERE id = ANY($1::int[])`, [createdDocumentIds]);
    }
    if (createdDonationIds.length) {
      await query(`DELETE FROM vaqf.donation_spend_links WHERE donation_id = ANY($1::int[])`, [createdDonationIds]);
      await query(`DELETE FROM vaqf.donation_items WHERE donation_id = ANY($1::int[])`, [createdDonationIds]);
      await query(`DELETE FROM vaqf.donations WHERE id = ANY($1::int[])`, [createdDonationIds]);
    }
    if (createdAssetIds.length) {
      await query(
        `DELETE FROM vaqf.writeoffs WHERE asset_id = ANY($1::int[]) OR document_id IN (SELECT document_id FROM vaqf.document_items WHERE asset_id = ANY($1::int[]))`,
        [createdAssetIds]
      );
      const orphanDocs = await query(`SELECT DISTINCT document_id FROM vaqf.document_items WHERE asset_id = ANY($1::int[])`, [createdAssetIds]);
      const orphanDocIds = orphanDocs.rows.map((r) => Number(r.document_id));
      await query(`DELETE FROM vaqf.document_items WHERE asset_id = ANY($1::int[])`, [createdAssetIds]);
      if (orphanDocIds.length) {
        await query(`DELETE FROM vaqf.documents WHERE id = ANY($1::int[])`, [orphanDocIds]);
      }
      await query(`DELETE FROM vaqf.asset_events WHERE asset_id = ANY($1::int[])`, [createdAssetIds]);
      await query(`DELETE FROM vaqf.assets WHERE id = ANY($1::int[])`, [createdAssetIds]);
    }
    if (createdDonorIds.length) {
      await query(`DELETE FROM vaqf.donors WHERE id = ANY($1::int[])`, [createdDonorIds]);
    }
    if (createdLeaseIds.length) {
      await query(`DELETE FROM vaqf.schedules WHERE lease_id = ANY($1::int[])`, [createdLeaseIds]);
      await query(`DELETE FROM vaqf.lease_payments WHERE lease_id = ANY($1::int[])`, [createdLeaseIds]);
      await query(`DELETE FROM vaqf.leases WHERE id = ANY($1::int[])`, [createdLeaseIds]);
    }
    if (createdPropertyIds.length) {
      await query(`UPDATE vaqf.locations SET property_id = NULL WHERE property_id = ANY($1::int[])`, [createdPropertyIds]);
      await query(`DELETE FROM vaqf.schedules WHERE property_id = ANY($1::int[])`, [createdPropertyIds]);
      await query(`DELETE FROM vaqf.property_documents WHERE property_id = ANY($1::int[])`, [createdPropertyIds]);
      await query(`DELETE FROM vaqf.properties WHERE id = ANY($1::int[])`, [createdPropertyIds]);
    }
    if (createdArchiveIds.length) {
      await query(`DELETE FROM vaqf.schedules WHERE archive_doc_id = ANY($1::int[])`, [createdArchiveIds]);
      await query(`DELETE FROM vaqf.archive_access_logs WHERE archive_doc_id = ANY($1::int[])`, [createdArchiveIds]);
      await query(`DELETE FROM vaqf.archive_document_versions WHERE archive_doc_id = ANY($1::int[])`, [createdArchiveIds]);
      await query(`DELETE FROM vaqf.archive_documents WHERE id = ANY($1::int[])`, [createdArchiveIds]);
    }
    if (createdDecisionIds.length) {
      await query(`DELETE FROM vaqf.board_decisions WHERE id = ANY($1::int[])`, [createdDecisionIds]);
    }
    if (createdMeetingIds.length) {
      await query(`DELETE FROM vaqf.board_meetings WHERE id = ANY($1::int[])`, [createdMeetingIds]);
    }
    if (createdMemberIds.length) {
      await query(`DELETE FROM vaqf.board_members WHERE id = ANY($1::int[])`, [createdMemberIds]);
    }
  } catch (err) {
    console.error("[vaqf_phase5 cleanup error]", err);
  }
});

// 1-TEST: Donorning tax_or_id_no maydoni bazada shifrlangan va ro'yxat API'sida faqat oxirgi 4 raqami qaytadi
test("1. Donor tax_or_id_no bazada AES-256-GCM bilan shifrlangan va ro'yxat API'da faqat oxirgi 4 raqami (***7890) qaytadi", async () => {
  const createRes = await apiRequest("/vaqf-api/donors", {
    sid: sessions.directorSid,
    method: "POST",
    body: {
      type: "person",
      full_name: "Ahmet Yılmaz (Ph5 Test)",
      phone: "+905551112233",
      email: "ahmet.test@example.com",
      address: "Üsküdar, İstanbul",
      tax_or_id_no: "1234567890",
      is_anonymous: false,
      kvkk_consent: true,
      notes: "Phase 5 test donor",
    },
  });
  assert.equal(createRes.status, 201, `Donor create failed: ${JSON.stringify(createRes.data)}`);
  const donorId = Number(createRes.data.donor.id);
  createdDonorIds.push(donorId);

  // Bazada shifrlangan holda yozilganini tekshirish
  const dbRow = await query(
    `SELECT tax_or_id_encrypted, phone_encrypted, email_encrypted, tax_or_id_last4 FROM vaqf.donors WHERE id = $1`,
    [donorId]
  );
  assert.ok(dbRow.rows[0].tax_or_id_encrypted.startsWith("v1:"), "tax_or_id_encrypted bazada v1: bilan shifrlangan bo'lishi shart");
  assert.ok(!dbRow.rows[0].tax_or_id_encrypted.includes("1234567890"), "Ochiq raqam bazada ko'rinmasligi shart");
  assert.ok(dbRow.rows[0].phone_encrypted.startsWith("v1:"), "phone_encrypted bazada shifrlangan bo'lishi shart");
  assert.equal(dbRow.rows[0].tax_or_id_last4, "7890");

  // Direktor uchun ro'yxatda faqat oxirgi 4 raqami ko'rinadi
  const listDir = await apiRequest("/vaqf-api/donors", { sid: sessions.directorSid });
  assert.equal(listDir.status, 200);
  const foundDir = listDir.data.items.find((d) => Number(d.id) === donorId);
  assert.ok(foundDir, "Donor ro'yxatda topilishi kerak");
  assert.equal(foundDir.tax_or_id_masked, "***7890");
  assert.equal(foundDir.tax_or_id_no, undefined, "Ro'yxatda to'liq tax_or_id_no qaytmasligi kerak");

  // Inventory manager uchun shaxsiy ma'lumotlar ko'rinmasligi kerak
  const listMgr = await apiRequest("/vaqf-api/donors", { sid: sessions.managerSid });
  assert.equal(listMgr.status, 200);
  const foundMgr = listMgr.data.items.find((d) => Number(d.id) === donorId);
  assert.ok(foundMgr);
  assert.equal(foundMgr.tax_or_id_masked, null, "Inventory manager tax_or_id_masked ko'rmasligi kerak");
  assert.equal(foundMgr.phone_masked, null, "Inventory manager telefonni ko'rmasligi kerak");
});

// 2-TEST: Buyum hadyasi (in_kind) kiritilganda vaqf.assets da yangi kartochka paydo bo'ladi va Bağış Makbuzu PDF yuklanadi
test("2. Buyum hadyasi (in_kind, 10 ta stul) kiritilganda vaqf.assets da acquisition_type='donation' bilan kartochka ochiladi va Bağış Makbuzu PDF yuklanadi", async () => {
  const donorId = createdDonorIds[0];
  const donRes = await apiRequest("/vaqf-api/donations", {
    sid: sessions.directorSid,
    method: "POST",
    body: {
      donor_id: donorId,
      institution_id: institutionId,
      kind: "in_kind",
      amount: 15000,
      currency: "TRY",
      received_at: "2026-11-05",
      purpose: "O'quv xonasi uchun 10 ta stul",
      restricted: false,
      notes: "10 ta stul hadyasi",
      items: [
        {
          name: "Sinov o'quv stuli (Hadya 10 dona)",
          category_id: categoryId,
          location_id: locationId,
          quantity: 10,
          estimated_value: 1500,
          currency: "TRY",
          condition: "good",
        },
      ],
    },
  });
  assert.equal(donRes.status, 201, `In-kind donation failed: ${JSON.stringify(donRes.data)}`);
  const donation = donRes.data.donation;
  createdDonationIds.push(Number(donation.id));
  assert.match(donation.donation_no, /^BGS-\d{4}-\d{4}$/);
  assert.equal(donation.items.length, 1);

  const createdAssetId = Number(donation.items[0].asset_id);
  assert.ok(createdAssetId > 0, "Buyum hadyasi uchun asset_id avtomatik yaratilishi shart");
  createdAssetIds.push(createdAssetId);

  const assetRow = await query(`SELECT id, name, acquisition_type, quantity, purchase_price FROM vaqf.assets WHERE id = $1`, [createdAssetId]);
  assert.equal(assetRow.rows.length, 1);
  assert.equal(assetRow.rows[0].acquisition_type, "donation");
  assert.equal(Number(assetRow.rows[0].quantity), 10);

  // Bağış Makbuzu PDF yuklab olish
  const pdfRes = await apiRequest(`/vaqf-api/donations/${donation.id}/receipt.pdf`, {
    sid: sessions.directorSid,
  });
  assert.equal(pdfRes.status, 200);
  assert.ok(Buffer.isBuffer(pdfRes.data));
  assert.equal(pdfRes.data.subarray(0, 5).toString("ascii"), "%PDF-");

  // Holat receipt_issued ga o'tganini tekshirish
  const checkDon = await query(`SELECT status, receipt_no FROM vaqf.donations WHERE id = $1`, [donation.id]);
  assert.equal(checkDon.rows[0].status, "receipt_issued");
  assert.ok(checkDon.rows[0].receipt_no.startsWith("MKB-"));
});

// 3-TEST: Maqsadli hadyaning (restricted) qoldiq summasi to'g'ri hisoblanadi
test("3. Maqsadli hadyaning (restricted=true) olingan - sarflangan = qoldiq summasi to'g'ri hisoblanadi va ortiqcha sarf bloklanadi", async () => {
  const donorId = createdDonorIds[0];
  const donRes = await apiRequest("/vaqf-api/donations", {
    sid: sessions.directorSid,
    method: "POST",
    body: {
      donor_id: donorId,
      institution_id: institutionId,
      kind: "cash",
      amount: 50000,
      currency: "TRY",
      received_at: "2026-11-05",
      purpose: "Kutubxona kitoblari uchun maqsadli fond",
      restricted: true,
    },
  });
  assert.equal(donRes.status, 201);
  const donationId = Number(donRes.data.donation.id);
  createdDonationIds.push(donationId);

  // 18 500 TRY sarflash
  const spend1 = await apiRequest(`/vaqf-api/donations/${donationId}/spend`, {
    sid: sessions.directorSid,
    method: "POST",
    body: {
      amount: 18500,
      currency: "TRY",
      expense_ref: "EXP-LIB-001",
      title: "Kutubxona uchun darsliklar xaridi",
    },
  });
  assert.equal(spend1.status, 200);
  assert.equal(Number(spend1.data.donation.spent_try), 18500);
  assert.equal(Number(spend1.data.donation.remaining_try), 31500);

  // Qoldiqdan (31 500 TRY) ko'p (40 000 TRY) sarflashga urinish bloklanishi kerak
  const spendOver = await apiRequest(`/vaqf-api/donations/${donationId}/spend`, {
    sid: sessions.directorSid,
    method: "POST",
    body: {
      amount: 40000,
      currency: "TRY",
      title: "Ortiqcha sarf urinishi",
    },
  });
  assert.equal(spendOver.status, 400);
});

// 4-TEST: Ijara shartnomasi yaratilganda oylik to'lov qatorlari va muddat eslatmasi avtomatik yaratiladi
test("4. Ko'chmas mulk va ijara shartnomasi yaratilganda oylik to'lov jadvali (lease_payments) va muddat eslatmasi (schedules) avtomatik yaratiladi", async () => {
  const propRes = await apiRequest("/vaqf-api/properties", {
    sid: sessions.directorSid,
    method: "POST",
    body: {
      institution_id: institutionId,
      name: "Vaqf Do'koni #1 (Ph5 Test)",
      kind: "shop",
      usage: "leased_out",
      city: "İstanbul",
      district: "Fatih",
      address: "Fevzipaşa Cd. No: 12",
      parcel_ada: "101",
      parcel_no: "5",
      area_m2: 85,
      acquisition_type: "donation",
      value: 4500000,
      currency: "TRY",
    },
  });
  assert.equal(propRes.status, 201, `Property create failed: ${JSON.stringify(propRes.data)}`);
  const propertyId = Number(propRes.data.property.id);
  createdPropertyIds.push(propertyId);
  assert.match(propRes.data.property.code, /^MLK-\d{3,}$/);

  // 3 oylik ijara shartnomasi (o'tgan oydan boshlab, kechikkan to'lovni ham tekshirish uchun)
  const leaseRes = await apiRequest("/vaqf-api/leases", {
    sid: sessions.directorSid,
    method: "POST",
    body: {
      property_id: propertyId,
      direction: "out",
      counterparty_name: "Bereket Kitabevi Ltd.",
      counterparty_tax_or_id: "9876543210",
      counterparty_phone: "+905321112233",
      start_date: "2026-09-01",
      end_date: "2026-12-01",
      monthly_rent: 25000,
      currency: "TRY",
      payment_day: 5,
      deposit_amount: 50000,
      increase_rule: "TÜFE",
      status: "active",
    },
  });
  assert.equal(leaseRes.status, 201, `Lease create failed: ${JSON.stringify(leaseRes.data)}`);
  const lease = leaseRes.data.lease;
  const leaseId = Number(lease.id);
  createdLeaseIds.push(leaseId);

  // Oylik to'lov qatorlari yaratilganini tekshirish
  assert.ok(Array.isArray(lease.payments) && lease.payments.length >= 3, "Kamida 3 oylik to'lov qatori yaratilishi shart");

  // vaqf.schedules da lease_expiry eslatmasi yaratilganini tekshirish
  const schedRow = await query(
    `SELECT id, kind, remind_days_before, next_due FROM vaqf.schedules WHERE lease_id = $1 AND kind = 'lease_expiry'`,
    [leaseId]
  );
  assert.equal(schedRow.rows.length, 1, "Ijara tugash muddati uchun avtomatik schedule yaratilishi shart");
  assert.deepEqual(schedRow.rows[0].remind_days_before, [60, 30]);
});

// 5-TEST: Kechikkan ijara to'lovi overdue ga o'tadi va outbox'ga xabar yozadi
test("5. Kechikkan ijara to'lovi overdue holatiga o'tadi va vaqf.notifications_outbox ga xabar yozadi", async () => {
  const leaseId = createdLeaseIds[0];
  // Pending holatdagi o'tgan oy to'lovini tayyorlab check-overdue ni chaqiramiz
  await query(`UPDATE vaqf.lease_payments SET status = 'pending' WHERE lease_id = $1 AND period_month = '2026-09'`, [leaseId]);

  const checkRes = await apiRequest("/vaqf-api/leases/check-overdue", {
    sid: sessions.directorSid,
    method: "POST",
    body: { referenceDateStr: "2026-11-05" },
  });
  assert.equal(checkRes.status, 200);
  assert.ok(Number(checkRes.data.newlyMarkedOverdue) >= 1, "Kamida 1 ta o'tgan oy to'lovi overdue bo'lishi kerak");

  const payRows = await query(
    `SELECT id, period_month, status FROM vaqf.lease_payments WHERE lease_id = $1 AND status = 'overdue'`,
    [leaseId]
  );
  assert.ok(payRows.rows.length >= 1, "lease_payments jadvalida overdue holatli qator bo'lishi shart");

  const outboxRows = await query(
    `SELECT id, event_type, dedupe_key FROM vaqf.notifications_outbox WHERE payload->>'lease_id' = $1`,
    [String(leaseId)]
  );
  assert.ok(outboxRows.rows.length >= 1, "notifications_outbox ga kechikkan ijara to'lovi xabari yozilishi shart");
});

// 6-TEST: Arxiv hujjati valid_until bilan yuklanganda eslatma avtomatik yaratiladi; yangi versiya eski versiyani saqlab qoladi
test("6. Arxiv hujjati valid_until bilan yuklanganda schedule avtomatik yaratiladi va yangi versiya eski versiyani o'chirmasdan current_version=2 qiladi", async () => {
  const samplePdfBase64 = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n").toString("base64");

  const archRes = await apiRequest("/vaqf-api/archive", {
    sid: sessions.directorSid,
    method: "POST",
    body: {
      institution_id: institutionId,
      category: "permit",
      title: "Yong'in xavfsizligi ruxsatnomasi (Ph5 Test)",
      doc_date: "2026-01-15",
      counterparty: "İtfaiye Daire Başkanlığı",
      valid_until: "2027-01-15",
      confidentiality: "restricted",
      tags: ["ruxsatnoma", "yongin"],
      file_name: "yongin-ruxsatnoma-v1.pdf",
      file_base64: samplePdfBase64,
    },
  });
  assert.equal(archRes.status, 201, `Archive create failed: ${JSON.stringify(archRes.data)}`);
  const archId = Number(archRes.data.document.id);
  createdArchiveIds.push(archId);
  assert.equal(Number(archRes.data.document.current_version), 1);
  assert.equal(archRes.data.document.confidentiality, "restricted");

  // Schedule yaratilganini tekshirish
  const schedRow = await query(
    `SELECT id, kind FROM vaqf.schedules WHERE archive_doc_id = $1 AND kind = 'archive_expiry'`,
    [archId]
  );
  assert.equal(schedRow.rows.length, 1, "valid_until berilganda archive_expiry schedule avtomatik yaratilishi shart");

  // 2-versiyani yuklash
  const v2Res = await apiRequest(`/vaqf-api/archive/${archId}/versions`, {
    sid: sessions.directorSid,
    method: "POST",
    body: {
      file_name: "yongin-ruxsatnoma-v2.pdf",
      file_base64: samplePdfBase64,
      change_note: "Yangilangan ilova qo'shildi (v2)",
      valid_until: "2028-01-15",
    },
  });
  assert.equal(v2Res.status, 200);
  assert.equal(Number(v2Res.data.document.current_version), 2);
  assert.equal(v2Res.data.document.versions.length, 2, "Eski versiya o'chib ketmasdan 2 ta versiya saqlanishi shart");
});

// 7-TEST: restricted arxiv hujjatini direktordan boshqa rol yuklab ololmaydi; yuklab olish archive_access_logs ga yoziladi
test("7. restricted arxiv hujjatini direktordan boshqa rol (inventory_manager) yuklab ololmaydi (403); direktor yuklab olganda archive_access_logs ga yoziladi", async () => {
  const archId = createdArchiveIds[0];

  // Inventory manager urinishi -> 403
  const mgrDl = await apiRequest(`/vaqf-api/archive/${archId}/download`, {
    sid: sessions.managerSid,
  });
  assert.equal(mgrDl.status, 403, "Inventory manager restricted arxiv hujjatini yuklab ololmasligi shart");

  // Direktor yuklab olishi -> 200
  const dirDl = await apiRequest(`/vaqf-api/archive/${archId}/download`, {
    sid: sessions.directorSid,
  });
  assert.equal(dirDl.status, 200);
  assert.equal(dirDl.data.subarray(0, 5).toString("ascii"), "%PDF-");

  // Audit log yozilganini tekshirish
  const logRow = await query(
    `SELECT id, user_ref, version_no, action, confidentiality FROM vaqf.archive_access_logs WHERE archive_doc_id = $1`,
    [archId]
  );
  assert.equal(logRow.rows.length, 1, "restricted hujjat yuklab olinganda archive_access_logs ga yozilishi shart");
  assert.equal(Number(logRow.rows[0].version_no), 2);
  assert.equal(logRow.rows[0].confidentiality, "restricted");
});

// 8-TEST: Qaror qoidasi "mandatory" qilib sozlanganda, adopted qarorsiz yuqori qiymatli hisobdan chiqarishni tasdiqlab bo'lmaydi
test("8. Qaror qoidasi 'mandatory' bo'lganda adopted Yönetim Kurulu qarorisiz yuqori qiymatli hisobdan chiqarish rad etiladi (409), qaror bog'langach tasdiqlanadi", async () => {
  // 1) Sozlamada writeoff_above_threshold = mandatory va threshold = 10000 TRY qilamiz
  const settingsRes = await apiRequest("/vaqf-api/governance/settings", {
    sid: sessions.directorSid,
    method: "PATCH",
    body: {
      key: "board_decision_rules",
      value: {
        status_notice: "MUHASIB va kurul tasdiqlashi kerak",
        writeoff_above_threshold: "mandatory",
        writeoff_threshold_try: 10000,
        property_transaction: "recommended",
        lease_contract: "recommended",
        restricted_donation_acceptance: "recommended",
        inter_institution_transfer: "recommended",
      },
    },
  });
  assert.equal(settingsRes.status, 200);

  // 2) Qiymati 15 000 TRY bo'lgan buyumni hisobdan chiqarish so'rovini yaratamiz va yuboramiz
  const assetId = createdAssetIds[0];
  const docRes = await apiRequest("/vaqf-api/documents", {
    sid: sessions.managerSid,
    method: "POST",
    body: {
      type: "writeoff",
      institution_id: institutionId,
      from_location_id: locationId,
      reason: "unrepairable",
      notes: "Ta'mirlab bo'lmaydi (Ph5 Test)",
      items: [{ asset_id: assetId, qty: 10 }],
    },
  });
  assert.equal(docRes.status, 201, `Writeoff doc create failed: ${JSON.stringify(docRes.data)}`);
  const docObj = docRes.data.item || docRes.data.document || docRes.data;
  const docId = Number(docObj.id);
  createdDocumentIds.push(docId);

  const subRes = await apiRequest(`/vaqf-api/documents/${docId}/submit`, {
    sid: sessions.managerSid,
    method: "POST",
    body: {},
  });
  assert.equal(subRes.status, 200);
  const subDoc = subRes.data.item || subRes.data.document || subRes.data;
  assert.equal(subDoc.status, "pending_approval");

  // 3) Qarorsiz direktor tasdiqlamoqchi bo'lsa -> 409 qaytishi shart!
  const appFail = await apiRequest(`/vaqf-api/documents/${docId}/approve`, {
    sid: sessions.directorSid,
    method: "POST",
    body: {},
  });
  assert.equal(appFail.status, 409, "Mandatory qaror qoidasi yoqilganda qarorsiz tasdiqlash 409 qaytarishi shart");

  // 4) Yönetim Kurulu qarori yaratamiz (adopted) va shu writeoff hujjatiga bog'laymiz
  const decRes = await apiRequest("/vaqf-api/board/decisions", {
    sid: sessions.directorSid,
    method: "POST",
    body: {
      decision_no: `2026/PH5-${Date.now().toString().slice(-4)}`,
      decision_date: "2026-11-05",
      title: "15 000 TRY qiymatdagi stullarni hisobdan chiqarishga ruxsat",
      body_text: "Mezana Akademiyasi o'quv xonasidagi yaroqsiz buyumlarni hisobdan chiqarish ma'qullansin.",
      status: "adopted",
      linked_entity: { type: "writeoff", id: docId },
      vote_for: 5,
      vote_against: 0,
      vote_abstain: 0,
    },
  });
  assert.equal(decRes.status, 201, `Board decision create failed: ${JSON.stringify(decRes.data)}`);
  const decisionId = Number(decRes.data.decision.id);
  createdDecisionIds.push(decisionId);

  // Karar metni PDF yuklab olinishini tekshiramiz
  const decPdf = await apiRequest(`/vaqf-api/board/decisions/${decisionId}/pdf`, {
    sid: sessions.directorSid,
  });
  assert.equal(decPdf.status, 200);
  assert.equal(decPdf.data.subarray(0, 5).toString("ascii"), "%PDF-");

  // 5) Endi direktor hisobdan chiqarishni tasdiqlasa -> 200 OK!
  const appOk = await apiRequest(`/vaqf-api/documents/${docId}/approve`, {
    sid: sessions.directorSid,
    method: "POST",
    body: { board_decision_id: decisionId },
  });
  assert.equal(appOk.status, 200, `Writeoff approve with board decision failed: ${JSON.stringify(appOk.data)}`);
  const okDoc = appOk.data.item || appOk.data.document || appOk.data;
  assert.equal(okDoc.status, "completed");
});

// 9-TEST: board_member roli o'qiy oladi, lekin hech narsa o'zgartirolmaydi; accountant hadya kirita oladi, lekin qaror kirita olmaydi
test("9. board_member roli barcha bo'limlarni o'qiy oladi (200), lekin hech narsa o'zgartirolmaydi (403); accountant hadya kirita oladi, lekin qaror kirita olmaydi (403)", async () => {
  // abdurahman foydalanuvchisining mavjud rollarini o'chiramiz va board_member rolini API orqali beramiz
  const existingRoles = await apiRequest("/vaqf-api/roles", { sid: sessions.directorSid });
  for (const r of existingRoles.data?.roles || []) {
    if (r.user_ref === "abdurahman") {
      await apiRequest(`/vaqf-api/roles/${r.id}`, { sid: sessions.directorSid, method: "DELETE" });
    }
  }
  const grantBm = await apiRequest("/vaqf-api/roles", {
    sid: sessions.directorSid,
    method: "POST",
    body: {
      user_ref: "abdurahman",
      user_name: "Abdurahman",
      role: "board_member",
      institution_id: null,
      alternate_refs: ["crm:admin:2", "vaqf@moliya.org"],
    },
  });
  assert.equal(grantBm.status, 201, `Grant board_member failed: ${JSON.stringify(grantBm.data)}`);

  // board_member o'qiy oladi
  const readSettings = await apiRequest("/vaqf-api/governance/settings", { sid: sessions.otherSid });
  assert.equal(readSettings.status, 200);
  const readDecisions = await apiRequest("/vaqf-api/board/decisions", { sid: sessions.otherSid });
  assert.equal(readDecisions.status, 200);

  // board_member yoza olmaydi -> 403
  const writeAttempt = await apiRequest("/vaqf-api/board/decisions", {
    sid: sessions.otherSid,
    method: "POST",
    body: {
      title: "Ruxsatsiz qaror",
      body_text: "Matn",
      decision_date: "2026-11-05",
    },
  });
  assert.equal(writeAttempt.status, 403, "board_member qaror yarata olmasligi shart");

  const donorWriteAttempt = await apiRequest("/vaqf-api/donors", {
    sid: sessions.otherSid,
    method: "POST",
    body: { full_name: "Ruxsatsiz donor" },
  });
  assert.equal(donorWriteAttempt.status, 403, "board_member donor yarata olmasligi shart");

  // Endi abdurahman foydalanuvchisiga accountant rolini beramiz
  await apiRequest(`/vaqf-api/roles/${grantBm.data.role.id}`, { sid: sessions.directorSid, method: "DELETE" });
  const grantAcc = await apiRequest("/vaqf-api/roles", {
    sid: sessions.directorSid,
    method: "POST",
    body: {
      user_ref: "abdurahman",
      user_name: "Abdurahman",
      role: "accountant",
      institution_id: 1,
      alternate_refs: ["crm:admin:2", "vaqf@moliya.org"],
    },
  });
  assert.equal(grantAcc.status, 201);

  // accountant donor yarata oladi (201), lekin Yönetim Kurulu qarorini yarata olmaydi (403)
  const accDonor = await apiRequest("/vaqf-api/donors", {
    sid: sessions.otherSid,
    method: "POST",
    body: {
      type: "person",
      full_name: "Accountant Donor Test",
      tax_or_id_no: "5555551234",
      kvkk_consent: true,
    },
  });
  assert.equal(accDonor.status, 201);
  createdDonorIds.push(Number(accDonor.data.donor.id));

  const accBoardFail = await apiRequest("/vaqf-api/board/decisions", {
    sid: sessions.otherSid,
    method: "POST",
    body: {
      title: "Accountant qaror urinishi",
      body_text: "Matn",
      decision_date: "2026-11-05",
    },
  });
  assert.equal(accBoardFail.status, 403, "accountant Yönetim Kurulu qarori yarata olmasligi shart");
});

// 10-TEST: KVKK anonimlashtirish shaxsiy ma'lumotlarni tozalaydi, lekin hadya summasi va Yillik vaqf hisoboti saqlanib qoladi
test("10. KVKK anonimlashtirish donor shaxsiy ma'lumotlarini o'chiradi, hadya summasi va Yillik vaqf hisoboti (PDF/Excel) to'liq ishlaydi", async () => {
  const donorId = createdDonorIds[0];

  const anonRes = await apiRequest(`/vaqf-api/donors/${donorId}/anonymize`, {
    sid: sessions.directorSid,
    method: "POST",
    body: { reason: "Donorning KVKK bo'yicha rasmiy murojaati" },
  });
  assert.equal(anonRes.status, 200);
  assert.equal(anonRes.data.donor.full_name, `Anonim (KVKK #${donorId})`);

  // Bazada shaxsiy ma'lumotlar o'chirilganini tekshirish
  const dbDonor = await query(
    `SELECT full_name, phone_encrypted, email_encrypted, address_encrypted, tax_or_id_encrypted, is_anonymous, anonymized_at FROM vaqf.donors WHERE id = $1`,
    [donorId]
  );
  assert.equal(dbDonor.rows[0].full_name, `Anonim (KVKK #${donorId})`);
  assert.equal(dbDonor.rows[0].phone_encrypted, null);
  assert.equal(dbDonor.rows[0].email_encrypted, null);
  assert.equal(dbDonor.rows[0].tax_or_id_encrypted, null);
  assert.equal(dbDonor.rows[0].is_anonymous, true);
  assert.ok(dbDonor.rows[0].anonymized_at, "anonymized_at belgilanishi shart");

  // Hadya yozuvlari va summasi (50 000 TRY + 15 000 TRY) o'chib ketmaganini tekshirish
  const donRows = await query(`SELECT SUM(amount)::numeric AS total_amt FROM vaqf.donations WHERE id = ANY($1::int[])`, [createdDonationIds]);
  assert.equal(Number(donRows.rows[0].total_amt), 65000, "KVKK anonimlashtirishdan keyin hadya summalari saqlanib qolishi shart");

  // Yillik vaqf hisoboti JSON, PDF (TR va UZ) hamda Excel (.xlsx) yuklab olinishini tekshirish
  const repJson = await apiRequest("/vaqf-api/reports/annual?year=2026&lang=tr", { sid: sessions.directorSid });
  assert.equal(repJson.status, 200);
  assert.equal(repJson.data.status_notice, "MUHASIB TASDIQLASHI KERAK");

  const repPdfTr = await apiRequest("/vaqf-api/reports/annual.pdf?year=2026&lang=tr", { sid: sessions.directorSid });
  assert.equal(repPdfTr.status, 200);
  assert.equal(repPdfTr.data.subarray(0, 5).toString("ascii"), "%PDF-");

  const repXlsx = await apiRequest("/vaqf-api/reports/annual.xlsx?year=2026&lang=uz", { sid: sessions.directorSid });
  assert.equal(repXlsx.status, 200);
  assert.equal(repXlsx.data.subarray(0, 2).toString("ascii"), "PK");
});
