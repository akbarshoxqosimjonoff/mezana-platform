import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { query, withTransaction } from "./db.mjs";
import {
  httpError,
  getActor,
  PHOTOS_DIR,
  listCategories,
  listLocations,
} from "./service.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const apiRequire = createRequire(path.join(rootDir, "apps/api/package.json"));
const PDFDocument = apiRequire("pdfkit");
const ExcelJS = apiRequire("exceljs");

const LOGO_PNG_PATH = path.join(__dirname, "ezan-logo.png");
const FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

export const VALID_COUNT_STATUSES = ["draft", "in_progress", "review", "approved", "cancelled"];
export const VALID_ITEM_RESULTS = ["pending", "found", "moved", "missing", "extra", "qty_diff", "damaged"];
export const VALID_ITEM_CONDITIONS = ["new", "good", "fair", "poor", "damaged"];
export const VALID_DECISIONS = ["apply", "mark_missing", "ignore"];
export const DISCREPANCY_RESULTS = ["missing", "moved", "extra", "qty_diff", "damaged"];

/**
 * Collect all possible user reference strings for matching `assignee_ref` in `vaqf.inventory_count_locations`.
 */
export function getUserCandidateRefs(sess, accessContext = null) {
  const refs = new Set();
  const add = (v) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      refs.add(String(v).trim().toLowerCase());
    }
  };
  if (!sess) return refs;

  const empId = accessContext?.employeeId || sess?.erpUser?.employeeId || sess?.crmUser?.employeeId;
  if (empId) {
    add(empId);
    add(`erp:${empId}`);
    add(`erp:emp:${empId}`);
  }
  if (sess.erpUser?.id) {
    add(sess.erpUser.id);
    add(`erp:${sess.erpUser.id}`);
    add(`erp:user:${sess.erpUser.id}`);
  }
  if (sess.erpUser?.email) {
    add(sess.erpUser.email);
    add(`erp:${sess.erpUser.email}`);
  }
  if (sess.crmUser?.id) {
    add(sess.crmUser.id);
    add(`crm:admin:${sess.crmUser.id}`);
    add(`crm:${sess.crmUser.id}`);
  }
  if (sess.crmUser?.username) {
    add(sess.crmUser.username);
    add(`crm:admin:${sess.crmUser.username}`);
    add(`crm:${sess.crmUser.username}`);
  }
  if (sess.user?.identifier) add(sess.user.identifier);
  if (sess.user?.id) add(sess.user.id);

  // Cross-map known ERP/CRM staff accounts so assigning either CRM or ERP ref matches seamlessly
  const emailLower = String(sess.erpUser?.email || "").toLowerCase();
  const crmUserLower = String(sess.crmUser?.username || "").toLowerCase();
  if (emailLower.startsWith("umarxon@") || crmUserLower === "userumar" || crmUserLower === "umarxon") {
    add("crm:admin:1");
    add("userumar");
    add("umarxon@moliya.org");
    add("erp:cmtlai0it000ppir989mu70w1");
    add("cmtlai0it000ppir989mu70w1");
  }
  if (emailLower.startsWith("idora@") || crmUserLower === "idora") {
    add("crm:admin:5");
    add("idora");
    add("idora@moliya.org");
    add("erp:cmtlai0it000ppir989mu70w1");
  }
  if (emailLower.startsWith("vaqf@") || crmUserLower === "abdurahman") {
    add("crm:admin:2");
    add("abdurahman");
    add("vaqf@moliya.org");
    add("erp:cmvaqfemp0000000000000001");
    add("cmvaqfemp0000000000000001");
  }
  if (emailLower.startsWith("muhammadjon@")) {
    add("muhammadjon@moliya.org");
    add("erp:cmtlai0pv000upir9qk3vaotg");
    add("cmtlai0pv000upir9qk3vaotg");
  }
  if (emailLower.startsWith("abdurahmon@")) {
    add("abdurahmon@moliya.org");
    add("erp:cmtlai0w1000zpir9b7ste5ze");
    add("cmtlai0w1000zpir9b7ste5ze");
  }

  return refs;
}

/**
 * Extended async access resolver for Step 2 (Inventory Counts).
 * - Director gets full rights (`canView`, `canEdit`, `canApprove`, `canManageCounts`, `canCount`).
 * - Assigned employee gets `canCount: true` and `assignedCountIds` while a count is `in_progress`.
 */
export async function resolveVaqfAccessAsync(sess, accessContext = null) {
  if (!sess) {
    return {
      canView: false,
      canEdit: false,
      canApprove: false,
      canManageCounts: false,
      canCount: false,
      isDirector: false,
      assignedCountIds: [],
    };
  }
  const isDirector = Boolean(
    accessContext?.isDirector ??
      (sess.user?.role === "DIRECTOR" ||
        sess.erpUser?.role === "DIRECTOR" ||
        sess.crmUser?.role === "root")
  );
  if (isDirector) {
    return {
      canView: true,
      canEdit: true,
      canApprove: true,
      canManageCounts: true,
      canCount: true,
      isDirector: true,
      assignedCountIds: [],
    };
  }

  const candidateRefs = Array.from(getUserCandidateRefs(sess, accessContext));
  if (candidateRefs.length === 0) {
    return {
      canView: false,
      canEdit: false,
      canApprove: false,
      canManageCounts: false,
      canCount: false,
      isDirector: false,
      assignedCountIds: [],
    };
  }

  try {
    const res = await query(
      `SELECT DISTINCT cl.count_id
       FROM vaqf.inventory_count_locations cl
       JOIN vaqf.inventory_counts c ON c.id = cl.count_id
       WHERE c.status = 'in_progress'
         AND LOWER(COALESCE(cl.assignee_ref, '')) = ANY($1::text[])
       ORDER BY cl.count_id DESC`,
      [candidateRefs]
    );
    const assignedCountIds = res.rows.map((r) => Number(r.count_id));
    return {
      canView: false,
      canEdit: false,
      canApprove: false,
      canManageCounts: false,
      canCount: assignedCountIds.length > 0,
      isDirector: false,
      assignedCountIds,
    };
  } catch {
    return {
      canView: false,
      canEdit: false,
      canApprove: false,
      canManageCounts: false,
      canCount: false,
      isDirector: false,
      assignedCountIds: [],
    };
  }
}

/**
 * Checks whether an asset is currently locked by an `in_progress` inventory count.
 * Blocks changing location or quantity (or deleting) outside the count flow.
 */
export async function assertAssetNotLockedByActiveCount(assetId) {
  const res = await query(
    `SELECT c.id, c.code, c.title
     FROM vaqf.inventory_count_items i
     JOIN vaqf.inventory_counts c ON c.id = i.count_id
     WHERE i.asset_id = $1 AND c.status = 'in_progress'
     LIMIT 1`,
    [Number(assetId)]
  );
  if (res.rowCount > 0) {
    const c = res.rows[0];
    throw httpError(
      409,
      `Ushbu buyum hozirda davom etayotgan inventarizatsiya (${c.code} — "${c.title}") qamrovida. Sanoq yakunlangunga qadar uning joyini yoki miqdorini oddiy tahrirlab bo'lmaydi.`
    );
  }
}

// ============================================================================
// SCOPE EXPANSION & PREVIEW
// ============================================================================
async function expandLocationIds(institutionId, rawLocIds = []) {
  const cleanIds = (Array.isArray(rawLocIds) ? rawLocIds : [])
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x > 0);
  if (cleanIds.length === 0) return [];

  const allLocs = await listLocations({ institutionId });
  const childrenByParent = new Map();
  for (const l of allLocs) {
    const pid = l.parent_id ? Number(l.parent_id) : 0;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(Number(l.id));
  }

  const expanded = new Set();
  const queue = [...cleanIds];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (expanded.has(cur)) continue;
    expanded.add(cur);
    const kids = childrenByParent.get(cur) || [];
    for (const k of kids) {
      if (!expanded.has(k)) queue.push(k);
    }
  }
  return Array.from(expanded);
}

async function expandCategoryIds(rawCatIds = []) {
  const cleanIds = (Array.isArray(rawCatIds) ? rawCatIds : [])
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x > 0);
  if (cleanIds.length === 0) return [];

  const allCats = await listCategories();
  const childrenByParent = new Map();
  for (const c of allCats) {
    const pid = c.parent_id ? Number(c.parent_id) : 0;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(Number(c.id));
  }

  const expanded = new Set();
  const queue = [...cleanIds];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (expanded.has(cur)) continue;
    expanded.add(cur);
    const kids = childrenByParent.get(cur) || [];
    for (const k of kids) {
      if (!expanded.has(k)) queue.push(k);
    }
  }
  return Array.from(expanded);
}

export async function resolveAssetsAndLocationsInScope(institutionId, scope = {}) {
  const instId = Number(institutionId) || 1;
  const locIds = await expandLocationIds(instId, scope?.location_ids || []);
  const catIds = await expandCategoryIds(scope?.category_ids || []);

  const where = ["a.deleted_at IS NULL", "a.status != 'written_off'", "a.institution_id = $1"];
  const params = [instId];

  if (locIds.length > 0) {
    params.push(locIds);
    where.push(`a.location_id = ANY($${params.length}::int[])`);
  }
  if (catIds.length > 0) {
    params.push(catIds);
    where.push(`a.category_id = ANY($${params.length}::int[])`);
  }

  const assetsRes = await query(
    `SELECT
       a.id, a.inventory_no, a.name, a.category_id, c.name AS category_name,
       a.tracking, a.quantity::float AS quantity, a.unit,
       a.institution_id, a.location_id, l.name AS location_name, l.code AS location_code,
       a.status, a.condition, a.purchase_price::float AS purchase_price, a.currency
     FROM vaqf.assets a
     LEFT JOIN vaqf.asset_categories c ON c.id = a.category_id
     LEFT JOIN vaqf.locations l ON l.id = a.location_id
     WHERE ${where.join(" AND ")}
     ORDER BY a.location_id NULLS LAST, a.id ASC`,
    params
  );

  // Determine countable locations:
  // If specific locations were selected, include countable rooms/storages/outdoors among them + any location holding matched assets.
  const allLocs = await listLocations({ institutionId: instId });
  const locMap = new Map(allLocs.map((l) => [Number(l.id), l]));
  const countableLocIds = new Set();

  if (locIds.length > 0) {
    for (const lid of locIds) {
      const l = locMap.get(lid);
      if (l && (l.kind === "room" || l.kind === "storage" || l.kind === "outdoor")) {
        countableLocIds.add(lid);
      }
    }
    if (countableLocIds.size === 0) {
      for (const lid of locIds) {
        if (locMap.has(lid)) countableLocIds.add(lid);
      }
    }
  } else {
    // Whole institution: include all locations that currently have assets, or rooms/storages if none
    for (const a of assetsRes.rows) {
      if (a.location_id) countableLocIds.add(Number(a.location_id));
    }
    if (countableLocIds.size === 0) {
      for (const l of allLocs) {
        if (l.kind === "room" || l.kind === "storage" || l.kind === "outdoor") {
          countableLocIds.add(Number(l.id));
        }
      }
    }
  }

  for (const a of assetsRes.rows) {
    if (a.location_id) countableLocIds.add(Number(a.location_id));
  }

  const locations = Array.from(countableLocIds)
    .map((id) => locMap.get(id))
    .filter(Boolean)
    .map((l) => {
      const locAssets = assetsRes.rows.filter((a) => Number(a.location_id) === Number(l.id));
      return {
        location_id: Number(l.id),
        name: l.name,
        code: l.code,
        kind: l.kind,
        parent_id: l.parent_id,
        expected_cards: locAssets.length,
        expected_units: locAssets.reduce((s, a) => s + Number(a.quantity || 1), 0),
      };
    });

  return {
    institution_id: instId,
    expanded_location_ids: locIds,
    expanded_category_ids: catIds,
    asset_cards_count: assetsRes.rows.length,
    total_units_count: assetsRes.rows.reduce((s, a) => s + Number(a.quantity || 1), 0),
    locations,
    assets: assetsRes.rows,
  };
}

// ============================================================================
// CREATE / UPDATE / START COUNT
// ============================================================================
function normalizeScope(rawScope) {
  const s = rawScope && typeof rawScope === "object" ? rawScope : {};
  const locIds = Array.isArray(s.location_ids)
    ? s.location_ids.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0)
    : [];
  const catIds = Array.isArray(s.category_ids)
    ? s.category_ids.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0)
    : [];
  const type = locIds.length > 0 || catIds.length > 0 ? (s.type || "custom") : "all";
  return { type, location_ids: locIds, category_ids: catIds };
}

function normalizeCommittee(rawCommittee) {
  if (!Array.isArray(rawCommittee)) return [];
  return rawCommittee
    .map((m) => ({
      name: String(m?.name || "").trim().slice(0, 150),
      role: String(m?.role || m?.position || "Komissiya a'zosi").trim().slice(0, 120),
    }))
    .filter((m) => m.name.length > 0);
}

export async function createCount(body, actor) {
  const institutionId = Number(body.institution_id) || 1;
  const title = String(body.title || "").trim();
  if (!title) throw httpError(400, "Sanoq sarlavhasi (nomi) kiritilishi shart");
  if (title.length > 250) throw httpError(400, "Sanoq sarlavhasi juda uzun");

  const scope = normalizeScope(body.scope);
  const committee = normalizeCommittee(body.committee);
  const notes = body.notes ? String(body.notes).trim().slice(0, 2000) : null;

  const preview = await resolveAssetsAndLocationsInScope(institutionId, scope);

  // Merge user-supplied location assignments with resolved locations
  const suppliedLocs = Array.isArray(body.locations)
    ? body.locations
    : Array.isArray(body.assignments)
    ? body.assignments
    : [];
  const suppliedByLocId = new Map();
  for (const sl of suppliedLocs) {
    const lid = Number(sl?.location_id || sl?.locationId);
    if (Number.isInteger(lid) && lid > 0) {
      suppliedByLocId.set(lid, {
        location_id: lid,
        assignee_ref: sl.assignee_ref ? String(sl.assignee_ref).trim().slice(0, 100) : null,
        assignee_name: sl.assignee_name ? String(sl.assignee_name).trim().slice(0, 200) : null,
      });
    }
  }

  for (const pl of preview.locations) {
    if (!suppliedByLocId.has(pl.location_id)) {
      suppliedByLocId.set(pl.location_id, {
        location_id: pl.location_id,
        assignee_ref: body.default_assignee_ref ? String(body.default_assignee_ref).trim() : null,
        assignee_name: body.default_assignee_name ? String(body.default_assignee_name).trim() : null,
      });
    }
  }

  const createdId = await withTransaction(async (tx) => {
    const ins = await tx.query(
      `INSERT INTO vaqf.inventory_counts (
         institution_id, title, scope, status,
         created_by, created_by_ref, committee, notes
       ) VALUES ($1, $2, $3::jsonb, 'draft', $4, $5, $6::jsonb, $7)
       RETURNING id`,
      [
        institutionId,
        title,
        JSON.stringify(scope),
        actor?.actorName || "Direktor",
        actor?.actorId || null,
        JSON.stringify(committee),
        notes,
      ]
    );
    const countId = ins.rows[0].id;

    for (const loc of suppliedByLocId.values()) {
      await tx.query(
        `INSERT INTO vaqf.inventory_count_locations (
           count_id, location_id, assignee_ref, assignee_name, status
         ) VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (count_id, location_id) DO UPDATE
           SET assignee_ref = EXCLUDED.assignee_ref,
               assignee_name = EXCLUDED.assignee_name,
               updated_at = NOW()`,
        [countId, loc.location_id, loc.assignee_ref, loc.assignee_name]
      );
    }

    return countId;
  });

  if (body.start_immediately) {
    return startCount(createdId, actor);
  }
  return getCountDetail(createdId, { isDirector: true, canView: true });
}

export async function updateCount(countId, body, actor) {
  const cid = Number(countId);
  if (!Number.isInteger(cid) || cid <= 0) throw httpError(400, "Sanoq ID noto'g'ri");

  const curRes = await query(`SELECT * FROM vaqf.inventory_counts WHERE id = $1`, [cid]);
  const cur = curRes.rows[0];
  if (!cur) throw httpError(404, "Sanoq topilmadi");
  if (cur.status !== "draft") {
    throw httpError(400, "Faqat qoralama ('draft') holatidagi sanoqni tahrirlash mumkin");
  }

  const title = body.title !== undefined ? String(body.title).trim() : cur.title;
  if (!title) throw httpError(400, "Sanoq sarlavhasi bo'sh bo'lishi mumkin emas");
  const scope = body.scope !== undefined ? normalizeScope(body.scope) : cur.scope;
  const committee = body.committee !== undefined ? normalizeCommittee(body.committee) : cur.committee;
  const notes = body.notes !== undefined ? (body.notes ? String(body.notes).trim().slice(0, 2000) : null) : cur.notes;

  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE vaqf.inventory_counts
       SET title = $1, scope = $2::jsonb, committee = $3::jsonb, notes = $4, updated_at = NOW()
       WHERE id = $5`,
      [title, JSON.stringify(scope), JSON.stringify(committee), notes, cid]
    );

    if (Array.isArray(body.locations)) {
      await tx.query(`DELETE FROM vaqf.inventory_count_locations WHERE count_id = $1`, [cid]);
      for (const sl of body.locations) {
        const lid = Number(sl?.location_id || sl?.locationId);
        if (!Number.isInteger(lid) || lid <= 0) continue;
        await tx.query(
          `INSERT INTO vaqf.inventory_count_locations (
             count_id, location_id, assignee_ref, assignee_name, status
           ) VALUES ($1, $2, $3, $4, 'pending')
           ON CONFLICT (count_id, location_id) DO UPDATE
             SET assignee_ref = EXCLUDED.assignee_ref,
                 assignee_name = EXCLUDED.assignee_name`,
          [
            cid,
            lid,
            sl.assignee_ref ? String(sl.assignee_ref).trim().slice(0, 100) : null,
            sl.assignee_name ? String(sl.assignee_name).trim().slice(0, 200) : null,
          ]
        );
      }
    }
  });

  return getCountDetail(cid, { isDirector: true, canView: true });
}

export async function startCount(countId, actor) {
  const cid = Number(countId);
  if (!Number.isInteger(cid) || cid <= 0) throw httpError(400, "Sanoq ID noto'g'ri");

  const curRes = await query(`SELECT * FROM vaqf.inventory_counts WHERE id = $1`, [cid]);
  const cur = curRes.rows[0];
  if (!cur) throw httpError(404, "Sanoq topilmadi");
  if (cur.status === "approved") {
    throw httpError(400, "Tasdiqlangan sanoqni qayta boshlab bo'lmaydi");
  }
  if (cur.status !== "draft") {
    throw httpError(400, `Sanoq allaqachon '${cur.status}' holatida`);
  }

  // Check if another count is already in_progress for this institution
  const activeRes = await query(
    `SELECT id, code, title FROM vaqf.inventory_counts
     WHERE institution_id = $1 AND status = 'in_progress' AND id != $2
     LIMIT 1`,
    [cur.institution_id, cid]
  );
  if (activeRes.rowCount > 0) {
    const act = activeRes.rows[0];
    throw httpError(
      409,
      `Ushbu muassasada hozirda davom etayotgan sanoq mavjud (${act.code} — "${act.title}"). Bir vaqtda faqat bitta davom etayotgan sanoq bo'lishi mumkin.`
    );
  }

  const preview = await resolveAssetsAndLocationsInScope(cur.institution_id, cur.scope);

  // Also include any locations already explicitly configured in vaqf.inventory_count_locations
  const existingLocsRes = await query(
    `SELECT location_id, assignee_ref, assignee_name FROM vaqf.inventory_count_locations WHERE count_id = $1`,
    [cid]
  );
  const configuredLocIds = existingLocsRes.rows.map((r) => Number(r.location_id));

  let assetsToFreeze = preview.assets;
  if (
    (!cur.scope?.location_ids || cur.scope.location_ids.length === 0) &&
    configuredLocIds.length > 0 &&
    cur.scope?.type === "custom"
  ) {
    const subPreview = await resolveAssetsAndLocationsInScope(cur.institution_id, {
      ...cur.scope,
      location_ids: configuredLocIds,
    });
    assetsToFreeze = subPreview.assets;
  }

  await withTransaction(async (tx) => {
    // Ensure all asset locations are represented in inventory_count_locations
    const locSet = new Set(configuredLocIds);
    for (const pl of preview.locations) locSet.add(Number(pl.location_id));
    for (const a of assetsToFreeze) {
      if (a.location_id) locSet.add(Number(a.location_id));
    }

    for (const lid of locSet) {
      await tx.query(
        `INSERT INTO vaqf.inventory_count_locations (count_id, location_id, status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (count_id, location_id) DO NOTHING`,
        [cid, lid]
      );
    }

    // Clear any draft items and freeze current asset state
    await tx.query(`DELETE FROM vaqf.inventory_count_items WHERE count_id = $1`, [cid]);

    for (const a of assetsToFreeze) {
      await tx.query(
        `INSERT INTO vaqf.inventory_count_items (
           count_id, asset_id, expected_location_id, expected_qty,
           expected_status, expected_condition, result
         ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [
          cid,
          a.id,
          a.location_id || null,
          a.quantity ?? 1,
          a.status || "in_use",
          a.condition || "good",
        ]
      );
    }

    await tx.query(
      `UPDATE vaqf.inventory_counts
       SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [cid]
    );
  });

  return getCountDetail(cid, { isDirector: true, canView: true });
}

// ============================================================================
// LIST & DETAIL QUERIES
// ============================================================================
export async function listCounts(filters = {}, access = {}) {
  const where = ["1=1"];
  const params = [];

  if (filters.institution_id) {
    params.push(Number(filters.institution_id));
    where.push(`c.institution_id = $${params.length}`);
  }
  if (filters.status && VALID_COUNT_STATUSES.includes(filters.status)) {
    params.push(filters.status);
    where.push(`c.status = $${params.length}`);
  }
  if (!access.canView && access.canCount) {
    const ids = Array.isArray(access.assignedCountIds) ? access.assignedCountIds : [];
    if (ids.length === 0) return [];
    params.push(ids);
    where.push(`c.id = ANY($${params.length}::int[])`);
  }

  const res = await query(
    `SELECT
       c.*,
       inst.name AS institution_name,
       inst.code AS institution_code,
       (SELECT COUNT(*)::int FROM vaqf.inventory_count_locations cl WHERE cl.count_id = c.id) AS total_locations,
       (SELECT COUNT(*)::int FROM vaqf.inventory_count_locations cl WHERE cl.count_id = c.id AND cl.status = 'done') AS done_locations,
       (SELECT COUNT(*)::int FROM vaqf.inventory_count_items ci WHERE ci.count_id = c.id AND ci.asset_id IS NOT NULL) AS expected_items,
       (SELECT COUNT(*)::int FROM vaqf.inventory_count_items ci WHERE ci.count_id = c.id AND ci.asset_id IS NOT NULL AND ci.result != 'pending') AS processed_items,
       (SELECT COUNT(*)::int FROM vaqf.inventory_count_items ci WHERE ci.count_id = c.id AND ci.scanned_at IS NOT NULL) AS scanned_items,
       (SELECT COUNT(*)::int FROM vaqf.inventory_count_items ci WHERE ci.count_id = c.id AND ci.result IN ('missing','moved','extra','qty_diff','damaged')) AS discrepancy_count
     FROM vaqf.inventory_counts c
     JOIN vaqf.institutions inst ON inst.id = c.institution_id
     WHERE ${where.join(" AND ")}
     ORDER BY c.id DESC`,
    params
  );

  return res.rows.map((r) => {
    const exp = Number(r.expected_items || 0);
    const proc = Number(r.processed_items || 0);
    const totLoc = Number(r.total_locations || 0);
    const doneLoc = Number(r.done_locations || 0);
    const progressPct =
      r.status === "approved"
        ? 100
        : exp > 0
        ? Math.min(100, Math.round((proc / exp) * 100))
        : totLoc > 0
        ? Math.min(100, Math.round((doneLoc / totLoc) * 100))
        : 0;
    return {
      ...r,
      progress_pct: progressPct,
    };
  });
}

const COUNT_ITEM_SELECT_SQL = `
  SELECT
    ci.id,
    ci.count_id,
    ci.asset_id,
    a.inventory_no,
    COALESCE(a.name, ci.extra_data->>'name', 'Noma''lum buyum') AS asset_name,
    COALESCE(a.category_id, (ci.extra_data->>'category_id')::int) AS category_id,
    COALESCE(cat.name, ci.extra_data->>'category_name', 'Boshqa') AS category_name,
    COALESCE(a.tracking, ci.extra_data->>'tracking', 'individual') AS tracking,
    COALESCE(a.unit, ci.extra_data->>'unit', 'dona') AS unit,
    a.brand,
    a.model,
    a.serial_no,
    a.purchase_price::float AS purchase_price,
    COALESCE(a.currency, 'TRY') AS currency,
    ci.expected_location_id,
    el.name AS expected_location_name,
    el.code AS expected_location_code,
    ci.expected_qty::float AS expected_qty,
    ci.expected_status,
    ci.expected_condition,
    ci.found_location_id,
    fl.name AS found_location_name,
    fl.code AS found_location_code,
    ci.counted_qty::float AS counted_qty,
    ci.condition,
    ci.photo_path,
    ci.note,
    ci.result,
    ci.scanned_by,
    ci.scanned_by_ref,
    ci.scanned_at,
    ci.client_scan_id,
    ci.needs_relabel,
    ci.extra_data,
    ci.created_asset_id,
    ca.inventory_no AS created_inventory_no,
    ci.decision,
    ci.decision_note,
    ci.created_at,
    ci.updated_at
  FROM vaqf.inventory_count_items ci
  LEFT JOIN vaqf.assets a ON a.id = ci.asset_id
  LEFT JOIN vaqf.asset_categories cat ON cat.id = COALESCE(a.category_id, (ci.extra_data->>'category_id')::int)
  LEFT JOIN vaqf.locations el ON el.id = ci.expected_location_id
  LEFT JOIN vaqf.locations fl ON fl.id = ci.found_location_id
  LEFT JOIN vaqf.assets ca ON ca.id = ci.created_asset_id
`;

export async function getCountDetail(countId, access = {}) {
  const cid = Number(countId);
  if (!Number.isInteger(cid) || cid <= 0) throw httpError(400, "Sanoq ID noto'g'ri");

  const cRes = await query(
    `SELECT c.*, inst.name AS institution_name, inst.code AS institution_code
     FROM vaqf.inventory_counts c
     JOIN vaqf.institutions inst ON inst.id = c.institution_id
     WHERE c.id = $1`,
    [cid]
  );
  const count = cRes.rows[0];
  if (!count) throw httpError(404, "Sanoq topilmadi");

  if (!access.canView && access.canCount) {
    const ids = Array.isArray(access.assignedCountIds) ? access.assignedCountIds : [];
    if (!ids.includes(cid)) {
      throw httpError(403, "Siz ushbu sanoqqa biriktirilmagansiz");
    }
  }

  const [locsRes, itemsRes] = await Promise.all([
    query(
      `SELECT
         cl.*,
         l.name AS location_name,
         l.code AS location_code,
         l.kind AS location_kind,
         l.parent_id AS location_parent_id,
         lp.name AS parent_location_name
       FROM vaqf.inventory_count_locations cl
       JOIN vaqf.locations l ON l.id = cl.location_id
       LEFT JOIN vaqf.locations lp ON lp.id = l.parent_id
       WHERE cl.count_id = $1
       ORDER BY l.sort_order ASC, l.name ASC`,
      [cid]
    ),
    query(
      `${COUNT_ITEM_SELECT_SQL}
       WHERE ci.count_id = $1
       ORDER BY ci.id ASC`,
      [cid]
    ),
  ]);

  const items = itemsRes.rows.map((it) => ({
    ...it,
    photo_url: it.photo_path ? `/vaqf-api/counts/${cid}/items/${it.id}/photo` : null,
  }));

  const locations = locsRes.rows.map((loc) => {
    const lid = Number(loc.location_id);
    const expectedHere = items.filter((i) => i.asset_id !== null && Number(i.expected_location_id) === lid);
    const processedHere = expectedHere.filter((i) => i.result !== "pending");
    const foundHere = items.filter(
      (i) => Number(i.found_location_id) === lid && (i.result === "found" || i.result === "qty_diff" || i.result === "damaged")
    );
    const movedHere = items.filter((i) => Number(i.found_location_id) === lid && i.result === "moved");
    const missingHere = expectedHere.filter((i) => i.result === "missing");
    const extraHere = items.filter((i) => Number(i.found_location_id) === lid && i.result === "extra");

    const expCnt = expectedHere.length;
    const procCnt = processedHere.length;
    const progressPct =
      loc.status === "done"
        ? 100
        : expCnt > 0
        ? Math.min(100, Math.round((procCnt / expCnt) * 100))
        : foundHere.length + extraHere.length > 0
        ? 50
        : 0;

    return {
      ...loc,
      expected_count: expCnt,
      processed_count: procCnt,
      pending_count: expectedHere.filter((i) => i.result === "pending").length,
      found_count: foundHere.length,
      moved_count: movedHere.length,
      missing_count: missingHere.length,
      extra_count: extraHere.length,
      progress_pct: progressPct,
    };
  });

  // Compute overall summary
  const expectedItems = items.filter((i) => i.asset_id !== null);
  const calcValue = (arr, curr, useCounted = false) =>
    arr.reduce((sum, i) => {
      if ((i.currency || "TRY") !== curr) return sum;
      const price = Number(i.purchase_price || 0);
      const qty = useCounted
        ? Number(i.counted_qty ?? i.expected_qty ?? 1)
        : Number(i.expected_qty ?? 1);
      return sum + price * qty;
    }, 0);

  const foundArr = items.filter((i) => i.result === "found");
  const movedArr = items.filter((i) => i.result === "moved");
  const missingArr = items.filter((i) => i.result === "missing");
  const extraArr = items.filter((i) => i.result === "extra");
  const qtyDiffArr = items.filter((i) => i.result === "qty_diff");
  const damagedArr = items.filter((i) => i.result === "damaged");
  const pendingArr = items.filter((i) => i.result === "pending");
  const presentArr = items.filter((i) => ["found", "moved", "qty_diff", "damaged"].includes(i.result));
  const discrepanciesArr = items.filter((i) => DISCREPANCY_RESULTS.includes(i.result));

  const totalExpected = expectedItems.length;
  const totalProcessed = expectedItems.filter((i) => i.result !== "pending").length;
  const overallPct =
    count.status === "approved"
      ? 100
      : totalExpected > 0
      ? Math.min(100, Math.round((totalProcessed / totalExpected) * 100))
      : locations.length > 0
      ? Math.round((locations.filter((l) => l.status === "done").length / locations.length) * 100)
      : 0;

  const summary = {
    expected_cards: totalExpected,
    expected_units: expectedItems.reduce((s, i) => s + Number(i.expected_qty || 1), 0),
    expected_value_try: Number(calcValue(expectedItems, "TRY", false).toFixed(2)),
    expected_value_usd: Number(calcValue(expectedItems, "USD", false).toFixed(2)),

    pending_cards: pendingArr.length,
    found_cards: foundArr.length,
    moved_cards: movedArr.length,
    missing_cards: missingArr.length,
    extra_cards: extraArr.length,
    qty_diff_cards: qtyDiffArr.length,
    damaged_cards: damagedArr.length,

    present_cards: presentArr.length,
    present_units: presentArr.reduce((s, i) => s + Number(i.counted_qty ?? i.expected_qty ?? 1), 0),
    present_value_try: Number(calcValue(presentArr, "TRY", true).toFixed(2)),
    present_value_usd: Number(calcValue(presentArr, "USD", true).toFixed(2)),

    missing_value_try: Number(calcValue(missingArr, "TRY", false).toFixed(2)),
    missing_value_usd: Number(calcValue(missingArr, "USD", false).toFixed(2)),

    discrepancy_count: discrepanciesArr.length,
    undecided_discrepancy_count: discrepanciesArr.filter((i) => !i.decision).length,
    locations_total: locations.length,
    locations_done: locations.filter((l) => l.status === "done").length,
    locations_counting: locations.filter((l) => l.status === "counting").length,
    locations_pending: locations.filter((l) => l.status === "pending").length,
    progress_pct: overallPct,
  };

  return {
    count: {
      ...count,
      progress_pct: overallPct,
    },
    summary,
    locations,
    items,
  };
}

// ============================================================================
// MOBILE SCANNER: MY ASSIGNED LOCATIONS & OFFLINE CATALOG
// ============================================================================
export async function getMyCountData(countId, sess, accessContext, access) {
  const cid = Number(countId);
  const detail = await getCountDetail(cid, access);

  if (!access.isDirector && detail.count.status !== "in_progress") {
    throw httpError(403, "Sanoq hozirda faol emas (faqat davom etayotgan sanoqda skanerlash mumkin)");
  }

  const candidateRefs = getUserCandidateRefs(sess, accessContext);
  const myLocations = access.isDirector
    ? detail.locations
    : detail.locations.filter(
        (l) => l.assignee_ref && candidateRefs.has(String(l.assignee_ref).trim().toLowerCase())
      );

  if (!access.isDirector && myLocations.length === 0) {
    throw httpError(403, "Sizga ushbu sanoqda hech qanday joy (xona) biriktirilmagan");
  }

  const myLocIds = new Set(myLocations.map((l) => Number(l.location_id)));

  // All expected items in user's assigned locations OR already scanned into user's assigned locations
  const myItems = detail.items.filter(
    (it) =>
      myLocIds.has(Number(it.expected_location_id)) ||
      myLocIds.has(Number(it.found_location_id))
  );

  // Full institution catalog for instant offline lookup on mobile device
  const allAssetsRes = await query(
    `SELECT
       a.id,
       a.inventory_no,
       a.name,
       a.category_id,
       c.name AS category_name,
       a.tracking,
       a.quantity::float AS quantity,
       a.unit,
       a.location_id AS expected_location_id,
       l.name AS expected_location_name,
       l.code AS expected_location_code,
       a.status,
       a.condition
     FROM vaqf.assets a
     LEFT JOIN vaqf.asset_categories c ON c.id = a.category_id
     LEFT JOIN vaqf.locations l ON l.id = a.location_id
     WHERE a.deleted_at IS NULL AND a.institution_id = $1
     ORDER BY a.id ASC`,
    [detail.count.institution_id]
  );

  const itemByAssetId = new Map();
  for (const it of detail.items) {
    if (it.asset_id) itemByAssetId.set(Number(it.asset_id), it);
  }

  const catalogAssets = allAssetsRes.rows.map((a) => {
    const ci = itemByAssetId.get(Number(a.id));
    return {
      ...a,
      in_scope: Boolean(ci),
      count_item_id: ci ? ci.id : null,
      expected_location_id: ci ? ci.expected_location_id : a.expected_location_id,
      expected_qty: ci ? ci.expected_qty : a.quantity,
      result: ci ? ci.result : null,
      found_location_id: ci ? ci.found_location_id : null,
      counted_qty: ci ? ci.counted_qty : null,
      scanned_at: ci ? ci.scanned_at : null,
    };
  });

  const categories = await listCategories();

  return {
    count: detail.count,
    summary: detail.summary,
    myLocations,
    myItems,
    catalogAssets,
    categories,
  };
}

// ============================================================================
// PERMISSION CHECK FOR SCANNING AT A LOCATION
// ============================================================================
async function assertCanCountAtLocation(countId, locationId, sess, accessContext, access) {
  const cid = Number(countId);
  const lid = Number(locationId);
  if (!Number.isInteger(cid) || cid <= 0) throw httpError(400, "Sanoq ID noto'g'ri");
  if (!Number.isInteger(lid) || lid <= 0) throw httpError(400, "Joy (xona) ID tanlanmagan");

  const cRes = await query(`SELECT id, status, institution_id FROM vaqf.inventory_counts WHERE id = $1`, [cid]);
  const count = cRes.rows[0];
  if (!count) throw httpError(404, "Sanoq topilmadi");
  if (count.status === "approved") {
    throw httpError(400, "Tasdiqlangan sanoqni o'zgartirib bo'lmaydi");
  }
  if (count.status !== "in_progress") {
    throw httpError(400, "Sanoq hozirda davom etmayapti ('in_progress' holatida emas)");
  }

  const locRes = await query(
    `SELECT cl.*, l.name AS location_name
     FROM vaqf.inventory_count_locations cl
     JOIN vaqf.locations l ON l.id = cl.location_id
     WHERE cl.count_id = $1 AND cl.location_id = $2`,
    [cid, lid]
  );
  const countLoc = locRes.rows[0];
  if (!countLoc) {
    throw httpError(403, "Ushbu joy (xona) mazkur sanoq qamroviga kiritilmagan");
  }

  if (!access.isDirector) {
    const candidateRefs = getUserCandidateRefs(sess, accessContext);
    const assignedRef = String(countLoc.assignee_ref || "").trim().toLowerCase();
    if (!assignedRef || !candidateRefs.has(assignedRef)) {
      throw httpError(403, `Sizga "${countLoc.location_name}" joyida sanoq o'tkazish huquqi berilmagan`);
    }
  }

  return { count, countLoc };
}

async function saveOptionalScanPhoto(countId, itemIdOrTag, photoDataUrl) {
  if (!photoDataUrl) return null;
  const str = String(photoDataUrl).trim();
  const m = str.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const base64 = m ? m[2] : str;
  const buf = Buffer.from(base64, "base64");
  if (buf.length === 0 || buf.length > 10 * 1024 * 1024) return null;
  const ext = m && m[1].includes("png") ? ".png" : ".jpg";
  const fileName = `count_${countId}_${itemIdOrTag}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}${ext}`;
  const fullPath = path.join(PHOTOS_DIR, fileName);
  await fsp.writeFile(fullPath, buf, { mode: 0o640 });
  return fullPath;
}

// ============================================================================
// BATCH SCANS ENDPOINT (POST /vaqf-api/counts/:id/scans)
// ============================================================================
export async function processCountScans(countId, body, sess, accessContext, access) {
  const cid = Number(countId);
  const scansInput = Array.isArray(body) ? body : Array.isArray(body?.scans) ? body.scans : [];
  if (scansInput.length === 0) {
    throw httpError(400, "Skaner ma'lumotlari bo'sh");
  }

  const actor = getActor(sess, accessContext);
  const results = [];

  for (const rawScan of scansInput) {
    const locationId = Number(rawScan.locationId || rawScan.location_id);
    // Validate permission for this location (throws 403 if unauthorized!)
    await assertCanCountAtLocation(cid, locationId, sess, accessContext, access);

    const clientScanId = rawScan.clientScanId
      ? String(rawScan.clientScanId).trim().slice(0, 120)
      : null;

    // 1. Check idempotency by clientScanId
    if (clientScanId) {
      const dupRes = await query(
        `${COUNT_ITEM_SELECT_SQL} WHERE ci.client_scan_id = $1 LIMIT 1`,
        [clientScanId]
      );
      if (dupRes.rowCount > 0) {
        const existing = dupRes.rows[0];
        results.push({
          clientScanId,
          scanStatus: "already_scanned",
          idempotent: true,
          result: existing.result,
          item: existing,
        });
        continue;
      }
    }

    // 2. Resolve asset by assetId or inventoryNo
    const rawAssetId = rawScan.assetId || rawScan.asset_id;
    let rawInvNo = rawScan.inventoryNo || rawScan.inventory_no || rawScan.code || "";
    // Support full URL QR codes like https://domain/vaqf/a/EV-MZN-000001
    const urlMatch = String(rawInvNo).match(/\/vaqf\/a\/([^/?#\s]+)/i);
    if (urlMatch) {
      rawInvNo = decodeURIComponent(urlMatch[1]);
    }
    rawInvNo = String(rawInvNo).trim().toUpperCase();

    let asset = null;
    if (rawAssetId && Number.isInteger(Number(rawAssetId)) && Number(rawAssetId) > 0) {
      const aRes = await query(
        `SELECT * FROM vaqf.assets WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        [Number(rawAssetId)]
      );
      asset = aRes.rows[0] || null;
    } else if (rawInvNo) {
      const aRes = await query(
        `SELECT * FROM vaqf.assets WHERE UPPER(inventory_no) = $1 AND deleted_at IS NULL LIMIT 1`,
        [rawInvNo]
      );
      asset = aRes.rows[0] || null;
    }

    if (!asset) {
      results.push({
        clientScanId,
        scanStatus: "unknown_code",
        inventoryNo: rawInvNo || null,
        locationId,
      });
      continue;
    }

    // 3. Look up count item row for this asset
    const ciRes = await query(
      `SELECT * FROM vaqf.inventory_count_items WHERE count_id = $1 AND asset_id = $2 LIMIT 1`,
      [cid, asset.id]
    );
    const ci = ciRes.rows[0];
    if (!ci) {
      results.push({
        clientScanId,
        scanStatus: "out_of_scope",
        inventoryNo: asset.inventory_no,
        asset: {
          id: asset.id,
          inventory_no: asset.inventory_no,
          name: asset.name,
          location_id: asset.location_id,
        },
      });
      continue;
    }

    // 4. If already scanned and not explicitly updating
    if (ci.result !== "pending" && ci.scanned_at !== null && !rawScan.updateExisting) {
      const fullRes = await query(`${COUNT_ITEM_SELECT_SQL} WHERE ci.id = $1`, [ci.id]);
      results.push({
        clientScanId,
        scanStatus: "already_scanned",
        result: ci.result,
        item: fullRes.rows[0],
      });
      continue;
    }

    // 5. Compute result classification
    const expectedQty = Number(ci.expected_qty ?? asset.quantity ?? 1);
    const countedQty =
      rawScan.countedQty !== undefined && rawScan.countedQty !== null && rawScan.countedQty !== ""
        ? Number(rawScan.countedQty)
        : expectedQty;
    if (!Number.isFinite(countedQty) || countedQty < 0) {
      throw httpError(400, "Sanalgan miqdor manfiy bo'lishi mumkin emas");
    }

    const condition =
      rawScan.condition && VALID_ITEM_CONDITIONS.includes(rawScan.condition)
        ? rawScan.condition
        : ci.condition || asset.condition || "good";

    const isMoved =
      ci.expected_location_id !== null && Number(locationId) !== Number(ci.expected_location_id);
    const isQtyDiff = Math.abs(countedQty - expectedQty) > 0.001;
    const isDamaged = condition === "damaged";

    let itemResult = "found";
    if (isDamaged) itemResult = "damaged";
    else if (isMoved) itemResult = "moved";
    else if (isQtyDiff) itemResult = "qty_diff";

    const scanStatus = isMoved ? "moved" : "found";
    const note = rawScan.note !== undefined ? String(rawScan.note || "").trim().slice(0, 1000) || null : ci.note;
    const needsRelabel = Boolean(rawScan.needsRelabel ?? rawScan.needs_relabel ?? ci.needs_relabel);
    const scannedAt = rawScan.scannedAt ? new Date(rawScan.scannedAt) : new Date();
    const validScannedAt = Number.isNaN(scannedAt.getTime()) ? new Date() : scannedAt;

    let photoPath = ci.photo_path;
    if (rawScan.photoDataUrl || rawScan.photo_data_url) {
      const savedPhoto = await saveOptionalScanPhoto(
        cid,
        `item_${ci.id}`,
        rawScan.photoDataUrl || rawScan.photo_data_url
      );
      if (savedPhoto) photoPath = savedPhoto;
    }

    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE vaqf.inventory_count_items
         SET found_location_id = $1,
             counted_qty = $2,
             condition = $3,
             photo_path = $4,
             note = $5,
             result = $6,
             scanned_by = $7,
             scanned_by_ref = $8,
             scanned_at = $9,
             client_scan_id = COALESCE($10, client_scan_id),
             needs_relabel = $11,
             updated_at = NOW()
         WHERE id = $12`,
        [
          locationId,
          countedQty,
          condition,
          photoPath,
          note,
          itemResult,
          actor.actorName,
          actor.actorId,
          validScannedAt.toISOString(),
          clientScanId,
          needsRelabel,
          ci.id,
        ]
      );

      await tx.query(
        `UPDATE vaqf.inventory_count_locations
         SET status = CASE WHEN status = 'pending' THEN 'counting' ELSE status END,
             updated_at = NOW()
         WHERE count_id = $1 AND location_id = $2`,
        [cid, locationId]
      );
    });

    const updatedRes = await query(`${COUNT_ITEM_SELECT_SQL} WHERE ci.id = $1`, [ci.id]);
    results.push({
      clientScanId,
      scanStatus,
      result: itemResult,
      item: updatedRes.rows[0],
    });
  }

  return { results };
}

// ============================================================================
// PHOTO UPLOAD FOR COUNT ITEM & EXTRA ITEM CREATION
// ============================================================================
export async function uploadCountItemPhoto(countId, itemId, body, sess, accessContext, access) {
  const cid = Number(countId);
  const iid = Number(itemId);
  const ciRes = await query(`SELECT * FROM vaqf.inventory_count_items WHERE id = $1 AND count_id = $2`, [iid, cid]);
  const ci = ciRes.rows[0];
  if (!ci) throw httpError(404, "Sanoq qatori topilmadi");

  const locId = ci.found_location_id || ci.expected_location_id;
  if (locId) {
    await assertCanCountAtLocation(cid, locId, sess, accessContext, access);
  }

  const dataUrl = body.dataUrl || body.photoDataUrl || body.photo_data_url || body.base64;
  if (!dataUrl) throw httpError(400, "Rasm ma'lumoti yuborilmadi");

  const savedPath = await saveOptionalScanPhoto(cid, `item_${iid}`, dataUrl);
  if (!savedPath) throw httpError(400, "Rasmni saqlab bo'lmadi");

  await query(
    `UPDATE vaqf.inventory_count_items SET photo_path = $1, updated_at = NOW() WHERE id = $2`,
    [savedPath, iid]
  );

  const updated = await query(`${COUNT_ITEM_SELECT_SQL} WHERE ci.id = $1`, [iid]);
  return {
    ...updated.rows[0],
    photo_url: `/vaqf-api/counts/${cid}/items/${iid}/photo`,
  };
}

export async function getCountItemPhotoFile(countId, itemId) {
  const res = await query(
    `SELECT photo_path FROM vaqf.inventory_count_items WHERE count_id = $1 AND id = $2`,
    [Number(countId), Number(itemId)]
  );
  const row = res.rows[0];
  if (!row || !row.photo_path || !fs.existsSync(row.photo_path)) {
    throw httpError(404, "Rasm topilmadi");
  }
  return row.photo_path;
}

export async function addExtraCountItem(countId, body, sess, accessContext, access) {
  const cid = Number(countId);
  const locationId = Number(body.location_id || body.locationId);
  await assertCanCountAtLocation(cid, locationId, sess, accessContext, access);

  const clientScanId = body.clientScanId || body.client_scan_id
    ? String(body.clientScanId || body.client_scan_id).trim().slice(0, 120)
    : null;

  if (clientScanId) {
    const dupRes = await query(`${COUNT_ITEM_SELECT_SQL} WHERE ci.client_scan_id = $1 LIMIT 1`, [clientScanId]);
    if (dupRes.rowCount > 0) {
      return dupRes.rows[0];
    }
  }

  const name = String(body.name || "").trim();
  if (!name) throw httpError(400, "Yangi topilgan buyum nomini kiriting");

  const categoryId = Number(body.category_id || body.categoryId) || 1;
  const catRes = await query(`SELECT id, name, tracking, default_unit FROM vaqf.asset_categories WHERE id = $1`, [categoryId]);
  const cat = catRes.rows[0] || { id: 1, name: "Boshqa", tracking: "individual", default_unit: "dona" };

  const countedQty = Number(body.counted_qty ?? body.countedQty ?? body.quantity ?? 1);
  if (!Number.isFinite(countedQty) || countedQty <= 0) {
    throw httpError(400, "Buyum miqdori musbat son bo'lishi kerak");
  }

  const condition = body.condition && VALID_ITEM_CONDITIONS.includes(body.condition) ? body.condition : "good";
  const note = body.note ? String(body.note).trim().slice(0, 1000) : null;
  const actor = getActor(sess, accessContext);

  let photoPath = null;
  if (body.photoDataUrl || body.photo_data_url || body.dataUrl) {
    photoPath = await saveOptionalScanPhoto(
      cid,
      "extra",
      body.photoDataUrl || body.photo_data_url || body.dataUrl
    );
  }

  const extraData = {
    name,
    category_id: cat.id,
    category_name: cat.name,
    tracking: body.tracking === "batch" || countedQty > 1 ? "batch" : cat.tracking,
    unit: String(body.unit || cat.default_unit || "dona").trim(),
    brand: body.brand ? String(body.brand).trim() : null,
    model: body.model ? String(body.model).trim() : null,
    serial_no: body.serial_no ? String(body.serial_no).trim() : null,
    scanned_code: body.scanned_code || body.inventoryNo || null,
  };

  const insRes = await withTransaction(async (tx) => {
    const ins = await tx.query(
      `INSERT INTO vaqf.inventory_count_items (
         count_id, asset_id, found_location_id, counted_qty,
         condition, photo_path, note, result,
         scanned_by, scanned_by_ref, scanned_at, client_scan_id, extra_data
       ) VALUES ($1, NULL, $2, $3, $4, $5, $6, 'extra', $7, $8, NOW(), $9, $10::jsonb)
       RETURNING id`,
      [
        cid,
        locationId,
        countedQty,
        condition,
        photoPath,
        note,
        actor.actorName,
        actor.actorId,
        clientScanId,
        JSON.stringify(extraData),
      ]
    );

    await tx.query(
      `UPDATE vaqf.inventory_count_locations
       SET status = CASE WHEN status = 'pending' THEN 'counting' ELSE status END,
           updated_at = NOW()
       WHERE count_id = $1 AND location_id = $2`,
      [cid, locationId]
    );

    return ins.rows[0].id;
  });

  const fullRes = await query(`${COUNT_ITEM_SELECT_SQL} WHERE ci.id = $1`, [insRes]);
  return fullRes.rows[0];
}

// ============================================================================
// FINISH LOCATION & SUBMIT COUNT FOR REVIEW
// ============================================================================
export async function markCountLocationDone(countId, locationId, sess, accessContext, access) {
  const cid = Number(countId);
  const lid = Number(locationId);
  await assertCanCountAtLocation(cid, lid, sess, accessContext, access);
  const actor = getActor(sess, accessContext);

  const stats = await withTransaction(async (tx) => {
    const updMissing = await tx.query(
      `UPDATE vaqf.inventory_count_items
       SET result = 'missing', updated_at = NOW()
       WHERE count_id = $1
         AND expected_location_id = $2
         AND result = 'pending'
       RETURNING id`,
      [cid, lid]
    );

    await tx.query(
      `UPDATE vaqf.inventory_count_locations
       SET status = 'done', done_at = NOW(), done_by = $1, updated_at = NOW()
       WHERE count_id = $2 AND location_id = $3`,
      [actor.actorName, cid, lid]
    );

    return { markedMissingCount: updMissing.rowCount };
  });

  return {
    ok: true,
    count_id: cid,
    location_id: lid,
    status: "done",
    ...stats,
  };
}

export async function submitCountForReview(countId, actor) {
  const cid = Number(countId);
  const cRes = await query(`SELECT * FROM vaqf.inventory_counts WHERE id = $1`, [cid]);
  const count = cRes.rows[0];
  if (!count) throw httpError(404, "Sanoq topilmadi");
  if (count.status === "approved") {
    throw httpError(400, "Tasdiqlangan sanoqni o'zgartirib bo'lmaydi");
  }
  if (count.status !== "in_progress") {
    throw httpError(400, "Faqat davom etayotgan ('in_progress') sanoqni ko'rib chiqishga yuborish mumkin");
  }

  const locsRes = await query(
    `SELECT cl.*, l.name AS location_name, l.code AS location_code
     FROM vaqf.inventory_count_locations cl
     JOIN vaqf.locations l ON l.id = cl.location_id
     WHERE cl.count_id = $1
     ORDER BY l.name ASC`,
    [cid]
  );

  const pendingLocations = locsRes.rows.filter((l) => l.status !== "done");
  if (pendingLocations.length > 0) {
    throw httpError(
      400,
      `Sanoqni yakunlash uchun barcha joylar 'done' bo'lishi shart. Hali tugallanmagan joylar: ${pendingLocations.map((l) => l.location_name).join(", ")}`,
      { pendingLocations }
    );
  }

  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE vaqf.inventory_count_items
       SET result = 'missing', updated_at = NOW()
       WHERE count_id = $1 AND result = 'pending'`,
      [cid]
    );
    await tx.query(
      `UPDATE vaqf.inventory_counts
       SET status = 'review', submitted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [cid]
    );
  });

  return getCountDetail(cid, { isDirector: true, canView: true });
}

// ============================================================================
// DISCREPANCIES, DECISIONS & ATOMIC APPROVAL
// ============================================================================
export async function getCountDiscrepancies(countId) {
  const cid = Number(countId);
  const detail = await getCountDetail(cid, { isDirector: true, canView: true });
  const discrepancies = detail.items.filter((i) => DISCREPANCY_RESULTS.includes(i.result));

  return {
    count: detail.count,
    summary: detail.summary,
    items: discrepancies,
    grouped: {
      missing: discrepancies.filter((i) => i.result === "missing"),
      moved: discrepancies.filter((i) => i.result === "moved"),
      extra: discrepancies.filter((i) => i.result === "extra"),
      qty_diff: discrepancies.filter((i) => i.result === "qty_diff"),
      damaged: discrepancies.filter((i) => i.result === "damaged"),
    },
  };
}

export async function setCountDecisions(countId, itemIdOrBatch, body) {
  const cid = Number(countId);
  const cRes = await query(`SELECT id, status FROM vaqf.inventory_counts WHERE id = $1`, [cid]);
  const count = cRes.rows[0];
  if (!count) throw httpError(404, "Sanoq topilmadi");
  if (count.status === "approved") {
    throw httpError(400, "Tasdiqlangan sanoqni o'zgartirib bo'lmaydi");
  }
  if (count.status === "cancelled") {
    throw httpError(400, "Bekor qilingan sanoqni o'zgartirib bo'lmaydi");
  }

  // Support both single itemId and batch array (`{ itemIds: [...], decision, decision_note }` or `{ decisions: [{ itemId, decision, decision_note }] }`)
  const updates = [];
  if (Array.isArray(body?.decisions)) {
    for (const d of body.decisions) {
      updates.push({
        itemId: Number(d.itemId || d.id),
        decision: d.decision,
        decisionNote: d.decision_note ?? d.decisionNote ?? null,
      });
    }
  } else if (Array.isArray(body?.itemIds) || Array.isArray(body?.item_ids)) {
    const ids = body.itemIds || body.item_ids;
    for (const id of ids) {
      updates.push({
        itemId: Number(id),
        decision: body.decision,
        decisionNote: body.decision_note ?? body.decisionNote ?? null,
      });
    }
  } else {
    updates.push({
      itemId: Number(itemIdOrBatch),
      decision: body.decision,
      decisionNote: body.decision_note ?? body.decisionNote ?? null,
    });
  }

  if (updates.length === 0) {
    throw httpError(400, "Qaror beriladigan qatorlar tanlanmagan");
  }

  for (const u of updates) {
    if (!Number.isInteger(u.itemId) || u.itemId <= 0) {
      throw httpError(400, "Qator ID noto'g'ri");
    }
    if (u.decision !== null && !VALID_DECISIONS.includes(u.decision)) {
      throw httpError(400, `Noto'g'ri qaror qiymati: '${u.decision}' (apply | mark_missing | ignore bo'lishi kerak)`);
    }
  }

  await withTransaction(async (tx) => {
    for (const u of updates) {
      const note = u.decisionNote ? String(u.decisionNote).trim().slice(0, 500) : null;
      const upd = await tx.query(
        `UPDATE vaqf.inventory_count_items
         SET decision = $1, decision_note = COALESCE($2, decision_note), updated_at = NOW()
         WHERE id = $3 AND count_id = $4
         RETURNING id`,
        [u.decision, note, u.itemId, cid]
      );
      if (upd.rowCount === 0) {
        throw httpError(404, `Sanoq qatori topilmadi (ID: ${u.itemId})`);
      }
    }
  });

  return getCountDiscrepancies(cid);
}

export async function approveCount(countId, body, actor) {
  const cid = Number(countId);
  const cRes = await query(
    `SELECT c.*, inst.code AS institution_code
     FROM vaqf.inventory_counts c
     JOIN vaqf.institutions inst ON inst.id = c.institution_id
     WHERE c.id = $1`,
    [cid]
  );
  const count = cRes.rows[0];
  if (!count) throw httpError(404, "Sanoq topilmadi");
  if (count.status === "approved") {
    throw httpError(400, "Ushbu sanoq allaqachon tasdiqlangan");
  }
  if (count.status === "cancelled") {
    throw httpError(400, "Bekor qilingan sanoqni tasdiqlab bo'lmaydi");
  }
  if (count.status === "draft") {
    throw httpError(400, "Hali boshlanmagan qoralamani tasdiqlab bo'lmaydi");
  }

  // Ensure no pending locations remain if still in_progress
  const pendingLocsRes = await query(
    `SELECT l.name FROM vaqf.inventory_count_locations cl
     JOIN vaqf.locations l ON l.id = cl.location_id
     WHERE cl.count_id = $1 AND cl.status != 'done'`,
    [cid]
  );
  if (pendingLocsRes.rowCount > 0) {
    throw httpError(
      400,
      `Barcha joylarda sanoq tugallangan bo'lishi shart. Tugallanmagan joylar: ${pendingLocsRes.rows.map((r) => r.name).join(", ")}`
    );
  }

  const itemsRes = await query(
    `SELECT * FROM vaqf.inventory_count_items WHERE count_id = $1 ORDER BY id ASC`,
    [cid]
  );
  const items = itemsRes.rows;

  const discrepancies = items.filter((i) => DISCREPANCY_RESULTS.includes(i.result));
  const undecided = discrepancies.filter((i) => !i.decision);
  if (undecided.length > 0) {
    throw httpError(
      400,
      `Tasdiqlashdan oldin barcha farqli qatorlar (${undecided.length} ta) bo'yicha qaror ('apply', 'mark_missing' yoki 'ignore') belgilanishi shart!`,
      { undecidedIds: undecided.map((u) => u.id) }
    );
  }

  const eventPrefix = `inventarizatsiya ${count.code} natijasi`;

  await withTransaction(async (tx) => {
    // Allow test simulation of mid-transaction error to verify rollback atomicity
    if (body?._simulateTransactionFailureAfterFirstItem) {
      // Will throw after first item update below
    }

    let appliedChanges = 0;

    for (const item of discrepancies) {
      const dec = item.decision;
      const decNote = item.decision_note ? `${eventPrefix}: ${item.decision_note}` : eventPrefix;

      if (dec === "ignore") {
        continue;
      }

      if (dec === "mark_missing" || (item.result === "missing" && dec === "apply")) {
        if (!item.asset_id) continue;
        const curAssetRes = await tx.query(`SELECT * FROM vaqf.assets WHERE id = $1 FOR UPDATE`, [item.asset_id]);
        const curAsset = curAssetRes.rows[0];
        if (!curAsset) continue;

        await tx.query(
          `UPDATE vaqf.assets SET status = 'missing', updated_at = NOW() WHERE id = $1`,
          [item.asset_id]
        );
        await tx.query(
          `INSERT INTO vaqf.asset_events (asset_id, event_type, old_value, new_value, note, actor_id, actor_name)
           VALUES ($1, 'status_changed', $2::jsonb, $3::jsonb, $4, $5, $6)`,
          [
            item.asset_id,
            JSON.stringify({ status: curAsset.status, location_id: curAsset.location_id }),
            JSON.stringify({ status: "missing", count_code: count.code }),
            decNote,
            actor?.actorId || null,
            actor?.actorName || "Direktor",
          ]
        );
        appliedChanges++;
      } else if (dec === "apply") {
        if (item.result === "extra" && !item.asset_id) {
          const ex = item.extra_data || {};
          const invRes = await tx.query(`SELECT vaqf.next_inventory_no($1) AS inv_no`, [
            count.institution_id || 1,
          ]);
          const invNo = invRes.rows[0].inv_no;
          const newCond =
            item.condition === "damaged" ? "poor" : item.condition || "good";
          const newStatus = item.condition === "damaged" ? "under_repair" : "in_use";

          const insAsset = await tx.query(
            `INSERT INTO vaqf.assets (
               inventory_no, name, category_id, description,
               tracking, quantity, unit, brand, model, serial_no,
               institution_id, location_id, status, condition,
               acquisition_type, notes, created_by
             ) VALUES (
               $1, $2, $3, $4,
               $5, $6, $7, $8, $9, $10,
               $11, $12, $13, $14,
               'unknown', $15, $16
             ) RETURNING id, inventory_no, name`,
            [
              invNo,
              ex.name || "Sanoqda topilgan yangi buyum",
              Number(ex.category_id) || 1,
              item.note || null,
              ex.tracking || (Number(item.counted_qty) > 1 ? "batch" : "individual"),
              Number(item.counted_qty) || 1,
              ex.unit || "dona",
              ex.brand || null,
              ex.model || null,
              ex.serial_no || null,
              count.institution_id,
              item.found_location_id,
              newStatus,
              newCond,
              decNote,
              actor?.actorId || null,
            ]
          );
          const createdAsset = insAsset.rows[0];

          if (item.photo_path && fs.existsSync(item.photo_path)) {
            const stat = fs.statSync(item.photo_path);
            await tx.query(
              `INSERT INTO vaqf.asset_photos (asset_id, file_path, file_name, mime_type, file_size, is_primary, uploaded_by, uploaded_by_name)
               VALUES ($1, $2, $3, 'image/jpeg', $4, TRUE, $5, $6)`,
              [
                createdAsset.id,
                item.photo_path,
                path.basename(item.photo_path),
                stat.size,
                actor?.actorId || null,
                actor?.actorName || "Direktor",
              ]
            );
          }

          await tx.query(
            `UPDATE vaqf.inventory_count_items SET created_asset_id = $1, updated_at = NOW() WHERE id = $2`,
            [createdAsset.id, item.id]
          );

          await tx.query(
            `INSERT INTO vaqf.asset_events (asset_id, event_type, old_value, new_value, note, actor_id, actor_name)
             VALUES ($1, 'created', NULL, $2::jsonb, $3, $4, $5)`,
            [
              createdAsset.id,
              JSON.stringify({
                inventory_no: createdAsset.inventory_no,
                name: createdAsset.name,
                location_id: item.found_location_id,
                quantity: Number(item.counted_qty) || 1,
                count_code: count.code,
              }),
              decNote,
              actor?.actorId || null,
              actor?.actorName || "Direktor",
            ]
          );
          appliedChanges++;
        } else if (item.asset_id) {
          // Existing asset: moved, qty_diff, damaged
          const curAssetRes = await tx.query(`SELECT * FROM vaqf.assets WHERE id = $1 FOR UPDATE`, [item.asset_id]);
          const curAsset = curAssetRes.rows[0];
          if (!curAsset) continue;

          const newLocId = item.found_location_id ?? curAsset.location_id;
          const newQty = item.counted_qty !== null ? Number(item.counted_qty) : Number(curAsset.quantity);
          const newCond =
            item.condition === "damaged"
              ? "poor"
              : item.condition && ["new", "good", "fair", "poor"].includes(item.condition)
              ? item.condition
              : curAsset.condition;
          const newStatus =
            item.condition === "damaged"
              ? "under_repair"
              : curAsset.status === "missing"
              ? "in_use"
              : curAsset.status;

          await tx.query(
            `UPDATE vaqf.assets
             SET location_id = $1,
                 quantity = $2,
                 condition = $3,
                 status = $4,
                 updated_at = NOW()
             WHERE id = $5`,
            [newLocId, newQty, newCond, newStatus, item.asset_id]
          );

          const eventType =
            Number(newLocId) !== Number(curAsset.location_id)
              ? "location_changed"
              : newStatus !== curAsset.status
              ? "status_changed"
              : "updated";

          await tx.query(
            `INSERT INTO vaqf.asset_events (asset_id, event_type, old_value, new_value, note, actor_id, actor_name)
             VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)`,
            [
              item.asset_id,
              eventType,
              JSON.stringify({
                location_id: curAsset.location_id,
                quantity: Number(curAsset.quantity),
                condition: curAsset.condition,
                status: curAsset.status,
              }),
              JSON.stringify({
                location_id: newLocId,
                quantity: newQty,
                condition: newCond,
                status: newStatus,
                count_code: count.code,
              }),
              decNote,
              actor?.actorId || null,
              actor?.actorName || "Direktor",
            ]
          );
          appliedChanges++;
        }
      }

      if (body?._simulateTransactionFailureAfterFirstItem && appliedChanges >= 1) {
        throw httpError(500, "Simulated mid-transaction failure for atomicity test");
      }
    }

    await tx.query(
      `UPDATE vaqf.inventory_counts
       SET status = 'approved',
           approved_by = $1,
           approved_by_ref = $2,
           approved_at = NOW(),
           submitted_at = COALESCE(submitted_at, NOW()),
           updated_at = NOW()
       WHERE id = $3`,
      [actor?.actorName || "Direktor", actor?.actorId || null, cid]
    );
  });

  return getCountDetail(cid, { isDirector: true, canView: true });
}

export async function cancelCount(countId, body, actor) {
  const cid = Number(countId);
  const cRes = await query(`SELECT * FROM vaqf.inventory_counts WHERE id = $1`, [cid]);
  const count = cRes.rows[0];
  if (!count) throw httpError(404, "Sanoq topilmadi");
  if (count.status === "approved") {
    throw httpError(400, "Tasdiqlangan sanoqni bekor qilib bo'lmaydi");
  }
  if (count.status === "cancelled") {
    throw httpError(400, "Ushbu sanoq allaqachon bekor qilingan");
  }

  const reason = String(body?.reason || body?.cancelled_reason || "").trim();
  if (!reason) {
    throw httpError(400, "Sanoqni bekor qilish sababini kiriting");
  }

  await query(
    `UPDATE vaqf.inventory_counts
     SET status = 'cancelled',
         cancelled_by = $1,
         cancelled_at = NOW(),
         cancelled_reason = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [actor?.actorName || "Direktor", reason.slice(0, 1000), cid]
  );

  return getCountDetail(cid, { isDirector: true, canView: true });
}

// ============================================================================
// STEP 5: DALOLATNOMA PDF (TURKISH & UZBEK BILINGUAL SUPPORT) & EXCEL REPORT
// ============================================================================
const I18N = {
  tr: {
    docTitle: "ENVANTER SAYIM TUTANAĞI",
    docSub: "Ezan Vakfı — Demirbaş ve Malvarlığı Envanter Raporu",
    institution: "Kurum",
    countCode: "Sayım Kodu",
    countTitle: "Sayım Adı",
    status: "Durum",
    startedAt: "Başlangıç Tarihi",
    submittedAt: "Teslim Tarihi",
    approvedAt: "Onay Tarihi",
    approvedBy: "Onaylayan",
    committeeTitle: "SAYIM KOMİSYONU ÜYELERİ",
    summaryTitle: "GENEL SAYIM ÖZETİ",
    colMetric: "Gösterge",
    colCards: "Kalem (Kart)",
    colUnits: "Toplam Adet",
    colValueTry: "Değer (TRY)",
    colValueUsd: "Değer (USD)",
    rowExpected: "Beklenen (Kayıtlı) Varlıklar",
    rowPresent: "Sayılan / Bulunan Varlıklar",
    rowMoved: "Farklı Odada Bulunanlar (Taşınmış)",
    rowQtyDiff: "Miktar Farkı Olanlar",
    rowDamaged: "Hasarlı / Arızalı Olanlar",
    rowMissing: "Bulunamayan (Kayıp) Varlıklar",
    rowExtra: "Kayıt Dışı Yeni Bulunanlar (Fazla)",
    discrepanciesTitle: "FARKLILIKLAR VE KARAR TABLOSU",
    noDiscrepancies: "Sayım sonucunda herhangi bir farklılık tespit edilmemiştir.",
    colCode: "Envanter No",
    colName: "Malzeme Adı",
    colExpected: "Beklenen Yer / Adet",
    colFound: "Bulunan Yer / Adet",
    colResult: "Tespit",
    colDecision: "Karar",
    signaturesTitle: "İMZA SİRKÜLERİ (KOMİSYON VE YÖNETİM ONAYI)",
    directorLabel: "Kurum Müdürü / Vakıf Yetkilisi",
    signPlaceholder: "İmza / Tarih",
    res_found: "Bulundu",
    res_moved: "Yer Değişikliği",
    res_missing: "Bulunamadı (Kayıp)",
    res_extra: "Kayıt Dışı (Yeni)",
    res_qty_diff: "Miktar Farkı",
    res_damaged: "Hasarlı",
    res_pending: "Bekliyor",
    dec_apply: "Uygula / Güncelle",
    dec_mark_missing: "Kayıp Olarak İşaretle",
    dec_ignore: "Yoksay (Değiştirme)",
    dec_null: "Karar Bekliyor",
    st_draft: "Taslak",
    st_in_progress: "Devam Ediyor",
    st_review: "İncelemede",
    st_approved: "Onaylandı",
    st_cancelled: "İptal Edildi",
  },
  uz: {
    docTitle: "INVENTARIZATSIYA DALOLATNOMASI",
    docSub: "Ezan Vakfı — Vaqf mulki va jihozlari sanoq hisoboti",
    institution: "Muassasa",
    countCode: "Sanoq kodi",
    countTitle: "Sanoq nomi",
    status: "Holati",
    startedAt: "Boshlangan vaqti",
    submittedAt: "Topshirilgan vaqti",
    approvedAt: "Tasdiqlangan vaqti",
    approvedBy: "Tasdiqladi",
    committeeTitle: "SANOQ KOMISSIYASI A'ZOLARI",
    summaryTitle: "UMUMIY SANOQ XULOSASI",
    colMetric: "Ko'rsatkich",
    colCards: "Kartochka soni",
    colUnits: "Jami miqdor",
    colValueTry: "Qiymati (TRY)",
    colValueUsd: "Qiymati (USD)",
    rowExpected: "Kutilgan (ro'yxatdagi) buyumlar",
    rowPresent: "Haqiqatda topilgan buyumlar",
    rowMoved: "Boshqa joydan topilganlar (ko'chirilgan)",
    rowQtyDiff: "Miqdor farqi aniqlanganlar",
    rowDamaged: "Shikastlangan / ta'mirtalab",
    rowMissing: "Topilmagan (yo'qolgan) buyumlar",
    rowExtra: "Ro'yxatda yo'q (ortiqcha) topilganlar",
    discrepanciesTitle: "ANIQLANGAN FARQLAR VA QARORLAR JADVALI",
    noDiscrepancies: "Sanoq natijasida hech qanday tafovut aniqlanmadi.",
    colCode: "Inventar №",
    colName: "Buyum nomi",
    colExpected: "Kutilgan joy / miqdor",
    colFound: "Topilgan joy / miqdor",
    colResult: "Natija",
    colDecision: "Direktor qarori",
    signaturesTitle: "IMZOLAR (KOMISSIYA A'ZOLARI VA DIREKTOR TASDIG'I)",
    directorLabel: "Muassasa Direktori",
    signPlaceholder: "Imzo / Sana",
    res_found: "Topildi",
    res_moved: "Boshqa joyda",
    res_missing: "Topilmadi",
    res_extra: "Ro'yxatda yo'q",
    res_qty_diff: "Miqdor farqi",
    res_damaged: "Shikastlangan",
    res_pending: "Kutilmoqda",
    dec_apply: "Qo'llash (Yangilash)",
    dec_mark_missing: "Yo'qolgan deb belgilash",
    dec_ignore: "E'tiborsiz qoldirish",
    dec_null: "Qaror berilmagan",
    st_draft: "Qoralama",
    st_in_progress: "Jarayonda",
    st_review: "Ko'rib chiqilmoqda",
    st_approved: "Tasdiqlangan",
    st_cancelled: "Bekor qilingan",
  },
};

function fmtDateShort(v) {
  if (!v) return "—";
  try {
    return new Date(v).toISOString().replace("T", " ").slice(0, 16);
  } catch {
    return String(v);
  }
}

function fmtMoney(n, sym = "") {
  const num = Number(n || 0);
  return `${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${sym ? " " + sym : ""}`;
}

export async function generateCountReportPdfBuffer(countId, { lang = "tr" } = {}) {
  const detail = await getCountDetail(countId, { isDirector: true, canView: true });
  const { count, summary, items } = detail;
  const discrepancies = items.filter((i) => DISCREPANCY_RESULTS.includes(i.result));
  const t = lang === "uz" ? I18N.uz : I18N.tr;

  const hasLogo = fs.existsSync(LOGO_PNG_PATH);
  const hasDejaVu = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fontReg = hasDejaVu ? FONT_REGULAR : "Helvetica";
    const fontBold = hasDejaVu ? FONT_BOLD : "Helvetica-Bold";

    // Header
    const startY = 36;
    if (hasLogo) {
      try {
        doc.image(LOGO_PNG_PATH, 36, startY, { width: 42, height: 48 });
      } catch {}
    }

    doc
      .font(fontBold)
      .fontSize(15)
      .fillColor("#0f172a")
      .text("EZAN VAKFI", hasLogo ? 88 : 36, startY + 2);
    doc
      .font(fontBold)
      .fontSize(13)
      .fillColor("#b45309")
      .text(t.docTitle, hasLogo ? 88 : 36, startY + 20);
    doc
      .font(fontReg)
      .fontSize(9)
      .fillColor("#475569")
      .text(t.docSub, hasLogo ? 88 : 36, startY + 37);

    // Metadata box
    doc
      .moveTo(36, startY + 58)
      .lineTo(559, startY + 58)
      .lineWidth(1)
      .strokeColor("#cbd5e1")
      .stroke();

    let y = startY + 68;
    const statusLabel = t[`st_${count.status}`] || count.status;

    doc.font(fontBold).fontSize(9.5).fillColor("#0f172a");
    doc.text(`${t.institution}:`, 36, y);
    doc.font(fontReg).text(count.institution_name || "Mezana Akademiyasi", 130, y);

    doc.font(fontBold).text(`${t.countCode}:`, 320, y);
    doc.font(fontReg).text(count.code, 415, y);

    y += 16;
    doc.font(fontBold).text(`${t.countTitle}:`, 36, y);
    doc.font(fontReg).text(count.title, 130, y, { width: 180 });

    doc.font(fontBold).text(`${t.status}:`, 320, y);
    doc.font(fontReg).text(statusLabel, 415, y);

    y += 16;
    doc.font(fontBold).text(`${t.startedAt}:`, 36, y);
    doc.font(fontReg).text(fmtDateShort(count.started_at), 130, y);

    doc.font(fontBold).text(`${t.approvedAt}:`, 320, y);
    doc.font(fontReg).text(fmtDateShort(count.approved_at || count.submitted_at), 415, y);

    y += 24;

    // Committee section
    const committee = Array.isArray(count.committee) ? count.committee : [];
    if (committee.length > 0) {
      doc.font(fontBold).fontSize(10.5).fillColor("#0f172a").text(t.committeeTitle, 36, y);
      y += 15;
      doc.font(fontReg).fontSize(9).fillColor("#334155");
      committee.forEach((m, idx) => {
        doc.text(`${idx + 1}. ${m.name} — ${m.role || ""}`, 44, y);
        y += 13;
      });
      y += 8;
    }

    // Summary Table
    doc.font(fontBold).fontSize(10.5).fillColor("#0f172a").text(t.summaryTitle, 36, y);
    y += 16;

    const sumCols = [
      { label: t.colMetric, x: 36, w: 225 },
      { label: t.colCards, x: 261, w: 70 },
      { label: t.colUnits, x: 331, w: 70 },
      { label: t.colValueTry, x: 401, w: 80 },
      { label: t.colValueUsd, x: 481, w: 78 },
    ];

    doc.rect(36, y, 523, 18).fill("#f1f5f9");
    doc.font(fontBold).fontSize(8.5).fillColor("#0f172a");
    for (const c of sumCols) {
      doc.text(c.label, c.x + 4, y + 4, { width: c.w - 8 });
    }
    y += 18;

    const sumRows = [
      {
        label: t.rowExpected,
        cards: summary.expected_cards,
        units: summary.expected_units,
        tryVal: fmtMoney(summary.expected_value_try, "TL"),
        usdVal: fmtMoney(summary.expected_value_usd, "USD"),
      },
      {
        label: t.rowPresent,
        cards: summary.present_cards,
        units: summary.present_units,
        tryVal: fmtMoney(summary.present_value_try, "TL"),
        usdVal: fmtMoney(summary.present_value_usd, "USD"),
      },
      {
        label: t.rowMoved,
        cards: summary.moved_cards,
        units: "—",
        tryVal: "—",
        usdVal: "—",
      },
      {
        label: t.rowQtyDiff,
        cards: summary.qty_diff_cards,
        units: "—",
        tryVal: "—",
        usdVal: "—",
      },
      {
        label: t.rowDamaged,
        cards: summary.damaged_cards,
        units: "—",
        tryVal: "—",
        usdVal: "—",
      },
      {
        label: t.rowMissing,
        cards: summary.missing_cards,
        units: "—",
        tryVal: fmtMoney(summary.missing_value_try, "TL"),
        usdVal: fmtMoney(summary.missing_value_usd, "USD"),
      },
      {
        label: t.rowExtra,
        cards: summary.extra_cards,
        units: "—",
        tryVal: "—",
        usdVal: "—",
      },
    ];

    doc.font(fontReg).fontSize(8.5).fillColor("#1e293b");
    for (const r of sumRows) {
      doc
        .moveTo(36, y + 16)
        .lineTo(559, y + 16)
        .lineWidth(0.4)
        .strokeColor("#e2e8f0")
        .stroke();
      doc.text(String(r.label), sumCols[0].x + 4, y + 3, { width: sumCols[0].w - 8 });
      doc.text(String(r.cards), sumCols[1].x + 4, y + 3, { width: sumCols[1].w - 8 });
      doc.text(String(r.units), sumCols[2].x + 4, y + 3, { width: sumCols[2].w - 8 });
      doc.text(String(r.tryVal), sumCols[3].x + 4, y + 3, { width: sumCols[3].w - 8 });
      doc.text(String(r.usdVal), sumCols[4].x + 4, y + 3, { width: sumCols[4].w - 8 });
      y += 17;
    }

    y += 16;

    // Discrepancies Table
    doc.font(fontBold).fontSize(10.5).fillColor("#0f172a").text(t.discrepanciesTitle, 36, y);
    y += 16;

    if (discrepancies.length === 0) {
      doc.font(fontReg).fontSize(9).fillColor("#475569").text(t.noDiscrepancies, 36, y);
      y += 24;
    } else {
      const dCols = [
        { label: t.colCode, x: 36, w: 76 },
        { label: t.colName, x: 112, w: 125 },
        { label: t.colExpected, x: 237, w: 96 },
        { label: t.colFound, x: 333, w: 96 },
        { label: t.colResult, x: 429, w: 62 },
        { label: t.colDecision, x: 491, w: 68 },
      ];

      const drawDiscrepancyHeader = (topY) => {
        doc.rect(36, topY, 523, 18).fill("#f1f5f9");
        doc.font(fontBold).fontSize(8).fillColor("#0f172a");
        for (const c of dCols) {
          doc.text(c.label, c.x + 3, topY + 4, { width: c.w - 6 });
        }
        return topY + 18;
      };

      y = drawDiscrepancyHeader(y);

      for (const d of discrepancies) {
        if (y > 730) {
          doc.addPage();
          y = drawDiscrepancyHeader(36);
        }
        const codeStr = d.inventory_no || d.created_inventory_no || "(Yangi)";
        const expStr = d.asset_id
          ? `${d.expected_location_name || "—"} (${d.expected_qty ?? 1} ${d.unit || ""})`
          : "—";
        const fndStr = d.found_location_name
          ? `${d.found_location_name} (${d.counted_qty ?? 1} ${d.unit || ""})`
          : "—";
        const resLabel = t[`res_${d.result}`] || d.result;
        const decLabel = t[`dec_${d.decision || "null"}`] || d.decision || "—";

        doc.font(fontReg).fontSize(7.8).fillColor("#1e293b");
        doc.text(codeStr, dCols[0].x + 3, y + 3, { width: dCols[0].w - 6 });
        doc.text(String(d.asset_name || "").slice(0, 42), dCols[1].x + 3, y + 3, { width: dCols[1].w - 6 });
        doc.text(expStr, dCols[2].x + 3, y + 3, { width: dCols[2].w - 6 });
        doc.text(fndStr, dCols[3].x + 3, y + 3, { width: dCols[3].w - 6 });
        doc.text(resLabel, dCols[4].x + 3, y + 3, { width: dCols[4].w - 6 });
        doc.text(decLabel, dCols[5].x + 3, y + 3, { width: dCols[5].w - 6 });

        doc
          .moveTo(36, y + 20)
          .lineTo(559, y + 20)
          .lineWidth(0.35)
          .strokeColor("#e2e8f0")
          .stroke();
        y += 21;
      }
      y += 16;
    }

    // Signatures block
    if (y > 670) {
      doc.addPage();
      y = 44;
    }

    doc.font(fontBold).fontSize(10.5).fillColor("#0f172a").text(t.signaturesTitle, 36, y);
    y += 20;

    const signers = [
      ...committee.map((m) => ({ name: m.name, role: m.role || "Komisyon Üyesi" })),
      { name: count.approved_by || count.created_by || "Direktor", role: t.directorLabel },
    ];

    doc.font(fontReg).fontSize(9).fillColor("#1e293b");
    signers.forEach((s, idx) => {
      const col = idx % 2;
      const sx = col === 0 ? 36 : 310;
      if (col === 0 && idx > 0) y += 44;
      doc.font(fontBold).text(s.name, sx, y);
      doc.font(fontReg).fontSize(8).fillColor("#475569").text(s.role, sx, y + 12);
      doc
        .moveTo(sx + 135, y + 20)
        .lineTo(sx + 235, y + 20)
        .lineWidth(0.6)
        .strokeColor("#94a3b8")
        .stroke();
      doc.fontSize(7.5).text(t.signPlaceholder, sx + 155, y + 23);
    });

    doc.end();
  });
}

export async function generateCountReportExcelBuffer(countId) {
  const detail = await getCountDetail(countId, { isDirector: true, canView: true });
  const { count, summary, locations, items } = detail;

  const wb = new ExcelJS.Workbook();

  // Sheet 1: Summary
  const wsSum = wb.addWorksheet("Xulosa (Summary)");
  wsSum.columns = [
    { header: "Ko'rsatkich", key: "k", width: 36 },
    { header: "Qiymat", key: "v", width: 32 },
  ];
  wsSum.getRow(1).font = { bold: true };
  wsSum.addRow({ k: "Sanoq kodi", v: count.code });
  wsSum.addRow({ k: "Sanoq nomi", v: count.title });
  wsSum.addRow({ k: "Muassasa", v: count.institution_name });
  wsSum.addRow({ k: "Holati", v: count.status });
  wsSum.addRow({ k: "Boshlangan vaqti", v: fmtDateShort(count.started_at) });
  wsSum.addRow({ k: "Tasdiqlangan vaqti", v: fmtDateShort(count.approved_at) });
  wsSum.addRow({ k: "Jami kutilgan kartochkalar", v: summary.expected_cards });
  wsSum.addRow({ k: "Jami topilgan kartochkalar", v: summary.present_cards });
  wsSum.addRow({ k: "Boshqa joydan topilganlar (moved)", v: summary.moved_cards });
  wsSum.addRow({ k: "Miqdor farqi (qty_diff)", v: summary.qty_diff_cards });
  wsSum.addRow({ k: "Shikastlanganlar (damaged)", v: summary.damaged_cards });
  wsSum.addRow({ k: "Topilmaganlar (missing)", v: summary.missing_cards });
  wsSum.addRow({ k: "Ro'yxatda yo'q yangi topilganlar (extra)", v: summary.extra_cards });

  // Sheet 2: All Items
  const wsItems = wb.addWorksheet("Barcha qatorlar");
  wsItems.columns = [
    { header: "Inventar №", key: "inventory_no", width: 18 },
    { header: "Buyum nomi", key: "asset_name", width: 32 },
    { header: "Kategoriya", key: "category_name", width: 22 },
    { header: "Kutilgan joy", key: "expected_location_name", width: 22 },
    { header: "Kutilgan miqdor", key: "expected_qty", width: 15 },
    { header: "Topilgan joy", key: "found_location_name", width: 22 },
    { header: "Sanalgan miqdor", key: "counted_qty", width: 15 },
    { header: "Yaroqliligi", key: "condition", width: 14 },
    { header: "Natija", key: "result", width: 15 },
    { header: "Direktor qarori", key: "decision", width: 16 },
    { header: "Qaror izohi", key: "decision_note", width: 25 },
    { header: "Skanerlagan xodim", key: "scanned_by", width: 22 },
    { header: "Skaner vaqti", key: "scanned_at", width: 20 },
    { header: "Izoh", key: "note", width: 26 },
  ];
  wsItems.getRow(1).font = { bold: true };
  for (const it of items) {
    wsItems.addRow({
      inventory_no: it.inventory_no || it.created_inventory_no || "(Extra)",
      asset_name: it.asset_name,
      category_name: it.category_name,
      expected_location_name: it.expected_location_name || "—",
      expected_qty: it.expected_qty ?? "",
      found_location_name: it.found_location_name || "—",
      counted_qty: it.counted_qty ?? "",
      condition: it.condition || "",
      result: it.result,
      decision: it.decision || "",
      decision_note: it.decision_note || "",
      scanned_by: it.scanned_by || "",
      scanned_at: fmtDateShort(it.scanned_at),
      note: it.note || "",
    });
  }

  // Sheet 3: Locations
  const wsLocs = wb.addWorksheet("Joylar holati");
  wsLocs.columns = [
    { header: "Joy / Xona", key: "location_name", width: 26 },
    { header: "Mas'ul xodim", key: "assignee_name", width: 26 },
    { header: "Holati", key: "status", width: 14 },
    { header: "Kutilgan", key: "expected_count", width: 12 },
    { header: "Topilgan", key: "found_count", width: 12 },
    { header: "Ko'chirilgan", key: "moved_count", width: 12 },
    { header: "Topilmagan", key: "missing_count", width: 12 },
    { header: "Ortiqcha", key: "extra_count", width: 12 },
    { header: "Jarayon (%)", key: "progress_pct", width: 14 },
  ];
  wsLocs.getRow(1).font = { bold: true };
  for (const l of locations) {
    wsLocs.addRow(l);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
