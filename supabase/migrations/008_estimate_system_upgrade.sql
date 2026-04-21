-- =============================================================
-- 008: 견적 시스템 고도화
-- global_settings + repair_tickets 컬럼 추가 + ticket_materials
-- IF NOT EXISTS 가드 적용 — 재실행 안전
-- =============================================================


-- =============================================
-- 1. Enum: 기기 유형
-- =============================================

DO $$ BEGIN
  CREATE TYPE device_type AS ENUM (
    '노트북',
    '데스크탑',
    '서버',
    '나스',
    '기타저장장치'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================
-- 2. Enum: 자재 요청 상태
-- =============================================

DO $$ BEGIN
  CREATE TYPE material_request_status AS ENUM (
    'pending',    -- 대기
    'requested',  -- 요청중
    'approved'    -- 승인완료
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================
-- 3. global_settings 테이블 (단일 row)
-- =============================================

CREATE TABLE IF NOT EXISTS global_settings (
  id                      BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE), -- 단일 row 강제
  base_service_cost       NUMERIC NOT NULL DEFAULT 0,        -- 기본 서비스 비용
  value_reference_amount  NUMERIC NOT NULL DEFAULT 0,        -- 가치 기준 금액
  discount_surcharge_rate NUMERIC NOT NULL DEFAULT 100,      -- 할인/할증 비율 (%)
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  global_settings                        IS '시스템 전역 설정 (단일 row)';
COMMENT ON COLUMN global_settings.base_service_cost      IS '기본 서비스 비용 (원)';
COMMENT ON COLUMN global_settings.value_reference_amount IS '가치 기준 금액 (원)';
COMMENT ON COLUMN global_settings.discount_surcharge_rate IS '할인/할증 비율 (%, 기본 100)';

-- 기본 row 삽입 (없으면)
INSERT INTO global_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;


-- =============================================
-- 4. repair_tickets 컬럼 추가
-- =============================================

-- device_type (기기 유형, 기본값 '노트북')
DO $$ BEGIN
  ALTER TABLE repair_tickets ADD COLUMN device_type device_type NOT NULL DEFAULT '노트북';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- evaluated_value (가치평가금액)
DO $$ BEGIN
  ALTER TABLE repair_tickets ADD COLUMN evaluated_value NUMERIC DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- minimum_estimate (최소견적금액)
DO $$ BEGIN
  ALTER TABLE repair_tickets ADD COLUMN minimum_estimate NUMERIC DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- confirmed_estimate (확정예상견적)
DO $$ BEGIN
  ALTER TABLE repair_tickets ADD COLUMN confirmed_estimate NUMERIC DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;


-- =============================================
-- 5. ticket_materials 테이블 (수리건별 사용 재고)
-- =============================================

CREATE TABLE IF NOT EXISTS ticket_materials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id         UUID NOT NULL REFERENCES repair_tickets(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity          INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  request_status    material_request_status NOT NULL DEFAULT 'pending',
  notes             TEXT,
  created_by        UUID REFERENCES employees(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  ticket_materials                IS '수리건별 사용 재고 (자재 요청/승인 관리)';
COMMENT ON COLUMN ticket_materials.request_status IS '자재 요청 상태: pending(대기), requested(요청중), approved(승인완료)';

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_ticket_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_materials_updated_at ON ticket_materials;
CREATE TRIGGER trg_ticket_materials_updated_at
  BEFORE UPDATE ON ticket_materials
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_materials_updated_at();


-- =============================================
-- 6. 인덱스
-- =============================================

CREATE INDEX IF NOT EXISTS idx_ticket_materials_ticket_id   ON ticket_materials(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_materials_item_id     ON ticket_materials(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_ticket_materials_status      ON ticket_materials(request_status);
CREATE INDEX IF NOT EXISTS idx_repair_tickets_device_type   ON repair_tickets(device_type);


-- =============================================
-- 7. Row Level Security (RLS)
-- =============================================

-- ----- 7.1 global_settings RLS -----
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS global_settings_select ON global_settings;
CREATE POLICY global_settings_select ON global_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS global_settings_update ON global_settings;
CREATE POLICY global_settings_update ON global_settings
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'ADMIN');

-- ----- 7.2 ticket_materials RLS -----
ALTER TABLE ticket_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_materials_select ON ticket_materials;
CREATE POLICY ticket_materials_select ON ticket_materials
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ticket_materials_insert ON ticket_materials;
CREATE POLICY ticket_materials_insert ON ticket_materials
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('ADMIN', 'MANAGER', 'TECHNICIAN'));

DROP POLICY IF EXISTS ticket_materials_update ON ticket_materials;
CREATE POLICY ticket_materials_update ON ticket_materials
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('ADMIN', 'MANAGER'));

DROP POLICY IF EXISTS ticket_materials_delete ON ticket_materials;
CREATE POLICY ticket_materials_delete ON ticket_materials
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('ADMIN', 'MANAGER'));
