-- =============================================================
-- Phase 2 — repair records, removed parts, gates
-- Run: npx supabase test db   (local only; everything is rolled back)
-- Seed users: a…01 ADMIN, 02 MANAGER, 03 RECEPTION, 04 TECHNICIAN, 05 EXPERT_REPAIR, 06 CS
-- Seed tickets: d…01 NEW (no assignee), 02 ASSIGNED (tech), 03 RECEIVED (tech), 04 IN_PROGRESS (tech),
--               06 COMPLETED approved (expert), 07 CANCELED (tech), 09 IN_PROGRESS (tech)
-- =============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT * FROM no_plan();

CREATE TEMP TABLE res (k text PRIMARY KEY, v jsonb);
GRANT ALL ON res TO authenticated, anon;

CREATE FUNCTION pg_temp.jwt(p_n text) RETURNS text LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a000-00000000000' || p_n, 'role', 'authenticated')::text, true);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.jwt(text) TO authenticated, anon;

-- ---------- 1. defaults / reference data ----------
SELECT is((SELECT ri_approval_gate_enabled FROM global_settings), false, 'approval gate flag defaults to false');
SELECT is((SELECT ri_cancel_gate_enabled FROM global_settings), false, 'cancel gate flag defaults to false');
SELECT is((SELECT count(*)::int FROM symptom_codes WHERE parent_id IS NULL), 9, '9 top-level symptom codes seeded');

-- ---------- 2. constraints (as owner) ----------
INSERT INTO repair_records (ticket_id, diagnosis_summary) VALUES ('00000000-0000-4000-d000-000000000009', 'x');
SELECT throws_ok($$ INSERT INTO repair_records (ticket_id) VALUES ('00000000-0000-4000-d000-000000000009') $$,
  '23505', NULL, 'one repair record per ticket');
SELECT throws_ok($$ UPDATE repair_records SET result = 'DONE' WHERE ticket_id = '00000000-0000-4000-d000-000000000009' $$,
  '23514', NULL, 'result CHECK');
SELECT throws_ok($$ UPDATE repair_records SET fault_category = 'X' WHERE ticket_id = '00000000-0000-4000-d000-000000000009' $$,
  '23514', NULL, 'fault_category CHECK');
SELECT throws_ok($$ INSERT INTO ticket_symptoms (ticket_id, note) VALUES ('00000000-0000-4000-d000-000000000009', '  ') $$,
  '23514', NULL, 'symptom needs code or note');
SELECT throws_ok($$ INSERT INTO ticket_removed_parts (ticket_id, description, disposition) VALUES ('00000000-0000-4000-d000-000000000009', 'p', 'SELL') $$,
  '23514', NULL, 'disposition CHECK');
SELECT throws_ok($$ INSERT INTO ticket_removed_parts (ticket_id, description, disposition) VALUES ('00000000-0000-4000-d000-000000000009', 'p', 'STOCK') $$,
  '23514', NULL, 'STOCK needs category/spec/name/condition');
SELECT throws_ok($$ INSERT INTO ticket_removed_parts (ticket_id, description, disposition, inbound_approved_at) VALUES ('00000000-0000-4000-d000-000000000009', 'p', 'DISCARD', now()) $$,
  '23514', NULL, 'inbound approval only for STOCK');
SELECT throws_ok($$ INSERT INTO repair_measurements (ticket_id, label) VALUES ('00000000-0000-4000-d000-000000000009', 'PPBUS') $$,
  '23514', NULL, 'measurement needs a value');
SELECT throws_ok($$ DELETE FROM repair_tickets WHERE id = '00000000-0000-4000-d000-000000000009' $$,
  '23503', NULL, 'ticket with repair data cannot be deleted (RESTRICT)');
DELETE FROM repair_records;

-- ---------- 3. RLS / lock rule ----------
-- assigned technician on an open ticket
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT is(repair_record_can_edit('00000000-0000-4000-d000-000000000004'), true, 'assigned TECHNICIAN can edit open ticket');
SELECT is(repair_record_can_edit('00000000-0000-4000-d000-000000000007'), false, 'TECHNICIAN cannot edit CANCELED ticket');
SELECT is(repair_record_can_edit('00000000-0000-4000-d000-000000000006'), false, 'TECHNICIAN cannot edit another assignee''s ticket');
SELECT lives_ok($$ INSERT INTO repair_records (ticket_id, diagnosis_summary) VALUES ('00000000-0000-4000-d000-000000000004', '충전 IC 불량') $$,
  'TECHNICIAN inserts record on own ticket');
SELECT lives_ok($$ INSERT INTO ticket_symptoms (ticket_id, symptom_code_id) SELECT '00000000-0000-4000-d000-000000000004', id FROM symptom_codes WHERE code = 'BOOT' $$,
  'TECHNICIAN inserts symptom');
SELECT lives_ok($$ INSERT INTO repair_measurements (ticket_id, label, kind, value, unit, judgement) VALUES ('00000000-0000-4000-d000-000000000004', 'PPBUS_G3H', 'VOLTAGE', 0.2, 'V', 'ABNORMAL') $$,
  'TECHNICIAN inserts measurement');
SELECT lives_ok($$ INSERT INTO repair_faults (ticket_id, component, fault_type) VALUES ('00000000-0000-4000-d000-000000000004', 'U7000', 'SHORT') $$,
  'TECHNICIAN inserts fault');
SELECT lives_ok($$ INSERT INTO repair_actions (ticket_id, sort_order, action_type, description, succeeded) VALUES
  ('00000000-0000-4000-d000-000000000004', 1, 'REWORK', '재납땜', false), ('00000000-0000-4000-d000-000000000004', 2, 'REPLACE', 'U7000 교체', true) $$,
  'TECHNICIAN inserts actions (failed attempt kept)');
SELECT lives_ok($$ INSERT INTO ticket_removed_parts (ticket_id, description) VALUES ('00000000-0000-4000-d000-000000000004', '기존 충전 IC') $$,
  'TECHNICIAN inserts removed part (undecided)');
SELECT throws_ok($$ INSERT INTO repair_records (ticket_id) VALUES ('00000000-0000-4000-d000-000000000006') $$,
  '42501', NULL, 'TECHNICIAN cannot insert on a ticket not assigned to them');
SELECT throws_ok($$ INSERT INTO symptom_codes (code, name) VALUES ('X', '엑스') $$, '42501', NULL, 'TECHNICIAN cannot add symptom codes');
SELECT throws_ok($$ UPDATE ticket_removed_parts SET inbound_approved_at = now() $$, '42501', NULL, 'RPC-only column not writable');
SELECT throws_ok($$ UPDATE ticket_removed_parts SET inventory_item_id = '00000000-0000-4000-b400-000000000001' $$, '42501', NULL, 'inventory_item_id not writable');
SELECT throws_ok($$ UPDATE ticket_removed_parts SET handled_by = '00000000-0000-4000-a000-000000000001' $$, '42501', NULL, 'handled_by not writable');
SELECT throws_ok($$ INSERT INTO ticket_close_overrides (ticket_id, gate, reason, missing, overridden_by) VALUES ('00000000-0000-4000-d000-000000000004', 'APPROVAL', 'r', '[]', '00000000-0000-4000-a000-000000000004') $$,
  '42501', NULL, 'overrides not writable directly');
SELECT is((SELECT count(*)::int FROM ticket_close_overrides), 0, 'TECHNICIAN sees no overrides');
RESET ROLE;
SELECT is((SELECT created_by FROM repair_records WHERE ticket_id = '00000000-0000-4000-d000-000000000004'),
  '00000000-0000-4000-a000-000000000004'::uuid, 'created_by defaults to caller');
SELECT is((SELECT handled_at FROM ticket_removed_parts WHERE description = '기존 충전 IC'), NULL, 'undecided part has no handled_at');

-- disposition stamp
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
UPDATE ticket_removed_parts SET disposition = 'DISCARD' WHERE description = '기존 충전 IC';
RESET ROLE;
SELECT is((SELECT handled_by FROM ticket_removed_parts WHERE description = '기존 충전 IC'),
  '00000000-0000-4000-a000-000000000004'::uuid, 'handled_by stamped when disposition is set');
SELECT isnt((SELECT handled_at FROM ticket_removed_parts WHERE description = '기존 충전 IC'), NULL, 'handled_at stamped');

-- other roles
SELECT pg_temp.jwt('5');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM repair_records), 1, 'other staff (EXPERT_REPAIR) can read records (Q7)');
UPDATE repair_records SET notes = 'x' WHERE ticket_id = '00000000-0000-4000-d000-000000000004';
DELETE FROM repair_actions WHERE ticket_id = '00000000-0000-4000-d000-000000000004';
RESET ROLE;
SELECT is((SELECT notes FROM repair_records WHERE ticket_id = '00000000-0000-4000-d000-000000000004'), NULL, 'unassigned EXPERT_REPAIR update affects nothing');
SELECT is((SELECT count(*)::int FROM repair_actions), 2, 'unassigned EXPERT_REPAIR delete affects nothing');

SELECT pg_temp.jwt('3');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ INSERT INTO repair_faults (ticket_id, component) VALUES ('00000000-0000-4000-d000-000000000004', 'x') $$, '42501', NULL, 'RECEPTION cannot write');
RESET ROLE;
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM repair_faults), 1, 'CS can read');
SELECT throws_ok($$ INSERT INTO repair_faults (ticket_id, component) VALUES ('00000000-0000-4000-d000-000000000004', 'x') $$, '42501', NULL, 'CS cannot write');
RESET ROLE;

SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ UPDATE repair_records SET fault_category = 'MAINBOARD' WHERE ticket_id = '00000000-0000-4000-d000-000000000004' $$, 'MANAGER edits open ticket');
SELECT is(repair_record_can_edit('00000000-0000-4000-d000-000000000006'), false, 'MANAGER cannot edit approved ticket');
SELECT is(repair_record_can_edit('00000000-0000-4000-d000-000000000007'), false, 'MANAGER cannot edit canceled ticket');
SELECT throws_ok($$ INSERT INTO repair_records (ticket_id) VALUES ('00000000-0000-4000-d000-000000000006') $$, '42501', NULL, 'MANAGER insert on approved ticket refused');
RESET ROLE;
SELECT is((SELECT fault_category FROM repair_records WHERE ticket_id = '00000000-0000-4000-d000-000000000004'), 'MAINBOARD', 'MANAGER edit applied');
SELECT is((SELECT updated_by FROM repair_records WHERE ticket_id = '00000000-0000-4000-d000-000000000004'),
  '00000000-0000-4000-a000-000000000002'::uuid, 'updated_by = last editor');

SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO repair_records (ticket_id, diagnosis_summary) VALUES ('00000000-0000-4000-d000-000000000006', '사후 보완') $$, 'ADMIN edits approved ticket');
SELECT lives_ok($$ INSERT INTO symptom_codes (code, name, parent_id) SELECT 'POWER.NO_POWER', '전원 안 켜짐', id FROM symptom_codes WHERE code = 'POWER' $$, 'ADMIN adds child symptom code');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT count(*) FROM repair_records $$, '42501', NULL, 'anon has no table access');
SELECT throws_ok($$ SELECT count(*) FROM repair_parts_used $$, '42501', NULL, 'anon has no view access');
RESET ROLE;

-- ---------- 4. repair_gate_check ----------
-- ticket 09: nothing recorded
SELECT is(repair_gate_check('00000000-0000-4000-d000-000000000009', 'APPROVAL')->'missing',
  '["진단 요약", "수리 결과(완료/부분수리)", "증상", "조치 내역", "적출 부품 확인"]'::jsonb, 'approval: every missing item listed');
-- ticket 04: summary, symptom, actions present; result + confirmation missing; removed part decided
SELECT is(repair_gate_check('00000000-0000-4000-d000-000000000004', 'APPROVAL')->'missing',
  '["수리 결과(완료/부분수리)", "적출 부품 확인"]'::jsonb, 'approval: only the remaining items');
INSERT INTO ticket_removed_parts (ticket_id, description) VALUES ('00000000-0000-4000-d000-000000000004', '미정 부품');
UPDATE repair_records SET result = 'UNREPAIRABLE', removed_parts_confirmed = true WHERE ticket_id = '00000000-0000-4000-d000-000000000004';
SELECT is(repair_gate_check('00000000-0000-4000-d000-000000000004', 'APPROVAL')->'missing',
  '["수리 결과(완료/부분수리)", "처리 방법 미정인 적출 부품 1건"]'::jsonb, 'approval: cancel-type result does not count; undecided part reported');
SELECT is(repair_gate_check('00000000-0000-4000-d000-000000000004', 'CANCEL')->'missing',
  '["처리 방법 미정인 적출 부품 1건"]'::jsonb, 'cancel (received): undecided part blocks');
UPDATE ticket_removed_parts SET disposition = 'CUSTOMER_RETURN' WHERE description = '미정 부품';
SELECT is(repair_gate_check('00000000-0000-4000-d000-000000000004', 'CANCEL')->>'ok', 'true', 'cancel: complete');
UPDATE repair_records SET result = 'PARTIAL' WHERE ticket_id = '00000000-0000-4000-d000-000000000004';
SELECT is(repair_gate_check('00000000-0000-4000-d000-000000000004', 'APPROVAL')->>'ok', 'true', 'approval: complete record passes');
SELECT is(repair_gate_check('00000000-0000-4000-d000-000000000004', 'CANCEL')->'missing',
  '["취소 구분(수리불가/고객포기/단순취소)"]'::jsonb, 'cancel: completion-type result does not count');
-- pre-receipt ticket: result only
SELECT is(repair_gate_check('00000000-0000-4000-d000-000000000001', 'CANCEL')->'missing',
  '["취소 구분(수리불가/고객포기/단순취소)"]'::jsonb, 'cancel pre-receipt: only the cancel type is required');
SELECT throws_ok($$ SELECT repair_gate_check('00000000-0000-4000-d000-000000000004', 'CLOSE') $$, 'P0001', '알 수 없는 확인 유형입니다.', 'unknown gate rejected');
-- invoker: a technician cannot check a ticket they cannot see
SELECT pg_temp.jwt('5');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT repair_gate_check('00000000-0000-4000-d000-000000000004', 'APPROVAL') $$, 'P0001', '접수건을 찾을 수 없습니다.', 'gate check respects ticket RLS');
RESET ROLE;

-- ---------- 5. repair_set_cancel_result ----------
SELECT pg_temp.jwt('3');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT repair_set_cancel_result('00000000-0000-4000-d000-000000000001', 'SIMPLE_CANCEL') $$, 'RECEPTION sets cancel type on NEW ticket');
SELECT throws_ok($$ SELECT repair_set_cancel_result('00000000-0000-4000-d000-000000000002', 'SIMPLE_CANCEL') $$, 'P0001', '취소 구분을 저장할 권한이 없습니다.', 'RECEPTION refused on ASSIGNED ticket');
SELECT throws_ok($$ SELECT repair_set_cancel_result('00000000-0000-4000-d000-000000000001', 'COMPLETED') $$, 'P0001', '취소 구분을 선택해 주세요.', 'non-cancel value refused');
RESET ROLE;
SELECT is(repair_gate_check('00000000-0000-4000-d000-000000000001', 'CANCEL')->>'ok', 'true', 'pre-receipt cancel gate passes after cancel type');
SELECT pg_temp.jwt('5');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT repair_set_cancel_result('00000000-0000-4000-d000-000000000004', 'UNREPAIRABLE') $$, 'P0001', '취소 구분을 저장할 권한이 없습니다.', 'unassigned EXPERT_REPAIR refused');
RESET ROLE;
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT repair_set_cancel_result('00000000-0000-4000-d000-000000000001', 'SIMPLE_CANCEL') $$, 'P0001', '취소 구분을 저장할 권한이 없습니다.', 'CS refused');
RESET ROLE;
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT repair_set_cancel_result('00000000-0000-4000-d000-000000000004', 'CUSTOMER_ABANDONED') $$, 'assigned TECHNICIAN sets cancel type');
SELECT throws_ok($$ SELECT repair_set_cancel_result('00000000-0000-4000-d000-000000000007', 'UNREPAIRABLE') $$, 'P0001', '완료되었거나 이미 취소된 접수건입니다.', 'canceled ticket refused');
RESET ROLE;
SELECT is((SELECT result || '|' || diagnosis_summary FROM repair_records WHERE ticket_id = '00000000-0000-4000-d000-000000000004'),
  'CUSTOMER_ABANDONED|충전 IC 불량', 'cancel type saved, other fields kept');

-- ---------- 6. repair_gate_override ----------
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT repair_gate_override('00000000-0000-4000-d000-000000000009', 'APPROVAL', '급함') $$, 'P0001', '강제 진행은 관리자만 할 수 있습니다.', 'MANAGER cannot override');
RESET ROLE;
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT repair_gate_override('00000000-0000-4000-d000-000000000009', 'APPROVAL', '  ') $$, 'P0001', '강제 진행 사유를 입력해 주세요.', 'empty reason refused');
INSERT INTO res SELECT 'ovr', to_jsonb(repair_gate_override('00000000-0000-4000-d000-000000000009', 'APPROVAL', '고객 급한 출고'));
INSERT INTO res SELECT 'ovr_ok', to_jsonb(repair_gate_override('00000000-0000-4000-d000-000000000001', 'CANCEL', '불필요'));
RESET ROLE;
SELECT isnt((SELECT v FROM res WHERE k = 'ovr'), NULL, 'ADMIN override returns an id');
SELECT is((SELECT v FROM res WHERE k = 'ovr_ok'), NULL, 'nothing to override → no row');
SELECT is((SELECT count(*)::int FROM ticket_close_overrides), 1, 'exactly one override row');
SELECT is((SELECT jsonb_array_length(missing) FROM ticket_close_overrides), 5, 'override stores the missing snapshot');
SELECT is((SELECT overridden_by FROM ticket_close_overrides), '00000000-0000-4000-a000-000000000001'::uuid, 'override records the admin');
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM ticket_close_overrides), 1, 'MANAGER can read overrides');
RESET ROLE;

-- ---------- 7. lock after approval / cancel ----------
UPDATE repair_tickets SET status = 'CANCELED', canceled_at = now() WHERE id = '00000000-0000-4000-d000-000000000004';
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
UPDATE repair_records SET notes = 'after cancel' WHERE ticket_id = '00000000-0000-4000-d000-000000000004';
SELECT throws_ok($$ INSERT INTO repair_actions (ticket_id, description) VALUES ('00000000-0000-4000-d000-000000000004', 'late') $$, '42501', NULL, 'TECHNICIAN locked out after cancel');
RESET ROLE;
SELECT is((SELECT notes FROM repair_records WHERE ticket_id = '00000000-0000-4000-d000-000000000004'), NULL, 'record frozen for TECHNICIAN after cancel');
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ UPDATE repair_records SET notes = 'admin fix' WHERE ticket_id = '00000000-0000-4000-d000-000000000004' $$, 'ADMIN can still edit after cancel');
RESET ROLE;
SELECT is((SELECT notes FROM repair_records WHERE ticket_id = '00000000-0000-4000-d000-000000000004'), 'admin fix', 'ADMIN edit applied');

-- ---------- 8. parts-used view ----------
SELECT is((SELECT count(*)::int FROM repair_parts_used), (SELECT count(*)::int FROM ticket_materials WHERE request_status IN ('approved', 'cancel_requested')),
  'view lists approved / cancel_requested materials only');
SELECT is((SELECT is_outsourced FROM repair_parts_used WHERE material_id = '00000000-0000-4000-e000-000000000007'), true, 'outsourced material flagged');
SELECT is((SELECT product_name || '/' || capacity FROM repair_parts_used WHERE material_id = '00000000-0000-4000-e000-000000000005'), '삼성/512GB', 'view shows item names');

-- ---------- 9. privileges / definitions ----------
SELECT ok((has_function_privilege('anon', 'public.repair_gate_check(uuid, text)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.repair_gate_check(uuid, text)'::regprocedure))
      AND (has_function_privilege('anon', 'public.repair_set_cancel_result(uuid, text)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.repair_set_cancel_result(uuid, text)'::regprocedure))
      AND (has_function_privilege('anon', 'public.repair_gate_override(uuid, text, text)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.repair_gate_override(uuid, text, text)'::regprocedure))
      AND (has_function_privilege('anon', 'public.repair_record_can_edit(uuid)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.repair_record_can_edit(uuid)'::regprocedure)), 'anon cannot execute repair functions (R10: EXECUTE granted, refused by the in-function guard)');
SELECT ok(has_function_privilege('authenticated', 'public.repair_gate_check(uuid, text)', 'EXECUTE')
      AND has_function_privilege('authenticated', 'public.repair_gate_override(uuid, text, text)', 'EXECUTE'), 'authenticated can execute gate functions');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE 'repair\_%' AND p.proconfig IS NULL), 0, 'every repair_* function sets search_path');
SELECT is((SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relrowsecurity
              AND c.relname IN ('symptom_codes', 'ticket_symptoms', 'repair_records', 'repair_measurements', 'repair_faults',
                                'repair_actions', 'ticket_removed_parts', 'ticket_close_overrides')), 8, 'RLS enabled on all 8 new tables');

SELECT * FROM finish();
ROLLBACK;
