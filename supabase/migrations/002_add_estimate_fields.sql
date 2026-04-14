-- 002: repair_tickets에 예상 견적 및 자재비 컬럼 추가
-- Supabase SQL Editor에서 실행

ALTER TABLE repair_tickets
  ADD COLUMN IF NOT EXISTS expected_estimate INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_cost     INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN repair_tickets.expected_estimate IS '예상 견적 (기사가 고객과 조율한 수리 예상 금액)';
COMMENT ON COLUMN repair_tickets.material_cost     IS '자재비 (수리에 사용된 부품 구매 금액)';
