-- ============================================================================
-- 007_vaqf_bot_backup_monitoring.sql
-- Vaqf 6-bosqich: Alohida Vaqf boti (@ezanvakfitizimbot), vaqf.bot_chats,
-- zaxira jurnali (vaqf.backup_logs), monitoring va ogohlantirishlar.
-- ============================================================================

CREATE TABLE IF NOT EXISTS vaqf.bot_chats (
  telegram_id VARCHAR(64) PRIMARY KEY,
  user_ref VARCHAR(150),
  username VARCHAR(120),
  full_name VARCHAR(200),
  lang VARCHAR(10) NOT NULL DEFAULT 'uz'
    CHECK (lang IN ('uz', 'tr')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  migration_notified_at TIMESTAMPTZ
);

COMMENT ON TABLE vaqf.bot_chats IS 'Alohida Vaqf botini (@ezanvakfitizimbot) /start bosib ochgan foydalanuvchilar va blok holati';

CREATE INDEX IF NOT EXISTS idx_vaqf_bot_chats_user_ref ON vaqf.bot_chats (LOWER(user_ref));

ALTER TABLE vaqf.notifications_outbox
  ADD COLUMN IF NOT EXISTS skip_reason VARCHAR(80);

CREATE TABLE IF NOT EXISTS vaqf.backup_logs (
  id SERIAL PRIMARY KEY,
  backup_type VARCHAR(40) NOT NULL DEFAULT 'daily'
    CHECK (backup_type IN ('daily', 'weekly_restore_test', 'manual')),
  status VARCHAR(20) NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'failed')),
  primary_path TEXT,
  secondary_path TEXT,
  size_bytes BIGINT DEFAULT 0,
  tables_restored INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.backup_logs IS 'Kunlik zaxira (/backup va /srv/data/backup/vaqf) hamda haftalik sinov tiklash (restore test) jurnali';

CREATE INDEX IF NOT EXISTS idx_vaqf_backup_logs_created ON vaqf.backup_logs (created_at DESC, status);

CREATE TABLE IF NOT EXISTS vaqf.monitoring_alerts (
  alert_type VARCHAR(80) PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE vaqf.monitoring_alerts IS 'Texnik mas''ulga yuboriladigan tizim ogohlantirishlarini soatiga 1 martadan ko''p takrorlamaslik jadvali';

INSERT INTO vaqf.settings (key, value, updated_by_name)
VALUES (
  'system_monitoring',
  '{
    "tech_admin_user_ref": "userumar",
    "vaqf_bot_username": "ezanvakfitizimbot",
    "vaqf_bot_name": "Ezan Vakfi Tizim",
    "backup_disk_mount": "/backup",
    "backup_local_dir": "/srv/data/backup/vaqf",
    "require_separate_backup_disk": true,
    "min_free_disk_percent": 15,
    "max_backup_age_hours": 26,
    "max_pending_outbox_minutes": 15,
    "max_failed_outbox_count": 5
  }'::jsonb,
  'Tizim'
)
ON CONFLICT (key) DO NOTHING;
