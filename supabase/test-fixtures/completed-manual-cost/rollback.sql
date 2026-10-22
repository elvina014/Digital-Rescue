-- =============================================================
-- Rollback: 20261007090000_completed_ticket_manual_cost.sql
-- 함수 2개만 제거한다. 이미 등록된 비용 항목(material_cost_details)과 material_cost는 그대로 둔다(업무 데이터).
-- =============================================================
BEGIN;
DROP FUNCTION IF EXISTS public.add_ticket_manual_cost(uuid, text, integer);
DROP FUNCTION IF EXISTS public.update_ticket_manual_cost(uuid, integer, text, integer);
COMMIT;
