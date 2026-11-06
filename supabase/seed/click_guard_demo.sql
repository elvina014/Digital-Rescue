-- =============================================================
-- Click Guard 데모 시드 — 로컬 전용 (운영 DB에 절대 실행하지 말 것)
--
-- 실행: docker exec -i supabase_db_digital-rescue psql -U postgres < supabase/seed/click_guard_demo.sql
-- 여러 번 실행해도 된다(데모 IP 대역의 기존 데모 행을 먼저 지운다). config.toml 의 db.seed 에는 넣지 않았다.
-- 안전장치: 로컬 시드 계정(admin@example.test)이 없으면 아무것도 하지 않고 중단한다.
--
-- 케이스 (문서용 IP 대역 RFC 5737, 대역이 서로 달라 R5가 섞이지 않게 배치):
--   A 203.0.113.10  반복·짧은 체류 (4클릭, 5분 간격, 모두 무반응, 모바일)  → 노출 (R1+R2+R3 = 100)
--   B 198.51.100.20 A와 같은 패턴 + 마지막 세션 전화 전환               → 제외 (-100)
--   C 192.0.2.30    A와 같은 패턴 + 화이트리스트 192.0.2.30/32           → 제외
--   D 203.0.113.40  A와 같은 패턴 + 봇 UA                                → 제외
--   E 198.51.100.50 같은 NaPm으로 새로고침 5회 (같은 세션)               → 클릭 1 → R1 미해당
--   F 192.0.2.60    KST 심야(00–06시) 3클릭, 12분 간격, 무반응            → 노출 (R1+R3+R4 = 80, R4 사유)
-- =============================================================
DO $$
DECLARE
  v_night  timestamptz;
  v_kst    timestamp := now() AT TIME ZONE 'Asia/Seoul';
  v_sid    uuid;
  i        integer;
  r        record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@example.test') THEN
    RAISE EXCEPTION '로컬 시드 계정이 없습니다. 로컬 DB에서만 실행하세요.';
  END IF;

  -- 이전 데모 정리
  DELETE FROM cg_engagement WHERE session_id IN (
    SELECT session_id FROM cg_ad_visits
     WHERE client_ip << '203.0.113.0/24' OR client_ip << '198.51.100.0/24' OR client_ip << '192.0.2.0/24');
  DELETE FROM cg_ad_visits
   WHERE client_ip << '203.0.113.0/24' OR client_ip << '198.51.100.0/24' OR client_ip << '192.0.2.0/24';
  DELETE FROM cg_ip_marks
   WHERE client_ip << '203.0.113.0/24' OR client_ip << '198.51.100.0/24' OR client_ip << '192.0.2.0/24';
  DELETE FROM cg_whitelist
   WHERE cidr <<= '203.0.113.0/24' OR cidr <<= '198.51.100.0/24' OR cidr <<= '192.0.2.0/24';

  -- A·B·C·D: 4클릭, 5분 간격, 클릭마다 새 세션, 체류 1~2초·무반응
  FOR r IN SELECT * FROM (VALUES
      ('203.0.113.10'::inet, false, 'mobile', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148'),
      ('198.51.100.20'::inet, false, 'desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0'),
      ('192.0.2.30'::inet, false, 'desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0'),
      ('203.0.113.40'::inet, true, 'desktop', 'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)')
    ) t(ip, bot, device, ua)
  LOOP
    FOR i IN 1..4 LOOP
      v_sid := gen_random_uuid();
      INSERT INTO cg_ad_visits (created_at, session_id, click_key, client_ip, ip_version, ip_prefix, raw_ip_headers,
                                user_agent, is_bot, device_type, host, path, n_media, n_query, n_rank, n_ad,
                                n_keyword, n_campaign_type, napm, country)
      VALUES (now() - interval '3 hours' + (i * interval '5 minutes'), v_sid,
              'ct=demo-' || host(r.ip) || '-' || i, r.ip, 4, network(set_masklen(r.ip, 24)),
              jsonb_build_object('x-real-ip', host(r.ip)), r.ua, r.bot, r.device, 'localhost', '/',
              '27758', CASE WHEN i = 4 THEN '맥북수리' ELSE '노트북수리' END, i, 'nad-demo',
              '노트북수리', '1', 'ct=demo-' || host(r.ip) || '-' || i, 'KR');
      INSERT INTO cg_engagement (session_id, dwell_ms, max_scroll_pct, interactions, pageviews, conversions)
      VALUES (v_sid, 1000 + i * 100, 10, 0, 1, '{}');
      -- B: 마지막 세션은 전화 전환이 있는 정상 고객
      IF r.ip = '198.51.100.20'::inet AND i = 4 THEN
        UPDATE cg_engagement SET dwell_ms = 45000, max_scroll_pct = 80, interactions = 6,
                                 conversions = '{"phone": 1}' WHERE session_id = v_sid;
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO cg_whitelist (cidr, reason) VALUES ('192.0.2.30/32', '데모: 사무실 IP');

  -- E: 같은 NaPm 으로 새로고침 5회 (같은 세션)
  v_sid := gen_random_uuid();
  FOR i IN 1..5 LOOP
    INSERT INTO cg_ad_visits (created_at, session_id, click_key, client_ip, ip_version, ip_prefix, raw_ip_headers,
                              user_agent, is_bot, device_type, host, path, n_query, n_ad, napm, country)
    VALUES (now() - interval '2 hours' + (i * interval '1 minute'), v_sid, 'ct=demo-refresh', '198.51.100.50', 4,
            '198.51.100.0/24', '{"x-real-ip": "198.51.100.50"}', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0',
            false, 'desktop', 'localhost', '/', '데이터복구', 'nad-demo', 'ct=demo-refresh', 'KR');
  END LOOP;
  INSERT INTO cg_engagement (session_id, dwell_ms, interactions, pageviews) VALUES (v_sid, 1500, 0, 5);

  -- F: KST 심야 3클릭 (최근 24시간 안에 들어오도록 시각 계산)
  IF v_kst::time >= time '00:30' AND v_kst::time < time '06:00' THEN
    v_night := (v_kst - interval '30 minutes') AT TIME ZONE 'Asia/Seoul';
  ELSIF v_kst::time < time '00:30' THEN
    v_night := (date_trunc('day', v_kst) - interval '1 day' + interval '5 hours 30 minutes') AT TIME ZONE 'Asia/Seoul';
  ELSE
    v_night := (date_trunc('day', v_kst) + interval '5 hours 30 minutes') AT TIME ZONE 'Asia/Seoul';
  END IF;
  FOR i IN 0..2 LOOP
    v_sid := gen_random_uuid();
    INSERT INTO cg_ad_visits (created_at, session_id, click_key, client_ip, ip_version, ip_prefix, raw_ip_headers,
                              user_agent, is_bot, device_type, host, path, n_query, n_ad, napm, country)
    VALUES (v_night + (i * interval '12 minutes'), v_sid, 'ct=demo-night-' || i, '192.0.2.60', 4, '192.0.2.0/24',
            '{"x-real-ip": "192.0.2.60"}', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0', false, 'desktop',
            'localhost', '/samsung', '삼성노트북수리', 'nad-demo', 'ct=demo-night-' || i, 'KR');
    INSERT INTO cg_engagement (session_id, dwell_ms, interactions, pageviews) VALUES (v_sid, 800, 0, 1);
  END LOOP;

  RAISE NOTICE 'Click Guard 데모 시드 완료 (심야 클릭 시작: %)', v_night;
END;
$$;
