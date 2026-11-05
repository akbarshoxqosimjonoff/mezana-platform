-- 008_vaqf_asset_mac_address.sql
-- Elektron qurilmalar uchun MAC manzil (mac_address) maydoni va unikal indeks

ALTER TABLE vaqf.assets
  ADD COLUMN IF NOT EXISTS mac_address VARCHAR(32);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vaqf_assets_mac_unique
  ON vaqf.assets (UPPER(mac_address))
  WHERE mac_address IS NOT NULL AND BTRIM(mac_address) <> '' AND deleted_at IS NULL;
