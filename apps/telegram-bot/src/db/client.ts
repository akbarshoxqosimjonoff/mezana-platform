import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const moliyPrisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.MOLIY_DATABASE_URL ||
        "postgresql://moliy_user:Moliy2026Secure2026@127.0.0.1:5432/moliy_db",
    },
  },
});

export const crmPrisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.CRM_DATABASE_URL ||
        "postgresql://akbar:WanE6Y3jcf6fXAMPWQ626n8ckDh6fRyA@127.0.0.1:5432/mezana",
    },
  },
});
