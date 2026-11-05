# Click Guard SPEC

## 목적
네이버 파워링크 광고 유입을 서버에서 기록하고, 부정클릭 의심 IP를 탐지해 관리자 승인 후 네이버 광고노출제한에 등록/만료 해제한다.

## 역할 분리 (절대 원칙)
- Vercel(Next.js): 수집(미들웨어+비콘 API)과 ERP 관리 UI만. 네이버 API를 절대 호출하지 않는다.
- Supabase: 단일 진실 공급원. 탐지 로직은 SQL 함수.
- n8n: 탐지 함수 호출, 알림, 네이버 API 호출(등록/해제/대사), 정리 작업.
- 자동 차단 금지: pending → (사람) approved → (n8n) blocked. 사람 승인 없이 blocked로 갈 수 없다.
- 네이버에 수동 등록된 IP는 건드리지 않는다. 시스템 등록분은 memo가 "[CG]"로 시작.
- 수집 실패가 페이지 렌더링·응답 속도에 영향을 주면 안 된다(fail-silent, 타임아웃 1500ms).

## 광고 유입 판정
URL 쿼리에 n_ad 또는 n_keyword 또는 n_campaign_type 중 하나라도 있으면 광고 유입. 마케팅 호스트(홈페이지/랜딩)에서만 수집하고 login./edit. 호스트는 제외.
저장 파라미터: n_media, n_query, n_rank, n_ad_group, n_ad, n_keyword_id, n_keyword, n_campaign_type, n_ad_group_type, n_match, NaPm(원문).

## 실제 IP 추출 규칙
1) Vercel이 설정한 x-real-ip(없으면 x-forwarded-for 첫 값)를 edge_ip로 본다.
2) edge_ip가 Cloudflare IP 대역(상수 파일, 출처 URL과 갱신일 주석)에 속할 때만 cf-connecting-ip를 신뢰해 client_ip로 쓴다. 아니면 edge_ip가 client_ip. (DNS only 상태에서 cf-connecting-ip 위조 방지)
3) ip_version(4/6), ip_prefix(v4는 /24, v6는 /64) 계산. 원본 헤더(x-real-ip, x-forwarded-for, cf-connecting-ip)도 raw_ip_headers jsonb로 저장.

## 테이블 (public 스키마, cg_ 접두어, 전부 RLS ON)
- cg_settings: 단일 행(id=1). enabled bool, thresholds jsonb, default_block_days int(30), max_block_slots int(500, 네이버 상한 600에서 여유분), retention_days int(90), updated_at.
- cg_ad_visits: id bigint identity, created_at timestamptz default now(), session_id uuid, client_ip inet, ip_version smallint, ip_prefix cidr, raw_ip_headers jsonb, user_agent text, is_bot bool, device_type text, host text, path text, n_* 컬럼들(text, n_rank는 int nullable), napm text, referer text, country text, is_whitelisted bool. 인덱스: (client_ip, created_at desc), (ip_prefix, created_at desc), (session_id), (created_at).
- cg_engagement: session_id uuid PK, first_seen, last_seen, dwell_ms int, max_scroll_pct smallint, interactions int, pageviews int, conversions jsonb(예: {"tel":1,"kakao":0,"form":0}), updated_at.
- cg_whitelist: id, cidr cidr unique, reason text, created_by uuid, created_at.
- cg_suspects: id, client_ip inet unique, ip_prefix cidr, score int, reasons jsonb, visit_count int, first_seen, last_seen, status text check in (pending, rejected, approved, blocked, failed, release_requested, released), review_memo text, reviewed_by uuid, reviewed_at, block_days int, expires_at timestamptz, naver_filter_id text, last_error text, updated_at.
- cg_action_log: id, created_at, suspect_id, client_ip, action text, actor text('admin:<uid>'|'n8n'|'system'), result text, detail jsonb. (감사 로그, update/delete 금지)
- cg_heartbeat: job text PK, last_run_at, last_status text, detail jsonb.

## 접근 권한
- anon/authenticated 직접 insert 불가. 수집은 서버(service role)만.
- ERP ADMIN만 select와 검토 RPC 실행(기존 ADMIN 판정 헬퍼 재사용).
- n8n은 service role로 RPC 호출.

## 상태 전이 (RPC에서 WHERE status 가드로 강제)
pending → approved | rejected  (관리자)
rejected → pending  (관리자 재검토)
approved → blocked | failed  (n8n)
failed → approved  (관리자 재시도)
blocked → release_requested  (관리자 수동 해제 또는 만료 시 n8n)
release_requested → released | failed  (n8n)
released → pending  (재탐지 시 탐지 함수가 재생성 가능)
탐지 함수는 pending 행의 통계만 갱신하고, rejected/approved/blocked 등 사람이 결정한 상태는 절대 덮어쓰지 않는다.

## 탐지 규칙 (thresholds jsonb 기본값, 점수 합산)
- R1 반복유입: 24h 내 동일 IP 광고유입 ≥ 3회 → +40
- R2 연속클릭: 동일 IP 광고유입 간격 ≤ 10분이 1회 이상 → +30
- R3 무관심: 해당 IP 세션들의 평균 dwell < 5초 이고 interactions=0 인 세션 ≥ 2 → +30
- R4 심야: KST 00–06시 광고유입 ≥ 2 → +10
- R5 대역집중: 동일 ip_prefix 24h 광고유입 ≥ 6 이고 저참여 → +10 (정보용, 대역 차단 추천 금지)
- 감점: 전환(tel/kakao/form) 1회 이상 → -100
- 제외: 화이트리스트, is_bot=true
- score ≥ 60 이면 suspects에 pending으로 upsert.

## 보존
cg_ad_visits, cg_engagement는 retention_days 경과 시 삭제(n8n 일일 작업에서 RPC 호출). suspects와 action_log는 유지.
