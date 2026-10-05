-- 003: repair_tickets에 자재비 상세 내역 및 결제 방식 컬럼 추가
-- Supabase SQL Editor에서 실행

ALTER TABLE repair_tickets
  ADD COLUMN IF NOT EXISTS material_cost_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_method        VARCHAR;

COMMENT ON COLUMN repair_tickets.material_cost_details IS '자재비 상세 내역 (비용내용, 금액의 배열)';
COMMENT ON COLUMN repair_tickets.payment_method        IS '결제 방식 (CARD, BANK_TRANSFER, E_PAYMENT)';
