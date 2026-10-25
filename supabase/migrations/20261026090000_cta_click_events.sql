-- =============================================================
-- 대고객 페이지 CTA 클릭 계측 — 랜딩 개편 Phase 0 (기준선 측정)
--
-- 전화 / 카카오톡 / 접수 버튼(#contact) 클릭과 접수폼 제출 성공을 1건씩 기록한다.
-- 쓰기는 /api/cta 라우트(service_role)만 한다. anon/authenticated 직접 INSERT 불가.
-- 조회는 ADMIN/MANAGER 만 (통계 화면과 동일 권한).
-- 일별 집계는 cta_daily_stats 뷰(security_invoker → 원본 테이블 RLS 그대로 적용).
-- Adds: public.cta_click_events, public.cta_daily_stats
-- Rollback SQL: supabase/test-fixtures/cta-click-events/rollback.sql
-- =============================================================

CREATE TABLE public.cta_click_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- phone: tel: 링크 / kakao: 카카오톡 채널 / contact: 접수 섹션 이동 버튼 / form_submit: 접수 완료
  event_type  text NOT NULL CHECK (event_type IN ('phone', 'kakao', 'contact', 'form_submit')),
  -- 클릭 위치: header, hero, brand_intro, process, footer, mobile_cta, contact_form 등
  location    text NOT NULL CHECK (char_length(location) BETWEEN 1 AND 40),
  page_path   text NOT NULL CHECK (char_length(page_path) BETWEEN 1 AND 200),
  -- 브랜드 랜딩이면 슬러그 (메인은 NULL)
  brand_slug  text CHECK (brand_slug IS NULL OR char_length(brand_slug) <= 40),
  device      text NOT NULL CHECK (device IN ('mobile', 'desktop')),
  -- 브라우저 탭 단위 익명 ID (sessionStorage). 순 방문자 수 근사용, 개인정보 아님
  session_id  text CHECK (session_id IS NULL OR char_length(session_id) <= 64),
  -- 첫 진입 시점의 유입 경로: utm_source, 없으면 naver_ad(NaPm/n_media) / google_ad(gclid)
  ad_source   text CHECK (ad_source IS NULL OR char_length(ad_source) <= 100),
  -- 광고 키워드: n_keyword / n_query / utm_term (Phase 1 광고-랜딩 매칭용)
  ad_keyword  text CHECK (ad_keyword IS NULL OR char_length(ad_keyword) <= 100),
  referrer_host text CHECK (referrer_host IS NULL OR char_length(referrer_host) <= 200)
);

CREATE INDEX cta_click_events_created_at_idx ON public.cta_click_events (created_at);

ALTER TABLE public.cta_click_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY cta_click_events_select ON public.cta_click_events FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('ADMIN'::public.employee_role, 'MANAGER'::public.employee_role));
REVOKE ALL ON public.cta_click_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cta_click_events FROM authenticated;

-- 한국시간 기준 일별 집계
CREATE VIEW public.cta_daily_stats
  WITH (security_invoker = true)
AS
SELECT
  (created_at AT TIME ZONE 'Asia/Seoul')::date AS day,
  count(*) FILTER (WHERE event_type = 'phone')       AS phone,
  count(*) FILTER (WHERE event_type = 'kakao')       AS kakao,
  count(*) FILTER (WHERE event_type = 'contact')     AS contact,
  count(*) FILTER (WHERE event_type = 'form_submit') AS form_submit,
  count(*) FILTER (WHERE device = 'mobile')          AS mobile,
  count(DISTINCT session_id)                         AS sessions
FROM public.cta_click_events
GROUP BY 1;

REVOKE ALL ON public.cta_daily_stats FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cta_daily_stats FROM authenticated;
