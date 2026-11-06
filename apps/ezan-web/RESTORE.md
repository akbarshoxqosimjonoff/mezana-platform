# Ezan Vakfı Sayti — Zaxiradan Tiklash Qo'llanmasi (`RESTORE.md`)

## 1. Zaxira (Backup) Tuzilmasi
- **Jadval**: Har kuni soat `03:00` (`Europe/Istanbul`) da `deploy/backup.sh` ishga tushadi.
- **Shifrlash**: `pg_dump --format=custom` natijasi `gzip` qilinib, `openssl enc -aes-256-cbc -pbkdf2 -iter 100000` bilan shifrlanadi (`.dump.gz.enc`).
- **Saqlash**:
  - Lokal: `/var/backups/ezan-web/daily` (30 kun) va `/var/backups/ezan-web/monthly` (12 oy).
  - Off-site: S3/R2 bucket (`s3://$BACKUP_S3_BUCKET/postgres/`).

## 2. Qadam-baqadam Tiklash (Restore) Jarayoni

### 1-qadam: Shifrlangan zaxira faylini ochish (Decrypt)
```bash
export BACKUP_ENCRYPTION_KEY="<sirli-kalit>"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -in /var/backups/ezan-web/daily/ezan_web_YYYY-MM-DD_HHMMSS.dump.gz.enc \
  | gunzip > /tmp/restore_target.dump
```

### 2-qadam: Sinov bazasiga yoki asosiy bazaga tiklash
```bash
# Sinov bazasini yaratish
docker exec ezan_web_postgres psql -U ezan -d postgres -c "DROP DATABASE IF EXISTS ezan_web_restore_drill;"
docker exec ezan_web_postgres psql -U ezan -d postgres -c "CREATE DATABASE ezan_web_restore_drill OWNER ezan;"

# Dump faylini tiklash
cat /tmp/restore_target.dump | docker exec -i ezan_web_postgres pg_restore -U ezan -d ezan_web_restore_drill --no-owner --no-privileges
```

### 3-qadam: Ma'lumotlar butunligini tekshirish
```bash
docker exec ezan_web_postgres psql -U ezan -d ezan_web_restore_drill -c "SELECT COUNT(*) FROM donations; SELECT COUNT(*) FROM cms_projects;"
rm -f /tmp/restore_target.dump
```

## 3. Haqiqiy Restore Sinovi (Drill) Natijasi
- **Sana**: 2026-11-06 (`mezana` serverida `ezan_web` -> `ezan_web_restore_drill` bazasiga)
- **Dump + AES-256 shifrlash vaqti**: `< 2` soniya
- **Decrypt + `pg_restore` tiklash vaqti**: `< 2` soniya (RTO < 15 daqiqa talabidan ancha tez)
- **Tekshiruv**: Barcha jadvallar (`donations`, `kurban_orders`, `cms_projects`, `cms_campaigns`, `cms_pages`) to'liq tiklandi va sinov bazasi tozalandi.
