-- =============================================================
-- Phase 0.5 — 구매 요청 승인 버그 수정 (KI-4, decision Q11)
--
-- 문제: approve_material_dispatch가 request_type을 무시해서 구매 요청(purchase)도
--       재고를 확인·차감하고 OUTBOUND를 기록했다. 구매 요청은 재고가 0일 때 자동
--       선택되므로 승인이 항상 "재고 부족"으로 실패했다.
-- 수정: 구매 요청은 상태만 approved로 바꾸고 끝낸다(재고 변동·입출고 기록 없음).
--       출고(dispatch) 경로는 기존 문장을 그대로 유지한다.
-- 권한: CREATE OR REPLACE는 기존 ACL을 유지한다. 운영과 동일하게 다시 명시한다.
-- 롤백: docs/repair-intelligence/phases/phase-0.5-plan.md → Rollback
-- =============================================================

CREATE OR REPLACE FUNCTION "public"."approve_material_dispatch"("p_material_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_item_id      UUID;
  v_ticket_id    UUID;
  v_quantity     INTEGER;
  v_status       TEXT;
  v_inv_qty      INTEGER;
  v_requester_id UUID;   -- 자재를 요청한 담당기사 ID
  v_request_type TEXT;   -- dispatch(출고) / purchase(구매)
BEGIN
  -- 1) ticket_materials 조회 (created_by = 요청자)
  SELECT inventory_item_id, ticket_id, quantity, request_status, created_by, request_type
    INTO v_item_id, v_ticket_id, v_quantity, v_status, v_requester_id, v_request_type
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

  -- 구매 요청: 재고 확인·차감·출고 기록 없이 승인만 한다
  IF v_request_type = 'purchase' THEN
    UPDATE ticket_materials
       SET request_status = 'approved',
           updated_at     = now()
     WHERE id = p_material_id;
    RETURN jsonb_build_object('success', true);
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

COMMENT ON FUNCTION "public"."approve_material_dispatch"("p_material_id" "uuid", "p_user_id" "uuid") IS '자재 승인: dispatch=재고 차감 + 상태 변경 + OUTBOUND 기록 (단일 트랜잭션), purchase=상태만 승인 (재고·입출고 변동 없음)';

REVOKE ALL ON FUNCTION "public"."approve_material_dispatch"("p_material_id" "uuid", "p_user_id" "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."approve_material_dispatch"("p_material_id" "uuid", "p_user_id" "uuid") TO "service_role";
