import React from "react";
import { cookies, headers } from "next/headers";
import { verifyAdminNetworkLayer, PAYLOAD_COLLECTIONS } from "../../cms/service";
import { dbQuery, ensureSchema } from "../../db/schema";
import { getAuthenticatedAdminSession } from "../../lib/security";

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

  await ensureSchema();
  const [donationsRes] = await Promise.all([
    dbQuery(
      `SELECT public_no, donor_name, amount_try, currency, status, is_test, purpose_title, synced_to_vaqf_at, created_at
       FROM donations
       ORDER BY id DESC
       LIMIT 20`
    )
  ]);

  return (
    <html lang="tr">
      <body className="min-h-screen bg-slate-100 text-slate-900 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <header className="bg-brand text-white rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-accent">
                Oturum: {session.email} ({session.role}) • 2FA Doğrulandı
              </span>
              <h1 className="text-2xl font-heading font-extrabold mt-1">
                Ezan Vakfı — Yönetim Paneli (/admin)
              </h1>
            </div>
            <div className="text-xs text-slate-200">
              KVKK PII Silme API: <code>POST /api/admin/kvkk-erase</code>
            </div>
          </header>

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
            <h2 className="text-lg font-bold text-brand mb-3">
              Son Online Bağışlar
            </h2>
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
                      <td className="py-2 pr-4">
                        {d.is_test ? "SİNOV (TEST)" : "CANLI (LIVE)"}
                      </td>
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
