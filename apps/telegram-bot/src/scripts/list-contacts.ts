// Botga /start bergan va ism yozgan hamma kontaktlarni ko'rsatadi
import "dotenv/config";
import { prisma } from "../db/client.js";
const rows = await prisma.telegramContact.findMany({ orderBy: { lastStartAt: "desc" } });
for (const c of rows) console.log(`${c.telegramId}  ${c.fullName ?? "(ism kutilmoqda)"}  @${c.username ?? "-"}  mas'ul=${c.isLateResponsible}  ${c.lastStartAt.toISOString()}`);
if (rows.length === 0) console.log("Hali hech kim /start bermagan");
await prisma.$disconnect();
