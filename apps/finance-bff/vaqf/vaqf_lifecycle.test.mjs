import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, query } from "./db.mjs";
import { refreshVaqfRoleCache } from "./lifecycleService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BFF_DIR = path.resolve(__dirname, "..");
const BASE_URL = process.env.VAQF_TEST_BASE_URL || "http://127.0.0.1:3000";
const SESSIONS_PATH = path.join(BFF_DIR, ".sessions.json");

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

const ctx = {
  directorSid: null,
  managerSid: null,
  staffSid: null,
  otherSid: null,
  roomA: null,
  roomB: null,
  storageLoc: null,
  itCat: null,
  furnCat: null,
  asset1: null,
  asset2: null,
  asset3: null,
  assignDoc: null,
  faultId: null,
  repairDoc: null,
  writeoffDoc: null,
};

test.before(async () => {
  Object.assign(ctx, getLifecycleTestSessions());
  await query("DELETE FROM vaqf.fault_reports");
  await query("DELETE FROM vaqf.writeoffs");
  await query("DELETE FROM vaqf.repairs");
  await query("DELETE FROM vaqf.assignments");
  await query("DELETE FROM vaqf.documents");
  await query("DELETE FROM vaqf.inventory_counts");
  await query("DELETE FROM vaqf.user_roles");
  await refreshVaqfRoleCache();

  const [locsRes, catsRes] = await Promise.all([
    apiRequest("/vaqf-api/locations?institution_id=1", { sid: ctx.directorSid }),
    apiRequest("/vaqf-api/categories", { sid: ctx.directorSid }),
  ]);
  const rooms = locsRes.data.items.filter((l) => l.kind === "room");
  ctx.storageLoc = locsRes.data.items.find((l) => l.kind === "storage") || rooms[0];
  ctx.roomA = rooms[0];
  ctx.roomB = rooms[1] || rooms[0];
  ctx.itCat = catsRes.data.items.find((c) => /komp|elektron/i.test(c.name)) || catsRes.data.items[0];
  ctx.furnCat = catsRes.data.items.find((c) => /mebel/i.test(c.name)) || catsRes.data.items[0];
});

test.after(async () => {
  try {
    const rList = await apiRequest("/vaqf-api/roles", { sid: ctx.directorSid });
    for (const r of rList.data?.roles || []) {
      await apiRequest(`/vaqf-api/roles/${r.id}`, { sid: ctx.directorSid, method: "DELETE" });
    }
  } catch {}
  await query("DELETE FROM vaqf.user_roles");
  await refreshVaqfRoleCache();
  await db.rawPool.end();
});

test("3-bosqich 1 (Rollar va Huquqlar): Direktor inventory_manager rolini beradi; hisobchi (accountant) faqat o'qiy oladi va o'zgartira olmaydi (403)", async () => {
  const grantMgrRes = await apiRequest("/vaqf-api/roles", {
    sid: ctx.directorSid,
    method: "POST",
    body: {
      user_ref: "userumar",
      user_name: "Umarxon Abdulhamidov",
      role: "inventory_manager",
      institution_id: null,
      note: "3-bosqich test inventar mas'uli",
    },
  });
  assert.equal(grantMgrRes.status, 201);
  assert.equal(grantMgrRes.data.role.role, "inventory_manager");

  const mgrAuthMe = await apiRequest("/fin-api/auth/me", { sid: ctx.managerSid });
  assert.equal(mgrAuthMe.status, 200);
  assert.equal(mgrAuthMe.data.access.vaqf.canAccess, true);
  assert.equal(mgrAuthMe.data.access.vaqf.canEdit, true);
  assert.equal(mgrAuthMe.data.access.vaqf.canApprove, false);

  const grantAccRes = await apiRequest("/vaqf-api/roles", {
    sid: ctx.directorSid,
    method: "POST",
    body: {
      user_ref: "abdurahman",
      user_name: "Abdurahman",
      role: "accountant",
    },
  });
  assert.equal(grantAccRes.status, 201);
  const accRoleId = grantAccRes.data.role.id;

  const accReadRes = await apiRequest("/vaqf-api/assets?institution_id=1", { sid: ctx.otherSid });
  assert.equal(accReadRes.status, 200, "Hisobchi mulk ro'yxatini o'qiy olishi kerak");

  const accWriteRes = await apiRequest("/vaqf-api/assets", {
    sid: ctx.otherSid,
    method: "POST",
    body: { name: "Hisobchi qo'shmoqchi", category_id: ctx.itCat.id },
  });
  assert.equal(accWriteRes.status, 403, "Hisobchi mulk kartochkasi yarata olmasligi shart (403)");

  const revokeAccRes = await apiRequest(`/vaqf-api/roles/${accRoleId}`, {
    sid: ctx.directorSid,
    method: "DELETE",
  });
  assert.equal(revokeAccRes.status, 200);
});

test("3-bosqich 2 (Zimmat va Ikki marta biriktirish bloki): 3 ta buyumni zimmatga berish va bir buyumni ikki faol zimmatga berishni rad etish (409)", async () => {
  const asset1Res = await apiRequest("/vaqf-api/assets", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      institution_id: 1,
      category_id: ctx.itCat.id,
      location_id: ctx.roomA.id,
      name: "ThinkPad X1 Carbon Noutbuk",
      tracking: "individual",
      quantity: 1,
      unit: "dona",
      purchase_price: 25000,
      currency: "TRY",
      warranty_until: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    },
  });
  assert.equal(asset1Res.status, 201);
  ctx.asset1 = asset1Res.data.asset;

  const asset2Res = await apiRequest("/vaqf-api/assets", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      institution_id: 1,
      category_id: ctx.itCat.id,
      location_id: ctx.roomA.id,
      name: "Epson EB-X49 Proyektor",
      tracking: "individual",
      quantity: 1,
      unit: "dona",
      purchase_price: 8500,
      currency: "TRY",
    },
  });
  assert.equal(asset2Res.status, 201);
  ctx.asset2 = asset2Res.data.asset;

  const asset3Res = await apiRequest("/vaqf-api/assets", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      institution_id: 1,
      category_id: ctx.furnCat.id,
      location_id: ctx.roomA.id,
      name: "O'quv xonasi stullari (Partiya)",
      tracking: "batch",
      quantity: 10,
      unit: "dona",
      purchase_price: 600,
      currency: "TRY",
    },
  });
  assert.equal(asset3Res.status, 201);
  ctx.asset3 = asset3Res.data.asset;

  const assignDocRes = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "assignment",
      institution_id: 1,
      to_person_ref: "muhammadjon@moliya.org",
      to_person_name: "Muhammadjon Sobirjonov",
      to_location_id: ctx.roomA.id,
      reason: "O'quv yili uchun xodim zimmasiga biriktirildi",
      submit: true,
      items: [
        { asset_id: ctx.asset1.id, qty: 1 },
        { asset_id: ctx.asset2.id, qty: 1 },
        { asset_id: ctx.asset3.id, qty: 6 },
      ],
    },
  });
  assert.equal(assignDocRes.status, 201);
  ctx.assignDoc = assignDocRes.data;
  assert.match(ctx.assignDoc.doc_no, /^ZMT-\d{4}-\d{4}$/);

  const dupIndividualAssign = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "assignment",
      institution_id: 1,
      to_person_ref: "abdurahman",
      to_person_name: "Abdurahman",
      submit: true,
      items: [{ asset_id: ctx.asset1.id, qty: 1 }],
    },
  });
  assert.equal(dupIndividualAssign.status, 409, "Individual buyumni ikkinchi faol zimmatga berib bo'lmasligi shart (409)");

  const overBatchAssign = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "assignment",
      institution_id: 1,
      to_person_ref: "abdurahman",
      to_person_name: "Abdurahman",
      submit: true,
      items: [{ asset_id: ctx.asset3.id, qty: 5 }],
    },
  });
  assert.equal(overBatchAssign.status, 409, "Partiya buyumda qolgan bo'sh miqdordan ko'p zimmatga berib bo'lmasligi shart (409)");
});

test("3-bosqich 3 (Xavfsizlik): Boshqa xodim yoki mas'ul qabul qiluvchi nomidan zimmatni tasdiqlay olmasligi (403)", async () => {
  const wrongConfirmRes = await apiRequest(`/vaqf-api/documents/${ctx.assignDoc.id}/confirm`, {
    sid: ctx.otherSid,
    method: "POST",
    body: { comment: "Men boshqa xodim nomidan tasdiqlamoqchiman" },
  });
  assert.equal(wrongConfirmRes.status, 403, "Boshqa xodim nomidan zimmatni tasdiqlash 403 qaytarishi shart");

  const managerConfirmRes = await apiRequest(`/vaqf-api/documents/${ctx.assignDoc.id}/confirm`, {
    sid: ctx.managerSid,
    method: "POST",
    body: { comment: "Mas'ul xodim nomidan tasdiqlamoqchi" },
  });
  assert.equal(managerConfirmRes.status, 403, "Inventar mas'uli ham qabul qiluvchi xodim o'rniga tasdiqlay olmasligi shart (403)");
});

test("3-bosqich 4 (Zimmatni tasdiqlash va O'zgarmaslik): Xodim o'z zimmatini tasdiqlaydi, PDF yuklab oladi, yakunlangan hujjat o'zgarmaydi (400)", async () => {
  const confirmRes = await apiRequest(`/vaqf-api/documents/${ctx.assignDoc.id}/confirm`, {
    sid: ctx.staffSid,
    method: "POST",
    body: { comment: "Qabul qildim, hammasi joyida" },
  });
  assert.equal(confirmRes.status, 200);
  assert.equal(confirmRes.data.status, "completed");

  const myAssetsRes = await apiRequest("/vaqf-api/my/assets", { sid: ctx.staffSid });
  assert.equal(myAssetsRes.status, 200);
  assert.equal(myAssetsRes.data.items.length, 3);

  const zmtPdfTr = await apiRequest(`/vaqf-api/documents/${ctx.assignDoc.id}/pdf?lang=tr`, { sid: ctx.staffSid });
  assert.equal(zmtPdfTr.status, 200);
  assert.equal(zmtPdfTr.data.subarray(0, 5).toString("ascii"), "%PDF-");

  const patchCompletedRes = await apiRequest(`/vaqf-api/documents/${ctx.assignDoc.id}`, {
    sid: ctx.managerSid,
    method: "PATCH",
    body: { reason: "O'zgartirishga urinish" },
  });
  assert.equal(patchCompletedRes.status, 400, "Yakunlangan hujjatni tahrirlab bo'lmasligi shart (400)");

  const cancelCompletedRes = await apiRequest(`/vaqf-api/documents/${ctx.assignDoc.id}/cancel`, {
    sid: ctx.directorSid,
    method: "POST",
    body: {},
  });
  assert.equal(cancelCompletedRes.status, 400, "Yakunlangan hujjatni bekor qilib bo'lmasligi shart (400)");
});

test("3-bosqich 5 (Ko'chirish va Tasdiqlash chegarasi): 10 000 TRY dan past ko'chirish bevosita bajariladi, yuqorisi Direktor tasdig'ini talab qiladi (403/200)", async () => {
  const lowTransferRes = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "transfer",
      institution_id: 1,
      to_location_id: ctx.roomB.id,
      reason: "Oddiy xonadan xonaga ko'chirish",
      submit: true,
      items: [{ asset_id: ctx.asset2.id, qty: 1 }],
    },
  });
  assert.equal(lowTransferRes.status, 201);
  assert.equal(lowTransferRes.data.status, "completed");

  const highTransferRes = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "transfer",
      institution_id: 1,
      to_location_id: ctx.roomB.id,
      reason: "Qimmatbaho noutbukni ko'chirish",
      submit: true,
      items: [{ asset_id: ctx.asset1.id, qty: 1 }],
    },
  });
  assert.equal(highTransferRes.status, 201);
  assert.equal(highTransferRes.data.status, "pending_approval");

  const mgrApproveTransfer = await apiRequest(`/vaqf-api/documents/${highTransferRes.data.id}/approve`, {
    sid: ctx.managerSid,
    method: "POST",
    body: {},
  });
  assert.equal(mgrApproveTransfer.status, 403, "inventory_manager yuqori qiymatli ko'chirishni tasdiqlay olmasligi shart (403)");

  const dirApproveTransfer = await apiRequest(`/vaqf-api/documents/${highTransferRes.data.id}/approve`, {
    sid: ctx.directorSid,
    method: "POST",
    body: {},
  });
  assert.equal(dirApproveTransfer.status, 200);
  assert.equal(dirApproveTransfer.data.status, "completed");
});

test("3-bosqich 6 (0-qadam.2 Sanoq bloki): Davom etayotgan ('in_progress') sanoq qamrovidagi buyumlarga 3-bosqich amallari bloklanadi (409)", async () => {
  const draftCountRes = await apiRequest("/vaqf-api/counts", {
    sid: ctx.directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      title: "Blok tekshiruvi sanog'i",
      scope: { type: "custom", location_ids: [ctx.roomB.id], category_ids: [] },
    },
  });
  assert.equal(draftCountRes.status, 201);
  const activeCountId = draftCountRes.data.count.id;

  const startCountRes = await apiRequest(`/vaqf-api/counts/${activeCountId}/start`, {
    sid: ctx.directorSid,
    method: "POST",
    body: {},
  });
  assert.equal(startCountRes.status, 200);

  const blockedTransferRes = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "transfer",
      institution_id: 1,
      to_location_id: ctx.roomA.id,
      submit: true,
      items: [{ asset_id: ctx.asset2.id, qty: 1 }],
    },
  });
  assert.equal(blockedTransferRes.status, 409, "in_progress sanoq qamrovidagi buyumga ko'chirish hujjati 409 bilan rad etilishi shart");

  const cancelCountRes = await apiRequest(`/vaqf-api/counts/${activeCountId}/cancel`, {
    sid: ctx.directorSid,
    method: "POST",
    body: { reason: "Blok testi tugadi" },
  });
  assert.equal(cancelCountRes.status, 200);
});

test("3-bosqich 7 (Nosozlik va Ta'mir): Xodim nosozlik xabari yozadi, mas'ul ta'mir hujjati ochadi va 'not_fixable' bilan yakunlaydi", async () => {
  const faultRes = await apiRequest(`/vaqf-api/assets/${ctx.asset2.id}/fault`, {
    sid: ctx.staffSid,
    method: "POST",
    body: { description: "Proyektor lampasi kuygan va tasvir chiqarmayapti" },
  });
  assert.equal(faultRes.status, 201);
  ctx.faultId = faultRes.data.fault.id;

  const repairDocRes = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "repair",
      institution_id: 1,
      vendor: "Epson Resmi Servis",
      reason: "Proyektor lampasi va anakarti diagnostikasi",
      fault_report_id: ctx.faultId,
      submit: true,
      items: [{ asset_id: ctx.asset2.id, qty: 1 }],
    },
  });
  assert.equal(repairDocRes.status, 201);
  ctx.repairDoc = repairDocRes.data;
  assert.equal(ctx.repairDoc.status, "approved");

  const completeRepairRes = await apiRequest(`/vaqf-api/documents/${ctx.repairDoc.id}/complete-repair`, {
    sid: ctx.managerSid,
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

  const asset2AfterRepair = await apiRequest(`/vaqf-api/assets/${ctx.asset2.id}`, { sid: ctx.managerSid });
  assert.equal(asset2AfterRepair.data.asset.condition, "poor");
});

test("3-bosqich 8 (Hisobdan chiqarish va Xavfsizlik): Inventar mas'uli hisobdan chiqarishni tasdiqlay olmaydi (403), faqat Direktor tasdiqlaydi", async () => {
  const writeoffDocRes = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "writeoff",
      institution_id: 1,
      writeoff_reason: "broken",
      reason: "Servis xulosasiga ko'ra tuzatib bo'lmaydi (anakart kuygan)",
      submit: true,
      items: [{ asset_id: ctx.asset2.id, qty: 1 }],
    },
  });
  assert.equal(writeoffDocRes.status, 201);
  ctx.writeoffDoc = writeoffDocRes.data;
  assert.equal(ctx.writeoffDoc.status, "pending_approval");

  const mgrApproveWriteoff = await apiRequest(`/vaqf-api/documents/${ctx.writeoffDoc.id}/approve`, {
    sid: ctx.managerSid,
    method: "POST",
    body: {},
  });
  assert.equal(mgrApproveWriteoff.status, 403, "inventory_manager hisobdan chiqarishni tasdiqlay olmasligi shart (403)");

  const dirApproveWriteoff = await apiRequest(`/vaqf-api/documents/${ctx.writeoffDoc.id}/approve`, {
    sid: ctx.directorSid,
    method: "POST",
    body: {},
  });
  assert.equal(dirApproveWriteoff.status, 200);
  assert.equal(dirApproveWriteoff.data.status, "completed");

  const asset2WrittenOff = await apiRequest(`/vaqf-api/assets/${ctx.asset2.id}`, { sid: ctx.directorSid });
  assert.equal(asset2WrittenOff.data.asset.status, "written_off");
});

test("3-bosqich 9 (Qoida): Hisobdan chiqarilgan ('written_off') buyumni ko'chirish yoki zimmatga berib bo'lmasligi (400)", async () => {
  const transferWrittenOff = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "transfer",
      institution_id: 1,
      to_location_id: ctx.roomA.id,
      submit: true,
      items: [{ asset_id: ctx.asset2.id, qty: 1 }],
    },
  });
  assert.equal(transferWrittenOff.status, 400, "written_off buyumni ko'chirib bo'lmasligi shart (400)");

  const assignWrittenOff = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "assignment",
      institution_id: 1,
      to_person_ref: "userumar",
      to_person_name: "Umarxon",
      submit: true,
      items: [{ asset_id: ctx.asset2.id, qty: 1 }],
    },
  });
  assert.equal(assignWrittenOff.status, 400, "written_off buyumni zimmatga berib bo'lmasligi shart (400)");
});

test("3-bosqich 10 (Tranzaksiya atomikligi): Hujjat yaratish o'rtasida xato bo'lsa, yarim yozuv qolmasligi (Rollback)", async () => {
  const docsCountBeforeRes = await query("SELECT COUNT(*)::int AS cnt FROM vaqf.documents");
  const docsCountBefore = docsCountBeforeRes.rows[0].cnt;

  const atomicFailRes = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "transfer",
      institution_id: 1,
      to_location_id: ctx.roomA.id,
      submit: true,
      items: [
        { asset_id: ctx.asset1.id, qty: 1 },
        { asset_id: ctx.asset2.id, qty: 1 }, // written_off -> fails mid-transaction
      ],
    },
  });
  assert.equal(atomicFailRes.status, 400);

  const docsCountAfterRes = await query("SELECT COUNT(*)::int AS cnt FROM vaqf.documents");
  assert.equal(docsCountAfterRes.rows[0].cnt, docsCountBefore, "Rollbackdan keyin yarim yozuv qolmasligi shart");
});

test("3-bosqich 11 (Zimmatdan qaytarish va Hisobotlar): Xodim ishdan ketganda barcha buyumlarni bitta hujjat bilan qaytarish va Excel/PDF eksport", async () => {
  const remainingPersonAssetsRes = await apiRequest(
    `/vaqf-api/people/${encodeURIComponent("muhammadjon@moliya.org")}/assets`,
    { sid: ctx.managerSid }
  );
  assert.equal(remainingPersonAssetsRes.status, 200);
  assert.equal(remainingPersonAssetsRes.data.items.length, 2);

  const returnDocRes = await apiRequest("/vaqf-api/documents", {
    sid: ctx.managerSid,
    method: "POST",
    body: {
      type: "return",
      institution_id: 1,
      from_person_ref: "muhammadjon@moliya.org",
      from_person_name: "Muhammadjon Sobirjonov",
      to_location_id: ctx.storageLoc.id,
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

  const afterReturnPersonAssets = await apiRequest(
    `/vaqf-api/people/${encodeURIComponent("muhammadjon@moliya.org")}/assets`,
    { sid: ctx.managerSid }
  );
  assert.equal(afterReturnPersonAssets.data.items.length, 0);

  const xlsxRes = await apiRequest("/vaqf-api/reports/assignments.xlsx?institution_id=1", { sid: ctx.directorSid });
  assert.equal(xlsxRes.status, 200);
  assert.ok(xlsxRes.data.length > 1000);

  const pdfRepRes = await apiRequest("/vaqf-api/reports/assignments.pdf?institution_id=1&lang=tr", { sid: ctx.directorSid });
  assert.equal(pdfRepRes.status, 200);
  assert.equal(pdfRepRes.data.subarray(0, 5).toString("ascii"), "%PDF-");
});
