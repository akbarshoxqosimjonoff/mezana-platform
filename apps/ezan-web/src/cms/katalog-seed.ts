import fs from "node:fs";
import path from "node:path";
import { ensureSchema, dbQuery } from "../db/schema";
import type { Locale } from "../i18n/country-locale";
import {
  OLD_SITE_SETTINGS,
  OLD_SITE_TEAM,
  OLD_SITE_NEWS,
  OLD_SITE_VIDEOS,
  OLD_SITE_FAQS
} from "./old-site-content";

export interface CatalogQuoteItem {
  id: string;
  type: "hadith" | "ayah" | "quote";
  sourceTr: string;
  targetPages: string[];
  arabicOriginal: string | null;
  text: Record<Locale, string>;
  needsReview: Record<Locale, boolean>;
}

export const CATALOG_HADITHS_AND_QUOTES: CatalogQuoteItem[] = [
  {
    id: "amel-defteri-sadaka-i-cariye",
    type: "hadith",
    sourceTr: "İmam-ı Müslim",
    targetPages: ["home", "hakkimizda"],
    arabicOriginal: null,
    text: {
      tr: "İnsan öldüğünde amel defteri kapanır ancak şu üç şey bunun dışındadır: Faydası devam eden sadaka, istifade edilmeye devam eden ilim ve anne-babasına dua eden hayırlı evlat.",
      uz: "Inson vafot etganda amal daftari yopiladi, biroq uch narsa bundan mustasno: foydasi davom etuvchi sadaqai joriya, manfaat olinadigan ilm va ota-onasiga duo qiluvchi solih farzand.",
      en: "When a person dies, their deeds come to an end except for three: ongoing charity, beneficial knowledge, or a righteous child who prays for them.",
      ar: "إذا مات الإنسان انقطع عمله إلا من ثلاثة: صدقة جارية، أو علم ينتفع به، أو ولد صالح يدعو له."
    },
    needsReview: { tr: false, uz: true, en: true, ar: true }
  },
  {
    id: "vakfedilen-sey-satilmaz",
    type: "hadith",
    sourceTr: "İmam-ı Buhârî – İmam-ı Müslim",
    targetPages: ["hakkimizda", "hakkimizda/vakif-nedir"],
    arabicOriginal: null,
    text: {
      tr: "Onun aslı satılmaz, miras olarak bırakılmaz ve hediye edilmez.",
      uz: "Vaqf qilingan mulkning asli sotilmaydi, meros qoldirilmaydi va hadya etilmaydi.",
      en: "Its principal is neither sold, nor inherited, nor given away as a gift.",
      ar: "لا يباع أصلها ولا يوهب ولا يورث."
    },
    needsReview: { tr: false, uz: true, en: true, ar: true }
  },
  {
    id: "sizin-en-hayirliniz-kuran",
    type: "hadith",
    sourceTr: "Hz. Muhammed (s.a.s.)",
    targetPages: ["projeler/kuran-kursu"],
    arabicOriginal: null,
    text: {
      tr: "Sizin en hayırlınız, Kur'an'ı öğrenen ve öğretendir.",
      uz: "Sizlarning eng yaxshingiz Qur'onni o'rgangan va uni boshqalarga o'rgatganingizdir.",
      en: "The best among you are those who learn the Qur'an and teach it.",
      ar: "خيركم من تعلم القرآن وعلمه."
    },
    needsReview: { tr: false, uz: true, en: true, ar: true }
  },
  {
    id: "ilim-yolculugu-allah-yolunda",
    type: "hadith",
    sourceTr: "Tirmizî, İlim 2",
    targetPages: ["projeler/talebe-yurdu"],
    arabicOriginal: null,
    text: {
      tr: "İlim tahsil etmek için yolculuğa çıkan kimse, evine dönünceye kadar Allah yolundadır.",
      uz: "Ilm tahsil qilish uchun safarga chiqqan kishi uyiga qaytgunicha Alloh yo'lidadir.",
      en: "Whoever sets out seeking knowledge is in the path of Allah until they return.",
      ar: "من خرج في طلب العلم فهو في سبيل الله حتى يرجع."
    },
    needsReview: { tr: false, uz: true, en: true, ar: true }
  },
  {
    id: "teblig-edenin-yuzu-ak-olsun",
    type: "hadith",
    sourceTr: "Tirmizî, İlim 5; İbn Mâce, Mukaddime 1, 18",
    targetPages: ["projeler/yayincilik"],
    arabicOriginal: null,
    text: {
      tr: "Allah, bizden herhangi bir şeyi işiten ve işittiği gibi de tebliğ edip başkalarına aktaran kişinin yüzünü ak etsin. Çünkü tebliğ edilen kişi, benden işiterek tebliğ edenden daha anlayışlı ve kavrayışlı olabilir.",
      uz: "Bizdan biror so'zni eshitib, uni eshitganidek boshqalarga yetkazgan kishining yuzini Alloh yorug' qilsin. Zero yetkazilgan kishi eshitib yetkazuvchidan ko'ra fahmliroq bo'lishi mumkin.",
      en: "May Allah brighten the face of the one who hears something from us and conveys it just as they heard it; for perhaps the one to whom it is conveyed understands it better than the hearer.",
      ar: "نضر الله امرأ سمع منا حديثا فبلغه كما سمعه، فرب مبلغ أوعى من سامع."
    },
    needsReview: { tr: false, uz: true, en: true, ar: true }
  },
  {
    id: "bakara-215-hayir",
    type: "ayah",
    sourceTr: "Bakara 2/215",
    targetPages: ["bagis"],
    arabicOriginal: null,
    text: {
      tr: "Her ne hayır işlerseniz, Allah onu mutlaka bilir.",
      uz: "Qanday yaxshilik qilsangiz, albatta Alloh uni biluvchidir.",
      en: "Whatever good you do, Allah certainly knows it well.",
      ar: "وَمَا تَفْعَلُوا مِنْ خَيْرٍ فَإِنَّ اللَّهَ بِهِ عَلِيمٌ."
    },
    needsReview: { tr: false, uz: true, en: true, ar: true }
  },
  {
    id: "mumin-kardesi-icin-istemek",
    type: "hadith",
    sourceTr: "Tirmizî, Sıfatü'l-kıyâme 59",
    targetPages: ["projeler/gelecek-planlarimiz"],
    arabicOriginal: null,
    text: {
      tr: "Sizden biriniz kendisi için istediğini mümin kardeşi için de istemedikçe iman etmiş olmaz.",
      uz: "Sizlardan birortangiz o'zi uchun yaxshi ko'rgan narsani mo'min birodari uchun ham ravo ko'rmaguncha komil iymonli bo'la olmaydi.",
      en: "None of you truly believes until they wish for their believer brother what they wish for themselves.",
      ar: "لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه."
    },
    needsReview: { tr: false, uz: true, en: true, ar: true }
  },
  {
    id: "hayra-vesile-olan",
    type: "hadith",
    sourceTr: "Hadis-i şerif",
    targetPages: ["bagis"],
    arabicOriginal: null,
    text: {
      tr: "Bir hayra vesile olan sanki onu işlemiş gibidir.",
      uz: "Bir yaxshilikka sababchi bo'lgan kishi xuddi uni o'zi bajargandek savob oladi.",
      en: "Whoever guides to a good deed is like the one who performs it.",
      ar: "الدال على الخير كفاعله."
    },
    needsReview: { tr: false, uz: true, en: true, ar: true }
  },
  {
    id: "bir-kiz-egitirsen-milleti-egitirsin",
    type: "quote", // Hadis emas, hikmatli so'z!
    sourceTr: "Hikmetli Söz",
    targetPages: ["projeler/kadin-medresesi"],
    arabicOriginal: null,
    text: {
      tr: "Bir oğul eğitirsen bir adamı, bir kız eğitirsen bütün bir milleti eğitmiş olursun.",
      uz: "Bir o'g'ilni tarbiyalasang bir kishini, bir qizni tarbiyalasang butun bir millatni tarbiyalagan bo'lasan.",
      en: "If you educate a son, you educate a person; if you educate a daughter, you educate a whole nation.",
      ar: "إذا علّمت ولداً فقد علّمت فرداً، وإذا علّمت فتاةً فقد علّمت أمةً بأسرها."
    },
    needsReview: { tr: false, uz: true, en: true, ar: true }
  }
];

export interface CatalogProjectDefinition {
  slug: string;
  category: string;
  projectState: "davom etmoqda" | "planlanan" | "tugallangan";
  status: "published" | "draft";
  heroImageKey: string;
  fallbackHeroImageKey?: string;
  bannerImageKey?: string;
  mobileHeroImageKey?: string;
  illustrationImageKey?: string;
  galleryImageKeys: string[];
  supportCampaignSlug: string;
  statsBadge: {
    source: "katalog-2026";
    asOf: string;
    needsReview: boolean;
    isPlannedTarget: boolean;
    metrics: Array<{ key: string; value: string; label: Record<Locale, string> }>;
  };
  externalLinks?: Array<{ platform: string; label: string; url: string; needsVerification: boolean }>;
  quoteId?: string;
  title: Record<Locale, string>;
  summary: Record<Locale, string>;
  bodyTr: string;
  bodyUz: string;
  bodyEn: string;
  bodyAr: string;
}

export const CATALOG_PROJECTS: CatalogProjectDefinition[] = [
  {
    slug: "azon-global-medya",
    category: "medya",
    projectState: "davom etmoqda",
    status: "published",
    heroImageKey: "rasmlar/medya/azon-studyo-roportaj.jpg",
    illustrationImageKey: "rasmlar/medya/dijital-dunya-kapak.jpg",
    galleryImageKeys: [
      "rasmlar/medya/azon-studyo-roportaj.jpg",
      "rasmlar/medya/azon-tv-ders-yayini.jpg",
      "rasmlar/medya/azon-studyo-sohbet.jpg",
      "rasmlar/medya/azon-tv-canli-yayin.jpg",
      "rasmlar/medya/azon-global-web-laptop.png"
    ],
    supportCampaignSlug: "genel-bagis",
    statsBadge: {
      source: "katalog-2026",
      asOf: "Katalog verisi (2025/2026)",
      needsReview: true,
      isPlannedTarget: false,
      metrics: [
        { key: "founded", value: "2017", label: { tr: "Kuruluş Yılı", uz: "Tashkil topgan yil", en: "Founded", ar: "سنة التأسيس" } },
        { key: "youtube_subs", value: "1.320.000+", label: { tr: "YouTube Abonesi", uz: "YouTube obunachilari", en: "YouTube Subscribers", ar: "مشتركو يوتيوب" } },
        { key: "youtube_videos", value: "1.600+", label: { tr: "Yüklenen Video", uz: "Yuklangan videolar", en: "Uploaded Videos", ar: "الفيديوهات المرفوعة" } },
        { key: "total_views", value: "73.800.000+", label: { tr: "Toplam İzlenme", uz: "Jami ko'rishlar", en: "Total Views", ar: "إجمالي المشاهدات" } },
        { key: "portal_langs", value: "5", label: { tr: "Portal Dil Sayısı", uz: "Portal tillari soni", en: "Portal Languages", ar: "لغات البوابة" } },
        { key: "social_followers", value: "~1.800.000", label: { tr: "Sosyal Ağ Takipçisi", uz: "Ijtimoiy tarmoq kuzatuvchilari", en: "Social Followers", ar: "متابعو شبكات التواصل" } }
      ]
    },
    externalLinks: [
      { platform: "web", label: "azon.global", url: "https://azon.global", needsVerification: true },
      { platform: "youtube", label: "Azon Global", url: "https://www.youtube.com/@AzonGlobal", needsVerification: true },
      { platform: "instagram", label: "azon_global", url: "https://www.instagram.com/azon_global", needsVerification: true },
      { platform: "x", label: "@AzonGlobal", url: "https://x.com/AzonGlobal", needsVerification: true },
      { platform: "telegram", label: "t.me/azonglobal_fm", url: "https://t.me/azonglobal_fm", needsVerification: true }
    ],
    title: {
      tr: "Habercilik ve Medya — \"Azon Global\"",
      uz: "Axborot va Media — \"Azon Global\"",
      en: "Journalism & Media — \"Azon Global\"",
      ar: "الإعلام والصحافة — «أذان غلوبال»"
    },
    summary: {
      tr: "2017'de kurulan Azon Global Medya; azon.global, Azon TV, Azon Global FM ve Ildiz Kitap ile milli ve dini değerleri tanıtan medya grubudur.",
      uz: "2017-yilda tashkil etilgan Azon Global Media tarkibida azon.global sayti, Azon TV onlayn telekanali, Azon Global FM radiosi va Ildiz Kitap nashriyoti faoliyat yuritadi.",
      en: "Founded in 2017, Azon Global Media encompasses azon.global, Azon TV, Azon Global FM radio, and Ildiz Kitap publishing house.",
      ar: "تأسست مجموعة أذان غلوبال الإعلامية عام ٢٠١٧ وتضم موقع azon.global وقناة Azon TV وإذاعة Azon Global FM ودار نشر Ildiz Kitap."
    },
    bodyTr: `"Azon Global" Medya 2017 yılında halka açık bir haber kanalı olarak kuruldu. "Azon Global" Medya bünyesinde azon.global web sitesi, "Azon TV" online televizyonu, Azon Global FM radyosu ve "Ildiz Kitap" yayınevi yer almaktadır.

Şu anda bu medya grubu, YouTube platformunda bir milyon üç yüz binden fazla abonesi olan "Azon TV" dahil olmak üzere Özbekistan'daki ve dünya çapındaki Özbekçe konuşan takipçiler arasında geniş bir kitleye sahiptir. Ayrıca 6 Mart 2024'ten itibaren Rusça konuşan bir kitleye yönelik tasarlanmış "Azon Global Rus" bölümümüz de yayına başladı. Yakın zamanda Türkçe yayına başlamayı planlıyoruz.

Kitle iletişim aracı olarak Azon Global Media, milli ve dini değerlerin yaygın bir şekilde tanıtımını yapan Özbek medya ve bilişim dünyasında özel bir yere sahiptir. Özbekistan halkı "Azon Global"i yurttaşlarının milli ve dini menfaatlerini koruyan, Türk devletlerinin birliği fikrini savunan ve ülkenin sürdürülebilir kalkınmasını destekleyen tarafsız bir medya kuruluşu olarak tanıyor.

Maksadımız, Türkiye-Özbekistan ve bütün Türk devletleri arasındaki iş birliğini daha da geliştirmek, güvenilir bilgi alışverişini sağlamak, dezenformasyonun önünü kesmek, internet kullanıcılarına kaliteli, güvenilir ve inançlarımıza uygun tarzda haber sunmaktır.`,
    bodyUz: `"Azon Global" Media 2017-yilda ochiq axborot kanali sifatida tashkil etilgan. "Azon Global" Media tarkibida azon.global veb-sayti, "Azon TV" onlayn televideniyesi, Azon Global FM radiosi va "Ildiz Kitap" nashriyoti mavjud.

Hozirda ushbu media guruh YouTube platformasida bir million uch yuz mingdan ziyod obunachiga ega "Azon TV" bilan bir qatorda O'zbekiston va butun dunyodagi o'zbekzabon kuzatuvchilar orasida keng auditoriyaga ega. Shuningdek, 2024-yil 6-martdan boshlab ruszabon auditoriya uchun "Azon Global Rus" bo'limi ham efirga chiqa boshladi. Yaqin kelajakda turk tilida ham efir boshlash rejalashtirilgan.

Maqsadimiz — Turkiya, O'zbekiston va barcha turkiy davlatlar o'rtasidagi hamkorlikni yanada rivojlantirish, ishonchli axborot almashinuvini ta'minlash, dezinformatsiyaning oldini olish va internet foydalanuvchilariga sifatli, ishonchli hamda qadriyatlarimizga mos yangiliklar taqdim etishdir.`,
    bodyEn: `"Azon Global" Media was founded in 2017 as a public news channel. It includes the azon.global website, "Azon TV" online television, Azon Global FM radio, and "Ildiz Kitap" publishing house.

Today this media group reaches a wide audience among Uzbek-speaking followers in Uzbekistan and worldwide, including "Azon TV" with over 1.32 million subscribers on YouTube. On March 6, 2024, "Azon Global Rus" also launched for Russian-speaking audiences, with Turkish broadcasting planned next.

Our goal is to strengthen cooperation between Türkiye, Uzbekistan, and all Turkic states, ensure reliable information exchange, counter disinformation, and provide high-quality, trustworthy news aligned with our values.`,
    bodyAr: `تأسست مجموعة "أذان غلوبال" الإعلامية عام ٢٠١٧ كقناة إخبارية عامة، وتضم موقع azon.global وتلفزيون "Azon TV" وإذاعة Azon Global FM ودار النشر "Ildiz Kitap".

تحظى المجموعة بجمهور واسع بين الناطقين بالأوزبكية في أوزبكستان والعالم، ويتجاوز عدد مشتركي قناة "Azon TV" على يوتيوب مليوناً وثلاثمائة وعشرين ألف مشترك. نهدف إلى تعزيز التعاون بين تركيا وأوزبكستان وسائر الدول التركية وتقديم إعلام موثوق يلتزم بالقيم الدينية والوطنية.`
  },
  {
    slug: "mezana-akademisi",
    category: "egitim",
    projectState: "davom etmoqda",
    status: "published",
    heroImageKey: "rasmlar/egitim/akademi-talebeleri-derste.jpg",
    galleryImageKeys: [
      "rasmlar/egitim/akademi-talebeleri-derste.jpg",
      "rasmlar/egitim/derste-cekim.jpg",
      "rasmlar/enstitu/talebeler-yazili-calisma.jpg",
      "rasmlar/hakkimizda/mezana-bina-dis-cephe.jpg"
    ],
    supportCampaignSlug: "mezana-akademisi-egitim-bursu",
    statsBadge: {
      source: "katalog-2026",
      asOf: "Katalog verisi (2025/2026)",
      needsReview: true,
      isPlannedTarget: false,
      metrics: [
        { key: "founded", value: "2021", label: { tr: "Kuruluş Yılı", uz: "Tashkil topgan yil", en: "Founded", ar: "سنة التأسيس" } },
        { key: "students", value: "120+", label: { tr: "Aktif Talebe", uz: "Faol talabalar", en: "Active Students", ar: "طالب نشط" } },
        { key: "program", value: "5+2 Yıl", label: { tr: "Lisans + Yüksek Lisans", uz: "Bakalavr + Magistratura", en: "BA + MA Program", ar: "بكالوريوس + ماجستير" } },
        { key: "hours_per_year", value: "1.296", label: { tr: "Yıllık Ders Saati", uz: "Yillik dars soati", en: "Annual Lecture Hours", ar: "ساعة دراسية سنوياً" } }
      ]
    },
    title: {
      tr: "\"Mezana\" Uluslararası Dini İlimler Akademisi",
      uz: "\"Mezana\" Xalqaro Diniy Ilmlar Akademiyasi",
      en: "\"Mezana\" International Academy of Religious Sciences",
      ar: "أكاديمية «ميزانا» الدولية للعلوم الدينية"
    },
    summary: {
      tr: "2021'de İstanbul'da kurulan akademide 120'den fazla talebe, 5 yıllık lisans ve 2 yıllık yüksek lisans düzeyinde yılda 1.296 saat ders almaktadır.",
      uz: "2021-yilda Istanbulda tashkil etilgan akademiyada 120 dan ortiq talaba 5 yillik bakalavr va 2 yillik magistratura bosqichlarida yiliga 1296 soat dars oladi.",
      en: "Founded in Istanbul in 2021, the Academy provides 1,296 annual hours of instruction to over 120 students across 5-year undergraduate and 2-year graduate programs.",
      ar: "تأسست الأكاديمية في إسطنبول عام ٢٠٢١ ويدرس فيها أكثر من ١٢٠ طالباً في مرحلتي البكالوريوس (٥ سنوات) والماجستير (سنتان) بمعدل ١٢٩٦ ساعة سنوياً."
    },
    bodyTr: `İstanbul'daki ilim muhitinden verimli bir şekilde faydalanmak ve bu şehirde faaliyet gösteren âlimlerden, özellikle dünya çapında tanınmış âlimlerin bilgi ve tecrübelerinden istifade etmek maksadıyla 2021 yılında "Mezana" Uluslararası Dini İlimler Akademisi'ni kurduk.

Bu akademide beş yıllık lisans ve iki yıllık yüksek lisans seviyelerinden ibaret olmak üzere iki kademede eğitim programları uygulanmaya başlamıştır. Akademide öğrenim görmek isteyen talebelerin yeterli derecede Arapça okuyabilmesi ve anlayabilmesi, aynı zamanda medrese seviyesindeki dini ilimleri öğrenmiş olması istenmektedir.

Halen 120'den fazla talebe, kendi branşlarında bilgili ve tecrübeli, uluslararası ölçekte tanınmış üstadlardan ders almaktadır.

"Mezana" Uluslararası Dini İlimler Akademisi mezunları eğitimlerini tamamladıktan sonra diploma alacak ve akademi bünyesinde Fıkıh ve Hadis Çalışmaları alanında yüksek lisans düzeyinde eğitimlerine devam etme imkânına sahip olacaklardır.

Akademide aşağıdaki dersler alanında uzman, tanınmış ve deneyimli hocalar tarafından verilmektedir:
Nahiv (Arap dili grameri), Sarf (Arapça kelime şekilleri), Belâgat (hitabet ve güzel söz söyleme sanatı), Akaid, Mantık, Tefsir, Kur'ân Hükümleri, Hadis, Hadis Usulü (hadis ilminin esasları), Fıkıh (İslam hukuku), Fıkıh Usulü (fıkhın temel kaideleri), Siyer (Peygamberimizin hayatı), Miras İlmi, Ahlak ve Âdâb, Türk Dili.

Her öğretim yılında talebelere toplam olarak 1.296 saat ders okutulmaktadır.`,
    bodyUz: `Istanbuldagi ilm muhitidan unumli foydalanish va bu shaharda faoliyat yuritayotgan olimlardan, xususan dunyo miqyosida tanilgan ulamolarning bilim va tajribalaridan bahramand bo'lish maqsadida 2021-yilda "Mezana" Xalqaro Diniy Ilmlar Akademiyasini tashkil etdik.

Mazkur akademiyada besh yillik bakalavriat va ikki yillik magistratura bosqichlaridan iborat ta'lim dasturlari joriy etilgan. Hozirda 120 dan ziyod talaba xalqaro miqyosda tanilgan ustozlardan saboq olmoqda. Har o'quv yilida talabalarga jami 1296 soat dars o'qitiladi: Nahv, Sarf, Balog'at, Aqoid, Mantiq, Tafsir, Qur'on hukmlari, Hadis, Hadis usuli, Fiqh, Fiqh usuli, Siyrat, Meros ilmi, Axloq va Odob, Turk tili.`,
    bodyEn: `Founded in 2021 in Istanbul to benefit from the city's renowned scholars, "Mezana" International Academy of Religious Sciences offers a five-year undergraduate and a two-year graduate program in Fiqh and Hadith Studies. Currently, over 120 students study 1,296 hours per academic year across 15 classical and contemporary disciplines.`,
    bodyAr: `تأسست أكاديمية "ميزانا" الدولية للعلوم الدينية في إسطنبول عام ٢٠٢١ للاستفادة من علماء المدينة البارزين، وتقدم برنامجاً جامعياً من خمس سنوات وبرنامج ماجستير من سنتين في الفقه والحديث لأكثر من ١٢٠ طالباً بمعدل ١٢٩٦ ساعة دراسية سنوياً.`
  },
  {
    slug: "medrese",
    category: "egitim",
    projectState: "davom etmoqda",
    status: "published",
    heroImageKey: "rasmlar/egitim/medrese-toplu-foto.jpg",
    bannerImageKey: "rasmlar/egitim/medrese-seminer-salonu.jpg",
    galleryImageKeys: [
      "rasmlar/egitim/medrese-toplu-foto.jpg",
      "rasmlar/egitim/sinifta-talebeler.jpg",
      "rasmlar/egitim/talebe-kitap-okuyor.jpg"
    ],
    supportCampaignSlug: "mezana-akademisi-egitim-bursu",
    statsBadge: {
      source: "katalog-2026",
      asOf: "Katalog verisi (2025/2026)",
      needsReview: true,
      isPlannedTarget: false,
      metrics: [
        { key: "duration", value: "2 Yıl / 6 Dönem", label: { tr: "Eğitim Süresi", uz: "O'qish muddati", en: "Program Duration", ar: "مدة الدراسة" } },
        { key: "students", value: "150+", label: { tr: "Medrese Talebesi", uz: "Madrasa talabalari", en: "Madrasa Students", ar: "طلاب المدرسة" } }
      ]
    },
    title: {
      tr: "\"Mezana\" Medresesi",
      uz: "\"Mezana\" Madrasasi",
      en: "\"Mezana\" Madrasa",
      ar: "مدرسة «ميزانا»"
    },
    summary: {
      tr: "İki yıl (altı dönem) süren medrese eğitimimizde 150'den fazla talebe Ehl-i Sünnet ve Hanefi fıkhı esaslarına göre Arapça, kıraat ve temel İslami ilimleri öğrenmektedir.",
      uz: "Ikki yil (olti davr) davom etadigan madrasa ta'limida 150 dan ziyod talaba Ahli sunna va Imomi A'zam mazhabiga muvofiq arab tili, qiroat va diniy ilmlarni o'rganadi.",
      en: "Over 150 students study Arabic, Qur'anic recitation (including Ashere-Takrib), and classical Islamic sciences over a two-year (six-term) curriculum.",
      ar: "يدرس أكثر من ١٥٠ طالباً اللغة العربية والقراءات والعلوم الشرعية على مذهب أهل السنة والإمام أبي حنيفة خلال سنتين (ستة فصول)."
    },
    bodyTr: `Vakfımız bünyesinde iki yıllık medrese eğitimi verilmekte olup, medresemiz gelecekte dini sahada uzmanlaşacak kabiliyetli gençleri kabul etmektedir. Medresede giriş seviyesinden başlanarak Arapça ve dini ilimler okutulmaktadır.

Medresemizde 150'den fazla talebe eğitim görmektedir. Bu talebeler İslam hukukunu Ehl-i Sünnet inancına, İmam-ı Âzam'ın mezhebine uygun olarak öğreniyorlar. Onlara kendi sahalarında uzman, ilmi çalışmalarıyla ve yazdıkları kitaplarıyla dünya çapında tanınmış ilim adamları tarafından dersler verilmektedir.

Medresemizde ilim talebeleri Arapça okuma-konuşma, sarf, nahiv, akaid, siyer, Kur'ân-ı Kerîm okuma ve hafızlık ilimlerini iki yıl boyunca altı dönemde öğrenirler. Medrese eğitiminde talebelere ileri düzeyde Arapça öğretilerek akademik eğitime hazırlanmaları sağlanmaktadır.

Ayrıca dünyaca ünlü hocalar ve faziletli ilim adamlarının katılımıyla seminerler düzenlenmektedir. Talebelerin zamanlarını verimli geçirmeleri için çeşitli geziler düzenlenmekte, onların fiziki olarak sağlıklı gelişimlerini desteklemek amacıyla sportif faaliyetler ve yarışmalar yapılmaktadır.

Talebeler eğitim sürecinde Kur'ân-ı Kerîm'in on farklı okunuşunu (Aşere-Takrîb) öğrenecek ve bu sahada tecrübeli hocalardan yeterlilik belgesi alma fırsatı yakalayacaklardır.

Medresemizde okutulan ilimler: Kıraat ve Tecvid, Arapça Okuma ve Konuşma, Nahiv (Arapça gramer), Akaid, Mütalaa.`,
    bodyUz: `Vaqfimiz qoshida ikki yillik madrasa ta'limi yo'lga qo'yilgan bo'lib, unda 150 dan ortiq talaba Ahli sunna val jamoa e'tiqodi va Imomi A'zam mazhabiga muvofiq ta'lim olmoqda. Olti davr mobaynida Qiroat va Tajvid (jumladan Asharai Taqrib), Arab tili o'qish va so'zlashuv, Nahv, Aqoid hamda Mutolaa fanlari chuqur o'rgatilib, talabalar akademik bosqichga tayyorlanadi.`,
    bodyEn: `Our two-year (six-term) Madrasa program trains over 150 students in Arabic reading and conversation, Sarf, Nahw, Aqeedah, Seerah, Qur'anic recitation (including the ten canonical readings, Ashere-Takrib), and Hifz, preparing them for advanced academic study.`,
    bodyAr: `تقدم المدرسة برنامجاً مدته سنتان (ستة فصول) لأكثر من ١٥٠ طالباً في القراءات والتجويد (بما في ذلك العشرة التقريب) واللغة العربية والنحو والعقيدة والمطالعة.`
  },
  {
    slug: "kadin-medresesi",
    category: "egitim",
    projectState: "davom etmoqda",
    status: "published",
    heroImageKey: "rasmlar/egitim/kadin-medresesi-talebeler.jpg",
    illustrationImageKey: "rasmlar/egitim/kiz-talebe-kuran-okuyor.jpg",
    galleryImageKeys: [
      "rasmlar/egitim/kadin-medresesi-talebeler.jpg",
      "rasmlar/egitim/hanimlar-ders-dinliyor.jpg",
      "rasmlar/egitim/hanim-talebeler-derste.jpg"
    ],
    supportCampaignSlug: "mezana-akademisi-egitim-bursu",
    quoteId: "bir-kiz-egitirsen-milleti-egitirsin",
    statsBadge: {
      source: "katalog-2026",
      asOf: "Katalog verisi (2025/2026)",
      needsReview: true,
      isPlannedTarget: false,
      metrics: [
        { key: "students", value: "50+", label: { tr: "Kadın ve Kız Talebe", uz: "Ayol va qiz talabalar", en: "Female Students", ar: "طالبة" } },
        { key: "anaokulu", value: "Mevcut", label: { tr: "Bünyesinde Anaokulu", uz: "Qoshida bolalar bog'chasi", en: "On-site Kindergarten", ar: "روضة أطفال ملحقة" } }
      ]
    },
    title: {
      tr: "\"Mezana\" Kadın Medresesi",
      uz: "\"Mezana\" Ayollar Madrasasi",
      en: "\"Mezana\" Women's Madrasa",
      ar: "مدرسة «ميزانا» للبنات والسيدات"
    },
    summary: {
      tr: "50'den fazla kadın ve kız talebenin eğitim gördüğü medresemizde, genç annelerin ilimden mahrum kalmaması için bünyesinde anaokulu da hizmet vermektedir.",
      uz: "50 dan ortiq xotin-qizlar tahsil olayotgan madrasamizda yosh onalar ilmdan bahramand bo'lishi uchun maxsus bolalar bog'chasi ham tashkil etilgan.",
      en: "Serving over 50 female students, the Women's Madrasa includes an on-site kindergarten so young mothers can pursue their studies with peace of mind.",
      ar: "تدرس في مدرسة النساء أكثر من ٥٠ طالبة، وتضم روضة أطفال تتيح للأمهات الشابات طلب العلم في بيئة آمنة."
    },
    bodyTr: `Kadınların ve kızların da toplumda kendilerine mahsus yeri vardır ve evlatlarımızın yetişip olgunlaşmasında özel bir öneme sahiptirler. Bilgili, geniş görüşe sahip, güzel ahlaklı bir kadın, çocuklarını da insanlığa faydalı kişiler olarak yetiştirecektir. Zira "Bir oğul eğitirsen bir adamı, bir kız eğitirsen bütün bir milleti eğitmiş olursun." sözü boşuna söylenmemiştir.

Bu sebeple Ezan Vakfı bünyesinde "Mezana" Kadın Medresesi de kurulmuştur. Burada kadınlara ve kızlara, sahalarında uzman olan dünyaca tanınmış hocalardan dini bilgiler alabilmeleri için gereken her türlü imkân sağlanmıştır.

Aynı zamanda küçük çocuğu olan genç annelerin de ilim öğrenme imkânından ve zevkinden mahrum kalmamaları için medresemizde bir de anaokulu kurulmuştur. Bu sayede genç anneler dersleriyle meşgulken çocukları da alanında kabiliyetli çocuk bakımı elemanlarının gözetiminde keyifli ve faydalı bir tarzda zaman geçirebilirler.

Bu öğretim kurumunda bugün elliden fazla kadın ve kız talebemiz öğrenim görmektedir.`,
    bodyUz: `Xotin-qizlarning jamiyatda va farzand tarbiyasida alohida o'rni bor. Zero "Bir o'g'ilni tarbiyalasang bir kishini, bir qizni tarbiyalasang butun bir millatni tarbiyalagan bo'lasan" degan hikmatli so'z bejiz aytilmagan. Shu bois Ezan Vakfı qoshida "Mezana" Ayollar Madrasasi tashkil etildi. Shuningdek, yosh bolali onalar ilm olish ne'matidan mahrum qolmasligi uchun madrasa qoshida bolalar bog'chasi ham faoliyat yuritadi. Bugungi kunda bu maskanda 50 dan ziyod ayol va qiz talabalarimiz tahsil olmoqda.`,
    bodyEn: `Recognizing the vital role of women in society and family education, Ezan Foundation established the "Mezana" Women's Madrasa, where over 50 female students study under expert instructors. An on-site kindergarten cares for young children while their mothers attend classes.`,
    bodyAr: `أنشأ وقف أذان مدرسة "ميزانا" للسيدات والبنات حيث تدرس أكثر من ٥٠ طالبة بإشراف أستاذات متخصصات، مع توفير روضة أطفال ملحقة لرعاية أطفال الأمهات الدارسات.`
  },
  {
    slug: "kuran-kursu",
    category: "egitim",
    projectState: "davom etmoqda",
    status: "published",
    heroImageKey: "rasmlar/egitim/kuran-kursu-cocuklar.jpg",
    fallbackHeroImageKey: "rasmlar/egitim/mushaf-okuyan-talebe.jpg",
    illustrationImageKey: "rasmlar/egitim/cocuk-camide-dua.jpg",
    galleryImageKeys: [
      "rasmlar/egitim/mushaf-okuyan-talebe.jpg",
      "rasmlar/egitim/talebeler-mushaf-uzerinde.jpg"
    ],
    supportCampaignSlug: "mezana-akademisi-egitim-bursu",
    quoteId: "sizin-en-hayirliniz-kuran",
    statsBadge: {
      source: "katalog-2026",
      asOf: "Katalog verisi (2025/2026)",
      needsReview: true,
      isPlannedTarget: false,
      metrics: [
        { key: "hafiz_students", value: "60", label: { tr: "Hafızlık Talebesi", uz: "Hofizlik talabalari", en: "Hifz Students", ar: "طالب تحفيظ" } }
      ]
    },
    title: {
      tr: "Çocuklar ve Yetişkinler İçin Kur'ân Kursu",
      uz: "Bolalar va Kattalar Uchun Qur'on Kursi",
      en: "Qur'an Course for Children and Adults",
      ar: "دورة القرآن الكريم للأطفال والكبار"
    },
    summary: {
      tr: "Ezan Vakfı bünyesinde açılan Kur'ân Kursumuzda bugün altmış genç Kur'ân-ı Kerîm hafızı olmak için öğrenim görmektedir.",
      uz: "Ezan Vakfı qoshida ochilgan Qur'on kursimizda bugungi kunda 60 nafar yosh Qur'oni Karim hofizi bo'lish uchun tahsil olmoqda.",
      en: "Sixty young students are currently studying to memorize the Holy Qur'an at the Ezan Foundation Qur'an Course for Children and Adults.",
      ar: "يدرس حالياً ستون شاباً وناشئاً لحفظ القرآن الكريم في دورة القرآن الكريم التابعة لوقف أذان."
    },
    bodyTr: `Kendileri kaliteli eğitim almış anne babalar evlatlarının da iyi yetişmiş kişiler olmasını, ilim öğrenmesini isterler. Çünkü yalnız anne babaların değil, bütün toplumun, insanlığın geleceği genç nesillerin nasıl yetiştirildiğine bağlıdır. Çocuklara küçük yaştan itibaren ahlaklı olmayı, geniş bakış açısına sahip olmayı, derin düşünmeyi öğretmenin en etkili yolunun Kur'ân-ı Kerîm'i öğretmek olduğu şüphesizdir.

Bu sebeple Ezan Vakfı bünyesinde Çocuklar ve Yetişkinler İçin Kur'ân Kursu açtık. Bugün bu kurumda altmış genç Kur'ân-ı Kerîm hafızı olmak için öğrenim görmektedir.

Çocukların Allah kelamını ezberlemesiyle beyin fonksiyonları gelişir ve sadece din derslerinde değil diğer derslerde de kolay öğrenmeye başlarlar.`,
    bodyUz: `Farzandlarga yoshlikdan go'zal axloq, keng dunyoqarash va teran tafakkurni o'rgatishning eng samarali yo'li Qur'oni Karimni ta'lim berishdir. Shu sababli Ezan Vakfı qoshida Bolalar va kattalar uchun Qur'on kursini ochdik. Bugungi kunda ushbu dargohda 60 nafar yosh Qur'oni Karim hofizi bo'lish uchun tahsil olmoqda.`,
    bodyEn: `To nurture moral character and deep understanding from an early age, Ezan Foundation opened the Qur'an Course for Children and Adults, where 60 young students are currently training to become Huffaz of the Holy Qur'an.`,
    bodyAr: `افتتح وقف أذان دورة القرآن الكريم للأطفال والكبار حيث يتلقى ستون طالباً التعليم والتدريب لإتمام حفظ كتاب الله عز وجل.`
  },
  {
    slug: "talebe-yurdu",
    category: "barinma",
    projectState: "davom etmoqda",
    status: "published",
    heroImageKey: "rasmlar/yurt/talebeler-yemekte.jpg",
    mobileHeroImageKey: "rasmlar/egitim/sinav-salonu-dikey.jpg",
    galleryImageKeys: [
      "rasmlar/yurt/talebeler-yemekte.jpg",
      "rasmlar/yurt/yurt-odasi-ranza.jpg",
      "rasmlar/projeler/bos-sinif.jpg"
    ],
    supportCampaignSlug: "mezana-akademisi-egitim-bursu",
    quoteId: "ilim-yolculugu-allah-yolunda",
    statsBadge: {
      source: "katalog-2026",
      asOf: "Katalog verisi (2023-2024 / 2026)",
      needsReview: true,
      isPlannedTarget: false,
      metrics: [
        { key: "planned_capacity", value: "120 Kişilik (Planlanan)", label: { tr: "Düşünülen Kapasite", uz: "Mo'ljallangan sig'im", en: "Planned Capacity", ar: "السعة المخططة" } },
        { key: "meals", value: "3 Öğün", label: { tr: "Milli Yemek İkramı", uz: "Kunlik milliy taom", en: "Daily Meals", ar: "وجبات يومية" } },
        { key: "security", value: "24 Saat", label: { tr: "Kesintisiz Güvenlik", uz: "Uzluksiz xavfsizlik", en: "24/7 Security", ar: "حراسة ٢٤ ساعة" } },
        { key: "spent_2023_2024", value: "800.000 $+", label: { tr: "2023-2024 Eğitim ve Barınma Gideri", uz: "2023-2024 ta'lim va yotoqxona xarajati", en: "2023-2024 Education & Housing Spend", ar: "نفقات التعليم والسكن ٢٠٢٣-٢٠٢٤" } }
      ]
    },
    title: {
      tr: "Talebelere Kalacak Yer Sağlama — Talebe Yurdu",
      uz: "Talabalar Turar Joyi — Talabalar Yotoqxonasi",
      en: "Student Accommodation — Student Dormitory",
      ar: "سكن الطلاب — دار إقامة طلبة العلم"
    },
    summary: {
      tr: "Türkistan mıntıkasından Türkiye'ye okumak için gelen talebelere konforlu barınma, 3 öğün yemek ve 24 saat güvenlik imkânı sağlanmaktadır.",
      uz: "Turkiston mintaqasidan Turkiyaga o'qish uchun kelgan talabalarga qulay yotoqxona, uch mahal o'zbek milliy taomlari va 24 soatlik xavfsizlik ta'minlanadi.",
      en: "Providing comfortable rooms, three daily Uzbek meals, and 24-hour security for students arriving in Türkiye from the Turkistan region.",
      ar: "يوفر السكن الطلابي للقادمين من تركستان للدراسة في تركيا غرفاً مريحة وثلاث وجبات يومية وحراسة على مدار الساعة."
    },
    bodyTr: `Vakfımız, Türkistan mıntıkasından Türkiye'ye okumak için gelen talebelerin barınacak yer bulma sıkıntısını ortadan kaldırmak maksadıyla talebelere yurt imkânı sağlayarak yardımcı olmaktadır. Bundan maksat, talebelerimiz için çok önemli olan takım halinde öğrenme ve fikir alışverişinde bulunma imkânı bulmalarıdır.

Şu anda 120 kişilik kapasiteye sahip olması düşünülen bu tesiste talebelere konforlu odalarda kalma ve üç öğün Özbekistan'ın milli yemeklerini bulma imkânı sağlanıyor. Derslerin işlendiği binanın yanında bulunan bu yurtta çamaşır makineleri, banyolar ve diğer imkânlar mevcuttur.

Talebelerin güvenliğinin sağlanması maksadıyla 24 saat kesintisiz kamera ile kontrol sağlanmıştır.

Faaliyetlerimizin maliyeti hakkında bir fikir vermek gerekirse, 2023-2024 öğretim yılında talebelere eğitim ve barınma imkânı sağlamak için 800 bin dolardan fazla harcama yapıldığını söyleyebiliriz.`,
    bodyUz: `Vaqfimiz Turkiston mintaqasidan Turkiyaga ilm olish uchun kelgan talabalarning turar joy muammosini bartaraf etish maqsadida ularni barcha qulayliklarga ega yotoqxona bilan ta'minlamoqda. 120 o'ringa mo'ljallangan ushbu majmuada talabalarga qulay xonalar, uch mahal O'zbekistonning milliy taomlari va 24 soat uzluksiz xavfsizlik nazorati yaratilgan. 2023–2024 o'quv yilida talabalarning ta'lim va yashash xarajatlari uchun 800 ming AQSH dollaridan ziyod mablag' yo'naltirildi.`,
    bodyEn: `To support students coming to Türkiye from the Turkistan region, our dormitory adjacent to the academic building offers comfortable rooms, three daily meals of traditional Uzbek cuisine, laundry facilities, and 24/7 security monitoring. Over $800,000 was spent on student education and accommodation during the 2023–2024 academic year.`,
    bodyAr: `يوفر وقف أذان سكناً طلابياً مجهزاً للطلاب القادمين من تركستان إلى تركيا، بسعة مخططة تبلغ ١٢٠ طالباً، مع ثلاث وجبات يومية ومراقبة أمنية على مدار ٢٤ ساعة، وقد تجاوزت نفقات التعليم والسكن ٨٠٠ ألف دولار في العام الدراسي ٢٠٢٣-٢٠٢٤.`
  },
  {
    slug: "burslar",
    category: "burs",
    projectState: "davom etmoqda",
    status: "published",
    heroImageKey: "rasmlar/egitim/talebe-not-aliyor.jpg",
    illustrationImageKey: "rasmlar/burs/talebe-koli-tasiyor.jpg",
    galleryImageKeys: [
      "rasmlar/egitim/talebe-not-aliyor.jpg",
      "rasmlar/burs/talebeler-laptop.jpg"
    ],
    supportCampaignSlug: "mezana-akademisi-egitim-bursu",
    statsBadge: {
      source: "katalog-2026",
      asOf: "Katalog verisi (2025/2026)",
      needsReview: true,
      isPlannedTarget: false,
      metrics: [
        { key: "academy_scholarship", value: "%100 Burslu", label: { tr: "Akademi Talebeleri", uz: "Akademiya talabalari", en: "Academy Students", ar: "طلاب الأكاديمية" } },
        { key: "overall_scholarship", value: "2/3 Burslu", label: { tr: "Genel Burs Oranı", uz: "Umumiy stipendiya ulushi", en: "Overall Scholarship Share", ar: "نسبة المنح الإجمالية" } },
        { key: "healthcare", value: "Tam Destek", label: { tr: "Sağlık ve Tedavi Giderleri", uz: "Tibbiy ko'rik va davolanish", en: "Healthcare Coverage", ar: "الرعاية الصحية والعلاج" } }
      ]
    },
    title: {
      tr: "Geniş Kapsamlı Burslar ve Eğitim Yardımları",
      uz: "Keng Qamrovli Stipendiyalar va Ta'lim Yordamlari",
      en: "Comprehensive Scholarships & Educational Aid",
      ar: "المنح الدراسية الشاملة والمساعدات التعليمية"
    },
    summary: {
      tr: "Akademi talebeleri tam burslu okurken, genel olarak talebelerin üçte ikisi burslu eğitim görmekte ve tüm sağlık giderleri vakıf tarafından karşılanmaktadır.",
      uz: "Akademiya talabalari 100% grant asosida o'qiydi, umumiy hisobda talabalarning uchdan ikki qismi stipendiya bilan ta'minlangan hamda ularning tibbiy xarajatlari vaqf tomonidan qoplanadi.",
      en: "All Academy students receive full scholarships, two-thirds of all students receive financial aid, and the Foundation covers medical checkups and treatment costs.",
      ar: "يدرس جميع طلاب الأكاديمية بمنح كاملة، ويستفيد ثلثا الطلاب عموماً من المنح الدراسية مع تكفل الوقف بجميع نفقات الرعاية الصحية والعلاج."
    },
    bodyTr: `Vakfımız faaliyetlerinde eğitim konusuna ağırlık vermiştir. Akademi talebeleri tam burslu olarak eğitim görüyorlar. Bütün eğitim giderleri vakıf tarafından karşılanıyor. Medrese, talebelerine ücretli eğitim vermekle birlikte kabiliyetli talebelere burs imkânı da sağlıyor. Ayrıca dar gelirli talebelerin eğitimlerine devam edebilmeleri için sözleşme bedelinin bir kısmı veya tamamı ödeniyor. Böylece eğitimin önündeki maddi engellerin kaldırılmasıyla bu gençlere yaşıtlarıyla aynı seviyede eğitim alma fırsatı veriliyor. Genel olarak talebelerin üçte ikisi burslu olarak eğitim görüyor.

Ayrıca talebelerin sağlığı da her zaman vakıf yetkililerinin gözetimi altındadır. Planlı sağlık taramasından geçmenin dışında, anne babalarından uzakta hasta olan talebelere vakfın yardımsever görevlileri baba şefkati göstererek tedavilerini sağlamak için ellerinden gelen bütün gayreti sarf etmektedir. Tabii ki tedavi masraflarını da vakıf karşılamaktadır. Kısaca söylemek gerekirse, burada eğitim gören talebelerin anne babaları onları Ezan Vakfı'na, bize emanet ettiler. Biz de emaneti gözbebeğimiz gibi korumaya, talebelerimize daima en iyi şekilde bakmaya çalışıyoruz.

İşte bu sebeple anne babaların çocukları yönünden endişeleri yok, içleri rahat. Çünkü onlar Allah'ın izniyle emin ellerdeler.`,
    bodyUz: `Vaqfimiz faoliyatida ta'limga ustuvor ahamiyat qaratilgan. Akademiya talabalari to'liq grant asosida tahsil oladi, ularning barcha o'qish xarajatlari vaqf tomonidan qoplanadi. Madrasada ham iqtidorli va kam ta'minlangan talabalarga shartnoma to'lovining bir qismi yoki to'liq miqdori qoplab beriladi — umumiy hisobda talabalarning uchdan ikki qismi stipendiya oladi. Shuningdek, ota-onasidan uzoqda tahsil olayotgan talabalarning rejali tibbiy ko'riklari va davolanish xarajatlari ham to'liq vaqf zimmasidadir.`,
    bodyEn: `Education is the cornerstone of our foundation. Academy students receive 100% full scholarships, and overall two-thirds of all students study on scholarship. Beyond tuition, Ezan Foundation provides scheduled health screenings and covers all medical treatment expenses with parental care.`,
    bodyAr: `يركز الوقف على دعم طلبة العلم، حيث يتمتع طلاب الأكاديمية بمنح كاملة، ويحصل ثلثا الطلاب الإجماليين على منح دراسية، فضلاً عن الرعاية الصحية الكاملة وتغطية نفقات العلاج.`
  },
  {
    slug: "sosyal-kulturel",
    category: "sosyal",
    projectState: "davom etmoqda",
    status: "published",
    heroImageKey: "rasmlar/sosyal/cami-ziyareti.jpg",
    galleryImageKeys: [
      "rasmlar/sosyal/cami-ziyareti.jpg",
      "rasmlar/sosyal/kis-gezisi-toplu.jpg",
      "rasmlar/sosyal/talebeler-toplu-salon.jpg",
      "rasmlar/sosyal/gezi-toplu-avlu.jpg",
      "rasmlar/sosyal/piknik-toplu.jpg"
    ],
    supportCampaignSlug: "genel-bagis",
    statsBadge: {
      source: "katalog-2026",
      asOf: "Katalog verisi (2025/2026)",
      needsReview: true,
      isPlannedTarget: false,
      metrics: [
        { key: "activities", value: "Gezi, Seminer ve Spor", label: { tr: "Sosyal Programlar", uz: "Ijtimoiy dasturlar", en: "Social Programs", ar: "البرامج الاجتماعية" } }
      ]
    },
    title: {
      tr: "Sosyal ve Kültürel Faaliyetler",
      uz: "Ijtimoiy va Madaniy Faoliyatlar",
      en: "Social and Cultural Activities",
      ar: "الأنشطة الاجتماعية والثقافية"
    },
    summary: {
      tr: "Talebelerin boş zamanlarını faydalı değerlendirmeleri için tarihi yerlere geziler, âlim ziyaretleri, seminerler, doğa turları ve spor müsabakaları düzenlenmektedir.",
      uz: "Talabalarning bo'sh vaqtini mazmunli o'tkazish uchun tarixiy maskanlarga sayohatlar, ulamolar ziyorati, seminarlar, tabiat qo'yniga safarlar va sport musobaqalari o'tkaziladi.",
      en: "Historical excursions, visits to renowned scholars in Istanbul, seminars, nature trips, sports tournaments, and picnics for students.",
      ar: "رحلات تاريخية، وزيارات للعلماء البارزين في إسطنبول، وندوات علمية، ورحلات طبيعية ورياضية للطلاب."
    },
    bodyTr: `Vakfımız, Türkistan coğrafyasından Türkiye'ye gelip burada öğrenim gören talebelerin boş zamanlarını faydalı işlerle değerlendirmeleri için de çeşitli tedbirler planlamıştır. Bunlar arasında Türkiye'nin tarihi yerlerine düzenlenen geziler, İstanbul'da yaşayan dünyaca ünlü ilim adamlarını ziyaret etme, gençlerin yanlış temayüllere ve fikirlere kapılmalarını önlemek için çeşitli konularda düzenlenen seminerler ve konferanslar, dağlara ve zengin tabiat manzaralarının olduğu yerlere geziler ve turlar, çeşitli spor müsabakaları ve piknikler yer alıyor.`,
    bodyUz: `Vaqfimiz Turkiston mintaqasidan Turkiyaga kelib tahsil olayotgan talabalarning bo'sh vaqtini foydali va mazmunli o'tkazish uchun Turkiyaning tarixiy obidalariga sayohatlar, Istanbulda yashovchi dunyoga mashhur ulamolar bilan uchrashuvlar, turli mavzularda ilmiy-ma'rifiy seminar va konferensiyalar, tabiat qo'yniga safarlar hamda sport musobaqalarini muntazam tashkil etadi.`,
    bodyEn: `To enrich student life, our Foundation organizes visits to Türkiye's historical landmarks, meetings with world-renowned scholars residing in Istanbul, educational seminars, mountain and nature excursions, sports competitions, and picnics.`,
    bodyAr: `ينظم الوقف برامج ثقافية واجتماعية متنوعة لطلابه تشمل زيارة المعالم التاريخية في تركيا، ولقاء العلماء البارزين في إسطنبول، والندوات التربوية والرحلات والمسابقات الرياضية.`
  },
  {
    slug: "islam-dusuncesi-enstitusu",
    category: "arastirma",
    projectState: "davom etmoqda",
    status: "published",
    heroImageKey: "rasmlar/enstitu/mezana-kursusu-yildiz-cerceve.png",
    galleryImageKeys: [
      "rasmlar/enstitu/mezana-kursusu-yildiz-cerceve.png",
      "rasmlar/enstitu/talebeler-yazili-calisma.jpg",
      "rasmlar/enstitu/heyet-ziyareti-bayrak.jpg"
    ],
    supportCampaignSlug: "genel-bagis",
    statsBadge: {
      source: "katalog-2026",
      asOf: "Katalog verisi (2025/2026)",
      needsReview: true,
      isPlannedTarget: false,
      metrics: [
        { key: "pillars", value: "6 Temel Hedef", label: { tr: "Araştırma ve İlim Ekseni", uz: "Asosiy ilmiy yo'nalish", en: "Core Research Pillars", ar: "الأهداف العلمية الأساسية" } }
      ]
    },
    title: {
      tr: "İslam Düşüncesi Enstitüsü",
      uz: "Islom Tafakkuri Instituti",
      en: "Institute of Islamic Thought",
      ar: "معهد الفكر الإسلامي"
    },
    summary: {
      tr: "İslam medeniyeti, düşüncesi ve ilmi mirasını esas alarak çağımızın meselelerine doğru ilmi yaklaşım ve çözümler sunmayı hedefleyen ilim ve araştırma kurumudur.",
      uz: "Islom tamadduni, tafakkuri va ilmiy merosiga tayangan holda zamonamiz masalalariga ilmiy yondashuv va yechimlar taqdim etuvchi ilm va tadqiqot muassasasi.",
      en: "A research and educational institution dedicated to articulating Islamic scholarship, ethics, and social justice in the language of our era.",
      ar: "مؤسسة علمية وبحثية تعنى بإحياء التراث العلمي والفكري الإسلامي وتقديم حلول رصينة لقضايا العصر."
    },
    bodyTr: `İslam Düşüncesi Enstitüsü; İslam medeniyeti, düşüncesi, ilmi ve dini mirasını esas alarak zamanımızda dinimizin talebi olan dünya görüşünü ve doğru ilmi yaklaşımı yerleştirmeyi maksat edinmiş bir ilim ve eğitim kurumudur.

Bu enstitümüzün hedefleri; İslam dininin temel değerleri ve çağdaş ilim ve fen ile uyumlu olarak toplumda yeni bir düşünce tarzının oluşmasına katkıda bulunmak, dînî ilimleri çağımızın diline uygun olarak ifade etmeye katkı sağlamaktır.

**Temel maksat ve hedefler:**

1. **Günümüz insanını İslam düşüncesi ile tanıştırmak.** İslam felsefesi ve düşüncesinin temel ilkelerinin çağımızın meseleleri ve şartları ile uyumlu olarak öğrenilmesi gerektiğinden hareketle:
   - İslam düşüncesinin günümüzün sosyal, siyasi ve ekonomik meseleleriyle uyumunun sağlanması;
   - Müslüman toplumların çağdaş dünyadaki yerini ve rolünü incelemek;
   - İslam düşüncesi adına günümüzün ilmi ve felsefi meselelerine çözüm teklifleri sunmak.
2. **Dini ilimlerin geliştirilmesi ve eğitim.** İslam dini çerçevesinde derinlemesine ilmi araştırmalar yapmak, din eğitiminin kapsamını genişletmek ve dini bakış açısını kamuoyuna sunmak:
   - Kur'an, hadis, fıkıh, kelam ve tasavvuf gibi İslami ilimlerin ilmi esaslara uygun olarak öğretilmesi;
   - İslam dünyasının ilmi mirasını incelemek ve günümüze uygulamak;
   - Müslümanlar arasında dini bilgileri yaymak ve ilmi araştırmalar yoluyla yenilikler ortaya koymak.
3. **İslam'ın ahlaki değerlerini gençler arasında yaygınlaştırmak**, gençlere İslam ahlakını tanıtmak ve günümüz toplumunda bu değerlere göre yaşamalarını teşvik etmek:
   - Gençler arasında dürüst, adaletli ve ahlaklı İslami hayat tarzını yaygınlaştırmak;
   - Gençleri ilim öğrenmeye, sabırlı ve şefkatli olmaya teşvik ve davet etmek;
   - Gençlere İslam'ın cihad anlayışının gerçek ruhunu aşılamak.
4. **İslam dininin sosyal adalet ilkesini teşvik etmek ve yaymak.** Toplumda ortaya çıkan çeşitli problemlere İslam ahlakına uygun tavsiyelerde bulunmak ve çözümler sunmak:
   - Toplumsal adalet ve eşitliğin sağlanması;
   - İslam ekonomisi, aile değerleri, çevre konuları gibi alanlarda uygun çözüm önerileri sunmak.
5. **Fikir hürriyetinin ve ilmi bağımsızlığın sağlanması.** İslam düşüncesinin hür bir şekilde gelişmesini, ilmi araştırma ve fikri faaliyetlerin hür ve bağımsız bir şekilde yürütülmesini desteklemek:
   - İslam'da akademik özerkliğe, fikri gelişime ve her Müslümanın fikirlerini hiçbir baskı altında kalmadan hür bir fert olarak ifade etme hakkına saygı göstermek ve desteklemek;
   - Fikirlerin ve ilmi kavramların serbestçe paylaşılabileceği bir zemin oluşturmak.
6. **Müslümanların dünyadaki yeri ve rolü hakkında araştırma yapmak:**
   - İslam'ın dünya görüşünün günümüz küresel meselelerine nasıl yansıdığını araştırmak;
   - İslam'ın uluslararası ilişkilere, küresel barış ve istikrara katkısı konusunda araştırmalar yapmak;
   - Müslümanlar ile diğer halklar arasındaki ilişkilerin iyileştirilmesine yönelik ilmi ve günümüze uygun yaklaşımlar, teklifler ortaya koymak;
   - Müslümanların dünyadaki eski ve yüksek statülerine kavuşmalarının yollarını araştırmak;
   - Dünyadaki bütün milletlerin İslam adaletinin gölgesinden faydalanmalarının yolları ve esasları hakkında kapsamlı araştırmalar yapmak.

**Kısaca:** İslam Düşüncesi Enstitüsü, İslam'ı çağımızda doğru bir şekilde anlamak ve anlatmak, yaymak, uygulamak ve Müslümanların genel olarak dinî, ilmî, felsefî, sosyal ve hayatın her alanındaki mühim rolüne katkıda bulunmayı gaye edinir. İslam düşüncesinin gelişmesi, Müslümanların toplumdaki konumunun güçlendirilmesi ve küresel ölçekte toplumsal istikrarın sağlanması yolunda karşılık beklemeden hizmet eder.`,
    bodyUz: `Islom Tafakkuri Instituti — Islom tamadduni, tafakkuri, ilmiy va diniy merosiga tayangan holda zamonamizda dinimiz talab etgan dunyoqarash va to'g'ri ilmiy yondashuvni qaror toptirishni maqsad qilgan ilm va ta'lim muassasasidir.

Asosiy maqsad va yo'nalishlar:
1. Zamonamiz insonini Islom tafakkuri bilan tanishtirish.
2. Diniy ilmlarni rivojlantirish va ta'lim.
3. Islomning axloqiy qadriyatlarini yoshlar orasida keng yoyish.
4. Islom dinining ijtimoiy adolat tamoyilini targ'ib etish.
5. Fikr erkinligi va ilmiy mustaqillikni ta'minlash.
6. Musulmonlarning dunyodagi o'rni va roli haqida tadqiqotlar olib borish.`,
    bodyEn: `The Institute of Islamic Thought is a scholarly institution grounded in Islamic civilization and heritage, working across six core pillars: introducing contemporary society to Islamic thought, advancing religious sciences, promoting moral values among youth, championing social justice, safeguarding academic freedom, and researching the global role of Muslims.`,
    bodyAr: `معهد الفكر الإسلامي مؤسسة علمية وتعليمية ترتكز على تراث الحضارة الإسلامية، وتعمل على ستة محاور: التعريف بالفكر الإسلامي المعاصر، تطوير العلوم الشرعية، نشر القيم الأخلاقية بين الشباب، تعزيز العدالة الاجتماعية، دعم الحرية الفكرية والاستقلال العلمي، ودراسة دور المسلمين في العالم.`
  },
  {
    slug: "yayincilik",
    category: "yayincilik",
    projectState: "davom etmoqda",
    status: "published",
    heroImageKey: "rasmlar/yayincilik/katta-fiqh-ensiklopedi.jpg",
    galleryImageKeys: [
      "rasmlar/yayincilik/katta-fiqh-ensiklopedi.jpg",
      "rasmlar/yayincilik/katta-fiqh-kitaplar.jpg",
      "rasmlar/yayincilik/usulus-sunan-kitaplari.jpg",
      "rasmlar/yayincilik/nuqta-yayinlari-kitaplar.jpg"
    ],
    supportCampaignSlug: "genel-bagis",
    quoteId: "teblig-edenin-yuzu-ak-olsun",
    statsBadge: {
      source: "katalog-2026",
      asOf: "Katalog verisi (2025/2026)",
      needsReview: true,
      isPlannedTarget: false,
      metrics: [
        { key: "publisher", value: "Nuqta Yayınevi", label: { tr: "Yayınevi Markası", uz: "Nashriyot", en: "Publishing House", ar: "دار النشر" } }
      ]
    },
    title: {
      tr: "Yayıncılık — \"Nuqta\" Yayınevi",
      uz: "Nashriyotchilik — \"Nuqta\" Nashriyoti",
      en: "Publishing — \"Nuqta\" Publishing House",
      ar: "النشر والترجمة — دار «نقطة» للنشر"
    },
    summary: {
      tr: "Türk ve Orta Asya ilim adamlarının, şair ve yazarlarının eserlerini karşılıklı olarak Özbekçe, Türkçe ve kardeş dillere çevirip yayınlamak üzere \"Nuqta\" Yayınevi kurulmuştur.",
      uz: "Turkiya va Markaziy Osiyo ulamolari, shoir va adiblarining asarlarini o'zbek, turk va qardosh tillarga o'girib nashr etish maqsadida \"Nuqta\" nashriyoti tashkil etildi.",
      en: "Continuing the scholarly bridge of Ali Qushji and Qadizada al-Rumi, \"Nuqta\" Publishing translates and publishes works between Turkish, Uzbek, and sister languages.",
      ar: "امتداداً للتواصل العلمي التاريخي بين آسيا الوسطى والأناضول، تأسست دار «نقطة» للنشر لترجمة ونشر المؤلفات العلمية والأدبية بين التركية والأوزبكية واللغات الشقيقة."
    },
    bodyTr: `Bütün ilişkilerde olduğu gibi ilmi bağların da güçlendirilmesi zaruri bir ihtiyaçtır. Orta Asya ve Türkiye halkları tarih boyunca ilim sahalarında güçlü bağlar kurmuşlardır. Özellikle Mirza Uluğbek'in talebesi olan büyük ceddimiz astronom ve matematikçi Ali Kuşçu'nun İstanbul'a gelerek Ayasofya Medresesi'nde hocalık yapması bu bağların canlı bir örneğidir. Anadolu'da doğup yetişen Kadızâde-i Rûmî'nin Semerkand'da ders vermesi de tarihi ilişkilerin güzel bir örneğidir.

Bu gelenekleri devam ettirmek maksadıyla Türk ilim adamlarının ilmi mirasını, Türk şair ve yazarlarının paha biçilmez edebi eserlerini Özbekçe ve diğer kardeş dillere çevirmek ve aynı zamanda Orta Asya'da yetişen ilim adamlarının, şairlerinin ve yazarlarının kitaplarını Türkçe olarak yayınlamak amacıyla "Nuqta" Yayınevini kurduk. Yeni kurduğumuz yayınevimiz, inşallah böyle aydınlık hedeflere hizmet edecektir.`,
    bodyUz: `Markaziy Osiyo va Turkiya xalqlari tarix davomida ilm-fan sohasida mustahkam rishtalar bog'laganlar. Mirzo Ulug'bekning shogirdi, buyuk falakiyotshunos va matematik Ali Qushchining Istanbulga kelib Ayasofya madrasasida mudarrislik qilgani hamda Anadoluda voyaga yetgan Qozizoda Rumiyning Samarqandda dars bergani buning yorqin namunasidir. Shu qutlug' an'anani davom ettirish, turk olimlari va adiblarining asarlarini o'zbek va qardosh tillarga, Markaziy Osiyo allomalari va yozuvchilarining kitoblarini esa turk tiliga tarjima qilib nashr etish maqsadida "Nuqta" nashriyotini ta'sis etdik.`,
    bodyEn: `Throughout history, the peoples of Central Asia and Türkiye have shared deep scholarly bonds—exemplified by Ali Qushji teaching at the Hagia Sophia Madrasa in Istanbul and Qadizada al-Rumi teaching in Samarkand. To carry this legacy forward, we founded "Nuqta" Publishing House to translate and publish scholarly and literary works between Turkish, Uzbek, and sister languages.`,
    bodyAr: `إحياءً للروابط العلمية التاريخية بين آسيا الوسطى وتركيا — كما تجلت في تدريس علي قوشجي في مدرسة آيا صوفيا بإسطنبول وقاضي زاده الرومي في سمرقند — أسسنا دار "نقطة" للنشر لترجمة وطباعة التراث العلمي والأدبي بين اللغتين التركية والأوزبكية.`
  },
  {
    slug: "gelecek-planlarimiz",
    category: "gelecek",
    projectState: "planlanan",
    status: "published",
    heroImageKey: "rasmlar/egitim/talebe-yaziyor-yakin.jpg",
    galleryImageKeys: [
      "rasmlar/egitim/talebe-yaziyor-yakin.jpg",
      "rasmlar/sosyal/kazanda-yemek-hazirligi.jpg",
      "rasmlar/projeler/bos-sinif.jpg"
    ],
    supportCampaignSlug: "genel-bagis",
    quoteId: "mumin-kardesi-icin-istemek",
    statsBadge: {
      source: "katalog-2026",
      asOf: "Gelecek Hedeflerimiz (Planlanan)",
      needsReview: true,
      isPlannedTarget: true,
      metrics: [
        { key: "target_iftar", value: "1.000 Kişi / Gün (Hedef)", label: { tr: "Ramazan Günlük İftar Hedefi", uz: "Ramazon kunlik iftorlik rejasi", en: "Planned Daily Ramadan Iftar", ar: "هدف الإفطار اليومي في رمضان" } },
        { key: "target_gida", value: "5.000 Adet (Hedef)", label: { tr: "Yıllık Gıda Paketi Hedefi", uz: "Yillik oziq-ovqat paketi rejasi", en: "Planned Food Parcels", ar: "هدف السلال الغذائية" } },
        { key: "target_burs", value: "500 Öğrenci (Hedef)", label: { tr: "Yıllık Burs Hedefi", uz: "Yillik stipendiya rejasi", en: "Planned Student Scholarships", ar: "هدف المنح الطلابية" } },
        { key: "target_yetim", value: "1.000 Yetim (Hedef)", label: { tr: "Yetim Bakımı Hedefi", uz: "Yetimlar kafolati rejasi", en: "Planned Orphan Care", ar: "هدف كفالة الأيتام" } },
        { key: "target_kurban", value: "500 Adet (Hedef)", label: { tr: "Kurban Kesimi Hedefi", uz: "Qurbonlik ulashish rejasi", en: "Planned Qurbani Distribution", ar: "هدف الأضاحي" } }
      ]
    },
    title: {
      tr: "Gelecek İçin Planlarımız ve Projelerimiz (Planlanan Hedefler)",
      uz: "Kelajak Rejalarimiz va Loyihalarimiz (Rejalashtirilgan Maqsadlar)",
      en: "Our Future Plans and Projects (Planned Goals)",
      ar: "خططنا ومشاريعنا المستقبلية (أهداف مخططة)"
    },
    summary: {
      tr: "Ezan Vakfı'nın yakın gelecekte hayata geçirmeyi hedeflediği sosyal yardım, sağlık klinikleri, çiftlik, gençlik merkezleri ve iktisadi projeler.",
      uz: "Ezan Vakfı yaqin kelajakda amalga oshirishni rejalashtirgan ijtimoiy yordam, tibbiy klinikalar, chorvachilik fermasi, yoshlar markazlari va iqtisodiy loyihalar.",
      en: "Planned social welfare targets, healthcare clinics, livestock farm, youth centers, and sustainable economic initiatives of Ezan Foundation.",
      ar: "المشاريع والأهداف المستقبلية المخططة لوقف أذان في مجالات الإغاثة الاجتماعية والمراكز الصحية والمزارع ومراكز الشباب."
    },
    bodyTr: `Ezan Vakfı yakın gelecekte faaliyet alanını daha da genişletmek maksadıyla aşağıdaki faaliyetleri hayata geçirmeyi planlamaktadır:

- Sosyal korumaya ihtiyaç duyan mahalli halka ve Orta Asya'dan gelen göçmenlere maddi yardım sağlanması,
- İstanbul'da kitapseverler için bir merkez kurulması,
- Göçmen işçi çocuklarının eğitimine destek,
- TİKA, Diyanet ve diğer kamu kuruluşlarıyla anlaşmalar temelinde iş birliği yapmak ve bir dizi projeyi hayata geçirmek.

**Sosyal yardımlar.** Her yıl hayata geçirilen ve önümüzdeki yıllarda da güzel gelişmelere imza atacak olan sosyal yardım programlarının istikrarlı olarak devamını sağlamak maksadıyla şu yardımları sürekli olarak gerçekleştirmek (hedef):
- Ramazan ayı boyunca her gün 1.000 kişiye iftar yemeği verilmesi,
- 5.000 adet gıda paketi dağıtımı,
- 500 öğrenciye burs / eğitim yardımı verilmesi,
- 1.000 yetimin bakımı,
- 500 adet kurban kesimi ve dağıtımı.

**Ticaret.** Ekonomi her kurumu ayakta tutan omurgadır. Vakfımızın sadece bağış ve yardımlara bağımlı kalmaması için bir dizi ticari projeyi hayata geçirmek istiyoruz. Özellikle Orta Asyalı girişimcilerin katılımıyla Türkiye'de çok sayıda fabrika ve tesis kurmayı planlıyoruz.

**Sağlık kurumları.** Başta yabancı öğrenciler olmak üzere, tedavi için Türkiye'ye gelen Orta Asyalı / Türkistanlı hastalar için buradaki pahalı sağlık hizmetlerinin yükünü biraz olsun hafifletmek, hatta tamamen ortadan kaldırmak için klinikler kurmayı hedefliyoruz. Teşhis ve tedavi amacıyla bu sağlık kuruluşlarına gelenlere uygun fiyata, kaliteli sağlık hizmeti sunulması planlanıyor.

**Çiftlik işleri.** Öncelikle öğrencilere mahalli üretim et ve yumurta ürünleri sağlamak üzere bir hayvancılık çiftliği kuruyoruz. Bu konuda ilk adımlar atıldı.

**Kız ve erkek öğrenciler için gençlik merkezleri.** Türkiye'ye okumak için gelen kabiliyetli ve ihtiyaç sahibi lise, lisans, yüksek lisans ve doktora talebelerine yönelik hizmetleri koordine etmek amacıyla kurulacak olan bu merkezlerde, onlara maddi destek sağlamayı, üniversitelere yerleştirmeyi ve üniversite hayatları boyunca eğitimlerine destek olmayı hedefliyoruz. Maksadımız bu merkezlerde yürütülen çalışmaları daha da yaygınlaştırmak ve uluslararası bir kuruluş olarak çok sayıda ihtiyaç sahibi öğrenciye burs ve eğitim yardımı sağlamaktır.`,
    bodyUz: `Ezan Vakfı yaqin kelajakda faoliyat doirasini kengaytirish maqsadida quyidagi istiqbolli rejalarni amalga oshirishni maqsad qilgan (bular kelajak rejalari bo'lib, amalga oshirilgan hisobotdan alohida ko'rsatiladi):
- Ijtimoiy himoyaga muhtoj mahalliy aholi va Markaziy Osiyodan kelgan muhojirlarga moddiy ko'mak berish;
- Istanbulda kitobxonlar markazini ochish;
- TİKA, Diyanet va boshqa davlat tashkilotlari bilan hamkorlikda qo'shma loyihalarni amalga oshirish.

Ijtimoiy yordamlar bo'yicha yillik maqsadlarimiz (Reja):
- Ramazon oyi davomida har kuni 1 000 kishiga iftorlik berish;
- 5 000 ta oziq-ovqat qutisi tarqatish;
- 500 nafar talabaga stipendiya va ta'lim yordami ajratish;
- 1 000 nafar yetimni otaliqqa olish;
- 500 ta qurbonlik so'yish va tarqatish.

Shuningdek, vaqfning moliyaviy barqarorligi uchun tijoriy korxonalar, talabalar va bemorlar uchun arzon va sifatli tibbiy klinikalar, talabalarni mahalliy go'sht va tuxum mahsulotlari bilan ta'minlovchi chorvachilik fermasi hamda o'g'il-qiz talabalar uchun yoshlar markazlarini barpo etish rejalashtirilgan.`,
    bodyEn: `Future Planned Goals of Ezan Foundation (distinct from completed activities):
- Daily Iftar meals for 1,000 people throughout Ramadan (Target);
- Distribution of 5,000 food parcels (Target);
- Scholarships for 500 students (Target);
- Sponsorship and care for 1,000 orphans (Target);
- 500 Qurbani sacrifices and distributions (Target);
- Sustainable trade enterprises, affordable healthcare clinics for students and patients from Central Asia, a livestock farm (initial steps underway), and Youth Centers for high school, undergraduate, and graduate students.`,
    bodyAr: `الأهداف والمشاريع المستقبلية المخططة لوقف أذان:
- تفطير ١٠٠٠ صائم يومياً خلال شهر رمضان (هدف مخطط)؛
- توزيع ٥٠٠٠ سلة غذائية (هدف مخطط)؛
- تقديم منح تعليمية لـ ٥٠٠ طالب (هدف مخطط)؛
- رعاية ١٠٠٠ يتيم (هدف مخطط)؛
- ذبح وتوزيع ٥٠٠ أضحية (هدف مخطط)؛
إضافة إلى مشاريع وقفية تجارية، وعيادات صحية، ومزرعة للإنتاج الحيواني، ومراكز شبابية للطلاب والطالبات.`
  }
];

export function hasCyrillicCharacters(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

const SECTION_HEADER_BY_SLUG: Record<string, string> = {
  "azon-global-medya": "## 8. Habercilik ve Medya",
  "mezana-akademisi": "## 9. \"Mezana\" Uluslararası Dini İlimler Akademisi",
  "medrese": "## 10. Medrese",
  "kadin-medresesi": "## 11. \"Mezana\" Kadın Medresesi",
  "kuran-kursu": "## 12. Çocuklar ve Yetişkinler İçin Kur'ân Kursu",
  "talebe-yurdu": "## 13. Talebelere Kalacak Yer Sağlama",
  "burslar": "## 14. Geniş Kapsamlı Burslar ve Eğitim Yardımları",
  "sosyal-kulturel": "## 15. Sosyal ve Kültürel Faaliyetler",
  "islam-dusuncesi-enstitusu": "## 16. İslam Düşüncesi Enstitüsü",
  "yayincilik": "## 17. Yayıncılık",
  "gelecek-planlarimiz": "## 18. Gelecek İçin Planlarımız ve Projelerimiz"
};

export function extractCatalogProjectBodyTrFromMarkdown(markdownContent: string, projectSlug: string): string {
  const headerPrefix = SECTION_HEADER_BY_SLUG[projectSlug];
  if (!headerPrefix) {
    throw new Error(`Unknown catalog project slug: ${projectSlug}`);
  }
  const lines = markdownContent.split(/\r?\n/);
  let inSection = false;
  const collected: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!inSection) {
      if (line.startsWith(headerPrefix)) {
        inSection = true;
      }
      continue;
    }
    if (line.startsWith("---") || line.startsWith("## ")) {
      break;
    }
    if (line.startsWith("Hedef:") || line.startsWith("Görsel")) {
      continue;
    }
    if (line.startsWith("**Rakamlar") || line.startsWith("**Hesaplar")) {
      // Skip metadata bullets at the end of sections 8..14
      while (i + 1 < lines.length && !lines[i + 1]!.startsWith("---") && !lines[i + 1]!.startsWith("## ")) {
        i++;
      }
      break;
    }
    const cleanedLine = line.replace(/\s*\(görsel:\s*`[^`]+`\)\s*$/g, "");
    collected.push(cleanedLine);
  }

  return collected.join("\n").trim();
}

export function normalizeTextForCatalogDiff(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function loadCatalogMarkdownContent(): string {
  const candidates = [
    path.resolve(process.cwd(), ".import/katalog/ezan-katalog/icerik/katalog-icerik-tr.md"),
    "/srv/data/apps/mezana-platform/apps/ezan-web/.import/katalog/ezan-katalog/icerik/katalog-icerik-tr.md",
    "/tmp/katalog_inspect/ezan-katalog/icerik/katalog-icerik-tr.md"
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf8");
    }
  }
  throw new Error("katalog-icerik-tr.md not found in expected paths");
}

export function diffCatalogProjectBodyTr(
  arg1: string,
  arg2: string,
  arg3?: string
): { matches: boolean; diffCount: number; expectedNormalized: string; actualNormalized: string } {
  const markdownContent = arg3 !== undefined ? arg1 : loadCatalogMarkdownContent();
  const projectSlug = arg3 !== undefined ? arg2 : arg1;
  const actualText = arg3 !== undefined ? arg3 : arg2;

  const expectedRaw = extractCatalogProjectBodyTrFromMarkdown(markdownContent, projectSlug);
  const expectedNormalized = normalizeTextForCatalogDiff(expectedRaw);
  const actualNormalized = normalizeTextForCatalogDiff(actualText);
  const matches = expectedNormalized === actualNormalized;
  return {
    matches,
    diffCount: matches ? 0 : 1,
    expectedNormalized,
    actualNormalized
  };
}

export const CATALOG_CAMPAIGNS = [
  {
    slug: "mezana-akademisi-egitim-bursu",
    purposeCode: "EGITIM-BURS",
    restricted: true,
    coverImage: "/media/katalog/egitim/talebe-not-aliyor-800.webp",
    sideImage: "/media/katalog/burs/talebeler-laptop-800.webp",
    presetAmounts: [500, 1000, 2500, 5000],
    title: {
      tr: "Geniş Kapsamlı Burslar ve Eğitim Yardımları",
      uz: "Keng Qamrovli Stipendiyalar va Ta'lim Yordamlari",
      en: "Comprehensive Scholarships & Educational Aid",
      ar: "المنح الدراسية الشاملة والمساعدات التعليمية"
    },
    summary: {
      tr: "Akademi talebeleri tam burslu olarak eğitim görüyorlar. Genel olarak talebelerin üçte ikisi burslu eğitim görmekte ve sağlık giderleri vakıf tarafından karşılanmaktadır.",
      uz: "Akademiya talabalari to'liq grant asosida tahsil oladi, umumiy hisobda talabalarning uchdan ikki qismi stipendiya bilan ta'minlangan.",
      en: "Academy students receive full scholarships, two-thirds of all students study on scholarship, and healthcare expenses are covered by the Foundation.",
      ar: "يدرس طلاب الأكاديمية بمنح كاملة، ويستفيد ثلثا الطلاب عموماً من المنح الدراسية مع تكفل الوقف بنفقات الرعاية الصحية."
    },
    description: {
      tr: "Vakfımız faaliyetlerinde eğitim konusuna ağırlık vermiştir. Akademi talebeleri tam burslu olarak eğitim görüyorlar. Bütün eğitim giderleri vakıf tarafından karşılanıyor. Medrese, talebelerine ücretli eğitim vermekle birlikte kabiliyetli talebelere burs imkânı da sağlıyor. Ayrıca dar gelirli talebelerin eğitimlerine devam edebilmeleri için sözleşme bedelinin bir kısmı veya tamamı ödeniyor. Genel olarak talebelerin üçte ikisi burslu olarak eğitim görüyor.",
      uz: "Vaqfimiz faoliyatida ta'limga ustuvor ahamiyat qaratilgan. Akademiya talabalari to'liq grant asosida tahsil oladi, ularning barcha o'qish va davolanish xarajatlari vaqf tomonidan qoplanadi.",
      en: "Our Foundation prioritizes education: all Academy students receive full scholarships, and overall two-thirds of students receive financial aid and medical care support.",
      ar: "يركز الوقف على التعليم، حيث يتمتع طلاب الأكاديمية بمنح كاملة ويحصل ثلثا الطلاب على منح دراسية ورعاية صحية شاملة."
    }
  },
  {
    slug: "ramazan-2027-iftar-ve-kumanya",
    purposeCode: "RAMAZAN-IFTAR",
    restricted: true,
    coverImage: "/media/katalog/yardim/gida-kolisi-800.webp",
    sideImage: "/media/katalog/sosyal/kazanda-yemek-hazirligi-800.webp",
    presetAmounts: [300, 900, 1800, 3600],
    title: {
      tr: "Ramazan İftar Sofrası ve Gıda Paketi Destek Programı",
      uz: "Ramazon Iftorlik Dasturxoni va Oziq-ovqat Qutisi Dasturi",
      en: "Ramadan Iftar Meal & Food Parcel Support Program",
      ar: "برنامج موائد إفطار رمضان والسلال الغذائية"
    },
    summary: {
      tr: "Sosyal yardım programlarımız kapsamında Ramazan ayı boyunca ihtiyaç sahiplerine ve ilim talebelerine iftar yemeği ve gıda paketi ulaştırılmaktadır.",
      uz: "Ijtimoiy yordam dasturlarimiz doirasida Ramazon oyi davomida ehtiyojmand oilalar va ilm toliblariga iftorlik hamda oziq-ovqat qutilari yetkaziladi.",
      en: "Delivering daily Ramadan Iftar meals and food parcels to students of knowledge and families in need.",
      ar: "تقديم وجبات الإفطار اليومية والسلال الغذائية لطلبة العلم والأسر المتعففة خلال شهر رمضان."
    },
    description: {
      tr: "Her yıl hayata geçirilen sosyal yardım programlarımızın istikrarlı olarak devamını sağlamak maksadıyla Ramazan ayı boyunca ihtiyaç sahiplerine ve talebelerimize iftar yemeği verilmesi ve gıda paketi dağıtımı gerçekleştirilmektedir.",
      uz: "Har yili amalga oshiriladigan ijtimoiy yordam dasturlarimizning barqaror davom etishi uchun Ramazon oyi davomida iftorlik dasturxonlari va oziq-ovqat paketlari tarqatiladi.",
      en: "Ensuring the continuity of our annual social welfare programs through Ramadan Iftar meals and food parcel distributions.",
      ar: "استمراراً لبرامج التكافل الاجتماعي السنوية، يقوم الوقف بتفطير الصائمين وتوزيع السلال الغذائية في شهر رمضان."
    }
  },
  {
    slug: "genel-bagis",
    purposeCode: "GENEL-BAGIS",
    restricted: false,
    coverImage: "/media/katalog/hakkimizda/mezana-bina-dis-cephe-800.webp",
    sideImage: "/media/katalog/egitim/sinav-salonu-genis-800.webp",
    presetAmounts: [250, 500, 1000, 2500],
    title: {
      tr: "Genel Vakıf Bağışı (Hayrat ve Eğitim Hizmetleri)",
      uz: "Umumiy Vaqf Xayriyasi (Xayrot va Ta'lim Xizmatlari)",
      en: "General Endowment Donation (Education & Charitable Works)",
      ar: "التبرع العام للوقف (الخيرات والخدمات التعليمية)"
    },
    summary: {
      tr: "Vakfımız, Ezan'ın manasına uygun hizmet vermek, insanlığın ilmi, medeni ve manevi yönlerden yükselmesine destek olmak için hizmet vermektedir.",
      uz: "Vaqfimiz Azonning ma'nosiga muvofiq xizmat qilish, insoniyatning ilmiy, madaniy va ma'naviy yuksalishiga ko'maklashish uchun faoliyat yuritadi.",
      en: "Supporting Ezan Foundation's educational, scholarly, publishing, and humanitarian services where most needed.",
      ar: "دعم أنشطة وقف أذان التعليمية والعلمية والإنسانية في المجالات الأكثر احتياجاً."
    },
    description: {
      tr: "\"Bir hayra vesile olan sanki onu işlemiş gibidir.\" Vakfımız, yardıma ihtiyacı olan kabiliyetli gençlerin yüksek seviyede eğitim almasına, barınma ve ilmi çalışmalarına destek olmak üzere faaliyetlerini sürdürmektedir.",
      uz: "\"Bir yaxshilikka sababchi bo'lgan kishi xuddi uni o'zi bajargandek savob oladi.\" Umumiy xayriyangiz vaqfning eng zarur ta'lim, yotoqxona va xayriya ehtiyojlariga yo'naltiriladi.",
      en: "\"Whoever guides to a good deed is like the one who performs it.\" General donations support the Foundation's core educational, dormitory, and charitable operations.",
      ar: "\"الدال على الخير كفاعله.\" تُوجَّه التبرعات العامة لدعم برامج التعليم والسكن الطلابي والخدمات الخيرية للوقف."
    }
  },
  {
    slug: "zekat-ve-fitre-fonu",
    purposeCode: "ZEKAT-FONU",
    restricted: true,
    coverImage: "/media/katalog/egitim/mushaf-okuyan-talebe-800.webp",
    sideImage: "/media/katalog/egitim/talebe-kitap-okuyor-800.webp",
    presetAmounts: [1000, 2500, 5000, 10000],
    title: {
      tr: "Zekât ve Eğitim Hizmetleri Fonu",
      uz: "Zakot va Ta'lim Xizmatlari Fondi",
      en: "Zakat & Educational Services Fund",
      ar: "صندوق الزكاة والخدمات التعليمية"
    },
    summary: {
      tr: "Zekât emanetleriniz, İslami usullere riayet edilerek ihtiyaç sahibi ilim talebelerine ve gerçek hak sahiplerine ulaştırılır.",
      uz: "Zakot omonatlaringiz shar'iy qoidalarga to'liq rioya qilingan holda muhtoj ilm toliblari va haqdor oilalarga yetkaziladi.",
      en: "Your Zakat contributions are strictly segregated and distributed to eligible students of knowledge and recipients in need.",
      ar: "تُحفظ أموال الزكاة في حساب مخصص وتُصرف في مصارفها الشرعية لطلبة العلم والمستحقين."
    },
    description: {
      tr: "Vefakâr, zarif, ahlaklı, çalışkan, milli manevi değerlerine bağlı insan yetiştirmek suretiyle huzurlu bir cemiyet ortamı meydana getirmek, ancak gönüllerin merhamet ve şefkat hissi ile dolması ve en güzel tezahürü olan zekât ve eğitim hizmetleri ile mümkündür. Zira bütün bunlar kulun Rabbine karşı en mühim bir şükür borcudur.",
      uz: "Mehr-shafqatning eng go'zal ifodasi bo'lgan zakot va ta'lim xizmatlari orqali muhtoj talabalar hamda ehtiyojmand oilalar qo'llab-quvvatlanadi.",
      en: "Through Zakat and educational services, we support deserving students of knowledge and families in need in accordance with Islamic principles.",
      ar: "من خلال خدمات الزكاة والتعليم يتم دعم طلبة العلم المحتاجين والأسر المتعففة وفق الضوابط الشرعية."
    }
  }
];

export async function getPublicProjectHeroImage(
  projectSlug: string,
  nodeEnv = process.env.NODE_ENV || "development"
): Promise<string> {
  await ensureSchema();
  const def = CATALOG_PROJECTS.find((p) => p.slug === projectSlug);
  if (!def) return "/media/katalog/egitim/sinav-salonu-genis-1280.webp";

  const mediaRes = await dbQuery<{ file_url: string; consent_verified: boolean }>(
    `SELECT file_url, consent_verified FROM cms_media WHERE file_key = $1 LIMIT 1`,
    [def.heroImageKey]
  );

  const heroRow = mediaRes.rows[0];
  if (nodeEnv === "production" && heroRow && !heroRow.consent_verified) {
    if (def.fallbackHeroImageKey) {
      const fbRes = await dbQuery<{ file_url: string }>(
        `SELECT file_url FROM cms_media WHERE file_key = $1 LIMIT 1`,
        [def.fallbackHeroImageKey]
      );
      if (fbRes.rows[0]?.file_url) {
        return fbRes.rows[0].file_url;
      }
    }
    return "/media/katalog/egitim/mushaf-okuyan-talebe-1280.webp";
  }

  return heroRow?.file_url || `/media/katalog/${def.heroImageKey.replace(/^rasmlar\//, "")}`;
}

export function getHomepageCatalogNumbers() {
  return {
    currentStats: {
      sectionTitle: {
        tr: "Rakamlarla Vakfımız",
        uz: "Raqamlarda Vaqfimiz",
        en: "Our Foundation in Numbers",
        ar: "وقفنا في أرقام"
      },
      badgeLabel: {
        tr: "Katalog verisi",
        uz: "Katalog ma'lumoti",
        en: "Catalog data",
        ar: "بيانات الدليل"
      },
      source: "katalog-2026",
      needsReview: true,
      items: [
        {
          key: "total_students",
          value: "380+",
          detailTr: "Akademi 120+, Medrese 150+, Kadın Medresesi 50+, Kur'an Kursu 60",
          label: {
            tr: "İlim Talebesi",
            uz: "Ilm toliblari",
            en: "Students of Knowledge",
            ar: "طالب علم"
          }
        },
        {
          key: "annual_lecture_hours",
          value: "1.296",
          detailTr: "Mezana Akademisi yıllık ders saati",
          label: {
            tr: "Yıllık Ders Saati",
            uz: "Yillik dars soati",
            en: "Annual Lecture Hours",
            ar: "ساعة دراسية سنوياً"
          }
        },
        {
          key: "education_housing_spend_23_24",
          value: "800.000 $+",
          detailTr: "2023-2024 öğretim yılı eğitim ve barınma harcaması",
          label: {
            tr: "2023-2024 Eğitim ve Barınma Gideri",
            uz: "2023-2024 ta'lim va yotoqxona xarajati",
            en: "2023-2024 Education & Housing Spend",
            ar: "نفقات التعليم والسكن ٢٠٢٣-٢٠٢٤"
          }
        },
        {
          key: "azon_youtube_subscribers",
          value: "1.320.000+",
          detailTr: "Azon TV YouTube abonesi (73.8M+ izlenme)",
          label: {
            tr: "YouTube Abonesi (Azon Global)",
            uz: "YouTube obunachilari (Azon Global)",
            en: "YouTube Subscribers (Azon Global)",
            ar: "مشتركو يوتيوب (أذان غلوبال)"
          }
        }
      ]
    },
    plannedTargets: {
      sectionTitle: {
        tr: "Gelecek Planlarımız ve Hedeflerimiz",
        uz: "Kelajak Rejalarimiz va Maqsadlarimiz",
        en: "Our Future Plans and Targets",
        ar: "خططنا وأهدافنا المستقبلية"
      },
      isPlannedTarget: true,
      items: [
        { key: "planned_iftar", value: "1.000 / gün", label: { tr: "Ramazan İftar Hedefi", uz: "Ramazon iftorlik rejasi", en: "Daily Ramadan Iftar Target", ar: "هدف الإفطار اليومي" } },
        { key: "planned_gida", value: "5.000 adet", label: { tr: "Gıda Paketi Hedefi", uz: "Oziq-ovqat qutisi rejasi", en: "Food Parcel Target", ar: "هدف السلال الغذائية" } },
        { key: "planned_burs", value: "500 öğrenci", label: { tr: "Burs Hedefi", uz: "Stipendiya rejasi", en: "Scholarship Target", ar: "هدف المنح الدراسية" } },
        { key: "planned_yetim", value: "1.000 yetim", label: { tr: "Yetim Bakımı Hedefi", uz: "Yetimlar kafolati rejasi", en: "Orphan Care Target", ar: "هدف كفالة الأيتام" } },
        { key: "planned_kurban", value: "500 hisse", label: { tr: "Kurban Dağıtım Hedefi", uz: "Qurbonlik ulashish rejasi", en: "Qurbani Target", ar: "هدف الأضاحي" } }
      ]
    }
  };
}

export async function seedCatalogContentIntoCms() {
  await ensureSchema();

  // 1-bosqichdagi namunaviy loyihalarni 'draft' holatiga o'tkazish (o'chirilmaydi)
  await dbQuery(
    `UPDATE cms_projects
     SET status = 'draft', updated_at = NOW()
     WHERE slug IN (
       'istanbul-ogrenci-yurdu',
       'turkistan-egitim-merkezi',
       'dijital-kutuphane',
       'mezana-akademisi-egitim-programi',
       'sosyal-yardim-ve-kardes-aile'
     )`
  );

  // Sahifalarni (hakkimizda, hakkimizda/vakif-nedir, yonetim) katalog matni bilan to'ldirish
  const pagesToUpsert = [
    {
      slug: "hakkimizda",
      title: {
        tr: "Hakkımızda — Hakka Davetin Kutlu Sedası",
        uz: "Biz haqimizda — Haqqa Da'vatning Qutlug' Sadosi",
        en: "About Us — The Blessed Call to Truth",
        ar: "من نحن — نداء الحق المبارك"
      },
      summary: {
        tr: "2023 yılında İstanbul'da kurulan Ezan Vakfı; ilim, eğitim, medya ve hayır faaliyetleriyle Türkiye ve İslam dünyası arasında köprü kurmaktadır.",
        uz: "2023-yilda Istanbulda tashkil etilgan Ezan Vakfı ilm, ta'lim, media va xayriya faoliyatlari orqali Turkiya va Islom olami o'rtasida ko'prik bunyod etmoqda.",
        en: "Founded in Istanbul in 2023, Ezan Foundation builds bridges between Türkiye, Central Asia, and the Islamic world through education, scholarship, and charity.",
        ar: "تأسس وقف أذان في إسطنبول عام ٢٠٢٣ لبناء جسور العلم والتربية والخير بين تركيا وآسيا الوسطى والعالم الإسلامي."
      },
      body: {
        tr: `Vakfımız, 2023 yılında İstanbul'da kurulmuş olup, insanları Hakk'a ve hakikate davet eden, birlik ve beraberliği tesis etmeyi gaye edinen bir kuruluştur.
Vakfımız, Ezan-ı Muhammedî'nin manasına riayet ederek Rabb'ine ahde vefayı hayatına esas edinmiş nesiller yetiştirmeyi hedeflemiştir.

Misyonumuz: İnsan haklarına ve çevreye saygılı, toplumun milli ve manevi değerlerine ehemmiyet veren, yüksek hizmet ahlakına sahip, gelişme ve teceddüde devamlı açık, davası için her türlü fedakârlığı yapabilecek, şûra merkezli hizmet eden, tarih ve milli şuur sahibi, başarılı, faziletli, nezahet ve nezaket şuuruna sahip dava adamları yetiştirmek, Türkiye ve İslam dünyası arasında köprü kurmaktır.

Vizyonumuz: Büyük Türk-İslam coğrafyasında binlerce yıl ilim ve medeniyet sahasında elde edilen şanlı ve köklü misyonu ihya etmek ve yeni nesillere aktarmak, genç nesillerin ecdadına ve medeniyetine sahip çıkması için daha eğitimli ve kültürel yönden gelişmesine yardımcı olmak, İslam dünyası ile kendi arasında kardeşlik bilincini oluşturmak, ortak akıl ve istişare içinde hareket etmek, Türkiye ile tarihsel bağları olan Orta Asya topluluklarına din eğitimi vermede, onlara kültürel ve insani yardım hizmetleri konusunda öncülük etmektir.

Ezan Vakfı Olarak Amacımız:
1. Ezan'ın hakikati olan; insanlığı Hakk'a ve hakikate davet etmek, Ulûhiyet ve Rubûbiyeti ilan etmek, birlik ve beraberliği temin etmek,
2. Bu manaya hizmet maksadıyla tüm kitle iletişim araçlarını ve teknolojilerini kullanarak iman hakikatlerini insanlığın muhtaç gönüllerine ulaştırmak,
3. Kur'an ilminin ve Peygamber ahlakının yayılması maksadıyla her türlü eğitim öğretim çalışmaları yapmak,
4. İtidalli ve yapıcı hizmet anlayışını esas alarak doğru İslamiyet'i ve İslamiyet'e layık doğruluğu yaşayan huzurlu bir toplum ihya etmek,
5. Özellikle gençlerin eğitilmesi ile ahlaklı, edepli, imanlı, dürüst, samimi, ciddi nesilleri yetiştirmek; bu nesillerin eliyle sağlıklı düşünen, barışı, adaleti, hakkaniyeti ve dürüstlüğü prensip haline getirmiş bir insanlık inşa etmek,
6. Türkiye, Orta Asya halkları ve diğer İslam dünyası arasındaki sosyal, ticari ve milli şuuru geliştirmek; birlik ve beraberliği, yardımlaşma ve dayanışmayı sağlamak, sorunların çözülmesine ilişkin faaliyetlerde bulunmak,
7. Yardıma muhtaç insanların ihtiyaçlarını karşılamak; insanların sosyal sorumluluk bilincini, yardımlaşma ve dayanışma duygusunu ve kültürünü geliştirmek; çeşitli öğrenim dallarında okuyan ihtiyaç sahibi öğrencilere eğitim yardımı ve burs vermek, onların maddi-manevi ihtiyaçlarını karşılamak; eğitim-öğretim kurumları ve kurslar açmak, barınmaları için yurtlar yapmak; insanımızın ve öğrencilerin tarihi şuur ve bilgilerini geliştirmek,
8. Yetim veya istismara uğramış, koruma altına alınmış, madde bağımlısı, engelli çocuklar ve gençler için her türlü müessese açmak ve işletmek.

Gayret bizden, muvaffakiyet Allah'tandır…`,
        uz: `Vaqfimiz 2023-yilda Istanbulda tashkil etilgan bo'lib, insonlarni Haqqa va haqiqatga da'vat etuvchi, birlik va hamjihatlikni qaror toptirishni maqsad qilgan muassasadir.

Missiyamiz: Inson huquqlari va atrof-muhitga hurmat bilan qaraydigan, jamiyatning milliy va ma'naviy qadriyatlariga e'tibor beradigan, yuksak xizmat axloqiga ega, sho'ro va mashvarat asosida ish yurituvchi, tarix va milliy shuur sohibi bo'lgan fazilatli avlodlarni yetishtirish hamda Turkiya va Islom olami o'rtasida ko'prik o'rnatishdir.

Vizyonimiz: Buyuk Turkiy-Islom jug'rofiyasida ming yillar davomida ilm va tamaddun sohasida erishilgan shonli merosni tiklash va yangi avlodlarga yetkazish, Turkiya bilan tarixiy rishtalarga ega Markaziy Osiyo xalqlariga diniy ta'lim, madaniy va insonparvarlik yordami ko'rsatishda yetakchilik qilishdir.

G'ayrat bizdan, tavfiq va muvaffaqiyat Allohdandir...`,
        en: `Founded in Istanbul in 2023, Ezan Foundation is dedicated to calling humanity to truth, fostering unity, and building bridges of knowledge and compassion between Türkiye, Central Asia, and the Islamic world across 8 foundational objectives. Effort is from us, success is from Allah...`,
        ar: `تأسس وقف أذان في إسطنبول عام ٢٠٢٣ للدعوة إلى الحق وترسيخ الوحدة والأخوة وبناء الجسور العلمية والتربوية والإنسانية بين تركيا وآسيا الوسطى والعالم الإسلامي. السعي منا والتوفيق من الله...`
      }
    },
    {
      slug: "hakkimizda/vakif-nedir",
      title: {
        tr: "Vakıf Nedir ve Tarihçesi",
        uz: "Vaqf Nima va Uning Tarixi",
        en: "What is a Waqf and Its History",
        ar: "ما هو الوقف وتاريخه"
      },
      summary: {
        tr: "Vakıf; bir malın aslını elde tutup getirisini Allah rızası yolunda harcamaktır. Hayrat ve akaretler kavramları ile İslam tarihinde vakıf medeniyeti.",
        uz: "Vaqf — bir mulkning aslini saqlab, undan keladigan manfaatni Alloh rizosi yo'lida sarflashdir. Xayrot va aqorot tushunchalari hamda Islomda vaqf madaniyati.",
        en: "In Islamic law, Waqf means preserving the principal of an asset while dedicating its yield for the sake of Allah—comprising 'hayrat' (direct public service) and 'akaretler' (revenue-generating endowments).",
        ar: "الوقف في الشريعة هو حبس الأصل وتسبيل المنفعة في سبيل الله، وينقسم إلى الخيرات والعقارات المدرة للدخل."
      },
      body: {
        tr: `"Vakf" Arapça bir kelime olup sözlükteki manası "durdurmak", "elde tutmak" demektir. Şeriat terimi olarak da bir malın aslını elde tutup getirisini Allah rızası yolunda harcamak demektir.

Vakıflar faydalanma yönüne göre ikiye ayrılır: Birincisi insanların faydalanması için doğrudan doğruya kamu yararına verilen bina veya müesseselerin kendisi vakfedilir, onlara "hayrat" denir. İkincisi ise bu müesseselerin ebediyen ayakta kalması ve topluma faydalı olması için ondan elde edilen gelir vakfedilir, buna "akaretler" (gelir getiren yapılar veya müesseseler) denir.

Hazret-i Ömer'in (Allah ondan razı olsun) Hayber'in fethinden sonra ganimet olarak kendilerine kalan yerleri satılmaması, miras bırakılmaması ve hediye edilmemesi şartıyla fakirler, köleler, yolcular ve Allah yolundaki insanlar tarafından faydalanmak üzere vermesi tarihteki ilk vakıf olarak kabul edilir.

Bilhassa "Allah yolunda sevdiğiniz şeylerden harcamadıkça iyiliğe asla eremezsiniz. Ne harcarsanız Allah onu hakkıyla bilir." (Âl-i İmrân, 92) ayeti vakıf düşüncesinin doğuşuna esas teşkil etmiştir. Bugün Medine'de Hazret-i Osman (r.a.) tarafından kurulan vakfın halen var olması ve insanlara hizmet etmeye devam etmesi bunun canlı ispatıdır.`,
        uz: `"Vaqf" arabcha so'z bo'lib, lug'atda "to'xtatib turish", "ushlab qolish" ma'nolarini anglatadi. Shar'iy istilohda esa bir mulkning aslini saqlab qolib, undan keladigan daromad va manfaatni Alloh rizosi yo'lida xalq manfaati uchun sarflash demakdir. Vaqflar ikki turga bo'linadi: bevosita xalq foydalanishi uchun vaqf qilingan muassasalar "xayrot", ularni ta'minlab turuvchi daromad manbalari esa "aqorot" deyiladi. Hazrati Umar (r.a.) Xaybar fathidan so'ng vaqf qilgan yerlar tarixdagi ilk vaqf hisoblanadi.`,
        en: `"Waqf" literally means "to hold or preserve," and in Islamic jurisprudence refers to preserving an asset's principal while dedicating its benefits for the sake of Allah. Endowments are divided into "hayrat" (direct public-benefit institutions) and "akaretler" (income-generating properties sustaining them), beginning with Umar ibn al-Khattab's endowment after Khaybar and Uthman ibn Affan's enduring endowment in Madinah.`,
        ar: `الوقف لغةً الحبس والمنع، واصطلاحاً حبس العين وتسبيل المنفعة لوجه الله تعالى، وينقسم إلى الخيرات والعقارات الوقفية، وأول وقف في الإسلام هو وقف عمر بن الخطاب رضي الله عنه في خيبر ووقف عثمان بن عفان رضي الله عنه بالمدينة المنورة.`
      }
    },
    {
      slug: "yonetim",
      title: {
        tr: "Yönetim ve Başkanlarımızın Mesajları",
        uz: "Rahbariyat va Raislarimiz Murojaati",
        en: "Leadership & Messages from Our Chairmen",
        ar: "الإدارة ورسائل رئيسي الوقف"
      },
      summary: {
        tr: "Mütevelli Heyet Başkanı Üstad Mübeşşir AHMED ve İcra Heyet Başkanı Ramazan ÇAMLICA'nın mesajları.",
        uz: "Vasiylik kengashi raisi Ustoz Mubashshir AHMAD va Ijroiya kengashi raisi Ramazon CHAMLIDJA murojaatlari.",
        en: "Messages from Chairman of the Board of Trustees Üstad Mübeşşir AHMED and Executive Board Chairman Ramazan ÇAMLICA.",
        ar: "كلمة رئيس مجلس الأمناء الأستاذ مبشر أحمد وكلمة رئيس الهيئة التنفيذية رمضان تشامليجا."
      },
      body: {
        tr: `Mütevelli Heyet Başkanının Mesajı — Üstad Mübeşşir AHMED:
Bugün vakıf kuruluşları geleneğini devam ettiren ve hatta anayasasında vakıfların faaliyet göstereceği ayrıca belirtilen Türkiye devletinde biz de Ezan Vakfı'nı kurduk. Maksat önce buradaki hayır işleri kervanına katılmak, yaratılmışlarla iyilikleri paylaşmak ve sonra vatanımızda da bu işleri yeniden başlatmaktır.
Vakfımız, Ezan'ın manasına uygun hizmet vermek, insanlığın itikadi, ilmi, medeni, toplumsal; bunlarla birlikte maddi ve manevi yönlerden yükselmesine destek olmak; birlik ve beraberliği sağlamak için hizmet vermektedir.

İcra Heyet Başkanının Mesajı — Ramazan ÇAMLICA:
Dostluk ve kardeşliğe açılan kapı sevgiden, dostluk ve kardeşliğin devamı vefadan geçer.
Vakfımız, Ezan'ın manasına hizmet amaçlı özveriyle yaptığı birçok çalışmayla beraber, özellikle muhabbet ve merhametin cemiyetimize yaygınlaşması adına; eğitim hayatında başarılı, araştıran, sorgulayan, öğrenen, öğreten, gelişen dünyaya ayak uydurabilecek, İslam dünyasının inşasına katkıda bulunabilecek, her türlü platformda söz sahibi olacak, öz güveni tam, mukaddesat sevdalısı, ilim irfan ile mücehhez bir gençlik yetiştirme gayreti içerisindedir.`,
        uz: `Vasiylik kengashi raisi murojaati — Ustoz Mubashshir AHMAD:
Vaqfchilik an'analarini davom ettirib kelayotgan Turkiya davlatida biz ham Ezan Vakfı'ni ta'sis etdik. Maqsadimiz — bu yerdagi xayrli ishlar karvoniga qo'shilish, ezgulikni ulashish va iqtidorli yoshlarning yuksak saviyada ta'lim olishiga ko'maklashishdir.

Ijroiya kengashi raisi murojaati — Ramazon CHAMLIDJA:
Do'stlik va birodarlik eshigi muhabbatdan, uning bardavomligi esa vafodan boshlanadi. Vaqfimiz ilm-irfon bilan qurollangan, muqaddas qadriyatlarga sodiq, o'ziga ishongan yosh avlodni tarbiyalash yo'lida xizmat qilmoqda.`,
        en: `Message from Chairman of the Board of Trustees — Üstad Mübeşşir AHMED:
We established Ezan Foundation in Türkiye to join the caravan of good works, support talented youth in receiving advanced education, and revive the blessed thousand-year tradition of endowments.

Message from Chairman of the Executive Board — Ramazan ÇAMLICA:
The door to brotherhood opens with love and endures through loyalty. Our Foundation strives to educate confident, inquisitive, and principled youth equipped with knowledge and wisdom.`,
        ar: `كلمة رئيس مجلس الأمناء — الأستاذ مبشر أحمد:
أسسنا وقف أذان في تركيا للمساهمة في قافلة الخير ودعم الشباب الموهوبين لنيل التعليم العالي وإحياء سنة الوقف العريقة.

كلمة رئيس الهيئة التنفيذية — رمضان تشامليجا:
إن باب الأخوة يفتح بالمحبة ويدوم بالوفاء، ويسعى وقفنا لإعداد جيل متسلح بالعلم والمعرفة والأخلاق الفاضلة.`
      }
    }
  ];

  for (const p of pagesToUpsert) {
    await dbQuery(
      `INSERT INTO cms_pages (slug, status, title, summary, body, needs_review, updated_at)
       VALUES ($1, 'published', $2::jsonb, $3::jsonb, $4::jsonb, '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb, NOW())
       ON CONFLICT (slug) DO UPDATE SET
         status = 'published',
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         body = EXCLUDED.body,
         updated_at = NOW()`,
      [p.slug, JSON.stringify(p.title), JSON.stringify(p.summary), JSON.stringify(p.body)]
    );
  }

  // Rahbariyat va Akademiya Ustozlari (cms_team): 10 nafar (atomik CTE bilan parallel testlarda ham dublikat bo'lmaydi)
  const teamJsonRows = OLD_SITE_TEAM.map((member) => ({
    group_type: member.group === "advisory" ? "academic" : member.group,
    sort_order: member.order,
    full_name: member.name,
    photo_url: member.photoUrl,
    role_title: member.role,
    bio: member.bio
  }));
  await dbQuery(
    `WITH cleared AS (DELETE FROM cms_team)
     INSERT INTO cms_team (group_type, sort_order, full_name, photo_url, role_title, bio, needs_review)
     SELECT
       r.group_type,
       r.sort_order,
       r.full_name,
       r.photo_url,
       r.role_title,
       r.bio,
       '{"tr":false,"uz":false,"en":false,"ar":false}'::jsonb
     FROM jsonb_to_recordset($1::jsonb) AS r(
       group_type text,
       sort_order int,
       full_name text,
       photo_url text,
       role_title jsonb,
       bio jsonb
     )`,
    [JSON.stringify(teamJsonRows)]
  );

  // 11 ta katalog loyihasini cms_projects jadvaliga yozish
  let upsertedProjects = 0;
  for (const proj of CATALOG_PROJECTS) {
    const quoteObj = proj.quoteId ? CATALOG_HADITHS_AND_QUOTES.find((q) => q.id === proj.quoteId) : null;
    const contentJson = {
      tr: proj.bodyTr,
      uz: proj.bodyUz,
      en: proj.bodyEn,
      ar: proj.bodyAr
    };

    await dbQuery(
      `INSERT INTO cms_projects (
         slug, category, project_status, project_state, status,
         title, summary, content,
         hero_image, banner_image, mobile_hero_image, illustration_image,
         gallery, stats_badge, stats_as_of,
         hadith_quote, hadith_arabic_original,
         support_campaign_slug, external_links, needs_review, updated_at
       ) VALUES (
         $1, $2, $3, $3, $4,
         $5::jsonb, $6::jsonb, $7::jsonb,
         $8, $9, $10, $11,
         $12::jsonb, $13::jsonb, $14,
         $15::jsonb, NULL,
         $16, $17::jsonb, '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb, NOW()
       )
       ON CONFLICT (slug) DO UPDATE SET
         category = EXCLUDED.category,
         project_status = EXCLUDED.project_status,
         project_state = EXCLUDED.project_state,
         status = EXCLUDED.status,
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         content = EXCLUDED.content,
         hero_image = EXCLUDED.hero_image,
         banner_image = EXCLUDED.banner_image,
         mobile_hero_image = EXCLUDED.mobile_hero_image,
         illustration_image = EXCLUDED.illustration_image,
         gallery = EXCLUDED.gallery,
         stats_badge = EXCLUDED.stats_badge,
         stats_as_of = EXCLUDED.stats_as_of,
         hadith_quote = EXCLUDED.hadith_quote,
         support_campaign_slug = EXCLUDED.support_campaign_slug,
         external_links = EXCLUDED.external_links,
         updated_at = NOW()`,
      [
        proj.slug,
        proj.category,
        proj.projectState,
        proj.status,
        JSON.stringify(proj.title),
        JSON.stringify(proj.summary),
        JSON.stringify(contentJson),
        proj.heroImageKey,
        proj.bannerImageKey || null,
        proj.mobileHeroImageKey || null,
        proj.illustrationImageKey || null,
        JSON.stringify(proj.galleryImageKeys),
        JSON.stringify(proj.statsBadge),
        proj.statsBadge.asOf,
        JSON.stringify(quoteObj || {}),
        proj.supportCampaignSlug,
        JSON.stringify(proj.externalLinks || [])
      ]
    );
    upsertedProjects++;
  }

  // Hadislar, Bosh sahifa katalog raqamlari va eski ezanvakfi.org saytidan tasdiqlangan rasmiy aloqa/IBAN/ijtimoiy tarmoqlarni cms_site_settings jadvaliga saqlash
  const cleanSiteSettings = {
    foundationName: {
      tr: "Ezan Vakfı",
      uz: "Azon Vaqfi (Ezan Vakfı)",
      en: "Ezan Foundation",
      ar: "وقف الأذان (Ezan Vakfı)"
    },
    contact: {
      address: OLD_SITE_SETTINGS.contact.address,
      phone: OLD_SITE_SETTINGS.contact.phone,
      email: OLD_SITE_SETTINGS.contact.email,
      whatsapp: OLD_SITE_SETTINGS.contact.phone,
      mapEmbedUrl: OLD_SITE_SETTINGS.contact.mapEmbedUrl
    },
    bankAccounts: OLD_SITE_SETTINGS.bankAccounts,
    socialLinks: {
      youtube: OLD_SITE_SETTINGS.socialLinks.youtube,
      instagram: OLD_SITE_SETTINGS.socialLinks.instagram,
      telegram: OLD_SITE_SETTINGS.socialLinks.telegram,
      x: OLD_SITE_SETTINGS.socialLinks.x,
      facebook: OLD_SITE_SETTINGS.socialLinks.facebook,
      tiktok: "",
      whatsappChannel: OLD_SITE_SETTINGS.socialLinks.whatsapp
    },
    stats: [],
    announcementBanner: {
      enabled: false,
      text: { tr: "", uz: "", en: "", ar: "" }
    }
  };

  await dbQuery(
    `INSERT INTO cms_site_settings (key, value, updated_at)
     VALUES
       ('siteSettings', $3::jsonb, NOW()),
       ('catalog_quotes', $1::jsonb, NOW()),
       ('homepage_catalog_numbers', $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_at = NOW()`,
    [
      JSON.stringify(CATALOG_HADITHS_AND_QUOTES),
      JSON.stringify(getHomepageCatalogNumbers()),
      JSON.stringify(cleanSiteSettings)
    ]
  );

  // Kampaniyalarni katalog matni bilan yangilash va target_amount = NULL qilish
  await dbQuery(`ALTER TABLE cms_campaigns ALTER COLUMN target_amount DROP NOT NULL`);
  await dbQuery(`UPDATE cms_campaigns SET target_amount = NULL`);
  // Sinov paytida yaratilgan dublikat kampaniyalarni draft qilish
  await dbQuery(
    `UPDATE cms_campaigns SET status = 'draft'
     WHERE slug NOT IN ('mezana-akademisi-egitim-bursu', 'ramazan-2027-iftar-ve-kumanya', 'genel-bagis', 'zekat-ve-fitre-fonu', 'fitre', 'fidye')`
  );

  for (const c of CATALOG_CAMPAIGNS) {
    await dbQuery(
      `INSERT INTO cms_campaigns (
         slug, purpose_code, status, restricted, currency,
         target_amount, collected_amount, preset_amounts,
         cover_image, side_image,
         title, summary, description, needs_review, updated_at
       ) VALUES (
         $1, $2, 'published', $3, 'TRY',
         NULL, 0, $4::jsonb,
         $5, $6,
         $7::jsonb, $8::jsonb, $9::jsonb, '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb, NOW()
       )
       ON CONFLICT (slug) DO UPDATE SET
         purpose_code = EXCLUDED.purpose_code,
         status = 'published',
         restricted = EXCLUDED.restricted,
         target_amount = NULL,
         preset_amounts = EXCLUDED.preset_amounts,
         cover_image = EXCLUDED.cover_image,
         side_image = EXCLUDED.side_image,
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         description = EXCLUDED.description,
         updated_at = NOW()`,
      [
        c.slug,
        c.purposeCode,
        c.restricted,
        JSON.stringify(c.presetAmounts),
        c.coverImage,
        c.sideImage,
        JSON.stringify(c.title),
        JSON.stringify(c.summary),
        JSON.stringify(c.description)
      ]
    );
  }

  // Sodir bo'lmagan 2027 seed yangiliklarini 'draft' holatiga o'tkazish va eski ezanvakfi.org saytidan tasdiqlangan 9 ta haqiqiy yangilikni 'published' holatda saqlash
  const publishedNewsSlugs = OLD_SITE_NEWS.map((n) => n.slug);
  await dbQuery(
    `UPDATE cms_news SET status = 'draft', updated_at = NOW() WHERE slug <> ALL($1::text[])`,
    [publishedNewsSlugs]
  );

  for (const n of OLD_SITE_NEWS) {
    await dbQuery(
      `INSERT INTO cms_news (slug, status, published_at, category, image_url, title, excerpt, body, needs_review, updated_at)
       VALUES ($1, 'published', $2, 'general', $3, $4::jsonb, $5::jsonb, $6::jsonb, '{"tr":false,"uz":false,"en":false,"ar":false}'::jsonb, NOW())
       ON CONFLICT (slug) DO UPDATE SET
         status = 'published',
         published_at = EXCLUDED.published_at,
         image_url = EXCLUDED.image_url,
         title = EXCLUDED.title,
         excerpt = EXCLUDED.excerpt,
         body = EXCLUDED.body,
         updated_at = NOW()`,
      [
        n.slug,
        n.publishedAt,
        n.imageUrl,
        JSON.stringify(n.title),
        JSON.stringify(n.excerpt),
        JSON.stringify(n.body)
      ]
    );
  }

  // Soxta / [TASLIK] videolarni 'draft' holatiga o'tkazish va haqiqiy tanishtiruv videosini atomik CTE bilan 'published' qilish
  const videoJsonRows = OLD_SITE_VIDEOS.map((v) => ({
    youtube_id: v.youtubeId,
    project_slug: v.projectSlug,
    published_at: v.publishedAt,
    title: v.title,
    description: v.description
  }));
  await dbQuery(
    `WITH drafted AS (
       UPDATE cms_videos SET status = 'draft' WHERE youtube_id <> ALL(SELECT (x->>'youtube_id') FROM jsonb_array_elements($1::jsonb) AS x)
     ),
     deleted AS (
       DELETE FROM cms_videos WHERE youtube_id = ANY(SELECT (x->>'youtube_id') FROM jsonb_array_elements($1::jsonb) AS x)
     )
     INSERT INTO cms_videos (youtube_id, category, project_slug, status, published_at, title, description, needs_review, created_at)
     SELECT
       r.youtube_id,
       'general',
       r.project_slug,
       'published',
       r.published_at::timestamptz,
       r.title,
       r.description,
       '{"tr":false,"uz":false,"en":false,"ar":false}'::jsonb,
       NOW()
     FROM jsonb_to_recordset($1::jsonb) AS r(
       youtube_id text,
       project_slug text,
       published_at text,
       title jsonb,
       description jsonb
     )`,
    [JSON.stringify(videoJsonRows)]
  );

  // Eski ezanvakfi.org saytidan tasdiqlangan 5 ta to'liq FAQ savol-javoblarini atomik CTE bilan yozish
  const faqJsonRows = OLD_SITE_FAQS.map((f) => ({
    category: f.category,
    sort_order: f.order,
    question: f.question,
    answer: f.answer
  }));
  await dbQuery(
    `WITH cleared AS (DELETE FROM cms_faqs)
     INSERT INTO cms_faqs (category, sort_order, question, answer, needs_review)
     SELECT
       r.category,
       r.sort_order,
       r.question,
       r.answer,
       '{"tr":false,"uz":false,"en":false,"ar":false}'::jsonb
     FROM jsonb_to_recordset($1::jsonb) AS r(
       category text,
       sort_order int,
       question jsonb,
       answer jsonb
     )`,
    [JSON.stringify(faqJsonRows)]
  );

  // Rais portreti (mutevelli-heyet-baskani.jpg) tasdiqlanmagani uchun needs_review = true va alt matnda ism yo'q
  await dbQuery(
    `UPDATE cms_media
     SET
       alt_text = '{"tr":"Mütevelli Heyet Başkanı otururken konuşuyor","uz":"Vasiylar kengashi raisi o''tirgan holda suhbatlashmoqda","en":"Chairman of the Board of Trustees speaking while seated","ar":"رئيس مجلس الأمناء يتحدث جالساً"}'::jsonb,
       needs_review = '{"tr":true,"uz":true,"en":true,"ar":true}'::jsonb
     WHERE file_key = 'rasmlar/hakkimizda/mutevelli-heyet-baskani.jpg'`
  );

  return {
    upsertedProjects,
    activeProjectsCount: CATALOG_PROJECTS.filter((p) => p.projectState === "davom etmoqda").length,
    plannedProjectsCount: CATALOG_PROJECTS.filter((p) => p.projectState === "planlanan").length,
    quotesCount: CATALOG_HADITHS_AND_QUOTES.length
  };
}
