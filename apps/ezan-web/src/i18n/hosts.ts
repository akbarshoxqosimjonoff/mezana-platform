import {
  Locale,
  isValidLocale,
  getLocaleByCountry,
  matchAcceptLanguage
} from "./country-locale";

export const EZAN_LANG_COOKIE = "ezan_lang";

export const DEFAULT_SITE_HOSTS = [
  "ezanvakfi.org",
  "azonvaqfi.org",
  "localhost:3005",
  "127.0.0.1:3005",
  "192.168.1.10:3005"
];

export function getAllowedSiteHosts(): string[] {
  const raw = process.env.SITE_HOSTS;
  if (!raw || !raw.trim()) return DEFAULT_SITE_HOSTS;
  const parsed = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...parsed, ...DEFAULT_SITE_HOSTS]));
}

export const HOST_DEFAULT_LOCALE: Record<string, Locale> = {
  "azonvaqfi.org": "uz",
  "www.azonvaqfi.org": "uz",
  "ezanvakfi.org": "en",
  "www.ezanvakfi.org": "en"
};

export const CANONICAL_HOST_BY_LOCALE: Record<Locale, string> = {
  uz: "https://azonvaqfi.org",
  tr: "https://ezanvakfi.org",
  en: "https://ezanvakfi.org",
  ar: "https://ezanvakfi.org"
};

export function stripWww(host: string): { cleanHost: string; hadWww: boolean } {
  const lower = (host || "").trim().toLowerCase();
  if (lower.startsWith("www.")) {
    return { cleanHost: lower.slice(4), hadWww: true };
  }
  return { cleanHost: lower, hadWww: false };
}

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /googlebot|bingbot|yandexbot|duckduckbot|slurp|baiduspider|facebookexternalhit|twitterbot|linkedinbot|applebot|semrushbot|ahrefsbot/i.test(
    ua
  );
}

export function isAllowedPaymentHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const { cleanHost } = stripWww(host);
  const hostWithoutPort = cleanHost.split(":")[0] || cleanHost;
  const allowed = getAllowedSiteHosts();
  return allowed.includes(cleanHost) || allowed.includes(hostWithoutPort);
}

export function getCanonicalUrl(locale: Locale, pathnameWithoutLocale = ""): string {
  const base = CANONICAL_HOST_BY_LOCALE[locale] || "https://ezanvakfi.org";
  const cleanPath = pathnameWithoutLocale.startsWith("/")
    ? pathnameWithoutLocale
    : pathnameWithoutLocale
      ? `/${pathnameWithoutLocale}`
      : "";
  return `${base}/${locale}${cleanPath === "/" ? "" : cleanPath}`;
}

export function getHreflangLinks(pathnameWithoutLocale = ""): Record<string, string> {
  return {
    tr: getCanonicalUrl("tr", pathnameWithoutLocale),
    uz: getCanonicalUrl("uz", pathnameWithoutLocale),
    en: getCanonicalUrl("en", pathnameWithoutLocale),
    ar: getCanonicalUrl("ar", pathnameWithoutLocale),
    "x-default": "https://ezanvakfi.org/"
  };
}

export interface LocaleResolutionInput {
  host?: string | null;
  cookieLang?: string | null;
  cfCountry?: string | null;
  acceptLanguage?: string | null;
  userAgent?: string | null;
}

export function resolveRequestLocale(input: LocaleResolutionInput): Locale {
  if (isValidLocale(input.cookieLang)) {
    return input.cookieLang;
  }

  const isDev = process.env.NODE_ENV === "development";
  const rawHost =
    (isDev && process.env.DEV_FAKE_HOST ? process.env.DEV_FAKE_HOST : input.host) ||
    "ezanvakfi.org";
  const { cleanHost } = stripWww(rawHost);
  const hostName = cleanHost.split(":")[0] || cleanHost;

  if (hostName === "azonvaqfi.org") {
    return "uz";
  }

  if (
    isBotUserAgent(input.userAgent) ||
    isBotUserAgent(input.acceptLanguage)
  ) {
    return "en";
  }

  const effectiveCountry =
    isDev && process.env.DEV_FAKE_COUNTRY ? process.env.DEV_FAKE_COUNTRY : input.cfCountry;

  const byCountry = getLocaleByCountry(effectiveCountry);
  if (byCountry) {
    return byCountry;
  }

  const byAccept = matchAcceptLanguage(input.acceptLanguage);
  if (byAccept) {
    return byAccept;
  }

  return "en";
}
