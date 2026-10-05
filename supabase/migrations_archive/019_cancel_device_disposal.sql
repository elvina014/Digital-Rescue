-- =============================================
-- 019_cancel_device_disposal.sql
-- 접수 취소 시 기기 처리방법 및 폐기 확인 컬럼 추가
-- =============================================

-- repair_tickets에 취소 기기 처리방법 컬럼 추가
ALTER TABLE repair_tickets
  ADD COLUMN IF NOT EXISTS cancel_device_disposal TEXT
    CHECK (cancel_device_disposal IN ('RETURN', 'DISPOSE'));

-- 폐기 확인 완료 시각 (관리자가 실물 확인 후 기록)
ALTER TABLE repair_tickets
  ADD COLUMN IF NOT EXISTS dispose_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN repair_tickets.cancel_device_disposal IS '취소 시 기기 처리방법: RETURN(반환), DISPOSE(폐기)';
COMMENT ON COLUMN repair_tickets.dispose_confirmed_at   IS '폐기 확인 완료 시각 (관리자 처리)';

CREATE INDEX IF NOT EXISTS idx_tickets_disposal ON repair_tickets(cancel_device_disposal)
  WHERE cancel_device_disposal IS NOT NULL;
