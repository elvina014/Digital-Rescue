-- 접수 취소 시 의뢰 기기 처리 방법 및 폐기 확인 여부 컬럼 추가
ALTER TABLE repair_tickets
  ADD COLUMN IF NOT EXISTS cancel_method TEXT
    CHECK (cancel_method IN ('return', 'dispose'));

ALTER TABLE repair_tickets
  ADD COLUMN IF NOT EXISTS disposal_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
