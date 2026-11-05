#!/usr/bin/env node
import { verifyVaqfPiiKey } from "./opsService.mjs";

async function main() {
  const candidateKey = process.argv[2] || process.env.VAQF_PII_KEY;
  try {
    const result = await verifyVaqfPiiKey(candidateKey);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error("XATO:", err.message);
    process.exit(1);
  }
}

main();
