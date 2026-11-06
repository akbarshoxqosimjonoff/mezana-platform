# Ezan Vakfı Sayti — Production Deploy Qo'llanmasi (`DEPLOY.md`)

## 1. Infratuzilma va Arxitektura
- **OS**: Ubuntu 24.04 LTS (`Europe/Istanbul`, NTP sinxronlangan).
- **Xavfsizlik**: SSH faqat kalit bilan (`PasswordAuthentication no`, `PermitRootLogin no`), `ufw` va `fail2ban` yoqilgan.
- **Tarmoq**: 443/tcp porti faqat Cloudflare IPv4/IPv6 diapazonlaridan (`deploy/vps-harden.sh`) qabul qilinadi.
- **Konteynerlar (`deploy/docker-compose.prod.yml`)**:
  - `web`: Next.js production serveri (`127.0.0.1:3005:3005`).
  - `worker`: Outbox (SMS/WhatsApp/Email), video transkodlash va 5 daqiqalik heartbeat (`recordWorkerHeartbeat`).
  - `postgres`: PostgreSQL 16 (`internal` Docker tarmog'ida, tashqi port ochilmagan).
  - `backup`: Har kecha soat `03:00` da (`Europe/Istanbul`) `pg_dump` + `AES-256-CBC` shifrlash + S3/R2 off-site yuklash.

## 2. Qadam-baqadam Deploy (`deploy/deploy.sh`)
```bash
cd /srv/data/apps/mezana-platform
bash apps/ezan-web/deploy/deploy.sh
```
Skript quyidagi amallarni avtomatik bajaradi:
1. `git pull --rebase origin main`
2. `npm ci && npm run build` (build vaqtida DB migratsiyalari `ensureSchema()` orqali idempotent tekshiriladi)
3. Servisni nol-uzilish (zero-downtime) bilan qayta ishga tushirish (`pm2 reload ezan-web` yoki `docker compose up -d --build`)
4. `/api/health` endpointini 15 marta (`status: "ok"`, DB kechikishi va disk < 80%) tekshirish
5. Agar `/api/health` xato bersa, avtomatik oldingi git commitga (`PREV_COMMIT`) rollback qilish va Telegram alert yuborish.

## 3. Rollback (Orqaga qaytarish)
Agar deploydan keyin muammo aniqlansa:
```bash
git checkout <oldingi_commit_sha>
cd apps/ezan-web && npm run build
pm2 reload ezan-web
curl -fsS http://127.0.0.1:3005/api/health
```
