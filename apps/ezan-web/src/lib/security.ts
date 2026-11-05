import { dbQuery, ensureSchema } from "../db/schema";

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests = 30, windowMs = 60_000): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  entry.count += 1;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: maxRequests - entry.count };
}

export function maskPhoneForLog(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length <= 4) return "***";
  return `***${digits.slice(-4)}`;
}

export function maskEmailForLog(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return "";
  const [user, dom] = email.split("@");
  return `${(user || "").slice(0, 2)}***@${dom}`;
}

export function maskIpForLog(ip: string | null | undefined): string {
  if (!ip) return "";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  return "***:***";
}

export function sanitizeLogObject(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    if (lower.includes("phone")) {
      out[k] = maskPhoneForLog(String(v || ""));
    } else if (lower.includes("email")) {
      out[k] = maskEmailForLog(String(v || ""));
    } else if (lower === "ip" || lower.includes("ipaddress") || lower.includes("clientip")) {
      out[k] = maskIpForLog(String(v || ""));
    } else if (lower.includes("card") || lower.includes("cvv") || lower.includes("pan")) {
      out[k] = "[REDACTED-CARD-PROHIBITED]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function verifyTurnstileToken(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || process.env.NODE_ENV !== "production") {
    return Boolean(token && token.length >= 4);
  }
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token })
    });
    const data: any = await res.json();
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

export async function eraseDonorPiiByKvkkRequest(donationPublicNoOrEmail: string): Promise<{ erasedCount: number }> {
  await ensureSchema();
  const target = (donationPublicNoOrEmail || "").trim();
  if (!target) return { erasedCount: 0 };

  const res = await dbQuery(
    `UPDATE donations
     SET donor_name = 'Anonim (KVKK Silindi)',
         donor_phone = NULL,
         donor_email = NULL,
         is_anonymous = TRUE,
         deleted_pii_at = NOW(),
         updated_at = NOW()
     WHERE public_no = $1 OR LOWER(donor_email) = LOWER($1)`,
    [target]
  );

  return { erasedCount: res.rowCount };
}
