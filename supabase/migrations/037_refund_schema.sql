-- =============================================================
-- 037_refund_schema.sql
-- 환불 원장 테이블 · 동기화 트리거 · RLS (환불 정책 Phase 1-2)
-- =============================================================
-- 설계 요약
--  1) 환불은 티켓 상태를 바꾸지 않는다. COMPLETED는 그대로 두고 원장에만 쌓는다.
--  2) 원장은 append-only. UPDATE/DELETE 정책을 만들지 않고, 모든 쓰기는
--     038의 SECURITY DEFINER RPC를 통해서만 이뤄진다.
--  3) COMPLETED 환불의 합계가 repair_tickets.refunded_amount로 자동 동기화되고,
--     payment_status가 PAID / PARTIALLY_REFUNDED / REFUNDED로 따라 움직인다.
-- =============================================================


-- =============================================
-- 1. repair_tickets 누적 환불액
-- =============================================

ALTER TABLE repair_tickets
  ADD COLUMN IF NOT EXISTS refunded_amount INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN repair_tickets.refunded_amount IS
  'COMPLETED 상태 환불의 amount 합계. 트리거가 자동 갱신하므로 직접 쓰지 않는다.';

-- 누적 환불액은 결코 최종 견적을 넘을 수 없다 (RPC 검증의 최종 방어선)
ALTER TABLE repair_tickets
  DROP CONSTRAINT IF EXISTS chk_refunded_amount;
ALTER TABLE repair_tickets
  ADD CONSTRAINT chk_refunded_amount
  CHECK (refunded_amount >= 0 AND refunded_amount <= final_price);


-- =============================================
-- 2. 환불번호 채번 (R-YYYYMMDD-NNN, 한국시간 기준 일별 리셋)
-- =============================================

CREATE TABLE IF NOT EXISTS refund_no_sequence (
  date_key    DATE PRIMARY KEY,
  current_seq INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE refund_no_sequence IS '환불번호 일별 순번 카운터 (R-YYYYMMDD-NNN의 NNN 부분)';

-- 030/032와 동일: RLS는 켜두되 정책을 만들지 않고, SECURITY DEFINER 함수만 접근한다.
ALTER TABLE refund_no_sequence ENABLE ROW LEVEL SECURITY;


-- =============================================
-- 3. ticket_refunds — 환불 원장
-- =============================================

CREATE TABLE IF NOT EXISTS ticket_refunds (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES repair_tickets(id) ON DELETE RESTRICT,
  refund_no  VARCHAR(24) NOT NULL,  -- BEFORE INSERT 트리거가 채운다 (NOT NULL 검사는 그 이후)

  -- 금액
  amount            INTEGER NOT NULL CHECK (amount > 0),
  deduction_amount  INTEGER NOT NULL DEFAULT 0 CHECK (deduction_amount >= 0),
  deduction_note    TEXT,

  -- 사유
  reason_code  refund_reason NOT NULL,
  reason_note  TEXT,

  -- 결제/환불 수단 (원 결제수단은 스냅샷으로 보존한다)
  origin_payment_method VARCHAR(20) NOT NULL,
  refund_method         refund_method NOT NULL,
  refund_bank           VARCHAR(50),
  refund_account        VARCHAR(50),
  refund_holder         VARCHAR(100),

  -- 현금영수증
  cash_receipt_cancel_required BOOLEAN NOT NULL DEFAULT FALSE,
  cash_receipt_canceled_at     TIMESTAMPTZ,

  -- 부품 회수
  parts_recovery parts_recovery NOT NULL DEFAULT 'NONE',

  -- 단계
  status   refund_status NOT NULL DEFAULT 'REQUESTED',
  evidence JSONB NOT NULL DEFAULT '[]',

  requested_by UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by  UUID REFERENCES employees(id) ON DELETE RESTRICT,
  approved_at  TIMESTAMPTZ,
  completed_by UUID REFERENCES employees(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ,
  rejected_by  UUID REFERENCES employees(id) ON DELETE RESTRICT,
  rejected_at  TIMESTAMPTZ,
  reject_note  TEXT,
  voided_by    UUID REFERENCES employees(id) ON DELETE RESTRICT,
  voided_at    TIMESTAMPTZ,
  void_note    TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 계좌 환불일 때만 계좌 정보를 갖는다 (그 외에는 반드시 비어 있어야 함)
  CONSTRAINT chk_refund_bank_fields CHECK (
    (refund_method = 'BANK_REFUND'
      AND refund_bank IS NOT NULL AND refund_account IS NOT NULL AND refund_holder IS NOT NULL)
    OR
    (refund_method <> 'BANK_REFUND'
      AND refund_bank IS NULL AND refund_account IS NULL AND refund_holder IS NULL)
  ),

  -- 공제액이 있으면 사유를 반드시 남긴다
  CONSTRAINT chk_deduction_note CHECK (
    deduction_amount = 0 OR (deduction_note IS NOT NULL AND btrim(deduction_note) <> '')
  ),

  -- OTHER 사유는 상세 설명이 필수
  CONSTRAINT chk_reason_note CHECK (
    reason_code <> 'OTHER' OR (reason_note IS NOT NULL AND btrim(reason_note) <> '')
  ),

  -- 현금영수증 발급 건은 취소 확인 없이 완료될 수 없다
  CONSTRAINT chk_cash_receipt_cancel CHECK (
    status <> 'COMPLETED'
    OR cash_receipt_cancel_required = FALSE
    OR cash_receipt_canceled_at IS NOT NULL
  )
);

COMMENT ON TABLE ticket_refunds IS
  '환불 원장 (append-only). 수정·삭제하지 않으며, 오등록은 VOID 레코드로 무효화한 뒤 재등록한다.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_refunds_refund_no ON ticket_refunds(refund_no);
CREATE INDEX IF NOT EXISTS idx_ticket_refunds_ticket ON ticket_refunds(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_refunds_status ON ticket_refunds(status);
CREATE INDEX IF NOT EXISTS idx_ticket_refunds_completed_at
  ON ticket_refunds(completed_at) WHERE completed_at IS NOT NULL;


-- =============================================
-- 4. 환불번호 자동 생성 트리거
-- =============================================
-- 032의 교훈: refund_no_sequence에 RLS가 켜져 있으므로 SECURITY DEFINER여야 한다.

CREATE OR REPLACE FUNCTION generate_refund_no()
RETURNS TRIGGER AS $$
DECLARE
  v_date DATE;
  v_seq  INTEGER;
BEGIN
  IF NEW.refund_no IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_date := (now() AT TIME ZONE 'Asia/Seoul')::DATE;

  INSERT INTO refund_no_sequence(date_key, current_seq)
  VALUES (v_date, 1)
  ON CONFLICT (date_key) DO UPDATE
    SET current_seq = refund_no_sequence.current_seq + 1
  RETURNING current_seq INTO v_seq;

  NEW.refund_no := 'R-' || to_char(v_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_ticket_refunds_refund_no ON ticket_refunds;
CREATE TRIGGER trg_ticket_refunds_refund_no
  BEFORE INSERT ON ticket_refunds
  FOR EACH ROW
  EXECUTE FUNCTION generate_refund_no();

DROP TRIGGER IF EXISTS trg_ticket_refunds_updated_at ON ticket_refunds;
CREATE TRIGGER trg_ticket_refunds_updated_at
  BEFORE UPDATE ON ticket_refunds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();


-- =============================================
-- 5. 누적 환불액 · 결제 상태 동기화
-- =============================================
-- COMPLETED 환불의 합계만 집계한다. 요청·승인 단계는 매출에 영향을 주지 않는다.
--
-- protect_approved_ticket 우회: 이 함수는 SECURITY DEFINER라 auth.uid()가 NULL이고,
-- 승인 완료된 티켓을 UPDATE하므로 그대로 두면 보호 트리거에 막힌다.
-- 트랜잭션 로컬 GUC(app.refund_sync)를 세워 이 경로만 통과시킨다.

CREATE OR REPLACE FUNCTION sync_ticket_refunded_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_ticket_id UUID;
  v_total     INTEGER;
  v_final     INTEGER;
BEGIN
  v_ticket_id := COALESCE(NEW.ticket_id, OLD.ticket_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM ticket_refunds
  WHERE ticket_id = v_ticket_id AND status = 'COMPLETED';

  SELECT final_price INTO v_final
  FROM repair_tickets
  WHERE id = v_ticket_id;

  PERFORM set_config('app.refund_sync', 'on', true);

  UPDATE repair_tickets
  SET refunded_amount = v_total,
      payment_status = CASE
        WHEN v_total <= 0      THEN 'PAID'::payment_status
        WHEN v_total >= v_final THEN 'REFUNDED'::payment_status
        ELSE 'PARTIALLY_REFUNDED'::payment_status
      END
  WHERE id = v_ticket_id;

  PERFORM set_config('app.refund_sync', 'off', true);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_refunded_amount ON ticket_refunds;
CREATE TRIGGER trg_sync_refunded_amount
  AFTER INSERT OR UPDATE OR DELETE ON ticket_refunds
  FOR EACH ROW
  EXECUTE FUNCTION sync_ticket_refunded_amount();


-- =============================================
-- 6. protect_approved_ticket — 환불 동기화 경로 허용
-- =============================================
-- 034 버전을 그대로 유지하고 환불 동기화 예외만 추가한다.

CREATE OR REPLACE FUNCTION protect_approved_ticket()
RETURNS TRIGGER AS $$
DECLARE
  current_role employee_role;
  new_other repair_tickets;
BEGIN
  -- 승인 완료 상태가 아니면 통과
  IF OLD.is_approved = FALSE THEN
    RETURN NEW;
  END IF;

  -- 환불 원장 동기화 트리거가 세운 플래그. 이 경로로 들어온 UPDATE만 통과시킨다.
  -- (트랜잭션 로컬이라 외부에서 임의로 켠 채 유지할 수 없다)
  IF current_setting('app.refund_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- 관리자 메시지 알림 플래그(has_admin_message)만 변경되는 경우는 직급 무관 허용.
  new_other := NEW;
  new_other.has_admin_message := OLD.has_admin_message;
  new_other.updated_at := OLD.updated_at;
  IF new_other IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  SELECT role INTO current_role
  FROM employees
  WHERE id = auth.uid();

  IF current_role = 'ADMIN' THEN
    RETURN NEW;
  END IF;

  IF current_role = 'MANAGER' THEN
    IF NEW.final_price <> OLD.final_price THEN
      RAISE EXCEPTION '승인 완료된 접수건의 금액은 수정할 수 없습니다.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '승인 완료된 접수건은 수정할 수 없습니다. (권한: %)' , current_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- 7. RLS — 조회 전용
-- =============================================
-- 쓰기는 038의 SECURITY DEFINER RPC로만 가능하다.
-- INSERT/UPDATE/DELETE 정책을 만들지 않음으로써 직접 조작을 원천 차단한다.

ALTER TABLE ticket_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_refunds_select ON ticket_refunds;
CREATE POLICY ticket_refunds_select ON ticket_refunds
  FOR SELECT TO authenticated
  USING (
    CASE get_my_role()
      WHEN 'ADMIN'         THEN true
      WHEN 'MANAGER'       THEN true
      WHEN 'CS'            THEN true
      WHEN 'RECEPTION'     THEN true
      WHEN 'TECHNICIAN'    THEN EXISTS (
        SELECT 1 FROM repair_tickets t
        WHERE t.id = ticket_refunds.ticket_id AND t.assignee_id = auth.uid()
      )
      WHEN 'EXPERT_REPAIR' THEN EXISTS (
        SELECT 1 FROM repair_tickets t
        WHERE t.id = ticket_refunds.ticket_id AND t.assignee_id = auth.uid()
      )
      ELSE false
    END
  );
