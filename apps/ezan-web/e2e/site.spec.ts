import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SCREENSHOT_DIR = path.resolve(__dirname, "../docs/screenshots");

function readEnvValue(key: string): string {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return process.env[key] || "";
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) {
      return line.slice(key.length + 1).trim();
    }
  }
  return process.env[key] || "";
}

test.describe("Ezan Vakfı Sayti — E2E, Til almashtirish, RTL, Xayriya oqimi, Axe va Skrinshotlar", () => {
  test("1. Til almashtirgich ezan_lang cookie qo'yadi, sahifa tarjimasiga o'tadi va ar da dir='rtl' bo'ladi", async ({
    page
  }) => {
    await page.goto("/tr/hakkimizda", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    await page.getByTestId("lang-switch-uz").click();
    await page.waitForURL("**/uz/haqimizda");
    await expect(page.locator("html")).toHaveAttribute("lang", "uz");

    const cookies = await page.context().cookies();
    const langCookie = cookies.find((c) => c.name === "ezan_lang");
    expect(langCookie?.value).toBe("uz");

    await page.getByTestId("lang-switch-ar").click();
    await page.waitForURL("**/ar/about");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("2. To'liq xayriya oqimi: productionda mock-complete 404 qaytaradi, imzoli webhook esa xayriyani tasdiqlaydi", async ({
    page,
    request
  }) => {
    await page.goto("/tr/bagis", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("sandbox-mode-banner")).toBeVisible();
    await expect(page.getByTestId("donation-step-1")).toBeVisible();

    await page.getByTestId("proceed-step-2").click({ force: true });
    await expect(page.getByTestId("donation-step-2")).toBeVisible();

    const kvkkBox = page.getByTestId("kvkk-checkbox");
    await expect(kvkkBox).not.toBeChecked();

    const createRes = await request.post("/api/donations", {
      data: {
        locale: "tr",
        frequency: "one_time",
        turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
        items: [{ campaignSlug: "mezana-akademisi-egitim-bursu", amount: 500 }],
        donor: {
          fullName: "E2E Test Bağışçı",
          phone: "+905551234567",
          email: "e2e@ezanvakfi.org",
          wantReceipt: true,
          kvkkConsent: true
        }
      }
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.donation.is_test).toBe(true);

    // Production serverda mock-complete 404 qaytarishi shart
    const mockRes = await request.post("/api/donations/mock-complete", {
      data: {
        donationExternalId: created.donation.external_id,
        publicNo: created.donation.public_no
      }
    });
    expect(mockRes.status()).toBe(404);

    // Imzoli webhook orqali to'lovni tasdiqlash
    const webhookSecret = readEnvValue("PAYMENT_WEBHOOK_SECRET");
    const rawPayload = JSON.stringify({
      eventId: `e2e_evt_${created.donation.external_id}`,
      paymentId: `e2e_pay_${created.donation.public_no}`,
      donationExternalId: created.donation.external_id,
      status: "paid"
    });
    const sig = crypto.createHmac("sha256", webhookSecret).update(rawPayload).digest("hex");

    const webhookRes = await request.post("/api/donations/webhook", {
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": sig
      },
      data: rawPayload
    });
    expect(webhookRes.ok()).toBe(true);

    await page.goto(`/tr/tesekkurler?donation=${created.donation.public_no}`, {
      waitUntil: "domcontentloaded"
    });
    await expect(page.getByTestId("receipt-status")).toHaveText(/paid/i);
    await expect(page.getByTestId("receipt-public-no")).toHaveText(created.donation.public_no);
  });

  test("3. Axe accessibility tekshiruvi (jiddiy xato 0) va 4 tilda 375px / 1440px skrinshotlar", async ({
    page
  }) => {
    const pagesByLocale = [
      { locale: "tr", home: "/tr", campaigns: "/tr/kampanyalar", donate: "/tr/bagis" },
      { locale: "uz", home: "/uz", campaigns: "/uz/kampaniyalar", donate: "/uz/xayriya" },
      { locale: "en", home: "/en", campaigns: "/en/campaigns", donate: "/en/donate" },
      { locale: "ar", home: "/ar", campaigns: "/ar/campaigns", donate: "/ar/donate" }
    ];

    for (const item of pagesByLocale) {
      for (const [pageType, url] of [
        ["home", item.home],
        ["campaigns", item.campaigns],
        ["donate", item.donate]
      ] as const) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        if (item.locale === "ar") {
          await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        }
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${item.locale}-${pageType}-1440px.png`),
          fullPage: false
        });

        const axeResults = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const seriousOrCritical = axeResults.violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious"
        );
        expect(seriousOrCritical).toEqual([]);

        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${item.locale}-${pageType}-375px.png`),
          fullPage: false
        });
      }
    }
  });
});
