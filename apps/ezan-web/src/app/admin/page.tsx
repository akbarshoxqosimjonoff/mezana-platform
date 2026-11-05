import React from "react";
import { headers } from "next/headers";
import { isAdminAccessAllowed, PAYLOAD_COLLECTIONS } from "../../cms/service";
import { dbQuery, ensureSchema } from "../../db/schema";
import { seedDatabase } from "../../db/seed";

export default async function PayloadAdminPage() {
  const hdrs = await headers();
  const clientIp = hdrs.get("cf-connecting-ip") || hdrs.get("x-forwarded-for") || "127.0.0.1";
  const cfJwt = hdrs.get("cf-access-jwt-assertion");

  if (!isAdminAccessAllowed({ clientIp, cfAccessJwt: cfJwt })) {
    return (
      <html lang="tr">
        <body className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
          <div className="max-w-md bg-slate-800 border border-red-500 rounded-2xl p-6 text-center">
            <h1 className="text-xl font-bold text-red-400 mb-2">403 — Yetkisiz Erişim</h1>
            <p className="text-sm text-slate-300">
              Admin paneli yalnızca izin verilen IP adreslerinden (ADMIN_ALLOWED_IPS) veya Cloudflare Access üzerinden açılır.
            </p>
          </div>
        </body>
      </html>
    );
  }

  await ensureSchema();
  await seedDatabase();
  const [donationsRes, campaignsRes] = await Promise.all([
    dbQuery(`SELECT public_no, donor_name, amount_try, currency, status, purpose_title, synced_to_vaqf_at, created_at FROM donations ORDER BY id DESC LIMIT 20`),
    dbQuery(`SELECT slug, purpose_code, restricted, target_amount, collected_amount, needs_review FROM cms_campaigns ORDER BY id ASC`)
  ]);

  return (
    <html lang="tr">
      <body className="min-h-screen bg-slate-100 text-slate-900 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <header className="bg-brand text-white rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-accent">
                Payload CMS 3 • 2FA Active • RBAC (admin / editor / translator / finance)
              </span>
              <h1 className="text-2xl font-heading font-extrabold mt-1">
                Ezan Vakfı — İçerik ve Bağış Yönetim Paneli (/admin)
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
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[11px] font-semibold">
                    needsReview: UZ/EN/AR
                  </span>
                  {col.supportsDraft && (
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                      Draft/Publish
                    </span>
                  )}
                </div>
              </div>
            ))}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-brand mb-3">
              Son Online Bağışlar (Finance Rolü Salt-Okunur Görünümü)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2 pr-4">Public No</th>
                    <th className="py-2 pr-4">Bağışçı</th>
                    <th className="py-2 pr-4">Tutar</th>
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
                      <td className="py-2 pr-4">{d.purpose_title}</td>
                      <td className="py-2 pr-4 uppercase font-bold">{d.status}</td>
                      <td className="py-2 pr-4">
                        {d.synced_to_vaqf_at ? "✅ Senkronize" : "⏳ Bekliyor"}
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