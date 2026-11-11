-- =============================================================
-- Click Guard 네이버 차단 등록 (20261111090000_click_guard_naver_block.sql)
-- - cg_mark_naver_registered / cg_mark_naver_unregistered / cg_log_block: ADMIN만, 그 외는 함수 내부에서 거부 (R10 — EXECUTE 유지)
-- - 등록 기록: status·네이버 컬럼 저장, 메모 유지, manual 구분
-- - 감사 로그: 추가만 가능(직접 INSERT/UPDATE/DELETE 불가), ADMIN만 조회
-- Run: npx supabase test db   (local only; rolled back)
-- Seed users: a…01 ADMIN, a…02 MANAGER.  테스트 IP는 100.64.0.0/10
-- =============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(24);

-- ---------- 1. 구조·권한 ----------
SELECT has_column('public', 'cg_ip_marks', 'naver_filter_id', 'cg_ip_marks.naver_filter_id');
SELECT has_column('public', 'cg_ip_marks', 'naver_source', 'cg_ip_marks.naver_source');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cg_block_log'::regclass), 'cg_block_log RLS on');
SELECT ok(has_function_privilege('anon', 'public.cg_mark_naver_registered(inet,text,text,text)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.cg_log_block(inet,text,text,text,jsonb)', 'EXECUTE'),
  'R10: hint roles keep EXECUTE (refusal is inside)');
SELECT ok(NOT EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
     WHERE p.proname IN ('cg_mark_naver_registered', 'cg_mark_naver_unregistered', 'cg_log_block') AND a.grantee = 0),
  'no EXECUTE for PUBLIC');
SELECT ok((SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=public']) FROM pg_proc
            WHERE proname IN ('cg_mark_naver_registered', 'cg_mark_naver_unregistered', 'cg_log_block')),
  'SECURITY DEFINER + fixed search_path');

SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT cg_mark_naver_registered('100.64.1.10', '1', NULL) $$, 'P0001',
  '부정클릭 감시는 관리자만 이용할 수 있습니다.', 'anon: register refused');
SELECT throws_ok($$ SELECT cg_log_block('100.64.1.10', 'register', 'success') $$, 'P0001', NULL, 'anon: log refused');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT cg_mark_naver_registered('100.64.1.10', '1', NULL) $$, 'P0001', NULL, 'MANAGER: register refused');
SELECT throws_ok($$ SELECT cg_mark_naver_unregistered('100.64.1.10') $$, 'P0001', NULL, 'MANAGER: unregister refused');
SELECT throws_ok($$ SELECT cg_log_block('100.64.1.10', 'register', 'success') $$, 'P0001', NULL, 'MANAGER: log refused');
SELECT is((SELECT count(*) FROM cg_block_log), 0::bigint, 'MANAGER: cannot read the log (RLS)');
RESET ROLE;

-- ---------- 2. 등록·해제 기록 (ADMIN) ----------
INSERT INTO cg_ip_marks (client_ip, status, memo) VALUES ('100.64.2.20', 'watch', '기존 메모');

SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is((cg_mark_naver_registered('100.64.1.10', ' 9001 ', ' 반복 클릭 ') ->> 'naver_filter_id'), '9001', 'register: filter id saved (trimmed)');
SELECT ok((SELECT status = 'naver_blocked' AND naver_source = 'api' AND memo = '반복 클릭' AND naver_registered_at IS NOT NULL
                  AND marked_by = '00000000-0000-4000-a000-000000000001'
             FROM cg_ip_marks WHERE client_ip = '100.64.1.10'), 'register: status, source=api, memo, time, actor');
SELECT cg_mark_naver_registered('100.64.2.20', '9002', NULL);
SELECT ok((SELECT status = 'naver_blocked' AND memo = '기존 메모' FROM cg_ip_marks WHERE client_ip = '100.64.2.20'),
  'register over an existing mark keeps the memo when none is given');
SELECT cg_mark_naver_registered('100.64.3.30', NULL, '직접 등록', 'manual');
SELECT ok((SELECT naver_source = 'manual' AND naver_filter_id IS NULL FROM cg_ip_marks WHERE client_ip = '100.64.3.30'),
  'manual mark: source=manual, no filter id');
SELECT throws_ok($$ SELECT cg_mark_naver_registered('100.64.4.40', NULL, NULL, 'api') $$, 'P0001',
  '네이버 항목 ID가 없습니다.', 'api register needs a filter id');
SELECT throws_ok($$ SELECT cg_mark_naver_registered('100.64.4.40', '1', NULL, 'other') $$, 'P0001', NULL, 'unknown source rejected');

SELECT is(cg_mark_naver_unregistered('100.64.1.10'), true, 'unregister returns true');
SELECT ok(NOT EXISTS (SELECT 1 FROM cg_ip_marks WHERE client_ip = '100.64.1.10'), 'unregister removes the mark');
SELECT is(cg_mark_naver_unregistered('100.64.1.10'), false, 'unregister again: false (nothing to remove)');

-- ---------- 3. 감사 로그 ----------
SELECT cg_log_block('100.64.1.10', 'register', 'success', '9001', '{"memo": "x"}');
SELECT ok((SELECT actor = '00000000-0000-4000-a000-000000000001' AND naver_filter_id = '9001' AND detail ->> 'memo' = 'x'
             FROM cg_block_log WHERE client_ip = '100.64.1.10'), 'log row saved with actor');
SELECT throws_ok($$ SELECT cg_log_block('100.64.1.10', 'delete', 'success') $$, 'P0001', NULL, 'unknown action rejected');
SELECT throws_ok($$ INSERT INTO cg_block_log (action, result) VALUES ('register', 'success') $$, '42501', NULL,
  'ADMIN cannot insert into the log directly');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
