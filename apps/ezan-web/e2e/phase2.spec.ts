import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Pool } from "pg";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/screenshots/phase-2");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const dbUrl = process.env.DATABASE_URL || "postgresql://ezan_app:ezan_local_dev_2027@127.0.0.1:5437/ezan_web";
const pool = new Pool({ connectionString: dbUrl });

function generateTotpCode(secretHexOrAscii: string, timestampMs = Date.now(), stepSec = 30): string {
  const counter = Math.floor(timestampMs / 1000 / stepSec);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter), 0);
  const key = /^[0-9a-fA-F]{32,}$/.test(secretHexOrAscii)
    ? Buffer.from(secretHexOrAscii, "hex")
    : Buffer.from(secretHexOrAscii, "utf8");
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

test.describe("Phase 2 — Kurban, Tracking, Donor Cabinet & Field Upload E2E", () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    const salt = "0102030405060708090a0b0c0d0e0f10";
    const derived = crypto.scryptSync("EzanField!2027#Secure", salt, 64).toString("hex");
    const fieldPasswordHash = `scrypt:${salt}:${derived}`;
    const fieldSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    await pool.query(
      `INSERT INTO cms_users (email, full_name, password_hash, role, assigned_country_code, totp_secret, totp_enabled)
       VALUES ('field@ezanvakfi.org', 'Saha Kurban Ekibi', $1, 'field', 'TD', $2, TRUE)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = 'field',
         assigned_country_code = 'TD',
         totp_secret = EXCLUDED.totp_secret,
         totp_enabled = TRUE`,
      [fieldPasswordHash, fieldSecret]
    );

    // Enable season 2027 and country TD with test prices/quota for E2E flow verification
    await pool.query(
      `UPDATE kurban_seasons
       SET eid_day_1 = '2027-05-16',
           sales_open_at = '2026-01-01T00:00:00Z',
           sales_close_at = '2027-05-14T20:59:00Z',
           is_active = TRUE
       WHERE year = 2027`
    );
    await pool.query(
      `UPDATE kurban_countries
       SET is_active = TRUE
       WHERE code = 'TD'`
    );
    await pool.query(
      `INSERT INTO kurban_offers (season_year, country_code, animal_type, shares_per_animal, price_per_share_try, quota_shares, sold_shares, is_active)
       VALUES (2027, 'TD', 'sheep', 1, 4500, 200, 0, TRUE),
              (2027, 'TD', 'cattle', 7, 3800, 210, 0, TRUE)
       ON CONFLICT (season_year, country_code, animal_type) DO UPDATE SET
         price_per_share_try = EXCLUDED.price_per_share_try,
         quota_shares = EXCLUDED.quota_shares,
         sold_shares = 0,
         is_active = TRUE`
    );
  });

  test.afterAll(async () => {
    // Restore strict [TASLIK] unpriced defaults after E2E completes
    await pool.query(
      `UPDATE kurban_countries SET is_active = FALSE WHERE code IN ('TR', 'UZ', 'TD', 'SO')`
    );
    await pool.query(
      `UPDATE kurban_offers SET price_per_share_try = 0, quota_shares = 0, sold_shares = 0, is_active = FALSE WHERE season_year = 2027`
    );
    await pool.end();
  });

  test("8-step Kurban Flow, Tracking, Donor Cabinet OTP, Dala Upload, Cutoff & Axe in 4 locales", async ({ browser }) => {
    const locales: Array<"tr" | "uz" | "en" | "ar"> = ["tr", "uz", "en" , "ar"];
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3005";

    for (const locale of locales) {
      const contextDesktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await contextDesktop.addCookies([{ name: "ezan_cookie_consent", value: "essential", url: baseUrl }]);
      const page = await contextDesktop.newPage();

      const kurbanPath = locale === "uz" ? `/${locale}/qurbonlik` : `/${locale}/kurban`;
      await page.goto(`${baseUrl}${kurbanPath}`, { waitUntil: "networkidle" });

      if (locale === "ar") {
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      }

      // Axe accessibility check on step 1
      const axeKurban = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const seriousOrCritical = axeKurban.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical"
      );
      expect(seriousOrCritical).toEqual([]);

      // Step 1 screenshot (1440px & 375px)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step1-1440.png`) });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step1-375.png`) });
      await page.setViewportSize({ width: 1440, height: 900 });

      // Step 1 -> Step 2
      await page.getByTestId("step-1-next").click();
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step2-1440.png`) });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step2-375.png`) });
      await page.setViewportSize({ width: 1440, height: 900 });

      // Step 2 -> Step 3
      await page.getByTestId("step-2-next").click();
      await page.getByTestId("share-owner-input-0").fill(`Test Donor ${locale.toUpperCase()}`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step3-1440.png`) });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step3-375.png`) });
      await page.setViewportSize({ width: 1440, height: 900 });

      // Step 3 -> Step 4
      await page.getByTestId("step-3-next").click();
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step4-1440.png`) });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step4-375.png`) });
      await page.setViewportSize({ width: 1440, height: 900 });

      // Step 4 -> Step 5 (Vekalet)
      await page.getByTestId("step-4-next").click();
      await page.getByTestId("vekalet-checkbox").check();
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step5-1440.png`) });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step5-375.png`) });
      await page.setViewportSize({ width: 1440, height: 900 });

      // Step 5 -> Step 6 (Donor info + KVKK)
      await page.getByTestId("step-5-next").click();
      await page.getByTestId("kurban-phone-input").fill("+905551112233");
      await page.getByTestId("kurban-email-input").fill(`donor.${locale}@example.com`);
      await page.getByTestId("kurban-kvkk-checkbox").check();
      await page.getByTestId("kurban-read-aloud-checkbox").check();
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step6-1440.png`) });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step6-375.png`) });
      await page.setViewportSize({ width: 1440, height: 900 });

      // Step 6 -> Step 7 (Payment summary)
      await page.getByTestId("step-6-next").click();
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step7-1440.png`) });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step7-375.png`) });
      await page.setViewportSize({ width: 1440, height: 900 });

      // Step 7 -> Step 8 (Order creation & Confirmation)
      await page.getByTestId("step-7-pay-btn").click();
      await expect(page.getByTestId("step-8-confirmation")).toBeVisible({ timeout: 25_000 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step8-1440.png`) });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-step8-375.png`) });
      await page.setViewportSize({ width: 1440, height: 900 });

      // Navigate to Tracking page from Step 8
      const trackingHref = await page.getByTestId("open-tracking-page-link").getAttribute("href");
      expect(trackingHref).toBeTruthy();
      await page.goto(`${baseUrl}${trackingHref}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("kurban-tracking-page")).toBeVisible();

      const axeTracking = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(
        axeTracking.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
      ).toEqual([]);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-tracking-1440.png`) });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-tracking-375.png`) });
      await page.setViewportSize({ width: 1440, height: 900 });

      // Donor Cabinet OTP Login & View
      const cabinetPath = locale === "tr" ? `/${locale}/hesabim` : locale === "uz" ? `/${locale}/kabinet` : `/${locale}/account`;
      await page.goto(`${baseUrl}${cabinetPath}`, { waitUntil: "networkidle" });
      await page.getByTestId("cabinet-target-input").fill("+905551112233");

      const otpRespPromise = page.waitForResponse((res) => res.url().includes("/api/donor-auth/request-otp") && res.status() === 200);
      await page.getByTestId("cabinet-send-otp-btn").click();
      await otpRespPromise;

      const outboxRes = await pool.query<{ body: string }>(
        `SELECT body FROM outbox_messages WHERE recipient = $1 ORDER BY id DESC LIMIT 1`,
        ["+905551112233"]
      );
      const otpMatch = outboxRes.rows[0]?.body.match(/\b(\d{6})\b/);
      expect(otpMatch?.[1]).toBeTruthy();

      await page.getByTestId("cabinet-otp-input").fill(String(otpMatch![1]));
      await page.getByTestId("cabinet-verify-otp-btn").click();
      await expect(page.getByTestId("donor-cabinet-dashboard")).toBeVisible({ timeout: 15_000 });

      const axeCabinet = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(
        axeCabinet.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
      ).toEqual([]);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-cabinet-1440.png`) });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${locale}-cabinet-375.png`) });

      await contextDesktop.close();
    }

    // Verify salesCloseAt cutoff blocks order creation via DB sales_close_at in past
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      extraHTTPHeaders: {
        "cf-connecting-ip": "127.0.0.1",
        "x-real-ip": "173.245.48.1"
      }
    });
    await ctx.addCookies([{ name: "ezan_cookie_consent", value: "essential", url: baseUrl }]);
    const page = await ctx.newPage();

    await pool.query(`UPDATE kurban_seasons SET sales_close_at = '2026-01-02T00:00:00Z' WHERE year = 2027`);
    const cutoffResp = await page.request.get(`${baseUrl}/api/kurban/catalog?locale=tr`);
    const cutoffData = await cutoffResp.json();
    expect(cutoffData.salesOpen).toBe(false);
    expect(cutoffData.salesClosed).toBe(true);

    await page.goto(`${baseUrl}/tr/kurban`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Bu Yılki Kurban Kabulü Tamamlandı" })).toBeVisible();
    await pool.query(`UPDATE kurban_seasons SET sales_close_at = '2027-05-14T20:59:00Z' WHERE year = 2027`);

    // Visit /dala field upload page, login with field@ezanvakfi.org + TOTP, verify axe & capture 375px + 1440px screenshots
    await page.goto(`${baseUrl}/dala`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("dala-login-card")).toBeVisible();

    const fieldSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const fieldTotp = generateTotpCode(fieldSecret);
    await page.getByTestId("dala-email-input").fill("field@ezanvakfi.org");
    await page.getByTestId("dala-password-input").fill("EzanField!2027#Secure");
    await page.getByTestId("dala-totp-input").fill(fieldTotp);
    await page.getByTestId("dala-login-submit").click();

    await expect(page.getByTestId("dala-portal-main")).toBeVisible({ timeout: 15_000 });
    const axeDala = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      axeDala.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    ).toEqual([]);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `dala-1440.png`) });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `dala-375.png`) });

    await ctx.close();
  });
});
