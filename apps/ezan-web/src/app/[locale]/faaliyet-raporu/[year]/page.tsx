import { notFound } from "next/navigation";
import { getAnnualReportPageData } from "@/growth/service";
import type { Locale } from "@/i18n/country-locale";

export const dynamic = "force-dynamic";

export default async function AnnualReportPage({
  params
}: {
  params: Promise<{ locale: string; year: string }>;
}) {
  const { locale, year } = await params;
  const yearNum = Number.parseInt(year, 10);
  if (!Number.isFinite(yearNum)) {
    notFound();
  }

  const report = await getAnnualReportPageData(yearNum);
  if (!report) {
    notFound();
  }

  const loc = (["tr", "uz", "en", "ar"].includes(locale) ? locale : "tr") as Locale;
  const title = report.title?.[loc] || report.title?.tr || `${yearNum} Faaliyet Raporu`;
  const summary = report.summary?.[loc] || report.summary?.tr || "";
  const incomes: Array<{ source: string; amountTry: number }> = Array.isArray(report.income_breakdown)
    ? report.income_breakdown
    : [];
  const expenses: Array<{ category: string; amountTry: number }> = Array.isArray(report.expense_breakdown)
    ? report.expense_breakdown
    : [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
          Şeffaflık ve Yıllık Faaliyet Raporu • {yearNum}
        </span>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-3 text-slate-700">{summary}</p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
            <h2 className="text-lg font-semibold text-slate-900">Gelir Dağılımı (TRY)</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {incomes.map((inc, idx) => (
                <li key={idx} className="flex justify-between">
                  <span>{inc.source}</span>
                  <span className="font-semibold">{Number(inc.amountTry).toLocaleString("tr-TR")} TRY</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
            <h2 className="text-lg font-semibold text-slate-900">Gider ve Faaliyet Dağılımı (TRY)</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {expenses.map((exp, idx) => (
                <li key={idx} className="flex justify-between">
                  <span>{exp.category}</span>
                  <span className="font-semibold">{Number(exp.amountTry).toLocaleString("tr-TR")} TRY</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {report.audit_pdf_url && (
          <div className="mt-8">
            <a
              href={report.audit_pdf_url}
              className="inline-flex items-center rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900"
            >
              PDF Raporunu İndir
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
