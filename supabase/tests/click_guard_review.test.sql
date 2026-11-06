-- =============================================================
-- Click Guard MVP 2/2 (20261106120000_click_guard_review.sql)
-- - 조회·표시·화이트리스트 RPC: ADMIN만, 그 외(anon / MANAGER)는 함수 내부에서 거부 (R10 — EXECUTE 유지)
-- - cg_suspect_ips 판정: 반복·짧은 체류 노출 / 전환 감점 / 화이트리스트·봇 제외 / 같은 NaPm 새로고침은 클릭 1 / 심야 R4
-- - cg_mark_ip / cg_whitelist_*: 저장·갱신·삭제, 입력 검증
-- Run: npx supabase test db   (local only; rolled back)
-- Seed users: a…01 ADMIN, a…02 MANAGER.  테스트 IP는 100.64.0.0/10 (데모 시드와 겹치지 않음)
-- =============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(27);

-- ---------- fixture (owner) ----------
-- P 100.64.1.10 반복·짧은 체류 4클릭(5분 간격)   Q 100.64.2.20 P + 전환   W 100.64.3.30 P + 화이트리스트
-- B 100.64.4.40 P + 봇   E 100.64.5.50 같은 NaPm 5회   N 100.64.6.60 KST 03시대 3클릭(12분 간격)
DO $$
DECLARE r record; i integer; v_sid uuid; v_night timestamptz;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('100.64.1.10'::inet, false), ('100.64.2.20'::inet, false),
                                 ('100.64.3.30'::inet, false), ('100.64.4.40'::inet, true)) t(ip, bot) LOOP
    FOR i IN 1..4 LOOP
      v_sid := gen_random_uuid();
      INSERT INTO cg_ad_visits (created_at, session_id, click_key, client_ip, ip_prefix, is_bot, device_type, n_query)
      VALUES (now() - interval '3 hours' + i * interval '5 minutes', v_sid, 'k-' || host(r.ip) || '-' || i, r.ip,
              network(set_masklen(r.ip, 24)), r.bot, 'mobile', 'q' || (i % 2));
      INSERT INTO cg_engagement (session_id, dwell_ms, interactions, conversions)
      VALUES (v_sid, 1000, 0, CASE WHEN r.ip = '100.64.2.20'::inet AND i = 4 THEN '{"phone": 1}'::jsonb ELSE '{}' END);
    END LOOP;
  END LOOP;
  INSERT INTO cg_whitelist (cidr, reason) VALUES ('100.64.3.0/24', 'test');

  v_sid := gen_random_uuid();
  FOR i IN 1..5 LOOP
    INSERT INTO cg_ad_visits (created_at, session_id, click_key, client_ip, ip_prefix)
    VALUES (now() - interval '2 hours' + i * interval '1 minute', v_sid, 'same-napm', '100.64.5.50', '100.64.5.0/24');
  END LOOP;
  INSERT INTO cg_engagement (session_id, dwell_ms, interactions) VALUES (v_sid, 1000, 0);

  -- 가장 최근에 지난 KST 03:00 (24시간 안)
  v_night := (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') + interval '3 hours') AT TIME ZONE 'Asia/Seoul';
  IF v_night + interval '30 minutes' > now() THEN v_night := v_night - interval '1 day'; END IF;
  FOR i IN 0..2 LOOP
    v_sid := gen_random_uuid();
    INSERT INTO cg_ad_visits (created_at, session_id, click_key, client_ip, ip_prefix)
    VALUES (v_night + i * interval '12 minutes', v_sid, 'night-' || i, '100.64.6.60', '100.64.6.0/24');
    INSERT INTO cg_engagement (session_id, dwell_ms, interactions) VALUES (v_sid, 500, 0);
  END LOOP;
END $$;

CREATE TEMP TABLE res AS SELECT NULL::text AS ip, NULL::integer AS score, NULL::jsonb AS reasons, NULL::integer AS clicks LIMIT 0;
GRANT ALL ON res TO authenticated;

-- ---------- 1. 권한 ----------
SELECT ok(has_function_privilege('anon', 'public.cg_suspect_ips(integer,integer)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.cg_mark_ip(inet,text,text)', 'EXECUTE'),
  'R10: hint roles keep EXECUTE (refusal is inside)');
SELECT ok(NOT EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
     WHERE p.proname IN ('cg_suspect_ips', 'cg_ad_summary', 'cg_ip_detail', 'cg_mark_ip', 'cg_whitelist_upsert', 'cg_whitelist_delete')
       AND a.grantee = 0),
  'no EXECUTE for PUBLIC');
SELECT ok((SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=public']) FROM pg_proc
            WHERE proname IN ('cg_suspect_ips', 'cg_ad_summary', 'cg_ip_detail', 'cg_mark_ip', 'cg_whitelist_upsert', 'cg_whitelist_delete')),
  'SECURITY DEFINER + fixed search_path');

SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT * FROM cg_suspect_ips() $$, 'P0001', '부정클릭 감시는 관리자만 이용할 수 있습니다.', 'anon: cg_suspect_ips refused');
SELECT throws_ok($$ SELECT cg_mark_ip('100.64.1.10', 'watch', NULL) $$, 'P0001', NULL, 'anon: cg_mark_ip refused');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000002", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT * FROM cg_suspect_ips() $$, 'P0001', NULL, 'MANAGER: cg_suspect_ips refused');
SELECT throws_ok($$ SELECT cg_ad_summary(24) $$, 'P0001', NULL, 'MANAGER: cg_ad_summary refused');
SELECT throws_ok($$ SELECT cg_ip_detail('100.64.1.10') $$, 'P0001', NULL, 'MANAGER: cg_ip_detail refused');
SELECT throws_ok($$ SELECT cg_whitelist_upsert('100.64.9.0/24', NULL) $$, 'P0001', NULL, 'MANAGER: cg_whitelist_upsert refused');
SELECT throws_ok($$ SELECT cg_whitelist_delete(1) $$, 'P0001', NULL, 'MANAGER: cg_whitelist_delete refused');
RESET ROLE;

-- ---------- 2. 판정 (ADMIN) ----------
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT host(client_ip), score, reasons, clicks FROM cg_suspect_ips(24, -1000) WHERE client_ip << '100.64.0.0/10';
RESET ROLE;

SELECT is((SELECT score FROM res WHERE ip = '100.64.1.10'), 100, 'repeat + short dwell: R1+R2+R3 = 100');
SELECT is((SELECT array_agg(x ->> 'rule' ORDER BY x ->> 'rule') FROM res, jsonb_array_elements(reasons) x WHERE ip = '100.64.1.10'),
  ARRAY['R1', 'R2', 'R3'], 'reasons R1 R2 R3 with Korean labels');
SELECT ok((SELECT reasons -> 0 ->> 'label' = '반복 유입' FROM res WHERE ip = '100.64.1.10'), 'R1 label is Korean');
SELECT is((SELECT score FROM res WHERE ip = '100.64.2.20'), 0, 'phone conversion: -100 → 0');
SELECT ok(NOT EXISTS (SELECT 1 FROM res WHERE ip = '100.64.3.30'), 'whitelisted /24 excluded');
SELECT ok(NOT EXISTS (SELECT 1 FROM res WHERE ip = '100.64.4.40'), 'bot UA excluded');
SELECT is((SELECT clicks FROM res WHERE ip = '100.64.5.50'), 1, 'same NaPm x5: clicks = 1');
SELECT ok((SELECT NOT (reasons @> '[{"rule": "R1"}]') FROM res WHERE ip = '100.64.5.50'), 'same NaPm x5: no R1');
SELECT ok((SELECT reasons @> '[{"rule": "R4"}]' FROM res WHERE ip = '100.64.6.60'), 'KST night clicks: R4 reason');
SELECT is((SELECT score FROM res WHERE ip = '100.64.6.60'), 80, 'night: R1+R3+R4 = 80');

SET LOCAL ROLE authenticated;
SELECT ok(NOT EXISTS (SELECT 1 FROM cg_suspect_ips(24, 60) WHERE client_ip IN ('100.64.2.20', '100.64.5.50')),
  'default min score 60 hides converted / refresh IPs');

-- ---------- 3. 표시·화이트리스트 ----------
SELECT is((cg_mark_ip('100.64.1.10', 'naver_blocked', ' 검색광고센터 등록 ') ->> 'memo'), '검색광고센터 등록', 'mark saved (memo trimmed)');
SELECT is((SELECT mark_status FROM cg_suspect_ips(24, 60) WHERE client_ip = '100.64.1.10'), 'naver_blocked', 'mark shown in list');
SELECT ok((cg_ip_detail('100.64.1.10') -> 'mark' ->> 'marked_by_name') = '테스트관리자'
          AND jsonb_array_length(cg_ip_detail('100.64.1.10') -> 'visits') = 4, 'detail: timeline + mark with handler name');
SELECT cg_mark_ip('100.64.1.10', NULL, NULL);  -- 표시 해제 (다음 문장에서 확인: STABLE 함수는 같은 문장의 변경을 보지 못한다)
SELECT ok((cg_ip_detail('100.64.1.10') -> 'mark') = 'null'::jsonb, 'p_status NULL removes the mark');
SELECT throws_ok($$ SELECT cg_whitelist_upsert('10.0.0.0/8', NULL) $$, 'P0001',
  '너무 넓은 대역입니다. IPv4는 /16, IPv6는 /32 이상으로 입력해 주세요.', 'too-wide whitelist rejected');
SELECT lives_ok($$ SELECT cg_whitelist_delete(cg_whitelist_upsert('100.64.1.10/32', '사무실')) $$,
  'whitelist add then delete');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
