# Click Guard SPEC

> 2026-11-06 MVP로 범위 축소. n8n, 네이버 API, 자동 차단, 승인 상태머신은 MVP에서 제외하고 하단 "후속 단계(보류)"로 옮겼다.

## MVP SPEC

### 흐름
Vercel 수집 → Supabase 저장·계산 → ERP 조회. 외부 API 호출 없음.

### 광고 판정
새 공용 함수 `lib/naver-ad/isNaverAdLanding(searchParams)` — `NaPm`, `n_media`, `n_ad`, `n_keyword`, `n_campaign_type` 중 하나라도 있으면 true. (기존 CTA 판정 교체는 후속)

### 수집 조건 (모두 만족)
- `CLICK_GUARD_ENABLED === 'true'`
- host가 `CLICK_GUARD_ALLOWED_HOSTS`(쉼표 구분)에 포함
- `VERCEL_ENV !== 'preview'`
- `login.` / `edit.` 호스트, `/_next`, `/api`, 정적 파일은 제외

### IP
- `x-real-ip`(없으면 `x-forwarded-for` 첫 값).
- `cf-connecting-ip`는 `x-real-ip`가 Cloudflare 대역(상수 파일, 출처·날짜 주석)일 때만 사용(현재 DNS only라 사실상 미사용).
- 원본 IP 헤더는 jsonb로 저장. `ip_prefix`는 v4 /24, v6 /64.

### 새로고침 중복
`click_key` = `NaPm`이 있으면 `NaPm`, 없으면 `session_id + n_ad + 10분 버킷`. 원본 행은 전부 저장하고 집계는 distinct `click_key`로 한다.

### 전환
기존 `CtaTracker` + `/api/cta`가 유일한 수집원. 기존 세션 형식·전환 명칭·응답은 변경 금지. `/api/cta`는 기존 처리를 마친 뒤 `cg_sid` 쿠키가 있으면 `cg_record_engagement(conversion=기존 명칭)`를 fire-and-forget으로 호출한다.

### 장애 격리
모든 수집 코드는 fail-silent(try/catch, 1500ms 타임아웃, 응답 비차단).

### DB (public, `cg_` 접두어, 전부 RLS ON, SELECT는 ADMIN만, 쓰기 정책 없음)
- `cg_ad_visits`, `cg_engagement`, `cg_whitelist`, `cg_ip_marks`(사람이 표시: `naver_blocked` / `normal` / `watch`)
- RPC: `cg_record_visit(payload jsonb) → uuid`, `cg_record_engagement(...)`, `cg_purge_old(p_days int default 90)`
- **함수 권한 (2026-11-06 Brad 결정, R10/KI-8):** `REVOKE ALL FROM PUBLIC` → `GRANT EXECUTE TO anon, authenticated, service_role`. 거부는 함수 내부 `(SELECT auth.role()) IS DISTINCT FROM 'service_role'` 검사로 한다. anon/authenticated에서 EXECUTE를 빼앗으면 supautils 버그로 Postgres가 재시작되므로(KI-8) 그 방식은 쓰지 않는다. 테이블 쓰기는 테이블 권한 REVOKE + 쓰기 정책 없음으로 막는다.
- 보존: `cg_purge_old`를 pg_cron으로 매일 실행(`docs/click-guard/cron.sql`, 대시보드에서 수동 등록).

### ERP 조회 화면 (MVP 2/2, 2026-11-06)
- `login.` 관리자 영역 `/click-guard` "부정클릭 감시" (ADMIN 전용, 사이드바·proxy `ADMIN_PATHS` 등록)
- RPC(ADMIN 전용, R10 권한): `cg_suspect_ips`(R1~R5·전환 감점, 임계값은 함수 내 상수), `cg_ad_summary`, `cg_ip_detail`, `cg_mark_ip`, `cg_whitelist_upsert`, `cg_whitelist_delete`
- 전환 감점은 전화·카톡·접수 완료만 센다 (`contact` 접수 버튼 이동은 제외)
- 네이버 등록은 사람이 검색광고센터에서 직접 하고, 화면에서는 "등록 완료" 표시만 한다 (API 호출 없음) — 2026-11-11부터 API 직접 등록 추가, 아래 "네이버 광고노출 제한 직접 등록/해제" 참고

### 네이버 광고노출 제한 직접 등록/해제 (2026-11-11)
사양과 승인 결정은 `docs/click-guard/NAVER-API.md`, 결과는 `docs/click-guard/NAVER-BLOCK-REPORT.md`.
- **원칙 변경:** ERP 서버 액션이 네이버 검색광고 API(`/tool/ip-exclusions`)를 직접 호출한다. 아래 "후속 단계(보류)"의 "Vercel은 네이버 API를 호출하지 않는다(n8n이 호출)"를 이 기능에 한해 대체한다. 자동 차단은 여전히 없다 — 관리자가 행마다 메모를 쓰고 눌러야 등록된다.
- 키는 서버 환경변수 `NAVER_SA_API_KEY` / `NAVER_SA_SECRET_KEY` / `NAVER_SA_CUSTOMER_ID` (NEXT_PUBLIC 금지, `lib/naver-sa/client.ts`는 `server-only`).
- ERP가 등록한 항목의 네이버 메모는 `[CG] YYMMDD <메모 앞 13자>`(25자 제한). `[CG]`로 시작하는 항목만 ERP에서 해제한다. 사람이 직접 등록한 항목과 와일드카드 대역은 건드리지 않는다.
- IPv4 단일 IP만 등록한다(IPv6는 지원 확인 전까지 거부). ERP 자체 상한 500개.
- DB: `cg_ip_marks.naver_filter_id / naver_registered_at / naver_source('api'|'manual')`, 감사 로그 `cg_block_log`, RPC `cg_mark_naver_registered`, `cg_mark_naver_unregistered`, `cg_log_block` (ADMIN 전용, R10 권한).
- 화면: 낙관적 UI를 쓰지 않고 서버 응답 후 반영. 기존 "등록 완료 표시"는 "수동 표시"로 남긴다(API 장애 대비).

### 개인정보 고지
`/privacy` 처리방침 페이지, 마케팅 푸터 링크, 문의 폼 필수 동의(클라이언트·서버 양쪽 검사).

---

## 후속 단계(보류)

아래는 최초 설계(2026-11-05)다. MVP 이후 단계에서 다시 검토한다.

### 목적
네이버 파워링크 광고 유입을 서버에서 기록하고, 부정클릭 의심 IP를 탐지해 관리자 승인 후 네이버 광고노출제한에 등록/만료 해제한다.

### 역할 분리 (절대 원칙)
- Vercel(Next.js): 수집(미들웨어+비콘 API)과 ERP 관리 UI만. 네이버 API를 절대 호출하지 않는다.
- Supabase: 단일 진실 공급원. 탐지 로직은 SQL 함수.
- n8n: 탐지 함수 호출, 알림, 네이버 API 호출(등록/해제/대사), 정리 작업.
- 자동 차단 금지: pending → (사람) approved → (n8n) blocked. 사람 승인 없이 blocked로 갈 수 없다.
- 네이버에 수동 등록된 IP는 건드리지 않는다. 시스템 등록분은 memo가 "[CG]"로 시작.
- 수집 실패가 페이지 렌더링·응답 속도에 영향을 주면 안 된다(fail-silent, 타임아웃 1500ms).

### 광고 유입 판정
URL 쿼리에 n_ad 또는 n_keyword 또는 n_campaign_type 중 하나라도 있으면 광고 유입. 마케팅 호스트(홈페이지/랜딩)에서만 수집하고 login./edit. 호스트는 제외.
저장 파라미터: n_media, n_query, n_rank, n_ad_group, n_ad, n_keyword_id, n_keyword, n_campaign_type, n_ad_group_type, n_match, NaPm(원문).

### 실제 IP 추출 규칙
1) Vercel이 설정한 x-real-ip(없으면 x-forwarded-for 첫 값)를 edge_ip로 본다.
2) edge_ip가 Cloudflare IP 대역(상수 파일, 출처 URL과 갱신일 주석)에 속할 때만 cf-connecting-ip를 신뢰해 client_ip로 쓴다. 아니면 edge_ip가 client_ip. (DNS only 상태에서 cf-connecting-ip 위조 방지)
3) ip_version(4/6), ip_prefix(v4는 /24, v6는 /64) 계산. 원본 헤더(x-real-ip, x-forwarded-for, cf-connecting-ip)도 raw_ip_headers jsonb로 저장.

### 테이블 (public 스키마, cg_ 접두어, 전부 RLS ON)
- cg_settings: 단일 행(id=1). enabled bool, thresholds jsonb, default_block_days int(30), max_block_slots int(500, 네이버 상한 600에서 여유분), retention_days int(90), updated_at.
- cg_ad_visits: id bigint identity, created_at timestamptz default now(), session_id uuid, client_ip inet, ip_version smallint, ip_prefix cidr, raw_ip_headers jsonb, user_agent text, is_bot bool, device_type text, host text, path text, n_* 컬럼들(text, n_rank는 int nullable), napm text, referer text, country text, is_whitelisted bool. 인덱스: (client_ip, created_at desc), (ip_prefix, created_at desc), (session_id), (created_at).
- cg_engagement: session_id uuid PK, first_seen, last_seen, dwell_ms int, max_scroll_pct smallint, interactions int, pageviews int, conversions jsonb(예: {"tel":1,"kakao":0,"form":0}), updated_at.
- cg_whitelist: id, cidr cidr unique, reason text, created_by uuid, created_at.
- cg_suspects: id, client_ip inet unique, ip_prefix cidr, score int, reasons jsonb, visit_count int, first_seen, last_seen, status text check in (pending, rejected, approved, blocked, failed, release_requested, released), review_memo text, reviewed_by uuid, reviewed_at, block_days int, expires_at timestamptz, naver_filter_id text, last_error text, updated_at.
- cg_action_log: id, created_at, suspect_id, client_ip, action text, actor text('admin:<uid>'|'n8n'|'system'), result text, detail jsonb. (감사 로그, update/delete 금지)
- cg_heartbeat: job text PK, last_run_at, last_status text, detail jsonb.

### 접근 권한
- anon/authenticated 직접 insert 불가. 수집은 서버(service role)만.
- ERP ADMIN만 select와 검토 RPC 실행(기존 ADMIN 판정 헬퍼 재사용).
- n8n은 service role로 RPC 호출.

### 상태 전이 (RPC에서 WHERE status 가드로 강제)
pending → approved | rejected  (관리자)
rejected → pending  (관리자 재검토)
approved → blocked | failed  (n8n)
failed → approved  (관리자 재시도)
blocked → release_requested  (관리자 수동 해제 또는 만료 시 n8n)
release_requested → released | failed  (n8n)
released → pending  (재탐지 시 탐지 함수가 재생성 가능)
탐지 함수는 pending 행의 통계만 갱신하고, rejected/approved/blocked 등 사람이 결정한 상태는 절대 덮어쓰지 않는다.

### 탐지 규칙 (thresholds jsonb 기본값, 점수 합산)
- R1 반복유입: 24h 내 동일 IP 광고유입 ≥ 3회 → +40
- R2 연속클릭: 동일 IP 광고유입 간격 ≤ 10분이 1회 이상 → +30
- R3 무관심: 해당 IP 세션들의 평균 dwell < 5초 이고 interactions=0 인 세션 ≥ 2 → +30
- R4 심야: KST 00–06시 광고유입 ≥ 2 → +10
- R5 대역집중: 동일 ip_prefix 24h 광고유입 ≥ 6 이고 저참여 → +10 (정보용, 대역 차단 추천 금지)
- 감점: 전환(tel/kakao/form) 1회 이상 → -100
- 제외: 화이트리스트, is_bot=true
- score ≥ 60 이면 suspects에 pending으로 upsert.

### 보존
cg_ad_visits, cg_engagement는 retention_days 경과 시 삭제(n8n 일일 작업에서 RPC 호출). suspects와 action_log는 유지.
