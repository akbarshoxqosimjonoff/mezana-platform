import { NextRequest, NextResponse } from "next/server";
import { dbQuery, ensureSchema } from "../../../db/schema";
import { checkRateLimit, sanitizeLogObject, verifyTurnstileToken } from "../../../lib/security";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rl = checkRateLimit(`contact:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json();
  const validTurnstile = await verifyTurnstileToken(body.turnstileToken || "dev-turnstile-ok");
  if (!validTurnstile) {
    return NextResponse.json({ error: "Turnstile verification failed" }, { status: 400 });
  }

  await ensureSchema();
  const kind = ["contact", "qurban_notify", "newsletter"].includes(body.kind) ? body.kind : "contact";
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