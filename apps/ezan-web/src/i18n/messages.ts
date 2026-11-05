import { Locale } from "./country-locale";

export type RouteKey =
  | "home"
  | "about"
  | "projects"
  | "campaigns"
  | "donate"
  | "zakat"
  | "transparency"
  | "media"
  | "contact"
  | "qurban"
  | "legal_kvkk"
  | "legal_cookies"
  | "legal_terms"
  | "legal_refund"
  | "cart"
  | "thanks";

export const ROUTE_SLUGS: Record<RouteKey, Record<Locale, string>> = {
  home: { tr: "", uz: "", en: "", ar: "" },
  about: { tr: "hakkimizda", uz: "haqimizda", en: "about", ar: "about" },
  projects: { tr: "faaliyetler", uz: "faoliyat", en: "projects", ar: "projects" },
  campaigns: { tr: "kampanyalar", uz: "kampaniyalar", en: "campaigns", ar: "campaigns" },
  donate: { tr: "bagis", uz: "xayriya", en: "donate", ar: "donate" },
  zakat: { tr: "zekat-hesaplama", uz: "zakot-kalkulyatori", en: "zakat-calculator", ar: "zakat-calculator" },
  transparency: { tr: "seffaflik", uz: "shaffoflik", en: "transparency", ar: "transparency" },
  media: { tr: "medya", uz: "media", en: "media", ar: "media" },
  contact: { tr: "iletisim", uz: "aloqa", en: "contact", ar: "contact" },
  qurban: { tr: "kurban", uz: "qurbonlik", en: "qurban", ar: "qurban" },
  legal_kvkk: { tr: "kvkk", uz: "kvkk", en: "kvkk", ar: "kvkk" },
  legal_cookies: { tr: "cerez-politikasi", uz: "cookie-siyosati", en: "cookie-policy", ar: "cookie-policy" },
  legal_terms: { tr: "bagis-sartlari", uz: "xayriya-shartlari", en: "donation-terms", ar: "donation-terms" },
  legal_refund: { tr: "iade-politikasi", uz: "qaytarish-siyosati", en: "refund-policy", ar: "refund-policy" },
  cart: { tr: "sepet", uz: "savatcha", en: "cart", ar: "cart" },
  thanks: { tr: "tesekkurler", uz: "rahmat", en: "thank-you", ar: "thank-you" }
};

export function resolveRouteKeyFromSlug(slug: string): RouteKey | null {
  const clean = (slug || "").replace(/^\/+|\/+$/g, "");
  if (!clean) return "home";
  for (const [key, map] of Object.entries(ROUTE_SLUGS) as [RouteKey, Record<Locale, string>][]) {
    if (Object.values(map).includes(clean)) {
      return key;
    }
  }
  return null;
}

export function getTranslatedPath(currentPath: string, targetLocale: Locale): { path: string; fallback: boolean } {
  const clean = (currentPath || "/").split("?")[0] || "/";
  const segments = clean.split("/").filter(Boolean);
  const withoutLocale = segments.slice(1);
  if (withoutLocale.length === 0) {
    return { path: `/${targetLocale}`, fallback: false };
  }
  const firstSlug = withoutLocale[0] || "";
  const routeKey = resolveRouteKeyFromSlug(firstSlug);
  if (routeKey) {
    const targetSlug = ROUTE_SLUGS[routeKey][targetLocale];
    const rest = withoutLocale.slice(1).join("/");
    const tail = rest ? `/${rest}` : "";
    return {
      path: targetSlug ? `/${targetLocale}/${targetSlug}${tail}` : `/${targetLocale}${tail}`,
      fallback: false
    };
  }
  return { path: `/${targetLocale}`, fallback: true };
}

export const UI_DICTIONARY: Record<Locale, Record<string, string>> = {
  tr: {
    siteName: "Ezan Vakfı",
    tagline: "İlim, Eğitim ve İnsani Yardım Vakfı",
    sandboxBanner: "Deneme Modu (Sandbox) — Gerçek ödeme alınmamaktadır (DONATIONS_LIVE=false)",
    navAbout: "Biz Kimiz",
    navActivities: "Faaliyetler",
    navDonate: "Bağış Yap",
    navTransparency: "Şeffaflık",
    navMedia: "Medya",
    navContact: "İletişim",
    navZakat: "Zekât Hesaplama",
    navQurban: "Kurban",
    donateNow: "Bağış Yap",
    cartTitle: "Bağış Sepeti",
    quickDonateTitle: "Hızlı Bağış",
    quickDonateSubtitle: "Bir dokunuşla hayra ortak olun",
    activeCampaigns: "Aktif Kampanyalar",
    ourProjects: "Projelerimiz ve Faaliyet Alanlarımız",
    latestNews: "Vakıftan Haberler",
    videoSection: "Videolar ve Tanıtım",
    transparencySection: "Şeffaflık ve Hesap Verebilirlik",
    followUs: "Bizi Takip Edin",
    donateOneTime: "Tek Seferlik",
    donateMonthly: "Aylık Düzenli",
    customAmount: "Diğer Tutar (TRY)",
    addToCart: "Sepete Ekle",
    proceedToCheckout: "Ödemeye Geç",
    donorInfo: "Bağışçı Bilgileri",
    anonymousDonor: "İsmim görünmesin (Anonim Bağışçı)",
    fullName: "Ad Soyad / Kurum Adı",
    phone: "Telefon Numarası",
    email: "E-posta Adresi",
    requestReceipt: "Bağış Alındı Belgesi (PDF) e-posta ile gönderilsin",
    kvkkConsent: "KVKK Aydınlatma Metni'ni okudum, kişisel verilerimin bağış süreçleri için işlenmesini kabul ediyorum.",
    payWithIyzico: "3D Secure ile Güvenli Ödeme Yap",
    zakatCalcTitle: "Zekât Hesaplama Aracı",
    zakatRuleNote: "Diyanet tavsiyesine göre (85g altın nisap, %2.5 oran) [TASLIK]",
    payZakatBtn: "Zekâtı Bağışla",
    qurbanSoonTitle: "Kurban Bağışı (2. Aşamada Açılacak)",
    qurbanNotifyBtn: "Açıldığında Haber Ver",
    cookieBannerText: "Sitemizde dil tercihi ve bağış sepeti için zorunlu çerezler kullanılmaktadır. Analitik çerezler yalnızca onayınızla yüklenir.",
    cookieAcceptAll: "Tümünü Kabul Et",
    cookieEssentialOnly: "Yalnızca Zorunlu Çerezler",
    bankAccountsTitle: "Banka Hesap Numaralarımız (EFT / Havale)",
    footerRights: "Tüm hakları saklıdır.",
    translationMissingNotice: "Aradığınız sayfanın bu dildeki çevirisi henüz hazır değil, ana sayfaya yönlendirildiniz.",
    notFoundTitle: "Sayfa Bulunamadı (404)",
    notFoundDesc: "Aradığınız sayfa taşınmış veya kaldırılmış olabilir.",
    serverErrorTitle: "Geçici Sistem Hatası (500)"
  },
  uz: {
    siteName: "Azon Vaqfi (Ezan Vakfı)",
    tagline: "Ilm-ma'rifat, ta'lim va ijtimoiy ko'mak vaqfi",
    sandboxBanner: "Sinov rejimi (Sandbox) — Haqiqiy to'lov yechilmaydi (DONATIONS_LIVE=false)",
    navAbout: "Biz kimiz",
    navActivities: "Faoliyat",
    navDonate: "Xayriya qilish",
    navTransparency: "Shaffoflik",
    navMedia: "Media",
    navContact: "Aloqa",
    navZakat: "Zakot kalkulyatori",
    navQurban: "Qurbonlik",
    donateNow: "Xayriya qilish",
    cartTitle: "Xayriya savatchasi",
    quickDonateTitle: "Tez xayriya",
    quickDonateSubtitle: "Bir bosishda ezgulikka hissa qo'shing",
    activeCampaigns: "Faol kampaniyalar",
    ourProjects: "Loyihalar va faoliyat yo'nalishlari",
    latestNews: "Vaqf yangiliklari",
    videoSection: "Videolar va lavhalar",
    transparencySection: "Shaffoflik va hisobdorlik",
    followUs: "Bizni kuzating",
    donateOneTime: "Bir martalik",
    donateMonthly: "Oylik doimiy",
    customAmount: "Boshqa summa (TRY)",
    addToCart: "Savatchaga qo'shish",
    proceedToCheckout: "To'lovga o'tish",
    donorInfo: "Xayriyachi ma'lumotlari",
    anonymousDonor: "Ismim ko'rinmasin (Anonim xayriyachi)",
    fullName: "F.I.Sh yoki tashkilot nomi",
    phone: "Telefon raqami",
    email: "E-pochta manzili",
    requestReceipt: "Bağış Alındı Belgesi (PDF kvitansiya) e-pochtaga yuborilsin",
    kvkkConsent: "KVKK ma'lumotnomasini o'qidim va shaxsiy ma'lumotlarim qayta ishlanishiga roziman.",
    payWithIyzico: "3D Secure orqali xavfsiz to'lash",
    zakatCalcTitle: "Zakot kalkulyatori",
    zakatRuleNote: "Diyanet tavsiyasi bo'yicha (nisob 85 g oltin, 2.5%) [TASLIK]",
    payZakatBtn: "Zakotni to'lash",
    qurbanSoonTitle: "Qurbonlik xayriyasi (2-bosqichda ishga tushadi)",
    qurbanNotifyBtn: "Ochilganda xabar bering",
    cookieBannerText: "Saytimizda til va savatcha uchun zarur cookie'lar ishlatiladi. Analitika faqat roziligingizdan so'ng yoqiladi.",
    cookieAcceptAll: "Barchasini qabul qilish",
    cookieEssentialOnly: "Faqat zarur cookie'lar",
    bankAccountsTitle: "Bank rekvizitlarimiz (IBAN)",
    footerRights: "Barcha huquqlar himoyalangan.",
    translationMissingNotice: "Ushbu sahifaning tanlangan tildagi tarjimasi topilmadi, bosh sahifaga yo'naltirildingiz.",
    notFoundTitle: "Sahifa topilmadi (404)",
    notFoundDesc: "Siz qidirgan sahifa ko'chirilgan yoki mavjud emas.",
    serverErrorTitle: "Serverda vaqtinchalik xatolik (500)"
  },
  en: {
    siteName: "Ezan Foundation",
    tagline: "Endowment for Knowledge, Education & Humanitarian Aid",
    sandboxBanner: "Sandbox Test Mode — No real payments are charged (DONATIONS_LIVE=false)",
    navAbout: "Who We Are",
    navActivities: "Activities",
    navDonate: "Donate",
    navTransparency: "Transparency",
    navMedia: "Media",
    navContact: "Contact",
    navZakat: "Zakat Calculator",
    navQurban: "Qurban",
    donateNow: "Donate Now",
    cartTitle: "Donation Cart",
    quickDonateTitle: "Quick Donation",
    quickDonateSubtitle: "Support education and charitable works in one click",
    activeCampaigns: "Active Campaigns",
    ourProjects: "Our Projects & Programs",
    latestNews: "Latest News",
    videoSection: "Videos & Stories",
    transparencySection: "Transparency & Accountability",
    followUs: "Follow Us",
    donateOneTime: "One-Time",
    donateMonthly: "Monthly Recurring",
    customAmount: "Custom Amount (TRY)",
    addToCart: "Add to Cart",
    proceedToCheckout: "Proceed to Payment",
    donorInfo: "Donor Information",
    anonymousDonor: "Make my donation anonymous",
    fullName: "Full Name / Organization",
    phone: "Phone Number",
    email: "Email Address",
    requestReceipt: "Send Donation Receipt PDF (Bağış Alındı Belgesi) via email",
    kvkkConsent: "I have read the KVKK Privacy Notice and consent to the processing of my personal data.",
    payWithIyzico: "Pay Securely with 3D Secure",
    zakatCalcTitle: "Zakat Calculator",
    zakatRuleNote: "According to Diyanet guidelines (Nisab 85g gold, 2.5% rate) [TASLIK]",
    payZakatBtn: "Pay Zakat Now",
    qurbanSoonTitle: "Qurban Campaign (Coming in Phase 2)",
    qurbanNotifyBtn: "Notify Me When Open",
    cookieBannerText: "We use essential cookies for language and donation cart. Analytics cookies are only loaded with your consent.",
    cookieAcceptAll: "Accept All",
    cookieEssentialOnly: "Essential Only",
    bankAccountsTitle: "Bank Transfer Details (IBAN)",
    footerRights: "All rights reserved.",
    translationMissingNotice: "Translation for that page is not available yet; redirected to the home page.",
    notFoundTitle: "Page Not Found (404)",
    notFoundDesc: "The page you are looking for might have been moved or removed.",
    serverErrorTitle: "Server Error (500)"
  },
  ar: {
    siteName: "وقف الأذان (Ezan Vakfı)",
    tagline: "وقف العلم والتعليم والتكافل الاجتماعي",
    sandboxBanner: "وضع التجربة (Sandbox) — لا يتم خصم مبالغ حقيقية (DONATIONS_LIVE=false)",
    navAbout: "من نحن",
    navActivities: "أنشطتنا",
    navDonate: "تبرع الآن",
    navTransparency: "الشفافية",
    navMedia: "الإعلام",
    navContact: "اتصل بنا",
    navZakat: "حاسبة الزكاة",
    navQurban: "الأضاحي",
    donateNow: "تبرع الآن",
    cartTitle: "سلة التبرعات",
    quickDonateTitle: "تبرع سريع",
    quickDonateSubtitle: "ساهم في نشر العلم والخير بضغطة واحدة",
    activeCampaigns: "الحملات النشطة",
    ourProjects: "مشاريعنا ومجالات عملنا",
    latestNews: "أخبار الوقف",
    videoSection: "الفيديوهات والتقارير المرئية",
    transparencySection: "الشفافية والتقارير المالية",
    followUs: "تابعنا على منصات التواصل",
    donateOneTime: "تبرع لمرة واحدة",
    donateMonthly: "تبرع شهري مستمر",
    customAmount: "مبلغ آخر (ليرة تركية TRY)",
    addToCart: "أضف إلى السلة",
    proceedToCheckout: "المتابعة للدفع",
    donorInfo: "بيانات المتبرع",
    anonymousDonor: "تبرع كفاعل خير (بدون إظهار الاسم)",
    fullName: "الاسم الكامل / المؤسسة",
    phone: "رقم الهاتف",
    email: "البريد الإلكتروني",
    requestReceipt: "إرسال إيصال استلام التبرع (PDF) عبر البريد الإلكتروني",
    kvkkConsent: "لقد قرأت إشعار حماية البيانات الشخصية (KVKK) وأوافق على معالجة بياناتي لإتمام التبرع.",
    payWithIyzico: "الدفع الآمن عبر 3D Secure",
    zakatCalcTitle: "حاسبة الزكاة الشرعية",
    zakatRuleNote: "وفق توصيات رئاسة الشؤون الدينية التركية (النصاب 85 غرام ذهب، النسبة 2.5%) [TASLIK]",
    payZakatBtn: "إخراج الزكاة الآن",
    qurbanSoonTitle: "مشروع الأضاحي (سيتم افتتاحه في المرحلة الثانية)",
    qurbanNotifyBtn: "أعلمني عند الافتتاح",
    cookieBannerText: "نستخدم ملفات تعريف الارتباط الضرورية لحفظ اللغة وسلة التبرع. لا يتم تفعيل التحليلات إلا بموافقتك.",
    cookieAcceptAll: "قبول الكل",
    cookieEssentialOnly: "الضرورية فقط",
    bankAccountsTitle: "الحسابات البنكية للوقف (IBAN)",
    footerRights: "جميع الحقوق محفوظة.",
    translationMissingNotice: "الترجمة لهذه الصفحة غير متوفرة حالياً، تم توجيهك إلى الصفحة الرئيسية.",
    notFoundTitle: "الصفحة غير موجودة (404)",
    notFoundDesc: "الصفحة التي تبحث عنها غير متوفرة أو تم نقلها.",
    serverErrorTitle: "خطأ في الخادم (500)"
  }
};