# Ezan Vakfı — Texnik Mas'ul Uchun Yo'riqnoma (`tech-admin`)

## 1. Servislar va PM2 boshqaruvi
Vaqf tizimi quyidagi servislardan iborat:
- **`mezana-finance`** (`apps/finance-bff`) — Asosiy backend va `/vaqf-api/*` (Port `3000`, `127.0.0.1`).
- **`mezana-vaqf-bot`** (`apps/vaqf-bot`) — Alohida Vaqf Telegram boti (`@ezanvakfitizimbot`).
- **`mezana-telegram-bot`** (`apps/telegram-bot`) — Mezana Akademiyasi moliya/kechikish boti (`@mezanatizimbot`).

Holatni tekshirish:
```bash
pm2 status
pm2 logs mezana-vaqf-bot --lines 50
curl -s http://127.0.0.1:3000/vaqf-api/health | jq .
```

## 2. Maxfiy kalitlar (`VAQF_TELEGRAM_BOT_TOKEN` va `VAQF_PII_KEY`)
Maxfiy kalitlar **faqat** serverdagi `.env` fayllarida (`mode 0600`) saqlanadi:
- `/srv/data/apps/mezana-platform/apps/finance-bff/.env`
- `/srv/data/apps/mezana-platform/apps/vaqf-bot/.env`
- `/srv/data/apps/mezana-platform/.env.platform.local`

**Muhim qoidalar:**
1. `VAQF_PII_KEY` (donor TC Kimlik / Vergi No shifrlash kaliti) **hech qachon zaxira nusxa (backup) arxivining ichiga qo'shilmaydi**. Uni alohida parol menejerida (Bitwarden / 1Password) va seyfda qog'oz nusxada saqlang.
2. Kalit to'g'riligini tekshirish:
   ```bash
   cd /srv/data/apps/mezana-platform/apps/finance-bff
   node vaqf/verify-pii-key.mjs
   ```
3. Kalitni aylantirish (Key Rotation):
   `.env` ga `VAQF_PII_KEY_NEXT=<yangi_kalit>` qo'shib, quyidagi buyruqni ishga tushiring:
   ```bash
   node vaqf/rotate-pii-key.mjs
   ```
   Barcha shifrlangan ustunlar tranzaksiya ichida yangi kalitga o'tkaziladi. So'ng `VAQF_PII_KEY` ni yangi kalitga tenglashtiring.

## 3. Zaxira nusxa (Backup) va Tiklash (Restore)
- **Har kuni soat `03:30` da** `/srv/data/backup/vaqf/run_daily_backup.sh` ishga tushib, `/srv/data/backup/vaqf/` va (ulangan bo'lsa) 4 TB `/backup/vaqf/` diskiga `vaqf` sxemasi, to'liq baza va `/srv/data/vaqf` fayllarini yozadi (30 kun saqlanadi).
- **Har yakshanba soat `04:00` da** `/srv/data/backup/vaqf/weekly_restore_test.sh` oxirgi zaxirani vaqtinchalik `vaqf_restore_test` sxemasiga tiklab tekshiradi va natijani `vaqf.backup_logs` jadvaliga yozadi.
- Agar `/backup` diski ulanmagan bo'lsa yoki diskda bo'sh joy `< 15%` qolsa, ogohlantirish xabari outbox orqali **faqat texnik mas'ulga** (`tech_admin_user_ref`, soatiga ko'pi bilan 1 marta) yuboriladi.
