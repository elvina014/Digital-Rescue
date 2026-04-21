-- =============================================
-- 015_return_material_quantity.sql
-- ticket_materials에 반환 자재 수량 컬럼 추가
-- =============================================

ALTER TABLE ticket_materials
  ADD COLUMN IF NOT EXISTS return_quantity INTEGER NOT NULL DEFAULT 1
  CHECK (return_quantity > 0);

COMMENT ON COLUMN ticket_materials.return_quantity IS '적출/반환 자재 수량 (기본값 1)';
