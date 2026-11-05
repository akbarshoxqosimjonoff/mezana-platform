import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { query, withTransaction, getCrmPool, getErpPool } from "./db.mjs";
import { syncCrmRoomsToLocations } from "./migrate.mjs";
import { QrCode, Ecc } from "./qrcodegen.mjs";
import { resolveSyncVaqfRole } from "./lifecycleService.mjs";
import { ensureWarrantyScheduleForAsset } from "./automationService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const apiRequire = createRequire(path.join(rootDir, "apps/api/package.json"));
const PDFDocument = apiRequire("pdfkit");
const ExcelJS = apiRequire("exceljs");

export const VAQF_STORAGE_DIR = process.env.VAQF_STORAGE_DIR || "/srv/data/vaqf";
export const PHOTOS_DIR = path.join(VAQF_STORAGE_DIR, "photos");
export const DOCS_DIR = path.join(VAQF_STORAGE_DIR, "documents");
const LOGO_PNG_PATH = path.join(__dirname, "ezan-logo.png");

try {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true, mode: 0o750 });
  fs.mkdirSync(DOCS_DIR, { recursive: true, mode: 0o750 });
} catch {}

export const VALID_LOCATION_KINDS = ["building", "floor", "room", "storage", "outdoor"];
export const VALID_TRACKING = ["individual", "batch"];
export const VALID_STATUSES = ["in_use", "in_storage", "under_repair", "missing", "written_off"];
export const VALID_CONDITIONS = ["new", "good", "fair", "poor"];
export const VALID_ACQUISITION_TYPES = ["purchase", "donation", "transfer", "unknown"];
export const VALID_CURRENCIES = ["TRY", "USD"];
export const VALID_DOC_TYPES = ["invoice", "donation_act", "warranty", "transfer_act", "other"];

const ALLOWED_PHOTO_MIMES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const ALLOWED_DOC_MIMES = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
]);

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DOC_BYTES = 15 * 1024 * 1024; // 15 MB

export function httpError(status, message, details = null) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

/**
 * Single centralized Vaqf access control function.
 * Supports full 3-bosqich roles: director, inventory_manager, accountant, staff.
 */
export function vaqfAccess(sess, accessContext = null) {
  return resolveSyncVaqfRole(sess, accessContext);
}

export function getActor(sess, accessContext = null) {
  const actorId = String(
    sess?.user?.identifier ||
      sess?.erpUser?.email ||
      sess?.crmUser?.username ||
      sess?.user?.id ||
      "unknown"
  ).slice(0, 120);
  const actorName = String(
    accessContext?.sourceLabel ||
      accessContext?.accountName ||
      sess?.user?.name ||
      sess?.crmUser?.fullname ||
      actorId
  ).slice(0, 190);
  return { actorId, actorName };
}

function cleanStr(val, maxLen = 255) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s) return null;
  if (s.length > maxLen) {
    throw httpError(400, `Matn uzunligi ruxsat etilgan me'yordan (${maxLen} belgi) oshdi`);
  }
  return s;
}

function cleanDate(val, fieldName = "Sana") {
  if (val === undefined || val === null || val === "") return null;
  const s = String(val).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw httpError(400, `${fieldName} noto'g'ri formatda (YYYY-MM-DD bo'lishi kerak)`);
  }
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) {
    throw httpError(400, `${fieldName} haqiqiy sana emas`);
  }
  return s;
}

function cleanPositiveInt(val, fieldName, { allowNull = true } = {}) {
  if (val === undefined || val === null || val === "") {
    if (allowNull) return null;
    throw httpError(400, `${fieldName} majburiy maydon`);
  }
  const n = Number(val);
  if (!Number.isInteger(n) || n <= 0) {
    throw httpError(400, `${fieldName} musbat butun son bo'lishi kerak`);
  }
  return n;
}

function cleanNumber(val, fieldName, { min = 0, allowNull = true } = {}) {
  if (val === undefined || val === null || val === "") {
    if (allowNull) return null;
    throw httpError(400, `${fieldName} majburiy maydon`);
  }
  const n = Number(val);
  if (!Number.isFinite(n) || n < min) {
    throw httpError(400, `${fieldName} ${min} dan kichik bo'lmasligi kerak`);
  }
  return n;
}

export async function recordAssetEvent(txOrDb, { assetId, eventType, oldValue = null, newValue = null, note = null, actor }) {
  await txOrDb.query(
    `INSERT INTO vaqf.asset_events (asset_id, event_type, old_value, new_value, note, actor_id, actor_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      assetId,
      eventType,
      oldValue !== null ? JSON.stringify(oldValue) : null,
      newValue !== null ? JSON.stringify(newValue) : null,
      note,
      actor?.actorId || null,
      actor?.actorName || null,
    ]
  );
}

// ============================================================================
// INSTITUTIONS
// ============================================================================
export async function listInstitutions() {
  const res = await query(
    `SELECT
       i.*,
       (SELECT COUNT(*)::int FROM vaqf.locations l WHERE l.institution_id = i.id AND l.deleted_at IS NULL) AS locations_count,
       (SELECT COUNT(*)::int FROM vaqf.assets a WHERE a.institution_id = i.id AND a.deleted_at IS NULL) AS assets_count
     FROM vaqf.institutions i
     ORDER BY i.id ASC`
  );
  return res.rows;
}

export async function createInstitution(body) {
  const name = cleanStr(body.name, 200);
  const code = cleanStr(body.code, 32)?.toUpperCase();
  if (!name) throw httpError(400, "Muassasa nomini kiriting");
  if (!code || !/^[A-Z0-9_-]{2,16}$/.test(code)) {
    throw httpError(400, "Muassasa kodi 2-16 ta harf/raqamdan iborat bo'lishi kerak (masalan: MZN)");
  }
  const address = cleanStr(body.address, 500);
  const notes = cleanStr(body.notes, 1000);
  const externalRefs = body.external_refs && typeof body.external_refs === "object" ? body.external_refs : {};

  try {
    const res = await query(
      `INSERT INTO vaqf.institutions (name, code, address, notes, external_refs)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, code, address, notes, JSON.stringify(externalRefs)]
    );
    return res.rows[0];
  } catch (e) {
    if (e.code === "23505") throw httpError(409, `Bunday kodli (${code}) muassasa allaqachon mavjud`);
    throw e;
  }
}

export async function updateInstitution(id, body) {
  const instId = cleanPositiveInt(id, "Muassasa ID", { allowNull: false });
  const existing = await query(`SELECT * FROM vaqf.institutions WHERE id = $1`, [instId]);
  if (!existing.rows[0]) throw httpError(404, "Muassasa topilmadi");

  const cur = existing.rows[0];
  const name = body.name !== undefined ? cleanStr(body.name, 200) : cur.name;
  if (!name) throw httpError(400, "Muassasa nomi bo'sh bo'lishi mumkin emas");
  const code = body.code !== undefined ? cleanStr(body.code, 32)?.toUpperCase() : cur.code;
  if (!code || !/^[A-Z0-9_-]{2,16}$/.test(code)) {
    throw httpError(400, "Muassasa kodi noto'g'ri");
  }
  const address = body.address !== undefined ? cleanStr(body.address, 500) : cur.address;
  const notes = body.notes !== undefined ? cleanStr(body.notes, 1000) : cur.notes;
  const isActive = body.is_active !== undefined ? Boolean(body.is_active) : cur.is_active;
  const externalRefs =
    body.external_refs && typeof body.external_refs === "object"
      ? body.external_refs
      : cur.external_refs;

  const res = await query(
    `UPDATE vaqf.institutions
     SET name = $1, code = $2, address = $3, notes = $4, is_active = $5, external_refs = $6, updated_at = NOW()
     WHERE id = $7
     RETURNING *`,
    [name, code, address, notes, isActive, JSON.stringify(externalRefs), instId]
  );
  return res.rows[0];
}

// ============================================================================
// LOCATIONS
// ============================================================================
export async function listLocations({ institutionId = null } = {}) {
  const params = [];
  let whereSql = `WHERE l.deleted_at IS NULL`;
  if (institutionId) {
    params.push(cleanPositiveInt(institutionId, "Muassasa ID", { allowNull: false }));
    whereSql += ` AND l.institution_id = $${params.length}`;
  }
  const res = await query(
    `SELECT
       l.*,
       i.name AS institution_name,
       i.code AS institution_code,
       p.name AS parent_name,
       (SELECT COUNT(*)::int FROM vaqf.assets a WHERE a.location_id = l.id AND a.deleted_at IS NULL) AS direct_assets_count,
       (SELECT COALESCE(SUM(a.quantity), 0)::float FROM vaqf.assets a WHERE a.location_id = l.id AND a.deleted_at IS NULL) AS direct_quantity_sum
     FROM vaqf.locations l
     JOIN vaqf.institutions i ON i.id = l.institution_id
     LEFT JOIN vaqf.locations p ON p.id = l.parent_id
     ${whereSql}
     ORDER BY l.institution_id ASC, l.sort_order ASC, l.name ASC`,
    params
  );

  const items = res.rows.map((r) => ({
    ...r,
    total_assets_count: Number(r.direct_assets_count || 0),
    total_quantity_sum: Number(r.direct_quantity_sum || 0),
  }));
  const childrenByParent = new Map();
  for (const it of items) {
    const pid = it.parent_id || 0;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(it);
  }
  function accumulate(node) {
    const kids = childrenByParent.get(node.id) || [];
    for (const k of kids) {
      accumulate(k);
      node.total_assets_count += k.total_assets_count;
      node.total_quantity_sum += k.total_quantity_sum;
    }
  }
  for (const root of childrenByParent.get(0) || []) {
    accumulate(root);
  }
  return items;
}

export async function createLocation(body) {
  if (body.action === "sync_crm_rooms") {
    const syncRes = await syncCrmRoomsToLocations();
    return { synced: true, imported: syncRes.imported };
  }
  const institutionId = cleanPositiveInt(body.institution_id || 1, "Muassasa", { allowNull: false });
  const parentId = cleanPositiveInt(body.parent_id, "Yuqori joy", { allowNull: true });
  const kind = cleanStr(body.kind, 32);
  if (!kind || !VALID_LOCATION_KINDS.includes(kind)) {
    throw httpError(400, `Joy turi noto'g'ri. Ruxsat etilgan: ${VALID_LOCATION_KINDS.join(", ")}`);
  }
  const name = cleanStr(body.name, 200);
  if (!name) throw httpError(400, "Joy nomini kiriting");
  const code = cleanStr(body.code, 64);
  const externalRef = cleanStr(body.external_ref, 128);
  const notes = cleanStr(body.notes, 1000);
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;

  if (parentId) {
    const pRes = await query(`SELECT id, institution_id FROM vaqf.locations WHERE id = $1 AND deleted_at IS NULL`, [parentId]);
    if (!pRes.rows[0]) throw httpError(400, "Tanlangan yuqori joy (ota tugun) topilmadi");
  }

  const res = await query(
    `INSERT INTO vaqf.locations (institution_id, parent_id, kind, name, code, external_ref, notes, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [institutionId, parentId, kind, name, code, externalRef, notes, sortOrder]
  );
  return res.rows[0];
}

export async function updateLocation(id, body) {
  const locId = cleanPositiveInt(id, "Joy ID", { allowNull: false });
  const existing = await query(`SELECT * FROM vaqf.locations WHERE id = $1 AND deleted_at IS NULL`, [locId]);
  if (!existing.rows[0]) throw httpError(404, "Joy topilmadi");
  const cur = existing.rows[0];

  const parentId = body.parent_id !== undefined ? cleanPositiveInt(body.parent_id, "Yuqori joy", { allowNull: true }) : cur.parent_id;
  if (parentId === locId) throw httpError(400, "Joy o'ziga o'zi ota tugun bo'la olmaydi");
  const kind = body.kind !== undefined ? cleanStr(body.kind, 32) : cur.kind;
  if (!kind || !VALID_LOCATION_KINDS.includes(kind)) {
    throw httpError(400, `Joy turi noto'g'ri`);
  }
  const name = body.name !== undefined ? cleanStr(body.name, 200) : cur.name;
  if (!name) throw httpError(400, "Joy nomini kiriting");
  const code = body.code !== undefined ? cleanStr(body.code, 64) : cur.code;
  const notes = body.notes !== undefined ? cleanStr(body.notes, 1000) : cur.notes;
  const sortOrder = body.sort_order !== undefined ? Number(body.sort_order || 0) : cur.sort_order;
  const isActive = body.is_active !== undefined ? Boolean(body.is_active) : cur.is_active;

  const res = await query(
    `UPDATE vaqf.locations
     SET parent_id = $1, kind = $2, name = $3, code = $4, notes = $5, sort_order = $6, is_active = $7, updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [parentId, kind, name, code, notes, sortOrder, isActive, locId]
  );
  return res.rows[0];
}

export async function deleteLocation(id) {
  const locId = cleanPositiveInt(id, "Joy ID", { allowNull: false });
  const existing = await query(`SELECT id FROM vaqf.locations WHERE id = $1 AND deleted_at IS NULL`, [locId]);
  if (!existing.rows[0]) throw httpError(404, "Joy topilmadi");

  const childRes = await query(`SELECT COUNT(*)::int AS cnt FROM vaqf.locations WHERE parent_id = $1 AND deleted_at IS NULL`, [locId]);
  if (childRes.rows[0]?.cnt > 0) {
    throw httpError(400, "Ushbu joy ichida ichki qavat/xonalar bor. Avval ularni o'chiring yoki ko'chiring.");
  }
  const assetRes = await query(`SELECT COUNT(*)::int AS cnt FROM vaqf.assets WHERE location_id = $1 AND deleted_at IS NULL`, [locId]);
  if (assetRes.rows[0]?.cnt > 0) {
    throw httpError(400, `Ushbu joyga ${assetRes.rows[0].cnt} ta mulk biriktirilgan. Avval buyumlarni boshqa joyga ko'chiring.`);
  }

  await query(`UPDATE vaqf.locations SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE id = $1`, [locId]);
  return { deleted: true, id: locId };
}

// ============================================================================
// CATEGORIES
// ============================================================================
export async function listCategories() {
  const res = await query(
    `SELECT
       c.*,
       p.name AS parent_name,
       (SELECT COUNT(*)::int FROM vaqf.assets a WHERE a.category_id = c.id AND a.deleted_at IS NULL) AS assets_count,
       (SELECT COALESCE(SUM(a.quantity), 0)::float FROM vaqf.assets a WHERE a.category_id = c.id AND a.deleted_at IS NULL) AS quantity_sum
     FROM vaqf.asset_categories c
     LEFT JOIN vaqf.asset_categories p ON p.id = c.parent_id
     WHERE c.is_active = TRUE
     ORDER BY c.sort_order ASC, c.id ASC`
  );
  return res.rows;
}

export async function createCategory(body) {
  const name = cleanStr(body.name, 200);
  if (!name) throw httpError(400, "Kategoriya nomini kiriting");
  const parentId = cleanPositiveInt(body.parent_id, "Yuqori kategoriya", { allowNull: true });
  const tracking = body.tracking ? cleanStr(body.tracking, 20) : "individual";
  if (!VALID_TRACKING.includes(tracking)) {
    throw httpError(400, "Hisob turi 'individual' yoki 'batch' bo'lishi kerak");
  }
  const defaultUnit = cleanStr(body.default_unit || "dona", 32) || "dona";
  const code = cleanStr(body.code, 64)?.toUpperCase() || null;
  const description = cleanStr(body.description, 1000);
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 50;

  try {
    const res = await query(
      `INSERT INTO vaqf.asset_categories (parent_id, name, code, tracking, default_unit, description, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [parentId, name, code, tracking, defaultUnit, description, sortOrder]
    );
    return res.rows[0];
  } catch (e) {
    if (e.code === "23505") throw httpError(409, "Bunday kodli kategoriya allaqachon mavjud");
    throw e;
  }
}

export async function updateCategory(id, body) {
  const catId = cleanPositiveInt(id, "Kategoriya ID", { allowNull: false });
  const existing = await query(`SELECT * FROM vaqf.asset_categories WHERE id = $1`, [catId]);
  if (!existing.rows[0]) throw httpError(404, "Kategoriya topilmadi");
  const cur = existing.rows[0];

  const parentId = body.parent_id !== undefined ? cleanPositiveInt(body.parent_id, "Yuqori kategoriya", { allowNull: true }) : cur.parent_id;
  if (parentId === catId) throw httpError(400, "Kategoriya o'ziga o'zi ota bo'la olmaydi");
  const name = body.name !== undefined ? cleanStr(body.name, 200) : cur.name;
  if (!name) throw httpError(400, "Kategoriya nomini kiriting");
  const tracking = body.tracking !== undefined ? cleanStr(body.tracking, 20) : cur.tracking;
  if (!VALID_TRACKING.includes(tracking)) throw httpError(400, "Hisob turi noto'g'ri");
  const defaultUnit = body.default_unit !== undefined ? (cleanStr(body.default_unit, 32) || "dona") : cur.default_unit;
  const description = body.description !== undefined ? cleanStr(body.description, 1000) : cur.description;
  const sortOrder = body.sort_order !== undefined ? Number(body.sort_order || 0) : cur.sort_order;
  const isActive = body.is_active !== undefined ? Boolean(body.is_active) : cur.is_active;

  const res = await query(
    `UPDATE vaqf.asset_categories
     SET parent_id = $1, name = $2, tracking = $3, default_unit = $4, description = $5, sort_order = $6, is_active = $7, updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [parentId, name, tracking, defaultUnit, description, sortOrder, isActive, catId]
  );
  return res.rows[0];
}

// ============================================================================
// STAFF / EMPLOYEES HELPER (for responsible person picker)
// ============================================================================
export async function listResponsibleStaff() {
  const staff = [];
  const seen = new Set();
  try {
    const erpPool = getErpPool();
    if (erpPool) {
      const erpRes = await erpPool.query(
        `SELECT id, "fullName", position, department FROM "Employee" WHERE "deletedAt" IS NULL ORDER BY "fullName" ASC`
      );
      for (const r of erpRes.rows) {
        const ref = `erp:${r.id}`;
        seen.add(r.fullName.toLowerCase());
        staff.push({
          ref,
          name: r.fullName,
          role: r.position || r.department || "Moliya / Xodim",
          source: "erp",
        });
      }
    }
  } catch {}
  try {
    const crmPool = getCrmPool();
    if (crmPool) {
      const admRes = await crmPool.query(
        `SELECT id, fullname, username FROM "Admin" WHERE "isActive" = TRUE AND "isDeleted" = FALSE ORDER BY fullname ASC`
      );
      for (const a of admRes.rows) {
        if (!a.fullname || seen.has(a.fullname.toLowerCase())) continue;
        seen.add(a.fullname.toLowerCase());
        staff.push({
          ref: `crm:admin:${a.id}`,
          name: a.fullname,
          role: `Ma'mur (@${a.username})`,
          source: "crm",
        });
      }
      const tchRes = await crmPool.query(
        `SELECT id, fullname, username FROM "Teacher" WHERE "isActive" = TRUE AND "isDeleted" = FALSE ORDER BY fullname ASC`
      );
      for (const t of tchRes.rows) {
        if (!t.fullname || seen.has(t.fullname.toLowerCase())) continue;
        seen.add(t.fullname.toLowerCase());
        staff.push({
          ref: `crm:teacher:${t.id}`,
          name: t.fullname,
          role: `Ustoz (@${t.username})`,
          source: "crm",
        });
      }
      const empRes = await crmPool.query(
        `SELECT id, fullname, position FROM "Employee" WHERE "isActive" = TRUE AND "isDeleted" = FALSE ORDER BY fullname ASC`
      );
      for (const e of empRes.rows) {
        if (!e.fullname || seen.has(e.fullname.toLowerCase())) continue;
        seen.add(e.fullname.toLowerCase());
        staff.push({
          ref: `crm:emp:${e.id}`,
          name: e.fullname,
          role: e.position || "Xodim",
          source: "crm",
        });
      }
    }
  } catch {}
  return staff;
}

// ============================================================================
// ASSETS CRUD & VALIDATION
// ============================================================================
export function cleanMacAddress(val) {
  if (val === undefined || val === null) return null;
  const raw = String(val).trim();
  if (!raw) return null;
  const hex = raw.replace(/[:\-.\s]/g, "").toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(hex)) {
    throw httpError(
      400,
      `MAC manzil noto'g'ri formatda ("${raw}"). 12 ta 0-9/A-F belgi kiriting (masalan: AA:BB:CC:DD:EE:FF)`
    );
  }
  return hex.match(/.{1,2}/g).join(":");
}

function validateAssetPayload(body, { isPatch = false, current = null } = {}) {
  const out = {};

  if (!isPatch || body.name !== undefined) {
    const name = cleanStr(body.name, 255);
    if (!name) throw httpError(400, "Buyum nomini kiriting (name majburiy)");
    out.name = name;
  }

  if (!isPatch || body.category_id !== undefined) {
    out.category_id = cleanPositiveInt(body.category_id, "Kategoriya (category_id)", { allowNull: false });
  }

  if (!isPatch || body.institution_id !== undefined) {
    out.institution_id = cleanPositiveInt(body.institution_id || 1, "Muassasa (institution_id)", { allowNull: false });
  }

  if (body.location_id !== undefined || !isPatch) {
    out.location_id = cleanPositiveInt(body.location_id, "Joy (location_id)", { allowNull: true });
  }

  if (body.inventory_no !== undefined) {
    const inv = cleanStr(body.inventory_no, 64)?.toUpperCase() || null;
    if (inv && !/^[A-Z0-9_-]{3,64}$/.test(inv)) {
      throw httpError(400, "Inventar raqami faqat harf, raqam va chiziqchadan iborat bo'lishi kerak");
    }
    out.inventory_no = inv;
  }

  if (body.description !== undefined || !isPatch) {
    out.description = cleanStr(body.description, 2000);
  }

  if (body.tracking !== undefined || !isPatch) {
    const tracking = body.tracking ? cleanStr(body.tracking, 20) : (current?.tracking || "individual");
    if (!VALID_TRACKING.includes(tracking)) {
      throw httpError(400, `Hisob turi noto'g'ri. Ruxsat etilgan: ${VALID_TRACKING.join(", ")}`);
    }
    out.tracking = tracking;
  }

  const effectiveTracking = out.tracking || current?.tracking || "individual";
  if (body.quantity !== undefined || !isPatch) {
    if (effectiveTracking === "individual" && (body.quantity === undefined || body.quantity === null || body.quantity === "")) {
      out.quantity = 1;
    } else {
      const q = cleanNumber(body.quantity ?? 1, "Miqdor (quantity)", { min: 0.01, allowNull: false });
      out.quantity = effectiveTracking === "individual" ? 1 : q;
    }
  } else if (effectiveTracking === "individual") {
    out.quantity = 1;
  }

  if (body.unit !== undefined || !isPatch) {
    out.unit = cleanStr(body.unit || "dona", 32) || "dona";
  }

  if (body.brand !== undefined || !isPatch) out.brand = cleanStr(body.brand, 120);
  if (body.model !== undefined || !isPatch) out.model = cleanStr(body.model, 120);
  if (body.serial_no !== undefined || !isPatch) out.serial_no = cleanStr(body.serial_no, 120);
  if (body.mac_address !== undefined || !isPatch) out.mac_address = cleanMacAddress(body.mac_address);
  if (body.responsible_ref !== undefined || !isPatch) out.responsible_ref = cleanStr(body.responsible_ref, 128);
  if (body.responsible_name !== undefined || !isPatch) out.responsible_name = cleanStr(body.responsible_name, 200);

  if (body.status !== undefined || !isPatch) {
    const st = body.status ? cleanStr(body.status, 32) : (current?.status || "in_use");
    if (!VALID_STATUSES.includes(st)) {
      throw httpError(400, `Holat (status) noto'g'ri. Ruxsat etilgan: ${VALID_STATUSES.join(", ")}`);
    }
    out.status = st;
  }

  if (body.condition !== undefined || !isPatch) {
    const cond = body.condition ? cleanStr(body.condition, 32) : (current?.condition || "good");
    if (!VALID_CONDITIONS.includes(cond)) {
      throw httpError(400, `Yaroqlilik darajasi (condition) noto'g'ri. Ruxsat etilgan: ${VALID_CONDITIONS.join(", ")}`);
    }
    out.condition = cond;
  }

  if (body.acquisition_type !== undefined || !isPatch) {
    const acq = body.acquisition_type ? cleanStr(body.acquisition_type, 32) : (current?.acquisition_type || "purchase");
    if (!VALID_ACQUISITION_TYPES.includes(acq)) {
      throw httpError(400, `Kirim turi (acquisition_type) noto'g'ri. Ruxsat etilgan: ${VALID_ACQUISITION_TYPES.join(", ")}`);
    }
    out.acquisition_type = acq;
  }

  if (body.acquired_at !== undefined || !isPatch) {
    out.acquired_at = cleanDate(body.acquired_at, "Olingan sana (acquired_at)");
  }

  if (body.purchase_price !== undefined || !isPatch) {
    out.purchase_price = cleanNumber(body.purchase_price, "Xarid narxi (purchase_price)", { min: 0, allowNull: true });
  }

  if (body.currency !== undefined || !isPatch) {
    const cur = body.currency ? cleanStr(body.currency, 8)?.toUpperCase() : (current?.currency || "TRY");
    if (!VALID_CURRENCIES.includes(cur)) {
      throw httpError(400, `Valyuta (currency) faqat TRY yoki USD bo'lishi mumkin`);
    }
    out.currency = cur;
  }

  if (body.supplier !== undefined || !isPatch) out.supplier = cleanStr(body.supplier, 200);
  if (body.expense_ref !== undefined || !isPatch) out.expense_ref = cleanStr(body.expense_ref, 128);
  if (body.donor_name !== undefined || !isPatch) out.donor_name = cleanStr(body.donor_name, 200);
  if (body.donation_doc_no !== undefined || !isPatch) out.donation_doc_no = cleanStr(body.donation_doc_no, 120);
  if (body.warranty_until !== undefined || !isPatch) {
    out.warranty_until = cleanDate(body.warranty_until, "Kafolat muddati (warranty_until)");
  }
  if (body.notes !== undefined || !isPatch) out.notes = cleanStr(body.notes, 2000);

  return out;
}

const ASSET_SELECT_SQL = `
  SELECT
    a.*,
    a.quantity::float AS quantity,
    a.purchase_price::float AS purchase_price,
    TO_CHAR(a.acquired_at, 'YYYY-MM-DD') AS acquired_at_str,
    TO_CHAR(a.warranty_until, 'YYYY-MM-DD') AS warranty_until_str,
    c.name AS category_name,
    c.code AS category_code,
    i.name AS institution_name,
    i.code AS institution_code,
    l.name AS location_name,
    l.code AS location_code,
    l.kind AS location_kind,
    lp.name AS location_parent_name,
    (SELECT ph.id FROM vaqf.asset_photos ph WHERE ph.asset_id = a.id ORDER BY ph.is_primary DESC, ph.id ASC LIMIT 1) AS primary_photo_id,
    (SELECT COUNT(*)::int FROM vaqf.asset_photos ph WHERE ph.asset_id = a.id) AS photos_count,
    (SELECT COUNT(*)::int FROM vaqf.asset_documents dc WHERE dc.asset_id = a.id) AS documents_count
  FROM vaqf.assets a
  JOIN vaqf.asset_categories c ON c.id = a.category_id
  JOIN vaqf.institutions i ON i.id = a.institution_id
  LEFT JOIN vaqf.locations l ON l.id = a.location_id
  LEFT JOIN vaqf.locations lp ON lp.id = l.parent_id
`;

export async function listAssets(filters = {}) {
  const params = [];
  const conds = [`a.deleted_at IS NULL`];

  if (filters.institution_id) {
    params.push(cleanPositiveInt(filters.institution_id, "Muassasa ID", { allowNull: false }));
    conds.push(`a.institution_id = $${params.length}`);
  }

  if (filters.location_id === "unassigned") {
    conds.push(`a.location_id IS NULL`);
  } else if (filters.location_id) {
    const locId = cleanPositiveInt(filters.location_id, "Joy ID", { allowNull: false });
    params.push(locId);
    conds.push(`a.location_id IN (
      WITH RECURSIVE sub AS (
        SELECT id FROM vaqf.locations WHERE id = $${params.length}
        UNION ALL
        SELECT l2.id FROM vaqf.locations l2 JOIN sub s ON l2.parent_id = s.id WHERE l2.deleted_at IS NULL
      )
      SELECT id FROM sub
    )`);
  }

  if (filters.category_id) {
    const catId = cleanPositiveInt(filters.category_id, "Kategoriya ID", { allowNull: false });
    params.push(catId);
    conds.push(`a.category_id IN (
      WITH RECURSIVE subc AS (
        SELECT id FROM vaqf.asset_categories WHERE id = $${params.length}
        UNION ALL
        SELECT c2.id FROM vaqf.asset_categories c2 JOIN subc sc ON c2.parent_id = sc.id
      )
      SELECT id FROM subc
    )`);
  }

  if (filters.status) {
    const st = cleanStr(filters.status, 32);
    if (!VALID_STATUSES.includes(st)) throw httpError(400, "Holat filtri noto'g'ri");
    params.push(st);
    conds.push(`a.status = $${params.length}`);
  }

  if (filters.condition) {
    const cd = cleanStr(filters.condition, 32);
    if (!VALID_CONDITIONS.includes(cd)) throw httpError(400, "Yaroqlilik filtri noto'g'ri");
    params.push(cd);
    conds.push(`a.condition = $${params.length}`);
  }

  if (filters.tracking) {
    const tr = cleanStr(filters.tracking, 20);
    if (!VALID_TRACKING.includes(tr)) throw httpError(400, "Hisob turi filtri noto'g'ri");
    params.push(tr);
    conds.push(`a.tracking = $${params.length}`);
  }

  if (filters.acquisition_type) {
    const acq = cleanStr(filters.acquisition_type, 32);
    if (!VALID_ACQUISITION_TYPES.includes(acq)) throw httpError(400, "Kirim turi filtri noto'g'ri");
    params.push(acq);
    conds.push(`a.acquisition_type = $${params.length}`);
  }

  if (filters.responsible === "unassigned") {
    conds.push(`(a.responsible_name IS NULL OR BTRIM(a.responsible_name) = '')`);
  } else if (filters.responsible) {
    const resp = cleanStr(filters.responsible, 200);
    params.push(resp);
    params.push(`%${resp}%`);
    conds.push(`(a.responsible_ref = $${params.length - 1} OR a.responsible_name ILIKE $${params.length})`);
  }

  if (filters.search) {
    const q = cleanStr(filters.search, 200);
    if (q) {
      params.push(`%${q}%`);
      const pIdx = params.length;
      const hexQuery = q.replace(/[:\-.\s]/g, "").toUpperCase();
      let macHexClause = "";
      if (/^[0-9A-F]{2,12}$/.test(hexQuery)) {
        params.push(`%${hexQuery}%`);
        macHexClause = ` OR REPLACE(COALESCE(a.mac_address, ''), ':', '') ILIKE $${params.length}`;
      }
      conds.push(`(
        a.inventory_no ILIKE $${pIdx} OR
        a.name ILIKE $${pIdx} OR
        COALESCE(a.brand, '') ILIKE $${pIdx} OR
        COALESCE(a.model, '') ILIKE $${pIdx} OR
        COALESCE(a.serial_no, '') ILIKE $${pIdx} OR
        COALESCE(a.mac_address, '') ILIKE $${pIdx} OR
        COALESCE(a.responsible_name, '') ILIKE $${pIdx} OR
        COALESCE(a.donor_name, '') ILIKE $${pIdx} OR
        COALESCE(a.notes, '') ILIKE $${pIdx} OR
        COALESCE(l.name, '') ILIKE $${pIdx}${macHexClause}
      )`);
    }
  }

  const whereSql = `WHERE ${conds.join(" AND ")}`;

  const countRes = await query(
    `SELECT
       COUNT(*)::int AS total,
       COALESCE(SUM(a.quantity), 0)::float AS total_quantity,
       COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS total_value_try,
       COALESCE(SUM(CASE WHEN a.currency = 'USD' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS total_value_usd
     FROM vaqf.assets a
     LEFT JOIN vaqf.locations l ON l.id = a.location_id
     ${whereSql}`,
    params
  );

  const page = Math.max(1, Number.parseInt(filters.page || "1", 10) || 1);
  const limit = Math.min(500, Math.max(1, Number.parseInt(filters.limit || "50", 10) || 50));
  const offset = (page - 1) * limit;

  const listParams = [...params, limit, offset];
  const itemsRes = await query(
    `${ASSET_SELECT_SQL}
     ${whereSql}
     ORDER BY a.id DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  const stats = countRes.rows[0] || { total: 0, total_quantity: 0, total_value_try: 0, total_value_usd: 0 };
  return {
    items: itemsRes.rows,
    total: stats.total,
    totalQuantity: stats.total_quantity,
    totalValueTry: stats.total_value_try,
    totalValueUsd: stats.total_value_usd,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(stats.total / limit)),
  };
}

export async function getAssetDetail(idOrCode, { byCode = false } = {}) {
  let assetRow = null;
  if (byCode) {
    const code = cleanStr(idOrCode, 64)?.toUpperCase();
    if (!code) throw httpError(400, "Inventar raqami ko'rsatilmadi");
    const res = await query(`${ASSET_SELECT_SQL} WHERE UPPER(a.inventory_no) = $1 AND a.deleted_at IS NULL LIMIT 1`, [code]);
    assetRow = res.rows[0];
  } else {
    const assetId = cleanPositiveInt(idOrCode, "Buyum ID", { allowNull: false });
    const res = await query(`${ASSET_SELECT_SQL} WHERE a.id = $1 AND a.deleted_at IS NULL LIMIT 1`, [assetId]);
    assetRow = res.rows[0];
  }
  if (!assetRow) throw httpError(404, "Mulk kartochkasi topilmadi");

  const [photosRes, docsRes, eventsRes, lifecycleDocsRes, activeAssignsRes, schedulesRes] = await Promise.all([
    query(
      `SELECT id, asset_id, file_name, mime_type, file_size, caption, is_primary, uploaded_by, uploaded_by_name, created_at
       FROM vaqf.asset_photos
       WHERE asset_id = $1
       ORDER BY is_primary DESC, id ASC`,
      [assetRow.id]
    ),
    query(
      `SELECT id, asset_id, file_name, doc_type, mime_type, file_size, title, uploaded_by, uploaded_by_name, created_at
       FROM vaqf.asset_documents
       WHERE asset_id = $1
       ORDER BY id DESC`,
      [assetRow.id]
    ),
    query(
      `SELECT
         ev.id, ev.asset_id, ev.document_id, d.doc_no, d.type AS doc_type,
         ev.event_type, ev.old_value, ev.new_value, ev.note,
         ev.actor_id, ev.actor_name, ev.created_at
       FROM vaqf.asset_events ev
       LEFT JOIN vaqf.documents d ON d.id = ev.document_id
       WHERE ev.asset_id = $1
       ORDER BY ev.created_at DESC, ev.id DESC
       LIMIT 100`,
      [assetRow.id]
    ),
    query(
      `SELECT
         d.id, d.doc_no, d.type, d.status, d.created_by_name,
         d.from_person_name, d.to_person_name,
         fl.name AS from_location_name, tl.name AS to_location_name,
         d.reason, d.created_at, d.completed_at,
         di.qty::float AS qty, di.condition_before, di.condition_after
       FROM vaqf.document_items di
       JOIN vaqf.documents d ON d.id = di.document_id
       LEFT JOIN vaqf.locations fl ON fl.id = d.from_location_id
       LEFT JOIN vaqf.locations tl ON tl.id = d.to_location_id
       WHERE di.asset_id = $1
       ORDER BY d.created_at DESC, d.id DESC`,
      [assetRow.id]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT
         asg.id, asg.person_ref, asg.person_name,
         (asg.qty - COALESCE(asg.returned_qty, 0))::float AS qty,
         asg.assigned_at, TO_CHAR(asg.expected_return_at, 'YYYY-MM-DD') AS expected_return_at,
         asg.assign_doc_id, d.doc_no
       FROM vaqf.assignments asg
       LEFT JOIN vaqf.documents d ON d.id = asg.assign_doc_id
       WHERE asg.asset_id = $1 AND asg.returned_at IS NULL
       ORDER BY asg.assigned_at DESC`,
      [assetRow.id]
    ).catch(() => ({ rows: [] })),
    query(
      `SELECT
         s.*,
         TO_CHAR(s.next_due, 'YYYY-MM-DD') AS next_due_str,
         (s.next_due - (NOW() AT TIME ZONE 'Europe/Istanbul')::date)::int AS days_until_due
       FROM vaqf.schedules s
       WHERE s.asset_id = $1 AND s.is_active = TRUE
       ORDER BY s.next_due ASC`,
      [assetRow.id]
    ).catch(() => ({ rows: [] })),
  ]);

  return {
    ...assetRow,
    photos: photosRes.rows.map((p) => ({
      ...p,
      url: `/vaqf-api/files/photos/${p.id}`,
    })),
    documents: docsRes.rows.map((d) => ({
      ...d,
      url: `/vaqf-api/files/documents/${d.id}`,
    })),
    events: eventsRes.rows.map((ev) => ({
      ...ev,
      pdf_url: ev.document_id ? `/vaqf-api/documents/${ev.document_id}/pdf` : null,
    })),
    lifecycle_documents: lifecycleDocsRes.rows.map((d) => ({
      ...d,
      pdf_url: `/vaqf-api/documents/${d.id}/pdf`,
    })),
    active_assignments: activeAssignsRes.rows.map((a) => ({
      ...a,
      pdf_url: a.assign_doc_id ? `/vaqf-api/documents/${a.assign_doc_id}/pdf` : null,
    })),
    schedules: schedulesRes.rows,
  };
}

export async function createAsset(body, actor) {
  const data = validateAssetPayload(body, { isPatch: false });

  const catRes = await query(`SELECT id, tracking, default_unit FROM vaqf.asset_categories WHERE id = $1`, [data.category_id]);
  const cat = catRes.rows[0];
  if (!cat) throw httpError(400, "Tanlangan kategoriya mavjud emas");

  if (!body.tracking) {
    data.tracking = cat.tracking || "individual";
    if (data.tracking === "individual") data.quantity = 1;
  }
  if (!body.unit && cat.default_unit) {
    data.unit = cat.default_unit;
  }

  const instRes = await query(`SELECT id FROM vaqf.institutions WHERE id = $1`, [data.institution_id]);
  if (!instRes.rows[0]) throw httpError(400, "Tanlangan muassasa mavjud emas");

  if (data.location_id) {
    const locRes = await query(`SELECT id FROM vaqf.locations WHERE id = $1 AND deleted_at IS NULL`, [data.location_id]);
    if (!locRes.rows[0]) throw httpError(400, "Tanlangan joy mavjud emas");
  }

  if (data.mac_address) {
    const dupMac = await query(
      `SELECT id, inventory_no, name FROM vaqf.assets WHERE UPPER(mac_address) = $1 AND deleted_at IS NULL LIMIT 1`,
      [data.mac_address]
    );
    if (dupMac.rows[0]) {
      throw httpError(
        409,
        `Ushbu MAC manzil (${data.mac_address}) boshqa buyumga biriktirilgan: ${dupMac.rows[0].inventory_no} — "${dupMac.rows[0].name}"`
      );
    }
  }

  const createdId = await withTransaction(async (tx) => {
    let insRes;
    try {
      insRes = await tx.query(
        `INSERT INTO vaqf.assets (
           inventory_no, name, category_id, description,
           tracking, quantity, unit, brand, model, serial_no, mac_address,
           institution_id, location_id, responsible_ref, responsible_name,
           status, condition, acquisition_type, acquired_at,
           purchase_price, currency, supplier, expense_ref,
           donor_name, donation_doc_no, warranty_until, notes, created_by
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8, $9, $10, $11,
           $12, $13, $14, $15,
           $16, $17, $18, $19,
           $20, $21, $22, $23,
           $24, $25, $26, $27, $28
         ) RETURNING *`,
        [
          data.inventory_no || null,
          data.name,
          data.category_id,
          data.description,
          data.tracking,
          data.quantity,
          data.unit,
          data.brand,
          data.model,
          data.serial_no,
          data.mac_address || null,
          data.institution_id,
          data.location_id,
          data.responsible_ref,
          data.responsible_name,
          data.status,
          data.condition,
          data.acquisition_type,
          data.acquired_at,
          data.purchase_price,
          data.currency,
          data.supplier,
          data.expense_ref,
          data.donor_name,
          data.donation_doc_no,
          data.warranty_until,
          data.notes,
          actor?.actorId || null,
        ]
      );
    } catch (e) {
      if (e.code === "23505") {
        if (String(e.constraint || "").includes("mac")) {
          throw httpError(409, `Bunday MAC manzilli (${data.mac_address}) buyum allaqachon mavjud`);
        }
        throw httpError(409, `Bunday inventar raqamli (${data.inventory_no}) buyum allaqachon mavjud`);
      }
      throw e;
    }

    const row = insRes.rows[0];
    await recordAssetEvent(tx, {
      assetId: row.id,
      eventType: "created",
      oldValue: null,
      newValue: {
        inventory_no: row.inventory_no,
        name: row.name,
        category_id: row.category_id,
        tracking: row.tracking,
        quantity: Number(row.quantity),
        location_id: row.location_id,
        responsible_name: row.responsible_name,
        mac_address: row.mac_address || null,
        status: row.status,
        condition: row.condition,
        acquisition_type: row.acquisition_type,
        purchase_price: row.purchase_price !== null ? Number(row.purchase_price) : null,
        currency: row.currency,
      },
      note: "Yangi mulk kartochkasi yaratildi",
      actor,
    });
    if (row.warranty_until) {
      await ensureWarrantyScheduleForAsset(tx, row, actor);
    }
    return row.id;
  });

  return getAssetDetail(createdId);
}

export async function updateAsset(id, body, actor) {
  const assetId = cleanPositiveInt(id, "Buyum ID", { allowNull: false });
  const curRes = await query(`SELECT * FROM vaqf.assets WHERE id = $1 AND deleted_at IS NULL`, [assetId]);
  const cur = curRes.rows[0];
  if (!cur) throw httpError(404, "Mulk kartochkasi topilmadi");

  const patch = validateAssetPayload(body, { isPatch: true, current: cur });
  if (Object.keys(patch).length === 0) {
    return getAssetDetail(assetId);
  }

  if (patch.category_id) {
    const cRes = await query(`SELECT id FROM vaqf.asset_categories WHERE id = $1`, [patch.category_id]);
    if (!cRes.rows[0]) throw httpError(400, "Tanlangan kategoriya topilmadi");
  }
  if (patch.location_id) {
    const lRes = await query(`SELECT id FROM vaqf.locations WHERE id = $1 AND deleted_at IS NULL`, [patch.location_id]);
    if (!lRes.rows[0]) throw httpError(400, "Tanlangan joy topilmadi");
  }
  if (patch.mac_address) {
    const dupMac = await query(
      `SELECT id, inventory_no, name FROM vaqf.assets WHERE UPPER(mac_address) = $1 AND id <> $2 AND deleted_at IS NULL LIMIT 1`,
      [patch.mac_address, assetId]
    );
    if (dupMac.rows[0]) {
      throw httpError(
        409,
        `Ushbu MAC manzil (${patch.mac_address}) boshqa buyumga biriktirilgan: ${dupMac.rows[0].inventory_no} — "${dupMac.rows[0].name}"`
      );
    }
  }

  const fields = [
    "name", "category_id", "description", "tracking", "quantity", "unit",
    "brand", "model", "serial_no", "mac_address", "institution_id", "location_id",
    "responsible_ref", "responsible_name", "status", "condition",
    "acquisition_type", "acquired_at", "purchase_price", "currency",
    "supplier", "expense_ref", "donor_name", "donation_doc_no",
    "warranty_until", "notes"
  ];

  const oldDiff = {};
  const newDiff = {};
  const setClauses = [];
  const params = [];

  const normVal = (k, v) => {
    if (v === null || v === undefined) return null;
    if (k === "acquired_at" || k === "warranty_until") {
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v).slice(0, 10);
    }
    if (k === "quantity" || k === "purchase_price") return Number(v);
    return v;
  };

  for (const f of fields) {
    if (patch[f] !== undefined) {
      const oldV = normVal(f, cur[f]);
      const newV = normVal(f, patch[f]);
      if (oldV !== newV) {
        oldDiff[f] = oldV;
        newDiff[f] = newV;
        params.push(patch[f]);
        setClauses.push(`${f} = $${params.length}`);
      }
    }
  }

  if (setClauses.length === 0) {
    return getAssetDetail(assetId);
  }

  // Block changing location or quantity while asset is part of an in_progress inventory count
  if (newDiff.location_id !== undefined || newDiff.quantity !== undefined) {
    const lockRes = await query(
      `SELECT c.code, c.title
       FROM vaqf.inventory_count_items i
       JOIN vaqf.inventory_counts c ON c.id = i.count_id
       WHERE i.asset_id = $1 AND c.status = 'in_progress'
       LIMIT 1`,
      [assetId]
    );
    if (lockRes.rowCount > 0) {
      const lc = lockRes.rows[0];
      throw httpError(
        409,
        `Ushbu buyum hozirda davom etayotgan inventarizatsiya (${lc.code} — "${lc.title}") qamrovida. Sanoq yopilgunga qadar buyumning joyi yoki miqdorini oddiy tahrirlab bo'lmaydi.`
      );
    }
  }

  await withTransaction(async (tx) => {
    params.push(assetId);
    await tx.query(
      `UPDATE vaqf.assets SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`,
      params
    );

    if (newDiff.location_id !== undefined) {
      await recordAssetEvent(tx, {
        assetId,
        eventType: "location_changed",
        oldValue: { location_id: oldDiff.location_id },
        newValue: { location_id: newDiff.location_id },
        note: body.event_note || "Joylashuvi o'zgartirildi",
        actor,
      });
    }
    if (newDiff.responsible_name !== undefined || newDiff.responsible_ref !== undefined) {
      await recordAssetEvent(tx, {
        assetId,
        eventType: "responsible_changed",
        oldValue: { responsible_ref: cur.responsible_ref, responsible_name: cur.responsible_name },
        newValue: {
          responsible_ref: patch.responsible_ref !== undefined ? patch.responsible_ref : cur.responsible_ref,
          responsible_name: patch.responsible_name !== undefined ? patch.responsible_name : cur.responsible_name,
        },
        note: body.event_note || "Javobgar xodim o'zgartirildi",
        actor,
      });
    }
    if (newDiff.status !== undefined) {
      await recordAssetEvent(tx, {
        assetId,
        eventType: "status_changed",
        oldValue: { status: oldDiff.status },
        newValue: { status: newDiff.status },
        note: body.event_note || "Buyum holati o'zgartirildi",
        actor,
      });
    }

    await recordAssetEvent(tx, {
      assetId,
      eventType: "updated",
      oldValue: oldDiff,
      newValue: newDiff,
      note: body.event_note || "Kartochka tahrirlandi",
      actor,
    });

    if (newDiff.warranty_until !== undefined && patch.warranty_until) {
      const updAssetRes = await tx.query(`SELECT * FROM vaqf.assets WHERE id = $1`, [assetId]);
      if (updAssetRes.rows[0]) {
        await ensureWarrantyScheduleForAsset(tx, updAssetRes.rows[0], actor);
      }
    }
  });

  return getAssetDetail(assetId);
}

export async function softDeleteAsset(id, actor, reason = null) {
  const assetId = cleanPositiveInt(id, "Buyum ID", { allowNull: false });
  const curRes = await query(`SELECT id, inventory_no, name FROM vaqf.assets WHERE id = $1 AND deleted_at IS NULL`, [assetId]);
  const cur = curRes.rows[0];
  if (!cur) throw httpError(404, "Mulk kartochkasi topilmadi");

  const lockRes = await query(
    `SELECT c.code, c.title
     FROM vaqf.inventory_count_items i
     JOIN vaqf.inventory_counts c ON c.id = i.count_id
     WHERE i.asset_id = $1 AND c.status = 'in_progress'
     LIMIT 1`,
    [assetId]
  );
  if (lockRes.rowCount > 0) {
    throw httpError(
      409,
      `Ushbu buyum davom etayotgan inventarizatsiya (${lockRes.rows[0].code}) qamrovida bo'lgani uchun o'chirib bo'lmaydi.`
    );
  }

  await withTransaction(async (tx) => {
    await tx.query(`UPDATE vaqf.assets SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [assetId]);
    await recordAssetEvent(tx, {
      assetId,
      eventType: "deleted",
      oldValue: { inventory_no: cur.inventory_no, name: cur.name },
      newValue: { deleted_at: new Date().toISOString() },
      note: cleanStr(reason, 500) || "Yumshoq o'chirildi (soft delete)",
      actor,
    });
  });

  return { success: true, id: assetId };
}

// ============================================================================
// PHOTOS & DOCUMENTS UPLOAD / SERVE
// ============================================================================
function parseBase64DataUrl(dataUrl, fallbackMime = "") {
  const str = String(dataUrl || "").trim();
  const m = str.match(/^data:([^;]+);base64,(.+)$/s);
  if (m) {
    return { mimeType: m[1].toLowerCase().trim(), buffer: Buffer.from(m[2], "base64") };
  }
  return { mimeType: String(fallbackMime || "").toLowerCase().trim(), buffer: Buffer.from(str, "base64") };
}

export async function addAssetPhoto(assetIdRaw, body, actor) {
  const assetId = cleanPositiveInt(assetIdRaw, "Buyum ID", { allowNull: false });
  const aRes = await query(`SELECT id, inventory_no FROM vaqf.assets WHERE id = $1 AND deleted_at IS NULL`, [assetId]);
  if (!aRes.rows[0]) throw httpError(404, "Mulk kartochkasi topilmadi");

  const rawData = body.dataUrl || body.data || body.fileBase64;
  if (!rawData) throw httpError(400, "Rasm fayli yuborilmadi (dataUrl majburiy)");

  const { mimeType, buffer } = parseBase64DataUrl(rawData, body.mimeType || body.mime_type);
  const ext = ALLOWED_PHOTO_MIMES.get(mimeType);
  if (!ext) {
    throw httpError(400, "Faqat JPG, PNG yoki WEBP formatidagi rasmlarga ruxsat beriladi");
  }
  if (!buffer || buffer.length === 0) {
    throw httpError(400, "Bo'sh rasm fayli");
  }
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw httpError(413, "Rasm hajmi 10 MB dan oshmasligi kerak");
  }

  const safeOrigName = cleanStr(body.fileName || body.file_name || `photo${ext}`, 200) || `photo${ext}`;
  const storedFile = `asset_${assetId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
  const fullPath = path.join(PHOTOS_DIR, storedFile);
  await fsp.writeFile(fullPath, buffer, { mode: 0o640 });

  const caption = cleanStr(body.caption, 255);
  const isPrimary = Boolean(body.is_primary);

  const photoRow = await withTransaction(async (tx) => {
    const cntRes = await tx.query(`SELECT COUNT(*)::int AS cnt FROM vaqf.asset_photos WHERE asset_id = $1`, [assetId]);
    const makePrimary = isPrimary || cntRes.rows[0]?.cnt === 0;
    if (makePrimary) {
      await tx.query(`UPDATE vaqf.asset_photos SET is_primary = FALSE WHERE asset_id = $1`, [assetId]);
    }
    const ins = await tx.query(
      `INSERT INTO vaqf.asset_photos (asset_id, file_path, file_name, mime_type, file_size, caption, is_primary, uploaded_by, uploaded_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, asset_id, file_name, mime_type, file_size, caption, is_primary, uploaded_by, uploaded_by_name, created_at`,
      [assetId, fullPath, safeOrigName, mimeType, buffer.length, caption, makePrimary, actor?.actorId || null, actor?.actorName || null]
    );
    await recordAssetEvent(tx, {
      assetId,
      eventType: "photo_added",
      oldValue: null,
      newValue: { photo_id: ins.rows[0].id, file_name: safeOrigName, file_size: buffer.length },
      note: caption || "Rasm yuklandi",
      actor,
    });
    return ins.rows[0];
  });

  return { ...photoRow, url: `/vaqf-api/files/photos/${photoRow.id}` };
}

export async function addAssetDocument(assetIdRaw, body, actor) {
  const assetId = cleanPositiveInt(assetIdRaw, "Buyum ID", { allowNull: false });
  const aRes = await query(`SELECT id, inventory_no FROM vaqf.assets WHERE id = $1 AND deleted_at IS NULL`, [assetId]);
  if (!aRes.rows[0]) throw httpError(404, "Mulk kartochkasi topilmadi");

  const rawData = body.dataUrl || body.data || body.fileBase64;
  if (!rawData) throw httpError(400, "Hujjat fayli yuborilmadi (dataUrl majburiy)");

  const { mimeType, buffer } = parseBase64DataUrl(rawData, body.mimeType || body.mime_type);
  const ext = ALLOWED_DOC_MIMES.get(mimeType);
  if (!ext) {
    throw httpError(400, "Faqat PDF, rasm (JPG/PNG/WEBP), Excel (XLSX) yoki Word (DOCX) hujjatlariga ruxsat beriladi");
  }
  if (!buffer || buffer.length === 0) {
    throw httpError(400, "Bo'sh hujjat fayli");
  }
  if (buffer.length > MAX_DOC_BYTES) {
    throw httpError(413, "Hujjat hajmi 15 MB dan oshmasligi kerak");
  }

  const docType = body.doc_type ? cleanStr(body.doc_type, 64) : "other";
  if (!VALID_DOC_TYPES.includes(docType)) {
    throw httpError(400, `Hujjat turi noto'g'ri. Ruxsat etilgan: ${VALID_DOC_TYPES.join(", ")}`);
  }

  const safeOrigName = cleanStr(body.fileName || body.file_name || `document${ext}`, 200) || `document${ext}`;
  const title = cleanStr(body.title || safeOrigName, 255);
  const storedFile = `doc_${assetId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
  const fullPath = path.join(DOCS_DIR, storedFile);
  await fsp.writeFile(fullPath, buffer, { mode: 0o640 });

  const docRow = await withTransaction(async (tx) => {
    const ins = await tx.query(
      `INSERT INTO vaqf.asset_documents (asset_id, file_path, file_name, doc_type, mime_type, file_size, title, uploaded_by, uploaded_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, asset_id, file_name, doc_type, mime_type, file_size, title, uploaded_by, uploaded_by_name, created_at`,
      [assetId, fullPath, safeOrigName, docType, mimeType, buffer.length, title, actor?.actorId || null, actor?.actorName || null]
    );
    await recordAssetEvent(tx, {
      assetId,
      eventType: "document_added",
      oldValue: null,
      newValue: { document_id: ins.rows[0].id, title, doc_type: docType, file_name: safeOrigName },
      note: `Hujjat yuklandi: ${title}`,
      actor,
    });
    return ins.rows[0];
  });

  return { ...docRow, url: `/vaqf-api/files/documents/${docRow.id}` };
}

export async function getProtectedFile(kind, idRaw) {
  const fileId = cleanPositiveInt(idRaw, "Fayl ID", { allowNull: false });
  if (kind === "photos") {
    const res = await query(`SELECT file_path, file_name, mime_type FROM vaqf.asset_photos WHERE id = $1`, [fileId]);
    const row = res.rows[0];
    if (!row) throw httpError(404, "Rasm topilmadi");
    const resolved = path.resolve(row.file_path);
    if (!resolved.startsWith(path.resolve(VAQF_STORAGE_DIR))) {
      throw httpError(403, "Ruxsat etilmagan fayl yo'li");
    }
    return row;
  }
  if (kind === "documents") {
    const res = await query(`SELECT file_path, file_name, mime_type FROM vaqf.asset_documents WHERE id = $1`, [fileId]);
    const row = res.rows[0];
    if (!row) throw httpError(404, "Hujjat topilmadi");
    const resolved = path.resolve(row.file_path);
    if (!resolved.startsWith(path.resolve(VAQF_STORAGE_DIR))) {
      throw httpError(403, "Ruxsat etilmagan fayl yo'li");
    }
    return row;
  }
  throw httpError(400, "Noto'g'ri fayl turi");
}

// ============================================================================
// REPORTS SUMMARY
// ============================================================================
export async function getSummaryReport({ institutionId = null } = {}) {
  const params = [];
  let instCond = "";
  if (institutionId) {
    params.push(cleanPositiveInt(institutionId, "Muassasa ID", { allowNull: false }));
    instCond = ` AND a.institution_id = $1`;
  }

  const [totalsRes, byStatusRes, byCategoryRes, byLocationRes, byInstitutionRes, recentRes] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS total_cards,
         COALESCE(SUM(a.quantity), 0)::float AS total_items,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS total_value_try,
         COALESCE(SUM(CASE WHEN a.currency = 'USD' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS total_value_usd,
         COUNT(*) FILTER (WHERE a.location_id IS NULL)::int AS unassigned_location_count,
         COUNT(*) FILTER (WHERE a.responsible_name IS NULL OR BTRIM(a.responsible_name) = '')::int AS unassigned_responsible_count,
         COUNT(*) FILTER (WHERE a.acquisition_type = 'donation')::int AS donation_count,
         COUNT(*) FILTER (WHERE a.tracking = 'batch')::int AS batch_cards_count
       FROM vaqf.assets a
       WHERE a.deleted_at IS NULL ${instCond}`,
      params
    ),
    query(
      `SELECT
         a.status,
         COUNT(*)::int AS cards_count,
         COALESCE(SUM(a.quantity), 0)::float AS items_count,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_try,
         COALESCE(SUM(CASE WHEN a.currency = 'USD' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_usd
       FROM vaqf.assets a
       WHERE a.deleted_at IS NULL ${instCond}
       GROUP BY a.status
       ORDER BY cards_count DESC`,
      params
    ),
    query(
      `SELECT
         c.id AS category_id,
         c.name AS category_name,
         c.tracking,
         COUNT(a.id)::int AS cards_count,
         COALESCE(SUM(a.quantity), 0)::float AS items_count,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_try,
         COALESCE(SUM(CASE WHEN a.currency = 'USD' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_usd
       FROM vaqf.asset_categories c
       LEFT JOIN vaqf.assets a ON a.category_id = c.id AND a.deleted_at IS NULL ${instCond}
       GROUP BY c.id, c.name, c.tracking, c.sort_order
       HAVING COUNT(a.id) > 0
       ORDER BY items_count DESC, c.sort_order ASC`,
      params
    ),
    query(
      `SELECT
         COALESCE(l.id, 0) AS location_id,
         COALESCE(l.name, 'Joyi belgilanmagan') AS location_name,
         COALESCE(l.kind, 'unassigned') AS location_kind,
         lp.name AS parent_name,
         COUNT(a.id)::int AS cards_count,
         COALESCE(SUM(a.quantity), 0)::float AS items_count,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_try,
         COALESCE(SUM(CASE WHEN a.currency = 'USD' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_usd
       FROM vaqf.assets a
       LEFT JOIN vaqf.locations l ON l.id = a.location_id
       LEFT JOIN vaqf.locations lp ON lp.id = l.parent_id
       WHERE a.deleted_at IS NULL ${instCond}
       GROUP BY l.id, l.name, l.kind, lp.name
       ORDER BY cards_count DESC`,
      params
    ),
    query(
      `SELECT
         i.id AS institution_id,
         i.name AS institution_name,
         i.code AS institution_code,
         COUNT(a.id)::int AS cards_count,
         COALESCE(SUM(a.quantity), 0)::float AS items_count,
         COALESCE(SUM(CASE WHEN a.currency = 'TRY' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_try,
         COALESCE(SUM(CASE WHEN a.currency = 'USD' THEN COALESCE(a.purchase_price, 0) * a.quantity ELSE 0 END), 0)::float AS value_usd
       FROM vaqf.institutions i
       LEFT JOIN vaqf.assets a ON a.institution_id = i.id AND a.deleted_at IS NULL
       GROUP BY i.id, i.name, i.code
       ORDER BY i.id ASC`
    ),
    query(
      `${ASSET_SELECT_SQL}
       WHERE a.deleted_at IS NULL ${instCond}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 10`,
      params
    ),
  ]);

  return {
    totals: totalsRes.rows[0] || {
      total_cards: 0,
      total_items: 0,
      total_value_try: 0,
      total_value_usd: 0,
      unassigned_location_count: 0,
      unassigned_responsible_count: 0,
      donation_count: 0,
      batch_cards_count: 0,
    },
    byStatus: byStatusRes.rows,
    byCategory: byCategoryRes.rows,
    byLocation: byLocationRes.rows,
    byInstitution: byInstitutionRes.rows,
    recentAssets: recentRes.rows,
  };
}

// ============================================================================
// EXCEL / CSV IMPORT & EXPORT
// ============================================================================
function normalizeLookupKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[''`ʻʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateImportTemplateBuffer() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Mulk Import");
  ws.columns = [
    { header: "Nomi *", key: "name", width: 32 },
    { header: "Kategoriya *", key: "category", width: 24 },
    { header: "Hisob turi (individual/batch)", key: "tracking", width: 22 },
    { header: "Miqdori", key: "quantity", width: 12 },
    { header: "O'lchov birligi", key: "unit", width: 15 },
    { header: "Joy / Xona", key: "location", width: 24 },
    { header: "Javobgar xodim", key: "responsible_name", width: 26 },
    { header: "Holati (in_use/in_storage/under_repair/missing/written_off)", key: "status", width: 22 },
    { header: "Yaroqliligi (new/good/fair/poor)", key: "condition", width: 18 },
    { header: "Kirim turi (purchase/donation/transfer/unknown)", key: "acquisition_type", width: 20 },
    { header: "Olingan sana (YYYY-MM-DD)", key: "acquired_at", width: 20 },
    { header: "Narxi (dona uchun)", key: "purchase_price", width: 18 },
    { header: "Valyuta (TRY/USD)", key: "currency", width: 15 },
    { header: "Brend", key: "brand", width: 16 },
    { header: "Model", key: "model", width: 16 },
    { header: "Seriya raqami", key: "serial_no", width: 20 },
    { header: "MAC manzili (AA:BB:CC:DD:EE:FF)", key: "mac_address", width: 26 },
    { header: "Yetkazib beruvchi / Do'kon", key: "supplier", width: 22 },
    { header: "Homiysi (hadya bo'lsa)", key: "donor_name", width: 22 },
    { header: "Izoh", key: "notes", width: 30 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.addRow({
    name: "O'quv partasi (2 kishilik)",
    category: "Mebel",
    tracking: "batch",
    quantity: 12,
    unit: "dona",
    location: "301",
    responsible_name: "Umarkhon Abdulhamidov",
    status: "in_use",
    condition: "good",
    acquisition_type: "purchase",
    acquired_at: "2026-09-01",
    purchase_price: 2500,
    currency: "TRY",
    brand: "Burotime",
    model: "BT-200",
    serial_no: "",
    supplier: "Istanbul Mebel",
    donor_name: "",
    notes: "3-qavat 301-xona uchun",
  });
  ws.addRow({
    name: "Epson Proyektor",
    category: "Elektronika",
    tracking: "individual",
    quantity: 1,
    unit: "dona",
    location: "202",
    responsible_name: "Abu Bakr Tojiddinov",
    status: "in_use",
    condition: "new",
    acquisition_type: "donation",
    acquired_at: "2026-10-15",
    purchase_price: 650,
    currency: "USD",
    brand: "Epson",
    model: "EB-FH06",
    serial_no: "EPS-992831",
    mac_address: "A4:83:E7:19:4B:C2",
    supplier: "",
    donor_name: "Xayrixoh homiy",
    notes: "Hadya sifatida taqdim etilgan",
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function exportAssetsExcelBuffer(filters = {}) {
  const { items } = await listAssets({ ...filters, limit: 5000, page: 1 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Vaqf Mulk Ro'yxati");
  ws.columns = [
    { header: "Inventar №", key: "inventory_no", width: 18 },
    { header: "Buyum nomi", key: "name", width: 32 },
    { header: "Kategoriya", key: "category_name", width: 22 },
    { header: "Hisob turi", key: "tracking", width: 14 },
    { header: "Miqdori", key: "quantity", width: 12 },
    { header: "Birligi", key: "unit", width: 12 },
    { header: "Muassasa", key: "institution_name", width: 22 },
    { header: "Joy / Xona", key: "location_name", width: 24 },
    { header: "Javobgar", key: "responsible_name", width: 24 },
    { header: "Holati", key: "status", width: 15 },
    { header: "Yaroqliligi", key: "condition", width: 14 },
    { header: "Kirim turi", key: "acquisition_type", width: 15 },
    { header: "Olingan sana", key: "acquired_at_str", width: 15 },
    { header: "Narxi (dona)", key: "purchase_price", width: 15 },
    { header: "Jami qiymati", key: "total_price", width: 16 },
    { header: "Valyuta", key: "currency", width: 10 },
    { header: "Brend / Model", key: "brand_model", width: 22 },
    { header: "Seriya №", key: "serial_no", width: 18 },
    { header: "MAC manzili", key: "mac_address", width: 20 },
    { header: "Homiy / Yetkazuvchi", key: "source_party", width: 22 },
    { header: "Izoh", key: "notes", width: 28 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const it of items) {
    const unitPrice = it.purchase_price !== null ? Number(it.purchase_price) : null;
    const totalPrice = unitPrice !== null ? Number((unitPrice * Number(it.quantity || 1)).toFixed(2)) : null;
    ws.addRow({
      inventory_no: it.inventory_no,
      name: it.name,
      category_name: it.category_name,
      tracking: it.tracking === "batch" ? "Partiya (miqdoriy)" : "Donalab",
      quantity: Number(it.quantity || 1),
      unit: it.unit,
      institution_name: it.institution_name,
      location_name: it.location_name || "Belgilanmagan",
      responsible_name: it.responsible_name || "Belgilanmagan",
      status: it.status,
      condition: it.condition,
      acquisition_type: it.acquisition_type,
      acquired_at_str: it.acquired_at_str || "",
      purchase_price: unitPrice,
      total_price: totalPrice,
      currency: it.currency,
      brand_model: [it.brand, it.model].filter(Boolean).join(" "),
      serial_no: it.serial_no || "",
      mac_address: it.mac_address || "",
      source_party: it.donor_name || it.supplier || "",
      notes: it.notes || "",
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function parseCsvRows(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const splitLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === sep && !inQuotes) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };
  const headers = splitLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? "";
    });
    rows.push(obj);
  }
  return rows;
}

async function extractRawRowsFromImportPayload(body) {
  if (Array.isArray(body.rows)) {
    return body.rows;
  }
  if (body.csvText) {
    return parseCsvRows(body.csvText);
  }
  const rawData = body.dataUrl || body.fileBase64;
  if (!rawData) {
    throw httpError(400, "Import uchun fayl (dataUrl) yoki qatorlar (rows) yuborilmadi");
  }
  const { buffer } = parseBase64DataUrl(rawData, body.mimeType);
  const fileName = String(body.fileName || "").toLowerCase();
  if (fileName.endsWith(".csv")) {
    return parseCsvRows(buffer.toString("utf8"));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.text || cell.value || "").trim();
  });
  const out = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    let nonEmpty = false;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const h = headers[colNumber];
      if (!h) return;
      let val = cell.value;
      if (val && typeof val === "object" && val.text !== undefined) val = val.text;
      if (val instanceof Date) val = val.toISOString().slice(0, 10);
      const s = val !== null && val !== undefined ? String(val).trim() : "";
      if (s !== "") nonEmpty = true;
      obj[h] = s;
    });
    if (nonEmpty) out.push(obj);
  });
  return out;
}

function mapRawRowFields(raw) {
  const pick = (...keys) => {
    for (const k of Object.keys(raw)) {
      const nk = normalizeLookupKey(k).replace(/\s*\*\s*$/, "");
      for (const want of keys) {
        if (nk === want || nk.startsWith(want)) {
          return raw[k];
        }
      }
    }
    return undefined;
  };
  return {
    name: pick("nomi", "name", "buyum nomi"),
    category: pick("kategoriya", "category", "category_id"),
    tracking: pick("hisob turi", "tracking"),
    quantity: pick("miqdori", "miqdor", "soni", "quantity"),
    unit: pick("o'lchov birligi", "birligi", "unit"),
    location: pick("joy", "xona", "location", "location_id"),
    responsible_name: pick("javobgar", "responsible_name", "responsible"),
    status: pick("holati", "status"),
    condition: pick("yaroqliligi", "condition"),
    acquisition_type: pick("kirim turi", "manba", "acquisition_type"),
    acquired_at: pick("olingan sana", "sana", "acquired_at"),
    purchase_price: pick("narxi", "xarid narxi", "purchase_price", "price"),
    currency: pick("valyuta", "currency"),
    brand: pick("brend", "brand"),
    model: pick("model"),
    serial_no: pick("seriya", "serial_no", "serial"),
    mac_address: pick("mac", "mac manzili", "mac manzil", "mac_address", "mac adresi"),
    supplier: pick("yetkazib beruvchi", "supplier"),
    donor_name: pick("homiysi", "homiy", "donor_name", "donor"),
    notes: pick("izoh", "notes"),
  };
}

export async function previewOrCommitAssetImport(body, actor) {
  const mode = body.mode === "commit" ? "commit" : "preview";
  const institutionId = cleanPositiveInt(body.institution_id || 1, "Muassasa ID", { allowNull: false });
  const rawRows = await extractRawRowsFromImportPayload(body);
  if (!rawRows.length) {
    throw httpError(400, "Import faylida ma'lumot qatorlari topilmadi");
  }

  const [cats, locs] = await Promise.all([
    listCategories(),
    listLocations({ institutionId }),
  ]);

  const catByKey = new Map();
  for (const c of cats) {
    catByKey.set(String(c.id), c);
    catByKey.set(normalizeLookupKey(c.name), c);
    if (c.code) catByKey.set(normalizeLookupKey(c.code), c);
  }

  const locByKey = new Map();
  for (const l of locs) {
    locByKey.set(String(l.id), l);
    locByKey.set(normalizeLookupKey(l.name), l);
    if (l.code) locByKey.set(normalizeLookupKey(l.code), l);
  }

  const previewRows = [];
  const errors = [];

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2;
    const m = mapRawRowFields(raw);
    const rowErrors = [];

    const name = String(m.name || "").trim();
    if (!name) rowErrors.push("Buyum nomi kiritilmagan");

    const catKey = normalizeLookupKey(m.category);
    const cat = catByKey.get(catKey);
    if (!cat) {
      rowErrors.push(`Kategoriya topilmadi: "${m.category || ""}"`);
    }

    let loc = null;
    if (m.location !== undefined && String(m.location).trim() !== "") {
      const locKey = normalizeLookupKey(m.location);
      loc = locByKey.get(locKey) || locByKey.get(`${locKey}-xona`);
      if (!loc) {
        rowErrors.push(`Joy/xona topilmadi: "${m.location}"`);
      }
    }

    const trackingRaw = String(m.tracking || "").trim().toLowerCase();
    const tracking = trackingRaw
      ? (trackingRaw === "partiya" || trackingRaw === "batch" ? "batch" : trackingRaw === "donalab" || trackingRaw === "individual" ? "individual" : trackingRaw)
      : (cat?.tracking || "individual");
    if (!VALID_TRACKING.includes(tracking)) {
      rowErrors.push(`Hisob turi noto'g'ri: "${m.tracking}"`);
    }

    const qtyRaw = m.quantity !== undefined && String(m.quantity).trim() !== "" ? Number(m.quantity) : 1;
    if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) {
      rowErrors.push(`Miqdor noto'g'ri: "${m.quantity}"`);
    }

    const status = String(m.status || "").trim() || "in_use";
    if (!VALID_STATUSES.includes(status)) {
      rowErrors.push(`Holat noto'g'ri: "${status}"`);
    }

    const condition = String(m.condition || "").trim() || "good";
    if (!VALID_CONDITIONS.includes(condition)) {
      rowErrors.push(`Yaroqlilik noto'g'ri: "${condition}"`);
    }

    const acqType = String(m.acquisition_type || "").trim() || (m.donor_name ? "donation" : "purchase");
    if (!VALID_ACQUISITION_TYPES.includes(acqType)) {
      rowErrors.push(`Kirim turi noto'g'ri: "${acqType}"`);
    }

    let acquiredAt = null;
    if (m.acquired_at) {
      try {
        acquiredAt = cleanDate(m.acquired_at, "Olingan sana");
      } catch (e) {
        rowErrors.push(e.message);
      }
    }

    let purchasePrice = null;
    if (m.purchase_price !== undefined && String(m.purchase_price).trim() !== "") {
      const p = Number(String(m.purchase_price).replace(/,/g, ""));
      if (!Number.isFinite(p) || p < 0) {
        rowErrors.push(`Narx noto'g'ri: "${m.purchase_price}"`);
      } else {
        purchasePrice = p;
      }
    }

    const currency = String(m.currency || "TRY").trim().toUpperCase() || "TRY";
    if (!VALID_CURRENCIES.includes(currency)) {
      rowErrors.push(`Valyuta noto'g'ri: "${currency}" (TRY yoki USD bo'lishi kerak)`);
    }

    let macAddress = null;
    if (m.mac_address !== undefined && String(m.mac_address).trim() !== "") {
      try {
        macAddress = cleanMacAddress(m.mac_address);
      } catch (e) {
        rowErrors.push(e.message);
      }
    }

    const normalized = {
      rowNumber: rowNum,
      name,
      category_id: cat?.id || null,
      category_name: cat?.name || String(m.category || ""),
      tracking,
      quantity: tracking === "individual" ? 1 : qtyRaw,
      unit: String(m.unit || cat?.default_unit || "dona").trim() || "dona",
      institution_id: institutionId,
      location_id: loc?.id || null,
      location_name: loc?.name || (m.location ? String(m.location) : null),
      responsible_name: String(m.responsible_name || "").trim() || null,
      status,
      condition,
      acquisition_type: acqType,
      acquired_at: acquiredAt,
      purchase_price: purchasePrice,
      currency,
      brand: String(m.brand || "").trim() || null,
      model: String(m.model || "").trim() || null,
      serial_no: String(m.serial_no || "").trim() || null,
      mac_address: macAddress,
      supplier: String(m.supplier || "").trim() || null,
      donor_name: String(m.donor_name || "").trim() || null,
      notes: String(m.notes || "").trim() || null,
      valid: rowErrors.length === 0,
      errors: rowErrors,
    };

    previewRows.push(normalized);
    if (rowErrors.length > 0) {
      errors.push({ rowNumber: rowNum, name: name || `(Qator #${rowNum})`, errors: rowErrors });
    }
  });

  if (mode === "preview") {
    return {
      mode: "preview",
      totalRows: previewRows.length,
      validCount: previewRows.filter((r) => r.valid).length,
      errorCount: errors.length,
      rows: previewRows,
      errors,
    };
  }

  const validRows = previewRows.filter((r) => r.valid);
  if (validRows.length === 0) {
    throw httpError(400, "Tasdiqlash uchun yaroqli qatorlar topilmadi", { errors });
  }
  if (errors.length > 0 && !body.skipInvalid) {
    throw httpError(400, `${errors.length} ta qatorda xatolik bor. Avval xatolarni tuzating yoki faqat to'g'rilarini yuklang.`, { errors });
  }

  const importedAssets = [];
  await withTransaction(async (tx) => {
    for (const r of validRows) {
      const ins = await tx.query(
        `INSERT INTO vaqf.assets (
           name, category_id, tracking, quantity, unit,
           institution_id, location_id, responsible_name,
           status, condition, acquisition_type, acquired_at,
           purchase_price, currency, brand, model, serial_no, mac_address,
           supplier, donor_name, notes, created_by
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8,
           $9, $10, $11, $12,
           $13, $14, $15, $16, $17, $18,
           $19, $20, $21, $22
         ) RETURNING id, inventory_no, name`,
        [
          r.name,
          r.category_id,
          r.tracking,
          r.quantity,
          r.unit,
          r.institution_id,
          r.location_id,
          r.responsible_name,
          r.status,
          r.condition,
          r.acquisition_type,
          r.acquired_at,
          r.purchase_price,
          r.currency,
          r.brand,
          r.model,
          r.serial_no,
          r.mac_address || null,
          r.supplier,
          r.donor_name,
          r.notes,
          actor?.actorId || null,
        ]
      );
      const created = ins.rows[0];
      importedAssets.push(created);
      await recordAssetEvent(tx, {
        assetId: created.id,
        eventType: "imported",
        oldValue: null,
        newValue: { inventory_no: created.inventory_no, name: created.name, rowNumber: r.rowNumber },
        note: "Excel/CSV orqali import qilindi",
        actor,
      });
    }
  });

  return {
    mode: "commit",
    importedCount: importedAssets.length,
    skippedCount: errors.length,
    importedAssets,
  };
}

// ============================================================================
// QR LABELS PDF GENERATION
// ============================================================================
const mmToPt = (mm) => mm * 2.83464567;

export async function generateQrLabelsPdfBuffer({
  ids = [],
  mode = "assets",
  baseUrl = "http://192.168.1.10:3000",
  preset = "a4_3x8",
  cols: customCols,
  rows: customRows,
  widthMm: customWidthMm,
  heightMm: customHeightMm,
} = {}) {
  let assets = [];
  if (mode === "locations") {
    let locRows = [];
    if (ids.length > 0) {
      const cleanIds = ids.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
      if (cleanIds.length === 0) throw httpError(400, "Yorliq chop etish uchun joy tanlanmagan");
      const placeholders = cleanIds.map((_, i) => `$${i + 1}`).join(", ");
      const res = await query(
        `SELECT l.id, l.name, l.code, l.kind, i.code AS institution_code
         FROM vaqf.locations l
         JOIN vaqf.institutions i ON i.id = l.institution_id
         WHERE l.id IN (${placeholders}) AND l.is_active = TRUE
         ORDER BY l.sort_order ASC, l.id ASC`,
        cleanIds
      );
      locRows = res.rows;
    } else {
      const res = await query(
        `SELECT l.id, l.name, l.code, l.kind, i.code AS institution_code
         FROM vaqf.locations l
         JOIN vaqf.institutions i ON i.id = l.institution_id
         WHERE l.is_active = TRUE AND l.kind IN ('room', 'storage', 'outdoor')
         ORDER BY l.sort_order ASC, l.id ASC
         LIMIT 48`
      );
      locRows = res.rows;
    }
    if (locRows.length === 0) {
      throw httpError(404, "Yorliq chiqarish uchun joylar topilmadi");
    }
    assets = locRows.map((l) => ({
      id: l.id,
      is_location_label: true,
      inventory_no: `LOC-${l.code || l.id}`,
      qr_target_path: `/vaqf/loc/${l.id}`,
      name: l.name,
      institution_code: l.institution_code || "MZN",
      location_code: l.kind === "room" ? "XONA" : l.kind === "storage" ? "OMBOR" : "JOY",
      tracking: "individual",
    }));
  } else if (ids.length > 0) {
    const cleanIds = ids.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
    if (cleanIds.length === 0) throw httpError(400, "Yorliq chop etish uchun buyum tanlanmagan");
    const placeholders = cleanIds.map((_, i) => `$${i + 1}`).join(", ");
    const res = await query(
      `${ASSET_SELECT_SQL} WHERE a.id IN (${placeholders}) AND a.deleted_at IS NULL ORDER BY a.id ASC`,
      cleanIds
    );
    assets = res.rows;
  } else {
    const res = await query(`${ASSET_SELECT_SQL} WHERE a.deleted_at IS NULL ORDER BY a.id DESC LIMIT 48`);
    assets = res.rows;
  }

  if (assets.length === 0) {
    throw httpError(404, "Yorliq chiqarish uchun buyumlar topilmadi");
  }

  const hasLogo = fs.existsSync(LOGO_PNG_PATH);
  const cleanOrigin = String(baseUrl || "http://192.168.1.10:3000").replace(/\/+$/, "");

  const isThermal = preset === "thermal_58x40" || preset === "thermal_50x30" || preset === "custom_thermal";

  return new Promise((resolve, reject) => {
    const chunks = [];
    let doc;

    if (isThermal) {
      const wMm = Number(customWidthMm) || (preset === "thermal_50x30" ? 50 : 58);
      const hMm = Number(customHeightMm) || (preset === "thermal_50x30" ? 30 : 40);
      const pageW = mmToPt(wMm);
      const pageH = mmToPt(hMm);
      doc = new PDFDocument({ size: [pageW, pageH], margin: 0, autoFirstPage: false });
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      for (const asset of assets) {
        doc.addPage({ size: [pageW, pageH], margin: 0 });
        drawSingleLabel(doc, asset, {
          x: mmToPt(1.5),
          y: mmToPt(1.5),
          w: pageW - mmToPt(3),
          h: pageH - mmToPt(3),
          cleanOrigin,
          hasLogo,
          drawBorder: false,
        });
      }
      doc.end();
      return;
    }

    const cols = Math.min(5, Math.max(1, Number(customCols) || (preset === "a4_2x7" ? 2 : 3)));
    const rows = Math.min(12, Math.max(1, Number(customRows) || (preset === "a4_2x7" ? 7 : 8)));
    const pageW = mmToPt(210);
    const pageH = mmToPt(297);
    const marginX = mmToPt(6);
    const marginY = mmToPt(8);
    const gapX = mmToPt(2);
    const gapY = mmToPt(1.5);
    const cellW = (pageW - marginX * 2 - gapX * (cols - 1)) / cols;
    const cellH = (pageH - marginY * 2 - gapY * (rows - 1)) / rows;
    const perPage = cols * rows;

    doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    assets.forEach((asset, idx) => {
      const slot = idx % perPage;
      if (slot === 0) {
        doc.addPage({ size: "A4", margin: 0 });
      }
      const c = slot % cols;
      const r = Math.floor(slot / cols);
      const x = marginX + c * (cellW + gapX);
      const y = marginY + r * (cellH + gapY);
      drawSingleLabel(doc, asset, {
        x,
        y,
        w: cellW,
        h: cellH,
        cleanOrigin,
        hasLogo,
        drawBorder: true,
      });
    });

    doc.end();
  });
}

function drawSingleLabel(doc, asset, { x, y, w, h, cleanOrigin, hasLogo, drawBorder }) {
  if (drawBorder) {
    doc
      .save()
      .lineWidth(0.5)
      .strokeColor("#cbd5e1")
      .roundedRect(x, y, w, h, 4)
      .stroke()
      .restore();
  }

  const pad = Math.min(w, h) * 0.07;
  const qrSize = Math.min(h - pad * 2, w * 0.38);
  const qrX = x + pad;
  const qrY = y + (h - qrSize) / 2;

  const qrUrl = asset.qr_target_path
    ? `${cleanOrigin}${asset.qr_target_path}`
    : `${cleanOrigin}/vaqf/a/${encodeURIComponent(asset.inventory_no)}`;
  const qr = QrCode.encodeText(qrUrl, Ecc.MEDIUM);
  const modules = qr.size;
  const modSize = qrSize / (modules + 2);

  doc.save();
  doc.fillColor("#ffffff").rect(qrX, qrY, qrSize, qrSize).fill();
  doc.fillColor("#0f172a");
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.getModule(c, r)) {
        doc.rect(qrX + (c + 1) * modSize, qrY + (r + 1) * modSize, modSize + 0.15, modSize + 0.15).fill();
      }
    }
  }
  doc.restore();

  const textX = qrX + qrSize + pad * 0.9;
  const textW = x + w - textX - pad;
  let curY = y + pad;

  if (hasLogo) {
    try {
      doc.image(LOGO_PNG_PATH, textX, curY, { height: 11 });
    } catch {}
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor("#b45309")
    .text("EZAN VAKFI", hasLogo ? textX + 12 : textX, curY + 1.5, {
      width: textW - (hasLogo ? 12 : 0),
      lineBreak: false,
    });

  curY += 13;

  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor("#0f172a")
    .text(String(asset.inventory_no || ""), textX, curY, {
      width: textW,
      lineBreak: false,
    });

  curY += 12;

  const cleanTitle = toPdfSafeText(asset.name || "").slice(0, 48);
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor("#1e293b")
    .text(cleanTitle, textX, curY, {
      width: textW,
      height: Math.max(12, y + h - curY - 12),
      ellipsis: true,
    });

  const footerInfo = [
    asset.institution_code || "MZN",
    asset.location_code || toPdfSafeText(asset.location_name || ""),
    asset.tracking === "batch" ? `${asset.quantity} ${toPdfSafeText(asset.unit || "dona")}` : null,
  ]
    .filter(Boolean)
    .join(" - ");

  doc
    .font("Helvetica")
    .fontSize(6.3)
    .fillColor("#64748b")
    .text(footerInfo, textX, y + h - pad - 6.5, {
      width: textW,
      lineBreak: false,
    });
}

function toPdfSafeText(s) {
  return String(s || "")
    .replace(/[ʻʼ'']/g, "'")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "G")
    .replace(/ş/g, "sh")
    .replace(/Ş/g, "Sh")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}
