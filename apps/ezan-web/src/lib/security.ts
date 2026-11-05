import crypto from "node:crypto";
import net from "node:net";
import { dbQuery, ensureSchema } from "../db/schema";
import { requireEnvSecret } from "./config";

// Bitta instansiya uchun xotiradagi (Map) rate-limit. Kalit cf-connecting-ip bo'yicha olinadi.
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

// Rasmiy Cloudflare IPv4 va IPv6 CIDR diapazonlari
export const CLOUDFLARE_IPV4_CIDRS = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22"
];

export const CLOUDFLARE_IPV6_CIDRS = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32"
];

const cfBlockList = new net.BlockList();
for (const cidr of CLOUDFLARE_IPV4_CIDRS) {
  const [addr, prefix] = cidr.split("/");
  if (addr && prefix) cfBlockList.addSubnet(addr, Number(prefix), "ipv4");
}
for (const cidr of CLOUDFLARE_IPV6_CIDRS) {
  const [addr, prefix] = cidr.split("/");
  if (addr && prefix) cfBlockList.addSubnet(addr, Number(prefix), "ipv6");
}

export function isCloudflareIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const clean = ip.trim().replace(/^::ffff:/i, "");
  const ver = net.isIP(clean);
  if (ver === 4) return cfBlockList.check(clean, "ipv4");
  if (ver === 6) return cfBlockList.check(clean, "ipv6");
  return false;
}

/**
 * Rate limit uchun cf-connecting-ip ni oladi (x-forwarded-for ga ishonilmaydi).
 */
export function getRateLimitClientIp(headers: Headers): string {
  const cfIp = headers.get("cf-connecting-ip")?.trim();
  if (cfIp && net.isIP(cfIp)) {
    return cfIp;
  }
  return "no-cf-ip";
}

/**
 * Admin IP filtri:
 * - IP faqat `cf-connecting-ip` dan olinadi;
 * - Faqat so'rov Cloudflare IP diapazonidan (`peerIp`) kelgan bo'lsa ishoniladi;
 * - IP bo'lmasa, rad etiladi (`false`);
 * - Standart ro'yxatda `127.0.0.1` yo'q.
 */
export function isAdminIpAllowed(params: {
  cfConnectingIp?: string | null;
  peerIp?: string | null;
}): boolean {
  const cfIp = params.cfConnectingIp?.trim() || "";
  const peerIp = params.peerIp?.trim() || "";

  if (!cfIp || !net.isIP(cfIp)) {
    return false;
  }
  if (!peerIp || !isCloudflareIp(peerIp)) {
    return false;
  }

  const allowedRaw = (process.env.ADMIN_ALLOWED_IPS || "").trim();
  if (!allowedRaw) {
    return false;
  }

  const allowedList = allowedRaw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x !== "127.0.0.1" && x !== "::1");

  return allowedList.includes(cfIp);
}

function base64UrlToBuffer(b64u: string): Buffer {
  const pad = b64u.length % 4 === 0 ? "" : "=".repeat(4 - (b64u.length % 4));
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

let jwksCache: { domain: string; expiresAt: number; keys: any[] } | null = null;

/**
 * Cloudflare Access JWT imzosini team domenining JWKS kalitlari bilan tekshiradi.
 */
export async function verifyCloudflareAccessJwt(
  jwtToken: string | null | undefined,
  options?: {
    teamDomain?: string;
    expectedAud?: string;
    jwksKeysOverride?: any[];
    nowSec?: number;
  }
): Promise<{ valid: boolean; email?: string; error?: string }> {
  if (!jwtToken || typeof jwtToken !== "string") {
    return { valid: false, error: "Missing Cloudflare Access JWT" };
  }

  const parts = jwtToken.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Malformed JWT" };
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  let header: any;
  let payload: any;
  try {
    header = JSON.parse(base64UrlToBuffer(headerB64).toString("utf8"));
    payload = JSON.parse(base64UrlToBuffer(payloadB64).toString("utf8"));
  } catch {
    return { valid: false, error: "Invalid JWT JSON encoding" };
  }

  if (header.alg !== "RS256" || !header.kid) {
    return { valid: false, error: "Unsupported JWT algorithm or missing kid" };
  }

  const rawDomain = (options?.teamDomain || process.env.CF_ACCESS_TEAM_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const expectedAud = (options?.expectedAud || process.env.CF_ACCESS_AUD || "").trim();
  if (!rawDomain || !expectedAud) {
    return { valid: false, error: "CF_ACCESS_TEAM_DOMAIN or CF_ACCESS_AUD not configured" };
  }

  const nowSec = options?.nowSec ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    return { valid: false, error: "JWT expired" };
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSec + 60) {
    return { valid: false, error: "JWT not yet valid" };
  }

  const expectedIssuer = `https://${rawDomain}`;
  if (payload.iss !== expectedIssuer) {
    return { valid: false, error: "Invalid JWT issuer" };
  }

  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audList.includes(expectedAud)) {
    return { valid: false, error: "Invalid JWT audience" };
  }

  let keys: any[] = [];
  if (options?.jwksKeysOverride) {
    keys = options.jwksKeysOverride;
  } else if (jwksCache && jwksCache.domain === rawDomain && jwksCache.expiresAt > Date.now()) {
    keys = jwksCache.keys;
  } else {
    try {
      const res = await fetch(`${expectedIssuer}/cdn-cgi/access/certs`);
      if (!res.ok) return { valid: false, error: "Failed to fetch Cloudflare JWKS" };
      const data: any = await res.json();
      keys = Array.isArray(data?.keys) ? data.keys : [];
      jwksCache = { domain: rawDomain, expiresAt: Date.now() + 5 * 60_000, keys };
    } catch {
      return { valid: false, error: "Error fetching Cloudflare JWKS" };
    }
  }

  const matchingJwk = keys.find((k: any) => k.kid === header.kid && k.kty === "RSA");
  if (!matchingJwk) {
    return { valid: false, error: "Matching JWK kid not found" };
  }

  try {
    const pubKey = crypto.createPublicKey({ key: matchingJwk, format: "jwk" });
    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(`${headerB64}.${payloadB64}`);
    verify.end();
    const sigValid = verify.verify(pubKey, base64UrlToBuffer(signatureB64));
    if (!sigValid) {
      return { valid: false, error: "Invalid JWT cryptographic signature" };
    }
    return { valid: true, email: payload.email };
  } catch {
    return { valid: false, error: "JWT signature verification failed" };
  }
}

// ============================================================================
// HAQIQIY ADMIN AUTENTIFIKATSIYA, SESSIYA, ROLLAR VA TOTP 2FA (RFC 6238)
// ============================================================================
export function hashPasswordScrypt(password: string, salt = crypto.randomBytes(16).toString("hex")): string {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPasswordScrypt(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith("scrypt:")) return false;
  const parts = storedHash.split(":");
  if (parts.length !== 3) return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

/**
 * RFC 6238 6-xonali TOTP kod generatori va tekshiruvchisi.
 */
export function generateTotpCode(secretHexOrAscii: string, timestampMs = Date.now(), stepSec = 30): string {
  const counter = Math.floor(timestampMs / 1000 / stepSec);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter), 0);
  const key = /^[0-9a-fA-F]{32,}$/.test(secretHexOrAscii)
    ? Buffer.from(secretHexOrAscii, "hex")
    : Buffer.from(secretHexOrAscii, "utf8");
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotpCode(secret: string, code: string, timestampMs = Date.now()): boolean {
  if (!secret || !code || !/^\d{6}$/.test(code.trim())) return false;
  const cleanCode = code.trim();
  for (const drift of [-1, 0, 1]) {
    const candidate = generateTotpCode(secret, timestampMs + drift * 30_000);
    if (crypto.timingSafeEqual(Buffer.from(cleanCode), Buffer.from(candidate))) {
      return true;
    }
  }
  return false;
}

export function signSessionToken(rawToken: string): string {
  const secret = requireEnvSecret("ADMIN_SESSION_SECRET", 32);
  const mac = crypto.createHmac("sha256", secret).update(rawToken).digest("hex");
  return `${rawToken}.${mac}`;
}

export function verifySignedSessionToken(signedToken: string | null | undefined): string | null {
  if (!signedToken || !signedToken.includes(".")) return null;
  const [rawToken, mac] = signedToken.split(".");
  if (!rawToken || !mac) return null;
  const secret = requireEnvSecret("ADMIN_SESSION_SECRET", 32);
  const expectedMac = crypto.createHmac("sha256", secret).update(rawToken).digest("hex");
  try {
    const valid = crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expectedMac));
    return valid ? rawToken : null;
  } catch {
    return null;
  }
}

export async function loginAdminWithTotp(params: {
  email: string;
  password: string;
  totpCode: string;
  clientIp?: string | null;
}): Promise<{ sessionCookieValue: string; user: { id: number; email: string; role: string } }> {
  await ensureSchema();
  const res = await dbQuery<{
    id: number;
    email: string;
    role: string;
    password_hash: string;
    totp_secret: string | null;
    totp_enabled: boolean;
  }>(`SELECT id, email, role, password_hash, totp_secret, totp_enabled FROM cms_users WHERE LOWER(email) = LOWER($1) LIMIT 1`, [
    params.email.trim()
  ]);

  const user = res.rows[0];
  if (!user || !verifyPasswordScrypt(params.password, user.password_hash)) {
    const err: any = new Error("Invalid email or password");
    err.statusCode = 401;
    throw err;
  }

  if (!user.totp_enabled || !user.totp_secret || !verifyTotpCode(user.totp_secret, params.totpCode)) {
    const err: any = new Error("Mandatory 2FA (TOTP) verification failed");
    err.statusCode = 401;
    throw err;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await dbQuery(
    `INSERT INTO admin_sessions (token_hash, user_id, email, role, totp_verified, client_ip, expires_at)
     VALUES ($1, $2, $3, $4, TRUE, $5, NOW() + INTERVAL '8 hours')`,
    [tokenHash, user.id, user.email, user.role, params.clientIp || null]
  );

  return {
    sessionCookieValue: signSessionToken(rawToken),
    user: { id: user.id, email: user.email, role: user.role }
  };
}

export async function getAuthenticatedAdminSession(signedCookie: string | null | undefined): Promise<{
  userId: number;
  email: string;
  role: "admin" | "editor" | "translator" | "finance";
  totpVerified: boolean;
} | null> {
  const rawToken = verifySignedSessionToken(signedCookie);
  if (!rawToken) return null;

  await ensureSchema();
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const res = await dbQuery<{
    user_id: number;
    email: string;
    role: "admin" | "editor" | "translator" | "finance";
    totp_verified: boolean;
  }>(
    `SELECT user_id, email, role, totp_verified
     FROM admin_sessions
     WHERE token_hash = $1 AND expires_at > NOW() AND totp_verified = TRUE
     LIMIT 1`,
    [tokenHash]
  );

  const row = res.rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    email: row.email,
    role: row.role,
    totpVerified: Boolean(row.totp_verified)
  };
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

/**
 * Turnstile tekshiruvi:
 * - Productionda TURNSTILE_SECRET_KEY bo'lmasa xato otadi (hech qachon 4 belgili token qabul qilinmaydi).
 * - Faqat NODE_ENV !== "production" va TURNSTILE_SECRET_KEY yo'q bo'lganda dev/test token ishlaydi.
 */
export async function verifyTurnstileToken(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret.length < 8) {
      throw new Error("Configuration error: TURNSTILE_SECRET_KEY is required in production.");
    }
  }

  if (!secret) {
    // Faqat development / test rejimida
    return Boolean(token && token.length >= 4);
  }

  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return false;
  }

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token.trim() })
    });
    const data: any = await res.json();
    return Boolean(data?.success);
  } catch {
    return false;
  }
}

/**
 * KVKK PII o'chirish:
 * - Faqat `admin` roli va 2FA (TOTP) tasdiqlangan sessiya talab qilinadi;
 * - Tasdiq maydoni (`confirm === "KVKK_SILME_ONAYLIYORUM"`) va `reason` majburiy;
 * - `admin_audit_logs` jadvaliga yoziladi.
 */
export async function eraseDonorPiiByKvkkRequest(params: {
  target: string;
  confirm: string;
  reason: string;
  actor: { userId?: number; email: string; role: string; totpVerified: boolean };
  clientIp?: string | null;
}): Promise<{ erasedCount: number; auditId: number }> {
  await ensureSchema();

  if (!params.actor || params.actor.role !== "admin" || !params.actor.totpVerified) {
    const err: any = new Error("Forbidden: Only authenticated admin with 2FA can perform KVKK PII erasure");
    err.statusCode = 403;
    throw err;
  }

  if (params.confirm !== "KVKK_SILME_ONAYLIYORUM") {
    const err: any = new Error("Confirmation field (confirm: 'KVKK_SILME_ONAYLIYORUM') is required");
    err.statusCode = 400;
    throw err;
  }

  const cleanTarget = (params.target || "").trim();
  const cleanReason = (params.reason || "").trim();
  if (!cleanTarget || cleanReason.length < 5) {
    const err: any = new Error("Both target (public_no or email) and reason (min 5 chars) are required");
    err.statusCode = 400;
    throw err;
  }

  const res = await dbQuery(
    `UPDATE donations
     SET donor_name = 'Anonim (KVKK Silindi)',
         donor_phone = NULL,
         donor_email = NULL,
         is_anonymous = TRUE,
         deleted_pii_at = NOW(),
         updated_at = NOW()
     WHERE public_no = $1 OR LOWER(donor_email) = LOWER($1)`,
    [cleanTarget]
  );

  const targetMasked = cleanTarget.includes("@") ? maskEmailForLog(cleanTarget) : cleanTarget;
  const auditRes = await dbQuery<{ id: number }>(
    `INSERT INTO admin_audit_logs (actor_user_id, actor_email, actor_role, action, target_ref, reason, client_ip, metadata)
     VALUES ($1, $2, $3, 'KVKK_PII_ERASE', $4, $5, $6, $7::jsonb)
     RETURNING id`,
    [
      params.actor.userId || null,
      params.actor.email,
      params.actor.role,
      targetMasked,
      cleanReason,
      maskIpForLog(params.clientIp || ""),
      JSON.stringify({ erasedCount: res.rowCount })
    ]
  );

  return { erasedCount: res.rowCount, auditId: auditRes.rows[0]!.id };
}
