import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { db, query } from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BFF_DIR = path.resolve(__dirname, "..");
const BASE_URL = process.env.VAQF_TEST_BASE_URL || "http://127.0.0.1:3000";
const SESSIONS_PATH = path.join(BFF_DIR, ".sessions.json");

test.after(async () => {
  await db.rawPool.end();
});

function getTestSessions() {
  const raw = JSON.parse(fs.readFileSync(SESSIONS_PATH, "utf8"));
  let directorSid = null;
  let employeeSid = null;
  for (const [sid, sess] of Object.entries(raw)) {
    if (!directorSid && sess?.crmUser?.role === "root" && sess?.erpUser?.role === "DIRECTOR") {
      directorSid = sid;
    }
    if (!employeeSid && sess?.erpUser?.email === "muhammadjon@moliya.org") {
      employeeSid = sid;
    }
  }
  if (!directorSid) throw new Error("Director session not found in .sessions.json");
  if (!employeeSid) throw new Error("Employee session not found in .sessions.json");
  return { directorSid, employeeSid };
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

test("1. Migrations: clean database from scratch & idempotent re-run", async () => {
  // Drop vaqf schema completely to test clean database migration from scratch
  await query("DROP SCHEMA IF EXISTS vaqf CASCADE");

  const out1 = execFileSync("node", [path.join(__dirname, "migrate.mjs")], {
    cwd: BFF_DIR,
    encoding: "utf8",
  });
  assert.match(out1, /Newly applied: 2/);

  // Re-run on existing populated schema to verify idempotency
  const out2 = execFileSync("node", [path.join(__dirname, "migrate.mjs")], {
    cwd: BFF_DIR,
    encoding: "utf8",
  });
  assert.match(out2, /Newly applied: 0/);

  const instRes = await query("SELECT code, name FROM vaqf.institutions WHERE code = $1", ["MZN"]);
  assert.equal(instRes.rowCount, 1);
  assert.equal(instRes.rows[0].name, "Mezana Akademiyasi");

  const catRes = await query("SELECT count(*)::int AS cnt FROM vaqf.asset_categories");
  assert.ok(catRes.rows[0].cnt >= 11, "Expected at least 11 seeded categories");

  const locRes = await query("SELECT count(*)::int AS cnt FROM vaqf.locations");
  assert.ok(locRes.rows[0].cnt >= 27, "Expected CRM rooms synced into vaqf.locations");
});

test("2. Access Control: unauthenticated (401) and non-director employee (403, button hidden)", async () => {
  const { employeeSid } = getTestSessions();

  // Unauthenticated request -> 401
  const noAuth = await apiRequest("/vaqf-api/me");
  assert.equal(noAuth.status, 401);

  // Non-director employee -> /fin-api/auth/me shows access.vaqf.canView === false (hides "Vaqf" button)
  const finMe = await apiRequest("/fin-api/auth/me", { sid: employeeSid });
  assert.equal(finMe.status, 200);
  assert.equal(finMe.data?.access?.vaqf?.canView, false);
  assert.equal(finMe.data?.access?.vaqf?.canEdit, false);

  // Non-director employee -> /vaqf-api/* endpoints return 403
  for (const endpoint of ["/vaqf-api/me", "/vaqf-api/assets", "/vaqf-api/reports/summary", "/vaqf-api/categories"]) {
    const res = await apiRequest(endpoint, { sid: employeeSid });
    assert.equal(res.status, 403, `Expected 403 on ${endpoint} for non-director`);
  }

  const postAttempt = await apiRequest("/vaqf-api/assets", {
    sid: employeeSid,
    method: "POST",
    body: { name: "Ruxsatsiz buyum", category_id: 1, institution_id: 1 },
  });
  assert.equal(postAttempt.status, 403);
});

test("3. Input Validation: rejects missing required fields, invalid enums, and negative numbers", async () => {
  const { directorSid } = getTestSessions();

  // Missing name
  const resNoName = await apiRequest("/vaqf-api/assets", {
    sid: directorSid,
    method: "POST",
    body: { category_id: 1, institution_id: 1 },
  });
  assert.equal(resNoName.status, 400);

  // Missing category_id
  const resNoCat = await apiRequest("/vaqf-api/assets", {
    sid: directorSid,
    method: "POST",
    body: { name: "Test buyum", institution_id: 1 },
  });
  assert.equal(resNoCat.status, 400);

  // Invalid status enum
  const resBadStatus = await apiRequest("/vaqf-api/assets", {
    sid: directorSid,
    method: "POST",
    body: { name: "Test buyum", category_id: 1, institution_id: 1, status: "broken_enum" },
  });
  assert.equal(resBadStatus.status, 400);

  // Invalid currency enum
  const resBadCurr = await apiRequest("/vaqf-api/assets", {
    sid: directorSid,
    method: "POST",
    body: { name: "Test buyum", category_id: 1, institution_id: 1, currency: "BTC" },
  });
  assert.equal(resBadCurr.status, 400);

  // Invalid quantity <= 0
  const resBadQty = await apiRequest("/vaqf-api/assets", {
    sid: directorSid,
    method: "POST",
    body: { name: "Test buyum", category_id: 1, institution_id: 1, quantity: 0 },
  });
  assert.equal(resBadQty.status, 400);
});

test("4. E2E Director Scenario: switch button, 3 assets (individual, batch, donation), QR PDF, QR scan", async () => {
  const { directorSid } = getTestSessions();

  // 1) Director checks /fin-api/auth/me -> Vaqf button is visible
  const finMe = await apiRequest("/fin-api/auth/me", { sid: directorSid });
  assert.equal(finMe.status, 200);
  assert.equal(finMe.data?.access?.vaqf?.canView, true);
  assert.equal(finMe.data?.access?.vaqf?.canEdit, true);

  // 2) /vaqf/ opens with same cookie without re-login
  const vaqfMe = await apiRequest("/vaqf-api/me", { sid: directorSid });
  assert.equal(vaqfMe.status, 200);
  assert.equal(vaqfMe.data?.vaqfAccess?.canView, true);

  // Fetch categories & locations to pick realistic IDs
  const catsRes = await apiRequest("/vaqf-api/categories", { sid: directorSid });
  const locsRes = await apiRequest("/vaqf-api/locations?institution_id=1", { sid: directorSid });
  const itCat = catsRes.data.items.find((c) => /komp|noutbuk/i.test(c.name)) || catsRes.data.items[0];
  const furnCat = catsRes.data.items.find((c) => /mebel|parta/i.test(c.name)) || catsRes.data.items[1] || catsRes.data.items[0];
  const elecCat = catsRes.data.items.find((c) => /elektron|proyektor/i.test(c.name)) || catsRes.data.items[2] || catsRes.data.items[0];
  const roomLoc = locsRes.data.items.find((l) => l.kind === "room") || locsRes.data.items[0];

  // 3a) Create Asset #1: Individual purchase
  const asset1Res = await apiRequest("/vaqf-api/assets", {
    sid: directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      category_id: itCat.id,
      location_id: roomLoc.id,
      name: "Apple MacBook Pro 16 M3",
      description: "Akademiya mudiri va IT bo'limi uchun noutbuk",
      tracking: "individual",
      quantity: 1,
      unit: "dona",
      brand: "Apple",
      model: "MacBook Pro 16 (2024)",
      serial_no: "C02X9001M3",
      responsible_name: "Mezana Direktor",
      status: "in_use",
      condition: "new",
      acquisition_type: "purchase",
      acquired_at: "2026-09-01",
      purchase_price: 68000,
      currency: "TRY",
      supplier: "Apple Türkiye",
    },
  });
  assert.equal(asset1Res.status, 201);
  assert.equal(asset1Res.data.asset.inventory_no, "EV-MZN-000001");
  assert.equal(asset1Res.data.asset.tracking, "individual");

  // 3b) Create Asset #2: Batch asset (parta va stullar)
  const asset2Res = await apiRequest("/vaqf-api/assets", {
    sid: directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      category_id: furnCat.id,
      location_id: roomLoc.id,
      name: "O'quv partasi va stuli (2 kishilik to'plam)",
      description: "Darsxona uchun parta-stul komplekti",
      tracking: "batch",
      quantity: 15,
      unit: "komplekt",
      brand: "Bürotime",
      status: "in_use",
      condition: "good",
      acquisition_type: "purchase",
      acquired_at: "2026-08-20",
      purchase_price: 45000,
      currency: "TRY",
      supplier: "Istanbul Mebel",
      responsible_name: "Xo'jalik bo'limi",
    },
  });
  assert.equal(asset2Res.status, 201);
  assert.equal(asset2Res.data.asset.inventory_no, "EV-MZN-000002");
  assert.equal(asset2Res.data.asset.tracking, "batch");
  assert.equal(Number(asset2Res.data.asset.quantity), 15);

  // 3c) Create Asset #3: Donation (hadya) asset
  const asset3Res = await apiRequest("/vaqf-api/assets", {
    sid: directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      category_id: elecCat.id,
      location_id: roomLoc.id,
      name: "Epson EB-FH06 FullHD Proyektor",
      description: "Anjumanlar va darsxona uchun proyektor",
      tracking: "individual",
      quantity: 1,
      unit: "dona",
      brand: "Epson",
      model: "EB-FH06",
      serial_no: "EPS-998812",
      status: "in_use",
      condition: "new",
      acquisition_type: "donation",
      acquired_at: "2026-10-10",
      purchase_price: 650,
      currency: "USD",
      donor_name: "Axmedov Jamshid (Vaqf homiysi)",
      donation_doc_no: "HD-2026-014",
      responsible_name: "Mezana Direktor",
    },
  });
  assert.equal(asset3Res.status, 201);
  assert.equal(asset3Res.data.asset.inventory_no, "EV-MZN-000003");
  assert.equal(asset3Res.data.asset.acquisition_type, "donation");
  assert.equal(asset3Res.data.asset.donor_name, "Axmedov Jamshid (Vaqf homiysi)");

  // 4) Generate QR Labels PDF for the 3 assets
  const ids = [asset1Res.data.asset.id, asset2Res.data.asset.id, asset3Res.data.asset.id].join(",");
  const pdfRes = await apiRequest(`/vaqf-api/labels?ids=${ids}&preset=a4_3x8`, { sid: directorSid });
  assert.equal(pdfRes.status, 200);
  assert.match(pdfRes.headers.get("content-type") || "", /application\/pdf/);
  assert.ok(Buffer.isBuffer(pdfRes.data));
  assert.equal(pdfRes.data.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdfRes.data.length > 5000, `Expected PDF > 5KB, got ${pdfRes.data.length} bytes`);

  // 5) Phone QR scan -> opens /vaqf/a/EV-MZN-000001 and fetches /vaqf-api/assets/by-code/EV-MZN-000001
  const spaScanRes = await apiRequest("/vaqf/a/EV-MZN-000001", { sid: directorSid });
  assert.equal(spaScanRes.status, 200);

  const byCodeRes = await apiRequest("/vaqf-api/assets/by-code/EV-MZN-000001", { sid: directorSid });
  assert.equal(byCodeRes.status, 200);
  assert.equal(byCodeRes.data.asset.inventory_no, "EV-MZN-000001");
  assert.equal(byCodeRes.data.asset.name, "Apple MacBook Pro 16 M3");
  assert.ok(Array.isArray(byCodeRes.data.asset.events) && byCodeRes.data.asset.events.length >= 1);
  assert.equal(byCodeRes.data.asset.events[0].event_type, "created");
});

test("5. SQL Injection & Soft Delete verification", async () => {
  const { directorSid } = getTestSessions();

  // SQL Injection in search filter
  const sqliSearch = await apiRequest(
    `/vaqf-api/assets?search=${encodeURIComponent("' OR 1=1 --")}`,
    { sid: directorSid }
  );
  assert.equal(sqliSearch.status, 200);
  assert.equal(sqliSearch.data.total, 0);
  assert.equal(sqliSearch.data.items.length, 0);

  // SQL Injection in by-code lookup
  const sqliCode = await apiRequest(
    `/vaqf-api/assets/by-code/${encodeURIComponent("' OR '1'='1")}`,
    { sid: directorSid }
  );
  assert.equal(sqliCode.status, 404);

  // Create a 4th temporary asset, then soft-delete it
  const tempRes = await apiRequest("/vaqf-api/assets", {
    sid: directorSid,
    method: "POST",
    body: {
      institution_id: 1,
      category_id: 1,
      name: "Vaqtinchalik test stul (o'chiriladi)",
      tracking: "individual",
      quantity: 1,
    },
  });
  assert.equal(tempRes.status, 201);
  const tempId = tempRes.data.asset.id;

  // Soft delete
  const delRes = await apiRequest(`/vaqf-api/assets/${tempId}`, {
    sid: directorSid,
    method: "DELETE",
  });
  assert.equal(delRes.status, 200);
  assert.equal(delRes.data.success, true);

  // Verify soft-deleted asset does NOT appear in list and returns 404 on detail
  const listRes = await apiRequest("/vaqf-api/assets", { sid: directorSid });
  assert.equal(listRes.status, 200);
  assert.equal(listRes.data.total, 3, "Only the 3 active E2E assets should remain in list");
  assert.ok(!listRes.data.items.some((a) => a.id === tempId));

  const detailRes = await apiRequest(`/vaqf-api/assets/${tempId}`, { sid: directorSid });
  assert.equal(detailRes.status, 404);

  // Verify audit event was recorded in vaqf.asset_events
  const evRes = await query(
    "SELECT event_type FROM vaqf.asset_events WHERE asset_id = $1 ORDER BY id ASC",
    [tempId]
  );
  assert.deepEqual(
    evRes.rows.map((r) => r.event_type),
    ["created", "deleted"]
  );
});
