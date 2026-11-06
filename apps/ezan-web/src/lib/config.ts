// Markaziy konfiguratsiya va "Hozircha qabul qilingan qarorlar"
// Hech qanday standart sir (fallback secret) kodda saqlanmaydi.

export function requireEnvSecret(envName: string, minLength = 32): string {
  const val = process.env[envName];
  if (!val || typeof val !== "string" || val.trim().length < minLength) {
    throw new Error(
      `Configuration error: ${envName} environment variable must be set and at least ${minLength} characters long.`
    );
  }
  return val.trim();
}

export function validateStartupEnvironment(): void {
  requireEnvSecret("EZAN_SYNC_SECRET", 32);
  requireEnvSecret("PAYMENT_WEBHOOK_SECRET", 32);
  requireEnvSecret("ADMIN_SESSION_SECRET", 32);

  if (process.env.NODE_ENV === "production") {
    if (!process.env.TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY.trim().length < 8) {
      throw new Error("Configuration error: TURNSTILE_SECRET_KEY must be set in production.");
    }
  }

  const provider = process.env.PAYMENT_PROVIDER || "mock";
  if (provider === "iyzico") {
    requireEnvSecret("IYZICO_API_KEY", 10);
    requireEnvSecret("IYZICO_SECRET_KEY", 10);
  }
}

export const SITE_CONFIG = {
  // 1. 2860-qonun bo'yicha ruxsat: DONATIONS_LIVE=false bo'lsa Sandbox/Sinov rejimi
  get donationsLive(): boolean {
    return process.env.DONATIONS_LIVE === "true";
  },

  // 2. To'lov provayderi: mock | iyzico | paytr | param
  get paymentProvider(): "mock" | "iyzico" | "paytr" | "param" {
    return (process.env.PAYMENT_PROVIDER || "mock") as "mock" | "iyzico" | "paytr" | "param";
  },

  // Oylik (abonement) xayriya hozircha yashirin (iyzico abonelik keyin qo'shiladi)
  get recurringEnabled(): boolean {
    return process.env.RECURRING_ENABLED === "true";
  },

  // Bülten / Newsletter obunasi bayrog'i (sukut bo'yicha o'chiq)
  get newsletterEnabled(): boolean {
    return process.env.NEWSLETTER_ENABLED === "true";
  },

  // 3. Zakot kalkulyatori diniy hisoblash qoidalari (bitta config faylda)
  zakatRules: {
    goldNisabGrams: Number(process.env.ZAKAT_NISAB_GOLD_GRAMS || 85),
    silverNisabGrams: Number(process.env.ZAKAT_NISAB_SILVER_GRAMS || 595),
    ratePercent: Number(process.env.ZAKAT_RATE_PERCENT || 2.5),
    rateFraction: Number(process.env.ZAKAT_RATE_PERCENT || 2.5) / 100,
    diyanetDisclaimerTag: "Diyanet İşleri Başkanlığı tavsiyasi (85g oltin nisobi, 2.5%)"
  },

  // 4. Ichki vaqf tizimi (Mezana) bilan sinxronlash xaritalash jadvali
  internalSyncMapping: {
    defaultPurposePrefix: "Onlayn bağış:",
    campaigns: {
      "GENEL-BAGIS": {
        purpose: "Onlayn bağış: Genel Bağış",
        restricted: false
      },
      "EGITIM-BURS": {
        purpose: "Onlayn bağış: Mezana Akademisi Öğrenci Bursu",
        restricted: true
      },
      "RAMAZAN-IFTAR": {
        purpose: "Onlayn bağış: Ramazan İftar ve Kumanya Kampanyası",
        restricted: true
      },
      "ZEKAT-FONU": {
        purpose: "Onlayn bağış: Zekât ve Fitre Fonu",
        restricted: true
      }
    } as Record<string, { purpose: string; restricted: boolean }>
  },

  // 5. Makbuz (Bağış Alındı Belgesi) shablon sozlamalari (soliq imtiyozi haqida hech narsa yozilmaydi)
  receiptTemplate: {
    titleTr: "BAĞIŞ ALINDI BELGESİ",
    titleUz: "XAYRIYA QABUL QILINGANLIGI HAQIDA MA'LUMOTNOMA (BAĞIŞ ALINDI BELGESİ)",
    titleEn: "DONATION RECEIPT CERTIFICATE (BAĞIŞ ALINDI BELGESİ)",
    titleAr: "إيصال استلام تبرع (BAĞIŞ ALINDI BELGESİ)",
    foundationName: "EZAN VAKFI",
    footnoteTr: "Bu belge bilgilendirme amacıyla elektronik ortamda düzenlenmiştir.",
    includeTaxExemptionClause: false
  },

  // 6. TCMB standart valyuta va oltin kurslari (TCMB API ishlamasa fallback)
  defaultRates: {
    USD_TRY: 35.4,
    EUR_TRY: 38.2,
    GOLD_GRAM_TRY: 3150.0,
    SILVER_GRAM_TRY: 37.5,
    source: "TCMB & Piyasa Gösterge Kurları"
  }
};

export function mapCampaignToInternalPurpose(purposeCode: string, campaignTitleTr: string, campaignRestricted: boolean) {
  const mapped = SITE_CONFIG.internalSyncMapping.campaigns[purposeCode];
  if (mapped) {
    return mapped;
  }
  return {
    purpose: `${SITE_CONFIG.internalSyncMapping.defaultPurposePrefix} ${campaignTitleTr}`.slice(0, 240),
    restricted: Boolean(campaignRestricted)
  };
}
