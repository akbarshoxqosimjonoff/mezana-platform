import { describe, it } from "vitest";
import { ensureSchema } from "../src/db/schema";
import { seedDatabase } from "../src/db/seed";

describe("Database Seed Runner", () => {
  it("seeds initial [TASLIK] data", async () => {
    await ensureSchema();
    await seedDatabase();
  });
});
