#!/usr/bin/env bash
set -euo pipefail

# Ezan Vakfı (ezan_web) Kunlik Shifrlangan Zaxira Skripti
# Cron: 0 3 * * * /srv/ezan-web/deploy/backup.sh

BACKUP_DIR="${BACKUP_DIR:-/var/backups/ezan_web}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
KEY_FILE="${BACKUP_KEY_FILE:-/etc/ezan-web/backup.key}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/ezan_web_${TIMESTAMP}.sql.gz.enc"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

if [ ! -f "${KEY_FILE}" ]; then
  echo "ERROR: Backup key file not found at ${KEY_FILE}" >&2
  exit 1
fi

# Kalit fayli huquqlari qat'iy 600 bo'lishi shart (repoda saqlanmaydi)
chmod 600 "${KEY_FILE}"

docker exec ezan_web_postgres pg_dump -U ezan_user -d ezan_web \
  | gzip -9 \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass "file:${KEY_FILE}" -out "${OUT_FILE}"

chmod 600 "${OUT_FILE}"

# 30 kundan eski zaxiralarni o'chirish
find "${BACKUP_DIR}" -name "ezan_web_*.sql.gz.enc" -type f -mtime +"${RETENTION_DAYS}" -delete

echo "[backup] Encrypted backup created: ${OUT_FILE}"
