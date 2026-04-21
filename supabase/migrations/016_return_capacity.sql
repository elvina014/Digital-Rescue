-- Migration: 016_return_capacity.sql
-- 적출/반환 자재 등록 시 용량(capacity) 정보를 저장하기 위한 컬럼 추가

ALTER TABLE ticket_materials
  ADD COLUMN IF NOT EXISTS return_capacity TEXT;

COMMENT ON COLUMN ticket_materials.return_capacity IS '적출품 등록 시 선택한 재고 아이템의 용량 (예: 256GB, 128GB)';
