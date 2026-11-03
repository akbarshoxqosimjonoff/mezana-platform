import type { ParsedReceipt } from "./receipt-ocr.js";

export type ReviewFlag =
  | "low-confidence"
  | "unsupported-currency"
  | "unknown-currency"
  | "missing-amount"
  | "missing-date"
  | "stale-date"; // kvitansiya sanasi 90 kundan eski — ehtimol xato o'qilgan

// Qaysi kvitansiyalar "avtomatik tasdiqlash uchun tavsiya qilinadi" emas, balki
// albatta inson ko'zdan kechirishi kerakligini aniqlaydi. Reja PDF'ining
// "AI faqat taklif beradi, yozmaydi" qoidasi — bu yerda "qachon ayniqsa
// ehtiyot bo'lish kerak" qismini mexanik qiladi.
export function reviewFlags(receipt: Pick<ParsedReceipt, "confidence" | "currencyCheck" | "amount" | "date">): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  if (receipt.confidence === "low") flags.push("low-confidence");
  if (!receipt.currencyCheck.recognized) {
    flags.push(receipt.currencyCheck.reason === "unsupported" ? "unsupported-currency" : "unknown-currency");
  }
  if (receipt.amount === null || receipt.amount <= 0) flags.push("missing-amount");
  if (!receipt.date) {
    flags.push("missing-date");
  } else {
    const d = new Date(receipt.date);
    if (!Number.isNaN(d.getTime()) && Date.now() - d.getTime() > 90 * 24 * 60 * 60 * 1000) {
      flags.push("stale-date");
    }
  }
  return flags;
}

export function needsHumanReview(receipt: Pick<ParsedReceipt, "confidence" | "currencyCheck" | "amount" | "date">): boolean {
  return reviewFlags(receipt).length > 0;
}
