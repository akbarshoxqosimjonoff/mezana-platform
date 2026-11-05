#!/bin/sh
set -e

LATEST=$(ls -t ${BACKUP_LOCAL_DIR:-/backups/local}/ezan_web_*.dump 2>/dev/null | head -n 1)
if [ -z "$LATEST" ]; then
  echo "[restore-test] No backup file found"
  exit 1
fi

TEST_DB="ezan_web_restore_verify"
psql -c "DROP DATABASE IF EXISTS $TEST_DB;"
psql -c "CREATE DATABASE $TEST_DB;"
pg_restore --no-owner --no-privileges -d "$TEST_DB" "$LATEST"

TABLES_COUNT=$(psql -d "$TEST_DB" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
psql -c "DROP DATABASE $TEST_DB;"

echo "[restore-test] Verified restore from $LATEST (tables restored: $TABLES_COUNT)"