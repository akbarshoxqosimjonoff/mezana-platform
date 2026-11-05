import { dbQuery, ensureSchema } from "./schema";

export async function seedDatabase(): Promise<{ seeded: boolean }> {
  await ensureSchema();

  await dbQuery(
    `INSERT INTO cms_users (email, full_name, role, password_hash, totp_secret, totp_enabled)
     VALUES
       ('admin@ezanvakfi.org', 'Ezan Vakfı Sistem Yöneticisi', 'admin', 'scrypt:ezan_admin_2027', 'JBSWY3DPEHPK3PXP', TRUE),
       ('editor@ezanvakfi.org', 'İçerik Editörü', 'editor', 'scrypt:ezan_editor_2027', 'JBSWY3DPEHPK3PXP', TRUE),
       ('translator@ezanvakfi.org', 'Mütercim (UZ/EN/AR)', 'translator', 'scrypt:ezan_translator_2027', 'JBSWY3DPEHPK3PXP', TRUE),
       ('finance@ezanvakfi.org', 'Mali İşler Uzmanı', 'finance', 'scrypt:ezan_finance_2027', 'JBSWY3DPEHPK3PXP', TRUE)
     ON CONFLICT (email) DO NOTHING`
  );

  const siteSettings = {
    foundationName: {
      tr: "Ezan Vakfı",
      uz: "Azon Vaqfi (Ezan Vakfı)",
      en: "Ezan Foundation",
      ar: "وقف الأذان (Ezan Vakfı)"
    },
    contact: {
      address: "[TASLIK] Başakşehir / İstanbul, Türkiye",
      phone: "[TASLIK]",
      email: "bilgi@ezanvakfi.org",
      whatsapp: "",
      mapEmbedUrl: ""
    },
    bankAccounts: [
      {
        bankName: "Kuveyt Türk Katılım Bankası [TASLIK]",
        branch: "Başakşehir Şubesi [TASLIK]",
        accountHolder: "Ezan Vakfı [TASLIK]",
        currency: "TRY",
        iban: "TR00 0000 0000 0000 0000 0000 00 [TASLIK]"
      },
      {
        bankName: "Ziraat Katılım Bankası [TASLIK]",
        branch: "İstanbul [TASLIK]",
        accountHolder: "Ezan Vakfı [TASLIK]",
        currency: "USD",
        iban: "TR00 0000 0000 0000 0000 0000 01 [TASLIK]"
      }
    ],
    socialLinks: {
      youtube: "",
      instagram: "",
      telegram: "",
      facebook: "",
      x: "",
      tiktok: "",
      whatsappChannel: ""
    },
    stats: [],
    announcementBanner: {
      enabled: true,
      text: {
        tr: "[TASLIK] Ezan Vakfı resmi web sitesi 1. aşama yayını. Ramazan 2027 hazırlıkları devam ediyor.",
        uz: "[TASLIK] Azon Vaqfi rasmiy veb-sayti 1-bosqich talqini. Ramazon 2027 tayyorgarliklari davom etmoqda.",
        en: "[TASLIK] Ezan Foundation official website Phase 1 launch. Ramadan 2027 preparations underway.",
        ar: "[TASLIK] الموقع الرسمي لوقف الأذان - المرحلة الأولى. الاستعدادات لشهر رمضان 2027 مستمرة."
      }
    }
  };

  await dbQuery(
    `INSERT INTO cms_site_settings (key, value, updated_at)
     VALUES ('siteSettings', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(siteSettings)]
  );

  const campaigns = [
    {
      slug: "mezana-akademisi-egitim-bursu",
      purposeCode: "EGITIM-BURS",
      restricted: true,
      targetAmount: 500000,
      collectedAmount: 0,
      presetAmounts: [250, 500, 1500, 3000],
      startDate: "2026-11-01",
      endDate: "2027-06-30",
      title: {
        tr: "Mezana Akademisi Öğrenci Eğitim ve Burs Destek Kampanyası [TASLIK]",
        uz: "Mezana Akademiyasi talabalari ta'lim va stipendiya kampaniyasi [TASLIK]",
        en: "Mezana Academy Student Education & Scholarship Campaign [TASLIK]",
        ar: "حملة منح الطلاب والتعليم في أكاديمية ميزانا [TASLIK]"
      },
      summary: {
        tr: "İlim tahsil eden öğrencilerin barınma, yemek ve eğitim giderlerine destek olun. [TASLIK]",
        uz: "Ilm olayotgan talabalarning yotoqxona, oshxona va o'quv xarajatlariga hissa qo'shing. [TASLIK]",
        en: "Support accommodation, meals, and educational needs of students seeking knowledge. [TASLIK]",
        ar: "ساهم في تغطية نفقات السكن والإعاشة والتعليم لطلاب العلم في الوقف. [TASLIK]"
      },
      description: {
        tr: "Bu kampanya kapsamında toplanan şartlı bağışlar yalnızca Mezana Akademisi öğrencilerinin eğitim, kitap ve iaşe giderleri için kullanılır. [TASLIK]",
        uz: "Ushbu kampaniya doirasida yig'ilgan maqsadli xayriyalar faqat Mezana Akademiyasi o'quvchilarining ta'lim, kitob va oziq-ovqat ehtiyojlariga yo'naltiriladi. [TASLIK]",
        en: "Restricted donations collected under this campaign are strictly allocated to tuition, books, and meals for Mezana Academy students. [TASLIK]",
        ar: "تُخصص التبرعات المشروطة في هذه الحملة حصرياً لنفقات التعليم والكتب والإعاشة لطلاب أكاديمية ميزانا. [TASLIK]"
      }
    },
    {
      slug: "ramazan-2027-iftar-ve-kumanya",
      purposeCode: "RAMAZAN-IFTAR",
      restricted: true,
      targetAmount: 750000,
      collectedAmount: 0,
      presetAmounts: [300, 600, 1200, 3000],
      startDate: "2027-01-01",
      endDate: "2027-03-15",
      title: {
        tr: "Ramazan 2027 İftar Sofrası ve İhtiyaç Sahibi Kumanya Paketi [TASLIK]",
        uz: "Ramazon 2027 iftorlik dasturxoni va ehtiyojmand oilalar oziq-ovqat to'plami [TASLIK]",
        en: "Ramadan 2027 Iftar Meals & Family Food Parcels [TASLIK]",
        ar: "حملة إفطار صائم والطرود الغذائية لشهر رمضان 2027 [TASLIK]"
      },
      summary: {
        tr: "Ramazan ayında öğrencilerimiz ve ihtiyaç sahibi aileler için kurulan iftar sofralarına ortak olun. [TASLIK]",
        uz: "Ramazon oyida talabalar va ehtiyojmand oilalar uchun yoziladigan iftorlik dasturxonlariga sherik bo'ling. [TASLIK]",
        en: "Share the blessings of Ramadan by sponsoring Iftar tables and food parcels for students and families. [TASLIK]",
        ar: "شارك في الأجر عبر رعاية موائد الإفطار والطرود الغذائية للطلاب والأسر المتعففة في رمضان. [TASLIK]"
      },
      description: {
        tr: "Ramazan 2027 boyunca vakıf merkezimizde ve ihtiyaç sahibi hanelerde iftar ikramı ve kumanya dağıtımı gerçekleştirilecektir. [TASLIK]",
        uz: "Ramazon 2027 davomida vaqf markazimizda va ehtiyojmand xonadonlarda iftorlik hamda oziq-ovqat ulashiladi. [TASLIK]",
        en: "Throughout Ramadan 2027, daily Iftar meals and food packages will be distributed at our foundation center and to families in need. [TASLIK]",
        ar: "طوال شهر رمضان 2027، سيتم تقديم وجبات الإفطار وتوزيع السلال الغذائية في مركز الوقف وللأسر المحتاجة. [TASLIK]"
      }
    },
    {
      slug: "genel-bagis",
      purposeCode: "GENEL-BAGIS",
      restricted: false,
      targetAmount: 0,
      collectedAmount: 0,
      presetAmounts: [100, 250, 500, 1000],
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      title: {
        tr: "Genel Vakıf Bağışı (Sadaka ve Hayrat) [TASLIK]",
        uz: "Umumiy vaqf xayriyasi (Sadaqa va xayr-ehson) [TASLIK]",
        en: "General Endowment Donation (Sadaqah) [TASLIK]",
        ar: "تبرع عام للوقف (صدقة وخيرات) [TASLIK]"
      },
      summary: {
        tr: "Vakfımızın eğitim, kültür ve sosyal yardım faaliyetlerinin genel giderlerine destek olun. [TASLIK]",
        uz: "Vaqfimizning ta'lim, ma'rifat va ijtimoiy ko'mak faoliyatiga umumiy hissa qo'shing. [TASLIK]",
        en: "Support the ongoing educational, cultural, and social welfare operations of Ezan Foundation. [TASLIK]",
        ar: "ادعم الأنشطة التعليمية والثقافية والاجتماعية المستمرة لوقف الأذان. [TASLIK]"
      },
      description: {
        tr: "Genel bağışlar vakfımızın en acil eğitim ve hayri hizmetlerinde değerlendirilir. [TASLIK]",
        uz: "Umumiy xayriyalar vaqfning eng zarur ta'lim va xayriya xizmatlariga sarflanadi. [TASLIK]",
        en: "Unrestricted donations are utilized where most needed across our educational and charitable services. [TASLIK]",
        ar: "تُستخدم التبرعات العامة في تلبية الاحتياجات الأكثر إلحاحاً في برامج الوقف التعليمية والخيرية. [TASLIK]"
      }
    },
    {
      slug: "zekat-ve-fitre-fonu",
      purposeCode: "ZEKAT-FONU",
      restricted: true,
      targetAmount: 0,
      collectedAmount: 0,
      presetAmounts: [500, 1000, 2500, 5000],
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      title: {
        tr: "Zekât ve Fitre Fonu [TASLIK]",
        uz: "Zakot va Fitr sadaqasi fondi [TASLIK]",
        en: "Zakat & Fitr Fund [TASLIK]",
        ar: "صندوق الزكاة وزكاة الفطر [TASLIK]"
      },
      summary: {
        tr: "Zekât ve fitre bağışlarınız İslami ölçülere riayet edilerek ihtiyaç sahibi talebe ve ailelere ulaştırılır. [TASLIK]",
        uz: "Zakot va fitr xayriyalaringiz shar'iy qoidalarga muvofiq haqdor talabalar va ehtiyojmandlarga yetkaziladi. [TASLIK]",
        en: "Your Zakat and Fitr contributions are distributed strictly to eligible students and families in accordance with Islamic principles. [TASLIK]",
        ar: "تُصرف أموال الزكاة والفطر في مصارفها الشرعية للطلاب المستحقين والأسر الفقيرة. [TASLIK]"
      },
      description: {
        tr: "Şartlı zekât fonu kurumsal işletme giderlerinde kullanılmaz; doğrudan hak sahiplerine nakdi veya ayni olarak teslim edilir. [TASLIK]",
        uz: "Maqsadli zakot fondi ma'muriy xarajatlarga ishlatilmaydi; bevosita haqdorlarga yetkaziladi. [TASLIK]",
        en: "The restricted Zakat fund is never used for administrative overhead; 100% is delivered to eligible recipients. [TASLIK]",
        ar: "لا يُستخدم صندوق الزكاة المشروط في المصاريف الإدارية، بل يُسلّم بالكامل للمستحقين شرعاً. [TASLIK]"
      }
    }
  ];

  for (const c of campaigns) {
    await dbQuery(
      `INSERT INTO cms_campaigns (
         slug, purpose_code, status, restricted, currency, target_amount, collected_amount,
         preset_amounts, start_date, end_date, title, summary, description
       ) VALUES ($1, $2, 'published', $3, 'TRY', $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         description = EXCLUDED.description`,
      [
        c.slug,
        c.purposeCode,
        c.restricted,
        c.targetAmount,
        c.collectedAmount,
        JSON.stringify(c.presetAmounts),
        c.startDate,
        c.endDate,
        JSON.stringify(c.title),
        JSON.stringify(c.summary),
        JSON.stringify(c.description)
      ]
    );
  }

  const projects = [
    {
      slug: "mezana-akademisi-egitim-programi",
      category: "education",
      projectStatus: "ongoing",
      locationName: "İstanbul [TASLIK]",
      title: {
        tr: "Mezana Akademisi İslami İlimler ve Modern Eğitim Programı [TASLIK]",
        uz: "Mezana Akademiyasi islomiy fanlar va zamonaviy ta'lim dasturi [TASLIK]",
        en: "Mezana Academy Islamic Studies & Modern Education Program [TASLIK]",
        ar: "برنامج أكاديمية ميزانا للعلوم الشرعية والتعليم الحديث [TASLIK]"
      },
      summary: {
        tr: "Gençlerin hem dini ilimlerde hem de çağdaş bilimlerde donanımlı yetişmesi için tam burslu akademi programı. [TASLIK]",
        uz: "Yoshlarning ham diniy, ham zamonaviy fanlarda yetuk bo'lib yetishishi uchun to'liq grant asosidagi akademiya dasturi. [TASLIK]",
        en: "Full-scholarship academy equipping youth with both classical Islamic scholarship and modern academic excellence. [TASLIK]",
        ar: "برنامج أكاديمي بمنح كاملة لإعداد الشباب في العلوم الشرعية والعلوم المعاصرة. [TASLIK]"
      }
    },
    {
      slug: "sosyal-yardim-ve-kardes-aile",
      category: "social_aid",
      projectStatus: "ongoing",
      locationName: "Türkiye [TASLIK]",
      title: {
        tr: "Sosyal Yardım ve Kardeş Aile Dayanışma Projesi [TASLIK]",
        uz: "Ijtimoiy ko'mak va qardosh oila birdamlik loyihasi [TASLIK]",
        en: "Social Welfare & Sister Family Solidarity Project [TASLIK]",
        ar: "مشروع التكافل الاجتماعي ومؤاخاة الأسر المحتاجة [TASLIK]"
      },
      summary: {
        tr: "İhtiyaç sahibi ailelere ve muhacir öğrencilere düzenli gıda, kışlık giyim ve barınma desteği. [TASLIK]",
        uz: "Ehtiyojmand oilalar va musofir talabalarga muntazam oziq-ovqat, qishki kiyim va turar-joy ko'magi. [TASLIK]",
        en: "Regular food, winter clothing, and housing assistance for families in need and international students. [TASLIK]",
        ar: "دعم منتظم بالغذاء والكسوة الشتوية والسكن للأسر المتعففة والطلاب الوافدين. [TASLIK]"
      }
    }
  ];

  for (const p of projects) {
    await dbQuery(
      `INSERT INTO cms_projects (slug, category, project_status, status, location_name, title, summary, content)
       VALUES ($1, $2, $3, 'published', $4, $5::jsonb, $6::jsonb, $6::jsonb)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary`,
      [p.slug, p.category, p.projectStatus, p.locationName, JSON.stringify(p.title), JSON.stringify(p.summary)]
    );
  }

  const newsItems = [
    {
      slug: "2026-2027-mezana-akademisi-yeni-donem-acilisi",
      category: "education",
      title: {
        tr: "Mezana Akademisi 2026–2027 Eğitim Dönemi Dualarla Başladı [TASLIK]",
        uz: "Mezana Akademiyasi 2026–2027 o'quv yili duolar bilan boshlandi [TASLIK]",
        en: "Mezana Academy 2026–2027 Academic Year Opened with Prayers [TASLIK]",
        ar: "افتتاح العام الدراسي 2026-2027 في أكاديمية ميزانا [TASLIK]"
      },
      excerpt: {
        tr: "Yeni eğitim döneminde farklı ülkelerden gelen talebelerimiz ders başı yaptı. [TASLIK]",
        uz: "Yangi o'quv mavsumida turli davlatlardan kelgan talabalarimiz darslarni boshladi. [TASLIK]",
        en: "Students from diverse backgrounds began their studies in our new academic semester. [TASLIK]",
        ar: "بدأ الطلاب الوافدون من مختلف البلدان دروسهم في الفصل الدراسي الجديد. [TASLIK]"
      }
    },
    {
      slug: "ramazan-2027-hazirlik-toplantisi",
      category: "campaigns",
      title: {
        tr: "Ezan Vakfı Ramazan 2027 Hayri Hizmetler Hazırlıklarına Başladı [TASLIK]",
        uz: "Azon Vaqfi Ramazon 2027 xayriya xizmatlari tayyorgarligini boshladi [TASLIK]",
        en: "Ezan Foundation Begins Preparations for Ramadan 2027 Charitable Programs [TASLIK]",
        ar: "وقف الأذان يبدأ الاستعدادات لبرامج شهر رمضان المبارك 2027 [TASLIK]"
      },
      excerpt: {
        tr: "Yaklaşan Ramazan ayı öncesinde iftar, kumanya ve zekât dağıtım planlamaları tamamlandı. [TASLIK]",
        uz: "Yaqinlashayotgan Ramazon oyi oldidan iftorlik, oziq-ovqat va zakot tarqatish rejalari tuzildi. [TASLIK]",
        en: "Planning for Iftar meals, food parcels, and Zakat distribution ahead of Ramadan 2027 has been finalized. [TASLIK]",
        ar: "تم استكمال خطط موائد الإفطار وتوزيع السلال الغذائية والزكاة استعداداً لشهر رمضان. [TASLIK]"
      }
    },
    {
      slug: "seffaflik-ve-dijital-bagis-altyapisi-yayinda",
      category: "announcement",
      title: {
        tr: "Yeni Çok Dilli Web Sitemiz ve Şeffaflık Portalımız Yayında [TASLIK]",
        uz: "Yangi 4 tilli veb-saytimiz va Shaffoflik portalimiz ishga tushdi [TASLIK]",
        en: "Our New Multilingual Website and Transparency Portal Are Live [TASLIK]",
        ar: "إطلاق موقعنا الإلكتروني الجديد متعدد اللغات وبوابة الشفافية [TASLIK]"
      },
      excerpt: {
        tr: "Türkçe, Özbekçe, İngilizce ve Arapça dillerinde hizmet veren yeni portalımızla bağış süreçleri daha şeffaf. [TASLIK]",
        uz: "Turk, o'zbek, ingliz va arab tillarida ishlovchi yangi portalimiz orqali xayriya jarayonlari yanada shaffof. [TASLIK]",
        en: "Serving in Turkish, Uzbek, English, and Arabic, our new portal brings complete transparency to charitable giving. [TASLIK]",
        ar: "بوابة جديدة بأربع لغات (التركية والأوزبكية والإنجليزية والعربية) لتعزيز الشفافية في العمل الوقفي. [TASLIK]"
      }
    }
  ];

  for (const n of newsItems) {
    await dbQuery(
      `INSERT INTO cms_news (slug, status, category, title, excerpt, body)
       VALUES ($1, 'published', $2, $3::jsonb, $4::jsonb, $4::jsonb)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, excerpt = EXCLUDED.excerpt`,
      [n.slug, n.category, JSON.stringify(n.title), JSON.stringify(n.excerpt)]
    );
  }

  await dbQuery(`DELETE FROM cms_videos`);
  const videos = [
    {
      youtubeId: "M7lc1UVf-VE",
      category: "introduction",
      projectSlug: "mezana-akademisi-egitim-programi",
      title: {
        tr: "Ezan Vakfı Tanıtım Filmi — İlim ve Hayır Köprüsü [TASLIK]",
        uz: "Azon Vaqfi tanishtiruv videosi — Ilm va ezgulik ko'prigi [TASLIK]",
        en: "Ezan Foundation Introduction — Bridge of Knowledge & Charity [TASLIK]",
        ar: "الفيلم التعريفي لوقف الأذان — جسر العلم والخير [TASLIK]"
      }
    },
    {
      youtubeId: "ysz5S6PUM-U",
      category: "education",
      projectSlug: "mezana-akademisi-egitim-programi",
      title: {
        tr: "Mezana Akademisi'nde Bir Gün — Talebelerimizin Eğitim Hayatı [TASLIK]",
        uz: "Mezana Akademiyasida bir kun — Talabalarimizning o'quv hayoti [TASLIK]",
        en: "A Day at Mezana Academy — Student Life & Studies [TASLIK]",
        ar: "يوم في أكاديمية ميزانا — الحياة التعليمية لطلابنا [TASLIK]"
      }
    },
    {
      youtubeId: "jNQXAC9IVRw",
      category: "social_aid",
      projectSlug: "sosyal-yardim-ve-kardes-aile",
      title: {
        tr: "Sosyal Yardım ve Kardeş Aile Çalışmalarımız [TASLIK]",
        uz: "Ijtimoiy yordam va qardosh oila faoliyatimiz [TASLIK]",
        en: "Our Social Aid & Family Support Operations [TASLIK]",
        ar: "أعمال التكافل الاجتماعي ودعم الأسر المتعففة [TASLIK]"
      }
    },
    {
      youtubeId: "aqz-KE-bpKQ",
      category: "ramadan",
      projectSlug: "sosyal-yardim-ve-kardes-aile",
      title: {
        tr: "Ramazan İftar Sofraları ve Kumanya Dağıtımı [TASLIK]",
        uz: "Ramazon iftorlik dasturxonlari va oziq-ovqat ulashish [TASLIK]",
        en: "Ramadan Iftar Gatherings & Food Parcel Distribution [TASLIK]",
        ar: "موائد إفطار رمضان وتوزيع السلال الغذائية [TASLIK]"
      }
    }
  ];

  for (const v of videos) {
    await dbQuery(
      `INSERT INTO cms_videos (youtube_id, category, project_slug, title, description)
       VALUES ($1, $2, $3, $4::jsonb, $4::jsonb)`,
      [v.youtubeId, v.category, v.projectSlug, JSON.stringify(v.title)]
    );
  }

  await dbQuery(`DELETE FROM cms_faqs`);
  const faqs = [
    {
      category: "donation",
      sortOrder: 1,
      question: {
        tr: "Bağışlarım nasıl kayıt altına alınıyor ve şeffaflık nasıl sağlanıyor? [TASLIK]",
        uz: "Xayriyalarim qanday qayd etiladi va shaffoflik qanday ta'minlanadi? [TASLIK]",
        en: "How are my donations recorded and how is transparency ensured? [TASLIK]",
        ar: "كيف يتم تسجيل تبرعاتي وضمان الشفافية المالية؟ [TASLIK]"
      },
      answer: {
        tr: "Her bağış benzersiz bir kayıt numarası (EZ-2027-...) alır, iç vakıf muhasebe sistemimizle senkronize edilir ve bağımsız denetim raporlarıyla paylaşılır. [TASLIK]",
        uz: "Har bir xayriya unikal raqam (EZ-2027-...) oladi, ichki vaqf moliya tizimiga sinxronlanadi va shaffoflik hisobotlarida e'lon qilinadi. [TASLIK]",
        en: "Every donation receives a unique tracking number (EZ-2027-...), syncs with our internal foundation ledger, and is published in transparency reports. [TASLIK]",
        ar: "يحصل كل تبرع على رقم مرجعي فريد (EZ-2027-...) ويتم ربطه بنظام المحاسبة الداخلي للوقف ونشره في تقارير الشفافية. [TASLIK]"
      }
    },
    {
      category: "zakat",
      sortOrder: 2,
      question: {
        tr: "Şartlı (zekât, burs) bağışlarım başka bir alanda kullanılır mı? [TASLIK]",
        uz: "Maqsadli (zakot, stipendiya) xayriyalarim boshqa maqsadda ishlatiladimi? [TASLIK]",
        en: "Are restricted donations (Zakat, scholarship) ever used for other purposes? [TASLIK]",
        ar: "هل تُستخدم التبرعات المشروطة (الزكاة، المنح) في مجالات أخرى؟ [TASLIK]"
      },
      answer: {
        tr: "Hayır. Şartlı bağışlar iç sistemimizde 'restricted=true' olarak ayrılır ve yalnızca belirttiğiniz amaca harcanır. [TASLIK]",
        uz: "Yo'q. Maqsadli xayriyalar ichki tizimda 'restricted=true' sifatida alohida hisobga olinadi va faqat tanlangan maqsadga sarflanadi. [TASLIK]",
        en: "No. Restricted donations are tracked separately with 'restricted=true' in our internal system and spent strictly on your designated purpose. [TASLIK]",
        ar: "لا، يتم تمييز التبرعات المشروطة في نظامنا الداخلي وتُصرف حصرياً في الغرض الذي حدده المتبرع. [TASLIK]"
      }
    }
  ];

  for (const f of faqs) {
    await dbQuery(
      `INSERT INTO cms_faqs (category, sort_order, question, answer)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [f.category, f.sortOrder, JSON.stringify(f.question), JSON.stringify(f.answer)]
    );
  }

  const qurbanCountries = [
    {
      code: "TR",
      active: false,
      name: { tr: "Türkiye [TASLIK]", uz: "Turkiya [TASLIK]", en: "Türkiye [TASLIK]", ar: "تركيا [TASLIK]" }
    },
    {
      code: "UZ",
      active: false,
      name: { tr: "Özbekistan [TASLIK]", uz: "O'zbekiston [TASLIK]", en: "Uzbekistan [TASLIK]", ar: "أوزبكستان [TASLIK]" }
    },
    {
      code: "AFRICA",
      active: false,
      name: { tr: "Afrika Bölgesi [TASLIK]", uz: "Afrika mintaqasi [TASLIK]", en: "Africa Region [TASLIK]", ar: "منطقة أفريقيا [TASLIK]" }
    }
  ];

  for (const qc of qurbanCountries) {
    await dbQuery(
      `INSERT INTO cms_qurban_countries (code, active, name)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
      [qc.code, qc.active, JSON.stringify(qc.name)]
    );
  }

  return { seeded: true };
}