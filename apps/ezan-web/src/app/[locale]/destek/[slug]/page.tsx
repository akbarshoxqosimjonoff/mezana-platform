import { notFound } from "next/navigation";
import { ensureSchema, dbQuery } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function P2pCampaignPage({
  params
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  await ensureSchema();

  const res = await dbQuery<{
    slug: string;
    organizer_name: string;
    campaign_slug: string;
    title: string;
    personal_message: string;
    target_amount_try: string;
    collected_amount_try: string;
    status: string;
  }>(`SELECT * FROM p2p_campaigns WHERE slug = $1 AND status = 'approved' LIMIT 1`, [slug]);

  const campaign = res.rows[0];
  if (!campaign) {
    notFound();
  }

  const target = Number(campaign.target_amount_try || 1);
  const collected = Number(campaign.collected_amount_try || 0);
  const pct = Math.min(100, Math.round((collected / Math.max(1, target)) * 100));

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-2xl border border-emerald-900/15 bg-white p-8 shadow-sm">
        <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
          Gönüllü Destek Kampanyası • {campaign.organizer_name}
        </span>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">{campaign.title}</h1>
        <p className="mt-3 text-slate-700">{campaign.personal_message}</p>

        <div className="mt-6 rounded-xl bg-slate-50 p-5">
          <div className="flex justify-between text-sm font-medium text-slate-700">
            <span>Toplanan: {collected.toLocaleString("tr-TR")} TRY</span>
            <span>Hedef: {target.toLocaleString("tr-TR")} TRY (%{pct})</span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-emerald-700" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="mt-6">
          <a
            href={`/${locale}/bagis?campaign=${encodeURIComponent(campaign.campaign_slug)}&p2p=${encodeURIComponent(campaign.slug)}`}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-800 px-6 py-3 font-semibold text-white hover:bg-emerald-900"
          >
            Bu Kampanyaya Destek Ol
          </a>
        </div>
      </div>
    </main>
  );
}
