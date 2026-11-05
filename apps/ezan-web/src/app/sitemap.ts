import { headers } from "next/headers";
import { MetadataRoute } from "next";
import { stripWww, getCanonicalUrl } from "../i18n/hosts";
import { ROUTE_SLUGS, RouteKey } from "../i18n/messages";
import { Locale } from "../i18n/country-locale";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hdrs = await headers();
  const rawHost = hdrs.get("x-forwarded-host") || hdrs.get("host") || "ezanvakfi.org";
  const { cleanHost } = stripWww(rawHost);
  const hostName = cleanHost.split(":")[0] || "ezanvakfi.org";

  // Har bir domenda faqat o'z kanonik sahifalari chiqadi
  const canonicalLocales: Locale[] =
    hostName === "azonvaqfi.org" ? ["uz"] : ["tr", "en", "ar"];

  const routeKeys: RouteKey[] = [
    "home",
    "about",
    "projects",
    "campaigns",
    "donate",
    "zakat",
    "transparency",
    "media",
    "contact",
    "qurban",
    "legal_kvkk",
    "legal_cookies",
    "legal_terms",
    "legal_refund"
  ];

  const entries: MetadataRoute.Sitemap = [];
  for (const locale of canonicalLocales) {
    for (const key of routeKeys) {
      const slug = ROUTE_SLUGS[key][locale];
      const path = slug ? `/${slug}` : "";
      entries.push({
        url: getCanonicalUrl(locale, path),
        lastModified: new Date(),
        changeFrequency: key === "home" || key === "campaigns" ? "daily" : "weekly",
        priority: key === "home" || key === "donate" ? 1.0 : 0.8
      });
    }
  }

  return entries;
}