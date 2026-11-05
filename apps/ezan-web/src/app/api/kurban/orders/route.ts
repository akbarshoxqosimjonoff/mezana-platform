import { NextRequest, NextResponse } from "next/server";
import { Locale } from "../../../../i18n/country-locale";
import { checkRateLimit, getRateLimitClientIp, sanitizeLogObject, verifyTurnstileToken } from "../../../../lib/security";
import { createKurbanOrderWithQuotaLock } from "../../../../kurban/service";

export async function POST(req: NextRequest) {
  const ip = getRateLimitClientIp(req.headers);
  const rl = checkRateLimit(`kurban-order:${ip}`, 120, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "ezanvakfi.org";

    if (body.cardNumber || body.cvv || body.pan) {
      return NextResponse.json({ error: "SECURITY: Card data prohibited" }, { status: 400 });
    }

    const turnstileToken =
      body.turnstileToken || (process.env.NODE_ENV !== "production" ? "dev-turnstile-ok" : "");
    const turnstileOk = await verifyTurnstileToken(turnstileToken);
    if (!turnstileOk) {
      return NextResponse.json({ error: "Turnstile verification failed" }, { status: 400 });
    }

    const fakeNowMs =
      process.env.NODE_ENV !== "production" && body.nowMs && Number.isFinite(Number(body.nowMs))
        ? Number(body.nowMs)
        : Date.now();

    const result = await createKurbanOrderWithQuotaLock({
      originHost: host,
      locale: (body.locale || "tr") as Locale,
      offerId: Number(body.offerId),
      shares: body.shares || [],
      vekaletAccepted: Boolean(body.vekaletAccepted),
      readNamesAloudConsent: Boolean(body.readNamesAloudConsent),
      kvkkConsent: Boolean(body.kvkkConsent),
      donor: body.donor || {},
      extraCartItems: body.extraCartItems || [],
      clientIp: ip,
      nowMs: fakeNowMs
    });

    console.info(
      "[EZAN-WEB KURBAN ORDER CREATED]",
      sanitizeLogObject({
        orderNo: result.order.orderNo,
        totalShares: result.order.totalShares,
        totalAmountTry: result.order.totalAmountTry,
        donorPhone: body.donor?.phone,
        donorEmail: body.donor?.email,
        clientIp: ip
      })
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Invalid Kurban order request" },
      { status: err?.statusCode || 400 }
    );
  }
}
