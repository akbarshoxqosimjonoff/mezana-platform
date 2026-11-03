import { prisma } from "./db.js";

// Faqat o'qiydigan, oldindan belgilangan agregatlar to'plami. AI'ga xom SQL yoki
// bevosita baza kirishi BERILMAYDI — shu bilan SQL-injection/noma'lum so'rov xavfi yo'q.
// Shunga o'xshash yondashuv rejadagi "AI faqat o'qiydi, yozmaydi" qoidasini ta'minlaydi.
export async function buildFinancialSnapshot() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [studentsTotal, studentsByStatus, invoiceAgg, openInvoices, expensesThisMonth, incomeThisMonth] =
    await Promise.all([
      prisma.student.count(),
      prisma.student.groupBy({ by: ["status"], _count: true }),
      prisma.invoice.aggregate({ _sum: { totalAmount: true }, _count: true }),
      prisma.invoice.findMany({
        where: { status: { in: ["OPEN", "PARTIALLY_PAID"] } },
        select: { totalAmount: true, currency: true },
      }),
      prisma.expense.aggregate({ where: { date: { gte: monthStart } }, _sum: { amountInDefault: true } }),
      prisma.income.aggregate({ where: { date: { gte: monthStart } }, _sum: { amountInDefault: true } }),
    ]);

  const openTotal = openInvoices.reduce((sum, i) => sum + Number(i.totalAmount), 0);

  return {
    sana: now.toISOString().slice(0, 10),
    talabalar: {
      jami: studentsTotal,
      holatBoyicha: Object.fromEntries(studentsByStatus.map((s) => [s.status, s._count])),
    },
    hisobFakturalar: {
      jami: invoiceAgg._count,
      jamiSumma: Number(invoiceAgg._sum.totalAmount ?? 0),
      ochiqSoni: openInvoices.length,
      ochiqSumma: openTotal,
    },
    shuOy: {
      xarajat: Number(expensesThisMonth._sum.amountInDefault ?? 0),
      daromad: Number(incomeThisMonth._sum.amountInDefault ?? 0),
    },
  };
}
