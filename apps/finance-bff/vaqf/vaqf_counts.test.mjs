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

test.after(async () => {
  await db.rawPool.end();
});

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

test("Vaqf 2-bosqich (Inventarizatsiya): To'liq E2E stsenariy va barcha qoidalar tekshiruvi", async () => {
  const { directorSid, emp1Sid, emp2Sid, unassignedSid } = getCountTestSessions();

  // Clean up any previous counts and test assets so we have a clean, deterministic state
  await query("DELETE FROM vaqf.inventory_counts");
  await query("DELETE FROM vaqf.assets");

  // Fetch categories and locations
  const catsRes = await apiRequest("/vaqf-api/categories", { sid: directorSid });
  assert.equal(catsRes.status, 200);
  const furnCat = catsRes.data.items.find((c) => /mebel|parta/i.test(c.name)) || catsRes.data.items[0];
  const itCat = catsRes.data.items.find((c) => /komp|noutbuk/i.test(c.name)) || catsRes.data.items[1] || catsRes.data.items[0];

  const locsRes = await apiRequest("/vaqf-api/locations?institution_id=1", { sid: directorSid });
  assert.equal(locsRes.status, 200);
  const rooms = locsRes.data.items.filter((l) => l.kind === "room");
  assert.ok(rooms.length >= 2, "Kamida 2 ta xona mavjud bo'lishi kerak");
  const roomA = rooms[0];
  const roomB = rooms[1];

  // =========================================================================
  // 1. 2 ta xona va 10 ta buyum yaratish (shundan 1 tasi batch: 15 ta stul)
  // =========================================================================
  const createdAssets = [];

  // Room A: 5 ta buyum (4 ta individual + 1 ta batch 15 dona)
  for (let i = 1; i <= 4; i++) {
    const res = await apiRequest("/vaqf-api/assets", {
      sid: directorSid,
      method: "POST",
      body: {
        institution_id: 1,
        category_id: itCat.id,
        location_id: roomA.id,
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
    createdAssets.push(res.data.asset);
  }

  // Asset #5 in Room A: Batch asset (15 dona o'quv stuli)
  const batchRes = await apiRequest("/vaqf-api/assets", {
    sid: directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      category_id: furnCat.id,
      location_id: roomA.id,
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
  const batchAsset = batchRes.data.asset;
  createdAssets.push(batchAsset);

  // Room B: 5 ta individual buyum (#6..#10)
  for (let i = 1; i <= 5; i++) {
    const res = await apiRequest("/vaqf-api/assets", {
      sid: directorSid,
      method: "POST",
      body: {
        institution_id: 1,
        category_id: furnCat.id,
        location_id: roomB.id,
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
    createdAssets.push(res.data.asset);
  }

  assert.equal(createdAssets.length, 10, "Jami 10 ta buyum yaratilgan bo'lishi kerak");

  // =========================================================================
  // 2. Sanoq yaratish (qoralama), 2 ta mas'ul xodim biriktirish va boshlash
  // =========================================================================
  const previewRes = await apiRequest("/vaqf-api/counts/preview-scope", {
    sid: directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      location_ids: [roomA.id, roomB.id],
      category_ids: [],
    },
  });
  assert.equal(previewRes.status, 200);
  assert.equal(previewRes.data.asset_cards_count, 10);
  assert.equal(previewRes.data.total_units_count, 24); // 9 individual + 15 batch

  const createCountRes = await apiRequest("/vaqf-api/counts", {
    sid: directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      title: "2026 Kuzgi Choraklik Inventarizatsiya",
      notes: "2 ta xona bo'yicha to'liq tekshiruv",
      scope: {
        all_locations: false,
        location_ids: [roomA.id, roomB.id],
        category_ids: [],
      },
      committee: [
        { name: "Mezana Rahbariyat", role: "Komissiya raisi (Direktor)" },
        { name: "Umarkhon Abdulhamidov", role: "Komissiya a'zosi" },
        { name: "Muhammadjon Moliya", role: "Komissiya a'zosi" },
      ],
      assignments: [
        {
          location_id: roomA.id,
          assignee_ref: "userumar",
          assignee_name: "Umarkhon Abdulhamidov",
        },
        {
          location_id: roomB.id,
          assignee_ref: "muhammadjon@moliya.org",
          assignee_name: "Muhammadjon Moliya",
        },
      ],
    },
  });
  assert.equal(createCountRes.status, 201);
  const countId = createCountRes.data.count.id;
  const countCode = createCountRes.data.count.code;
  assert.match(countCode, /^SAN-\d{4}-\d{3}$/);
  assert.equal(createCountRes.data.count.status, "draft");

  // Start the count -> freezes the 10 assets into vaqf.inventory_count_items
  const startRes = await apiRequest(`/vaqf-api/counts/${countId}/start`, {
    sid: directorSid,
    method: "POST",
  });
  assert.equal(startRes.status, 200);
  assert.equal(startRes.data.count.status, "in_progress");
  assert.equal(Number(startRes.data.summary.expected_cards), 10);

  // Verify rule: only ONE in_progress count per institution is allowed
  const secondDraftRes = await apiRequest("/vaqf-api/counts", {
    sid: directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      title: "Ikkinchi parallel sanoq",
      scope: { all_locations: false, location_ids: [roomA.id], category_ids: [] },
    },
  });
  assert.equal(secondDraftRes.status, 201);
  const secondStartRes = await apiRequest(`/vaqf-api/counts/${secondDraftRes.data.count.id}/start`, {
    sid: directorSid,
    method: "POST",
  });
  assert.equal(secondStartRes.status, 409, "Bir vaqtda ikkinchi in_progress sanoq boshlanmasligi kerak");

  // Cancel the second draft so it doesn't clutter
  await apiRequest(`/vaqf-api/counts/${secondDraftRes.data.count.id}/cancel`, {
    sid: directorSid,
    method: "POST",
    body: { reason: "Test uchun yaratilgan ikkinchi qoralama" },
  });

  // =========================================================================
  // 3. Huquqlar va Bloklash qoidalarini avtomatik tekshirish
  // =========================================================================

  // 3a) Sanoqqa biriktirilmagan xodim (unassignedSid) skanerlay olmaydi (403)
  const unassignedMyRes = await apiRequest(`/vaqf-api/counts/${countId}/my`, {
    sid: unassignedSid,
  });
  assert.equal(unassignedMyRes.status, 403, "Biriktirilmagan xodim /my ga kira olmasligi kerak");

  const unassignedScanRes = await apiRequest(`/vaqf-api/counts/${countId}/scans`, {
    sid: unassignedSid,
    method: "POST",
    body: {
      scans: [
        {
          clientScanId: "unassigned-attempt-1",
          inventoryNo: createdAssets[0].inventory_no,
          locationId: roomA.id,
        },
      ],
    },
  });
  assert.equal(unassignedScanRes.status, 403, "Biriktirilmagan xodim skanerlay olmasligi kerak");

  // 3b) Biriktirilgan xodim (emp1 -> Room A) o'z xonasini ko'ra oladi, lekin Room B da skanerlay olmaydi (403)
  const emp1MyRes = await apiRequest(`/vaqf-api/counts/${countId}/my`, {
    sid: emp1Sid,
  });
  assert.equal(emp1MyRes.status, 200);
  assert.equal(emp1MyRes.data.myLocations.length, 1);
  assert.equal(emp1MyRes.data.myLocations[0].location_id, roomA.id);

  const emp1WrongRoomScan = await apiRequest(`/vaqf-api/counts/${countId}/scans`, {
    sid: emp1Sid,
    method: "POST",
    body: {
      scans: [
        {
          clientScanId: "wrong-room-scan-1",
          inventoryNo: createdAssets[5].inventory_no,
          locationId: roomB.id, // Room B is assigned to emp2, not emp1!
        },
      ],
    },
  });
  assert.equal(emp1WrongRoomScan.status, 403, "Biriktirilgan xodim boshqa xonada skanerlay olmasligi kerak");

  // 3c) Sanoq in_progress paytida buyumning joyini yoki miqdorini oddiy tahrirlash rad etiladi (409)
  const editLocDuringCount = await apiRequest(`/vaqf-api/assets/${createdAssets[0].id}`, {
    sid: directorSid,
    method: "PATCH",
    body: { location_id: roomB.id },
  });
  assert.equal(editLocDuringCount.status, 409, "in_progress sanoq paytida joyni oddiy tahrirlash 409 qaytarishi kerak");

  const editQtyDuringCount = await apiRequest(`/vaqf-api/assets/${batchAsset.id}`, {
    sid: directorSid,
    method: "PATCH",
    body: { quantity: 20 },
  });
  assert.equal(editQtyDuringCount.status, 409, "in_progress sanoq paytida miqdorni oddiy tahrirlash 409 qaytarishi kerak");

  // =========================================================================
  // 4. Skanerlash (7 ta found, 1 ta moved, 1 ta batch qty_diff, 1 ta extra, 1 ta missing, + offline queue idempotency)
  // =========================================================================
  // Assets in Room A: createdAssets[0..3] (individual), createdAssets[4] (batchAsset, expected 15)
  // Assets in Room B: createdAssets[5..9] (individual)
  // Plan:
  // - In Room A (by emp1):
  //   * createdAssets[0], [1], [2], [3] -> scanned in Room A -> 4 ta `found`
  //     (createdAssets[2] and [3] sent as offline batch queue, and then re-sent with same clientScanId to test idempotency!)
  //   * createdAssets[4] (batchAsset) -> scanned in Room A with countedQty = 13 (expected 15) -> 1 ta `qty_diff`
  //   * createdAssets[5] (expected in Room B!) -> scanned in Room A -> 1 ta `moved`
  //   * 1 ta ro'yxatda yo'q buyum (`POST /extra` in Room A) -> 1 ta `extra`
  // - In Room B (by emp2):
  //   * createdAssets[6], [7], [8] -> scanned in Room B -> 3 ta `found` (Jami found = 4 + 3 = 7 ta!)
  //   * createdAssets[9] -> skanerlanmaydi! Xona tugatilganda `missing` bo'ladi!

  // 4a) emp1 scans createdAssets[0] and [1] in Room A
  const scanA1 = await apiRequest(`/vaqf-api/counts/${countId}/scans`, {
    sid: emp1Sid,
    method: "POST",
    body: {
      scans: [
        {
          clientScanId: "scan-a-asset-0",
          inventoryNo: createdAssets[0].inventory_no,
          locationId: roomA.id,
          condition: "good",
        },
        {
          clientScanId: "scan-a-asset-1",
          inventoryNo: createdAssets[1].inventory_no,
          locationId: roomA.id,
          condition: "good",
        },
      ],
    },
  });
  assert.equal(scanA1.status, 200);
  assert.deepEqual(
    scanA1.data.results.map((r) => r.scanStatus),
    ["found", "found"]
  );

  // 4b) Offline batch queue: emp1 sends 2 offline queued scans (createdAssets[2] and [3])
  const offlineBatchPayload = {
    scans: [
      {
        clientScanId: "offline-queue-scan-2",
        inventoryNo: createdAssets[2].inventory_no,
        locationId: roomA.id,
        scannedAt: new Date(Date.now() - 120000).toISOString(),
      },
      {
        clientScanId: "offline-queue-scan-3",
        inventoryNo: createdAssets[3].inventory_no,
        locationId: roomA.id,
        scannedAt: new Date(Date.now() - 60000).toISOString(),
      },
    ],
  };
  const scanOffline1 = await apiRequest(`/vaqf-api/counts/${countId}/scans`, {
    sid: emp1Sid,
    method: "POST",
    body: offlineBatchPayload,
  });
  assert.equal(scanOffline1.status, 200);
  assert.deepEqual(
    scanOffline1.data.results.map((r) => r.scanStatus),
    ["found", "found"]
  );

  // 4c) Idempotency check: send the exact same clientScanId again -> returns `already_scanned` and creates no duplicate
  const scanOfflineDuplicate = await apiRequest(`/vaqf-api/counts/${countId}/scans`, {
    sid: emp1Sid,
    method: "POST",
    body: offlineBatchPayload,
  });
  assert.equal(scanOfflineDuplicate.status, 200);
  assert.deepEqual(
    scanOfflineDuplicate.data.results.map((r) => r.scanStatus),
    ["already_scanned", "already_scanned"]
  );
  assert.ok(scanOfflineDuplicate.data.results.every((r) => r.idempotent === true));

  const countItemsCheck = await query(
    "SELECT count(*)::int AS cnt FROM vaqf.inventory_count_items WHERE count_id = $1 AND client_scan_id = $2",
    [countId, "offline-queue-scan-2"]
  );
  assert.equal(countItemsCheck.rows[0].cnt, 1, "Bir xil clientScanId faqat bitta yozuv bo'lishi shart");

  // 4d) emp1 scans batchAsset (expected 15) with countedQty: 13 -> `qty_diff`, and createdAssets[5] (from Room B) in Room A -> `moved`
  const scanBatchAndMoved = await apiRequest(`/vaqf-api/counts/${countId}/scans`, {
    sid: emp1Sid,
    method: "POST",
    body: {
      scans: [
        {
          clientScanId: "scan-a-batch-diff",
          inventoryNo: batchAsset.inventory_no,
          locationId: roomA.id,
          countedQty: 13,
          note: "2 ta stul sinib omborga olingan ekan",
        },
        {
          clientScanId: "scan-a-moved-from-b",
          inventoryNo: createdAssets[5].inventory_no,
          locationId: roomA.id,
          note: "Xona-B dan Xona-A ga vaqtincha olib o'tilgan",
        },
      ],
    },
  });
  assert.equal(scanBatchAndMoved.status, 200);
  assert.equal(scanBatchAndMoved.data.results[0].scanStatus, "found");
  assert.equal(scanBatchAndMoved.data.results[0].item.result, "qty_diff");
  assert.equal(scanBatchAndMoved.data.results[1].scanStatus, "moved");
  assert.equal(scanBatchAndMoved.data.results[1].item.result, "moved");

  // 4e) emp1 adds 1 unlisted item (`extra`) in Room A
  const extraRes = await apiRequest(`/vaqf-api/counts/${countId}/extra`, {
    sid: emp1Sid,
    method: "POST",
    body: {
      locationId: roomA.id,
      name: "Yangi topilgan Samsung Monitor 27",
      categoryId: itCat.id,
      countedQty: 1,
      unit: "dona",
      condition: "good",
      note: "Ro'yxatda yo'q edi, sanoqda aniqlandi",
      clientScanId: "extra-item-scan-1",
    },
  });
  assert.equal(extraRes.status, 201);
  assert.equal(extraRes.data.item.result, "extra");

  // 4f) emp2 scans createdAssets[6], [7], [8] in Room B (3 ta `found`; createdAssets[9] is left unscanned -> will become `missing`)
  const scanB = await apiRequest(`/vaqf-api/counts/${countId}/scans`, {
    sid: emp2Sid,
    method: "POST",
    body: {
      scans: [
        {
          clientScanId: "scan-b-asset-6",
          inventoryNo: createdAssets[6].inventory_no,
          locationId: roomB.id,
        },
        {
          clientScanId: "scan-b-asset-7",
          inventoryNo: createdAssets[7].inventory_no,
          locationId: roomB.id,
        },
        {
          clientScanId: "scan-b-asset-8",
          inventoryNo: createdAssets[8].inventory_no,
          locationId: roomB.id,
        },
      ],
    },
  });
  assert.equal(scanB.status, 200);
  assert.deepEqual(
    scanB.data.results.map((r) => r.scanStatus),
    ["found", "found", "found"]
  );

  // =========================================================================
  // 5. Joylarni yakunlash (`done`) va Ko'rib chiqishga yuborish (`submit`)
  // =========================================================================
  // Try submitting before locations are done -> should fail with 400
  const prematureSubmit = await apiRequest(`/vaqf-api/counts/${countId}/submit`, {
    sid: directorSid,
    method: "POST",
  });
  assert.equal(prematureSubmit.status, 400, "Joylar tugallanmasdan submit qilib bo'lmasligi kerak");

  // Finish Room A (by emp1)
  const doneARes = await apiRequest(`/vaqf-api/counts/${countId}/locations/${roomA.id}/done`, {
    sid: emp1Sid,
    method: "POST",
  });
  assert.equal(doneARes.status, 200);
  assert.equal(doneARes.data.markedMissingCount, 0);

  // Finish Room B (by emp2) -> createdAssets[9] was not scanned, so markedMissingCount === 1
  const doneBRes = await apiRequest(`/vaqf-api/counts/${countId}/locations/${roomB.id}/done`, {
    sid: emp2Sid,
    method: "POST",
  });
  assert.equal(doneBRes.status, 200);
  assert.equal(doneBRes.data.markedMissingCount, 1, "Skanerlanmagan 1 ta buyum avtomatik missing bo'lishi kerak");

  // Submit count for director review
  const submitRes = await apiRequest(`/vaqf-api/counts/${countId}/submit`, {
    sid: directorSid,
    method: "POST",
  });
  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.data.count.status, "review");

  // =========================================================================
  // 6. Farqlarni tekshirish, qaror berish va tranzaksiya atomikligini sinash
  // =========================================================================
  const discRes = await apiRequest(`/vaqf-api/counts/${countId}/discrepancies`, {
    sid: directorSid,
  });
  assert.equal(discRes.status, 200);
  assert.equal(discRes.data.items.length, 4, "4 ta farq bo'lishi kerak: 1 moved, 1 qty_diff, 1 extra, 1 missing");
  assert.equal(discRes.data.grouped.moved.length, 1);
  assert.equal(discRes.data.grouped.qty_diff.length, 1);
  assert.equal(discRes.data.grouped.extra.length, 1);
  assert.equal(discRes.data.grouped.missing.length, 1);

  // Set director decisions on all 4 discrepancies
  for (const item of discRes.data.items) {
    const decision = item.result === "missing" ? "mark_missing" : "apply";
    const decRes = await apiRequest(`/vaqf-api/counts/${countId}/items/${item.id}/decision`, {
      sid: directorSid,
      method: "PATCH",
      body: {
        decision,
        decision_note: `Direktor qarori: ${decision}`,
      },
    });
    assert.equal(decRes.status, 200);
  }

  // 6a) Test Transaction Atomicity: simulate failure mid-transaction during approve
  const failedApproveRes = await apiRequest(`/vaqf-api/counts/${countId}/approve`, {
    sid: directorSid,
    method: "POST",
    body: { _simulateTransactionFailureAfterFirstItem: true },
  });
  assert.equal(failedApproveRes.status, 500, "Sun'iy xato 500 qaytarishi kerak");

  // Verify rollback: count status is still `review`, moved asset is still in Room B, batch asset still has qty 15, missing asset is still `in_use`
  const afterFailCount = await apiRequest(`/vaqf-api/counts/${countId}`, { sid: directorSid });
  assert.equal(afterFailCount.data.count.status, "review", "Rollbackdan keyin sanoq review holatida qolishi shart");

  const movedCheckBefore = await apiRequest(`/vaqf-api/assets/${createdAssets[5].id}`, { sid: directorSid });
  assert.equal(movedCheckBefore.data.asset.location_id, roomB.id, "Rollbackdan keyin buyum joyi o'zgarmagan bo'lishi shart");

  const batchCheckBefore = await apiRequest(`/vaqf-api/assets/${batchAsset.id}`, { sid: directorSid });
  assert.equal(Number(batchCheckBefore.data.asset.quantity), 15, "Rollbackdan keyin batch miqdori 15 bo'lib qolishi shart");

  // 6b) Real Approval (`POST /vaqf-api/counts/:id/approve`)
  const approveRes = await apiRequest(`/vaqf-api/counts/${countId}/approve`, {
    sid: directorSid,
    method: "POST",
    body: {},
  });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.data.count.status, "approved");

  // =========================================================================
  // 7. Tasdiqlangandan keyin mulk kartochkalari, tarix (asset_events), immutability va PDF/Excel tekshiruvi
  // =========================================================================

  // 7a) Moved asset (`createdAssets[5]`) is now in Room A and has `location_changed` event with count code
  const movedAfter = await apiRequest(`/vaqf-api/assets/${createdAssets[5].id}`, { sid: directorSid });
  assert.equal(movedAfter.data.asset.location_id, roomA.id);
  assert.ok(
    movedAfter.data.asset.events.some(
      (ev) => ev.event_type === "location_changed" && String(ev.note || "").includes(`inventarizatsiya ${countCode} natijasi`)
    ),
    "Ko'chgan buyum tarixida inventarizatsiya izohi bo'lishi kerak"
  );

  // 7b) Batch asset (`batchAsset`) now has quantity = 13 and `updated` event with count code
  const batchAfter = await apiRequest(`/vaqf-api/assets/${batchAsset.id}`, { sid: directorSid });
  assert.equal(Number(batchAfter.data.asset.quantity), 13);
  assert.ok(
    batchAfter.data.asset.events.some(
      (ev) => ev.event_type === "updated" && String(ev.note || "").includes(`inventarizatsiya ${countCode} natijasi`)
    ),
    "Miqdori o'zgargan buyum tarixida inventarizatsiya izohi bo'lishi kerak"
  );

  // 7c) Missing asset (`createdAssets[9]`) now has status = `missing` and `status_changed` event
  const missingAfter = await apiRequest(`/vaqf-api/assets/${createdAssets[9].id}`, { sid: directorSid });
  assert.equal(missingAfter.data.asset.status, "missing");
  assert.ok(
    missingAfter.data.asset.events.some(
      (ev) => ev.event_type === "status_changed" && String(ev.note || "").includes(`inventarizatsiya ${countCode} natijasi`)
    ),
    "Yo'qolgan buyum tarixida inventarizatsiya izohi bo'lishi kerak"
  );

  // 7d) Extra item created a brand-new asset card in `vaqf.assets` (total active assets = 11)
  const allAssetsAfter = await apiRequest("/vaqf-api/assets?institution_id=1", { sid: directorSid });
  assert.equal(allAssetsAfter.data.total, 11, "Extra buyum qo'shilgach jami 11 ta mulk kartochkasi bo'lishi kerak");
  const extraCard = allAssetsAfter.data.items.find((a) => a.name === "Yangi topilgan Samsung Monitor 27");
  assert.ok(extraCard, "Extra buyum uchun yangi kartochka yaratilgan bo'lishi kerak");
  assert.equal(extraCard.location_id, roomA.id);

  // 7e) Approved count is immutable (cannot edit, scan, change decisions, or cancel)
  const mutateApprovedPatch = await apiRequest(`/vaqf-api/counts/${countId}`, {
    sid: directorSid,
    method: "PATCH",
    body: { title: "O'zgartirishga urinish" },
  });
  assert.equal(mutateApprovedPatch.status, 400, "Tasdiqlangan sanoqni tahrirlab bo'lmasligi kerak");

  const mutateApprovedCancel = await apiRequest(`/vaqf-api/counts/${countId}/cancel`, {
    sid: directorSid,
    method: "POST",
    body: { reason: "Bekor qilishga urinish" },
  });
  assert.equal(mutateApprovedCancel.status, 400, "Tasdiqlangan sanoqni bekor qilib bo'lmasligi kerak");

  // 7f) Dalolatnoma PDF (Turkish default & Uzbek) and Excel report verification
  const pdfTrRes = await apiRequest(`/vaqf-api/counts/${countId}/report.pdf?lang=tr`, { sid: directorSid });
  assert.equal(pdfTrRes.status, 200);
  assert.match(pdfTrRes.headers.get("content-type") || "", /application\/pdf/);
  assert.equal(pdfTrRes.data.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdfTrRes.data.length > 5000, "Turkcha PDF dalolatnoma > 5KB bo'lishi kerak");

  const pdfUzRes = await apiRequest(`/vaqf-api/counts/${countId}/report.pdf?lang=uz`, { sid: directorSid });
  assert.equal(pdfUzRes.status, 200);
  assert.equal(pdfUzRes.data.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdfUzRes.data.length > 5000, "O'zbekcha PDF dalolatnoma > 5KB bo'lishi kerak");

  const xlsxRes = await apiRequest(`/vaqf-api/counts/${countId}/report.xlsx`, { sid: directorSid });
  assert.equal(xlsxRes.status, 200);
  assert.match(
    xlsxRes.headers.get("content-type") || "",
    /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
  );
  assert.ok(xlsxRes.data.length > 2000, "Excel hisobot > 2KB bo'lishi kerak");
});
