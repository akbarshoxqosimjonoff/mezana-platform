# DEPLOY.md — Ezan Vakfı Sayti (`apps/ezan-web`) Production Qo'llanmasi

Ushbu hujjat Turkiyadagi VPS serverni (KVKK talabi bo'yicha shaxsiy ma'lumotlar Turkiyada saqlanadi) noldan tayyorlash, `.env` sozlash, migratsiya, yangilash va orqaga qaytarish (rollback) tartibini belgilaydi.

## 1. Serverni noldan tayyorlash
1. Ubuntu 24.04 / 26.04 LTS serverga Docker, Docker Compose va Nginx o'rnating:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-v2 nginx
   ```
2. Cloudflare Origin SSL sertifikatlarini `/etc/ssl/cloudflare/origin.pem` va `/etc/ssl/cloudflare/origin.key` ga joylashtiring (`chmod 600`).
3. `deploy/nginx-ezan-web.conf` faylini `/etc/nginx/sites-available/ezan-web` ga nusxalab, symlink yarating va `sudo nginx -t && sudo systemctl reload nginx` bajaring.

## 2. Environment (`.env`) sozlash
`apps/ezan-web/.env.example` dan `apps/ezan-web/.env` yarating va quyidagi muhim o'zgaruvchilarni to'ldiring:
- `POSTGRES_PASSWORD`: kuchli parol
- `DATABASE_URL`: `postgresql://ezan_user:<PAROL>@postgres:5432/ezan_web`
- `DONATIONS_LIVE`: `false` (2860-qonun ruxsati olingach `true` qilinadi)
- `PAYMENT_PROVIDER`: `iyzico` (lokal/stagingda `mock`)
- `EZAN_SYNC_SECRET`: Mezana ichki serveridagi `EZAN_SYNC_SECRET` bilan bir xil 64 belgili tasodifiy kalit
- `SENTRY_DSN`: xatolarni kuzatish uchun Sentry DSN

## 3. Ishga tushirish va Migratsiya
```bash
cd deploy
docker compose -f docker-compose.prod.yml up -d --build
```
Ilova ishga tushganda avtomatik ravishda sxema (`ensureSchema`) va boshlang'ich CMS ma'lumotlari (`seedDatabase`) yaratiladi.
Salomatlik tekshiruvi:
```bash
curl -s http://127.0.0.1:3005/api/health
```

## 4. Yangilash (Update)
```bash
git pull --rebase origin main
cd deploy
docker compose -f docker-compose.prod.yml up -d --build web
```

## 5. Orqaga qaytarish (Rollback) va Zaxiradan tiklash
- **Kod rollback**:
  ```bash
  git checkout <oldingi-commit-hash>
  cd deploy && docker compose -f docker-compose.prod.yml up -d --build web
  ```
- **Baza zaxirasidan tiklash**:
  Kunlik zaxiralar `deploy/backups/local/` va `deploy/backups/remote/` da saqlanadi. Haftalik avtomatik tiklash sinovi `deploy/scripts/weekly-restore-test.sh` orqali tekshiriladi.