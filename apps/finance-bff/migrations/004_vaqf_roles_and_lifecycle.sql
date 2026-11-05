-- ============================================================================
-- Vaqf tizimi — 3-bosqich: Rollar, Sozlamalar, Hujjatlar (Dalolatnomalar),
-- Zimmatlar, Ta'mirlar, Hisobdan chiqarish va Nosozlik xabarlari
-- ============================================================================

-- 1. vaqf.user_roles — Foydalanuvchi rollari (director, inventory_manager, accountant, staff)
CREATE TABLE IF NOT EXISTS vaqf.user_roles (
  id SERIAL PRIMARY KEY,
  user_ref VARCHAR(150) NOT NULL,
  user_name VARCHAR(200) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('director', 'inventory_manager', 'accountant', 'staff')),
  institution_id INTEGER REFERENCES vaqf.institutions(id) ON DELETE CASCADE,
  alternate_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  granted_by VARCHAR(150),
  granted_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.user_roles IS 'Vaqf tizimidagi foydalanuvchi rollari (institution_id NULL bo''lsa — butun vaqf bo''yicha)';
CREATE UNIQUE INDEX IF NOT EXISTS idx_vaqf_user_roles_unique
  ON vaqf.user_roles (LOWER(user_ref), COALESCE(institution_id, 0));
CREATE INDEX IF NOT EXISTS idx_vaqf_user_roles_ref
  ON vaqf.user_roles (LOWER(user_ref));

-- 2. vaqf.role_events — Rol berish va olish tarixi (audit log)
CREATE TABLE IF NOT EXISTS vaqf.role_events (
  id BIGSERIAL PRIMARY KEY,
  user_ref VARCHAR(150) NOT NULL,
  user_name VARCHAR(200),
  action VARCHAR(32) NOT NULL CHECK (action IN ('granted', 'updated', 'revoked')),
  old_role VARCHAR(32),
  new_role VARCHAR(32),
  institution_id INTEGER REFERENCES vaqf.institutions(id) ON DELETE SET NULL,
  actor_id VARCHAR(150),
  actor_name VARCHAR(200),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.role_events IS 'Foydalanuvchilarga rol berish va o''zgartirish tarixi';
CREATE INDEX IF NOT EXISTS idx_vaqf_role_events_created
  ON vaqf.role_events (created_at DESC);

-- 3. vaqf.settings — Vaqf tasdiqlash qoidalari va umumiy sozlamalari
CREATE TABLE IF NOT EXISTS vaqf.settings (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by VARCHAR(150),
  updated_by_name VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.settings IS 'Vaqf tizimi tasdiqlash qoidalari va sozlamalari';

INSERT INTO vaqf.settings (key, value, updated_by_name)
VALUES (
  'approval_rules',
  '{
    "writeoff_requires_director": true,
    "inter_institution_transfer_requires_director": true,
    "intra_institution_transfer_requires_director": false,
    "high_value_transfer_requires_director": true,
    "high_value_threshold_try": 10000,
    "usd_to_try_rate": 35
  }'::jsonb,
  'System Seed'
)
ON CONFLICT (key) DO NOTHING;

-- 4. Hujjat raqamlari generatori (ZMT-2026-0001, QYT-2026-0001, KCH-2026-0001, TMR-2026-0001, HCH-2026-0001)
CREATE TABLE IF NOT EXISTS vaqf.document_seq_counters (
  prefix VARCHAR(8) NOT NULL,
  year_num INTEGER NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, year_num)
);
COMMENT ON TABLE vaqf.document_seq_counters IS 'Dalolatnoma raqamlarini yil va tur bo''yicha ketma-ket generatsiya qilish jadvali';

CREATE OR REPLACE FUNCTION vaqf.next_document_no(p_type VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_prefix VARCHAR(8);
  v_year INTEGER;
  v_seq INTEGER;
BEGIN
  v_prefix := CASE p_type
    WHEN 'assignment' THEN 'ZMT'
    WHEN 'return'     THEN 'QYT'
    WHEN 'transfer'   THEN 'KCH'
    WHEN 'repair'     THEN 'TMR'
    WHEN 'writeoff'   THEN 'HCH'
    ELSE 'DOC'
  END;
  v_year := EXTRACT(YEAR FROM NOW())::INTEGER;

  INSERT INTO vaqf.document_seq_counters (prefix, year_num, last_seq)
  VALUES (v_prefix, v_year, 1)
  ON CONFLICT (prefix, year_num)
  DO UPDATE SET last_seq = vaqf.document_seq_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN v_prefix || '-' || v_year::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 5. vaqf.documents — Barcha dalolatnomalar uchun umumiy jadval
CREATE TABLE IF NOT EXISTS vaqf.documents (
  id SERIAL PRIMARY KEY,
  doc_no VARCHAR(32) NOT NULL UNIQUE,
  type VARCHAR(24) NOT NULL CHECK (type IN ('assignment', 'return', 'transfer', 'repair', 'writeoff')),
  institution_id INTEGER NOT NULL REFERENCES vaqf.institutions(id),
  status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'completed', 'rejected', 'cancelled')),
  created_by VARCHAR(150),
  created_by_name VARCHAR(200),
  approved_by VARCHAR(150),
  approved_by_name VARCHAR(200),
  approved_at TIMESTAMPTZ,
  rejected_by VARCHAR(150),
  rejected_by_name VARCHAR(200),
  rejected_at TIMESTAMPTZ,
  rejected_reason TEXT,
  completed_at TIMESTAMPTZ,
  from_location_id INTEGER REFERENCES vaqf.locations(id),
  to_location_id INTEGER REFERENCES vaqf.locations(id),
  from_person_ref VARCHAR(150),
  from_person_name VARCHAR(200),
  to_person_ref VARCHAR(150),
  to_person_name VARCHAR(200),
  to_institution_id INTEGER REFERENCES vaqf.institutions(id),
  expected_return_at DATE,
  reason TEXT,
  notes TEXT,
  pdf_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.documents IS 'Vaqf mulk harakati dalolatnomalari (zimmat, qaytarish, ko''chirish, ta''mir, hisobdan chiqarish)';
CREATE INDEX IF NOT EXISTS idx_vaqf_documents_type_status ON vaqf.documents(type, status);
CREATE INDEX IF NOT EXISTS idx_vaqf_documents_inst ON vaqf.documents(institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vaqf_documents_to_person ON vaqf.documents(LOWER(to_person_ref));
CREATE INDEX IF NOT EXISTS idx_vaqf_documents_from_person ON vaqf.documents(LOWER(from_person_ref));

CREATE OR REPLACE FUNCTION vaqf.trg_set_document_no()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.doc_no IS NULL OR BTRIM(NEW.doc_no) = '' THEN
    NEW.doc_no := vaqf.next_document_no(NEW.type);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vaqf_documents_doc_no ON vaqf.documents;
CREATE TRIGGER trg_vaqf_documents_doc_no
  BEFORE INSERT ON vaqf.documents
  FOR EACH ROW
  EXECUTE FUNCTION vaqf.trg_set_document_no();

-- 6. vaqf.document_items — Hujjatdagi buyumlar
CREATE TABLE IF NOT EXISTS vaqf.document_items (
  id BIGSERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES vaqf.documents(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES vaqf.assets(id),
  qty NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (qty > 0),
  condition_before VARCHAR(24),
  condition_after VARCHAR(24),
  note TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.document_items IS 'Dalolatnomaga biriktirilgan buyumlar va ularning holati/miqdori';
CREATE INDEX IF NOT EXISTS idx_vaqf_doc_items_doc ON vaqf.document_items(document_id);
CREATE INDEX IF NOT EXISTS idx_vaqf_doc_items_asset ON vaqf.document_items(asset_id);

-- 7. vaqf.document_confirmations — Qabul qiluvchining elektron tasdig'i
CREATE TABLE IF NOT EXISTS vaqf.document_confirmations (
  id BIGSERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES vaqf.documents(id) ON DELETE CASCADE,
  person_ref VARCHAR(150) NOT NULL,
  person_name VARCHAR(200),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip VARCHAR(64),
  user_agent TEXT,
  comment TEXT
);
COMMENT ON TABLE vaqf.document_confirmations IS 'Qabul qiluvchi xodimning elektron tasdig''i (IP, vaqt, qurilma)';
CREATE INDEX IF NOT EXISTS idx_vaqf_doc_confirmations_doc ON vaqf.document_confirmations(document_id);

-- 8. vaqf.assignments — Joriy va tarixiy zimmatlar
CREATE TABLE IF NOT EXISTS vaqf.assignments (
  id BIGSERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES vaqf.assets(id),
  person_ref VARCHAR(150) NOT NULL,
  person_name VARCHAR(200) NOT NULL,
  qty NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (qty > 0),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_return_at DATE,
  returned_at TIMESTAMPTZ,
  returned_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  assign_doc_id INTEGER REFERENCES vaqf.documents(id),
  return_doc_id INTEGER REFERENCES vaqf.documents(id),
  notes TEXT
);
COMMENT ON TABLE vaqf.assignments IS 'Xodimlar zimmasidagi buyumlar (returned_at NULL bo''lsa — faol zimmat)';
CREATE INDEX IF NOT EXISTS idx_vaqf_assignments_asset_active
  ON vaqf.assignments(asset_id) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vaqf_assignments_person_active
  ON vaqf.assignments(LOWER(person_ref)) WHERE returned_at IS NULL;

-- 9. vaqf.repairs — Ta'mirlar
CREATE TABLE IF NOT EXISTS vaqf.repairs (
  id BIGSERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES vaqf.assets(id),
  issue TEXT NOT NULL,
  reported_by VARCHAR(150),
  reported_by_name VARCHAR(200),
  vendor VARCHAR(200),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at TIMESTAMPTZ,
  cost NUMERIC(14,2),
  currency VARCHAR(8) NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY', 'USD')),
  expense_ref VARCHAR(100),
  result VARCHAR(24) CHECK (result IS NULL OR result IN ('fixed', 'not_fixable', 'replaced')),
  document_id INTEGER REFERENCES vaqf.documents(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.repairs IS 'Buyumlarning ta''mir jarayonlari va xarajatlari';
CREATE INDEX IF NOT EXISTS idx_vaqf_repairs_asset ON vaqf.repairs(asset_id);
CREATE INDEX IF NOT EXISTS idx_vaqf_repairs_doc ON vaqf.repairs(document_id);

-- 10. vaqf.writeoffs — Hisobdan chiqarishlar
CREATE TABLE IF NOT EXISTS vaqf.writeoffs (
  id BIGSERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES vaqf.assets(id),
  qty NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (qty > 0),
  reason VARCHAR(32) NOT NULL CHECK (reason IN ('broken', 'lost', 'stolen', 'obsolete', 'sold', 'donated_out', 'other')),
  book_value NUMERIC(14,2),
  currency VARCHAR(8) NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY', 'USD')),
  sale_amount NUMERIC(14,2),
  document_id INTEGER REFERENCES vaqf.documents(id),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.writeoffs IS 'Hisobdan chiqarilgan buyumlar reestri (sabab, balans qiymati, dalillar)';
CREATE INDEX IF NOT EXISTS idx_vaqf_writeoffs_asset ON vaqf.writeoffs(asset_id);
CREATE INDEX IF NOT EXISTS idx_vaqf_writeoffs_doc ON vaqf.writeoffs(document_id);

-- 11. vaqf.fault_reports — Xodimlar yuborgan nosozlik xabarlari
CREATE TABLE IF NOT EXISTS vaqf.fault_reports (
  id BIGSERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES vaqf.assets(id),
  reported_by VARCHAR(150) NOT NULL,
  reported_by_name VARCHAR(200),
  description TEXT NOT NULL,
  photo_path TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_repair', 'resolved', 'rejected')),
  repair_id BIGINT REFERENCES vaqf.repairs(id),
  document_id INTEGER REFERENCES vaqf.documents(id),
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE vaqf.fault_reports IS 'Xodimlar tomonidan yuborilgan nosozlik xabarlari';
CREATE INDEX IF NOT EXISTS idx_vaqf_fault_reports_status ON vaqf.fault_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vaqf_fault_reports_asset ON vaqf.fault_reports(asset_id);

-- 12. vaqf.asset_events jadvalini 3-bosqich hodisalari va document_id bilan kengaytirish
ALTER TABLE vaqf.asset_events
  ADD COLUMN IF NOT EXISTS document_id INTEGER REFERENCES vaqf.documents(id) ON DELETE SET NULL;

ALTER TABLE vaqf.asset_events
  DROP CONSTRAINT IF EXISTS asset_events_event_type_check;

ALTER TABLE vaqf.asset_events
  ADD CONSTRAINT asset_events_event_type_check CHECK (event_type IN (
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
    'imported',
    'assigned',
    'returned',
    'transferred',
    'repair_sent',
    'repair_completed',
    'written_off',
    'fault_reported'
  ));
