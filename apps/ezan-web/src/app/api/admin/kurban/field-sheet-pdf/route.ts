import { NextRequest, NextResponse } from "next/server";
import { canAccessAdminCms, getAuthenticatedAdminSession } from "../../../../../lib/security";
import { generateFieldSheetPdfBuffer } from "../../../../../kurban/service";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("ezan_admin_session")?.value;
  const session = await getAuthenticatedAdminSession(cookie);
  if (!session || !session.totpVerified || !canAccessAdminCms(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const seasonYear = Number(req.nextUrl.searchParams.get("season") || 2027);
  const countryCode = req.nextUrl.searchParams.get("country") || undefined;
  const pdfBuf = await generateFieldSheetPdfBuffer({ seasonYear, countryCode });

  return new NextResponse(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="kurban-dala-listesi-${seasonYear}.pdf"`
    }
  });
}
