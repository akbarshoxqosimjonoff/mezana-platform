# Ezan Vakfı Sayti (`apps/ezan-web`) — Alohida Bulut VPS Deploy Qo'llanmasi

## Arxitektura qoidasi
- **Ommaviy sayt (`apps/ezan-web`)** Turkiyada joylashgan **alohida bulut VPS** serverida (`ezanvakfi.org` va `azonvaqfi.org`) ishlaydi.
- **Ichki Mezana serveri** hech qachon internetga ochilmaydi (unga router port-forwarding, tashqi nginx yoki Cloudflare tunnel orqali yo'l ochilmaydi).
- Sinxronlash bir tomonlama: ichki Mezana serveridagi `mezana-finance` xizmati har 1 daqiqada bulut VPS'dagi saytdan (`EZAN_SITE_URL=https://ezanvakfi.org`) `GET /api/internal/donations` va `POST /api/internal/donations/ack` orqali HMAC-SHA256 imzosi bilan ma'lumot tortib oladi.

---

## 1. Bulut VPS tayyorlash (Ubuntu 24.04 LTS, Turkiya DC)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2 nginx ufw openssl git

# Firewall: faqat SSH va Cloudflare IP'laridan 80/443 ruxsat etiladi
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

## 2. Loyihani joylashtirish va `.env` sirlarni yaratish

```bash
sudo mkdir -p /srv/ezan-web /etc/ezan-web /var/backups/ezan_web
sudo chown -R $USER:$USER /srv/ezan-web
git clone --branch site/phase-1 https://github.com/akbarshoxqosimjonoff/mezana-platform.git /srv/ezan-web
cd /srv/ezan-web/apps/ezan-web
```

Sirlarni yaratish (hech qachon git'ga qo'shilmaydi, uzunligi kamida 64 belgi):
```bash
SYNC_SECRET=$(openssl rand -hex 32)
WEBHOOK_SECRET=$(openssl rand -hex 32)
ADMIN_SECRET=$(openssl rand -hex 32)
DB_PASS=$(openssl rand -hex 24)

# Zaxira shifrlash kaliti (chmod 600 majburiy)
openssl rand -hex 32 | sudo tee /etc/ezan-web/backup.key >/dev/null
sudo chmod 600 /etc/ezan-web/backup.key
```

`/srv/ezan-web/apps/ezan-web/.env` faylini to'ldiring:
```env
NODE_ENV=production
DATABASE_URL=postgresql://ezan_user:<DB_PASS>@postgres:5432/ezan_web
DONATIONS_LIVE=false
PAYMENT_PROVIDER=mock
RECURRING_ENABLED=false
SITE_HOSTS=ezanvakfi.org,www.ezanvakfi.org,azonvaqfi.org,www.azonvaqfi.org

EZAN_SYNC_SECRET=<SYNC_SECRET>
PAYMENT_WEBHOOK_SECRET=<WEBHOOK_SECRET>
SANDBOX_WEBHOOK_SECRET=<WEBHOOK_SECRET>
WEBHOOK_SECRET=<WEBHOOK_SECRET>
ADMIN_SESSION_SECRET=<ADMIN_SECRET>

# Cloudflare Turnstile (productionda majburiy)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<TURNSTILE_SITE_KEY>
TURNSTILE_SECRET_KEY=<TURNSTILE_SECRET_KEY>

# iyzico kalitlari (PAYMENT_PROVIDER=iyzico bo'lganda majburiy)
IYZICO_API_KEY=<IYZICO_API_KEY>
IYZICO_SECRET_KEY=<IYZICO_SECRET_KEY>
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com

# Admin tarmoq va Cloudflare Access himoyasi
ADMIN_ALLOWED_IPS=<VAKIF_OFIS_STATIC_IP>
ADMIN_REQUIRE_CF_ACCESS=true
CF_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com
CF_ACCESS_AUD=<CF_ACCESS_AUD_TAG>
```

## 3. Docker Compose va Boshlang'ich Seed

```bash
cd /srv/ezan-web/deploy
docker compose -f docker-compose.prod.yml up -d --build

# Faqat bir marta boshlang'ich [TASLIK] ma'lumotlarni kiritish:
docker exec -it ezan_web_app npm run db:seed
```

## 4. Nginx va Cloudflare Full (Strict) TLS

```bash
sudo cp /srv/ezan-web/deploy/nginx-ezan-web.conf /etc/nginx/sites-available/ezan-web.conf
sudo ln -s /etc/nginx/sites-available/ezan-web.conf /etc/nginx/sites-enabled/ezan-web.conf
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Ichki Mezana serverini ulash (`EZAN_SITE_URL`)

Ichki Mezana serveridagi `/srv/data/apps/mezana-platform/apps/finance-bff/.env` ga VPS'dagi bir xil `EZAN_SYNC_SECRET` va sayt manzilini yozing:
```env
EZAN_SITE_URL=https://ezanvakfi.org
EZAN_SYNC_SECRET=<VPS_BILAN_BIR_XIL_SYNC_SECRET>
```
So'ngra ichki BFF'ni qayta ishga tushiring:
```bash
pm2 restart mezana-finance --update-env
```
