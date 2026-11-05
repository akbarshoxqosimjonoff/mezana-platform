# Ezan Vakfı Sayti (`apps/ezan-web`) — 1-bosqich

Ezan Vakfı (`ezanvakfi.org`) va Azon Vaqfi (`azonvaqfi.org`) uchun ikki domenli, 4 tilli (`tr`, `uz`, `en`, `ar` RTL) ommaviy veb-sayt, CMS, onlayn xayriya va savatcha, zakot kalkulyatori hamda ichki vaqf tizimi (`apps/finance-bff/vaqf`) bilan xavfsiz sinxronlash ilovasi.

## Stack
- **Next.js 15** (App Router), **React 19**, **TypeScript (`strict: true`)**
- **Payload CMS 3 arxitekturasi** (`/admin` paneli, 4 til, `needsReview`, draft/publish, 2FA, RBAC: `admin`, `editor`, `translator`, `finance`)
- **PostgreSQL 16** (`ezan_web` alohida baza — ichki `vaqf` bazasiga umuman ulanmaydi)
- **Tailwind CSS** (`#01242B` asosiy va `#FBCC42` aksent rang tokenlari, logical RTL/LTR)
- **Vitest** (unit va integratsiya testlar) va **Playwright + axe-core** (e2e va accessibility testlar)

## Lokal ishga tushirish

1. `.env.example` faylidan `.env` nusxa oling:
   ```bash
   cp .env.example .env
   ```
2. PostgreSQL (`ezan_web`) konteynerini ko'taring:
   ```bash
   docker compose up -d
   ```
3. Paketlarni o'rnating va ishga tushiring:
   ```bash
   npm install --legacy-peer-deps
   npm run dev
   ```
   Ilova `http://127.0.0.1:3005` portida ochiladi.

## Ikki domen va til tanlashni lokal sinash
- `NODE_ENV=development` rejimida `.env` ichida `DEV_FAKE_HOST=azonvaqfi.org` yoki `DEV_FAKE_COUNTRY=UZ` berib tekshirish mumkin.
- Savatcha, cookie rozilik (`ezan_cookie_consent`) va til cookie'si (`ezan_lang`) har bir domenda alohida saqlanadi (bu brauzer xavfsizlik standarti bo'yicha normal holat).

## Testlar
- Unit testlar: `npm test`
- E2E va Accessibility testlar: `npm run test:e2e`
## Muhim Texnik Eslatmalar
1. **Rate Limit (Bitta instansiya):** `src/lib/security.ts` dagi `checkRateLimit` xotiradagi `Map` tuzilmasidan foydalanadi va mijoz IP manzilini `cf-connecting-ip` sarlavhasidan oladi. Bitta VPS / konteyner instansiyasi uchun bu yetarli. Agar kelajakda bir nechta instansiya (horizontal scaling) ishlatilsa, Redis-ga asoslangan rate-limitga o'tiladi.
2. **Seed faqat CLI orqali:** Boshlang'ich `[TASLIK]` ma'lumotlarni bazaga yozish faqat `npm run db:seed` orqali bajariladi; runtime'da (`/admin` yoki API so'rovlarida) `seedDatabase()` chaqirilmaydi.
3. **Ichki Vaqf migratsiyalari:** `apps/finance-bff/vaqf/migrations/` ichida `007_vaqf_bot_backup_monitoring.sql` va `007_vaqf_online_donations.sql` mavjud (`schema_migrations` da to'liq fayl nomi bilan saqlangan). Keyingi migratsiyalar mavjud eng katta raqamdan `+1` (`009_...`) bilan nomlanadi.

## Pull Request (PR) Ishlash Qoidasi

- \main\ branchga to'g'ridan-to'g'ri \git push\ qilinmaydi.
- Har bir bosqich yoki o'zgarish alohida branchda (\site/phase-*\, \eat/*\, \ix/*\) bajariladi va GitHub Actions CI (zan-web-ci.yml\: Gitleaks, npm audit, typecheck, unit testlar va production build) yashil bo'lgach Pull Request (PR) orqali \main\ ga qo'shiladi.
