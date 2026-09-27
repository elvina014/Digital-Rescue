-- =============================================
-- 035_payment_record.sql
-- 결제 기록 보강 (환불 정책 Phase 0)
--
-- 배경: 최종 승인 시 status/completed_at만 갱신되어 payment_status가 영구히
--      'PENDING'으로 남았다. 환불 원장의 기준점이 되는 '결제 완료' 사실이
--      시스템에 존재하지 않으므로 이를 기록할 컬럼을 추가한다.
--
-- 주의: 기존 완료 건에 대한 백필(UPDATE)은 이 마이그레이션에 포함하지 않는다.
--      필요 시 별도로 진행한다. (백필 시에는 020번처럼 trg_protect_approved_ticket
--      를 일시 비활성화해야 한다 — postgres 세션은 auth.uid()=NULL 이라 차단됨)
-- =============================================

ALTER TABLE repair_tickets
  ADD COLUMN IF NOT EXISTS paid_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cash_receipt_issued BOOLEAN;

COMMENT ON COLUMN repair_tickets.paid_at             IS '결제 완료 시각 (최종 승인 시 기록)';
COMMENT ON COLUMN repair_tickets.cash_receipt_issued IS '현금영수증 발급 여부 (계좌이체 건만 입력. NULL=해당없음 또는 미확인)';
