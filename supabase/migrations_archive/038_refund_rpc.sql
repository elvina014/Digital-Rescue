-- =============================================================
-- 038_refund_rpc.sql
-- 환불 요청/전환 RPC (환불 정책 Phase 1-3)
-- =============================================================
-- ticket_refunds에는 SELECT 정책만 있으므로, 모든 쓰기는 이 두 함수를 통해서만
-- 이뤄진다. SECURITY DEFINER로 RLS를 우회하되 함수 안에서 직급·단계·금액을
-- 직접 검증한다. auth.uid()는 SECURITY DEFINER 안에서도 JWT 기준으로 동작한다.
--
-- 031의 교훈: SECURITY DEFINER 함수는 PUBLIC 실행 권한을 반드시 회수한다.
-- =============================================================


-- =============================================
-- 1. 환불 요청 (ADMIN · MANAGER · CS)
-- =============================================

CREATE OR REPLACE FUNCTION request_refund(
  p_ticket_id        UUID,
  p_amount           INTEGER,
  p_reason_code      refund_reason,
  p_refund_method    refund_method,
  p_parts_recovery   parts_recovery DEFAULT 'NONE',
  p_deduction_amount INTEGER DEFAULT 0,
  p_deduction_note   TEXT DEFAULT NULL,
  p_reason_note      TEXT DEFAULT NULL,
  p_refund_bank      TEXT DEFAULT NULL,
  p_refund_account   TEXT DEFAULT NULL,
  p_refund_holder    TEXT DEFAULT NULL
)
RETURNS ticket_refunds AS $fn$
DECLARE
  v_me        UUID := auth.uid();
  v_role      employee_role;
  v_ticket    repair_tickets;
  v_committed INTEGER;
  v_available INTEGER;
  v_row       ticket_refunds;
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

  -- 환불 완료는 거래의 최종 종결이다. 재요청을 받지 않는다.
  IF v_ticket.refunded_amount >= v_ticket.final_price THEN
    RAISE EXCEPTION '이미 전액 환불된 접수건입니다. 환불 완료 건은 종결 처리되어 추가 요청을 받지 않습니다.';
  END IF;

  -- 완료 후 30일이 지난 건은 관리자만 요청할 수 있다
  IF v_ticket.completed_at IS NOT NULL
     AND v_ticket.completed_at < now() - INTERVAL '30 days'
     AND v_role <> 'ADMIN' THEN
    RAISE EXCEPTION '완료 후 30일이 지난 접수건(완료일 %)은 관리자만 환불을 요청할 수 있습니다.',
      to_char(v_ticket.completed_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION '환불 금액은 0원보다 커야 합니다.';
  END IF;

  IF p_deduction_amount < 0 THEN
    RAISE EXCEPTION '공제액은 음수일 수 없습니다.';
  END IF;

  -- 처리 중(요청·승인) 건도 한도에 포함해 중복 요청으로 초과 환불되는 것을 막는다
  SELECT COALESCE(SUM(amount), 0) INTO v_committed
  FROM ticket_refunds
  WHERE ticket_id = p_ticket_id
    AND status IN ('REQUESTED', 'APPROVED', 'COMPLETED');

  v_available := v_ticket.final_price - v_committed - p_deduction_amount;

  IF p_amount > v_available THEN
    RAISE EXCEPTION '환불 가능액 %원을 초과했습니다. (최종견적 %원 − 기환불·처리중 %원 − 공제 %원)',
      v_available, v_ticket.final_price, v_committed, p_deduction_amount;
  END IF;

  -- 결제수단과 환불수단 정합성
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

  INSERT INTO ticket_refunds (
    ticket_id, amount, deduction_amount, deduction_note,
    reason_code, reason_note,
    origin_payment_method, refund_method,
    refund_bank, refund_account, refund_holder,
    cash_receipt_cancel_required,
    parts_recovery, status, requested_by
  ) VALUES (
    p_ticket_id, p_amount, p_deduction_amount, NULLIF(btrim(p_deduction_note), ''),
    p_reason_code, NULLIF(btrim(p_reason_note), ''),
    COALESCE(v_ticket.payment_method, 'UNKNOWN'), p_refund_method,
    NULLIF(btrim(p_refund_bank), ''), NULLIF(btrim(p_refund_account), ''), NULLIF(btrim(p_refund_holder), ''),
    -- 현금영수증 발급 여부가 NULL(기존 완료 건)이면 강제하지 않는다. 화면에서 경고만 띄운다.
    (v_ticket.payment_method = 'BANK_TRANSFER' AND v_ticket.cash_receipt_issued IS TRUE),
    p_parts_recovery, 'REQUESTED', v_me
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION request_refund(UUID, INTEGER, refund_reason, refund_method, parts_recovery, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_refund(UUID, INTEGER, refund_reason, refund_method, parts_recovery, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- =============================================
-- 2. 환불 단계 전환 (APPROVE / REJECT / COMPLETE / VOID)
-- =============================================

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

  -- ── 승인 ──
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

  -- ── 반려 ──
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

  -- ── 완료 (실제 송금·승인취소가 끝난 시점. 여기서 매출에서 차감된다) ──
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

  -- ── 무효처리 (오등록 정정. 관리자 전용) ──
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

  ELSE
    RAISE EXCEPTION '알 수 없는 처리 유형입니다: %', p_action;
  END IF;

  RETURN v_row;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION transition_refund(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION transition_refund(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;
