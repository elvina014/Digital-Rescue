-- =============================================================
-- 042_refund_material_adjustments.sql
-- 환불 요청 시 "부품 회수 여부" 대신 자재비 항목별 수정안을 받는다
-- =============================================================
-- - 수동 자재비(material_cost_details): 항목별 금액을 낮춤 (0원 가능)
-- - 재고 자재 중 실물(부품): 회수 체크 → 완료 시 cancel_requested (반환 확인 대기)
-- - 재고 자재 중 비실물(외주 스펙 · 소프트웨어 카테고리): 단가 수정 → override_unit_price
-- 수정안은 요청 시 스냅샷으로 저장하고, 환불 COMPLETE 시 반영,
-- COMPLETED → VOID 시 되돌린다.
-- parts_recovery · deduction_* 컬럼은 이전 기록 보존용으로 남긴다.
-- =============================================================

ALTER TABLE ticket_materials
  ADD COLUMN IF NOT EXISTS override_unit_price INTEGER;

ALTER TABLE ticket_materials DROP CONSTRAINT IF EXISTS chk_override_unit_price;
ALTER TABLE ticket_materials
  ADD CONSTRAINT chk_override_unit_price
  CHECK (override_unit_price IS NULL OR override_unit_price >= 0);

COMMENT ON COLUMN ticket_materials.override_unit_price IS
  '이 접수건에만 적용하는 단가. NULL이면 inventory_items.base_estimate 사용 (환불 시 외주·소프트웨어 자재 금액 조정용)';

ALTER TABLE ticket_refunds
  ADD COLUMN IF NOT EXISTS material_adjustments JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN ticket_refunds.material_adjustments IS
  '자재비 수정안 (요청 시점 스냅샷 포함). kind: manual | inventory_price | inventory_recover. 환불 완료 시 반영, 완료 후 무효처리 시 되돌림';

CREATE OR REPLACE FUNCTION recalc_ticket_material_cost(p_ticket_id UUID)
RETURNS INTEGER AS $fn$
DECLARE
  v_inventory INTEGER;
  v_manual    INTEGER;
  v_total     INTEGER;
BEGIN
  SELECT COALESCE(SUM(COALESCE(m.override_unit_price, i.base_estimate, 0) * m.quantity), 0)::int
    INTO v_inventory
  FROM ticket_materials m
  LEFT JOIN inventory_items i ON i.id = m.inventory_item_id
  WHERE m.ticket_id = p_ticket_id
    AND m.request_status IN ('approved', 'cancel_requested');

  SELECT COALESCE(SUM((x->>'amount')::numeric), 0)::int
    INTO v_manual
  FROM repair_tickets t
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(t.material_cost_details) = 'array'
         THEN t.material_cost_details ELSE '[]'::jsonb END
  ) x
  WHERE t.id = p_ticket_id;

  v_total := v_inventory + v_manual;

  PERFORM set_config('app.refund_sync', 'on', true);
  UPDATE repair_tickets
  SET material_cost = v_total
  WHERE id = p_ticket_id AND material_cost IS DISTINCT FROM v_total;
  PERFORM set_config('app.refund_sync', 'off', true);

  RETURN v_total;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION apply_refund_material_adjustments(p_refund_id UUID, p_revert BOOLEAN)
RETURNS VOID AS $fn$
DECLARE
  v_r            ticket_refunds;
  v_details      JSONB;
  v_details_orig JSONB;
  v_before_total INTEGER;
  v_after_total  INTEGER;
  v_item         JSONB;
  v_label        TEXT;
  v_idx          INTEGER;
  v_cur          JSONB;
  v_mat          RECORD;
  v_done         TEXT[] := ARRAY[]::TEXT[];
  v_skipped      TEXT[] := ARRAY[]::TEXT[];
  v_msg          TEXT;
BEGIN
  SELECT * INTO v_r FROM ticket_refunds WHERE id = p_refund_id;
  IF NOT FOUND
     OR jsonb_typeof(v_r.material_adjustments) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_r.material_adjustments) = 0 THEN
    RETURN;
  END IF;

  SELECT CASE WHEN jsonb_typeof(material_cost_details) = 'array'
              THEN material_cost_details ELSE '[]'::jsonb END,
         material_cost
    INTO v_details, v_before_total
  FROM repair_tickets
  WHERE id = v_r.ticket_id
  FOR UPDATE;

  v_details_orig := v_details;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_r.material_adjustments) LOOP
    v_label := COALESCE(v_item->>'description', v_item->>'label', '자재');

    CASE v_item->>'kind'

    WHEN 'manual' THEN
      v_idx := (v_item->>'index')::int;
      v_cur := v_details -> v_idx;

      IF NOT p_revert THEN
        IF v_cur IS NULL
           OR (v_cur->>'description') IS DISTINCT FROM (v_item->>'description')
           OR (v_cur->>'amount')::numeric IS DISTINCT FROM (v_item->>'before')::numeric THEN
          RAISE EXCEPTION '환불 요청 이후 자재비 항목 "%"이(가) 변경되었습니다. 이 환불을 반려하고 다시 요청해 주세요.', v_label;
        END IF;
        v_details := jsonb_set(v_details, ARRAY[v_idx::text, 'amount'], to_jsonb((v_item->>'after')::int));
        v_done := v_done || format('%s %s원→%s원', v_label,
          to_char((v_item->>'before')::int, 'FM999,999,999,990'),
          to_char((v_item->>'after')::int,  'FM999,999,999,990'));
      ELSE
        IF v_cur IS NOT NULL
           AND (v_cur->>'description') IS NOT DISTINCT FROM (v_item->>'description')
           AND (v_cur->>'amount')::numeric = (v_item->>'after')::numeric THEN
          v_details := jsonb_set(v_details, ARRAY[v_idx::text, 'amount'], to_jsonb((v_item->>'before')::int));
          v_done := v_done || format('%s %s원 복구', v_label,
            to_char((v_item->>'before')::int, 'FM999,999,999,990'));
        ELSE
          v_skipped := v_skipped || format('%s(이후 금액이 변경됨)', v_label);
        END IF;
      END IF;

    WHEN 'inventory_price' THEN
      SELECT m.request_status::text AS status,
             m.override_unit_price,
             COALESCE(m.override_unit_price, i.base_estimate, 0) AS unit_price
        INTO v_mat
      FROM ticket_materials m
      LEFT JOIN inventory_items i ON i.id = m.inventory_item_id
      WHERE m.id = (v_item->>'material_id')::uuid AND m.ticket_id = v_r.ticket_id
      FOR UPDATE OF m;

      IF NOT p_revert THEN
        IF NOT FOUND THEN
          RAISE EXCEPTION '환불 요청 이후 자재 "%"이(가) 삭제되었습니다. 이 환불을 반려하고 다시 요청해 주세요.', v_label;
        END IF;
        IF v_mat.status <> 'approved' OR v_mat.unit_price <> (v_item->>'before_unit')::int THEN
          RAISE EXCEPTION '환불 요청 이후 자재 "%"의 상태나 단가가 변경되었습니다. 이 환불을 반려하고 다시 요청해 주세요.', v_label;
        END IF;
        UPDATE ticket_materials
        SET override_unit_price = (v_item->>'after_unit')::int
        WHERE id = (v_item->>'material_id')::uuid;
        v_done := v_done || format('%s 단가 %s원→%s원', v_label,
          to_char((v_item->>'before_unit')::int, 'FM999,999,999,990'),
          to_char((v_item->>'after_unit')::int,  'FM999,999,999,990'));
      ELSE
        IF FOUND AND v_mat.override_unit_price IS NOT DISTINCT FROM (v_item->>'after_unit')::int THEN
          UPDATE ticket_materials
          SET override_unit_price = (v_item->>'before_override')::int
          WHERE id = (v_item->>'material_id')::uuid;
          v_done := v_done || format('%s 단가 %s원 복구', v_label,
            to_char((v_item->>'before_unit')::int, 'FM999,999,999,990'));
        ELSE
          v_skipped := v_skipped || format('%s(이후 단가가 변경됨)', v_label);
        END IF;
      END IF;

    WHEN 'inventory_recover' THEN
      SELECT m.request_status::text AS status
        INTO v_mat
      FROM ticket_materials m
      WHERE m.id = (v_item->>'material_id')::uuid AND m.ticket_id = v_r.ticket_id
      FOR UPDATE;

      IF NOT p_revert THEN
        IF NOT FOUND THEN
          RAISE EXCEPTION '환불 요청 이후 자재 "%"이(가) 삭제되었습니다. 이 환불을 반려하고 다시 요청해 주세요.', v_label;
        END IF;
        IF v_mat.status <> 'approved' THEN
          RAISE EXCEPTION '환불 요청 이후 자재 "%"의 상태가 변경되었습니다. (현재: %) 이 환불을 반려하고 다시 요청해 주세요.', v_label, v_mat.status;
        END IF;
        UPDATE ticket_materials
        SET request_status = 'cancel_requested'
        WHERE id = (v_item->>'material_id')::uuid;
        v_done := v_done || format('%s 회수(반환 확인 대기)', v_label);
      ELSE
        IF FOUND AND v_mat.status = 'cancel_requested' THEN
          UPDATE ticket_materials
          SET request_status = 'approved'
          WHERE id = (v_item->>'material_id')::uuid;
          v_done := v_done || format('%s 회수 취소', v_label);
        ELSIF FOUND AND v_mat.status = 'cancelled' THEN
          v_skipped := v_skipped || format('%s(반환 확인이 끝나 재고로 복구됨)', v_label);
        ELSE
          v_skipped := v_skipped || format('%s(이후 상태가 변경됨)', v_label);
        END IF;
      END IF;

    ELSE
      RAISE EXCEPTION '알 수 없는 자재비 수정 유형입니다: %', v_item->>'kind';
    END CASE;
  END LOOP;

  IF v_details IS DISTINCT FROM v_details_orig THEN
    PERFORM set_config('app.refund_sync', 'on', true);
    UPDATE repair_tickets SET material_cost_details = v_details WHERE id = v_r.ticket_id;
    PERFORM set_config('app.refund_sync', 'off', true);
  END IF;

  v_after_total := recalc_ticket_material_cost(v_r.ticket_id);

  v_msg := format('시스템: %s (%s자재비 합계 %s원 → %s원)',
    CASE WHEN p_revert
         THEN format('환불 %s 무효처리로 자재비 수정을 되돌렸습니다.', v_r.refund_no)
         ELSE format('환불 %s 완료로 자재비 수정이 반영되었습니다.', v_r.refund_no)
    END,
    CASE WHEN array_length(v_done, 1) > 0 THEN array_to_string(v_done, ', ') || ', ' ELSE '' END,
    to_char(v_before_total, 'FM999,999,999,990'),
    to_char(v_after_total,  'FM999,999,999,990'));

  IF array_length(v_skipped, 1) > 0 THEN
    v_msg := v_msg || ' 되돌리지 못한 항목: ' || array_to_string(v_skipped, ', ');
  END IF;

  INSERT INTO ticket_logs (ticket_id, employee_id, message)
  VALUES (v_r.ticket_id, auth.uid(), v_msg);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP FUNCTION IF EXISTS request_refund(UUID, INTEGER, refund_reason, refund_method, parts_recovery, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION request_refund(
  p_ticket_id            UUID,
  p_amount               INTEGER,
  p_reason_code          refund_reason,
  p_refund_method        refund_method,
  p_reason_note          TEXT  DEFAULT NULL,
  p_refund_bank          TEXT  DEFAULT NULL,
  p_refund_account       TEXT  DEFAULT NULL,
  p_refund_holder        TEXT  DEFAULT NULL,
  p_material_adjustments JSONB DEFAULT '[]'::jsonb
)
RETURNS ticket_refunds AS $fn$
DECLARE
  v_me        UUID := auth.uid();
  v_role      employee_role;
  v_ticket    repair_tickets;
  v_committed INTEGER;
  v_available INTEGER;
  v_row       ticket_refunds;
  v_bank      TEXT := NULLIF(btrim(p_refund_bank), '');
  v_account   TEXT := NULLIF(btrim(p_refund_account), '');
  v_holder    TEXT := NULLIF(btrim(p_refund_holder), '');
  v_reason    TEXT := NULLIF(btrim(p_reason_note), '');
  v_input     JSONB := COALESCE(p_material_adjustments, '[]'::jsonb);
  v_details   JSONB;
  v_item      JSONB;
  v_adj       JSONB := '[]'::jsonb;
  v_keys      TEXT[] := ARRAY[]::TEXT[];
  v_key       TEXT;
  v_idx       INTEGER;
  v_after     INTEGER;
  v_cur       JSONB;
  v_mat       RECORD;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  SELECT role INTO v_role FROM employees WHERE id = v_me;
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'MANAGER', 'CS') THEN
    RAISE EXCEPTION '환불을 요청할 권한이 없습니다. (권한: %)', COALESCE(v_role::text, '없음');
  END IF;

  SELECT * INTO v_ticket FROM repair_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '접수건을 찾을 수 없습니다.';
  END IF;

  IF v_ticket.status <> 'COMPLETED' THEN
    RAISE EXCEPTION '완료된 접수건만 환불할 수 있습니다. (현재 상태: %)', v_ticket.status;
  END IF;

  IF v_ticket.final_price <= 0 THEN
    RAISE EXCEPTION '결제 금액이 없는 접수건입니다.';
  END IF;

  IF v_ticket.refunded_amount >= v_ticket.final_price THEN
    RAISE EXCEPTION '이미 전액 환불된 접수건입니다. 환불 완료 건은 종결 처리되어 추가 요청을 받지 않습니다.';
  END IF;

  IF v_ticket.completed_at IS NOT NULL
     AND v_ticket.completed_at < now() - INTERVAL '30 days'
     AND v_role <> 'ADMIN' THEN
    RAISE EXCEPTION '완료 후 30일이 지난 접수건(완료일 %)은 관리자만 환불을 요청할 수 있습니다.',
      to_char(v_ticket.completed_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '환불 금액은 0원보다 커야 합니다.';
  END IF;

  IF p_refund_method = 'BANK_REFUND'
     AND (v_bank IS NULL OR v_account IS NULL OR v_holder IS NULL) THEN
    RAISE EXCEPTION '계좌 송금 환불은 은행 · 계좌번호 · 예금주를 모두 입력해야 합니다.';
  END IF;

  IF p_refund_method <> 'BANK_REFUND'
     AND (v_bank IS NOT NULL OR v_account IS NOT NULL OR v_holder IS NOT NULL) THEN
    RAISE EXCEPTION '계좌 송금이 아닌 환불에는 계좌 정보를 입력할 수 없습니다.';
  END IF;

  IF p_reason_code = 'OTHER' AND v_reason IS NULL THEN
    RAISE EXCEPTION '기타 사유를 선택한 경우 상세 사유를 입력해야 합니다.';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_committed
  FROM ticket_refunds
  WHERE ticket_id = p_ticket_id
    AND status IN ('REQUESTED', 'APPROVED', 'COMPLETED');

  v_available := v_ticket.final_price - v_committed;

  IF p_amount > v_available THEN
    RAISE EXCEPTION '환불 가능액 %원을 초과했습니다. (결제금액 %원 − 기환불·처리중 %원)',
      v_available, v_ticket.final_price, v_committed;
  END IF;

  IF v_ticket.payment_method IN ('CARD', 'E_PAYMENT')
     AND p_refund_method NOT IN ('CARD_CANCEL', 'CARD_PARTIAL_CANCEL') THEN
    RAISE EXCEPTION '카드·간편결제 건은 승인취소 또는 부분취소로만 환불할 수 있습니다.';
  END IF;

  IF v_ticket.payment_method = 'BANK_TRANSFER'
     AND p_refund_method NOT IN ('BANK_REFUND', 'CASH') THEN
    RAISE EXCEPTION '계좌이체 건은 계좌 송금 또는 현금 반환으로만 환불할 수 있습니다.';
  END IF;

  IF p_refund_method = 'CARD_CANCEL' AND p_amount <> v_ticket.final_price THEN
    RAISE EXCEPTION '카드 승인취소(전액)는 결제 전액을 환불할 때만 선택할 수 있습니다. 부분 환불은 부분취소를 선택해 주세요.';
  END IF;

  IF jsonb_typeof(v_input) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION '자재비 수정 내역 형식이 올바르지 않습니다.';
  END IF;

  IF jsonb_array_length(v_input) > 0 AND EXISTS (
    SELECT 1 FROM ticket_refunds
    WHERE ticket_id = p_ticket_id
      AND status IN ('REQUESTED', 'APPROVED')
      AND jsonb_array_length(material_adjustments) > 0
  ) THEN
    RAISE EXCEPTION '자재비 수정이 포함된 다른 환불이 처리 중입니다. 먼저 완료하거나 반려한 뒤 요청해 주세요.';
  END IF;

  v_details := CASE WHEN jsonb_typeof(v_ticket.material_cost_details) = 'array'
                    THEN v_ticket.material_cost_details ELSE '[]'::jsonb END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_input) LOOP

    IF v_item->>'kind' = 'manual' THEN
      IF jsonb_typeof(v_item->'index') IS DISTINCT FROM 'number'
         OR jsonb_typeof(v_item->'after') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION '수정할 자재비 금액을 입력해 주세요.';
      END IF;
      v_idx := (v_item->>'index')::int;
      v_cur := CASE WHEN v_idx >= 0 THEN v_details -> v_idx END;
      IF v_cur IS NULL THEN
        RAISE EXCEPTION '자재비 항목을 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.';
      END IF;
      v_after := round((v_item->>'after')::numeric)::int;
      IF v_after < 0 OR v_after >= (v_cur->>'amount')::numeric THEN
        RAISE EXCEPTION '자재비 "%"은(는) 0원 이상, 현재 금액(%원)보다 낮게만 수정할 수 있습니다.',
          v_cur->>'description', v_cur->>'amount';
      END IF;
      v_key := 'manual:' || v_idx;
      v_adj := v_adj || jsonb_build_array(jsonb_build_object(
        'kind', 'manual',
        'index', v_idx,
        'description', v_cur->>'description',
        'before', round((v_cur->>'amount')::numeric)::int,
        'after', v_after
      ));

    ELSIF v_item->>'kind' IN ('inventory_price', 'inventory_recover') THEN
      IF jsonb_typeof(v_item->'material_id') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION '재고 자재 항목이 지정되지 않았습니다.';
      END IF;

      SELECT m.id,
             m.request_status::text AS status,
             m.quantity,
             m.request_type,
             m.override_unit_price,
             COALESCE(m.override_unit_price, i.base_estimate, 0) AS unit_price,
             COALESCE(s.name = '외주' OR c.name = '소프트웨어', FALSE) AS non_physical,
             concat_ws(' / ', c.name, s.name, p.name, i.capacity) AS label
        INTO v_mat
      FROM ticket_materials m
      LEFT JOIN inventory_items i      ON i.id = m.inventory_item_id
      LEFT JOIN inventory_categories c ON c.id = i.category_id
      LEFT JOIN inventory_specs s      ON s.id = i.spec_id
      LEFT JOIN inventory_products p   ON p.id = i.product_id
      WHERE m.id = (v_item->>'material_id')::uuid
        AND m.ticket_id = p_ticket_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION '재고 자재 항목을 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.';
      END IF;

      IF v_mat.status <> 'approved' THEN
        RAISE EXCEPTION '사용 확정된 자재만 수정할 수 있습니다. ("%" 현재 상태: %)', v_mat.label, v_mat.status;
      END IF;

      v_key := 'material:' || v_mat.id;

      IF v_item->>'kind' = 'inventory_price' THEN
        IF NOT v_mat.non_physical THEN
          RAISE EXCEPTION '"%"은(는) 실물 자재라 금액 대신 회수 여부로 처리합니다.', v_mat.label;
        END IF;
        IF jsonb_typeof(v_item->'after') IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION '수정할 자재비 금액을 입력해 주세요.';
        END IF;
        v_after := round((v_item->>'after')::numeric)::int;
        IF v_after < 0 OR v_after >= v_mat.unit_price THEN
          RAISE EXCEPTION '"%"은(는) 0원 이상, 현재 단가(%원)보다 낮게만 수정할 수 있습니다.', v_mat.label, v_mat.unit_price;
        END IF;
        v_adj := v_adj || jsonb_build_array(jsonb_build_object(
          'kind', 'inventory_price',
          'material_id', v_mat.id,
          'label', v_mat.label,
          'quantity', v_mat.quantity,
          'before_unit', v_mat.unit_price,
          'before_override', v_mat.override_unit_price,
          'after_unit', v_after
        ));
      ELSE
        IF v_mat.non_physical THEN
          RAISE EXCEPTION '"%"은(는) 실물이 없는 자재라 회수할 수 없습니다. 금액 수정으로 처리해 주세요.', v_mat.label;
        END IF;
        v_adj := v_adj || jsonb_build_array(jsonb_build_object(
          'kind', 'inventory_recover',
          'material_id', v_mat.id,
          'label', v_mat.label,
          'quantity', v_mat.quantity,
          'unit_price', v_mat.unit_price,
          'request_type', v_mat.request_type
        ));
      END IF;

    ELSE
      RAISE EXCEPTION '알 수 없는 자재비 수정 유형입니다: %', v_item->>'kind';
    END IF;

    IF v_key = ANY(v_keys) THEN
      RAISE EXCEPTION '같은 자재비 항목을 두 번 수정할 수 없습니다.';
    END IF;
    v_keys := v_keys || v_key;
  END LOOP;

  INSERT INTO ticket_refunds (
    ticket_id, amount,
    reason_code, reason_note,
    origin_payment_method, refund_method,
    refund_bank, refund_account, refund_holder,
    cash_receipt_cancel_required,
    material_adjustments,
    status, requested_by
  ) VALUES (
    p_ticket_id, p_amount,
    p_reason_code, v_reason,
    COALESCE(v_ticket.payment_method, 'UNKNOWN'), p_refund_method,
    v_bank, v_account, v_holder,
    (v_ticket.payment_method = 'BANK_TRANSFER' AND v_ticket.cash_receipt_issued IS TRUE),
    v_adj,
    'REQUESTED', v_me
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION transition_refund(
  p_refund_id             UUID,
  p_action                TEXT,
  p_note                  TEXT DEFAULT NULL,
  p_cash_receipt_canceled BOOLEAN DEFAULT FALSE
)
RETURNS ticket_refunds AS $fn$
DECLARE
  v_me   UUID := auth.uid();
  v_role employee_role;
  v_r    ticket_refunds;
  v_row  ticket_refunds;
  v_note TEXT := NULLIF(btrim(p_note), '');
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  SELECT role INTO v_role FROM employees WHERE id = v_me;
  IF v_role IS NULL THEN
    RAISE EXCEPTION '직원 정보를 찾을 수 없습니다.';
  END IF;

  SELECT * INTO v_r FROM ticket_refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '환불 내역을 찾을 수 없습니다.';
  END IF;

  IF p_action = 'APPROVE' THEN
    IF v_role NOT IN ('ADMIN', 'MANAGER') THEN
      RAISE EXCEPTION '환불 승인 권한이 없습니다. (권한: %)', v_role;
    END IF;
    IF v_r.status <> 'REQUESTED' THEN
      RAISE EXCEPTION '요청 상태의 환불만 승인할 수 있습니다. (현재: %)', v_r.status;
    END IF;
    IF v_r.requested_by = v_me AND v_role <> 'ADMIN' THEN
      RAISE EXCEPTION '본인이 요청한 환불은 본인이 승인할 수 없습니다.';
    END IF;

    UPDATE ticket_refunds
    SET status = 'APPROVED', approved_by = v_me, approved_at = now()
    WHERE id = p_refund_id
    RETURNING * INTO v_row;

  ELSIF p_action = 'REJECT' THEN
    IF v_role NOT IN ('ADMIN', 'MANAGER') THEN
      RAISE EXCEPTION '환불 반려 권한이 없습니다. (권한: %)', v_role;
    END IF;
    IF v_r.status <> 'REQUESTED' THEN
      RAISE EXCEPTION '요청 상태의 환불만 반려할 수 있습니다. (현재: %)', v_r.status;
    END IF;
    IF v_note IS NULL THEN
      RAISE EXCEPTION '반려 사유를 입력해 주세요.';
    END IF;

    UPDATE ticket_refunds
    SET status = 'REJECTED', rejected_by = v_me, rejected_at = now(), reject_note = v_note
    WHERE id = p_refund_id
    RETURNING * INTO v_row;

  ELSIF p_action = 'COMPLETE' THEN
    IF v_role NOT IN ('ADMIN', 'MANAGER', 'CS') THEN
      RAISE EXCEPTION '환불 완료 처리 권한이 없습니다. (권한: %)', v_role;
    END IF;
    IF v_r.status <> 'APPROVED' THEN
      RAISE EXCEPTION '승인된 환불만 완료 처리할 수 있습니다. (현재: %)', v_r.status;
    END IF;
    IF v_r.cash_receipt_cancel_required AND NOT COALESCE(p_cash_receipt_canceled, FALSE) THEN
      RAISE EXCEPTION '현금영수증 발급 건입니다. 발급취소를 완료한 뒤 확인 체크와 함께 처리해 주세요.';
    END IF;

    UPDATE ticket_refunds
    SET status = 'COMPLETED',
        completed_by = v_me,
        completed_at = now(),
        cash_receipt_canceled_at = CASE
          WHEN v_r.cash_receipt_cancel_required THEN now()
          ELSE cash_receipt_canceled_at
        END
    WHERE id = p_refund_id
    RETURNING * INTO v_row;

    PERFORM apply_refund_material_adjustments(p_refund_id, FALSE);

  ELSIF p_action = 'VOID' THEN
    IF v_role <> 'ADMIN' THEN
      RAISE EXCEPTION '환불 무효처리는 관리자만 할 수 있습니다. (권한: %)', v_role;
    END IF;
    IF v_r.status NOT IN ('APPROVED', 'COMPLETED') THEN
      RAISE EXCEPTION '승인 또는 완료된 환불만 무효처리할 수 있습니다. (현재: %)', v_r.status;
    END IF;
    IF v_note IS NULL THEN
      RAISE EXCEPTION '무효처리 사유를 입력해 주세요.';
    END IF;

    UPDATE ticket_refunds
    SET status = 'VOID', voided_by = v_me, voided_at = now(), void_note = v_note
    WHERE id = p_refund_id
    RETURNING * INTO v_row;

    IF v_r.status = 'COMPLETED' THEN
      PERFORM apply_refund_material_adjustments(p_refund_id, TRUE);
    END IF;

  ELSE
    RAISE EXCEPTION '알 수 없는 처리 유형입니다: %', p_action;
  END IF;

  RETURN v_row;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION recalc_ticket_material_cost(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION recalc_ticket_material_cost(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION apply_refund_material_adjustments(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION request_refund(UUID, INTEGER, refund_reason, refund_method, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION request_refund(UUID, INTEGER, refund_reason, refund_method, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION transition_refund(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transition_refund(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;
