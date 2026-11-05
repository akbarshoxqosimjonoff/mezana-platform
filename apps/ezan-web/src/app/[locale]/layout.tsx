import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidLocale, LOCALE_META, Locale } from "../../i18n/country-locale";
import { getCanonicalUrl, getHreflangLinks } from "../../i18n/hosts";
import { UI_DICTIONARY } from "../../i18n/messages";

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const loc: Locale = isValidLocale(locale) ? locale : "tr";
  const dict = UI_DICTIONARY[loc];
  const canonical = getCanonicalUrl(loc, "");
  const languages = getHreflangLinks("");

  return {
    title: {
      default: `${dict.siteName} — ${dict.tagline}`,
      template: `%s | ${dict.siteName}`
    },
    description: dict.tagline,
    alternates: {
      canonical,
      languages
    },
    openGraph: {
      title: `${dict.siteName} — ${dict.tagline}`,
      description: dict.tagline,
      url: canonical,
      siteName: dict.siteName,
      locale: loc,
      type: "website"
    }
  };
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) {
    notFound();
  }
  const meta = LOCALE_META[locale];
  const canonical = getCanonicalUrl(locale, "");
  const dict = UI_DICTIONARY[locale];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NGO",
    name: dict.siteName,
    description: dict.tagline,
    url: canonical,
    logo: `${canonical}/ezan-logo.png`,
    potentialAction: {
      "@type": "DonateAction",
      target: getCanonicalUrl(locale, `/${locale === "uz" ? "xayriya" : locale === "tr" ? "bagis" : "donate"}`)
    }
  };

  return (
    <html lang={meta.htmlLang} dir={meta.dir}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased selection:bg-accent selection:text-brand">
        {children}
      </body>
    </html>
  );
}