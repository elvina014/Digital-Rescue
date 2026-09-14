-- =============================================================
-- 040_refund_rpc_validation.sql
-- request_refund 입력 검증 보강 (환불 정책 Phase 1-5)
-- =============================================================
-- 037의 CHECK 제약(chk_refund_bank_fields / chk_deduction_note / chk_reason_note)은
-- 정상 동작하지만, 위반 시 원시 제약 위반 메시지가 그대로 화면에 노출된다.
-- 같은 조건을 RPC 안에서 먼저 검사해 한국어 안내 메시지를 돌려준다.
-- CHECK 제약은 최종 방어선으로 그대로 유지한다.
--
-- 함수 본문은 038과 동일하고, "입력 정합성 검증" 블록만 추가되었다.
-- =============================================================

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
  v_bank      TEXT := NULLIF(btrim(p_refund_bank), '');
  v_account   TEXT := NULLIF(btrim(p_refund_account), '');
  v_holder    TEXT := NULLIF(btrim(p_refund_holder), '');
  v_ded_note  TEXT := NULLIF(btrim(p_deduction_note), '');
  v_reason    TEXT := NULLIF(btrim(p_reason_note), '');
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

  -- ── 입력 정합성 검증 (037 CHECK 제약과 동일 조건, 안내 메시지용) ──
  IF p_refund_method = 'BANK_REFUND'
     AND (v_bank IS NULL OR v_account IS NULL OR v_holder IS NULL) THEN
    RAISE EXCEPTION '계좌 송금 환불은 은행 · 계좌번호 · 예금주를 모두 입력해야 합니다.';
  END IF;

  IF p_refund_method <> 'BANK_REFUND'
     AND (v_bank IS NOT NULL OR v_account IS NOT NULL OR v_holder IS NOT NULL) THEN
    RAISE EXCEPTION '계좌 송금이 아닌 환불에는 계좌 정보를 입력할 수 없습니다.';
  END IF;

  IF p_deduction_amount > 0 AND v_ded_note IS NULL THEN
    RAISE EXCEPTION '공제액을 입력한 경우 공제 사유를 함께 입력해야 합니다.';
  END IF;

  IF p_reason_code = 'OTHER' AND v_reason IS NULL THEN
    RAISE EXCEPTION '기타 사유를 선택한 경우 상세 사유를 입력해야 합니다.';
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
    p_ticket_id, p_amount, p_deduction_amount, v_ded_note,
    p_reason_code, v_reason,
    COALESCE(v_ticket.payment_method, 'UNKNOWN'), p_refund_method,
    v_bank, v_account, v_holder,
    -- 현금영수증 발급 여부가 NULL(기존 완료 건)이면 강제하지 않는다. 화면에서 경고만 띄운다.
    (v_ticket.payment_method = 'BANK_TRANSFER' AND v_ticket.cash_receipt_issued IS TRUE),
    p_parts_recovery, 'REQUESTED', v_me
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION request_refund(UUID, INTEGER, refund_reason, refund_method, parts_recovery, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION request_refund(UUID, INTEGER, refund_reason, refund_method, parts_recovery, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
