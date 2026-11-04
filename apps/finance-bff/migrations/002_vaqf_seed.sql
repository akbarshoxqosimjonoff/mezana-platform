-- =============================================================================
-- 002_vaqf_seed.sql
-- Boshlang'ich ma'lumotlar: Mezana Akademiyasi (MZN), asosiy binolar/qavatlar va kategoriyalar
-- =============================================================================

-- 1. Muassasa: Mezana Akademiyasi (MZN)
INSERT INTO vaqf.institutions (name, code, address, notes, external_refs)
VALUES (
  'Mezana Akademiyasi',
  'MZN',
  'Istanbul, Turkiya',
  'Ezan Vakf? tasarrufidagi Mezana Akademiyasi',
  '{"erpBranchId": "main-office", "crmStudyPlace": "Akademiya"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  external_refs = vaqf.institutions.external_refs || EXCLUDED.external_refs,
  updated_at = NOW();

-- 2. Asosiy bino, ombor va tashqi hudud
DO $$
DECLARE
  v_inst_id INTEGER;
  v_bldg_id INTEGER;
BEGIN
  SELECT id INTO v_inst_id FROM vaqf.institutions WHERE code = 'MZN' LIMIT 1;
  IF v_inst_id IS NOT NULL THEN
    INSERT INTO vaqf.locations (institution_id, parent_id, kind, name, code, external_ref, sort_order)
    VALUES
      (v_inst_id, NULL, 'building', 'Asosiy o''quv va yotoqxona binosi', 'MZN-BLD-1', 'mzn:building:main', 10),
      (v_inst_id, NULL, 'storage', 'Asosiy omborxona', 'MZN-STR-1', 'mzn:storage:main', 80),
      (v_inst_id, NULL, 'outdoor', 'Hovli va tashqi hudud', 'MZN-OUT-1', 'mzn:outdoor:yard', 90)
    ON CONFLICT (external_ref) DO NOTHING;

    SELECT id INTO v_bldg_id FROM vaqf.locations WHERE external_ref = 'mzn:building:main' LIMIT 1;
    IF v_bldg_id IS NOT NULL THEN
      INSERT INTO vaqf.locations (institution_id, parent_id, kind, name, code, external_ref, sort_order)
      VALUES
        (v_inst_id, v_bldg_id, 'floor', '1-qavat', 'Q1', 'mzn:floor:1', 1),
        (v_inst_id, v_bldg_id, 'floor', '2-qavat', 'Q2', 'mzn:floor:2', 2),
        (v_inst_id, v_bldg_id, 'floor', '3-qavat', 'Q3', 'mzn:floor:3', 3),
        (v_inst_id, v_bldg_id, 'floor', '4-qavat', 'Q4', 'mzn:floor:4', 4),
        (v_inst_id, v_bldg_id, 'floor', '5-qavat', 'Q5', 'mzn:floor:5', 5),
        (v_inst_id, v_bldg_id, 'floor', '6-qavat', 'Q6', 'mzn:floor:6', 6)
      ON CONFLICT (external_ref) DO NOTHING;
    END IF;
  END IF;
END $$;

-- 3. Mulk kategoriyalari daraxti (11 ta asosiy kategoriya + ichki kategoriyalar)
INSERT INTO vaqf.asset_categories (parent_id, name, code, tracking, default_unit, description, sort_order)
VALUES
  (NULL, 'Mebel', 'CAT-FURN', 'batch', 'dona', 'Parta, stol, stul, shkaf, karavot, javon va boshqa mebellar', 10),
  (NULL, 'Elektronika', 'CAT-ELEC', 'individual', 'dona', 'Proyektor, ekran, audio tizim, televizor va boshqa elektron jihozlar', 20),
  (NULL, 'Kompyuter texnikasi', 'CAT-COMP', 'individual', 'dona', 'Noutbuk, statsionar kompyuter, monitor, printer, skaner, tarmoq qurilmalari', 30),
  (NULL, 'Oshxona jihozi', 'CAT-KITCH', 'batch', 'dona', 'Sanoat plitasi, qozon, idish-tovoq, oshxona stoli va jihozlari', 40),
  (NULL, 'Maishiy texnika', 'CAT-APPL', 'individual', 'dona', 'Muzlatgich, kir yuvish mashinasi, konditsioner, changyutgich, isitgich', 50),
  (NULL, 'Kitob va qo''llanma', 'CAT-BOOK', 'batch', 'dona', 'Darsliklar, kutubxona kitoblari, mushaflar va o''quv qo''llanmalar', 60),
  (NULL, 'Sport jihozi', 'CAT-SPORT', 'batch', 'dona', 'Trenajyor, stol tennisi, to''plar, matraslar va sport anjomlari', 70),
  (NULL, 'Kamera va xavfsizlik', 'CAT-SEC', 'individual', 'dona', 'Kuzatuv kameralari (CCTV), NVR, turniket, ZKTeco terminallari, yong''in xavfsizligi', 80),
  (NULL, 'Transport', 'CAT-TRANS', 'individual', 'dona', 'Xizmat avtomobillari, mikroavtobus va boshqa transport vositalari', 90),
  (NULL, 'Ko''chmas mulk', 'CAT-REAL', 'individual', 'dona', 'Bino, yer maydoni va inshootlar', 100),
  (NULL, 'Boshqa', 'CAT-OTHER', 'batch', 'dona', 'Yotoq anjomlari, gilam, parda, xo''jalik buyumlari va boshqalar', 110)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  tracking = EXCLUDED.tracking,
  default_unit = EXCLUDED.default_unit,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Ichki (sub) kategoriyalar
DO $$
DECLARE
  v_furn INTEGER;
  v_comp INTEGER;
  v_kitch INTEGER;
  v_other INTEGER;
BEGIN
  SELECT id INTO v_furn FROM vaqf.asset_categories WHERE code = 'CAT-FURN';
  SELECT id INTO v_comp FROM vaqf.asset_categories WHERE code = 'CAT-COMP';
  SELECT id INTO v_kitch FROM vaqf.asset_categories WHERE code = 'CAT-KITCH';
  SELECT id INTO v_other FROM vaqf.asset_categories WHERE code = 'CAT-OTHER';

  IF v_furn IS NOT NULL THEN
    INSERT INTO vaqf.asset_categories (parent_id, name, code, tracking, default_unit, description, sort_order)
    VALUES
      (v_furn, 'O''quv parta va stullari', 'CAT-FURN-DESK', 'batch', 'dona', 'Sinf xonalari uchun parta va stullar', 11),
      (v_furn, 'Yotoqxona karavot va shkaflari', 'CAT-FURN-BED', 'batch', 'dona', 'Yotoqxona uchun ikki qavatli karavot, shkaf va tumbochkalar', 12),
      (v_furn, 'Ofis stol va kreslolari', 'CAT-FURN-OFFICE', 'individual', 'dona', 'Rahbariyat va o''qituvchilar xonasi mebellari', 13)
    ON CONFLICT (code) DO NOTHING;
  END IF;

  IF v_comp IS NOT NULL THEN
    INSERT INTO vaqf.asset_categories (parent_id, name, code, tracking, default_unit, description, sort_order)
    VALUES
      (v_comp, 'Noutbuk va kompyuterlar', 'CAT-COMP-PC', 'individual', 'dona', 'Noutbuk, monoblok va tizim bloklari', 31),
      (v_comp, 'Printer va nusxa ko''chirish', 'CAT-COMP-PRINT', 'individual', 'dona', 'Printer, MFP va skanerlar', 32),
      (v_comp, 'Tarmoq qurilmalari (Wi-Fi / Switch)', 'CAT-COMP-NET', 'individual', 'dona', 'Router, kommutator va Wi-Fi nuqtalari', 33)
    ON CONFLICT (code) DO NOTHING;
  END IF;

  IF v_kitch IS NOT NULL THEN
    INSERT INTO vaqf.asset_categories (parent_id, name, code, tracking, default_unit, description, sort_order)
    VALUES
      (v_kitch, 'Sanoat oshxona texnikasi', 'CAT-KITCH-IND', 'individual', 'dona', 'Katta qozon, pech, idish yuvish mashinasi', 41),
      (v_kitch, 'Idish-tovoq va oshxona anjomlari', 'CAT-KITCH-WARE', 'batch', 'dona', 'Likopcha, qoshiq, patnis, choynaklar', 42)
    ON CONFLICT (code) DO NOTHING;
  END IF;

  IF v_other IS NOT NULL THEN
    INSERT INTO vaqf.asset_categories (parent_id, name, code, tracking, default_unit, description, sort_order)
    VALUES
      (v_other, 'Yotoq anjomlari (matras, ko''rpa, yostiq)', 'CAT-OTHER-BEDDING', 'batch', 'komplekt', 'Talabalar yotoqxonasi uchun ko''rpa-to''shaklar', 111),
      (v_other, 'Gilam va pardalar', 'CAT-OTHER-CARPET', 'batch', 'dona', 'Masjid, koridor va xonalar uchun gilam hamda pardalar', 112)
    ON CONFLICT (code) DO NOTHING;
  END IF;
END $$;
