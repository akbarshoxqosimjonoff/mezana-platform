import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/screenshots/phase-5");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

test.describe("Phase 5 — Real Catalog Content & Visual Verification in 4 Locales", () => {
  test.setTimeout(240_000);

  test("Captures 375px & 1440px screenshots across 4 locales and verifies Axe WCAG 2.1 AA", async ({ browser }) => {
    const locales: Array<"tr" | "uz" | "en" | "ar"> = ["tr", "uz", "en", "ar"];
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3005";

    for (const locale of locales) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addCookies([{ name: "ezan_cookie_consent", value: "essential", url: baseUrl }]);
      const page = await ctx.newPage();

      const pagesToCapture = [
        { name: "home", path: `/${locale}` },
        {
          name: "about",
          path: locale === "tr" ? `/${locale}/hakkimizda` : locale === "uz" ? `/${locale}/biz-haqimizda` : `/${locale}/about`
        },
        {
          name: "projects",
          path: locale === "tr" ? `/${locale}/faaliyetler` : locale === "uz" ? `/${locale}/faoliyatlar` : `/${locale}/projects`
        },
        {
          name: "donate",
          path: locale === "tr" ? `/${locale}/bagis` : locale === "uz" ? `/${locale}/xayriya` : `/${locale}/donate`
        }
      ];

      for (const item of pagesToCapture) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`${baseUrl}${item.path}`, { waitUntil: "networkidle" });

        if (locale === "ar") {
          await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        }

        const axeRes = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
        const seriousOrCritical = axeRes.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical"
        );
        expect(seriousOrCritical).toEqual([]);

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-${item.name}-1440.png`) });
        await page.setViewportSize({ width: 375, height: 812 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-${item.name}-375.png`) });
      }

      await ctx.close();
    }
  });
});
