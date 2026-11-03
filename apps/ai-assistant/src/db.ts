import "./env.js"; // DATABASE_URL'ni PrismaClient yaratilishidan oldin o'rnatadi
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
