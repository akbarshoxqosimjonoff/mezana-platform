-- =============================================================================
-- 001_vaqf_init.sql
-- Ezan Vakf? ? Vaqf mulk va inventarizatsiya tizimi (1-bosqich)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS vaqf;
COMMENT ON SCHEMA vaqf IS 'Ezan Vakf? mulk, jihoz va inventarizatsiya tizimi sxemasi';

-- 0. Migratsiyalar tarixi jadvali (runner tomonidan ham yaratiladi)
CREATE TABLE IF NOT EXISTS vaqf.schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.schema_migrations IS 'Qo''llangan SQL migratsiyalar ro''yxati';

-- 1. vaqf.institutions ? Muassasalar (masalan: Mezana Akademiyasi)
CREATE TABLE IF NOT EXISTS vaqf.institutions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(32) NOT NULL UNIQUE,
  address TEXT,
  notes TEXT,
  external_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.institutions IS 'Ezan Vakf? tasarrufidagi muassasalar ro''yxati';
COMMENT ON COLUMN vaqf.institutions.code IS 'Muassasa qisqa kodi (inventar raqami uchun, masalan MZN)';
COMMENT ON COLUMN vaqf.institutions.external_refs IS 'Mavjud CRM/ERP filial ID''lariga bog''lash uchun JSONB';

-- 2. vaqf.locations ? Joylar daraxti (bino -> qavat -> xona / ombor / tashqi hudud)
CREATE TABLE IF NOT EXISTS vaqf.locations (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES vaqf.institutions(id) ON DELETE RESTRICT,
  parent_id INTEGER REFERENCES vaqf.locations(id) ON DELETE RESTRICT,
  kind VARCHAR(32) NOT NULL CHECK (kind IN ('building', 'floor', 'room', 'storage', 'outdoor')),
  name VARCHAR(200) NOT NULL,
  code VARCHAR(64),
  external_ref VARCHAR(128) UNIQUE,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
COMMENT ON TABLE vaqf.locations IS 'Muassasa ichidagi joylar daraxti (bino, qavat, xona, ombor, tashqi hudud)';
COMMENT ON COLUMN vaqf.locations.kind IS 'Joy turi: building | floor | room | storage | outdoor';
COMMENT ON COLUMN vaqf.locations.external_ref IS 'Tashqi tizim (masalan CRM Room) identifikatori';

CREATE INDEX IF NOT EXISTS idx_vaqf_locations_inst ON vaqf.locations(institution_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vaqf_locations_parent ON vaqf.locations(parent_id) WHERE deleted_at IS NULL;

-- 3. vaqf.asset_categories ? Mulk kategoriyalari daraxti
CREATE TABLE IF NOT EXISTS vaqf.asset_categories (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER REFERENCES vaqf.asset_categories(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(64) UNIQUE,
  tracking VARCHAR(20) NOT NULL DEFAULT 'individual' CHECK (tracking IN ('individual', 'batch')),
  default_unit VARCHAR(32) NOT NULL DEFAULT 'dona',
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.asset_categories IS 'Mulk va jihoz kategoriyalari daraxti';
COMMENT ON COLUMN vaqf.asset_categories.tracking IS 'Standart hisob turi: individual (donalab) yoki batch (partiyalab/miqdoriy)';

-- 4. Inventar raqami uchun avtomatik ketma-ketlik (sequence) va funksiya
CREATE SEQUENCE IF NOT EXISTS vaqf.asset_inventory_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION vaqf.next_inventory_no(p_institution_id INTEGER)
RETURNS VARCHAR AS $$
DECLARE
  v_code VARCHAR(32);
  v_seq BIGINT;
BEGIN
  SELECT code INTO v_code FROM vaqf.institutions WHERE id = p_institution_id;
  IF v_code IS NULL OR v_code = '' THEN
    v_code := 'MZN';
  END IF;
  v_seq := nextval('vaqf.asset_inventory_seq');
  RETURN 'EV-' || v_code || '-' || LPAD(v_seq::text, 6, '0');
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION vaqf.next_inventory_no(INTEGER) IS 'Yangi mulk uchun EV-<MUASSASA>-000001 formatida unikal inventar raqami yaratadi';

-- 5. vaqf.assets ? Mulk kartochkasi
CREATE TABLE IF NOT EXISTS vaqf.assets (
  id SERIAL PRIMARY KEY,
  inventory_no VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category_id INTEGER NOT NULL REFERENCES vaqf.asset_categories(id) ON DELETE RESTRICT,
  description TEXT,
  tracking VARCHAR(20) NOT NULL DEFAULT 'individual' CHECK (tracking IN ('individual', 'batch')),
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit VARCHAR(32) NOT NULL DEFAULT 'dona',
  brand VARCHAR(120),
  model VARCHAR(120),
  serial_no VARCHAR(120),
  institution_id INTEGER NOT NULL REFERENCES vaqf.institutions(id) ON DELETE RESTRICT,
  location_id INTEGER REFERENCES vaqf.locations(id) ON DELETE SET NULL,
  responsible_ref VARCHAR(128),
  responsible_name VARCHAR(200),
  status VARCHAR(32) NOT NULL DEFAULT 'in_use' CHECK (status IN ('in_use', 'in_storage', 'under_repair', 'missing', 'written_off')),
  condition VARCHAR(32) NOT NULL DEFAULT 'good' CHECK (condition IN ('new', 'good', 'fair', 'poor')),
  acquisition_type VARCHAR(32) NOT NULL DEFAULT 'purchase' CHECK (acquisition_type IN ('purchase', 'donation', 'transfer', 'unknown')),
  acquired_at DATE,
  purchase_price NUMERIC(14, 2) CHECK (purchase_price IS NULL OR purchase_price >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY', 'USD')),
  supplier VARCHAR(200),
  expense_ref VARCHAR(128),
  donor_name VARCHAR(200),
  donation_doc_no VARCHAR(120),
  warranty_until DATE,
  notes TEXT,
  created_by VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
COMMENT ON TABLE vaqf.assets IS 'Vaqf mulki va jihozlari kartochkalari';
COMMENT ON COLUMN vaqf.assets.inventory_no IS 'Unikal inventar raqami (masalan EV-MZN-000123)';
COMMENT ON COLUMN vaqf.assets.tracking IS 'Hisob turi: individual (1 dona unikal buyum) yoki batch (ko''p sonli bir xil buyumlar)';
COMMENT ON COLUMN vaqf.assets.status IS 'Holati: in_use | in_storage | under_repair | missing | written_off';
COMMENT ON COLUMN vaqf.assets.condition IS 'Yaroqlilik darajasi: new | good | fair | poor';
COMMENT ON COLUMN vaqf.assets.acquisition_type IS 'Kelib chiqish manbasi: purchase | donation | transfer | unknown';
COMMENT ON COLUMN vaqf.assets.deleted_at IS 'Yumshoq o''chirish (soft delete) vaqti';

CREATE OR REPLACE FUNCTION vaqf.trg_assets_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.inventory_no IS NULL OR BTRIM(NEW.inventory_no) = '' THEN
    NEW.inventory_no := vaqf.next_inventory_no(NEW.institution_id);
  END IF;
  IF NEW.tracking = 'individual' AND (NEW.quantity IS NULL OR NEW.quantity <= 0) THEN
    NEW.quantity := 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vaqf_assets_bi ON vaqf.assets;
CREATE TRIGGER trg_vaqf_assets_bi
BEFORE INSERT ON vaqf.assets
FOR EACH ROW EXECUTE FUNCTION vaqf.trg_assets_before_insert();

CREATE INDEX IF NOT EXISTS idx_vaqf_assets_inst ON vaqf.assets(institution_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vaqf_assets_loc ON vaqf.assets(location_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vaqf_assets_cat ON vaqf.assets(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vaqf_assets_status ON vaqf.assets(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vaqf_assets_resp ON vaqf.assets(responsible_ref) WHERE deleted_at IS NULL;

-- 6. vaqf.asset_photos ? Buyum rasmlari (/srv/data/vaqf/photos/ ostida)
CREATE TABLE IF NOT EXISTS vaqf.asset_photos (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES vaqf.assets(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  caption VARCHAR(255),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by VARCHAR(128),
  uploaded_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.asset_photos IS 'Mulk kartochkasiga biriktirilgan rasmlar (/srv/data/vaqf/ ostida saqlanadi)';
CREATE INDEX IF NOT EXISTS idx_vaqf_asset_photos_asset ON vaqf.asset_photos(asset_id);

-- 7. vaqf.asset_documents ? Buyum hujjatlari (faktura, hadya dalolatnomasi, kafolat xati)
CREATE TABLE IF NOT EXISTS vaqf.asset_documents (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES vaqf.assets(id) ON DELETE CASCADE,
  file_path VARCHAR(500) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  doc_type VARCHAR(64) NOT NULL DEFAULT 'other' CHECK (doc_type IN ('invoice', 'donation_act', 'warranty', 'transfer_act', 'other')),
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  title VARCHAR(255),
  uploaded_by VARCHAR(128),
  uploaded_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.asset_documents IS 'Mulk kartochkasiga biriktirilgan hujjatlar (/srv/data/vaqf/ ostida saqlanadi)';
CREATE INDEX IF NOT EXISTS idx_vaqf_asset_docs_asset ON vaqf.asset_documents(asset_id);

-- 8. vaqf.asset_events ? Har bir buyumning o'zgarishlar tarixi (audit log)
CREATE TABLE IF NOT EXISTS vaqf.asset_events (
  id BIGSERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES vaqf.assets(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL CHECK (event_type IN (
    'created',
    'updated',
    'location_changed',
    'responsible_changed',
    'status_changed',
    'photo_added',
    'photo_deleted',
    'document_added',
    'document_deleted',
    'deleted',
    'restored',
    'imported'
  )),
  old_value JSONB,
  new_value JSONB,
  note TEXT,
  actor_id VARCHAR(128),
  actor_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.asset_events IS 'Har bir mulk kartochkasi bo''yicha barcha amallar va o''zgarishlar tarixi';
CREATE INDEX IF NOT EXISTS idx_vaqf_asset_events_asset ON vaqf.asset_events(asset_id, created_at DESC);
