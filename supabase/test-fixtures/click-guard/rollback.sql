-- =============================================================
-- Rollback: 20261106090000_click_guard_mvp.sql
-- 주의: 누적된 광고 유입·참여도 기록과 화이트리스트·IP 표시가 함께 삭제된다. 필요하면 먼저 CSV로 내보낼 것.
-- docs/click-guard/cron.sql로 pg_cron 작업을 등록했다면 먼저 해제한다:
--   SELECT cron.unschedule('click-guard-purge');
-- =============================================================
BEGIN;
DROP FUNCTION IF EXISTS public.cg_purge_old(integer);
DROP FUNCTION IF EXISTS public.cg_record_engagement(uuid, integer, integer, integer, boolean, text);
DROP FUNCTION IF EXISTS public.cg_record_visit(jsonb);
DROP TABLE IF EXISTS public.cg_ip_marks;
DROP TABLE IF EXISTS public.cg_whitelist;
DROP TABLE IF EXISTS public.cg_engagement;
DROP TABLE IF EXISTS public.cg_ad_visits;
COMMIT;
