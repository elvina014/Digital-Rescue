-- =============================================================
-- Phase 9 — AI-assisted registration (ai_photo_requests, ai_photo_propose, ai-photos bucket, Phase 8 changes E1–E10)
-- Run: npx supabase test db   (local only; everything is rolled back)
-- Seed users: a…01 ADMIN, 02 MANAGER, 03 RECEPTION, 04 TECHNICIAN, 05 EXPERT_REPAIR, 06 CS
-- Seed catalog: models f200…01 LG 그램 15 15Z90T (alias 15Z90T), f200…02 삼성 NT950QED (alias NT950QED, variant f300…01),
--               boards f400…01 LA-K091P (alias NM-D451), f400…02 BA92-21345A
-- KI-8: hint roles only call public functions they hold EXECUTE on (R10); vector_agent privilege errors are safe.
-- =============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT * FROM no_plan();

CREATE TEMP TABLE res (k text PRIMARY KEY, v jsonb);
GRANT ALL ON res TO authenticated, anon, service_role, vector_agent;

CREATE FUNCTION pg_temp.jwt(p_n text) RETURNS text LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a000-00000000000' || p_n, 'role', 'authenticated')::text, true);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.jwt(text) TO authenticated, anon, service_role, vector_agent;

-- one reading
CREATE FUNCTION pg_temp.rd(p_text text, p_type text DEFAULT 'PART_NUMBER', p_conf numeric DEFAULT 0.9, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('text', p_text, 'type', p_type, 'confidence', p_conf, 'note', p_note);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.rd(text, text, numeric, text) TO authenticated, anon, service_role;

CREATE FUNCTION pg_temp.try_state(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.try_state(text) TO vector_agent;

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

-- fixtures (as owner): part spec with one alias; a throw-away model for the cascade test
INSERT INTO part_specs (id, part_type, name, compat_target)
VALUES ('00000000-0000-4000-9900-000000000001', 'IC', 'BQ24780S', 'BOARD'),
       ('00000000-0000-4000-9900-000000000002', 'PANEL', 'LP156WF9-SPL1', 'MODEL');
INSERT INTO part_number_aliases (part_spec_id, alias, alias_type)
VALUES ('00000000-0000-4000-9900-000000000001', 'BQ24780SRUYR', 'PART_NUMBER');
INSERT INTO catalog_models (id, brand_id, name)
SELECT '00000000-0000-4000-9900-000000000003', brand_id, 'P9 임시 모델' FROM catalog_models WHERE id = '00000000-0000-4000-f200-000000000001';

-- =========================================================== 1. schema
SELECT has_table('public', 'ai_photo_requests', 'table ai_photo_requests exists');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_photo_requests'::regclass), 'RLS enabled');
SELECT is((SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies WHERE tablename = 'ai_photo_requests'),
          ARRAY['ai_photo_requests_select'], 'only a SELECT policy');
SELECT is((SELECT qual FROM pg_policies WHERE policyname = 'ai_photo_requests_select'),
          '(get_my_role() = ''ADMIN''::employee_role)', 'SELECT is ADMIN only');
SELECT ok(NOT has_table_privilege('authenticated', 'public.ai_photo_requests', 'INSERT')
          AND NOT has_table_privilege('authenticated', 'public.ai_photo_requests', 'UPDATE')
          AND NOT has_table_privilege('authenticated', 'public.ai_photo_requests', 'DELETE'), 'authenticated has no write privilege');
SELECT ok(NOT has_table_privilege('anon', 'public.ai_photo_requests', 'SELECT'), 'anon has no privilege');
SELECT is((SELECT row(public, file_size_limit, allowed_mime_types)::text FROM storage.buckets WHERE id = 'ai-photos'),
          '(f,10485760,{image/webp})', 'bucket ai-photos: private, 10 MB, webp only');
SELECT is((SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
            WHERE schemaname = 'storage' AND policyname LIKE 'ai\_photos\_%'),
          ARRAY['ai_photos_storage_delete', 'ai_photos_storage_insert', 'ai_photos_storage_select'], 'three storage policies');
SELECT col_is_null('public', 'ai_candidates', 'part_spec_id', 'E3: ai_candidates.part_spec_id is nullable');
SELECT has_column('public', 'ai_candidates', 'photo_request_id', 'E1');
SELECT has_column('public', 'ai_candidates', 'result_model_alias_id', 'E2 model');
SELECT has_column('public', 'ai_candidates', 'result_board_alias_id', 'E2 board');

-- shape CHECK
SELECT throws_ok($$ INSERT INTO ai_candidates (candidate_type, alias, alias_type) VALUES ('PART_ALIAS', 'X1', 'MARKING') $$,
                 '23514', NULL, 'PART_ALIAS still needs a part spec');
SELECT throws_ok($$ INSERT INTO ai_candidates (candidate_type, board_id, alias, alias_type)
                    VALUES ('BOARD_ALIAS', '00000000-0000-4000-f400-000000000002', 'X1', 'MARKING') $$,
                 '23514', NULL, 'BOARD_ALIAS has no alias_type');
SELECT throws_ok($$ INSERT INTO ai_candidates (candidate_type, model_id, part_spec_id, alias)
                    VALUES ('MODEL_ALIAS', '00000000-0000-4000-f200-000000000001', '00000000-0000-4000-9900-000000000001', 'X1') $$,
                 '23514', NULL, 'MODEL_ALIAS has no part spec');
SELECT throws_ok($$ INSERT INTO ai_candidates (candidate_type, board_id, alias)
                    VALUES ('BOARD_ALIAS', '00000000-0000-4000-f400-000000000002', repeat('A', 101)) $$,
                 '23514', NULL, 'board alias ≤ 100 characters');
SELECT throws_ok($$ INSERT INTO ai_candidates (candidate_type, source, model_id, alias)
                    VALUES ('MODEL_ALIAS', 'PHOTO', '00000000-0000-4000-f200-000000000001', 'X1') $$,
                 '23514', NULL, 'source PHOTO requires a photo request');
SELECT throws_ok($$ INSERT INTO ai_candidates (candidate_type, model_id, variant_id, alias)
                    VALUES ('MODEL_ALIAS', '00000000-0000-4000-f200-000000000001', '00000000-0000-4000-f300-000000000001', 'X1') $$,
                 '23503', NULL, 'a variant must belong to the model');

-- =========================================================== 2. R10
SELECT ok(has_function_privilege('anon', 'public.ai_photo_propose(uuid,text,uuid,uuid,jsonb,text,text)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.ai_photo_propose(uuid,text,uuid,uuid,jsonb,text,text)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.ai_photo_propose(uuid,text,uuid,uuid,jsonb,text,text)', 'EXECUTE'),
          'R10: hint roles hold EXECUTE on ai_photo_propose');
SELECT ok(NOT has_function_privilege('vector_agent', 'public.ai_photo_propose(uuid,text,uuid,uuid,jsonb,text,text)', 'EXECUTE'),
          'vector_agent cannot run ai_photo_propose (no PUBLIC grant)');
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                            jsonb_build_array(pg_temp.rd('ABC123'))) $$,
                 '42501', '로그인이 필요합니다. 다시 로그인해 주세요.', 'anon refused by the guard');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role": "service_role"}', true);
SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                            jsonb_build_array(pg_temp.rd('ABC123'))) $$,
                 'P0001', 'AI 사진 인식 권한이 없습니다.', 'service_role (no employee) refused');
RESET ROLE;

-- =========================================================== 3. roles
DO $$
DECLARE n int; v_ok boolean;
BEGIN
  FOR n IN 1..6 LOOP
    PERFORM pg_temp.jwt(n::text);
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM ai_photo_propose(('00000000-0000-4000-9910-00000000000' || n)::uuid, 'PART',
                               '00000000-0000-4000-9900-000000000001', NULL, jsonb_build_array(pg_temp.rd('ROLE' || n || 'X')));
      v_ok := true;
    EXCEPTION WHEN raise_exception THEN
      v_ok := false;
      IF SQLERRM <> 'AI 사진 인식 권한이 없습니다.' THEN RAISE; END IF;
    END;
    RESET ROLE;
    INSERT INTO res VALUES ('role_' || n, to_jsonb(v_ok));
  END LOOP;
END $$;
SELECT is((SELECT jsonb_object_agg(k, v) FROM res WHERE k LIKE 'role\_%'),
          '{"role_1": true, "role_2": true, "role_3": false, "role_4": true, "role_5": true, "role_6": false}'::jsonb,
          'D4: ADMIN / MANAGER / TECHNICIAN / EXPERT_REPAIR allowed, RECEPTION / CS refused');
DELETE FROM ai_candidates WHERE alias LIKE 'ROLE%';
DELETE FROM ai_photo_requests WHERE id::text LIKE '00000000-0000-4000-9910-%';

-- =========================================================== 4. validation (as TECHNICIAN)
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT ai_photo_propose(NULL, 'PART', '00000000-0000-4000-9900-000000000001', NULL, jsonb_build_array(pg_temp.rd('A1'))) $$,
                 'P0001', '사진 요청 ID가 없습니다.', 'request id required');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'CHIP', '00000000-0000-4000-9900-000000000001', NULL, jsonb_build_array(pg_temp.rd('A1'))) $$,
                 'P0001', '사진 종류(부품 라벨·칩 마킹 / 메인보드 번호 / 기기 라벨)를 선택해 주세요.', 'kind');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', gen_random_uuid(), NULL, jsonb_build_array(pg_temp.rd('A1'))) $$,
                 'P0001', '부품 규격을 선택해 주세요.', 'unknown part spec');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'BOARD', '00000000-0000-4000-9900-000000000001', NULL, jsonb_build_array(pg_temp.rd('A1'))) $$,
                 'P0001', '메인보드를 선택해 주세요.', 'target of the wrong kind (spec id as board)');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'DEVICE', NULL, NULL, jsonb_build_array(pg_temp.rd('A1'))) $$,
                 'P0001', '모델을 선택해 주세요.', 'model required');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'DEVICE', '00000000-0000-4000-f200-000000000001',
                                            '00000000-0000-4000-f300-000000000001', jsonb_build_array(pg_temp.rd('A1'))) $$,
                 'P0001', '선택한 변형이 해당 모델에 속하지 않습니다.', 'variant of another model');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001',
                                            '00000000-0000-4000-f300-000000000001', jsonb_build_array(pg_temp.rd('A1'))) $$,
                 'P0001', '변형은 기기 라벨에서만 선택할 수 있습니다.', 'variant only for device labels');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL, '[]') $$,
                 'P0001', '인식 결과가 없습니다.', 'empty readings');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                            (SELECT jsonb_agg(pg_temp.rd('R' || i)) FROM generate_series(1, 11) i)) $$,
                 'P0001', '인식 결과는 10건까지 처리할 수 있습니다.', '11 readings');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL, '["A1"]') $$,
                 'P0001', '인식 결과 형식이 올바르지 않습니다.', 'reading must be an object');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                            jsonb_build_array(pg_temp.rd(repeat('A', 151)))) $$,
                 'P0001', '인식된 텍스트는 150자 이내여야 합니다.', 'text ≤ 150');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                            jsonb_build_array(pg_temp.rd('A1', 'SERIAL'))) $$,
                 'P0001', '인식 결과 종류가 올바르지 않습니다.', 'reading type');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                            jsonb_build_array(pg_temp.rd('A1', 'MARKING', 1.5))) $$,
                 'P0001', '신뢰도는 0에서 1 사이 숫자여야 합니다.', 'confidence range');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                            '[{"text": "A1", "type": "MARKING", "confidence": "0.5"}]') $$,
                 'P0001', '신뢰도는 0에서 1 사이 숫자여야 합니다.', 'confidence must be a number');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                            jsonb_build_array(pg_temp.rd('A1', 'MARKING', 0.5, repeat('n', 301)))) $$,
                 'P0001', '설명은 300자 이내 문자열이어야 합니다.', 'note ≤ 300');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                            jsonb_build_array(pg_temp.rd('A1')), repeat('m', 101)) $$,
                 'P0001', 'AI 모델명은 100자 이내여야 합니다.', 'model name ≤ 100');
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                            jsonb_build_array(pg_temp.rd('A1')), NULL, repeat('s', 201)) $$,
                 'P0001', '실행 ID는 200자 이내로 입력해 주세요.', 'execution id ≤ 200');
RESET ROLE;

-- =========================================================== 5. readings → result (PART, as TECHNICIAN)
INSERT INTO res SELECT 'counts_before', pg_temp.table_counts();
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'part', ai_photo_propose(
  '00000000-0000-4000-9920-000000000001', 'PART', '00000000-0000-4000-9900-000000000001', NULL,
  jsonb_build_array(
    pg_temp.rd('8T5 BQ780S', 'MARKING', 0.82, '칩 상단 마킹, 연락처 010-1234-5678'),  -- new (MARKING), note masked
    pg_temp.rd('BQ24780S'),                         -- spec name → ALREADY
    pg_temp.rd('bq24780s-ruyr'),                    -- existing alias (normalized) → ALREADY
    pg_temp.rd('010-9876-5432', 'OTHER', 0.4),      -- phone → PII
    pg_temp.rd('test@example.com', 'OTHER', 0.4),   -- e-mail → PII
    pg_temp.rd('1234567890123456', 'OTHER', 0.4),   -- card form → PII
    pg_temp.rd('---', 'OTHER', 0.1),                -- nothing readable → UNREADABLE
    pg_temp.rd('8t5bq780s', 'MARKING', 0.7),        -- same as the first after normalization → REPEATED
    pg_temp.rd('BQ24780SRUYRZ', 'PART_NUMBER', 1)   -- new (PART_NUMBER)
  ), 'test/vision-model', 'exec-p9-1');
RESET ROLE;
INSERT INTO res SELECT 'counts_after', pg_temp.table_counts();

SELECT is((SELECT v->>'request_id' FROM res WHERE k = 'part'), '00000000-0000-4000-9920-000000000001', 'request id returned');
SELECT is((SELECT jsonb_array_length(v->'created') FROM res WHERE k = 'part'), 2, 'two new candidates');
SELECT is((SELECT jsonb_agg(s->>'reason' ORDER BY i) FROM res, jsonb_array_elements(v->'skipped') WITH ORDINALITY t(s, i) WHERE k = 'part'),
          '["ALREADY", "ALREADY", "PII", "PII", "PII", "UNREADABLE", "REPEATED"]'::jsonb, 'skip reasons in reading order');
SELECT is((SELECT jsonb_agg(s->>'text' ORDER BY i) FROM res, jsonb_array_elements(v->'skipped') WITH ORDINALITY t(s, i)
            WHERE k = 'part' AND s->>'reason' = 'PII'),
          '["[마스킹]", "[마스킹]", "[마스킹]"]'::jsonb, 'PII readings are returned masked only');
SELECT is((SELECT count(*)::int FROM ai_candidates WHERE alias ~ '010|example|1234567890123456'), 0, 'no PII alias stored');
SELECT is((SELECT jsonb_agg(jsonb_build_object('alias', alias, 'type', alias_type, 'source', source, 'cand', candidate_type) ORDER BY alias)
             FROM ai_candidates WHERE photo_request_id = '00000000-0000-4000-9920-000000000001'),
          '[{"alias": "8T5 BQ780S", "type": "MARKING", "source": "PHOTO", "cand": "PART_ALIAS"},
            {"alias": "BQ24780SRUYRZ", "type": "PART_NUMBER", "source": "PHOTO", "cand": "PART_ALIAS"}]'::jsonb,
          'candidates: PART_ALIAS, source PHOTO, alias_type from the reading type');
SELECT is((SELECT rationale FROM ai_candidates WHERE alias = '8T5 BQ780S'),
          '사진 인식 · MARKING · 신뢰도 0.82 · 칩 상단 마킹, 연락처 [마스킹]', 'rationale: type, confidence, masked note');
SELECT is((SELECT row(status, source_ref, reviewed_at IS NULL)::text FROM ai_candidates WHERE alias = 'BQ24780SRUYRZ'),
          '(PENDING,exec-p9-1,t)', 'PENDING, execution id as source_ref');
SELECT is((SELECT row(photo_kind, part_spec_id, storage_path, ai_model, source_ref, reading_count, candidate_count, requested_by)::text
             FROM ai_photo_requests WHERE id = '00000000-0000-4000-9920-000000000001'),
          '(PART,00000000-0000-4000-9900-000000000001,00000000-0000-4000-9920-000000000001.webp,test/vision-model,exec-p9-1,9,2,00000000-0000-4000-a000-000000000004)',
          'request row: kind, target, path, model, execution id, counts, uploader');

-- =========================================================== 6. isolation: only ai_photo_requests (+1) and ai_candidates (+2) changed
SELECT is((SELECT jsonb_object_agg(key, (a.v->>key)::int - (b.v->>key)::int)
             FROM res a, res b, jsonb_object_keys(a.v) key
            WHERE a.k = 'counts_after' AND b.k = 'counts_before' AND (a.v->>key) <> (b.v->>key)),
          '{"ai_candidates": 2, "ai_photo_requests": 1}'::jsonb,
          'no other public table changed (inventory, specs, compatibility, aliases untouched)');

-- duplicate / zero-created / reuse
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'dup', ai_photo_propose('00000000-0000-4000-9920-000000000002', 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                               jsonb_build_array(pg_temp.rd('8T5BQ780S', 'MARKING', 0.6)));
SELECT throws_ok($$ SELECT ai_photo_propose('00000000-0000-4000-9920-000000000001', 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                            jsonb_build_array(pg_temp.rd('NEWONE1'))) $$,
                 'P0001', '이미 처리된 사진 요청입니다.', 'request id cannot be reused');
RESET ROLE;
SELECT is((SELECT v FROM res WHERE k = 'dup') - 'created',
          '{"request_id": null, "skipped": []}'::jsonb, 'only a duplicate → no request id');
SELECT is((SELECT (v->'created'->0->>'duplicate')::boolean FROM res WHERE k = 'dup'), true, 'existing PENDING candidate returned as duplicate');
SELECT is((SELECT count(*)::int FROM ai_photo_requests WHERE id = '00000000-0000-4000-9920-000000000002'), 0, 'no request row without a new candidate');

-- 500 cap (shared with VECTOR)
INSERT INTO ai_candidates (candidate_type, part_spec_id, alias, alias_type)
SELECT 'PART_ALIAS', '00000000-0000-4000-9900-000000000002', 'CAP' || i, 'OTHER'
  FROM generate_series(1, 500 - (SELECT count(*) FROM ai_candidates WHERE status = 'PENDING')::int) i;
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT ai_photo_propose(gen_random_uuid(), 'PART', '00000000-0000-4000-9900-000000000001', NULL,
                                            jsonb_build_array(pg_temp.rd('OVERCAP1'))) $$,
                 'P0001', '검토 대기 중인 AI 후보가 500건이라 더 제안할 수 없습니다. 관리자 검토 후 다시 제안해 주세요.', '500 PENDING cap');
RESET ROLE;
DELETE FROM ai_candidates WHERE alias LIKE 'CAP%';

-- BOARD / DEVICE
SELECT pg_temp.jwt('5');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'board', ai_photo_propose('00000000-0000-4000-9920-000000000003', 'BOARD', '00000000-0000-4000-f400-000000000002', NULL,
  jsonb_build_array(pg_temp.rd('BA92-21345A', 'BOARD_NUMBER'),          -- own number → ALREADY
                    pg_temp.rd('NM-D451', 'BOARD_NUMBER'),              -- alias of LA-K091P → CONFLICT
                    pg_temp.rd('la k091p', 'BOARD_NUMBER'),             -- number of LA-K091P → CONFLICT
                    pg_temp.rd('BA41-02345A', 'BOARD_NUMBER', 0.77)), NULL, 'exec-p9-3');
INSERT INTO res SELECT 'device', ai_photo_propose('00000000-0000-4000-9920-000000000004', 'DEVICE', '00000000-0000-4000-f200-000000000002',
                                                  '00000000-0000-4000-f300-000000000001',
  jsonb_build_array(pg_temp.rd('NT950QED', 'MODEL_NUMBER'),             -- own alias → ALREADY
                    pg_temp.rd('15Z90T', 'MODEL_NUMBER'),               -- alias of the LG model → CONFLICT
                    pg_temp.rd('NT950QED-KC71S', 'MODEL_NUMBER', 0.95)), NULL, 'exec-p9-4');
RESET ROLE;
SELECT is((SELECT jsonb_agg(jsonb_build_object('r', s->>'reason', 'd', s->>'detail') ORDER BY i)
             FROM res, jsonb_array_elements(v->'skipped') WITH ORDINALITY t(s, i) WHERE k = 'board'),
          '[{"r": "ALREADY", "d": null}, {"r": "CONFLICT", "d": "LA-K091P"}, {"r": "CONFLICT", "d": "LA-K091P"}]'::jsonb,
          'board: own number ALREADY; alias / number of another board CONFLICT with its number');
SELECT is((SELECT jsonb_agg(jsonb_build_object('r', s->>'reason', 'd', s->>'detail') ORDER BY i)
             FROM res, jsonb_array_elements(v->'skipped') WITH ORDINALITY t(s, i) WHERE k = 'device'),
          '[{"r": "ALREADY", "d": null}, {"r": "CONFLICT", "d": "LG 그램 15 15Z90T"}]'::jsonb,
          'device: own alias ALREADY; alias of another model CONFLICT with its label');
SELECT is((SELECT row(candidate_type, board_id, alias_type, part_spec_id)::text FROM ai_candidates WHERE alias = 'BA41-02345A'),
          '(BOARD_ALIAS,00000000-0000-4000-f400-000000000002,,)', 'BOARD_ALIAS candidate');
SELECT is((SELECT row(candidate_type, model_id, variant_id, alias_type)::text FROM ai_candidates WHERE alias = 'NT950QED-KC71S'),
          '(MODEL_ALIAS,00000000-0000-4000-f200-000000000002,00000000-0000-4000-f300-000000000001,)', 'MODEL_ALIAS candidate with variant');
SELECT is((SELECT row(photo_kind, model_id, variant_id, board_id)::text FROM ai_photo_requests WHERE id = '00000000-0000-4000-9920-000000000004'),
          '(DEVICE,00000000-0000-4000-f200-000000000002,00000000-0000-4000-f300-000000000001,)', 'device request row with variant');

-- =========================================================== 7. approval (ADMIN) — Phase 8 review RPC, new branches
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT ai_candidate_approve(%L)', (SELECT id FROM ai_candidates WHERE alias = 'BA41-02345A')),
                 'P0001', '관리자만 AI 후보를 검토할 수 있습니다.', 'TECHNICIAN cannot approve');
RESET ROLE;
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT ai_candidate_approve(%L, %L)', (SELECT id FROM ai_candidates WHERE alias = 'BA41-02345A'), 'DOCUMENT'),
                 'P0001', '별칭 후보는 승인 방식을 선택하지 않습니다.', 'no approval mode for board aliases');
INSERT INTO res SELECT 'ap_board', ai_candidate_approve((SELECT id FROM ai_candidates WHERE alias = 'BA41-02345A'), NULL, NULL, '사진 확인');
INSERT INTO res SELECT 'ap_model', ai_candidate_approve((SELECT id FROM ai_candidates WHERE alias = 'NT950QED-KC71S'));
INSERT INTO res SELECT 'ap_part', ai_candidate_approve((SELECT id FROM ai_candidates WHERE alias = '8T5 BQ780S'));
RESET ROLE;
SELECT is((SELECT row(board_id, alias, created_by)::text FROM catalog_board_aliases WHERE id = (SELECT (v->>'board_alias_id')::uuid FROM res WHERE k = 'ap_board')),
          '(00000000-0000-4000-f400-000000000002,BA41-02345A,00000000-0000-4000-a000-000000000001)', 'board alias registered, created_by = ADMIN');
SELECT is((SELECT row(model_id, variant_id, alias, source, created_by)::text FROM catalog_model_aliases
            WHERE id = (SELECT (v->>'model_alias_id')::uuid FROM res WHERE k = 'ap_model')),
          '(00000000-0000-4000-f200-000000000002,00000000-0000-4000-f300-000000000001,NT950QED-KC71S,manual,00000000-0000-4000-a000-000000000001)',
          'model alias registered with variant, source manual');
SELECT is((SELECT row(part_spec_id, alias, alias_type)::text FROM part_number_aliases WHERE id = (SELECT (v->>'alias_id')::uuid FROM res WHERE k = 'ap_part')),
          '(00000000-0000-4000-9900-000000000001,"8T5 BQ780S",MARKING)', 'photo part alias registered as MARKING');
SELECT is((SELECT row(status, reviewed_by, reviewed_at IS NOT NULL, review_note, result_board_alias_id IS NOT NULL)::text FROM ai_candidates WHERE alias = 'BA41-02345A'),
          '(APPROVED,00000000-0000-4000-a000-000000000001,t,"사진 확인",t)', 'reviewer, time, note, result recorded');
SELECT is((SELECT result_model_alias_id IS NOT NULL FROM ai_candidates WHERE alias = 'NT950QED-KC71S'), true, 'result_model_alias_id set');
SELECT is((SELECT count(*)::int FROM compatibility_evidence), 0, 'no compatibility evidence from photo candidates (P4)');

-- alias registered meanwhile → message, candidate stays PENDING
INSERT INTO catalog_board_aliases (board_id, alias) VALUES ('00000000-0000-4000-f400-000000000001', 'NEWBRD-1');
INSERT INTO ai_photo_requests (id, photo_kind, board_id, storage_path, reading_count, candidate_count)
VALUES ('00000000-0000-4000-9920-000000000009', 'BOARD', '00000000-0000-4000-f400-000000000002', '00000000-0000-4000-9920-000000000009.webp', 2, 2);
INSERT INTO ai_candidates (candidate_type, source, photo_request_id, board_id, alias)
VALUES ('BOARD_ALIAS', 'PHOTO', '00000000-0000-4000-9920-000000000009', '00000000-0000-4000-f400-000000000002', 'NEWBRD-1'),
       ('BOARD_ALIAS', 'PHOTO', '00000000-0000-4000-9920-000000000009', '00000000-0000-4000-f400-000000000002', 'LA-K091P');
INSERT INTO ai_photo_requests (id, photo_kind, model_id, storage_path, reading_count, candidate_count)
VALUES ('00000000-0000-4000-9920-000000000010', 'DEVICE', '00000000-0000-4000-f200-000000000002', '00000000-0000-4000-9920-000000000010.webp', 2, 2);
INSERT INTO ai_candidates (candidate_type, source, photo_request_id, model_id, alias)
VALUES ('MODEL_ALIAS', 'PHOTO', '00000000-0000-4000-9920-000000000010', '00000000-0000-4000-f200-000000000002', '15Z90T'),
       ('MODEL_ALIAS', 'PHOTO', '00000000-0000-4000-9920-000000000010', '00000000-0000-4000-f200-000000000002', 'NT950QED');
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT ai_candidate_approve(%L)', (SELECT id FROM ai_candidates WHERE alias = 'NEWBRD-1')),
                 'P0001', '이미 다른 보드의 번호 또는 별칭으로 등록되어 있습니다.', 'board alias of another board meanwhile');
SELECT throws_ok(format('SELECT ai_candidate_approve(%L)', (SELECT id FROM ai_candidates WHERE alias = 'LA-K091P')),
                 'P0001', '이미 다른 보드의 번호 또는 별칭으로 등록되어 있습니다.', 'number of another board');
SELECT throws_ok(format('SELECT ai_candidate_approve(%L)', (SELECT id FROM ai_candidates WHERE alias = '15Z90T')),
                 'P0001', '이미 다른 모델의 별칭으로 등록되어 있습니다.', 'model alias of another model');
SELECT throws_ok(format('SELECT ai_candidate_approve(%L)', (SELECT id FROM ai_candidates WHERE alias = 'NT950QED' AND candidate_type = 'MODEL_ALIAS')),
                 'P0001', '이미 등록된 별칭입니다.', 'own model alias');
INSERT INTO res SELECT 'rej', ai_candidate_reject((SELECT id FROM ai_candidates WHERE alias = 'NEWBRD-1'), '오독');
RESET ROLE;
SELECT is((SELECT status FROM ai_candidates WHERE alias = 'LA-K091P' AND candidate_type = 'BOARD_ALIAS'), 'PENDING', 'failed approval leaves PENDING');
SELECT is((SELECT row(status, review_note)::text FROM ai_candidates WHERE alias = 'NEWBRD-1' AND candidate_type = 'BOARD_ALIAS'),
          '(REJECTED,오독)', 'photo candidate can be rejected');

-- =========================================================== 8. immutability (E9) + KI-14 rule for the new result columns
SELECT throws_ok(format('UPDATE ai_candidates SET photo_request_id = %L WHERE alias = %L',
                        '00000000-0000-4000-9920-000000000010', 'LA-K091P'),
                 'P0001', 'AI 후보 내용은 수정할 수 없습니다.', 'photo_request_id of a PENDING candidate is immutable');
SELECT throws_ok($$ UPDATE ai_candidates SET alias = 'X' WHERE alias = 'BA41-02345A' $$,
                 'P0001', '이미 처리된 후보입니다.', 'processed candidate content immutable');
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ DELETE FROM catalog_board_aliases WHERE alias = 'BA41-02345A' $$, 'KI-14: ADMIN deletes the approved board alias');
SELECT lives_ok($$ DELETE FROM catalog_model_aliases WHERE alias = 'NT950QED-KC71S' $$, 'KI-14: ADMIN deletes the approved model alias');
SELECT lives_ok($$ DELETE FROM part_number_aliases WHERE alias = '8T5 BQ780S' $$, 'KI-14: ADMIN deletes the approved photo part alias');
RESET ROLE;
SELECT is((SELECT jsonb_agg(row(status, result_board_alias_id, result_model_alias_id, result_alias_id)::text ORDER BY alias)
             FROM ai_candidates WHERE alias IN ('BA41-02345A', 'NT950QED-KC71S', '8T5 BQ780S')),
          '["(APPROVED,,,)", "(APPROVED,,,)", "(APPROVED,,,)"]'::jsonb, 'results set to NULL, still APPROVED');
-- cascade: a model deleted with an approved alias candidate on it
INSERT INTO ai_photo_requests (id, photo_kind, model_id, storage_path, reading_count, candidate_count)
VALUES ('00000000-0000-4000-9920-000000000011', 'DEVICE', '00000000-0000-4000-9900-000000000003', '00000000-0000-4000-9920-000000000011.webp', 1, 1);
INSERT INTO ai_candidates (candidate_type, source, photo_request_id, model_id, alias)
VALUES ('MODEL_ALIAS', 'PHOTO', '00000000-0000-4000-9920-000000000011', '00000000-0000-4000-9900-000000000003', 'P9TMP-1');
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'ap_tmp', ai_candidate_approve((SELECT id FROM ai_candidates WHERE alias = 'P9TMP-1'));
RESET ROLE;
SELECT lives_ok($$ DELETE FROM catalog_models WHERE id = '00000000-0000-4000-9900-000000000003' $$, 'deleting a model with an approved photo candidate works');
SELECT is((SELECT count(*)::int FROM ai_photo_requests WHERE id = '00000000-0000-4000-9920-000000000011'), 0, 'its request row cascades');

-- =========================================================== 9. VECTOR non-exposure
SELECT ok(NOT has_table_privilege('vector_agent', 'public.ai_photo_requests', 'SELECT'), 'vector_agent: no SELECT on ai_photo_requests');
SELECT ok(NOT has_schema_privilege('vector_agent', 'storage', 'USAGE'), 'vector_agent: no USAGE on schema storage');
SELECT ok(NOT has_table_privilege('vector_agent', 'storage.objects', 'SELECT'), 'vector_agent: no SELECT on storage.objects');
SET LOCAL ROLE vector_agent;
INSERT INTO res VALUES ('vec_reads', jsonb_build_array(
  pg_temp.try_state('SELECT count(*) FROM public.ai_photo_requests'),
  pg_temp.try_state('SELECT count(*) FROM storage.objects'),
  pg_temp.try_state('SELECT count(*) FROM storage.buckets'),
  pg_temp.try_state('SELECT photo_request_id FROM public.ai_candidates LIMIT 1')));
RESET ROLE;
SELECT is((SELECT v FROM res WHERE k = 'vec_reads'), '["42501", "42501", "42501", "42501"]'::jsonb,
          'vector_agent: actual reads of ai_photo_requests, storage.objects, storage.buckets, ai_candidates → 42501');
SELECT is((SELECT count(*)::int FROM pg_proc p WHERE p.pronamespace = 'vector_api'::regnamespace
             AND (p.prosrc ~* 'ai_photo|photo_request|storage\.' )), 0, 'no vector_api function reads photos, photo requests or storage');
SET LOCAL ROLE vector_agent;
INSERT INTO res SELECT 'vec', vector_api.propose_part_alias('00000000-0000-4000-9900-000000000002', 'VEC-ALIAS-1', 'PART_NUMBER', NULL, 'exec-v');
RESET ROLE;
SELECT is((SELECT row(source, photo_request_id)::text FROM ai_candidates WHERE id = (SELECT (v->>'candidate_id')::uuid FROM res WHERE k = 'vec')),
          '(VECTOR,)', 'VECTOR proposals still insert source VECTOR without a photo');

-- =========================================================== 10. storage policies
SET LOCAL storage.allow_delete_query = 'true';
DO $$
DECLARE n int; v_state text; c int;
BEGIN
  FOR n IN 1..6 LOOP
    PERFORM pg_temp.jwt(n::text);
    SET LOCAL ROLE authenticated;
    BEGIN
      INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('ai-photos', 'p9test-' || n || '.webp', '00000000-0000-4000-a000-00000000000' || n);
      v_state := 'OK';
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
    END;
    RESET ROLE;
    INSERT INTO res VALUES ('st_ins_' || n, to_jsonb(v_state));
  END LOOP;
  FOR n IN 1..6 LOOP
    PERFORM pg_temp.jwt(n::text);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO c FROM storage.objects WHERE bucket_id = 'ai-photos' AND name LIKE 'p9test-%';
    RESET ROLE;
    INSERT INTO res VALUES ('st_sel_' || n, to_jsonb(c));
  END LOOP;
  -- TECHNICIAN (04) tries to delete MANAGER's (02) photo, then its own
  PERFORM pg_temp.jwt('4');
  SET LOCAL ROLE authenticated;
  DELETE FROM storage.objects WHERE bucket_id = 'ai-photos' AND name = 'p9test-2.webp';
  GET DIAGNOSTICS c = ROW_COUNT;
  INSERT INTO res VALUES ('st_del_other', to_jsonb(c));
  DELETE FROM storage.objects WHERE bucket_id = 'ai-photos' AND name = 'p9test-4.webp';
  GET DIAGNOSTICS c = ROW_COUNT;
  INSERT INTO res VALUES ('st_del_own', to_jsonb(c));
  RESET ROLE;
  PERFORM pg_temp.jwt('1');
  SET LOCAL ROLE authenticated;
  DELETE FROM storage.objects WHERE bucket_id = 'ai-photos' AND name = 'p9test-2.webp';
  GET DIAGNOSTICS c = ROW_COUNT;
  INSERT INTO res VALUES ('st_del_admin', to_jsonb(c));
  RESET ROLE;
END $$;
SELECT is((SELECT jsonb_object_agg(k, v) FROM res WHERE k LIKE 'st\_ins\_%'),
          '{"st_ins_1": "OK", "st_ins_2": "OK", "st_ins_3": "42501", "st_ins_4": "OK", "st_ins_5": "OK", "st_ins_6": "42501"}'::jsonb,
          'upload: the 4 staff roles only (D4)');
SELECT is((SELECT jsonb_object_agg(k, v) FROM res WHERE k LIKE 'st\_sel\_%'),
          '{"st_sel_1": 4, "st_sel_2": 1, "st_sel_3": 0, "st_sel_4": 1, "st_sel_5": 1, "st_sel_6": 0}'::jsonb,
          'read: ADMIN all, uploader own only, others nothing');
SELECT is((SELECT jsonb_object_agg(k, v) FROM res WHERE k LIKE 'st\_del\_%'),
          '{"st_del_own": 1, "st_del_admin": 1, "st_del_other": 0}'::jsonb, 'delete: own or ADMIN only');
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'ai-photos'), 0, 'anon sees no ai-photos object');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
