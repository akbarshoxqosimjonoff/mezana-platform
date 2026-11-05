import { NextRequest, NextResponse } from "next/server";
import { eraseDonorPiiByKvkkRequest } from "../../../../lib/security";
import { isAdminAccessAllowed } from "../../../../cms/service";

export async function POST(req: NextRequest) {
  const clientIp = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "127.0.0.1";
  const cfJwt = req.headers.get("cf-access-jwt-assertion");
  if (!isAdminAccessAllowed({ clientIp, cfAccessJwt: cfJwt })) {
    return NextResponse.json({ error: "Forbidden IP / Cloudflare Access Required" }, { status: 403 });
  }
  const body = await req.json();
  const res = await eraseDonorPiiByKvkkRequest(body.target || "");
  return NextResponse.json(res);
}