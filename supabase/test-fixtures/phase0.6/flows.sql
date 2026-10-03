-- Phase 0.6 — business-flow equivalence (run before and after the API-guard migrations; outputs must be identical).
-- Each RPC is called in the same role context the app uses: service_role for approve_material_dispatch (admin client),
-- authenticated + employee JWT claims for everything else. Everything is rolled back at the end.
-- Usage: docker exec -i supabase_db_digital-rescue psql -U postgres -d postgres -X -At -v ON_ERROR_STOP=1 < flows.sql
\set ON_ERROR_STOP 1
\pset pager off
\pset tuples_only on
BEGIN;

-- helpers for this script only (rolled back)
CREATE FUNCTION pg_temp.as_emp(p_emp text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_emp, 'role', 'authenticated')::text, true);
$$;

\echo '== 1. 출고 승인 (dispatch) + 구매 승인 (purchase) — service_role, as the admin client does'
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT 'dispatch', public.approve_material_dispatch('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-a000-000000000002')::jsonb - 'transaction_id';
SELECT 'purchase', public.approve_material_dispatch('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-a000-000000000002')::jsonb - 'transaction_id';

\echo '== 2. 자재비 추가 + 재계산 — TECHNICIAN (assignee), session client'
RESET ROLE;
SELECT pg_temp.as_emp('00000000-0000-4000-a000-000000000004');
SET LOCAL ROLE authenticated;
UPDATE public.repair_tickets
   SET material_cost_details = coalesce(material_cost_details, '[]'::jsonb) || '[{"name":"열전도 패드","amount":12000}]'::jsonb
 WHERE id = '00000000-0000-4000-d000-000000000004';
SELECT 'recalc', public.recalc_ticket_material_cost('00000000-0000-4000-d000-000000000004');

\echo '== 3. 접수 취소 자재 원복 확인 — MANAGER (nested recalc)'
RESET ROLE;
SELECT pg_temp.as_emp('00000000-0000-4000-a000-000000000002');
SET LOCAL ROLE authenticated;
SELECT 'confirm_return', public.confirm_material_return('00000000-0000-4000-e000-000000000007') - 'transaction_id';

\echo '== 4. 환불 요청 (MANAGER) → 승인 (ADMIN) → 완료 (CS, nested apply_refund_material_adjustments) → 무효 (ADMIN, revert)'
SELECT 'request', r.status, r.amount, r.reason_code, r.refund_method, r.material_adjustments
  FROM public.request_refund('00000000-0000-4000-d000-000000000006', 50000, 'QUALITY', 'CARD_PARTIAL_CANCEL', '테스트 환불',
                             NULL, NULL, NULL, '[{"kind":"inventory_recover","material_id":"00000000-0000-4000-e000-000000000006"}]'::jsonb) r;
RESET ROLE;
SELECT pg_temp.as_emp('00000000-0000-4000-a000-000000000001');
SET LOCAL ROLE authenticated;
SELECT 'approve', r.status FROM public.transition_refund((SELECT id FROM public.ticket_refunds WHERE ticket_id = '00000000-0000-4000-d000-000000000006' ORDER BY requested_at DESC LIMIT 1), 'APPROVE', NULL, false) r;
RESET ROLE;
SELECT pg_temp.as_emp('00000000-0000-4000-a000-000000000006');
SET LOCAL ROLE authenticated;
SELECT 'complete', r.status FROM public.transition_refund((SELECT id FROM public.ticket_refunds WHERE ticket_id = '00000000-0000-4000-d000-000000000006' ORDER BY requested_at DESC LIMIT 1), 'COMPLETE', NULL, true) r;
RESET ROLE;
SELECT pg_temp.as_emp('00000000-0000-4000-a000-000000000001');
SET LOCAL ROLE authenticated;
SELECT 'void', r.status FROM public.transition_refund((SELECT id FROM public.ticket_refunds WHERE ticket_id = '00000000-0000-4000-d000-000000000006' ORDER BY requested_at DESC LIMIT 1), 'VOID', '테스트 무효', false) r;

\echo '== 5. RI: 부품 규격 + 호환 근거 (nested ri_compatibility_row / ri_recompute_compatibility) — ADMIN'
SELECT 'spec', public.part_spec_create('STORAGE', 'PM9A1 512GB 흐름테스트', 'Samsung', 'MODEL') - 'id' - 'part_spec_id';
SELECT 'model', public.catalog_create_model('흐름테스트', 'FLOW-1', '노트북', NULL) - 'model_id' - 'variant_id' - 'id';
SELECT 'evidence', public.record_compatibility_result(
         (SELECT id FROM public.part_specs WHERE name = 'PM9A1 512GB 흐름테스트'), 'MODEL',
         (SELECT m.id FROM public.catalog_models m WHERE m.name = 'FLOW-1'), 'DOCUMENT', 'compatible', NULL, '서비스 매뉴얼 p.12', NULL)
       - 'compatibility_id' - 'evidence_id';
SELECT 'search', count(*) FROM public.part_spec_search('pm9a1 흐름', 5);
SELECT 'models', count(*) FROM public.catalog_search_models('flow-1', 5);

\echo '== 6. RI: 구매 확인, 수정 권한, 라벨 조회 — TECHNICIAN'
RESET ROLE;
SELECT pg_temp.as_emp('00000000-0000-4000-a000-000000000004');
SET LOCAL ROLE authenticated;
INSERT INTO public.ticket_materials (id, ticket_id, inventory_item_id, quantity, request_status, request_type)
VALUES ('00000000-0000-4000-e000-0000000000f6', '00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b400-000000000002', 1, 'pending', 'purchase');
SELECT 'guard_check', public.purchase_guard_check('00000000-0000-4000-e000-0000000000f6');
SELECT 'can_edit', public.repair_record_can_edit('00000000-0000-4000-d000-000000000004');
SELECT 'label', public.label_lookup((SELECT label_code FROM public.inventory_items WHERE id = '00000000-0000-4000-b400-000000000001')) ->> 'kind';

\echo '== resulting state (ids and timestamps excluded)'
RESET ROLE;
SELECT 'item', id, quantity FROM public.inventory_items ORDER BY id;
SELECT 'tx', item_id, transaction_type, quantity_changed, ticket_id, user_id, notes
  FROM public.inventory_transactions ORDER BY item_id, transaction_type, quantity_changed, notes;
SELECT 'mat', id, request_status, override_unit_price, quantity FROM public.ticket_materials ORDER BY id;
SELECT 'ticket', id, status, material_cost, refunded_amount, final_price, material_cost_details FROM public.repair_tickets ORDER BY id;
SELECT 'refund', ticket_id, amount, status, reason_code, refund_method, material_adjustments - 'ignored'
  FROM public.ticket_refunds ORDER BY ticket_id, amount;
SELECT 'log', ticket_id, employee_id, message FROM public.ticket_logs ORDER BY ticket_id, message;
SELECT 'compat', s.name, c.status, c.confidence FROM public.part_compatibility c JOIN public.part_specs s ON s.id = c.part_spec_id ORDER BY 2;
ROLLBACK;
