import React from "react";
import { cookies, headers } from "next/headers";
import { verifyAdminNetworkLayer, PAYLOAD_COLLECTIONS } from "../../cms/service";
import { dbQuery, ensureSchema } from "../../db/schema";
import { canAccessAdminCms, getAuthenticatedAdminSession } from "../../lib/security";
import { getKurbanSeasonSummary } from "../../kurban/service";

export default async function AdminPage() {
  const hdrs = await headers();
  const cfIp = hdrs.get("cf-connecting-ip");
  const peerIp = hdrs.get("x-real-ip") || hdrs.get("x-peer-ip");
  const cfJwt = hdrs.get("cf-access-jwt-assertion");

  const netCheck = await verifyAdminNetworkLayer({
    cfConnectingIp: cfIp,
    peerIp,
    cfAccessJwt: cfJwt
  });

  if (!netCheck.allowed) {
    return (
      <html lang="tr">
        <body className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
          <div className="max-w-md bg-slate-800 border border-red-500 rounded-2xl p-6 text-center">
            <h1 className="text-xl font-bold text-red-400 mb-2">403 — Yetkisiz Ağ Erişimi</h1>
            <p className="text-sm text-slate-300">
              Admin paneli yalnızca Cloudflare üzerinden gelen ve ADMIN_ALLOWED_IPS listesinde bulunan IP adreslerinden açılır.
            </p>
          </div>
        </body>
      </html>
    );
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("ezan_admin_session")?.value;
  const session = await getAuthenticatedAdminSession(sessionCookie);

  if (!session) {
    return (
      <html lang="tr">
        <body className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6">
            <h1 className="text-xl font-bold text-white mb-2">Ezan Vakfı — Admin Girişi (2FA Zorunlu)</h1>
            <p className="text-xs text-slate-300 mb-4">
              Devam etmek için kurumsal e-posta, parola ve 6 haneli TOTP doğrulama kodunuzla giriş yapın (<code>POST /api/admin/login</code>).
            </p>
          </div>
        </body>
      </html>
    );
  }

  // 0-qadam: `field` (dala jamoasi) roli `/admin` ga kira olmaydi, faqat `/dala` ga kira oladi
  if (!canAccessAdminCms(session.role)) {
    return (
      <html lang="tr">
        <body className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
          <div className="max-w-md bg-slate-800 border border-amber-500 rounded-2xl p-6 text-center space-y-3">
            <h1 className="text-xl font-bold text-amber-400">403 — Saha Ekibi (field) Bu Panele Giremez</h1>
            <p className="text-sm text-slate-300">
              Dala jamoasi (<code>field</code> roli) faqat qurbonlik ro&apos;yxatlarini ko&apos;rish va video yuklash uchun <code>/dala</code> sahifasiga kira oladi.
            </p>
            <a href="/dala" className="inline-block px-4 py-2 rounded-xl bg-accent text-brand font-bold text-xs">
              /dala sahifasiga o&apos;tish
            </a>
          </div>
        </body>
      </html>
    );
  }

  await ensureSchema();
  const [donationsRes, kurbanSummary, messageLogsRes, videosRes] = await Promise.all([
    dbQuery(
      `SELECT public_no, donor_name, amount_try, currency, status, is_test, purpose_title, synced_to_vaqf_at, created_at
       FROM donations
       ORDER BY id DESC
       LIMIT 20`
    ),
    getKurbanSeasonSummary(2027),
    dbQuery(`SELECT * FROM kurban_message_logs ORDER BY id DESC LIMIT 20`),
    dbQuery(`SELECT * FROM kurban_videos ORDER BY id DESC LIMIT 20`)
  ]);

  return (
    <html lang="tr">
      <body className="min-h-screen bg-slate-100 text-slate-900 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <header className="bg-brand text-white rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-accent">
                Oturum: {session.email} ({session.role}) • 2FA Doğrulandı • Payload CMS 3 Aktif
              </span>
              <h1 className="text-2xl font-heading font-extrabold mt-1">
                Ezan Vakfı — Yönetim, CMS ve Kurban 2027 Paneli (/admin)
              </h1>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <a
                href="/api/admin/kurban/field-sheet-pdf?season=2027"
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-xl bg-accent text-brand font-extrabold"
              >
                📄 A4 Saha Kesim Listesi (PDF)
              </a>
            </div>
          </header>

          {/* 3-qadam: Kurban 2027 Davlatlar bo'yicha statistika */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-brand">
                Kurban 2027 — Ülke Bazlı Operasyon Özeti (Sotilgan / Biriktirilgan / Kesilgan / Video / Xabar)
              </h2>
              <span className="text-xs font-mono text-slate-600">
                API: <code>/api/admin/kurban</code> &amp; <code>/api/admin/cms</code>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2 pr-4">Ülke</th>
                    <th className="py-2 pr-4">Satılan Hisse</th>
                    <th className="py-2 pr-4">Hayvana Atanan</th>
                    <th className="py-2 pr-4">Kesilen</th>
                    <th className="py-2 pr-4">Videosu Hazır</th>
                    <th className="py-2 pr-4">Bildirim Gönderilen</th>
                  </tr>
                </thead>
                <tbody>
                  {kurbanSummary.countries.map((c) => (
                    <tr key={c.countryCode} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-bold text-brand">
                        {c.flag} {c.nameTr} ({c.countryCode})
                      </td>
                      <td className="py-2 pr-4 font-bold">{c.soldShares}</td>
                      <td className="py-2 pr-4">{c.assignedShares}</td>
                      <td className="py-2 pr-4">{c.slaughteredShares}</td>
                      <td className="py-2 pr-4 text-emerald-800 font-bold">{c.videoReadyShares}</td>
                      <td className="py-2 pr-4 text-brand font-bold">{c.notifiedShares}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Videosi yo'q hayvonlar ro'yxati alohida */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                <h3 className="text-xs font-extrabold text-amber-950 uppercase mb-2">
                  Videosi Yo&apos;q Hayvonlar Ro&apos;yxati ({kurbanSummary.animalsWithoutVideo.length})
                </h3>
                {kurbanSummary.animalsWithoutVideo.length === 0 ? (
                  <p className="text-xs text-amber-900">Barcha biriktirilgan hayvonlarning videosi mavjud.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-amber-950 font-mono">
                    {kurbanSummary.animalsWithoutVideo.map((a: any) => (
                      <li key={a.id}>
                        • {a.tag_no} ({a.country_code} - {a.animal_type}) — Durum: {a.status}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Telefon noto'g'ri bo'lsa, ogohlantirish ro'yxati */}
              <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                <h3 className="text-xs font-extrabold text-red-950 uppercase mb-2">
                  Noto&apos;g&apos;ri Telefon Raqam Ogohlantirish Ro&apos;yxati ({kurbanSummary.invalidPhoneOrders.length})
                </h3>
                {kurbanSummary.invalidPhoneOrders.length === 0 ? (
                  <p className="text-xs text-red-900">Noto&apos;g&apos;ri telefon raqamli buyurtmalar yo&apos;q.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-red-950 font-mono">
                    {kurbanSummary.invalidPhoneOrders.map((o: any) => (
                      <li key={o.id}>
                        • {o.order_no}: {o.donor_name} ({o.donor_phone})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* 4-qadam va 5-qadam: Video Moderatsiya va Xabarlar Tarixi */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-brand">
                Yüklenen Kurban Videoları ve Moderasyon ({videosRes.rowCount})
              </h2>
              <div className="space-y-2 text-xs">
                {videosRes.rows.map((v) => (
                  <div key={v.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-mono font-bold text-brand">
                        Video #{v.id} • Hayvan #{v.animal_id} ({v.country_code})
                      </div>
                      <div className="text-slate-600">
                        Durum: <strong>{v.status}</strong> • Yükleyen: {v.uploaded_by}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-950 font-bold">
                      {v.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-brand">
                Kurban Bildirim Geçmişi (SMS / WhatsApp / E-posta) ve Qayta Yuborish
              </h2>
              <div className="space-y-2 text-xs">
                {messageLogsRes.rows.map((m) => (
                  <div key={m.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-brand">
                        [{m.channel.toUpperCase()}] {m.event_stage} → {m.recipient}
                      </div>
                      <div className="text-slate-600 truncate max-w-md">{m.body}</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-900 font-bold">
                      {m.status} ({m.char_length} chr)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {PAYLOAD_COLLECTIONS.map((col) => (
              <div key={col.slug} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="font-bold text-brand text-sm">{col.label}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Koleksiyon: <code>{col.slug}</code> • 4 Dil (TR/UZ/EN/AR)
                </div>
              </div>
            ))}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-brand mb-3">Son Online Bağışlar ve Kurban Ödemeleri</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2 pr-4">Public No</th>
                    <th className="py-2 pr-4">Bağışçı</th>
                    <th className="py-2 pr-4">Tutar</th>
                    <th className="py-2 pr-4">Mod</th>
                    <th className="py-2 pr-4">Amaç</th>
                    <th className="py-2 pr-4">Durum</th>
                    <th className="py-2 pr-4">İç Vaqf Senkron</th>
                  </tr>
                </thead>
                <tbody>
                  {donationsRes.rows.map((d) => (
                    <tr key={d.public_no} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-mono font-bold text-brand">{d.public_no}</td>
                      <td className="py-2 pr-4">{d.donor_name}</td>
                      <td className="py-2 pr-4 font-bold">
                        {Number(d.amount_try).toLocaleString("tr-TR")} {d.currency}
                      </td>
                      <td className="py-2 pr-4">{d.is_test ? "SİNOV (TEST)" : "CANLI (LIVE)"}</td>
                      <td className="py-2 pr-4">{d.purpose_title}</td>
                      <td className="py-2 pr-4 uppercase font-bold">{d.status}</td>
                      <td className="py-2 pr-4">
                        {d.is_test
                          ? "🚫 Test (Senkronize Edilmez)"
                          : d.synced_to_vaqf_at
                            ? "✅ Senkronize"
                            : "⏳ Bekliyor"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </body>
    </html>
  );
}
