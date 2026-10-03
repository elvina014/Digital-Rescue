-- =============================================================
-- Phase 2 — transactional RPCs: register / approve extracted part, confirm material return,
--           removed-part inbound (no ticket_materials row)
-- Run: npx supabase test db   (local only; everything is rolled back)
-- Seed users: a…01 ADMIN, 02 MANAGER, 03 RECEPTION, 04 TECHNICIAN, 05 EXPERT_REPAIR, 06 CS
-- Seed items: b400…01 RAM/노트북용 DDR4/삼성 DDR4-3200 8GB USED qty 3 · …02 same product 16GB NEW qty 0
--             …03 저장장치/M.2 NVMe/삼성 512GB NEW qty 2 · …04 WD 256GB USED qty 1 · …05 외주 qty 99
--             …06 RAM/노트북용 DDR4/하이닉스 DDR4 8GB USED qty 0
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

-- fixtures (same shapes as supabase/test-fixtures/phase2_flow/setup.sql)
INSERT INTO ticket_materials
  (id, ticket_id, inventory_item_id, quantity, request_status, request_type, created_by,
   is_return_registered, return_category_id, return_spec, return_name, return_condition, return_status, return_quantity, return_capacity)
VALUES
  ('00000000-0000-4000-e000-000000000021', '00000000-0000-4000-d000-000000000007', '00000000-0000-4000-b400-000000000002', 1, 'cancel_requested', 'purchase', '00000000-0000-4000-a000-000000000004', false, NULL, NULL, NULL, NULL, NULL, 1, NULL),
  ('00000000-0000-4000-e000-000000000022', '00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b400-000000000001', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004',
   true, '00000000-0000-4000-b100-000000000001', '노트북용 DDR4', '삼성 DDR4-3200', '중고품', 'pending', 2, '8GB'),
  ('00000000-0000-4000-e000-000000000023', '00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b400-000000000001', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004',
   true, '00000000-0000-4000-b100-000000000001', '신규스펙', '신규제품', '불량품', 'pending', 1, NULL),
  ('00000000-0000-4000-e000-000000000024', '00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b400-000000000003', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004',
   true, '00000000-0000-4000-b100-000000000001', '노트북용 DDR4', '하이닉스 DDR4', '중고품', 'pending', 1, NULL),
  ('00000000-0000-4000-e000-000000000025', '00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b400-000000000004', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004',
   true, NULL, 'M.2 NVMe', 'WD', '중고품', 'pending', 1, '256GB'),
  -- legacy row with an over-long capacity → forces a failure inside the inbound step (atomicity)
  ('00000000-0000-4000-e000-000000000026', '00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b400-000000000001', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004',
   true, '00000000-0000-4000-b100-000000000001', '원자성스펙', '원자성제품', '중고품', 'pending', 1, repeat('가', 51));
UPDATE ticket_materials SET request_status = 'approved' WHERE id = '00000000-0000-4000-e000-000000000002';

CREATE TEMP TABLE before AS
  SELECT (SELECT count(*) FROM inventory_transactions) AS tx, (SELECT count(*) FROM ticket_logs) AS logs,
         (SELECT count(*) FROM inventory_specs) AS specs, (SELECT count(*) FROM inventory_items) AS items;
GRANT ALL ON before TO authenticated;

-- ---------- 1. register_return_material ----------
SELECT pg_temp.jwt('3');
SET LOCAL ROLE authenticated;
SELECT is(register_return_material('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-b100-000000000002', 'M.2 NVMe', 'WD', '중고품', 1, '256GB')->>'error',
  '적출품 등록 권한이 없습니다.', 'register: RECEPTION refused');
RESET ROLE;
SELECT pg_temp.jwt('5');
SET LOCAL ROLE authenticated;
SELECT is(register_return_material('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-b100-000000000002', 'M.2 NVMe', 'WD', '중고품', 1, '256GB')->>'error',
  '적출품 등록 권한이 없습니다.', 'register: unassigned EXPERT_REPAIR refused');
SELECT is(register_return_material('00000000-0000-4000-e000-000000000006', '00000000-0000-4000-b100-000000000001', '노트북용 DDR4', '삼성 DDR4-3200', '중고품', 1, NULL)->>'success',
  'true', 'register: assigned EXPERT_REPAIR allowed (own ticket)');
RESET ROLE;
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT is(register_return_material('00000000-0000-4000-e000-0000000000ff', '00000000-0000-4000-b100-000000000002', 'a', 'b', '중고품', 1, NULL)->>'error',
  '자재 항목을 찾을 수 없습니다.', 'register: unknown id');
SELECT is(register_return_material('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-b100-000000000002', 'a', 'b', '중고품', 1, NULL)->>'error',
  '승인/취소 상태의 자재만 반환 등록이 가능합니다.', 'register: pending material refused (same message)');
SELECT is(register_return_material('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-b100-000000000002', 'a', 'b', '중고품', 1, repeat('x', 51))->>'error',
  '용량은 50자 이내로 입력해 주세요.', 'register: capacity over 50 chars refused (D5)');
SELECT is(register_return_material('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-b100-000000000002', ' M.2 NVMe ', 'WD', '중고품', 0, '256GB')->>'success',
  'true', 'register: assigned TECHNICIAN ok');
SELECT is(register_return_material('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-b100-000000000002', 'M.2 NVMe', 'WD', '중고품', 1, '256GB')->>'error',
  '이미 반환 등록된 항목입니다.', 'register: second time refused (same message)');
RESET ROLE;
SELECT is((SELECT return_spec || '|' || return_name || '|' || return_capacity || '|' || return_condition || '|' || return_quantity || '|' || return_status
             FROM ticket_materials WHERE id = '00000000-0000-4000-e000-000000000002'),
  'M.2 NVMe|WD|256GB|중고품|1|pending', 'register: columns set (trimmed, qty min 1, pending)');
SELECT is((SELECT count(*)::int FROM ticket_logs WHERE ticket_id = '00000000-0000-4000-d000-000000000004'
            AND employee_id = '00000000-0000-4000-a000-000000000004'
            AND message = '시스템: 적출 자재가 등록되었습니다. (M.2 NVMe / WD / 256GB / 중고품 × 1개)'), 1, 'register: log line identical to the old flow');

-- ---------- 2. approve_return_material ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT is(approve_return_material('00000000-0000-4000-e000-000000000022')->>'error', '입고 승인 권한이 없습니다.', 'approve: TECHNICIAN refused');
RESET ROLE;
SELECT is((SELECT return_status FROM ticket_materials WHERE id = '00000000-0000-4000-e000-000000000022'), 'pending', 'approve refused → still pending');

SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT is(approve_return_material('00000000-0000-4000-e000-0000000000ff')->>'error', '자재 항목을 찾을 수 없습니다.', 'approve: unknown id');
SELECT is(approve_return_material('00000000-0000-4000-e000-000000000001')->>'error', '입고 대기 상태가 아닙니다.', 'approve: not registered');
-- atomicity: failure inside the inbound step rolls back the status flip and the new spec
SELECT throws_ok($$ SELECT approve_return_material('00000000-0000-4000-e000-000000000026') $$, 'P0001', '용량은 50자 이내로 입력해 주세요.', 'approve: inbound failure raises');
INSERT INTO res SELECT 'a22', approve_return_material('00000000-0000-4000-e000-000000000022');
INSERT INTO res SELECT 'a23', approve_return_material('00000000-0000-4000-e000-000000000023');
INSERT INTO res SELECT 'a24', approve_return_material('00000000-0000-4000-e000-000000000024');
INSERT INTO res SELECT 'a25', approve_return_material('00000000-0000-4000-e000-000000000025');
INSERT INTO res SELECT 'a05', approve_return_material('00000000-0000-4000-e000-000000000005');
SELECT is(approve_return_material('00000000-0000-4000-e000-000000000022')->>'error', '입고 대기 상태가 아닙니다.', 'approve: second time refused');
RESET ROLE;

SELECT is((SELECT return_status FROM ticket_materials WHERE id = '00000000-0000-4000-e000-000000000026'), 'pending', 'atomic: status unchanged after failure');
SELECT is((SELECT count(*)::int FROM inventory_specs WHERE name = '원자성스펙'), 0, 'atomic: no spec left behind');

-- (c) Phase 7 (Q8): existing USED item with the same capacity is NOT incremented; qty 2 → two qty-1 rows
SELECT isnt((SELECT v->>'item_id' FROM res WHERE k = 'a22'), '00000000-0000-4000-b400-000000000001', 'same capacity → new unit row, not the existing item');
SELECT is((SELECT quantity FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000001'), 3, 'existing item quantity unchanged');
SELECT is((SELECT count(*)::int || '|' || sum(quantity) FROM inventory_items WHERE id <> '00000000-0000-4000-b400-000000000001'
            AND product_id = (SELECT product_id FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000001')
            AND capacity = '8GB' AND condition = 'USED'), '2|2', 'return qty 2 → two USED rows of quantity 1');
-- (d)(f) new spec + product, 불량품 still booked as USED, base_estimate 0, capacity NULL
SELECT is((SELECT i.condition || '|' || i.quantity || '|' || i.base_estimate || '|' || coalesce(i.capacity, 'NULL') || '|' || s.name || '|' || p.name
             FROM inventory_items i JOIN inventory_specs s ON s.id = i.spec_id JOIN inventory_products p ON p.id = i.product_id
            WHERE i.id = (SELECT (v->>'item_id')::uuid FROM res WHERE k = 'a23')),
  'USED|1|0|NULL|신규스펙|신규제품', 'new spec/product/item created (불량품 → USED, estimate 0)');
-- (g) D1: capacity is part of the match → the 8GB item is not touched, a NULL-capacity item is created
SELECT is((SELECT quantity FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000006'), 0, 'D1: item with another capacity not incremented');
SELECT is((SELECT capacity FROM inventory_items WHERE id = (SELECT (v->>'item_id')::uuid FROM res WHERE k = 'a24')), NULL, 'D1: new item without capacity');
-- legacy row without return_category_id → original item category
SELECT is((SELECT row(product_id, capacity, quantity)::text FROM inventory_items WHERE id = (SELECT (v->>'item_id')::uuid FROM res WHERE k = 'a25')),
          row('00000000-0000-4000-b300-000000000004'::uuid, '256GB', 1)::text, 'fallback category → new WD 256GB unit row');
SELECT is((SELECT quantity FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000004'), 1, 'fallback: existing WD 256GB item unchanged');
-- D1: capacity stored on a new item
SELECT is((SELECT capacity FROM inventory_items WHERE id = (SELECT (v->>'item_id')::uuid FROM res WHERE k = 'a05')), '256GB', 'D1: capacity stored on the new item');
-- INBOUND rows: user = ticket assignee, notes identical
SELECT is((SELECT count(*)::int FROM inventory_transactions WHERE notes = '적출품 반환 입고' AND transaction_type = 'INBOUND'
            AND user_id = '00000000-0000-4000-a000-000000000004' AND ticket_id = '00000000-0000-4000-d000-000000000005'), 6,
  'one INBOUND per unit (qty 2 → 2), booked to the assigned technician');
SELECT is((SELECT count(*)::int FROM inventory_transactions WHERE notes = '적출품 반환 입고' AND ticket_id = '00000000-0000-4000-d000-000000000005'
            AND quantity_changed <> 1), 0, 'every extracted INBOUND has quantity 1');
SELECT is((SELECT count(*)::int FROM ticket_logs WHERE employee_id = '00000000-0000-4000-a000-000000000002'
            AND message IN ('시스템: 적출 자재 입고 승인 완료 (RAM / 노트북용 DDR4 / 삼성 DDR4-3200 / 8GB / 중고품)',
                            '시스템: 적출 자재 입고 승인 완료 (RAM / 신규스펙 / 신규제품 / 불량품)',
                            '시스템: 적출 자재 입고 승인 완료 (저장장치 / M.2 NVMe / WD / 256GB / 중고품)')), 3, 'approve: log lines identical to the old flow');

-- D2 (Phase 7): two matching items → neither is touched, a new unit row is created
INSERT INTO inventory_items (id, category_id, spec_id, product_id, capacity, condition, quantity, base_estimate, created_at)
VALUES ('00000000-0000-4000-b400-0000000000d2', '00000000-0000-4000-b100-000000000002', '00000000-0000-4000-b200-000000000002',
        '00000000-0000-4000-b300-000000000004', '256GB', 'USED', 7, 0, now() + interval '1 hour');
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'a02', approve_return_material('00000000-0000-4000-e000-000000000002');
RESET ROLE;
SELECT ok((SELECT v->>'item_id' FROM res WHERE k = 'a02') NOT IN ('00000000-0000-4000-b400-000000000004', '00000000-0000-4000-b400-0000000000d2'), 'D2: new unit row');
SELECT is((SELECT quantity FROM inventory_items WHERE id = '00000000-0000-4000-b400-0000000000d2'), 7, 'D2: the other matching item untouched');
SELECT is((SELECT quantity FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000004'), 1, 'WD 256GB: oldest item unchanged (1)');

-- ---------- 3. confirm_material_return ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT is(confirm_material_return('00000000-0000-4000-e000-000000000007')->>'error', '반환 확인 권한이 없습니다.', 'confirm: TECHNICIAN refused');
RESET ROLE;
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT is(confirm_material_return('00000000-0000-4000-e000-000000000006')->>'error', '반환 대기 상태가 아닙니다. (현재: approved)', 'confirm: wrong status (same message)');
SELECT is(confirm_material_return('00000000-0000-4000-e000-000000000007')->>'success', 'true', 'confirm: dispatch');
SELECT is(confirm_material_return('00000000-0000-4000-e000-000000000021')->>'success', 'true', 'confirm: purchase');
SELECT is(confirm_material_return('00000000-0000-4000-e000-000000000007')->>'error', '반환 대기 상태가 아닙니다. (현재: cancelled)', 'confirm: second time refused');
RESET ROLE;
SELECT is((SELECT quantity FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000005'), 100, 'dispatch: stock restored (99 → 100)');
SELECT is((SELECT count(*)::int FROM inventory_transactions WHERE item_id = '00000000-0000-4000-b400-000000000005' AND transaction_type = 'INBOUND'
            AND notes = '접수 취소로 인한 자재 원복' AND quantity_changed = 1 AND user_id = '00000000-0000-4000-a000-000000000002'
            AND ticket_id = '00000000-0000-4000-d000-000000000007'), 1, 'dispatch: one INBOUND booked to the confirming manager');
SELECT is((SELECT quantity FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000002'), 0, 'purchase: stock unchanged');
SELECT is((SELECT count(*)::int FROM inventory_transactions WHERE item_id = '00000000-0000-4000-b400-000000000002'), 0, 'purchase: no transaction');
SELECT is((SELECT count(*)::int FROM ticket_materials WHERE id IN ('00000000-0000-4000-e000-000000000007', '00000000-0000-4000-e000-000000000021') AND request_status = 'cancelled'), 2, 'both materials cancelled');
SELECT is((SELECT material_cost FROM repair_tickets WHERE id = '00000000-0000-4000-d000-000000000007'), 0, 'material_cost recalculated (150000 → 0)');
SELECT is((SELECT count(*)::int FROM ticket_logs WHERE ticket_id = '00000000-0000-4000-d000-000000000007'
            AND message IN ('시스템: 자재 출고 반환이 확인되었습니다. (액정 / 외주 / 테스트외주업체 / 테스트 노트북 액정교체) (재고 복구 완료)',
                            '시스템: 자재 구매 반환이 확인되었습니다. (RAM / 노트북용 DDR4 / 삼성 DDR4-3200 / 16GB) (재고 복구 완료)')), 2, 'confirm: log lines identical to the old flow');

-- ---------- 4. removed part without a material row ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
-- (id is not insertable by API roles: column privileges)
INSERT INTO ticket_removed_parts (ticket_id, description, category_id, disposition, return_spec, return_name, return_capacity, return_condition, quantity)
VALUES ('00000000-0000-4000-d000-000000000009', '기존 SSD', '00000000-0000-4000-b100-000000000002', 'STOCK', 'M.2 NVMe', '마이크론', '1TB', '중고품', 1),
       ('00000000-0000-4000-d000-000000000009', '깨진 하판', NULL, 'DISCARD', NULL, NULL, NULL, NULL, 1);
SELECT is(approve_removed_part_inbound((SELECT id FROM ticket_removed_parts WHERE description = '기존 SSD'))->>'error', '입고 승인 권한이 없습니다.', 'removed part: TECHNICIAN cannot approve inbound');
RESET ROLE;
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT is(approve_removed_part_inbound((SELECT id FROM ticket_removed_parts WHERE description = '깨진 하판'))->>'error', '입고 대기 상태가 아닙니다.', 'removed part: non-STOCK refused');
INSERT INTO res SELECT 'rp', approve_removed_part_inbound((SELECT id FROM ticket_removed_parts WHERE description = '기존 SSD'));
SELECT is(approve_removed_part_inbound((SELECT id FROM ticket_removed_parts WHERE description = '기존 SSD'))->>'error', '입고 대기 상태가 아닙니다.', 'removed part: second approval refused');
RESET ROLE;
SELECT is((SELECT i.condition || '|' || i.quantity || '|' || i.capacity || '|' || p.name FROM inventory_items i JOIN inventory_products p ON p.id = i.product_id
            WHERE i.id = (SELECT (v->>'item_id')::uuid FROM res WHERE k = 'rp')), 'USED|1|1TB|마이크론', 'removed part booked as a normal inventory item');
SELECT is((SELECT inventory_item_id::text || '|' || inbound_approved_by::text FROM ticket_removed_parts WHERE description = '기존 SSD'),
  (SELECT v->>'item_id' FROM res WHERE k = 'rp') || '|00000000-0000-4000-a000-000000000002', 'removed part linked to the item and approver');
SELECT is((SELECT count(*)::int FROM inventory_transactions WHERE item_id = (SELECT (v->>'item_id')::uuid FROM res WHERE k = 'rp')
            AND transaction_type = 'INBOUND' AND ticket_id = '00000000-0000-4000-d000-000000000009' AND user_id = '00000000-0000-4000-a000-000000000004'), 1,
  'removed part: INBOUND transaction');
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
UPDATE ticket_removed_parts SET description = 'changed' WHERE description = '기존 SSD';
DELETE FROM ticket_removed_parts WHERE description = '기존 SSD';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM ticket_removed_parts WHERE description = '기존 SSD'), 1, 'booked removed part is frozen, even for ADMIN');

-- internal function: no ticket (Phase 4 donor path), callable only by the owner
SELECT lives_ok($$ SELECT ri_inbound_extracted_part('00000000-0000-4000-b100-000000000001', '노트북용 DDR4', '삼성 DDR4-3200', '8GB', 1, NULL, '00000000-0000-4000-a000-000000000001') $$,
  'internal inbound works without a ticket');
SELECT is((SELECT quantity FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000001'), 3, 'internal inbound did not touch the existing item');

-- ---------- 5. consistency ----------
SELECT is((SELECT count(*) FROM inventory_transactions) - (SELECT tx FROM before), 10::bigint, '10 new transactions in total (7 extracted units + 1 rollback + 1 removed part + 1 internal)');
SELECT is((SELECT count(*)::int FROM inventory_items WHERE quantity < 0), 0, 'no negative stock');

-- ---------- 6. privileges / definitions ----------
SELECT ok((has_function_privilege('anon', 'public.register_return_material(uuid, uuid, text, text, text, integer, text)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.register_return_material(uuid, uuid, text, text, text, integer, text)'::regprocedure))
      AND (has_function_privilege('anon', 'public.approve_return_material(uuid)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.approve_return_material(uuid)'::regprocedure))
      AND (has_function_privilege('anon', 'public.confirm_material_return(uuid)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.confirm_material_return(uuid)'::regprocedure))
      AND (has_function_privilege('anon', 'public.approve_removed_part_inbound(uuid)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.approve_removed_part_inbound(uuid)'::regprocedure)), 'anon cannot execute the flow RPCs (R10: EXECUTE granted, refused by the in-function guard)');
SELECT ok((has_function_privilege('authenticated', 'public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*authenticated[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid)'::regprocedure))
      AND (has_function_privilege('anon', 'public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid)'::regprocedure))
      AND (has_function_privilege('service_role', 'public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*service_role[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid)'::regprocedure)),
  'internal inbound function is not callable by API roles (R10: EXECUTE granted, refused by the in-function guard)');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('register_return_material', 'approve_return_material', 'confirm_material_return', 'approve_removed_part_inbound')
              AND p.prosecdef AND p.proconfig IS NOT NULL), 4, 'the 4 RPCs are SECURITY DEFINER with search_path');
-- existing dispatch approval function untouched by Phase 2
SELECT is((SELECT proconfig FROM pg_proc WHERE oid = 'public.approve_material_dispatch(uuid, uuid)'::regprocedure), NULL, 'approve_material_dispatch definition untouched');

SELECT * FROM finish();
ROLLBACK;
