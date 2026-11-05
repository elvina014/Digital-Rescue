-- =============================================================
-- Click Guard MVP (20261106090000_click_guard_mvp.sql)
-- - 수집 RPC 3개: service_role만 실행, anon/authenticated는 함수 내부에서 거부 (R10 — EXECUTE는 유지)
-- - 테이블: SELECT는 ADMIN만, anon/authenticated 쓰기 불가
-- - cg_record_engagement: GREATEST로만 증가, 상한 검증, 광고 유입 없는 세션 무시, 전환 명칭 검증
-- - cg_purge_old: 보존 기간 지난 기록만 삭제
-- Run: npx supabase test db   (local only; rolled back)
-- Seed users: a…01 ADMIN, a…02 MANAGER
-- =============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(28);

-- ---------- 1. 함수 권한: R10 (hint_roles는 EXECUTE 보유, PUBLIC 없음) ----------
SELECT ok(has_function_privilege('anon', 'public.cg_record_visit(jsonb)', 'EXECUTE'),
  'R10: anon keeps EXECUTE on cg_record_visit (refusal is inside)');
SELECT ok(has_function_privilege('authenticated', 'public.cg_record_engagement(uuid,integer,integer,integer,boolean,text)', 'EXECUTE'),
  'R10: authenticated keeps EXECUTE on cg_record_engagement');
SELECT ok(has_function_privilege('service_role', 'public.cg_purge_old(integer)', 'EXECUTE'),
  'service_role can execute cg_purge_old');
SELECT ok(NOT EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
     WHERE p.proname IN ('cg_record_visit', 'cg_record_engagement', 'cg_purge_old') AND a.grantee = 0),
  'no EXECUTE for PUBLIC on the cg_ functions');
SELECT ok((SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=public'])
             FROM pg_proc WHERE proname IN ('cg_record_visit', 'cg_record_engagement', 'cg_purge_old')),
  'cg_ functions are SECURITY DEFINER with a fixed search_path');

-- ---------- 2. 함수 내부 거부 ----------
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT cg_record_visit('{"session_id":"00000000-0000-4000-9c00-000000000001","click_key":"x"}') $$,
  '42501', 'Click Guard 수집 함수는 서버에서만 호출할 수 있습니다.', 'anon: cg_record_visit refused inside');
SELECT throws_ok($$ SELECT cg_record_engagement('00000000-0000-4000-9c00-000000000001', 1, 1, 1, true, 'phone') $$,
  '42501', NULL, 'anon: cg_record_engagement refused inside');
SELECT throws_ok($$ SELECT cg_purge_old(90) $$, '42501', NULL, 'anon: cg_purge_old refused inside');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT cg_record_visit('{"session_id":"00000000-0000-4000-9c00-000000000001","click_key":"x"}') $$,
  '42501', NULL, 'authenticated ADMIN: cg_record_visit refused inside');
SELECT throws_ok($$ SELECT cg_purge_old(90) $$, '42501', NULL, 'authenticated ADMIN: cg_purge_old refused inside');
RESET ROLE;

-- 직접 접속(auth.role() = NULL)도 거부 — IS DISTINCT FROM
SELECT set_config('request.jwt.claims', '', true);
SELECT throws_ok($$ SELECT cg_purge_old(90) $$, '42501', NULL, 'no JWT role (postgres session): refused');

-- ---------- 3. service_role 기록 ----------
SELECT set_config('request.jwt.claims', '{"role": "service_role"}', true);
SET LOCAL ROLE service_role;
SELECT is(
  cg_record_visit('{"session_id":"00000000-0000-4000-9c00-000000000001","click_key":"ct=test",
    "client_ip":"203.0.113.7","ip_version":4,"ip_prefix":"203.0.113.0/24","raw_ip_headers":{"x-real-ip":"203.0.113.7"},
    "user_agent":"Mozilla/5.0","is_bot":false,"device_type":"mobile","host":"localhost","path":"/",
    "n_media":"27758","n_query":"노트북수리","n_rank":"1","n_ad":"nad-test","n_keyword":"노트북수리",
    "n_campaign_type":"1","napm":"ct=test","country":"KR"}'::jsonb),
  '00000000-0000-4000-9c00-000000000001'::uuid, 'service_role: cg_record_visit returns the session id');
SELECT cg_record_visit('{"session_id":"00000000-0000-4000-9c00-000000000001","click_key":"ct=test","client_ip":"not-an-ip","ip_prefix":"203.0.113.7/24","n_rank":"abc"}'::jsonb);
SELECT throws_ok($$ SELECT cg_record_visit('{"session_id":"nope","click_key":"x"}') $$,
  'P0001', '세션 ID가 올바르지 않습니다.', 'invalid session id rejected');
SELECT throws_ok($$ SELECT cg_record_visit('{"session_id":"00000000-0000-4000-9c00-000000000001"}') $$,
  'P0001', '클릭 키가 없습니다.', 'missing click_key rejected');
RESET ROLE;

SELECT is((SELECT count(*)::int FROM cg_ad_visits WHERE session_id = '00000000-0000-4000-9c00-000000000001'), 2,
  'two raw visit rows stored (refresh)');
SELECT is((SELECT count(DISTINCT click_key)::int FROM cg_ad_visits WHERE session_id = '00000000-0000-4000-9c00-000000000001'), 1,
  'distinct click_key = 1');
SELECT ok((SELECT client_ip IS NULL AND ip_prefix IS NULL AND n_rank IS NULL FROM cg_ad_visits
            WHERE session_id = '00000000-0000-4000-9c00-000000000001' ORDER BY id DESC LIMIT 1),
  'malformed ip / prefix (host bits) / rank are dropped, row still stored');
SELECT ok((SELECT ip_version = 4 AND n_rank = 1 AND n_query = '노트북수리' FROM cg_ad_visits
            WHERE session_id = '00000000-0000-4000-9c00-000000000001' ORDER BY id LIMIT 1),
  'ip_version derived from client_ip, n_rank cast, Korean query kept');
SELECT ok(EXISTS (SELECT 1 FROM cg_engagement WHERE session_id = '00000000-0000-4000-9c00-000000000001'),
  'cg_record_visit creates the engagement row');

-- ---------- 4. 참여도 ----------
SET LOCAL ROLE service_role;
SELECT cg_record_engagement('00000000-0000-4000-9c00-000000000001', 8000, 60, 3, true, NULL);
SELECT cg_record_engagement('00000000-0000-4000-9c00-000000000001', 2000, 10, 1, true, 'phone');
SELECT cg_record_engagement('00000000-0000-4000-9c00-000000000001', NULL, NULL, NULL, false, 'phone');
SELECT throws_ok($$ SELECT cg_record_engagement('00000000-0000-4000-9c00-000000000001', 1, 101, 1, false, NULL) $$,
  'P0001', '스크롤 값이 범위를 벗어났습니다.', 'scroll > 100 rejected');
SELECT throws_ok($$ SELECT cg_record_engagement('00000000-0000-4000-9c00-000000000001', 1, 1, 1, false, 'tel') $$,
  'P0001', '전환 종류가 올바르지 않습니다.', 'conversion outside the CTA names rejected');
SELECT lives_ok($$ SELECT cg_record_engagement('00000000-0000-4000-9c00-0000000000ff', 1, 1, 1, true, 'kakao') $$,
  'session without an ad visit: no error');
RESET ROLE;

SELECT ok((SELECT dwell_ms = 8000 AND max_scroll_pct = 60 AND interactions = 3 AND pageviews = 2
             AND conversions = '{"phone": 2}'::jsonb
             FROM cg_engagement WHERE session_id = '00000000-0000-4000-9c00-000000000001'),
  'engagement: GREATEST only, pageviews counted, phone conversion x2');
SELECT ok(NOT EXISTS (SELECT 1 FROM cg_engagement WHERE session_id = '00000000-0000-4000-9c00-0000000000ff'),
  'session without an ad visit is ignored');

-- ---------- 5. 테이블 접근 ----------
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM cg_ad_visits WHERE session_id = '00000000-0000-4000-9c00-000000000001'), 2, 'ADMIN sees visit rows');
SELECT throws_ok($$ INSERT INTO cg_whitelist (cidr) VALUES ('10.0.0.0/8') $$, '42501', NULL, 'ADMIN cannot write tables directly');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM cg_ad_visits) + (SELECT count(*)::int FROM cg_engagement), 0,
  'MANAGER (non-admin) sees 0 rows');
RESET ROLE;

-- ---------- 6. 보존 정리 ----------
UPDATE cg_ad_visits SET created_at = now() - interval '100 days'
 WHERE id = (SELECT min(id) FROM cg_ad_visits WHERE session_id = '00000000-0000-4000-9c00-000000000001');
SELECT set_config('request.jwt.claims', '{"role": "service_role"}', true);
SET LOCAL ROLE service_role;
SELECT is((cg_purge_old(90) ->> 'visits')::int, 1, 'cg_purge_old deletes only rows older than 90 days');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
