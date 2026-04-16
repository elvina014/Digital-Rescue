-- repair_tickets 테이블에 images JSONB 컬럼 추가
-- 업로드된 이미지 URL 목록 (최대 12장)
ALTER TABLE repair_tickets
ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]';
