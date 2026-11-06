#!/usr/bin/env bash
# Ezan Vakfı — Kunlik Shifrlangan PostgreSQL Zaxira (pg_dump + AES-256-CBC -pbkdf2)
# Saqlash: 30 kunlik + 12 oylik. Tashqi R2 bucketga va Mezana pull-backup papkasiga.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/ezan}"
DATE_STAMP="$(date -u +%Y-%m-%d_%H%M%S)"
MONTH_DAY="$(date -u +%d)"
DAILY_DIR="${BACKUP_DIR}/daily"
MONTHLY_DIR="${BACKUP_DIR}/monthly"

mkdir -p "${DAILY_DIR}" "${MONTHLY_DIR}"

if [ -z "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  echo "ERROR: BACKUP_ENCRYPTION_PASSPHRASE env o'zgaruvchisi kiritilmagan!" >&2
  exit 1
fi

OUT_FILE="${DAILY_DIR}/ezan_web_${DATE_STAMP}.sql.gz.enc"

pg_dump "${DATABASE_URL}" \
  --no-owner --no-privileges --clean --if-exists \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass env:BACKUP_ENCRYPTION_PASSPHRASE -out "${OUT_FILE}"

chmod 600 "${OUT_FILE}"
SIZE_BYTES="$(stat -c%s "${OUT_FILE}" 2>/dev/null || wc -c < "${OUT_FILE}")"
SHA256_HASH="$(sha256sum "${OUT_FILE}" | awk '{print $1}')"

# Oyning 1-kunida oylik zaxiraga ham nusxa olinadi (12 oy saqlanadi)
if [ "${MONTH_DAY}" = "01" ]; then
  cp "${OUT_FILE}" "${MONTHLY_DIR}/ezan_web_monthly_${DATE_STAMP}.sql.gz.enc"
fi

# 30 kundan eski kunlik va 365 kundan eski oylik zaxiralarni tozalash
find "${DAILY_DIR}" -type f -name "*.sql.gz.enc" -mtime +30 -delete
find "${MONTHLY_DIR}" -type f -name "*.sql.gz.enc" -mtime +365 -delete

# Bazaga backup log yozish
psql "${DATABASE_URL}" -c "INSERT INTO backup_logs (file_name, size_bytes, sha256_hash, status) VALUES ('$(basename "${OUT_FILE}")', ${SIZE_BYTES}, '${SHA256_HASH}', 'ok');" >/dev/null 2>&1 || true

echo "BACKUP_OK file=${OUT_FILE} bytes=${SIZE_BYTES} sha256=${SHA256_HASH}"
