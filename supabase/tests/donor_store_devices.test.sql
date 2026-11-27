-- =============================================================
-- Phase 4.1 — store devices registered as Donor without a ticket
-- Run: npx supabase test db   (local only; everything is rolled back)
-- Seed users: a…01 ADMIN, 02 MANAGER, 03 RECEPTION, 04 TECHNICIAN, 05 EXPERT_REPAIR, 06 CS
-- Seed: catalog model f200…02 (+ variant f300…01), board f400…01, ticket d…09 (open), d…07 (CANCELED DISPOSE)
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
INSERT INTO storage_locations (id, code, description, is_active) VALUES
  ('00000000-0000-4000-7100-000000000001', 'DONOR-S1', '매장 보관 선반', true),
  ('00000000-0000-4000-7100-000000000002', 'OLD-S9', NULL, false);
INSERT INTO part_specs (id, part_type, name, compat_target) VALUES
  ('00000000-0000-4000-7200-000000000001', 'PANEL', 'PNL-S41', 'MODEL');
INSERT INTO part_compatibility (part_spec_id, model_id, status, confidence) VALUES
  ('00000000-0000-4000-7200-000000000001', '00000000-0000-4000-f200-000000000002', 'compatible', 'verified');
INSERT INTO inventory_categories (id, name) VALUES ('00000000-0000-4000-7300-000000000001', '테스트액정41');
INSERT INTO inventory_specs (id, category_id, name) VALUES
  ('00000000-0000-4000-7400-000000000001', '00000000-0000-4000-7300-000000000001', 'IPS');
INSERT INTO inventory_products (id, spec_id, name) VALUES
  ('00000000-0000-4000-7500-000000000001', '00000000-0000-4000-7400-000000000001', '14.0"');
-- requested item (qty 0) with the panel spec; purchase material on open ticket d…09 (model f200…02)
INSERT INTO inventory_items (id, category_id, spec_id, product_id, capacity, condition, quantity, base_estimate, part_spec_id) VALUES
  ('00000000-0000-4000-7600-000000000001', '00000000-0000-4000-7300-000000000001', '00000000-0000-4000-7400-000000000001',
   '00000000-0000-4000-7500-000000000001', 'PNL-S41', 'NEW', 0, 120000, '00000000-0000-4000-7200-000000000001');
UPDATE repair_tickets SET catalog_model_id = '00000000-0000-4000-f200-000000000002' WHERE id = '00000000-0000-4000-d000-000000000009';
INSERT INTO ticket_materials (id, ticket_id, inventory_item_id, quantity, request_status, request_type, created_by) VALUES
  ('00000000-0000-4000-7700-000000000001', '00000000-0000-4000-d000-000000000009', '00000000-0000-4000-7600-000000000001',
   1, 'pending', 'purchase', '00000000-0000-4000-a000-000000000004');

-- ---------- 1. schema ----------
SELECT has_column('public', 'donor_devices', 'origin', 'origin column');
SELECT col_default_is('public', 'donor_devices', 'origin', 'TICKET_DISPOSAL'::text, 'origin defaults to TICKET_DISPOSAL');
SELECT has_column('public', 'donor_devices', 'acquisition_note', 'acquisition_note column');
SELECT has_column('public', 'donor_devices', 'acquired_on', 'acquired_on column');
SELECT has_column('public', 'donor_devices', 'acquisition_cost', 'acquisition_cost column');
SELECT col_is_null('public', 'donor_devices', 'source_ticket_id', 'source_ticket_id is nullable (approved R2 exception)');
SELECT col_not_null('public', 'donor_devices', 'consent_confirmed_by', 'consent_confirmed_by stays NOT NULL');

SELECT throws_ok($$ INSERT INTO donor_devices (origin, source_ticket_id, device_type, brand, consent_confirmed_by, consent_confirmed_at)
  VALUES ('TICKET_DISPOSAL', NULL, '노트북', 'LG', '00000000-0000-4000-a000-000000000001', now()) $$,
  '23514', NULL, 'ticket donor without ticket refused');
SELECT throws_ok($$ INSERT INTO donor_devices (origin, source_ticket_id, device_type, brand, acquisition_note, consent_confirmed_by, consent_confirmed_at)
  VALUES ('STORE_STOCK', '00000000-0000-4000-d000-000000000007', '노트북', 'LG', '메모', '00000000-0000-4000-a000-000000000001', now()) $$,
  '23514', NULL, 'store donor with a ticket refused');
SELECT throws_ok($$ INSERT INTO donor_devices (origin, device_type, brand, acquisition_note, consent_confirmed_by, consent_confirmed_at)
  VALUES ('STORE_STOCK', '노트북', 'LG', '  ', '00000000-0000-4000-a000-000000000001', now()) $$,
  '23514', NULL, 'store donor with blank acquisition note refused');
SELECT throws_ok($$ INSERT INTO donor_devices (origin, device_type, brand, acquisition_note, consent_confirmed_by, consent_confirmed_at)
  VALUES ('OTHER', '노트북', 'LG', 'x', '00000000-0000-4000-a000-000000000001', now()) $$,
  '23514', NULL, 'unknown origin refused');
SELECT throws_ok($$ INSERT INTO donor_devices (origin, device_type, brand, acquisition_note, acquisition_cost, consent_confirmed_by, consent_confirmed_at)
  VALUES ('STORE_STOCK', '노트북', 'LG', 'x', -1, '00000000-0000-4000-a000-000000000001', now()) $$,
  '23514', NULL, 'negative acquisition cost refused');

-- ---------- 2. donor_register_store_device: refusals ----------
SELECT pg_temp.jwt('3');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', 'LG', '부품용 매입') $$,
  'P0001', 'Donor 등록 권한이 없습니다. 관리자 또는 팀장만 가능합니다.', 'RECEPTION refused');
RESET ROLE;
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', 'LG', '부품용 매입') $$,
  'P0001', 'Donor 등록 권한이 없습니다. 관리자 또는 팀장만 가능합니다.', 'TECHNICIAN refused');
RESET ROLE;
SELECT pg_temp.jwt('5');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', 'LG', '부품용 매입') $$,
  'P0001', NULL, 'EXPERT_REPAIR refused');
RESET ROLE;
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', 'LG', '부품용 매입') $$,
  'P0001', NULL, 'CS refused');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', 'LG', '부품용 매입') $$,
  NULL, NULL, 'anon refused by the guard');
RESET ROLE;

SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_register_store_device(false, '노트북', 'LG', '부품용 매입') $$,
  'P0001', '회사 소유 기기임을 확인해 주세요.', 'ownership false refused');
SELECT throws_ok($$ SELECT donor_register_store_device(NULL, '노트북', 'LG', '부품용 매입') $$,
  'P0001', '회사 소유 기기임을 확인해 주세요.', 'ownership NULL refused');
SELECT throws_ok($$ SELECT donor_register_store_device(true, NULL, 'LG', '부품용 매입') $$,
  'P0001', '기기 종류를 선택해 주세요.', 'device type required');
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', ' ', '부품용 매입') $$,
  'P0001', '브랜드를 입력해 주세요.', 'brand required');
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', repeat('가', 51), '부품용 매입') $$,
  'P0001', '브랜드는 50자 이내로 입력해 주세요.', 'brand length');
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', 'LG', '  ') $$,
  'P0001', '취득 경위를 입력해 주세요.', 'acquisition note required');
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', 'LG', repeat('가', 301)) $$,
  'P0001', '취득 경위는 300자 이내로 입력해 주세요.', 'acquisition note length');
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', 'LG', '부품용 매입', p_acquisition_cost => -100) $$,
  'P0001', '취득가는 0원 이상이어야 합니다.', 'negative cost refused');
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', 'LG', '부품용 매입', p_catalog_variant_id => '00000000-0000-4000-f300-000000000001') $$,
  'P0001', '변형을 고르려면 표준 모델을 먼저 선택해 주세요.', 'variant without model refused');
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', 'LG', '부품용 매입', p_storage_location_id => gen_random_uuid()) $$,
  'P0001', '보관 위치를 찾을 수 없습니다.', 'unknown location refused');
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', 'LG', '부품용 매입', p_storage_location_id => '00000000-0000-4000-7100-000000000002') $$,
  'P0001', '사용하지 않는 보관 위치입니다.', 'inactive location refused');
SELECT throws_ok($$ SELECT donor_register_store_device(true, '노트북', 'LG', '부품용 매입',
  p_catalog_model_id => '00000000-0000-4000-f200-000000000001', p_catalog_variant_id => '00000000-0000-4000-f300-000000000001') $$,
  '23503', NULL, 'variant of another model refused (existing FK)');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM donor_devices), 0, 'refusals wrote nothing');

-- ---------- 3. donor_register_store_device: success ----------
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO res SELECT 'reg', donor_register_store_device(true, '노트북', ' 삼성 ', ' 2023년 부품용 매입 ',
  p_model_text => 'NT950QED', p_tag_info => '', p_catalog_model_id => '00000000-0000-4000-f200-000000000002',
  p_catalog_variant_id => '00000000-0000-4000-f300-000000000001', p_condition_note => '액정 정상, 보드 불량',
  p_storage_note => '선반 아래', p_storage_location_id => '00000000-0000-4000-7100-000000000001',
  p_acquired_on => '2023-05-01', p_acquisition_cost => 50000) $$, 'MANAGER registers a store device');
RESET ROLE;
SELECT matches((SELECT v->>'donor_no' FROM res WHERE k = 'reg'), '^D-[0-9]{4,}$', 'donor_no generated (D-NNNN)');
SELECT is((SELECT row(origin, source_ticket_id, device_type::text, brand, model_text, tag_info, condition_note, storage_note,
                      storage_location_id, acquisition_note, acquired_on, acquisition_cost, status,
                      consent_confirmed_by::text, created_by::text)::text
             FROM donor_devices WHERE id = (SELECT (v->>'donor_id')::uuid FROM res WHERE k = 'reg')),
          row('STORE_STOCK', NULL::uuid, '노트북', '삼성', 'NT950QED', NULL::text, '액정 정상, 보드 불량', '선반 아래',
              '00000000-0000-4000-7100-000000000001'::uuid, '2023년 부품용 매입', '2023-05-01'::date, 50000, 'AVAILABLE',
              '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002')::text,
          'store donor row: origin, no ticket, trimmed texts, location, acquisition, ownership confirmed by caller');
SELECT ok((SELECT consent_confirmed_at IS NOT NULL FROM donor_devices WHERE origin = 'STORE_STOCK'), 'ownership confirmation time stored');

SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO res SELECT 'reg2', donor_register_store_device(true, '데스크탑', 'HP', '출처 불명 장기 보관') $$,
  'ADMIN registers a minimal store device');
RESET ROLE;
SELECT ok((SELECT v->>'donor_no' FROM res WHERE k = 'reg2') <> (SELECT v->>'donor_no' FROM res WHERE k = 'reg'), 'second donor_no differs');

-- ---------- 4. client writes ----------
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ INSERT INTO donor_devices (origin, device_type, brand, acquisition_note, consent_confirmed_by, consent_confirmed_at)
  VALUES ('STORE_STOCK', '노트북', 'LG', 'x', '00000000-0000-4000-a000-000000000002', now()) $$,
  '42501', NULL, 'direct INSERT refused');
SELECT throws_ok($$ UPDATE donor_devices SET origin = 'TICKET_DISPOSAL' WHERE origin = 'STORE_STOCK' $$,
  '42501', NULL, 'origin not updatable');
SELECT throws_ok($$ UPDATE donor_devices SET source_ticket_id = '00000000-0000-4000-d000-000000000007' WHERE origin = 'STORE_STOCK' $$,
  '42501', NULL, 'source_ticket_id not updatable');
SELECT lives_ok($$ UPDATE donor_devices SET acquisition_note = '2023년 부품용 매입 (영수증 보관)', acquired_on = '2023-05-02', acquisition_cost = 55000
  WHERE id = (SELECT (v->>'donor_id')::uuid FROM res WHERE k = 'reg') $$, 'MANAGER updates acquisition fields');
SELECT throws_ok($$ UPDATE donor_devices SET acquisition_note = '' WHERE id = (SELECT (v->>'donor_id')::uuid FROM res WHERE k = 'reg') $$,
  '23514', NULL, 'blank note on a store donor refused');
RESET ROLE;
SELECT is((SELECT acquisition_cost FROM donor_devices WHERE id = (SELECT (v->>'donor_id')::uuid FROM res WHERE k = 'reg')), 55000, 'update stored');
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ UPDATE donor_devices SET acquisition_cost = 1 WHERE origin = 'STORE_STOCK' $$, 'TECHNICIAN update runs');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM donor_devices WHERE acquisition_cost = 1), 0, 'TECHNICIAN update affected nothing (RLS)');

-- candidate on the store donor (TECHNICIAN may add candidates, as for ticket donors)
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO donor_part_candidates (donor_id, description, part_spec_id, quantity, condition_estimate)
  VALUES ((SELECT (v->>'donor_id')::uuid FROM res WHERE k = 'reg'), '14인치 패널', '00000000-0000-4000-7200-000000000001', 2, 'GOOD') $$,
  'TECHNICIAN adds a candidate to the store donor');
RESET ROLE;

-- ---------- 5. reads: QR, purchase guard, search, potential stock ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'lk', label_lookup((SELECT v->>'donor_no' FROM res WHERE k = 'reg'));
RESET ROLE;
SELECT is((SELECT v->>'kind' FROM res WHERE k = 'lk'), 'DONOR', 'label_lookup finds the store donor');
SELECT is((SELECT row(v->'donor'->>'origin', v->'donor'->>'source_receipt_no', v->'donor'->>'source_ticket_id',
                      v->'donor'->>'acquisition_note', v->'donor'->>'acquired_on', v->'donor'->>'location')::text FROM res WHERE k = 'lk'),
          row('STORE_STOCK', NULL::text, NULL::text, '2023년 부품용 매입 (영수증 보관)', '2023-05-02', 'DONOR-S1')::text,
          'lookup: origin + acquisition, no receipt, location code');
SELECT is((SELECT jsonb_array_length(v->'candidates') FROM res WHERE k = 'lk'), 1, 'lookup lists the candidate');

INSERT INTO res SELECT 'pr', ri_purchase_resources('00000000-0000-4000-7700-000000000001');
SELECT ok(EXISTS (SELECT 1 FROM res, jsonb_array_elements(v) e WHERE k = 'pr' AND e->>'source' = 'DONOR_SAME_SPEC'
                    AND e->>'donor_id' = (SELECT v->>'donor_id' FROM res WHERE k = 'reg')),
          'purchase guard resources include the store donor candidate (rule 5)');

SELECT is((SELECT donor_qty::int FROM search_parts_for_device('00000000-0000-4000-f200-000000000002')
            WHERE part_spec_id = '00000000-0000-4000-7200-000000000001' LIMIT 1), 2, 'search_parts_for_device counts the store donor part');
SELECT is((SELECT count(*)::int FROM donor_potential_stock WHERE donor_id = (SELECT (v->>'donor_id')::uuid FROM res WHERE k = 'reg')), 1,
          'donor_potential_stock includes the store donor');
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'kn', get_device_knowledge('00000000-0000-4000-f200-000000000002');
RESET ROLE;
SELECT ok(EXISTS (SELECT 1 FROM res, jsonb_array_elements(v->'donors') e WHERE k = 'kn'
                    AND e->>'donor_id' = (SELECT v->>'donor_id' FROM res WHERE k = 'reg')),
          'get_device_knowledge lists the store donor');

-- ---------- 6. extraction from a store donor ----------
INSERT INTO res VALUES ('tx_before', to_jsonb((SELECT count(*) FROM inventory_transactions)));
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO res SELECT 'ex', donor_extract_part(
  (SELECT id FROM donor_part_candidates WHERE description = '14인치 패널'),
  '00000000-0000-4000-7300-000000000001', 'IPS', '14.0"', 'PNL-S41') $$, 'MANAGER extracts the store donor candidate');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM inventory_transactions) - (SELECT (v)::int FROM res WHERE k = 'tx_before'), 2, 'two INBOUND rows (qty 2 → two qty-1 items)');
SELECT is((SELECT string_agg(DISTINCT row(t.ticket_id, t.notes, i.condition::text, i.quantity, i.base_estimate)::text, ',')
             FROM inventory_transactions t JOIN inventory_items i ON i.id = t.item_id
            WHERE t.created_at = now() AND t.transaction_type = 'INBOUND'),
          row(NULL::uuid, '적출품 반환 입고 · Donor ' || (SELECT v->>'donor_no' FROM res WHERE k = 'reg'), 'USED', 1, 0)::text,
          'store extraction: no ticket, note with donor_no, USED qty-1 items at 0원');
SELECT is((SELECT status FROM donor_part_candidates WHERE description = '14인치 패널'), 'EXTRACTED', 'candidate EXTRACTED');

-- regression: ticket donor extraction keeps the old note and its ticket id (same transaction → filter by ticket)
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO res SELECT 'conv', donor_convert_from_ticket('00000000-0000-4000-d000-000000000007', true, 'LG', '14Z90R') $$,
  'ticket conversion still works');
RESET ROLE;
SELECT is((SELECT origin FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007'), 'TICKET_DISPOSAL',
          'ticket donor gets origin TICKET_DISPOSAL by default');
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO donor_part_candidates (donor_id, description, quantity, condition_estimate)
  VALUES ((SELECT (v->>'donor_id')::uuid FROM res WHERE k = 'conv'), '티켓 Donor 부품', 1, 'GOOD') $$, 'candidate on ticket donor');
RESET ROLE;
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT donor_extract_part((SELECT id FROM donor_part_candidates WHERE description = '티켓 Donor 부품'),
  '00000000-0000-4000-7300-000000000001', 'IPS', '14.0"', 'TICKET-1') $$, 'ticket donor extraction');
RESET ROLE;
SELECT is((SELECT string_agg(t.notes, ',') FROM inventory_transactions t
            WHERE t.ticket_id = '00000000-0000-4000-d000-000000000007' AND t.transaction_type = 'INBOUND' AND t.created_at = now()),
          '적출품 반환 입고', 'ticket donor extraction: old note, ticket id kept');
SELECT is((SELECT count(*)::int FROM inventory_transactions WHERE notes LIKE '적출품 반환 입고 · Donor %'), 2,
          'store-note update touched only the store extraction rows');

-- ---------- 7. R10 ----------
SELECT ok(has_function_privilege('authenticated',
  'public.donor_register_store_device(boolean, public.device_type, text, text, text, text, uuid, uuid, uuid, text, text, uuid, date, integer)', 'EXECUTE'),
  'EXECUTE granted to authenticated (R10)');
SELECT ok((SELECT prosrc ~ 'ri_api_guard_definer\(''\{anon\}''\)' AND prosecdef AND proconfig @> ARRAY['search_path=public']
             FROM pg_proc WHERE oid = 'public.donor_register_store_device(boolean, public.device_type, text, text, text, text, uuid, uuid, uuid, text, text, uuid, date, integer)'::regprocedure),
          'guard first, SECURITY DEFINER, search_path set');

SELECT * FROM finish();
ROLLBACK;
