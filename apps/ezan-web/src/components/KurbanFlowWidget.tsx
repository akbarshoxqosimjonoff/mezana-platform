"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Locale } from "../i18n/country-locale";
import { Badge, Card } from "./ui";

export interface KurbanOfferItem {
  id: number;
  animalType: "sheep" | "goat" | "cattle" | "camel";
  sharesPerAnimal: number;
  pricePerShareTry: number;
  quotaShares: number;
  soldShares: number;
  remainingShares: number;
}

export interface KurbanCountryItem {
  code: string;
  flag: string;
  name: string;
  description: string;
  minPriceTry: number;
  totalRemainingShares: number;
  offers: KurbanOfferItem[];
}

export interface KurbanCatalogProps {
  seasonYear: number;
  isActive: boolean;
  salesOpen: boolean;
  salesClosed: boolean;
  salesOpenAt: string | null;
  salesCloseAt: string | null;
  vekaletVersion: string;
  vekaletText: string;
  countries: KurbanCountryItem[];
  intentionTypes: { code: string; label: string }[];
}

const LABELS: Record<Locale, Record<string, string>> = {
  tr: {
    step1: "1. Ülke Seçimi",
    step2: "2. Hayvan ve Hisse Sayısı",
    step3: "3. Kimin Adına (Hissedarlar)",
    step4: "4. Niyet Türü",
    step5: "5. Vekâlet Onayı",
    step6: "6. İletişim ve Rıza",
    step7: "7. Sepet ve Ödeme",
    step8: "8. Onay ve Takip",
    backBtn: "← Önceki Adım",
    nextBtn: "Devam Et →",
    remainingBadge: "Son {n} hisse",
    sheepLabel: "Küçükbaş (Koyun/Keçi - 1 Hisse)",
    cattleLabel: "Büyükbaş (Sığır/Deve - 7 Hisseye Kadar)",
    shareCountLabel: "Hisse Adedi",
    myOwnNameBtn: "Kendi Adıma Doldur",
    ownerPlaceholder: "Hissedar Adı Soyadı (2–80 karakter)",
    vekaletTitle: "Dini Kurban Vekâlet Metni",
    vekaletCheck: "Yukarıdaki vekâlet metnini okudum, Ezan Vakfı'nı kurbanımı kesmeye ve dağıtmaya vekil tayin ettim.",
    phoneLabel: "Cep Telefonu (Uluslararası Format - WhatsApp/SMS)",
    emailLabel: "E-posta Adresi (İsteğe Bağlı)",
    kvkkCheck: "KVKK Aydınlatma Metni'ni okudum ve kabul ediyorum.",
    readAloudCheck: "Hissedar isimlerinin kesim videosunda sesli olarak okunmasına onay veriyorum.",
    serverPriceNote: "Toplam tutar sunucu tarafında güvenli olarak hesaplanır.",
    extraDonationLabel: "Sepete İsteğe Bağlı Genel Bağış Ekle (TRY)",
    payBtn: "Ödemeyi Tamamla ve Vekâleti Kaydet",
    salesClosedTitle: "Bu Yılki Kurban Kabulü Tamamlandı",
    salesClosedDesc: "Kurban satış süresi sona ermiştir. Gelecek yıl kurban organizasyonu açıldığında haberdar olmak için bekleme listesine kaydolabilirsiniz.",
    noActiveOffersTitle: "Kurban Ülke ve Fiyatları Yakında Açılacak",
    noActiveOffersDesc: "Kurban sezonu tarihleri ve ülke kotaları vakıf yönetimi tarafından onaylandığında burada açılacaktır.",
    waitlistBtn: "Bekleme Listesine Kaydol",
    thanksTitle: "Kurban Vekâletiniz ve Kaydınız Alındı!",
    trackingLinkBtn: "Kurban Takip Sayfasına Git"
  },
  uz: {
    step1: "1. Davlat tanlash",
    step2: "2. Hayvon va hisse soni",
    step3: "3. Kim nomidan",
    step4: "4. Niyat turi",
    step5: "5. Vekalet tasdig'i",
    step6: "6. Kontakt va rozilik",
    step7: "7. To'lov va savatcha",
    step8: "8. Tasdiq va kuzatuv",
    backBtn: "← Orqaga qaytish",
    nextBtn: "Keyingi qadam →",
    remainingBadge: "Son {n} hisse",
    sheepLabel: "Qo'y / Echki (1 hisse)",
    cattleLabel: "Qoramol / Tuya (7 hissegacha)",
    shareCountLabel: "Hisse soni",
    myOwnNameBtn: "O'zim nomimga",
    ownerPlaceholder: "Hissedor F.I.Sh. (2–80 belgi)",
    vekaletTitle: "Qurbonlik Vekalet Matni",
    vekaletCheck: "Yuqoridagi vekalet matnini o'qidim va qurbonligimni so'yish hamda tarqatish uchun Ezan Vakfı'ga vakolat berdim.",
    phoneLabel: "Telefon raqam (xalqaro formatda, WhatsApp shu raqamga)",
    emailLabel: "E-pochta (ixtiyoriy)",
    kvkkCheck: "KVKK shaxsiy ma'lumotlar qoidalariga roziman.",
    readAloudCheck: "Ismlar videoda ovoz chiqarib o'qiladi (roziman).",
    serverPriceNote: "Narx faqat serverda hisoblanadi.",
    extraDonationLabel: "Savatchaga qo'shimcha umumiy xayriya qo'shish (TRY)",
    payBtn: "To'lovni tasdiqlash",
    salesClosedTitle: "Bu yilgi qabul yakunlandi",
    salesClosedDesc: "Qurbonlik qabul qilish muddati yakunlandi. Keyingi yilgi kutish ro'yxatiga yozilishingiz mumkin.",
    noActiveOffersTitle: "Qurbonlik davlatlari va narxlari tez orada e'lon qilinadi",
    noActiveOffersDesc: "Vaqf ma'muriyati tomonidan narx va kvotalar kiritilgach, sotuv shu yerda ochiladi.",
    waitlistBtn: "Kutish ro'yxatiga yozilish",
    thanksTitle: "Rahmat! Qurbonlik buyurtmangiz qabul qilindi",
    trackingLinkBtn: "Kuzatuv sahifasini ochish"
  },
  en: {
    step1: "1. Select Country",
    step2: "2. Animal & Shares",
    step3: "3. Shareholder Names",
    step4: "4. Intention Type",
    step5: "5. Proxy (Wakalah)",
    step6: "6. Contact & Consent",
    step7: "7. Cart & Payment",
    step8: "8. Confirmation",
    backBtn: "← Previous Step",
    nextBtn: "Continue →",
    remainingBadge: "Last {n} shares",
    sheepLabel: "Sheep / Goat (1 Share)",
    cattleLabel: "Cattle / Camel (Up to 7 Shares)",
    shareCountLabel: "Number of Shares",
    myOwnNameBtn: "Use My Own Name",
    ownerPlaceholder: "Full Name for Share (2–80 chars)",
    vekaletTitle: "Islamic Qurbani Proxy (Wakalah) Statement",
    vekaletCheck: "I have read the Wakalah text and appoint Ezan Foundation to slaughter and distribute my Qurbani.",
    phoneLabel: "Phone Number (International format for WhatsApp/SMS)",
    emailLabel: "Email Address (Optional)",
    kvkkCheck: "I accept the KVKK Data Privacy Notice.",
    readAloudCheck: "Names will be read aloud in the video (I consent).",
    serverPriceNote: "Final price is calculated strictly on the server.",
    extraDonationLabel: "Add Optional General Donation to Cart (TRY)",
    payBtn: "Complete Payment & Submit Proxy",
    salesClosedTitle: "This Year's Qurbani Registration Has Closed",
    salesClosedDesc: "The registration deadline has passed. Join our waitlist for next year's Qurbani season.",
    noActiveOffersTitle: "Qurbani Countries & Quotas Coming Soon",
    noActiveOffersDesc: "Countries and share prices will appear here once published by foundation staff.",
    waitlistBtn: "Join Next Year Waitlist",
    thanksTitle: "Thank You! Your Qurbani Order is Confirmed",
    trackingLinkBtn: "Open Qurbani Tracking Page"
  },
  ar: {
    step1: "1. اختيار الدولة",
    step2: "2. نوع الأضحية وعدد الأسهم",
    step3: "3. أسماء المضحي",
    step4: "4. نوع النية",
    step5: "5. التوكيل الشرعي",
    step6: "6. التواصل والموافقة",
    step7: "7. السلة والدفع",
    step8: "8. التأكيد والمتابعة",
    backBtn: "→ الخطوة السابقة",
    nextBtn: "متابعة ←",
    remainingBadge: "آخر {n} سهم",
    sheepLabel: "ضأن / ماعز (سهم واحد)",
    cattleLabel: "أبقار / إبل (حتى 7 أسهم)",
    shareCountLabel: "عدد الأسهم",
    myOwnNameBtn: "باسمي الشخصي",
    ownerPlaceholder: "اسم صاحب السهم (2-80 حرفاً)",
    vekaletTitle: "نص التوكيل الشرعي للأضحية",
    vekaletCheck: "قرأت نص التوكيل وأوكل وقف الأذان في ذبح أضحيتي وتوزيعها.",
    phoneLabel: "رقم الهاتف الدولي (لواتساب والرسائل)",
    emailLabel: "البريد الإلكتروني (اختياري)",
    kvkkCheck: "أوافق على سياسة حماية البيانات الشخصية (KVKK).",
    readAloudCheck: "أوافق على قراءة الأسماء بصوت مسموع في فيديو الذبح.",
    serverPriceNote: "يتم احتساب المبلغ الإجمالي في الخادم.",
    extraDonationLabel: "إضافة تبرع عام اختياري إلى السلة (TRY)",
    payBtn: "إتمام الدفع وتأكيد التوكيل",
    salesClosedTitle: "انتهى التسجيل لأضاحي هذا العام",
    salesClosedDesc: "انتهت فترة قبول الأضاحي. يمكنك التسجيل في قائمة الانتظار للعام القادم.",
    noActiveOffersTitle: "سيتم الإعلان عن دول وأسعار الأضاحي قريباً",
    noActiveOffersDesc: "ستظهر الدول والأسعار فور اعتمادها من إدارة الوقف.",
    waitlistBtn: "التسجيل في قائمة الانتظار",
    thanksTitle: "شكراً لكم! تم تسجيل أضحيتكم بنجاح",
    trackingLinkBtn: "فتح صفحة متابعة الأضحية"
  }
};

export function KurbanFlowWidget({
  locale,
  catalog
}: {
  locale: Locale;
  catalog: KurbanCatalogProps;
}) {
  const t = LABELS[locale] || LABELS.tr;
  const [step, setStep] = useState<number>(1);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>(
    catalog.countries[0]?.code || ""
  );

  const selectedCountry =
    catalog.countries.find((c) => c.code === selectedCountryCode) || catalog.countries[0] || null;
  const availableOffers = selectedCountry?.offers || [];

  const [selectedOfferId, setSelectedOfferId] = useState<number>(
    availableOffers[0]?.id || 0
  );
  const activeOffer =
    availableOffers.find((o) => o.id === selectedOfferId) || availableOffers[0] || null;

  const [shareCount, setShareCount] = useState<number>(1);
  const [donorOwnName, setDonorOwnName] = useState<string>("Ahmet Yılmaz");
  const [shareOwners, setShareOwners] = useState<string[]>(["Ahmet Yılmaz"]);
  const [shareIntentions, setShareIntentions] = useState<string[]>(["vacip"]);
  const [vekaletAccepted, setVekaletAccepted] = useState<boolean>(false);
  const [donorPhone, setDonorPhone] = useState<string>("+905551234567");
  const [donorEmail, setDonorEmail] = useState<string>("bagisci@ezanvakfi.org");
  const [kvkkConsent, setKvkkConsent] = useState<boolean>(false);
  const [readNamesAloudConsent, setReadNamesAloudConsent] = useState<boolean>(false);
  const [extraAmountTry, setExtraAmountTry] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [createdOrder, setCreatedOrder] = useState<any>(null);

  const handleShareCountChange = (count: number) => {
    const maxAllowed = Math.min(7, Math.max(1, activeOffer?.remainingShares || 1));
    const safeCount = Math.min(maxAllowed, Math.max(1, count));
    setShareCount(safeCount);
    setShareOwners((prev) => {
      const next = [...prev];
      while (next.length < safeCount) next.push(donorOwnName || "");
      return next.slice(0, safeCount);
    });
    setShareIntentions((prev) => {
      const next = [...prev];
      while (next.length < safeCount) next.push("vacip");
      return next.slice(0, safeCount);
    });
  };

  const applyMyOwnNameToAll = () => {
    const nameToUse = donorOwnName.trim() || "Ahmet Yılmaz";
    setDonorOwnName(nameToUse);
    setShareOwners(Array.from({ length: shareCount }, () => nameToUse));
  };

  // Agar salesCloseAt o'tgan bo'lsa: "Bu yilgi qabul yakunlandi" va keyingi yil kutish ro'yxati
  if (catalog.salesClosed) {
    return (
      <Card className="space-y-4 border-2 border-amber-300" data-testid="kurban-sales-closed">
        <Badge tone="warning">{catalog.seasonYear}</Badge>
        <h2 className="text-2xl font-heading font-extrabold text-brand">{t.salesClosedTitle}</h2>
        <p className="text-sm text-slate-700">{t.salesClosedDesc}</p>
        <form action="/api/contact" method="POST" className="space-y-3 pt-3 border-t border-slate-200">
          <input type="hidden" name="kind" value="qurban_notify" />
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="cf-turnstile-response" value="dev-turnstile-ok" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="waitlist-phone" className="block text-xs font-bold text-brand mb-1">
                {t.phoneLabel}
              </label>
              <input
                id="waitlist-phone"
                name="phone"
                type="tel"
                required
                placeholder="+90 5XX XXX XX XX"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="waitlist-email" className="block text-xs font-bold text-brand mb-1">
                {t.emailLabel}
              </label>
              <input
                id="waitlist-email"
                name="email"
                type="email"
                placeholder="ornek@alanadi.com"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-accent text-brand font-bold text-sm hover:bg-accent-hover"
          >
            {t.waitlistBtn}
          </button>
        </form>
      </Card>
    );
  }

  // Agar hali birorta davlatga narx va kvota kiritilmagan bo'lsa ([TASLIK] holati)
  if (!catalog.salesOpen || catalog.countries.length === 0) {
    return (
      <Card className="space-y-4" data-testid="kurban-taslik-waitlist">
        <Badge tone="warning">Kurban {catalog.seasonYear}</Badge>
        <h2 className="text-2xl font-heading font-extrabold text-brand">{t.noActiveOffersTitle}</h2>
        <p className="text-sm text-slate-700">{t.noActiveOffersDesc}</p>
        <form action="/api/contact" method="POST" className="space-y-3 pt-3 border-t border-slate-200">
          <input type="hidden" name="kind" value="qurban_notify" />
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="cf-turnstile-response" value="dev-turnstile-ok" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="taslik-phone" className="block text-xs font-bold text-brand mb-1">
                {t.phoneLabel}
              </label>
              <input
                id="taslik-phone"
                name="phone"
                type="tel"
                required
                placeholder="+90 5XX XXX XX XX"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="taslik-email" className="block text-xs font-bold text-brand mb-1">
                {t.emailLabel}
              </label>
              <input
                id="taslik-email"
                name="email"
                type="email"
                placeholder="ornek@alanadi.com"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-accent text-brand font-bold text-sm hover:bg-accent-hover"
          >
            {t.waitlistBtn}
          </button>
        </form>
      </Card>
    );
  }

  const unitPrice = activeOffer?.pricePerShareTry || 0;
  const kurbanTotalTry = unitPrice * shareCount;
  const grandTotalTry = kurbanTotalTry + (Number(extraAmountTry) > 0 ? Number(extraAmountTry) : 0);

  const submitKurbanOrder = async () => {
    setErrorMsg("");
    setSubmitting(true);
    try {
      const sharesPayload = shareOwners.map((name, i) => ({
        ownerName: name.trim(),
        intentionType: shareIntentions[i] || "vacip"
      }));

      const res = await fetch("/api/kurban/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          offerId: activeOffer?.id,
          shares: sharesPayload,
          vekaletAccepted,
          readNamesAloudConsent,
          kvkkConsent,
          donor: {
            name: donorOwnName.trim() || sharesPayload[0]?.ownerName || "Bağışçı",
            phone: donorPhone.trim(),
            email: donorEmail.trim() || undefined
          },
          extraCartItems:
            Number(extraAmountTry) > 0
              ? [{ campaignSlug: "mezana-akademisi-egitim-bursu", amountTry: Number(extraAmountTry) }]
              : [],
          turnstileToken: "dev-turnstile-ok"
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Order error");
        setSubmitting(false);
        return;
      }

      setCreatedOrder(data);
      setStep(8);
    } catch (err: any) {
      setErrorMsg(err?.message || "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitles = [t.step1, t.step2, t.step3, t.step4, t.step5, t.step6, t.step7, t.step8];

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid={`kurban-flow-step-${step}`}>
      {/* Qadamlar indikator paneli */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5" role="navigation" aria-label="Kurban steps">
        {stepTitles.map((label, idx) => {
          const sNum = idx + 1;
          const active = sNum === step;
          const done = sNum < step;
          return (
            <button
              key={sNum}
              type="button"
              disabled={sNum > step}
              onClick={() => sNum < step && setStep(sNum)}
              data-testid={`kurban-step-pill-${sNum}`}
              className={`px-2 py-2 rounded-lg text-xs font-bold border text-center transition ${
                active
                  ? "bg-brand text-white border-brand"
                  : done
                    ? "bg-emerald-50 text-emerald-950 border-emerald-300"
                    : "bg-slate-100 text-slate-700 border-slate-200"
              }`}
            >
              {sNum}/8
            </button>
          );
        })}
      </div>

      <Card className="space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 className="text-xl font-heading font-extrabold text-brand">{stepTitles[step - 1]}</h2>
          {step > 1 && step < 8 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              data-testid="kurban-back-btn"
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-brand hover:bg-slate-100"
            >
              {t.backBtn}
            </button>
          )}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-xs font-bold text-red-900" role="alert">
            {errorMsg}
          </div>
        )}

        {/* 1-QADAM: DAVLAT TANLASH */}
        {step === 1 && (
          <div className="space-y-4" data-testid="step-1-countries">
            <div className="grid grid-cols-1 gap-4">
              {catalog.countries.map((c) => {
                const isSelected = c.code === selectedCountry?.code;
                return (
                  <div
                    key={c.code}
                    onClick={() => {
                      setSelectedCountryCode(c.code);
                      if (c.offers[0]) setSelectedOfferId(c.offers[0].id);
                    }}
                    data-testid={`country-card-${c.code}`}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition ${
                      isSelected ? "border-brand bg-emerald-50/40" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl" aria-hidden="true">
                          {c.flag}
                        </span>
                        <h3 className="text-lg font-heading font-bold text-brand">{c.name}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone="warning">
                          {t.remainingBadge.replace("{n}", String(c.totalRemainingShares))}
                        </Badge>
                        <span className="font-extrabold text-brand text-base">
                          {c.minPriceTry.toLocaleString("tr-TR")} TRY
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 mt-2">{c.description}</p>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              data-testid="step-1-next"
              className="w-full py-3 rounded-xl bg-accent text-brand font-extrabold text-sm hover:bg-accent-hover"
            >
              {t.nextBtn}
            </button>
          </div>
        )}

        {/* 2-QADAM: HAYVON TURI VA HISSE SONI */}
        {step === 2 && selectedCountry && (
          <div className="space-y-4" data-testid="step-2-animal">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selectedCountry.offers.map((off) => {
                const selected = off.id === activeOffer?.id;
                const label = off.sharesPerAnimal === 1 ? t.sheepLabel : t.cattleLabel;
                return (
                  <button
                    key={off.id}
                    type="button"
                    onClick={() => {
                      setSelectedOfferId(off.id);
                      handleShareCountChange(1);
                    }}
                    data-testid={`offer-type-${off.animalType}`}
                    className={`p-4 rounded-xl border-2 text-start transition ${
                      selected ? "border-brand bg-emerald-50/50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="font-bold text-brand text-sm">{label}</div>
                    <div className="text-lg font-extrabold text-brand mt-1">
                      {off.pricePerShareTry.toLocaleString("tr-TR")} TRY / hisse
                    </div>
                    <div className="text-xs text-slate-700 mt-1">
                      {t.remainingBadge.replace("{n}", String(off.remainingShares))}
                    </div>
                  </button>
                );
              })}
            </div>

            <div>
              <label htmlFor="kurban-share-count" className="block text-xs font-bold text-brand mb-1">
                {t.shareCountLabel} (Max: {Math.min(7, activeOffer?.remainingShares || 1)})
              </label>
              <input
                id="kurban-share-count"
                data-testid="share-count-input"
                type="number"
                min={1}
                max={Math.min(7, activeOffer?.remainingShares || 1)}
                value={shareCount}
                onChange={(e) => handleShareCountChange(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-bold text-brand"
              />
            </div>

            <button
              type="button"
              onClick={() => setStep(3)}
              data-testid="step-2-next"
              className="w-full py-3 rounded-xl bg-accent text-brand font-extrabold text-sm hover:bg-accent-hover"
            >
              {t.nextBtn}
            </button>
          </div>
        )}

        {/* 3-QADAM: KIM NOMIDAN (ISM 2-80 BELGI + "O'ZIM NOMIMGA") */}
        {step === 3 && (
          <div className="space-y-4" data-testid="step-3-owners">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex-1">
                <label htmlFor="donor-own-name" className="block text-xs font-bold text-brand mb-1">
                  {t.myOwnNameBtn}
                </label>
                <input
                  id="donor-own-name"
                  data-testid="donor-own-name-input"
                  type="text"
                  minLength={2}
                  maxLength={80}
                  value={donorOwnName}
                  onChange={(e) => setDonorOwnName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={applyMyOwnNameToAll}
                data-testid="fill-own-name-btn"
                className="px-4 py-2 rounded-xl bg-brand text-white font-bold text-xs"
              >
                {t.myOwnNameBtn}
              </button>
            </div>

            <div className="space-y-3">
              {shareOwners.map((owner, idx) => (
                <div key={idx}>
                  <label htmlFor={`share-owner-${idx}`} className="block text-xs font-bold text-brand mb-1">
                    Hisse #{idx + 1} — {t.ownerPlaceholder}
                  </label>
                  <input
                    id={`share-owner-${idx}`}
                    data-testid={`share-owner-input-${idx}`}
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={owner}
                    onChange={(e) => {
                      const next = [...shareOwners];
                      next[idx] = e.target.value;
                      setShareOwners(next);
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                const invalid = shareOwners.some((n) => n.trim().length < 2 || n.trim().length > 80);
                if (invalid) {
                  setErrorMsg("Har bir hisse egasining ismi 2–80 belgi bo'lishi kerak.");
                  return;
                }
                setErrorMsg("");
                setStep(4);
              }}
              data-testid="step-3-next"
              className="w-full py-3 rounded-xl bg-accent text-brand font-extrabold text-sm hover:bg-accent-hover"
            >
              {t.nextBtn}
            </button>
          </div>
        )}

        {/* 4-QADAM: NIYAT TURI (STANDART: VACIP) */}
        {step === 4 && (
          <div className="space-y-4" data-testid="step-4-intentions">
            {shareOwners.map((owner, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <label htmlFor={`share-intention-${idx}`} className="block text-xs font-bold text-brand mb-1.5">
                  Hisse #{idx + 1} ({owner}) — {t.step4}
                </label>
                <select
                  id={`share-intention-${idx}`}
                  data-testid={`share-intention-select-${idx}`}
                  value={shareIntentions[idx] || "vacip"}
                  onChange={(e) => {
                    const next = [...shareIntentions];
                    next[idx] = e.target.value;
                    setShareIntentions(next);
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-bold text-brand bg-white"
                >
                  {catalog.intentionTypes.map((it) => (
                    <option key={it.code} value={it.code}>
                      {it.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setStep(5)}
              data-testid="step-4-next"
              className="w-full py-3 rounded-xl bg-accent text-brand font-extrabold text-sm hover:bg-accent-hover"
            >
              {t.nextBtn}
            </button>
          </div>
        )}

        {/* 5-QADAM: VEKALET (OLDINDAN BELGILANMAGAN CHECKBOX) */}
        {step === 5 && (
          <div className="space-y-4" data-testid="step-5-vekalet">
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950">{t.vekaletTitle}</span>
                <span className="text-xs font-mono text-amber-900">{catalog.vekaletVersion}</span>
              </div>
              <p className="text-sm text-slate-900 leading-relaxed font-medium" data-testid="vekalet-text">
                {catalog.vekaletText}
              </p>
            </div>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-300 cursor-pointer">
              <input
                type="checkbox"
                data-testid="vekalet-checkbox"
                checked={vekaletAccepted}
                onChange={(e) => setVekaletAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-400"
              />
              <span className="text-sm font-bold text-brand">{t.vekaletCheck}</span>
            </label>

            <button
              type="button"
              onClick={() => {
                if (!vekaletAccepted) {
                  setErrorMsg("Davom etish uchun vekalet roziligini belgilang.");
                  return;
                }
                setErrorMsg("");
                setStep(6);
              }}
              data-testid="step-5-next"
              className="w-full py-3 rounded-xl bg-accent text-brand font-extrabold text-sm hover:bg-accent-hover"
            >
              {t.nextBtn}
            </button>
          </div>
        )}

        {/* 6-QADAM: KONTAKT + KVKK + "ISMLAR VIDEODA OVOZ CHIQARIB O'QILADI" */}
        {step === 6 && (
          <div className="space-y-4" data-testid="step-6-contact">
            <div>
              <label htmlFor="kurban-phone" className="block text-xs font-bold text-brand mb-1">
                {t.phoneLabel}
              </label>
              <input
                id="kurban-phone"
                data-testid="kurban-phone-input"
                type="tel"
                required
                value={donorPhone}
                onChange={(e) => setDonorPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="kurban-email" className="block text-xs font-bold text-brand mb-1">
                {t.emailLabel}
              </label>
              <input
                id="kurban-email"
                data-testid="kurban-email-input"
                type="email"
                value={donorEmail}
                onChange={(e) => setDonorEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
              />
            </div>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-300 cursor-pointer">
              <input
                type="checkbox"
                data-testid="kurban-kvkk-checkbox"
                checked={kvkkConsent}
                onChange={(e) => setKvkkConsent(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span className="text-xs font-bold text-brand">{t.kvkkCheck}</span>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-300 cursor-pointer">
              <input
                type="checkbox"
                data-testid="kurban-read-aloud-checkbox"
                checked={readNamesAloudConsent}
                onChange={(e) => setReadNamesAloudConsent(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span className="text-xs font-bold text-brand">{t.readAloudCheck}</span>
            </label>

            <button
              type="button"
              onClick={() => {
                if (!kvkkConsent || !readNamesAloudConsent || donorPhone.trim().length < 8) {
                  setErrorMsg("Telefon raqam, KVKK va ovoz chiqarib o'qish roziligi majburiy.");
                  return;
                }
                setErrorMsg("");
                setStep(7);
              }}
              data-testid="step-6-next"
              className="w-full py-3 rounded-xl bg-accent text-brand font-extrabold text-sm hover:bg-accent-hover"
            >
              {t.nextBtn}
            </button>
          </div>
        )}

        {/* 7-QADAM: SAVATCHA VA TO'LOV */}
        {step === 7 && (
          <div className="space-y-4" data-testid="step-7-checkout">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-700">Ülke / Davlat:</span>
                <strong className="text-brand">{selectedCountry?.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700">Hisse Adedi:</span>
                <strong className="text-brand">{shareCount} hisse</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700">Kurban Tutarı:</span>
                <strong className="text-brand">{kurbanTotalTry.toLocaleString("tr-TR")} TRY</strong>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-base">
                <span className="font-bold text-brand">Toplam (Server):</span>
                <strong className="font-extrabold text-brand" data-testid="kurban-grand-total">
                  {grandTotalTry.toLocaleString("tr-TR")} TRY
                </strong>
              </div>
            </div>

            <div>
              <label htmlFor="extra-cart-donation" className="block text-xs font-bold text-brand mb-1">
                {t.extraDonationLabel}
              </label>
              <input
                id="extra-cart-donation"
                type="number"
                min={0}
                step={50}
                value={extraAmountTry}
                onChange={(e) => setExtraAmountTry(Number(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>

            <p className="text-xs text-slate-600">{t.serverPriceNote}</p>

            <button
              type="button"
              disabled={submitting}
              onClick={submitKurbanOrder}
              data-testid="step-7-pay-btn"
              className="w-full py-3.5 rounded-xl bg-accent text-brand font-extrabold text-sm hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "..." : t.payBtn}
            </button>
          </div>
        )}

        {/* 8-QADAM: TASDIQ VA KUZATUV HAVOLASI */}
        {step === 8 && createdOrder && (
          <div className="space-y-4 text-center" data-testid="step-8-confirmation">
            <Badge tone="success">{createdOrder.order.orderNo}</Badge>
            <h3 className="text-2xl font-heading font-extrabold text-brand">{t.thanksTitle}</h3>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-start text-sm space-y-1.5">
              <div>
                <strong>Sipariş No:</strong>{" "}
                <span className="font-mono font-bold text-brand" data-testid="confirmed-order-no">
                  {createdOrder.order.orderNo}
                </span>
              </div>
              <div>
                <strong>Kayıt No:</strong>{" "}
                <span className="font-mono text-brand">{createdOrder.donation.public_no}</span>
              </div>
              <div>
                <strong>Toplam Tutar:</strong>{" "}
                {Number(createdOrder.order.grandTotalTry).toLocaleString("tr-TR")} TRY
              </div>
            </div>
            <Link
              href={`/${locale}/kurban/takip/${createdOrder.order.primaryTrackingToken}`}
              data-testid="open-tracking-page-link"
              className="inline-block w-full py-3.5 px-6 rounded-xl bg-brand text-white font-extrabold text-sm hover:opacity-95"
            >
              {t.trackingLinkBtn}
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
