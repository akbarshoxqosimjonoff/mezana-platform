import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidLocale, Locale } from "../../../../../i18n/country-locale";
import { getPublicSiteData } from "../../../../../cms/service";
import { getKurbanTrackingDetails } from "../../../../../kurban/service";
import { SiteShell } from "../../../../../components/SiteShell";
import { Badge, Breadcrumb, Card } from "../../../../../components/ui";
import { TrackingShareClient } from "../../../../../components/TrackingShareClient";

export const metadata: Metadata = {
  title: "Kurban Takip | Ezan Vakfı",
  robots: {
    index: false,
    follow: false,
    nocache: true
  }
};

const TIMELINE_STEPS = ["reserved", "paid", "assigned", "slaughtered", "video_ready", "notified"] as const;

const TRACKING_TEXT: Record<Locale, Record<string, string>> = {
  tr: {
    title: "Kurban Hisse ve Video Takip Sayfası",
    orderNo: "Sipariş No",
    country: "Ülke",
    animalTag: "Hayvan Küpe / Tag No",
    timelineTitle: "Süreç Durumu (Zaman Çizelgesi)",
    videoReadyTitle: "Kurban Kesim Videonuz Hazır",
    downloadBtn: "Videoyu İndir (MP4)",
    shareBtn: "Paylaş (Yalnızca Sizin Onayınızla)",
    retentionNotice: "Gizlilik Notu: Bu video yalnızca 1 saatlik imzalı bağlantı ile açılır, 1 yıl ({days} gün) saklanır ve sonrasında otomatik silinir. Diğer hissedarların isimleri gizlidir."
  },
  uz: {
    title: "Qurbonlik hissesi va video kuzatuv sahifasi",
    orderNo: "Buyurtma raqami",
    country: "Davlat",
    animalTag: "Hayvon quloq / Tag raqami",
    timelineTitle: "Jarayon holati (Vaqt chizig'i)",
    videoReadyTitle: "Qurbonlik kesim videongiz tayyor",
    downloadBtn: "Videoni yuklab olish (MP4)",
    shareBtn: "Ulashish (Faqat siz bosganda)",
    retentionNotice: "Maxfiylik eslatmasi: Video faqat 1 soatlik imzolangan havola orqali ochiladi, 1 yil ({days} kun) saqlanadi va keyin o'chadi. Boshqa hissedorlarning ismi ko'rsatilmaydi."
  },
  en: {
    title: "Qurbani Share & Video Tracking Page",
    orderNo: "Order No",
    country: "Country",
    animalTag: "Animal Tag No",
    timelineTitle: "Process Timeline",
    videoReadyTitle: "Your Qurbani Video is Ready",
    downloadBtn: "Download Video (MP4)",
    shareBtn: "Share Link (Manual Only)",
    retentionNotice: "Privacy Note: This video opens via a 1-hour signed link, is stored for 1 year ({days} days), and is then deleted. Other shareholders' names are never shown."
  },
  ar: {
    title: "صفحة متابعة سهم وفيديو الأضحية",
    orderNo: "رقم الطلب",
    country: "الدولة",
    animalTag: "رقم الأضحية (Tag)",
    timelineTitle: "مراحل تنفيذ الأضحية",
    videoReadyTitle: "فيديو ذبح أضحيتكم جاهز",
    downloadBtn: "تحميل الفيديو (MP4)",
    shareBtn: "مشاركة الرابط",
    retentionNotice: "ملاحظة الخصوصية: يفتح الفيديو عبر رابط موقع صالح لمدة ساعة واحدة، ويُحفظ لمدة سنة واحدة ({days} يوماً) ثم يُحذف تلقائياً. لا تظهر أسماء المشاركين الآخرين."
  }
};

export default async function KurbanTrackingPage({
  params
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale: rawLocale, token } = await params;
  if (!isValidLocale(rawLocale)) {
    notFound();
  }
  const locale: Locale = rawLocale;
  const details = await getKurbanTrackingDetails(token, locale);
  if (!details) {
    notFound();
  }

  const siteData = await getPublicSiteData(locale);
  const t = TRACKING_TEXT[locale] || TRACKING_TEXT.tr;

  return (
    <SiteShell
      locale={locale}
      announcement={siteData.settings.announcement}
      activeSocials={siteData.settings.activeSocials}
      bankAccounts={siteData.settings.bankAccounts}
    >
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6" data-testid="kurban-tracking-page">
        <Breadcrumb locale={locale} items={[{ label: t.title }]} />
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="brand">{details.orderNo}</Badge>
            <span className="text-xs font-bold text-slate-700">
              {details.countryFlag} {details.countryName} ({details.seasonYear})
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-brand">{t.title}</h1>
          <p className="text-xs text-slate-700 bg-slate-100 p-3 rounded-xl border border-slate-200" data-testid="retention-privacy-note">
            {t.retentionNotice.replace("{days}", String(details.videoRetentionDays))}
          </p>
        </Card>

        {details.shares.map((sh) => {
          const currentIdx = Math.max(0, TIMELINE_STEPS.indexOf(sh.status as any));
          return (
            <Card key={sh.id} className="space-y-4" data-testid={`tracking-share-card-${sh.seqInOrder}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-xs font-bold text-slate-600">Hisse #{sh.seqInOrder}</span>
                  <h2 className="text-lg font-heading font-bold text-brand" data-testid="tracked-owner-name">
                    {sh.ownerName}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="warning">{sh.intentionType.toUpperCase()}</Badge>
                  <Badge tone="success">{sh.status.toUpperCase()}</Badge>
                </div>
              </div>

              {sh.tagNo && (
                <div className="text-sm font-bold text-brand">
                  {t.animalTag}: <span className="font-mono">{sh.tagNo}</span>
                </div>
              )}

              <div>
                <div className="text-xs font-bold text-brand mb-2">{t.timelineTitle}</div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2" data-testid="tracking-timeline">
                  {TIMELINE_STEPS.map((st, idx) => {
                    const reached = idx <= currentIdx;
                    return (
                      <div
                        key={st}
                        className={`p-2 rounded-lg border text-center text-xs font-bold ${
                          reached
                            ? "bg-emerald-50 border-emerald-400 text-emerald-950"
                            : "bg-slate-50 border-slate-200 text-slate-600"
                        }`}
                      >
                        {st}
                      </div>
                    );
                  })}
                </div>
              </div>

              {sh.video && (
                <div className="space-y-3 pt-3 border-t border-slate-200" data-testid="tracking-video-section">
                  <h3 className="text-base font-heading font-bold text-brand">{t.videoReadyTitle}</h3>
                  <video
                    controls
                    preload="metadata"
                    src={sh.video.streamUrl}
                    data-testid="tracking-video-player"
                    className="w-full rounded-xl bg-black max-h-96"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href={sh.video.downloadUrl}
                      download
                      data-testid="tracking-video-download-btn"
                      className="px-4 py-2.5 rounded-xl bg-brand text-white font-bold text-xs hover:opacity-95"
                    >
                      {t.downloadBtn}
                    </a>
                    <TrackingShareClient label={t.shareBtn} />
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </SiteShell>
  );
}
