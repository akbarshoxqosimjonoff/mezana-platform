import { scanExpenseAnomalies } from "../anomaly-scan.js";
import { prisma } from "../db.js";

async function main() {
  const flags = await scanExpenseAnomalies();
  if (flags.length === 0) {
    console.log("Anomaliya topilmadi.");
  } else {
    console.log(`${flags.length} ta shubhali xarajat topildi (inson ko'rib chiqishi kerak):\n`);
    for (const f of flags) {
      console.log(`- [${f.expenseId}] "${f.title}": ${f.amount} (o'rtacha: ${f.categoryAverage}, ${f.ratio}x) — ${f.reason}`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("XATO:", e.message);
  process.exit(1);
});
