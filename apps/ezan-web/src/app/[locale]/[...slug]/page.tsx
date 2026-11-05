import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidLocale, Locale } from "../../../i18n/country-locale";
import { getCanonicalUrl, getHreflangLinks } from "../../../i18n/hosts";
import { resolveRouteKeyFromSlug, ROUTE_SLUGS, UI_DICTIONARY } from "../../../i18n/messages";
import { getPublicSiteData } from "../../../cms/service";
import { dbQuery } from "../../../db/schema";
import { SiteShell } from "../../../components/SiteShell";
import { Accordion, Badge, Breadcrumb, Card, ProgressBar, YouTubeLite } from "../../../components/ui";
import { DonationFlowWidget, ZakatCalculatorWidget } from "../../../components/InteractiveWidgets";

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const loc: Locale = isValidLocale(rawLocale) ? rawLocale : "tr";
  const pathSuffix = `/${(slug || []).join("/")}`;
  const canonical = getCanonicalUrl(loc, pathSuffix);
  const languages = getHreflangLinks(pathSuffix);
  return {
    alternates: {
      canonical,
      languages
    }
  };
}

export default async function LocalizedSubPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string; slug: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale: rawLocale, slug } = await params;
  const query = await searchParams;
  if (!isValidLocale(rawLocale)) {
    notFound();
  }
  const locale: Locale = rawLocale;
  const dict = UI_DICTIONARY[locale];
  const data = await getPublicSiteData(locale);

  const firstSlug = slug?.[0] || "";
  const routeKey = resolveRouteKeyFromSlug(firstSlug);
  const donateSlug = ROUTE_SLUGS.donate[locale];

  // Return sahifasi (Rahmat / Teşekkürler) — holatni o'zi o'zgartirmaydi, faqat bazadagi holatni ko'rsatadi
  if (routeKey === "thanks") {
    const publicNo = query.donation || "";
    const donRes = publicNo
      ? await dbQuery(`SELECT * FROM donations WHERE public_no = $1 LIMIT 1`, [publicNo])
      : { rows: [] };
    const donation = donRes.rows[0];

    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
      >
        <div className="max-w-3xl mx-auto px-4 py-12">
          <Breadcrumb locale={locale} items={[{ label: "Teşekkürler / Rahmat" }]} />
          <Card className="text-center space-y-4">
            <Badge tone="success">Bağış Kaydı / Xayriya Qaydi</Badge>
            <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-brand">
              Hayrınız Kabul Olsun — Teşekkür Ederiz!
            </h1>
            {donation ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-start text-sm space-y-1.5">
                <div>
                  <strong>Kayıt No (public_no):</strong>{" "}
                  <span data-testid="receipt-public-no" className="font-mono font-bold text-brand">
                    {donation.public_no}
                  </span>
                </div>
                <div>
                  <strong>Durum (Holat):</strong>{" "}
                  <span data-testid="receipt-status" className="uppercase font-bold text-emerald-800">
                    {donation.status}
                  </span>
                </div>
                <div>
                  <strong>Tutar:</strong> {Number(donation.amount_try).toLocaleString("tr-TR")}{" "}
                  {donation.currency}
                </div>
                <div>
                  <strong>Amaç:</strong> {donation.purpose_title}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Kayıt No: {publicNo || "—"}</p>
            )}
          </Card>
        </div>
      </SiteShell>
    );
  }

  // Xayriya va Savatcha sahifasi
  if (routeKey === "donate" || routeKey === "cart") {
    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
      >
        <div className="max-w-4xl mx-auto px-4 py-10">
          <Breadcrumb locale={locale} items={[{ label: dict.navDonate }]} />
          <h1 className="text-3xl font-heading font-extrabold text-brand mb-6">{dict.navDonate}</h1>
          <DonationFlowWidget
            locale={locale}
            campaigns={data.campaigns}
            initialCampaignSlug={query.campaign}
            initialAmount={query.amount ? Number(query.amount) : undefined}
          />
        </div>
      </SiteShell>
    );
  }

  // Kampaniyalar sahifasi
  if (routeKey === "campaigns") {
    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
      >
        <div className="max-w-6xl mx-auto px-4 py-10">
          <Breadcrumb locale={locale} items={[{ label: dict.activeCampaigns }]} />
          <h1 className="text-3xl font-heading font-extrabold text-brand mb-6">
            {dict.activeCampaigns}
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.campaigns.map((camp) => (
              <Card key={camp.slug} className="flex flex-col justify-between">
                <div>
                  <Badge tone={camp.restricted ? "warning" : "brand"}>
                    {camp.restricted ? "Şartlı / Maqsadli" : "Genel / Umumiy"}
                  </Badge>
                  <h2 className="text-xl font-heading font-bold text-brand mt-3 mb-2">
                    {camp.title}
                  </h2>
                  <p className="text-sm text-slate-700 mb-3">{camp.description}</p>
                </div>
                <div>
                  <ProgressBar
                    collected={camp.collectedAmount}
                    target={camp.targetAmount}
                    currency={camp.currency}
                  />
                  <Link
                    href={`/${locale}/${donateSlug}?campaign=${camp.slug}`}
                    className="mt-3 block w-full text-center py-2.5 px-4 rounded-xl bg-accent text-brand font-bold text-sm hover:bg-accent-hover"
                  >
                    {dict.donateNow}
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </SiteShell>
    );
  }

  // Zakot kalkulyatori sahifasi
  if (routeKey === "zakat") {
    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
      >
        <div className="max-w-4xl mx-auto px-4 py-10">
          <Breadcrumb locale={locale} items={[{ label: dict.navZakat }]} />
          <h1 className="text-3xl font-heading font-extrabold text-brand mb-6">
            {dict.zakatCalcTitle}
          </h1>
          <ZakatCalculatorWidget locale={locale} />
        </div>
      </SiteShell>
    );
  }

  // Shaffoflik sahifasi
  if (routeKey === "transparency") {
    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
      >
        <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
          <Breadcrumb locale={locale} items={[{ label: dict.navTransparency }]} />
          <h1 className="text-3xl font-heading font-extrabold text-brand">
            {dict.transparencySection}
          </h1>
          <Card>
            <h2 className="text-lg font-heading font-bold text-brand mb-2">
              Bağışların Kullanım İlkeleri ve İç Denetim [TASLIK]
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              Ezan Vakfı online bağış sistemi üzerinden yapılan tüm şartlı ve genel bağışlar, HMAC-SHA256 kriptografik doğrulama ile iç vakıf yönetim sistemimize (Mezana Vaqf) aktarılır ve bağımsız denetime tabidir. [TASLIK]
            </p>
          </Card>
          <Accordion items={data.faqs} />
        </div>
      </SiteShell>
    );
  }

  // Qurbonlik (2-bosqich uchun ma'lumot sahifasi va "Ochilganda xabar bering" formasi)
  if (routeKey === "qurban") {
    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
      >
        <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
          <Breadcrumb locale={locale} items={[{ label: dict.navQurban }]} />
          <Card className="space-y-4">
            <Badge tone="warning">2. Aşama / 2-Bosqich</Badge>
            <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-brand">
              {dict.qurbanSoonTitle}
            </h1>
            <p className="text-sm text-slate-700">
              Vekâlet yoluyla kurban kesimi, kişiye özel kesim videosu ve SMS/WhatsApp bilgilendirme modülü 2. aşamada aktif edilecektir. Planlanan bölgeler:
            </p>
            <div className="flex flex-wrap gap-2">
              {data.qurbanCountries.map((qc) => (
                <Badge key={qc.code} tone="brand">
                  {qc.name}
                </Badge>
              ))}
            </div>
            <form action="/api/contact" method="POST" className="pt-4 border-t border-slate-200 space-y-3">
              <input type="hidden" name="kind" value="qurban_notify" />
              <input type="hidden" name="locale" value={locale} />
              <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""} />
              <input type="hidden" name="cf-turnstile-response" value={process.env.NODE_ENV === "development" ? "dev-turnstile-ok" : ""} />
              <label htmlFor="qurban-email" className="block text-sm font-bold text-brand">
                {dict.qurbanNotifyBtn} ({dict.email})
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="qurban-email"
                  name="email"
                  type="email"
                  required
                  placeholder="ornek@eposta.com"
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-accent text-brand font-bold text-sm hover:bg-accent-hover"
                >
                  {dict.qurbanNotifyBtn}
                </button>
              </div>
            </form>
          </Card>
        </div>
      </SiteShell>
    );
  }

  // Media sahifasi
  if (routeKey === "media") {
    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
      >
        <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
          <Breadcrumb locale={locale} items={[{ label: dict.navMedia }]} />
          <h1 className="text-3xl font-heading font-extrabold text-brand">{dict.videoSection}</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.videos.map((v) => (
              <Card key={v.id} className="space-y-3">
                <YouTubeLite youtubeId={v.youtubeId} title={v.title} />
                <h2 className="text-base font-bold text-brand">{v.title}</h2>
              </Card>
            ))}
          </div>
        </div>
      </SiteShell>
    );
  }

  // Biz kimiz, Faoliyat, Aloqa va Huquqiy sahifalar
  return (
    <SiteShell
      locale={locale}
      announcement={data.settings.announcement}
      activeSocials={data.settings.activeSocials}
      bankAccounts={data.settings.bankAccounts}
    >
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <Breadcrumb locale={locale} items={[{ label: firstSlug }]} />
        <Card className="space-y-4">
          <Badge tone="brand">{dict.siteName}</Badge>
          <h1 className="text-3xl font-heading font-extrabold text-brand capitalize">
            {routeKey === "about"
              ? dict.navAbout
              : routeKey === "projects"
                ? dict.ourProjects
                : routeKey === "contact"
                  ? dict.navContact
                  : firstSlug.replace(/-/g, " ")}
          </h1>
          <p className="text-sm text-slate-700 leading-relaxed">
            [TASLIK] Ezan Vakfı ve Mezana Akademisi kurumsal bilgi, faaliyet raporları, KVKK aydınlatma metni ve resmi iletişim bilgileri.
          </p>
          {routeKey === "contact" && (
            <form action="/api/contact" method="POST" className="space-y-4 pt-4 border-t border-slate-200" data-testid="contact-form">
              <input type="hidden" name="kind" value="contact" />
              <input type="hidden" name="locale" value={locale} />
              <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""} />
              <input type="hidden" name="cf-turnstile-response" value={process.env.NODE_ENV === "development" ? "dev-turnstile-ok" : ""} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-name" className="block text-xs font-bold text-brand mb-1">{dict.fullName}</label>
                  <input id="contact-name" name="fullName" type="text" required className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-xs font-bold text-brand mb-1">{dict.email}</label>
                  <input id="contact-email" name="email" type="email" required className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label htmlFor="contact-msg" className="block text-xs font-bold text-brand mb-1">Mesaj</label>
                <textarea id="contact-msg" name="message" rows={3} required className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm" />
              </div>
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-accent text-brand font-bold text-sm hover:bg-accent-hover">
                Gönder
              </button>
            </form>
          )}
          {routeKey === "projects" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              {data.projects.map((p) => (
                <div key={p.slug} className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <h2 className="font-bold text-brand mb-1">{p.title}</h2>
                  <p className="text-xs text-slate-700">{p.summary}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </SiteShell>
  );
}