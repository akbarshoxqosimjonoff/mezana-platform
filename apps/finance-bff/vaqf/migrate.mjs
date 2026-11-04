import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { platformPool, createPsqlPool } from "../campusSmartService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

export async function runVaqfMigrations(pool = platformPool, { silent = false } = {}) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS vaqf`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vaqf.schema_migrations (
      version VARCHAR(120) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const appliedRes = await pool.query(`SELECT version FROM vaqf.schema_migrations ORDER BY version ASC`);
  const applied = new Set(appliedRes.rows.map((r) => r.version));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const newlyApplied = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(fullPath, "utf8");
    const client = await pool.rawPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO vaqf.schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`, [file]);
      await client.query("COMMIT");
      newlyApplied.push(file);
      if (!silent) console.log(`[vaqf:migrate] Applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }
  return { totalFiles: files.length, newlyApplied };
}

export async function syncCrmRoomsToLocations(pool = platformPool, crmDbUrl = process.env.CRM_DB_URL) {
  if (!crmDbUrl) return { imported: 0 };
  const crmPool = createPsqlPool(crmDbUrl);
  const instRes = await pool.query(`SELECT id FROM vaqf.institutions WHERE code = $1 LIMIT 1`, ["MZN"]);
  const instId = instRes.rows[0]?.id;
  if (!instId) return { imported: 0 };

  const bldgRes = await pool.query(`SELECT id FROM vaqf.locations WHERE external_ref = $1 LIMIT 1`, ["mzn:building:main"]);
  const bldgId = bldgRes.rows[0]?.id || null;

  const roomsRes = await crmPool.query(
    `SELECT id, "roomNumber", floor, capacity, "studyPlace", description, "isDeleted"
     FROM "Room"
     WHERE COALESCE("isDeleted", false) = false
     ORDER BY floor ASC, "roomNumber" ASC`
  );

  let imported = 0;
  for (const r of roomsRes.rows) {
    const floorNum = Number(r.floor || 1);
    const floorExtRef = `mzn:floor:${floorNum}`;
    let floorRes = await pool.query(`SELECT id FROM vaqf.locations WHERE external_ref = $1 LIMIT 1`, [floorExtRef]);
    let floorId = floorRes.rows[0]?.id;
    if (!floorId && bldgId) {
      const insFloor = await pool.query(
        `INSERT INTO vaqf.locations (institution_id, parent_id, kind, name, code, external_ref, sort_order)
         VALUES ($1, $2, 'floor', $3, $4, $5, $6)
         ON CONFLICT (external_ref) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [instId, bldgId, `${floorNum}-qavat`, `Q${floorNum}`, floorExtRef, floorNum]
      );
      floorId = insFloor.rows[0]?.id;
    }

    const roomExtRef = `crm:room:${r.id}`;
    const roomNum = String(r.roomNumber || "").trim();
    const roomName = r.description
      ? `${roomNum}-xona (${r.description})`
      : `${roomNum}-xona`;
    const notes = r.capacity ? `Sig'imi: ${r.capacity} kishi` : null;

    await pool.query(
      `INSERT INTO vaqf.locations (institution_id, parent_id, kind, name, code, external_ref, notes, sort_order)
       VALUES ($1, $2, 'room', $3, $4, $5, $6, $7)
       ON CONFLICT (external_ref) DO UPDATE SET
         parent_id = COALESCE(vaqf.locations.parent_id, EXCLUDED.parent_id),
         name = EXCLUDED.name,
         code = EXCLUDED.code,
         updated_at = NOW()`,
      [instId, floorId || bldgId, roomName, roomNum, roomExtRef, notes, Number.parseInt(roomNum, 10) || 100]
    );
    imported++;
  }
  return { imported };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runVaqfMigrations()
    .then(async (res) => {
      const crmSync = await syncCrmRoomsToLocations();
      console.log(`[vaqf:migrate] Done. Newly applied: ${res.newlyApplied.length}, CRM rooms synced: ${crmSync.imported}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[vaqf:migrate] ERROR:", err);
      process.exit(1);
    });
}
