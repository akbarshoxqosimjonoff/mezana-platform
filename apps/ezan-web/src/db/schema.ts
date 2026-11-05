import { Pool, QueryResultRow } from "pg";

const DEFAULT_DB_URL = "postgresql://ezan_user:ezan_local_pass@127.0.0.1:5437/ezan_web";

let poolInstance: Pool | null = null;

export function getDbPool(): Pool {
  if (!poolInstance) {
    const connectionString = process.env.DATABASE_URL || DEFAULT_DB_URL;
    // Ichki `vaqf` yoki `mezana_platform` bazasiga ulanishni qat'iyan taqiqlaymiz
    if (connectionString.includes("mezana_platform") || connectionString.includes("/vaqf")) {
      throw new Error("SECURITY VIOLATION: ezan-web must NEVER connect to the internal vaqf/mezana_platform database!");
    }
    poolInstance = new Pool({
      connectionString,
      max: 15,
      idleTimeoutMillis: 30000
    });
  }
  return poolInstance;
}

export async function dbQuery<T extends QueryResultRow = any>(text: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
  const pool = getDbPool();
  const res = await pool.query<T>(text, params);
  return { rows: res.rows, rowCount: res.rowCount || 0 };
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS cms_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(160) NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor', 'translator', 'finance')),
  password_hash TEXT NOT NULL,
  totp_secret VARCHAR(120),
  totp_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_pages (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) NOT NULL UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'scheduled')),
  publish_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  title JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  needs_review JSONB NOT NULL DEFAULT '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_projects (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) NOT NULL UNIQUE,
  category VARCHAR(60) NOT NULL DEFAULT 'education',
  project_status VARCHAR(24) NOT NULL DEFAULT 'ongoing' CHECK (project_status IN ('ongoing', 'completed')),
  status VARCHAR(24) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'scheduled')),
  target_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  collected_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  location_name VARCHAR(160),
  title JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  needs_review JSONB NOT NULL DEFAULT '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_campaigns (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) NOT NULL UNIQUE,
  purpose_code VARCHAR(80) NOT NULL UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'scheduled')),
  restricted BOOLEAN NOT NULL DEFAULT TRUE,
  currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
  target_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  collected_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_amount NUMERIC(14,2) NOT NULL DEFAULT 50,
  max_amount NUMERIC(14,2) NOT NULL DEFAULT 5000000,
  preset_amounts JSONB NOT NULL DEFAULT '[250, 500, 1000, 2500]'::jsonb,
  start_date DATE,
  end_date DATE,
  title JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  description JSONB NOT NULL DEFAULT '{}'::jsonb,
  needs_review JSONB NOT NULL DEFAULT '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_news (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) NOT NULL UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'scheduled')),
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category VARCHAR(60) NOT NULL DEFAULT 'general',
  image_url TEXT,
  title JSONB NOT NULL DEFAULT '{}'::jsonb,
  excerpt JSONB NOT NULL DEFAULT '{}'::jsonb,
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
  needs_review JSONB NOT NULL DEFAULT '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_videos (
  id SERIAL PRIMARY KEY,
  youtube_id VARCHAR(32) NOT NULL,
  category VARCHAR(60) NOT NULL DEFAULT 'general',
  project_slug VARCHAR(120),
  title JSONB NOT NULL DEFAULT '{}'::jsonb,
  description JSONB NOT NULL DEFAULT '{}'::jsonb,
  needs_review JSONB NOT NULL DEFAULT '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_reports (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  report_type VARCHAR(60) NOT NULL DEFAULT 'annual',
  file_url TEXT NOT NULL,
  title JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  needs_review JSONB NOT NULL DEFAULT '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_faqs (
  id SERIAL PRIMARY KEY,
  category VARCHAR(60) NOT NULL DEFAULT 'general',
  sort_order INTEGER NOT NULL DEFAULT 10,
  question JSONB NOT NULL DEFAULT '{}'::jsonb,
  answer JSONB NOT NULL DEFAULT '{}'::jsonb,
  needs_review JSONB NOT NULL DEFAULT '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb
);

CREATE TABLE IF NOT EXISTS cms_team (
  id SERIAL PRIMARY KEY,
  group_type VARCHAR(40) NOT NULL DEFAULT 'board' CHECK (group_type IN ('board', 'executive', 'academic')),
  sort_order INTEGER NOT NULL DEFAULT 10,
  full_name VARCHAR(160) NOT NULL,
  photo_url TEXT,
  role_title JSONB NOT NULL DEFAULT '{}'::jsonb,
  bio JSONB NOT NULL DEFAULT '{}'::jsonb,
  needs_review JSONB NOT NULL DEFAULT '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb
);

CREATE TABLE IF NOT EXISTS cms_media (
  id SERIAL PRIMARY KEY,
  file_url TEXT NOT NULL,
  mime_type VARCHAR(80) NOT NULL DEFAULT 'image/png',
  alt_text JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_qurban_countries (
  id SERIAL PRIMARY KEY,
  code VARCHAR(16) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  name JSONB NOT NULL DEFAULT '{}'::jsonb,
  needs_review JSONB NOT NULL DEFAULT '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb
);

CREATE TABLE IF NOT EXISTS cms_qurban_prices (
  id SERIAL PRIMARY KEY,
  country_code VARCHAR(16) NOT NULL REFERENCES cms_qurban_countries(code) ON DELETE CASCADE,
  year INTEGER NOT NULL DEFAULT 2027,
  share_price_try NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
  notes JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS cms_site_settings (
  key VARCHAR(80) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_versions (
  id SERIAL PRIMARY KEY,
  collection VARCHAR(60) NOT NULL,
  entity_id INTEGER NOT NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  snapshot JSONB NOT NULL,
  actor_email VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY,
  host VARCHAR(120) NOT NULL,
  locale VARCHAR(10) NOT NULL DEFAULT 'tr',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donations (
  id SERIAL PRIMARY KEY,
  external_id UUID NOT NULL UNIQUE,
  public_no VARCHAR(32) NOT NULL UNIQUE,
  cart_id UUID,
  origin_host VARCHAR(120) NOT NULL,
  locale VARCHAR(10) NOT NULL DEFAULT 'tr',
  frequency VARCHAR(20) NOT NULL DEFAULT 'one_time' CHECK (frequency IN ('one_time', 'monthly')),
  provider VARCHAR(32) NOT NULL DEFAULT 'mock',
  provider_payment_id VARCHAR(120),
  provider_subscription_token VARCHAR(160),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
  amount_try NUMERIC(14,2) NOT NULL CHECK (amount_try > 0),
  purpose_code VARCHAR(80) NOT NULL DEFAULT 'GENEL-BAGIS',
  purpose_title VARCHAR(250) NOT NULL DEFAULT 'Genel Ba???',
  restricted BOOLEAN NOT NULL DEFAULT FALSE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  donor_name VARCHAR(200) NOT NULL DEFAULT 'Anonim Ba?????',
  donor_phone VARCHAR(60),
  donor_email VARCHAR(160),
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  want_receipt BOOLEAN NOT NULL DEFAULT FALSE,
  kvkk_consent BOOLEAN NOT NULL DEFAULT FALSE,
  kvkk_consent_at TIMESTAMPTZ,
  deleted_pii_at TIMESTAMPTZ,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,
  synced_to_vaqf_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_donations_sync_cursor ON donations (id ASC) WHERE status IN ('paid', 'refunded') AND synced_to_vaqf_at IS NULL;

CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  event_id VARCHAR(160) NOT NULL UNIQUE,
  donation_external_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbox_messages (
  id SERIAL PRIMARY KEY,
  channel VARCHAR(32) NOT NULL DEFAULT 'email',
  recipient VARCHAR(200) NOT NULL,
  subject VARCHAR(250) NOT NULL,
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_submissions (
  id SERIAL PRIMARY KEY,
  kind VARCHAR(32) NOT NULL DEFAULT 'contact' CHECK (kind IN ('contact', 'qurban_notify', 'newsletter')),
  full_name VARCHAR(160),
  email VARCHAR(160),
  phone VARCHAR(60),
  message TEXT,
  locale VARCHAR(10) NOT NULL DEFAULT 'tr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fx_rates_cache (
  rate_date DATE PRIMARY KEY,
  usd_try NUMERIC(12,4) NOT NULL,
  eur_try NUMERIC(12,4) NOT NULL,
  gold_gram_try NUMERIC(12,2) NOT NULL,
  silver_gram_try NUMERIC(12,2) NOT NULL,
  source VARCHAR(120) NOT NULL DEFAULT 'TCMB',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export async function ensureSchema(): Promise<void> {
  const pool = getDbPool();
  await pool.query(SCHEMA_SQL);
  await pool.query(EXTRA_SCHEMA_SQL);
  await pool.query(PHASE2_KURBAN_SCHEMA_SQL);
}

export const EXTRA_SCHEMA_SQL = `
ALTER TABLE donations ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash VARCHAR(128) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES cms_users(id) ON DELETE CASCADE,
  email VARCHAR(160) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('admin', 'editor', 'translator', 'finance')),
  totp_verified BOOLEAN NOT NULL DEFAULT FALSE,
  client_ip VARCHAR(80),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER,
  actor_email VARCHAR(160) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  action VARCHAR(80) NOT NULL,
  target_ref VARCHAR(200),
  reason TEXT,
  client_ip VARCHAR(80),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export const PHASE2_KURBAN_SCHEMA_SQL = `
-- Expand role constraint on cms_users and admin_sessions to include 'field' (dala jamoasi)
ALTER TABLE cms_users DROP CONSTRAINT IF EXISTS cms_users_role_check;
ALTER TABLE cms_users ADD CONSTRAINT cms_users_role_check CHECK (role IN ('admin', 'editor', 'translator', 'finance', 'field'));
ALTER TABLE cms_users ADD COLUMN IF NOT EXISTS assigned_country_code VARCHAR(16);

ALTER TABLE admin_sessions DROP CONSTRAINT IF EXISTS admin_sessions_role_check;
ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_role_check CHECK (role IN ('admin', 'editor', 'translator', 'finance', 'field'));

ALTER TABLE donations ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS kurban_seasons (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE,
  eid_day_1 DATE,
  eid_day_2 DATE,
  eid_day_3 DATE,
  eid_day_4 DATE,
  sales_open_at TIMESTAMPTZ,
  sales_close_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  auto_approve_videos BOOLEAN NOT NULL DEFAULT FALSE,
  video_retention_days INTEGER NOT NULL DEFAULT 365,
  original_retention_days INTEGER NOT NULL DEFAULT 30,
  vekalet_version VARCHAR(32) NOT NULL DEFAULT 'v2027.1-taslik',
  vekalet_text JSONB NOT NULL DEFAULT '{}'::jsonb,
  needs_review JSONB NOT NULL DEFAULT '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kurban_countries (
  id SERIAL PRIMARY KEY,
  code VARCHAR(16) NOT NULL UNIQUE,
  flag VARCHAR(24) NOT NULL DEFAULT '🏳️',
  partner_internal VARCHAR(200),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  name JSONB NOT NULL DEFAULT '{}'::jsonb,
  description JSONB NOT NULL DEFAULT '{}'::jsonb,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  needs_review JSONB NOT NULL DEFAULT '{"tr":false,"uz":true,"en":true,"ar":true}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kurban_offers (
  id SERIAL PRIMARY KEY,
  season_year INTEGER NOT NULL REFERENCES kurban_seasons(year) ON DELETE CASCADE,
  country_code VARCHAR(16) NOT NULL REFERENCES kurban_countries(code) ON DELETE CASCADE,
  animal_type VARCHAR(24) NOT NULL CHECK (animal_type IN ('sheep', 'goat', 'cattle', 'camel')),
  shares_per_animal INTEGER NOT NULL CHECK (shares_per_animal IN (1, 7)),
  price_per_share_try NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (price_per_share_try >= 0),
  quota_shares INTEGER NOT NULL DEFAULT 0 CHECK (quota_shares >= 0),
  sold_shares INTEGER NOT NULL DEFAULT 0 CHECK (sold_shares >= 0),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season_year, country_code, animal_type),
  CHECK (sold_shares <= quota_shares)
);

CREATE TABLE IF NOT EXISTS kurban_orders (
  id SERIAL PRIMARY KEY,
  order_no VARCHAR(40) NOT NULL UNIQUE,
  donation_id INTEGER REFERENCES donations(id) ON DELETE SET NULL,
  donation_external_id UUID,
  season_year INTEGER NOT NULL,
  country_code VARCHAR(16) NOT NULL,
  animal_type VARCHAR(24) NOT NULL,
  offer_id INTEGER NOT NULL REFERENCES kurban_offers(id),
  locale VARCHAR(10) NOT NULL DEFAULT 'tr',
  donor_name VARCHAR(200) NOT NULL,
  donor_phone VARCHAR(60) NOT NULL,
  donor_email VARCHAR(160),
  vekalet_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  vekalet_accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vekalet_ip_hash VARCHAR(128) NOT NULL,
  vekalet_text_version VARCHAR(32) NOT NULL,
  read_names_aloud_consent BOOLEAN NOT NULL DEFAULT FALSE,
  kvkk_consent BOOLEAN NOT NULL DEFAULT FALSE,
  total_shares INTEGER NOT NULL CHECK (total_shares > 0),
  price_per_share_try NUMERIC(14,2) NOT NULL,
  total_amount_try NUMERIC(14,2) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'paid', 'refunded', 'cancelled')),
  reserved_until TIMESTAMPTZ NOT NULL,
  notify_vekalet_sent_at TIMESTAMPTZ,
  notify_slaughter_sent_at TIMESTAMPTZ,
  notify_video_sent_at TIMESTAMPTZ,
  is_test BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kurban_animals (
  id SERIAL PRIMARY KEY,
  season_year INTEGER NOT NULL,
  country_code VARCHAR(16) NOT NULL,
  animal_type VARCHAR(24) NOT NULL CHECK (animal_type IN ('sheep', 'goat', 'cattle', 'camel')),
  shares_capacity INTEGER NOT NULL CHECK (shares_capacity IN (1, 7)),
  tag_no VARCHAR(60) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'slaughtered', 'video_ready', 'notified')),
  slaughtered_at TIMESTAMPTZ,
  slaughtered_by VARCHAR(160),
  video_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season_year, country_code, tag_no)
);

CREATE TABLE IF NOT EXISTS kurban_videos (
  id SERIAL PRIMARY KEY,
  animal_id INTEGER NOT NULL REFERENCES kurban_animals(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  country_code VARCHAR(16) NOT NULL,
  storage_key TEXT NOT NULL,
  processed_storage_key TEXT,
  poster_storage_key TEXT,
  mime_type VARCHAR(60) NOT NULL DEFAULT 'video/mp4',
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes <= 2147483648),
  duration_sec INTEGER,
  uploaded_by VARCHAR(160) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'processed', 'published', 'rejected')),
  watermark_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  original_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  video_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '365 days'),
  approved_by VARCHAR(160),
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  processing_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kurban_shares (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES kurban_orders(id) ON DELETE CASCADE,
  offer_id INTEGER NOT NULL REFERENCES kurban_offers(id),
  season_year INTEGER NOT NULL,
  country_code VARCHAR(16) NOT NULL,
  animal_type VARCHAR(24) NOT NULL,
  seq_in_order INTEGER NOT NULL DEFAULT 1,
  owner_name VARCHAR(80) NOT NULL CHECK (char_length(owner_name) BETWEEN 2 AND 80),
  intention_type VARCHAR(24) NOT NULL DEFAULT 'vacip' CHECK (intention_type IN ('vacip', 'adak', 'akika', 'sukur', 'nafile')),
  animal_id INTEGER REFERENCES kurban_animals(id) ON DELETE SET NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'paid', 'assigned', 'slaughtered', 'video_ready', 'notified', 'refunded', 'cancelled')),
  tracking_token VARCHAR(80) NOT NULL UNIQUE,
  reserved_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kurban_events (
  id SERIAL PRIMARY KEY,
  share_id INTEGER REFERENCES kurban_shares(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES kurban_orders(id) ON DELETE CASCADE,
  animal_id INTEGER REFERENCES kurban_animals(id) ON DELETE SET NULL,
  actor_email VARCHAR(160),
  actor_role VARCHAR(40),
  event_type VARCHAR(60) NOT NULL,
  old_status VARCHAR(32),
  new_status VARCHAR(32),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kurban_upload_sessions (
  upload_id VARCHAR(120) PRIMARY KEY,
  animal_id INTEGER NOT NULL REFERENCES kurban_animals(id) ON DELETE CASCADE,
  country_code VARCHAR(16) NOT NULL,
  storage_key TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(60) NOT NULL,
  total_size_bytes BIGINT NOT NULL CHECK (total_size_bytes > 0 AND total_size_bytes <= 2147483648),
  chunk_size_bytes INTEGER NOT NULL DEFAULT 8388608,
  completed_parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by VARCHAR(160) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'completed', 'aborted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kurban_message_logs (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES kurban_orders(id) ON DELETE CASCADE,
  share_id INTEGER REFERENCES kurban_shares(id) ON DELETE SET NULL,
  event_stage VARCHAR(32) NOT NULL CHECK (event_stage IN ('payment_confirmed', 'animal_slaughtered', 'video_published')),
  channel VARCHAR(24) NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
  recipient VARCHAR(160) NOT NULL,
  locale VARCHAR(10) NOT NULL DEFAULT 'tr',
  template_name VARCHAR(80),
  body TEXT NOT NULL,
  encoding VARCHAR(20) NOT NULL DEFAULT 'GSM7_LATIN',
  char_length INTEGER NOT NULL DEFAULT 0,
  provider VARCHAR(40) NOT NULL DEFAULT 'mock',
  provider_message_id VARCHAR(120),
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'invalid_phone')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  dedupe_key VARCHAR(160) UNIQUE,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7-qadam: Xayriyachi kabineti (OTP, sessiya, sozlamalar va KVKK o'chirish so'rovlari)
CREATE TABLE IF NOT EXISTS donor_otp_codes (
  id SERIAL PRIMARY KEY,
  target VARCHAR(160) NOT NULL,
  channel VARCHAR(16) NOT NULL CHECK (channel IN ('sms', 'email')),
  code_hash VARCHAR(128) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  client_ip VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donor_sessions (
  token_hash VARCHAR(128) PRIMARY KEY,
  phone VARCHAR(60),
  email VARCHAR(160),
  host VARCHAR(120) NOT NULL,
  locale VARCHAR(10) NOT NULL DEFAULT 'tr',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donor_profiles (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(60) UNIQUE,
  email VARCHAR(160) UNIQUE,
  full_name VARCHAR(160),
  preferred_locale VARCHAR(10) NOT NULL DEFAULT 'tr',
  sms_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kvkk_deletion_requests (
  id SERIAL PRIMARY KEY,
  donor_phone VARCHAR(60),
  donor_email VARCHAR(160),
  reason TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved_anonymized', 'rejected')),
  decided_by VARCHAR(160),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
