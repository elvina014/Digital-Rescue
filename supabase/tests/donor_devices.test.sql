-- =============================================================
-- Phase 4 — donor devices, part candidates, photos, potential stock
-- Run: npx supabase test db   (local only; everything is rolled back)
-- Seed users: a…01 ADMIN, 02 MANAGER, 03 RECEPTION, 04 TECHNICIAN, 05 EXPERT_REPAIR, 06 CS
-- Seed tickets: d…07 CANCELED DISPOSE (not confirmed), 08 CANCELED RETURN, 04 IN_PROGRESS
-- Seed inventory: category b100…02 저장장치, spec "M.2 NVMe", product "삼성", item b400…03 (NEW 512GB) / b400…04 (USED 256GB, WD)
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
-- extra canceled tickets: pre-receipt cancel (no disposal), already confirmed DISPOSE, second open DISPOSE
INSERT INTO repair_tickets (id, customer_id, status, receipt_type, device_type, device_brand, device_model, symptoms,
                            initial_estimate, final_price, is_approved, payment_status, received_at, canceled_at, cancel_device_disposal, dispose_confirmed_at)
VALUES
  ('00000000-0000-4000-d000-000000000041', '00000000-0000-4000-c000-000000000001', 'CANCELED', 'WALK_IN', '노트북', 'LG', 'X1', 'x',
   0, 0, false, 'PENDING', NULL, now(), NULL, NULL),
  ('00000000-0000-4000-d000-000000000042', '00000000-0000-4000-c000-000000000001', 'CANCELED', 'WALK_IN', '노트북', 'LG', 'X2', 'x',
   0, 0, false, 'PENDING', now(), now(), 'DISPOSE', now()),
  ('00000000-0000-4000-d000-000000000043', '00000000-0000-4000-c000-000000000001', 'CANCELED', 'WALK_IN', '노트북', 'HP', 'X3', 'x',
   0, 0, false, 'PENDING', now(), now(), 'DISPOSE', NULL);
UPDATE repair_tickets SET catalog_model_id = '00000000-0000-4000-f200-000000000002', catalog_variant_id = '00000000-0000-4000-f300-000000000001',
                          catalog_board_id = '00000000-0000-4000-f400-000000000001'
 WHERE id = '00000000-0000-4000-d000-000000000007';
INSERT INTO ticket_removed_parts (id, ticket_id, description, disposition, category_id, return_spec, return_name, return_capacity, return_condition, quantity) VALUES
  ('00000000-0000-4000-9500-000000000001', '00000000-0000-4000-d000-000000000007', '원래 SSD', 'DONOR_KEEP',
   '00000000-0000-4000-b100-000000000002', 'M.2 NVMe', 'WD', '256GB', '중고품', 1),
  ('00000000-0000-4000-9500-000000000002', '00000000-0000-4000-d000-000000000007', '파손 액정', 'DISCARD', NULL, NULL, NULL, NULL, NULL, 1),
  ('00000000-0000-4000-9500-000000000003', '00000000-0000-4000-d000-000000000007', '배터리', 'DONOR_KEEP', NULL, NULL, NULL, NULL, '불량품', 1);
CREATE TEMP TABLE t7_before AS
  SELECT to_jsonb(t) - 'dispose_confirmed_at' - 'updated_at' AS j FROM repair_tickets t WHERE id = '00000000-0000-4000-d000-000000000007';
CREATE TEMP TABLE stock_before AS
  SELECT (SELECT count(*) FROM inventory_items) AS items, (SELECT count(*) FROM inventory_transactions) AS txs,
         (SELECT sum(quantity) FROM inventory_items) AS qty;

-- ---------- 1. donor_convert_from_ticket ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_convert_from_ticket('00000000-0000-4000-d000-000000000007', true, 'LG', '14Z90R') $$,
  'P0001', 'Donor 전환 권한이 없습니다. 관리자 또는 팀장만 가능합니다.', 'TECHNICIAN cannot convert');
SELECT throws_ok($$ INSERT INTO donor_devices (source_ticket_id, device_type, brand, consent_confirmed_by, consent_confirmed_at)
  VALUES ('00000000-0000-4000-d000-000000000007', '노트북', 'LG', '00000000-0000-4000-a000-000000000004', now()) $$,
  '42501', NULL, 'nobody inserts donor_devices directly');
RESET ROLE;
SELECT pg_temp.jwt('3');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_convert_from_ticket('00000000-0000-4000-d000-000000000007', true, 'LG', '14Z90R') $$,
  'P0001', NULL, 'RECEPTION cannot convert');
RESET ROLE;
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_convert_from_ticket('00000000-0000-4000-d000-000000000007', true, 'LG', '14Z90R') $$,
  'P0001', NULL, 'CS cannot convert');
RESET ROLE;

SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_convert_from_ticket('00000000-0000-4000-d000-000000000007', false, 'LG', '14Z90R') $$,
  'P0001', '고객의 소유권 포기(폐기 위임) 동의 확인이 필요합니다.', 'consent false refused');
SELECT throws_ok($$ SELECT donor_convert_from_ticket('00000000-0000-4000-d000-000000000007', NULL, 'LG', '14Z90R') $$,
  'P0001', '고객의 소유권 포기(폐기 위임) 동의 확인이 필요합니다.', 'consent NULL refused');
SELECT throws_ok($$ SELECT donor_convert_from_ticket('00000000-0000-4000-d000-000000000007', true, '  ', '14Z90R') $$,
  'P0001', '브랜드를 입력해 주세요.', 'brand required');
SELECT throws_ok($$ SELECT donor_convert_from_ticket('00000000-0000-4000-d000-000000000004', true, 'asus', 'GA403') $$,
  'P0001', '폐기로 취소된 접수건만 Donor로 전환할 수 있습니다.', 'open ticket refused');
SELECT throws_ok($$ SELECT donor_convert_from_ticket('00000000-0000-4000-d000-000000000008', true, '삼성', 'x') $$,
  'P0001', '폐기로 취소된 접수건만 Donor로 전환할 수 있습니다.', 'RETURN cancel refused');
SELECT throws_ok($$ SELECT donor_convert_from_ticket('00000000-0000-4000-d000-000000000041', true, 'LG', 'x') $$,
  'P0001', '폐기로 취소된 접수건만 Donor로 전환할 수 있습니다.', 'pre-receipt cancel (no disposal) refused');
SELECT throws_ok($$ SELECT donor_convert_from_ticket('00000000-0000-4000-d000-000000000042', true, 'LG', 'x') $$,
  'P0001', '이미 폐기 확인(또는 Donor 전환)이 완료된 접수건입니다.', 'already confirmed disposal refused');
SELECT throws_ok($$ SELECT donor_convert_from_ticket(gen_random_uuid(), true, 'LG', 'x') $$,
  'P0001', '접수건을 찾을 수 없습니다.', 'unknown ticket refused');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM donor_devices), 0, 'refusals wrote nothing');

SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO res SELECT 'conv', donor_convert_from_ticket('00000000-0000-4000-d000-000000000007', true,
  ' LG ', '14Z90R', '', '상판 찍힘', 'DONOR 선반 1') $$, 'MANAGER converts the DISPOSE ticket');
RESET ROLE;
SELECT matches((SELECT v->>'donor_no' FROM res WHERE k = 'conv'), '^D-[0-9]{4,}$', 'donor_no generated (D-NNNN)');
SELECT is((SELECT (v->>'candidates')::int FROM res WHERE k = 'conv'), 2, 'two DONOR_KEEP parts copied');
SELECT is((SELECT row(device_type::text, brand, model_text, tag_info, condition_note, storage_note, status, consent_confirmed_by::text)::text
             FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007'),
          row('노트북', 'LG', '14Z90R', NULL, '상판 찍힘', 'DONOR 선반 1', 'AVAILABLE', '00000000-0000-4000-a000-000000000002')::text,
          'donor row: type from ticket, trimmed texts, consent by caller');
SELECT is((SELECT row(catalog_model_id, catalog_variant_id, catalog_board_id)::text FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007'),
          row('00000000-0000-4000-f200-000000000002'::uuid, '00000000-0000-4000-f300-000000000001'::uuid, '00000000-0000-4000-f400-000000000001'::uuid)::text,
          'catalog links copied from the ticket');
SELECT ok((SELECT consent_confirmed_at IS NOT NULL FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007'), 'consent time stored');
SELECT is((SELECT string_agg(description || ':' || condition_estimate || ':' || coalesce(return_spec, '-') || ':' || status, ',' ORDER BY description)
             FROM donor_part_candidates), '배터리:FAULTY:-:AVAILABLE,원래 SSD:UNTESTED:M.2 NVMe:AVAILABLE',
          'DONOR_KEEP parts become AVAILABLE candidates (DISCARD not copied)');
SELECT is((SELECT count(*)::int FROM donor_part_candidates WHERE source_removed_part_id IS NOT NULL), 2, 'candidates keep the removed-part link');
SELECT ok((SELECT dispose_confirmed_at IS NOT NULL FROM repair_tickets WHERE id = '00000000-0000-4000-d000-000000000007'), 'ticket disposal confirmed');
SELECT is((SELECT to_jsonb(t) - 'dispose_confirmed_at' - 'updated_at' FROM repair_tickets t WHERE id = '00000000-0000-4000-d000-000000000007'),
          (SELECT j FROM t7_before), 'no other ticket column changed');
SELECT is((SELECT message FROM ticket_logs WHERE ticket_id = '00000000-0000-4000-d000-000000000007' ORDER BY created_at DESC LIMIT 1),
          (SELECT '시스템: 기기가 Donor로 전환되었습니다. (' || (v->>'donor_no') || ', 소유권 포기 동의 확인, 적출 후보 2건)' FROM res WHERE k = 'conv'), 'log line written');
SELECT is((SELECT row(count(*), (SELECT count(*) FROM inventory_transactions), sum(quantity))::text FROM inventory_items),
          (SELECT row(items, txs, qty)::text FROM stock_before), 'conversion writes no stock');

SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_convert_from_ticket('00000000-0000-4000-d000-000000000007', true, 'LG', 'x') $$,
  'P0001', '이미 폐기 확인(또는 Donor 전환)이 완료된 접수건입니다.', 'second conversion refused');
SELECT lives_ok($$ INSERT INTO res SELECT 'conv2', donor_convert_from_ticket('00000000-0000-4000-d000-000000000043', true, 'HP', 'X3') $$,
  'ADMIN converts another ticket');
RESET ROLE;
SELECT is((SELECT substr(v->>'donor_no', 3)::int FROM res WHERE k = 'conv2'), (SELECT substr(v->>'donor_no', 3)::int + 1 FROM res WHERE k = 'conv'), 'donor_no increments');
SELECT is((SELECT (v->>'candidates')::int FROM res WHERE k = 'conv2'), 0, 'no candidates without DONOR_KEEP parts');
SELECT throws_ok($$ INSERT INTO donor_devices (source_ticket_id, device_type, brand, consent_confirmed_by, consent_confirmed_at)
  VALUES ('00000000-0000-4000-d000-000000000007', '노트북', 'LG', '00000000-0000-4000-a000-000000000001', now()) $$,
  '23505', NULL, 'one donor per ticket');
SELECT throws_ok($$ DELETE FROM repair_tickets WHERE id = '00000000-0000-4000-d000-000000000043' $$, '23503', NULL, 'ticket with a donor cannot be deleted');

-- ---------- 2. donor_devices RLS ----------
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM donor_devices), 2, 'CS reads donors');
UPDATE donor_devices SET storage_note = 'CS' WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007';
RESET ROLE;
SELECT is((SELECT storage_note FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007'), 'DONOR 선반 1', 'CS update affects nothing');
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
UPDATE donor_devices SET storage_note = 'TECH' WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007';
RESET ROLE;
SELECT is((SELECT storage_note FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007'), 'DONOR 선반 1', 'TECHNICIAN update affects nothing');
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ UPDATE donor_devices SET storage_note = 'B-02', condition_note = '힌지 파손' WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007' $$, 'MANAGER edits notes');
SELECT throws_ok($$ UPDATE donor_devices SET consent_confirmed_by = '00000000-0000-4000-a000-000000000001' WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007' $$,
  '42501', NULL, 'consent columns not writable');
SELECT throws_ok($$ UPDATE donor_devices SET source_ticket_id = '00000000-0000-4000-d000-000000000008' WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007' $$,
  '42501', NULL, 'source ticket not writable');
SELECT throws_ok($$ UPDATE donor_devices SET status = 'GONE' WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007' $$, '23514', NULL, 'status CHECK');
SELECT throws_ok($$ UPDATE donor_devices SET catalog_variant_id = '00000000-0000-4000-f300-000000000001', catalog_model_id = NULL WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007' $$,
  '23514', NULL, 'variant needs a model');
SELECT throws_ok($$ DELETE FROM donor_devices $$, '42501', NULL, 'donors cannot be deleted');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT count(*) FROM donor_devices $$, '42501', NULL, 'anon cannot read donors');
SELECT throws_ok($$ SELECT count(*) FROM donor_part_candidates $$, '42501', NULL, 'anon cannot read candidates');
SELECT throws_ok($$ SELECT count(*) FROM donor_potential_stock $$, '42501', NULL, 'anon cannot read potential stock');
SELECT throws_ok($$ SELECT count(*) FROM donor_photos $$, '42501', NULL, 'anon cannot read photos');
RESET ROLE;

-- ---------- 3. candidates RLS ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO donor_part_candidates (donor_id, description, part_spec_id, condition_estimate)
  SELECT id, 'RAM 8GB', NULL, 'GOOD' FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007' $$,
  'TECHNICIAN adds a candidate');
SELECT throws_ok($$ INSERT INTO donor_part_candidates (donor_id, description, status, category_id, return_spec, return_name)
  SELECT id, 'x', 'EXTRACTED', '00000000-0000-4000-b100-000000000001', 's', 'n' FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007' $$,
  '42501', NULL, 'cannot insert as EXTRACTED');
SELECT throws_ok($$ UPDATE donor_part_candidates SET status = 'REQUESTED' WHERE description = 'RAM 8GB' $$,
  '23514', NULL, 'REQUESTED needs inbound fields');
SELECT lives_ok($$ UPDATE donor_part_candidates SET status = 'REQUESTED', category_id = '00000000-0000-4000-b100-000000000001',
  return_spec = '노트북용 DDR4', return_name = '삼성 DDR4-3200', return_capacity = '8GB' WHERE description = 'RAM 8GB' $$,
  'TECHNICIAN requests extraction with inbound fields');
SELECT throws_ok($$ UPDATE donor_part_candidates SET status = 'EXTRACTED' WHERE description = 'RAM 8GB' $$,
  '42501', NULL, 'TECHNICIAN cannot set EXTRACTED');
SELECT throws_ok($$ UPDATE donor_part_candidates SET inventory_item_id = '00000000-0000-4000-b400-000000000001' WHERE description = 'RAM 8GB' $$,
  '42501', NULL, 'inventory_item_id not writable');
SELECT throws_ok($$ UPDATE donor_part_candidates SET extracted_at = now() WHERE description = 'RAM 8GB' $$,
  '42501', NULL, 'extracted_at not writable');
SELECT throws_ok($$ SELECT donor_extract_part((SELECT id FROM donor_part_candidates WHERE description = 'RAM 8GB')) $$,
  'P0001', '적출 입고 권한이 없습니다. 관리자 또는 팀장만 가능합니다.', 'TECHNICIAN cannot book stock');
RESET ROLE;
SELECT pg_temp.jwt('5');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO donor_part_candidates (donor_id, description)
  SELECT id, '키보드' FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007' $$, 'EXPERT_REPAIR adds a candidate');
SELECT lives_ok($$ DELETE FROM donor_part_candidates WHERE description = '키보드' $$, 'EXPERT_REPAIR deletes an AVAILABLE candidate');
RESET ROLE;
SELECT pg_temp.jwt('3');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ INSERT INTO donor_part_candidates (donor_id, description) SELECT id, 'x' FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007' $$,
  '42501', NULL, 'RECEPTION cannot add candidates');
RESET ROLE;
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ INSERT INTO donor_part_candidates (donor_id, description) SELECT id, 'x' FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007' $$,
  '42501', NULL, 'CS cannot add candidates');
SELECT is((SELECT count(*)::int FROM donor_part_candidates), 3, 'CS reads candidates');
RESET ROLE;
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
DELETE FROM donor_part_candidates WHERE description = 'RAM 8GB';
RESET ROLE;
SELECT is((SELECT count(*)::int FROM donor_part_candidates WHERE description = 'RAM 8GB'), 1, 'REQUESTED candidate cannot be deleted');

-- ---------- 4. donor_extract_part ----------
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_extract_part((SELECT id FROM donor_part_candidates WHERE description = '배터리')) $$,
  'P0001', '입고할 카테고리·사양·제품명을 입력해 주세요.', 'missing inbound fields refused');
SELECT throws_ok($$ SELECT donor_extract_part((SELECT id FROM donor_part_candidates WHERE description = '배터리'),
  '00000000-0000-4000-b100-000000000003', '외주', 'x') $$, 'P0001', '외주 항목으로는 입고할 수 없습니다.', '외주 spec refused');
SELECT throws_ok($$ SELECT donor_extract_part(gen_random_uuid()) $$, 'P0001', '적출 후보 부품을 찾을 수 없습니다.', 'unknown candidate refused');
RESET ROLE;

-- atomicity: a failure after the inbound step rolls everything back
CREATE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced failure'; END; $$;
CREATE TRIGGER zz_boom BEFORE UPDATE ON donor_part_candidates FOR EACH ROW WHEN (NEW.status = 'EXTRACTED') EXECUTE FUNCTION pg_temp.boom();
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_extract_part((SELECT id FROM donor_part_candidates WHERE description = 'RAM 8GB'), '00000000-0000-4000-b100-000000000001', '원자성스펙', '원자성제품') $$,
  'P0001', 'forced failure', 'forced failure propagates');
RESET ROLE;
DROP TRIGGER zz_boom ON donor_part_candidates;
SELECT is((SELECT status FROM donor_part_candidates WHERE description = 'RAM 8GB'), 'REQUESTED', 'atomic: candidate unchanged');
SELECT is((SELECT count(*)::int FROM inventory_specs WHERE name = '원자성스펙'), 0, 'atomic: no spec left behind');
SELECT is((SELECT row(count(*), (SELECT count(*) FROM inventory_transactions), sum(quantity))::text FROM inventory_items),
          (SELECT row(items, txs, qty)::text FROM stock_before), 'atomic: stock unchanged');

-- Phase 7 (Q8): same category/spec/product/capacity as seed item i1 8GB (qty 3) → NOT merged, new qty-1 row
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO res SELECT 'ex1', donor_extract_part((SELECT id FROM donor_part_candidates WHERE description = 'RAM 8GB')) $$, 'MANAGER books the requested candidate');
RESET ROLE;
SELECT isnt((SELECT v->>'item_id' FROM res WHERE k = 'ex1'), '00000000-0000-4000-b400-000000000001', 'not merged into the matching USED item (Phase 7)');
SELECT is((SELECT quantity FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000001'), 3, 'existing item quantity unchanged');
SELECT is((SELECT row(user_id, transaction_type::text, quantity_changed, ticket_id, notes)::text FROM inventory_transactions
            WHERE item_id = (SELECT (v->>'item_id')::uuid FROM res WHERE k = 'ex1') ORDER BY created_at DESC LIMIT 1),
          row('00000000-0000-4000-a000-000000000002'::uuid, 'INBOUND', 1, '00000000-0000-4000-d000-000000000007'::uuid, '적출품 반환 입고')::text,
          'INBOUND by the caller, linked to the source ticket');
SELECT is((SELECT row(status, extracted_by::text, inventory_item_id::text)::text FROM donor_part_candidates WHERE description = 'RAM 8GB'),
          row('EXTRACTED', '00000000-0000-4000-a000-000000000002', (SELECT v->>'item_id' FROM res WHERE k = 'ex1'))::text, 'candidate marked extracted');

-- success with new values → new USED item, capacity stored
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO res SELECT 'ex2', donor_extract_part((SELECT id FROM donor_part_candidates WHERE description = '배터리'),
  '00000000-0000-4000-b100-000000000002', 'M.2 NVMe', 'SK하이닉스', ' 1TB ') $$, 'ADMIN books an AVAILABLE candidate directly');
RESET ROLE;
SELECT is((SELECT row(condition::text, quantity, capacity, base_estimate)::text FROM inventory_items WHERE id = (SELECT (v->>'item_id')::uuid FROM res WHERE k = 'ex2')),
          row('USED', 1, '1TB', 0)::text, 'new USED item with capacity');
SELECT is((SELECT count(*)::int FROM inventory_transactions WHERE item_id = (SELECT (v->>'item_id')::uuid FROM res WHERE k = 'ex2')), 1, 'exactly one INBOUND');
SELECT is((SELECT row(return_spec, return_name, return_capacity)::text FROM donor_part_candidates WHERE description = '배터리'),
          row('M.2 NVMe', 'SK하이닉스', '1TB')::text, 'booked values stored on the candidate');

SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_extract_part((SELECT id FROM donor_part_candidates WHERE description = 'RAM 8GB')) $$,
  'P0001', '적출 가능 또는 입고 요청 상태의 부품만 입고할 수 있습니다.', 'already extracted refused');
UPDATE donor_part_candidates SET note = 'x' WHERE description = 'RAM 8GB';
DELETE FROM donor_part_candidates WHERE description = 'RAM 8GB';
RESET ROLE;
SELECT is((SELECT coalesce(note, '') FROM donor_part_candidates WHERE description = 'RAM 8GB'), '', 'extracted candidate frozen (update)');
SELECT is((SELECT count(*)::int FROM donor_part_candidates WHERE description = 'RAM 8GB'), 1, 'extracted candidate frozen (delete)');
SELECT throws_ok($$ UPDATE donor_part_candidates SET status = 'EXTRACTED', category_id = '00000000-0000-4000-b100-000000000001',
  return_spec = 's', return_name = 'n' WHERE description = '원래 SSD' $$, '23514', NULL, 'EXTRACTED needs extracted_at (owner)');

-- same result as approve_removed_part_inbound on the same input (Phase 2 path)
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO res SELECT 'ex3', donor_extract_part((SELECT id FROM donor_part_candidates WHERE description = '원래 SSD')) $$,
  'stored inbound fields are used when no parameters are given');
RESET ROLE;
SELECT isnt((SELECT v->>'item_id' FROM res WHERE k = 'ex3'), '00000000-0000-4000-b400-000000000004', 'new unit row, not the USED 256GB WD item (Phase 7)');
SELECT is((SELECT quantity FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000004'), 1, 'WD 256GB quantity unchanged (1)');

-- scrapped donor: candidates leave the potential stock and cannot be booked
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO donor_part_candidates (donor_id, description, part_spec_id, category_id, return_spec, return_name, status)
  SELECT id, '액정 패널', NULL, '00000000-0000-4000-b100-000000000003', 'LCD', 'HP 15', 'REQUESTED'
    FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000043' $$, 'request on the second donor');
INSERT INTO donor_part_candidates (donor_id, description, status) SELECT id, '팬', 'UNUSABLE' FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000043';
RESET ROLE;

-- ---------- 5. potential stock view ----------
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT is((SELECT string_agg(description || ':' || candidate_status || ':' || brand, ',' ORDER BY description) FROM donor_potential_stock),
          '액정 패널:REQUESTED:HP', 'only AVAILABLE/REQUESTED candidates of AVAILABLE donors (extracted, unusable excluded)');
RESET ROLE;
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'donor_potential_stock'
                      AND column_name IN ('customer_id', 'source_ticket_id', 'name', 'phone', 'address')), 'view has no customer or ticket columns');
SELECT is((SELECT catalog_model_label IS NOT NULL FROM donor_potential_stock LIMIT 1), false, 'unlinked donor → no catalog label');
UPDATE donor_devices SET status = 'SCRAPPED' WHERE source_ticket_id = '00000000-0000-4000-d000-000000000043';
SELECT is((SELECT count(*)::int FROM donor_potential_stock), 0, 'scrapped donor parts leave the potential stock');
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT donor_extract_part((SELECT id FROM donor_part_candidates WHERE description = '액정 패널')) $$,
  'P0001', '보관 중인 Donor 기기의 부품만 입고할 수 있습니다.', 'scrapped donor cannot be booked');
RESET ROLE;
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ INSERT INTO donor_part_candidates (donor_id, description) SELECT id, 'x' FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000043' $$,
  '42501', NULL, 'no new candidates on a scrapped donor');
RESET ROLE;

-- ---------- 6. photos + storage ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO donor_photos (donor_id, path) SELECT id, id || '/a.webp' FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007' $$, 'TECHNICIAN adds a photo row');
DELETE FROM donor_photos;
RESET ROLE;
SELECT is((SELECT count(*)::int FROM donor_photos), 1, 'TECHNICIAN cannot delete photo rows');
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ INSERT INTO donor_photos (donor_id, path) SELECT id, 'x/b.webp' FROM donor_devices WHERE source_ticket_id = '00000000-0000-4000-d000-000000000007' $$, '42501', NULL, 'CS cannot add photos');
RESET ROLE;
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ DELETE FROM donor_photos $$, 'MANAGER deletes photo rows');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM donor_photos), 0, 'photo row deleted');

SELECT is((SELECT row(public, file_size_limit, allowed_mime_types)::text FROM storage.buckets WHERE id = 'donor-photos'),
          row(false, 10485760::bigint, ARRAY['image/webp', 'image/jpeg', 'image/png'])::text, 'bucket private, 10 MB, image types');
SELECT is((SELECT string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ',' ORDER BY policyname)
             FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'donor_photos_storage_%'),
          'donor_photos_storage_delete:DELETE:authenticated,donor_photos_storage_insert:INSERT:authenticated,donor_photos_storage_select:SELECT:authenticated',
          'three storage policies, authenticated only');
SELECT ok((SELECT with_check FROM pg_policies WHERE policyname = 'donor_photos_storage_insert') LIKE '%TECHNICIAN%'
      AND (SELECT with_check FROM pg_policies WHERE policyname = 'donor_photos_storage_insert') NOT LIKE '%CS%'
      AND (SELECT qual FROM pg_policies WHERE policyname = 'donor_photos_storage_delete') NOT LIKE '%TECHNICIAN%', 'storage policy roles');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'storage'
            AND (policyname LIKE 'ticket_images_%' OR policyname LIKE 'page_content_images_%' OR policyname = 'Allow Public Access zutf89_0')), 8,
          'existing storage policies still present');

-- ---------- 7. privileges / definitions ----------
SELECT ok((has_function_privilege('anon', 'public.donor_convert_from_ticket(uuid, boolean, text, text, text, text, text)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.donor_convert_from_ticket(uuid, boolean, text, text, text, text, text)'::regprocedure))
      AND (has_function_privilege('anon', 'public.donor_extract_part(uuid, uuid, text, text, text)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.donor_extract_part(uuid, uuid, text, text, text)'::regprocedure)), 'anon cannot execute Phase 4 functions (R10: EXECUTE granted, refused by the in-function guard)');
SELECT ok(has_function_privilege('authenticated', 'public.donor_convert_from_ticket(uuid, boolean, text, text, text, text, text)', 'EXECUTE')
      AND has_function_privilege('authenticated', 'public.donor_extract_part(uuid, uuid, text, text, text)', 'EXECUTE'), 'authenticated can execute the RPCs');
SELECT ok((has_function_privilege('authenticated', 'public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*authenticated[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid)'::regprocedure)),
          'internal inbound function still not executable (R10: EXECUTE granted, refused by the in-function guard)');
SELECT ok(NOT has_sequence_privilege('authenticated', 'public.donor_no_seq', 'USAGE') AND NOT has_sequence_privilege('anon', 'public.donor_no_seq', 'USAGE'),
          'sequence not usable by API roles');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prosecdef AND p.proconfig IS NOT NULL
              AND p.proname IN ('donor_convert_from_ticket', 'donor_extract_part')), 2, 'definer functions set search_path');
SELECT is((SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relrowsecurity AND c.relname IN ('donor_devices', 'donor_part_candidates', 'donor_photos')), 3,
          'RLS enabled on all 3 new tables');
SELECT is((SELECT reloptions::text FROM pg_class WHERE relname = 'donor_potential_stock'), '{security_invoker=true}', 'view is security_invoker');

SELECT * FROM finish();
ROLLBACK;
