import { answerFinancialQuestion } from "../financial-qna.js";
import { prisma } from "../db.js";

async function main() {
  const question = process.argv.slice(2).join(" ");
  if (!question) {
    console.error('Foydalanish: pnpm ask "savol matni"');
    process.exit(1);
  }
  const answer = await answerFinancialQuestion(question);
  console.log(answer);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("XATO:", e.message);
  process.exit(1);
});
