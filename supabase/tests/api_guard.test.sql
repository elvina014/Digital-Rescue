-- =============================================================
-- Phase 0.6 — API guard (KI-8 / R10)
-- Run: npx supabase test db   (local only; everything is rolled back)
-- The test runs as postgres, so supautils IS loaded: every refusal below goes through the former crash path.
-- Seed users: a…01 ADMIN, 02 MANAGER, 03 RECEPTION, 04 TECHNICIAN, 05 EXPERT_REPAIR, 06 CS
-- The expectation list is generated from the definitions before Phase 0.6 (test-fixtures/phase0.6/functions_before.sql).
-- =============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT * FROM no_plan();

CREATE FUNCTION pg_temp.jwt(p_n text) RETURNS text LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a000-00000000000' || p_n, 'role', 'authenticated')::text, true);
$$;

-- fn, kind (definer | invoker | trigger | grant_only), roles without EXECUTE before Phase 0.6, md5 of the body before (\r removed)
CREATE TEMP TABLE guard_expect (fn regprocedure PRIMARY KEY, kind text, denied text[], body_md5 text);
INSERT INTO guard_expect VALUES
  ('apply_refund_material_adjustments(uuid,boolean)'::regprocedure, 'definer', '{anon,authenticated}'::text[], '63e686bea4c54f3acdcbe4439e47f480'),
  ('approve_material_dispatch(uuid,uuid)'::regprocedure, 'definer', '{anon,authenticated}'::text[], '55a63b99bcbf4a823180bb1d813bd142'),
  ('approve_removed_part_inbound(uuid)'::regprocedure, 'definer', '{anon}'::text[], '4100cb3a0f88f085bf04f9cc15fd32a9'),
  ('approve_return_material(uuid)'::regprocedure, 'definer', '{anon}'::text[], 'e8eb9b8431bebf9cfc34fb2a5d35766f'),
  ('catalog_create_model(text,text,device_type,text)'::regprocedure, 'definer', '{anon}'::text[], 'e86b67c96bda6f217af266c081ad51d2'),
  ('catalog_keep_ticket_updated_at()'::regprocedure, 'trigger', '{anon,authenticated}'::text[], '3ac7ace475fc1969dcafec86685d75bf'),
  ('catalog_map_model_string(text,uuid,uuid,text)'::regprocedure, 'definer', '{anon}'::text[], '0fa1af0c1e846e905ea044d0e2f7456c'),
  ('catalog_normalize(text)'::regprocedure, 'grant_only', '{anon}'::text[], '844346b2bcfa7d5047782f00715234d5'),
  ('catalog_search_boards(text,integer)'::regprocedure, 'invoker', '{anon}'::text[], '53326d988d58e0adfb864331d56cb0a2'),
  ('catalog_search_models(text,integer)'::regprocedure, 'invoker', '{anon}'::text[], 'e063c85a6388ec8a4684f74aac337de0'),
  ('catalog_set_updated_at()'::regprocedure, 'trigger', '{anon,authenticated}'::text[], '5bdc21b8fa8fb1231bdb021e09a5bc8e'),
  ('catalog_unmap_alias(uuid)'::regprocedure, 'definer', '{anon}'::text[], '8cf26d6bcd1198fc22ca47558790ac7b'),
  ('catalog_unmapped_model_strings(integer)'::regprocedure, 'definer', '{anon}'::text[], '5bc39dbe8ee19f60f5abef80f5854497'),
  ('confirm_material_return(uuid)'::regprocedure, 'definer', '{anon}'::text[], '13b0acc7669be8627c7390a54690e3ca'),
  ('donor_convert_from_ticket(uuid,boolean,text,text,text,text,text)'::regprocedure, 'definer', '{anon}'::text[], '7826ab087f21905cd721f3e3f1b11530'),
  ('donor_extract_part(uuid,uuid,text,text,text)'::regprocedure, 'definer', '{anon}'::text[], '741d230036a1342da4989573c24fe642'),
  ('generate_refund_no()'::regprocedure, 'trigger', '{anon,authenticated}'::text[], '0acacb53a475531bd92b6b2300577ef1'),
  ('get_device_knowledge(uuid,uuid,uuid,uuid)'::regprocedure, 'definer', '{anon}'::text[], '093a9bc1a27d1344684fe23847cece93'),
  ('label_lookup(text)'::regprocedure, 'definer', '{anon}'::text[], '97394cb5abacbfbd34370943314c5ab4'),
  ('model_note_stamp()'::regprocedure, 'trigger', '{anon,authenticated}'::text[], 'db79ec82248998564a64ee07f421b3da'),
  ('part_set_updated_at()'::regprocedure, 'trigger', '{anon,authenticated}'::text[], '5bdc21b8fa8fb1231bdb021e09a5bc8e'),
  ('part_spec_create(text,text,text,text)'::regprocedure, 'definer', '{anon}'::text[], 'ce22c353a202bc8b0282758e4dcf2a73'),
  ('part_spec_search(text,integer)'::regprocedure, 'invoker', '{anon}'::text[], '91e29205f1f4608aa370361bc92d4ac2'),
  ('protect_canceled_ticket()'::regprocedure, 'trigger', '{anon,authenticated}'::text[], '299df79916945d1d8966e0947be9ce2d'),
  ('purchase_guard_check(uuid)'::regprocedure, 'definer', '{anon}'::text[], '506c1fc45d7e7af2a072df4a03ae7cc3'),
  ('recalc_ticket_material_cost(uuid)'::regprocedure, 'definer', '{anon}'::text[], '5127b7b39fab0fb740b873ec37634205'),
  ('record_compatibility_result(uuid,text,uuid,text,text,text,text,text)'::regprocedure, 'definer', '{anon}'::text[], '91301283d33827e41bc88cdf0315d5a9'),
  ('record_part_install_result(uuid,uuid,text,text,text,uuid)'::regprocedure, 'definer', '{anon}'::text[], '50ca9f66bdfc253eb11a0c88c46dd6f5'),
  ('register_return_material(uuid,uuid,text,text,text,integer,text)'::regprocedure, 'definer', '{anon}'::text[], 'e7da6fb8b3e3c283c8400420b34ea7bc'),
  ('repair_gate_check(uuid,text)'::regprocedure, 'invoker', '{anon}'::text[], 'e9a904d866a6a08f55d278cd996052e3'),
  ('repair_gate_override(uuid,text,text)'::regprocedure, 'definer', '{anon}'::text[], 'c6cc742b8e180e1aea92e9801717c39e'),
  ('repair_record_can_edit(uuid)'::regprocedure, 'definer', '{anon}'::text[], '18be4f60e00562ddbb0d81a942a1f353'),
  ('repair_removed_part_stamp()'::regprocedure, 'trigger', '{anon,authenticated}'::text[], '53b58bc411796e979df7de314074171f'),
  ('repair_set_cancel_result(uuid,text)'::regprocedure, 'definer', '{anon}'::text[], '5182dea9813cded0b6170f5190f4e71d'),
  ('repair_set_updated_at()'::regprocedure, 'trigger', '{anon,authenticated}'::text[], 'fcd1b1d192516ac31553a7d78d71b9e5'),
  ('request_purchase_material(uuid,text,text)'::regprocedure, 'definer', '{anon}'::text[], 'cf95ccd73ae0aab318d695584298cb8b'),
  ('request_refund(uuid,integer,refund_reason,refund_method,text,text,text,text,jsonb)'::regprocedure, 'definer', '{anon}'::text[], 'fc7c778ac958bbab93de5e4c64994c2c'),
  ('retract_compatibility_evidence(uuid,text)'::regprocedure, 'definer', '{anon}'::text[], 'af36aa79a70d7156d18fe2e554a98cd0'),
  ('ri_compatibility_row(uuid,text,uuid)'::regprocedure, 'definer', '{anon,authenticated,service_role}'::text[], '27d8d73fb37e65952283e6f7e26cadc7'),
  ('ri_inbound_extracted_part(uuid,text,text,text,integer,uuid,uuid)'::regprocedure, 'invoker', '{anon,authenticated,service_role}'::text[], 'b28f60e85fed8f622787a2691e7a6cc1'),
  ('ri_next_item_label()'::regprocedure, 'definer', '{anon}'::text[], 'cf1c30ec987ed24cf84875b8240f61e1'),
  ('ri_purchase_guard_enforce()'::regprocedure, 'trigger', '{anon,authenticated}'::text[], 'fdd0566e35264d24b559f9dac8d6b007'),
  ('ri_purchase_material_info(uuid,boolean)'::regprocedure, 'invoker', '{anon,authenticated}'::text[], '903127c43ccc5b90c76f9c5ec23cdc56'),
  ('ri_purchase_resources(uuid)'::regprocedure, 'invoker', '{anon,authenticated}'::text[], 'b6b467d4ff9ad8e3fdaa1004e06db3b3'),
  ('ri_recompute_compatibility(uuid)'::regprocedure, 'definer', '{anon,authenticated,service_role}'::text[], '25b729294f512c7369b3a4d9803536ed'),
  ('search_devices_for_part(uuid)'::regprocedure, 'invoker', '{anon}'::text[], 'abe5514ad3eef1cf288299aee5bf7835'),
  ('search_parts_for_device(uuid,uuid,uuid)'::regprocedure, 'invoker', '{anon}'::text[], '3ecdb98bcc96779315e8c0febfe20983'),
  ('set_storage_location(text,uuid,uuid)'::regprocedure, 'definer', '{anon}'::text[], '63b15111ef6c4cfbfd30c8ca2116b402'),
  ('sync_ticket_refunded_amount()'::regprocedure, 'trigger', '{anon,authenticated}'::text[], '015bc6e558882d621f3c335d4f837724'),
  ('transition_refund(uuid,text,text,boolean)'::regprocedure, 'definer', '{anon}'::text[], '1cac63f9f8fe46148baf2d33e330a973');
GRANT SELECT ON guard_expect TO anon, authenticated, service_role;

-- a call with NULL arguments (the guard is the first statement, so arguments are never used when it refuses)
CREATE FUNCTION pg_temp.null_call(p_fn regprocedure) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT * FROM %s(%s)', p_fn::oid::regproc,
                coalesce((SELECT string_agg(format('NULL::%s', t::regtype), ', ' ORDER BY o)
                            FROM unnest((SELECT proargtypes::oid[] FROM pg_proc WHERE oid = p_fn)) WITH ORDINALITY AS a(t, o)), ''));
$$;
-- runs a statement and returns 'ok' or the error message (used for "the guard does not refuse" checks)
CREATE FUNCTION pg_temp.try(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.null_call(regprocedure), pg_temp.try(text), pg_temp.jwt(text) TO anon, authenticated, service_role;

-- ---------- 1. R10 invariant ----------
SELECT is((SELECT string_agg(p.oid::regprocedure::text, ', ')
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname IN ('public', 'graphql_public')
              AND (NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                   OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
                   OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE'))),
          NULL, 'R10: every function in an exposed schema is executable by anon, authenticated and service_role');
SELECT is((SELECT count(*)::int FROM guard_expect), 50, '50 functions in the Phase 0.6 list');

-- ---------- 2. definitions: exactly one guard line, rest byte-identical ----------
SELECT is((SELECT string_agg(e.fn::text, ', ') FROM guard_expect e JOIN pg_proc p ON p.oid = e.fn
            WHERE md5(replace(regexp_replace(p.prosrc,
                    '^(  PERFORM|SELECT) public\.ri_api_guard_(definer|invoker)\(''\{[a-z_,]+\}''\);\r?\n', '', 'n'), E'\r', '')) <> e.body_md5),
          NULL, 'every body without the guard line equals the body before Phase 0.6');
SELECT is((SELECT string_agg(e.fn::text, ', ') FROM guard_expect e JOIN pg_proc p ON p.oid = e.fn
            WHERE e.kind IN ('definer', 'invoker')
              AND (SELECT count(*) FROM regexp_matches(p.prosrc, 'public\.ri_api_guard_(definer|invoker)\(', 'g'))
                  IS DISTINCT FROM 1),
          NULL, 'every guarded function has exactly one guard call');
SELECT is((SELECT string_agg(e.fn::text, ', ') FROM guard_expect e JOIN pg_proc p ON p.oid = e.fn
            WHERE e.kind IN ('definer', 'invoker')
              AND position(format('public.ri_api_guard_%s(''{%s}'')', e.kind, array_to_string(e.denied, ',')) IN p.prosrc) = 0),
          NULL, 'each guard uses the right helper (definer/invoker) and denies exactly the roles that lacked EXECUTE');
SELECT is((SELECT string_agg(e.fn::text, ', ') FROM guard_expect e JOIN pg_proc p ON p.oid = e.fn
            WHERE e.kind IN ('trigger', 'grant_only') AND p.prosrc ~ 'ri_api_guard_'),
          NULL, 'trigger functions and catalog_normalize have no guard');
SELECT is((SELECT string_agg(e.fn::text, ', ') FROM guard_expect e JOIN pg_proc p ON p.oid = e.fn
            WHERE e.kind IN ('definer', 'invoker') AND (e.kind = 'definer') <> p.prosecdef),
          NULL, 'SECURITY DEFINER / INVOKER unchanged');

-- helpers
SELECT ok(has_function_privilege('anon', 'public.ri_api_guard_definer(text[])', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.ri_api_guard_invoker(text[])', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.ri_api_guard_definer(text[])', 'EXECUTE'), 'helpers executable by the hint roles');
SELECT ok((SELECT bool_and(NOT (proacl::text ~ '(^\{|,)=X')) FROM pg_proc WHERE proname IN ('ri_api_guard_definer', 'ri_api_guard_invoker')),
          'helpers not granted to PUBLIC');
SELECT ok((SELECT bool_and(NOT prosecdef AND proconfig IS NOT NULL) FROM pg_proc WHERE proname IN ('ri_api_guard_definer', 'ri_api_guard_invoker')),
          'helpers are SECURITY INVOKER with a fixed search_path');

-- ---------- 3. refusals preserved (top-level call, former crash path) ----------
SET LOCAL ROLE anon;
-- search_devices_for_part (SQL) reads the security_invoker view compatibility_summary: Postgres checks the view while the SQL
-- function starts (all statements are rewritten first), so anon gets 'permission denied for view' (42501, no crash) before the guard runs.
SELECT throws_ok(pg_temp.null_call(e.fn), '42501',
                 CASE WHEN e.fn = 'public.search_devices_for_part(uuid)'::regprocedure THEN 'permission denied for view compatibility_summary'
                      ELSE '로그인이 필요합니다. 다시 로그인해 주세요.' END, 'anon refused: ' || e.fn::text)
  FROM guard_expect e WHERE e.kind IN ('definer', 'invoker') AND 'anon' = ANY (e.denied) ORDER BY e.fn::text;
RESET ROLE;

SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT throws_ok(pg_temp.null_call(e.fn), '42501', '직접 호출할 수 없는 함수입니다.', 'authenticated refused: ' || e.fn::text)
  FROM guard_expect e WHERE e.kind IN ('definer', 'invoker') AND 'authenticated' = ANY (e.denied) ORDER BY e.fn::text;
-- a DO block runs as the session role, like before (the EXECUTE check used authenticated)
SELECT throws_ok($$ DO $b$ BEGIN PERFORM public.apply_refund_material_adjustments(NULL, false); END $b$ $$,
                 '42501', '직접 호출할 수 없는 함수입니다.', 'authenticated refused from a DO block (no definer frame above)');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(pg_temp.null_call(e.fn), '42501', '직접 호출할 수 없는 함수입니다.', 'service_role refused: ' || e.fn::text)
  FROM guard_expect e WHERE e.kind IN ('definer', 'invoker') AND 'service_role' = ANY (e.denied) ORDER BY e.fn::text;
RESET ROLE;

-- ---------- 4. allowed roles get past the guard (whatever the function itself answers) ----------
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT ok(pg_temp.try(pg_temp.null_call(e.fn)) NOT IN ('로그인이 필요합니다. 다시 로그인해 주세요.', '직접 호출할 수 없는 함수입니다.'),
          'authenticated not refused by the guard: ' || e.fn::text)
  FROM guard_expect e WHERE e.kind IN ('definer', 'invoker') AND NOT ('authenticated' = ANY (e.denied)) ORDER BY e.fn::text;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT ok(pg_temp.try(pg_temp.null_call(e.fn)) NOT IN ('로그인이 필요합니다. 다시 로그인해 주세요.', '직접 호출할 수 없는 함수입니다.'),
          'service_role not refused by the guard: ' || e.fn::text)
  FROM guard_expect e WHERE e.kind IN ('definer', 'invoker') AND NOT ('service_role' = ANY (e.denied)) ORDER BY e.fn::text;
RESET ROLE;
SELECT ok(pg_temp.try(pg_temp.null_call(e.fn)) NOT IN ('로그인이 필요합니다. 다시 로그인해 주세요.', '직접 호출할 수 없는 함수입니다.'),
          'postgres (no SET ROLE) not refused by the guard: ' || e.fn::text)
  FROM guard_expect e WHERE e.kind IN ('definer', 'invoker') ORDER BY e.fn::text;

-- ---------- 5. nested calls keep working (callee lacked EXECUTE for the session role) ----------
-- refund: transition_refund (definer) -> apply_refund_material_adjustments (denied anon, authenticated)
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT public.request_refund('00000000-0000-4000-d000-000000000006', 50000, 'QUALITY', 'CARD_PARTIAL_CANCEL', 'guard test',
                  NULL, NULL, NULL, '[{"kind":"inventory_recover","material_id":"00000000-0000-4000-e000-000000000006"}]'::jsonb) $$,
                'MANAGER requests a refund with a material adjustment');
RESET ROLE;
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT public.transition_refund((SELECT id FROM public.ticket_refunds WHERE reason_note = 'guard test'), 'APPROVE', NULL, false) $$,
                'ADMIN approves');
RESET ROLE;
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT public.transition_refund((SELECT id FROM public.ticket_refunds WHERE reason_note = 'guard test'), 'COMPLETE', NULL, true) $$,
                'CS completes -> nested apply_refund_material_adjustments runs as the definer owner');
RESET ROLE;
SELECT is((SELECT status::text FROM public.ticket_refunds WHERE reason_note = 'guard test'), 'COMPLETED', 'refund completed');
-- compatibility: record_compatibility_result (definer) -> ri_compatibility_row / ri_recompute_compatibility (denied all three)
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT public.part_spec_create('STORAGE', 'guard test SSD', NULL, 'MODEL') $$, 'ADMIN creates a part spec');
SELECT lives_ok($$ SELECT public.catalog_create_model('guardtest', 'GT-1', '노트북', NULL) $$, 'ADMIN creates a model');
SELECT is(public.record_compatibility_result((SELECT id FROM public.part_specs WHERE name = 'guard test SSD'), 'MODEL',
            (SELECT id FROM public.catalog_models WHERE name = 'GT-1'), 'DOCUMENT', 'compatible', NULL, 'manual', NULL) ->> 'confidence',
          'documented', 'nested ri_compatibility_row + ri_recompute_compatibility work for ADMIN');
RESET ROLE;
-- purchase guard: purchase_guard_check (definer) -> ri_purchase_material_info / ri_purchase_resources (invoker, denied anon, authenticated)
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
INSERT INTO public.ticket_materials (id, ticket_id, inventory_item_id, quantity, request_status, request_type)
VALUES ('00000000-0000-4000-e000-0000000000f7', '00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b400-000000000002', 1, 'pending', 'purchase');
SELECT is(public.purchase_guard_check('00000000-0000-4000-e000-0000000000f7') ->> 'request_status', 'pending',
          'nested invoker helpers run as the definer owner');
-- RLS + column default inside definer functions
SELECT is(public.repair_record_can_edit('00000000-0000-4000-d000-000000000004'), true, 'TECHNICIAN can edit the assigned repair record');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok($$ INSERT INTO public.inventory_items (category_id, spec_id, product_id, capacity, condition, quantity, base_estimate)
                   VALUES ('00000000-0000-4000-b100-000000000001', '00000000-0000-4000-b200-000000000001', '00000000-0000-4000-b300-000000000001', 'guard', 'NEW', 1, 0) $$,
                'service_role insert still gets a label from ri_next_item_label');
RESET ROLE;

-- ---------- 6. trigger functions and catalog_normalize ----------
SET LOCAL ROLE anon;
SELECT throws_ok(format('SELECT %s()', e.fn::oid::regproc), '0A000', NULL, 'direct call of trigger function refused by Postgres: ' || e.fn::text)
  FROM guard_expect e WHERE e.kind = 'trigger' ORDER BY e.fn::text;
SELECT is(public.catalog_normalize(' LG 15Z90 '), public.catalog_normalize('lg15z90'), 'anon can run the pure catalog_normalize');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
