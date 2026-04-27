-- =============================================================
-- 017: repair_tickets에 tag_info, release_year 컬럼 추가
-- 기기 라벨 정보 및 출시연도 저장용
-- IF NOT EXISTS 가드 적용 — 재실행 안전
-- =============================================================

DO $$ BEGIN
  ALTER TABLE repair_tickets ADD COLUMN tag_info TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN repair_tickets.tag_info IS '기기 라벨에서 추출한 태그 정보 (예: 15U780-GA56K)';

DO $$ BEGIN
  ALTER TABLE repair_tickets ADD COLUMN release_year TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN repair_tickets.release_year IS '기기 출시 연도 (참고용, 예: 2021)';
