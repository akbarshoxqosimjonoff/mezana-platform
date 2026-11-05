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

  return (
    <SiteShell
      locale={locale}
      announcement={data.settings.announcement}
      activeSocials={data.settings.activeSocials}
      bankAccounts={data.settings.bankAccounts}
    >
      {/* 1. HERO BLOKI */}
      <section className="bg-brand text-white py-12 sm:py-16 border-b-4 border-accent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <Badge tone="accent">{dict.siteName} • 2027</Badge>
            <h1 className="text-3xl sm:text-5xl font-heading font-extrabold leading-tight text-white">
              {dict.tagline}
            </h1>
            <p className="text-base sm:text-lg text-slate-200 max-w-2xl leading-relaxed">
              {data.campaigns[0]?.summary}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href={`/${locale}/${donateSlug}`}
                className="px-6 py-3.5 rounded-xl bg-accent text-brand font-extrabold text-base hover:bg-accent-hover transition-colors"
              >
                {dict.donateNow}
              </Link>
              <Link
                href={`/${locale}/${campaignsSlug}`}
                className="px-6 py-3.5 rounded-xl border-2 border-white/80 text-white font-bold text-base hover:bg-white/10 transition-colors"
              >
                {dict.activeCampaigns}
              </Link>
            </div>
          </div>

          {/* 2. TEZ XAYRIYA (1 bosishda summa tanlash va 3 qadamli oqim) */}
          <div className="lg:col-span-5 text-slate-900">
            <DonationFlowWidget locale={locale} campaigns={data.campaigns} />
          </div>
        </div>
      </section>

      {/* 3. RAQAMLARDA VAQF (CMS'da bo'sh bo'lsa blok yashirin!) */}
      {data.settings.stats.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.settings.stats.map((st: any, idx: number) => (
              <Card key={idx} className="text-center">
                <div className="text-3xl font-heading font-extrabold text-brand">{st.value}</div>
                <div className="text-sm text-slate-600 mt-1">{st.label}</div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 4. FAOL KAMPANIYALAR (progress bilan) */}
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
                  {camp.needsReview && <Badge tone="accent">Tahrir kutilmoqda</Badge>}
                </div>
                <h3 className="text-lg font-heading font-bold text-brand mb-2">{camp.title}</h3>
                <p className="text-sm text-slate-700 leading-relaxed mb-4">{camp.summary}</p>
              </div>
              <div>
                <ProgressBar
                  collected={camp.collectedAmount}
                  target={camp.targetAmount}
                  currency={camp.currency}
                />
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

      {/* 5. LOYIHALAR BLOKI */}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.projects.map((proj) => (
              <Card key={proj.slug}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge tone="success">{proj.projectStatus}</Badge>
                  {proj.locationName && (
                    <span className="text-xs font-semibold text-slate-600">{proj.locationName}</span>
                  )}
                </div>
                <h3 className="text-lg font-heading font-bold text-brand mb-2">{proj.title}</h3>
                <p className="text-sm text-slate-700 leading-relaxed">{proj.summary}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 6. VIDEO BLOK (YouTube Lite) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-brand mb-6">
          {dict.videoSection}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.videos.slice(0, 2).map((vid) => (
            <div key={vid.id} className="space-y-2">
              <YouTubeLite youtubeId={vid.youtubeId} title={vid.title} />
              <h3 className="text-sm font-bold text-brand">{vid.title}</h3>
            </div>
          ))}
        </div>
      </section>

      {/* 7. SHAFFOFLIK VA YANGILIKLAR BLOKI */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7">
          <h2 className="text-2xl font-heading font-extrabold text-brand mb-4">
            {dict.latestNews}
          </h2>
          <div className="space-y-4">
            {data.news.map((item) => (
              <Card key={item.slug}>
                <div className="text-xs font-semibold text-slate-500 mb-1">{item.publishedAt}</div>
                <h3 className="text-base font-heading font-bold text-brand mb-1">{item.title}</h3>
                <p className="text-sm text-slate-700">{item.excerpt}</p>
              </Card>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5">
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