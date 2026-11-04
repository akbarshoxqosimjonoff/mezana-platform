import { platformPool, createPsqlPool } from "../campusSmartService.mjs";

export const db = platformPool;

/**
 * Execute a parameterized query on the vaqf schema (mezana_platform database).
 * Strictly enforces parameterized queries ($1, $2, ...).
 */
export async function query(sql, params = []) {
  if (!Array.isArray(params)) {
    throw new Error("vaqf/db: params must be an array");
  }
  return db.query(sql, params);
}

/**
 * Run a callback inside a PostgreSQL transaction with a dedicated client.
 */
export async function withTransaction(fn) {
  const client = await db.rawPool.connect();
  try {
    await client.query("BEGIN");
    const tx = {
      async query(sql, params = []) {
        const cleanSql = String(sql || "").trim().replace(/;+\s*$/, "");
        const res = params.length > 0 ? await client.query(cleanSql, params) : await client.query(cleanSql);
        return { rows: res.rows || [], rowCount: res.rowCount || 0 };
      },
    };
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function getCrmPool() {
  const url = process.env.CRM_DB_URL;
  return url ? createPsqlPool(url) : null;
}

export function getErpPool() {
  const url = process.env.ERP_DB_URL;
  return url ? createPsqlPool(url) : null;
}
