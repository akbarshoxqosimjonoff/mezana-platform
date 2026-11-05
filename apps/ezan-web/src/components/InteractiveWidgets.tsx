"use client";

import React, { useState } from "react";
import { Locale } from "../i18n/country-locale";
import { UI_DICTIONARY } from "../i18n/messages";
import { SITE_CONFIG } from "../lib/config";
import { calculateZakat } from "../lib/zakat";
import { Button, Card } from "./ui";

export interface CampaignView {
  slug: string;
  purposeCode: string;
  restricted: boolean;
  currency: string;
  targetAmount: number;
  collectedAmount: number;
  presetAmounts: number[];
  title: string;
  summary: string;
}

export function DonationFlowWidget({
  locale,
  campaigns,
  initialCampaignSlug,
  initialAmount
}: {
  locale: Locale;
  campaigns: CampaignView[];
  initialCampaignSlug?: string;
  initialAmount?: number;
}) {
  const dict = UI_DICTIONARY[locale];
  const defaultCamp =
    campaigns.find((c) => c.slug === initialCampaignSlug) ||
    campaigns[0] || {
      slug: "genel-bagis",
      purposeCode: "GENEL-BAGIS",
      restricted: false,
      currency: "TRY",
      targetAmount: 0,
      collectedAmount: 0,
      presetAmounts: [250, 500, 1000, 2500],
      title: "Genel Bağış",
      summary: ""
    };

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [frequency, setFrequency] = useState<"one_time" | "monthly">("one_time");
  const [selectedSlug, setSelectedSlug] = useState<string>(defaultCamp.slug);
  const [amount, setAmount] = useState<number>(initialAmount || defaultCamp.presetAmounts[0] || 500);
  const [cart, setCart] = useState<Array<{ campaignSlug: string; title: string; amount: number }>>([]);

  // 2-qadam donor ma'lumotlari
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [wantReceipt, setWantReceipt] = useState(true);
  // KVKK roziligi (alohida checkbox, oldindan belgilanmagan)
  const [kvkkConsent, setKvkkConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? "" : "dev-turnstile-ok");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checkoutData, setCheckoutData] = useState<any>(null);

  const activeCamp = campaigns.find((c) => c.slug === selectedSlug) || defaultCamp;

  const addCurrentToCart = () => {
    if (amount < 50) {
      setErrorMsg("Minimum 50 TRY");
      return;
    }
    setErrorMsg(null);
    setCart((prev) => [
      ...prev,
      { campaignSlug: activeCamp.slug, title: activeCamp.title, amount: Number(amount) }
    ]);
  };

  const removeCartIndex = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  const effectiveItems =
    cart.length > 0
      ? cart
      : [{ campaignSlug: activeCamp.slug, title: activeCamp.title, amount: Number(amount) }];

  const totalTry = effectiveItems.reduce((acc, it) => acc + Number(it.amount || 0), 0);
  const approxUsd = (totalTry / SITE_CONFIG.defaultRates.USD_TRY).toFixed(1);
  const approxEur = (totalTry / SITE_CONFIG.defaultRates.EUR_TRY).toFixed(1);

  const handleProceedStep2 = () => {
    if (totalTry < 50) {
      setErrorMsg("Minimum 50 TRY");
      return;
    }
    setErrorMsg(null);
    setStep(2);
  };

  const handleCreateCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kvkkConsent) {
      setErrorMsg(dict.kvkkConsent);
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          frequency,
          turnstileToken,
          items: effectiveItems.map((i) => ({ campaignSlug: i.campaignSlug, amount: i.amount })),
          donor: {
            fullName: isAnonymous ? "Anonim Bağışçı" : fullName,
            phone,
            email,
            isAnonymous,
            wantReceipt,
            kvkkConsent
          }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Xatolik yuz berdi");
      }
      setCheckoutData(data);
      setStep(3);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const completeMock3DSPayment = async () => {
    if (!checkoutData?.donation) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/donations/mock-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donationExternalId: checkoutData.donation.external_id,
          publicNo: checkoutData.donation.public_no
        })
      });
      if (res.ok && checkoutData.checkout?.checkoutUrl) {
        const u = new URL(checkoutData.checkout.checkoutUrl, window.location.origin); window.location.href = u.pathname + u.search;
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-2 border-brand/15">
      {/* 3 qadamli indikator */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6 text-xs sm:text-sm font-bold">
        <span className={step === 1 ? "text-brand underline underline-offset-8 decoration-accent decoration-4" : "text-slate-500"}>
          1. {dict.quickDonateTitle}
        </span>
        <span className={step === 2 ? "text-brand underline underline-offset-8 decoration-accent decoration-4" : "text-slate-500"}>
          2. {dict.donorInfo}
        </span>
        <span className={step === 3 ? "text-brand underline underline-offset-8 decoration-accent decoration-4" : "text-slate-500"}>
          3. 3D Secure
        </span>
      </div>

      {errorMsg && (
        <div role="alert" className="mb-4 p-3 rounded-xl bg-red-50 border border-red-300 text-red-900 text-sm font-medium">
          {errorMsg}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5" data-testid="donation-step-1">
          {SITE_CONFIG.recurringEnabled && (
            <div className="flex gap-2" role="group" aria-label="Donation frequency">
              <button
                type="button"
                onClick={() => setFrequency("one_time")}
                className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-sm border transition-colors ${
                  frequency === "one_time"
                    ? "bg-brand text-white border-brand"
                    : "bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100"
                }`}
              >
                {dict.donateOneTime}
              </button>
              <button
                type="button"
                onClick={() => setFrequency("monthly")}
                className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-sm border transition-colors ${
                  frequency === "monthly"
                    ? "bg-brand text-white border-brand"
                    : "bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100"
                }`}
              >
                {dict.donateMonthly}
              </button>
            </div>
          )}

          <div>
            <label htmlFor="campaign-select" className="block text-sm font-bold text-brand mb-1.5">
              {dict.activeCampaigns}
            </label>
            <select
              id="campaign-select"
              value={selectedSlug}
              onChange={(e) => {
                setSelectedSlug(e.target.value);
                const found = campaigns.find((c) => c.slug === e.target.value);
                if (found?.presetAmounts?.[0]) setAmount(found.presetAmounts[0]);
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 focus:border-brand focus:outline-none"
            >
              {campaigns.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-sm font-bold text-brand mb-2">{dict.customAmount}</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {activeCamp.presetAmounts.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset)}
                  className={`py-2.5 px-3 rounded-xl font-bold text-sm border transition-all ${
                    amount === preset
                      ? "bg-accent text-brand border-brand shadow-sm"
                      : "bg-white text-slate-800 border-slate-300 hover:border-brand"
                  }`}
                >
                  {preset.toLocaleString("tr-TR")} ₺
                </button>
              ))}
            </div>
            <input
              type="number"
              min={50}
              max={5000000}
              aria-label={dict.customAmount}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-base font-bold text-brand focus:border-brand focus:outline-none"
            />
          </div>

          {/* Savatcha qismi */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
            <Button type="button" variant="outline" size="sm" onClick={addCurrentToCart}>
              + {dict.addToCart}
            </Button>
            <div className="text-end">
              <div className="text-lg font-extrabold text-brand">
                {totalTry.toLocaleString("tr-TR")} TRY
              </div>
              <div className="text-xs text-slate-600">
                ≈ ${approxUsd} USD / €{approxEur} EUR ({SITE_CONFIG.defaultRates.source})
              </div>
            </div>
          </div>

          {cart.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-brand uppercase">{dict.cartTitle}</div>
              {cart.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800">{it.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-brand">{it.amount.toLocaleString("tr-TR")} TRY</span>
                    <button
                      type="button"
                      onClick={() => removeCartIndex(idx)}
                      aria-label={`Remove ${it.title}`}
                      className="text-red-700 hover:underline font-bold"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="accent"
            size="lg"
            className="w-full"
            data-testid="proceed-step-2"
            onClick={handleProceedStep2}
          >
            {dict.proceedToCheckout} ({totalTry.toLocaleString("tr-TR")} TRY)
          </Button>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={handleCreateCheckout} className="space-y-4" data-testid="donation-step-2">
          <div className="flex items-center gap-2.5">
            <input
              id="anon-check"
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <label htmlFor="anon-check" className="text-sm font-medium text-slate-800">
              {dict.anonymousDonor}
            </label>
          </div>

          {!isAnonymous && (
            <div>
              <label htmlFor="donor-name" className="block text-sm font-bold text-brand mb-1">
                {dict.fullName} *
              </label>
              <input
                id="donor-name"
                type="text"
                required={!isAnonymous}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="donor-phone" className="block text-sm font-bold text-brand mb-1">
                {dict.phone}
              </label>
              <input
                id="donor-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+90 5XX XXX XX XX"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="donor-email" className="block text-sm font-bold text-brand mb-1">
                {dict.email}
              </label>
              <input
                id="donor-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@eposta.com"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <input
              id="receipt-check"
              type="checkbox"
              checked={wantReceipt}
              onChange={(e) => setWantReceipt(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <label htmlFor="receipt-check" className="text-sm text-slate-800">
              {dict.requestReceipt}
            </label>
          </div>

          {/* KVKK roziligi: alohida checkbox, oldindan belgilanmagan */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
            <input
              id="kvkk-check"
              data-testid="kvkk-checkbox"
              type="checkbox"
              required
              checked={kvkkConsent}
              onChange={(e) => setKvkkConsent(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <label htmlFor="kvkk-check" className="text-xs sm:text-sm font-medium text-slate-800">
              {dict.kvkkConsent} *
            </label>
          </div>

          {/* Cloudflare Turnstile himoyasi (2-qadam xayriya formasi) */}
          <div data-testid="donation-turnstile" className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}>
            <input
              type="hidden"
              name="cf-turnstile-response"
              value={turnstileToken}
              onChange={(e) => setTurnstileToken(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              ←
            </Button>
            <Button
              type="submit"
              variant="accent"
              size="lg"
              disabled={submitting}
              data-testid="submit-checkout-btn"
              className="flex-1"
            >
              {submitting ? "..." : dict.payWithIyzico}
            </Button>
          </div>
        </form>
      )}

      {step === 3 && checkoutData && (
        <div className="space-y-4 text-center py-4" data-testid="donation-step-3">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold">
            3D Secure Gateway ({checkoutData.checkout.provider.toUpperCase()} — SANDBOX)
          </div>
          <h3 className="text-xl font-heading font-bold text-brand">
            Kayıt No: {checkoutData.donation.public_no}
          </h3>
          <p className="text-sm text-slate-700">
            Tutar: <strong>{Number(checkoutData.donation.amount_try).toLocaleString("tr-TR")} TRY</strong>
          </p>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Kart bilgileri sitemizde kesinlikle saklanmaz ve sunucumuzdan geçmez. Ödeme sağlayıcı (iyzico/mock) 3D Secure ekranı üzerinden tamamlanır.
          </p>
          <div className="pt-3">
            <Button
              type="button"
              variant="accent"
              size="lg"
              data-testid="mock-3ds-approve-btn"
              disabled={submitting}
              onClick={completeMock3DSPayment}
            >
              {submitting ? "..." : "3D Secure Onayla (Mock Sandbox)"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function ZakatCalculatorWidget({ locale }: { locale: Locale }) {
  const dict = UI_DICTIONARY[locale];
  const [cashTry, setCashTry] = useState<number>(100000);
  const [goldGrams, setGoldGrams] = useState<number>(30);
  const [silverGrams, setSilverGrams] = useState<number>(0);
  const [tradeGoodsTry, setTradeGoodsTry] = useState<number>(50000);
  const [debtsTry, setDebtsTry] = useState<number>(10000);

  const result = calculateZakat({
    cashTry,
    foreignCashTry: 0,
    goldGrams,
    silverGrams,
    tradeGoodsTry,
    receivablesTry: 0,
    debtsTry
  });

  const donateSlug = locale === "uz" ? "xayriya" : locale === "tr" ? "bagis" : "donate";

  return (
    <Card className="border-2 border-brand/15">
      <h2 className="text-xl font-heading font-bold text-brand mb-2">{dict.zakatCalcTitle}</h2>
      <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5">
        {dict.zakatRuleNote} — {result.source} ({result.calculatedAt})
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="zakat-cash" className="block text-xs font-bold text-brand mb-1">
            Nakit ve Banka Mevduatı (TRY)
          </label>
          <input
            id="zakat-cash"
            type="number"
            min={0}
            value={cashTry}
            onChange={(e) => setCashTry(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold"
          />
        </div>
        <div>
          <label htmlFor="zakat-gold" className="block text-xs font-bold text-brand mb-1">
            Altın (Gram — 1g ≈ {result.goldGramPriceTry} TRY)
          </label>
          <input
            id="zakat-gold"
            type="number"
            min={0}
            value={goldGrams}
            onChange={(e) => setGoldGrams(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold"
          />
        </div>
        <div>
          <label htmlFor="zakat-silver" className="block text-xs font-bold text-brand mb-1">
            Gümüş (Gram)
          </label>
          <input
            id="zakat-silver"
            type="number"
            min={0}
            value={silverGrams}
            onChange={(e) => setSilverGrams(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold"
          />
        </div>
        <div>
          <label htmlFor="zakat-trade" className="block text-xs font-bold text-brand mb-1">
            Ticari Mallar (TRY)
          </label>
          <input
            id="zakat-trade"
            type="number"
            min={0}
            value={tradeGoodsTry}
            onChange={(e) => setTradeGoodsTry(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="zakat-debts" className="block text-xs font-bold text-brand mb-1">
            Kısa Vadeli Borçlar (TRY — Düşülecek)
          </label>
          <input
            id="zakat-debts"
            type="number"
            min={0}
            value={debtsTry}
            onChange={(e) => setDebtsTry(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold"
          />
        </div>
      </div>

      <div className="p-4 rounded-xl bg-brand text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-300">
            Net Varlık: {result.netWealthTry.toLocaleString("tr-TR")} TRY | Nisap ({result.nisabGoldGrams}g Altın):{" "}
            {result.nisabThresholdTry.toLocaleString("tr-TR")} TRY
          </div>
          <div className="text-2xl font-heading font-extrabold text-white mt-1" data-testid="zakat-due-amount">
            Zekât Tutarı: {result.zakatDueTry.toLocaleString("tr-TR")} TRY
          </div>
        </div>
        {result.zakatDueTry > 0 && (
          <a
            href={`/${locale}/${donateSlug}?campaign=zekat-ve-fitre-fonu&amount=${Math.ceil(result.zakatDueTry)}`}
            className="px-5 py-3 rounded-xl bg-accent text-brand font-bold text-sm hover:bg-accent-hover transition-colors shrink-0"
          >
            {dict.payZakatBtn}
          </a>
        )}
      </div>
    </Card>
  );
}