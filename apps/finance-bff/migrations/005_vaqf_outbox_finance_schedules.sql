-- ============================================================================
-- 005_vaqf_outbox_finance_schedules.sql
-- Vaqf 4-bosqich: Outbox xabarnoma xizmati, Moliya xarajatlari integratsiyasi,
-- Muddatlar va eslatmalar (vaqf.schedules) hamda foydalanuvchi bildirishnoma sozlamalari
-- ============================================================================

-- 1. Outbox jadvali (vaqf.notifications_outbox)
CREATE TABLE IF NOT EXISTS vaqf.notifications_outbox (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(60) NOT NULL,
  recipient_ref VARCHAR(150) NOT NULL,
  recipient_telegram_id VARCHAR(64),
  title VARCHAR(300),
  body TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  telegram_message_id BIGINT,
  telegram_chat_id VARCHAR(64),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  action_taken VARCHAR(100),
  action_taken_at TIMESTAMPTZ,
  action_taken_by VARCHAR(150),
  dedupe_key VARCHAR(200) UNIQUE
);

COMMENT ON TABLE vaqf.notifications_outbox IS 'Vaqf tizimi xabarnomalar navbati (Telegram outbox va Web qo''ng''iroqcha bildirishnomalari)';

CREATE INDEX IF NOT EXISTS idx_vaqf_outbox_status_next
  ON vaqf.notifications_outbox (status, next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_vaqf_outbox_recipient
  ON vaqf.notifications_outbox (LOWER(recipient_ref), created_at DESC);

-- 2. Foydalanuvchi xabarnoma va jim soatlar sozlamalari (vaqf.user_notification_prefs)
CREATE TABLE IF NOT EXISTS vaqf.user_notification_prefs (
  user_ref VARCHAR(150) PRIMARY KEY,
  enabled_events JSONB NOT NULL DEFAULT '["*"]'::jsonb,
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_start VARCHAR(5) NOT NULL DEFAULT '22:00',
  quiet_end VARCHAR(5) NOT NULL DEFAULT '07:00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.user_notification_prefs IS 'Foydalanuvchi xabarnoma turlari va jim soatlar (22:00-07:00 Istanbul) sozlamalari';

-- 3. Moliya bilan bog'lanish: Buyum kartochkasida expense_ref va Ro'yxatga olinishi kerak bo'lgan xaridlar navbati
ALTER TABLE vaqf.assets
  ADD COLUMN IF NOT EXISTS expense_ref VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_vaqf_assets_expense_ref
  ON vaqf.assets (expense_ref)
  WHERE expense_ref IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS vaqf.pending_finance_expenses (
  id SERIAL PRIMARY KEY,
  expense_id VARCHAR(120) NOT NULL UNIQUE,
  source_type VARCHAR(30) NOT NULL DEFAULT 'expense',
  title VARCHAR(300) NOT NULL,
  description TEXT,
  category_id VARCHAR(120),
  category_name VARCHAR(150),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
  amount_try NUMERIC(14,2),
  expense_date DATE,
  buyer_employee_id VARCHAR(120),
  buyer_name VARCHAR(200),
  receipt_url TEXT,
  receipt_file_name VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'registered', 'not_inventory')),
  not_inventory_reason TEXT,
  registered_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  registered_inventory_nos JSONB NOT NULL DEFAULT '[]'::jsonb,
  processed_by VARCHAR(150),
  processed_by_name VARCHAR(200),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.pending_finance_expenses IS 'Moliyada tasdiqlangan jihoz/mebel xarajatlari — inventarga ro''yxatga olinishi kerak bo''lgan navbat';

CREATE INDEX IF NOT EXISTS idx_vaqf_pending_expenses_status
  ON vaqf.pending_finance_expenses (status, created_at DESC);

-- Seed default inventory-eligible finance categories & count interval into vaqf.settings
INSERT INTO vaqf.settings (key, value, updated_by_name)
VALUES (
  'finance_integration',
  '{
    "inventory_category_names": ["Jihozlar", "Ofis buyumlari", "Mebel", "Texnika", "Oshxona anjomlari"],
    "inventory_category_ids": ["cmtlai03s000bpir9obtjanbc", "cmtlai03k000apir91b9usxw2"],
    "recommended_count_interval_months": 12
  }'::jsonb,
  'Tizim'
)
ON CONFLICT (key) DO NOTHING;

-- 4. Muddatlar va eslatmalar jadvali (vaqf.schedules va vaqf.schedule_logs)
CREATE TABLE IF NOT EXISTS vaqf.schedules (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL DEFAULT 1 REFERENCES vaqf.institutions(id) ON DELETE CASCADE,
  asset_id INTEGER REFERENCES vaqf.assets(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES vaqf.locations(id) ON DELETE CASCADE,
  title VARCHAR(250) NOT NULL,
  kind VARCHAR(30) NOT NULL DEFAULT 'maintenance'
    CHECK (kind IN ('warranty', 'inspection', 'maintenance', 'insurance', 'license', 'other')),
  template_code VARCHAR(60),
  interval_months INTEGER,
  next_due DATE NOT NULL,
  remind_days_before JSONB NOT NULL DEFAULT '[14, 3]'::jsonb,
  responsible_ref VARCHAR(150),
  responsible_name VARCHAR(200),
  last_done_at TIMESTAMPTZ,
  last_done_by VARCHAR(150),
  last_done_by_name VARCHAR(200),
  last_reminded_for_date VARCHAR(40),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vaqf_schedules_target_check CHECK (asset_id IS NOT NULL OR location_id IS NOT NULL)
);

COMMENT ON TABLE vaqf.schedules IS 'Vaqf mulki va joylari bo''yicha kafolat, texnik ko''rik va davriy xizmat muddatlari';

CREATE INDEX IF NOT EXISTS idx_vaqf_schedules_due
  ON vaqf.schedules (status, next_due ASC);

CREATE TABLE IF NOT EXISTS vaqf.schedule_logs (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES vaqf.schedules(id) ON DELETE CASCADE,
  done_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  done_by VARCHAR(150),
  done_by_name VARCHAR(200),
  previous_due DATE,
  next_due DATE,
  note TEXT,
  photo_path TEXT
);

COMMENT ON TABLE vaqf.schedule_logs IS 'Davriy ko''rik va muddatlarning bajarilish tarixi';

-- Expand vaqf.asset_events event_type check constraint for 4-bosqich events
ALTER TABLE vaqf.asset_events DROP CONSTRAINT IF EXISTS asset_events_event_type_check;
ALTER TABLE vaqf.asset_events ADD CONSTRAINT asset_events_event_type_check CHECK (
  event_type IN (
    'created', 'updated', 'location_changed', 'responsible_changed',
    'status_changed', 'photo_added', 'document_added', 'deleted', 'imported',
    'inventory_counted', 'assigned', 'returned', 'transferred',
    'repair_sent', 'repair_completed', 'written_off', 'fault_reported',
    'schedule_completed', 'expense_linked'
  )
);
