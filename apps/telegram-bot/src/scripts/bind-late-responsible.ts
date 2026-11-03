// Kech kelganlar mas'ulini belgilaydi: oxirgi 30 daqiqada botga /start bergan shaxs.
// Ishlatish:  tsx src/scripts/bind-late-responsible.ts            (aniq bitta nomzod bo'lsa)
//             tsx src/scripts/bind-late-responsible.ts <telegramId>   (bir nechta bo'lsa — tanlash)
import "dotenv/config";
import { prisma } from "../db/client.js";
import { LATE } from "../late/config.js";

const pick = process.argv[2];
const since = new Date(Date.now() - LATE.responsibleWindowMin * 60 * 1000);
const recent = await prisma.telegramContact.findMany({ where: { lastStartAt: { gte: since } }, orderBy: { lastStartAt: "desc" } });

let chosen = pick ? recent.find((c) => c.telegramId === pick) ?? (await prisma.telegramContact.findUnique({ where: { telegramId: pick } })) : null;
if (!chosen) {
  if (recent.length === 0) {
    console.log(`Oxirgi ${LATE.responsibleWindowMin} daqiqada /start bergan shaxs topilmadi. Mas'ul botga /start yozsin va qayta urinib ko'ring.`);
    process.exit(1);
  }
  if (recent.length > 1) {
    console.log("Bir nechta nomzod bor, telegramId bilan tanlang:");
    for (const c of recent) console.log(` ${c.telegramId}  ${c.fullName ?? "(ism yozmagan)"} @${c.username ?? "-"}  (${c.lastStartAt.toISOString()})`);
    process.exit(1);
  }
  chosen = recent[0]!;
}
await prisma.$transaction([
  prisma.telegramContact.updateMany({ where: { isLateResponsible: true }, data: { isLateResponsible: false } }),
  prisma.telegramContact.update({ where: { telegramId: chosen.telegramId }, data: { isLateResponsible: true } }),
]);
console.log(`Mas'ul belgilandi: ${chosen.fullName ?? chosen.firstName ?? ""} @${chosen.username ?? "-"} (${chosen.telegramId})`);
await prisma.$disconnect();
