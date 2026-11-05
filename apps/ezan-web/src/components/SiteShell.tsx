import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Locale } from "../i18n/country-locale";
import { ROUTE_SLUGS, UI_DICTIONARY } from "../i18n/messages";
import { SITE_CONFIG } from "../lib/config";
import { CookieConsentBanner, DonateButton, LanguageSwitcher } from "./ui";

export function SiteShell({
  locale,
  announcement,
  activeSocials = [],
  bankAccounts = [],
  children
}: {
  locale: Locale;
  announcement?: string;
  activeSocials?: [string, string][];
  bankAccounts?: Array<{
    bankName: string;
    branch: string;
    accountHolder: string;
    currency: string;
    iban: string;
  }>;
  children: React.ReactNode;
}) {
  const dict = UI_DICTIONARY[locale];
  const slugs = {
    about: ROUTE_SLUGS.about[locale],
    projects: ROUTE_SLUGS.projects[locale],
    donate: ROUTE_SLUGS.donate[locale],
    zakat: ROUTE_SLUGS.zakat[locale],
    transparency: ROUTE_SLUGS.transparency[locale],
    media: ROUTE_SLUGS.media[locale],
    contact: ROUTE_SLUGS.contact[locale],
    qurban: ROUTE_SLUGS.qurban[locale],
    kvkk: ROUTE_SLUGS.legal_kvkk[locale],
    cookies: ROUTE_SLUGS.legal_cookies[locale],
    terms: ROUTE_SLUGS.legal_terms[locale],
    refund: ROUTE_SLUGS.legal_refund[locale]
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Sinov rejimi banneri (DONATIONS_LIVE=false bo'lganda har doim ko'rinadi) */}
      {!SITE_CONFIG.donationsLive && (
        <div
          data-testid="sandbox-mode-banner"
          className="bg-amber-100 text-amber-950 border-b border-amber-300 px-4 py-1.5 text-center text-xs font-semibold"
        >
          {dict.sandboxBanner}
        </div>
      )}

      {/* E'lon paneli (CMS'dan) */}
      {announcement && (
        <div className="bg-brand-dark text-slate-100 px-4 py-1.5 text-center text-xs">
          {announcement}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-brand text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded-lg"
          >
            <Image
              src="/ezan-logo.png"
              alt={dict.siteName}
              width={44}
              height={44}
              priority
              className="rounded-lg bg-white/10 p-0.5 object-contain"
            />
            <div>
              <span className="block font-heading font-bold text-lg leading-tight text-white">
                {dict.siteName}
              </span>
              <span className="block text-xs text-slate-300">{dict.tagline}</span>
            </div>
          </Link>

          {/* Asosiy 4 bo'lim menyusi + Media/Aloqa */}
          <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-5 text-sm font-medium">
            <Link href={`/${locale}/${slugs.about}`} className="hover:text-accent transition-colors">
              {dict.navAbout}
            </Link>
            <Link href={`/${locale}/${slugs.projects}`} className="hover:text-accent transition-colors">
              {dict.navActivities}
            </Link>
            <Link href={`/${locale}/${slugs.donate}`} className="hover:text-accent transition-colors">
              {dict.navDonate}
            </Link>
            <Link href={`/${locale}/${slugs.zakat}`} className="hover:text-accent transition-colors">
              {dict.navZakat}
            </Link>
            <Link href={`/${locale}/${slugs.transparency}`} className="hover:text-accent transition-colors">
              {dict.navTransparency}
            </Link>
            <Link href={`/${locale}/${slugs.media}`} className="hover:text-accent transition-colors">
              {dict.navMedia}
            </Link>
            <Link href={`/${locale}/${slugs.qurban}`} className="hover:text-accent transition-colors">
              {dict.navQurban}
            </Link>
            <Link href={`/${locale}/${slugs.contact}`} className="hover:text-accent transition-colors">
              {dict.navContact}
            </Link>
          </nav>

          {/* Til tanlagich va Xayriya tugmasi (mobilda ham har doim ko'rinadi) */}
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher currentLocale={locale} />
            <DonateButton locale={locale} />
          </div>
        </div>

        {/* Mobil menyu */}
        <nav
          aria-label="Mobile navigation"
          className="lg:hidden border-t border-white/10 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium"
        >
          <Link href={`/${locale}/${slugs.about}`} className="whitespace-nowrap hover:text-accent">
            {dict.navAbout}
          </Link>
          <Link href={`/${locale}/${slugs.projects}`} className="whitespace-nowrap hover:text-accent">
            {dict.navActivities}
          </Link>
          <Link href={`/${locale}/${slugs.donate}`} className="whitespace-nowrap hover:text-accent">
            {dict.navDonate}
          </Link>
          <Link href={`/${locale}/${slugs.zakat}`} className="whitespace-nowrap hover:text-accent">
            {dict.navZakat}
          </Link>
          <Link href={`/${locale}/${slugs.transparency}`} className="whitespace-nowrap hover:text-accent">
            {dict.navTransparency}
          </Link>
          <Link href={`/${locale}/${slugs.media}`} className="whitespace-nowrap hover:text-accent">
            {dict.navMedia}
          </Link>
          <Link href={`/${locale}/${slugs.qurban}`} className="whitespace-nowrap hover:text-accent">
            {dict.navQurban}
          </Link>
          <Link href={`/${locale}/${slugs.contact}`} className="whitespace-nowrap hover:text-accent">
            {dict.navContact}
          </Link>
        </nav>
      </header>

      {/* Asosiy kontent */}
      <main id="main-content" className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-brand text-white border-t-4 border-accent mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h2 className="font-heading font-bold text-lg text-white mb-2">{dict.siteName}</h2>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">{dict.tagline}</p>
            {/* Ijtimoiy tarmoqlar: faqat to'ldirilgan bo'lsagina ko'rinadi */}
            {activeSocials.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  {dict.followUs}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {activeSocials.map(([net, url]) => (
                    <a
                      key={net}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 rounded-lg bg-white/10 hover:bg-accent hover:text-brand text-xs font-semibold transition-colors"
                    >
                      {net}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <h2 className="font-heading font-bold text-base text-white mb-3">
              {dict.bankAccountsTitle}
            </h2>
            <div className="space-y-2.5 text-xs text-slate-200">
              {bankAccounts.map((b, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                  <div className="font-semibold text-white">
                    {b.bankName} ({b.currency})
                  </div>
                  <div className="font-mono text-slate-300 mt-0.5">{b.iban}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-heading font-bold text-base text-white mb-3">
              {dict.transparencySection} & KVKK
            </h2>
            <ul className="space-y-2 text-sm text-slate-200">
              <li>
                <Link href={`/${locale}/${slugs.kvkk}`} className="hover:underline">
                  KVKK Aydınlatma Metni
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/${slugs.cookies}`} className="hover:underline">
                  Cookie / Çerez Politikası
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/${slugs.terms}`} className="hover:underline">
                  Bağış Şartları / Xayriya shartlari
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/${slugs.refund}`} className="hover:underline">
                  İade Politikası / Qaytarish siyosati
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-slate-300">
          © {new Date().getFullYear()} {dict.siteName}. {dict.footerRights}
        </div>
      </footer>

      <CookieConsentBanner locale={locale} />
    </div>
  );
}