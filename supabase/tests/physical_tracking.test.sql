-- =============================================================
-- Phase 7 — physical tracking (label codes, storage locations, qty-1 extraction, label lookup)
-- Run: npx supabase test db   (local only; everything is rolled back except sequence values, which are restored)
-- Seed users: a…01 ADMIN, 02 MANAGER, 03 RECEPTION, 04 TECHNICIAN, 05 EXPERT_REPAIR, 06 CS
-- Seed items: b4…01 RAM 8GB USED qty 3, b4…04 SSD 256GB USED qty 1; ticket d…09 assigned 04, d…07 (customer 테스트고객2)
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

INSERT INTO res SELECT 'seq', to_jsonb(last_value) FROM inventory_label_seq;

-- ---------- 1. label codes ----------
SELECT is((SELECT count(*)::int FROM inventory_items WHERE label_code !~ '^P-[0-9]{5,}$'), 0, 'every item has a P- label code');
SELECT is((SELECT count(DISTINCT label_code)::int FROM inventory_items), (SELECT count(*)::int FROM inventory_items), 'label codes are unique');
SELECT col_not_null('public', 'inventory_items', 'label_code', 'label_code NOT NULL');

SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
INSERT INTO inventory_items (category_id, spec_id, product_id, capacity, condition, quantity, base_estimate)
VALUES ('00000000-0000-4000-b100-000000000001', '00000000-0000-4000-b200-000000000001', '00000000-0000-4000-b300-000000000001', '32GB', 'NEW', 2, 1000);
RESET ROLE;
SELECT ok((SELECT label_code FROM inventory_items WHERE capacity = '32GB') ~ '^P-[0-9]{5}$', 'MANAGER insert (session client) gets a code from the default');

SET LOCAL ROLE service_role;
INSERT INTO inventory_items (category_id, spec_id, product_id, capacity, condition, quantity, base_estimate)
VALUES ('00000000-0000-4000-b100-000000000001', '00000000-0000-4000-b200-000000000001', '00000000-0000-4000-b300-000000000001', '64GB', 'NEW', 1, 0);
RESET ROLE;
SELECT ok((SELECT label_code FROM inventory_items WHERE capacity = '64GB') > (SELECT label_code FROM inventory_items WHERE capacity = '32GB'),
  'service_role insert (webhook path) gets the next code');

SELECT throws_ok($$ UPDATE inventory_items SET label_code = (SELECT label_code FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000001')
  WHERE id = '00000000-0000-4000-b400-000000000002' $$, '23505', NULL, 'duplicate label code refused');
SELECT throws_ok($$ UPDATE inventory_items SET label_code = 'X-1' WHERE id = '00000000-0000-4000-b400-000000000002' $$,
  '23514', NULL, 'bad label format refused');

SELECT setval('inventory_label_seq', 99998);
SELECT is(ri_next_item_label(), 'P-99999', '5 digits up to 99999');
SELECT is(ri_next_item_label(), 'P-100000', 'no truncation at 100000');
SELECT setval('inventory_label_seq', (SELECT (v #>> '{}')::bigint FROM res WHERE k = 'seq') + 2);

-- ---------- 2. storage_locations ----------
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO storage_locations (code, description) VALUES ('A-01-04', '선반 A'), ('DONOR-C07', 'Donor 보관함'), ('OLD-1', NULL) $$, 'ADMIN creates locations');
SELECT lives_ok($$ UPDATE storage_locations SET is_active = false, description = '폐쇄' WHERE code = 'OLD-1' $$, 'ADMIN deactivates');
SELECT throws_ok($$ UPDATE storage_locations SET code = 'B-01' WHERE code = 'A-01-04' $$, '42501', NULL, 'code is not updatable');
SELECT throws_ok($$ DELETE FROM storage_locations WHERE code = 'OLD-1' $$, '42501', NULL, 'nobody deletes (ADMIN)');
SELECT throws_ok($$ INSERT INTO storage_locations (code) VALUES ('a-01') $$, '23514', NULL, 'lower-case code refused');
SELECT throws_ok($$ INSERT INTO storage_locations (code) VALUES ('A 01') $$, '23514', NULL, 'space refused');
SELECT throws_ok($$ INSERT INTO storage_locations (code) VALUES ('A-0123456789-01234567') $$, '23514', NULL, 'over 20 chars refused');
SELECT throws_ok($$ INSERT INTO storage_locations (code) VALUES ('A-01-04') $$, '23505', NULL, 'duplicate code refused');
RESET ROLE;
SELECT is((SELECT description FROM storage_locations WHERE code = 'OLD-1'), '폐쇄', 'deactivated with description');

SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM storage_locations), 3, 'MANAGER reads');
SELECT throws_ok($$ INSERT INTO storage_locations (code) VALUES ('M-1') $$, '42501', NULL, 'MANAGER cannot insert');
UPDATE storage_locations SET description = 'x' WHERE code = 'A-01-04';
RESET ROLE;
SELECT is((SELECT description FROM storage_locations WHERE code = 'A-01-04'), '선반 A', 'MANAGER update has no effect');

SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM storage_locations), 3, 'CS reads');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT count(*) FROM storage_locations $$, '42501', NULL, 'anon has no access');
RESET ROLE;
SELECT ok(NOT has_table_privilege('authenticated', 'public.storage_locations', 'DELETE'), 'no DELETE privilege');

-- ---------- 3. qty-1 extraction through every caller ----------
-- (a) removed part qty 3 → three USED rows of 1, three INBOUNDs, linked to the first
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
INSERT INTO ticket_removed_parts (ticket_id, description, category_id, disposition, return_spec, return_name, return_capacity, return_condition, quantity)
VALUES ('00000000-0000-4000-d000-000000000009', '램 3개', '00000000-0000-4000-b100-000000000001', 'STOCK', '노트북용 DDR4', '삼성 DDR4-3200', '8GB', '중고품', 3);
RESET ROLE;
CREATE TEMP TABLE before_items AS SELECT id FROM inventory_items;
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'rp3', approve_removed_part_inbound((SELECT id FROM ticket_removed_parts WHERE description = '램 3개'));
RESET ROLE;
CREATE TEMP TABLE new_rp AS SELECT * FROM inventory_items WHERE id NOT IN (SELECT id FROM before_items);
SELECT is((SELECT count(*)::int FROM new_rp), 3, 'qty 3 → three new rows');
SELECT is((SELECT count(*)::int FROM new_rp WHERE quantity = 1 AND condition = 'USED' AND capacity = '8GB' AND base_estimate = 0), 3, 'each row: USED, qty 1, capacity, estimate 0');
SELECT is((SELECT count(DISTINCT label_code)::int FROM new_rp), 3, 'three distinct labels');
SELECT is((SELECT quantity FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000001'), 3, 'existing matching row untouched');
SELECT is((SELECT count(*)::int FROM inventory_transactions WHERE item_id IN (SELECT id FROM new_rp) AND transaction_type = 'INBOUND'
            AND quantity_changed = 1 AND notes = '적출품 반환 입고' AND ticket_id = '00000000-0000-4000-d000-000000000009'
            AND user_id = '00000000-0000-4000-a000-000000000004'), 3, 'one INBOUND of 1 per row (ticket, assignee, same note)');
SELECT is((SELECT inventory_item_id FROM ticket_removed_parts WHERE description = '램 3개'), (SELECT (v->>'item_id')::uuid FROM res WHERE k = 'rp3'),
  'removed part linked to the returned id');
SELECT is((SELECT (v->>'item_id')::uuid FROM res WHERE k = 'rp3'), (SELECT id FROM new_rp ORDER BY label_code LIMIT 1), 'returned id is the first row');

-- (b) donor candidate qty 2 → two rows
INSERT INTO donor_devices (id, source_ticket_id, device_type, brand, model_text, consent_confirmed_by, consent_confirmed_at)
VALUES ('00000000-0000-4000-7700-000000000001', '00000000-0000-4000-d000-000000000007', '노트북', 'LG', '14Z90R',
        '00000000-0000-4000-a000-000000000002', now());
INSERT INTO donor_part_candidates (id, donor_id, description, quantity, status, category_id, return_spec, return_name, return_capacity)
VALUES ('00000000-0000-4000-7800-000000000001', '00000000-0000-4000-7700-000000000001', 'RAM 2개', 2, 'REQUESTED',
        '00000000-0000-4000-b100-000000000001', '노트북용 DDR4', '삼성 DDR4-3200', '4GB'),
       ('00000000-0000-4000-7800-000000000002', '00000000-0000-4000-7700-000000000001', '키보드', 1, 'AVAILABLE', NULL, NULL, NULL, NULL);
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'dx', donor_extract_part('00000000-0000-4000-7800-000000000001');
RESET ROLE;
SELECT is((SELECT count(*)::int || '|' || sum(quantity) FROM inventory_items WHERE capacity = '4GB'), '2|2', 'donor qty 2 → two rows of 1');
SELECT is((SELECT count(*)::int FROM inventory_transactions WHERE item_id IN (SELECT id FROM inventory_items WHERE capacity = '4GB')
            AND ticket_id = '00000000-0000-4000-d000-000000000007' AND quantity_changed = 1), 2, 'donor: two INBOUNDs to the source ticket');

-- (c) material return (approve_return_material) is covered in inventory_flow_rpcs.test.sql (qty 2 → 2 rows)

-- (d) validation messages unchanged; atomicity
SELECT throws_ok($$ SELECT ri_inbound_extracted_part(NULL, 's', 'n', NULL, 1, NULL, NULL) $$, 'P0001', '적출 자재의 카테고리·사양·제품명이 필요합니다.', 'missing fields message');
SELECT throws_ok($$ SELECT ri_inbound_extracted_part('00000000-0000-4000-b100-000000000001', 's', 'n', NULL, 0, NULL, NULL) $$, 'P0001', '수량은 1 이상이어야 합니다.', 'quantity message');
SELECT throws_ok($$ SELECT ri_inbound_extracted_part('00000000-0000-4000-b100-000000000001', 's', 'n', repeat('x', 51), 1, NULL, NULL) $$, 'P0001', '용량은 50자 이내로 입력해 주세요.', 'capacity message');
CREATE TEMP TABLE stock_before AS SELECT (SELECT count(*) FROM inventory_items) AS items, (SELECT count(*) FROM inventory_transactions) AS txs;
CREATE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.notes = '적출품 반환 입고' AND NEW.ticket_id = '00000000-0000-4000-d000-000000000004' THEN
  IF (SELECT count(*) FROM inventory_transactions WHERE ticket_id = NEW.ticket_id AND notes = NEW.notes) >= 1 THEN RAISE EXCEPTION 'forced failure'; END IF;
END IF; RETURN NEW; END $$;
CREATE TRIGGER zz_boom BEFORE INSERT ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION pg_temp.boom();
SELECT throws_ok($$ SELECT ri_inbound_extracted_part('00000000-0000-4000-b100-000000000001', '원자성스펙', 'n', NULL, 3, '00000000-0000-4000-d000-000000000004', NULL) $$,
  'P0001', 'forced failure', 'failure on the second unit raises');
DROP TRIGGER zz_boom ON inventory_transactions;
SELECT is((SELECT row(count(*), (SELECT count(*) FROM inventory_transactions))::text FROM inventory_items),
          (SELECT row(items, txs)::text FROM stock_before), 'atomic: no unit row or transaction left behind');
SELECT is((SELECT count(*)::int FROM inventory_specs WHERE name = '원자성스펙'), 0, 'atomic: no spec left behind');

-- ---------- 4. set_storage_location ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT is(set_storage_location('ITEM', '00000000-0000-4000-b400-000000000001', (SELECT id FROM storage_locations WHERE code = 'A-01-04'))->>'error',
  '보관 위치 변경 권한이 없습니다.', 'TECHNICIAN refused');
RESET ROLE;
SELECT pg_temp.jwt('3');
SET LOCAL ROLE authenticated;
SELECT is(set_storage_location('ITEM', '00000000-0000-4000-b400-000000000001', NULL)->>'error', '보관 위치 변경 권한이 없습니다.', 'RECEPTION refused');
RESET ROLE;
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT is(set_storage_location('ITEM', '00000000-0000-4000-b400-000000000001', NULL)->>'error', '보관 위치 변경 권한이 없습니다.', 'CS refused');
RESET ROLE;
SELECT is((SELECT storage_location_id FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000001'), NULL, 'refused calls wrote nothing');

SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT is(set_storage_location('ITEM', '00000000-0000-4000-b400-000000000001', (SELECT id FROM storage_locations WHERE code = 'A-01-04'))->>'location', 'A-01-04', 'MANAGER sets item location');
SELECT is(set_storage_location('DONOR', '00000000-0000-4000-7700-000000000001', (SELECT id FROM storage_locations WHERE code = 'DONOR-C07'))->>'success', 'true', 'MANAGER sets donor location');
SELECT is(set_storage_location('ITEM', '00000000-0000-4000-b400-000000000004', (SELECT id FROM storage_locations WHERE code = 'OLD-1'))->>'error', '사용 중지된 보관 위치입니다.', 'inactive location refused');
SELECT is(set_storage_location('ITEM', '00000000-0000-4000-b400-000000000004', gen_random_uuid())->>'error', '보관 위치를 찾을 수 없습니다.', 'unknown location');
SELECT is(set_storage_location('ITEM', gen_random_uuid(), NULL)->>'error', '재고 항목을 찾을 수 없습니다.', 'unknown item');
SELECT is(set_storage_location('DONOR', gen_random_uuid(), NULL)->>'error', 'Donor 기기를 찾을 수 없습니다.', 'unknown donor');
SELECT is(set_storage_location('X', gen_random_uuid(), NULL)->>'error', '대상 종류가 올바르지 않습니다.', 'bad kind');
RESET ROLE;
SELECT is((SELECT l.code FROM inventory_items i JOIN storage_locations l ON l.id = i.storage_location_id WHERE i.id = '00000000-0000-4000-b400-000000000001'), 'A-01-04', 'item location stored');
SELECT is((SELECT l.code FROM donor_devices d JOIN storage_locations l ON l.id = d.storage_location_id WHERE d.id = '00000000-0000-4000-7700-000000000001'), 'DONOR-C07', 'donor location stored');
SELECT throws_ok($$ DELETE FROM storage_locations WHERE code = 'A-01-04' $$, '23503', NULL, 'location in use cannot be deleted (owner, RESTRICT)');
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT is(set_storage_location('ITEM', '00000000-0000-4000-b400-000000000004', (SELECT id FROM storage_locations WHERE code = 'A-01-04'))->>'success', 'true', 'ADMIN sets location');
SELECT is(set_storage_location('ITEM', '00000000-0000-4000-b400-000000000004', NULL)->>'success', 'true', 'NULL clears');
RESET ROLE;
SELECT is((SELECT storage_location_id FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000004'), NULL, 'location cleared');

-- ---------- 5. label_lookup ----------
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'lk_m', label_lookup((SELECT lower(label_code) || ' ' FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000001'));
INSERT INTO res SELECT 'lk_rp', label_lookup((SELECT label_code FROM inventory_items WHERE id = (SELECT (v->>'item_id')::uuid FROM res WHERE k = 'rp3')));
INSERT INTO res SELECT 'lk_d', label_lookup('d-' || substr((SELECT donor_no FROM donor_devices WHERE id = '00000000-0000-4000-7700-000000000001'), 3));
SELECT is(label_lookup('P-9999999')->>'error', '등록되지 않은 라벨입니다.', 'unknown item code');
SELECT is(label_lookup('X-1')->>'error', '등록되지 않은 라벨입니다.', 'unknown prefix');
SELECT is(label_lookup(NULL)->>'error', '등록되지 않은 라벨입니다.', 'NULL code');
RESET ROLE;
SELECT is((SELECT v->>'kind' FROM res WHERE k = 'lk_m'), 'ITEM', 'lower-case code with spaces resolves to the item');
SELECT is((SELECT v #>> '{item,id}' FROM res WHERE k = 'lk_m'), '00000000-0000-4000-b400-000000000001', 'correct item');
SELECT is((SELECT v #>> '{item,location}' FROM res WHERE k = 'lk_m'), 'A-01-04', 'location in the result');
SELECT is((SELECT jsonb_array_length(v->'history') FROM res WHERE k = 'lk_m'),
          (SELECT count(*)::int FROM inventory_transactions WHERE item_id = '00000000-0000-4000-b400-000000000001'), 'MANAGER gets the full history');
SELECT is((SELECT (v->'history'->0->>'created_at')::timestamptz FROM res WHERE k = 'lk_m'),
          (SELECT max(created_at) FROM inventory_transactions WHERE item_id = '00000000-0000-4000-b400-000000000001'), 'history newest first');
SELECT is((SELECT v->'history'->0->>'receipt_no' FROM res WHERE k = 'lk_rp'), '20260927-001', 'history shows the receipt no.');
SELECT is((SELECT v->'history'->0->>'employee' FROM res WHERE k = 'lk_rp'), (SELECT name::text FROM employees WHERE id = '00000000-0000-4000-a000-000000000004'), 'history shows the employee');

SELECT is((SELECT v->>'kind' FROM res WHERE k = 'lk_d'), 'DONOR', 'lower-case donor code resolves');
SELECT is((SELECT v #>> '{donor,location}' || '|' || (v #>> '{donor,source_receipt_no}') FROM res WHERE k = 'lk_d'), 'DONOR-C07|20260925-001', 'donor location + source receipt no.');
SELECT is((SELECT jsonb_array_length(v->'candidates') FROM res WHERE k = 'lk_d'), 2, 'donor candidates listed');
SELECT ok(EXISTS (SELECT 1 FROM res, jsonb_array_elements(v->'candidates') c WHERE k = 'lk_d' AND c->>'status' = 'EXTRACTED'
                   AND c->>'item_label_code' ~ '^P-'), 'extracted candidate shows its item label');

-- ≤ 50 history rows
INSERT INTO inventory_transactions (item_id, user_id, transaction_type, quantity_changed, notes)
SELECT '00000000-0000-4000-b400-000000000003', '00000000-0000-4000-a000-000000000001', 'ADJUSTMENT', 0, 'bulk ' || g FROM generate_series(1, 60) g;
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT is(jsonb_array_length(label_lookup((SELECT label_code FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000003'))->'history'), 50, 'ADMIN: history capped at 50');
RESET ROLE;

-- other roles: info + location, no history (decision 5)
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'lk_t', label_lookup((SELECT label_code FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000001'));
RESET ROLE;
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'lk_c', label_lookup((SELECT label_code FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000001'));
INSERT INTO res SELECT 'lk_cd', label_lookup((SELECT donor_no FROM donor_devices WHERE id = '00000000-0000-4000-7700-000000000001'));
RESET ROLE;
SELECT pg_temp.jwt('3');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'lk_r', label_lookup((SELECT label_code FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000001'));
RESET ROLE;
SELECT is((SELECT count(*)::int FROM res WHERE k IN ('lk_t', 'lk_c', 'lk_r') AND v #>> '{item,location}' = 'A-01-04' AND v->'history' = 'null'::jsonb), 3,
  'TECHNICIAN / CS / RECEPTION: item + location, history null');
SELECT is((SELECT v->>'kind' FROM res WHERE k = 'lk_cd'), 'DONOR', 'CS can look up a donor');

-- no prices, no customer data (any role)
SELECT is((SELECT count(*)::int FROM res WHERE k LIKE 'lk%' AND (v::text ~* '(base_estimate|price|customer|phone|address)'
            OR v::text LIKE '%테스트고객%' OR v::text LIKE '%010-0000-%' OR v::text LIKE '%40000%')), 0, 'no price keys or values, no customer keys or values');

-- ---------- 6. privileges / definitions ----------
SELECT ok(NOT has_function_privilege('anon', 'public.label_lookup(text)', 'EXECUTE'), 'anon: no label_lookup');
SELECT ok(NOT has_function_privilege('anon', 'public.set_storage_location(text, uuid, uuid)', 'EXECUTE'), 'anon: no set_storage_location');
SELECT ok(NOT has_function_privilege('anon', 'public.ri_next_item_label()', 'EXECUTE'), 'anon: no ri_next_item_label');
SELECT ok(has_function_privilege('authenticated', 'public.label_lookup(text)', 'EXECUTE'), 'authenticated: label_lookup');
SELECT ok(has_function_privilege('authenticated', 'public.set_storage_location(text, uuid, uuid)', 'EXECUTE'), 'authenticated: set_storage_location');
SELECT ok(has_function_privilege('authenticated', 'public.ri_next_item_label()', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.ri_next_item_label()', 'EXECUTE'), 'label default executable by authenticated + service_role');
SELECT ok(NOT has_function_privilege('authenticated', 'public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid)', 'EXECUTE')
          AND NOT has_function_privilege('service_role', 'public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid)', 'EXECUTE'),
  'ri_inbound_extracted_part privileges unchanged (internal)');
SELECT is((SELECT count(*)::int FROM pg_proc WHERE proname IN ('label_lookup', 'set_storage_location', 'ri_next_item_label')
            AND prosecdef AND proconfig @> ARRAY['search_path=public']), 3, 'definer functions set search_path');
SELECT ok((SELECT prosrc FROM pg_proc WHERE proname = 'label_lookup') LIKE '%get_my_role()%'
          AND (SELECT prosrc FROM pg_proc WHERE proname = 'set_storage_location') LIKE '%get_my_role()%', 'role check inside both RPCs');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.storage_locations'::regclass), 'RLS on storage_locations');
SELECT ok(NOT has_sequence_privilege('authenticated', 'public.inventory_label_seq', 'USAGE'), 'sequence not exposed');

SELECT setval('inventory_label_seq', (SELECT (v #>> '{}')::bigint FROM res WHERE k = 'seq') + 2);

SELECT * FROM finish();
ROLLBACK;
