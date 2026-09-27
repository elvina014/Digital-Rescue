-- =============================================================
-- 027: 사람이 읽는 접수번호(receipt_no) + 테스트 접수 플래그(is_test)
-- =============================================================
-- 1) repair_tickets에 receipt_no, is_test 컬럼 추가
-- 2) 일별 순번 시퀀스 테이블과 BEFORE INSERT 트리거로 자동 생성
--    포맷: YYYYMMDD-NNN (한국시간 기준, 3자리, 일별 리셋)
-- 3) 기존 접수건 전체에 is_test = TRUE
-- 4) 기존 접수건에 receipt_no 백필 (created_at 일자 + 순번)
-- 5) 시퀀스 테이블 동기화로 다음 접수가 이어지도록
-- =============================================================

-- 1) 컬럼 추가
ALTER TABLE repair_tickets
  ADD COLUMN receipt_no VARCHAR(20),
  ADD COLUMN is_test    BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) 일별 순번 카운터 테이블
CREATE TABLE receipt_no_sequence (
  date_key    DATE PRIMARY KEY,
  current_seq INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE receipt_no_sequence IS '접수번호 일별 순번 카운터 (YYYYMMDD-NNN의 NNN 부분)';

-- 3) 접수번호 자동 생성 트리거 함수
CREATE OR REPLACE FUNCTION generate_receipt_no()
RETURNS TRIGGER AS $$
DECLARE
  v_date DATE;
  v_seq  INTEGER;
BEGIN
  -- 이미 receipt_no가 지정되어 있으면 건너뜀 (백필 INSERT용)
  IF NEW.receipt_no IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 한국시간 기준 일자 산출
  v_date := (NEW.created_at AT TIME ZONE 'Asia/Seoul')::DATE;

  -- 동시성 안전: 동일 date_key 행이 없으면 1로 INSERT, 있으면 +1
  INSERT INTO receipt_no_sequence(date_key, current_seq)
  VALUES (v_date, 1)
  ON CONFLICT (date_key) DO UPDATE
    SET current_seq = receipt_no_sequence.current_seq + 1
  RETURNING current_seq INTO v_seq;

  NEW.receipt_no := to_char(v_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_repair_tickets_receipt_no
  BEFORE INSERT ON repair_tickets
  FOR EACH ROW
  EXECUTE FUNCTION generate_receipt_no();

-- 4) 기존 접수건 모두 테스트로 마킹
UPDATE repair_tickets SET is_test = TRUE;

-- 5) 기존 접수건 receipt_no 백필 (created_at 일자별 순번)
WITH numbered AS (
  SELECT id,
         to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYYMMDD') AS d,
         row_number() OVER (
           PARTITION BY (created_at AT TIME ZONE 'Asia/Seoul')::DATE
           ORDER BY created_at
         ) AS seq
  FROM repair_tickets
)
UPDATE repair_tickets t
SET    receipt_no = n.d || '-' || lpad(n.seq::text, 3, '0')
FROM   numbered n
WHERE  t.id = n.id;

-- 6) 시퀀스 테이블 동기화 (다음 접수가 이어지도록)
INSERT INTO receipt_no_sequence(date_key, current_seq)
SELECT (created_at AT TIME ZONE 'Asia/Seoul')::DATE,
       COUNT(*)
FROM   repair_tickets
GROUP BY 1
ON CONFLICT (date_key) DO UPDATE
  SET current_seq = EXCLUDED.current_seq;

-- 7) NOT NULL 제약 추가 + 유니크 인덱스 + 조회 인덱스
ALTER TABLE repair_tickets ALTER COLUMN receipt_no SET NOT NULL;
CREATE UNIQUE INDEX idx_repair_tickets_receipt_no ON repair_tickets(receipt_no);
CREATE INDEX idx_repair_tickets_is_test ON repair_tickets(is_test);

COMMENT ON COLUMN repair_tickets.receipt_no IS '사람이 읽는 접수번호 (YYYYMMDD-NNN, 한국시간 기준, 일별 리셋)';
COMMENT ON COLUMN repair_tickets.is_test    IS '테스트 접수 여부 (TRUE면 통계/일반 화면에서 제외)';
