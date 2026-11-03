// 100+ DETERMINISTIK (tarmoqsiz, OpenAI chaqirilmaydi) mock testlar: valyuta
// normalizatsiyasi va "inson ko'rib chiqishi kerakmi" qoidasi uchun. Haqiqiy
// OpenAI orqali OCR tekshiruvi uchun alohida skript bor:
// scripts/test-live-receipt-ocr.ts (kam sonli, pullik chaqiruv).
import { normalizeCurrency } from "../currency.js";
import { reviewFlags, type ReviewFlag } from "../review-policy.js";
import type { ParsedReceipt } from "../receipt-ocr.js";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(label: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(label);
  }
}

// ── 1-qism: valyuta normalizatsiyasi (ko'p variantli yozilish) ──────────────
const CURRENCY_CASES: { input: string | null; expectRecognized: boolean; expectCurrency?: "TRY" | "USD" }[] = [
  { input: "₺", expectRecognized: true, expectCurrency: "TRY" },
  { input: "TRY", expectRecognized: true, expectCurrency: "TRY" },
  { input: "try", expectRecognized: true, expectCurrency: "TRY" },
  { input: " TRY ", expectRecognized: true, expectCurrency: "TRY" },
  { input: "TL", expectRecognized: true, expectCurrency: "TRY" },
  { input: "tl", expectRecognized: true, expectCurrency: "TRY" },
  { input: "Lira", expectRecognized: true, expectCurrency: "TRY" },
  { input: "Turk lirasi", expectRecognized: true, expectCurrency: "TRY" },
  { input: "$", expectRecognized: true, expectCurrency: "USD" },
  { input: "USD", expectRecognized: true, expectCurrency: "USD" },
  { input: "usd", expectRecognized: true, expectCurrency: "USD" },
  { input: "US$", expectRecognized: true, expectCurrency: "USD" },
  { input: "Dollar", expectRecognized: true, expectCurrency: "USD" },
  { input: "€", expectRecognized: false },
  { input: "EUR", expectRecognized: false },
  { input: "euro", expectRecognized: false },
  { input: "so'm", expectRecognized: false },
  { input: "UZS", expectRecognized: false },
  { input: "£", expectRecognized: false },
  { input: "GBP", expectRecognized: false },
  { input: "₽", expectRecognized: false },
  { input: "RUB", expectRecognized: false },
  { input: null, expectRecognized: false },
  { input: "", expectRecognized: false },
  { input: "random-text-123", expectRecognized: false },
  { input: "сум", expectRecognized: false },
  { input: "Franc", expectRecognized: false },
  { input: "CHF", expectRecognized: false },
  { input: "yen", expectRecognized: false },
  { input: "JPY", expectRecognized: false },
];

for (const c of CURRENCY_CASES) {
  const result = normalizeCurrency(c.input);
  check(
    `valyuta("${c.input}") recognized=${c.expectRecognized}`,
    result.recognized === c.expectRecognized &&
      (!c.expectCurrency || (result.recognized && result.currency === c.expectCurrency)),
  );
}

// Bir xil valyutani turli registr/bo'shliq bilan qayta-qayta sinash (ko'proq qamrov)
const REPEAT_VARIANTS = ["try", "Try", "TRY", " try", "try ", " TRY "];
for (const v of REPEAT_VARIANTS) {
  const r = normalizeCurrency(v);
  check(`takroriy TRY variant "${v}"`, r.recognized && r.currency === "TRY");
}

// ── 2-qism: "inson ko'rib chiqishi kerakmi" qoidasi — kombinatsion testlar ──
const CONFIDENCES: ParsedReceipt["confidence"][] = ["low", "medium", "high"];
const CURRENCIES_FOR_FLAGS: (string | null)[] = ["TRY", "USD", "EUR", null];
const AMOUNTS = [100, 0, -5, null];
const DATES = [
  isoDaysAgo(0),
  isoDaysAgo(10),
  isoDaysAgo(100),
  null,
];

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function expectedFlags(confidence: string, currency: string | null, amount: number | null, date: string | null): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  if (confidence === "low") flags.push("low-confidence");
  const cc = normalizeCurrency(currency);
  if (!cc.recognized) flags.push(cc.reason === "unsupported" ? "unsupported-currency" : "unknown-currency");
  if (amount === null || amount <= 0) flags.push("missing-amount");
  if (!date) {
    flags.push("missing-date");
  } else if (Date.now() - new Date(date).getTime() > 90 * 24 * 60 * 60 * 1000) {
    flags.push("stale-date");
  }
  return flags;
}

let combinationCount = 0;
for (const confidence of CONFIDENCES) {
  for (const currency of CURRENCIES_FOR_FLAGS) {
    for (const amount of AMOUNTS) {
      for (const date of DATES) {
        combinationCount++;
        const receipt = {
          confidence,
          currencyCheck: normalizeCurrency(currency),
          amount,
          date,
        };
        const actual = reviewFlags(receipt);
        const expected = expectedFlags(confidence, currency, amount, date);
        const label = `flags(conf=${confidence}, cur=${currency}, amt=${amount}, date=${date})`;
        check(
          label,
          actual.length === expected.length && expected.every((f) => actual.includes(f)),
        );
      }
    }
  }
}

console.log(`Valyuta testlari: ${CURRENCY_CASES.length + REPEAT_VARIANTS.length}`);
console.log(`Kombinatsion bayroq testlari: ${combinationCount}`);
console.log(`JAMI: ${pass + fail} ta test — ${pass} o'tdi, ${fail} muvaffaqiyatsiz`);
if (failures.length) {
  console.log("Muvaffaqiyatsiz testlar:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
