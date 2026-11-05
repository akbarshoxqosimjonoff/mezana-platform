import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:3005",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/snap/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }
  },
  reporter: "list"
});