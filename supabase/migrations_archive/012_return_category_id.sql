-- =============================================================
-- 012: 적출품 반환 시 카테고리 ID 저장 컬럼 추가
-- return_category_id: 기사가 선택한 반환 자재의 카테고리 참조
-- =============================================================

ALTER TABLE ticket_materials
  ADD COLUMN IF NOT EXISTS return_category_id UUID REFERENCES inventory_categories(id);
