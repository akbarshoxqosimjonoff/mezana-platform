// Foydalanuvchi (masalan ota-ona yoki xodim) uchun bir martalik Telegram bog'lash
// kodini yaratadi. Admin panelida tugma bo'lgach, bu skript o'rniga API chaqiriladi —
// hozircha qo'lda ishga tushirish uchun CLI.
//
// Ishlatish: pnpm --filter @repo/telegram-bot link-code --email=parent@example.com
//        yoki ...            --username=aliya12

import "dotenv/config";
import { randomInt } from "node:crypto";
import { prisma } from "../db/client.js";

const CODE_TTL_MINUTES = 15;

function arg(name: string): string | null {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.slice(name.length + 3) : null;
}

function genCode(): string {
  // 6 xonali, odam qo'lda kiritishi oson kod
  return String(randomInt(100000, 999999));
}

async function main() {
  const email = arg("email");
  const username = arg("username");
  if (!email && !username) {
    console.error("Foydalanish: --email=... yoki --username=...");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: email ? { email } : { username: username! },
  });
  if (!user) {
    console.error("Foydalanuvchi topilmadi");
    process.exit(1);
  }

  // Shu foydalanuvchining ishlatilmagan eski kodlarini bekor qilamiz (chalkashlik bo'lmasin)
  await prisma.telegramLinkCode.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { expiresAt: new Date() },
  });

  const code = genCode();
  await prisma.telegramLinkCode.create({
    data: {
      code,
      userId: user.id,
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
    },
  });

  console.log(`Kod: ${code}  (${CODE_TTL_MINUTES} daqiqa amal qiladi)`);
  console.log(`Foydalanuvchiga ayting: @mezanatizimbot'ga /start ${code} deb yozsin,`);
  console.log(`yoki havola: https://t.me/mezanatizimbot?start=${code}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
