-- =============================================
-- 020_completed_canceled_at.sql
-- 완료/취소 날짜 컬럼 추가 (월별 집계 정확도 개선)
-- completed_at: 승인·완료 처리된 실제 날짜
-- canceled_at : 취소 처리된 실제 날짜
-- =============================================

ALTER TABLE repair_tickets
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_at  TIMESTAMPTZ;

COMMENT ON COLUMN repair_tickets.completed_at IS '수리 완료(최종 승인) 처리 시각';
COMMENT ON COLUMN repair_tickets.canceled_at  IS '접수 취소 처리 시각';

-- 기존 COMPLETED 데이터 백필: updated_at을 완료 시각으로 간주
UPDATE repair_tickets
  SET completed_at = updated_at
  WHERE status = 'COMPLETED'
    AND completed_at IS NULL;

-- 기존 CANCELED 데이터 백필: updated_at을 취소 시각으로 간주
UPDATE repair_tickets
  SET canceled_at = updated_at
  WHERE status = 'CANCELED'
    AND canceled_at IS NULL;

-- 인덱스 (월별 집계 쿼리 성능)
CREATE INDEX IF NOT EXISTS idx_tickets_completed_at
  ON repair_tickets(completed_at)
  WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_canceled_at
  ON repair_tickets(canceled_at)
  WHERE canceled_at IS NOT NULL;
