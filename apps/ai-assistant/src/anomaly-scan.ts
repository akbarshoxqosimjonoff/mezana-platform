import { prisma } from "./db.js";

export type AnomalyFlag = {
  expenseId: string;
  title: string;
  amount: number;
  categoryAverage: number;
  ratio: number;
  reason: string;
};

// Statistik (AI'siz, oddiy va tushunarli) anomaliya aniqlash: bir kategoriyadagi
// o'rtacha xarajatdan N barobar oshib ketgan yozuvlarni belgilaydi. Hech narsani
// o'zgartirmaydi/tasdiqlamaydi — faqat ro'yxat qaytaradi, inson ko'rib chiqishi uchun.
export async function scanExpenseAnomalies(thresholdRatio = 2.5): Promise<AnomalyFlag[]> {
  const byCategory = await prisma.expense.groupBy({
    by: ["categoryId"],
    _avg: { amountInDefault: true },
    _count: true,
  });
  const avgByCategory = new Map(byCategory.map((c) => [c.categoryId, Number(c._avg.amountInDefault ?? 0)]));

  // Kamida 4 ta yozuvi bor kategoriyalardagina "o'rtacha" ma'noli — aks holda
  // bitta xarajat o'zi "o'rtacha"ga teng bo'lib, hech qachon anomaliya topilmaydi.
  const eligibleCategoryIds = new Set(byCategory.filter((c) => c._count >= 4).map((c) => c.categoryId));

  const expenses = await prisma.expense.findMany({
    where: { categoryId: { in: [...eligibleCategoryIds] } },
    select: { id: true, title: true, amount: true, amountInDefault: true, categoryId: true },
  });

  const flags: AnomalyFlag[] = [];
  for (const e of expenses) {
    const avg = avgByCategory.get(e.categoryId) ?? 0;
    if (avg <= 0) continue;
    const ratio = Number(e.amountInDefault) / avg;
    if (ratio >= thresholdRatio) {
      flags.push({
        expenseId: e.id,
        title: e.title,
        amount: Number(e.amountInDefault),
        categoryAverage: Math.round(avg * 100) / 100,
        ratio: Math.round(ratio * 10) / 10,
        reason: `Kategoriya o'rtachasidan ${Math.round(ratio * 10) / 10} barobar ko'p`,
      });
    }
  }
  return flags.sort((a, b) => b.ratio - a.ratio);
}
