export const OLD_SITE_SETTINGS = {
  contact: {
    phone: '+90 505 034 55 50',
    email: 'info@ezanvakfi.org',
    address: 'Atatürk Bulvarı A1 Blok Deposite İş Merkezi Kat:3 No:317 İkitelli OSB Başakşehir / İSTANBUL',
    mapEmbedUrl:
      'https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3749.3569462438895!2d28.8064403!3d41.0715524!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x14caa58307f99a65%3A0xde552d1482bafb9c!2sDeposite%20Ofis!5e1!3m2!1str!2str!4v1742982984127!5m2!1str!2str',
    vergiDairesi: '',
    vergiNo: '',
    vakifSicilNo: ''
  },
  bankAccounts: [
    {
      bankName: 'Ziraat Bankası',
      branch: 'Karagümrük / İstanbul Şubesi (Şube Kodu: 965 • Hesap No: 97833700-5001)',
      currency: 'TRY' as const,
      iban: 'TR82 0001 0009 6597 8337 0050 01',
      accountHolder: 'EZAN ORTA ASYA HALKLARI VAKFI'
    }
  ],
  socialLinks: {
    youtube: 'https://www.youtube.com/@azon_global',
    instagram: 'https://www.instagram.com/ezanvakfi/',
    telegram: 'https://t.me/azonvaqfi',
    facebook: 'https://www.facebook.com/ezanvakfi/',
    x: 'https://x.com/EzanVakfi',
    whatsapp: 'https://whatsapp.com/channel/0029VbAUvRE9hXFFVodHQ52D'
  },
  announcementBanner: {
    tr: '',
    uz: '',
    en: '',
    ar: ''
  }
};

export interface OldSiteTeamSeed {
  name: string;
  group: 'board' | 'executive' | 'advisory' | 'academic';
  order: number;
  photoUrl: string | null;
  role: { tr: string; uz: string; en: string; ar: string };
  bio: { tr: string; uz: string; en: string; ar: string };
}

export const OLD_SITE_TEAM: OldSiteTeamSeed[] = [
  {
    name: 'Üstad Mübeşşir AHMED',
    group: 'board',
    order: 1,
    photoUrl: '/media/old-site/teachers/mubashshir-ahmad.jpg',
    role: {
      tr: 'Mütevelli Heyet Başkanı',
      uz: 'Vasiylik kengashi raisi',
      en: 'Chairman of the Board of Trustees',
      ar: 'رئيس مجلس الأمناء'
    },
    bio: {
      tr: 'Ezan Vakfı Mütevelli Heyet Başkanı ve Mezana Uluslararası İlimler Akademisi kurucusu. İslami ilimler, fıkıh ve eğitim alanında çok sayıda eser ve projenin müellifidir.',
      uz: "Ezan Vakfı Vasiylik kengashi raisi va Mezana Xalqaro ilmlar akademiyasi asoschisi. Islomiy ilmlar, fiqh va ta'lim sohasida ko'plab asar hamda loyihalar muallifi.",
      en: 'Chairman of the Board of Trustees of Ezan Foundation and founder of Mezana International Academy of Sciences. Author of numerous works and educational initiatives in Islamic sciences and jurisprudence.',
      ar: 'رئيس مجلس أمناء وقف أذان ومؤسس أكاديمية مأذنة العالمية للعلوم، ومؤلف العديد من الكتب والمشاريع العلمية والتربوية.'
    }
  },
  {
    name: 'Ramazan ÇAMLICA',
    group: 'executive',
    order: 2,
    photoUrl: null,
    role: {
      tr: 'İcra Heyet Başkanı',
      uz: 'Ijroiya kengashi raisi',
      en: 'Chairman of the Executive Board',
      ar: 'رئيس الهيئة التنفيذية'
    },
    bio: {
      tr: 'Ezan Vakfı İcra Heyet Başkanı.',
      uz: 'Ezan Vakfı Ijroiya kengashi raisi.',
      en: 'Chairman of the Executive Board of Ezan Foundation.',
      ar: 'رئيس الهيئة التنفيذية لوقف أذان.'
    }
  },
  {
    name: 'Dr. Amir Muhammed Halife',
    group: 'academic',
    order: 3,
    photoUrl: '/media/old-site/teachers/dr-omir.jpg',
    role: {
      tr: 'Mezana Akademisi Öğretim Üyesi (Arap Dili ve Belagat)',
      uz: 'Mezana akademiyasi ustozi (Arab tili va balog‘at)',
      en: 'Mezana Academy Faculty Member (Arabic Language & Rhetoric)',
      ar: 'عضو هيئة التدريس في أكاديمية مأذنة (اللغة العربية والبلاغة)'
    },
    bio: {
      tr: 'Iraklı âlim ve akademisyen. 1998 yılında Bağdat İslam Üniversitesi Arap Dili ve Kur’an İlimleri bölümünden mezun olmuş, 2002’de yüksek lisansını ve 2006’da doktorasını tamamlamıştır. 2016’dan bu yana İstanbul’da çeşitli üniversite ve kurumlarda ders vermektedir.',
      uz: "Iroqlik olim va akademik. 1998-yilda Bag'dod Islom universitetining Arab tili va Qur'on ilmlari bo'limini tamomlagan, 2002-yilda magistrlik, 2006-yilda doktorlik dissertatsiyasini yoqlagan. 2016-yildan buyon Istanbuldagi universitet va ilmiy markazlarda dars berib kelmoqda.",
      en: 'Iraqi scholar and academic. Graduated from Baghdad Islamic University in Arabic Language and Quranic Sciences (1998), earning his MA in 2002 and PhD in 2006. Teaching in Istanbul since 2016.',
      ar: 'عالم وأكاديمي عراقي، تخرج في الجامعة الإسلامية ببغداد عام 1998، وحصل على الماجستير عام 2002 والدكتوراه عام 2006، ويدرّس في إسطنبول منذ عام 2016.'
    }
  },
  {
    name: 'Şeyh Eymen Cemmal',
    group: 'academic',
    order: 4,
    photoUrl: '/media/old-site/teachers/ayman.jpg',
    role: {
      tr: 'Mezana Akademisi Öğretim Üyesi (Hanefi Fıkhı ve Usulü)',
      uz: 'Mezana akademiyasi ustozi (Hanafiy fiqhi va usuli)',
      en: 'Mezana Academy Faculty Member (Hanafi Jurisprudence & Usul)',
      ar: 'عضو هيئة التدريس في أكاديمية مأذنة (الفقه الحنفي وأصوله)'
    },
    bio: {
      tr: 'Şam doğumlu âlim. Şam’ın önde gelen ulemasından Hanefi fıkhı, usul, hadis ve Arap dili ilimlerini tahsil etmiş; 30 yılı aşkın süredir İslami ilimler tedrisi ve ilmi tahkik çalışmalarıyla meşgul olmaktadır.',
      uz: "Damashqda tug'ilgan olim. Damashqning yetuk ulamolaridan Hanafiy fiqhi, usul, hadis va arab tili ilmlarini tahsil olgan; 30 yildan ortiq vaqt davomida islomiy ilmlar ta'limi va ilmiy tahqiq bilan shug'ullanib keladi.",
      en: 'Damascus-born scholar who studied Hanafi jurisprudence, legal theory, Hadith, and Arabic sciences under leading scholars of Damascus, with over 30 years of teaching and research experience.',
      ar: 'عالم دمشقي، تلقى الفقه الحنفي وأصوله والحديث وعلوم العربية على كبار علماء دمشق، وله أكثر من ثلاثين عاماً في التدريس والتحقيق العلمي.'
    }
  },
  {
    name: 'Şeyh Dr. Ahmed Fazıl',
    group: 'academic',
    order: 5,
    photoUrl: '/media/old-site/teachers/ahmad-fozil.jpg',
    role: {
      tr: 'Mezana Akademisi Öğretim Üyesi (Kur’an İlimleri ve Kıraat)',
      uz: "Mezana akademiyasi ustozi (Qur'on ilmlari va qiroat)",
      en: 'Mezana Academy Faculty Member (Quranic Sciences & Qiraat)',
      ar: 'عضو هيئة التدريس في أكاديمية مأذنة (علوم القرآن والقراءات)'
    },
    bio: {
      tr: 'Aşere kıraatlerinde icazet sahibi âlim. Fıkıh, hadis ve kıraat ilimlerinde yüksek lisans ve doktora derecelerine sahip olup Mezana Akademisi’nde tedris faaliyetlerini sürdürmektedir.',
      uz: "O'n qiroat bo'yicha ijoza sohibi bo'lgan olim. Fiqh, hadis va qiroat ilmlarida magistr va doktorlik darajalariga ega bo'lib, Mezana akademiyasida dars berib kelmoqda.",
      en: 'Scholar holding ijazah in the ten canonical Quranic readings (Qiraat), with MA and PhD degrees in Islamic jurisprudence and Hadith sciences.',
      ar: 'عالم مجاز بالقراءات العشر، حاصل على الماجستير والدكتوراه في الفقه والحديث وعلوم القراءات، ويدرّس في أكاديمية مأذنة.'
    }
  },
  {
    name: 'Abdülmecid Muhammed Haşim Cüzcani',
    group: 'academic',
    order: 6,
    photoUrl: '/media/old-site/teachers/juzjoniy.jpg',
    role: {
      tr: 'Mezana Akademisi Öğretim Üyesi (İslami İlimler ve Akide)',
      uz: 'Mezana akademiyasi ustozi (Islomiy ilmlar va aqida)',
      en: 'Mezana Academy Faculty Member (Islamic Sciences & Creed)',
      ar: 'عضو هيئة التدريس في أكاديمية مأذنة (العلوم الشرعية والعقيدة)'
    },
    bio: {
      tr: 'Medine İslam Üniversitesi mezunu âlim. 35 yılı aşkın süredir tefsir, hadis, Hanefi fıkhı, akide ve Arap dili ilimlerinde tedrisat yapmakta ve çok sayıda talebe yetiştirmektedir.',
      uz: "Madina Islom universiteti bitiruvchisi. 35 yildan ortiq vaqt mobaynida tafsir, hadis, Hanafiy fiqhi, aqida va arab tili fanlaridan dars berib, ko'plab shogirdlar yetishtirgan.",
      en: 'Graduate of the Islamic University of Madinah with over 35 years of experience teaching Tafsir, Hadith, Hanafi Fiqh, Aqeedah, and Arabic sciences.',
      ar: 'خريج الجامعة الإسلامية بالمدينة المنورة، يدرّس التفسير والحديث والفقه الحنفي والعقيدة وعلوم العربية منذ أكثر من خمسة وثلاثين عاماً.'
    }
  },
  {
    name: 'Dr. Muhammed Ekrem Ebu Ğuş',
    group: 'academic',
    order: 7,
    photoUrl: '/media/old-site/teachers/akram-abu-gush.jpg',
    role: {
      tr: 'Mezana Akademisi Öğretim Üyesi (Hadis ve Fıkıh İlimleri)',
      uz: 'Mezana akademiyasi ustozi (Hadis va fiqh ilmlari)',
      en: 'Mezana Academy Faculty Member (Hadith & Jurisprudence)',
      ar: 'عضو هيئة التدريس في أكاديمية مأذنة (علوم الحديث والفقه)'
    },
    bio: {
      tr: 'Ürdün Üniversitesi İlahiyat Fakültesi mezunu, İslami ilimler alanında yüksek lisans ve doktora sahibi akademisyen. Klasik metinler ve hadis ilimleri üzerine dersler vermektedir.',
      uz: "Iordaniya universiteti Ilohiyot fakulteti bitiruvchisi, islomiy ilmlar bo'yicha magistr va doktorlik darajasi sohibi. Mumtoz matnlar va hadis ilmlaridan dars beradi.",
      en: 'Graduate of the Faculty of Sharia at the University of Jordan with MA and PhD degrees in Islamic sciences, specializing in Hadith and classical texts.',
      ar: 'خريج كلية الشريعة بالجامعة الأردنية وحاصل على الماجستير والدكتوراه في العلوم الإسلامية، متخصص في علوم الحديث والمتون التراثية.'
    }
  },
  {
    name: 'Şeyh Dr. Muhammed Samir el-Halebî',
    group: 'academic',
    order: 8,
    photoUrl: '/media/old-site/teachers/muhammad-samir.jpg',
    role: {
      tr: 'Mezana Akademisi Öğretim Üyesi (Tefsir ve Kur’an İlimleri)',
      uz: "Mezana akademiyasi ustozi (Tafsir va Qur'on ilmlari)",
      en: 'Mezana Academy Faculty Member (Tafsir & Quranic Sciences)',
      ar: 'عضو هيئة التدريس في أكاديمية مأذنة (التفسير وعلوم القرآن)'
    },
    bio: {
      tr: 'Şam Üniversitesi Şeriat Fakültesi mezunu, Tefsir ve Kur’an İlimleri alanında yüksek lisans ve doktora sahibi âlim. Aşere kıraatlerinde icazetli olup birçok üniversite ve ilim merkezinde ders vermiştir.',
      uz: "Damashq universiteti Shariat fakulteti bitiruvchisi, Tafsir va Qur'on ilmlari bo'yicha magistr hamda doktorlik darajasi sohibi. O'n qiroat bo'yicha ijozali ustoz.",
      en: 'Graduate of Damascus University Faculty of Sharia with an MA and PhD in Tafsir and Quranic Sciences, holding ijazah in the ten canonical readings.',
      ar: 'خريج كلية الشريعة بجامعة دمشق وحاصل على الماجستير والدكتوراه في التفسير وعلوم القرآن، ومجاز بالقراءات العشر.'
    }
  },
  {
    name: 'Şeyh Ahmed el-Ahmed',
    group: 'academic',
    order: 9,
    photoUrl: '/media/old-site/teachers/ahmad-al-ahmad.jpg',
    role: {
      tr: 'Mezana Akademisi Öğretim Üyesi (Arap Dili ve Nahiv)',
      uz: 'Mezana akademiyasi ustozi (Arab tili va nahv)',
      en: 'Mezana Academy Faculty Member (Arabic Language & Grammar)',
      ar: 'عضو هيئة التدريس في أكاديمية مأذنة (اللغة العربية والنحو)'
    },
    bio: {
      tr: 'Halep Üniversitesi Arap Dili ve Edebiyatı mezunu. 20 yılı aşkın süredir Arap dili, nahiv, sarf ve belagat alanlarında ders vermekte ve klasik metin şerhleri yapmaktadır.',
      uz: "Halab universitetining Arab tili va adabiyoti bo'limi bitiruvchisi. 20 yildan ziyod vaqt davomida arab tili, nahv, sarf va balog'at fanlaridan dars berib keladi.",
      en: 'Graduate of Aleppo University in Arabic Language and Literature with over 20 years of teaching experience in Arabic grammar, morphology, and rhetoric.',
      ar: 'خريج جامعة حلب في اللغة العربية وآدابها، يدرّس النحو والصرف والبلاغة منذ أكثر من عشرين عاماً.'
    }
  },
  {
    name: 'Şeyh Muhammed Faid Avaz',
    group: 'academic',
    order: 10,
    photoUrl: '/media/old-site/teachers/muhammad-foiz-avaz.jpg',
    role: {
      tr: 'Mezana Akademisi Öğretim Üyesi (Fıkıh ve İslami İlimler)',
      uz: 'Mezana akademiyasi ustozi (Fiqh va islomiy ilmlar)',
      en: 'Mezana Academy Faculty Member (Jurisprudence & Islamic Sciences)',
      ar: 'عضو هيئة التدريس في أكاديمية مأذنة (الفقه والعلوم الشرعية)'
    },
    bio: {
      tr: 'Şam’da İslami ilimler tahsil etmiş, Ezher ve Dımaşk ulemasından icazet almış âlim. Mezana Akademisi’nde fıkıh ve temel İslami ilimler derslerini yürütmektedir.',
      uz: "Damashqda islomiy ilmlar tahsil olgan, Azhar va Damashq ulamolaridan ijoza olgan olim. Mezana akademiyasida fiqh va asosiy islomiy ilmlardan saboq beradi.",
      en: 'Trained in Islamic sciences in Damascus and holding scholarly licenses (ijazah) from scholars of Damascus and Al-Azhar, teaching jurisprudence at Mezana Academy.',
      ar: 'تلقى العلوم الشرعية في دمشق ونال إجازات علمية من علماء دمشق والأزهر، ويدرّس الفقه والعلوم الشرعية في أكاديمية مأذنة.'
    }
  }
];

export interface OldSiteNewsSeed {
  slug: string;
  imageUrl: string;
  publishedAt: string;
  title: { tr: string; uz: string; en: string; ar: string };
  excerpt: { tr: string; uz: string; en: string; ar: string };
  body: { tr: string; uz: string; en: string; ar: string };
}

export const OLD_SITE_NEWS: OldSiteNewsSeed[] = [
  {
    slug: 'vekaleten-kurban-organizasyonu',
    imageUrl: '/media/old-site/news/qurbonlik.jpg',
    publishedAt: '2025-04-01T09:00:00Z',
    title: {
      tr: 'Vekâleten Kurban Organizasyonu ve İhtiyaç Sahiplerine Et Dağıtımı',
      uz: "Vakolat orqali qurbonlik tashkiloti va ehtiyojmandlarga go'sht tarqatish",
      en: 'Proxy Qurbani Organization and Meat Distribution to Those in Need',
      ar: 'تنظيم الأضاحي بالوكالة وتوزيع اللحوم على المحتاجين'
    },
    excerpt: {
      tr: 'Ezan Vakfı olarak vekâleten kurbanlarınızı İslami usullere uygun şekilde kesiyor, ilim talebelerine ve ihtiyaç sahibi ailelere ulaştırıyoruz.',
      uz: "Ezan Vakfı sifatida vakolat orqali topshirilgan qurbonliklaringizni islomiy qoidalarga muvofiq so'yib, ilm toliblari va ehtiyojmand oilalarga yetkazamiz.",
      en: 'Ezan Foundation performs your proxy Qurbani sacrifices in full accordance with Islamic principles and distributes the meat to students of knowledge and families in need.',
      ar: 'يقوم وقف أذان بذبح الأضاحي بالوكالة وفق الضوابط الشرعية وتوزيعها على طلاب العلم والأسر المتعففة.'
    },
    body: {
      tr: 'Ezan Vakfı olarak Kurban Bayramı ve yıl boyunca adak, akika ve şükür kurbanı vekâletlerinizi titizlikle yerine getiriyoruz.\n\nKesimlerimiz İslami usullere riayet edilerek gerçekleştirilmekte, kurban etleri başta Mezana Uluslararası İlimler Akademisi’nde eğitim gören ilim talebeleri olmak üzere İstanbul’daki muhacir ve ihtiyaç sahibi ailelere ulaştırılmaktadır.',
      uz: "Ezan Vakfı sifatida Qurbon hayiti hamda yil davomida nazr, aqiqa va shukrona qurbonligi vakolatlaringizni puxtalik bilan ado etamiz.\n\nQurbonliklar islomiy qoidalarga to'liq rioya qilingan holda so'yilib, go'shtlar avvalo Mezana Xalqaro ilmlar akademiyasida tahsil olayotgan ilm toliblariga hamda Istanbuldagi muhojir va ehtiyojmand oilalarga yetkazib beriladi.",
      en: 'Throughout Eid al-Adha and the entire year, Ezan Foundation fulfills your proxy Qurbani, Udhiya, Aqiqah, and Nazar sacrifices with complete care and transparency.\n\nAll sacrifices are carried out according to Islamic rules, and the meat is distributed to students of knowledge at Mezana International Academy of Sciences as well as refugee and low-income families.',
      ar: 'ينفذ وقف أذان توكيلات الأضاحي والعقيقة والنذر طوال العام ووفق الضوابط الشرعية، ويوزع لحومها على طلاب العلم في أكاديمية مأذنة والأسر المحتاجة.'
    }
  },
  {
    slug: 'mezana-seyh-usame-rifai-ziyareti',
    imageUrl: '/media/old-site/news/mufti-of-syria.jpg',
    publishedAt: '2025-03-28T12:00:00Z',
    title: {
      tr: 'Mezana Akademisi’nden Suriye Başmüftüsü Şeyh Üsame er-Rifai’ye Tebrik Ziyareti',
      uz: "Mezana akademiyasi jamoasining Suriya bosh muftiysi Shayx Usoma ar-Rifoiyga tabrik tashrifi",
      en: 'Mezana Academy Delegation Visits Grand Mufti Sheikh Osama al-Rifai',
      ar: 'وفد أكاديمية مأذنة يزور سماحة المفتي العام الشيخ أسامة الرفاعي للتهنئة'
    },
    excerpt: {
      tr: 'Vakfımız ve Mezana Akademisi heyeti, Suriye Başmüftüsü olarak görevlendirilen büyük âlim Şeyh Üsame er-Rifai hazretlerini ziyaret ederek tebriklerini iletti.',
      uz: "Vaqfimiz va Mezana akademiyasi delegatsiyasi Suriya bosh muftiysi etib tayinlangan ulug' olim Shayx Usoma ar-Rifoiy hazratlarini ziyorat qilib, muborakbod etdi.",
      en: 'A delegation from Ezan Foundation and Mezana Academy visited Grand Mufti Sheikh Osama al-Rifai to convey congratulations and prayers.',
      ar: 'زار وفد من وقف أذان وأكاديمية مأذنة سماحة الشيخ أسامة الرفاعي لتقديم التهنئة بمناسبة توليه منصب المفتي العام.'
    },
    body: {
      tr: 'Ezan Vakfı Mütevelli Heyet Başkanı Üstad Mübeşşir Ahmed ve Mezana Uluslararası İlimler Akademisi hocalarından oluşan heyet, İslam dünyasının muteber âlimlerinden Şeyh Üsame er-Rifai hazretlerini ziyaret etti.\n\nZiyarette ilmi çalışmalar, medrese ve akademi iş birlikleri üzerine istişarelerde bulunuldu ve kendilerine yeni görevlerinde muvaffakiyetler dilendi.',
      uz: "Ezan Vakfı Vasiylik kengashi raisi Ustoz Mubashshir Ahmad va Mezana Xalqaro ilmlar akademiyasi ustozlaridan iborat hay'at Islom olamining mo'tabar ulamolaridan biri Shayx Usoma ar-Rifoiy hazratlarini ziyorat qildi.\n\nUchrashuvda ilmiy faoliyat, madrasa va akademiyalar o'rtasidagi hamkorlik masalalari muhokama qilinib, u kishining mas'uliyatli faoliyatlariga muvaffaqiyat tilandi.",
      en: 'A delegation led by Ustad Mubashshir Ahmad, Chairman of the Board of Trustees of Ezan Foundation, along with faculty members of Mezana International Academy of Sciences, visited the esteemed scholar Sheikh Osama al-Rifai.\n\nDuring the visit, scholarly cooperation and educational programs were discussed.',
      ar: 'قام وفد برئاسة الأستاذ مبشر أحمد رئيس مجلس أمناء وقف أذان وعدد من أساتذة أكاديمية مأذنة بزيارة سماحة الشيخ أسامة الرفاعي والتباحث في التعاون العلمي والتعليمي.'
    }
  },
  {
    slug: 'baskanin-dilinden-mezana-akademisi',
    imageUrl: '/media/old-site/news/mubashshirAhmed.jpg',
    publishedAt: '2024-07-05T10:00:00Z',
    title: {
      tr: 'Vakıf Başkanımızın Dilinden Mezana Uluslararası İlimler Akademisi',
      uz: 'Vaqf raisi tilidan Mezana Xalqaro ilmlar akademiyasi haqida',
      en: 'Mezana International Academy of Sciences in the Words of Our Chairman',
      ar: 'أكاديمية مأذنة العالمية للعلوم بلسان رئيس الوقف'
    },
    excerpt: {
      tr: 'Mütevelli Heyet Başkanımız Üstad Mübeşşir Ahmed, Mezana Akademisi’nin kuruluş gayesini, eğitim metodunu ve ümmet için taşıdığı vizyonu anlattı.',
      uz: "Vasiylik kengashi raisimiz Ustoz Mubashshir Ahmad Mezana akademiyasining tashkil etilish maqsadi, ta'lim uslubi va ummat uchun ko'zlagan istiqbolli rejalarini bayon qildi.",
      en: 'Our Chairman Ustad Mubashshir Ahmad explains the founding vision, educational methodology, and mission of Mezana International Academy of Sciences.',
      ar: 'يوضح رئيس مجلس الأمناء الأستاذ مبشر أحمد رسالة أكاديمية مأذنة ومنهجها العلمي ورؤيتها المستقبلية.'
    },
    body: {
      tr: 'Mezana Uluslararası İlimler Akademisi, klasik İslami ilimler geleneğini modern akademik disiplinle birleştiren uluslararası bir ilim ve irfan yuvasıdır.\n\nAkademimizde Türkistan ve Orta Asya başta olmak üzere farklı coğrafyalardan gelen talebelere Arapça hazırlık, temel İslami ilimler ve ihtisas düzeyinde ücretsiz eğitim verilmektedir.',
      uz: "Mezana Xalqaro ilmlar akademiyasi mumtoz islomiy ilmlar an'anasini zamonaviy akademik intizom bilan uyg'unlashtirgan xalqaro ilm va ma'rifat maskanidir.\n\nAkademiyamizda Turkiston va Markaziy Osiyo boshchiligida turli mintaqalardan kelgan tolibi ilmlarga arab tili tayyorlov bosqichi, asosiy islomiy ilmlar va ixtisoslik darajasida bepul ta'lim beriladi.",
      en: 'Mezana International Academy of Sciences combines classical Islamic scholarship with contemporary academic rigor.\n\nStudents from Central Asia and beyond receive tuition-free education in Arabic preparatory studies, foundational Islamic sciences, and advanced specialization.',
      ar: 'تجمع أكاديمية مأذنة العالمية للعلوم بين الأصالة الشرعية والمنهجية الأكاديمية المعاصرة لتأهيل طلاب العلم من آسيا الوسطى وغيرها مجاناً.'
    }
  },
  {
    slug: 'mezana-medresesine-kayitlar-basladi',
    imageUrl: '/media/old-site/news/qabul.jpg',
    publishedAt: '2024-07-05T09:30:00Z',
    title: {
      tr: 'Mezana Uluslararası İlimler Akademisi Yeni Dönem Kayıtları',
      uz: 'Mezana Xalqaro ilmlar akademiyasiga yangi o‘quv yili qabuli',
      en: 'New Academic Term Admissions at Mezana International Academy of Sciences',
      ar: 'بدء التسجيل للعام الدراسي الجديد في أكاديمية مأذنة العالمية للعلوم'
    },
    excerpt: {
      tr: 'Mezana Akademisi erkek ve kız şubelerinde 4 yıllık İslami ilimler ve Arapça hazırlık programları için yeni dönem öğrenci kabulü gerçekleştirildi.',
      uz: "Mezana akademiyasining yigitlar va qizlar bo'limlarida 4 yillik islomiy ilmlar hamda arab tili tayyorlov dasturlari uchun yangi o'quv yili qabuli o'tkazildi.",
      en: 'Student admissions have been conducted for the 4-year Islamic sciences and Arabic preparatory programs at Mezana Academy.',
      ar: 'انطلاق قبول الطلاب والطالبات في برامج الإعداد اللغوي والعلوم الشرعية لمدة أربع سنوات في أكاديمية مأذنة.'
    },
    body: {
      tr: 'Mezana Uluslararası İlimler Akademisi’nde eğitim dili Arapça olup, Arapça bilmeyen talebeler için 1 yıllık yoğun hazırlık sınıfı uygulanmaktadır.\n\n4 yıllık temel İslami ilimler programında Tefsir, Hadis, Hanefi Fıkhı, Usul-i Fıkıh, Akide, Siyer ve Arap Edebiyatı dersleri alanında uzman âlimler tarafından okutulmaktadır.',
      uz: "Mezana Xalqaro ilmlar akademiyasida ta'lim tili arab tili bo'lib, arab tilini bilmaydigan talabalar uchun 1 yillik jadallashtirilgan tayyorlov kursi mavjud.\n\n4 yillik asosiy islomiy ilmlar dasturida Tafsir, Hadis, Hanafiy fiqhi, Usuli fiqh, Aqida, Siyrat va Arab adabiyoti fanlari yetuk ulamolar tomonidan o'qitiladi.",
      en: 'The language of instruction at Mezana International Academy of Sciences is Arabic, supported by a one-year intensive preparatory program.\n\nOver the 4-year curriculum, students study Tafsir, Hadith, Hanafi Fiqh, Usul al-Fiqh, Aqeedah, Seerah, and Arabic Literature under specialist scholars.',
      ar: 'لغة الدراسة في أكاديمية مأذنة هي اللغة العربية مع سنة تحضيرية مكثفة، تليها أربع سنوات في دراسة التفسير والحديث والفقه الحنفي وأصوله والعقيدة والسيرة.'
    }
  },
  {
    slug: 'mezana-kiz-subesi-kayitlari',
    imageUrl: '/media/old-site/news/women.jpg',
    publishedAt: '2024-07-05T09:00:00Z',
    title: {
      tr: 'Mezana Akademisi Kız Şubesi Eğitim Faaliyetleri',
      uz: "Mezana akademiyasi qizlar bo'limi ta'lim faoliyati",
      en: 'Mezana Academy Women’s Branch Educational Programs',
      ar: 'الأنشطة التعليمية في فرع الطالبات بأكاديمية مأذنة'
    },
    excerpt: {
      tr: 'Hanım talebeler için özel olarak hazırlanan müfredat kapsamında Kur’an-ı Kerim, Arapça ve temel İslami ilimler eğitimi devam ediyor.',
      uz: "Tolibalar uchun maxsus tayyorlangan o'quv dasturi doirasida Qur'oni karim, arab tili va asosiy islomiy ilmlar ta'limi davom etmoqda.",
      en: 'Quranic studies, Arabic language, and foundational Islamic sciences continue under a dedicated curriculum for female students.',
      ar: 'تتواصل الدراسة في فرع الطالبات وفق منهج متكامل يشمل القرآن الكريم واللغة العربية والعلوم الشرعية.'
    },
    body: {
      tr: 'Ailenin ve toplumun inşasında hanımların ilmi ve ahlaki donanımı büyük önem taşımaktadır. Mezana Akademisi Kız Şubesi, hanım talebelere güvenli ve ilmi bir ortamda 4 yıllık medrese müfredatı sunmaktadır.',
      uz: "Oila va jamiyat barpo etilishida ayol-qizlarning ilmiy hamda axloqiy salohiyati beqiyos ahamiyatga ega. Mezana akademiyasi qizlar bo'limi tolibalarga qulay va ilmiy muhitda 4 yillik madrasa dasturini taqdim etadi.",
      en: 'Educating women is vital to building resilient families and communities. The Women’s Branch of Mezana Academy offers a comprehensive 4-year curriculum in a supportive academic environment.',
      ar: 'يقدّم فرع الطالبات في أكاديمية مأذنة برنامجاً علمياً متكاملاً لمدة أربع سنوات لإعداد العالمات والمربيات.'
    }
  },
  {
    slug: 'mezana-yeni-ihtisas-bolumu',
    imageUrl: '/media/old-site/news/activity.jpg',
    publishedAt: '2024-07-05T08:30:00Z',
    title: {
      tr: 'Mezana Akademisi’nde İhtisas ve İleri İslami İlimler Programı',
      uz: 'Mezana akademiyasida ixtisoslik va oliy islomiy ilmlar dasturi',
      en: 'Advanced Specialization Program in Islamic Sciences at Mezana Academy',
      ar: 'برنامج التخصص والدراسات الشرعية المتقدمة في أكاديمية مأذنة'
    },
    excerpt: {
      tr: 'Temel İslami ilimler eğitimini tamamlayan mezunlar için fıkıh, hadis ve tefsir alanlarında derinlikli ihtisas dersleri yürütülmektedir.',
      uz: "Asosiy islomiy ilmlar bosqichini tamomlagan bitiruvchilar uchun fiqh, hadis va tafsir yo'nalishlarida chuqurlashtirilgan ixtisoslik darslari olib borilmoqda.",
      en: 'Graduates of foundational Islamic studies pursue advanced specialization in jurisprudence, Hadith, and Quranic exegesis.',
      ar: 'يتابع خريجو المرحلة الأساسية دراستهم التخصصية المعمقة في الفقه والحديث والتفسير تحت إشراف كبار العلماء.'
    },
    body: {
      tr: 'Mezana Uluslararası İlimler Akademisi bünyesinde açılan ihtisas sınıfları, klasik kaynaklara doğrudan müracaat edebilen, çağın meselelerine İslami usuller çerçevesinde çözüm üretebilen ilim adamları yetiştirmeyi hedeflemektedir.',
      uz: "Mezana Xalqaro ilmlar akademiyasi qoshida tashkil etilgan ixtisoslik guruhlari mumtoz manbalarga bevosita murojaat qila oladigan, zamonaviy masalalarga islomiy usullar doirasida yechim bera oladigan olimlarni yetishtirishni maqsad qilgan.",
      en: 'The specialization classes at Mezana International Academy of Sciences aim to train scholars capable of engaging directly with classical texts and addressing contemporary issues through sound Islamic methodology.',
      ar: 'تهدف حلقات التخصص في أكاديمية مأذنة إلى تخريج باحثين وعلماء قادرين على التعامل المباشر مع المصادر التراثية ومعالجة القضايا المعاصرة.'
    }
  },
  {
    slug: 'yurt-ici-egitim-yardimi',
    imageUrl: '/media/old-site/news/students.jpg',
    publishedAt: '2024-07-05T08:00:00Z',
    title: {
      tr: 'İlim Talebelerine Burs ve Eğitim Desteği Programı',
      uz: "Ilm toliblariga stipendiya va ta'lim ko'magi dasturi",
      en: 'Scholarship and Educational Support Program for Students of Knowledge',
      ar: 'برنامج المنح والدعم التعليمي لطلاب العلم'
    },
    excerpt: {
      tr: 'Ezan Vakfı, Türkiye’deki çeşitli üniversite ve medreselerde tahsil gören ihtiyaç sahibi ilim talebelerine burs, barınma ve yemek desteği sağlıyor.',
      uz: "Ezan Vakfı Turkiyaning turli universitet va madrasalarida tahsil olayotgan ehtiyojmand ilm toliblariga stipendiya, yotoqxona va oziq-ovqat ko'magini ko'rsatmoqda.",
      en: 'Ezan Foundation provides scholarships, accommodation, and meal support to students of knowledge studying at universities and madrasas in Türkiye.',
      ar: 'يقدم وقف أذان المنح الدراسية وخدمات السكن والإعاشة لطلاب العلم الدارسين في الجامعات والمدارس الشرعية في تركيا.'
    },
    body: {
      tr: 'İlim yolunda gayret gösteren gençlerin maddi imkânsızlıklar sebebiyle eğitimlerinden geri kalmaması için Ezan Vakfı tarafından düzenli burs, yurt ve sıcak yemek imkânı sunulmaktadır.\n\nHayırseverlerimizin zekât ve sadakalarıyla yüzlerce talebenin eğitim yolculuğuna destek olunmaktadır.',
      uz: "Ilm yo'lida g'ayrat qilayotgan yoshlar moddiy yetishmovchilik sababli o'qishdan to'xtab qolmasligi uchun Ezan Vakfı tomonidan muntazam stipendiya, yotoqxona va issiq ovqat imkoniyati taqdim etilmoqda.\n\nSaxovatpesha insonlarning zakot va sadaqalari orqali yuzlab tolibi ilmlarning ta'lim olishiga ko'maklashilmoqda.",
      en: 'To ensure dedicated students never have to abandon their studies due to financial hardship, Ezan Foundation provides regular stipends, dormitory housing, and hot meals funded by Zakat and charitable donations.',
      ar: 'يحرص وقف أذان على كفالة طلاب العلم وتوفير المنح الشهرية والسكن والوجبات اليومية بدعم أهل الخير وأموال الزكاة والصدقات.'
    }
  },
  {
    slug: 'mezana-bayram-tebrigi',
    imageUrl: '/media/old-site/news/ramazon.jpg',
    publishedAt: '2024-04-10T07:00:00Z',
    title: {
      tr: 'Ramazan Faaliyetlerimiz ve Bayram Buluşması',
      uz: 'Ramazon faoliyatimiz va Hayit uchrashuvi',
      en: 'Our Ramadan Activities and Eid Gathering',
      ar: 'أنشطتنا الرمضانية ولقاء العيد المبارك'
    },
    excerpt: {
      tr: 'Ramazan ayı boyunca düzenlenen iftar sofraları, hatim programları ve ilmi sohbetlerin ardından vakıf merkezimizde bayramlaşma programı gerçekleştirildi.',
      uz: "Ramazon oyi davomida tashkil etilgan iftorlik dasturxonlari, xatmi Qur'onlar va ilmiy suhbatlardan so'ng vaqf markazimizda hayitlik uchrashuvi bo'lib o'tdi.",
      en: 'Following a month of community iftars, Quran completions, and scholarly lectures during Ramadan, an Eid gathering was held at our foundation center.',
      ar: 'بعد شهر حافل بموائد الإفطار والختمات القرآنية والدروس العلمية، أقام الوقف لقاء المعايدة لطلاب العلم والجالية.'
    },
    body: {
      tr: 'Ezan Vakfı ve Mezana Akademisi’nde Ramazan ayı boyunca her gün yüzlerce ilim talebesi ve misafirimizle iftar sofralarında buluştuk.\n\nBayram sabahında ise hocalarımız, talebelerimiz ve gönüllülerimizle bir araya gelerek kardeşlik ve muhabbetimizi pekiştirdik.',
      uz: "Ezan Vakfı va Mezana akademiyasida Ramazon oyi davomida har kuni yuzlab ilm toliblari va mehmonlarimiz bilan iftorlik dasturxonlarida jam bo'ldik.\n\nHayit tongida esa ustozlarimiz, talabalarimiz va ko'ngillilarimiz bilan birga birodarlik hamda mehr-oqibat rishtalarini mustahkamladik.",
      en: 'Throughout Ramadan, Ezan Foundation and Mezana Academy hosted daily iftar meals for hundreds of students and guests, culminating in a warm Eid celebration with our scholars and community.',
      ar: 'طوال شهر رمضان المبارك استضاف وقف أذان وأكاديمية مأذنة موائد الإفطار اليومية لمئات الطلاب والضيوف، واختتمت بلقاء العيد المبارك.'
    }
  },
  {
    slug: 'zekat-zamani',
    imageUrl: '/media/old-site/news/zekat.jpg',
    publishedAt: '2024-03-15T09:00:00Z',
    title: {
      tr: 'Zekâtlarınızla İlim Talebelerine ve İhtiyaç Sahiplerine Umut Olun',
      uz: 'Zakotlaringiz bilan ilm toliblari va ehtiyojmandlarga umid ulashing',
      en: 'Bring Hope to Students of Knowledge and the Needy Through Your Zakat',
      ar: 'بزكاتكم تدعمون طلاب العلم وتفرجون كرب المحتاجين'
    },
    excerpt: {
      tr: 'Ezan Vakfı, emanet ettiğiniz zekât ve fitreleri Kur’an ve Sünnet ölçülerine uygun biçimde gerçek ihtiyaç sahiplerine ve ilim talebelerine ulaştırır.',
      uz: "Ezan Vakfı omonat qilgan zakot va fitr sadaqalaringizni Qur'on va Sunnat mezonlariga muvofiq haqiqiy ehtiyojmandlar hamda ilm toliblariga yetkazadi.",
      en: 'Ezan Foundation delivers your Zakat and Fitr alms to eligible recipients and students of knowledge in strict accordance with Islamic jurisprudence.',
      ar: 'يحرص وقف أذان على إيصال أموال الزكاة وصدقة الفطر إلى مستحقيها الشرعيين من طلاب العلم والفقراء والمساكين.'
    },
    body: {
      tr: 'Zekât, İslam’ın en önemli mali ibadetlerinden biri olup ümmetin ilmi ve sosyal dayanışmasının temel direğidir.\n\nEzan Vakfı’na emanet edilen zekât bağışları, şer’i ölçülere titizlikle riayet edilerek Mezana Akademisi’ndeki ihtiyaç sahibi ilim talebelerine ve dar gelirli ailelere ulaştırılmaktadır.',
      uz: "Zakot Islomning eng muhim moliyaviy ibodatlaridan biri bo'lib, ummatning ilmiy va ijtimoiy birdamligi ustunidir.\n\nEzan Vakfı'ga omonat qilingan zakot xayriyalari shar'iy mezonlarga qat'iy rioya qilingan holda Mezana akademiyasidagi ehtiyojmand tolibi ilmlar va kam ta'minlangan oilalarga yetkaziladi.",
      en: 'Zakat is a foundational pillar of Islamic social solidarity. Zakat contributions entrusted to Ezan Foundation are distributed strictly to eligible students of knowledge and families in need.',
      ar: 'الزكاة ركن أصيل في التكافل الإسلامي، وتُصرف الزكوات المودعة لدى وقف أذان في مصارفها الشرعية لطلاب العلم المحتاجين والأسر المتعففة.'
    }
  }
];

export const OLD_SITE_VIDEOS = [
  {
    youtubeId: 'xKxrkht7CpY',
    projectSlug: 'azon-global-medya',
    publishedAt: '2024-07-05T10:00:00Z',
    title: {
      tr: 'Ezan Vakfı ve Mezana Uluslararası İlimler Akademisi Tanıtım Filmi',
      uz: 'Ezan Vakfı va Mezana Xalqaro ilmlar akademiyasi tanishtiruv videosi',
      en: 'Ezan Foundation & Mezana International Academy of Sciences Documentary',
      ar: 'الفيلم التعريفي لوقف أذان وأكاديمية مأذنة العالمية للعلوم'
    },
    description: {
      tr: 'Ezan Vakfı Mütevelli Heyet Başkanı Üstad Mübeşşir Ahmed ve Mezana Akademisi hocalarının anlatımıyla vakfımızın ilmi ve hayri faaliyetleri.',
      uz: "Ezan Vakfı Vasiylik kengashi raisi Ustoz Mubashshir Ahmad va Mezana akademiyasi ustozlari ishtirokida vaqfimizning ilmiy hamda xayriya faoliyati haqida lavha.",
      en: 'An overview of Ezan Foundation’s educational and charitable activities featuring Chairman Ustad Mubashshir Ahmad and Mezana Academy faculty.',
      ar: 'جولة تعريفية بأنشطة وقف أذان وأكاديمية مأذنة بمشاركة رئيس الوقف الأستاذ مبشر أحمد وأعضاء هيئة التدريس.'
    }
  }
];

export const OLD_SITE_FAQS = [
  {
    category: 'general',
    order: 1,
    question: {
      tr: 'Ezan Vakfı ne zaman ve hangi gayeyle kurulmuştur?',
      uz: 'Ezan Vakfı qachon va qanday maqsadda tashkil etilgan?',
      en: 'When and for what purpose was Ezan Foundation established?',
      ar: 'متى تأسس وقف أذان وما هي أهدافه؟'
    },
    answer: {
      tr: 'Ezan Vakfı (Ezan Orta Asya Halkları Vakfı), 2023 yılında İstanbul’da İslam ümmetinin ilmi, fikri ve ahlaki inkişafına katkı sunmak; başta Mezana Uluslararası İlimler Akademisi ve Azon Global medya platformu olmak üzere eğitim, kültür ve insani yardım projeleri yürütmek amacıyla kurulmuştur.',
      uz: "Ezan Vakfı (Ezan Markaziy Osiyo xalqlari vaqfi) 2023-yilda Istanbulda Islom ummatining ilmiy, fikriy va axloqiy yuksalishiga hissa qo'shish; Mezana Xalqaro ilmlar akademiyasi va Azon Global media platformasi boshchiligida ta'lim, madaniyat va insonparvarlik loyihalarini amalga oshirish maqsadida tashkil etilgan.",
      en: 'Ezan Foundation was established in Istanbul in 2023 to advance scholarly, intellectual, and moral development through educational, cultural, and humanitarian initiatives, notably Mezana International Academy of Sciences and Azon Global Media.',
      ar: 'تأسس وقف أذان في إسطنبول عام 2023 للإسهام في النهضة العلمية والفكرية والتربوية من خلال مشاريع رائدة في مقدمتها أكاديمية مأذنة العالمية للعلوم ومنصة أذان غلوبال الإعلامية.'
    }
  },
  {
    category: 'education',
    order: 2,
    question: {
      tr: 'Mezana Uluslararası İlimler Akademisi’nde eğitim süresi ve şartları nelerdir?',
      uz: "Mezana Xalqaro ilmlar akademiyasida o'qish muddati va shartlari qanday?",
      en: 'What is the duration and structure of study at Mezana International Academy of Sciences?',
      ar: 'ما هي مدة ونظام الدراسة في أكاديمية مأذنة العالمية للعلوم؟'
    },
    answer: {
      tr: 'Mezana Akademisi’nde 1 yıl yoğun Arapça hazırlık ve 4 yıl temel İslami ilimler (Tefsir, Hadis, Fıkıh, Akide, Usul ve Arap Edebiyatı) programı uygulanmaktadır. Eğitim ücretsiz olup başarılı ve ihtiyaç sahibi talebelere burs ve yemek desteği sağlanmaktadır.',
      uz: "Mezana akademiyasida 1 yillik jadallashtirilgan arab tili tayyorlov bosqichi va 4 yillik asosiy islomiy ilmlar (Tafsir, Hadis, Fiqh, Aqida, Usul va Arab adabiyoti) dasturi joriy etilgan. Ta'lim bepul bo'lib, iqtidorli va ehtiyojmand talabalarga stipendiya hamda oziq-ovqat ko'magi beriladi.",
      en: 'Mezana Academy offers a 1-year intensive Arabic preparatory track followed by a 4-year foundational Islamic sciences curriculum. Education is tuition-free, with scholarships and meal support available for eligible students.',
      ar: 'تضم الدراسة في أكاديمية مأذنة سنة تحضيرية مكثفة للغة العربية تليها أربع سنوات للعلوم الشرعية الأساسية، والدراسة مجانية مع توفير المنح والوجبات للطلاب المستحقين.'
    }
  },
  {
    category: 'donation',
    order: 3,
    question: {
      tr: 'Vakfınıza nasıl bağış yapabilirim? Zekât bağışı kabul ediliyor mu?',
      uz: 'Vaqfga qanday xayriya qilishim mumkin? Zakot qabul qilinadimi?',
      en: 'How can I donate to the foundation? Do you accept Zakat?',
      ar: 'كيف يمكنني التبرع للوقف؟ وهل تقبلون أموال الزكاة؟'
    },
    answer: {
      tr: 'Web sitemiz üzerinden kredi/banka kartı ile güvenli online bağış yapabilir veya Ziraat Bankası resmi IBAN hesabımıza (TR82 0001 0009 6597 8337 0050 01 — EZAN ORTA ASYA HALKLARI VAKFI) EFT/Havale gönderebilirsiniz. Zekât bağışlarınız şer’i ölçülere uygun şekilde ilim talebelerine ve ihtiyaç sahiplerine ulaştırılmaktadır.',
      uz: "Saytimiz orqali bank kartasi yordamida xavfsiz onlayn ehson qilishingiz yoki Ziraat Bankası'dagi rasmiy IBAN hisob raqamimizga (TR82 0001 0009 6597 8337 0050 01 — EZAN ORTA ASYA HALKLARI VAKFI) pul o'tkazishingiz mumkin. Zakot xayriyalaringiz shar'iy qoidalarga muvofiq ilm toliblari va ehtiyojmandlarga yetkaziladi.",
      en: 'You can donate securely online via credit/debit card on our website or by bank transfer to our official Ziraat Bank IBAN account (TR82 0001 0009 6597 8337 0050 01 — EZAN ORTA ASYA HALKLARI VAKFI). Zakat contributions are distributed strictly to eligible students of knowledge and those in need.',
      ar: 'يمكنكم التبرع عبر الموقع بالبطاقة البنكية أو عبر التحويل البنكي لحساب الوقف الرسمي في بنك زراعات (TR82 0001 0009 6597 8337 0050 01)، وتُصرف أموال الزكاة في مصارفها الشرعية لطلاب العلم والمحتاجين.'
    }
  },
  {
    category: 'donation',
    order: 4,
    question: {
      tr: 'Vakfınıza başka hangi yollarla destek olabilirim?',
      uz: 'Vaqf faoliyatini yana qanday usullar bilan qo‘llab-quvvatlash mumkin?',
      en: 'In what other ways can I support the foundation?',
      ar: 'ما هي الطرق الأخرى لدعم أنشطة الوقف؟'
    },
    answer: {
      tr: 'Genel bağış ve zekâtın yanı sıra; bir ilim talebesinin aylık bursunu üstlenebilir, vakıf kütüphanesine kitap bağışlayabilir, kurban/akika/adak vekâleti verebilir, gayrimenkul veya araç vakfedebilir ya da gönüllü olarak medya ve eğitim projelerimize katkıda bulunabilirsiniz.',
      uz: "Umumiy ehson va zakotdan tashqari: bir ilm tolibining oylik stipendiyasini kafolatga olishingiz, vaqf kutubxonasiga kitob hadya qilishingiz, qurbonlik/aqiqa/nazr vakolatini topshirishingiz, ko'chmas mulk yoki jihoz vaqf qilishingiz yoxud ko'ngilli sifatida media va ta'lim loyihalarimizda ishtirok etishingiz mumkin.",
      en: 'Beyond general donations and Zakat, you can sponsor a student’s monthly scholarship, donate books to our library, entrust Qurbani/Aqiqah sacrifices, endow property or equipment, or volunteer in our media and educational initiatives.',
      ar: 'إضافة إلى التبرع العام والزكاة، يمكنكم كفالة طالب علم شهرياً، أو إهداء الكتب لمكتبة الوقف، أو التوكيل في الأضاحي والعقيقة، أو وقف العقارات والتجهيزات، أو التطوع في مشاريعنا.'
    }
  },
  {
    category: 'contact',
    order: 5,
    question: {
      tr: 'Ezan Vakfı merkezi nerededir ve nasıl iletişime geçebilirim?',
      uz: 'Ezan Vakfı markazi qayerda joylashgan va qanday bog‘lanish mumkin?',
      en: 'Where is Ezan Foundation located and how can I contact you?',
      ar: 'أين يقع مقر وقف أذان وكيف يمكن التواصل معكم؟'
    },
    answer: {
      tr: 'Vakıf merkezimiz İstanbul Başakşehir’de (Atatürk Bulvarı A1 Blok Deposite İş Merkezi Kat:3 No:317 İkitelli OSB Başakşehir / İSTANBUL) yer almaktadır. Bize +90 505 034 55 50 numaralı telefondan veya info@ezanvakfi.org adresinden ulaşabilirsiniz.',
      uz: "Vaqfimiz markazi Istanbulning Bashakshehir tumanida (Atatürk Bulvarı A1 Blok Deposite İş Merkezi Kat:3 No:317 İkitelli OSB Başakşehir / İSTANBUL) joylashgan. Biz bilan +90 505 034 55 50 telefoni yoki info@ezanvakfi.org elektron pochtasi orqali bog'lanishingiz mumkin.",
      en: 'Our headquarters is located in Başakşehir, Istanbul (Atatürk Bulvarı A1 Blok Deposite İş Merkezi Kat:3 No:317 İkitelli OSB Başakşehir / İSTANBUL). You can reach us at +90 505 034 55 50 or info@ezanvakfi.org.',
      ar: 'يقع مقر الوقف في باشاك شهير بإسطنبول (Deposite İş Merkezi Kat:3 No:317 İkitelli OSB)، ويمكنكم التواصل معنا عبر الهاتف +90 505 034 55 50 أو البريد الإلكتروني info@ezanvakfi.org.'
    }
  }
];

export interface OldSiteSupportWay {
  key: string;
  title: { tr: string; uz: string; en: string; ar: string };
  description: { tr: string; uz: string; en: string; ar: string };
}

export const OLD_SITE_SUPPORT_WAYS: OldSiteSupportWay[] = [
  {
    key: 'student-scholarship',
    title: {
      tr: '1. Öğrenci Bursu ve Kefaleti',
      uz: '1. Talaba stipendiyasi va kafolati',
      en: '1. Student Scholarship & Sponsorship',
      ar: '1. كفالة ومنح طلاب العلم'
    },
    description: {
      tr: 'Mezana Akademisi ve Türkiye’deki üniversitelerde okuyan ilim talebelerinin aylık burs, barınma ve yemek giderlerini üstlenebilirsiniz.',
      uz: "Mezana akademiyasi va Turkiya universitetlarida tahsil olayotgan ilm toliblarining oylik stipendiya, turar-joy va ovqatlanish xarajatlarini kafolatga olishingiz mumkin.",
      en: 'Sponsor the monthly stipend, housing, and meal expenses of students of knowledge at Mezana Academy and universities in Türkiye.',
      ar: 'المساهمة في تغطية المنح الشهرية ونفقات السكن والإعاشة لطلاب العلم في أكاديمية مأذنة والجامعات التركية.'
    }
  },
  {
    key: 'zakat-fitr',
    title: {
      tr: '2. Zekât ve Fitre Bağışı',
      uz: '2. Zakot va fitr sadaqasi',
      en: '2. Zakat & Fitr Contributions',
      ar: '2. الزكاة وصدقة الفطر'
    },
    description: {
      tr: 'Zekât ve fitrelerinizi İslami ölçülere uygun olarak ilim talebelerine ve ihtiyaç sahibi ailelere ulaştırıyoruz.',
      uz: "Zakot va fitr sadaqalaringizni shar'iy mezonlarga muvofiq ilm toliblari hamda ehtiyojmand oilalarga yetkazamiz.",
      en: 'We deliver your Zakat and Fitr alms strictly to eligible students of knowledge and families in need.',
      ar: 'إيصال أموال الزكاة وصدقة الفطر وفق الضوابط الشرعية لطلاب العلم والأسر المتعففة.'
    }
  },
  {
    key: 'qurban-proxy',
    title: {
      tr: '3. Vekâleten Kurban, Akika ve Adak',
      uz: '3. Vakolat orqali qurbonlik, aqiqa va nazr',
      en: '3. Proxy Qurbani, Aqiqah & Nazar',
      ar: '3. الأضاحي والعقيقة والنذر بالوكالة'
    },
    description: {
      tr: 'Kurban Bayramı ve yıl boyunca adak, akika ve şükür kurbanlarınızı keserek medrese talebelerine ve muhtaçlara dağıtıyoruz.',
      uz: "Qurbon hayiti hamda yil davomida nazr, aqiqa va shukrona qurbonliklaringizni so'yib, madrasa talabalari va muhtojlarga tarqatamiz.",
      en: 'We fulfill your proxy Qurbani, Aqiqah, and Nazar sacrifices year-round and distribute the meat to students and families in need.',
      ar: 'تنفيذ ذبح الأضاحي والعقيقة والنذر طوال العام وتوزيع لحومها على طلاب العلم والمحتاجين.'
    }
  },
  {
    key: 'media-support',
    title: {
      tr: '4. Azon Global Medya ve Davet Destekleri',
      uz: '4. Azon Global media va ma’rifiy loyihalar ko‘magi',
      en: '4. Azon Global Media & Educational Content Support',
      ar: '4. دعم مشاريع أذان غلوبال الإعلامية والدعوية'
    },
    description: {
      tr: '4 dilde yayın yapan Azon Global platformumuzun stüdyo, prodüksiyon ve dijital içerik çalışmalarına katkıda bulunabilirsiniz.',
      uz: "4 tilda faoliyat yurituvchi Azon Global platformamizning studiya, tasvirga olish va raqamli kontent tayyorlash ishlariga hissa qo'shishingiz mumkin.",
      en: 'Support studio production and multilingual digital content creation across Azon Global’s 4-language media platforms.',
      ar: 'دعم الإنتاج المرئي والرقمي لمنصة أذان غلوبال الناطقة بأربع لغات.'
    }
  },
  {
    key: 'book-publishing',
    title: {
      tr: '5. Kitap Basımı ve Kütüphane Vakfı',
      uz: '5. Kitob nashri va kutubxona vaqfi',
      en: '5. Book Publishing & Library Endowment',
      ar: '5. طباعة الكتب ووقف المكتبات'
    },
    description: {
      tr: 'İslami eserlerin tercümesi, basımı ve Mezana Akademisi kütüphanesinin zenginleştirilmesi için destek olabilirsiniz.',
      uz: "Islomiy asarlar tarjimasi, nashri hamda Mezana akademiyasi kutubxonasini boyitish uchun ko'maklashishingiz mumkin.",
      en: 'Contribute to the translation and publication of Islamic works and the expansion of the Mezana Academy library.',
      ar: 'المساهمة في ترجمة وطباعة الكتب العلمية وإثراء مكتبة أكاديمية مأذنة.'
    }
  },
  {
    key: 'waqf-endowment',
    title: {
      tr: '6. Gayrimenkul, Araç ve Techizat Vakfı',
      uz: '6. Ko‘chmas mulk, transport va jihozlar vaqfi',
      en: '6. Real Estate, Vehicle & Equipment Endowment',
      ar: '6. وقف العقارات والمركبات والتجهيزات'
    },
    description: {
      tr: 'Sadaka-i cariye olarak bina, daire, derslik ekipmanı veya stüdyo cihazlarını vakfımızın hizmetine bağışlayabilirsiniz.',
      uz: "Sadaqai joriya sifatida bino, xonadon, o'quv xonasi jihozlari yoki studiya uskunalarini vaqf xizmatiga hadya qilishingiz mumkin.",
      en: 'Endow buildings, apartments, classroom furniture, or studio equipment as ongoing charity (Sadaqah Jariyah).',
      ar: 'وقف العقارات أو الشقق أو تجهيزات الفصول والاستوديوهات كصدقة جارية.'
    }
  },
  {
    key: 'ramadan-iftar',
    title: {
      tr: '7. İftar Sofrası ve Gıda Yardımı',
      uz: '7. Iftorlik dasturxoni va oziq-ovqat yordami',
      en: '7. Iftar Meals & Food Assistance',
      ar: '7. موائد الإفطار والسلال الغذائية'
    },
    description: {
      tr: 'Ramazan ayında ve yıl boyunca ilim talebeleri için kurulan yemek sofralarına ve erzak dağıtımlarına ortak olabilirsiniz.',
      uz: "Ramazon oyida va yil davomida ilm toliblari uchun yoziladigan dasturxonlar hamda oziq-ovqat tarqatish ishlariga sherik bo'lishingiz mumkin.",
      en: 'Sponsor daily meals for students of knowledge and food parcels for families during Ramadan and throughout the year.',
      ar: 'الإسهام في موائد إفطار الصائمين وإطعام طلاب العلم وتوزيع السلال الغذائية.'
    }
  },
  {
    key: 'orphan-family-aid',
    title: {
      tr: '8. Muhacir, Yetim ve İhtiyaç Sahibi Aile Desteği',
      uz: '8. Muhojir, yetim va ehtiyojmand oilalar ko‘magi',
      en: '8. Refugee, Orphan & Family Support',
      ar: '8. رعاية الأيتام والمهاجرين والأسر المحتاجة'
    },
    description: {
      tr: 'İstanbul’daki yetimlere, muhacir ailelere ve dar gelirli hanelere yapılan sosyal yardımlara destek verebilirsiniz.',
      uz: "Istanbuldagi yetimlar, muhojir oilalar va kam ta'minlangan xonadonlarga ko'rsatiladigan ijtimoiy yordamlarga hissa qo'shishingiz mumkin.",
      en: 'Support social assistance programs for orphans, refugee families, and low-income households in Istanbul.',
      ar: 'دعم برامج الرعاية الاجتماعية للأيتام وأسر المهاجرين وذوي الدخل المحدود.'
    }
  },
  {
    key: 'volunteer-share',
    title: {
      tr: '9. Gönüllülük ve Hayra Vesile Olma',
      uz: '9. Ko‘ngillilik va yaxshilikni ulashish',
      en: '9. Volunteering & Spreading the Word',
      ar: '9. التطوع والدلالة على الخير'
    },
    description: {
      tr: 'Projelerimizi çevrenizle paylaşarak ve uzmanlık alanınızda gönüllü katkı sunarak hayra ortak olabilirsiniz.',
      uz: "Loyihalarimizni yaqinlaringizga ulashish va o'z mutaxassisligingiz bo'yicha ko'ngilli yordam berish orqali xayrli ishlarga sherik bo'lishingiz mumkin.",
      en: 'Share our projects with your network and volunteer your professional skills to amplify our impact.',
      ar: 'المشاركة بالتطوع في مجالات الخبرة ونشر مشاريع الوقف عملاً بحديث «الدال على الخير كفاعله».'
    }
  }
];
