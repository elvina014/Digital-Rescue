-- =============================================
-- 011_return_material_tracking.sql
-- 고객 기기 적출품(반환 자재) 관리 프로세스
-- ticket_materials에 반환 관련 컬럼 추가
-- =============================================

-- 1. 반환 등록 여부
ALTER TABLE ticket_materials
  ADD COLUMN IF NOT EXISTS is_return_registered BOOLEAN NOT NULL DEFAULT false;

-- 2. 반환 자재 사양
ALTER TABLE ticket_materials
  ADD COLUMN IF NOT EXISTS return_spec TEXT;

-- 3. 반환 자재 제품명
ALTER TABLE ticket_materials
  ADD COLUMN IF NOT EXISTS return_name TEXT;

-- 4. 반환 자재 상태 (중고품/불량품)
ALTER TABLE ticket_materials
  ADD COLUMN IF NOT EXISTS return_condition TEXT
  CHECK (return_condition IS NULL OR return_condition IN ('중고품', '불량품'));

-- 5. 반환 승인 상태
ALTER TABLE ticket_materials
  ADD COLUMN IF NOT EXISTS return_status TEXT
  CHECK (return_status IS NULL OR return_status IN ('pending', 'approved', 'rejected'));

COMMENT ON COLUMN ticket_materials.is_return_registered IS '적출/반환 자재 등록 여부';
COMMENT ON COLUMN ticket_materials.return_spec          IS '반환 자재 사양 (적출된 부품의 스펙)';
COMMENT ON COLUMN ticket_materials.return_name          IS '반환 자재 제품명';
COMMENT ON COLUMN ticket_materials.return_condition     IS '반환 자재 상태: 중고품, 불량품';
COMMENT ON COLUMN ticket_materials.return_status        IS '반환 입고 승인 상태: pending(대기), approved(승인), rejected(거부)';

-- 6. 인덱스
CREATE INDEX IF NOT EXISTS idx_ticket_materials_return_status
  ON ticket_materials(return_status)
  WHERE is_return_registered = true;
