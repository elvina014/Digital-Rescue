-- =============================================================
-- Phase 5 — model notes, device/part search, intake knowledge panel
-- Run: npx supabase test db   (local only; everything is rolled back)
-- Seed users: a…01 ADMIN, 02 MANAGER, 03 RECEPTION, 04 TECHNICIAN, 05 EXPERT_REPAIR, 06 CS
-- Seed catalog: model f200…01 LG 그램 15 15Z90T (alias 15Z90T), f200…02 삼성 NT950QED (+ variant f300…01, board f400…02 linked),
--               f200…03 Lenovo; boards f400…01 LA-K091P (alias NM-D451), f400…02 BA92-21345A
-- Seed customer c…01 테스트고객1 / 010-0000-1001 / 테스트시 테스트구 1
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

-- ---------- fixtures (as owner) ----------
INSERT INTO interchange_groups (id, name) VALUES ('00000000-0000-4000-5100-000000000001', '배터리 그룹 X');
INSERT INTO part_specs (id, part_type, name, compat_target, interchange_group_id) VALUES
  ('00000000-0000-4000-5200-000000000001', 'PANEL',   'LP156WF9-SPK2', 'MODEL', NULL),
  ('00000000-0000-4000-5200-000000000002', 'BATTERY', 'L19M3PF7',      'MODEL', '00000000-0000-4000-5100-000000000001'),
  ('00000000-0000-4000-5200-000000000003', 'KEYBOARD','KB-15Z90T',     'MODEL', NULL),
  ('00000000-0000-4000-5200-000000000004', 'BATTERY', 'L19M3PF9',      'MODEL', '00000000-0000-4000-5100-000000000001'),
  ('00000000-0000-4000-5200-000000000005', 'PANEL',   'NV156FHM-N61',  'MODEL', NULL),
  ('00000000-0000-4000-5200-000000000006', 'PANEL',   'OUTSRC-PANEL',  'MODEL', NULL),
  ('00000000-0000-4000-5200-000000000007', 'IC',      'BQ24780SRUYR',  'BOARD', NULL),
  ('00000000-0000-4000-5200-000000000008', 'PANEL',   'ATNA33XC11',    'MODEL', NULL);
INSERT INTO part_number_aliases (part_spec_id, alias, alias_type) VALUES
  ('00000000-0000-4000-5200-000000000007', 'BQ24780S', 'MARKING'),
  ('00000000-0000-4000-5200-000000000002', 'L19C3PF7', 'PART_NUMBER');

-- stock linked to specs: S2 qty 2, S1 qty 0, outsourced seed item i5 (qty 99) → S6
INSERT INTO inventory_specs (id, category_id, name) VALUES ('00000000-0000-4000-5300-000000000001', '00000000-0000-4000-b100-000000000003', '노트북 패널');
INSERT INTO inventory_products (id, spec_id, name) VALUES ('00000000-0000-4000-5400-000000000001', '00000000-0000-4000-5300-000000000001', 'LG 패널');
INSERT INTO inventory_items (id, category_id, spec_id, product_id, capacity, condition, quantity, base_estimate, part_spec_id) VALUES
  ('00000000-0000-4000-5500-000000000001', '00000000-0000-4000-b100-000000000003', '00000000-0000-4000-5300-000000000001',
   '00000000-0000-4000-5400-000000000001', 'battery-x', 'NEW', 2, 50000, '00000000-0000-4000-5200-000000000002'),
  ('00000000-0000-4000-5500-000000000002', '00000000-0000-4000-b100-000000000003', '00000000-0000-4000-5300-000000000001',
   '00000000-0000-4000-5400-000000000001', 'panel-x', 'USED', 0, 70000, '00000000-0000-4000-5200-000000000001');
UPDATE inventory_items SET part_spec_id = '00000000-0000-4000-5200-000000000006' WHERE id = '00000000-0000-4000-b400-000000000005';

-- donors: AVAILABLE donor of model 1 with an S1 candidate; SCRAPPED donor with an S2 candidate
INSERT INTO donor_devices (id, source_ticket_id, device_type, brand, model_text, catalog_model_id, status, storage_note,
                           consent_confirmed_by, consent_confirmed_at) VALUES
  ('00000000-0000-4000-5600-000000000001', '00000000-0000-4000-d000-000000000007', '노트북', 'LG', '15Z90T', '00000000-0000-4000-f200-000000000001',
   'AVAILABLE', '선반 A', '00000000-0000-4000-a000-000000000002', now()),
  ('00000000-0000-4000-5600-000000000002', '00000000-0000-4000-d000-000000000008', '노트북', 'LG', '15Z90T', '00000000-0000-4000-f200-000000000001',
   'SCRAPPED', NULL, '00000000-0000-4000-a000-000000000002', now());
INSERT INTO donor_part_candidates (donor_id, description, part_spec_id, quantity) VALUES
  ('00000000-0000-4000-5600-000000000001', '패널', '00000000-0000-4000-5200-000000000001', 1),
  ('00000000-0000-4000-5600-000000000002', '배터리', '00000000-0000-4000-5200-000000000002', 1);

-- tickets: K1 completed (PII in free-text columns), K2 canceled, K3 open (newest), K4 test, K5 other model, K6 board only
INSERT INTO repair_tickets (id, customer_id, status, receipt_type, device_type, device_brand, device_model, tag_info, symptoms,
                            initial_estimate, final_price, is_approved, payment_status, received_at, completed_at, canceled_at,
                            is_test, catalog_model_id, catalog_board_id)
VALUES
  ('00000000-0000-4000-5700-000000000001', '00000000-0000-4000-c000-000000000001', 'COMPLETED', 'WALK_IN', '노트북', 'LG', 'PII모델문자열', 'PII태그문자열',
   '고객 연락처 010-9999-8888 비밀', 0, 230000, true, 'PAID', now() - interval '10 days', now() - interval '8 days', NULL,
   false, '00000000-0000-4000-f200-000000000001', NULL),
  ('00000000-0000-4000-5700-000000000002', '00000000-0000-4000-c000-000000000001', 'CANCELED', 'WALK_IN', '노트북', 'LG', 'x', NULL,
   'x', 0, 0, false, 'PENDING', now() - interval '6 days', NULL, now() - interval '5 days',
   false, '00000000-0000-4000-f200-000000000001', NULL),
  ('00000000-0000-4000-5700-000000000003', '00000000-0000-4000-c000-000000000001', 'IN_PROGRESS', 'WALK_IN', '노트북', 'LG', 'x', NULL,
   'x', 0, 0, false, 'PENDING', now() - interval '1 day', NULL, NULL,
   false, '00000000-0000-4000-f200-000000000001', NULL),
  ('00000000-0000-4000-5700-000000000004', '00000000-0000-4000-c000-000000000001', 'COMPLETED', 'WALK_IN', '노트북', 'LG', 'x', NULL,
   'x', 0, 10000, true, 'PAID', now() - interval '3 days', now() - interval '2 days', NULL,
   true, '00000000-0000-4000-f200-000000000001', NULL),
  ('00000000-0000-4000-5700-000000000005', '00000000-0000-4000-c000-000000000001', 'COMPLETED', 'WALK_IN', '노트북', 'Lenovo', 'x', NULL,
   'x', 0, 10000, true, 'PAID', now() - interval '3 days', now() - interval '2 days', NULL,
   false, '00000000-0000-4000-f200-000000000003', NULL),
  ('00000000-0000-4000-5700-000000000006', '00000000-0000-4000-c000-000000000001', 'COMPLETED', 'WALK_IN', '노트북', 'LG', 'x', NULL,
   'x', 0, 10000, true, 'PAID', now() - interval '3 days', now() - interval '2 days', NULL,
   false, NULL, '00000000-0000-4000-f400-000000000001');
INSERT INTO repair_records (ticket_id, diagnosis_summary, fault_category, result) VALUES
  ('00000000-0000-4000-5700-000000000001', '메모리 슬롯 접촉 불량', 'MEMORY', 'COMPLETED'),
  ('00000000-0000-4000-5700-000000000002', '보드 쇼트', 'MAINBOARD', 'UNREPAIRABLE');
INSERT INTO ticket_symptoms (ticket_id, symptom_code_id, note) VALUES
  ('00000000-0000-4000-5700-000000000001', (SELECT id FROM symptom_codes WHERE code = 'POWER'), '고객 메모 010-7777-6666');
INSERT INTO repair_actions (ticket_id, action_type, description, succeeded) VALUES
  ('00000000-0000-4000-5700-000000000001', 'REPLACE', 'RAM 교체', true);
INSERT INTO ticket_materials (ticket_id, inventory_item_id, quantity, request_status, request_type, created_by) VALUES
  ('00000000-0000-4000-5700-000000000001', '00000000-0000-4000-b400-000000000001', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004'),
  ('00000000-0000-4000-5700-000000000001', '00000000-0000-4000-b400-000000000005', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004');

-- compatibility via the Phase 3 RPC (statuses come from evidence)
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT record_compatibility_result('00000000-0000-4000-5200-000000000001', 'MODEL',   '00000000-0000-4000-f200-000000000001', 'INSTALL',  'compatible');
SELECT record_compatibility_result('00000000-0000-4000-5200-000000000002', 'MODEL',   '00000000-0000-4000-f200-000000000001', 'DOCUMENT', 'compatible', NULL, '매뉴얼');
SELECT record_compatibility_result('00000000-0000-4000-5200-000000000003', 'MODEL',   '00000000-0000-4000-f200-000000000001', 'DOCUMENT', 'conditional', '브래킷 가공 필요', '매뉴얼');
SELECT record_compatibility_result('00000000-0000-4000-5200-000000000005', 'MODEL',   '00000000-0000-4000-f200-000000000001', 'INSTALL',  'incompatible');
SELECT record_compatibility_result('00000000-0000-4000-5200-000000000006', 'MODEL',   '00000000-0000-4000-f200-000000000001', 'DOCUMENT', 'compatible', NULL, '매뉴얼');
SELECT record_compatibility_result('00000000-0000-4000-5200-000000000007', 'BOARD',   '00000000-0000-4000-f400-000000000002', 'DOCUMENT', 'compatible', NULL, '회로도');
SELECT record_compatibility_result('00000000-0000-4000-5200-000000000008', 'VARIANT', '00000000-0000-4000-f300-000000000001', 'DOCUMENT', 'compatible', NULL, '매뉴얼');
RESET ROLE;

-- ---------- 1. model_notes: constraints + RLS ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO model_notes (model_id, note_type, body) VALUES
  ('00000000-0000-4000-f200-000000000001', 'CAUTION', '하판 나사 길이 다름') $$, 'TECHNICIAN adds a model note');
SELECT throws_ok($$ INSERT INTO model_notes (model_id, board_id, body) VALUES
  ('00000000-0000-4000-f200-000000000001', '00000000-0000-4000-f400-000000000001', 'x') $$, '23514', NULL, 'note with model AND board refused');
SELECT throws_ok($$ INSERT INTO model_notes (body) VALUES ('x') $$, '23514', NULL, 'note without target refused');
SELECT throws_ok($$ INSERT INTO model_notes (model_id, body) VALUES ('00000000-0000-4000-f200-000000000001', '   ') $$, '23514', NULL, 'empty body refused');
SELECT throws_ok($$ INSERT INTO model_notes (model_id, body) VALUES ('00000000-0000-4000-f200-000000000001', repeat('가', 1001)) $$, '23514', NULL, 'body > 1000 refused');
SELECT throws_ok($$ INSERT INTO model_notes (model_id, variant_id, body) VALUES
  ('00000000-0000-4000-f200-000000000001', '00000000-0000-4000-f300-000000000001', 'x') $$, '23503', NULL, 'variant of another model refused');
SELECT throws_ok($$ INSERT INTO model_notes (model_id, body, created_by) VALUES
  ('00000000-0000-4000-f200-000000000001', 'x', '00000000-0000-4000-a000-000000000002') $$, '42501', NULL, 'created_by not writable');
SELECT lives_ok($$ INSERT INTO model_notes (board_id, note_type, body) VALUES
  ('00000000-0000-4000-f400-000000000002', 'TIP', 'PU 측정 포인트') $$, 'board note');
RESET ROLE;
-- fixed ids for the assertions below (as owner)
UPDATE model_notes SET id = '00000000-0000-4000-5800-000000000001' WHERE body = '하판 나사 길이 다름';
UPDATE model_notes SET id = '00000000-0000-4000-5800-000000000003' WHERE body = 'PU 측정 포인트';
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ UPDATE model_notes SET body = '하판 나사 길이 다름 (주의)' WHERE id = '00000000-0000-4000-5800-000000000001' $$, 'author edits own note');
RESET ROLE;
SELECT is((SELECT updated_by FROM model_notes WHERE id = '00000000-0000-4000-5800-000000000001'),
          '00000000-0000-4000-a000-000000000004'::uuid, 'updated_by stamped');

SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO model_notes (model_id, note_type, body, is_pinned) VALUES
  ('00000000-0000-4000-f200-000000000001', 'KNOWN_ISSUE', '힌지 파손 잦음', true) $$, 'MANAGER adds a pinned note');
RESET ROLE;
UPDATE model_notes SET id = '00000000-0000-4000-5800-000000000002' WHERE body = '힌지 파손 잦음';

SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
UPDATE model_notes SET body = 'hacked' WHERE id = '00000000-0000-4000-5800-000000000002';
DELETE FROM model_notes WHERE id = '00000000-0000-4000-5800-000000000002';
RESET ROLE;
SELECT is((SELECT body FROM model_notes WHERE id = '00000000-0000-4000-5800-000000000002'), '힌지 파손 잦음',
          'TECHNICIAN cannot edit or delete another person''s note');

SELECT pg_temp.jwt('5');
SET LOCAL ROLE authenticated;
UPDATE model_notes SET body = 'hacked' WHERE id = '00000000-0000-4000-5800-000000000001';
RESET ROLE;
SELECT is((SELECT body FROM model_notes WHERE id = '00000000-0000-4000-5800-000000000001'), '하판 나사 길이 다름 (주의)',
          'EXPERT_REPAIR cannot edit a TECHNICIAN''s note');

SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ UPDATE model_notes SET is_pinned = true WHERE id = '00000000-0000-4000-5800-000000000001' $$, 'MANAGER edits any note');
RESET ROLE;
SELECT ok((SELECT is_pinned FROM model_notes WHERE id = '00000000-0000-4000-5800-000000000001'), 'MANAGER edit applied');

SELECT pg_temp.jwt('3');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ INSERT INTO model_notes (model_id, body) VALUES ('00000000-0000-4000-f200-000000000001', 'x') $$, '42501', NULL, 'RECEPTION cannot write notes');
SELECT is((SELECT count(*)::int FROM model_notes), 3, 'RECEPTION reads notes');
RESET ROLE;
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ INSERT INTO model_notes (model_id, body) VALUES ('00000000-0000-4000-f200-000000000001', 'x') $$, '42501', NULL, 'CS cannot write notes');
SELECT is((SELECT count(*)::int FROM model_notes), 3, 'CS reads notes');
RESET ROLE;

-- temporary note to delete: author deletes own
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
INSERT INTO model_notes (model_id, body) VALUES ('00000000-0000-4000-f200-000000000001', '임시');
DELETE FROM model_notes WHERE body = '임시';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM model_notes WHERE body = '임시'), 0, 'author deletes own note');

SELECT ok(NOT has_table_privilege('anon', 'public.model_notes', 'SELECT'), 'anon cannot read notes');
SELECT ok(NOT has_column_privilege('authenticated', 'public.model_notes', 'created_by', 'UPDATE'), 'created_by not updatable');

-- ---------- 2. search_parts_for_device ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT * FROM search_parts_for_device() $$, 'P0001', '검색할 모델 또는 보드를 선택해 주세요.', 'no id → Korean error');
SELECT throws_ok($$ SELECT * FROM search_parts_for_device('00000000-0000-4000-f200-000000000001', '00000000-0000-4000-f300-000000000001') $$,
  'P0001', '선택한 변형이 모델에 속하지 않습니다.', 'variant of another model refused');

SELECT results_eq(
  $$ SELECT part_name, target_type, status, confidence, is_candidate, stock_qty, donor_qty, rank
       FROM search_parts_for_device('00000000-0000-4000-f200-000000000001') $$,
  $$ VALUES ('LP156WF9-SPK2'::text, 'MODEL'::text, 'compatible'::text,   'verified'::text,   false, 0::bigint,  1::bigint, 1),
            ('L19M3PF7',            'MODEL',       'compatible',         'documented',       false, 2::bigint,  0::bigint, 2),
            ('KB-15Z90T',           'MODEL',       'conditional',        'documented',       false, 0::bigint,  0::bigint, 2),
            ('OUTSRC-PANEL',        'MODEL',       'compatible',         'documented',       false, 0::bigint,  0::bigint, 2),
            ('L19M3PF9',            'MODEL',       'compatible',         'inferred',         true,  0::bigint,  0::bigint, 3),
            ('NV156FHM-N61',        'MODEL',       'incompatible',       'verified',         false, 0::bigint,  0::bigint, 9) $$,
  'model 1: P9 rank order, stock before no stock, outsourced stock ignored, scrapped donor ignored, incompatible last');

SELECT is((SELECT limitation_note FROM search_parts_for_device('00000000-0000-4000-f200-000000000001') WHERE part_name = 'KB-15Z90T'),
          '브래킷 가공 필요', 'conditional carries its limitation');

SELECT results_eq(
  $$ SELECT part_name, target_type FROM search_parts_for_device('00000000-0000-4000-f200-000000000002') $$,
  $$ VALUES ('ATNA33XC11'::text, 'VARIANT'::text), ('BQ24780SRUYR', 'BOARD') $$,
  'model 2 without variant → variant rows + linked-board IC rows');
SELECT is((SELECT count(*)::int FROM search_parts_for_device(NULL, '00000000-0000-4000-f300-000000000001')), 2,
          'variant only → model derived, variant + board rows');
SELECT results_eq(
  $$ SELECT part_name FROM search_parts_for_device(NULL, NULL, '00000000-0000-4000-f400-000000000002') $$,
  $$ VALUES ('BQ24780SRUYR'::text) $$, 'board only → IC rows');
SELECT is((SELECT count(*)::int FROM search_parts_for_device('00000000-0000-4000-f200-000000000003')), 0, 'model without knowledge → 0 rows');

-- ---------- 3. search_devices_for_part ----------
SELECT results_eq(
  $$ SELECT target_type, target_label, linked_models, rank FROM search_devices_for_part('00000000-0000-4000-5200-000000000007') $$,
  $$ VALUES ('BOARD'::text, 'BA92-21345A'::text, '삼성 갤럭시북 프로 360 NT950QED'::text, 2) $$,
  'chip spec → board with linked laptop model');
SELECT results_eq(
  $$ SELECT target_label, is_candidate, rank FROM search_devices_for_part('00000000-0000-4000-5200-000000000004') $$,
  $$ VALUES ('LG 그램 15 15Z90T'::text, true, 3) $$, 'interchange sibling → candidate row');
SELECT is((SELECT count(*)::int FROM search_devices_for_part(gen_random_uuid())), 0, 'unknown spec → 0 rows');

-- ---------- 4. partial / alias input through the existing pickers (acceptance) ----------
SELECT ok(EXISTS (SELECT 1 FROM catalog_search_models('15z90') WHERE model_id = '00000000-0000-4000-f200-000000000001'), 'partial model alias "15z90"');
SELECT ok(EXISTS (SELECT 1 FROM catalog_search_boards('nm-d45') WHERE board_id = '00000000-0000-4000-f400-000000000001'), 'partial board alias "nm-d45"');
SELECT ok(EXISTS (SELECT 1 FROM part_spec_search('bq2478') WHERE part_spec_id = '00000000-0000-4000-5200-000000000007'), 'partial chip marking "bq2478"');
SELECT ok(EXISTS (SELECT 1 FROM part_spec_search('L19C3') WHERE part_spec_id = '00000000-0000-4000-5200-000000000002'), 'partial part-number alias "L19C3"');
RESET ROLE;

-- ---------- 5. get_device_knowledge ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
INSERT INTO res VALUES ('tech', get_device_knowledge('00000000-0000-4000-f200-000000000001'));
INSERT INTO res VALUES ('tech_excl', get_device_knowledge('00000000-0000-4000-f200-000000000001', NULL, NULL, '00000000-0000-4000-5700-000000000001'));
INSERT INTO res VALUES ('board', get_device_knowledge(NULL, NULL, '00000000-0000-4000-f400-000000000001'));
SELECT throws_ok($$ SELECT get_device_knowledge() $$, 'P0001', '검색할 모델 또는 보드를 선택해 주세요.', 'knowledge: no id refused');
RESET ROLE;
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
INSERT INTO res VALUES ('manager', get_device_knowledge('00000000-0000-4000-f200-000000000001'));
RESET ROLE;
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
INSERT INTO res VALUES ('admin', get_device_knowledge('00000000-0000-4000-f200-000000000001'));
RESET ROLE;
SELECT pg_temp.jwt('3');
SET LOCAL ROLE authenticated;
INSERT INTO res VALUES ('reception', get_device_knowledge('00000000-0000-4000-f200-000000000001'));
RESET ROLE;
SELECT pg_temp.jwt('5');
SET LOCAL ROLE authenticated;
INSERT INTO res VALUES ('expert', get_device_knowledge('00000000-0000-4000-f200-000000000001'));
RESET ROLE;
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
INSERT INTO res VALUES ('cs', get_device_knowledge('00000000-0000-4000-f200-000000000001'));
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT get_device_knowledge('00000000-0000-4000-f200-000000000001') $$, 'P0001', '직원만 조회할 수 있습니다.',
  'non-employee refused');
RESET ROLE;

SELECT is((SELECT count(*)::int FROM res WHERE v->'cases'->>'total' = '3'), 6, 'all 6 roles see the 3 cases (Q7: TECH unassigned, CS non-completed)');
SELECT is((SELECT v->'cases'->'by_status' FROM res WHERE k = 'tech'), '{"COMPLETED": 1, "CANCELED": 1, "OPEN": 1}'::jsonb, 'counts by status (test + other model excluded)');
SELECT is((SELECT v->'cases'->'by_result' FROM res WHERE k = 'tech'), '{"COMPLETED": 1, "UNREPAIRABLE": 1, "NONE": 1}'::jsonb, 'counts by result');
SELECT is((SELECT jsonb_array_length(v->'cases'->'recent') FROM res WHERE k = 'tech'), 3, 'recent cases listed');
SELECT is((SELECT v->'cases'->'recent'->0->>'status' FROM res WHERE k = 'tech'), 'IN_PROGRESS', 'newest case first');
SELECT is((SELECT v->'cases'->'recent'->2->'symptoms' FROM res WHERE k = 'tech'), '["전원"]'::jsonb, 'symptom code names only');
SELECT is((SELECT v->'cases'->'recent'->2->'actions'->0->>'description' FROM res WHERE k = 'tech'), 'RAM 교체', 'actions included');
SELECT is((SELECT v->'cases'->'recent'->2->'parts' FROM res WHERE k = 'tech'),
          '[{"category": "RAM", "spec": "노트북용 DDR4", "product": "삼성 DDR4-3200", "capacity": "8GB", "quantity": 1}]'::jsonb,
          'parts used per case, outsourced dropped');
SELECT is((SELECT v->'cases'->>'total' FROM res WHERE k = 'tech_excl'), '2', 'p_exclude_ticket_id hides the current ticket');
SELECT is((SELECT v->'cases'->>'total' FROM res WHERE k = 'board'), '1', 'board-only knowledge → board-linked case');
SELECT is((SELECT v->'parts_used' FROM res WHERE k = 'tech'),
          '[{"category": "RAM", "spec": "노트북용 DDR4", "product": "삼성 DDR4-3200", "capacity": "8GB", "times": 1, "quantity": 1}]'::jsonb,
          'parts-used history aggregated, no outsourced');
SELECT is((SELECT (v->>'compatible_in_stock')::int FROM res WHERE k = 'tech'), 1, 'compatible_in_stock = rank 1–2 specs with stock');
SELECT is((SELECT jsonb_array_length(v->'donors') FROM res WHERE k = 'tech'), 1, 'only the AVAILABLE donor of the model');
SELECT is((SELECT (v->'donors'->0->>'candidates')::int FROM res WHERE k = 'tech'), 1, 'donor candidate count');
SELECT is((SELECT v->'boards' FROM res WHERE k = 'tech'), '[]'::jsonb, 'model 1 has no linked boards');
SELECT is((SELECT v->>'label' FROM res WHERE k = 'tech'), 'LG 그램 15 15Z90T', 'label');

-- notes inside the panel
SELECT is((SELECT jsonb_array_length(v->'notes') FROM res WHERE k = 'tech'), 2, 'model notes (board note of an unlinked board excluded)');
SELECT is((SELECT v->'notes'->0->>'id' FROM res WHERE k = 'tech'), '00000000-0000-4000-5800-000000000001', 'pinned CAUTION first');
SELECT is((SELECT jsonb_agg(n->'can_edit' ORDER BY n->>'id') FROM res, jsonb_array_elements(v->'notes') n WHERE k = 'tech'),
          '[true, false]'::jsonb, 'TECHNICIAN can_edit only own note');
SELECT is((SELECT jsonb_agg(n->'can_edit' ORDER BY n->>'id') FROM res, jsonb_array_elements(v->'notes') n WHERE k = 'manager'),
          '[true, true]'::jsonb, 'MANAGER can_edit all notes');
SELECT is((SELECT jsonb_agg(n->'can_edit' ORDER BY n->>'id') FROM res, jsonb_array_elements(v->'notes') n WHERE k = 'reception'),
          '[false, false]'::jsonb, 'RECEPTION can_edit none');

-- prices: admin group only (decision 7)
SELECT is((SELECT (v->'cases'->'recent'->2->>'final_price')::int FROM res WHERE k = 'manager'), 230000, 'MANAGER sees past repair price');
SELECT is((SELECT (v->'cases'->'recent'->2->>'final_price')::int FROM res WHERE k = 'admin'), 230000, 'ADMIN sees past repair price');
SELECT is((SELECT count(*)::int FROM res, jsonb_array_elements(v->'cases'->'recent') c
            WHERE k IN ('tech', 'reception', 'expert', 'cs') AND (c ? 'final_price' OR c ? 'refunded_amount')), 0,
          'no price keys for TECHNICIAN / RECEPTION / EXPERT_REPAIR / CS');

-- PII (Q7): no customer data, no customer free text, no raw model / tag text
SELECT is((SELECT count(*)::int FROM res
            WHERE v::text ~ '(테스트고객|010-0000-1001|테스트시 테스트구|010-9999-8888|010-7777-6666|PII모델문자열|PII태그문자열|customer)'),
          0, 'no customer name / phone / address / symptoms / symptom note / device_model / tag_info in any result');
SELECT is((SELECT count(*)::int FROM res, jsonb_array_elements(v->'cases'->'recent') c, jsonb_object_keys(c) key
            WHERE key NOT IN ('receipt_no', 'status', 'received_at', 'completed_at', 'canceled_at', 'result', 'fault_category',
                              'diagnosis_summary', 'symptoms', 'actions', 'parts', 'final_price', 'refunded_amount')), 0,
          'case keys are the whitelist');
SELECT is((SELECT count(*)::int FROM res, jsonb_object_keys(v) key
            WHERE key NOT IN ('label', 'boards', 'notes', 'cases', 'parts_used', 'compatible_in_stock', 'donors', 'show_price')), 0,
          'top-level keys are the whitelist');

-- decision 8: a case that fails while being assembled is skipped, the call still succeeds
CREATE OR REPLACE VIEW public.repair_parts_used WITH (security_invoker = true) AS
  SELECT m.ticket_id, m.id AS material_id, m.request_type,
         CASE WHEN m.ticket_id = '00000000-0000-4000-5700-000000000001' THEN 1 / (m.quantity - m.quantity) ELSE m.quantity END AS quantity,
         c.name AS category_name, s.name AS spec_name, p.name AS product_name, i.capacity, i.condition, (s.name = '외주') AS is_outsourced
    FROM public.ticket_materials m
    JOIN public.inventory_items i ON i.id = m.inventory_item_id
    JOIN public.inventory_categories c ON c.id = i.category_id
    JOIN public.inventory_specs s ON s.id = i.spec_id
    JOIN public.inventory_products p ON p.id = i.product_id
   WHERE m.request_status IN ('approved', 'cancel_requested');
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
INSERT INTO res VALUES ('broken', get_device_knowledge('00000000-0000-4000-f200-000000000001'));
RESET ROLE;
SELECT is((SELECT jsonb_array_length(v->'cases'->'recent') FROM res WHERE k = 'broken'), 2, 'failing case skipped, others listed');
SELECT is((SELECT (v->'cases'->>'skipped')::int FROM res WHERE k = 'broken'), 2, 'skipped counts the case and the parts history');
SELECT is((SELECT v->'cases'->>'total' FROM res WHERE k = 'broken'), '3', 'total still counts every case');

-- ---------- 6. privileges / definitions ----------
SELECT ok((has_function_privilege('anon', 'public.search_parts_for_device(uuid, uuid, uuid)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.search_parts_for_device(uuid, uuid, uuid)'::regprocedure)), 'anon: no search_parts_for_device (R10: EXECUTE granted, refused by the in-function guard)');
SELECT ok((has_function_privilege('anon', 'public.search_devices_for_part(uuid)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.search_devices_for_part(uuid)'::regprocedure)), 'anon: no search_devices_for_part (R10: EXECUTE granted, refused by the in-function guard)');
SELECT ok((has_function_privilege('anon', 'public.get_device_knowledge(uuid, uuid, uuid, uuid)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.get_device_knowledge(uuid, uuid, uuid, uuid)'::regprocedure)), 'anon: no get_device_knowledge (R10: EXECUTE granted, refused by the in-function guard)');
SELECT ok(has_function_privilege('authenticated', 'public.get_device_knowledge(uuid, uuid, uuid, uuid)', 'EXECUTE'), 'authenticated: get_device_knowledge');
SELECT ok((has_function_privilege('authenticated', 'public.model_note_stamp()', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*authenticated[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.model_note_stamp()'::regprocedure)), 'trigger function not callable (R10: EXECUTE granted, refused by the in-function guard)');
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid = 'public.get_device_knowledge(uuid, uuid, uuid, uuid)'::regprocedure), 'knowledge is SECURITY DEFINER');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.search_parts_for_device(uuid, uuid, uuid)'::regprocedure), 'device search is INVOKER');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.search_devices_for_part(uuid)'::regprocedure), 'part search is INVOKER');
SELECT ok((SELECT proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = 'public.get_device_knowledge(uuid, uuid, uuid, uuid)'::regprocedure),
          'knowledge sets search_path');
SELECT ok((SELECT prosrc LIKE '%get_my_role()%' FROM pg_proc WHERE oid = 'public.get_device_knowledge(uuid, uuid, uuid, uuid)'::regprocedure),
          'knowledge checks the caller role');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.model_notes'::regclass), 'RLS on model_notes');

SELECT * FROM finish();
ROLLBACK;
