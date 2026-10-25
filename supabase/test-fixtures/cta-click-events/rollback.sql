-- Rollback: 20261026090000_cta_click_events.sql
-- 주의: 누적된 클릭 기록이 함께 삭제된다. 필요하면 먼저 CSV로 내보낼 것.
DROP VIEW IF EXISTS public.cta_daily_stats;
DROP TABLE IF EXISTS public.cta_click_events;
