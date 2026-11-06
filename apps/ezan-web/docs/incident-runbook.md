# Favqulodda Holatlar Qo'llanmasi (`docs/incident-runbook.md`)

## 1. Sayt Ishlamasa (502 / 504 / Timeout)
1. Serverga SSH orqali kiring va `/api/health` holatini tekshiring:
   ```bash
   curl -i http://127.0.0.1:3005/api/health
   pm2 status
   docker ps
   ```
2. Agar oxirgi deploy sababli bo'lsa, darhol rollback qiling:
   ```bash
   cd /srv/data/apps/mezana-platform
   git checkout HEAD~1
   cd apps/ezan-web && npm run build && pm2 reload ezan-web
   ```

## 2. To'lov Webhook'lari Kelmasa yoki Xato Bersa
1. `webhook_events` va `donations` jadvalidagi `pending_payment` yozuvlarini tekshiring:
   ```bash
   docker exec ezan_web_postgres psql -U ezan -d ezan_web -c "SELECT status, COUNT(*) FROM donations GROUP BY status;"
   ```
2. iyzico Merchant Panel -> Webhook Logs bo'limidan HTTP status kodini tekshiring:
   - `401`: `IYZICO_WEBHOOK_SECRET` o'zgargan yoki mos emas.
   - `403`: Cloudflare WAF iyzico IP manzilini to'sgan -> Cloudflare WAF da `/api/donations/webhook` uchun iyzico IP diapazonini ruxsat ro'yxatiga (`Allow`) qo'shing.

## 3. Ichki Tizim (`vaqf`) bilan Sinxronlash To'xtab Qolsa (`outboxLagMinutes > 10`)
1. `mezana-finance` servisining holatini va loglarini tekshiring:
   ```bash
   pm2 logs mezana-finance --lines 50
   ```
2. Ikki tomonda (`apps/ezan-web/.env` va `apps/finance-bff/.env`) `EZAN_SYNC_SECRET` bir xil ekanini tekshiring.
3. Sinxronlash idempotent bo'lgani uchun servis tiklanishi bilan barcha yig'ilib qolgan `paid` (`is_test=false`) xayriyalar avtomatik tortib olinadi.

## 4. Disk To'lib Qolsa (`diskUsedPercent > 80%`)
1. Eski Docker image'lar va vaqtinchalik transkod fayllarini tozalang:
   ```bash
   docker system prune -f
   find /tmp -name "kurban_*" -mtime +1 -delete
   ```
2. Qurbonlik videolari lokal diskda emas, S3/R2 bucketda turganini tekshiring.
