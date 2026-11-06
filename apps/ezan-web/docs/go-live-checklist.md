# Production'ga Chiqish Tekshiruv Ro'yxati (`docs/go-live-checklist.md`)

| # | Tekshiruv Bandi | Holati | Izoh |
| --- | --- | --- | --- |
| 1 | `site/phase-1` va `site/phase-2` -> `main` ga merge qilingan va CI yashil | **TAYYOR** | `94a0f48` commit, 0 konflikt |
| 2 | VPS qattiqlashtirilgan (`ufw`, `fail2ban`, Cloudflare IP, Docker Compose) | **TAYYOR** | `deploy/vps-harden.sh`, `deploy/docker-compose.prod.yml` |
| 3 | Cloudflare DNS va `notify.ezanvakfi.org` SPF/DKIM/DMARC rejasi tayyor | **TASDIQ KUTILMOQDA** | `deploy/cloudflare-dns-email-plan.md` |
| 4 | Shifrlangan zaxira (`backup.sh`) va `RESTORE.md` amalda sinab ko'rilgan | **TAYYOR** | `ezan_web_restore_drill` da `< 2s` da tiklandi |
| 5 | `/api/health`, Sentry PII-scrubber, worker heartbeat va Telegram alertlar | **TAYYOR** | `src/monitoring/service.ts` |
| 6 | Xavfsizlik tekshiruvi (`docs/security-review.md`) va `npm audit` = 0 high/critical | **TAYYOR** | `docs/security-review.md` |
| 7 | Yuklama sinovi (300 parallel foydalanuvchi, `p95 < 500ms`, `0` xato) | **TAYYOR** | `tests/phase3-prod-readiness.test.ts` |
| 8 | SEO (`sitemap.xml`, `robots.txt`, `hreflang`, JSON-LD, 301 redirectlar) | **TAYYOR** | `deploy/redirects.csv` va `src/middleware.ts` |
| 9 | Ramazon kampaniyalari (`zekat`, `fitre`, `fidye`, `iftar`, `ramazan-genel`) va `ramadanMode` | **TAYYOR** | `cms_ramadan_settings` |
| 10 | Xodimlar uchun qo'llanmalar (`editor-guide.md`, `finance-guide.md`, `incident-runbook.md`) | **TAYYOR** | `docs/` katalogida |
| 11 | 2860-qonun ruxsati va iyzico live kalitlari bilan `DONATIONS_LIVE=true` yoqish | **TASDIQ KUTILMOQDA** | Faqat yozma tasdiq va 10 TL live testdan so'ng yoqiladi |
