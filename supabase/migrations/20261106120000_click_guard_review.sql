-- =============================================================
-- Click Guard MVP 2/2 — ERP 의심 IP 조회·표시 (docs/click-guard/SPEC.md)
--
-- 조회·표시·화이트리스트 RPC. 모두 ADMIN 전용(get_my_role() = 'ADMIN', 함수 내부 검사).
-- 함수 권한은 R10/KI-8 패턴(SPEC "함수 권한" — 2026-11-06 Brad 결정): EXECUTE는 hint_roles에 두고 함수 안에서 거부한다.
-- 탐지 임계값은 함수 안 상수다(설정화는 후속). 기존 객체는 수정하지 않는다.
-- Adds: functions public.cg_suspect_ips, public.cg_ad_summary, public.cg_ip_detail, public.cg_mark_ip,
--       public.cg_whitelist_upsert, public.cg_whitelist_delete
-- Rollback SQL: supabase/test-fixtures/click-guard/rollback-review.sql
-- =============================================================

-- ---------- 1. 의심 IP 목록 ----------
-- 집계 대상: 창(p_hours) 안의 광고 방문, 봇 제외, 화이트리스트 대역 제외. 클릭 수 = distinct click_key.
-- 저참여 = 세션 체류 5초 미만이고 상호작용 0 (참여도 행이 없으면 저참여로 본다).
-- 전환 = 전화(phone)·카카오톡(kakao)·접수 완료(form_submit). 접수 섹션 이동 버튼(contact)은 전환으로 세지 않는다.
CREATE FUNCTION public.cg_suspect_ips(p_hours integer DEFAULT 24, p_min_score integer DEFAULT 60)
RETURNS TABLE (
  client_ip          inet,
  ip_prefix          cidr,
  score              integer,
  reasons            jsonb,
  clicks             integer,
  visits             integer,
  first_seen         timestamptz,
  last_seen          timestamptz,
  avg_dwell_ms       integer,
  total_interactions integer,
  conversions        integer,
  mobile_ratio       numeric,
  top_queries        text[],
  mark_status        text,
  mark_memo          text
)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  c_r1_clicks      constant integer  := 3;    -- R1 반복 유입: 클릭 3회 이상 → +40
  c_r2_gap         constant interval := interval '10 minutes'; -- R2 연속 클릭: 클릭 간격 10분 이하 1회 이상 → +30
  c_r3_sessions    constant integer  := 2;    -- R3 무관심: 저참여 세션 2개 이상 → +30
  c_r4_clicks      constant integer  := 2;    -- R4 심야: KST 00–06시 클릭 2회 이상 → +10
  c_r5_low_clicks  constant integer  := 6;    -- R5 대역 집중: 같은 대역 저참여 클릭 6회 이상 → +10 (정보용)
  c_low_dwell_ms   constant integer  := 5000;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '부정클릭 감시는 관리자만 이용할 수 있습니다.';
  END IF;
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 2160 THEN
    RAISE EXCEPTION '조회 기간이 올바르지 않습니다.';
  END IF;

  RETURN QUERY
  WITH v AS (
    SELECT a.*, network(set_masklen(a.client_ip, CASE WHEN family(a.client_ip) = 4 THEN 24 ELSE 64 END)) AS pfx
      FROM cg_ad_visits a
     WHERE a.created_at >= now() - make_interval(hours => p_hours)
       AND NOT a.is_bot
       AND a.client_ip IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM cg_whitelist w WHERE w.cidr >>= a.client_ip)
  ),
  ses AS (
    SELECT e.session_id, e.dwell_ms, e.interactions,
           COALESCE((e.conversions ->> 'phone')::integer, 0)
             + COALESCE((e.conversions ->> 'kakao')::integer, 0)
             + COALESCE((e.conversions ->> 'form_submit')::integer, 0) AS conv,
           (e.dwell_ms < c_low_dwell_ms AND e.interactions = 0) AS low
      FROM cg_engagement e
     WHERE e.session_id IN (SELECT DISTINCT session_id FROM v)
  ),
  -- 클릭(click_key) 단위: 최초 시각, 저참여 여부
  k AS (
    SELECT v.client_ip, v.pfx, v.click_key, min(v.created_at) AS t, bool_or(COALESCE(s.low, true)) AS low
      FROM v LEFT JOIN ses s ON s.session_id = v.session_id
     GROUP BY v.client_ip, v.pfx, v.click_key
  ),
  kc AS (
    SELECT k.client_ip, k.pfx,
           count(*)::integer AS clicks,
           count(*) FILTER (WHERE extract(hour FROM k.t AT TIME ZONE 'Asia/Seoul') < 6)::integer AS night
      FROM k GROUP BY k.client_ip, k.pfx
  ),
  gaps AS (
    SELECT g.client_ip, count(*) FILTER (WHERE g.gap <= c_r2_gap)::integer AS short_gaps
      FROM (SELECT k.client_ip, k.t - lag(k.t) OVER (PARTITION BY k.client_ip ORDER BY k.t) AS gap FROM k) g
     GROUP BY g.client_ip
  ),
  pc AS (
    SELECT k.pfx, count(*) FILTER (WHERE k.low)::integer AS low_clicks FROM k GROUP BY k.pfx
  ),
  vi AS (
    SELECT v.client_ip, count(*)::integer AS visits, min(v.created_at) AS first_seen, max(v.created_at) AS last_seen,
           round((count(*) FILTER (WHERE v.device_type = 'mobile'))::numeric / count(*), 2) AS mobile_ratio
      FROM v GROUP BY v.client_ip
  ),
  sc AS (
    SELECT x.client_ip,
           count(*) FILTER (WHERE s.low)::integer AS low_sessions,
           round(avg(s.dwell_ms))::integer AS avg_dwell_ms,
           sum(s.interactions)::integer AS total_interactions,
           sum(s.conv)::integer AS conversions
      FROM (SELECT DISTINCT v.client_ip, v.session_id FROM v) x
      JOIN ses s ON s.session_id = x.session_id
     GROUP BY x.client_ip
  ),
  tq AS (
    SELECT q.client_ip, (array_agg(q.n_query ORDER BY q.cnt DESC, q.n_query))[1:3] AS top_queries
      FROM (SELECT v.client_ip, v.n_query, count(DISTINCT v.click_key) AS cnt
              FROM v WHERE NULLIF(btrim(v.n_query), '') IS NOT NULL
             GROUP BY v.client_ip, v.n_query) q
     GROUP BY q.client_ip
  ),
  base AS (
    SELECT kc.client_ip, kc.pfx, kc.clicks, kc.night, COALESCE(gaps.short_gaps, 0) AS short_gaps,
           COALESCE(sc.low_sessions, 0) AS low_sessions, COALESCE(pc.low_clicks, 0) AS prefix_low_clicks,
           COALESCE(sc.conversions, 0) AS conversions, sc.avg_dwell_ms, COALESCE(sc.total_interactions, 0) AS total_interactions,
           vi.visits, vi.first_seen, vi.last_seen, vi.mobile_ratio, COALESCE(tq.top_queries, '{}') AS top_queries
      FROM kc
      JOIN vi ON vi.client_ip = kc.client_ip
      LEFT JOIN gaps ON gaps.client_ip = kc.client_ip
      LEFT JOIN sc ON sc.client_ip = kc.client_ip
      LEFT JOIN pc ON pc.pfx = kc.pfx
      LEFT JOIN tq ON tq.client_ip = kc.client_ip
  ),
  rules AS (
    SELECT b.*,
           array_remove(ARRAY[
             CASE WHEN b.clicks >= c_r1_clicks THEN
               jsonb_build_object('rule', 'R1', 'label', '반복 유입', 'value', b.clicks, 'points', 40) END,
             CASE WHEN b.short_gaps >= 1 THEN
               jsonb_build_object('rule', 'R2', 'label', '10분 내 연속 클릭', 'value', b.short_gaps, 'points', 30) END,
             CASE WHEN b.low_sessions >= c_r3_sessions THEN
               jsonb_build_object('rule', 'R3', 'label', '짧은 체류·무반응', 'value', b.low_sessions, 'points', 30) END,
             CASE WHEN b.night >= c_r4_clicks THEN
               jsonb_build_object('rule', 'R4', 'label', '심야 클릭', 'value', b.night, 'points', 10) END,
             CASE WHEN b.prefix_low_clicks >= c_r5_low_clicks THEN
               jsonb_build_object('rule', 'R5', 'label', '같은 대역 집중(참고)', 'value', b.prefix_low_clicks, 'points', 10) END,
             CASE WHEN b.conversions >= 1 THEN
               jsonb_build_object('rule', 'CONV', 'label', '전환 있음', 'value', b.conversions, 'points', -100) END
           ], NULL) AS hits
      FROM base b
  )
  SELECT r.client_ip,
         r.pfx::cidr,
         COALESCE((SELECT sum((h ->> 'points')::integer) FROM unnest(r.hits) h), 0)::integer AS score,
         to_jsonb(r.hits),
         r.clicks, r.visits, r.first_seen, r.last_seen, r.avg_dwell_ms, r.total_interactions, r.conversions,
         r.mobile_ratio, r.top_queries,
         m.status, m.memo
    FROM rules r
    LEFT JOIN cg_ip_marks m ON m.client_ip = r.client_ip
   WHERE COALESCE((SELECT sum((h ->> 'points')::integer) FROM unnest(r.hits) h), 0) >= COALESCE(p_min_score, 60)
   ORDER BY 3 DESC, r.last_seen DESC;
END;
$$;

COMMENT ON FUNCTION public.cg_suspect_ips(integer, integer) IS
  'Click Guard: 창 안 광고 방문을 IP별로 점수화 (R1~R5, 전환 감점). 봇·화이트리스트 제외, 클릭=distinct click_key. ADMIN 전용(R10)';

-- ---------- 2. 요약 ----------
CREATE FUNCTION public.cg_ad_summary(p_hours integer DEFAULT 24) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '부정클릭 감시는 관리자만 이용할 수 있습니다.';
  END IF;
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 2160 THEN
    RAISE EXCEPTION '조회 기간이 올바르지 않습니다.';
  END IF;

  SELECT jsonb_build_object(
           'visits', count(*),
           'clicks', count(DISTINCT click_key),
           'ips', count(DISTINCT client_ip))
    INTO v_result
    FROM cg_ad_visits
   WHERE created_at >= now() - make_interval(hours => p_hours) AND NOT is_bot;

  RETURN v_result || jsonb_build_object(
    'last_collected_at', (SELECT max(created_at) FROM cg_ad_visits),
    'naver_blocked', (SELECT count(*) FROM cg_ip_marks WHERE status = 'naver_blocked'));
END;
$$;

COMMENT ON FUNCTION public.cg_ad_summary(integer) IS
  'Click Guard: 창 안 광고 방문·클릭·고유 IP(봇 제외), 마지막 수집 시각(전체), 네이버 등록 표시 수. ADMIN 전용(R10)';

-- ---------- 3. IP 상세 ----------
CREATE FUNCTION public.cg_ip_detail(p_ip inet, p_days integer DEFAULT 30) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_prefix cidr;
  v_since  timestamptz;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '부정클릭 감시는 관리자만 이용할 수 있습니다.';
  END IF;
  IF p_ip IS NULL THEN
    RAISE EXCEPTION 'IP가 없습니다.';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 90 THEN
    RAISE EXCEPTION '조회 기간이 올바르지 않습니다.';
  END IF;

  v_prefix := network(set_masklen(p_ip, CASE WHEN family(p_ip) = 4 THEN 24 ELSE 64 END));
  v_since := now() - make_interval(days => p_days);

  RETURN jsonb_build_object(
    'ip', host(p_ip),
    'ip_prefix', v_prefix::text,
    'whitelisted', EXISTS (SELECT 1 FROM cg_whitelist w WHERE w.cidr >>= p_ip),
    'visits', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.created_at DESC)
        FROM (SELECT a.created_at, a.session_id, a.click_key, a.n_query, a.n_keyword, a.n_rank, a.device_type,
                     a.path, a.is_bot, e.dwell_ms, e.max_scroll_pct, e.interactions, e.pageviews, e.conversions
                FROM cg_ad_visits a
                LEFT JOIN cg_engagement e ON e.session_id = a.session_id
               WHERE a.client_ip = p_ip AND a.created_at >= v_since
               ORDER BY a.created_at DESC
               LIMIT 300) t), '[]'::jsonb),
    'prefix_clicks', (SELECT count(DISTINCT click_key) FROM cg_ad_visits
                       WHERE ip_prefix = v_prefix AND created_at >= v_since AND NOT is_bot),
    'prefix_ips', (SELECT count(DISTINCT client_ip) FROM cg_ad_visits
                    WHERE ip_prefix = v_prefix AND created_at >= v_since AND NOT is_bot),
    'mark', (SELECT jsonb_build_object('status', m.status, 'memo', m.memo, 'marked_at', m.marked_at,
                                       'updated_at', m.updated_at, 'marked_by_name', emp.name)
               FROM cg_ip_marks m LEFT JOIN employees emp ON emp.id = m.marked_by
              WHERE m.client_ip = p_ip));
END;
$$;

COMMENT ON FUNCTION public.cg_ip_detail(inet, integer) IS
  'Click Guard: IP 방문 타임라인(참여도 포함, 최근 300건), 같은 /24·/64 대역 클릭 수, 표시 정보. ADMIN 전용(R10)';

-- ---------- 4. IP 표시 (사람이 기록) ----------
CREATE FUNCTION public.cg_mark_ip(p_ip inet, p_status text, p_memo text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_memo text := NULLIF(btrim(p_memo), '');
  v_row  cg_ip_marks;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '부정클릭 감시는 관리자만 이용할 수 있습니다.';
  END IF;
  IF p_ip IS NULL THEN
    RAISE EXCEPTION 'IP가 없습니다.';
  END IF;
  IF p_status IS NULL THEN
    DELETE FROM cg_ip_marks WHERE client_ip = p_ip;
    RETURN NULL;
  END IF;
  IF p_status NOT IN ('naver_blocked', 'normal', 'watch') THEN
    RAISE EXCEPTION '표시 상태가 올바르지 않습니다.';
  END IF;
  IF char_length(v_memo) > 500 THEN
    RAISE EXCEPTION '메모는 500자 이내로 입력해 주세요.';
  END IF;

  INSERT INTO cg_ip_marks AS m (client_ip, status, memo, marked_by, marked_at, updated_at)
  VALUES (p_ip, p_status, v_memo, auth.uid(), now(), now())
  ON CONFLICT (client_ip) DO UPDATE
    SET status = EXCLUDED.status, memo = EXCLUDED.memo, marked_by = EXCLUDED.marked_by,
        marked_at = now(), updated_at = now()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION public.cg_mark_ip(inet, text, text) IS
  'Click Guard: IP 표시(naver_blocked/watch/normal) upsert, p_status=NULL이면 표시 삭제. marked_by=auth.uid(). ADMIN 전용(R10)';

-- ---------- 5. 화이트리스트 ----------
-- 넓은 대역(IPv4 /16, IPv6 /32보다 넓음)은 거부: 실수로 넣으면 전체가 집계에서 빠진다.
CREATE FUNCTION public.cg_whitelist_upsert(p_cidr cidr, p_reason text DEFAULT NULL) RETURNS bigint
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_reason text := NULLIF(btrim(p_reason), '');
  v_id     bigint;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '부정클릭 감시는 관리자만 이용할 수 있습니다.';
  END IF;
  IF p_cidr IS NULL THEN
    RAISE EXCEPTION 'IP 또는 대역을 입력해 주세요.';
  END IF;
  IF (masklen(p_cidr) < CASE WHEN family(p_cidr) = 4 THEN 16 ELSE 32 END) THEN
    RAISE EXCEPTION '너무 넓은 대역입니다. IPv4는 /16, IPv6는 /32 이상으로 입력해 주세요.';
  END IF;
  IF char_length(v_reason) > 200 THEN
    RAISE EXCEPTION '사유는 200자 이내로 입력해 주세요.';
  END IF;

  INSERT INTO cg_whitelist AS w (cidr, reason, created_by)
  VALUES (p_cidr, v_reason, auth.uid())
  ON CONFLICT (cidr) DO UPDATE SET reason = EXCLUDED.reason
  RETURNING w.id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.cg_whitelist_upsert(cidr, text) IS
  'Click Guard: 화이트리스트 대역 추가(같은 대역이면 사유만 갱신). IPv4 /16·IPv6 /32보다 넓은 대역 거부. ADMIN 전용(R10)';

CREATE FUNCTION public.cg_whitelist_delete(p_id bigint) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '부정클릭 감시는 관리자만 이용할 수 있습니다.';
  END IF;
  DELETE FROM cg_whitelist WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '이미 삭제된 항목입니다.';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.cg_whitelist_delete(bigint) IS 'Click Guard: 화이트리스트 항목 삭제. ADMIN 전용(R10)';

-- ---------- 6. function privileges (R10: exposed schema → hint roles get EXECUTE, refusal inside) ----------
REVOKE ALL ON FUNCTION public.cg_suspect_ips(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cg_suspect_ips(integer, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cg_ad_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cg_ad_summary(integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cg_ip_detail(inet, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cg_ip_detail(inet, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cg_mark_ip(inet, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cg_mark_ip(inet, text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cg_whitelist_upsert(cidr, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cg_whitelist_upsert(cidr, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cg_whitelist_delete(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cg_whitelist_delete(bigint) TO anon, authenticated, service_role;
