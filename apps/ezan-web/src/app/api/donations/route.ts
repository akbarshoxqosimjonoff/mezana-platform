import { NextRequest, NextResponse } from "next/server";
import { createDonationOrder } from "../../../payments/service";
import { checkRateLimit, sanitizeLogObject } from "../../../lib/security";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "127.0.0.1";
  const rl = checkRateLimit(`donate:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "ezanvakfi.org";

    // Karta ma'lumoti saytda hech qachon qabul qilinmaydi va saqlanmaydi
    if (body.cardNumber || body.cvv || body.pan) {
      return NextResponse.json(
        { error: "SECURITY: Card data must never be sent to our server." },
        { status: 400 }
      );
    }

    const result = await createDonationOrder({
      originHost: host,
      locale: body.locale || "tr",
      frequency: body.frequency === "monthly" ? "monthly" : "one_time",
      items: body.items || [],
      donor: body.donor || {}
    });

    console.info(
      "[EZAN-WEB DONATION CREATED]",
      sanitizeLogObject({
        publicNo: result.donation.public_no,
        amountTry: result.donation.amount_try,
        donorEmail: body.donor?.email,
        donorPhone: body.donor?.phone,
        clientIp: ip
      })
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Invalid donation request" }, { status: 400 });
  }
}