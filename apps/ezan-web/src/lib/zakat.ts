import { SITE_CONFIG } from "./config";

export interface ZakatInput {
  cashTry: number;
  foreignCashTry?: number;
  goldGrams: number;
  silverGrams?: number;
  tradeGoodsTry?: number;
  receivablesTry?: number;
  debtsTry: number;
  goldGramPriceTry?: number;
}

export interface ZakatResult {
  totalAssetsTry: number;
  deductibleDebtsTry: number;
  netWealthTry: number;
  nisabGoldGrams: number;
  goldGramPriceTry: number;
  nisabThresholdTry: number;
  isEligible: boolean;
  zakatDueTry: number;
  ratePercent: number;
  source: string;
  calculatedAt: string;
  disclaimer: string;
}

export function calculateZakat(input: ZakatInput): ZakatResult {
  const goldPrice =
    input.goldGramPriceTry && input.goldGramPriceTry > 0
      ? input.goldGramPriceTry
      : SITE_CONFIG.defaultRates.GOLD_GRAM_TRY;
  const silverPrice = SITE_CONFIG.defaultRates.SILVER_GRAM_TRY;

  const cash = Math.max(0, Number(input.cashTry || 0));
  const fxCash = Math.max(0, Number(input.foreignCashTry || 0));
  const goldVal = Math.max(0, Number(input.goldGrams || 0)) * goldPrice;
  const silverVal = Math.max(0, Number(input.silverGrams || 0)) * silverPrice;
  const tradeVal = Math.max(0, Number(input.tradeGoodsTry || 0));
  const recVal = Math.max(0, Number(input.receivablesTry || 0));
  const debts = Math.max(0, Number(input.debtsTry || 0));

  const totalAssetsTry = Math.round((cash + fxCash + goldVal + silverVal + tradeVal + recVal) * 100) / 100;
  const netWealthTry = Math.max(0, Math.round((totalAssetsTry - debts) * 100) / 100);
  const nisabGoldGrams = SITE_CONFIG.zakatRules.goldNisabGrams;
  const nisabThresholdTry = Math.round(nisabGoldGrams * goldPrice * 100) / 100;

  const isEligible = netWealthTry >= nisabThresholdTry;
  const zakatDueTry = isEligible
    ? Math.round(netWealthTry * SITE_CONFIG.zakatRules.rateFraction * 100) / 100
    : 0;

  return {
    totalAssetsTry,
    deductibleDebtsTry: debts,
    netWealthTry,
    nisabGoldGrams,
    goldGramPriceTry: goldPrice,
    nisabThresholdTry,
    isEligible,
    zakatDueTry,
    ratePercent: SITE_CONFIG.zakatRules.ratePercent,
    source: SITE_CONFIG.defaultRates.source,
    calculatedAt: new Date().toISOString().slice(0, 10),
    disclaimer: SITE_CONFIG.zakatRules.diyanetDisclaimerTag
  };
}
