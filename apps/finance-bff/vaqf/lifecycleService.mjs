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
  listResponsibleStaff,
  recordAssetEvent,
} from "./service.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const apiRequire = createRequire(path.join(rootDir, "apps/api/package.json"));
const PDFDocument = apiRequire("pdfkit");
const ExcelJS = apiRequire("exceljs");

const VAQF_STORAGE_ROOT = process.env.VAQF_STORAGE_DIR || "/srv/data/vaqf";
const PHOTOS_DIR = path.join(VAQF_STORAGE_ROOT, "photos");
const DOCS_DIR = path.join(VAQF_STORAGE_ROOT, "documents");

const FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const HAS_UNICODE_FONT = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);

const VALID_ROLES = ["director", "inventory_manager", "accountant", "staff"];
const ROLE_PRIORITY = {
  director: 4,
  inventory_manager: 3,
  accountant: 2,
  staff: 1,
};

const VALID_DOC_TYPES = ["assignment", "return", "transfer", "repair", "writeoff"];
const VALID_DOC_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "completed",
  "rejected",
  "cancelled",
];
const VALID_WRITEOFF_REASONS = [
  "broken",
  "lost",
  "stolen",
  "obsolete",
  "sold",
  "donated_out",
  "other",
];
const VALID_REPAIR_RESULTS = ["fixed", "not_fixable", "replaced"];

// ============================================================================
// IN-MEMORY ROLE CACHE FOR SYNCHRONOUS vaqfAccess() IN /fin-api/auth/me
// ============================================================================
let cachedRolesList = [];
let cacheLoadedAt = 0;

export async function refreshVaqfRoleCache() {
  try {
    const res = await query(
      `SELECT id, LOWER(BTRIM(user_ref)) AS user_ref, user_name, role, institution_id, alternate_refs
       FROM vaqf.user_roles
       ORDER BY id ASC`
    );
    cachedRolesList = res.rows.map((r) => {
      const refs = new Set([String(r.user_ref || "").toLowerCase()]);
      if (Array.isArray(r.alternate_refs)) {
        for (const a of r.alternate_refs) {
          if (a) refs.add(String(a).trim().toLowerCase());
        }
      }
      if (r.user_name) {
        refs.add(String(r.user_name).trim().toLowerCase());
      }
      return {
        ...r,
        matchRefs: refs,
      };
    });
    cacheLoadedAt = Date.now();
  } catch {
    // Table might not exist yet during initial migration from scratch
    cachedRolesList = [];
  }
}

// Kick off initial cache load asynchronously
refreshVaqfRoleCache().catch(() => {});

export function extractSessionCandidateRefs(sess, accessContext = null) {
  const refs = new Set();
  const add = (v) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      refs.add(String(v).trim().toLowerCase());
    }
  };

  add(sess?.user?.id);
  add(sess?.user?.identifier);
  add(sess?.user?.username);
  add(sess?.user?.email);
  add(sess?.user?.name);

  if (sess?.crmUser) {
    add(sess.crmUser.id);
    add(`crm:user:${sess.crmUser.id}`);
    add(sess.crmUser.username);
    add(sess.crmUser.fullname);
    if (sess.crmUser.employeeId) {
      add(sess.crmUser.employeeId);
      add(`crm:emp:${sess.crmUser.employeeId}`);
    }
  }

  if (sess?.erpUser) {
    add(sess.erpUser.id);
    add(`erp:user:${sess.erpUser.id}`);
    add(sess.erpUser.email);
    if (sess.erpUser.employeeId) {
      add(sess.erpUser.employeeId);
      add(`erp:emp:${sess.erpUser.employeeId}`);
    }
  }

  add(accessContext?.employeeId);
  if (accessContext?.employeeId) {
    add(`erp:emp:${accessContext.employeeId}`);
    add(`crm:emp:${accessContext.employeeId}`);
  }
  add(accessContext?.accountName);
  add(accessContext?.sourceLabel);

  // Strip parenthetical suffixes like "Umarkhon Abdulhamidov (Idora)" -> "umarkhon abdulhamidov"
  for (const r of Array.from(refs)) {
    const stripped = r.replace(/\s*\([^)]*\)\s*$/g, "").trim();
    if (stripped && stripped !== r) refs.add(stripped);
  }

  return refs;
}

export function buildPermissionsForRole(role, { isDirector = false, assignedCountIds = [] } = {}) {
  const effectiveRole = isDirector ? "director" : role || null;

  if (effectiveRole === "director") {
    return {
      role: "director",
      canAccess: true,
      canView: true,
      canEdit: true,
      canApprove: true,
      canManageCounts: true,
      canCount: true,
      canManageRoles: true,
      canManageDocuments: true,
      isDirector: true,
      assignedCountIds,
    };
  }

  if (effectiveRole === "inventory_manager") {
    return {
      role: "inventory_manager",
      canAccess: true,
      canView: true,
      canEdit: true,
      canApprove: false,
      canManageCounts: true,
      canCount: true,
      canManageRoles: false,
      canManageDocuments: true,
      isDirector: false,
      assignedCountIds,
    };
  }

  if (effectiveRole === "accountant") {
    return {
      role: "accountant",
      canAccess: true,
      canView: true,
      canEdit: false,
      canApprove: false,
      canManageCounts: false,
      canCount: assignedCountIds.length > 0,
      canManageRoles: false,
      canManageDocuments: false,
      isDirector: false,
      assignedCountIds,
    };
  }

  if (effectiveRole === "staff") {
    return {
      role: "staff",
      canAccess: true,
      canView: false,
      canEdit: false,
      canApprove: false,
      canManageCounts: false,
      canCount: assignedCountIds.length > 0,
      canManageRoles: false,
      canManageDocuments: false,
      isDirector: false,
      isStaff: true,
      assignedCountIds,
    };
  }

  // No explicit role
  return {
    role: null,
    canAccess: assignedCountIds.length > 0,
    canView: false,
    canEdit: false,
    canApprove: false,
    canManageCounts: false,
    canCount: assignedCountIds.length > 0,
    canManageRoles: false,
    canManageDocuments: false,
    isDirector: false,
    assignedCountIds,
  };
}

export function resolveSyncVaqfRole(sess, accessContext = null) {
  if (!sess) return buildPermissionsForRole(null);

  const isDirector = Boolean(
    accessContext?.isDirector ??
      (sess.user?.role === "DIRECTOR" ||
        sess.erpUser?.role === "DIRECTOR" ||
        sess.crmUser?.role === "root")
  );
  if (isDirector) {
    return buildPermissionsForRole("director", { isDirector: true });
  }

  // Trigger background refresh if older than 15s
  if (Date.now() - cacheLoadedAt > 15000) {
    refreshVaqfRoleCache().catch(() => {});
  }

  const userRefs = extractSessionCandidateRefs(sess, accessContext);
  let bestRole = null;
  let bestPriority = 0;

  for (const r of cachedRolesList) {
    for (const ref of userRefs) {
      if (r.matchRefs.has(ref)) {
        const prio = ROLE_PRIORITY[r.role] || 0;
        if (prio > bestPriority) {
          bestPriority = prio;
          bestRole = r.role;
        }
      }
    }
  }

  return buildPermissionsForRole(bestRole, { isDirector: false });
}

export async function resolveFullVaqfAccess(sess, accessContext = null) {
  if (!sess) return buildPermissionsForRole(null);

  const isDirector = Boolean(
    accessContext?.isDirector ??
      (sess.user?.role === "DIRECTOR" ||
        sess.erpUser?.role === "DIRECTOR" ||
        sess.crmUser?.role === "root")
  );

  const userRefs = Array.from(extractSessionCandidateRefs(sess, accessContext));
  let assignedCountIds = [];

  try {
    if (userRefs.length > 0) {
      const countRes = await query(
        `SELECT DISTINCT cl.count_id
         FROM vaqf.inventory_count_locations cl
         JOIN vaqf.inventory_counts c ON c.id = cl.count_id
         WHERE c.status = 'in_progress'
           AND LOWER(COALESCE(cl.assignee_ref, '')) = ANY($1::text[])
         ORDER BY cl.count_id DESC`,
        [userRefs]
      );
      assignedCountIds = countRes.rows.map((r) => Number(r.count_id));
    }
  } catch {}

  if (isDirector) {
    return buildPermissionsForRole("director", { isDirector: true, assignedCountIds });
  }

  let bestRole = null;
  let bestPriority = 0;

  try {
    await refreshVaqfRoleCache();
    for (const r of cachedRolesList) {
      for (const ref of userRefs) {
        if (r.matchRefs.has(ref)) {
          const prio = ROLE_PRIORITY[r.role] || 0;
          if (prio > bestPriority) {
            bestPriority = prio;
            bestRole = r.role;
          }
        }
      }
    }

    // Also check if user has any active assignments or pending assignment documents
    if (!bestRole && userRefs.length > 0) {
      const assignRes = await query(
        `SELECT 1 FROM vaqf.assignments
         WHERE returned_at IS NULL AND LOWER(BTRIM(person_ref)) = ANY($1::text[])
         UNION ALL
         SELECT 1 FROM vaqf.documents
         WHERE type = 'assignment' AND status IN ('approved', 'completed')
           AND LOWER(BTRIM(COALESCE(to_person_ref, ''))) = ANY($1::text[])
         LIMIT 1`,
        [userRefs]
      );
      if (assignRes.rowCount > 0) {
        bestRole = "staff";
      }
    }
  } catch {}

  return buildPermissionsForRole(bestRole, { isDirector: false, assignedCountIds });
}

// Helper to collect all known aliases for a given person_ref from staff list
async function collectStaffAliases(personRef, personName = null) {
  const aliases = new Set();
  const add = (v) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      aliases.add(String(v).trim().toLowerCase());
    }
  };
  add(personRef);
  add(personName);

  try {
    const staff = await listResponsibleStaff();
    const targetRef = String(personRef || "").trim().toLowerCase();
    const targetName = String(personName || "").trim().toLowerCase();

    for (const s of staff) {
      const sRef = String(s.ref || "").trim().toLowerCase();
      const sName = String(s.name || "").trim().toLowerCase();
      const sEmail = String(s.email || "").trim().toLowerCase();
      const sUsername = String(s.username || "").trim().toLowerCase();
      const sId = String(s.id || "").trim().toLowerCase();

      if (
        (targetRef && (targetRef === sRef || targetRef === sEmail || targetRef === sUsername || targetRef === sId)) ||
        (targetName && targetName === sName)
      ) {
        add(s.ref);
        add(s.name);
        add(s.email);
        add(s.username);
        add(s.id);
      }
    }
  } catch {}

  return Array.from(aliases);
}

// ============================================================================
// 1-QADAM: ROLES & SETTINGS MANAGEMENT
// ============================================================================
export async function listUserRolesAndHistory() {
  const [rolesRes, eventsRes, staff] = await Promise.all([
    query(
      `SELECT r.*, i.name AS institution_name, i.code AS institution_code
       FROM vaqf.user_roles r
       LEFT JOIN vaqf.institutions i ON i.id = r.institution_id
       ORDER BY
         CASE r.role
           WHEN 'director' THEN 1
           WHEN 'inventory_manager' THEN 2
           WHEN 'accountant' THEN 3
           ELSE 4
         END,
         r.user_name ASC`
    ),
    query(
      `SELECT e.*, i.name AS institution_name
       FROM vaqf.role_events e
       LEFT JOIN vaqf.institutions i ON i.id = e.institution_id
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT 100`
    ),
    listResponsibleStaff(),
  ]);

  return {
    roles: rolesRes.rows,
    events: eventsRes.rows,
    staff,
  };
}

export async function assignUserRole(body, actor) {
  const userRef = String(body.user_ref || body.userRef || "").trim();
  const userName = String(body.user_name || body.userName || userRef).trim();
  const role = String(body.role || "").trim().toLowerCase();
  const institutionId = body.institution_id ? Number(body.institution_id) : null;
  const note = body.note ? String(body.note).trim().slice(0, 500) : null;

  if (!userRef) throw httpError(400, "Foydalanuvchi identifikatori (user_ref) majburiy");
  if (!VALID_ROLES.includes(role)) {
    throw httpError(400, `Noto'g'ri rol: '${role}'. Ruxsat etilgan: ${VALID_ROLES.join(", ")}`);
  }

  const alternateRefs = await collectStaffAliases(userRef, userName);
  if (Array.isArray(body.alternate_refs)) {
    for (const a of body.alternate_refs) {
      if (a) alternateRefs.push(String(a).trim().toLowerCase());
    }
  }
  const uniqueAltRefs = Array.from(new Set(alternateRefs));

  const saved = await withTransaction(async (tx) => {
    const existingRes = await tx.query(
      `SELECT * FROM vaqf.user_roles
       WHERE LOWER(user_ref) = LOWER($1)
         AND COALESCE(institution_id, 0) = COALESCE($2::int, 0)
       LIMIT 1`,
      [userRef, institutionId]
    );
    const existing = existingRes.rows[0];

    let row;
    if (existing) {
      const upd = await tx.query(
        `UPDATE vaqf.user_roles
         SET user_name = $1,
             role = $2,
             alternate_refs = $3::jsonb,
             granted_by = $4,
             granted_by_name = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [
          userName,
          role,
          JSON.stringify(uniqueAltRefs),
          actor?.actorId || null,
          actor?.actorName || "Direktor",
          existing.id,
        ]
      );
      row = upd.rows[0];

      await tx.query(
        `INSERT INTO vaqf.role_events (user_ref, user_name, action, old_role, new_role, institution_id, actor_id, actor_name, note)
         VALUES ($1, $2, 'updated', $3, $4, $5, $6, $7, $8)`,
        [
          userRef,
          userName,
          existing.role,
          role,
          institutionId,
          actor?.actorId || null,
          actor?.actorName || "Direktor",
          note || `Rol '${existing.role}' dan '${role}' ga o'zgartirildi`,
        ]
      );
    } else {
      const ins = await tx.query(
        `INSERT INTO vaqf.user_roles (user_ref, user_name, role, institution_id, alternate_refs, granted_by, granted_by_name)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         RETURNING *`,
        [
          userRef,
          userName,
          role,
          institutionId,
          JSON.stringify(uniqueAltRefs),
          actor?.actorId || null,
          actor?.actorName || "Direktor",
        ]
      );
      row = ins.rows[0];

      await tx.query(
        `INSERT INTO vaqf.role_events (user_ref, user_name, action, old_role, new_role, institution_id, actor_id, actor_name, note)
         VALUES ($1, $2, 'granted', NULL, $3, $4, $5, $6, $7)`,
        [
          userRef,
          userName,
          role,
          institutionId,
          actor?.actorId || null,
          actor?.actorName || "Direktor",
          note || `Foydalanuvchiga '${role}' roli berildi`,
        ]
      );
    }

    return row;
  });

  await refreshVaqfRoleCache();
  return saved;
}

export async function revokeUserRole(roleId, actor, note = null) {
  const id = Number(roleId);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Rol ID noto'g'ri");

  await withTransaction(async (tx) => {
    const curRes = await tx.query(`SELECT * FROM vaqf.user_roles WHERE id = $1`, [id]);
    const cur = curRes.rows[0];
    if (!cur) throw httpError(404, "Rol yozuvi topilmadi");

    await tx.query(`DELETE FROM vaqf.user_roles WHERE id = $1`, [id]);
    await tx.query(
      `INSERT INTO vaqf.role_events (user_ref, user_name, action, old_role, new_role, institution_id, actor_id, actor_name, note)
       VALUES ($1, $2, 'revoked', $3, NULL, $4, $5, $6, $7)`,
      [
        cur.user_ref,
        cur.user_name,
        cur.role,
        cur.institution_id,
        actor?.actorId || null,
        actor?.actorName || "Direktor",
        note || `Foydalanuvchidan '${cur.role}' roli olindi`,
      ]
    );
  });

  await refreshVaqfRoleCache();
  return { ok: true };
}

const DEFAULT_APPROVAL_RULES = {
  writeoff_requires_director: true,
  inter_institution_transfer_requires_director: true,
  intra_institution_transfer_requires_director: false,
  high_value_transfer_requires_director: true,
  high_value_threshold_try: 10000,
  usd_to_try_rate: 35,
};

export async function getVaqfSettings() {
  const res = await query(`SELECT value, updated_by_name, updated_at FROM vaqf.settings WHERE key = 'approval_rules'`);
  const row = res.rows[0];
  return {
    approval_rules: {
      ...DEFAULT_APPROVAL_RULES,
      ...(row?.value || {}),
    },
    updated_by_name: row?.updated_by_name || null,
    updated_at: row?.updated_at || null,
  };
}

export async function updateVaqfSettings(body, actor) {
  const current = await getVaqfSettings();
  const incoming = body.approval_rules || body;

  const updatedRules = {
    writeoff_requires_director: true, // Always true per business rule
    inter_institution_transfer_requires_director:
      incoming.inter_institution_transfer_requires_director !== undefined
        ? Boolean(incoming.inter_institution_transfer_requires_director)
        : current.approval_rules.inter_institution_transfer_requires_director,
    intra_institution_transfer_requires_director:
      incoming.intra_institution_transfer_requires_director !== undefined
        ? Boolean(incoming.intra_institution_transfer_requires_director)
        : current.approval_rules.intra_institution_transfer_requires_director,
    high_value_transfer_requires_director:
      incoming.high_value_transfer_requires_director !== undefined
        ? Boolean(incoming.high_value_transfer_requires_director)
        : current.approval_rules.high_value_transfer_requires_director,
    high_value_threshold_try:
      incoming.high_value_threshold_try !== undefined
        ? Math.max(0, Number(incoming.high_value_threshold_try) || 10000)
        : current.approval_rules.high_value_threshold_try,
    usd_to_try_rate:
      incoming.usd_to_try_rate !== undefined
        ? Math.max(1, Number(incoming.usd_to_try_rate) || 35)
        : current.approval_rules.usd_to_try_rate,
  };

  await query(
    `INSERT INTO vaqf.settings (key, value, updated_by, updated_by_name, updated_at)
     VALUES ('approval_rules', $1::jsonb, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_by_name = EXCLUDED.updated_by_name,
           updated_at = NOW()`,
    [JSON.stringify(updatedRules), actor?.actorId || null, actor?.actorName || "Direktor"]
  );

  return getVaqfSettings();
}

// ============================================================================
// 0-QADAM.2 & 2-QADAM: ACTIVE INVENTORY COUNT LOCK & ASSET VALIDATION
// ============================================================================
export async function assertAssetNotInActiveCount(assetId, txOrDb = { query }) {
  const lockRes = await txOrDb.query(
    `SELECT c.code, c.title
     FROM vaqf.inventory_count_items i
     JOIN vaqf.inventory_counts c ON c.id = i.count_id
     WHERE i.asset_id = $1 AND c.status = 'in_progress'
     LIMIT 1`,
    [Number(assetId)]
  );
  if (lockRes.rowCount > 0) {
    const lc = lockRes.rows[0];
    throw httpError(
      409,
      `Buyum hozirda davom etayotgan inventarizatsiya (${lc.code} — "${lc.title}") qamrovida. Sanoq yakunlangunga qadar ushbu buyum ustida harakat (ko'chirish, zimmat, ta'mir, hisobdan chiqarish) bajarib bo'lmaydi.`
    );
  }
}

async function assertAssetAssignable(asset, requestedQty, excludeDocId = null, txOrDb = { query }) {
  // Check active assignments in vaqf.assignments
  const activeRes = await txOrDb.query(
    `SELECT COALESCE(SUM(qty - COALESCE(returned_qty, 0)), 0)::float AS active_qty
     FROM vaqf.assignments
     WHERE asset_id = $1 AND returned_at IS NULL`,
    [asset.id]
  );
  const activeQty = Number(activeRes.rows[0]?.active_qty || 0);

  // Also check approved (awaiting recipient confirmation) assignment documents
  const pendingParams = [asset.id];
  let excludeSql = "";
  if (excludeDocId) {
    pendingParams.push(Number(excludeDocId));
    excludeSql = `AND d.id != $2`;
  }
  const pendingDocRes = await txOrDb.query(
    `SELECT COALESCE(SUM(di.qty), 0)::float AS pending_qty
     FROM vaqf.document_items di
     JOIN vaqf.documents d ON d.id = di.document_id
     WHERE di.asset_id = $1
       AND d.type = 'assignment'
       AND d.status = 'approved'
       ${excludeSql}`,
    pendingParams
  );
  const pendingQty = Number(pendingDocRes.rows[0]?.pending_qty || 0);

  const totalAssetQty = Number(asset.quantity || 1);
  if (asset.tracking === "individual") {
    if (activeQty > 0 || pendingQty > 0) {
      throw httpError(
        409,
        `Buyum (${asset.inventory_no} — ${asset.name}) allaqachon faol zimmatda yoki tasdiqlash kutilmoqda. Bir buyum bir vaqtda faqat bitta faol zimmatda bo'lishi mumkin.`
      );
    }
  } else {
    const available = totalAssetQty - activeQty - pendingQty;
    if (requestedQty > available + 0.0001) {
      throw httpError(
        409,
        `Partiyaviy buyum (${asset.inventory_no}) bo'yicha yetarli bo'sh miqdor yo'q. Jami: ${totalAssetQty}, zimmatda: ${activeQty + pendingQty}, so'ralgan: ${requestedQty}`
      );
    }
  }
}

// ============================================================================
// 3-QADAM: DOCUMENTS CRUD & WORKFLOW (submit, approve, reject, confirm, cancel)
// ============================================================================
export async function getDocumentDetail(docId) {
  const id = Number(docId);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Hujjat ID noto'g'ri");

  const docRes = await query(
    `SELECT
       d.*,
       inst.name AS institution_name,
       inst.code AS institution_code,
       to_inst.name AS to_institution_name,
       to_inst.code AS to_institution_code,
       fl.name AS from_location_name,
       fl.code AS from_location_code,
       tl.name AS to_location_name,
       tl.code AS to_location_code
     FROM vaqf.documents d
     JOIN vaqf.institutions inst ON inst.id = d.institution_id
     LEFT JOIN vaqf.institutions to_inst ON to_inst.id = d.to_institution_id
     LEFT JOIN vaqf.locations fl ON fl.id = d.from_location_id
     LEFT JOIN vaqf.locations tl ON tl.id = d.to_location_id
     WHERE d.id = $1`,
    [id]
  );
  const doc = docRes.rows[0];
  if (!doc) throw httpError(404, "Hujjat (dalolatnoma) topilmadi");

  const [itemsRes, confRes] = await Promise.all([
    query(
      `SELECT
         di.*,
         di.qty::float AS qty,
         a.inventory_no,
         a.name AS asset_name,
         a.tracking,
         a.unit,
         a.brand,
         a.model,
         a.serial_no,
         a.status AS asset_status,
         a.condition AS asset_condition,
         a.purchase_price::float AS purchase_price,
         a.currency,
         a.location_id AS current_location_id,
         l.name AS current_location_name,
         c.name AS category_name
       FROM vaqf.document_items di
       JOIN vaqf.assets a ON a.id = di.asset_id
       LEFT JOIN vaqf.locations l ON l.id = a.location_id
       LEFT JOIN vaqf.asset_categories c ON c.id = a.category_id
       WHERE di.document_id = $1
       ORDER BY di.id ASC`,
      [id]
    ),
    query(
      `SELECT *
       FROM vaqf.document_confirmations
       WHERE document_id = $1
       ORDER BY confirmed_at DESC`,
      [id]
    ),
  ]);

  const totalValueTry = itemsRes.rows.reduce(
    (s, it) => s + (it.currency === "TRY" ? Number(it.purchase_price || 0) * Number(it.qty || 1) : 0),
    0
  );
  const totalValueUsd = itemsRes.rows.reduce(
    (s, it) => s + (it.currency === "USD" ? Number(it.purchase_price || 0) * Number(it.qty || 1) : 0),
    0
  );

  return {
    ...doc,
    items: itemsRes.rows,
    confirmations: confRes.rows,
    total_value_try: Number(totalValueTry.toFixed(2)),
    total_value_usd: Number(totalValueUsd.toFixed(2)),
    pdf_url: `/vaqf-api/documents/${doc.id}/pdf`,
  };
}

export async function listDocuments(filters = {}, sess = null, accessContext = null, vAccess = {}) {
  const params = [];
  const where = ["1=1"];

  if (filters.type && VALID_DOC_TYPES.includes(filters.type)) {
    params.push(filters.type);
    where.push(`d.type = $${params.length}`);
  }
  if (filters.status && VALID_DOC_STATUSES.includes(filters.status)) {
    params.push(filters.status);
    where.push(`d.status = $${params.length}`);
  }
  if (filters.institution_id) {
    params.push(Number(filters.institution_id));
    where.push(`(d.institution_id = $${params.length} OR d.to_institution_id = $${params.length})`);
  }
  if (filters.person) {
    params.push(`%${String(filters.person).trim()}%`);
    const p = `$${params.length}`;
    where.push(
      `(COALESCE(d.to_person_name,'') ILIKE ${p} OR COALESCE(d.from_person_name,'') ILIKE ${p} OR COALESCE(d.to_person_ref,'') ILIKE ${p} OR COALESCE(d.from_person_ref,'') ILIKE ${p})`
    );
  }
  if (filters.from_date) {
    params.push(String(filters.from_date).slice(0, 10));
    where.push(`d.created_at >= $${params.length}::date`);
  }
  if (filters.to_date) {
    params.push(String(filters.to_date).slice(0, 10));
    where.push(`d.created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }
  if (filters.asset_id) {
    params.push(Number(filters.asset_id));
    where.push(`EXISTS (SELECT 1 FROM vaqf.document_items di WHERE di.document_id = d.id AND di.asset_id = $${params.length})`);
  }

  // If staff role only, restrict to documents involving them
  if (!vAccess.canView && vAccess.role === "staff" && sess) {
    const refs = Array.from(extractSessionCandidateRefs(sess, accessContext));
    params.push(refs);
    const p = `$${params.length}::text[]`;
    where.push(
      `(LOWER(COALESCE(d.to_person_ref, '')) = ANY(${p}) OR LOWER(COALESCE(d.from_person_ref, '')) = ANY(${p}) OR LOWER(COALESCE(d.to_person_name, '')) = ANY(${p}))`
    );
  }

  const res = await query(
    `SELECT
       d.*,
       inst.name AS institution_name,
       inst.code AS institution_code,
       to_inst.name AS to_institution_name,
       fl.name AS from_location_name,
       tl.name AS to_location_name,
       (SELECT COUNT(*)::int FROM vaqf.document_items di WHERE di.document_id = d.id) AS items_count,
       (SELECT COALESCE(SUM(di.qty), 0)::float FROM vaqf.document_items di WHERE di.document_id = d.id) AS total_qty,
       (SELECT json_agg(json_build_object('asset_id', a.id, 'inventory_no', a.inventory_no, 'name', a.name, 'qty', di.qty::float))
        FROM vaqf.document_items di JOIN vaqf.assets a ON a.id = di.asset_id WHERE di.document_id = d.id) AS items_preview
     FROM vaqf.documents d
     JOIN vaqf.institutions inst ON inst.id = d.institution_id
     LEFT JOIN vaqf.institutions to_inst ON to_inst.id = d.to_institution_id
     LEFT JOIN vaqf.locations fl ON fl.id = d.from_location_id
     LEFT JOIN vaqf.locations tl ON tl.id = d.to_location_id
     WHERE ${where.join(" AND ")}
     ORDER BY d.id DESC
     LIMIT 200`,
    params
  );

  return res.rows.map((r) => ({
    ...r,
    pdf_url: `/vaqf-api/documents/${r.id}/pdf`,
  }));
}

export async function createDocument(body, actor) {
  const type = String(body.type || "").trim().toLowerCase();
  if (!VALID_DOC_TYPES.includes(type)) {
    throw httpError(400, `Hujjat turi noto'g'ri. Ruxsat etilgan: ${VALID_DOC_TYPES.join(", ")}`);
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) {
    throw httpError(400, "Hujjatga kamida bitta buyum biriktirilishi shart");
  }

  const institutionId = Number(body.institution_id || 1);
  const toInstitutionId = body.to_institution_id ? Number(body.to_institution_id) : null;
  const fromLocationId = body.from_location_id ? Number(body.from_location_id) : null;
  const toLocationId = body.to_location_id ? Number(body.to_location_id) : null;
  const fromPersonRef = body.from_person_ref ? String(body.from_person_ref).trim() : null;
  const fromPersonName = body.from_person_name ? String(body.from_person_name).trim() : null;
  const toPersonRef = body.to_person_ref ? String(body.to_person_ref).trim() : null;
  const toPersonName = body.to_person_name ? String(body.to_person_name).trim() : null;
  const expectedReturnAt = body.expected_return_at ? String(body.expected_return_at).slice(0, 10) : null;
  const reason = body.reason ? String(body.reason).trim().slice(0, 1000) : null;
  const notes = body.notes ? String(body.notes).trim().slice(0, 2000) : null;
  const metadata = body.metadata && typeof body.metadata === "object" ? { ...body.metadata } : {};

  if (type === "assignment" && !toPersonRef && !toPersonName) {
    throw httpError(400, "Zimmatga berish hujjatida qabul qiluvchi xodim (to_person_ref / to_person_name) ko'rsatilishi shart");
  }
  if (type === "transfer" && !toLocationId && !toInstitutionId) {
    throw httpError(400, "Ko'chirish hujjatida maqsad joy (to_location_id) yoki muassasa (to_institution_id) ko'rsatilishi shart");
  }
  if (type === "writeoff") {
    const woReason = body.writeoff_reason || metadata.writeoff_reason || reason || "broken";
    if (!VALID_WRITEOFF_REASONS.includes(woReason)) {
      metadata.writeoff_reason = "other";
    } else {
      metadata.writeoff_reason = woReason;
    }
    if (body.sale_amount !== undefined) metadata.sale_amount = Number(body.sale_amount) || 0;
    if (body.evidence !== undefined) metadata.evidence = body.evidence;
    if (body.committee !== undefined) metadata.committee = body.committee;
  }
  if (type === "repair") {
    if (body.vendor !== undefined) metadata.vendor = String(body.vendor || "").trim();
    if (body.cost !== undefined && body.cost !== "") metadata.cost = Number(body.cost) || 0;
    if (body.currency !== undefined) metadata.currency = body.currency === "USD" ? "USD" : "TRY";
    if (body.expense_ref !== undefined) metadata.expense_ref = String(body.expense_ref || "").trim();
    if (body.result && VALID_REPAIR_RESULTS.includes(body.result)) {
      metadata.result = body.result;
    }
    if (body.fault_report_id) metadata.fault_report_id = Number(body.fault_report_id);
  }

  const createdDocId = await withTransaction(async (tx) => {
    const validatedItems = [];

    for (const rawIt of rawItems) {
      const assetId = Number(rawIt.asset_id || rawIt.assetId || rawIt.id);
      if (!Number.isInteger(assetId) || assetId <= 0) {
        throw httpError(400, "Buyum ID (asset_id) noto'g'ri");
      }

      const aRes = await tx.query(
        `SELECT * FROM vaqf.assets WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [assetId]
      );
      const asset = aRes.rows[0];
      if (!asset) {
        throw httpError(404, `Buyum topilmadi (ID: ${assetId})`);
      }

      // Rule: written_off assets cannot participate in any lifecycle operation
      if (asset.status === "written_off") {
        throw httpError(
          400,
          `Hisobdan chiqarilgan ('written_off') buyum (${asset.inventory_no} — ${asset.name}) ustida amal bajarib bo'lmaydi`
        );
      }

      // Rule (0-qadam.2): assets in an in_progress inventory count are locked
      await assertAssetNotInActiveCount(asset.id, tx);

      const qty = Number(rawIt.qty ?? rawIt.quantity ?? 1);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw httpError(400, "Buyum miqdori 0 dan katta bo'lishi kerak");
      }
      if (qty > Number(asset.quantity || 1) + 0.0001) {
        throw httpError(
          400,
          `Buyum (${asset.inventory_no}) bo'yicha kiritilgan miqdor (${qty}) mavjud miqdordan (${asset.quantity}) ko'p`
        );
      }

      if (type === "assignment") {
        await assertAssetAssignable(asset, qty, null, tx);
      }

      validatedItems.push({
        asset,
        qty,
        condition_before: rawIt.condition_before || asset.condition || "good",
        condition_after: rawIt.condition_after || asset.condition || "good",
        note: rawIt.note ? String(rawIt.note).trim().slice(0, 500) : null,
        extra: rawIt.extra && typeof rawIt.extra === "object" ? rawIt.extra : {},
      });
    }

    const firstAsset = validatedItems[0].asset;
    const effectiveFromLoc = fromLocationId || firstAsset.location_id || null;
    const effectiveFromPersonRef = fromPersonRef || firstAsset.responsible_ref || null;
    const effectiveFromPersonName = fromPersonName || firstAsset.responsible_name || null;

    const insDoc = await tx.query(
      `INSERT INTO vaqf.documents (
         type, institution_id, status,
         created_by, created_by_name,
         from_location_id, to_location_id,
         from_person_ref, from_person_name,
         to_person_ref, to_person_name,
         to_institution_id, expected_return_at,
         reason, notes, metadata
       ) VALUES (
         $1, $2, 'draft',
         $3, $4,
         $5, $6,
         $7, $8,
         $9, $10,
         $11, $12,
         $13, $14, $15::jsonb
       ) RETURNING id`,
      [
        type,
        institutionId || firstAsset.institution_id || 1,
        actor?.actorId || null,
        actor?.actorName || "Mas'ul",
        effectiveFromLoc,
        toLocationId,
        effectiveFromPersonRef,
        effectiveFromPersonName,
        toPersonRef || toPersonName,
        toPersonName || toPersonRef,
        toInstitutionId,
        expectedReturnAt,
        reason,
        notes,
        JSON.stringify(metadata),
      ]
    );
    const docId = insDoc.rows[0].id;

    for (const it of validatedItems) {
      await tx.query(
        `INSERT INTO vaqf.document_items (
           document_id, asset_id, qty, condition_before, condition_after, note, extra
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          docId,
          it.asset.id,
          it.qty,
          it.condition_before,
          it.condition_after,
          it.note,
          JSON.stringify(it.extra),
        ]
      );
    }

    // If assignment document, ensure recipient has at least 'staff' role so they see the Vaqf button & Mening buyumlarim
    if (type === "assignment" && (toPersonRef || toPersonName)) {
      const refToEnsure = toPersonRef || toPersonName;
      const nameToEnsure = toPersonName || toPersonRef;
      const altRefs = await collectStaffAliases(refToEnsure, nameToEnsure);
      await tx.query(
        `INSERT INTO vaqf.user_roles (user_ref, user_name, role, institution_id, alternate_refs, granted_by, granted_by_name)
         VALUES ($1, $2, 'staff', NULL, $3::jsonb, $4, $5)
         ON CONFLICT (LOWER(user_ref), COALESCE(institution_id, 0)) DO NOTHING`,
        [
          refToEnsure,
          nameToEnsure,
          JSON.stringify(altRefs),
          actor?.actorId || "system",
          actor?.actorName || "Tizim (Avtomatik)",
        ]
      );
    }

    return docId;
  });

  await refreshVaqfRoleCache();

  if (body.submit_immediately) {
    return submitDocument(createdDocId, body, actor);
  }

  return getDocumentDetail(createdDocId);
}

export async function updateDocument(docId, body, actor) {
  const id = Number(docId);
  const cur = await getDocumentDetail(id);
  if (cur.status === "completed") {
    throw httpError(400, "Yakunlangan ('completed') hujjatni o'zgartirib bo'lmaydi. Xato bo'lsa, teskari hujjat yoziladi.");
  }
  if (cur.status !== "draft" && !(cur.type === "repair" && cur.status === "approved")) {
    throw httpError(400, `Faqat qoralama ('draft') holatidagi hujjatni tahrirlash mumkin (joriy holat: ${cur.status})`);
  }

  const metadata = {
    ...(cur.metadata || {}),
    ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
  };
  if (body.vendor !== undefined) metadata.vendor = String(body.vendor || "").trim();
  if (body.cost !== undefined && body.cost !== "") metadata.cost = Number(body.cost) || 0;
  if (body.currency !== undefined) metadata.currency = body.currency === "USD" ? "USD" : "TRY";
  if (body.result && VALID_REPAIR_RESULTS.includes(body.result)) metadata.result = body.result;
  if (body.sale_amount !== undefined) metadata.sale_amount = Number(body.sale_amount) || 0;
  if (body.writeoff_reason !== undefined) metadata.writeoff_reason = body.writeoff_reason;
  if (body.evidence !== undefined) metadata.evidence = body.evidence;

  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE vaqf.documents
       SET to_location_id = COALESCE($1, to_location_id),
           from_location_id = COALESCE($2, from_location_id),
           to_person_ref = COALESCE($3, to_person_ref),
           to_person_name = COALESCE($4, to_person_name),
           from_person_ref = COALESCE($5, from_person_ref),
           from_person_name = COALESCE($6, from_person_name),
           to_institution_id = COALESCE($7, to_institution_id),
           expected_return_at = COALESCE($8, expected_return_at),
           reason = COALESCE($9, reason),
           notes = COALESCE($10, notes),
           metadata = $11::jsonb,
           updated_at = NOW()
       WHERE id = $12`,
      [
        body.to_location_id !== undefined ? (body.to_location_id ? Number(body.to_location_id) : null) : null,
        body.from_location_id !== undefined ? (body.from_location_id ? Number(body.from_location_id) : null) : null,
        body.to_person_ref !== undefined ? body.to_person_ref : null,
        body.to_person_name !== undefined ? body.to_person_name : null,
        body.from_person_ref !== undefined ? body.from_person_ref : null,
        body.from_person_name !== undefined ? body.from_person_name : null,
        body.to_institution_id !== undefined ? (body.to_institution_id ? Number(body.to_institution_id) : null) : null,
        body.expected_return_at !== undefined ? (body.expected_return_at ? String(body.expected_return_at).slice(0, 10) : null) : null,
        body.reason !== undefined ? body.reason : null,
        body.notes !== undefined ? body.notes : null,
        JSON.stringify(metadata),
        id,
      ]
    );
  });

  return getDocumentDetail(id);
}

async function doesDocumentRequireDirectorApproval(doc) {
  const settings = await getVaqfSettings();
  const rules = settings.approval_rules;

  if (doc.type === "writeoff") {
    return true;
  }

  if (doc.type === "transfer") {
    // 1. Inter-institution transfer
    if (
      doc.to_institution_id &&
      Number(doc.to_institution_id) !== Number(doc.institution_id) &&
      rules.inter_institution_transfer_requires_director
    ) {
      return true;
    }
    // 2. Intra-institution transfer explicit rule
    if (rules.intra_institution_transfer_requires_director) {
      return true;
    }
    // 3. High-value transfer threshold
    if (rules.high_value_transfer_requires_director) {
      const thresholdTry = Number(rules.high_value_threshold_try ?? 10000);
      const usdRate = Number(rules.usd_to_try_rate ?? 35);
      for (const item of doc.items || []) {
        const unitPrice = Number(item.purchase_price || 0);
        const qty = Number(item.qty || 1);
        const itemValTry =
          (item.currency === "USD" ? unitPrice * usdRate : unitPrice) * qty;
        if (itemValTry >= thresholdTry && thresholdTry > 0) {
          return true;
        }
      }
    }
    return false;
  }

  return false;
}

// Internal atomic execution of a document when it transitions to `completed` (or `approved` for repair send)
async function executeDocumentCompletionTx(tx, doc, actor, options = {}) {
  const docId = doc.id;
  const docNo = doc.doc_no;
  let processedItems = 0;

  for (const item of doc.items) {
    const assetRes = await tx.query(
      `SELECT * FROM vaqf.assets WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [item.asset_id]
    );
    const asset = assetRes.rows[0];
    if (!asset) throw httpError(404, `Buyum topilmadi (ID: ${item.asset_id})`);

    if (asset.status === "written_off") {
      throw httpError(
        400,
        `Hisobdan chiqarilgan ('written_off') buyum (${asset.inventory_no}) ustida amal bajarib bo'lmaydi`
      );
    }

    await assertAssetNotInActiveCount(asset.id, tx);

    if (doc.type === "transfer") {
      const newInstId = doc.to_institution_id || asset.institution_id;
      const newLocId = doc.to_location_id !== null ? doc.to_location_id : asset.location_id;
      const newCond = item.condition_after || asset.condition;

      await tx.query(
        `UPDATE vaqf.assets
         SET institution_id = $1,
             location_id = $2,
             condition = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [newInstId, newLocId, newCond, asset.id]
      );

      await tx.query(
        `INSERT INTO vaqf.asset_events (asset_id, document_id, event_type, old_value, new_value, note, actor_id, actor_name)
         VALUES ($1, $2, 'transferred', $3::jsonb, $4::jsonb, $5, $6, $7)`,
        [
          asset.id,
          docId,
          JSON.stringify({
            institution_id: asset.institution_id,
            location_id: asset.location_id,
            condition: asset.condition,
          }),
          JSON.stringify({
            institution_id: newInstId,
            location_id: newLocId,
            condition: newCond,
            doc_no: docNo,
          }),
          `Ko'chirish dalolatnomasi ${docNo}${doc.reason ? `: ${doc.reason}` : ""}`,
          actor?.actorId || null,
          actor?.actorName || "Mas'ul",
        ]
      );
    } else if (doc.type === "return") {
      // Close active assignment(s) for this asset
      const openAssigns = await tx.query(
        `SELECT * FROM vaqf.assignments
         WHERE asset_id = $1 AND returned_at IS NULL
         ORDER BY assigned_at ASC FOR UPDATE`,
        [asset.id]
      );

      let remainingToReturn = Number(item.qty || 1);
      for (const asg of openAssigns.rows) {
        if (remainingToReturn <= 0) break;
        const openQty = Number(asg.qty) - Number(asg.returned_qty || 0);
        if (remainingToReturn >= openQty - 0.0001) {
          await tx.query(
            `UPDATE vaqf.assignments
             SET returned_at = NOW(),
                 returned_qty = qty,
                 return_doc_id = $1,
                 notes = COALESCE($2, notes)
             WHERE id = $3`,
            [docId, doc.reason || item.note || null, asg.id]
          );
          remainingToReturn -= openQty;
        } else {
          await tx.query(
            `UPDATE vaqf.assignments
             SET returned_qty = COALESCE(returned_qty, 0) + $1,
                 return_doc_id = $2
             WHERE id = $3`,
            [remainingToReturn, docId, asg.id]
          );
          remainingToReturn = 0;
        }
      }

      // Check if any active assignment still remains on this asset
      const stillOpenRes = await tx.query(
        `SELECT person_ref, person_name FROM vaqf.assignments
         WHERE asset_id = $1 AND returned_at IS NULL
         ORDER BY assigned_at DESC LIMIT 1`,
        [asset.id]
      );
      const stillOpen = stillOpenRes.rows[0] || null;

      const targetStatus =
        doc.metadata?.target_status === "in_use" ? "in_use" : stillOpen ? "in_use" : "in_storage";
      const targetLocId = doc.to_location_id || asset.location_id;
      const targetCond = item.condition_after || asset.condition;

      await tx.query(
        `UPDATE vaqf.assets
         SET location_id = $1,
             status = $2,
             condition = $3,
             responsible_ref = $4,
             responsible_name = $5,
             updated_at = NOW()
         WHERE id = $6`,
        [
          targetLocId,
          targetStatus,
          targetCond,
          stillOpen ? stillOpen.person_ref : null,
          stillOpen ? stillOpen.person_name : null,
          asset.id,
        ]
      );

      await tx.query(
        `INSERT INTO vaqf.asset_events (asset_id, document_id, event_type, old_value, new_value, note, actor_id, actor_name)
         VALUES ($1, $2, 'returned', $3::jsonb, $4::jsonb, $5, $6, $7)`,
        [
          asset.id,
          docId,
          JSON.stringify({
            responsible_ref: asset.responsible_ref,
            responsible_name: asset.responsible_name,
            location_id: asset.location_id,
            status: asset.status,
            condition: asset.condition,
          }),
          JSON.stringify({
            responsible_ref: stillOpen ? stillOpen.person_ref : null,
            responsible_name: stillOpen ? stillOpen.person_name : null,
            location_id: targetLocId,
            status: targetStatus,
            condition: targetCond,
            doc_no: docNo,
          }),
          `Zimmatdan qaytarish dalolatnomasi ${docNo}${doc.reason ? `: ${doc.reason}` : ""}`,
          actor?.actorId || null,
          actor?.actorName || "Mas'ul",
        ]
      );
    } else if (doc.type === "repair") {
      const md = doc.metadata || {};
      const repairResult = options.repairResult || md.result || null;
      const vendor = options.vendor ?? md.vendor ?? null;
      const cost = options.cost !== undefined ? Number(options.cost) : md.cost !== undefined ? Number(md.cost) : null;
      const currency = options.currency || md.currency || "TRY";
      const expenseRef = options.expense_ref || md.expense_ref || null;
      const issueText = doc.reason || item.note || "Ta'mir va profilaktika";

      // Check if repair row already exists for this document & asset
      const exRepRes = await tx.query(
        `SELECT * FROM vaqf.repairs WHERE document_id = $1 AND asset_id = $2 LIMIT 1`,
        [docId, asset.id]
      );

      let repairId;
      if (exRepRes.rowCount > 0) {
        const updRep = await tx.query(
          `UPDATE vaqf.repairs
           SET vendor = COALESCE($1, vendor),
               cost = COALESCE($2, cost),
               currency = COALESCE($3, currency),
               expense_ref = COALESCE($4, expense_ref),
               result = COALESCE($5::varchar, result),
               returned_at = CASE WHEN $5::varchar IS NOT NULL THEN NOW() ELSE returned_at END,
               notes = COALESCE($6, notes),
               updated_at = NOW()
           WHERE id = $7
           RETURNING id`,
          [vendor, cost, currency, expenseRef, repairResult, doc.notes, exRepRes.rows[0].id]
        );
        repairId = updRep.rows[0].id;
      } else {
        const insRep = await tx.query(
          `INSERT INTO vaqf.repairs (
             asset_id, issue, reported_by, reported_by_name,
             vendor, sent_at, returned_at, cost, currency,
             expense_ref, result, document_id, notes
           ) VALUES (
             $1, $2, $3, $4,
             $5, NOW(), CASE WHEN $6::varchar IS NOT NULL THEN NOW() ELSE NULL END, $7, $8,
             $9, $6, $10, $11
           ) RETURNING id`,
          [
            asset.id,
            issueText,
            doc.created_by,
            doc.created_by_name,
            vendor,
            repairResult,
            cost,
            currency,
            expenseRef,
            docId,
            doc.notes,
          ]
        );
        repairId = insRep.rows[0].id;
      }

      if (md.fault_report_id) {
        await tx.query(
          `UPDATE vaqf.fault_reports
           SET status = $1,
               repair_id = $2,
               document_id = $3,
               updated_at = NOW()
           WHERE id = $4`,
          [repairResult ? "resolved" : "in_repair", repairId, docId, Number(md.fault_report_id)]
        );
      }

      if (!repairResult) {
        // Sent to repair -> asset becomes `under_repair`
        await tx.query(
          `UPDATE vaqf.assets SET status = 'under_repair', updated_at = NOW() WHERE id = $1`,
          [asset.id]
        );
        await tx.query(
          `INSERT INTO vaqf.asset_events (asset_id, document_id, event_type, old_value, new_value, note, actor_id, actor_name)
           VALUES ($1, $2, 'repair_sent', $3::jsonb, $4::jsonb, $5, $6, $7)`,
          [
            asset.id,
            docId,
            JSON.stringify({ status: asset.status, condition: asset.condition }),
            JSON.stringify({ status: "under_repair", vendor, issue: issueText, doc_no: docNo }),
            `Ta'mirga yuborildi (${docNo}): ${issueText}`,
            actor?.actorId || null,
            actor?.actorName || "Mas'ul",
          ]
        );
      } else {
        // Returned from repair with result ('fixed' | 'not_fixable' | 'replaced')
        const newStatus = repairResult === "not_fixable" ? "in_storage" : "in_use";
        const newCond =
          repairResult === "not_fixable"
            ? "poor"
            : item.condition_after && item.condition_after !== "poor"
            ? item.condition_after
            : "good";

        await tx.query(
          `UPDATE vaqf.assets
           SET status = $1,
               condition = $2,
               location_id = COALESCE($3, location_id),
               updated_at = NOW()
           WHERE id = $4`,
          [newStatus, newCond, doc.to_location_id, asset.id]
        );

        await tx.query(
          `INSERT INTO vaqf.asset_events (asset_id, document_id, event_type, old_value, new_value, note, actor_id, actor_name)
           VALUES ($1, $2, 'repair_completed', $3::jsonb, $4::jsonb, $5, $6, $7)`,
          [
            asset.id,
            docId,
            JSON.stringify({ status: asset.status, condition: asset.condition }),
            JSON.stringify({
              status: newStatus,
              condition: newCond,
              result: repairResult,
              cost,
              currency,
              vendor,
              doc_no: docNo,
            }),
            `Ta'mir yakunlandi (${docNo}) — natija: ${repairResult}`,
            actor?.actorId || null,
            actor?.actorName || "Mas'ul",
          ]
        );
      }
    } else if (doc.type === "writeoff") {
      const md = doc.metadata || {};
      const woReason = VALID_WRITEOFF_REASONS.includes(md.writeoff_reason)
        ? md.writeoff_reason
        : "broken";
      const bookValue =
        asset.purchase_price !== null
          ? Number((Number(asset.purchase_price) * Number(item.qty || 1)).toFixed(2))
          : null;
      const saleAmount = md.sale_amount !== undefined ? Number(md.sale_amount) : null;
      const evidence = Array.isArray(md.evidence) ? md.evidence : [];

      await tx.query(
        `INSERT INTO vaqf.writeoffs (
           asset_id, qty, reason, book_value, currency,
           sale_amount, document_id, evidence, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [
          asset.id,
          item.qty,
          woReason,
          bookValue,
          asset.currency || "TRY",
          saleAmount,
          docId,
          JSON.stringify(evidence),
          doc.reason || doc.notes || null,
        ]
      );

      // Close any active assignments on this asset
      await tx.query(
        `UPDATE vaqf.assignments
         SET returned_at = NOW(),
             returned_qty = qty,
             return_doc_id = $1,
             notes = COALESCE(notes || ' | ', '') || $2
         WHERE asset_id = $3 AND returned_at IS NULL`,
        [docId, `Hisobdan chiqarish (${docNo}) sababli yopildi`, asset.id]
      );

      const remainingQty = Number(asset.quantity || 1) - Number(item.qty || 1);
      if (asset.tracking === "individual" || remainingQty <= 0.0001) {
        await tx.query(
          `UPDATE vaqf.assets
           SET status = 'written_off',
               responsible_ref = NULL,
               responsible_name = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [asset.id]
        );
      } else {
        await tx.query(
          `UPDATE vaqf.assets
           SET quantity = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [remainingQty, asset.id]
        );
      }

      await tx.query(
        `INSERT INTO vaqf.asset_events (asset_id, document_id, event_type, old_value, new_value, note, actor_id, actor_name)
         VALUES ($1, $2, 'written_off', $3::jsonb, $4::jsonb, $5, $6, $7)`,
        [
          asset.id,
          docId,
          JSON.stringify({
            status: asset.status,
            quantity: Number(asset.quantity),
            responsible_name: asset.responsible_name,
          }),
          JSON.stringify({
            status: "written_off",
            written_off_qty: Number(item.qty),
            reason: woReason,
            book_value: bookValue,
            sale_amount: saleAmount,
            doc_no: docNo,
          }),
          `Hisobdan chiqarish dalolatnomasi ${docNo} (${woReason})${doc.reason ? `: ${doc.reason}` : ""}`,
          actor?.actorId || null,
          actor?.actorName || "Direktor",
        ]
      );
    }

    processedItems++;
    if (options._simulateTransactionFailureAfterFirstItem && processedItems >= 1) {
      throw httpError(500, "Simulated mid-transaction failure in document execution");
    }
  }
}

export async function submitDocument(docId, body = {}, actor) {
  const id = Number(docId);
  const doc = await getDocumentDetail(id);

  if (doc.status === "completed") {
    throw httpError(400, "Yakunlangan ('completed') hujjatni qayta yuborib bo'lmaydi");
  }
  if (doc.status === "cancelled" || doc.status === "rejected") {
    throw httpError(400, `Bekor qilingan yoki rad etilgan hujjatni yuborib bo'lmaydi (${doc.status})`);
  }

  // Re-validate all items are not locked by an active count or written_off
  for (const it of doc.items) {
    await assertAssetNotInActiveCount(it.asset_id);
    if (it.asset_status === "written_off") {
      throw httpError(400, `Hisobdan chiqarilgan ('written_off') buyum (${it.inventory_no}) ustida amal bajarib bo'lmaydi`);
    }
  }

  const needsApproval = await doesDocumentRequireDirectorApproval(doc);

  if (needsApproval) {
    await query(
      `UPDATE vaqf.documents SET status = 'pending_approval', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return getDocumentDetail(id);
  }

  if (doc.type === "assignment") {
    // Assignment moves to `approved` status and waits for recipient's electronic confirmation (`POST /confirm`)
    await withTransaction(async (tx) => {
      for (const it of doc.items) {
        const aRes = await tx.query(`SELECT * FROM vaqf.assets WHERE id = $1 FOR UPDATE`, [it.asset_id]);
        await assertAssetAssignable(aRes.rows[0], it.qty, id, tx);
      }
      await tx.query(
        `UPDATE vaqf.documents
         SET status = 'approved',
             approved_by = COALESCE(approved_by, $1),
             approved_by_name = COALESCE(approved_by_name, $2),
             approved_at = COALESCE(approved_at, NOW()),
             updated_at = NOW()
         WHERE id = $3`,
        [actor?.actorId || null, actor?.actorName || "Mas'ul", id]
      );
    });
    return getDocumentDetail(id);
  }

  if (doc.type === "repair") {
    const repairResult = body?.result || doc.metadata?.result || null;
    await withTransaction(async (tx) => {
      await executeDocumentCompletionTx(tx, doc, actor, {
        repairResult,
        vendor: body?.vendor,
        cost: body?.cost,
        currency: body?.currency,
        expense_ref: body?.expense_ref,
        _simulateTransactionFailureAfterFirstItem: body?._simulateTransactionFailureAfterFirstItem,
      });

      const nextStatus = repairResult ? "completed" : "approved";
      await tx.query(
        `UPDATE vaqf.documents
         SET status = $1::varchar,
             approved_by = COALESCE(approved_by, $2),
             approved_by_name = COALESCE(approved_by_name, $3),
             approved_at = COALESCE(approved_at, NOW()),
             completed_at = CASE WHEN $1::varchar = 'completed' THEN NOW() ELSE completed_at END,
             updated_at = NOW()
         WHERE id = $4`,
        [nextStatus, actor?.actorId || null, actor?.actorName || "Mas'ul", id]
      );
    });
    const updated = await getDocumentDetail(id);
    if ((body?.result || doc.metadata?.result) === "not_fixable") {
      updated.suggestWriteoff = true;
    }
    return updated;
  }

  // `return` or intra-institution `transfer` -> completes immediately in one transaction
  await withTransaction(async (tx) => {
    await executeDocumentCompletionTx(tx, doc, actor, {
      _simulateTransactionFailureAfterFirstItem: body?._simulateTransactionFailureAfterFirstItem,
    });
    await tx.query(
      `UPDATE vaqf.documents
       SET status = 'completed',
           approved_by = COALESCE(approved_by, $1),
           approved_by_name = COALESCE(approved_by_name, $2),
           approved_at = COALESCE(approved_at, NOW()),
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [actor?.actorId || null, actor?.actorName || "Mas'ul", id]
    );
  });

  return getDocumentDetail(id);
}

export async function completeRepairDocument(docId, body = {}, actor) {
  const id = Number(docId);
  const doc = await getDocumentDetail(id);
  if (doc.type !== "repair") {
    throw httpError(400, "Ushbu amal faqat ta'mir ('repair') hujjatlari uchun");
  }
  if (doc.status === "completed") {
    throw httpError(400, "Yakunlangan ('completed') ta'mir hujjatini o'zgartirib bo'lmaydi");
  }

  const repairResult = String(body.result || doc.metadata?.result || "fixed").trim();
  if (!VALID_REPAIR_RESULTS.includes(repairResult)) {
    throw httpError(400, `Ta'mir natijasi noto'g'ri. Ruxsat etilgan: ${VALID_REPAIR_RESULTS.join(", ")}`);
  }

  const newMeta = {
    ...(doc.metadata || {}),
    result: repairResult,
    ...(body.vendor !== undefined ? { vendor: body.vendor } : {}),
    ...(body.cost !== undefined && body.cost !== "" ? { cost: Number(body.cost) } : {}),
    ...(body.currency !== undefined ? { currency: body.currency } : {}),
    ...(body.expense_ref !== undefined ? { expense_ref: body.expense_ref } : {}),
  };

  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE vaqf.documents SET metadata = $1::jsonb, notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3`,
      [JSON.stringify(newMeta), body.notes || null, id]
    );
    await executeDocumentCompletionTx(tx, { ...doc, metadata: newMeta }, actor, {
      repairResult,
      vendor: newMeta.vendor,
      cost: newMeta.cost,
      currency: newMeta.currency,
      expense_ref: newMeta.expense_ref,
      _simulateTransactionFailureAfterFirstItem: body?._simulateTransactionFailureAfterFirstItem,
    });
    await tx.query(
      `UPDATE vaqf.documents SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );
  });

  const updated = await getDocumentDetail(id);
  if (repairResult === "not_fixable") {
    updated.suggestWriteoff = true;
  }
  return updated;
}

export async function approveDocument(docId, body = {}, actor, vAccess = {}) {
  if (!vAccess.canApprove) {
    throw httpError(
      403,
      "Hujjatni tasdiqlash (hisobdan chiqarish, muassasalar arasi yoki yuqori qiymatli ko'chirish) faqat Direktor vakolatida"
    );
  }

  const id = Number(docId);
  const doc = await getDocumentDetail(id);

  if (doc.status === "completed") {
    throw httpError(400, "Yakunlangan ('completed') hujjatni qayta tasdiqlab bo'lmaydi");
  }
  if (doc.status === "cancelled" || doc.status === "rejected") {
    throw httpError(400, `Bekor qilingan yoki rad etilgan hujjatni tasdiqlab bo'lmaydi (${doc.status})`);
  }

  if (doc.type === "assignment") {
    await query(
      `UPDATE vaqf.documents
       SET status = 'approved',
           approved_by = $1,
           approved_by_name = $2,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [actor?.actorId || null, actor?.actorName || "Direktor", id]
    );
    return getDocumentDetail(id);
  }

  await withTransaction(async (tx) => {
    await executeDocumentCompletionTx(tx, doc, actor, {
      _simulateTransactionFailureAfterFirstItem: body?._simulateTransactionFailureAfterFirstItem,
    });
    await tx.query(
      `UPDATE vaqf.documents
       SET status = 'completed',
           approved_by = $1,
           approved_by_name = $2,
           approved_at = NOW(),
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [actor?.actorId || null, actor?.actorName || "Direktor", id]
    );
  });

  return getDocumentDetail(id);
}

export async function rejectDocument(docId, body = {}, actor, vAccess = {}) {
  if (!vAccess.canApprove) {
    throw httpError(403, "Hujjatni rad etish faqat Direktor vakolatida");
  }
  const id = Number(docId);
  const doc = await getDocumentDetail(id);
  if (doc.status === "completed") {
    throw httpError(400, "Yakunlangan ('completed') hujjatni rad etib bo'lmaydi");
  }
  const reason = String(body.reason || body.rejected_reason || "").trim();
  if (!reason) {
    throw httpError(400, "Rad etish sababini kiriting");
  }

  await query(
    `UPDATE vaqf.documents
     SET status = 'rejected',
         rejected_by = $1,
         rejected_by_name = $2,
         rejected_at = NOW(),
         rejected_reason = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [actor?.actorId || null, actor?.actorName || "Direktor", reason, id]
  );

  return getDocumentDetail(id);
}

export async function confirmDocumentByRecipient(docId, body = {}, req, sess, accessContext) {
  const id = Number(docId);
  const doc = await getDocumentDetail(id);

  if (doc.status === "completed") {
    throw httpError(400, "Ushbu hujjat allaqachon tasdiqlangan va yakunlangan ('completed')");
  }
  if (doc.type !== "assignment") {
    throw httpError(400, "Qabul qilish tasdig'i ('confirm') faqat zimmatga berish hujjatlari uchun");
  }
  if (doc.status !== "approved" && doc.status !== "draft") {
    throw httpError(400, `Hujjat qabul qilish uchun tayyor holatda emas (joriy holat: ${doc.status})`);
  }

  // Strict check: ONLY the recipient (`doc.to_person_ref` / `doc.to_person_name`) can confirm!
  const currentUserRefs = extractSessionCandidateRefs(sess, accessContext);
  const recipientAliases = await collectStaffAliases(doc.to_person_ref, doc.to_person_name);
  const isRecipient = recipientAliases.some((alias) => currentUserRefs.has(alias));

  if (!isRecipient) {
    throw httpError(
      403,
      `Faqat qabul qiluvchi xodimning o'zi (${doc.to_person_name || doc.to_person_ref}) "Qabul qildim" tugmasini bosa oladi. Boshqa shaxs uning nomidan tasdiqlay olmaydi!`
    );
  }

  const actor = getActor(sess, accessContext);
  const ip =
    String(req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "127.0.0.1")
      .split(",")[0]
      .trim()
      .slice(0, 60);
  const userAgent = String(req?.headers?.["user-agent"] || "Browser").slice(0, 500);
  const comment = body.comment ? String(body.comment).trim().slice(0, 500) : "Buyumlarni butun va soz holda qabul qilib oldim";

  await withTransaction(async (tx) => {
    let processed = 0;
    for (const item of doc.items) {
      const aRes = await tx.query(
        `SELECT * FROM vaqf.assets WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [item.asset_id]
      );
      const asset = aRes.rows[0];
      if (!asset) throw httpError(404, `Buyum topilmadi (ID: ${item.asset_id})`);
      if (asset.status === "written_off") {
        throw httpError(400, `Hisobdan chiqarilgan buyumni (${asset.inventory_no}) zimmatga olib bo'lmaydi`);
      }

      await assertAssetNotInActiveCount(asset.id, tx);
      await assertAssetAssignable(asset, item.qty, id, tx);

      await tx.query(
        `INSERT INTO vaqf.assignments (
           asset_id, person_ref, person_name, qty,
           assigned_at, expected_return_at, assign_doc_id, notes
         ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
        [
          asset.id,
          doc.to_person_ref || actor.actorId,
          doc.to_person_name || actor.actorName,
          item.qty,
          doc.expected_return_at || null,
          id,
          item.note || doc.reason || null,
        ]
      );

      const newLocId = doc.to_location_id || asset.location_id;
      const newCond = item.condition_after || asset.condition;

      await tx.query(
        `UPDATE vaqf.assets
         SET responsible_ref = $1,
             responsible_name = $2,
             location_id = $3,
             status = 'in_use',
             condition = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [
          doc.to_person_ref || actor.actorId,
          doc.to_person_name || actor.actorName,
          newLocId,
          newCond,
          asset.id,
        ]
      );

      await tx.query(
        `INSERT INTO vaqf.asset_events (asset_id, document_id, event_type, old_value, new_value, note, actor_id, actor_name)
         VALUES ($1, $2, 'assigned', $3::jsonb, $4::jsonb, $5, $6, $7)`,
        [
          asset.id,
          id,
          JSON.stringify({
            responsible_ref: asset.responsible_ref,
            responsible_name: asset.responsible_name,
            location_id: asset.location_id,
            status: asset.status,
          }),
          JSON.stringify({
            responsible_ref: doc.to_person_ref || actor.actorId,
            responsible_name: doc.to_person_name || actor.actorName,
            location_id: newLocId,
            status: "in_use",
            qty: Number(item.qty),
            doc_no: doc.doc_no,
          }),
          `Zimmatga berildi va elektron tasdiqlandi (${doc.doc_no})`,
          actor.actorId,
          actor.actorName,
        ]
      );

      processed++;
      if (body?._simulateTransactionFailureAfterFirstItem && processed >= 1) {
        throw httpError(500, "Simulated mid-transaction failure during recipient confirm");
      }
    }

    await tx.query(
      `INSERT INTO vaqf.document_confirmations (document_id, person_ref, person_name, confirmed_at, ip, user_agent, comment)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6)`,
      [
        id,
        doc.to_person_ref || actor.actorId,
        doc.to_person_name || actor.actorName,
        ip,
        userAgent,
        comment,
      ]
    );

    await tx.query(
      `UPDATE vaqf.documents
       SET status = 'completed',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  });

  return getDocumentDetail(id);
}

export async function cancelDocument(docId, body = {}, actor) {
  const id = Number(docId);
  const doc = await getDocumentDetail(id);
  if (doc.status === "completed") {
    throw httpError(
      400,
      "Yakunlangan ('completed') hujjatni bekor qilib bo'lmaydi. Xato bo'lsa, teskari hujjat yoziladi."
    );
  }
  if (doc.status === "cancelled") {
    throw httpError(400, "Hujjat allaqachon bekor qilingan");
  }

  await query(
    `UPDATE vaqf.documents
     SET status = 'cancelled',
         notes = COALESCE(notes || ' | ', '') || $1,
         updated_at = NOW()
     WHERE id = $2`,
    [body.reason ? `Bekor qilindi: ${body.reason}` : `Bekor qilindi (${actor?.actorName || "Mas'ul"})`, id]
  );

  return getDocumentDetail(id);
}

// ============================================================================
// STAFF ENDPOINTS: MY ASSETS, MY PENDING CONFIRMATIONS, PEOPLE ASSETS & FAULTS
// ============================================================================
export async function getMyAssignedAssets(sess, accessContext) {
  const userRefs = Array.from(extractSessionCandidateRefs(sess, accessContext));
  if (userRefs.length === 0) return [];

  const res = await query(
    `SELECT
       asg.id AS assignment_id,
       asg.asset_id,
       asg.person_ref,
       asg.person_name,
       (asg.qty - COALESCE(asg.returned_qty, 0))::float AS assigned_qty,
       (asg.qty - COALESCE(asg.returned_qty, 0))::float AS remaining_qty,
       (asg.qty - COALESCE(asg.returned_qty, 0))::float AS qty,
       asg.assigned_at,
       TO_CHAR(asg.expected_return_at, 'YYYY-MM-DD') AS expected_return_at,
       asg.assign_doc_id,
       d.doc_no AS assign_doc_no,
       a.inventory_no,
       a.name AS asset_name,
       a.brand,
       a.model,
       a.serial_no,
       a.tracking,
       a.unit,
       a.status,
       a.condition,
       a.location_id,
       l.name AS location_name,
       c.name AS category_name,
       (SELECT ph.id FROM vaqf.asset_photos ph WHERE ph.asset_id = a.id ORDER BY ph.is_primary DESC, ph.id ASC LIMIT 1) AS primary_photo_id
     FROM vaqf.assignments asg
     JOIN vaqf.assets a ON a.id = asg.asset_id
     LEFT JOIN vaqf.documents d ON d.id = asg.assign_doc_id
     LEFT JOIN vaqf.locations l ON l.id = a.location_id
     LEFT JOIN vaqf.asset_categories c ON c.id = a.category_id
     WHERE asg.returned_at IS NULL
       AND a.deleted_at IS NULL
       AND (
         LOWER(BTRIM(asg.person_ref)) = ANY($1::text[])
         OR LOWER(BTRIM(asg.person_name)) = ANY($1::text[])
       )
     ORDER BY asg.assigned_at DESC, asg.id DESC`,
    [userRefs]
  );

  return res.rows.map((r) => ({
    ...r,
    pdf_url: r.assign_doc_id ? `/vaqf-api/documents/${r.assign_doc_id}/pdf` : null,
    photo_url: r.primary_photo_id ? `/vaqf-api/files/photos/${r.primary_photo_id}` : null,
  }));
}

export async function getMyPendingDocuments(sess, accessContext) {
  const userRefs = Array.from(extractSessionCandidateRefs(sess, accessContext));
  if (userRefs.length === 0) return [];

  const res = await query(
    `SELECT d.id
     FROM vaqf.documents d
     WHERE d.type = 'assignment'
       AND d.status = 'approved'
       AND (
         LOWER(BTRIM(COALESCE(d.to_person_ref, ''))) = ANY($1::text[])
         OR LOWER(BTRIM(COALESCE(d.to_person_name, ''))) = ANY($1::text[])
       )
     ORDER BY d.id DESC`,
    [userRefs]
  );

  const detailed = [];
  for (const row of res.rows) {
    detailed.push(await getDocumentDetail(row.id));
  }
  return detailed;
}

export async function getPersonAssignedAssets(personRef) {
  const aliases = await collectStaffAliases(personRef, personRef);
  if (aliases.length === 0) return [];

  const res = await query(
    `SELECT
       asg.id AS assignment_id,
       asg.asset_id,
       asg.person_ref,
       asg.person_name,
       (asg.qty - COALESCE(asg.returned_qty, 0))::float AS assigned_qty,
       (asg.qty - COALESCE(asg.returned_qty, 0))::float AS remaining_qty,
       (asg.qty - COALESCE(asg.returned_qty, 0))::float AS qty,
       asg.assigned_at,
       TO_CHAR(asg.expected_return_at, 'YYYY-MM-DD') AS expected_return_at,
       asg.assign_doc_id,
       d.doc_no AS assign_doc_no,
       a.inventory_no,
       a.name AS asset_name,
       a.brand,
       a.model,
       a.serial_no,
       a.tracking,
       a.unit,
       a.status,
       a.condition,
       a.location_id,
       l.name AS location_name,
       c.name AS category_name,
       a.purchase_price::float AS purchase_price,
       a.currency
     FROM vaqf.assignments asg
     JOIN vaqf.assets a ON a.id = asg.asset_id
     LEFT JOIN vaqf.documents d ON d.id = asg.assign_doc_id
     LEFT JOIN vaqf.locations l ON l.id = a.location_id
     LEFT JOIN vaqf.asset_categories c ON c.id = a.category_id
     WHERE asg.returned_at IS NULL
       AND a.deleted_at IS NULL
       AND (
         LOWER(BTRIM(asg.person_ref)) = ANY($1::text[])
         OR LOWER(BTRIM(asg.person_name)) = ANY($1::text[])
       )
     ORDER BY asg.assigned_at DESC, asg.id DESC`,
    [aliases]
  );

  return res.rows;
}

export async function listPendingApprovals() {
  const res = await query(
    `SELECT id FROM vaqf.documents WHERE status = 'pending_approval' ORDER BY id DESC`
  );
  const items = [];
  for (const r of res.rows) {
    items.push(await getDocumentDetail(r.id));
  }
  return items;
}

export async function createFaultReport(assetId, body, sess, accessContext) {
  const id = Number(assetId);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Buyum ID noto'g'ri");

  const aRes = await query(`SELECT * FROM vaqf.assets WHERE id = $1 AND deleted_at IS NULL`, [id]);
  const asset = aRes.rows[0];
  if (!asset) throw httpError(404, "Buyum topilmadi");

  const description = String(body.description || body.issue || body.note || "").trim();
  if (!description) throw httpError(400, "Nosozlik tavsifini kiriting");

  const actor = getActor(sess, accessContext);
  let photoPath = null;
  const rawPhoto = body.photoDataUrl || body.photo_data_url || body.dataUrl;
  if (rawPhoto) {
    await fsp.mkdir(PHOTOS_DIR, { recursive: true });
    const m = String(rawPhoto).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    const base64 = m ? m[2] : String(rawPhoto);
    const buf = Buffer.from(base64, "base64");
    if (buf.length > 0 && buf.length <= 10 * 1024 * 1024) {
      const ext = m && m[1].includes("png") ? ".png" : ".jpg";
      const fileName = `fault_${id}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}${ext}`;
      photoPath = path.join(PHOTOS_DIR, fileName);
      await fsp.writeFile(photoPath, buf, { mode: 0o640 });
    }
  }

  const created = await withTransaction(async (tx) => {
    const ins = await tx.query(
      `INSERT INTO vaqf.fault_reports (
         asset_id, reported_by, reported_by_name, description, photo_path, status
       ) VALUES ($1, $2, $3, $4, $5, 'new')
       RETURNING *`,
      [id, actor.actorId, actor.actorName, description, photoPath]
    );

    await tx.query(
      `INSERT INTO vaqf.asset_events (asset_id, event_type, old_value, new_value, note, actor_id, actor_name)
       VALUES ($1, 'fault_reported', NULL, $2::jsonb, $3, $4, $5)`,
      [
        id,
        JSON.stringify({ fault_report_id: ins.rows[0].id, description }),
        `Nosozlik xabari yuborildi: ${description}`,
        actor.actorId,
        actor.actorName,
      ]
    );

    return ins.rows[0];
  });

  return {
    ...created,
    photo_url: created.photo_path ? `/vaqf-api/faults/${created.id}/photo` : null,
  };
}

export async function listFaultReports(filters = {}) {
  const params = [];
  const where = ["1=1"];
  if (filters.status) {
    params.push(filters.status);
    where.push(`f.status = $${params.length}`);
  }
  const res = await query(
    `SELECT
       f.*,
       a.inventory_no,
       a.name AS asset_name,
       a.brand,
       a.model,
       a.serial_no,
       a.status AS asset_status,
       a.condition AS asset_condition,
       a.location_id,
       l.name AS location_name,
       d.doc_no AS repair_doc_no
     FROM vaqf.fault_reports f
     JOIN vaqf.assets a ON a.id = f.asset_id
     LEFT JOIN vaqf.locations l ON l.id = a.location_id
     LEFT JOIN vaqf.documents d ON d.id = f.document_id
     WHERE ${where.join(" AND ")}
     ORDER BY
       CASE f.status WHEN 'new' THEN 1 WHEN 'in_repair' THEN 2 ELSE 3 END,
       f.created_at DESC`,
    params
  );

  return res.rows.map((r) => ({
    ...r,
    photo_url: r.photo_path ? `/vaqf-api/faults/${r.id}/photo` : null,
  }));
}

export async function getFaultPhotoFile(faultId) {
  const res = await query(`SELECT photo_path FROM vaqf.fault_reports WHERE id = $1`, [Number(faultId)]);
  const row = res.rows[0];
  if (!row || !row.photo_path || !fs.existsSync(row.photo_path)) {
    throw httpError(404, "Nosozlik rasmi topilmadi");
  }
  return row.photo_path;
}

export async function updateFaultReportStatus(faultId, body, actor) {
  const id = Number(faultId);
  const status = String(body.status || "rejected").trim();
  if (!["new", "in_repair", "resolved", "rejected"].includes(status)) {
    throw httpError(400, "Noto'g'ri nosozlik holati");
  }
  const upd = await query(
    `UPDATE vaqf.fault_reports
     SET status = $1,
         resolution_note = COALESCE($2, resolution_note),
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [status, body.resolution_note || body.note || null, id]
  );
  if (upd.rowCount === 0) throw httpError(404, "Nosozlik xabari topilmadi");
  return upd.rows[0];
}

// ============================================================================
// 5-QADAM: DALOLATNOMALAR (PDF) — TURKCHA (STANDART) VA O'ZBEKCHA
// ============================================================================
const DOC_I18N = {
  tr: {
    titles: {
      assignment: "ZİMMET TESLİM TUTANAĞI",
      return: "ZİMMET İADE / TESLİM TUTANAĞI",
      transfer: "DEMİRBAŞ TRANSFER (YER DEĞİŞİKLİĞİ) TUTANAĞI",
      repair: "BAKIM - ONARIM VE ARIZA FORMU",
      writeoff: "TERKİN (KAYITTAN DÜŞME / HURDAYA AYIRMA) TUTANAĞI",
    },
    subtitles: {
      assignment: "Personel Zimmet Belgesi",
      return: "Zimmetten İade ve Teslim Alma Belgesi",
      transfer: "Birim / Oda / Kurum Arası Transfer Belgesi",
      repair: "Teknik Servis ve Onarım Kayıt Formu",
      writeoff: "Demirbaş Kayıttan Düşme Komisyon Tutanağı",
    },
    docNo: "Belge No",
    date: "Tarih",
    status: "Durum",
    institution: "Kurum",
    fromLocation: "Çıkış Yeri / Oda",
    toLocation: "Varış Yeri / Oda",
    fromPerson: "Teslim Eden",
    toPerson: "Teslim Alan (Zimmetli)",
    reason: "Açıklama / Gerekçe",
    tableTitle: "DEMİRBAŞ / MALZEME LİSTESİ",
    colInvNo: "Envanter No",
    colName: "Malzeme Adı / Marka-Model",
    colSerial: "Seri No",
    colQty: "Miktar",
    colCondBefore: "Önceki Durum",
    colCondAfter: "Teslim Durumu",
    colValue: "Değer",
    legalAssignment:
      "Yukarıda envanter numarası, cinsi, özellikleri ve miktarı belirtilen Ezan Vakfı'na ait demirbaş malzemeleri tam, sağlam ve çalışır vaziyette teslim aldım. Görevim süresince özenle koruyacağımı ve görev ayrılışında eksiksiz iade edeceğimi beyan ederim.",
    legalReturn:
      "Yukarıda listelenen demirbaş malzemeler personel zimmetinden kontrol edilerek belirtilen fiziksel durumlarıyla teslim alınmış ve kuruma/depoya iade edilmiştir.",
    legalTransfer:
      "Yukarıda belirtilen demirbaş malzemelerin çıkış mahallinden varış mahalline eksiksiz olarak nakledildiği ve teslim edildiği işbu tutanakla tespit edilmiştir.",
    legalRepair:
      "Yukarıda belirtilen demirbaşın arıza/bakım bilgileri, servis sağlayıcı ve onarım sonucu kayıt altına alınmıştır.",
    legalWriteoff:
      "Yukarıda bilgileri yer alan demirbaşların ekonomik ömrünü tamamlaması veya kullanılamaz hale gelmesi sebebiyle Ezan Vakfı envanter kayıtlarından düşülmesine (terkin edilmesine) oybirliği ile karar verilmiştir.",
    electronicConfirmTitle: "ELEKTRONİK ONAY / TESELLÜM KAYDI",
    confirmedBy: "Onaylayan Personel",
    confirmedAt: "Onay Zamanı",
    confirmedIp: "IP / Cihaz",
    repairDetailsTitle: "BAKIM - ONARIM DETAYLARI",
    vendor: "Servis / Usta / Firma",
    repairCost: "Onarım Maliyeti",
    repairResult: "Onarım Sonucu",
    writeoffReason: "Kayıttan Düşme Sebebi",
    sigGiver: "Teslim Eden / Yetkili",
    sigReceiver: "Teslim Alan Personel",
    sigManager: "Envanter Sorumlusu",
    sigDirector: "Vakıf / Kurum Müdürü (Onay)",
    sigLabel: "İmza",
  },
  uz: {
    titles: {
      assignment: "MULKNI ZIMMATGA BERISH DALOLATNOMASI",
      return: "ZIMMATDAN QAYTARIB OLISH DALOLATNOMASI",
      transfer: "MULKNI KO'CHIRISH (TRANSFER) DALOLATNOMASI",
      repair: "TA'MIRLASH VA NOSOZLIK DALOLATNOMASI",
      writeoff: "MULKNI HISOBDAN CHIQARISH DALOLATNOMASI",
    },
    subtitles: {
      assignment: "Xodim zimmasiga biriktirish hujjati",
      return: "Zimmatdan qaytarish va qabul qilish hujjati",
      transfer: "Xonadan xonaga yoki muassasaga ko'chirish hujjati",
      repair: "Texnik xizmat va ta'mirlash qayd varaqasi",
      writeoff: "Yaroqsiz mulkni balansdan chiqarish dalolatnomasi",
    },
    docNo: "Hujjat raqami",
    date: "Sana",
    status: "Holati",
    institution: "Muassasa",
    fromLocation: "Qayerdan (Joy / Xona)",
    toLocation: "Qayerga (Joy / Xona)",
    fromPerson: "Topshiruvchi",
    toPerson: "Qabul qiluvchi (Zimmatdor)",
    reason: "Sabab / Izoh",
    tableTitle: "MULK VA BUYUMLAR RO'YXATI",
    colInvNo: "Inventar №",
    colName: "Buyum nomi / Marka-Model",
    colSerial: "Seriya №",
    colQty: "Miqdori",
    colCondBefore: "Oldingi holat",
    colCondAfter: "Topshirish holati",
    colValue: "Qiymati",
    legalAssignment:
      "Yuqorida inventar raqami, nomi, tavsifi va miqdori ko'rsatilgan Ezan Vakfı'ga tegishli buyumlarni butun, soz va ishchi holatda qabul qilib oldim. Xizmat davomida ehtiyotkorlik bilan saqlashni va ishdan bo'shaganda to'liq qaytarishni o'z zimmamga olaman.",
    legalReturn:
      "Yuqorida ko'rsatilgan buyumlar xodim zimmasidan tekshirib qabul qilindi va ko'rsatilgan holatda omborga/xonaga qaytarildi.",
    legalTransfer:
      "Yuqorida ko'rsatilgan buyumlar birinchi joydan ikkinchi joyga (muassasaga) to'liq ko'chirib o'tkazilganligi ushbu dalolatnoma bilan tasdiqlanadi.",
    legalRepair:
      "Yuqoridagi buyumning nosozlik tafsilotlari, usta/servis ma'lumotlari, ta'mir xarajati va natijasi qayd etildi.",
    legalWriteoff:
      "Yuqorida ko'rsatilgan buyumlar yaroqsiz holga kelganligi yoki xizmat muddatini o'taganligi sababli Ezan Vakfı inventar hisobidan chiqarilishiga komissiya tomonidan qaror qilindi.",
    electronicConfirmTitle: "ELEKTRON TASDIQ MA'LUMOTI",
    confirmedBy: "Tasdiqlagan xodim",
    confirmedAt: "Tasdiqlangan vaqt",
    confirmedIp: "IP manzil / Qurilma",
    repairDetailsTitle: "TA'MIRLASH TAFSILOTLARI",
    vendor: "Usta / Servis korxonasi",
    repairCost: "Ta'mir xarajati",
    repairResult: "Ta'mir natijasi",
    writeoffReason: "Hisobdan chiqarish sababi",
    sigGiver: "Topshiruvchi / Mas'ul",
    sigReceiver: "Qabul qiluvchi xodim",
    sigManager: "Inventar mas'uli",
    sigDirector: "Direktor (Tasdiqlovchi)",
    sigLabel: "Imzo",
  },
};

function drawEzanLogoCrest(doc, x, y) {
  doc.save();
  doc.roundedRect(x, y, 36, 42, 6).fillAndStroke("#0f172a", "#d97706");
  doc.circle(x + 18, y + 17, 9).fill("#fbcc42");
  doc.circle(x + 21, y + 15, 7).fill("#0f172a");
  doc.fillColor("#fbcc42").fontSize(7).text("EZAN", x, y + 30, { width: 36, align: "center" });
  doc.restore();
}

export async function generateLifecycleDocumentPdfBuffer(docId, { lang = "tr" } = {}) {
  const detail = await getDocumentDetail(docId);
  const L = lang === "uz" ? DOC_I18N.uz : DOC_I18N.tr;

  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: "A4",
      margin: 36,
      info: {
        Title: `${detail.doc_no} - ${L.titles[detail.type] || "TUTANAK"}`,
        Author: "Ezan Vakfı — Mezana Akademiyasi",
      },
    });

    if (HAS_UNICODE_FONT) {
      pdf.registerFont("Reg", FONT_REGULAR);
      pdf.registerFont("Bold", FONT_BOLD);
    }

    const fReg = HAS_UNICODE_FONT ? "Reg" : "Helvetica";
    const fBold = HAS_UNICODE_FONT ? "Bold" : "Helvetica-Bold";

    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    const pageWidth = pdf.page.width - 72;

    // 1. Header Banner
    drawEzanLogoCrest(pdf, 36, 32);
    pdf
      .font(fBold)
      .fontSize(13)
      .fillColor("#0f172a")
      .text("EZAN VAKFI", 82, 34);
    pdf
      .font(fBold)
      .fontSize(11)
      .fillColor("#1e293b")
      .text(L.titles[detail.type] || L.titles.assignment, 82, 50);
    pdf
      .font(fReg)
      .fontSize(8.5)
      .fillColor("#475569")
      .text(L.subtitles[detail.type] || "", 82, 65);

    // Right metadata badge
    pdf
      .font(fBold)
      .fontSize(10)
      .fillColor("#b45309")
      .text(`${L.docNo}: ${detail.doc_no}`, 350, 34, { width: pageWidth - 314, align: "right" });
    pdf
      .font(fReg)
      .fontSize(8.5)
      .fillColor("#334155")
      .text(
        `${L.date}: ${new Date(detail.created_at).toISOString().slice(0, 10)}   |   ${L.status}: ${String(detail.status).toUpperCase()}`,
        350,
        50,
        { width: pageWidth - 314, align: "right" }
      );

    pdf
      .moveTo(36, 82)
      .lineTo(36 + pageWidth, 82)
      .lineWidth(1.2)
      .strokeColor("#cbd5e1")
      .stroke();

    // 2. Info Box
    let curY = 92;
    pdf.roundedRect(36, curY, pageWidth, 68, 5).fillAndStroke("#f8fafc", "#e2e8f0");

    const instLabel = detail.to_institution_name
      ? `${detail.institution_name} -> ${detail.to_institution_name}`
      : `${detail.institution_name} (${detail.institution_code})`;

    pdf.font(fBold).fontSize(8.5).fillColor("#334155").text(`${L.institution}:`, 46, curY + 8);
    pdf.font(fReg).fontSize(8.5).fillColor("#0f172a").text(instLabel, 145, curY + 8, { width: 165 });

    pdf.font(fBold).fontSize(8.5).fillColor("#334155").text(`${L.fromLocation}:`, 46, curY + 24);
    pdf.font(fReg).fontSize(8.5).fillColor("#0f172a").text(detail.from_location_name || "—", 145, curY + 24, { width: 165 });

    pdf.font(fBold).fontSize(8.5).fillColor("#334155").text(`${L.toLocation}:`, 46, curY + 40);
    pdf.font(fReg).fontSize(8.5).fillColor("#0f172a").text(detail.to_location_name || "—", 145, curY + 40, { width: 165 });

    pdf.font(fBold).fontSize(8.5).fillColor("#334155").text(`${L.fromPerson}:`, 320, curY + 8);
    pdf.font(fReg).fontSize(8.5).fillColor("#0f172a").text(detail.from_person_name || detail.created_by_name || "—", 430, curY + 8, { width: 120 });

    pdf.font(fBold).fontSize(8.5).fillColor("#334155").text(`${L.toPerson}:`, 320, curY + 24);
    pdf.font(fReg).fontSize(8.5).fillColor("#0f172a").text(detail.to_person_name || "—", 430, curY + 24, { width: 120 });

    pdf.font(fBold).fontSize(8.5).fillColor("#334155").text(`${L.reason}:`, 320, curY + 40);
    pdf.font(fReg).fontSize(8.5).fillColor("#0f172a").text(detail.reason || detail.notes || "—", 430, curY + 40, { width: 120 });

    curY += 80;

    // Extra box for Repair or Writeoff details if applicable
    if (detail.type === "repair") {
      const md = detail.metadata || {};
      pdf.roundedRect(36, curY, pageWidth, 36, 4).fillAndStroke("#fffbeb", "#fde68a");
      pdf.font(fBold).fontSize(8.5).fillColor("#92400e").text(L.repairDetailsTitle, 46, curY + 6);
      pdf
        .font(fReg)
        .fontSize(8.5)
        .fillColor("#0f172a")
        .text(
          `${L.vendor}: ${md.vendor || "—"}   |   ${L.repairCost}: ${md.cost !== undefined ? `${md.cost} ${md.currency || "TRY"}` : "—"}   |   ${L.repairResult}: ${md.result || "under_repair"}`,
          46,
          curY + 20
        );
      curY += 46;
    } else if (detail.type === "writeoff") {
      const md = detail.metadata || {};
      pdf.roundedRect(36, curY, pageWidth, 32, 4).fillAndStroke("#fef2f2", "#fecaca");
      pdf
        .font(fBold)
        .fontSize(8.5)
        .fillColor("#991b1b")
        .text(
          `${L.writeoffReason}: ${String(md.writeoff_reason || "broken").toUpperCase()}   |   ${detail.reason || ""}`,
          46,
          curY + 10
        );
      curY += 42;
    }

    // 3. Items Table
    pdf.font(fBold).fontSize(9.5).fillColor("#0f172a").text(L.tableTitle, 36, curY);
    curY += 14;

    const cols = [
      { label: "#", width: 22 },
      { label: L.colInvNo, width: 82 },
      { label: L.colName, width: 155 },
      { label: L.colSerial, width: 75 },
      { label: L.colQty, width: 48 },
      { label: L.colCondAfter, width: 68 },
      { label: L.colValue, width: pageWidth - 450 },
    ];

    pdf.rect(36, curY, pageWidth, 18).fill("#0f172a");
    let cx = 36;
    for (const col of cols) {
      pdf
        .font(fBold)
        .fontSize(7.5)
        .fillColor("#ffffff")
        .text(col.label, cx + 4, curY + 5, { width: col.width - 8 });
      cx += col.width;
    }
    curY += 18;

    detail.items.forEach((it, idx) => {
      if (curY > pdf.page.height - 160) {
        pdf.addPage();
        curY = 40;
      }
      const rowH = 20;
      pdf
        .rect(36, curY, pageWidth, rowH)
        .fillAndStroke(idx % 2 === 0 ? "#ffffff" : "#f8fafc", "#e2e8f0");

      const nameAndBrand = [it.asset_name, it.brand, it.model].filter(Boolean).join(" ");
      const valStr =
        it.purchase_price !== null && it.purchase_price !== undefined
          ? `${Number(it.purchase_price * it.qty).toLocaleString("en-US")} ${it.currency || "TRY"}`
          : "—";

      const cells = [
        String(idx + 1),
        it.inventory_no || "—",
        nameAndBrand,
        it.serial_no || "—",
        `${it.qty} ${it.unit || "dona"}`,
        it.condition_after || it.condition_before || "good",
        valStr,
      ];

      let rx = 36;
      cells.forEach((txt, cIdx) => {
        pdf
          .font(cIdx === 1 ? fBold : fReg)
          .fontSize(7.5)
          .fillColor("#0f172a")
          .text(String(txt), rx + 4, curY + 5, {
            width: cols[cIdx].width - 8,
            height: rowH - 6,
            ellipsis: true,
          });
        rx += cols[cIdx].width;
      });
      curY += rowH;
    });

    curY += 14;

    // 4. Legal Declaration Text
    const legalMap = {
      assignment: L.legalAssignment,
      return: L.legalReturn,
      transfer: L.legalTransfer,
      repair: L.legalRepair,
      writeoff: L.legalWriteoff,
    };
    pdf
      .font(fReg)
      .fontSize(8.5)
      .fillColor("#1e293b")
      .text(legalMap[detail.type] || L.legalAssignment, 36, curY, {
        width: pageWidth,
        align: "justify",
      });
    curY = pdf.y + 14;

    // 5. Electronic Confirmation Box (if confirmed via `vaqf.document_confirmations`)
    if (detail.confirmations && detail.confirmations.length > 0) {
      const conf = detail.confirmations[0];
      pdf.roundedRect(36, curY, pageWidth, 46, 5).fillAndStroke("#ecfdf5", "#6ee7b7");
      pdf
        .font(fBold)
        .fontSize(8.5)
        .fillColor("#065f46")
        .text(`✓ ${L.electronicConfirmTitle}`, 46, curY + 7);
      pdf
        .font(fReg)
        .fontSize(8)
        .fillColor("#064e3b")
        .text(
          `${L.confirmedBy}: ${conf.person_name || conf.person_ref}   |   ${L.confirmedAt}: ${new Date(conf.confirmed_at).toISOString().replace("T", " ").slice(0, 19)} UTC   |   ${L.confirmedIp}: ${conf.ip || "—"}`,
          46,
          curY + 21
        );
      if (conf.comment) {
        pdf.font(fReg).fontSize(7.5).fillColor("#047857").text(`"${conf.comment}"`, 46, curY + 33);
      }
      curY += 58;
    }

    // 6. Paper Signature Blocks
    if (curY > pdf.page.height - 110) {
      pdf.addPage();
      curY = 50;
    }

    const sigBoxW = (pageWidth - 24) / 3;
    const sigBoxes =
      detail.type === "assignment" || detail.type === "return"
        ? [
            { title: L.sigGiver, name: detail.from_person_name || detail.created_by_name || "—" },
            { title: L.sigReceiver, name: detail.to_person_name || "—" },
            { title: L.sigDirector, name: detail.approved_by_name || "Mezana Rahbariyat" },
          ]
        : [
            { title: L.sigManager, name: detail.created_by_name || "—" },
            { title: L.sigGiver, name: detail.from_person_name || "—" },
            { title: L.sigDirector, name: detail.approved_by_name || "Mezana Rahbariyat" },
          ];

    sigBoxes.forEach((sb, idx) => {
      const sx = 36 + idx * (sigBoxW + 12);
      pdf.roundedRect(sx, curY, sigBoxW, 64, 4).strokeColor("#cbd5e1").lineWidth(0.8).stroke();
      pdf.font(fBold).fontSize(8).fillColor("#334155").text(sb.title, sx + 8, curY + 8, { width: sigBoxW - 16 });
      pdf.font(fReg).fontSize(8).fillColor("#0f172a").text(sb.name, sx + 8, curY + 22, { width: sigBoxW - 16 });
      pdf
        .font(fReg)
        .fontSize(7.5)
        .fillColor("#64748b")
        .text(`${L.sigLabel}: ___________________`, sx + 8, curY + 44);
    });

    pdf.end();
  });
}

// ============================================================================
// 6-QADAM: HISOBOTLAR (REPORTS + EXCEL & PDF EXPORT)
// ============================================================================
export async function getLifecycleReports(filters = {}) {
  const fromDate = filters.from_date ? String(filters.from_date).slice(0, 10) : null;
  const toDate = filters.to_date ? String(filters.to_date).slice(0, 10) : null;
  const institutionId = filters.institution_id ? Number(filters.institution_id) : 1;

  // 1. Active assignments by employee
  const assignmentsRes = await query(
    `SELECT
       asg.id AS assignment_id,
       asg.person_ref,
       asg.person_name,
       (asg.qty - COALESCE(asg.returned_qty, 0))::float AS qty,
       asg.assigned_at,
       TO_CHAR(asg.expected_return_at, 'YYYY-MM-DD') AS expected_return_at,
       d.doc_no,
       asg.assign_doc_id,
       a.id AS asset_id,
       a.inventory_no,
       a.name AS asset_name,
       a.brand,
       a.model,
       a.serial_no,
       a.unit,
       a.condition,
       a.purchase_price::float AS purchase_price,
       a.currency,
       l.name AS location_name,
       c.name AS category_name
     FROM vaqf.assignments asg
     JOIN vaqf.assets a ON a.id = asg.asset_id
     LEFT JOIN vaqf.documents d ON d.id = asg.assign_doc_id
     LEFT JOIN vaqf.locations l ON l.id = a.location_id
     LEFT JOIN vaqf.asset_categories c ON c.id = a.category_id
     WHERE asg.returned_at IS NULL
       AND a.deleted_at IS NULL
       AND a.institution_id = $1
     ORDER BY asg.person_name ASC, asg.assigned_at DESC`,
    [institutionId]
  );

  // 2. Movements journal for period
  const movParams = [institutionId];
  const movWhere = ["a.institution_id = $1"];
  if (fromDate) {
    movParams.push(fromDate);
    movWhere.push(`ev.created_at >= $${movParams.length}::date`);
  }
  if (toDate) {
    movParams.push(toDate);
    movWhere.push(`ev.created_at < ($${movParams.length}::date + INTERVAL '1 day')`);
  }
  const movementsRes = await query(
    `SELECT
       ev.*,
       a.inventory_no,
       a.name AS asset_name,
       d.doc_no,
       d.type AS doc_type
     FROM vaqf.asset_events ev
     JOIN vaqf.assets a ON a.id = ev.asset_id
     LEFT JOIN vaqf.documents d ON d.id = ev.document_id
     WHERE ${movWhere.join(" AND ")}
     ORDER BY ev.created_at DESC, ev.id DESC
     LIMIT 250`,
    movParams
  );

  // 3. Writeoffs by reason, value, and period
  const woParams = [institutionId];
  const woWhere = ["a.institution_id = $1"];
  if (fromDate) {
    woParams.push(fromDate);
    woWhere.push(`w.created_at >= $${woParams.length}::date`);
  }
  if (toDate) {
    woParams.push(toDate);
    woWhere.push(`w.created_at < ($${woParams.length}::date + INTERVAL '1 day')`);
  }
  const writeoffsRes = await query(
    `SELECT
       w.*,
       w.qty::float AS qty,
       w.book_value::float AS book_value,
       w.sale_amount::float AS sale_amount,
       a.inventory_no,
       a.name AS asset_name,
       c.name AS category_name,
       d.doc_no
     FROM vaqf.writeoffs w
     JOIN vaqf.assets a ON a.id = w.asset_id
     LEFT JOIN vaqf.asset_categories c ON c.id = a.category_id
     LEFT JOIN vaqf.documents d ON d.id = w.document_id
     WHERE ${woWhere.join(" AND ")}
     ORDER BY w.created_at DESC`,
    woParams
  );

  // 4. Repair costs by item, category, and period + Top failing assets
  const repParams = [institutionId];
  const repWhere = ["a.institution_id = $1"];
  if (fromDate) {
    repParams.push(fromDate);
    repWhere.push(`r.sent_at >= $${repParams.length}::date`);
  }
  if (toDate) {
    repParams.push(toDate);
    repWhere.push(`r.sent_at < ($${repParams.length}::date + INTERVAL '1 day')`);
  }
  const repairsRes = await query(
    `SELECT
       r.*,
       r.cost::float AS cost,
       a.inventory_no,
       a.name AS asset_name,
       c.name AS category_name,
       d.doc_no
     FROM vaqf.repairs r
     JOIN vaqf.assets a ON a.id = r.asset_id
     LEFT JOIN vaqf.asset_categories c ON c.id = a.category_id
     LEFT JOIN vaqf.documents d ON d.id = r.document_id
     WHERE ${repWhere.join(" AND ")}
     ORDER BY r.sent_at DESC`,
    repParams
  );

  const topFailingRes = await query(
    `SELECT
       a.id AS asset_id,
       a.inventory_no,
       a.name AS asset_name,
       c.name AS category_name,
       COUNT(r.id)::int AS repairs_count,
       COALESCE(SUM(CASE WHEN r.currency = 'TRY' THEN COALESCE(r.cost, 0) ELSE 0 END), 0)::float AS total_cost_try,
       COALESCE(SUM(CASE WHEN r.currency = 'USD' THEN COALESCE(r.cost, 0) ELSE 0 END), 0)::float AS total_cost_usd
     FROM vaqf.repairs r
     JOIN vaqf.assets a ON a.id = r.asset_id
     LEFT JOIN vaqf.asset_categories c ON c.id = a.category_id
     WHERE a.institution_id = $1
     GROUP BY a.id, a.inventory_no, a.name, c.name
     ORDER BY repairs_count DESC, total_cost_try DESC
     LIMIT 20`,
    [institutionId]
  );

  // 5. Assets with warranty expiring within 30 days
  const warrantyRes = await query(
    `SELECT
       a.id,
       a.inventory_no,
       a.name,
       a.brand,
       a.model,
       a.serial_no,
       TO_CHAR(a.warranty_until, 'YYYY-MM-DD') AS warranty_until_str,
       (a.warranty_until - CURRENT_DATE)::int AS days_remaining,
       l.name AS location_name,
       a.responsible_name,
       c.name AS category_name
     FROM vaqf.assets a
     LEFT JOIN vaqf.locations l ON l.id = a.location_id
     LEFT JOIN vaqf.asset_categories c ON c.id = a.category_id
     WHERE a.deleted_at IS NULL
       AND a.status != 'written_off'
       AND a.institution_id = $1
       AND a.warranty_until IS NOT NULL
       AND a.warranty_until BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
     ORDER BY a.warranty_until ASC`,
    [institutionId]
  );

  // Group active assignments by employee for UI summary table
  const empMap = new Map();
  for (const r of assignmentsRes.rows) {
    const key = (r.person_ref || r.person_name || "Noma'lum").toLowerCase();
    if (!empMap.has(key)) {
      empMap.set(key, {
        person_ref: r.person_ref,
        person_name: r.person_name || r.person_ref,
        assignments_count: 0,
        total_units: 0,
        total_value_try: 0,
      });
    }
    const g = empMap.get(key);
    g.assignments_count += 1;
    g.total_units += Number(r.qty || 1);
    if ((r.currency || "TRY") === "TRY" && r.purchase_price !== null) {
      g.total_value_try += Number(r.purchase_price || 0) * Number(r.qty || 1);
    }
  }

  const writeoffsTotalBookValue = writeoffsRes.rows.reduce((s, r) => s + Number(r.book_value || 0), 0);
  const repairsTotalCostTry = repairsRes.rows.reduce(
    (s, r) => s + ((r.currency || "TRY") === "TRY" ? Number(r.cost || 0) : 0),
    0
  );

  return {
    assignments: assignmentsRes.rows,
    employeeAssignments: Array.from(empMap.values()),
    movements: movementsRes.rows,
    writeoffs: {
      items: writeoffsRes.rows,
      totals: {
        total_count: writeoffsRes.rows.length,
        total_book_value: writeoffsTotalBookValue,
      },
    },
    repairs: {
      items: repairsRes.rows,
      summary: {
        repairs_count: repairsRes.rows.length,
        total_cost_try: repairsTotalCostTry,
      },
      topFailingAssets: topFailingRes.rows.map((r) => ({
        ...r,
        id: r.asset_id,
        name: r.asset_name,
        repair_count: r.repairs_count,
        total_repair_cost: r.total_cost_try,
      })),
    },
    top_failing_assets: topFailingRes.rows,
    warranty_expiring_30d: warrantyRes.rows,
    expiringWarrantyAssets: warrantyRes.rows,
  };
}

export async function generateAssignmentsExcelBuffer(institutionId = 1) {
  const data = await getLifecycleReports({ institution_id: institutionId });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Zimmatlar ro'yxati");

  ws.columns = [
    { header: "Xodim (Zimmatdor)", key: "person_name", width: 26 },
    { header: "Inventar №", key: "inventory_no", width: 18 },
    { header: "Buyum nomi", key: "asset_name", width: 30 },
    { header: "Kategoriya", key: "category_name", width: 20 },
    { header: "Miqdori", key: "qty", width: 12 },
    { header: "Birlik", key: "unit", width: 10 },
    { header: "Joy / Xona", key: "location_name", width: 22 },
    { header: "Hujjat №", key: "doc_no", width: 18 },
    { header: "Berilgan sana", key: "assigned_at", width: 16 },
    { header: "Narxi", key: "price", width: 16 },
  ];

  ws.getRow(1).font = { bold: true };
  for (const r of data.assignments) {
    ws.addRow({
      person_name: r.person_name,
      inventory_no: r.inventory_no,
      asset_name: r.asset_name,
      category_name: r.category_name || "—",
      qty: r.qty,
      unit: r.unit || "dona",
      location_name: r.location_name || "—",
      doc_no: r.doc_no || "—",
      assigned_at: r.assigned_at ? new Date(r.assigned_at).toISOString().slice(0, 10) : "—",
      price: r.purchase_price !== null ? `${r.purchase_price} ${r.currency || "TRY"}` : "—",
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function generateAssignmentsPdfBuffer(institutionId = 1, { lang = "tr" } = {}) {
  const data = await getLifecycleReports({ institution_id: institutionId });
  const isUz = lang === "uz";

  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margin: 36 });
    if (HAS_UNICODE_FONT) {
      pdf.registerFont("Reg", FONT_REGULAR);
      pdf.registerFont("Bold", FONT_BOLD);
    }
    const fReg = HAS_UNICODE_FONT ? "Reg" : "Helvetica";
    const fBold = HAS_UNICODE_FONT ? "Bold" : "Helvetica-Bold";

    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    drawEzanLogoCrest(pdf, 36, 30);
    pdf
      .font(fBold)
      .fontSize(13)
      .fillColor("#0f172a")
      .text(
        isUz
          ? "EZAN VAKFI — XODIMLAR BO'YICHA ZIMMATLAR RO'YXATI"
          : "EZAN VAKFI — PERSONEL ZİMMET LİSTESİ RAPORU",
        82,
        36
      );
    pdf
      .font(fReg)
      .fontSize(9)
      .fillColor("#475569")
      .text(`Mezana Akademiyasi | ${new Date().toISOString().slice(0, 10)}`, 82, 54);

    let y = 84;
    const pageW = pdf.page.width - 72;
    pdf.rect(36, y, pageW, 18).fill("#0f172a");
    pdf.font(fBold).fontSize(8).fillColor("#ffffff");
    pdf.text(isUz ? "Xodim" : "Personel", 40, y + 5, { width: 120 });
    pdf.text(isUz ? "Inventar №" : "Envanter No", 165, y + 5, { width: 80 });
    pdf.text(isUz ? "Buyum nomi" : "Malzeme Adı", 250, y + 5, { width: 150 });
    pdf.text(isUz ? "Miqdor" : "Miktar", 405, y + 5, { width: 55 });
    pdf.text(isUz ? "Hujjat №" : "Belge No", 465, y + 5, { width: 90 });
    y += 18;

    data.assignments.forEach((r, idx) => {
      if (y > pdf.page.height - 60) {
        pdf.addPage();
        y = 40;
      }
      pdf.rect(36, y, pageW, 18).fillAndStroke(idx % 2 === 0 ? "#ffffff" : "#f8fafc", "#e2e8f0");
      pdf.font(fReg).fontSize(7.5).fillColor("#0f172a");
      pdf.text(r.person_name || "—", 40, y + 5, { width: 120, ellipsis: true });
      pdf.font(fBold).text(r.inventory_no || "—", 165, y + 5, { width: 80 });
      pdf.font(fReg).text(r.asset_name || "—", 250, y + 5, { width: 150, ellipsis: true });
      pdf.text(`${r.qty} ${r.unit || "dona"}`, 405, y + 5, { width: 55 });
      pdf.text(r.doc_no || "—", 465, y + 5, { width: 90 });
      y += 18;
    });

    pdf.end();
  });
}
