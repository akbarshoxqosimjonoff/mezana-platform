# Vaqf tizimi zaxira nusxasi (Backup & Restore) yo'riqnomasi

## 1. Zaxira qayerda va qachon olinadi?
- **Joylashuv:** `/srv/data/backup/vaqf/` (disk: `/dev/mapper/ubuntu--vg-ubuntu--lv`, 331 GB bo'sh joy)
- **Skript:** `/srv/data/backup/vaqf/backup_vaqf.sh`
- **Cron jadvali:** Har kuni soat `03:30` da (`30 3 * * * /srv/data/backup/vaqf/backup_vaqf.sh >> /srv/data/backup/vaqf/backup.log 2>&1`)
- **Tarkibi:**
  1. `vaqf-schema-YYYYMMDD-HHMMSS.dump` (`latest-vaqf-schema.dump`) — `mezana_platform` bazasining `vaqf` sxemasi (`pg_dump -Fc -n vaqf`)
  2. `mezana_platform-YYYYMMDD-HHMMSS.dump` (`latest-mezana_platform.dump`) — butun `mezana_platform` bazasi
  3. `vaqf-files-YYYYMMDD-HHMMSS.tgz` (`latest-vaqf-files.tgz`) — `/srv/data/vaqf/` ichidagi barcha rasm, hujjat, shartnoma va arxiv fayllari
- **Saqlash muddati:** So'nggi 30 kunlik nusxalar avtomatik saqlanadi.

## 2. Qo'lda zaxira olish
```bash
/srv/data/backup/vaqf/backup_vaqf.sh
```

## 3. Sinov sxemasiga tiklash (Test Restore)
Asosiy `vaqf` sxemasiga tegmasdan, zaxirani vaqtinchalik `vaqf_restore_test` sxemasiga tiklab tekshirish:
```bash
RAW_URL="$(grep -E '^PLATFORM_DB_URL=' /srv/data/apps/mezana-platform/apps/finance-bff/.env | head -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'")"

psql "$RAW_URL" -c "DROP SCHEMA IF EXISTS vaqf_restore_test CASCADE;"
pg_restore --no-owner --no-privileges -f - /srv/data/backup/vaqf/latest-vaqf-schema.dump \
  | sed -E 's/\bvaqf\b/vaqf_restore_test/g' \
  | psql -v ON_ERROR_STOP=1 "$RAW_URL" >/dev/null
psql "$RAW_URL" -c "SELECT count(*) AS restored_tables FROM information_schema.tables WHERE table_schema='vaqf_restore_test';"
psql "$RAW_URL" -c "DROP SCHEMA vaqf_restore_test CASCADE;"
```

## 4. Asosiy tizimga tiklash (Production Restore)
> **Diqqat:** Asosiy bazaga tiklashdan oldin joriy holatdan `/srv/data/backup/vaqf/backup_vaqf.sh` orqali yangi nusxa oling va `pm2 stop mezana-finance` bilan yozish amallarini to'xtating.

1. **Ma'lumotlar bazasini tiklash (`vaqf` sxemasi):**
   ```bash
   DB_URL="$(grep -E '^PLATFORM_DB_URL=' /srv/data/apps/mezana-platform/apps/finance-bff/.env | cut -d= -f2-)"
   pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DB_URL" /srv/data/backup/vaqf/latest-vaqf-schema.dump
   ```
2. **Fayllarni (`/srv/data/vaqf/`) tiklash:**
   ```bash
   tar -xzf /srv/data/backup/vaqf/latest-vaqf-files.tgz -C /srv/data
   ```
3. **Xizmatni qayta ishga tushirish:**
   ```bash
   pm2 start mezana-finance
   ```

## Migratsiya raqamlari haqida eslatma (`007` dublikati)
`apps/finance-bff/vaqf/migrations/` papkasida ikkita `007_*` fayli mavjud:
1. `007_vaqf_bot_backup_monitoring.sql` (6-bosqichda yaratilgan)
2. `007_vaqf_online_donations.sql` (`site/phase-1` onlayn xayriya sinxronlash bosqichida yaratilgan)

`vaqf.schema_migrations` jadvalida migratsiyalar faylning to'liq nomi (`version`) bo'yicha saqlanadi, shu bois ikkala migratsiya ham bazada muvaffaqiyatli ro'yxatdan o'tgan.
**Qoida:** Bundan keyingi har qanday yangi migratsiya raqami har doim mavjud eng katta raqamdan `+1` bo'lishi shart (navbatdagisi: `009_...`).
