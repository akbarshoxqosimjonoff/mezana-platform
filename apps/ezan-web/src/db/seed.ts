import { hashPasswordScrypt } from "../lib/security";
import { dbQuery, ensureSchema, getDbPool } from "./schema";
import { seedCatalogContentIntoCms } from "../cms/katalog-seed";

export async function seedDatabase(): Promise<{ seeded: boolean }> {
  await ensureSchema();

  const pool = getDbPool();
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock(20270518)");

    const totpHex = "4948474645444342414039383736353433323130";
    await dbQuery(
      `INSERT INTO cms_users (email, full_name, role, assigned_country_code, password_hash, totp_secret, totp_enabled)
       VALUES
         ('admin@ezanvakfi.org', 'Ezan Vakfı Sistem Yöneticisi', 'admin', NULL, $1, $6, TRUE),
         ('editor@ezanvakfi.org', 'İçerik Editörü', 'editor', NULL, $2, $6, TRUE),
         ('translator@ezanvakfi.org', 'Mütercim (UZ/EN/AR)', 'translator', NULL, $3, $6, TRUE),
         ('finance@ezanvakfi.org', 'Mali İşler Uzmanı', 'finance', NULL, $4, $6, TRUE),
         ('field@ezanvakfi.org', 'Saha Kurban Ekibi (Çad)', 'field', 'TD', $5, $6, TRUE)
       ON CONFLICT (email) DO UPDATE SET
         role = EXCLUDED.role,
         assigned_country_code = COALESCE(cms_users.assigned_country_code, EXCLUDED.assigned_country_code),
         password_hash = EXCLUDED.password_hash,
         totp_secret = EXCLUDED.totp_secret,
         totp_enabled = TRUE`,
      [
        hashPasswordScrypt("EzanAdmin!2027", "adminsalt20270001"),
        hashPasswordScrypt("EzanEditor!2027", "editorsalt2027001"),
        hashPasswordScrypt("EzanTrans!2027", "transsalt20270001"),
        hashPasswordScrypt("EzanFinance!2027", "finanssalt2027001"),
        hashPasswordScrypt("EzanField!2027", "fieldsalt20270001"),
        totpHex
      ]
    );

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
         VALUES ($1, $2, $3, 'draft', $4, $5::jsonb, $6::jsonb, $6::jsonb)
         ON CONFLICT (slug) DO UPDATE SET status = 'draft', title = EXCLUDED.title, summary = EXCLUDED.summary`,
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
         VALUES ($1, 'draft', $2, $3::jsonb, $4::jsonb, $4::jsonb)
         ON CONFLICT (slug) DO UPDATE SET status = 'draft', title = EXCLUDED.title, excerpt = EXCLUDED.excerpt`,
        [n.slug, n.category, JSON.stringify(n.title), JSON.stringify(n.excerpt)]
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

    // 2-bosqich: Kurban 2027 mavsumi, davlatlar va hisse takliflari (standart: [TASLIK], narxsiz va kvotasiz)
    const vekaletText = {
      tr: "[TASLIK] Kurbanımı kesmeye, kestirmeye ve etini ihtiyaç sahiplerine dağıtmaya Ezan Vakfı'nı genel vekil tayin ettim ve vekalet verdim.",
      uz: "[TASLIK] Qurbonligimni so'yishga, so'ydirishga va go'shtini muhtojlarga tarqatishga Ezan Vakfı (Azon Vaqfi)ni bosh vakil etib tayinladim va vakolat berdim.",
      en: "[TASLIK] I hereby appoint and authorize Ezan Foundation as my proxy (wakil) to slaughter my Qurbani and distribute its meat to those in need.",
      ar: "[TASLIK] وكلتُ وقف الأذان (Ezan Vakfı) وكالةً عامةً في ذبح أضحيتي وتوزيع لحومها على المستحقين والمحتاجين."
    };

    await dbQuery(
      `INSERT INTO kurban_seasons (year, eid_day_1, eid_day_2, eid_day_3, eid_day_4, sales_open_at, sales_close_at, is_active, auto_approve_videos, video_retention_days, original_retention_days, vekalet_version, vekalet_text)
       VALUES (2027, NULL, NULL, NULL, NULL, NULL, NULL, FALSE, FALSE, 365, 30, 'v2027.1-taslik', $1::jsonb)
       ON CONFLICT (year) DO UPDATE SET
         vekalet_text = EXCLUDED.vekalet_text`,
      [JSON.stringify(vekaletText)]
    );

    const phase2Countries = [
      {
        code: "TR",
        flag: "🇹🇷",
        partnerInternal: "[TASLIK] Türkiye İç Koordinasyon (Saytda ko'rinmaydi)",
        name: { tr: "Türkiye [TASLIK]", uz: "Turkiya [TASLIK]", en: "Türkiye [TASLIK]", ar: "تركيا [TASLIK]" },
        description: {
          tr: "[TASLIK] Türkiye genelinde medrese öğrencileri ve ihtiyaç sahibi aileler için kurban organizasyonu.",
          uz: "[TASLIK] Turkiya bo'ylab madrasa talabalari va ehtiyojmand oilalar uchun qurbonlik tashkiloti.",
          en: "[TASLIK] Qurbani organization across Türkiye for madrasa students and families in need.",
          ar: "[TASLIK] تنظيم الأضاحي في تركيا لطلاب العلم والأسر المتعففة."
        }
      },
      {
        code: "UZ",
        flag: "🇺🇿",
        partnerInternal: "[TASLIK] Özbekistan Yerel Partner (Saytda ko'rinmaydi)",
        name: { tr: "Özbekistan [TASLIK]", uz: "O'zbekiston [TASLIK]", en: "Uzbekistan [TASLIK]", ar: "أوزبكستان [TASLIK]" },
        description: {
          tr: "[TASLIK] Özbekistan'daki ihtiyaç sahibi aileler ve yetimler için kurban kesim ve dağıtım programı.",
          uz: "[TASLIK] O'zbekistondagi ehtiyojmand oilalar va yetimlar uchun qurbonlik so'yish va tarqatish dasturi.",
          en: "[TASLIK] Qurbani slaughter and distribution program for families in need and orphans in Uzbekistan.",
          ar: "[TASLIK] برنامج ذبح وتوزيع الأضاحي للأسر المحتاجة والأيتام في أوزبكستان."
        }
      },
      {
        code: "TD",
        flag: "🇹🇩",
        partnerInternal: "[TASLIK] Çad Saha Koordinatörlüğü (Saytda ko'rinmaydi)",
        name: { tr: "Çad [TASLIK]", uz: "Chad [TASLIK]", en: "Chad [TASLIK]", ar: "تشاد [TASLIK]" },
        description: {
          tr: "[TASLIK] Çad kırsal bölgelerindeki mazlum ve ihtiyaç sahibi ailelere kurban eti ulaştırılması.",
          uz: "[TASLIK] Chad qishloq hududlaridagi mazlum va muhtoj oilalarga qurbonlik go'shti yetkazish.",
          en: "[TASLIK] Delivering Qurbani meat to vulnerable families in rural regions of Chad.",
          ar: "[TASLIK] إيصال لحوم الأضاحي إلى الأسر الفقيرة والمحتاجة في مناطق تشاد."
        }
      },
      {
        code: "SO",
        flag: "🇸🇴",
        partnerInternal: "[TASLIK] Somali Saha Koordinatörlüğü (Saytda ko'rinmaydi)",
        name: { tr: "Somali [TASLIK]", uz: "Somali [TASLIK]", en: "Somalia [TASLIK]", ar: "الصومال [TASLIK]" },
        description: {
          tr: "[TASLIK] Somali'deki kuraklık mağduru kamplar ve medreseler için kurban organizasyonu.",
          uz: "[TASLIK] Somalidagi qurg'oqchilikdan aziyat chekkan lagerlar va madrasalar uchun qurbonlik tashkiloti.",
          en: "[TASLIK] Qurbani organization for drought-affected camps and madrasas in Somalia.",
          ar: "[TASLIK] مشروع الأضاحي للمخيمات المتضررة من الجفاف والمدارس الشرعية في الصومال."
        }
      }
    ];

    for (const c of phase2Countries) {
      await dbQuery(
        `INSERT INTO kurban_countries (code, flag, partner_internal, is_active, name, description)
         VALUES ($1, $2, $3, FALSE, $4::jsonb, $5::jsonb)
         ON CONFLICT (code) DO UPDATE SET
           flag = EXCLUDED.flag,
           name = EXCLUDED.name,
           description = EXCLUDED.description`,
        [c.code, c.flag, c.partnerInternal, JSON.stringify(c.name), JSON.stringify(c.description)]
      );

      await dbQuery(
        `INSERT INTO kurban_offers (season_year, country_code, animal_type, shares_per_animal, price_per_share_try, quota_shares, sold_shares, is_active)
         VALUES
           (2027, $1, 'sheep', 1, 0, 0, 0, FALSE),
           (2027, $1, 'cattle', 7, 0, 0, 0, FALSE)
         ON CONFLICT (season_year, country_code, animal_type) DO NOTHING`,
        [c.code]
      );
    }

    // 5-bosqich: 2025 Katalog kontentini va eski saytning tasdiqlangan ma'lumotlarini 4 tilda yuklash
    await seedCatalogContentIntoCms();

    return { seeded: true };
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock(20270518)");
    } catch {
      // ignore
    }
    lockClient.release();
  }
}
