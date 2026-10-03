-- =============================================================
-- Phase 6 — purchase guard (resources, reasons, logs, bypass trigger)
-- Run: npx supabase test db   (local only; everything is rolled back)
-- Seed users: a…01 ADMIN, 02 MANAGER, 03 RECEPTION, 04 TECHNICIAN, 05 EXPERT_REPAIR, 06 CS
-- Seed tickets: d…09 IN_PROGRESS assigned 04, d…04 IN_PROGRESS assigned 04 (no catalog), d…06 assigned 05
-- Seed catalog: model f200…02 NT950QED (board f400…02 linked)
-- =============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT * FROM no_plan();

CREATE TEMP TABLE res (k text PRIMARY KEY, v jsonb);
GRANT ALL ON res TO authenticated, anon, service_role;

CREATE FUNCTION pg_temp.jwt(p_n text) RETURNS text LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a000-00000000000' || p_n, 'role', 'authenticated')::text, true);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.jwt(text) TO authenticated, anon;

-- ---------- fixtures (as owner) ----------
UPDATE repair_tickets SET catalog_model_id = '00000000-0000-4000-f200-000000000002' WHERE id = '00000000-0000-4000-d000-000000000009';
UPDATE repair_tickets SET is_test = true WHERE id = '00000000-0000-4000-d000-000000000010';

INSERT INTO part_specs (id, part_type, name, compat_target) VALUES
  ('00000000-0000-4000-6200-000000000001', 'PANEL',   'PNL-A', 'MODEL'),   -- requested item's spec
  ('00000000-0000-4000-6200-000000000002', 'PANEL',   'PNL-B', 'MODEL'),   -- verified compatible (rank 1)
  ('00000000-0000-4000-6200-000000000003', 'PANEL',   'PNL-C', 'MODEL'),   -- inferred (rank 3)
  ('00000000-0000-4000-6200-000000000004', 'BATTERY', 'BAT-X', 'MODEL');   -- other part type, verified
INSERT INTO part_compatibility (part_spec_id, model_id, status, confidence) VALUES
  ('00000000-0000-4000-6200-000000000002', '00000000-0000-4000-f200-000000000002', 'compatible', 'verified'),
  ('00000000-0000-4000-6200-000000000003', '00000000-0000-4000-f200-000000000002', 'compatible', 'inferred'),
  ('00000000-0000-4000-6200-000000000004', '00000000-0000-4000-f200-000000000002', 'compatible', 'verified');

INSERT INTO inventory_categories (id, name) VALUES ('00000000-0000-4000-6100-000000000001', '테스트패널');
INSERT INTO inventory_specs (id, category_id, name) VALUES
  ('00000000-0000-4000-6300-000000000001', '00000000-0000-4000-6100-000000000001', '15인치');
INSERT INTO inventory_products (id, spec_id, name) VALUES
  ('00000000-0000-4000-6400-000000000001', '00000000-0000-4000-6300-000000000001', 'A사'),
  ('00000000-0000-4000-6400-000000000002', '00000000-0000-4000-6300-000000000001', 'B사');
INSERT INTO inventory_items (id, category_id, spec_id, product_id, capacity, condition, quantity, base_estimate, part_spec_id) VALUES
  -- I0 requested (qty 0)
  ('00000000-0000-4000-6500-000000000000', '00000000-0000-4000-6100-000000000001', '00000000-0000-4000-6300-000000000001', '00000000-0000-4000-6400-000000000001', '14인치',   'NEW',  0, 100000, '00000000-0000-4000-6200-000000000001'),
  -- I1 same product + capacity (case/space) → rule 2 (also same spec → listed once)
  ('00000000-0000-4000-6500-000000000001', '00000000-0000-4000-6100-000000000001', '00000000-0000-4000-6300-000000000001', '00000000-0000-4000-6400-000000000001', ' 14인치 ', 'USED', 1, 60000,  '00000000-0000-4000-6200-000000000001'),
  -- I2 same product, other capacity → not counted
  ('00000000-0000-4000-6500-000000000002', '00000000-0000-4000-6100-000000000001', '00000000-0000-4000-6300-000000000001', '00000000-0000-4000-6400-000000000001', '15인치',   'NEW',  3, 100000, NULL),
  -- I3 same spec, other product → rule 3
  ('00000000-0000-4000-6500-000000000003', '00000000-0000-4000-6100-000000000001', '00000000-0000-4000-6300-000000000001', '00000000-0000-4000-6400-000000000002', 'x',        'USED', 2, 50000,  '00000000-0000-4000-6200-000000000001'),
  -- I4 verified compatible spec, same type → rule 4
  ('00000000-0000-4000-6500-000000000004', '00000000-0000-4000-6100-000000000001', '00000000-0000-4000-6300-000000000001', '00000000-0000-4000-6400-000000000002', 'y',        'NEW',  1, 90000,  '00000000-0000-4000-6200-000000000002'),
  -- I5 rank-3 spec → not counted
  ('00000000-0000-4000-6500-000000000005', '00000000-0000-4000-6100-000000000001', '00000000-0000-4000-6300-000000000001', '00000000-0000-4000-6400-000000000002', 'z',        'NEW',  5, 90000,  '00000000-0000-4000-6200-000000000003'),
  -- I6 other part type → not counted
  ('00000000-0000-4000-6500-000000000006', '00000000-0000-4000-6100-000000000001', '00000000-0000-4000-6300-000000000001', '00000000-0000-4000-6400-000000000002', 'w',        'NEW',  4, 90000,  '00000000-0000-4000-6200-000000000004'),
  -- I8 same spec, qty 0 → not counted
  ('00000000-0000-4000-6500-000000000008', '00000000-0000-4000-6100-000000000001', '00000000-0000-4000-6300-000000000001', '00000000-0000-4000-6400-000000000002', 'v',        'NEW',  0, 90000,  '00000000-0000-4000-6200-000000000001');
-- outsourced seed item (qty 99) linked to the same spec → not counted (Q5)
UPDATE inventory_items SET part_spec_id = '00000000-0000-4000-6200-000000000001' WHERE id = '00000000-0000-4000-b400-000000000005';

-- donors: D1 AVAILABLE model 02; D2 SCRAPPED; D3 AVAILABLE but from an is_test ticket
INSERT INTO donor_devices (id, source_ticket_id, device_type, brand, catalog_model_id, status, storage_note,
                           consent_confirmed_by, consent_confirmed_at) VALUES
  ('00000000-0000-4000-6600-000000000001', '00000000-0000-4000-d000-000000000007', '노트북', '삼성', '00000000-0000-4000-f200-000000000002', 'AVAILABLE', '선반 B', '00000000-0000-4000-a000-000000000002', now()),
  ('00000000-0000-4000-6600-000000000002', '00000000-0000-4000-d000-000000000008', '노트북', '삼성', '00000000-0000-4000-f200-000000000002', 'SCRAPPED',  NULL,     '00000000-0000-4000-a000-000000000002', now()),
  ('00000000-0000-4000-6600-000000000003', '00000000-0000-4000-d000-000000000010', '노트북', '삼성', '00000000-0000-4000-f200-000000000002', 'AVAILABLE', NULL,     '00000000-0000-4000-a000-000000000002', now());
INSERT INTO donor_part_candidates (id, donor_id, description, part_spec_id, condition_estimate, status, category_id, return_spec, return_name) VALUES
  -- C1 same spec, GOOD, also same category → rule 5 (listed once)
  ('00000000-0000-4000-6700-000000000001', '00000000-0000-4000-6600-000000000001', '패널 A', '00000000-0000-4000-6200-000000000001', 'GOOD',     'AVAILABLE', '00000000-0000-4000-6100-000000000001', NULL, NULL),
  -- C2 same spec FAULTY → not counted
  ('00000000-0000-4000-6700-000000000002', '00000000-0000-4000-6600-000000000001', '패널 불량', '00000000-0000-4000-6200-000000000001', 'FAULTY', 'AVAILABLE', '00000000-0000-4000-6100-000000000001', NULL, NULL),
  -- C3 same model, same category, no spec → rule 6
  ('00000000-0000-4000-6700-000000000003', '00000000-0000-4000-6600-000000000001', '패널 (규격 미확인)', NULL, 'UNTESTED', 'AVAILABLE', '00000000-0000-4000-6100-000000000001', NULL, NULL),
  -- C4 same model, other category → not counted
  ('00000000-0000-4000-6700-000000000004', '00000000-0000-4000-6600-000000000001', 'RAM', NULL, 'GOOD', 'AVAILABLE', '00000000-0000-4000-b100-000000000001', NULL, NULL),
  -- C5 compatible spec, REQUESTED → rule 5
  ('00000000-0000-4000-6700-000000000005', '00000000-0000-4000-6600-000000000001', '패널 B', '00000000-0000-4000-6200-000000000002', 'GOOD', 'REQUESTED', '00000000-0000-4000-6100-000000000001', '15인치', 'B사'),
  -- C6 same category without spec, REQUESTED → not counted (rule 6 = AVAILABLE only)
  ('00000000-0000-4000-6700-000000000006', '00000000-0000-4000-6600-000000000001', '패널 요청중', NULL, 'GOOD', 'REQUESTED', '00000000-0000-4000-6100-000000000001', '15인치', 'C사'),
  -- C7 scrapped donor, C8 test donor → not counted
  ('00000000-0000-4000-6700-000000000007', '00000000-0000-4000-6600-000000000002', '패널 A', '00000000-0000-4000-6200-000000000001', 'GOOD', 'AVAILABLE', NULL, NULL, NULL),
  ('00000000-0000-4000-6700-000000000008', '00000000-0000-4000-6600-000000000003', '패널 A', '00000000-0000-4000-6200-000000000001', 'GOOD', 'AVAILABLE', NULL, NULL, NULL);

-- materials (all pending)
INSERT INTO ticket_materials (id, ticket_id, inventory_item_id, quantity, request_status, request_type, created_by) VALUES
  ('00000000-0000-4000-6800-000000000001', '00000000-0000-4000-d000-000000000009', '00000000-0000-4000-6500-000000000000', 1, 'pending', 'purchase', '00000000-0000-4000-a000-000000000004'),
  ('00000000-0000-4000-6800-000000000002', '00000000-0000-4000-d000-000000000009', '00000000-0000-4000-6500-000000000001', 1, 'pending', 'dispatch', '00000000-0000-4000-a000-000000000004'),
  ('00000000-0000-4000-6800-000000000003', '00000000-0000-4000-d000-000000000009', '00000000-0000-4000-b400-000000000005', 1, 'pending', 'purchase', '00000000-0000-4000-a000-000000000004'),
  ('00000000-0000-4000-6800-000000000004', '00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b400-000000000002', 1, 'pending', 'purchase', '00000000-0000-4000-a000-000000000004'),
  ('00000000-0000-4000-6800-000000000005', '00000000-0000-4000-d000-000000000006', '00000000-0000-4000-b400-000000000002', 1, 'pending', 'purchase', '00000000-0000-4000-a000-000000000005'),
  ('00000000-0000-4000-6800-000000000006', '00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b400-000000000002', 1, 'pending', 'purchase', '00000000-0000-4000-a000-000000000004'),
  ('00000000-0000-4000-6800-000000000007', '00000000-0000-4000-d000-000000000009', '00000000-0000-4000-6500-000000000000', 1, 'pending', 'purchase', '00000000-0000-4000-a000-000000000004');

INSERT INTO res VALUES ('stock_before', (SELECT jsonb_object_agg(id, quantity) FROM inventory_items)),
                       ('tx_before', to_jsonb((SELECT count(*) FROM inventory_transactions)));

-- ---------- 1. flag OFF: old behaviour ----------
SELECT is((SELECT ri_purchase_guard_enabled FROM global_settings WHERE id), false, 'flag defaults to OFF');
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT request_purchase_material('00000000-0000-4000-6800-000000000001', 'LEAD_TIME') $$,
                 'P0001', '구매 요청 확인 기능이 꺼져 있습니다.', 'RPC refused while flag OFF');
SELECT is((SELECT (purchase_guard_check('00000000-0000-4000-6800-000000000001'))->>'enabled'), 'false', 'check reports enabled=false');
RESET ROLE;
SELECT lives_ok($$ UPDATE ticket_materials SET request_status = 'requested' WHERE id = '00000000-0000-4000-6800-000000000006' $$,
                'flag OFF: direct pending → requested on a purchase still works (trigger no-op)');

UPDATE global_settings SET ri_purchase_guard_enabled = true WHERE id;

-- ---------- 2. resource rules ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
INSERT INTO res VALUES ('chk1', purchase_guard_check('00000000-0000-4000-6800-000000000001'));
RESET ROLE;
SELECT is((SELECT v->>'resource_count' FROM res WHERE k = 'chk1'), '6', 'six resources found');
SELECT results_eq(
  $$ SELECT e->>'source', e->>'ref_id' FROM res, jsonb_array_elements(v->'resources') e WHERE k = 'chk1'
      ORDER BY (e->>'rule')::int, e->>'ref_id' $$,
  $$ VALUES ('STOCK_SAME_PRODUCT', '00000000-0000-4000-6500-000000000001'),
            ('STOCK_SAME_SPEC',    '00000000-0000-4000-6500-000000000003'),
            ('STOCK_COMPATIBLE',   '00000000-0000-4000-6500-000000000004'),
            ('DONOR_SAME_SPEC',    '00000000-0000-4000-6700-000000000001'),
            ('DONOR_SAME_SPEC',    '00000000-0000-4000-6700-000000000005'),
            ('DONOR_SAME_DEVICE',  '00000000-0000-4000-6700-000000000003') $$,
  'rules 1-6: exactly the expected rows, duplicates once under the first rule');
SELECT ok(NOT EXISTS (SELECT 1 FROM res, jsonb_array_elements(v->'resources') e WHERE k = 'chk1'
                       AND e->>'ref_id' IN ('00000000-0000-4000-6500-000000000002', '00000000-0000-4000-6500-000000000005',
                                            '00000000-0000-4000-6500-000000000006', '00000000-0000-4000-6500-000000000008',
                                            '00000000-0000-4000-b400-000000000005', '00000000-0000-4000-6700-000000000002',
                                            '00000000-0000-4000-6700-000000000004', '00000000-0000-4000-6700-000000000006',
                                            '00000000-0000-4000-6700-000000000007', '00000000-0000-4000-6700-000000000008')),
          'negatives (other capacity, rank 3, other type, qty 0, 외주, FAULTY, other category, REQUESTED w/o spec, scrapped, test donor) not counted');
SELECT is((SELECT e->>'note' FROM res, jsonb_array_elements(v->'resources') e WHERE k = 'chk1'
            AND e->>'ref_id' = '00000000-0000-4000-6700-000000000001'),
          (SELECT donor_no || ' · 선반 B' FROM donor_devices WHERE id = '00000000-0000-4000-6600-000000000001'),
          'donor note = donor no. + storage note');
SELECT ok((SELECT v::text NOT LIKE '%base_estimate%' AND v::text NOT LIKE '%100000%' AND v::text NOT LIKE '%60000%'
             AND v::text NOT LIKE '%final_price%' AND v::text NOT LIKE '%customer%' AND v::text NOT LIKE '%테스트고객%'
             FROM res WHERE k = 'chk1'), 'no prices, no customer data in the check result');
SELECT is((SELECT v->>'item_label' FROM res WHERE k = 'chk1'), '테스트패널 / 15인치 / A사 / 14인치 (신품)', 'item label');

-- ---------- 3. roles (read-only check) ----------
SELECT pg_temp.jwt('1'); SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT purchase_guard_check('00000000-0000-4000-6800-000000000001') $$, 'ADMIN may check');
RESET ROLE; SELECT pg_temp.jwt('2'); SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT purchase_guard_check('00000000-0000-4000-6800-000000000001') $$, 'MANAGER may check');
RESET ROLE; SELECT pg_temp.jwt('3'); SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT purchase_guard_check('00000000-0000-4000-6800-000000000001') $$, 'P0001', '구매 요청 권한이 없습니다.', 'RECEPTION refused');
RESET ROLE; SELECT pg_temp.jwt('5'); SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT purchase_guard_check('00000000-0000-4000-6800-000000000001') $$, 'P0001', '구매 요청 권한이 없습니다.', 'unassigned EXPERT_REPAIR refused');
SELECT lives_ok($$ SELECT purchase_guard_check('00000000-0000-4000-6800-000000000005') $$, 'assigned EXPERT_REPAIR may check');
RESET ROLE; SELECT pg_temp.jwt('6'); SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT purchase_guard_check('00000000-0000-4000-6800-000000000001') $$, 'P0001', '구매 요청 권한이 없습니다.', 'CS refused');
SELECT throws_ok($$ SELECT request_purchase_material('00000000-0000-4000-6800-000000000001', 'LEAD_TIME') $$, 'P0001', '구매 요청 권한이 없습니다.', 'CS cannot request');
RESET ROLE;
SELECT pg_temp.jwt('4'); SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT purchase_guard_check('00000000-0000-4000-6800-000000000002') $$, 'P0001', '구매 요청 항목이 아닙니다.', 'dispatch row refused (check)');
SELECT throws_ok($$ SELECT request_purchase_material('00000000-0000-4000-6800-000000000002') $$, 'P0001', '구매 요청 항목이 아닙니다.', 'dispatch row refused (request)');
SELECT throws_ok($$ SELECT purchase_guard_check(gen_random_uuid()) $$, 'P0001', '자재 항목을 찾을 수 없습니다.', 'unknown material');
RESET ROLE;

-- ---------- 4. bypass protection (flag ON) ----------
SELECT throws_ok($$ UPDATE ticket_materials SET request_status = 'requested' WHERE id = '00000000-0000-4000-6800-000000000001' $$,
                 'P0001', '구매 요청은 내부 자원 확인 후에만 가능합니다.', 'owner direct UPDATE refused');
SET LOCAL ROLE service_role;
SELECT throws_ok($$ UPDATE ticket_materials SET request_status = 'requested' WHERE id = '00000000-0000-4000-6800-000000000001' $$,
                 'P0001', '구매 요청은 내부 자원 확인 후에만 가능합니다.', 'service_role direct UPDATE refused');
RESET ROLE;
SELECT pg_temp.jwt('2'); SET LOCAL ROLE authenticated;
SELECT throws_ok($$ UPDATE ticket_materials SET request_status = 'requested' WHERE id = '00000000-0000-4000-6800-000000000001' $$,
                 'P0001', '구매 요청은 내부 자원 확인 후에만 가능합니다.', 'MANAGER direct UPDATE (RLS allowed) refused');
RESET ROLE;
SELECT pg_temp.jwt('4'); SET LOCAL ROLE authenticated;
SELECT throws_ok($$ INSERT INTO ticket_materials (ticket_id, inventory_item_id, quantity, request_status, request_type, created_by)
                    VALUES ('00000000-0000-4000-d000-000000000009', '00000000-0000-4000-6500-000000000000', 1, 'requested', 'purchase',
                            '00000000-0000-4000-a000-000000000004') $$,
                 'P0001', '구매 요청은 내부 자원 확인 후에만 가능합니다.', 'TECHNICIAN INSERT of a requested purchase refused');
SELECT lives_ok($$ INSERT INTO ticket_materials (ticket_id, inventory_item_id, quantity, request_status, request_type, created_by)
                   VALUES ('00000000-0000-4000-d000-000000000009', '00000000-0000-4000-6500-000000000000', 1, 'pending', 'purchase',
                           '00000000-0000-4000-a000-000000000004') $$, 'TECHNICIAN INSERT of a pending purchase still works');
RESET ROLE;
SELECT throws_ok($$ UPDATE ticket_materials SET request_type = 'purchase' WHERE id = '00000000-0000-4000-e000-000000000002' $$,
                 'P0001', '구매 요청은 내부 자원 확인 후에만 가능합니다.', 'requested dispatch → purchase refused');
SELECT lives_ok($$ UPDATE ticket_materials SET request_status = 'requested' WHERE id = '00000000-0000-4000-6800-000000000002' $$,
                'dispatch pending → requested unaffected');
SELECT lives_ok($$ UPDATE ticket_materials SET notes = 'x' WHERE id = '00000000-0000-4000-e000-000000000003' $$,
                'other column on an already requested purchase unaffected');

-- ---------- 5. request with resources ----------
SELECT pg_temp.jwt('4'); SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT request_purchase_material('00000000-0000-4000-6800-000000000001') $$,
                 'P0001', '내부 자원이 있습니다. 구매 사유를 선택해 주세요.', 'resources + no reason refused');
SELECT throws_ok($$ SELECT request_purchase_material('00000000-0000-4000-6800-000000000001', 'OTHER', ' ') $$,
                 'P0001', '기타 사유를 입력해 주세요.', 'OTHER without text refused');
SELECT throws_ok($$ SELECT request_purchase_material('00000000-0000-4000-6800-000000000001', 'CHEAPER') $$,
                 'P0001', '알 수 없는 구매 사유입니다.', 'unknown reason code refused');
SELECT throws_ok($$ SELECT request_purchase_material('00000000-0000-4000-6800-000000000001', 'OTHER', repeat('가', 501)) $$,
                 'P0001', '사유는 500자 이내로 입력해 주세요.', 'note > 500 refused');
RESET ROLE;
SELECT is((SELECT request_status::text FROM ticket_materials WHERE id = '00000000-0000-4000-6800-000000000001'), 'pending', 'still pending after refusals');
SELECT is((SELECT count(*)::int FROM purchase_guard_logs), 0, 'no log after refusals');

SELECT pg_temp.jwt('4'); SET LOCAL ROLE authenticated;
INSERT INTO res VALUES ('req1', request_purchase_material('00000000-0000-4000-6800-000000000001', 'LEAD_TIME', ' 고객 당일 요청 '));
SELECT throws_ok($$ SELECT request_purchase_material('00000000-0000-4000-6800-000000000001', 'LEAD_TIME') $$,
                 'P0001', '이미 출고 요청 중이거나 승인된 항목입니다.', 'second request refused');
RESET ROLE;
SELECT is((SELECT request_status::text FROM ticket_materials WHERE id = '00000000-0000-4000-6800-000000000001'), 'requested', 'status requested');
SELECT is((SELECT v->>'resource_count' FROM res WHERE k = 'req1'), '6', 'RPC result resource_count');
SELECT results_eq(
  $$ SELECT ticket_id, resource_count, reason_code, reason_note, requested_by, jsonb_array_length(resources), quantity
       FROM purchase_guard_logs WHERE material_id = '00000000-0000-4000-6800-000000000001' $$,
  $$ VALUES ('00000000-0000-4000-d000-000000000009'::uuid, 6, 'LEAD_TIME', '고객 당일 요청',
             '00000000-0000-4000-a000-000000000004'::uuid, 6, 1) $$,
  'log row with snapshot, trimmed note and requester');

-- ---------- 6. no resources / 외주 ----------
SELECT pg_temp.jwt('4'); SET LOCAL ROLE authenticated;
SELECT is((purchase_guard_check('00000000-0000-4000-6800-000000000004'))->>'resource_count', '0', 'no resources for the 16GB RAM (other capacity only)');
SELECT lives_ok($$ SELECT request_purchase_material('00000000-0000-4000-6800-000000000004') $$, 'no resources → request without reason');
SELECT is((purchase_guard_check('00000000-0000-4000-6800-000000000003'))->>'excluded', 'true', '외주 item excluded');
INSERT INTO res VALUES ('req3', request_purchase_material('00000000-0000-4000-6800-000000000003'));
RESET ROLE;
SELECT is((SELECT resource_count FROM purchase_guard_logs WHERE material_id = '00000000-0000-4000-6800-000000000004'), 0, 'zero-resource request logged');
SELECT is((SELECT v->>'excluded' FROM res WHERE k = 'req3'), 'true', '외주 request reports excluded');
SELECT is((SELECT count(*)::int FROM purchase_guard_logs WHERE material_id = '00000000-0000-4000-6800-000000000003'), 0, '외주 request not logged');
SELECT is((SELECT request_status::text FROM ticket_materials WHERE id = '00000000-0000-4000-6800-000000000003'), 'requested', '외주 request requested');
SELECT throws_ok($$ INSERT INTO purchase_guard_logs (ticket_id, material_id, item_label, quantity, resource_count, requested_by)
                    VALUES ('00000000-0000-4000-d000-000000000009', '00000000-0000-4000-6800-000000000007', 'x', 1, 2,
                            '00000000-0000-4000-a000-000000000004') $$, '23514', NULL, 'constraint: resources ⇒ reason');

-- ---------- 7. no inventory side effects; approval after the guard (Phase 0.5) ----------
SELECT is((SELECT jsonb_object_agg(id, quantity) FROM inventory_items), (SELECT v FROM res WHERE k = 'stock_before'), 'stock unchanged by the guard');
SELECT is((SELECT count(*) FROM inventory_transactions), (SELECT (v)::bigint FROM res WHERE k = 'tx_before'), 'no inventory transaction by the guard');
SELECT is((approve_material_dispatch('00000000-0000-4000-6800-000000000001', '00000000-0000-4000-a000-000000000004'))->>'success', 'true',
          'guarded purchase approves');
SELECT is((SELECT request_status::text FROM ticket_materials WHERE id = '00000000-0000-4000-6800-000000000001'), 'approved', 'status approved');
SELECT is((SELECT quantity FROM inventory_items WHERE id = '00000000-0000-4000-6500-000000000000'), 0, 'purchase approval: stock still 0');
SELECT is((SELECT count(*) FROM inventory_transactions), (SELECT (v)::bigint FROM res WHERE k = 'tx_before'), 'purchase approval: no transaction');

-- ---------- 8. rule 1: requested item restocked ----------
UPDATE inventory_items SET quantity = 2 WHERE id = '00000000-0000-4000-6500-000000000000';
SELECT pg_temp.jwt('4'); SET LOCAL ROLE authenticated;
SELECT is((SELECT e->>'source' FROM jsonb_array_elements((purchase_guard_check('00000000-0000-4000-6800-000000000007'))->'resources') e
            WHERE (e->>'rule')::int = 1), 'STOCK_SAME_ITEM', 'restocked item itself is rule 1');
RESET ROLE;

-- ---------- 9. RLS on purchase_guard_logs ----------
SELECT pg_temp.jwt('1'); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM purchase_guard_logs), 2, 'ADMIN reads logs');
SELECT throws_ok($$ DELETE FROM purchase_guard_logs $$, '42501', NULL, 'ADMIN cannot delete');
SELECT throws_ok($$ UPDATE purchase_guard_logs SET reason_code = 'OTHER' $$, '42501', NULL, 'ADMIN cannot update');
RESET ROLE;
SELECT pg_temp.jwt('2'); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM purchase_guard_logs), 0, 'MANAGER sees no logs (decision 5)');
RESET ROLE;
SELECT pg_temp.jwt('4'); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM purchase_guard_logs), 0, 'TECHNICIAN sees no logs');
SELECT throws_ok($$ INSERT INTO purchase_guard_logs (ticket_id, material_id, item_label, quantity, resource_count, requested_by)
                    VALUES ('00000000-0000-4000-d000-000000000009', '00000000-0000-4000-6800-000000000007', 'x', 1, 0,
                            '00000000-0000-4000-a000-000000000004') $$, '42501', NULL, 'TECHNICIAN cannot insert');
RESET ROLE;
SELECT pg_temp.jwt('6'); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM purchase_guard_logs), 0, 'CS sees no logs');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT count(*) FROM purchase_guard_logs $$, '42501', NULL, 'anon has no access');
RESET ROLE;

-- ---------- 10. privileges / definitions ----------
SELECT ok(NOT has_function_privilege('anon', 'public.purchase_guard_check(uuid)', 'EXECUTE'), 'anon: no purchase_guard_check');
SELECT ok(NOT has_function_privilege('anon', 'public.request_purchase_material(uuid, text, text)', 'EXECUTE'), 'anon: no request_purchase_material');
SELECT ok(has_function_privilege('authenticated', 'public.purchase_guard_check(uuid)', 'EXECUTE'), 'authenticated: purchase_guard_check');
SELECT ok(has_function_privilege('authenticated', 'public.request_purchase_material(uuid, text, text)', 'EXECUTE'), 'authenticated: request_purchase_material');
SELECT ok(NOT has_function_privilege('authenticated', 'public.ri_purchase_resources(uuid)', 'EXECUTE'), 'helper not callable');
SELECT ok(NOT has_function_privilege('authenticated', 'public.ri_purchase_material_info(uuid, boolean)', 'EXECUTE'), 'info helper not callable');
SELECT ok(NOT has_function_privilege('authenticated', 'public.ri_purchase_guard_enforce()', 'EXECUTE'), 'trigger function not callable');
SELECT ok((SELECT bool_and(prosecdef) FROM pg_proc WHERE proname IN ('purchase_guard_check', 'request_purchase_material')), 'public RPCs are SECURITY DEFINER');
SELECT ok((SELECT bool_and(proconfig::text LIKE '%search_path=public%') FROM pg_proc
            WHERE proname IN ('purchase_guard_check', 'request_purchase_material', 'ri_purchase_resources',
                              'ri_purchase_material_info', 'ri_purchase_guard_enforce')), 'all new functions set search_path');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.purchase_guard_logs'::regclass), 'RLS on purchase_guard_logs');

SELECT * FROM finish();
ROLLBACK;
