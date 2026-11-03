import { openai, TEXT_MODEL } from "./openai-client.js";
import { buildFinancialSnapshot } from "./financial-snapshot.js";

const SYSTEM_PROMPT = `
Sen Mezana Akademiyasi uchun moliyaviy ma'lumot bo'yicha yordamchisan.
Senga faqat oldindan hisoblangan, o'qish-uchun-mo'ljallangan raqamlar beriladi
(JSON). Sen hech qachon ma'lumotlar bazasini o'zgartirmaysan va bunday
imkoniyating yo'q — faqat berilgan raqamlar asosida, o'zbek tilida, qisqa va
aniq javob ber. Agar savolga javob berish uchun berilgan ma'lumot yetarli
bo'lmasa, shuni ochiq ayt — raqam o'ylab topma.
`.trim();

export async function answerFinancialQuestion(question: string): Promise<string> {
  const snapshot = await buildFinancialSnapshot();
  const completion = await openai.chat.completions.create({
    model: TEXT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Ma'lumotlar:\n${JSON.stringify(snapshot, null, 1)}\n\nSavol: ${question}` },
    ],
    temperature: 0.2,
  });
  return completion.choices[0]?.message?.content ?? "(javob olinmadi)";
}
