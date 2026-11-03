// Markaziy platforma sozlamalari (bitta joyda, boshqa .env fayllarga ko'chirilmaydi).
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env.platform.local") });

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const DATABASE_URL = process.env.DATABASE_URL;

if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY .env.platform.local'da topilmadi");
if (!DATABASE_URL) throw new Error("DATABASE_URL .env.platform.local'da topilmadi");

// Prisma Client DATABASE_URL'ni process.env'dan o'qiydi — shu yerda kafolatlanadi.
process.env.DATABASE_URL = DATABASE_URL;
