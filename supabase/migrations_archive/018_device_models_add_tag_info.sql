-- =============================================================
-- 018: device_models에 tag_info 컬럼 추가
-- AI 검색 키워드(라벨 태그) 저장 및 조회용
-- IF NOT EXISTS / EXCEPTION 가드 — 재실행 안전
-- =============================================================

DO $$ BEGIN
  ALTER TABLE device_models ADD COLUMN tag_info TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN device_models.tag_info IS '기기 라벨 태그 정보 (예: 15ZD90RU-GX56K) — AI 검색 키워드';

CREATE INDEX IF NOT EXISTS idx_device_models_tag_info
  ON device_models(tag_info)
  WHERE tag_info IS NOT NULL;
