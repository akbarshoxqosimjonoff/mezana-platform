// HAQIQIY OpenAI chaqiruvi bilan (pullik, kam sonli) ko'p valyutali kvitansiya
// OCR testi. Sintetik (dasturiy chizilgan) kvitansiya rasmlari sharp orqali
// yaratiladi, so'ng haqiqiy parseReceiptImage() orqali o'qiladi — bu
// src/scripts/test-mock-receipts.ts dagi 228 ta tarmoqsiz testdan FARQLI
// ravishda, real model chaqiruvini tekshiradi (shuning uchun atayin kam sonli).
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { parseReceiptImage } from "../receipt-ocr.js";

type Case = { label: string; vendor: string; amount: string; currencyText: string; date: string; expectRecognized: boolean; expectCurrency?: "TRY" | "USD" };

const CASES: Case[] = [
  { label: "Turk lirasi", vendor: "Migros Market", amount: "248,50", currencyText: "TRY", date: "2026-09-12", expectRecognized: true, expectCurrency: "TRY" },
  { label: "AQSH dollari", vendor: "Walmart Supercenter", amount: "54.20", currencyText: "USD", date: "2026-08-03", expectRecognized: true, expectCurrency: "USD" },
  { label: "Yevro (qo'llab-quvvatlanmaydi)", vendor: "Lidl", amount: "19,99", currencyText: "EUR", date: "2026-07-20", expectRecognized: false },
  { label: "O'zbek so'mi (qo'llab-quvvatlanmaydi)", vendor: "Korzinka", amount: "125000", currencyText: "UZS", date: "2026-09-01", expectRecognized: false },
];

function receiptSvg(c: Case): string {
  return `
<svg width="500" height="400" xmlns="http://www.w3.org/2000/svg">
  <rect width="500" height="400" fill="white"/>
  <text x="250" y="50" font-size="26" font-family="monospace" text-anchor="middle">${esc(c.vendor)}</text>
  <text x="40" y="110" font-size="18" font-family="monospace">Sana: ${c.date}</text>
  <text x="40" y="150" font-size="18" font-family="monospace">Mahsulot 1 ........... ${c.amount}</text>
  <text x="40" y="220" font-size="22" font-family="monospace" font-weight="bold">JAMI: ${c.amount} ${c.currencyText}</text>
  <text x="40" y="300" font-size="14" font-family="monospace" fill="#666">Xaridingiz uchun rahmat</text>
</svg>`.trim();
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "mezana-receipt-test-"));
  let pass = 0;
  let fail = 0;
  try {
    for (const c of CASES) {
      const svg = receiptSvg(c);
      const pngPath = join(dir, `${c.label}.png`);
      await sharp(Buffer.from(svg)).png().toFile(pngPath);

      const result = await parseReceiptImage(pngPath);
      const ok =
        result.currencyCheck.recognized === c.expectRecognized &&
        (!c.expectCurrency || (result.currencyCheck.recognized && result.currencyCheck.currency === c.expectCurrency));

      console.log(`\n[${c.label}]`);
      console.log(`  kutilgan: recognized=${c.expectRecognized}${c.expectCurrency ? ` (${c.expectCurrency})` : ""}`);
      console.log(`  model natijasi: vendor=${result.vendor}, amount=${result.amount}, currency(xom)=${result.currency}, currencyCheck=${JSON.stringify(result.currencyCheck)}`);
      console.log(`  natija: ${ok ? "O'TDI" : "MUVAFFAQIYATSIZ"}`);
      ok ? pass++ : fail++;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.log(`\nJAMI (haqiqiy OpenAI chaqiruvi): ${pass + fail} ta — ${pass} o'tdi, ${fail} muvaffaqiyatsiz`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("XATO:", e);
  process.exit(1);
});
