import { parseReceiptImage } from "../receipt-ocr.js";

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Foydalanish: pnpm parse-receipt <rasm-fayl-yo'li>");
    process.exit(1);
  }
  const result = await parseReceiptImage(imagePath);
  console.log(JSON.stringify(result, null, 2));
}
main().catch((e) => {
  console.error("XATO:", e.message);
  process.exit(1);
});
