-- =============================================
-- 014_approve_material_rpc_with_tx.sql
-- approve_material_dispatch RPC에 inventory_transactions OUTBOUND 기록 추가
-- (013_inventory_transactions.sql 실행 후 실행할 것)
-- =============================================

-- 기존 오버로드 함수 제거 (파라미터 목록이 달라 CREATE OR REPLACE 불가)
DROP FUNCTION IF EXISTS approve_material_dispatch(UUID);
DROP FUNCTION IF EXISTS approve_material_dispatch(UUID, UUID);

CREATE OR REPLACE FUNCTION approve_material_dispatch(
  p_material_id UUID,
  p_user_id     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id      UUID;
  v_ticket_id    UUID;
  v_quantity     INTEGER;
  v_status       TEXT;
  v_inv_qty      INTEGER;
  v_requester_id UUID;   -- 자재를 요청한 담당기사 ID
BEGIN
  -- 1) ticket_materials 조회 (created_by = 요청자)
  SELECT inventory_item_id, ticket_id, quantity, request_status, created_by
    INTO v_item_id, v_ticket_id, v_quantity, v_status, v_requester_id
    FROM ticket_materials
   WHERE id = p_material_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '자재 요청을 찾을 수 없습니다.');
  END IF;

  -- request_status가 'requested' 또는 'pending'인 경우 모두 허용 (기존 데이터 호환)
  IF v_status NOT IN ('requested', 'pending') THEN
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

  -- 5) inventory_transactions OUTBOUND 기록 (담당자 = 자재 요청자 created_by)
  INSERT INTO inventory_transactions (
    item_id,
    user_id,
    transaction_type,
    quantity_changed,
    ticket_id,
    notes
  ) VALUES (
    v_item_id,
    COALESCE(v_requester_id, p_user_id),  -- 요청자 우선, 없으면 승인자
    'OUTBOUND',
    v_quantity,
    v_ticket_id,
    '자재 출고 승인'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION approve_material_dispatch IS '자재 출고 승인: 재고 차감 + 상태 변경 + OUTBOUND 트랜잭션 기록을 단일 트랜잭션으로 처리';
