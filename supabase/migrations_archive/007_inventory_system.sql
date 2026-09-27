-- =============================================================
-- 007: 계층형 재고 관리 시스템
-- 참조 테이블(categories → specs → products) + inventory_items
-- IF NOT EXISTS 가드 적용 — 재실행 안전
-- =============================================================


-- =============================================
-- 1. Enum 타입 생성
-- =============================================

DO $$ BEGIN
  CREATE TYPE item_condition AS ENUM ('NEW', 'USED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================
-- 2. 계층형 참조 테이블 (관리자 CRUD 가능)
-- =============================================

-- 2.1 카테고리 (최상위)
CREATE TABLE IF NOT EXISTS inventory_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventory_categories IS '재고 분류 카테고리 (RAM, 저장장치, 배터리, 액정 등)';

-- 2.2 스펙 (카테고리 하위)
CREATE TABLE IF NOT EXISTS inventory_specs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID         NOT NULL REFERENCES inventory_categories(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (category_id, name)
);

COMMENT ON TABLE inventory_specs IS '카테고리별 세부 스펙 (예: DDR4-pc, NVMe SSD 등)';

-- 2.3 제품 (스펙 하위)
CREATE TABLE IF NOT EXISTS inventory_products (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id    UUID         NOT NULL REFERENCES inventory_specs(id) ON DELETE CASCADE,
  name       VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (spec_id, name)
);

COMMENT ON TABLE inventory_products IS '스펙별 실제 제품 (예: 삼성915m, SK하이닉스 등)';


-- =============================================
-- 3. inventory_items 테이블
-- =============================================

CREATE TABLE IF NOT EXISTS inventory_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id    UUID           NOT NULL REFERENCES inventory_categories(id) ON DELETE RESTRICT,
  spec_id        UUID           NOT NULL REFERENCES inventory_specs(id)      ON DELETE RESTRICT,
  product_id     UUID           NOT NULL REFERENCES inventory_products(id)   ON DELETE RESTRICT,
  capacity       VARCHAR(50),                          -- 용량 또는 인치수 (예: '8GB', '15.6"')
  condition      item_condition NOT NULL DEFAULT 'NEW',
  quantity       INTEGER        NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  base_estimate  INTEGER        NOT NULL DEFAULT 0 CHECK (base_estimate >= 0),  -- 기초견적 (원)
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now()
);

COMMENT ON TABLE  inventory_items               IS '재고 아이템 마스터 테이블';
COMMENT ON COLUMN inventory_items.capacity       IS '용량/인치수 (예: 8GB, 256GB, 15.6인치)';
COMMENT ON COLUMN inventory_items.condition      IS '아이템 상태 (NEW: 신품, USED: 중고품)';
COMMENT ON COLUMN inventory_items.base_estimate  IS '기초견적 금액 (원)';

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_inventory_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON inventory_items;
CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_items_updated_at();


-- =============================================
-- 4. 인덱스
-- =============================================

CREATE INDEX IF NOT EXISTS idx_inv_categories_name     ON inventory_categories(name);

CREATE INDEX IF NOT EXISTS idx_inv_specs_category_id   ON inventory_specs(category_id);
CREATE INDEX IF NOT EXISTS idx_inv_specs_name          ON inventory_specs(name);

CREATE INDEX IF NOT EXISTS idx_inv_products_spec_id    ON inventory_products(spec_id);
CREATE INDEX IF NOT EXISTS idx_inv_products_name       ON inventory_products(name);

CREATE INDEX IF NOT EXISTS idx_inv_items_category_id   ON inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_spec_id       ON inventory_items(spec_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_product_id    ON inventory_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_condition     ON inventory_items(condition);


-- =============================================
-- 5. Row Level Security (RLS)
-- =============================================

-- ----- 5.1 inventory_categories RLS (ADMIN 전용) -----
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_categories_select ON inventory_categories;
CREATE POLICY inv_categories_select ON inventory_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS inv_categories_insert ON inventory_categories;
CREATE POLICY inv_categories_insert ON inventory_categories
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS inv_categories_update ON inventory_categories;
CREATE POLICY inv_categories_update ON inventory_categories
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS inv_categories_delete ON inventory_categories;
CREATE POLICY inv_categories_delete ON inventory_categories
  FOR DELETE TO authenticated
  USING (get_my_role() = 'ADMIN');

-- ----- 5.2 inventory_specs RLS (ADMIN 전용) -----
ALTER TABLE inventory_specs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_specs_select ON inventory_specs;
CREATE POLICY inv_specs_select ON inventory_specs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS inv_specs_insert ON inventory_specs;
CREATE POLICY inv_specs_insert ON inventory_specs
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS inv_specs_update ON inventory_specs;
CREATE POLICY inv_specs_update ON inventory_specs
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS inv_specs_delete ON inventory_specs;
CREATE POLICY inv_specs_delete ON inventory_specs
  FOR DELETE TO authenticated
  USING (get_my_role() = 'ADMIN');

-- ----- 5.3 inventory_products RLS (ADMIN 전용) -----
ALTER TABLE inventory_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_products_select ON inventory_products;
CREATE POLICY inv_products_select ON inventory_products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS inv_products_insert ON inventory_products;
CREATE POLICY inv_products_insert ON inventory_products
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS inv_products_update ON inventory_products;
CREATE POLICY inv_products_update ON inventory_products
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS inv_products_delete ON inventory_products;
CREATE POLICY inv_products_delete ON inventory_products
  FOR DELETE TO authenticated
  USING (get_my_role() = 'ADMIN');

-- ----- 5.4 inventory_items RLS (ADMIN/MANAGER) -----
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_items_select ON inventory_items;
CREATE POLICY inv_items_select ON inventory_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS inv_items_insert ON inventory_items;
CREATE POLICY inv_items_insert ON inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('ADMIN', 'MANAGER'));

DROP POLICY IF EXISTS inv_items_update ON inventory_items;
CREATE POLICY inv_items_update ON inventory_items
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('ADMIN', 'MANAGER'));

DROP POLICY IF EXISTS inv_items_delete ON inventory_items;
CREATE POLICY inv_items_delete ON inventory_items
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('ADMIN', 'MANAGER'));
