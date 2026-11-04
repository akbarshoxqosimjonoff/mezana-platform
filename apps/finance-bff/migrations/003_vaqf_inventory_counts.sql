-- ============================================================================
-- 003_vaqf_inventory_counts.sql
-- Vaqf tizimi — 2-bosqich: Inventarizatsiya (Sanoq) jadvallari va cheklovlari
-- ============================================================================

-- 1. Sanoq kodi uchun ketma-ketlik va funksiya (masalan: SAN-2026-001)
CREATE SEQUENCE IF NOT EXISTS vaqf.inventory_count_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION vaqf.next_count_code(p_year INT DEFAULT EXTRACT(YEAR FROM NOW())::INT)
RETURNS VARCHAR AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  v_seq := nextval('vaqf.inventory_count_seq');
  RETURN 'SAN-' || p_year::TEXT || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION vaqf.next_count_code(INT) IS 'Sanoq hujjati uchun avtomatik ketma-ket kod yaratuvchi funksiya (SAN-YYYY-NNN)';

-- 2. vaqf.inventory_counts — Inventarizatsiya sanoqlari
CREATE TABLE IF NOT EXISTS vaqf.inventory_counts (
  id SERIAL PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE DEFAULT vaqf.next_count_code(),
  institution_id INT NOT NULL REFERENCES vaqf.institutions(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  scope JSONB NOT NULL DEFAULT '{"type":"all","location_ids":[],"category_ids":[]}'::jsonb,
  status VARCHAR(24) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'review', 'approved', 'cancelled')),
  created_by VARCHAR(150),
  created_by_ref VARCHAR(100),
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  approved_by VARCHAR(150),
  approved_by_ref VARCHAR(100),
  approved_at TIMESTAMPTZ,
  cancelled_by VARCHAR(150),
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  committee JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.inventory_counts IS 'Vaqf inventarizatsiya (sanoq) hujjatlari';
COMMENT ON COLUMN vaqf.inventory_counts.code IS 'Avtomatik sanoq kodi (masalan: SAN-2026-001)';
COMMENT ON COLUMN vaqf.inventory_counts.scope IS 'Qamrov: butun muassasa, tanlangan joylar va/yoki kategoriyalar (jsonb)';
COMMENT ON COLUMN vaqf.inventory_counts.status IS 'Sanoq holati: draft -> in_progress -> review -> approved | cancelled';
COMMENT ON COLUMN vaqf.inventory_counts.committee IS 'Sanoq komissiyasi a''zolari ro''yxati [{name, role}] (dalolatnoma uchun)';

-- Bir muassasada bir vaqtda faqat bitta in_progress sanoq bo'lishi mumkin
CREATE UNIQUE INDEX IF NOT EXISTS idx_vaqf_counts_one_in_progress
  ON vaqf.inventory_counts (institution_id)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_vaqf_counts_inst_status
  ON vaqf.inventory_counts (institution_id, status);

-- 3. vaqf.inventory_count_locations — Sanoqdagi har bir joy va uning mas'uli
CREATE TABLE IF NOT EXISTS vaqf.inventory_count_locations (
  id SERIAL PRIMARY KEY,
  count_id INT NOT NULL REFERENCES vaqf.inventory_counts(id) ON DELETE CASCADE,
  location_id INT NOT NULL REFERENCES vaqf.locations(id) ON DELETE RESTRICT,
  assignee_ref VARCHAR(100),
  assignee_name VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'counting', 'done')),
  done_at TIMESTAMPTZ,
  done_by VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (count_id, location_id)
);

COMMENT ON TABLE vaqf.inventory_count_locations IS 'Sanoqqa kiritilgan joylar (xonalar) va ularga biriktirilgan mas''ul xodimlar';
COMMENT ON COLUMN vaqf.inventory_count_locations.assignee_ref IS 'Mas''ul xodimning tizimdagi identifikatori (CRM/ERP username yoki ID)';
COMMENT ON COLUMN vaqf.inventory_count_locations.assignee_name IS 'Mas''ul xodimning to''liq ismi';
COMMENT ON COLUMN vaqf.inventory_count_locations.status IS 'Joy sanog''i holati: pending | counting | done';

CREATE INDEX IF NOT EXISTS idx_vaqf_count_locations_count
  ON vaqf.inventory_count_locations (count_id);
CREATE INDEX IF NOT EXISTS idx_vaqf_count_locations_assignee
  ON vaqf.inventory_count_locations (count_id, assignee_ref);

-- 4. vaqf.inventory_count_items — Sanoq qatorlari (muzlatilgan kutilgan holat + haqiqiy topilgan holat)
CREATE TABLE IF NOT EXISTS vaqf.inventory_count_items (
  id SERIAL PRIMARY KEY,
  count_id INT NOT NULL REFERENCES vaqf.inventory_counts(id) ON DELETE CASCADE,
  asset_id INT REFERENCES vaqf.assets(id) ON DELETE RESTRICT,
  expected_location_id INT REFERENCES vaqf.locations(id) ON DELETE SET NULL,
  expected_qty NUMERIC(12, 2),
  expected_status VARCHAR(30),
  expected_condition VARCHAR(20),
  found_location_id INT REFERENCES vaqf.locations(id) ON DELETE SET NULL,
  counted_qty NUMERIC(12, 2),
  condition VARCHAR(20)
    CHECK (condition IS NULL OR condition IN ('new', 'good', 'fair', 'poor', 'damaged')),
  photo_path TEXT,
  note TEXT,
  result VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (result IN ('pending', 'found', 'moved', 'missing', 'extra', 'qty_diff', 'damaged')),
  scanned_by VARCHAR(150),
  scanned_by_ref VARCHAR(100),
  scanned_at TIMESTAMPTZ,
  client_scan_id VARCHAR(120) UNIQUE,
  needs_relabel BOOLEAN NOT NULL DEFAULT FALSE,
  extra_data JSONB,
  created_asset_id INT REFERENCES vaqf.assets(id) ON DELETE SET NULL,
  decision VARCHAR(24)
    CHECK (decision IS NULL OR decision IN ('apply', 'mark_missing', 'ignore')),
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (count_id, asset_id)
);

COMMENT ON TABLE vaqf.inventory_count_items IS 'Sanoq qatorlari: kutilgan muzlatilgan nusxa, skaner natijasi va direktor qarori';
COMMENT ON COLUMN vaqf.inventory_count_items.asset_id IS 'Mulk ID raqami (ro''yxatda yo''q yangi topilgan extra buyum uchun NULL)';
COMMENT ON COLUMN vaqf.inventory_count_items.expected_location_id IS 'Sanoq boshlanganda buyum qayd etilgan joy (muzlatilgan nusxa)';
COMMENT ON COLUMN vaqf.inventory_count_items.expected_qty IS 'Sanoq boshlangandagi kutilgan miqdor (muzlatilgan nusxa)';
COMMENT ON COLUMN vaqf.inventory_count_items.expected_status IS 'Sanoq boshlangandagi kutilgan holat (muzlatilgan nusxa)';
COMMENT ON COLUMN vaqf.inventory_count_items.result IS 'Natija: pending | found | moved | missing | extra | qty_diff | damaged';
COMMENT ON COLUMN vaqf.inventory_count_items.client_scan_id IS 'Oflayn skanerlar takrorlanmasligi uchun unikal mijoz skaner ID';
COMMENT ON COLUMN vaqf.inventory_count_items.decision IS 'Direktor qarori: apply | mark_missing | ignore | null';
COMMENT ON COLUMN vaqf.inventory_count_items.extra_data IS 'Ro''yxatda yo''q (extra) buyum ma''lumotlari: {name, category_id, tracking, unit, brand, model, serial_no, description}';

CREATE INDEX IF NOT EXISTS idx_vaqf_count_items_count
  ON vaqf.inventory_count_items (count_id);
CREATE INDEX IF NOT EXISTS idx_vaqf_count_items_expected_loc
  ON vaqf.inventory_count_items (count_id, expected_location_id);
CREATE INDEX IF NOT EXISTS idx_vaqf_count_items_found_loc
  ON vaqf.inventory_count_items (count_id, found_location_id);
CREATE INDEX IF NOT EXISTS idx_vaqf_count_items_result
  ON vaqf.inventory_count_items (count_id, result);
