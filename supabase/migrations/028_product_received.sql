-- =============================================
-- 028_product_received.sql
-- '제품입고완료' 단계 추가
--   - ticket_status에 RECEIVED 상태값 추가 (ASSIGNED와 IN_PROGRESS 사이)
--   - received_at: 제품 입고 완료 처리 시각 (입고 전/후 취소 구분 기준)
-- =============================================

-- 1) 상태값 추가 (IN_PROGRESS 앞에 위치 → enum 정렬 순서 = 워크플로 순서)
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'RECEIVED' BEFORE 'IN_PROGRESS';

-- 2) 입고 완료 시각 컬럼
ALTER TABLE repair_tickets
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

COMMENT ON COLUMN repair_tickets.received_at IS '제품 입고 완료 처리 시각 (NULL=입고 전, NOT NULL=입고 후). 입고 전/후 취소 구분 기준';

-- 3) 기존 진행 건 백필
--    이미 수리 단계 이상으로 진행된 건은 물리적으로 입고된 상태이므로 received_at 설정.
--    승인 보호 트리거가 COMPLETED(is_approved=true) 건의 UPDATE를 차단하므로 백필 중 일시 해제.
ALTER TABLE repair_tickets DISABLE TRIGGER trg_protect_approved_ticket;

UPDATE repair_tickets
  SET received_at = created_at
  WHERE status IN ('IN_PROGRESS', 'WAITING_APPROVAL', 'COMPLETED')
    AND received_at IS NULL;

ALTER TABLE repair_tickets ENABLE TRIGGER trg_protect_approved_ticket;

-- 4) 인덱스 (입고 여부 기반 집계 성능)
CREATE INDEX IF NOT EXISTS idx_tickets_received_at
  ON repair_tickets(received_at)
  WHERE received_at IS NOT NULL;
