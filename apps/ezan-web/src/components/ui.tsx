"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Locale, LOCALE_META, SUPPORTED_LOCALES } from "../i18n/country-locale";
import { EZAN_LANG_COOKIE } from "../i18n/hosts";
import { getTranslatedPath, ROUTE_SLUGS, UI_DICTIONARY } from "../i18n/messages";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  const base =
    "inline-flex items-center justify-center font-semibold rounded-xl transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50";
  const variants = {
    primary: "bg-brand text-white hover:bg-brand-light",
    // Oltin (#FBCC42) faqat tugma foni sifatida, matn to'q (#01242B) bo'lib kontrast WCAG 2.2 AA (>11:1)
    accent: "bg-accent text-brand hover:bg-accent-hover shadow-sm",
    outline: "border-2 border-brand text-brand hover:bg-brand hover:text-white",
    ghost: "text-brand hover:bg-slate-100"
  };
  const sizes = {
    sm: "px-3.5 py-2 text-sm",
    md: "px-5 py-2.5 text-base",
    lg: "px-6 py-3.5 text-lg"
  };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-6 ${className}`}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "brand"
}: {
  children: React.ReactNode;
  tone?: "brand" | "accent" | "success" | "warning";
}) {
  const tones = {
    brand: "bg-brand text-white",
    accent: "bg-accent text-brand font-bold",
    success: "bg-emerald-100 text-emerald-900 font-semibold",
    warning: "bg-amber-100 text-amber-900 font-semibold"
  };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function ProgressBar({
  collected,
  target,
  currency = "TRY"
}: {
  collected: number;
  target: number;
  currency?: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 100;
  return (
    <div className="my-3">
      <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
        <span>
          {collected.toLocaleString("tr-TR")} {currency}
        </span>
        {target > 0 && (
          <span>
            {pct}% / {target.toLocaleString("tr-TR")} {currency}
          </span>
        )}
      </div>
      <div
        className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Campaign progress"
      >
        <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Breadcrumb({
  locale,
  items
}: {
  locale: Locale;
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-600">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link href={`/${locale}`} className="hover:text-brand underline-offset-4 hover:underline">
            {UI_DICTIONARY[locale].siteName}
          </Link>
        </li>
        {items.map((item, idx) => (
          <li key={idx} className="flex items-center gap-2">
            <span aria-hidden="true" className="rtl:rotate-180 inline-block">
              →
            </span>
            {item.href ? (
              <Link href={item.href} className="hover:text-brand underline-offset-4 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className="font-semibold text-brand" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Accordion({
  items
}: {
  items: Array<{ id: string | number; question: string; answer: string }>;
}) {
  const [openId, setOpenId] = useState<string | number | null>(items[0]?.id ?? null);
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div key={item.id} className="border border-slate-200 rounded-xl bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : item.id)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between px-5 py-4 text-start font-semibold text-brand hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
            >
              <span>{item.question}</span>
              <span className="ms-3 text-lg font-bold" aria-hidden="true">
                {isOpen ? "−" : "+"}
              </span>
            </button>
            {isOpen && (
              <div className="px-5 pb-4 pt-1 text-slate-700 text-sm leading-relaxed border-t border-slate-100">
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function YouTubeLite({
  youtubeId,
  title
}: {
  youtubeId: string;
  title: string;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-brand border border-slate-200">
      {!loaded ? (
        <button
          type="button"
          onClick={() => setLoaded(true)}
          aria-label={`Play video: ${title}`}
          className="group relative w-full h-full flex flex-col items-center justify-center text-white p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <div className="w-16 h-16 rounded-full bg-accent text-brand flex items-center justify-center text-2xl font-bold shadow-lg group-hover:scale-105 transition-transform">
            ▶
          </div>
          <span className="mt-3 text-sm font-medium text-center line-clamp-2 max-w-md text-slate-100">
            {title}
          </span>
        </button>
      ) : (
        <iframe
          className="w-full h-full"
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}
    </div>
  );
}

export function LanguageSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const pathname = usePathname() || `/${currentLocale}`;
  const router = useRouter();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const switchLanguage = (targetLocale: Locale) => {
    // 1 yil, SameSite=Lax, Secure (https da)
    const maxAge = 365 * 24 * 60 * 60;
    const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
    document.cookie = `${EZAN_LANG_COOKIE}=${targetLocale}; path=/; max-age=${maxAge}; SameSite=Lax${isHttps ? "; Secure" : ""}`;

    const { path, fallback } = getTranslatedPath(pathname, targetLocale);
    if (fallback) {
      setToastMsg(UI_DICTIONARY[targetLocale].translationMissingNotice);
      setTimeout(() => setToastMsg(null), 4000);
    }
    router.push(path);
  };

  return (
    <div className="relative flex items-center gap-1" role="group" aria-label="Language selector">
      {SUPPORTED_LOCALES.map((loc) => {
        const active = loc === currentLocale;
        return (
          <button
            key={loc}
            type="button"
            data-testid={`lang-switch-${loc}`}
            onClick={() => switchLanguage(loc)}
            aria-current={active ? "true" : undefined}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
              active
                ? "bg-accent text-brand"
                : "text-white/90 hover:bg-white/10"
            }`}
          >
            {LOCALE_META[loc].label}
          </button>
        );
      })}
      {toastMsg && (
        <div
          role="status"
          className="fixed bottom-5 end-5 z-50 bg-brand text-white px-4 py-3 rounded-xl shadow-lg border border-accent text-xs max-w-xs"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export function DonateButton({ locale }: { locale: Locale }) {
  const dict = UI_DICTIONARY[locale];
  const slug = ROUTE_SLUGS.donate[locale];
  return (
    <Link
      href={`/${locale}/${slug}`}
      data-testid="header-donate-button"
      className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-accent text-brand font-bold text-sm hover:bg-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {dict.donateNow}
    </Link>
  );
}

export function CookieConsentBanner({ locale }: { locale: Locale }) {
  const dict = UI_DICTIONARY[locale];
  const [visible, setVisible] = useState(false);

  React.useEffect(() => {
    const hasChoice = document.cookie.includes("ezan_cookie_consent=");
    if (!hasChoice) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const saveConsent = (mode: "all" | "essential") => {
    const maxAge = 365 * 24 * 60 * 60;
    document.cookie = `ezan_cookie_consent=${mode}; path=/; max-age=${maxAge}; SameSite=Lax`;
    setVisible(false);
  };

  return (
    <aside
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 z-40 bg-brand text-white border-t-2 border-accent p-4 shadow-2xl"
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">{dict.cookieBannerText}</p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => saveConsent("essential")}
            className="px-3.5 py-2 rounded-lg border border-white/40 text-xs font-semibold text-white hover:bg-white/10"
          >
            {dict.cookieEssentialOnly}
          </button>
          <button
            type="button"
            onClick={() => saveConsent("all")}
            className="px-3.5 py-2 rounded-lg bg-accent text-brand text-xs font-bold hover:bg-accent-hover"
          >
            {dict.cookieAcceptAll}
          </button>
        </div>
      </div>
    </aside>
  );
}