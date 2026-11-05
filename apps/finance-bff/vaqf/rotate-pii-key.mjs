#!/usr/bin/env node
import { rotateVaqfPiiKey } from "./opsService.mjs";

async function main() {
  const currentKey = process.env.VAQF_PII_KEY;
  const nextKey = process.argv[2] || process.env.VAQF_PII_KEY_NEXT;
  try {
    const result = await rotateVaqfPiiKey({
      currentKey,
      nextKey,
      actor: { actorId: "cli_tech_admin", actorName: "CLI Tech Admin" },
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("XATO:", err.message);
    process.exit(1);
  }
}

main();
