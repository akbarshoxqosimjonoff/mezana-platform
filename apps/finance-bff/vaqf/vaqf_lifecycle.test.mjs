import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, query, withTransaction } from "./db.mjs";
import { refreshVaqfRoleCache } from "./lifecycleService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BFF_DIR = path.resolve(__dirname, "..");
const BASE_URL = process.env.VAQF_TEST_BASE_URL || "http://127.0.0.1:3000";
const SESSIONS_PATH = path.join(BFF_DIR, ".sessions.json");

test.after(async () => {
  await db.rawPool.end();
});

function getLifecycleTestSessions() {
  const raw = JSON.parse(fs.readFileSync(SESSIONS_PATH, "utf8"));
  let directorSid = null;
  let managerSid = null; // userumar -> inventory_manager
  let staffSid = null; // muhammadjon@moliya.org -> staff
  let otherSid = null; // abdurahman -> other employee / accountant

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

async function apiRequest(urlPath, { sid, method = "GET", body } = {}) {
  const headers = {};
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

test("Vaqf 3-bosqich: Mulk harakati, zimmat, ta'mir, hisobdan chiqarish va barcha xavfsizlik qoidalari E2E", async () => {
  const { directorSid, managerSid, staffSid, otherSid } = getLifecycleTestSessions();

  // Clean up previous test state
  await query("DELETE FROM vaqf.fault_reports");
  await query("DELETE FROM vaqf.writeoffs");
  await query("DELETE FROM vaqf.repairs");
  await query("DELETE FROM vaqf.assignments");
  await query("DELETE FROM vaqf.documents");
  await query("DELETE FROM vaqf.inventory_counts");
  await query("DELETE FROM vaqf.user_roles");
  await refreshVaqfRoleCache();

  try {
    // Fetch locations and categories
    const [locsRes, catsRes] = await Promise.all([
      apiRequest("/vaqf-api/locations?institution_id=1", { sid: directorSid }),
      apiRequest("/vaqf-api/categories", { sid: directorSid }),
    ]);
    assert.equal(locsRes.status, 200);
    assert.equal(catsRes.status, 200);

    const rooms = locsRes.data.items.filter((l) => l.kind === "room");
    const storageLoc = locsRes.data.items.find((l) => l.kind === "storage") || rooms[0];
    const roomA = rooms[0];
    const roomB = rooms[1] || rooms[0];
    const itCat = catsRes.data.items.find((c) => /komp|elektron/i.test(c.name)) || catsRes.data.items[0];
    const furnCat = catsRes.data.items.find((c) => /mebel/i.test(c.name)) || catsRes.data.items[0];

    // =========================================================================
    // 1-QADAM & STSENARIY 1: Direktor xodimga 'inventory_manager' rolini beradi
    // =========================================================================
    const grantMgrRes = await apiRequest("/vaqf-api/roles", {
      sid: directorSid,
      method: "POST",
      body: {
        user_ref: "userumar",
        user_name: "Umarxon Abdulhamidov",
        role: "inventory_manager",
        institution_id: null,
        note: "3-bosqich test inventar mas'uli",
      },
    });
    assert.equal(grantMgrRes.status, 201, "inventory_manager roli berilishi kerak");
    assert.equal(grantMgrRes.data.role.role, "inventory_manager");

    // Verify top-right "Vaqf" button visibility in /fin-api/auth/me for inventory_manager
    const mgrAuthMe = await apiRequest("/fin-api/auth/me", { sid: managerSid });
    assert.equal(mgrAuthMe.status, 200);
    assert.equal(mgrAuthMe.data.access.vaqf.canAccess, true, "inventory_manager uchun Vaqf tugmasi ko'rinishi shart");
    assert.equal(mgrAuthMe.data.access.vaqf.canEdit, true);
    assert.equal(mgrAuthMe.data.access.vaqf.canApprove, false, "inventory_manager tasdiqlash huquqiga ega emas");

    // Verify 'accountant' role is strictly read-only
    const grantAccRes = await apiRequest("/vaqf-api/roles", {
      sid: directorSid,
      method: "POST",
      body: {
        user_ref: "abdurahman",
        user_name: "Abdurahman",
        role: "accountant",
      },
    });
    assert.equal(grantAccRes.status, 201);
    const accRoleId = grantAccRes.data.role.id;

    const accReadRes = await apiRequest("/vaqf-api/assets?institution_id=1", { sid: otherSid });
    assert.equal(accReadRes.status, 200, "Hisobchi mulk ro'yxatini o'qiy olishi kerak");

    const accWriteRes = await apiRequest("/vaqf-api/assets", {
      sid: otherSid,
      method: "POST",
      body: { name: "Hisobchi qo'shmoqchi", category_id: itCat.id },
    });
    assert.equal(accWriteRes.status, 403, "Hisobchi hech narsa o'zgartira olmasligi shart (403)");

    // Revoke accountant role so otherSid is a regular non-recipient employee for subsequent tests
    const revokeAccRes = await apiRequest(`/vaqf-api/roles/${accRoleId}`, {
      sid: directorSid,
      method: "DELETE",
    });
    assert.equal(revokeAccRes.status, 200);

    // Check settings (threshold default 10,000 TRY)
    const settingsRes = await apiRequest("/vaqf-api/settings", { sid: directorSid });
    assert.equal(settingsRes.status, 200);
    assert.equal(settingsRes.data.approval_rules.high_value_threshold_try, 10000);

    // =========================================================================
    // STSENARIY 2: inventory_manager 3 ta buyum yaratadi va oddiy xodimga zimmatga beradi
    // =========================================================================
    const asset1Res = await apiRequest("/vaqf-api/assets", {
      sid: managerSid,
      method: "POST",
      body: {
        institution_id: 1,
        category_id: itCat.id,
        location_id: roomA.id,
        name: "ThinkPad X1 Carbon Noutbuk",
        tracking: "individual",
        quantity: 1,
        unit: "dona",
        purchase_price: 25000,
        currency: "TRY",
        warranty_until: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10), // expires in 15 days!
      },
    });
    assert.equal(asset1Res.status, 201);
    const asset1 = asset1Res.data.asset;

    const asset2Res = await apiRequest("/vaqf-api/assets", {
      sid: managerSid,
      method: "POST",
      body: {
        institution_id: 1,
        category_id: itCat.id,
        location_id: roomA.id,
        name: "Epson EB-X49 Proyektor",
        tracking: "individual",
        quantity: 1,
        unit: "dona",
        purchase_price: 8500,
        currency: "TRY",
      },
    });
    assert.equal(asset2Res.status, 201);
    const asset2 = asset2Res.data.asset;

    const asset3Res = await apiRequest("/vaqf-api/assets", {
      sid: managerSid,
      method: "POST",
      body: {
        institution_id: 1,
        category_id: furnCat.id,
        location_id: roomA.id,
        name: "O'quv xonasi stullari (Partiya)",
        tracking: "batch",
        quantity: 10,
        unit: "dona",
        purchase_price: 600,
        currency: "TRY",
      },
    });
    assert.equal(asset3Res.status, 201);
    const asset3 = asset3Res.data.asset;

    // Assign 3 assets (asset1: 1, asset2: 1, asset3: 6 out of 10) to Muhammadjon (staffSid)
    const assignDocRes = await apiRequest("/vaqf-api/documents", {
      sid: managerSid,
      method: "POST",
      body: {
        type: "assignment",
        institution_id: 1,
        to_person_ref: "muhammadjon@moliya.org",
        to_person_name: "Muhammadjon Sobirjonov",
        to_location_id: roomA.id,
        reason: "O'quv yili uchun xodim zimmasiga biriktirildi",
        submit: true,
        items: [
          { asset_id: asset1.id, qty: 1 },
          { asset_id: asset2.id, qty: 1 },
          { asset_id: asset3.id, qty: 6 },
        ],
      },
    });
    assert.equal(assignDocRes.status, 201);
    const assignDoc = assignDocRes.data;
    assert.match(assignDoc.doc_no, /^ZMT-\d{4}-\d{4}$/);
    assert.equal(assignDoc.status, "approved", "Zimmat hujjati xodim tasdig'ini kutish ('approved') holatiga o'tishi kerak");

    // Verify top-right "Vaqf" button is now visible to staff (Muhammadjon) as well
    const staffAuthMe = await apiRequest("/fin-api/auth/me", { sid: staffSid });
    assert.equal(staffAuthMe.status, 200);
    assert.equal(staffAuthMe.data.access.vaqf.canAccess, true, "Zimmat berilgan xodimga Vaqf tugmasi ko'rinishi shart");

    // =========================================================================
    // QOIDA TEKSHIRUVI: Bir buyum bir vaqtda ikki faol zimmatda bo'lmasligi (individual & batch)
    // =========================================================================
    const dupIndividualAssign = await apiRequest("/vaqf-api/documents", {
      sid: managerSid,
      method: "POST",
      body: {
        type: "assignment",
        institution_id: 1,
        to_person_ref: "abdurahman",
        to_person_name: "Abdurahman",
        submit: true,
        items: [{ asset_id: asset1.id, qty: 1 }],
      },
    });
    assert.equal(dupIndividualAssign.status, 409, "Individual buyumni ikkinchi faol zimmatga berib bo'lmasligi shart (409)");

    const overBatchAssign = await apiRequest("/vaqf-api/documents", {
      sid: managerSid,
      method: "POST",
      body: {
        type: "assignment",
        institution_id: 1,
        to_person_ref: "abdurahman",
        to_person_name: "Abdurahman",
        submit: true,
        items: [{ asset_id: asset3.id, qty: 5 }], // 10 total - 6 assigned = only 4 left!
      },
    });
    assert.equal(overBatchAssign.status, 409, "Partiya buyumda qolgan bo'sh miqdordan ko'p zimmatga berib bo'lmasligi shart (409)");

    // =========================================================================
    // QOIDA TEKSHIRUVI: Xodim boshqa xodim nomidan zimmatni tasdiqlay olmasligi (403)
    // =========================================================================
    const wrongConfirmRes = await apiRequest(`/vaqf-api/documents/${assignDoc.id}/confirm`, {
      sid: otherSid,
      method: "POST",
      body: { comment: "Men boshqa xodim nomidan tasdiqlamoqchiman" },
    });
    assert.equal(wrongConfirmRes.status, 403, "Boshqa xodim nomidan zimmatni tasdiqlash 403 qaytarishi shart");

    const managerConfirmRes = await apiRequest(`/vaqf-api/documents/${assignDoc.id}/confirm`, {
      sid: managerSid,
      method: "POST",
      body: { comment: "Mas'ul xodim nomidan tasdiqlamoqchi" },
    });
    assert.equal(managerConfirmRes.status, 403, "Inventar mas'uli ham qabul qiluvchi xodim o'rniga tasdiqlay olmasligi shart (403)");

    // =========================================================================
    // STSENARIY 3: Oddiy xodim (staffSid) kirib "Qabul qildim" bosadi va PDF oladi
    // =========================================================================
    const myPendingBefore = await apiRequest("/vaqf-api/my/pending", { sid: staffSid });
    assert.equal(myPendingBefore.status, 200);
    assert.ok(myPendingBefore.data.items.some((d) => d.id === assignDoc.id), "Pending ro'yxatda zimmat hujjati ko'rinishi kerak");

    const confirmRes = await apiRequest(`/vaqf-api/documents/${assignDoc.id}/confirm`, {
      sid: staffSid,
      method: "POST",
      body: { comment: "Qabul qildim, hammasi joyida" },
    });
    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.data.status, "completed", "Tasdiqlangach hujjat 'completed' bo'lishi kerak");
    assert.equal(confirmRes.data.confirmations.length, 1, "document_confirmations yozuvi yaratilgan bo'lishi kerak");

    // Verify Mening buyumlarim (/vaqf-api/my/assets) now lists all 3 items
    const myAssetsRes = await apiRequest("/vaqf-api/my/assets", { sid: staffSid });
    assert.equal(myAssetsRes.status, 200);
    assert.equal(myAssetsRes.data.items.length, 3, "Xodim zimmasida 3 ta buyum bo'lishi kerak");

    // Download Zimmet Tutanağı PDF (Turkish & Uzbek)
    const zmtPdfTr = await apiRequest(`/vaqf-api/documents/${assignDoc.id}/pdf?lang=tr`, { sid: staffSid });
    assert.equal(zmtPdfTr.status, 200);
    assert.equal(zmtPdfTr.data.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(zmtPdfTr.data.length > 1500, "Zimmet tutanağı PDF hajmi 1.5KB dan katta bo'lishi kerak");

    const zmtPdfUz = await apiRequest(`/vaqf-api/documents/${assignDoc.id}/pdf?lang=uz`, { sid: staffSid });
    assert.equal(zmtPdfUz.status, 200);
    assert.equal(zmtPdfUz.data.subarray(0, 5).toString("ascii"), "%PDF-");

    // =========================================================================
    // QOIDA TEKSHIRUVI: 'completed' hujjatni o'zgartirish yoki bekor qilib bo'lmasligi
    // =========================================================================
    const patchCompletedRes = await apiRequest(`/vaqf-api/documents/${assignDoc.id}`, {
      sid: managerSid,
      method: "PATCH",
      body: { reason: "O'zgartirishga urinish" },
    });
    assert.equal(patchCompletedRes.status, 400, "Yakunlangan hujjatni tahrirlab bo'lmasligi shart (400)");

    const cancelCompletedRes = await apiRequest(`/vaqf-api/documents/${assignDoc.id}/cancel`, {
      sid: directorSid,
      method: "POST",
      body: {},
    });
    assert.equal(cancelCompletedRes.status, 400, "Yakunlangan hujjatni bekor qilib bo'lmasligi shart (400)");

    // =========================================================================
    // KO'CHIRISH TASDIQLASH QOIDALARI VA 0-QADAM.2 SANOQ BLOKI TEKSHIRUVI
    // =========================================================================
    // 1) Low-value intra-institution transfer (< 10,000 TRY) completes WITHOUT director approval
    const lowTransferRes = await apiRequest("/vaqf-api/documents", {
      sid: managerSid,
      method: "POST",
      body: {
        type: "transfer",
        institution_id: 1,
        to_location_id: roomB.id,
        reason: "Oddiy xonadan xonaga ko'chirish",
        submit: true,
        items: [{ asset_id: asset2.id, qty: 1 }], // 8,500 TRY < 10,000 TRY
      },
    });
    assert.equal(lowTransferRes.status, 201);
    assert.match(lowTransferRes.data.doc_no, /^KCH-\d{4}-\d{4}$/);
    assert.equal(lowTransferRes.data.status, "completed", "10 000 TRY dan past ko'chirish tasdiqsiz 'completed' bo'lishi kerak");

    // 2) High-value transfer (>= 10,000 TRY) requires Director approval
    const highTransferRes = await apiRequest("/vaqf-api/documents", {
      sid: managerSid,
      method: "POST",
      body: {
        type: "transfer",
        institution_id: 1,
        to_location_id: roomB.id,
        reason: "Qimmatbaho noutbukni ko'chirish",
        submit: true,
        items: [{ asset_id: asset1.id, qty: 1 }], // 25,000 TRY >= 10,000 TRY
      },
    });
    assert.equal(highTransferRes.status, 201);
    assert.equal(highTransferRes.data.status, "pending_approval", "10 000 TRY dan yuqori buyum ko'chirilishi 'pending_approval' bo'lishi kerak");

    // Manager cannot approve high-value transfer
    const mgrApproveTransfer = await apiRequest(`/vaqf-api/documents/${highTransferRes.data.id}/approve`, {
      sid: managerSid,
      method: "POST",
      body: {},
    });
    assert.equal(mgrApproveTransfer.status, 403, "inventory_manager yuqori qiymatli ko'chirishni tasdiqlay olmasligi shart (403)");

    // Director approves high-value transfer
    const dirApproveTransfer = await apiRequest(`/vaqf-api/documents/${highTransferRes.data.id}/approve`, {
      sid: directorSid,
      method: "POST",
      body: {},
    });
    assert.equal(dirApproveTransfer.status, 200);
    assert.equal(dirApproveTransfer.data.status, "completed");

    // 3) 0-qadam.2: Active ('in_progress') inventory count blocks 3-bosqich documents on scoped assets
    const draftCountRes = await apiRequest("/vaqf-api/counts", {
      sid: directorSid,
      method: "POST",
      body: {
        institution_id: 1,
        title: "Blok tekshiruvi sanog'i",
        scope: { type: "custom", location_ids: [roomB.id], category_ids: [] },
      },
    });
    assert.equal(draftCountRes.status, 201);
    const activeCountId = draftCountRes.data.count.id;

    const startCountRes = await apiRequest(`/vaqf-api/counts/${activeCountId}/start`, {
      sid: directorSid,
      method: "POST",
      body: {},
    });
    assert.equal(startCountRes.status, 200);
    assert.equal(startCountRes.data.count.status, "in_progress");

    const blockedTransferRes = await apiRequest("/vaqf-api/documents", {
      sid: managerSid,
      method: "POST",
      body: {
        type: "transfer",
        institution_id: 1,
        to_location_id: roomA.id,
        submit: true,
        items: [{ asset_id: asset2.id, qty: 1 }],
      },
    });
    assert.equal(blockedTransferRes.status, 409, "in_progress sanoq qamrovidagi buyumga ko'chirish hujjati 409 bilan rad etilishi shart");

    // Cancel the count so the lock is released
    const cancelCountRes = await apiRequest(`/vaqf-api/counts/${activeCountId}/cancel`, {
      sid: directorSid,
      method: "POST",
      body: { reason: "Blok testi tugadi" },
    });
    assert.equal(cancelCountRes.status, 200);

    // =========================================================================
    // STSENARIY 4: Oddiy xodim 1 ta buyumga (asset2 - Proyektor) nosozlik xabari yozadi
    // =========================================================================
    const faultRes = await apiRequest(`/vaqf-api/assets/${asset2.id}/fault`, {
      sid: staffSid,
      method: "POST",
      body: {
        description: "Proyektor lampasi kuygan va tasvir chiqarmayapti",
      },
    });
    assert.equal(faultRes.status, 201);
    const faultId = faultRes.data.fault.id;

    const faultsListRes = await apiRequest("/vaqf-api/faults", { sid: managerSid });
    assert.equal(faultsListRes.status, 200);
    assert.ok(faultsListRes.data.items.some((f) => f.id === faultId));

    // =========================================================================
    // STSENARIY 5: Inventar mas'uli nosozlikdan ta'mir hujjati ochadi -> "not_fixable"
    // =========================================================================
    const repairDocRes = await apiRequest("/vaqf-api/documents", {
      sid: managerSid,
      method: "POST",
      body: {
        type: "repair",
        institution_id: 1,
        vendor: "Epson Resmi Servis",
        reason: "Proyektor lampasi va anakarti diagnostikasi",
        fault_report_id: faultId,
        submit: true,
        items: [{ asset_id: asset2.id, qty: 1 }],
      },
    });
    assert.equal(repairDocRes.status, 201);
    const repairDoc = repairDocRes.data;
    assert.match(repairDoc.doc_no, /^TMR-\d{4}-\d{4}$/);
    assert.equal(repairDoc.status, "approved", "Ta'mirga yuborilganda hujjat 'approved' bo'lishi kerak");

    // Check asset2 is now 'under_repair'
    const asset2DuringRepair = await apiRequest(`/vaqf-api/assets/${asset2.id}`, { sid: managerSid });
    assert.equal(asset2DuringRepair.data.asset.status, "under_repair");

    // Complete repair with result = 'not_fixable'
    const completeRepairRes = await apiRequest(`/vaqf-api/documents/${repairDoc.id}/complete-repair`, {
      sid: managerSid,
      method: "POST",
      body: {
        result: "not_fixable",
        cost: 750,
        currency: "TRY",
        vendor: "Epson Resmi Servis",
        expense_ref: "EXP-2026-099",
      },
    });
    assert.equal(completeRepairRes.status, 200);
    assert.equal(completeRepairRes.data.status, "completed");

    const asset2AfterRepair = await apiRequest(`/vaqf-api/assets/${asset2.id}`, { sid: managerSid });
    assert.equal(asset2AfterRepair.data.asset.condition, "poor", "not_fixable bo'lib qaytganda buyum condition='poor' bo'lishi kerak");

    // =========================================================================
    // STSENARIY 6: Hisobdan chiqarish so'rovi -> Direktor tasdiqlaydi -> written_off + PDF
    // =========================================================================
    const writeoffDocRes = await apiRequest("/vaqf-api/documents", {
      sid: managerSid,
      method: "POST",
      body: {
        type: "writeoff",
        institution_id: 1,
        writeoff_reason: "broken",
        reason: "Servis xulosasiga ko'ra tuzatib bo'lmaydi (anakart kuygan)",
        submit: true,
        items: [{ asset_id: asset2.id, qty: 1 }],
      },
    });
    assert.equal(writeoffDocRes.status, 201);
    const writeoffDoc = writeoffDocRes.data;
    assert.match(writeoffDoc.doc_no, /^HCH-\d{4}-\d{4}$/);
    assert.equal(writeoffDoc.status, "pending_approval", "Hisobdan chiqarish har doim Direktor tasdig'iga ('pending_approval') tushishi shart");

    // Rule check: inventory_manager CANNOT approve writeoff
    const mgrApproveWriteoff = await apiRequest(`/vaqf-api/documents/${writeoffDoc.id}/approve`, {
      sid: managerSid,
      method: "POST",
      body: {},
    });
    assert.equal(mgrApproveWriteoff.status, 403, "inventory_manager hisobdan chiqarishni tasdiqlay olmasligi shart (403)");

    // Director approves writeoff
    const dirApproveWriteoff = await apiRequest(`/vaqf-api/documents/${writeoffDoc.id}/approve`, {
      sid: directorSid,
      method: "POST",
      body: {},
    });
    assert.equal(dirApproveWriteoff.status, 200);
    assert.equal(dirApproveWriteoff.data.status, "completed");

    // Verify asset2 status is 'written_off'
    const asset2WrittenOff = await apiRequest(`/vaqf-api/assets/${asset2.id}`, { sid: directorSid });
    assert.equal(asset2WrittenOff.data.asset.status, "written_off");

    // Download writeoff PDF
    const hchPdf = await apiRequest(`/vaqf-api/documents/${writeoffDoc.id}/pdf?lang=tr`, { sid: directorSid });
    assert.equal(hchPdf.status, 200);
    assert.equal(hchPdf.data.subarray(0, 5).toString("ascii"), "%PDF-");

    // =========================================================================
    // QOIDA TEKSHIRUVI: 'written_off' buyumni ko'chirish yoki zimmatga berib bo'lmasligi (400)
    // =========================================================================
    const transferWrittenOff = await apiRequest("/vaqf-api/documents", {
      sid: managerSid,
      method: "POST",
      body: {
        type: "transfer",
        institution_id: 1,
        to_location_id: roomA.id,
        submit: true,
        items: [{ asset_id: asset2.id, qty: 1 }],
      },
    });
    assert.equal(transferWrittenOff.status, 400, "written_off buyumni ko'chirib bo'lmasligi shart (400)");

    const assignWrittenOff = await apiRequest("/vaqf-api/documents", {
      sid: managerSid,
      method: "POST",
      body: {
        type: "assignment",
        institution_id: 1,
        to_person_ref: "userumar",
        to_person_name: "Umarxon",
        submit: true,
        items: [{ asset_id: asset2.id, qty: 1 }],
      },
    });
    assert.equal(assignWrittenOff.status, 400, "written_off buyumni zimmatga berib bo'lmasligi shart (400)");

    // =========================================================================
    // QOIDA TEKSHIRUVI: Tranzaksiya o'rtasida xato bo'lsa, yarim o'zgarish qolmasligi (Rollback)
    // =========================================================================
    const docsCountBeforeRes = await query("SELECT COUNT(*)::int AS cnt FROM vaqf.documents");
    const docsCountBefore = docsCountBeforeRes.rows[0].cnt;

    const atomicFailRes = await apiRequest("/vaqf-api/documents", {
      sid: managerSid,
      method: "POST",
      body: {
        type: "transfer",
        institution_id: 1,
        to_location_id: roomA.id,
        submit: true,
        items: [
          { asset_id: asset1.id, qty: 1 }, // valid
          { asset_id: asset2.id, qty: 1 }, // invalid (written_off) -> fails mid-transaction!
        ],
      },
    });
    assert.equal(atomicFailRes.status, 400);

    const docsCountAfterRes = await query("SELECT COUNT(*)::int AS cnt FROM vaqf.documents");
    assert.equal(
      docsCountAfterRes.rows[0].cnt,
      docsCountBefore,
      "Tranzaksiya o'rtasida xato bo'lganda vaqf.documents jadvalida yarim yozuv qolmasligi shart"
    );

    // =========================================================================
    // STSENARIY 7: Xodim ishdan ketadi -> qolgan 2 ta buyum bitta qaytarish hujjati bilan omborga qaytariladi
    // =========================================================================
    const remainingPersonAssetsRes = await apiRequest(
      `/vaqf-api/people/${encodeURIComponent("muhammadjon@moliya.org")}/assets`,
      { sid: managerSid }
    );
    assert.equal(remainingPersonAssetsRes.status, 200);
    assert.equal(
      remainingPersonAssetsRes.data.items.length,
      2,
      "1 ta buyum hisobdan chiqarilgach, xodim zimmasida 2 ta buyum qolgan bo'lishi kerak"
    );

    const returnDocRes = await apiRequest("/vaqf-api/documents", {
      sid: managerSid,
      method: "POST",
      body: {
        type: "return",
        institution_id: 1,
        from_person_ref: "muhammadjon@moliya.org",
        from_person_name: "Muhammadjon Sobirjonov",
        to_location_id: storageLoc.id,
        reason: "Xodim ishdan ketganligi sababli barcha zimmatdagi buyumlar omborga qaytarildi",
        submit: true,
        items: remainingPersonAssetsRes.data.items.map((pa) => ({
          asset_id: pa.asset_id,
          qty: pa.remaining_qty,
          condition_after: "good",
        })),
      },
    });
    assert.equal(returnDocRes.status, 201);
    assert.match(returnDocRes.data.doc_no, /^QYT-\d{4}-\d{4}$/);
    assert.equal(returnDocRes.data.status, "completed");

    // Verify employee now has 0 active assigned assets
    const afterReturnPersonAssets = await apiRequest(
      `/vaqf-api/people/${encodeURIComponent("muhammadjon@moliya.org")}/assets`,
      { sid: managerSid }
    );
    assert.equal(afterReturnPersonAssets.data.items.length, 0, "Qaytarishdan so'ng xodim zimmasida 0 ta buyum qolishi kerak");

    // Verify asset1 is now in_storage and has full event history with doc_no links
    const asset1Final = await apiRequest(`/vaqf-api/assets/${asset1.id}`, { sid: directorSid });
    assert.equal(asset1Final.data.asset.status, "in_storage");
    assert.equal(asset1Final.data.asset.responsible_name, null);
    assert.ok(
      asset1Final.data.asset.events.some((ev) => ev.event_type === "assigned" && ev.doc_no === assignDoc.doc_no),
      "Buyum tarixida zimmat hujjati raqami bo'lishi shart"
    );
    assert.ok(
      asset1Final.data.asset.events.some((ev) => ev.event_type === "returned" && ev.doc_no === returnDocRes.data.doc_no),
      "Buyum tarixida qaytarish hujjati raqami bo'lishi shart"
    );

    // =========================================================================
    // 6-QADAM: HISOBOTLAR VA EKSPORT TEKSHIRUVI
    // =========================================================================
    const reportsRes = await apiRequest("/vaqf-api/reports/lifecycle?institution_id=1", { sid: directorSid });
    assert.equal(reportsRes.status, 200);
    assert.equal(reportsRes.data.writeoffs.totals.total_count, 1);
    assert.equal(reportsRes.data.repairs.summary.repairs_count, 1);
    assert.ok(reportsRes.data.expiringWarrantyAssets.some((w) => w.id === asset1.id));

    const xlsxRes = await apiRequest("/vaqf-api/reports/assignments.xlsx?institution_id=1", { sid: directorSid });
    assert.equal(xlsxRes.status, 200);
    assert.ok(xlsxRes.data.length > 1000);

    const pdfRepRes = await apiRequest("/vaqf-api/reports/assignments.pdf?institution_id=1&lang=tr", { sid: directorSid });
    assert.equal(pdfRepRes.status, 200);
    assert.equal(pdfRepRes.data.subarray(0, 5).toString("ascii"), "%PDF-");
  } finally {
    // Clean up test roles via API so server in-memory role cache is immediately cleared
    try {
      const rList = await apiRequest("/vaqf-api/roles", { sid: directorSid });
      for (const r of rList.data?.roles || []) {
        await apiRequest(`/vaqf-api/roles/${r.id}`, { sid: directorSid, method: "DELETE" });
      }
    } catch {}
    await query("DELETE FROM vaqf.user_roles");
    await refreshVaqfRoleCache();
  }
});
