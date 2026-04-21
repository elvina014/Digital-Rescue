-- =============================================
-- 010_purchase_request_type.sql
-- ticket_materials에 request_type 컬럼 추가 (출고 요청 vs 구매 요청 구분)
-- approve_material_dispatch RPC 업데이트 (구매 요청 시 재고 차감 건너뜀)
-- =============================================

-- 1. request_type 컬럼 추가
ALTER TABLE ticket_materials
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'dispatch'
  CHECK (request_type IN ('dispatch', 'purchase'));

COMMENT ON COLUMN ticket_materials.request_type IS '요청 유형: dispatch(출고 요청 — 재고 차감), purchase(구매 요청 — 재고 차감 없음)';

-- 2. approve_material_dispatch RPC 업데이트 (구매 요청 시 재고 차감 건너뜀)
CREATE OR REPLACE FUNCTION approve_material_dispatch(
  p_material_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id      UUID;
  v_quantity     INTEGER;
  v_status       TEXT;
  v_request_type TEXT;
  v_inv_qty      INTEGER;
BEGIN
  -- 1) ticket_materials 조회
  SELECT inventory_item_id, quantity, request_status, request_type
    INTO v_item_id, v_quantity, v_status, v_request_type
    FROM ticket_materials
   WHERE id = p_material_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '자재 요청을 찾을 수 없습니다.');
  END IF;

  IF v_status <> 'requested' THEN
    RETURN jsonb_build_object('error', '출고 요청 상태가 아닙니다. (현재: ' || v_status || ')');
  END IF;

  -- 2) 출고 요청(dispatch)만 재고 차감
  IF v_request_type = 'dispatch' THEN
    SELECT quantity INTO v_inv_qty
      FROM inventory_items
     WHERE id = v_item_id
       FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', '재고 아이템을 찾을 수 없습니다.');
    END IF;

    IF v_inv_qty < v_quantity THEN
      RETURN jsonb_build_object('error', '재고 부족 (현재 ' || v_inv_qty || '개, 요청 ' || v_quantity || '개)');
    END IF;

    UPDATE inventory_items
       SET quantity   = quantity - v_quantity,
           updated_at = now()
     WHERE id = v_item_id;
  END IF;
  -- purchase 타입은 재고 차감 건너뜀

  -- 3) ticket_materials 승인 처리
  UPDATE ticket_materials
     SET request_status = 'approved',
         updated_at     = now()
   WHERE id = p_material_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION approve_material_dispatch IS '자재 승인: dispatch=재고차감+승인, purchase=승인만 처리';

-- 3. material_request_status enum에 rejected, cancelled, cancel_requested 추가
ALTER TYPE material_request_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE material_request_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE material_request_status ADD VALUE IF NOT EXISTS 'cancel_requested';

-- 4. cancel_material_dispatch RPC (출고 취소: 재고 복구 + 상태 변경)
CREATE OR REPLACE FUNCTION cancel_material_dispatch(
  p_material_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id      UUID;
  v_quantity     INTEGER;
  v_status       TEXT;
  v_request_type TEXT;
BEGIN
  -- 1) ticket_materials 조회
  SELECT inventory_item_id, quantity, request_status, request_type
    INTO v_item_id, v_quantity, v_status, v_request_type
    FROM ticket_materials
   WHERE id = p_material_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '자재 요청을 찾을 수 없습니다.');
  END IF;

  IF v_status <> 'approved' THEN
    RETURN jsonb_build_object('error', '승인 상태가 아닌 항목은 취소할 수 없습니다. (현재: ' || v_status || ')');
  END IF;

  -- 2) 출고 요청(dispatch)만 재고 복구 (구매 요청은 차감된 적 없으므로 건너뜀)
  IF v_request_type = 'dispatch' THEN
    UPDATE inventory_items
       SET quantity   = quantity + v_quantity,
           updated_at = now()
     WHERE id = v_item_id;
  END IF;

  -- 3) ticket_materials 취소 처리
  UPDATE ticket_materials
     SET request_status = 'cancelled',
         updated_at     = now()
   WHERE id = p_material_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION cancel_material_dispatch IS '자재 취소: dispatch=재고복구+취소, purchase=취소만 처리';

-- 5. PostgREST 스키마 캐시 갱신 (새 함수 인식)
NOTIFY pgrst, 'reload schema';
