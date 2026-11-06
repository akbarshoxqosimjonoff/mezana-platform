import { NextRequest, NextResponse } from "next/server";
import { dbQuery, ensureSchema } from "../../../db/schema";
import { checkRateLimit, getRateLimitClientIp, sanitizeLogObject, verifyTurnstileToken } from "../../../lib/security";

export async function POST(req: NextRequest) {
  const ip = getRateLimitClientIp(req.headers);
  const rl = checkRateLimit(`contact:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: Record<string, any> = {};
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await req.json();
  } else {
    const form = await req.formData();
    form.forEach((value, key) => {
      body[key] = String(value);
    });
  }

  // Turnstile kaliti: faqat NODE_ENV=development da "dev-turnstile-ok" fallback ishlaydi
  const rawTurnstile =
    body.turnstileToken ||
    body["cf-turnstile-response"] ||
    (process.env.NODE_ENV === "development" ? "dev-turnstile-ok" : "");

  const validTurnstile = await verifyTurnstileToken(rawTurnstile);
  if (!validTurnstile) {
    return NextResponse.json({ error: "Turnstile verification failed" }, { status: 400 });
  }

  await ensureSchema();
  const kind = ["contact", "qurban_notify", "newsletter"].includes(body.kind) ? body.kind : "contact";
  if (kind === "newsletter" && process.env.NEWSLETTER_ENABLED !== "true") {
    return NextResponse.json({ error: "Not Found (NEWSLETTER_ENABLED=false)" }, { status: 404 });
  }
  await dbQuery(
    `INSERT INTO contact_submissions (kind, full_name, email, phone, message, locale)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [kind, body.fullName || null, body.email || null, body.phone || null, body.message || null, body.locale || "tr"]
  );

  console.info(
    "[EZAN-WEB FORM SUBMISSION]",
    sanitizeLogObject({ kind, email: body.email, phone: body.phone, clientIp: ip })
  );

  return NextResponse.json({ ok: true });
}
