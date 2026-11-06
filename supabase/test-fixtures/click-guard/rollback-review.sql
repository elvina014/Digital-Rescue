-- =============================================================
-- Rollback: 20261106120000_click_guard_review.sql
-- 함수 6개만 제거한다. 표시(cg_ip_marks)·화이트리스트(cg_whitelist)에 기록된 내용은 그대로 둔다.
-- =============================================================
BEGIN;
DROP FUNCTION IF EXISTS public.cg_whitelist_delete(bigint);
DROP FUNCTION IF EXISTS public.cg_whitelist_upsert(cidr, text);
DROP FUNCTION IF EXISTS public.cg_mark_ip(inet, text, text);
DROP FUNCTION IF EXISTS public.cg_ip_detail(inet, integer);
DROP FUNCTION IF EXISTS public.cg_ad_summary(integer);
DROP FUNCTION IF EXISTS public.cg_suspect_ips(integer, integer);
COMMIT;
