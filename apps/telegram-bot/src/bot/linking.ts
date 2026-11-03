import { prisma } from "../db/client.js";

export type LinkResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "already-linked-elsewhere" };

// Bir martalik kodni iste'mol qilib, shu Telegram akkauntni User'ga bog'laydi.
// Kod faqat bitta marta ishlatilishi mumkin va muddati o'tgach amal qilmaydi.
export async function consumeLinkCode(
  code: string,
  telegramId: string,
  telegramUsername: string | null,
): Promise<LinkResult> {
  const row = await prisma.telegramLinkCode.findUnique({ where: { code } });
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt < new Date()) return { ok: false, reason: "expired" };

  const existingLinkForChat = await prisma.telegramLink.findUnique({ where: { telegramId } });
  if (existingLinkForChat && existingLinkForChat.userId !== row.userId) {
    // Shu Telegram akkaunt allaqachon boshqa foydalanuvchiga bog'langan — avval uzilishi kerak.
    return { ok: false, reason: "already-linked-elsewhere" };
  }

  await prisma.$transaction([
    prisma.telegramLinkCode.update({ where: { code }, data: { usedAt: new Date() } }),
    prisma.telegramLink.upsert({
      where: { userId: row.userId },
      create: { userId: row.userId, telegramId, telegramUsername: telegramUsername ?? undefined },
      update: { telegramId, telegramUsername: telegramUsername ?? undefined },
    }),
  ]);

  return { ok: true, userId: row.userId };
}

export async function findLinkedUser(telegramId: string) {
  const link = await prisma.telegramLink.findUnique({
    where: { telegramId },
    include: {
      user: { include: { roleAssignments: { include: { role: true } }, student: true, employee: true } },
    },
  });
  return link?.user ?? null;
}
