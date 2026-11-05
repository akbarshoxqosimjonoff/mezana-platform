import { NextRequest, NextResponse } from "next/server";
import {
  createKvkkDeletionRequest,
  DONOR_SESSION_COOKIE_NAME,
  generateDonorKvkkExportPdf,
  getAuthenticatedDonorSession,
  getDonorCabinetDashboard,
  updateDonorProfileSettings
} from "../../../donor-cabinet/service";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(DONOR_SESSION_COOKIE_NAME)?.value;
  const session = await getAuthenticatedDonorSession(cookie);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const format = req.nextUrl.searchParams.get("export");
  const dashboard = await getDonorCabinetDashboard({
    phone: session.phone,
    email: session.email,
    locale: session.locale
  });

  if (format === "json") {
    return new NextResponse(JSON.stringify(dashboard, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="ezan-vakfi-kvkk-verilerim.json"'
      }
    });
  }

  if (format === "pdf") {
    const pdfBuf = await generateDonorKvkkExportPdf(dashboard);
    return new NextResponse(new Uint8Array(pdfBuf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="ezan-vakfi-kvkk-verilerim.pdf"'
      }
    });
  }

  return NextResponse.json(dashboard);
}

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(DONOR_SESSION_COOKIE_NAME)?.value;
  const session = await getAuthenticatedDonorSession(cookie);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (body.action === "update_profile") {
      const updated = await updateDonorProfileSettings({
        phone: session.phone,
        email: session.email || body.email,
        fullName: String(body.fullName || ""),
        preferredLocale: body.preferredLocale || session.locale,
        smsNotifications: Boolean(body.smsNotifications ?? true),
        whatsappNotifications: Boolean(body.whatsappNotifications ?? true),
        emailNotifications: Boolean(body.emailNotifications ?? true)
      });
      return NextResponse.json({ ok: true, profile: updated });
    }

    if (body.action === "request_kvkk_deletion") {
      const created = await createKvkkDeletionRequest({
        phone: session.phone,
        email: session.email,
        reason: String(body.reason || "")
      });
      return NextResponse.json({ ok: true, request: created });
    }

    return NextResponse.json({ error: "Unknown cabinet action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Cabinet action failed" }, { status: 400 });
  }
}
