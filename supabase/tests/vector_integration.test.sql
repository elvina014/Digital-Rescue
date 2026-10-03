-- =============================================================
-- Phase 8 — VECTOR integration (vector_agent, vector_api, ai_candidates, review RPCs)
-- Run: npx supabase test db   (local only; everything is rolled back except sequence values, which are restored)
-- Seed users: a…01 ADMIN, 02 MANAGER, 03 RECEPTION, 04 TECHNICIAN, 05 EXPERT_REPAIR, 06 CS
-- Seed catalog: model f200…01 LG 그램 15 15Z90T, f200…02 삼성 NT950QED (+ variant f300…01), boards f400…01 LA-K091P, f400…02
-- Seed customers: c…01 테스트고객1 / 010-0000-1001 / 테스트시 테스트구 1, c…02 테스트고객2
-- KI-8: hint roles (anon / authenticated / service_role) are never made to call a vector_api function; only has_function_privilege.
--       vector_agent is not in supautils.hint_roles, so its privilege errors are safe to provoke.
-- =============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT * FROM no_plan();

CREATE TEMP TABLE res (k text PRIMARY KEY, v jsonb);
GRANT ALL ON res TO authenticated, anon, service_role, vector_agent;
INSERT INTO res SELECT 'seq_label', to_jsonb(last_value) FROM inventory_label_seq;
INSERT INTO res SELECT 'seq_donor', to_jsonb(last_value) FROM donor_no_seq;

CREATE FUNCTION pg_temp.jwt(p_n text) RETURNS text LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a000-00000000000' || p_n, 'role', 'authenticated')::text, true);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.jwt(text) TO authenticated, anon, service_role, vector_agent;

-- row counts of every public table (as owner)
CREATE FUNCTION pg_temp.table_counts() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r record; v jsonb := '{}'::jsonb; n bigint;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
            WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1 LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.relname) INTO n;
    v := v || jsonb_build_object(r.relname, n);
  END LOOP;
  RETURN v;
END;
$$;

-- actual write attempts on every relation and sequence outside the temp / toast schemas (run as vector_agent)
CREATE TEMP TABLE att (rel text, relkind text, op text, state text);
GRANT ALL ON att TO vector_agent;
CREATE FUNCTION pg_temp.write_attempts() RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; v_col text; v_op text; v_sql text; v_state text;
BEGIN
  FOR r IN SELECT c.oid, n.nspname, c.relname, c.relkind::text AS relkind
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
              AND n.nspname NOT LIKE 'pg\_temp%' AND n.nspname NOT LIKE 'pg\_toast%'
            ORDER BY 2, 3 LOOP
    SELECT quote_ident(a.attname) INTO v_col FROM pg_attribute a
     WHERE a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1;
    FOREACH v_op IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      CONTINUE WHEN v_op = 'UPDATE' AND v_col IS NULL;
      v_sql := CASE v_op
                 WHEN 'INSERT' THEN format('INSERT INTO %I.%I DEFAULT VALUES', r.nspname, r.relname)
                 WHEN 'UPDATE' THEN format('UPDATE %I.%I SET %s = %s WHERE false', r.nspname, r.relname, v_col, v_col)
                 WHEN 'DELETE' THEN format('DELETE FROM %I.%I WHERE false', r.nspname, r.relname)
                 ELSE format('TRUNCATE %I.%I', r.nspname, r.relname) END;
      BEGIN
        EXECUTE v_sql;
        v_state := 'OK';
      EXCEPTION WHEN OTHERS THEN
        v_state := SQLSTATE;
      END;
      INSERT INTO att VALUES (r.nspname || '.' || r.relname, r.relkind, v_op, v_state);
    END LOOP;
  END LOOP;
  FOR r IN SELECT n.nspname, c.relname FROM pg_sequence s JOIN pg_class c ON c.oid = s.seqrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname NOT LIKE 'pg\_temp%' ORDER BY 1, 2 LOOP
    FOREACH v_op IN ARRAY ARRAY['nextval', 'setval'] LOOP
      v_sql := CASE v_op WHEN 'nextval' THEN format('SELECT nextval(%L)', r.nspname || '.' || r.relname)
                         ELSE format('SELECT setval(%L, 1)', r.nspname || '.' || r.relname) END;
      BEGIN
        EXECUTE v_sql;
        v_state := 'OK';
      EXCEPTION WHEN OTHERS THEN
        v_state := SQLSTATE;
      END;
      INSERT INTO att VALUES (r.nspname || '.' || r.relname, 'S', v_op, v_state);
    END LOOP;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.write_attempts() TO vector_agent;

-- runs a statement and returns its SQLSTATE ('OK' on success); pgTAP (schema extensions) is not usable by the agent
CREATE FUNCTION pg_temp.try_state(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.try_state(text) TO vector_agent;

-- ---------- fixtures (as owner) ----------
INSERT INTO part_specs (id, part_type, name, compat_target) VALUES
  ('00000000-0000-4000-8100-000000000001', 'PANEL',    'LP156WF9-SPK2', 'MODEL'),
  ('00000000-0000-4000-8100-000000000002', 'BATTERY',  'L19M3PF7',      'MODEL'),
  ('00000000-0000-4000-8100-000000000003', 'KEYBOARD', 'KB-15Z90T',     'MODEL'),
  ('00000000-0000-4000-8100-000000000004', 'PANEL',    'NV156FHM-N61',  'MODEL'),
  ('00000000-0000-4000-8100-000000000005', 'IC',       'BQ24780SRUYR',  'BOARD'),
  ('00000000-0000-4000-8100-000000000006', 'BATTERY',  'AI-TEST-BATT',  'MODEL'),
  ('00000000-0000-4000-8100-000000000007', 'FAN',      'AI-TEST-FAN',   'MODEL');
INSERT INTO part_number_aliases (part_spec_id, alias, alias_type) VALUES
  ('00000000-0000-4000-8100-000000000005', 'BQ24780S', 'MARKING');

-- stock for S2: NEW 2 + USED 1, plus the outsourced seed item (qty 99) linked to S2 → excluded; a storage location + price exist
INSERT INTO storage_locations (id, code, description) VALUES ('00000000-0000-4000-8200-000000000001', 'VX-01', '비밀 선반');
INSERT INTO inventory_items (id, category_id, spec_id, product_id, capacity, condition, quantity, base_estimate, part_spec_id, storage_location_id) VALUES
  ('00000000-0000-4000-8300-000000000001', '00000000-0000-4000-b100-000000000001', '00000000-0000-4000-b200-000000000001',
   '00000000-0000-4000-b300-000000000001', 'vx-new', 'NEW', 2, 53210, '00000000-0000-4000-8100-000000000002', '00000000-0000-4000-8200-000000000001'),
  ('00000000-0000-4000-8300-000000000002', '00000000-0000-4000-b100-000000000001', '00000000-0000-4000-b200-000000000001',
   '00000000-0000-4000-b300-000000000001', 'vx-used', 'USED', 1, 43210, '00000000-0000-4000-8100-000000000002', NULL);
UPDATE inventory_items SET part_spec_id = '00000000-0000-4000-8100-000000000002' WHERE id = '00000000-0000-4000-b400-000000000005';

-- donors: AVAILABLE donor with an S2 candidate; SCRAPPED donor with an S2 candidate (excluded)
INSERT INTO donor_devices (id, source_ticket_id, device_type, brand, model_text, catalog_model_id, status, storage_note,
                           consent_confirmed_by, consent_confirmed_at) VALUES
  ('00000000-0000-4000-8400-000000000001', '00000000-0000-4000-d000-000000000007', '노트북', 'LG', '15Z90T', '00000000-0000-4000-f200-000000000001',
   'AVAILABLE', '비밀 보관함', '00000000-0000-4000-a000-000000000002', now()),
  ('00000000-0000-4000-8400-000000000002', '00000000-0000-4000-d000-000000000008', '노트북', 'LG', '15Z90T', '00000000-0000-4000-f200-000000000001',
   'SCRAPPED', NULL, '00000000-0000-4000-a000-000000000002', now());
INSERT INTO donor_part_candidates (donor_id, description, part_spec_id, quantity) VALUES
  ('00000000-0000-4000-8400-000000000001', '배터리', '00000000-0000-4000-8100-000000000002', 1),
  ('00000000-0000-4000-8400-000000000002', '배터리', '00000000-0000-4000-8100-000000000002', 1);

-- tickets of model f200…01: K1 completed (PII in free text + excluded columns), K2 canceled (other customer), K3 test (excluded), K4 other model
INSERT INTO repair_tickets (id, customer_id, status, receipt_type, device_type, device_brand, device_model, tag_info, symptoms,
                            initial_estimate, final_price, is_approved, payment_status, received_at, completed_at, canceled_at,
                            is_test, catalog_model_id)
VALUES
  ('00000000-0000-4000-8500-000000000001', '00000000-0000-4000-c000-000000000001', 'COMPLETED', 'WALK_IN', '노트북', 'LG', 'PII모델문자열', 'PII태그문자열',
   'PII증상문자열', 0, 234567, true, 'PAID', now() - interval '10 days', now() - interval '8 days', NULL,
   false, '00000000-0000-4000-f200-000000000001'),
  ('00000000-0000-4000-8500-000000000002', '00000000-0000-4000-c000-000000000002', 'CANCELED', 'WALK_IN', '노트북', 'LG', 'x', NULL,
   'x', 0, 0, false, 'PENDING', now() - interval '5 days', NULL, now() - interval '4 days',
   false, '00000000-0000-4000-f200-000000000001'),
  ('00000000-0000-4000-8500-000000000003', '00000000-0000-4000-c000-000000000001', 'COMPLETED', 'WALK_IN', '노트북', 'LG', 'x', NULL,
   'x', 0, 10000, true, 'PAID', now() - interval '3 days', now() - interval '2 days', NULL,
   true, '00000000-0000-4000-f200-000000000001'),
  ('00000000-0000-4000-8500-000000000004', '00000000-0000-4000-c000-000000000001', 'COMPLETED', 'WALK_IN', '노트북', 'Lenovo', 'x', NULL,
   'x', 0, 10000, true, 'PAID', now() - interval '3 days', now() - interval '2 days', NULL,
   false, '00000000-0000-4000-f200-000000000003');
INSERT INTO repair_records (ticket_id, diagnosis_summary, fault_category, result, notes) VALUES
  ('00000000-0000-4000-8500-000000000001', '테스트고객1 요청. 연락처 010-9999-8888, 메일 kim.cs@example.com, 보드 NM-A311 쇼트',
   'MAINBOARD', 'COMPLETED', 'SECRET-RECORD-NOTES'),
  ('00000000-0000-4000-8500-000000000002', '테스트고객1 언급 없음, 테스트고객2 본인 방문', 'MAINBOARD', 'CUSTOMER_ABANDONED', NULL);
INSERT INTO ticket_symptoms (ticket_id, symptom_code_id, note) VALUES
  ('00000000-0000-4000-8500-000000000001', (SELECT id FROM symptom_codes WHERE code = 'POWER'), 'SECRET-SYMPTOM-NOTE');
INSERT INTO repair_faults (ticket_id, component, fault_type, description) VALUES
  ('00000000-0000-4000-8500-000000000001', 'PU8 (테스트 고객1 확인)', 'SHORT', '주민번호 900101-1234567 적힌 메모');
INSERT INTO repair_measurements (ticket_id, label, kind, value, unit, value_text, judgement, note) VALUES
  ('00000000-0000-4000-8500-000000000001', 'PPVBAT', 'VOLTAGE', 19.5, 'V', '19.5V', 'NORMAL', '카드 1234-5678-9012-3456 결제 메모');
INSERT INTO repair_actions (ticket_id, action_type, description, succeeded) VALUES
  ('00000000-0000-4000-8500-000000000001', 'REPLACE', 'PU8 교체 후 +82 10-2222-3333 고객 통화', true);
INSERT INTO ticket_materials (ticket_id, inventory_item_id, quantity, request_status, request_type, created_by) VALUES
  ('00000000-0000-4000-8500-000000000001', '00000000-0000-4000-b400-000000000001', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004'),
  ('00000000-0000-4000-8500-000000000001', '00000000-0000-4000-b400-000000000005', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004');
INSERT INTO model_notes (model_id, note_type, body, created_by) VALUES
  ('00000000-0000-4000-f200-000000000001', 'CAUTION', '하판 나사 주의. 문의 010-3333-4444', '00000000-0000-4000-a000-000000000004');

-- compatibility via the Phase 3 RPC: S1 verified, S2 documented, S3 inferred conditional, S4 incompatible (all on model f200…01)
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT record_compatibility_result('00000000-0000-4000-8100-000000000001', 'MODEL', '00000000-0000-4000-f200-000000000001', 'INSTALL',  'compatible');
SELECT record_compatibility_result('00000000-0000-4000-8100-000000000002', 'MODEL', '00000000-0000-4000-f200-000000000001', 'DOCUMENT', 'compatible', NULL, '서비스 매뉴얼');
SELECT record_compatibility_result('00000000-0000-4000-8100-000000000003', 'MODEL', '00000000-0000-4000-f200-000000000001', 'INFERENCE', 'conditional',
                                   '브래킷 가공, 문의 010-1111-2222');
SELECT record_compatibility_result('00000000-0000-4000-8100-000000000004', 'MODEL', '00000000-0000-4000-f200-000000000001', 'INSTALL',  'incompatible');
RESET ROLE;

-- ---------- 1. role settings (C2, C7) ----------
SELECT is((SELECT rolcanlogin FROM pg_roles WHERE rolname = 'vector_agent'), false, 'vector_agent is NOLOGIN after the migration');
SELECT is((SELECT rolconnlimit FROM pg_roles WHERE rolname = 'vector_agent'), 3, 'connection limit 3');
SELECT ok((SELECT NOT rolsuper AND NOT rolinherit AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls
             FROM pg_roles WHERE rolname = 'vector_agent'), 'no superuser / inherit / createrole / createdb / replication / bypassrls');
SELECT is((SELECT setconfig FROM pg_db_role_setting WHERE setrole = 'vector_agent'::regrole AND setdatabase = 0)::text[] @>
          ARRAY['search_path=vector_api', 'statement_timeout=5s', 'idle_in_transaction_session_timeout=10s'], true,
          'role defaults: search_path vector_api, statement_timeout 5s, idle_in_transaction 10s');
SELECT is((SELECT count(*)::int FROM pg_auth_members WHERE member = 'vector_agent'::regrole), 0, 'vector_agent is a member of no role');
SELECT ok(pg_has_role('postgres', 'vector_agent', 'MEMBER'), 'postgres can SET ROLE vector_agent (tests)');

-- ---------- 2. write isolation — catalog (C15) ----------
SELECT is((SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND n.nspname NOT LIKE 'pg\_temp%' AND n.nspname NOT LIKE 'pg\_toast%'
              AND (has_table_privilege('vector_agent', c.oid, 'INSERT') OR has_table_privilege('vector_agent', c.oid, 'DELETE')
                   OR has_table_privilege('vector_agent', c.oid, 'TRUNCATE')
                   OR (has_table_privilege('vector_agent', c.oid, 'UPDATE') AND (n.nspname, c.relname) <> ('pg_catalog', 'pg_settings')))),
          0, 'no INSERT / UPDATE / DELETE / TRUNCATE privilege on any relation (pg_settings UPDATE = session SET, Postgres default)');
SELECT is((SELECT count(*)::int FROM pg_sequence s JOIN pg_class c ON c.oid = s.seqrelid JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname NOT LIKE 'pg\_temp%'
              AND (has_sequence_privilege('vector_agent', s.seqrelid, 'USAGE') OR has_sequence_privilege('vector_agent', s.seqrelid, 'UPDATE'))),
          0, 'no USAGE / UPDATE on any sequence');
SELECT is((SELECT count(*)::int FROM pg_namespace WHERE has_schema_privilege('vector_agent', oid, 'CREATE')
              AND nspname NOT LIKE 'pg\_temp%' AND nspname NOT LIKE 'pg\_toast\_temp%'), 0, 'CREATE on no schema (outside this session''s temp schema)');
SELECT ok(NOT has_database_privilege('vector_agent', current_database(), 'CREATE'), 'no CREATE on the database');
SELECT ok(has_database_privilege('vector_agent', current_database(), 'TEMP'), 'TEMP stays (PUBLIC default; documented and accepted, C11)');
SELECT is((SELECT array_agg(n.nspname ORDER BY n.nspname) FROM pg_namespace n
            WHERE has_schema_privilege('vector_agent', n.oid, 'USAGE') AND n.nspname NOT LIKE 'pg\_temp%' AND n.nspname NOT LIKE 'pg\_toast%'),
          ARRAY['information_schema', 'pg_catalog', 'public', 'vector_api']::name[], 'schema USAGE only on catalogs, public, vector_api');
SELECT is((SELECT array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text) FROM pg_proc p
            WHERE p.prosecdef AND has_function_privilege('vector_agent', p.oid, 'EXECUTE')
              AND has_schema_privilege('vector_agent', p.pronamespace, 'USAGE')),
          ARRAY['generate_receipt_no()', 'get_my_role()', 'protect_approved_ticket()',
                'vector_api.device_cases(uuid,uuid,uuid,integer)', 'vector_api.devices_for_part(uuid)',
                'vector_api.find_devices(text,integer)', 'vector_api.find_parts(text,integer)',
                'vector_api.part_stock(uuid)', 'vector_api.parts_for_device(uuid,uuid,uuid)',
                'vector_api.propose_compatibility(uuid,text,uuid,text,text,text,text,text)',
                'vector_api.propose_part_alias(uuid,text,text,text,text)'],
          'callable SECURITY DEFINER functions = the 8 vector_api functions + get_my_role + 2 trigger functions');
SELECT is((SELECT array_agg(p.proname::text ORDER BY p.proname) FROM pg_proc p
            WHERE p.pronamespace = 'vector_api'::regnamespace AND NOT has_function_privilege('vector_agent', p.oid, 'EXECUTE')),
          ARRAY['compat_order', 'compat_row', 'mask_text', 'require_agent'], 'vector_api helpers are not executable by the agent');
SELECT is((SELECT count(*)::int FROM pg_proc p, unnest(ARRAY['anon', 'authenticated', 'service_role', 'public']) r(role)
            WHERE p.pronamespace = 'vector_api'::regnamespace
              AND CASE WHEN r.role = 'public' THEN p.proacl IS NULL OR p.proacl::text LIKE '%{=X%' OR p.proacl::text LIKE '%,=X%'
                       ELSE has_function_privilege(r.role, p.oid, 'EXECUTE') END),
          0, 'no vector_api function is executable by anon / authenticated / service_role / PUBLIC (checked, never called — KI-8)');
SELECT ok(NOT has_schema_privilege('anon', 'vector_api', 'USAGE') AND NOT has_schema_privilege('authenticated', 'vector_api', 'USAGE')
          AND NOT has_schema_privilege('service_role', 'vector_api', 'USAGE'), 'API roles have no USAGE on vector_api');
SELECT ok(has_function_privilege('anon', 'public.ai_candidate_approve(uuid, text, text, text)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.ai_candidate_reject(uuid, text)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.ai_candidates_protect()', 'EXECUTE'),
          'ai_candidate_* / trigger granted to the hint roles (R10, C0)');
SELECT ok(NOT has_function_privilege('vector_agent', 'public.ai_candidate_approve(uuid, text, text, text)', 'EXECUTE')
          AND NOT has_function_privilege('vector_agent', 'public.record_compatibility_result(uuid, text, uuid, text, text, text, text, text)', 'EXECUTE'),
          'the agent cannot execute the review / evidence RPCs');

-- ---------- 3. write isolation — actual attempts (C15, acceptance) ----------
SET LOCAL ROLE vector_agent;
SELECT pg_temp.write_attempts();
RESET ROLE;
SELECT cmp_ok((SELECT count(DISTINCT rel)::int FROM att WHERE relkind <> 'S'), '>', 250, 'every relation in every schema attempted');
SELECT is((SELECT count(*)::int FROM att WHERE relkind IN ('r', 'p') AND state <> '42501'), 0,
          'every table: INSERT / UPDATE / DELETE / TRUNCATE refused with 42501');
SELECT is((SELECT array_agg(DISTINCT rel || ' ' || op) FROM att WHERE state = 'OK'), ARRAY['pg_catalog.pg_settings UPDATE'],
          'the only accepted write is UPDATE pg_settings WHERE false (= session SET; Postgres default)');
SELECT is((SELECT count(*)::int FROM att WHERE relkind IN ('v', 'm', 'f') AND state = 'OK' AND rel <> 'pg_catalog.pg_settings'), 0,
          'views / matviews: every attempt refused');
SELECT cmp_ok((SELECT count(*)::int FROM att WHERE relkind = 'S'), '>=', 2, 'every sequence attempted');
SELECT is((SELECT count(*)::int FROM att WHERE relkind = 'S' AND state <> '42501'), 0, 'every sequence: nextval / setval refused with 42501');
SELECT is((SELECT count(*)::int FROM att WHERE rel = 'public.ai_candidates' AND state = '42501'), 4, 'ai_candidates itself is not writable directly');

-- ---------- 4. no direct reads of business tables ----------
SET LOCAL ROLE vector_agent;
INSERT INTO res SELECT 'read_' || t, to_jsonb(pg_temp.try_state(format('SELECT count(*) FROM public.%I', t)))
  FROM unnest(ARRAY['repair_tickets', 'customers', 'employees', 'inventory_items', 'ai_candidates']) t;
RESET ROLE;
SELECT is((SELECT jsonb_object_agg(k, v) FROM res WHERE k LIKE 'read\_%'),
          '{"read_repair_tickets": "42501", "read_customers": "42501", "read_employees": "42501", "read_inventory_items": "42501", "read_ai_candidates": "42501"}'::jsonb,
          'agent cannot read repair_tickets, customers, employees, inventory_items, ai_candidates (42501)');

-- ---------- 5. caller check: postgres without SET ROLE is refused ----------
SELECT throws_ok($$ SELECT vector_api.find_devices('15Z90T') $$, '42501', 'VECTOR 전용 함수입니다.', 'find_devices refuses a non-agent caller');
SELECT throws_ok($$ SELECT vector_api.find_parts('BQ') $$, '42501', 'VECTOR 전용 함수입니다.', 'find_parts refuses a non-agent caller');
SELECT throws_ok($$ SELECT vector_api.parts_for_device('00000000-0000-4000-f200-000000000001') $$, '42501', 'VECTOR 전용 함수입니다.', 'parts_for_device refuses');
SELECT throws_ok($$ SELECT vector_api.devices_for_part('00000000-0000-4000-8100-000000000001') $$, '42501', 'VECTOR 전용 함수입니다.', 'devices_for_part refuses');
SELECT throws_ok($$ SELECT vector_api.part_stock('00000000-0000-4000-8100-000000000002') $$, '42501', 'VECTOR 전용 함수입니다.', 'part_stock refuses');
SELECT throws_ok($$ SELECT vector_api.device_cases('00000000-0000-4000-f200-000000000001') $$, '42501', 'VECTOR 전용 함수입니다.', 'device_cases refuses');
SELECT throws_ok($$ SELECT vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'MODEL', '00000000-0000-4000-f200-000000000001', 'compatible') $$,
                 '42501', 'VECTOR 전용 함수입니다.', 'propose_compatibility refuses');
SELECT throws_ok($$ SELECT vector_api.propose_part_alias('00000000-0000-4000-8100-000000000006', 'X-1') $$, '42501', 'VECTOR 전용 함수입니다.', 'propose_part_alias refuses');

-- ---------- 6. masking (C5) — mask_text directly (owner) ----------
CREATE TEMP TABLE mask_cases (input text, name text, expected text, label text);
INSERT INTO mask_cases VALUES
  ('연락 010-1234-5678 요망', NULL, '연락 [마스킹] 요망', 'mobile with dashes'),
  ('01012345678', NULL, '[마스킹]', 'mobile without separators'),
  ('010 1234 5678', NULL, '[마스킹]', 'mobile with spaces'),
  ('010.1234.5678', NULL, '[마스킹]', 'mobile with dots'),
  ('사무실 02-123-4567', NULL, '사무실 [마스킹]', 'Seoul landline'),
  ('031-1234-5678', NULL, '[마스킹]', 'regional landline'),
  ('+82 10-1234-5678', NULL, '[마스킹]', '+82 with space'),
  ('+821012345678', NULL, '[마스킹]', '+82 compact'),
  ('hong.gildong@example.com 회신', NULL, '[마스킹] 회신', 'e-mail'),
  ('a_b+c@mail.co.kr', NULL, '[마스킹]', 'e-mail with + and subdomain'),
  ('900101-1234567', NULL, '[마스킹]', 'RRN with dash'),
  ('9001011234567', NULL, '[마스킹]', 'RRN compact'),
  ('900101 2234567', NULL, '[마스킹]', 'RRN with space'),
  ('1234-5678-9012-3456', NULL, '[마스킹]', 'card 4-4-4-4'),
  ('1234 5678 9012 3456', NULL, '[마스킹]', 'card with spaces'),
  ('1234567890123456', NULL, '[마스킹]', 'card compact'),
  ('3782-822463-10005', NULL, '[마스킹]', 'card 4-6-5'),
  ('홍길동 고객님 요청으로 교체', '홍길동', '[고객] 고객님 요청으로 교체', 'customer name'),
  ('고객(홍 길동) 확인', '홍길동', '고객([고객]) 확인', 'customer name with a space'),
  ('담당 HONG gil 확인', 'hong gil', '담당 [고객] 확인', 'latin name, case-insensitive'),
  ('김철수 님 방문', '홍길동', '김철수 님 방문', 'another person''s name stays (documented limitation)'),
  ('김 방문', '김', '김 방문', 'one-character name not replaced'),
  ('a.b(c) 확인', 'a.b(c)', '[고객] 확인', 'regex characters in the name are escaped'),
  ('19.5V, 1.05V, 3.3 Ω, 220uF', NULL, '19.5V, 1.05V, 3.3 Ω, 220uF', 'measurements unchanged'),
  ('2026-10-04 작업', NULL, '2026-10-04 작업', 'date unchanged'),
  ('NM-A311 K4A8G165WC-BCTD SN 5CG1234XYZ', NULL, 'NM-A311 K4A8G165WC-BCTD SN 5CG1234XYZ', 'board / part / serial unchanged'),
  ('', NULL, '', 'empty string'),
  ('홍길동 010-1111-2222 a@b.kr 900101-1234567 정상', '홍길동', '[고객] [마스킹] [마스킹] [마스킹] 정상', 'several items in one text');
SELECT is(vector_api.mask_text(m.input, m.name), m.expected, 'mask: ' || m.label) FROM mask_cases m;
SELECT is(vector_api.mask_text(NULL, '홍길동'), NULL, 'mask: NULL stays NULL');

-- ---------- 7. read functions (as the agent) ----------
SET LOCAL ROLE vector_agent;
INSERT INTO res SELECT 'fd', vector_api.find_devices('15Z90T');
INSERT INTO res SELECT 'fd_board', vector_api.find_devices('LA-K091');
INSERT INTO res SELECT 'fd_cap', vector_api.find_devices('노트북', 1000);
INSERT INTO res SELECT 'fd_empty', vector_api.find_devices('   ');
INSERT INTO res SELECT 'fp', vector_api.find_parts('BQ24780S');
INSERT INTO res SELECT 'fp_cap', vector_api.find_parts('a', 1000);
INSERT INTO res SELECT 'pd', vector_api.parts_for_device('00000000-0000-4000-f200-000000000001');
INSERT INTO res SELECT 'pd_none', vector_api.parts_for_device();
INSERT INTO res SELECT 'pd_badvar', vector_api.parts_for_device('00000000-0000-4000-f200-000000000001', '00000000-0000-4000-f300-000000000001');
INSERT INTO res SELECT 'dp', vector_api.devices_for_part('00000000-0000-4000-8100-000000000004');
INSERT INTO res SELECT 'dp_s1', vector_api.devices_for_part('00000000-0000-4000-8100-000000000001');
INSERT INTO res SELECT 'dp_none', vector_api.devices_for_part('00000000-0000-4000-8100-0000000000ff');
INSERT INTO res SELECT 'st', vector_api.part_stock('00000000-0000-4000-8100-000000000002');
INSERT INTO res SELECT 'st_none', vector_api.part_stock('00000000-0000-4000-8100-0000000000ff');
INSERT INTO res SELECT 'dc', vector_api.device_cases('00000000-0000-4000-f200-000000000001');
INSERT INTO res SELECT 'dc_1', vector_api.device_cases('00000000-0000-4000-f200-000000000001', NULL, NULL, 0);
INSERT INTO res SELECT 'dc_none', vector_api.device_cases();
RESET ROLE;

SELECT ok((SELECT v->'models' @> '[{"model_id": "00000000-0000-4000-f200-000000000001"}]' FROM res WHERE k = 'fd'), 'find_devices: alias finds the model');
SELECT ok((SELECT v->'boards' @> '[{"board_id": "00000000-0000-4000-f400-000000000001"}]' FROM res WHERE k = 'fd_board'), 'find_devices: partial board number');
SELECT cmp_ok((SELECT jsonb_array_length(v->'models') FROM res WHERE k = 'fd_cap'), '<=', 30, 'find_devices: limit capped at 30');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'fd_empty'), '검색어를 입력해 주세요.', 'find_devices: empty query → error JSON');
SELECT ok((SELECT v->'parts' @> '[{"part_spec_id": "00000000-0000-4000-8100-000000000005", "aliases": [{"alias": "BQ24780S", "alias_type": "MARKING"}]}]'
             FROM res WHERE k = 'fp'), 'find_parts: marking finds the chip, aliases listed');
SELECT cmp_ok((SELECT jsonb_array_length(v->'parts') FROM res WHERE k = 'fp_cap'), '<=', 30, 'find_parts: limit capped at 30');

-- C13: verified → documented → inferred, incompatible separate, counts present
SELECT is((SELECT jsonb_agg(x->>'part_name') FROM res, jsonb_array_elements(v->'compatible') x WHERE k = 'pd'),
          '["LP156WF9-SPK2", "L19M3PF7", "KB-15Z90T"]'::jsonb, 'parts_for_device: compatible ordered verified → documented → inferred');
SELECT is((SELECT jsonb_agg(x->>'confidence') FROM res, jsonb_array_elements(v->'compatible') x WHERE k = 'pd'),
          '["verified", "documented", "inferred"]'::jsonb, 'parts_for_device: confidences');
SELECT is((SELECT jsonb_agg(x->>'part_name') FROM res, jsonb_array_elements(v->'incompatible') x WHERE k = 'pd'),
          '["NV156FHM-N61"]'::jsonb, 'parts_for_device: incompatible in its own list only');
SELECT is((SELECT count(*)::int FROM res, jsonb_array_elements(v->'compatible') x WHERE k = 'pd' AND x->>'status' = 'incompatible'), 0,
          'parts_for_device: no incompatible row in compatible');
SELECT is((SELECT v->'compatible'->0->'evidence' FROM res WHERE k = 'pd'),
          '{"install_ok": 1, "install_conditional": 0, "install_incompatible": 0, "document_count": 0}'::jsonb,
          'parts_for_device: evidence counts (success / conditional / fail / documents)');
SELECT is((SELECT v->'incompatible'->0->'evidence'->>'install_incompatible' FROM res WHERE k = 'pd'), '1', 'incompatible row counts the failure');
SELECT is((SELECT v->'compatible'->1->>'stock_qty' FROM res WHERE k = 'pd'), '3', 'stock_qty excludes 외주 (2 NEW + 1 USED)');
SELECT is((SELECT v->'compatible'->2->>'limitation_note' FROM res WHERE k = 'pd'), '브래킷 가공, 문의 [마스킹]', 'limitation_note is masked');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'pd_none'), '검색할 모델 또는 보드를 선택해 주세요.', 'parts_for_device: no target → error JSON');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'pd_badvar'), '선택한 변형이 모델에 속하지 않습니다.', 'parts_for_device: wrong variant → error JSON');
SELECT is((SELECT jsonb_array_length(v->'compatible') FROM res WHERE k = 'dp'), 0, 'devices_for_part: incompatible part has no compatible rows');
SELECT is((SELECT v->'incompatible'->0->>'target_id' FROM res WHERE k = 'dp'), '00000000-0000-4000-f200-000000000001', 'devices_for_part: incompatible separate');
SELECT is((SELECT v->'compatible'->0->>'confidence' FROM res WHERE k = 'dp_s1'), 'verified', 'devices_for_part: verified row');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'dp_none'), '부품 규격을 찾을 수 없습니다.', 'devices_for_part: unknown spec → error JSON');

-- C6: stock = quantity by condition + donor numbers only
SELECT is((SELECT v->'stock' FROM res WHERE k = 'st'), '{"NEW": 2, "USED": 1}'::jsonb, 'part_stock: quantity by condition, 외주 excluded');
SELECT is((SELECT v->'donor_numbers' FROM res WHERE k = 'st'),
          (SELECT jsonb_build_array(donor_no) FROM donor_devices WHERE id = '00000000-0000-4000-8400-000000000001'),
          'part_stock: donor numbers of available donors only');
SELECT is((SELECT array_agg(key ORDER BY key) FROM res, jsonb_object_keys(res.v) key WHERE res.k = 'st'),
          ARRAY['donor_numbers', 'name', 'part_spec_id', 'part_type', 'stock'], 'part_stock: no other keys');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'st_none'), '부품 규격을 찾을 수 없습니다.', 'part_stock: unknown spec → error JSON');

-- device_cases
SELECT is((SELECT (v->'cases'->>'total')::int FROM res WHERE k = 'dc'), 2, 'device_cases: test and other-model tickets excluded');
SELECT is((SELECT jsonb_agg(x->>'receipt_no') FROM res, jsonb_array_elements(v->'cases'->'recent') x WHERE k = 'dc'),
          (SELECT jsonb_agg(receipt_no ORDER BY received_at DESC) FROM repair_tickets
            WHERE id IN ('00000000-0000-4000-8500-000000000001', '00000000-0000-4000-8500-000000000002')),
          'device_cases: receipt numbers, newest first (canceled included)');
SELECT is((SELECT jsonb_array_length(v->'cases'->'recent') FROM res WHERE k = 'dc_1'), 1, 'device_cases: limit at least 1');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'dc_none'), '검색할 모델 또는 보드를 선택해 주세요.', 'device_cases: no target → error JSON');
SELECT is((SELECT v->'cases'->'recent'->1->>'diagnosis_summary' FROM res WHERE k = 'dc'),
          '[고객] 요청. 연락처 [마스킹], 메일 [마스킹], 보드 NM-A311 쇼트', 'diagnosis_summary masked (name, phone, e-mail)');
SELECT is((SELECT v->'cases'->'recent'->0->>'diagnosis_summary' FROM res WHERE k = 'dc'),
          '테스트고객1 언급 없음, [고객] 본인 방문', 'only the case''s own customer name is replaced');
SELECT is((SELECT v->'cases'->'recent'->1->'faults'->0 FROM res WHERE k = 'dc'),
          '{"component": "PU8 ([고객] 확인)", "fault_type": "SHORT", "description": "주민번호 [마스킹] 적힌 메모"}'::jsonb, 'faults masked');
SELECT is((SELECT v->'cases'->'recent'->1->'measurements'->0 FROM res WHERE k = 'dc'),
          '{"label": "PPVBAT", "kind": "VOLTAGE", "value": 19.5, "unit": "V", "value_text": "19.5V", "judgement": "NORMAL", "note": "카드 [마스킹] 결제 메모"}'::jsonb,
          'measurements: note masked, values unchanged');
SELECT is((SELECT v->'cases'->'recent'->1->'actions'->0->>'description' FROM res WHERE k = 'dc'), 'PU8 교체 후 [마스킹] 고객 통화', 'actions masked');
SELECT is((SELECT v->'model_notes'->0 FROM res WHERE k = 'dc'),
          '{"note_type": "CAUTION", "body": "하판 나사 주의. 문의 [마스킹]", "is_pinned": false, "target_label": "그램 15 15Z90T"}'::jsonb,
          'model note: type + masked body, no author');
SELECT is((SELECT jsonb_array_length(v->'cases'->'recent'->1->'parts') FROM res WHERE k = 'dc'), 1, 'parts used: 외주 excluded');
SELECT is((SELECT v->'cases'->'recent'->1->'symptoms' FROM res WHERE k = 'dc'), '["전원"]'::jsonb, 'symptom code names only');

-- C6: nothing private in any result (keys or values)
SELECT is((SELECT count(*)::int FROM res WHERE k NOT LIKE 'seq%' AND (
            v::text ~* '"(final_price|base_estimate|refunded_amount|material_cost|override_unit_price|price|customer|customer_id|phone|address|employee|author|created_by|updated_by|reviewed_by|label_code|storage_location|storage_note|location|symptoms_text|notes|tag_info|device_model|evaluated_value)"\s*:'
            OR v::text ~ '(234567|53210|43210|테스트고객1 요청|010-0000-100|테스트시|테스트관리자|테스트팀장|테스트접수|테스트기사|테스트정밀|테스트CS|VX-01|비밀 선반|비밀 보관함|"P-[0-9]{5}|PII모델문자열|PII태그문자열|PII증상문자열|SECRET-RECORD-NOTES|SECRET-SYMPTOM-NOTE|010-9999-8888|010-3333-4444|010-1111-2222|900101|1234-5678-9012|kim\.cs@)')),
          0, 'no price, customer, employee, label, location or excluded free-text key or value in any result');

-- ---------- 8. propose functions (as the agent; C4, C7) ----------
INSERT INTO res SELECT 'counts_before', pg_temp.table_counts();
SET LOCAL ROLE vector_agent;
INSERT INTO res SELECT 'p_ok', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'MODEL', '00000000-0000-4000-f200-000000000001',
                                                               'compatible', NULL, 'https://example.com/battery.pdf', '데이터시트 일치', 'n8n-exec-1');
RESET ROLE;
INSERT INTO res SELECT 'counts_after', pg_temp.table_counts();
SELECT is((SELECT v->>'duplicate' FROM res WHERE k = 'p_ok'), 'false', 'propose_compatibility: new candidate');
SELECT is((SELECT jsonb_object_agg(a.key, (a.value::bigint - (b.v->>a.key)::bigint))
             FROM res c, jsonb_each(c.v) a, res b
            WHERE c.k = 'counts_after' AND b.k = 'counts_before' AND a.value::bigint <> (b.v->>a.key)::bigint),
          '{"ai_candidates": 1}'::jsonb, 'propose touches exactly one row in exactly one table (ai_candidates)');
SELECT is((SELECT row(status, candidate_type, target_type, model_id, observed_status, reference, rationale, source_ref, reviewed_at)::text
             FROM ai_candidates WHERE id = (SELECT (v->>'candidate_id')::uuid FROM res WHERE k = 'p_ok')),
          row('PENDING', 'COMPATIBILITY', 'MODEL', '00000000-0000-4000-f200-000000000001'::uuid, 'compatible',
              'https://example.com/battery.pdf', '데이터시트 일치', 'n8n-exec-1', NULL::timestamptz)::text, 'stored as PENDING with the proposal');

SET LOCAL ROLE vector_agent;
INSERT INTO res SELECT 'p_dup', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'MODEL', '00000000-0000-4000-f200-000000000001', 'compatible');
INSERT INTO res SELECT 'p_other_status', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'MODEL', '00000000-0000-4000-f200-000000000001', 'incompatible');
INSERT INTO res SELECT 'p_e1', vector_api.propose_compatibility('00000000-0000-4000-8100-0000000000ff', 'MODEL', '00000000-0000-4000-f200-000000000001', 'compatible');
INSERT INTO res SELECT 'p_e2', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'CHIP', '00000000-0000-4000-f200-000000000001', 'compatible');
INSERT INTO res SELECT 'p_e3', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000005', 'MODEL', '00000000-0000-4000-f200-000000000001', 'compatible');
INSERT INTO res SELECT 'p_e4', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'MODEL', '00000000-0000-4000-f200-0000000000ff', 'compatible');
INSERT INTO res SELECT 'p_e5', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'MODEL', '00000000-0000-4000-f200-000000000001', 'maybe');
INSERT INTO res SELECT 'p_e6', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'MODEL', '00000000-0000-4000-f200-000000000001', 'conditional');
INSERT INTO res SELECT 'p_e7', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'MODEL', '00000000-0000-4000-f200-000000000001', 'conditional', repeat('가', 301));
INSERT INTO res SELECT 'p_e8', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'MODEL', '00000000-0000-4000-f200-000000000002', 'compatible', NULL, repeat('a', 501));
INSERT INTO res SELECT 'p_e9', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'MODEL', '00000000-0000-4000-f200-000000000002', 'compatible', NULL, NULL, repeat('a', 2001));
INSERT INTO res SELECT 'p_e10', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'MODEL', '00000000-0000-4000-f200-000000000002', 'compatible', NULL, NULL, NULL, repeat('a', 201));
INSERT INTO res SELECT 'a_ok', vector_api.propose_part_alias('00000000-0000-4000-8100-000000000001', 'LP156WF9-SPL1', 'PART_NUMBER', '라벨 사진', 'n8n-exec-2');
INSERT INTO res SELECT 'a_dup', vector_api.propose_part_alias('00000000-0000-4000-8100-000000000001', 'lp156wf9 spl1');
INSERT INTO res SELECT 'a_e1', vector_api.propose_part_alias('00000000-0000-4000-8100-000000000005', 'bq24780s', 'MARKING');
INSERT INTO res SELECT 'a_e2', vector_api.propose_part_alias('00000000-0000-4000-8100-000000000001', '   ');
INSERT INTO res SELECT 'a_e3', vector_api.propose_part_alias('00000000-0000-4000-8100-000000000001', 'X-9', 'SERIAL');
INSERT INTO res SELECT 'a_e4', vector_api.propose_part_alias('00000000-0000-4000-8100-000000000001', repeat('a', 151));
RESET ROLE;
SELECT is((SELECT v FROM res WHERE k = 'p_dup'), jsonb_build_object('candidate_id', (SELECT v->'candidate_id' FROM res WHERE k = 'p_ok'),
          'status', 'PENDING', 'duplicate', true), 'identical PENDING proposal returns the same id (dedup)');
SELECT is((SELECT v->>'duplicate' FROM res WHERE k = 'p_other_status'), 'false', 'a different observed status is a new candidate');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'p_e1'), '부품 규격을 찾을 수 없습니다.', 'unknown spec');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'p_e2'), '호환 대상(모델/변형/보드)을 선택해 주세요.', 'bad target type');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'p_e3'), '이 부품 규격의 호환 기준은 메인보드입니다.', 'target type mismatch with compat_target');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'p_e4'), '표준 모델을 찾을 수 없습니다.', 'unknown model');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'p_e5'), '호환 여부(호환/조건부/비호환)를 선택해 주세요.', 'bad status');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'p_e6'), '조건부는 제한사항을 입력해 주세요.', 'conditional needs a note');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'p_e7'), '제한사항은 300자 이내로 입력해 주세요.', 'note length');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'p_e8'), '출처는 500자 이내로 입력해 주세요.', 'reference length');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'p_e9'), '설명은 2000자 이내로 입력해 주세요.', 'rationale length');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'p_e10'), '실행 ID는 200자 이내로 입력해 주세요.', 'source_ref length');
SELECT is((SELECT v->>'duplicate' FROM res WHERE k = 'a_ok'), 'false', 'propose_part_alias: new candidate');
SELECT is((SELECT v->>'candidate_id' FROM res WHERE k = 'a_dup'), (SELECT v->>'candidate_id' FROM res WHERE k = 'a_ok'), 'alias dedup by normalised form');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'a_e1'), '이미 등록된 별칭입니다.', 'alias already registered for the spec');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'a_e2'), '별칭을 입력해 주세요.', 'empty alias');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'a_e3'), '별칭 종류(품번/마킹/기타)를 선택해 주세요.', 'bad alias type');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'a_e4'), '별칭은 150자 이내로 입력해 주세요.', 'alias length');
SELECT is((SELECT count(*)::int FROM ai_candidates WHERE status = 'PENDING'), 3, 'only valid proposals were stored');

-- 500 PENDING cap (C7): fill up as owner, then propose
INSERT INTO ai_candidates (candidate_type, part_spec_id, alias, alias_type)
SELECT 'PART_ALIAS', '00000000-0000-4000-8100-000000000007', 'CAP-' || g, 'OTHER' FROM generate_series(1, 497) g;
SET LOCAL ROLE vector_agent;
INSERT INTO res SELECT 'p_cap', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000007', 'MODEL', '00000000-0000-4000-f200-000000000001', 'compatible');
INSERT INTO res SELECT 'p_cap_dup', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'MODEL', '00000000-0000-4000-f200-000000000001', 'compatible');
INSERT INTO res SELECT 'a_cap', vector_api.propose_part_alias('00000000-0000-4000-8100-000000000007', 'CAP-NEW');
RESET ROLE;
SELECT is((SELECT v->>'error' FROM res WHERE k = 'p_cap'),
          '검토 대기 중인 AI 후보가 500건이라 더 제안할 수 없습니다. 관리자 검토 후 다시 제안해 주세요.', 'cap: 500 PENDING → refused');
SELECT is((SELECT v->>'error' FROM res WHERE k = 'a_cap'),
          '검토 대기 중인 AI 후보가 500건이라 더 제안할 수 없습니다. 관리자 검토 후 다시 제안해 주세요.', 'cap applies to aliases too');
SELECT is((SELECT v->>'duplicate' FROM res WHERE k = 'p_cap_dup'), 'true', 'cap: a duplicate still returns the existing candidate');
SELECT is((SELECT count(*)::int FROM ai_candidates WHERE status = 'PENDING'), 500, 'never more than 500 PENDING');
DELETE FROM ai_candidates WHERE alias LIKE 'CAP-%';

-- ---------- 9. review RPCs (C8) ----------
-- extra candidates (as the agent): C2 variant conditional without reference, C4 to reject, C6 for the atomicity test
SET LOCAL ROLE vector_agent;
INSERT INTO res SELECT 'c2', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000006', 'VARIANT', '00000000-0000-4000-f300-000000000001',
                                                             'conditional', '커넥터 방향 다름');
INSERT INTO res SELECT 'c4', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000003', 'MODEL', '00000000-0000-4000-f200-000000000002', 'compatible');
INSERT INTO res SELECT 'c6', vector_api.propose_compatibility('00000000-0000-4000-8100-000000000007', 'MODEL', '00000000-0000-4000-f200-000000000001', 'compatible',
                                                             NULL, '매뉴얼 p.12');
RESET ROLE;
CREATE TEMP TABLE ids AS
  SELECT (SELECT (v->>'candidate_id')::uuid FROM res WHERE k = 'p_ok') AS c1, (SELECT (v->>'candidate_id')::uuid FROM res WHERE k = 'c2') AS c2,
         (SELECT (v->>'candidate_id')::uuid FROM res WHERE k = 'a_ok') AS c3, (SELECT (v->>'candidate_id')::uuid FROM res WHERE k = 'c4') AS c4,
         (SELECT (v->>'candidate_id')::uuid FROM res WHERE k = 'c6') AS c6;
GRANT SELECT ON ids TO anon, authenticated, service_role;
INSERT INTO res SELECT 'verified_before', to_jsonb(count(*)) FROM part_compatibility WHERE confidence = 'verified';
INSERT INTO res SELECT 'evidence_before', to_jsonb(count(*)) FROM compatibility_evidence;

-- refusals
SET LOCAL ROLE anon;
SELECT throws_ok(format('SELECT ai_candidate_approve(%L, %L)', (SELECT c1 FROM ids), 'DOCUMENT'), '42501',
                 '로그인이 필요합니다. 다시 로그인해 주세요.', 'anon refused by the guard (R10)');
SELECT throws_ok(format('SELECT ai_candidate_reject(%L, %L)', (SELECT c1 FROM ids), 'x'), '42501',
                 '로그인이 필요합니다. 다시 로그인해 주세요.', 'anon reject refused by the guard');
RESET ROLE;
-- a service_role REST call carries no employee (no sub claim)
SELECT set_config('request.jwt.claims', '{"role": "service_role"}', true);
SET LOCAL ROLE service_role;
SELECT throws_ok(format('SELECT ai_candidate_approve(%L, %L)', (SELECT c1 FROM ids), 'DOCUMENT'), 'P0001',
                 '관리자만 AI 후보를 검토할 수 있습니다.', 'service_role refused (no employee)');
RESET ROLE;
DO $$
DECLARE n int;
BEGIN
  FOR n IN 2..6 LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-4000-a000-00000000000' || n, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM ai_candidate_approve((SELECT c1 FROM ids), 'DOCUMENT');
      INSERT INTO res VALUES ('role_' || n, '"accepted"');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO res VALUES ('role_' || n, to_jsonb(SQLERRM));
    END;
    BEGIN
      PERFORM ai_candidate_reject((SELECT c1 FROM ids), 'x');
      INSERT INTO res VALUES ('rrole_' || n, '"accepted"');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO res VALUES ('rrole_' || n, to_jsonb(SQLERRM));
    END;
    RESET ROLE;
  END LOOP;
END $$;
SELECT is((SELECT count(*)::int FROM res WHERE k ~ '^r?role_' AND v #>> '{}' = '관리자만 AI 후보를 검토할 수 있습니다.'), 10,
          'MANAGER / RECEPTION / TECHNICIAN / EXPERT_REPAIR / CS cannot approve or reject');

SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT ai_candidate_approve(%L, %L)', (SELECT c1 FROM ids), 'INSTALL'), 'P0001',
                 '승인 방식(문서 근거 / 추정)을 선택해 주세요.', 'INSTALL (→ verified) cannot be chosen');
SELECT throws_ok(format('SELECT ai_candidate_approve(%L, %L)', (SELECT c1 FROM ids), 'OVERRIDE'), 'P0001',
                 '승인 방식(문서 근거 / 추정)을 선택해 주세요.', 'OVERRIDE cannot be chosen');
SELECT throws_ok(format('SELECT ai_candidate_approve(%L)', (SELECT c1 FROM ids)), 'P0001',
                 '승인 방식(문서 근거 / 추정)을 선택해 주세요.', 'approval mode required');
SELECT throws_ok(format('SELECT ai_candidate_approve(%L, %L)', (SELECT c2 FROM ids), 'DOCUMENT'), 'P0001',
                 '문서 근거로 승인하려면 출처를 입력해 주세요.', 'DOCUMENT without any reference refused');
SELECT throws_ok(format('SELECT ai_candidate_approve(%L, %L)', (SELECT c3 FROM ids), 'DOCUMENT'), 'P0001',
                 '부품 별칭 후보는 승인 방식을 선택하지 않습니다.', 'alias candidate takes no approval mode');
SELECT throws_ok($$ SELECT ai_candidate_approve('00000000-0000-4000-8100-0000000000ff') $$, 'P0001', 'AI 후보를 찾을 수 없습니다.', 'unknown candidate');
SELECT throws_ok(format('SELECT ai_candidate_reject(%L, %L)', (SELECT c4 FROM ids), '  '), 'P0001', '반려 사유를 입력해 주세요.', 'reject needs a reason');
SELECT throws_ok(format('SELECT ai_candidate_reject(%L, %L)', (SELECT c4 FROM ids), repeat('가', 501)), 'P0001',
                 '반려 사유는 500자 이내로 입력해 주세요.', 'reject reason length');
INSERT INTO res SELECT 'ap1', ai_candidate_approve((SELECT c1 FROM ids), 'DOCUMENT', NULL, '데이터시트 확인');
INSERT INTO res SELECT 'ap2', ai_candidate_approve((SELECT c2 FROM ids), 'INFERENCE');
INSERT INTO res SELECT 'ap3', ai_candidate_approve((SELECT c3 FROM ids));
INSERT INTO res SELECT 'rj4', ai_candidate_reject((SELECT c4 FROM ids), '근거 문서가 다른 모델');
SELECT throws_ok(format('SELECT ai_candidate_approve(%L, %L)', (SELECT c1 FROM ids), 'INFERENCE'), 'P0001', '이미 처리된 후보입니다.', 'double approval refused');
SELECT throws_ok(format('SELECT ai_candidate_reject(%L, %L)', (SELECT c4 FROM ids), 'x'), 'P0001', '이미 처리된 후보입니다.', 'double rejection refused');
SELECT is((SELECT count(*)::int FROM ai_candidates), 6, 'ADMIN reads all candidates (RLS)');
SELECT throws_ok($$ INSERT INTO ai_candidates (candidate_type, part_spec_id, alias, alias_type) VALUES ('PART_ALIAS', '00000000-0000-4000-8100-000000000001', 'x', 'OTHER') $$,
                 '42501', NULL, 'ADMIN cannot insert directly');
SELECT throws_ok($$ UPDATE ai_candidates SET status = 'REJECTED' $$, '42501', NULL, 'ADMIN cannot update directly');
SELECT throws_ok($$ DELETE FROM ai_candidates $$, '42501', NULL, 'ADMIN cannot delete directly');
RESET ROLE;

SELECT is((SELECT row(e.kind, e.observed_status, e.reference, e.note, e.created_by)::text FROM compatibility_evidence e
            WHERE e.id = (SELECT (v->>'evidence_id')::uuid FROM res WHERE k = 'ap1')),
          row('DOCUMENT', 'compatible', 'https://example.com/battery.pdf', 'AI 후보(VECTOR) 승인 — 데이터시트 확인',
              '00000000-0000-4000-a000-000000000001'::uuid)::text, 'DOCUMENT approval: evidence via record_compatibility_result, by the admin, provenance note');
SELECT is((SELECT v->>'confidence' FROM res WHERE k = 'ap1'), 'documented', 'DOCUMENT approval → documented');
SELECT is((SELECT row(e.kind, e.observed_status, e.limitation_note)::text FROM compatibility_evidence e
            WHERE e.id = (SELECT (v->>'evidence_id')::uuid FROM res WHERE k = 'ap2')),
          row('INFERENCE', 'conditional', '커넥터 방향 다름')::text, 'INFERENCE approval: evidence with the limitation');
SELECT is((SELECT v->>'confidence' FROM res WHERE k = 'ap2'), 'inferred', 'INFERENCE approval → inferred');
SELECT is((SELECT row(c.status, c.approved_as, c.reviewed_by, c.reviewed_at IS NOT NULL, c.review_note)::text FROM ai_candidates c WHERE c.id = (SELECT c1 FROM ids)),
          row('APPROVED', 'DOCUMENT', '00000000-0000-4000-a000-000000000001'::uuid, true, '데이터시트 확인')::text, 'approved: reviewer and time recorded');
SELECT is((SELECT row(a.part_spec_id, a.alias, a.alias_type, a.created_by)::text FROM part_number_aliases a
            WHERE a.id = (SELECT result_alias_id FROM ai_candidates WHERE id = (SELECT c3 FROM ids))),
          row('00000000-0000-4000-8100-000000000001'::uuid, 'LP156WF9-SPL1', 'PART_NUMBER', '00000000-0000-4000-a000-000000000001'::uuid)::text,
          'alias approval: alias registered by the admin');
SELECT is((SELECT row(c.status, c.review_note, c.reviewed_by, c.reviewed_at IS NOT NULL, c.result_evidence_id)::text FROM ai_candidates c WHERE c.id = (SELECT c4 FROM ids)),
          row('REJECTED', '근거 문서가 다른 모델', '00000000-0000-4000-a000-000000000001'::uuid, true, NULL::uuid)::text, 'rejected: reason, reviewer, time; no knowledge');

-- never verified (P4)
SELECT is((SELECT count(*)::int FROM part_compatibility WHERE confidence = 'verified'), (SELECT (v #>> '{}')::int FROM res WHERE k = 'verified_before'),
          'no verified row was created by any candidate path');
SELECT is((SELECT count(*)::int FROM compatibility_evidence WHERE note LIKE 'AI 후보(VECTOR) 승인%' AND kind NOT IN ('DOCUMENT', 'INFERENCE')), 0,
          'candidate evidence is DOCUMENT or INFERENCE only');
SELECT is((SELECT count(*)::int FROM compatibility_evidence) - (SELECT (v #>> '{}')::int FROM res WHERE k = 'evidence_before'), 2,
          'exactly the two compatibility approvals created evidence');

-- immutable content (as owner, bypassing RLS)
SELECT throws_ok(format('UPDATE ai_candidates SET reference = %L WHERE id = %L', 'x', (SELECT c6 FROM ids)), 'P0001',
                 'AI 후보 내용은 수정할 수 없습니다.', 'proposal content cannot be edited');
SELECT throws_ok(format('UPDATE ai_candidates SET observed_status = %L, status = %L, reviewed_at = now(), review_note = %L WHERE id = %L',
                        'incompatible', 'REJECTED', 'x', (SELECT c6 FROM ids)), 'P0001', 'AI 후보 내용은 수정할 수 없습니다.', 'content cannot change with the review');
SELECT throws_ok(format('UPDATE ai_candidates SET review_note = %L WHERE id = %L', 'x', (SELECT c1 FROM ids)), 'P0001',
                 '이미 처리된 후보입니다.', 'reviewed candidate cannot be changed');
SELECT throws_ok(format('UPDATE ai_candidates SET review_note = %L WHERE id = %L', 'x', (SELECT c6 FROM ids)), 'P0001',
                 'AI 후보 상태는 승인 또는 반려로만 바꿀 수 있습니다.', 'review columns change only with approve / reject');

-- atomicity: record_compatibility_result fails (spec's compat target changed meanwhile) → candidate stays PENDING, no evidence
UPDATE part_specs SET compat_target = 'BOARD' WHERE id = '00000000-0000-4000-8100-000000000007';
INSERT INTO res SELECT 'evidence_mid', to_jsonb(count(*)) FROM compatibility_evidence;
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT ai_candidate_approve(%L, %L)', (SELECT c6 FROM ids), 'DOCUMENT'), 'P0001',
                 '이 부품 규격의 호환 기준은 메인보드입니다.', 'failure inside record_compatibility_result surfaces');
RESET ROLE;
SELECT is((SELECT row(status, reviewed_at, result_evidence_id)::text FROM ai_candidates WHERE id = (SELECT c6 FROM ids)),
          row('PENDING', NULL::timestamptz, NULL::uuid)::text, 'candidate unchanged after the failed approval');
SELECT is((SELECT count(*)::int FROM compatibility_evidence), (SELECT (v #>> '{}')::int FROM res WHERE k = 'evidence_mid'), 'no evidence left behind');

-- ---------- 10. RLS: only ADMIN reads ----------
DO $$
DECLARE n int; c int;
BEGIN
  FOR n IN 2..6 LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-4000-a000-00000000000' || n, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO c FROM ai_candidates;
    RESET ROLE;
    INSERT INTO res VALUES ('rls_' || n, to_jsonb(c));
  END LOOP;
END $$;
SELECT is((SELECT sum((v #>> '{}')::int)::int FROM res WHERE k LIKE 'rls\_%'), 0, 'the other 5 roles see no candidates');
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT count(*) FROM ai_candidates $$, '42501', NULL, 'anon has no table access');
RESET ROLE;

-- restore sequence values consumed by the fixtures
SELECT setval('inventory_label_seq', (SELECT (v #>> '{}')::bigint FROM res WHERE k = 'seq_label'));
SELECT setval('donor_no_seq', (SELECT (v #>> '{}')::bigint FROM res WHERE k = 'seq_donor'));

SELECT * FROM finish();
ROLLBACK;
