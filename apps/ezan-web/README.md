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