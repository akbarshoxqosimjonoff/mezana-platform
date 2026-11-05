import crypto from "node:crypto";
import { dbQuery, ensureSchema } from "./db/schema";
import { seedDatabase } from "./db/seed";
import { mapCampaignToInternalPurpose } from "./lib/config";

export function getSyncSecret(): string {
  return process.env.EZAN_SYNC_SECRET || "ezan-vaqf-internal-sync-secret-2027";
}

export function computeInternalHmac(timestamp: string, method: string, pathAndQuery: string, rawBody = "", secret = getSyncSecret()): string {
  const payload = `${timestamp}.${method.toUpperCase()}.${pathAndQuery}.${rawBody}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyInternalSyncAuth(params: {
  timestampHeader: string | null;
  signatureHeader: string | null;
  method: string;
  pathAndQuery: string;
  rawBody?: string;
  nowMs?: number;
}): { ok: boolean; error?: string } {
  const { timestampHeader, signatureHeader, method, pathAndQuery, rawBody = "" } = params;
  if (!timestampHeader || !signatureHeader) {
    return { ok: false, error: "Missing X-Timestamp or X-Signature header" };
  }

  const tsNum = Number(timestampHeader);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, error: "Invalid X-Timestamp header" };
  }

  const now = params.nowMs ?? Date.now();
  const tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
  // ?5 daqiqadan eski so'rov rad etiladi
  if (Math.abs(now - tsMs) > 5 * 60 * 1000) {
    return { ok: false, error: "Request timestamp expired (> 5 minutes)" };
  }

  const expected = computeInternalHmac(timestampHeader, method, pathAndQuery, rawBody);
  try {
    const valid = crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
    return valid ? { ok: true } : { ok: false, error: "Invalid HMAC signature" };
  } catch {
    return { ok: false, error: "Invalid HMAC signature format" };
  }
}

export async function listUnsyncedDonationsForVaqf(cursor = 0, limit = 100) {
  await ensureSchema();
  await seedDatabase();
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 100));
  const safeCursor = Math.max(0, Number(cursor) || 0);

  const res = await dbQuery(
    `SELECT *
     FROM donations
     WHERE id > $1
       AND status IN ('paid', 'refunded')
       AND synced_to_vaqf_at IS NULL
     ORDER BY id ASC
     LIMIT $2`,
    [safeCursor, safeLimit]
  );

  const items = res.rows.map((row) => {
    const hasKvkk = Boolean(row.kvkk_consent) && !row.deleted_pii_at && !row.is_anonymous;
    const mapped = mapCampaignToInternalPurpose(
      row.purpose_code,
      row.purpose_title,
      Boolean(row.restricted)
    );

    return {
      cursor_id: row.id,
      external_ref: row.external_id,
      public_no: row.public_no,
      status: row.status, // 'paid' | 'refunded'
      amount: Number(row.amount),
      currency: row.currency || "TRY",
      amount_try: Number(row.amount_try),
      purpose_code: row.purpose_code,
      purpose: mapped.purpose,
      restricted: mapped.restricted,
      received_at: row.paid_at ? new Date(row.paid_at).toISOString().slice(0, 10) : new Date(row.created_at).toISOString().slice(0, 10),
      refund_reason: row.refund_reason || null,
      kvkk_consent: Boolean(row.kvkk_consent),
      // Javobda faqat kerakli maydonlar: xayriyachi ismi, telefoni va e-pochtasi, agar KVKK roziligi bo'lsa
      donor: {
        is_anonymous: Boolean(row.is_anonymous || !hasKvkk),
        full_name: hasKvkk ? row.donor_name : "Anonim Ba?????",
        phone: hasKvkk ? row.donor_phone : null,
        email: hasKvkk ? row.donor_email : null
      }
    };
  });

  const nextCursor = items.length > 0 ? items[items.length - 1]!.cursor_id : null;
  return { items, nextCursor };
}

export async function acknowledgeSyncedDonations(externalRefs: string[]) {
  await ensureSchema();
  if (!Array.isArray(externalRefs) || externalRefs.length === 0) {
    return { acknowledged: 0 };
  }
  const cleanRefs = externalRefs.filter((r) => typeof r === "string" && r.length > 10);
  if (cleanRefs.length === 0) return { acknowledged: 0 };

  const res = await dbQuery(
    `UPDATE donations
     SET synced_to_vaqf_at = NOW(),
         updated_at = NOW()
     WHERE external_id = ANY($1::uuid[])`,
    [cleanRefs]
  );

  return { acknowledged: res.rowCount };
}
