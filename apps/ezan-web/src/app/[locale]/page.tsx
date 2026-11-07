import React from "react";
import Link from "next/link";
import { isValidLocale, Locale } from "../../i18n/country-locale";
import { ROUTE_SLUGS, UI_DICTIONARY } from "../../i18n/messages";
import { getPublicSiteData } from "../../cms/service";
import { SiteShell } from "../../components/SiteShell";
import { Accordion, Badge, Card, ProgressBar, YouTubeLite } from "../../components/ui";
import { DonationFlowWidget } from "../../components/InteractiveWidgets";

export default async function LocalizedHomePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isValidLocale(rawLocale) ? rawLocale : "tr";
  const dict = UI_DICTIONARY[locale];
  const data = await getPublicSiteData(locale);

  const donateSlug = ROUTE_SLUGS.donate[locale];
  const campaignsSlug = ROUTE_SLUGS.campaigns[locale];
  const projectsSlug = ROUTE_SLUGS.projects[locale];
  const transparencySlug = ROUTE_SLUGS.transparency[locale];

  const currentStatsTitle =
    locale === "uz"
      ? "Raqamlarda Vaqfimiz"
      : locale === "en"
        ? "Our Foundation in Numbers"
        : locale === "ar"
          ? "وقفنا بالأرقام"
          : "Rakamlarla Vakfımız";

  const catalogDataBadge =
    locale === "uz"
      ? "Katalog ma'lumoti"
      : locale === "en"
        ? "Catalog Data"
        : locale === "ar"
          ? "بيانات الكتالوج"
          : "Katalog verisi";

  const futureTargetsTitle =
    locale === "uz"
      ? "Kelajak Rejalarimiz va Maqsadlarimiz"
      : locale === "en"
        ? "Our Future Plans and Targets"
        : locale === "ar"
          ? "خططنا وأهدافنا المستقبلية"
          : "Gelecek Planlarımız ve Hedeflerimiz";

  const plannedTargetBadge =
    locale === "uz"
      ? "Rejadagi maqsad"
      : locale === "en"
        ? "Planned Target"
        : locale === "ar"
          ? "هدف مستقبلي"
          : "Hedef / Planlanan";

  const ongoingStateBadge =
    locale === "uz"
      ? "Davom etmoqda"
      : locale === "en"
        ? "Ongoing Activity"
        : locale === "ar"
          ? "نشاط مستمر"
          : "Devam Eden Faaliyet";

  const currentStats: Array<{ value: string; label: string; badge?: string }> =
    data.settings.homepageCatalogNumbers?.currentStats || [];
  const futureTargets: Array<{ value: string; label: string; badge?: string }> =
    data.settings.homepageCatalogNumbers?.futureTargets || [];
  const primaryQuote = data.settings.quotes?.[0];

  return (
    <SiteShell
      locale={locale}
      announcement={data.settings.announcement}
      activeSocials={data.settings.activeSocials}
      bankAccounts={data.settings.bankAccounts}
      contact={data.settings.contact}
    >
      {/* 1. HERO BLOKI (Katalog shiori va sinav-salonu-genis.jpg rasmi bilan) */}
      <section className="relative bg-brand text-white py-12 sm:py-16 border-b-4 border-accent overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="accent">{dict.siteName} • 2023</Badge>
              <img
                src="/media/katalog/brand/besmele-hat-800.webp"
                alt=""
                aria-hidden="true"
                className="h-7 w-auto opacity-80 bg-white/90 rounded px-2 py-0.5"
              />
            </div>
            <h1 className="text-3xl sm:text-5xl font-heading font-extrabold leading-tight text-white">
              {dict.tagline}
            </h1>
            <p className="text-base sm:text-lg text-slate-200 max-w-2xl leading-relaxed">
              {dict.heroIntro}
            </p>

            {/* Hero rasm: sinav-salonu-genis.jpg (WebP/AVIF quvuridan o'tgan) */}
            <div className="relative rounded-2xl overflow-hidden border-2 border-accent/60 shadow-lg max-w-2xl">
              <picture>
                <source srcSet="/media/katalog/egitim/sinav-salonu-genis-1280.avif" type="image/avif" />
                <source srcSet="/media/katalog/egitim/sinav-salonu-genis-1280.webp" type="image/webp" />
                <img
                  src="/media/katalog/egitim/sinav-salonu-genis-1280.webp"
                  alt={
                    locale === "uz"
                      ? "Ezan Vakfı va Mezana Akademiyasi imtihon va ta'lim zali"
                      : locale === "en"
                        ? "Ezan Foundation and Mezana Academy examination and lecture hall"
                        : locale === "ar"
                          ? "قاعة الامتحانات والتعليم في وقف الأذان وأكاديمية ميزانا"
                          : "Ezan Vakfı ve Mezana Akademisi sınav ve eğitim salonu"
                  }
                  width={1280}
                  height={853}
                  className="w-full h-56 sm:h-64 object-cover"
                />
              </picture>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href={`/${locale}/${donateSlug}`}
                className="px-6 py-3.5 rounded-xl bg-accent text-brand font-extrabold text-base hover:bg-accent-hover transition-colors"
              >
                {dict.donateNow}
              </Link>
              <Link
                href={`/${locale}/${projectsSlug}`}
                className="px-6 py-3.5 rounded-xl border-2 border-white/80 text-white font-bold text-base hover:bg-white/10 transition-colors"
              >
                {dict.ourProjects}
              </Link>
            </div>
          </div>

          {/* 2. TEZ XAYRIYA (1 bosishda summa tanlash va 3 qadamli oqim) */}
          <div className="lg:col-span-5 text-slate-900">
            <DonationFlowWidget locale={locale} campaigns={data.campaigns} />
          </div>
        </div>
      </section>

      {/* 3A. RAKAMLARLA VAKFIMIZ (Katalog 5-bet: amaldagi ko'rsatkichlar) */}
      {currentStats.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-6" data-testid="catalog-current-stats">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-brand">
              {currentStatsTitle}
            </h2>
            <Badge tone="brand">{catalogDataBadge}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {currentStats.map((st, idx) => (
              <Card key={idx} className="border-t-4 border-brand flex flex-col justify-between">
                <div>
                  <div className="text-3xl font-heading font-extrabold text-brand">{st.value}</div>
                  <div className="text-sm font-semibold text-slate-700 mt-2">{st.label}</div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100">
                  <span className="text-xs font-medium text-emerald-800">{st.badge}</span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 3B. GELECEK PLANLARIMIZ VE HEDEFLERİMİZ (Katalog 5 va 30-31-betlar: alohida blok) */}
      {futureTargets.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8" data-testid="catalog-future-targets">
          <div className="rounded-2xl bg-amber-50/70 border border-amber-200 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-brand">
                  {futureTargetsTitle}
                </h2>
              </div>
              <Badge tone="warning">{plannedTargetBadge}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {futureTargets.map((ft, idx) => (
                <Card key={idx} className="border border-amber-300/80 bg-white flex flex-col justify-between">
                  <div>
                    <div className="text-2xl font-heading font-extrabold text-amber-900">{ft.value}</div>
                    <div className="text-xs sm:text-sm font-semibold text-slate-700 mt-1.5">{ft.label}</div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-amber-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                      {plannedTargetBadge}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* HADIS IQTIBOSI (Sadaka-i Cariye — Müslim, Vasiyyet 14) */}
      {primaryQuote && primaryQuote.text && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <blockquote className="rounded-2xl bg-brand text-white p-6 sm:p-8 border-s-8 border-accent shadow-sm">
            <p className="text-base sm:text-lg font-medium italic leading-relaxed text-slate-100">
              “{primaryQuote.text}”
            </p>
            <footer className="mt-3 text-xs sm:text-sm font-bold text-accent">
              — {primaryQuote.source}
            </footer>
          </blockquote>
        </section>
      )}

      {/* 4. FAOL KAMPANIYALAR (target_amount = NULL bo'lsa soxta progress ko'rsatilmaydi) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-brand">
            {dict.activeCampaigns}
          </h2>
          <Link
            href={`/${locale}/${campaignsSlug}`}
            className="text-sm font-bold text-brand hover:underline"
          >
            {dict.activeCampaigns} <span className="rtl:rotate-180 inline-block">→</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.campaigns.map((camp) => (
            <Card key={camp.slug} className="flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <Badge tone={camp.restricted ? "warning" : "brand"}>
                    {camp.restricted ? "Şartlı / Maqsadli" : "Genel / Umumiy"}
                  </Badge>
                </div>
                <h3 className="text-lg font-heading font-bold text-brand mb-2">{camp.title}</h3>
                <p className="text-sm text-slate-700 leading-relaxed mb-4">{camp.summary}</p>
              </div>
              <div>
                {camp.targetAmount > 0 && (
                  <ProgressBar
                    collected={camp.collectedAmount}
                    target={camp.targetAmount}
                    currency={camp.currency}
                  />
                )}
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Link
                    href={`/${locale}/${donateSlug}?campaign=${camp.slug}`}
                    className="w-full text-center py-2.5 px-4 rounded-xl bg-accent text-brand font-bold text-sm hover:bg-accent-hover transition-colors"
                  >
                    {dict.donateNow}
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 5. LOYIHALAR BLOKI (Katalogdagi 11 ta loyiha) */}
      <section className="bg-slate-100 py-12 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-brand">
              {dict.ourProjects}
            </h2>
            <Link
              href={`/${locale}/${projectsSlug}`}
              className="text-sm font-bold text-brand hover:underline"
            >
              {dict.navActivities} <span className="rtl:rotate-180 inline-block">→</span>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.projects.map((proj) => (
              <Card key={proj.slug} className="flex flex-col justify-between overflow-hidden">
                <div>
                  {proj.heroImage && (
                    <div className="-mx-6 -mt-6 mb-4 overflow-hidden border-b border-slate-200">
                      <img
                        src={proj.heroImage}
                        alt={proj.title}
                        loading="lazy"
                        className="w-full h-44 object-cover"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge tone={proj.projectState === "planlanan" ? "warning" : "success"}>
                      {proj.projectState === "planlanan" ? plannedTargetBadge : ongoingStateBadge}
                    </Badge>
                    {proj.locationName && (
                      <span className="text-xs font-semibold text-slate-600">{proj.locationName}</span>
                    )}
                  </div>
                  <h3 className="text-lg font-heading font-bold text-brand mb-2">
                    <Link
                      href={`/${locale}/${projectsSlug}/${proj.slug}`}
                      className="hover:underline"
                    >
                      {proj.title}
                    </Link>
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed mb-4">{proj.summary}</p>
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <Link
                    href={`/${locale}/${projectsSlug}/${proj.slug}`}
                    className="text-xs font-bold text-brand hover:underline"
                  >
                    {locale === "uz"
                      ? "Batafsil →"
                      : locale === "en"
                        ? "Read More →"
                        : locale === "ar"
                          ? "التفاصيل ←"
                          : "Detaylı İncele →"}
                  </Link>
                  <Link
                    href={`/${locale}/${donateSlug}`}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-accent/20 text-brand hover:bg-accent/40 transition-colors"
                  >
                    {dict.donateNow}
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 6. VIDEO BLOK (Faqat tasdiqlangan videolar bor bo'lsagina ko'rinadi) */}
      {data.videos.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-brand mb-6">
            {dict.videoSection}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.videos.slice(0, 2).map((vid) => (
              <Card key={vid.id} className="space-y-3">
                <YouTubeLite youtubeId={vid.youtubeId} title={vid.title} />
                <h3 className="text-base font-bold text-brand">{vid.title}</h3>
                {vid.description && (
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{vid.description}</p>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 7. SHAFFOFLIK VA YANGILIKLAR BLOKI */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {data.news.length > 0 && (
          <div className="lg:col-span-7">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-heading font-extrabold text-brand">
                {dict.latestNews}
              </h2>
              <Link
                href={`/${locale}/${ROUTE_SLUGS.media[locale]}`}
                className="text-xs sm:text-sm font-bold text-brand hover:underline"
              >
                {dict.navMedia} <span className="rtl:rotate-180 inline-block">→</span>
              </Link>
            </div>
            <div className="space-y-4">
              {data.news.slice(0, 4).map((item) => (
                <Card key={item.slug} className="flex flex-col sm:flex-row gap-4 items-start">
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      loading="lazy"
                      className="w-full sm:w-36 h-36 sm:h-28 object-cover rounded-xl border border-slate-200 shrink-0"
                    />
                  )}
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-slate-500 mb-1">{item.publishedAt}</div>
                    <h3 className="text-base font-heading font-bold text-brand mb-1">
                      <Link
                        href={`/${locale}/${ROUTE_SLUGS.media[locale]}#${item.slug}`}
                        className="hover:underline"
                      >
                        {item.title}
                      </Link>
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{item.excerpt}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className={data.news.length > 0 ? "lg:col-span-5" : "lg:col-span-12"}>
          <h2 className="text-2xl font-heading font-extrabold text-brand mb-4">
            {dict.transparencySection}
          </h2>
          <Accordion items={data.faqs} />
          <div className="mt-4">
            <Link
              href={`/${locale}/${transparencySlug}`}
              className="inline-flex items-center text-sm font-bold text-brand hover:underline"
            >
              {dict.navTransparency} <span className="ms-1 rtl:rotate-180 inline-block">→</span>
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
