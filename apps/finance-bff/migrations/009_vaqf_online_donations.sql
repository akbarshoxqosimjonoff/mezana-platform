-- ============================================================================
-- 009_vaqf_online_donations.sql (007_vaqf_online_donations)
-- Ezan Vakfi ommaviy saytidan (apps/ezan-web) onlayn xayriyalarni
-- ichki vaqf tizimiga sinxronlash ustunlari va holat sozlamasi.
-- ============================================================================

ALTER TABLE vaqf.donations
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'online'));

ALTER TABLE vaqf.donations
  ADD COLUMN IF NOT EXISTS external_ref VARCHAR(80) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_vaqf_donations_source ON vaqf.donations (source);