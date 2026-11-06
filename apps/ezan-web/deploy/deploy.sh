#!/usr/bin/env bash
# Ezan Vakfı — Production Deploy va Avtomatik Rollback Skripti
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/data/apps/mezana-platform/apps/ezan-web}"
REPO_DIR="${REPO_DIR:-/srv/data/apps/mezana-platform}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3005/api/health}"

cd "${REPO_DIR}"

if [ -f "${APP_DIR}/.env" ]; then
  chmod 600 "${APP_DIR}/.env"
fi

PREV_COMMIT="$(git rev-parse HEAD)"
echo "[deploy] Joriy commit: ${PREV_COMMIT}"

echo "[deploy] git pull --rebase bajarilmoqda..."
git pull --rebase

cd "${APP_DIR}"
echo "[deploy] Bog'liqliklar va migratsiya tekshirilmoqda..."
npm ci --prefer-offline --no-audit
npm run build

echo "[deploy] PM2 / xizmat qayta ishga tushirilmoqda..."
pm2 restart ezan-web
sleep 4

echo "[deploy] Health-check tekshirilmoqda: ${HEALTH_URL}"
HTTP_CODE="$(curl -s -o /tmp/ezan_health.json -w '%{http_code}' "${HEALTH_URL}" || echo '000')"

if [ "${HTTP_CODE}" != "200" ]; then
  echo "[deploy] ❌ Health-check yiqildi (HTTP ${HTTP_CODE})! Avvalgi versiyaga (${PREV_COMMIT}) qaytarilmoqda..."
  cd "${REPO_DIR}"
  git checkout "${PREV_COMMIT}"
  cd "${APP_DIR}"
  npm run build
  pm2 restart ezan-web
  exit 1
fi

echo "[deploy] ✓ Deploy muvaffaqiyatli yakunlandi:"
cat /tmp/ezan_health.json
echo ""
