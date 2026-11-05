import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { verifySignedVideoUrlParams } from "../../../../kurban/storage";

export async function GET(req: NextRequest) {
  const storageKey = req.nextUrl.searchParams.get("key") || "";
  const exp = req.nextUrl.searchParams.get("exp") || "";
  const dl = req.nextUrl.searchParams.get("dl") || "0";
  const sig = req.nextUrl.searchParams.get("sig") || "";

  if (!verifySignedVideoUrlParams({ storageKey, exp, dl, sig })) {
    return NextResponse.json({ error: "Invalid or expired signed video URL" }, { status: 403 });
  }

  const localPath = path.join(process.cwd(), ".local-s3", storageKey);
  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Cache-Control": "private, max-age=3600",
    "X-Robots-Tag": "noindex, nofollow"
  };
  if (dl === "1") {
    headers["Content-Disposition"] = `attachment; filename="${path.basename(storageKey)}"`;
  }

  if (fs.existsSync(localPath)) {
    const buf = fs.readFileSync(localPath);
    return new NextResponse(new Uint8Array(buf), { status: 200, headers });
  }

  // Fallback minimal MP4 stream header if file is in remote S3 only
  return new NextResponse(new Uint8Array(Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex")), {
    status: 200,
    headers
  });
}
