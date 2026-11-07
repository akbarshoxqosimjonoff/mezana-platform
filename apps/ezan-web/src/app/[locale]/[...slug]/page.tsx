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
import { KurbanFlowWidget } from "../../../components/KurbanFlowWidget";
import { DonorCabinetWidget } from "../../../components/DonorCabinetWidget";
import { getPublicKurbanCatalog } from "../../../kurban/service";

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
  const secondSlug = slug?.[1] || "";
  const fullSlug = (slug || []).join("/");
  const routeKey = resolveRouteKeyFromSlug(firstSlug);
  const donateSlug = ROUTE_SLUGS.donate[locale];
  const projectsSlug = ROUTE_SLUGS.projects[locale];
  const aboutSlug = ROUTE_SLUGS.about[locale];

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
        contact={data.settings.contact}
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
        contact={data.settings.contact}
      >
        <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
          <div>
            <Breadcrumb locale={locale} items={[{ label: dict.navDonate }]} />
            <h1 className="text-3xl font-heading font-extrabold text-brand mb-6">{dict.navDonate}</h1>
            <DonationFlowWidget
              locale={locale}
              campaigns={data.campaigns}
              initialCampaignSlug={query.campaign}
              initialAmount={query.amount ? Number(query.amount) : undefined}
            />
          </div>

          {/* Banka Hesap ve IBAN Bilgilerimiz */}
          {data.settings.bankAccounts.length > 0 && (
            <Card className="border-t-4 border-brand space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-brand">
                  {dict.bankAccountsTitle} (EFT / Havale)
                </h2>
                <Badge tone="brand">Resmi Vakıf Hesabı</Badge>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {data.settings.bankAccounts.map((b: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-sm"
                  >
                    {b.accountHolder && (
                      <div>
                        <span className="font-bold text-slate-600">
                          {locale === "uz"
                            ? "Hisob egasi:"
                            : locale === "en"
                              ? "Account Holder:"
                              : locale === "ar"
                                ? "اسم الحساب:"
                                : "Hesap Adı:"}
                        </span>{" "}
                        <span className="font-extrabold text-brand">{b.accountHolder}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-bold text-slate-600">
                        {locale === "uz"
                          ? "Bank:"
                          : locale === "en"
                            ? "Bank:"
                            : locale === "ar"
                              ? "البنك:"
                              : "Banka:"}
                      </span>{" "}
                      <span className="font-semibold text-slate-900">
                        {b.bankName} ({b.currency})
                      </span>
                      {b.branch ? <span className="text-slate-600"> — {b.branch}</span> : null}
                    </div>
                    <div className="pt-1">
                      <span className="font-bold text-slate-600">IBAN:</span>{" "}
                      <span className="font-mono font-extrabold text-base text-brand bg-white px-2.5 py-1 rounded border border-slate-300 select-all">
                        {b.iban}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Vakfımıza Nasıl Destek Olabilirsiniz? (Eski saytdan 9 ta qo'llab-quvvatlash yo'li) */}
          {data.supportWays && data.supportWays.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-heading font-extrabold text-brand">
                {locale === "uz"
                  ? "Vaqfimizni Qanday Qo‘llab-Quvvatlashingiz Mumkin?"
                  : locale === "en"
                    ? "How Can You Support Our Foundation?"
                    : locale === "ar"
                      ? "كيف يمكنك دعم وقفنا؟"
                      : "Vakfımıza Nasıl Destek Olabilirsiniz?"}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.supportWays.map((way) => (
                  <Card key={way.key} className="space-y-2 border-t-4 border-accent">
                    <h3 className="text-base font-heading font-bold text-brand">{way.title}</h3>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                      {way.description}
                    </p>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </SiteShell>
    );
  }

  // Kampaniyalar sahifasi (target_amount = NULL bo'lganda soxta maqsad va progress ko'rinmaydi)
  if (routeKey === "campaigns") {
    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
        contact={data.settings.contact}
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
                  <p className="text-sm text-slate-700 mb-3">{camp.description || camp.summary}</p>
                </div>
                <div>
                  {camp.targetAmount > 0 && (
                    <ProgressBar
                      collected={camp.collectedAmount}
                      target={camp.targetAmount}
                      currency={camp.currency}
                    />
                  )}
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
        contact={data.settings.contact}
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
        contact={data.settings.contact}
      >
        <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
          <Breadcrumb locale={locale} items={[{ label: dict.navTransparency }]} />
          <h1 className="text-3xl font-heading font-extrabold text-brand">
            {dict.transparencySection}
          </h1>
          <Card>
            <h2 className="text-lg font-heading font-bold text-brand mb-2">
              {locale === "uz"
                ? "Xayriyalardan foydalanish tamoyillari va ichki nazorat"
                : locale === "en"
                  ? "Donation Utilization Principles & Internal Audit"
                  : locale === "ar"
                    ? "مبادئ استخدام التبرعات والرقابة الداخلية"
                    : "Bağışların Kullanım İlkeleri ve İç Denetim"}
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              {locale === "uz"
                ? "Ezan Vakfı onlayn xayriya tizimi orqali amalga oshirilgan barcha maqsadli (shartli) va umumiy xayriyalar o'z maqsadiga muvofiq sarflanadi va ichki vaqf boshqaruv tizimimizda (Mezana Vaqf) hisobga olinadi."
                : locale === "en"
                  ? "All restricted and general donations made through the Ezan Foundation online donation system are utilized strictly for their designated purposes and recorded in our internal foundation accounting system."
                  : locale === "ar"
                    ? "جميع التبرعات المشروطة والعامة التي تتم عبر نظام التبرع الإلكتروني لوقف الأذان تُصرف في مصارفها المحددة وتُوثق في نظام إدارة الوقف الداخلي."
                    : "Ezan Vakfı online bağış sistemi üzerinden yapılan tüm şartlı ve genel bağışlar, amacına uygun olarak ilgili eğitim ve hayır faaliyetlerinde kullanılır ve iç vakıf yönetim sistemimizde kayıt altına alınır."}
            </p>
          </Card>
          <Accordion items={data.faqs} />
        </div>
      </SiteShell>
    );
  }

  // Qurbonlik (2-bosqich: 8 qadamli xayriyachi oqimi, kvota, vekalet va sotuv muddati)
  if (routeKey === "qurban") {
    const fakeNowParam = query.nowMs;
    const nowMs =
      process.env.NODE_ENV !== "production" && fakeNowParam && Number.isFinite(Number(fakeNowParam))
        ? Number(fakeNowParam)
        : Date.now();
    const kurbanCatalog = await getPublicKurbanCatalog(locale, nowMs);

    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
        contact={data.settings.contact}
      >
        <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
          <Breadcrumb locale={locale} items={[{ label: dict.navQurban }]} />
          <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-brand">
            {dict.navQurban} ({kurbanCatalog.seasonYear})
          </h1>
          <KurbanFlowWidget locale={locale} catalog={kurbanCatalog} />
        </div>
      </SiteShell>
    );
  }

  // Xayriyachi kabineti (/[locale]/hesabim, /[locale]/kabinet, /[locale]/account)
  if (routeKey === "cabinet") {
    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
        contact={data.settings.contact}
      >
        <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
          <Breadcrumb locale={locale} items={[{ label: "Hesabım / Kabinet" }]} />
          <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-brand">
            Hesabım / Xayriyachi Kabineti
          </h1>
          <DonorCabinetWidget locale={locale} />
        </div>
      </SiteShell>
    );
  }

  // Media va Yangiliklar sahifasi
  if (routeKey === "media") {
    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
        contact={data.settings.contact}
      >
        <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
          <Breadcrumb locale={locale} items={[{ label: dict.navMedia }]} />
          <div className="space-y-6">
            <h1 className="text-3xl font-heading font-extrabold text-brand">{dict.videoSection}</h1>
            {data.videos.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {data.videos.map((v) => (
                  <Card key={v.id} className="space-y-3">
                    <YouTubeLite youtubeId={v.youtubeId} title={v.title} />
                    <h2 className="text-base font-bold text-brand">{v.title}</h2>
                    {v.description && (
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                        {v.description}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <p className="text-sm text-slate-600">
                  {locale === "uz"
                    ? "Videolar tez orada joylanadi."
                    : locale === "en"
                      ? "Videos will be published soon."
                      : locale === "ar"
                        ? "سيتم نشر الفيديوهات قريباً."
                        : "Video içeriklerimiz yakında eklenecektir."}
                </p>
              </Card>
            )}
          </div>

          {data.news.length > 0 && (
            <div className="space-y-6 pt-4 border-t border-slate-200">
              <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-brand">
                {dict.latestNews}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {data.news.map((n) => (
                  <Card
                    key={n.slug}
                    className="flex flex-col justify-between overflow-hidden space-y-3"
                  >
                    <div id={n.slug}>
                      {n.imageUrl && (
                        <div className="-mx-6 -mt-6 mb-4 overflow-hidden border-b border-slate-200">
                          <img
                            src={n.imageUrl}
                            alt={n.title}
                            loading="lazy"
                            className="w-full h-52 object-cover"
                          />
                        </div>
                      )}
                      <div className="text-xs font-semibold text-slate-500 mb-1">
                        {n.publishedAt}
                      </div>
                      <h3 className="text-lg font-heading font-bold text-brand mb-2">{n.title}</h3>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                        {n.body || n.excerpt}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </SiteShell>
    );
  }

  // LOYIHALAR RO'YXATI VA ALOHIDA LOYIHA SAHIFASI (/tr/projeler/[projectSlug])
  if (routeKey === "projects") {
    const plannedTargetBadge =
      locale === "uz"
        ? "Rejadagi maqsad"
        : locale === "en"
          ? "Planned Target"
          : locale === "ar"
            ? "هدف مستقبلي"
            : "Planlanan Hedef";
    const ongoingStateBadge =
      locale === "uz"
        ? "Davom etmoqda"
        : locale === "en"
          ? "Ongoing Activity"
          : locale === "ar"
            ? "نشاط مستمر"
            : "Devam Eden Faaliyet";

    if (secondSlug) {
      const project = data.projects.find((p) => p.slug === secondSlug);
      if (!project) {
        notFound();
      }

      const academicMembers = (data.team || []).filter((m) => m.groupType === "academic");

      return (
        <SiteShell
          locale={locale}
          announcement={data.settings.announcement}
          activeSocials={data.settings.activeSocials}
          bankAccounts={data.settings.bankAccounts}
          contact={data.settings.contact}
        >
          <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
            <Breadcrumb
              locale={locale}
              items={[
                { label: dict.ourProjects, href: `/${locale}/${projectsSlug}` },
                { label: project.title }
              ]}
            />

            <Card className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={project.projectState === "planlanan" ? "warning" : "success"}>
                    {project.projectState === "planlanan" ? plannedTargetBadge : ongoingStateBadge}
                  </Badge>
                  {project.locationName && (
                    <span className="text-xs font-semibold text-slate-600">{project.locationName}</span>
                  )}
                </div>
                <Link
                  href={`/${locale}/${donateSlug}`}
                  className="px-5 py-2.5 rounded-xl bg-accent text-brand font-extrabold text-sm hover:bg-accent-hover transition-colors"
                >
                  {dict.donateNow}
                </Link>
              </div>

              <h1 className="text-2xl sm:text-4xl font-heading font-extrabold text-brand">
                {project.title}
              </h1>

              {project.heroImage && (
                <div className="rounded-2xl overflow-hidden border border-slate-200">
                  <img
                    src={project.heroImage}
                    alt={project.title}
                    className="w-full max-h-[460px] object-cover"
                  />
                </div>
              )}

              {project.statsBadge && project.statsBadge.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {project.statsBadge.map((st: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center"
                    >
                      <div className="text-xl font-heading font-extrabold text-brand">{st.value}</div>
                      <div className="text-xs font-semibold text-slate-600 mt-1">{st.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {project.hadithQuote && (
                <blockquote className="rounded-xl bg-brand/5 border-s-4 border-accent p-4 text-sm italic text-slate-800">
                  {project.hadithQuote}
                </blockquote>
              )}

              <div
                data-testid="project-body-content"
                className="space-y-4 text-base text-slate-800 leading-relaxed whitespace-pre-line"
              >
                {project.content}
              </div>

              {project.externalLinks && project.externalLinks.length > 0 && (
                <div className="pt-4 border-t border-slate-200">
                  <h2 className="text-sm font-bold text-brand mb-2">Platformalar / Havolalar:</h2>
                  <div className="flex flex-wrap gap-2">
                    {project.externalLinks.map((lnk: any, idx: number) => (
                      <a
                        key={idx}
                        href={lnk.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-accent hover:text-brand text-xs font-bold text-brand transition-colors"
                      >
                        {lnk.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {project.gallery && project.gallery.length > 1 && (
                <div className="pt-4 border-t border-slate-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {project.gallery.map((imgUrl: string, idx: number) => (
                      <div key={idx} className="rounded-xl overflow-hidden border border-slate-200">
                        <img
                          src={imgUrl}
                          alt={`${project.title} - ${idx + 1}`}
                          loading="lazy"
                          className="w-full h-48 object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Mezana Akademisi sahifasida Akademik Heyet (Ustozlar) */}
            {project.slug === "mezana-akademisi" && academicMembers.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-heading font-extrabold text-brand">
                  {locale === "uz"
                    ? "Mezana Akademiyasi Ilmiy Hay'ati va Ustozlari"
                    : locale === "en"
                      ? "Mezana Academy Academic Faculty"
                      : locale === "ar"
                        ? "هيئة التدريس في أكاديمية مأذنة"
                        : "Mezana Akademisi Akademik Kadromuz ve Hocalarımız"}
                </h2>
                <div className="rounded-2xl overflow-hidden border border-slate-200">
                  <img
                    src="/media/old-site/teachers/teachers.jpg"
                    alt="Mezana Akademisi Hocaları"
                    loading="lazy"
                    className="w-full max-h-[420px] object-cover"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {academicMembers.map((member) => (
                    <Card
                      key={member.id}
                      className="flex flex-col sm:flex-row gap-4 items-start border-t-4 border-accent"
                    >
                      {member.photoUrl && (
                        <img
                          src={member.photoUrl}
                          alt={member.fullName}
                          loading="lazy"
                          className="w-24 h-28 object-cover rounded-xl border border-slate-200 shrink-0"
                        />
                      )}
                      <div className="space-y-1.5">
                        <h3 className="text-lg font-heading font-extrabold text-brand">
                          {member.fullName}
                        </h3>
                        <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                          {member.roleTitle}
                        </div>
                        {member.bio && (
                          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                            {member.bio}
                          </p>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Azon Global sahifasida tanishtiruv videosi */}
            {project.slug === "azon-global-medya" && data.videos.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-heading font-extrabold text-brand">
                  {dict.videoSection}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data.videos.map((v) => (
                    <Card key={v.id} className="space-y-3">
                      <YouTubeLite youtubeId={v.youtubeId} title={v.title} />
                      <h3 className="text-base font-bold text-brand">{v.title}</h3>
                      {v.description && (
                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                          {v.description}
                        </p>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SiteShell>
      );
    }

    // Loyihalar ro'yxati sahifasi
    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
        contact={data.settings.contact}
      >
        <div className="max-w-7xl mx-auto px-4 py-10 space-y-6">
          <Breadcrumb locale={locale} items={[{ label: dict.ourProjects }]} />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-3xl font-heading font-extrabold text-brand">{dict.ourProjects}</h1>
            <Link
              href={`/${locale}/${donateSlug}`}
              className="px-5 py-2.5 rounded-xl bg-accent text-brand font-extrabold text-sm hover:bg-accent-hover transition-colors"
            >
              {dict.donateNow}
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.projects.map((p) => (
              <Card key={p.slug} className="flex flex-col justify-between overflow-hidden">
                <div>
                  {p.heroImage && (
                    <div className="-mx-6 -mt-6 mb-4 overflow-hidden border-b border-slate-200">
                      <img
                        src={p.heroImage}
                        alt={p.title}
                        loading="lazy"
                        className="w-full h-48 object-cover"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge tone={p.projectState === "planlanan" ? "warning" : "success"}>
                      {p.projectState === "planlanan" ? plannedTargetBadge : ongoingStateBadge}
                    </Badge>
                    {p.locationName && (
                      <span className="text-xs font-semibold text-slate-600">{p.locationName}</span>
                    )}
                  </div>
                  <h2 className="text-lg font-heading font-bold text-brand mb-2">
                    <Link href={`/${locale}/${projectsSlug}/${p.slug}`} className="hover:underline">
                      {p.title}
                    </Link>
                  </h2>
                  <p className="text-sm text-slate-700 leading-relaxed mb-4">{p.summary}</p>
                  {p.statsBadge && p.statsBadge.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {p.statsBadge.slice(0, 3).map((st: any, idx: number) => (
                        <span
                          key={idx}
                          className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-brand"
                        >
                          {st.value} • {st.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <Link
                    href={`/${locale}/${projectsSlug}/${p.slug}`}
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
      </SiteShell>
    );
  }

  // BIZ KIMIZ / HAKKIMIZDA / VAKIF NEDİR / YÖNETİM SAHIFALARI
  if (
    routeKey === "about" ||
    firstSlug === "yonetim" ||
    fullSlug === "hakkimizda/vakif-nedir" ||
    secondSlug === "vakif-nedir"
  ) {
    const targetPageSlug =
      secondSlug === "vakif-nedir"
        ? "hakkimizda/vakif-nedir"
        : firstSlug === "yonetim" || secondSlug === "yonetim"
          ? "yonetim"
          : "hakkimizda";

    const pageDoc =
      data.pages?.find((pg) => pg.slug === targetPageSlug) ||
      data.pages?.find((pg) => pg.slug === "hakkimizda");

    const boardMembers = (data.team || []).filter(
      (m) => m.groupType === "board" || m.groupType === "executive"
    );
    const academicMembers = (data.team || []).filter((m) => m.groupType === "academic");

    return (
      <SiteShell
        locale={locale}
        announcement={data.settings.announcement}
        activeSocials={data.settings.activeSocials}
        bankAccounts={data.settings.bankAccounts}
        contact={data.settings.contact}
      >
        <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
          <Breadcrumb locale={locale} items={[{ label: pageDoc?.title || dict.navAbout }]} />

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/${locale}/${aboutSlug}`}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-colors ${
                targetPageSlug === "hakkimizda"
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-brand border-slate-300 hover:border-brand"
              }`}
            >
              {dict.navAbout}
            </Link>
            <Link
              href={`/${locale}/hakkimizda/vakif-nedir`}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-colors ${
                targetPageSlug === "hakkimizda/vakif-nedir"
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-brand border-slate-300 hover:border-brand"
              }`}
            >
              {locale === "uz"
                ? "Vaqf Nima?"
                : locale === "en"
                  ? "What is a Waqf?"
                  : locale === "ar"
                    ? "ما هو الوقف؟"
                    : "Vakıf Nedir?"}
            </Link>
            <Link
              href={`/${locale}/yonetim`}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-colors ${
                targetPageSlug === "yonetim"
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-brand border-slate-300 hover:border-brand"
              }`}
            >
              {locale === "uz"
                ? "Vasiylik va Ijroiya Hay'ati"
                : locale === "en"
                  ? "Board of Trustees & Executive Board"
                  : locale === "ar"
                    ? "مجلس الأمناء والهيئة التنفيذية"
                    : "Mütevelli ve İcra Heyeti"}
            </Link>
          </div>

          <Card className="space-y-6">
            <Badge tone="brand">{dict.siteName} • 2023</Badge>
            <h1 className="text-2xl sm:text-4xl font-heading font-extrabold text-brand">
              {pageDoc?.title || dict.navAbout}
            </h1>
            {pageDoc?.body && (
              <div className="space-y-4 text-base text-slate-800 leading-relaxed whitespace-pre-line">
                {pageDoc.body}
              </div>
            )}
          </Card>

          {boardMembers.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-heading font-extrabold text-brand">
                {locale === "uz"
                  ? "Vaqf Rahbariyati"
                  : locale === "en"
                    ? "Foundation Leadership"
                    : locale === "ar"
                      ? "إدارة الوقف"
                      : "Vakıf Yönetimi"}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {boardMembers.map((member) => (
                  <Card
                    key={member.id}
                    className="flex flex-col sm:flex-row gap-4 items-start border-t-4 border-accent"
                  >
                    {member.photoUrl && (
                      <img
                        src={member.photoUrl}
                        alt={member.fullName}
                        loading="lazy"
                        className="w-24 h-28 object-cover rounded-xl border border-slate-200 shrink-0"
                      />
                    )}
                    <div className="space-y-2">
                      <div>
                        <h3 className="text-lg font-heading font-extrabold text-brand">
                          {member.fullName}
                        </h3>
                        <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mt-0.5">
                          {member.roleTitle}
                        </div>
                      </div>
                      {member.bio && (
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                          {member.bio}
                        </p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {academicMembers.length > 0 && (
            <div className="space-y-4 pt-2">
              <h2 className="text-2xl font-heading font-extrabold text-brand">
                {locale === "uz"
                  ? "Mezana Akademiyasi Ilmiy Hay'ati va Ustozlari"
                  : locale === "en"
                    ? "Mezana Academy Academic Faculty"
                    : locale === "ar"
                      ? "هيئة التدريس في أكاديمية مأذنة"
                      : "Mezana Akademisi Akademik Kadromuz ve Hocalarımız"}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {academicMembers.map((member) => (
                  <Card
                    key={member.id}
                    className="flex flex-col sm:flex-row gap-4 items-start border-t-4 border-brand"
                  >
                    {member.photoUrl && (
                      <img
                        src={member.photoUrl}
                        alt={member.fullName}
                        loading="lazy"
                        className="w-24 h-28 object-cover rounded-xl border border-slate-200 shrink-0"
                      />
                    )}
                    <div className="space-y-1.5">
                      <div>
                        <h3 className="text-lg font-heading font-extrabold text-brand">
                          {member.fullName}
                        </h3>
                        <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mt-0.5">
                          {member.roleTitle}
                        </div>
                      </div>
                      {member.bio && (
                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                          {member.bio}
                        </p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </SiteShell>
    );
  }

  // ALOQA VA HUQUQIY SAHIFALAR
  return (
    <SiteShell
      locale={locale}
      announcement={data.settings.announcement}
      activeSocials={data.settings.activeSocials}
      bankAccounts={data.settings.bankAccounts}
      contact={data.settings.contact}
    >
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <Breadcrumb
          locale={locale}
          items={[{ label: routeKey === "contact" ? dict.navContact : firstSlug.replace(/-/g, " ") }]}
        />
        <Card className="space-y-4">
          <Badge tone="brand">{dict.siteName}</Badge>
          <h1 className="text-3xl font-heading font-extrabold text-brand capitalize">
            {routeKey === "contact" ? dict.navContact : firstSlug.replace(/-/g, " ")}
          </h1>
          <p className="text-sm text-slate-700 leading-relaxed">
            {routeKey === "contact"
              ? locale === "uz"
                ? "Savol va murojaatlaringizni quyidagi shakl orqali yuborishingiz mumkin."
                : locale === "en"
                  ? "You may send us your questions and inquiries using the contact form below."
                  : locale === "ar"
                    ? "يمكنكم إرسال استفساراتكم ورسائلكم عبر النموذج أدناه."
                    : "Soru, görüş ve taleplerinizi aşağıdaki iletişim formu üzerinden vakfımıza iletebilirsiniz."
              : locale === "uz"
                ? "Ezan Vakfı rasmiy huquqiy ma'lumotnomasi va shaxsiy ma'lumotlarni himoya qilish siyosati."
                : locale === "en"
                  ? "Ezan Foundation official legal notice and data protection policy."
                  : locale === "ar"
                    ? "الإشعار القانوني الرسمي وسياسة حماية البيانات لوقف الأذان."
                    : "Ezan Vakfı kurumsal aydınlatma metni, kişisel verilerin korunması (KVKK) ve bağış ilkeleri."}
          </p>

          {routeKey === "contact" &&
            (data.settings.contact.address ||
              data.settings.contact.phone ||
              data.settings.contact.email) && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm space-y-1.5">
                {data.settings.contact.address && (
                  <div>
                    <strong>Adres:</strong> {data.settings.contact.address}
                  </div>
                )}
                {data.settings.contact.phone && (
                  <div>
                    <strong>Telefon / WhatsApp:</strong> {data.settings.contact.phone}
                  </div>
                )}
                {data.settings.contact.email && (
                  <div>
                    <strong>E-posta:</strong> {data.settings.contact.email}
                  </div>
                )}
                {data.settings.bankAccounts.length > 0 && (
                  <div className="pt-2 border-t border-slate-200">
                    <strong>Resmi IBAN ({data.settings.bankAccounts[0].bankName}):</strong>{" "}
                    <span className="font-mono font-bold text-brand">
                      {data.settings.bankAccounts[0].iban}
                    </span>{" "}
                    ({data.settings.bankAccounts[0].accountHolder})
                  </div>
                )}
              </div>
            )}

          {routeKey === "contact" && data.settings.contact.mapEmbedUrl && (
            <div className="rounded-xl overflow-hidden border border-slate-200">
              <iframe
                src={data.settings.contact.mapEmbedUrl}
                title="Ezan Vakfı Harita Konumu"
                width="100%"
                height="320"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-72 border-0"
              />
            </div>
          )}

          {routeKey === "contact" && (
            <form
              action="/api/contact"
              method="POST"
              className="space-y-4 pt-4 border-t border-slate-200"
              data-testid="contact-form"
            >
              <input type="hidden" name="kind" value="contact" />
              <input type="hidden" name="locale" value={locale} />
              <div
                className="cf-turnstile"
                data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
              />
              <input
                type="hidden"
                name="cf-turnstile-response"
                value={process.env.NODE_ENV === "development" ? "dev-turnstile-ok" : ""}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-name" className="block text-xs font-bold text-brand mb-1">
                    {dict.fullName}
                  </label>
                  <input
                    id="contact-name"
                    name="fullName"
                    type="text"
                    required
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-xs font-bold text-brand mb-1">
                    {dict.email}
                  </label>
                  <input
                    id="contact-email"
                    name="email"
                    type="email"
                    required
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="contact-msg" className="block text-xs font-bold text-brand mb-1">
                  Mesaj
                </label>
                <textarea
                  id="contact-msg"
                  name="message"
                  rows={3}
                  required
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-accent text-brand font-bold text-sm hover:bg-accent-hover"
              >
                Gönder
              </button>
            </form>
          )}
        </Card>
      </div>
    </SiteShell>
  );
}
