-- =============================================================
-- Click Guard MVP — 네이버 광고 유입 기록 (docs/click-guard/SPEC.md "MVP SPEC")
--
-- 수집은 서버(service_role)만 한다: src/proxy.ts → cg_record_visit, /api/cg/beacon·/api/cta → cg_record_engagement.
-- 조회는 ERP ADMIN만 (get_my_role() = 'ADMIN'). 쓰기 정책은 없다.
-- 함수 권한은 R10/KI-8 패턴: EXECUTE는 hint_roles에 그대로 두고 함수 안에서 service_role이 아니면 거부한다
-- (2026-11-06 Brad 결정 — anon/authenticated에서 EXECUTE를 빼면 supautils 버그로 Postgres가 재시작된다).
-- 기존 객체는 수정하지 않는다.
-- Adds: tables public.cg_ad_visits, public.cg_engagement, public.cg_whitelist, public.cg_ip_marks
--       functions public.cg_record_visit, public.cg_record_engagement, public.cg_purge_old
-- Rollback SQL: supabase/test-fixtures/click-guard/rollback.sql
-- =============================================================

-- ---------- 1. 광고 유입 원본 기록 (새로고침 포함 전부 저장, 집계는 distinct click_key) ----------
CREATE TABLE public.cg_ad_visits (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- cg_sid 쿠키 (광고 유입 시 서버가 발급, 30분)
  session_id      uuid NOT NULL,
  -- NaPm 원문, 없으면 session_id + n_ad + 10분 버킷
  click_key       text NOT NULL CHECK (char_length(click_key) BETWEEN 1 AND 1000),
  client_ip       inet,
  ip_version      smallint CHECK (ip_version IN (4, 6)),
  -- v4 /24, v6 /64
  ip_prefix       cidr,
  -- x-real-ip, x-forwarded-for, cf-connecting-ip 원문
  raw_ip_headers  jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent      text,
  is_bot          boolean NOT NULL DEFAULT false,
  device_type     text CHECK (device_type IN ('mobile', 'tablet', 'desktop')),
  host            text,
  path            text,
  n_media         text,
  n_query         text,
  n_rank          integer,
  n_ad_group      text,
  n_ad            text,
  n_keyword_id    text,
  n_keyword       text,
  n_campaign_type text,
  n_match         text,
  napm            text,
  referer         text,
  -- Vercel x-vercel-ip-country
  country         text
);

CREATE INDEX cg_ad_visits_client_ip_idx  ON public.cg_ad_visits (client_ip, created_at DESC);
CREATE INDEX cg_ad_visits_ip_prefix_idx  ON public.cg_ad_visits (ip_prefix, created_at DESC);
CREATE INDEX cg_ad_visits_session_id_idx ON public.cg_ad_visits (session_id);
CREATE INDEX cg_ad_visits_created_at_idx ON public.cg_ad_visits (created_at);
CREATE INDEX cg_ad_visits_click_key_idx  ON public.cg_ad_visits (click_key);

-- ---------- 2. 세션 참여도 (값은 GREATEST로만 증가) ----------
CREATE TABLE public.cg_engagement (
  session_id     uuid PRIMARY KEY,
  first_seen     timestamptz NOT NULL DEFAULT now(),
  last_seen      timestamptz NOT NULL DEFAULT now(),
  dwell_ms       integer NOT NULL DEFAULT 0 CHECK (dwell_ms BETWEEN 0 AND 86400000),
  max_scroll_pct smallint NOT NULL DEFAULT 0 CHECK (max_scroll_pct BETWEEN 0 AND 100),
  interactions   integer NOT NULL DEFAULT 0 CHECK (interactions >= 0),
  pageviews      integer NOT NULL DEFAULT 0 CHECK (pageviews >= 0),
  -- 기존 CTA 명칭별 횟수: {"phone":1,"kakao":0,...}
  conversions    jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---------- 3. 화이트리스트 (사무실·직원 IP 등) ----------
CREATE TABLE public.cg_whitelist (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cidr       cidr NOT NULL UNIQUE,
  reason     text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- 4. IP 표시 (사람이 네이버 차단 여부 등을 기록) ----------
CREATE TABLE public.cg_ip_marks (
  client_ip  inet PRIMARY KEY,
  status     text NOT NULL CHECK (status IN ('naver_blocked', 'normal', 'watch')),
  memo       text,
  marked_by  uuid,
  marked_at  timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- 5. RLS: SELECT는 ADMIN만, 쓰기 정책 없음 ----------
ALTER TABLE public.cg_ad_visits  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cg_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cg_whitelist  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cg_ip_marks   ENABLE ROW LEVEL SECURITY;

CREATE POLICY cg_ad_visits_select ON public.cg_ad_visits FOR SELECT TO authenticated
  USING (public.get_my_role() = 'ADMIN'::public.employee_role);
CREATE POLICY cg_engagement_select ON public.cg_engagement FOR SELECT TO authenticated
  USING (public.get_my_role() = 'ADMIN'::public.employee_role);
CREATE POLICY cg_whitelist_select ON public.cg_whitelist FOR SELECT TO authenticated
  USING (public.get_my_role() = 'ADMIN'::public.employee_role);
CREATE POLICY cg_ip_marks_select ON public.cg_ip_marks FOR SELECT TO authenticated
  USING (public.get_my_role() = 'ADMIN'::public.employee_role);

-- 테이블 권한 오류(42501)는 KI-8 크래시와 무관하다 (함수 권한 오류만 해당)
REVOKE ALL ON public.cg_ad_visits, public.cg_engagement, public.cg_whitelist, public.cg_ip_marks FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.cg_ad_visits, public.cg_engagement, public.cg_whitelist, public.cg_ip_marks FROM authenticated;

-- ---------- 6. 광고 유입 1건 기록 ----------
-- payload 키: session_id, click_key, client_ip, ip_version, ip_prefix, raw_ip_headers, user_agent, is_bot,
--             device_type, host, path, n_media, n_query, n_rank, n_ad_group, n_ad, n_keyword_id, n_keyword,
--             n_campaign_type, n_match, napm, referer, country
CREATE FUNCTION public.cg_record_visit(payload jsonb) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_session uuid;
  v_click   text := left(NULLIF(btrim(payload ->> 'click_key'), ''), 1000);
  v_ip      inet;
  v_prefix  cidr;
  v_version smallint;
  v_rank    integer;
  v_headers jsonb;
  v_device  text := payload ->> 'device_type';
BEGIN
  -- IS DISTINCT FROM: 직접 접속(postgres 등)은 auth.role()이 NULL이라 <> 로는 거부되지 않는다
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Click Guard 수집 함수는 서버에서만 호출할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION '수집 데이터 형식이 올바르지 않습니다.';
  END IF;
  BEGIN
    v_session := (payload ->> 'session_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_session := NULL;
  END;
  IF v_session IS NULL THEN
    RAISE EXCEPTION '세션 ID가 올바르지 않습니다.';
  END IF;
  IF v_click IS NULL THEN
    RAISE EXCEPTION '클릭 키가 없습니다.';
  END IF;

  -- 형식이 틀린 IP·대역은 버리고 나머지는 저장한다
  BEGIN
    v_ip := (payload ->> 'client_ip')::inet;
  EXCEPTION WHEN invalid_text_representation THEN
    v_ip := NULL;
  END;
  BEGIN
    v_prefix := (payload ->> 'ip_prefix')::cidr;
  EXCEPTION WHEN invalid_text_representation OR invalid_binary_representation THEN
    v_prefix := NULL;
  END;
  v_version := CASE WHEN v_ip IS NULL THEN NULL ELSE family(v_ip)::smallint END;
  IF (payload ->> 'n_rank') ~ '^[0-9]{1,6}$' THEN
    v_rank := (payload ->> 'n_rank')::integer;
  END IF;
  v_headers := CASE WHEN jsonb_typeof(payload -> 'raw_ip_headers') = 'object'
                    THEN payload -> 'raw_ip_headers' ELSE '{}'::jsonb END;
  IF v_device IS NOT NULL AND v_device NOT IN ('mobile', 'tablet', 'desktop') THEN
    v_device := NULL;
  END IF;

  INSERT INTO cg_ad_visits (
    session_id, click_key, client_ip, ip_version, ip_prefix, raw_ip_headers, user_agent, is_bot, device_type,
    host, path, n_media, n_query, n_rank, n_ad_group, n_ad, n_keyword_id, n_keyword, n_campaign_type, n_match,
    napm, referer, country)
  VALUES (
    v_session, v_click, v_ip, v_version, v_prefix, v_headers,
    left(payload ->> 'user_agent', 500),
    COALESCE((payload ->> 'is_bot')::boolean, false),
    v_device,
    left(payload ->> 'host', 200),
    left(payload ->> 'path', 500),
    left(payload ->> 'n_media', 200),
    left(payload ->> 'n_query', 200),
    v_rank,
    left(payload ->> 'n_ad_group', 200),
    left(payload ->> 'n_ad', 200),
    left(payload ->> 'n_keyword_id', 200),
    left(payload ->> 'n_keyword', 200),
    left(payload ->> 'n_campaign_type', 50),
    left(payload ->> 'n_match', 50),
    left(payload ->> 'napm', 1000),
    left(payload ->> 'referer', 500),
    left(payload ->> 'country', 10));

  INSERT INTO cg_engagement (session_id) VALUES (v_session)
  ON CONFLICT (session_id) DO UPDATE SET last_seen = now();

  RETURN v_session;
END;
$$;

COMMENT ON FUNCTION public.cg_record_visit(jsonb) IS
  'Click Guard: 광고 유입 1건 기록 + 세션 참여도 행 생성. service_role 전용(함수 내부 검사, R10)';

-- ---------- 7. 세션 참여도 갱신 (비콘·전환) ----------
CREATE FUNCTION public.cg_record_engagement(
  p_session_id     uuid,
  p_dwell_ms       integer DEFAULT NULL,
  p_max_scroll_pct integer DEFAULT NULL,
  p_interactions   integer DEFAULT NULL,
  p_pageview       boolean DEFAULT false,
  p_conversion     text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Click Guard 수집 함수는 서버에서만 호출할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION '세션 ID가 없습니다.';
  END IF;
  IF p_dwell_ms IS NOT NULL AND (p_dwell_ms < 0 OR p_dwell_ms > 86400000) THEN
    RAISE EXCEPTION '체류 시간 값이 범위를 벗어났습니다.';
  END IF;
  IF p_max_scroll_pct IS NOT NULL AND (p_max_scroll_pct < 0 OR p_max_scroll_pct > 100) THEN
    RAISE EXCEPTION '스크롤 값이 범위를 벗어났습니다.';
  END IF;
  IF p_interactions IS NOT NULL AND (p_interactions < 0 OR p_interactions > 100000) THEN
    RAISE EXCEPTION '상호작용 값이 범위를 벗어났습니다.';
  END IF;
  -- 기존 CTA 명칭 (cta_click_events.event_type, src/lib/ctaTracking.ts CTA_EVENT_TYPES)
  IF p_conversion IS NOT NULL AND p_conversion NOT IN ('phone', 'kakao', 'contact', 'form_submit') THEN
    RAISE EXCEPTION '전환 종류가 올바르지 않습니다.';
  END IF;

  -- 광고 유입 기록이 없는 세션은 무시
  IF NOT EXISTS (SELECT 1 FROM cg_ad_visits WHERE session_id = p_session_id) THEN
    RETURN;
  END IF;

  INSERT INTO cg_engagement AS e (session_id, dwell_ms, max_scroll_pct, interactions, pageviews, conversions)
  VALUES (
    p_session_id,
    COALESCE(p_dwell_ms, 0),
    COALESCE(p_max_scroll_pct, 0),
    COALESCE(p_interactions, 0),
    CASE WHEN p_pageview THEN 1 ELSE 0 END,
    CASE WHEN p_conversion IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(p_conversion, 1) END)
  ON CONFLICT (session_id) DO UPDATE SET
    last_seen      = now(),
    dwell_ms       = GREATEST(e.dwell_ms, COALESCE(p_dwell_ms, 0)),
    max_scroll_pct = GREATEST(e.max_scroll_pct, COALESCE(p_max_scroll_pct, 0)),
    interactions   = GREATEST(e.interactions, COALESCE(p_interactions, 0)),
    pageviews      = e.pageviews + CASE WHEN p_pageview THEN 1 ELSE 0 END,
    conversions    = CASE WHEN p_conversion IS NULL THEN e.conversions
                          ELSE jsonb_set(e.conversions, ARRAY[p_conversion],
                                         to_jsonb(COALESCE((e.conversions ->> p_conversion)::integer, 0) + 1))
                     END;
END;
$$;

COMMENT ON FUNCTION public.cg_record_engagement(uuid, integer, integer, integer, boolean, text) IS
  'Click Guard: 세션 체류·스크롤·상호작용(GREATEST로만 증가)·페이지뷰·전환 횟수. 광고 유입이 없는 세션은 무시. service_role 전용(R10)';

-- ---------- 8. 보존 기간 경과 기록 삭제 (pg_cron: docs/click-guard/cron.sql) ----------
CREATE FUNCTION public.cg_purge_old(p_days integer DEFAULT 90) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_cutoff     timestamptz;
  v_visits     integer;
  v_engagement integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Click Guard 정리 함수는 서버에서만 호출할 수 있습니다.' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION '보존 일수는 1 이상이어야 합니다.';
  END IF;

  v_cutoff := now() - make_interval(days => p_days);
  DELETE FROM cg_ad_visits WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_visits = ROW_COUNT;
  DELETE FROM cg_engagement WHERE last_seen < v_cutoff;
  GET DIAGNOSTICS v_engagement = ROW_COUNT;

  RETURN jsonb_build_object('cutoff', v_cutoff, 'visits', v_visits, 'engagement', v_engagement);
END;
$$;

COMMENT ON FUNCTION public.cg_purge_old(integer) IS
  'Click Guard: p_days일 지난 광고 유입·참여도 기록 삭제 (whitelist·ip_marks는 유지). service_role 전용(R10)';

-- ---------- 9. function privileges (R10: exposed schema → hint roles get EXECUTE, refusal inside) ----------
REVOKE ALL ON FUNCTION public.cg_record_visit(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cg_record_visit(jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cg_record_engagement(uuid, integer, integer, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cg_record_engagement(uuid, integer, integer, integer, boolean, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cg_purge_old(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cg_purge_old(integer) TO anon, authenticated, service_role;
