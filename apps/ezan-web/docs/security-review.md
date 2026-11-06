# Ezan Vakfı Sayti — Xavfsizlik Tekshiruvi Hisoboti (`docs/security-review.md`)

## 1. Tekshiruv Ro'yxati va Natijalar

| # | Tekshiruv bandi | Holati | Dalil / Izoh |
| --- | --- | --- | --- |
| 1 | `git log -p` da hech qanday sir yo'q | **O'TDI** | Gitleaks va CI qoidasi (`ci/ezan-web-ci.yml`) orqali tekshirildi; barcha standart fallback sirlar olib tashlangan. |
| 2 | `.env` fayllar `chmod 600`, gitda yo'q | **O'TDI** | `.gitignore` da `.env*` (`!.env.example`) himoyalangan. |
| 3 | Standart/bo'sh sir bilan ilova ishga tushmaydi | **O'TDI** | `src/payments/service.ts` va `src/sync.ts` da `>= 32` belgi bo'lmasa startup xato beradi (`tests/payments-sync.test.ts`). |
| 4 | `mock-complete` route productionda `404` qaytaradi | **O'TDI** | `NODE_ENV=production` da `POST /api/donations/mock-complete` qat'iy `404` qaytaradi. |
| 5 | `DONATIONS_LIVE=false` da yaratilgan yozuvlar `is_test=true` | **O'TDI** | `GET /api/internal/donations` faqat `is_test=false` yozuvlarni ichki vaqf tizimiga uzatadi. |
| 6 | Webhook'lar imzosiz va eski timestamp bilan rad etiladi | **O'TDI** | HMAC-SHA256 `timingSafeEqual` va replay-attack (5 daqiqa) himoyasi + `webhook_events` idempotentlik jadvali. |
| 7 | Barcha formalarda Zod tekshiruvi, SQL parametrli | **O'TDI** | Barcha DB so'rovlari `$1, $2` parametrli; `src/cms/service.ts` va route'larda Zod sxemalari. |
| 8 | `/admin` va `/dala` rollari bir-biriga o'ta olmaydi | **O'TDI** | RBAC (`super_admin`, `editor`, `translator`, `finance_viewer`, `field`) + TOTP 2FA majburiy. |
| 9 | Qurbonlik videolari va makbuzlar ochiq URL emas | **O'TDI** | 256-bit token + 90 kunlik muddat + `15 daqiqalik` imzolangan S3/R2 stream URL + `noindex, nofollow`. |
| 10 | Xavfsizlik headerlari (`CSP`, `HSTS`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`) | **O'TDI** | `src/middleware.ts` va `deploy/nginx-ezan.conf` da o'rnatilgan. |
| 11 | `npm audit --audit-level=high` — `0` ta high/critical | **O'TDI** | `0 vulnerabilities` topildi. |
| 12 | Sentry va loglarga PII (telefon, email, ism, vekalet, karta) tushmaydi | **O'TDI** | `sanitizeSentryEvent()` barcha shaxsiy maydonlarni `[REDACTED_PII]` ga almashtiradi (`tests/phase3-prod-readiness.test.ts`). |
| 13 | Shaxsiy bolalar suratlari (`consentVerified=false`) productionda yashirin | **O'TDI** | `cms_media.consent_verified = false` bo'lgan rasm productionda render qilinmaydi. |
