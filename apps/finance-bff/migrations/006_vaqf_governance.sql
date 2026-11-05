-- ============================================================================
-- 006_vaqf_governance.sql
-- Vaqf 5-bosqich: Vaqf boshqaruvi (Hadyalar/Bağış, Ko'chmas mulk va Ijara,
-- Shartnomalar va Hujjatlar Arxivi, Yönetim Kurulu qarorlari, Yig'ma hisobotlar,
-- KVKK shifrlash va anonimlashtirish)
-- ============================================================================

-- 0. Rollar jadvalidagi cheklovni kengaytirish ('board_member' qo'shiladi)
ALTER TABLE vaqf.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE vaqf.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('director', 'inventory_manager', 'accountant', 'staff', 'board_member'));

-- 1. HADYALAR (BAĞIŞ) REESTRI
CREATE TABLE IF NOT EXISTS vaqf.donors (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL DEFAULT 'person'
    CHECK (type IN ('person', 'organization')),
  full_name VARCHAR(250) NOT NULL,
  phone_encrypted TEXT,
  phone_last4 VARCHAR(10),
  email_encrypted TEXT,
  email_masked VARCHAR(120),
  address_encrypted TEXT,
  tax_or_id_encrypted TEXT,
  tax_or_id_last4 VARCHAR(10),
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  kvkk_consent_at TIMESTAMPTZ,
  anonymized_at TIMESTAMPTZ,
  anonymized_by VARCHAR(150),
  notes TEXT,
  created_by VARCHAR(150),
  created_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.donors IS 'Vaqf hadya qiluvchilari (bağışçılar) — shaxsiy ma''lumotlar AES-256-GCM bilan shifrlangan';

CREATE INDEX IF NOT EXISTS idx_vaqf_donors_name ON vaqf.donors (LOWER(full_name));

CREATE TABLE IF NOT EXISTS vaqf.donations (
  id SERIAL PRIMARY KEY,
  donation_no VARCHAR(40) NOT NULL UNIQUE,
  donor_id INTEGER REFERENCES vaqf.donors(id) ON DELETE SET NULL,
  institution_id INTEGER REFERENCES vaqf.institutions(id) ON DELETE SET NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'cash'
    CHECK (kind IN ('cash', 'in_kind', 'property', 'other')),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
  amount_try NUMERIC(14,2) NOT NULL DEFAULT 0,
  purpose VARCHAR(250) NOT NULL DEFAULT 'Umumiy vaqf faoliyati',
  restricted BOOLEAN NOT NULL DEFAULT FALSE,
  received_at DATE NOT NULL DEFAULT CURRENT_DATE,
  income_ref VARCHAR(120),
  receipt_no VARCHAR(60),
  receipt_pdf_path TEXT,
  status VARCHAR(25) NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded', 'receipt_issued', 'cancelled')),
  cancelled_reason TEXT,
  board_decision_id INTEGER,
  notes TEXT,
  created_by VARCHAR(150),
  created_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.donations IS 'Vaqfga kelgan hadyalar (bağışlar): pul, buyum (ayni), ko''chmas mulk va maqsadli (şartlı) hadyalar';

CREATE INDEX IF NOT EXISTS idx_vaqf_donations_received ON vaqf.donations (received_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_vaqf_donations_donor ON vaqf.donations (donor_id);
CREATE INDEX IF NOT EXISTS idx_vaqf_donations_income_ref ON vaqf.donations (income_ref) WHERE income_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS vaqf.donation_items (
  id SERIAL PRIMARY KEY,
  donation_id INTEGER NOT NULL REFERENCES vaqf.donations(id) ON DELETE CASCADE,
  name VARCHAR(250) NOT NULL,
  category_id INTEGER REFERENCES vaqf.asset_categories(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES vaqf.locations(id) ON DELETE SET NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit VARCHAR(30) NOT NULL DEFAULT 'dona',
  estimated_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (estimated_value >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
  condition VARCHAR(20) NOT NULL DEFAULT 'good',
  asset_id INTEGER REFERENCES vaqf.assets(id) ON DELETE SET NULL,
  property_id INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.donation_items IS 'Buyum (in_kind) yoki mulk hadyasi tarkibidagi obyektlar va avtomatik yaratilgan mulk kartochkasi havolasi';

CREATE TABLE IF NOT EXISTS vaqf.donation_spend_links (
  id SERIAL PRIMARY KEY,
  donation_id INTEGER NOT NULL REFERENCES vaqf.donations(id) ON DELETE CASCADE,
  expense_ref VARCHAR(120),
  title VARCHAR(250) NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
  amount_try NUMERIC(14,2) NOT NULL DEFAULT 0,
  spent_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by VARCHAR(150),
  created_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.donation_spend_links IS 'Maqsadli (restricted/şartlı) hadyalar hisobidan qilingan xarajatlar bog''lamasi';

-- 2. KO'CHMAS MULK VA IJARA
CREATE TABLE IF NOT EXISTS vaqf.properties (
  id SERIAL PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(250) NOT NULL,
  kind VARCHAR(30) NOT NULL DEFAULT 'building'
    CHECK (kind IN ('building', 'land', 'apartment', 'shop', 'other')),
  address TEXT,
  city VARCHAR(100) DEFAULT 'İstanbul',
  district VARCHAR(100),
  parcel_ada VARCHAR(60),
  parcel_no VARCHAR(60),
  deed_date DATE,
  deed_no VARCHAR(80),
  share VARCHAR(60) DEFAULT 'Tam (1/1)',
  area_m2 NUMERIC(12,2),
  ownership VARCHAR(30) NOT NULL DEFAULT 'owned'
    CHECK (ownership IN ('owned', 'endowed', 'leased_in', 'usufruct')),
  acquisition_type VARCHAR(30) NOT NULL DEFAULT 'purchase'
    CHECK (acquisition_type IN ('purchase', 'donation', 'endowment')),
  donation_id INTEGER REFERENCES vaqf.donations(id) ON DELETE SET NULL,
  value NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
  value_try NUMERIC(16,2) NOT NULL DEFAULT 0,
  valuation_date DATE,
  usage VARCHAR(30) NOT NULL DEFAULT 'own_use'
    CHECK (usage IN ('own_use', 'leased_out', 'vacant', 'under_renovation')),
  institution_id INTEGER REFERENCES vaqf.institutions(id) ON DELETE SET NULL,
  insurance_until DATE,
  permit_until DATE,
  board_decision_id INTEGER,
  notes TEXT,
  created_by VARCHAR(150),
  created_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.properties IS 'Vaqf ko''chmas mulklari reestri (bino, yer, kvartira, do''kon) va tapu ma''lumotlari';

CREATE TABLE IF NOT EXISTS vaqf.property_documents (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES vaqf.properties(id) ON DELETE CASCADE,
  doc_type VARCHAR(40) NOT NULL DEFAULT 'tapu'
    CHECK (doc_type IN ('tapu', 'sigorta', 'iskan', 'vergi', 'ekspertiz', 'other')),
  title VARCHAR(250) NOT NULL,
  doc_no VARCHAR(80),
  doc_date DATE,
  valid_until DATE,
  file_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  notes TEXT,
  uploaded_by VARCHAR(150),
  uploaded_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.property_documents IS 'Ko''chmas mulk hujjatlari (tapu, sug''urta polisi, iskan, ekspertiza)';

-- vaqf.locations jadvaliga property_id ustunini qo'shish
ALTER TABLE vaqf.locations
  ADD COLUMN IF NOT EXISTS property_id INTEGER REFERENCES vaqf.properties(id) ON DELETE SET NULL;

-- Mavjud Mezana Akademiyasi bosh binosini ko'chmas mulk sifatida bog'lash
INSERT INTO vaqf.properties (
  code, name, kind, address, city, share, area_m2, ownership, acquisition_type,
  value, currency, value_try, usage, institution_id, notes, created_by_name
)
VALUES (
  'MLK-001',
  'Mezana Akademiyasi Bosh Binosi',
  'building',
  'İstanbul, Türkiye',
  'İstanbul',
  'Tam (1/1)',
  1200,
  'endowed',
  'endowment',
  45000000,
  'TRY',
  45000000,
  'own_use',
  1,
  'Ezan Vakfı tasarrufidagi asosiy o''quv binosi',
  'Tizim'
)
ON CONFLICT (code) DO NOTHING;

UPDATE vaqf.locations
SET property_id = (SELECT id FROM vaqf.properties WHERE code = 'MLK-001' LIMIT 1)
WHERE institution_id = 1 AND property_id IS NULL;

CREATE TABLE IF NOT EXISTS vaqf.leases (
  id SERIAL PRIMARY KEY,
  lease_no VARCHAR(40) NOT NULL UNIQUE,
  property_id INTEGER NOT NULL REFERENCES vaqf.properties(id) ON DELETE CASCADE,
  institution_id INTEGER REFERENCES vaqf.institutions(id) ON DELETE SET NULL,
  direction VARCHAR(10) NOT NULL DEFAULT 'out'
    CHECK (direction IN ('out', 'in')),
  counterparty_name VARCHAR(250) NOT NULL,
  counterparty_tax_or_id_encrypted TEXT,
  counterparty_tax_or_id_last4 VARCHAR(10),
  counterparty_phone_encrypted TEXT,
  counterparty_phone_last4 VARCHAR(10),
  counterparty_address_encrypted TEXT,
  kvkk_consent_at TIMESTAMPTZ,
  anonymized_at TIMESTAMPTZ,
  anonymized_by VARCHAR(150),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  monthly_rent NUMERIC(14,2) NOT NULL CHECK (monthly_rent >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
  monthly_rent_try NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_day INTEGER NOT NULL DEFAULT 5 CHECK (payment_day BETWEEN 1 AND 31),
  increase_rule VARCHAR(150) DEFAULT 'TÜFE (12 oylik o''rtacha)',
  annual_increase_date DATE,
  deposit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  deposit_status VARCHAR(20) NOT NULL DEFAULT 'held'
    CHECK (deposit_status IN ('held', 'returned', 'deducted', 'none')),
  contract_pdf_path TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'terminated')),
  terminated_reason TEXT,
  board_decision_id INTEGER,
  notes TEXT,
  created_by VARCHAR(150),
  created_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.leases IS 'Ko''chmas mulk ijara shartnomalari (out = vaqf ijaraga bergan, in = vaqf ijaraga olgan)';

CREATE INDEX IF NOT EXISTS idx_vaqf_leases_property ON vaqf.leases (property_id, status);
CREATE INDEX IF NOT EXISTS idx_vaqf_leases_end_date ON vaqf.leases (status, end_date);

CREATE TABLE IF NOT EXISTS vaqf.lease_payments (
  id SERIAL PRIMARY KEY,
  lease_id INTEGER NOT NULL REFERENCES vaqf.leases(id) ON DELETE CASCADE,
  period_month VARCHAR(7) NOT NULL,
  expected_date DATE NOT NULL,
  expected_amount NUMERIC(14,2) NOT NULL CHECK (expected_amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
  paid_date DATE,
  paid_amount NUMERIC(14,2) DEFAULT 0,
  income_ref VARCHAR(120),
  expense_ref VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue', 'partial', 'waived')),
  last_reminded_at TIMESTAMPTZ,
  notes TEXT,
  recorded_by VARCHAR(150),
  recorded_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lease_id, period_month)
);

COMMENT ON TABLE vaqf.lease_payments IS 'Ijara oylik to''lovlari jadvali va moliya tushum/xarajat bog''lamasi';

CREATE INDEX IF NOT EXISTS idx_vaqf_lease_payments_status ON vaqf.lease_payments (status, expected_date);

-- 3. SHARTNOMALAR VA HUJJATLAR ARXIVI
CREATE TABLE IF NOT EXISTS vaqf.archive_documents (
  id SERIAL PRIMARY KEY,
  doc_code VARCHAR(40) NOT NULL UNIQUE,
  title VARCHAR(250) NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'contract'
    CHECK (category IN ('charter', 'deed', 'contract', 'permit', 'tax', 'insurance', 'protocol', 'other')),
  counterparty VARCHAR(250),
  doc_date DATE,
  valid_until DATE,
  institution_id INTEGER REFERENCES vaqf.institutions(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES vaqf.properties(id) ON DELETE SET NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidentiality VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (confidentiality IN ('normal', 'restricted')),
  current_version INTEGER NOT NULL DEFAULT 1,
  file_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(120),
  schedule_id INTEGER REFERENCES vaqf.schedules(id) ON DELETE SET NULL,
  notes TEXT,
  uploaded_by VARCHAR(150),
  uploaded_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.archive_documents IS 'Vaqf huquqiy va rasmiy hujjatlar arxivi (ko''p versiyali va maxfiylik darajali)';

CREATE INDEX IF NOT EXISTS idx_vaqf_archive_cat_valid ON vaqf.archive_documents (category, valid_until);

CREATE TABLE IF NOT EXISTS vaqf.archive_document_versions (
  id SERIAL PRIMARY KEY,
  archive_doc_id INTEGER NOT NULL REFERENCES vaqf.archive_documents(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(120),
  change_note TEXT,
  uploaded_by VARCHAR(150),
  uploaded_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (archive_doc_id, version_no)
);

COMMENT ON TABLE vaqf.archive_document_versions IS 'Arxiv hujjatining barcha versiyalari tarixi (eski versiyalar o''chirilmaydi)';

CREATE TABLE IF NOT EXISTS vaqf.archive_access_logs (
  id SERIAL PRIMARY KEY,
  archive_doc_id INTEGER NOT NULL REFERENCES vaqf.archive_documents(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL DEFAULT 1,
  action VARCHAR(30) NOT NULL DEFAULT 'download',
  confidentiality VARCHAR(20) NOT NULL DEFAULT 'normal',
  user_ref VARCHAR(150) NOT NULL,
  user_name VARCHAR(200),
  user_role VARCHAR(40),
  ip_address VARCHAR(80),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.archive_access_logs IS 'Arxiv hujjatlarini (ayniqsa restricted) yuklab olish audit jurnali';

-- 4. YÖNETİM KURULU QARORLARI (KARAR DEFTERİ)
CREATE TABLE IF NOT EXISTS vaqf.board_members (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(200) NOT NULL,
  role_title VARCHAR(80) NOT NULL DEFAULT 'A''zo',
  user_ref VARCHAR(150),
  phone VARCHAR(60),
  email VARCHAR(150),
  term_start DATE,
  term_end DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.board_members IS 'Ezan Vakfı Yönetim Kurulu (boshqaruv kengashi) a''zolari';

CREATE TABLE IF NOT EXISTS vaqf.board_meetings (
  id SERIAL PRIMARY KEY,
  meeting_no VARCHAR(40) NOT NULL UNIQUE,
  meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  location VARCHAR(200) DEFAULT 'Ezan Vakfı المركز / Majlislar zali',
  attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
  agenda TEXT,
  protocol_pdf_path TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'completed'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes TEXT,
  created_by VARCHAR(150),
  created_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.board_meetings IS 'Yönetim Kurulu yig''ilishlari va bayonnomalari';

CREATE TABLE IF NOT EXISTS vaqf.board_decisions (
  id SERIAL PRIMARY KEY,
  decision_no VARCHAR(40) NOT NULL UNIQUE,
  meeting_id INTEGER REFERENCES vaqf.board_meetings(id) ON DELETE SET NULL,
  decision_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title VARCHAR(300) NOT NULL,
  body_text TEXT NOT NULL,
  vote_for INTEGER NOT NULL DEFAULT 0,
  vote_against INTEGER NOT NULL DEFAULT 0,
  vote_abstain INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'adopted', 'cancelled')),
  linked_entity JSONB NOT NULL DEFAULT '{}'::jsonb,
  signed_pdf_path TEXT,
  created_by VARCHAR(150),
  created_by_name VARCHAR(200),
  adopted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.board_decisions IS 'Yönetim Kurulu qarorlari (Karar Defteri)';

CREATE INDEX IF NOT EXISTS idx_vaqf_board_decisions_date ON vaqf.board_decisions (decision_date DESC, status);

-- vaqf.documents jadvaliga board_decision_id ustunini qo'shish (3-bosqich bilan bog'lash uchun)
ALTER TABLE vaqf.documents
  ADD COLUMN IF NOT EXISTS board_decision_id INTEGER REFERENCES vaqf.board_decisions(id) ON DELETE SET NULL;

-- 5. VAQF.SCHEDULES JADVALINI KO'CHMAS MULK, IJARA VA ARXIV UCHUN KENGAYTIRISH
ALTER TABLE vaqf.schedules
  ADD COLUMN IF NOT EXISTS property_id INTEGER REFERENCES vaqf.properties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lease_id INTEGER REFERENCES vaqf.leases(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS archive_doc_id INTEGER REFERENCES vaqf.archive_documents(id) ON DELETE CASCADE;

ALTER TABLE vaqf.schedules DROP CONSTRAINT IF EXISTS vaqf_schedules_target_check;
ALTER TABLE vaqf.schedules DROP CONSTRAINT IF EXISTS schedules_kind_check;
ALTER TABLE vaqf.schedules ADD CONSTRAINT schedules_kind_check
  CHECK (kind IN (
    'warranty', 'inspection', 'maintenance', 'insurance', 'license',
    'certificate', 'lease_expiry', 'lease_payment', 'lease_increase',
    'archive_expiry', 'property_insurance', 'other'
  ));

-- 6. BOSHQARUV AUDIT JURNALI (vaqf.governance_events)
CREATE TABLE IF NOT EXISTS vaqf.governance_events (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(40) NOT NULL,
  entity_id INTEGER NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  actor_ref VARCHAR(150),
  actor_name VARCHAR(200),
  summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vaqf.governance_events IS 'Vaqf 5-bosqich (hadyalar, ko''chmas mulk, ijara, arxiv, kurul qarorlari, KVKK) tarix va audit jurnali';

CREATE INDEX IF NOT EXISTS idx_vaqf_gov_events_entity ON vaqf.governance_events (entity_type, entity_id, created_at DESC);

-- 7. SOZLANADIGAN SHABLONLAR VA QOIDALAR (MUHASIB TASDIQLASHI KERAK)
INSERT INTO vaqf.settings (key, value, updated_by_name)
VALUES
  (
    'donation_receipt_template',
    '{
      "status_notice": "MUHASIB TASDIQLASHI KERAK",
      "foundation_name": "EZAN VAKFI",
      "title_tr": "BAĞIŞ MAKBUZU",
      "title_uz": "HADYA QABUL KVITANSIYASI (BAĞIŞ MAKBUZU)",
      "legal_note_tr": "MUHASIB TASDIQLASHI KERAK: Vakıflar Genel Müdürlüğü / Vergi Muafiyeti ve Resmi Makbuz Seri/Sıra Bilgileri muhasebeci tarafından onaylanmalıdır.",
      "legal_note_uz": "MUHASIB TASDIQLASHI KERAK: Vaqf muhasibi tomonidan rasmiy kvitansiya seriyasi va huquqiy matni tasdiqlanishi lozim.",
      "show_donor_tax_last4": true,
      "signature_left_tr": "Bağışı Teslim Eden (Hadya qiluvchi)",
      "signature_right_tr": "Vakıf Yetkilisi / Muhasebe (Qabul qiluvchi)"
    }'::jsonb,
    'Tizim'
  ),
  (
    'lease_finance_mapping',
    '{
      "status_notice": "MUHASIB TASDIQLASHI KERAK",
      "rent_income_category_name": "Ijara tushumi (Kira Geliri) — MUHASIB TASDIQLASHI KERAK",
      "rent_expense_category_name": "Ijara xarajati (Kira Gideri) — MUHASIB TASDIQLASHI KERAK",
      "default_increase_rule": "TÜFE 12 Aylık Ortalama — MUHASIB TASDIQLASHI KERAK",
      "expiry_remind_days": [60, 30]
    }'::jsonb,
    'Tizim'
  ),
  (
    'board_decision_rules',
    '{
      "status_notice": "MUHASIB va kurul tasdiqlashi kerak",
      "writeoff_above_threshold": "recommended",
      "writeoff_threshold_try": 50000,
      "property_transaction": "recommended",
      "lease_contract": "recommended",
      "restricted_donation_acceptance": "recommended",
      "inter_institution_transfer": "recommended"
    }'::jsonb,
    'Tizim'
  ),
  (
    'annual_report_template',
    '{
      "status_notice": "MUHASIB TASDIQLASHI KERAK",
      "title_tr": "EZAN VAKFI YILLIK FAALİYET VE MALİ RAPORU",
      "title_uz": "EZAN VAKFI YILLIK FAOLIYAT VA MULK HISOBOTI",
      "accountant_disclaimer": "MUHASIB TASDIQLASHI KERAK: Ushbu hisobot shakli va VGM (Vakıflar Genel Müdürlüğü) beyanname bandlari vaqf muhasibi tomonidan rasmiy tasdiqlanishi shart.",
      "sections": [
        {"code": "general_info", "enabled": true, "title_tr": "1. Vakıf Genel Bilgileri, Kurumlar ve Yönetim Kurulu", "title_uz": "1. Vaqf umumiy ma''lumotlari, muassasalar va Yönetim Kurulu tarkibi"},
        {"code": "real_estate", "enabled": true, "title_tr": "2. Gayrimenkul (Taşınmaz) Listesi ve Kullanım Durumu", "title_uz": "2. Ko''chmas mulk ro''yxati, qiymati va foydalanish holati"},
        {"code": "inventory_summary", "enabled": true, "title_tr": "3. Demirbaş ve Envanter Özeti", "title_uz": "3. Asosiy vositalar (jihozlar) yig''ma jadvali"},
        {"code": "donations_summary", "enabled": true, "title_tr": "4. Bağışlar (Nakit, Ayni, Şartlı Bağışlar)", "title_uz": "4. Hadyalar: pul, buyum va maqsadli hadyalar sarflanishi"},
        {"code": "leases_summary", "enabled": true, "title_tr": "5. Kira Sözleşmeleri ve Kira Gelir/Giderleri", "title_uz": "5. Ijara shartnomalari va ijara tushumi/xarajati"},
        {"code": "finance_summary", "enabled": true, "title_tr": "6. Kurumlar Bazında Gelir ve Gider Özeti", "title_uz": "6. Muassasalar kesimida daromad va xarajatlar xulosasi"},
        {"code": "board_decisions", "enabled": true, "title_tr": "7. Yönetim Kurulu Kararları Özeti", "title_uz": "7. Yönetim Kurulu qarorlari ro''yxati"}
      ]
    }'::jsonb,
    'Tizim'
  )
ON CONFLICT (key) DO NOTHING;
