import { readFile } from "node:fs/promises";
import { openai, VISION_MODEL } from "./openai-client.js";
import { normalizeCurrency, type CurrencyNormalizeResult } from "./currency.js";

export type ParsedReceipt = {
  vendor: string | null;
  amount: number | null;
  currency: string | null; // modeldan kelgan xom qiymat
  currencyCheck: CurrencyNormalizeResult; // normallashtirilgan/tekshirilgan natija
  date: string | null; // YYYY-MM-DD, aniq bo'lmasa null
  categoryGuess: string | null;
  confidence: "low" | "medium" | "high";
  note: string | null; // modelning o'zi shubha bildirgan narsa (masalan xira rasm)
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    vendor: { type: ["string", "null"] },
    amount: { type: ["number", "null"] },
    currency: { type: ["string", "null"] },
    date: { type: ["string", "null"] },
    categoryGuess: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    note: { type: ["string", "null"] },
  },
  required: ["vendor", "amount", "currency", "date", "categoryGuess", "confidence", "note"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `
Sen kvitansiya/chek rasmidan ma'lumot o'qib olasan. HECH NARSANI tizimga
yozmaysan — faqat o'qiganingni qaytarasan, inson tasdiqlab kiritadi. Agar
rasm xira yoki noaniq bo'lsa, confidence="low" qo'y va note'da sababini yoz.
Summani faqat raqam sifatida, valyuta belgisisiz qaytar.
`.trim();

// NOTA: bu funksiya faqat o'qiydi/qaytaradi — Expense yozuvini o'zi hech qachon
// yaratmaydi. Chaqiruvchi kod (kelajakdagi admin-panel endpoint) natijani odamga
// ko'rsatib, tasdiqlangandan keyingina bazaga yozishi kerak.
export async function parseReceiptImage(imagePath: string): Promise<ParsedReceipt> {
  const buf = await readFile(imagePath);
  const ext = imagePath.split(".").pop()?.toLowerCase() ?? "jpeg";
  const mime = ext === "png" ? "image/png" : "image/jpeg";
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

  const completion = await openai.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Bu kvitansiyadan ma'lumot chiqarib ber." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "receipt", schema: RESPONSE_SCHEMA, strict: true },
    },
    temperature: 0,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Model javob bermadi");
  const raw = JSON.parse(content) as Omit<ParsedReceipt, "currencyCheck">;
  return { ...raw, currencyCheck: normalizeCurrency(raw.currency) };
}
