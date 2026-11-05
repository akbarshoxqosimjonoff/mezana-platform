export type Locale = "tr" | "uz" | "en" | "ar";

export const SUPPORTED_LOCALES: readonly Locale[] = ["tr", "uz", "en", "ar"] as const;

export const LOCALE_META: Record<Locale, { label: string; dir: "ltr" | "rtl"; htmlLang: string }> = {
  tr: { label: "Türkçe", dir: "ltr", htmlLang: "tr" },
  uz: { label: "O'zbekcha", dir: "ltr", htmlLang: "uz" },
  en: { label: "English", dir: "ltr", htmlLang: "en" },
  ar: { label: "العربية", dir: "rtl", htmlLang: "ar" }
};

export const ARAB_COUNTRIES = new Set([
  "SA", "AE", "QA", "KW", "BH", "OM", "YE", "IQ", "SY", "JO",
  "LB", "PS", "EG", "LY", "TN", "DZ", "MA", "SD", "MR", "SO",
  "DJ", "KM"
]);

export const TURKIC_TR_COUNTRIES = new Set(["TR", "CY", "AZ"]);

export const COUNTRY_TO_LOCALE: Record<string, Locale> = {
  TR: "tr",
  CY: "tr",
  AZ: "tr",
  UZ: "uz",
  SA: "ar",
  AE: "ar",
  QA: "ar",
  KW: "ar",
  BH: "ar",
  OM: "ar",
  YE: "ar",
  IQ: "ar",
  SY: "ar",
  JO: "ar",
  LB: "ar",
  PS: "ar",
  EG: "ar",
  LY: "ar",
  TN: "ar",
  DZ: "ar",
  MA: "ar",
  SD: "ar",
  MR: "ar",
  SO: "ar",
  DJ: "ar",
  KM: "ar"
};

export function isValidLocale(val: string | null | undefined): val is Locale {
  if (!val) return false;
  return (SUPPORTED_LOCALES as readonly string[]).includes(val);
}

export function getLocaleByCountry(countryCode: string | null | undefined): Locale | null {
  if (!countryCode) return null;
  const code = countryCode.trim().toUpperCase();
  return COUNTRY_TO_LOCALE[code] || null;
}

export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const parts = header
    .split(",")
    .map((part) => {
      const [tag, qPart] = part.trim().split(";q=");
      const q = qPart ? Number.parseFloat(qPart) : 1.0;
      return { tag: (tag || "").toLowerCase().trim(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((item) => item.tag.length > 0 && item.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const item of parts) {
    const primary = item.tag.split("-")[0] || "";
    if (isValidLocale(primary)) {
      return primary;
    }
  }
  return null;
}