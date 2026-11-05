import { validateStartupEnvironment } from "./lib/config";

export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  validateStartupEnvironment();
}
