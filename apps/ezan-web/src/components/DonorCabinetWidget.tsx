"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Locale } from "../i18n/country-locale";
import { Badge, Card } from "./ui";

const CABINET_TEXT: Record<Locale, Record<string, string>> = {
  tr: {
    loginTitle: "Bağışçı Hesabım Girişi",
    loginSubtitle: "Telefon numaranıza 6 haneli SMS kodu veya e-posta adresinize tek kullanımlık bağlantı ile giriş yapın.",
    smsMode: "Telefon + SMS Kodu (OTP)",
    emailMode: "E-posta Bağlantısı",
    targetPhoneLabel: "Cep Telefonu (Uluslararası Format)",
    targetEmailLabel: "E-posta Adresi",
    sendCodeBtn: "6 Haneli Kod Gönder",
    otpCodeLabel: "6 Haneli Doğrulama Kodu (5 dk geçerli)",
    verifyBtn: "Doğrula ve Giriş Yap",
    tabDonations: "Bağışlarım",
    tabKurban: "Kurbanlarım",
    tabProfile: "Bilgilerim",
    tabKvkk: "KVKK ve Verilerim",
    tabRecurring: "Aylık Bağışlar",
    saveProfileBtn: "Bilgilerimi Kaydet",
    exportJsonBtn: "Verilerimi İndir (JSON)",
    exportPdfBtn: "Verilerimi İndir (PDF)",
    requestDeleteBtn: "KVKK Silme / Anonimleştirme Talep Et"
  },
  uz: {
    loginTitle: "Xayriyachi Kabinetiga Kirish",
    loginSubtitle: "Telefon raqamingizga 6 xonali SMS kod yoki e-pochtaga bir martalik havola orqali kiring.",
    smsMode: "Telefon + SMS Kod (OTP)",
    emailMode: "E-pochta havolasi",
    targetPhoneLabel: "Telefon raqam (xalqaro formatda)",
    targetEmailLabel: "E-pochta manzili",
    sendCodeBtn: "6 Xonali Kod Yuborish",
    otpCodeLabel: "6 Xonali Tasdiqlash Kodi (5 daqiqa amal qiladi)",
    verifyBtn: "Tasdiqlash va Kirish",
    tabDonations: "Xayriyalarim",
    tabKurban: "Qurbonliklarim",
    tabProfile: "Ma'lumotlarim",
    tabKvkk: "KVKK va Ma'lumotlarim",
    tabRecurring: "Oylik Xayriyalar",
    saveProfileBtn: "Ma'lumotlarni Saqlash",
    exportJsonBtn: "Ma'lumotlarimni Yuklab Olish (JSON)",
    exportPdfBtn: "Ma'lumotlarimni Yuklab Olish (PDF)",
    requestDeleteBtn: "KVKK O'chirish / Anonimlashtirish So'rash"
  },
  en: {
    loginTitle: "Donor Account Login",
    loginSubtitle: "Sign in with a 6-digit SMS OTP code or a one-time email link.",
    smsMode: "Phone + SMS OTP",
    emailMode: "Email Magic Link",
    targetPhoneLabel: "Phone Number (International Format)",
    targetEmailLabel: "Email Address",
    sendCodeBtn: "Send 6-Digit Code",
    otpCodeLabel: "6-Digit Verification Code (Valid for 5 min)",
    verifyBtn: "Verify & Sign In",
    tabDonations: "My Donations",
    tabKurban: "My Qurbani",
    tabProfile: "My Profile",
    tabKvkk: "KVKK & Privacy",
    tabRecurring: "Monthly Donations",
    saveProfileBtn: "Save Preferences",
    exportJsonBtn: "Download My Data (JSON)",
    exportPdfBtn: "Download My Data (PDF)",
    requestDeleteBtn: "Request KVKK Anonymization"
  },
  ar: {
    loginTitle: "تسجيل الدخول إلى حساب المتبرع",
    loginSubtitle: "ادخل عبر رمز SMS المكون من 6 أرقام أو رابط البريد الإلكتروني لمرة واحدة.",
    smsMode: "الهاتف + رمز SMS",
    emailMode: "رابط البريد الإلكتروني",
    targetPhoneLabel: "رقم الهاتف الدولي",
    targetEmailLabel: "البريد الإلكتروني",
    sendCodeBtn: "إرسال الرمز المكون من 6 أرقام",
    otpCodeLabel: "رمز التحقق (صالح لمدة 5 دقائق)",
    verifyBtn: "تحقق ودخول",
    tabDonations: "تبرعاتي",
    tabKurban: "أضاحيّ",
    tabProfile: "بياناتي",
    tabKvkk: "الخصوصية (KVKK)",
    tabRecurring: "التبرعات الشهرية",
    saveProfileBtn: "حفظ البيانات",
    exportJsonBtn: "تحميل بياناتي (JSON)",
    exportPdfBtn: "تحميل بياناتي (PDF)",
    requestDeleteBtn: "طلب حذف / إخفاء الهوية (KVKK)"
  }
};

export function DonorCabinetWidget({ locale }: { locale: Locale }) {
  const t = CABINET_TEXT[locale] || CABINET_TEXT.tr;
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [target, setTarget] = useState<string>("+905551234567");
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [otpCode, setOtpCode] = useState<string>("");
  const [dashboard, setDashboard] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"donations" | "kurban" | "profile" | "kvkk" | "recurring">("kurban");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<string>("");

  const [fullName, setFullName] = useState<string>("");
  const [emailInput, setEmailInput] = useState<string>("");
  const [smsNotif, setSmsNotif] = useState<boolean>(true);
  const [waNotif, setWaNotif] = useState<boolean>(true);
  const [emailNotif, setEmailNotif] = useState<boolean>(true);

  const loadDashboard = async () => {
    try {
      const res = await fetch("/api/donor-cabinet");
      if (res.ok) {
        const data = await res.json();
        setDashboard(data);
        setFullName(data.profile?.fullName || "");
        setEmailInput(data.profile?.email || "");
        setSmsNotif(Boolean(data.profile?.smsNotifications ?? true));
        setWaNotif(Boolean(data.profile?.whatsappNotifications ?? true));
        setEmailNotif(Boolean(data.profile?.emailNotifications ?? true));
      }
    } catch {
      // Not logged in yet
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleRequestOtp = async () => {
    setErrorMsg("");
    setStatusMsg("");
    const res = await fetch("/api/donor-auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        target,
        locale,
        turnstileToken: "dev-turnstile-ok"
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || "Failed to send OTP");
      return;
    }
    setOtpSent(true);
    if (data.devMockOtpCode) {
      setOtpCode(String(data.devMockOtpCode));
    }
  };

  const handleVerifyOtp = async () => {
    setErrorMsg("");
    const res = await fetch("/api/donor-auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel,
        target,
        code: otpCode,
        locale
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || "OTP verification failed");
      return;
    }
    await loadDashboard();
  };

  const handleSaveProfile = async () => {
    setStatusMsg("");
    const res = await fetch("/api/donor-cabinet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_profile",
        fullName,
        email: emailInput,
        preferredLocale: locale,
        smsNotifications: smsNotif,
        whatsappNotifications: waNotif,
        emailNotifications: emailNotif
      })
    });
    if (res.ok) {
      setStatusMsg("✓ Saved");
      await loadDashboard();
    }
  };

  const handleRequestKvkkDeletion = async () => {
    setStatusMsg("");
    const res = await fetch("/api/donor-cabinet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "request_kvkk_deletion",
        reason: "KVKK shaxsiy ma'lumotlarni anonimlashtirish so'rovi"
      })
    });
    if (res.ok) {
      setStatusMsg("✓ KVKK anonymization request submitted for admin approval");
      await loadDashboard();
    }
  };

  if (!dashboard) {
    return (
      <Card className="max-w-xl mx-auto space-y-4" data-testid="donor-cabinet-login">
        <h2 className="text-2xl font-heading font-extrabold text-brand">{t.loginTitle}</h2>
        <p className="text-xs text-slate-700">{t.loginSubtitle}</p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setChannel("sms");
              setTarget("+905551234567");
              setOtpSent(false);
            }}
            data-testid="cabinet-mode-sms"
            className={`py-2 px-3 rounded-xl font-bold text-xs border ${
              channel === "sms" ? "bg-brand text-white border-brand" : "bg-slate-50 text-brand border-slate-200"
            }`}
          >
            {t.smsMode}
          </button>
          <button
            type="button"
            onClick={() => {
              setChannel("email");
              setTarget("bagisci@ezanvakfi.org");
              setOtpSent(false);
            }}
            data-testid="cabinet-mode-email"
            className={`py-2 px-3 rounded-xl font-bold text-xs border ${
              channel === "email" ? "bg-brand text-white border-brand" : "bg-slate-50 text-brand border-slate-200"
            }`}
          >
            {t.emailMode}
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-xs font-bold text-red-900" role="alert">
            {errorMsg}
          </div>
        )}

        <div>
          <label htmlFor="cabinet-target-input" className="block text-xs font-bold text-brand mb-1">
            {channel === "sms" ? t.targetPhoneLabel : t.targetEmailLabel}
          </label>
          <input
            id="cabinet-target-input"
            data-testid="cabinet-target-input"
            type={channel === "sms" ? "tel" : "email"}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
          />
        </div>

        {!otpSent ? (
          <button
            type="button"
            onClick={handleRequestOtp}
            data-testid="cabinet-send-otp-btn"
            className="w-full py-3 rounded-xl bg-accent text-brand font-extrabold text-sm hover:bg-accent-hover"
          >
            {t.sendCodeBtn}
          </button>
        ) : (
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div>
              <label htmlFor="cabinet-otp-input" className="block text-xs font-bold text-brand mb-1">
                {t.otpCodeLabel}
              </label>
              <input
                id="cabinet-otp-input"
                data-testid="cabinet-otp-input"
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-center font-mono text-lg font-extrabold text-brand"
              />
            </div>
            <button
              type="button"
              onClick={handleVerifyOtp}
              data-testid="cabinet-verify-otp-btn"
              className="w-full py-3 rounded-xl bg-brand text-white font-extrabold text-sm hover:opacity-95"
            >
              {t.verifyBtn}
            </button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="donor-cabinet-dashboard">
      <div className="flex flex-wrap gap-2" role="navigation" aria-label="Donor cabinet sections">
        <button
          type="button"
          onClick={() => setActiveTab("kurban")}
          data-testid="cabinet-tab-kurban"
          className={`px-4 py-2.5 rounded-xl font-bold text-xs border ${
            activeTab === "kurban" ? "bg-brand text-white border-brand" : "bg-white text-brand border-slate-300"
          }`}
        >
          {t.tabKurban} ({dashboard.kurbanShares?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("donations")}
          data-testid="cabinet-tab-donations"
          className={`px-4 py-2.5 rounded-xl font-bold text-xs border ${
            activeTab === "donations" ? "bg-brand text-white border-brand" : "bg-white text-brand border-slate-300"
          }`}
        >
          {t.tabDonations} ({dashboard.donations?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          data-testid="cabinet-tab-profile"
          className={`px-4 py-2.5 rounded-xl font-bold text-xs border ${
            activeTab === "profile" ? "bg-brand text-white border-brand" : "bg-white text-brand border-slate-300"
          }`}
        >
          {t.tabProfile}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("kvkk")}
          data-testid="cabinet-tab-kvkk"
          className={`px-4 py-2.5 rounded-xl font-bold text-xs border ${
            activeTab === "kvkk" ? "bg-brand text-white border-brand" : "bg-white text-brand border-slate-300"
          }`}
        >
          {t.tabKvkk}
        </button>
        {dashboard.recurringEnabled && (
          <button
            type="button"
            onClick={() => setActiveTab("recurring")}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs border ${
              activeTab === "recurring" ? "bg-brand text-white border-brand" : "bg-white text-brand border-slate-300"
            }`}
          >
            {t.tabRecurring}
          </button>
        )}
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-950">
          {statusMsg}
        </div>
      )}

      {/* QURBONLIKLARIM BO'LIMI */}
      {activeTab === "kurban" && (
        <Card className="space-y-4" data-testid="cabinet-section-kurban">
          <h3 className="text-lg font-heading font-bold text-brand">{t.tabKurban}</h3>
          {(dashboard.kurbanShares || []).length === 0 ? (
            <p className="text-sm text-slate-600">—</p>
          ) : (
            <div className="space-y-3">
              {dashboard.kurbanShares.map((sh: any) => (
                <div
                  key={sh.shareId}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge tone="brand">{sh.seasonYear}</Badge>
                      <span className="font-mono text-xs font-bold text-brand">{sh.orderNo}</span>
                      <Badge tone="success">{sh.shareStatus}</Badge>
                    </div>
                    <div className="text-sm font-bold text-brand">
                      {sh.ownerName} ({sh.intentionType.toUpperCase()}) — {sh.countryCode}
                    </div>
                    {sh.tagNo && <div className="text-xs text-slate-700">Tag No: {sh.tagNo}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/${locale}/kurban/takip/${sh.trackingToken}`}
                      className="px-3.5 py-2 rounded-xl bg-brand text-white font-bold text-xs"
                    >
                      Takip / Video
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* XAYRIYALARIM BO'LIMI (1-BOSQICH BILAN AVTOMATIK BOG'LANGAN) */}
      {activeTab === "donations" && (
        <Card className="space-y-4" data-testid="cabinet-section-donations">
          <h3 className="text-lg font-heading font-bold text-brand">{t.tabDonations}</h3>
          {(dashboard.donations || []).length === 0 ? (
            <p className="text-sm text-slate-600">—</p>
          ) : (
            <div className="space-y-3">
              {dashboard.donations.map((d: any) => (
                <div
                  key={d.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-mono text-xs font-bold text-brand">
                      {d.publicNo} • {d.date}
                    </div>
                    <div className="text-sm font-bold text-brand">{d.purposeTitle}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-brand">
                      {Number(d.amountTry).toLocaleString("tr-TR")} {d.currency}
                    </span>
                    <Badge tone="success">{d.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* MA'LUMOTLARIM BO'LIMI */}
      {activeTab === "profile" && (
        <Card className="space-y-4" data-testid="cabinet-section-profile">
          <h3 className="text-lg font-heading font-bold text-brand">{t.tabProfile}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="prof-name" className="block text-xs font-bold text-brand mb-1">
                Ad Soyad / Ism
              </label>
              <input
                id="prof-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="prof-email" className="block text-xs font-bold text-brand mb-1">
                E-posta
              </label>
              <input
                id="prof-email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 pt-2">
            <label className="flex items-center gap-2 text-xs font-bold text-brand">
              <input type="checkbox" checked={smsNotif} onChange={(e) => setSmsNotif(e.target.checked)} />
              SMS Bildirimleri
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-brand">
              <input type="checkbox" checked={waNotif} onChange={(e) => setWaNotif(e.target.checked)} />
              WhatsApp Bildirimleri
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-brand">
              <input type="checkbox" checked={emailNotif} onChange={(e) => setEmailNotif(e.target.checked)} />
              E-posta Bildirimleri
            </label>
          </div>
          <button
            type="button"
            onClick={handleSaveProfile}
            className="px-5 py-2.5 rounded-xl bg-accent text-brand font-bold text-xs"
          >
            {t.saveProfileBtn}
          </button>
        </Card>
      )}

      {/* KVKK BO'LIMI */}
      {activeTab === "kvkk" && (
        <Card className="space-y-4" data-testid="cabinet-section-kvkk">
          <h3 className="text-lg font-heading font-bold text-brand">{t.tabKvkk}</h3>
          <div className="flex flex-wrap gap-3">
            <a
              href="/api/donor-cabinet?export=json"
              data-testid="kvkk-export-json-btn"
              className="px-4 py-2.5 rounded-xl bg-brand text-white font-bold text-xs"
            >
              {t.exportJsonBtn}
            </a>
            <a
              href="/api/donor-cabinet?export=pdf"
              data-testid="kvkk-export-pdf-btn"
              className="px-4 py-2.5 rounded-xl bg-slate-800 text-white font-bold text-xs"
            >
              {t.exportPdfBtn}
            </a>
            <button
              type="button"
              onClick={handleRequestKvkkDeletion}
              data-testid="kvkk-request-delete-btn"
              className="px-4 py-2.5 rounded-xl bg-red-700 text-white font-bold text-xs"
            >
              {t.requestDeleteBtn}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
