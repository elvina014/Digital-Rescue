-- =============================================
-- 009_approve_material_rpc.sql
-- 자재 출고 승인 RPC (트랜잭션 원자성 보장)
-- ticket_materials 상태 변경 + inventory_items 수량 차감을 단일 트랜잭션으로 처리
-- =============================================

CREATE OR REPLACE FUNCTION approve_material_dispatch(
  p_material_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id   UUID;
  v_quantity  INTEGER;
  v_status    TEXT;
  v_inv_qty   INTEGER;
BEGIN
  -- 1) ticket_materials 조회
  SELECT inventory_item_id, quantity, request_status
    INTO v_item_id, v_quantity, v_status
    FROM ticket_materials
   WHERE id = p_material_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '자재 요청을 찾을 수 없습니다.');
  END IF;

  IF v_status <> 'requested' THEN
    RETURN jsonb_build_object('error', '출고 요청 상태가 아닙니다. (현재: ' || v_status || ')');
  END IF;

  -- 2) 재고 수량 확인
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

  -- 3) 재고 차감
  UPDATE inventory_items
     SET quantity   = quantity - v_quantity,
         updated_at = now()
   WHERE id = v_item_id;

  -- 4) ticket_materials 승인 처리
  UPDATE ticket_materials
     SET request_status = 'approved',
         updated_at     = now()
   WHERE id = p_material_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION approve_material_dispatch IS '자재 출고 승인: 재고 차감 + 상태 변경을 트랜잭션으로 처리';
