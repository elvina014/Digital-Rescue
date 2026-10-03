-- =============================================================
-- Phase 1 — device catalog (catalog_*)
-- Run: npx supabase test db   (local only; everything is rolled back)
-- Seed users: a…01 ADMIN, 02 MANAGER, 03 RECEPTION, 04 TECHNICIAN, 05 EXPERT_REPAIR, 06 CS
-- =============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(64);

-- ids
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
INSERT INTO ids VALUES
  ('admin', '00000000-0000-4000-a000-000000000001'), ('manager', '00000000-0000-4000-a000-000000000002'),
  ('reception', '00000000-0000-4000-a000-000000000003'), ('tech', '00000000-0000-4000-a000-000000000004'),
  ('cs', '00000000-0000-4000-a000-000000000006'),
  ('m1', '00000000-0000-4000-f200-000000000001'), ('m2', '00000000-0000-4000-f200-000000000002'),
  ('m3', '00000000-0000-4000-f200-000000000003'), ('v2', '00000000-0000-4000-f300-000000000001'),
  ('b1', '00000000-0000-4000-f400-000000000001'), ('b2', '00000000-0000-4000-f400-000000000002');
CREATE TEMP TABLE res (k text PRIMARY KEY, v jsonb);
GRANT ALL ON ids, res TO authenticated, anon;

CREATE FUNCTION pg_temp.jwt(p_uid text) RETURNS text LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.jwt(text) TO authenticated, anon;

-- ---------- 1. normalisation ----------
SELECT is(catalog_normalize('15Z90T-GP5HL'), '15z90tgp5hl', 'normalize: hyphen + case');
SELECT is(catalog_normalize('15z90t gp5hl'), '15z90tgp5hl', 'normalize: space');
SELECT is(catalog_normalize('[Lenovo]ThinkPad X390 Yoga'), 'lenovothinkpadx390yoga', 'normalize: brackets');
SELECT is(catalog_normalize('갤럭시 북-3'), '갤럭시북3', 'normalize: Hangul kept');
SELECT is(catalog_normalize('  -- '), NULL, 'normalize: empty → NULL');

-- ---------- 2. constraints ----------
SELECT throws_ok($$ INSERT INTO catalog_model_aliases (model_id, alias, source) VALUES ('00000000-0000-4000-f200-000000000001', 'nt-950 qed', 'manual') $$,
  '23505', NULL, 'alias unique by normalised text (global)');
SELECT throws_ok($$ INSERT INTO catalog_model_aliases (model_id, variant_id, alias, source) VALUES ('00000000-0000-4000-f200-000000000001', '00000000-0000-4000-f300-000000000001', 'x-new', 'manual') $$,
  '23503', NULL, 'alias: variant of another model rejected');
SELECT throws_ok($$ INSERT INTO catalog_model_boards (model_id, variant_id, board_id) VALUES ('00000000-0000-4000-f200-000000000001', '00000000-0000-4000-f300-000000000001', '00000000-0000-4000-f400-000000000001') $$,
  '23503', NULL, 'model_boards: variant of another model rejected');
SELECT throws_ok($$ UPDATE repair_tickets SET catalog_model_id = '00000000-0000-4000-f200-000000000001', catalog_variant_id = '00000000-0000-4000-f300-000000000001' WHERE id = '00000000-0000-4000-d000-000000000001' $$,
  '23503', NULL, 'ticket: variant of another model rejected');
SELECT throws_ok($$ UPDATE repair_tickets SET catalog_variant_id = '00000000-0000-4000-f300-000000000001' WHERE id = '00000000-0000-4000-d000-000000000001' $$,
  '23514', NULL, 'ticket: variant without model rejected');

-- ---------- 3. RLS ----------
SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000004');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM catalog_models), 3, 'TECHNICIAN reads catalog');
SELECT throws_ok($$ INSERT INTO catalog_brands (name) VALUES ('Dell') $$, '42501', NULL, 'TECHNICIAN cannot insert');
RESET ROLE;

SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000006');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM catalog_boards), 2, 'CS reads catalog');
RESET ROLE;

SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000002');
SET LOCAL ROLE authenticated;
UPDATE catalog_models SET notes = 'manager edit';
DELETE FROM catalog_board_aliases;
RESET ROLE;
SELECT is((SELECT count(*)::int FROM catalog_models WHERE notes IS NOT NULL), 0, 'MANAGER update affects nothing');
SELECT is((SELECT count(*)::int FROM catalog_board_aliases), 1, 'MANAGER delete affects nothing');

SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000001');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO catalog_brands (name) VALUES ('Dell') $$, 'ADMIN can insert');
SELECT throws_ok($$ INSERT INTO catalog_ticket_link_log (ticket_id, action) VALUES ('00000000-0000-4000-d000-000000000001', 'link') $$,
  '42501', NULL, 'link log not writable directly, even by ADMIN');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT count(*) FROM catalog_models $$, '42501', NULL, 'anon has no table access');
RESET ROLE;
-- Calling a function without EXECUTE crashes the local Postgres image (KI-8); since Phase 0.6 (R10) the refusal is the in-function guard.
SELECT ok((has_function_privilege('anon', 'public.catalog_search_models(text, integer)', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.catalog_search_models(text, integer)'::regprocedure)), 'anon cannot execute search (R10: EXECUTE granted, refused by the in-function guard)');

-- ---------- 4. catalog_create_model ----------
SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000003');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'rec', catalog_create_model('LG', '14Z90R', '노트북');
RESET ROLE;
SELECT is((SELECT v->>'existed' FROM res WHERE k = 'rec'), 'false', 'RECEPTION creates model');
SELECT is((SELECT needs_review FROM catalog_models WHERE id = (SELECT (v->>'model_id')::uuid FROM res WHERE k = 'rec')), true,
  'non-admin model needs review');
SELECT is((SELECT created_by FROM catalog_models WHERE id = (SELECT (v->>'model_id')::uuid FROM res WHERE k = 'rec')),
  '00000000-0000-4000-a000-000000000003'::uuid, 'created_by = caller');

SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'adm', catalog_create_model('Asus', 'ROG Zephyrus G14 GA403', '노트북', '2024');
RESET ROLE;
SELECT is((SELECT needs_review FROM catalog_models WHERE id = (SELECT (v->>'model_id')::uuid FROM res WHERE k = 'adm')), false,
  'ADMIN model needs no review');
SELECT isnt((SELECT v->>'variant_id' FROM res WHERE k = 'adm'), NULL, 'variant created');

SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000004');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'dup', catalog_create_model('lg', '14z90-r', NULL);
SELECT throws_ok($$ SELECT catalog_create_model('LG', ' - ', NULL) $$, 'P0001', '모델명을 입력해 주세요.', 'empty model rejected');
RESET ROLE;
SELECT is((SELECT v FROM res WHERE k = 'dup')->>'model_id', (SELECT v FROM res WHERE k = 'rec')->>'model_id', 'duplicate returns existing model');
SELECT is((SELECT v FROM res WHERE k = 'dup')->>'existed', 'true', 'duplicate flagged existed');

SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000006');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT catalog_create_model('LG', 'X1', NULL) $$, 'P0001', '모델 등록 권한이 없습니다.', 'CS cannot create');
RESET ROLE;

-- ---------- 5. mapping ----------
-- extra fixtures: an already-linked ticket and a CANCELED ticket with the same SKU spelling
INSERT INTO repair_tickets (id, customer_id, status, receipt_type, device_type, device_brand, device_model, symptoms, catalog_model_id)
VALUES ('00000000-0000-4000-d000-000000000013', '00000000-0000-4000-c000-000000000001', 'NEW', 'WALK_IN', '노트북', 'LG', '15Z90T/GP5HL', 't', '00000000-0000-4000-f200-000000000003'),
       ('00000000-0000-4000-d000-000000000014', '00000000-0000-4000-c000-000000000001', 'CANCELED', 'WALK_IN', '노트북', 'LG', '15z90t-gp5hl', 't', NULL);

CREATE TEMP TABLE snap AS
  SELECT t.id, to_jsonb(t) - 'catalog_model_id' - 'catalog_variant_id' - 'catalog_board_id' AS j, t.updated_at
    FROM repair_tickets t;

SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000002');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT catalog_map_model_string('15z90tgp5hl', '00000000-0000-4000-f200-000000000001') $$,
  'P0001', '관리자만 사용할 수 있습니다.', 'MANAGER cannot map');
SELECT throws_ok($$ SELECT * FROM catalog_unmapped_model_strings() $$, 'P0001', '관리자만 사용할 수 있습니다.', 'MANAGER cannot list unmapped');
RESET ROLE;
SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000004');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT catalog_unmap_alias(gen_random_uuid()) $$, 'P0001', '관리자만 사용할 수 있습니다.', 'TECHNICIAN cannot unmap');
RESET ROLE;

SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'map', catalog_map_model_string('15z90tgp5hl', '00000000-0000-4000-f200-000000000001', NULL, '15Z90T-GP5HL');
SELECT throws_ok($$ SELECT catalog_map_model_string('nt950qcg', '00000000-0000-4000-f200-000000000001', NULL, 'NT950QED') $$,
  'P0001', '이미 다른 모델에 연결된 별칭입니다.', 'alias conflict rejected');
SELECT throws_ok($$ SELECT catalog_map_model_string('ga403', '00000000-0000-4000-f200-000000000001', '00000000-0000-4000-f300-000000000001', 'GA403') $$,
  'P0001', '선택한 변형이 모델에 속하지 않습니다.', 'variant mismatch rejected');
SELECT is((SELECT count(*)::int FROM catalog_ticket_link_log), 3, 'ADMIN reads link log');
RESET ROLE;

SELECT is((SELECT (v->>'linked')::int FROM res WHERE k = 'map'), 3, 'map links 3 tickets (approved, new, canceled)');
SELECT is((SELECT count(*)::int FROM repair_tickets WHERE catalog_model_id = '00000000-0000-4000-f200-000000000001'
            AND id IN ('00000000-0000-4000-d000-000000000011', '00000000-0000-4000-d000-000000000012', '00000000-0000-4000-d000-000000000014')),
  3, 'approved + new + canceled ticket linked');
SELECT is((SELECT catalog_model_id FROM repair_tickets WHERE id = '00000000-0000-4000-d000-000000000013'),
  '00000000-0000-4000-f200-000000000003'::uuid, 'existing link not overwritten');
SELECT is((SELECT count(*)::int FROM repair_tickets t JOIN snap s ON s.id = t.id
            WHERE (to_jsonb(t) - 'catalog_model_id' - 'catalog_variant_id' - 'catalog_board_id') IS DISTINCT FROM s.j),
  0, 'no other column changed on any ticket (incl. updated_at)');
SELECT is((SELECT count(*)::int FROM catalog_ticket_link_log WHERE action = 'link' AND done_by = '00000000-0000-4000-a000-000000000001'),
  3, 'one link log row per ticket');
SELECT is((SELECT catalog_model_id FROM repair_tickets WHERE id = '00000000-0000-4000-d000-000000000008'), NULL,
  'failed mapping changed nothing');
SELECT is((SELECT source FROM catalog_model_aliases WHERE alias_norm = '15z90tgp5hl'), 'mapping', 'mapping alias created');

SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000002');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM catalog_ticket_link_log), 0, 'MANAGER cannot read link log');
RESET ROLE;

-- ---------- 6. unmap ----------
UPDATE repair_tickets SET catalog_model_id = '00000000-0000-4000-f200-000000000003'
 WHERE id = '00000000-0000-4000-d000-000000000012';   -- manual re-link after mapping

SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'unmap', catalog_unmap_alias((SELECT (v->>'alias_id')::uuid FROM res WHERE k = 'map'));
INSERT INTO res SELECT 'unmap_created', catalog_unmap_alias((SELECT id FROM catalog_model_aliases WHERE alias = 'ThinkPad L15 Gen 2'));
RESET ROLE;

SELECT is((SELECT (v->>'unlinked')::int FROM res WHERE k = 'unmap'), 2, 'unmap unlinks 2 tickets');
SELECT is((SELECT catalog_model_id FROM repair_tickets WHERE id = '00000000-0000-4000-d000-000000000011'), NULL, 'approved ticket unlinked');
SELECT is((SELECT catalog_model_id FROM repair_tickets WHERE id = '00000000-0000-4000-d000-000000000012'),
  '00000000-0000-4000-f200-000000000003'::uuid, 'manually re-linked ticket kept');
SELECT is((SELECT count(*)::int FROM catalog_model_aliases WHERE alias_norm = '15z90tgp5hl'), 0, 'mapping alias deleted');
SELECT is((SELECT count(*)::int FROM catalog_ticket_link_log WHERE action = 'unlink'), 2, 'unlink log rows');
SELECT is((SELECT t.updated_at FROM repair_tickets t WHERE t.id = '00000000-0000-4000-d000-000000000011'),
  (SELECT s.updated_at FROM snap s WHERE s.id = '00000000-0000-4000-d000-000000000011'), 'unmap keeps updated_at');
SELECT is((SELECT v->>'alias_deleted' FROM res WHERE k = 'unmap_created'), 'false', 'created alias is not deleted by unmap');

UPDATE repair_tickets SET symptoms = symptoms WHERE id = '00000000-0000-4000-d000-000000000001';
SELECT ok((SELECT t.updated_at FROM repair_tickets t WHERE t.id = '00000000-0000-4000-d000-000000000001')
          > (SELECT s.updated_at FROM snap s WHERE s.id = '00000000-0000-4000-d000-000000000001'),
  'normal ticket update still bumps updated_at');

-- ---------- 6b. protect_approved_ticket amendment ----------
SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000001');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ UPDATE repair_tickets SET symptoms = symptoms || ' x' WHERE id = '00000000-0000-4000-d000-000000000006' $$,
  'P0001', '승인 완료된 접수건은 수정할 수 없습니다. (권한: postgres)', 'without GUC: approved ticket still blocked as before (KI-9 unchanged)');
RESET ROLE;
SELECT set_config('app.catalog_link_sync', 'on', true);
SELECT throws_ok($$ UPDATE repair_tickets SET symptoms = symptoms || ' x', catalog_model_id = '00000000-0000-4000-f200-000000000001' WHERE id = '00000000-0000-4000-d000-000000000006' $$,
  'P0001', NULL, 'with GUC: non-catalog change on approved ticket still blocked');
SELECT lives_ok($$ UPDATE repair_tickets SET catalog_board_id = '00000000-0000-4000-f400-000000000001' WHERE id = '00000000-0000-4000-d000-000000000006' $$,
  'with GUC: catalog-only change on approved ticket allowed');
SELECT set_config('app.catalog_link_sync', 'off', true);
SELECT is((SELECT array_agg(a::text ORDER BY a::text) FROM pg_proc p, unnest(p.proacl) a WHERE p.oid = 'public.protect_approved_ticket()'::regprocedure),
  ARRAY['=X/postgres', 'anon=X/postgres', 'authenticated=X/postgres', 'postgres=X/postgres', 'service_role=X/postgres'],
  'protect_approved_ticket ACL unchanged');

-- ---------- 7. delete rules ----------
SELECT pg_temp.jwt('00000000-0000-4000-a000-000000000001');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ DELETE FROM catalog_models WHERE id = '00000000-0000-4000-f200-000000000003' $$, '23503', NULL,
  'referenced model cannot be deleted');
SELECT lives_ok($$ DELETE FROM catalog_boards WHERE id = '00000000-0000-4000-f400-000000000002' $$, 'unreferenced board deleted');

-- ---------- 8. search ----------
SELECT is((SELECT model_id FROM catalog_search_models('15z90') LIMIT 1), '00000000-0000-4000-f200-000000000001'::uuid, 'search partial SKU');
SELECT is((SELECT model_id FROM catalog_search_models('갤럭시북') LIMIT 1), '00000000-0000-4000-f200-000000000002'::uuid, 'search Korean name');
SELECT is((SELECT board_id FROM catalog_search_boards('nm-d4') LIMIT 1), '00000000-0000-4000-f400-000000000001'::uuid, 'board search by alias');
SELECT is((SELECT count(*)::int FROM catalog_search_models('zzzzqqqq')), 0, 'no match → empty');
RESET ROLE;

-- ---------- 9. privileges / definitions ----------
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE 'catalog\_%' AND p.prorettype <> 'trigger'::regtype AND p.proname <> 'catalog_normalize'
              AND NOT (has_function_privilege('anon', p.oid, 'EXECUTE') AND p.prosrc ~ 'ri_api_guard_(definer|invoker)\(''\{[a-z_,]*anon')),
  0, 'anon is refused by every catalog function (R10: EXECUTE granted, refused by the in-function guard; catalog_normalize is pure, decision 0.6-3)');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE 'catalog\_%' AND p.proconfig IS NULL),
  0, 'every catalog function sets search_path');
SELECT ok((has_function_privilege('authenticated', 'public.catalog_keep_ticket_updated_at()', 'EXECUTE') AND (SELECT p.prorettype = 'trigger'::regtype OR p.prosrc ~ ('ri_api_guard_(definer|invoker)\(''\{[a-z_,]*authenticated[a-z_,]*\}''\)') FROM pg_proc p WHERE p.oid = 'public.catalog_keep_ticket_updated_at()'::regprocedure)),
  'trigger function not executable by authenticated (R10: EXECUTE granted, refused by the in-function guard)');
SELECT is((SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'catalog\_%' AND c.relrowsecurity),
  8, 'RLS enabled on all 8 catalog tables');

SELECT * FROM finish();
ROLLBACK;
