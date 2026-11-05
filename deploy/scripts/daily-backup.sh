#!/bin/sh
set -e

STAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOCAL_DIR="${BACKUP_LOCAL_DIR:-/backups/local}"
REMOTE_DIR="${BACKUP_REMOTE_DIR:-/backups/remote}"

mkdir -p "$LOCAL_DIR" "$REMOTE_DIR"

FILE="$LOCAL_DIR/ezan_web_$STAMP.dump"
pg_dump --format=custom --no-owner --no-privileges -f "$FILE"

# Ikkinchi joyga (alohida disk/remote mount) nusxalash
cp "$FILE" "$REMOTE_DIR/ezan_web_$STAMP.dump"

# 30 kundan eski zaxiralarni tozalash
find "$LOCAL_DIR" -name "ezan_web_*.dump" -mtime +30 -delete || true
find "$REMOTE_DIR" -name "ezan_web_*.dump" -mtime +30 -delete || true

echo "[backup] Completed daily backup: $FILE"