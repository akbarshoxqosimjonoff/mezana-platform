import { chromium } from "@playwright/test";

async function preparePageForFullScreenshot(page: any) {
  // Scroll down step-by-step so all loading="lazy" images load completely
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 60);
    });
  });
  await page.waitForTimeout(400);
}

async function capture() {
  const baseUrl = process.env.PRELAUNCH_BASE_URL || "http://127.0.0.1:3005";
  const browser = await chromium.launch();

  const targets = [
    { url: `${baseUrl}/tr`, width: 1440, height: 900, out: "docs/screenshots/phase-5/tr-home-1440.png" },
    { url: `${baseUrl}/uz`, width: 375, height: 812, out: "docs/screenshots/phase-5/uz-home-375.png" },
    { url: `${baseUrl}/ar/projects`, width: 1440, height: 900, out: "docs/screenshots/phase-5/ar-projects-1440.png" },
    {
      url: `${baseUrl}/tr/faaliyetler/mezana-akademisi`,
      width: 1440,
      height: 900,
      out: "docs/screenshots/phase-5/tr-project-mezana-akademisi-1440.png"
    }
  ];

  for (const t of targets) {
    const ctx = await browser.newContext({ viewport: { width: t.width, height: t.height } });
    await ctx.addCookies([
      {
        name: "ezan_cookie_consent",
        value: "essential",
        url: baseUrl
      }
    ]);
    const page = await ctx.newPage();
    await page.goto(t.url, { waitUntil: "networkidle" });
    await preparePageForFullScreenshot(page);
    await page.screenshot({ path: t.out, fullPage: true });
    await ctx.close();
  }

  await browser.close();
  console.log("Successfully captured all 4 screenshots in docs/screenshots/phase-5/!");
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
