-- =============================================
-- 033_news_items.sql
-- IT 최신 뉴스 자동 수집/검수 게시 시스템
--
-- 흐름:
--   n8n(5일 주기) 이 RSS + OpenRouter(Claude) 로 생성한 초안을 status='draft' 로 적재.
--   Telegram 원탭 또는 CMS(/editor/news) 에서 status='published' 로 전환.
--   사이트(DigitalResourcesSection) 는 status='published' 만, news_date 내림차순으로 노출.
--
-- 설계 메모:
--   - 기존 page_contents 의 digitalResources 블롭(긴급대처·브랜드)은 손대지 않는다.
--     뉴스만 이 테이블로 분리해, n8n 의 INSERT 와 CMS 편집이 서로 간섭하지 않게 한다.
--   - source_url UNIQUE 로 동일 기사 재수집을 차단(n8n 중복 필터의 안전망).
-- =============================================


-- =============================================
-- 1. 테이블
-- =============================================

CREATE TABLE public.news_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  news_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  source       TEXT        NOT NULL DEFAULT '',
  source_url   TEXT        UNIQUE,
  summary      TEXT        NOT NULL DEFAULT '',
  body         TEXT        NOT NULL DEFAULT '',
  status       TEXT        NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'published', 'archived')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  updated_by   UUID        REFERENCES public.employees(id) ON DELETE SET NULL
);

COMMENT ON TABLE  public.news_items            IS 'IT 최신 뉴스 항목. n8n 이 draft 로 적재, CMS/Telegram 에서 published 로 게시.';
COMMENT ON COLUMN public.news_items.news_date  IS '기사 노출 기준일 (목록 정렬/표시에 사용)';
COMMENT ON COLUMN public.news_items.source     IS '출처 매체명 (예: ZDNet Korea)';
COMMENT ON COLUMN public.news_items.source_url IS '원문 URL — 중복 수집 차단용 UNIQUE 키';
COMMENT ON COLUMN public.news_items.status     IS 'draft(검수 대기) | published(공개) | archived(폐기/보관)';
COMMENT ON COLUMN public.news_items.updated_by IS '마지막으로 편집/게시한 직원 (감사 로그)';

-- 공개 목록 조회( status='published' ORDER BY news_date DESC )에 최적화
CREATE INDEX news_items_status_date_idx ON public.news_items (status, news_date DESC);


-- =============================================
-- 2. updated_at 자동 갱신 트리거
-- =============================================

CREATE OR REPLACE FUNCTION public.news_items_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_news_items_updated_at
  BEFORE UPDATE ON public.news_items
  FOR EACH ROW
  EXECUTE FUNCTION public.news_items_set_updated_at();


-- =============================================
-- 3. Row Level Security
--   - 읽기: 익명/인증 모두 published 만. ADMIN/MANAGER 는 전체(draft 포함).
--   - 쓰기: ADMIN/MANAGER 만 (get_my_role() 은 001_initial_schema.sql 정의).
--   - n8n 은 service_role 키로 접속 → RLS 우회(별도 정책 불필요).
-- =============================================

ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY news_items_select ON public.news_items
  FOR SELECT TO anon, authenticated
  USING (status = 'published' OR get_my_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY news_items_insert ON public.news_items
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY news_items_update ON public.news_items
  FOR UPDATE TO authenticated
  USING      (get_my_role() IN ('ADMIN', 'MANAGER'))
  WITH CHECK (get_my_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY news_items_delete ON public.news_items
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('ADMIN', 'MANAGER'));


-- =============================================
-- 4. 초기 시드 — 기존 digitalResources 블롭의 뉴스 4건을 published 로 이전.
--    DB 전환 직후에도 사이트가 동일하게 동작하도록 한다.
--    재실행 안전: source_url 충돌 시 무시(여기서는 시드 전용 sentinel URL 사용).
-- =============================================

INSERT INTO public.news_items (title, news_date, source, source_url, summary, body, status, published_at) VALUES
(
  '2026년 노트북 시장, AI PC가 표준이 된다',
  '2026-04-22', 'Digital Rescue Insights', 'seed:ai-pc-2026',
  'NPU 탑재 AI PC가 전체 노트북 출하량의 60%를 넘어설 전망입니다.',
  E'2026년부터는 NPU(신경망 처리 장치)를 탑재한 AI PC가 새로운 표준으로 자리잡고 있습니다. Intel Core Ultra, AMD Ryzen AI, Apple M4 시리즈 모두 온디바이스 AI 가속을 기본 기능으로 제공하면서, 기존 노트북과의 성능 차이가 점차 벌어지고 있습니다.\n\n디지털레스큐는 AI PC의 새로운 부품 구조와 발열 설계에 맞춘 진단 프로세스를 도입해, 어떤 차세대 기기도 안정적으로 수리할 수 있도록 준비를 마쳤습니다.',
  'published', now()
),
(
  'SSD 수명, 무엇이 결정하는가',
  '2026-04-10', 'Digital Rescue Insights', 'seed:ssd-lifespan',
  'TBW와 사용 패턴이 SSD의 실제 수명을 어떻게 결정하는지 정리했습니다.',
  E'SSD의 수명을 가장 직접적으로 결정하는 지표는 TBW(Total Bytes Written)입니다. 일반 사무용 사용자는 5년 이상 충분히 사용 가능하지만, 영상 편집·게임 캐시·가상머신 등 쓰기가 많은 워크로드에서는 수명이 빠르게 단축됩니다.\n\n예방을 위해서는 SMART 정보를 주기적으로 확인하고, 중요한 데이터는 항상 별도 백업을 유지하시기 바랍니다.',
  'published', now()
),
(
  '맥북 침수 골든타임, 60초가 운명을 가른다',
  '2026-03-28', 'Digital Rescue Insights', 'seed:macbook-liquid',
  '침수 직후 60초 안에 해야 하는 단 하나의 행동을 알려드립니다.',
  E'맥북·노트북에 액체가 유입된 직후 가장 중요한 것은 ''즉시 전원 차단''입니다. 시스템이 켜진 채로 액체와 만나면 메인보드의 회로가 단락되어 부식 속도가 폭발적으로 빨라집니다.\n\n전원을 끈 뒤에는 전원 코드와 배터리(가능한 경우) 분리, 본체를 뒤집어 액체를 빼내고, 절대 드라이기로 가열하지 마시고 최대한 빠르게 전문 센터로 가져오시는 것이 데이터 보존의 핵심입니다.',
  'published', now()
),
(
  'Windows 11 24H2 업데이트, 알아둬야 할 호환성 이슈',
  '2026-03-15', 'Digital Rescue Insights', 'seed:windows-11-update',
  '일부 구형 드라이버가 24H2와 충돌해 부팅 불가 현상이 보고되고 있습니다.',
  E'Windows 11 24H2 업데이트 적용 후, 일부 구형 그래픽 드라이버 및 보안 솔루션과의 호환성 문제로 부팅 불가, BSOD 등이 보고되고 있습니다.\n\n업데이트 전에는 반드시 시스템 복구 지점을 만들고, 가능한 경우 별도 디스크에 전체 백업을 진행하시길 권장드립니다. 이미 문제가 발생했다면 자가 복구를 시도하기보다 입고를 권해드립니다.',
  'published', now()
)
ON CONFLICT (source_url) DO NOTHING;
