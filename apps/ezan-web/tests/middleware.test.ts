import { describe, it, expect } from "vitest";
import { evaluateLocaleRouting } from "../src/middleware";
import { getCanonicalUrl, getHreflangLinks, isAllowedPaymentHost } from "../src/i18n/hosts";

describe("1-qadam: Ikki domen va til tanlash (Middleware jadval testi)", () => {
  const cases = [
    {
      name: "ezanvakfi.org | cookie: ? | country: TR | accept: ? | path: / -> 307 /tr",
      input: { host: "ezanvakfi.org", cookieLang: null, cfCountry: "TR", acceptLanguage: null, pathname: "/" },
      expected: { action: "redirect", status: 307, location: "/tr" }
    },
    {
      name: "ezanvakfi.org | cookie: ? | country: UZ | accept: ? | path: /xayriya -> 307 /uz/xayriya",
      input: { host: "ezanvakfi.org", cookieLang: null, cfCountry: "UZ", acceptLanguage: null, pathname: "/xayriya" },
      expected: { action: "redirect", status: 307, location: "/uz/xayriya" }
    },
    {
      name: "ezanvakfi.org | cookie: ? | country: SA | accept: ? | path: / -> 307 /ar",
      input: { host: "ezanvakfi.org", cookieLang: null, cfCountry: "SA", acceptLanguage: null, pathname: "/" },
      expected: { action: "redirect", status: 307, location: "/ar" }
    },
    {
      name: "ezanvakfi.org | cookie: ? | country: DE | accept: de,en;q=0.8 | path: / -> 307 /en",
      input: { host: "ezanvakfi.org", cookieLang: null, cfCountry: "DE", acceptLanguage: "de,en;q=0.8", pathname: "/" },
      expected: { action: "redirect", status: 307, location: "/en" }
    },
    {
      name: "ezanvakfi.org | cookie: ? | country: DE | accept: uz | path: / -> 307 /uz",
      input: { host: "ezanvakfi.org", cookieLang: null, cfCountry: "DE", acceptLanguage: "uz", pathname: "/" },
      expected: { action: "redirect", status: 307, location: "/uz" }
    },
    {
      name: "ezanvakfi.org | cookie: ar | country: TR | accept: ? | path: / -> 307 /ar",
      input: { host: "ezanvakfi.org", cookieLang: "ar", cfCountry: "TR", acceptLanguage: null, pathname: "/" },
      expected: { action: "redirect", status: 307, location: "/ar" }
    },
    {
      name: "azonvaqfi.org | cookie: ? | country: TR | accept: tr | path: / -> 307 /uz",
      input: { host: "azonvaqfi.org", cookieLang: null, cfCountry: "TR", acceptLanguage: "tr", pathname: "/" },
      expected: { action: "redirect", status: 307, location: "/uz" }
    },
    {
      name: "azonvaqfi.org | cookie: en | country: UZ | accept: ? | path: / -> 307 /en",
      input: { host: "azonvaqfi.org", cookieLang: "en", cfCountry: "UZ", acceptLanguage: null, pathname: "/" },
      expected: { action: "redirect", status: 307, location: "/en" }
    },
    {
      name: "ezanvakfi.org | cookie: ? | country: UZ | accept: ? | path: /en/haqimizda -> redirect yo'q",
      input: { host: "ezanvakfi.org", cookieLang: null, cfCountry: "UZ", acceptLanguage: null, pathname: "/en/haqimizda" },
      expected: { action: "pass", locale: "en" }
    },
    {
      name: "ezanvakfi.org | cookie: ? | country: ? | accept: Googlebot | path: / -> 307 /en",
      input: { host: "ezanvakfi.org", cookieLang: null, cfCountry: null, acceptLanguage: "Googlebot", userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)", pathname: "/" },
      expected: { action: "redirect", status: 307, location: "/en" }
    },
    {
      name: "Query string saqlanishi va Cache-Control: private, no-store",
      input: { host: "ezanvakfi.org", cookieLang: null, cfCountry: "TR", acceptLanguage: null, pathname: "/bagis", search: "?campaign=ramazan&amount=500" },
      expected: { action: "redirect", status: 307, location: "/tr/bagis?campaign=ramazan&amount=500" }
    },
    {
      name: "www.ezanvakfi.org -> 301 https://ezanvakfi.org/...",
      input: { host: "www.ezanvakfi.org", cookieLang: null, cfCountry: "TR", acceptLanguage: null, pathname: "/tr/hakkimizda" },
      expected: { action: "redirect", status: 301, location: "https://ezanvakfi.org/tr/hakkimizda" }
    }
  ];

  for (const tc of cases) {
    it(tc.name, () => {
      const res = evaluateLocaleRouting(tc.input);
      expect(res.action).toBe(tc.expected.action);
      if (tc.expected.status) {
        expect(res.status).toBe(tc.expected.status);
      }
      if (tc.expected.location) {
        expect(res.location).toBe(tc.expected.location);
      }
      if (tc.expected.status === 307) {
        expect(res.cacheControl).toBe("private, no-store");
      }
    });
  }

  it("Kanonik domen va hreflang URL'lar to'g'ri tuziladi", () => {
    expect(getCanonicalUrl("uz", "/haqimizda")).toBe("https://azonvaqfi.org/uz/haqimizda");
    expect(getCanonicalUrl("tr", "/hakkimizda")).toBe("https://ezanvakfi.org/tr/hakkimizda");
    expect(getCanonicalUrl("en", "/about")).toBe("https://ezanvakfi.org/en/about");
    expect(getCanonicalUrl("ar", "/about")).toBe("https://ezanvakfi.org/ar/about");

    const hreflangs = getHreflangLinks("/donate");
    expect(hreflangs.uz).toBe("https://azonvaqfi.org/uz/donate");
    expect(hreflangs.tr).toBe("https://ezanvakfi.org/tr/donate");
    expect(hreflangs["x-default"]).toBe("https://ezanvakfi.org/");
  });

  it("Noma'lum host uchun to'lov callback URL ruxsat berilmaydi (SITE_HOSTS allowlist)", () => {
    expect(isAllowedPaymentHost("ezanvakfi.org")).toBe(true);
    expect(isAllowedPaymentHost("azonvaqfi.org")).toBe(true);
    expect(isAllowedPaymentHost("evil-phishing.org")).toBe(false);
  });
});
