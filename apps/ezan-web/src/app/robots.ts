import { headers } from "next/headers";
import { MetadataRoute } from "next";
import { stripWww } from "../i18n/hosts";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hdrs = await headers();
  const rawHost = hdrs.get("x-forwarded-host") || hdrs.get("host") || "ezanvakfi.org";
  const { cleanHost } = stripWww(rawHost);
  const hostName = cleanHost.split(":")[0] || "ezanvakfi.org";
  const base = hostName === "azonvaqfi.org" ? "https://azonvaqfi.org" : "https://ezanvakfi.org";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/internal"]
      }
    ],
    sitemap: `${base}/sitemap.xml`
  };
}