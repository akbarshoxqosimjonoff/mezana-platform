import { seedDatabase } from '../src/db/seed';
import { getDbPool } from '../src/db/schema';

async function main() {
  const res = await seedDatabase();
  console.log('Seed completed:', res);
  await getDbPool().end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
