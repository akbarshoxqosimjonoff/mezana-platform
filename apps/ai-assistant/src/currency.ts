// Platforma faqat TRY va USD'ni qo'llab-quvvatlaydi (Prisma `Currency` enum,
// 2-bosqich dizayni). Kvitansiyadan boshqa valyuta o'qilsa, AI uni o'zi hal
// qilmaydi — inson ko'rib chiqishi uchun belgilanadi (plan'ning "AI yozmaydi,
// shubhali holatni ko'rsatadi" qoidasi).
export type SupportedCurrency = "TRY" | "USD";

const SYMBOL_MAP: Record<string, SupportedCurrency> = {
  "₺": "TRY",
  "try": "TRY",
  "tl": "TRY",
  "turk lirasi": "TRY",
  "lira": "TRY",
  "$": "USD",
  "usd": "USD",
  "us$": "USD",
  "dollar": "USD",
};

const KNOWN_UNSUPPORTED: Record<string, string> = {
  "€": "EUR",
  "eur": "EUR",
  "euro": "EUR",
  "so'm": "UZS",
  "som": "UZS",
  "uzs": "UZS",
  "£": "GBP",
  "gbp": "GBP",
  "₽": "RUB",
  "rub": "RUB",
};

export type CurrencyNormalizeResult =
  | { recognized: true; currency: SupportedCurrency }
  | { recognized: false; detected: string | null; reason: "unsupported" | "unknown" };

export function normalizeCurrency(raw: string | null | undefined): CurrencyNormalizeResult {
  if (!raw) return { recognized: false, detected: null, reason: "unknown" };
  const key = raw.trim().toLowerCase();
  if (SYMBOL_MAP[key]) return { recognized: true, currency: SYMBOL_MAP[key] };
  if (KNOWN_UNSUPPORTED[key]) {
    return { recognized: false, detected: KNOWN_UNSUPPORTED[key], reason: "unsupported" };
  }
  return { recognized: false, detected: raw, reason: "unknown" };
}
