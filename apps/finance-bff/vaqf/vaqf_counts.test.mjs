import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, query } from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BFF_DIR = path.resolve(__dirname, "..");
const BASE_URL = process.env.VAQF_TEST_BASE_URL || "http://127.0.0.1:3000";
const SESSIONS_PATH = path.join(BFF_DIR, ".sessions.json");

function getCountTestSessions() {
  const raw = JSON.parse(fs.readFileSync(SESSIONS_PATH, "utf8"));
  let directorSid = null;
  let emp1Sid = null; // userumar (Room A)
  let emp2Sid = null; // muhammadjon@moliya.org (Room B)
  let unassignedSid = null; // abdurahman (Unassigned)

  for (const [sid, sess] of Object.entries(raw)) {
    if (!directorSid && sess?.crmUser?.role === "root" && sess?.erpUser?.role === "DIRECTOR") {
      directorSid = sid;
    }
    if (!emp1Sid && sess?.crmUser?.username === "userumar") {
      emp1Sid = sid;
    }
    if (!emp2Sid && sess?.erpUser?.email === "muhammadjon@moliya.org") {
      emp2Sid = sid;
    }
    if (!unassignedSid && sess?.crmUser?.username === "abdurahman") {
      unassignedSid = sid;
    }
  }
  assert.ok(directorSid, "Director session topilmadi");
  assert.ok(emp1Sid, "Employee 1 (userumar) session topilmadi");
  assert.ok(emp2Sid, "Employee 2 (muhammadjon) session topilmadi");
  assert.ok(unassignedSid, "Unassigned employee (abdurahman) session topilmadi");
  return { directorSid, emp1Sid, emp2Sid, unassignedSid };
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
  emp1Sid: null,
  emp2Sid: null,
  unassignedSid: null,
  furnCat: null,
  itCat: null,
  roomA: null,
  roomB: null,
  createdAssets: [],
  batchAsset: null,
  countId: null,
  countCode: null,
};

test.before(async () => {
  Object.assign(ctx, getCountTestSessions());
  await query("DELETE FROM vaqf.inventory_counts");
  await query("DELETE FROM vaqf.assets");
});

test.after(async () => {
  await db.rawPool.end();
});

test("2-bosqich 1: 2 ta xonada 10 ta buyum yaratish, sanoq yaratish va boshlash (in_progress)", async () => {
  const catsRes = await apiRequest("/vaqf-api/categories", { sid: ctx.directorSid });
  assert.equal(catsRes.status, 200);
  ctx.furnCat = catsRes.data.items.find((c) => /mebel|parta/i.test(c.name)) || catsRes.data.items[0];
  ctx.itCat = catsRes.data.items.find((c) => /komp|noutbuk/i.test(c.name)) || catsRes.data.items[1] || catsRes.data.items[0];

  const locsRes = await apiRequest("/vaqf-api/locations?institution_id=1", { sid: ctx.directorSid });
  assert.equal(locsRes.status, 200);
  const rooms = locsRes.data.items.filter((l) => l.kind === "room");
  assert.ok(rooms.length >= 2, "Kamida 2 ta xona mavjud bo'lishi kerak");
  ctx.roomA = rooms[0];
  ctx.roomB = rooms[1];

  for (let i = 1; i <= 4; i++) {
    const res = await apiRequest("/vaqf-api/assets", {
      sid: ctx.directorSid,
      method: "POST",
      body: {
        institution_id: 1,
        category_id: ctx.itCat.id,
        location_id: ctx.roomA.id,
        name: `Xona-A Noutbuk #${i}`,
        tracking: "individual",
        quantity: 1,
        unit: "dona",
        purchase_price: 25000,
        currency: "TRY",
        status: "in_use",
        condition: "good",
      },
    });
    assert.equal(res.status, 201);
    ctx.createdAssets.push(res.data.asset);
  }

  const batchRes = await apiRequest("/vaqf-api/assets", {
    sid: ctx.directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      category_id: ctx.furnCat.id,
      location_id: ctx.roomA.id,
      name: "O'quvchilar stuli (partiya)",
      tracking: "batch",
      quantity: 15,
      unit: "dona",
      purchase_price: 30000,
      currency: "TRY",
      status: "in_use",
      condition: "good",
    },
  });
  assert.equal(batchRes.status, 201);
  ctx.batchAsset = batchRes.data.asset;
  ctx.createdAssets.push(ctx.batchAsset);

  for (let i = 1; i <= 5; i++) {
    const res = await apiRequest("/vaqf-api/assets", {
      sid: ctx.directorSid,
      method: "POST",
      body: {
        institution_id: 1,
        category_id: ctx.furnCat.id,
        location_id: ctx.roomB.id,
        name: `Xona-B Shkaf va jihoz #${i}`,
        tracking: "individual",
        quantity: 1,
        unit: "dona",
        purchase_price: 400,
        currency: "USD",
        status: "in_use",
        condition: "good",
      },
    });
    assert.equal(res.status, 201);
    ctx.createdAssets.push(res.data.asset);
  }
  assert.equal(ctx.createdAssets.length, 10);

  const previewRes = await apiRequest("/vaqf-api/counts/preview-scope", {
    sid: ctx.directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      location_ids: [ctx.roomA.id, ctx.roomB.id],
      category_ids: [],
    },
  });
  assert.equal(previewRes.status, 200);
  assert.equal(previewRes.data.asset_cards_count, 10);
  assert.equal(previewRes.data.total_units_count, 24);

  const createCountRes = await apiRequest("/vaqf-api/counts", {
    sid: ctx.directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      title: "2026 Kuzgi Choraklik Inventarizatsiya",
      notes: "2 ta xona bo'yicha to'liq tekshiruv",
      scope: {
        all_locations: false,
        location_ids: [ctx.roomA.id, ctx.roomB.id],
        category_ids: [],
      },
      committee: [
        { name: "Mezana Rahbariyat", role: "Komissiya raisi (Direktor)" },
        { name: "Umarkhon Abdulhamidov", role: "Komissiya a'zosi" },
        { name: "Muhammadjon Moliya", role: "Komissiya a'zosi" },
      ],
      assignments: [
        {
          location_id: ctx.roomA.id,
          assignee_ref: "userumar",
          assignee_name: "Umarkhon Abdulhamidov",
        },
        {
          location_id: ctx.roomB.id,
          assignee_ref: "muhammadjon@moliya.org",
          assignee_name: "Muhammadjon Moliya",
        },
      ],
    },
  });
  assert.equal(createCountRes.status, 201);
  ctx.countId = createCountRes.data.count.id;
  ctx.countCode = createCountRes.data.count.code;
  assert.match(ctx.countCode, /^SAN-\d{4}-\d{3}$/);

  const startRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/start`, {
    sid: ctx.directorSid,
    method: "POST",
  });
  assert.equal(startRes.status, 200);
  assert.equal(startRes.data.count.status, "in_progress");
  assert.equal(Number(startRes.data.summary.expected_cards), 10);
});

test("2-bosqich 2 (Qoida): Bir muassasada bir vaqtda ikkinchi 'in_progress' sanoq boshlash rad etiladi (409)", async () => {
  const secondDraftRes = await apiRequest("/vaqf-api/counts", {
    sid: ctx.directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      title: "Ikkinchi parallel sanoq",
      scope: { all_locations: false, location_ids: [ctx.roomA.id], category_ids: [] },
    },
  });
  assert.equal(secondDraftRes.status, 201);
  const secondStartRes = await apiRequest(`/vaqf-api/counts/${secondDraftRes.data.count.id}/start`, {
    sid: ctx.directorSid,
    method: "POST",
  });
  assert.equal(secondStartRes.status, 409, "Bir vaqtda ikkinchi in_progress sanoq boshlanmasligi kerak");

  await apiRequest(`/vaqf-api/counts/${secondDraftRes.data.count.id}/cancel`, {
    sid: ctx.directorSid,
    method: "POST",
    body: { reason: "Test uchun yaratilgan ikkinchi qoralama" },
  });
});

test("2-bosqich 3 (Xavfsizlik): Sanoqqa biriktirilmagan yoki boshqa xonadagi xodim skanerlay olmaydi (403)", async () => {
  const unassignedMyRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/my`, {
    sid: ctx.unassignedSid,
  });
  assert.equal(unassignedMyRes.status, 403, "Biriktirilmagan xodim /my ga kira olmasligi kerak");

  const unassignedScanRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/scans`, {
    sid: ctx.unassignedSid,
    method: "POST",
    body: {
      scans: [
        {
          clientScanId: "unassigned-attempt-1",
          inventoryNo: ctx.createdAssets[0].inventory_no,
          locationId: ctx.roomA.id,
        },
      ],
    },
  });
  assert.equal(unassignedScanRes.status, 403, "Biriktirilmagan xodim skanerlay olmasligi kerak");

  const emp1MyRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/my`, {
    sid: ctx.emp1Sid,
  });
  assert.equal(emp1MyRes.status, 200);
  assert.equal(emp1MyRes.data.myLocations.length, 1);
  assert.equal(emp1MyRes.data.myLocations[0].location_id, ctx.roomA.id);

  const emp1WrongRoomScan = await apiRequest(`/vaqf-api/counts/${ctx.countId}/scans`, {
    sid: ctx.emp1Sid,
    method: "POST",
    body: {
      scans: [
        {
          clientScanId: "wrong-room-scan-1",
          inventoryNo: ctx.createdAssets[5].inventory_no,
          locationId: ctx.roomB.id,
        },
      ],
    },
  });
  assert.equal(emp1WrongRoomScan.status, 403, "Biriktirilgan xodim boshqa xonada skanerlay olmasligi kerak");
});

test("2-bosqich 4 (Qoida): Davom etayotgan sanoq qamrovidagi buyumning joyini yoki miqdorini oddiy tahrirlash rad etiladi (409)", async () => {
  const editLocDuringCount = await apiRequest(`/vaqf-api/assets/${ctx.createdAssets[0].id}`, {
    sid: ctx.directorSid,
    method: "PATCH",
    body: { location_id: ctx.roomB.id },
  });
  assert.equal(editLocDuringCount.status, 409, "in_progress sanoq paytida joyni oddiy tahrirlash 409 qaytarishi kerak");

  const editQtyDuringCount = await apiRequest(`/vaqf-api/assets/${ctx.batchAsset.id}`, {
    sid: ctx.directorSid,
    method: "PATCH",
    body: { quantity: 20 },
  });
  assert.equal(editQtyDuringCount.status, 409, "in_progress sanoq paytida miqdorni oddiy tahrirlash 409 qaytarishi kerak");
});

test("2-bosqich 5: Skanerlash, offline navbat va clientScanId idempotentligi (dublikat yozilmasligi)", async () => {
  const scanA1 = await apiRequest(`/vaqf-api/counts/${ctx.countId}/scans`, {
    sid: ctx.emp1Sid,
    method: "POST",
    body: {
      scans: [
        {
          clientScanId: "scan-a-asset-0",
          inventoryNo: ctx.createdAssets[0].inventory_no,
          locationId: ctx.roomA.id,
          condition: "good",
        },
        {
          clientScanId: "scan-a-asset-1",
          inventoryNo: ctx.createdAssets[1].inventory_no,
          locationId: ctx.roomA.id,
          condition: "good",
        },
      ],
    },
  });
  assert.equal(scanA1.status, 200);
  assert.deepEqual(scanA1.data.results.map((r) => r.scanStatus), ["found", "found"]);

  const offlineBatchPayload = {
    scans: [
      {
        clientScanId: "offline-queue-scan-2",
        inventoryNo: ctx.createdAssets[2].inventory_no,
        locationId: ctx.roomA.id,
        scannedAt: new Date(Date.now() - 120000).toISOString(),
      },
      {
        clientScanId: "offline-queue-scan-3",
        inventoryNo: ctx.createdAssets[3].inventory_no,
        locationId: ctx.roomA.id,
        scannedAt: new Date(Date.now() - 60000).toISOString(),
      },
    ],
  };
  const scanOffline1 = await apiRequest(`/vaqf-api/counts/${ctx.countId}/scans`, {
    sid: ctx.emp1Sid,
    method: "POST",
    body: offlineBatchPayload,
  });
  assert.equal(scanOffline1.status, 200);
  assert.deepEqual(scanOffline1.data.results.map((r) => r.scanStatus), ["found", "found"]);

  const scanOfflineDuplicate = await apiRequest(`/vaqf-api/counts/${ctx.countId}/scans`, {
    sid: ctx.emp1Sid,
    method: "POST",
    body: offlineBatchPayload,
  });
  assert.equal(scanOfflineDuplicate.status, 200);
  assert.deepEqual(scanOfflineDuplicate.data.results.map((r) => r.scanStatus), ["already_scanned", "already_scanned"]);
  assert.ok(scanOfflineDuplicate.data.results.every((r) => r.idempotent === true));

  const countItemsCheck = await query(
    "SELECT count(*)::int AS cnt FROM vaqf.inventory_count_items WHERE count_id = $1 AND client_scan_id = $2",
    [ctx.countId, "offline-queue-scan-2"]
  );
  assert.equal(countItemsCheck.rows[0].cnt, 1, "Bir xil clientScanId faqat bitta yozuv bo'lishi shart");
});

test("2-bosqich 6: Farqlar (qty_diff, moved, extra, missing) va joylarni yakunlash (submit)", async () => {
  const scanBatchAndMoved = await apiRequest(`/vaqf-api/counts/${ctx.countId}/scans`, {
    sid: ctx.emp1Sid,
    method: "POST",
    body: {
      scans: [
        {
          clientScanId: "scan-a-batch-diff",
          inventoryNo: ctx.batchAsset.inventory_no,
          locationId: ctx.roomA.id,
          countedQty: 13,
          note: "2 ta stul sinib omborga olingan ekan",
        },
        {
          clientScanId: "scan-a-moved-from-b",
          inventoryNo: ctx.createdAssets[5].inventory_no,
          locationId: ctx.roomA.id,
          note: "Xona-B dan Xona-A ga vaqtincha olib o'tilgan",
        },
      ],
    },
  });
  assert.equal(scanBatchAndMoved.status, 200);
  assert.equal(scanBatchAndMoved.data.results[0].item.result, "qty_diff");
  assert.equal(scanBatchAndMoved.data.results[1].item.result, "moved");

  const extraRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/extra`, {
    sid: ctx.emp1Sid,
    method: "POST",
    body: {
      locationId: ctx.roomA.id,
      name: "Yangi topilgan Samsung Monitor 27",
      categoryId: ctx.itCat.id,
      countedQty: 1,
      unit: "dona",
      condition: "good",
      note: "Ro'yxatda yo'q edi, sanoqda aniqlandi",
      clientScanId: "extra-item-scan-1",
    },
  });
  assert.equal(extraRes.status, 201);
  assert.equal(extraRes.data.item.result, "extra");

  const scanB = await apiRequest(`/vaqf-api/counts/${ctx.countId}/scans`, {
    sid: ctx.emp2Sid,
    method: "POST",
    body: {
      scans: [
        { clientScanId: "scan-b-asset-6", inventoryNo: ctx.createdAssets[6].inventory_no, locationId: ctx.roomB.id },
        { clientScanId: "scan-b-asset-7", inventoryNo: ctx.createdAssets[7].inventory_no, locationId: ctx.roomB.id },
        { clientScanId: "scan-b-asset-8", inventoryNo: ctx.createdAssets[8].inventory_no, locationId: ctx.roomB.id },
      ],
    },
  });
  assert.equal(scanB.status, 200);

  const prematureSubmit = await apiRequest(`/vaqf-api/counts/${ctx.countId}/submit`, {
    sid: ctx.directorSid,
    method: "POST",
  });
  assert.equal(prematureSubmit.status, 400, "Joylar tugallanmasdan submit qilib bo'lmasligi kerak");

  const doneARes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/locations/${ctx.roomA.id}/done`, {
    sid: ctx.emp1Sid,
    method: "POST",
  });
  assert.equal(doneARes.status, 200);
  assert.equal(doneARes.data.markedMissingCount, 0);

  const doneBRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/locations/${ctx.roomB.id}/done`, {
    sid: ctx.emp2Sid,
    method: "POST",
  });
  assert.equal(doneBRes.status, 200);
  assert.equal(doneBRes.data.markedMissingCount, 1, "Skanerlanmagan 1 ta buyum avtomatik missing bo'lishi kerak");

  const submitRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/submit`, {
    sid: ctx.directorSid,
    method: "POST",
  });
  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.data.count.status, "review");
});

test("2-bosqich 7 (Qoida): Tasdiqlash tranzaksiyasi o'rtasida xato bo'lsa to'liq rollback bo'lishi", async () => {
  const discRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/discrepancies`, {
    sid: ctx.directorSid,
  });
  assert.equal(discRes.status, 200);
  assert.equal(discRes.data.items.length, 4);

  for (const item of discRes.data.items) {
    const decision = item.result === "missing" ? "mark_missing" : "apply";
    const decRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/items/${item.id}/decision`, {
      sid: ctx.directorSid,
      method: "PATCH",
      body: { decision, decision_note: `Direktor qarori: ${decision}` },
    });
    assert.equal(decRes.status, 200);
  }

  const failedApproveRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/approve`, {
    sid: ctx.directorSid,
    method: "POST",
    body: { _simulateTransactionFailureAfterFirstItem: true },
  });
  assert.equal(failedApproveRes.status, 500, "Sun'iy xato 500 qaytarishi kerak");

  const afterFailCount = await apiRequest(`/vaqf-api/counts/${ctx.countId}`, { sid: ctx.directorSid });
  assert.equal(afterFailCount.data.count.status, "review", "Rollbackdan keyin sanoq review holatida qolishi shart");

  const movedCheckBefore = await apiRequest(`/vaqf-api/assets/${ctx.createdAssets[5].id}`, { sid: ctx.directorSid });
  assert.equal(movedCheckBefore.data.asset.location_id, ctx.roomB.id, "Rollbackdan keyin buyum joyi o'zgarmagan bo'lishi shart");

  const batchCheckBefore = await apiRequest(`/vaqf-api/assets/${ctx.batchAsset.id}`, { sid: ctx.directorSid });
  assert.equal(Number(batchCheckBefore.data.asset.quantity), 15, "Rollbackdan keyin batch miqdori 15 bo'lib qolishi shart");
});

test("2-bosqich 8: Sanoqni tasdiqlash, mulk tarixi (asset_events), o'zgarmaslik (immutability) va PDF/Excel dalolatnoma", async () => {
  const approveRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/approve`, {
    sid: ctx.directorSid,
    method: "POST",
    body: {},
  });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.data.count.status, "approved");

  const movedAfter = await apiRequest(`/vaqf-api/assets/${ctx.createdAssets[5].id}`, { sid: ctx.directorSid });
  assert.equal(movedAfter.data.asset.location_id, ctx.roomA.id);
  assert.ok(
    movedAfter.data.asset.events.some(
      (ev) => ev.event_type === "location_changed" && String(ev.note || "").includes(`inventarizatsiya ${ctx.countCode} natijasi`)
    )
  );

  const batchAfter = await apiRequest(`/vaqf-api/assets/${ctx.batchAsset.id}`, { sid: ctx.directorSid });
  assert.equal(Number(batchAfter.data.asset.quantity), 13);

  const missingAfter = await apiRequest(`/vaqf-api/assets/${ctx.createdAssets[9].id}`, { sid: ctx.directorSid });
  assert.equal(missingAfter.data.asset.status, "missing");

  const allAssetsAfter = await apiRequest("/vaqf-api/assets?institution_id=1", { sid: ctx.directorSid });
  assert.equal(allAssetsAfter.data.total, 11);

  const mutateApprovedPatch = await apiRequest(`/vaqf-api/counts/${ctx.countId}`, {
    sid: ctx.directorSid,
    method: "PATCH",
    body: { title: "O'zgartirishga urinish" },
  });
  assert.equal(mutateApprovedPatch.status, 400, "Tasdiqlangan sanoqni tahrirlab bo'lmasligi kerak");

  const mutateApprovedCancel = await apiRequest(`/vaqf-api/counts/${ctx.countId}/cancel`, {
    sid: ctx.directorSid,
    method: "POST",
    body: { reason: "Bekor qilishga urinish" },
  });
  assert.equal(mutateApprovedCancel.status, 400, "Tasdiqlangan sanoqni bekor qilib bo'lmasligi kerak");

  const pdfTrRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/report.pdf?lang=tr`, { sid: ctx.directorSid });
  assert.equal(pdfTrRes.status, 200);
  assert.equal(pdfTrRes.data.subarray(0, 5).toString("ascii"), "%PDF-");

  const pdfUzRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/report.pdf?lang=uz`, { sid: ctx.directorSid });
  assert.equal(pdfUzRes.status, 200);
  assert.equal(pdfUzRes.data.subarray(0, 5).toString("ascii"), "%PDF-");

  const xlsxRes = await apiRequest(`/vaqf-api/counts/${ctx.countId}/report.xlsx`, { sid: ctx.directorSid });
  assert.equal(xlsxRes.status, 200);
  assert.ok(xlsxRes.data.length > 2000);
});
