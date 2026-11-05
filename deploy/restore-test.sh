#!/usr/bin/env bash
set -euo pipefail

# Ezan Vakfı (ezan_web) Haftalik Zaxirani Tiklash Sinovi
# Cron: 0 4 * * 0 /srv/ezan-web/deploy/restore-test.sh

BACKUP_DIR="${BACKUP_DIR:-/var/backups/ezan_web}"
KEY_FILE="${BACKUP_KEY_FILE:-/etc/ezan-web/backup.key}"
TEMP_DB="ezan_web_restore_verify"

LATEST_BACKUP="$(ls -1t "${BACKUP_DIR}"/ezan_web_*.sql.gz.enc 2>/dev/null | head -n 1 || true)"
if [ -z "${LATEST_BACKUP}" ]; then
  echo "ERROR: No encrypted backup found in ${BACKUP_DIR}" >&2
  exit 1
fi

chmod 600 "${KEY_FILE}"

docker exec ezan_web_postgres psql -U ezan_user -d postgres -c "DROP DATABASE IF EXISTS ${TEMP_DB};"
docker exec ezan_web_postgres psql -U ezan_user -d postgres -c "CREATE DATABASE ${TEMP_DB};"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:${KEY_FILE}" -in "${LATEST_BACKUP}" \
  | gunzip \
  | docker exec -i ezan_web_postgres psql -U ezan_user -d "${TEMP_DB}" >/dev/null

CAMPAIGN_COUNT="$(docker exec ezan_web_postgres psql -U ezan_user -d "${TEMP_DB}" -tAc "SELECT COUNT(*) FROM cms_campaigns;")"
docker exec ezan_web_postgres psql -U ezan_user -d postgres -c "DROP DATABASE ${TEMP_DB};"

echo "[restore-test] Verified backup ${LATEST_BACKUP} (campaigns=${CAMPAIGN_COUNT})"
