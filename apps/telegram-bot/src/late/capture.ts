import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LATE } from "./config.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Kamera kadrini go2rtc'dan oladi: HD, bo'lmasa sub-stream
async function grabFrame(): Promise<Buffer | null> {
  for (const src of LATE.cameraSrcs) {
    try {
      const res = await fetch(`${LATE.go2rtc}/api/frame.jpeg?src=${encodeURIComponent(src)}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* keyingi oqimga o'tamiz */
    }
  }
  return null;
}

// 3 soniya ichida teng oraliqda 6 ta kadr (0, 0.5, 1.0 ... 2.5 s) — odam harakatlanganda har xil
// holat/pozitsiyada tushadi. Kadrlar parallel ishlaydi, shuning uchun jami vaqt ~3 s dan oshmaydi.
export async function captureBurst(caseId: string): Promise<string[]> {
  const dir = path.join(LATE.photosDir, caseId);
  await mkdir(dir, { recursive: true });
  const step = LATE.spanMs / LATE.frames;
  const tasks = Array.from({ length: LATE.frames }, async (_, i) => {
    await sleep(i * step);
    const buf = await grabFrame();
    if (!buf) return null;
    const file = path.join(dir, `${i + 1}.jpg`);
    await writeFile(file, buf);
    return file;
  });
  return (await Promise.all(tasks)).filter((f): f is string => f !== null);
}
