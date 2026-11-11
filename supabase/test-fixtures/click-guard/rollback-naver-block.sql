-- =============================================================
-- Rollback: 20261111090000_click_guard_naver_block.sql
-- 함수 3개, 감사 로그 테이블, cg_ip_marks 의 네이버 컬럼 3개를 제거한다.
-- 주의: cg_block_log 의 이력과 네이버 항목 ID(naver_filter_id)가 사라진다. 네이버에 등록된 IP 자체는 그대로 남는다.
-- 표시 상태(status)·메모는 그대로 둔다.
-- =============================================================
BEGIN;
DROP FUNCTION IF EXISTS public.cg_log_block(inet, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.cg_mark_naver_unregistered(inet);
DROP FUNCTION IF EXISTS public.cg_mark_naver_registered(inet, text, text, text);
DROP TABLE IF EXISTS public.cg_block_log;
ALTER TABLE public.cg_ip_marks
  DROP COLUMN IF EXISTS naver_source,
  DROP COLUMN IF EXISTS naver_registered_at,
  DROP COLUMN IF EXISTS naver_filter_id;
COMMIT;
