import "dotenv/config";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  throw new Error("XATO: DATABASE_URL muhit o'zgaruvchisi topilmadi! (.env faylni tekshiring)");
}
if (!process.env.MOLIY_DATABASE_URL) {
  throw new Error("XATO: MOLIY_DATABASE_URL muhit o'zgaruvchisi topilmadi! (.env faylni tekshiring)");
}
if (!process.env.CRM_DATABASE_URL) {
  throw new Error("XATO: CRM_DATABASE_URL muhit o'zgaruvchisi topilmadi! (.env faylni tekshiring)");
}

export const prisma = new PrismaClient();

export const moliyPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.MOLIY_DATABASE_URL,
    },
  },
});

export const crmPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.CRM_DATABASE_URL,
    },
  },
});
