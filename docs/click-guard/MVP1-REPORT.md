# Click Guard MVP 1/2 — 구현 보고 (광고 유입 추적 + 개인정보 고지)

- 작업일: 2026-11-06
- 브랜치: `feat/click-guard` (main `2529567` 기준, rebase 불필요 — main 변경 없음)
- 범위: [SPEC.md](SPEC.md) "MVP SPEC". n8n·네이버 API·자동 차단·승인 상태머신 제외
- DB 적용: **로컬 Docker Supabase에만** (`npx supabase migration up --local`). 운영/`--linked` 명령 실행 없음
- push 안 함

## 결정·변경 사항 (요청과 다르게 한 부분)

| # | 내용 | 이유 |
|---|---|---|
| D1 | RPC 3개 권한: `REVOKE ALL FROM PUBLIC` → `GRANT EXECUTE TO anon, authenticated, service_role` + 함수 내부 service_role 검사 (요청의 "anon/authenticated REVOKE 두 겹"은 적용 안 함) | 2026-11-06 Brad 결정(R10 패턴). anon/authenticated에서 EXECUTE를 빼면 supautils 버그로 Postgres가 재시작됨(KI-8). 공개 anon 키로 운영 DB를 재시작시킬 수 있게 됨 |
| D2 | 내부 검사를 `(SELECT auth.role()) <> 'service_role'` 대신 `IS DISTINCT FROM`으로 작성 | 직접 접속(pg_cron, SQL Editor)은 `auth.role()`이 NULL → `<>`는 NULL이 되어 **거부되지 않음** |
| D3 | `cg_record_visit`가 `cg_engagement` 행도 함께 만든다 (`ON CONFLICT` 시 `last_seen`만 갱신) | 검증 2 "visit 1건 + engagement 생성"을 비콘 도착 여부와 무관하게 보장 |
| D4 | proxy: 기존 `proxy` 함수 본문은 그대로 두고 이름만 `routeRequest`로 바꾼 뒤, 새 `proxy(request, event)`가 결과 응답에 훅을 붙인다 | "기존 라우팅 로직 수정 금지 + 응답 직전 훅" |
| D5 | 수집은 GET + 응답 상태 3xx 아님 + 브라우저 예측 프리페치(`sec-purpose: prefetch`) 아님일 때만 | 리다이렉트(예: `/Samsung` → `/samsung` 308)는 이동한 쪽에서 1회만 기록. RSC 헤더·`_rsc`는 Next가 proxy 전에 지워서 구분할 수 없음(`next/dist/server/web/adapter.js`) — 사이트 안 링크에는 광고 파라미터가 없어 실제 영향 없음 |
| D6 | 비콘에 `/api/cta`와 같은 Origin=Host 검사 추가, `CLICK_GUARD_ENABLED`가 false면 비콘·전환 연결 모두 무시 | 기존 수집 API와 동일한 방어, 끄면 완전히 꺼지도록 |
| D7 | 전환 허용값 = 기존 CTA 명칭 4개 `phone` / `kakao` / `contact` / `form_submit` | "기존 명칭 집합" 그대로. `contact`는 접수 섹션 이동 버튼 클릭 |
| D8 | `.env.example`을 새로 만들고 `.gitignore`에 `!.env.example` 예외 추가 | `.env*`가 전부 무시돼 기존 `.env.local.example`은 저장소에 없음. 로컬 `.env.local.example`에도 같은 내용 추가(커밋 안 됨) |
| D9 | 단위 테스트는 의존성 추가 없이 `node --test`(Node 24 타입 제거) — `npm test` 스크립트 추가 | 테스트 프레임워크가 없던 프로젝트. 테스트 대상 모듈은 다른 모듈을 import 하지 않게 작성 |
| D10 | 푸터 "개인정보처리방침" 링크는 CMS 데이터가 아니라 `Footer.tsx` 코드에 고정 | CMS에서 지워지지 않도록 |

## 변경 파일

**DB**
- `supabase/migrations/20261106090000_click_guard_mvp.sql` — 테이블 4개(`cg_ad_visits`, `cg_engagement`, `cg_whitelist`, `cg_ip_marks`), RLS(SELECT=ADMIN), RPC 3개. 기존 객체 변경 없음
- `supabase/test-fixtures/click-guard/rollback.sql` — 롤백 SQL
- `supabase/tests/click_guard.test.sql` — pgTAP 28개
- `docs/click-guard/cron.sql` — pg_cron 일일 정리 (Brad가 대시보드에서 실행)
- `src/types/supabase.ts` — 재생성 (cg_ 추가분만, +81줄)

**수집기**
- `src/lib/naver-ad/isNaverAdLanding.ts` — 광고 판정 공용 함수
- `src/lib/click-guard/cloudflare-ips.ts` — CF 대역 상수 (출처·갱신일 주석)
- `src/lib/click-guard/ip.ts` — IP 추출·CF 검증·IPv6 처리·prefix
- `src/lib/click-guard/visit.ts` — click_key·봇·기기 구분
- `src/lib/click-guard/server.ts` — proxy 훅(`applyClickGuard`), `recordEngagement`, 1500ms 타임아웃·fail-silent
- `src/proxy.ts` — 훅 연결 (+12/−2, 라우팅 로직 변경 없음)
- `src/app/api/cg/beacon/route.ts` — 참여도 비콘 (항상 204)
- `src/app/api/cta/route.ts` — 기존 처리 후 `after()`로 전환 연결 (+8/−1, 기존 응답 그대로)
- `src/components/click-guard/ClickGuardTracker.tsx` — 클라이언트 트래커
- `src/app/(main)/layout.tsx` — 트래커 마운트 (대고객 레이아웃만)
- `.env.example`, `.gitignore`, `package.json`(test 스크립트)

**개인정보 고지**
- `src/app/(main)/privacy/page.tsx` — 처리방침 (작성지침 표준 14개 항목)
- `src/components/layout/Footer.tsx` — 처리방침 링크
- `src/components/common/ContactForm.tsx` — 필수 동의 체크박스 + 요약 + `/privacy` 링크
- `src/app/actions/ticketActions.ts` — 서버 측 미동의 거부 (다른 검증·저장·알림 로직 변경 없음)

**문서**: `docs/click-guard/SPEC.md`(MVP SPEC으로 교체, 기존 내용은 "후속 단계(보류)"), 이 보고서

## 검증 결과

| # | 항목 | 결과 |
|---|---|---|
| 1 | lint | 오류 0 (경고 16 — 전부 기존 `<img>` 경고, 이번 변경 무관) |
| 1 | typecheck | 통과 |
| 1 | 단위 테스트 `npm test` | **18/18 통과** (IP 추출, CF 대역·위조 헤더 4종, IPv6 prefix·표기, IPv4-mapped, 잘못된 형식, click_key 2종, 광고 판정 2종, UA) |
| 1 | production build | 통과 (`/privacy`, `/api/cg/beacon` 생성) |
| 1 | 번들 점검 | `.next/static`에 service role 키 값·`SUPABASE_SERVICE_ROLE_KEY`·`createAdminClient` 없음 |
| 2 | 광고 URL 접속 (브라우저) | visit 1건 + engagement 생성. `n_query`=노트북수리, `n_rank`=1, `napm`=`ct=test`, `click_key`=`ct=test`, `raw_ip_headers` 저장 |
| 2 | 같은 URL 새로고침 3회 | 행 **4건**, distinct `click_key` **1개**, 세션 1개(쿠키 재사용). engagement `pageviews`=4, `dwell_ms`≈19.6초 |
| 3 | 광고 파라미터 없음 (`/`, `/samsung`) | 기록 0, 쿠키 없음 |
| 3 | `login.` 호스트, `edit.` 호스트, `/api/*`, 정적 파일(`/icon.png`) + 광고 파라미터 | 기록 0 |
| 3 | `CLICK_GUARD_ENABLED=false` | 기록 0, 쿠키 없음 |
| 3 | `/Samsung?광고` (308) → `/samsung?광고` | 리다이렉트 응답은 기록 0, 이동한 쪽에서 1건 |
| 4 | 로컬 Supabase 중지 | `/`, `/samsung`, 광고 URL, `/privacy` 모두 **200**. 단 응답이 7~14초 걸림 — 광고 파라미터 유무와 무관하게 같음(`/` 14.2초 = `/?n_ad=…` 14.2초) → 기존 페이지 데이터·로그인 확인의 재시도 때문이고 Click Guard 지연은 없음. 재시작 후 데이터 유지 확인 |
| 5 | 호스트 라우팅 회귀 (비로그인) | 홈 200, 랜딩 200, `/Samsung` 308, 마케팅 호스트 `/tickets`·`/login` → `/`, 없는 경로 404, `login.` `/` → `/login`, 보호 경로 → `/login?redirect=`, `/editor` → `edit.`, `edit.` 미인증 → `login.…/login` — 전부 기존과 동일 |
| 6 | anon으로 RPC 3개 호출 (로컬 REST) | 전부 거부 `42501 "Click Guard 수집/정리 함수는 서버에서만 호출할 수 있습니다."`, **DB 재시작 없음** |
| 6 | anon 테이블 조회 4개 | `permission denied for table` |
| 6 | 비관리자(MANAGER) 조회 | 0행 (pgTAP) / ADMIN은 조회 가능, 직접 쓰기 불가 |
| 7 | 전화 버튼 클릭 | 기존 `cta_click_events` 행 정상(`phone`/`header`, 기존 세션 형식, `ad_source=naver_ad`) + `cg_engagement.conversions` = `{"phone": 1}`, `/api/cta` 204 |
| - | 브라우저 콘솔 에러 | 0 |
| - | 문의 폼 | 체크박스 `required`로 브라우저가 제출 차단. 브라우저 검사를 지우고 빈 폼 제출 시 서버가 "개인정보 수집·이용에 동의해 주세요." 반환 |
| - | `/privacy` 모바일(375px) | 가로 넘침 없음 |
| - | pgTAP 전체 (`npx supabase test db`) | 1196개 중 **1개 실패**: `vector_integration.test.sql` #20 — 아래 "알려진 문제" |
| - | `supabase db lint` (public) | cg_ 함수 경고 없음 (기존 함수 3개 경고만) |

**확인하지 못한 것**
- `VERCEL_ENV=preview` 차단은 실제 Preview 배포에서 확인하지 않음 (코드 한 줄 조건)
- 로그인 상태의 ERP 라우팅은 다시 확인하지 않음 (훅은 기존 응답 객체를 그대로 돌려줌)
- 동의한 상태로 실제 접수 제출은 하지 않음 — 로컬 `.env.local`의 신규 접수 웹훅이 운영 n8n을 가리켜 실제 알림이 나갈 수 있어서. 동의 거부 경로만 확인

## 알려진 문제

- **pgTAP `vector_integration` #20 실패는 이번 작업 전부터 있었다.** 이 테스트는 모든 테이블에서 `vector_agent`가 쓰기를 시도해 42501을 기대하는데, `GENERATED ALWAYS` identity 열의 UPDATE는 권한 검사 전에 `428C9`가 난다. main의 `cta_click_events`(10-26)부터 실패했고, 이번에 `cg_ad_visits`·`cg_whitelist`가 같은 이유로 추가됐다. `vector_agent`는 cg_ 테이블에 권한이 전혀 없음을 `has_table_privilege`로 확인했다. 기존 테스트는 수정하지 않았다.

## [대표 확인 필요] 목록

`/privacy` 페이지에 노란 표시(16곳)로 남아 있다. **채우기 전에는 운영에 공개하면 안 된다.**

1. 온라인 접수 정보 보유 기간
2. 버튼 클릭 기록(`cta_click_events`) 보유 기간 — 현재 자동 삭제가 없다
3. 관계 법령에 따라 보존하는 정보와 기간
4. 제3자 제공 현황
5. 접수 알림 자동화 서버(n8n, `workflow.bradserv.uk`) 운영 주체 — 자체 운영이면 위탁 표에서 빼야 하고, 외부 업체면 업체명
6. Vercel 서버 위치(국가) — 참고: 응답 헤더의 엣지는 `icn1`(서울)이지만 함수 리전은 확인 안 됨
7. Supabase 서버 위치(국가) — 참고: 운영 프로젝트는 `ap-northeast-2`(서울)로 기록돼 있음
8. 국외 이전을 원하지 않는 경우의 방법
9. 관리적 조치(내부관리계획, 직원 교육 등)
10. Google 광고 태그 쿠키의 용도
11. Google 광고 태그 쿠키의 보관 기간
12. 행태정보(Google Ads, `AW-18233103458`) 수집 목적·항목·보유 기간
13. 개인정보 보호책임자 성명 [대표 입력]
14. 직책 [대표 입력]
15. 연락처 [대표 입력]
16. 시행일

**페이지 밖에서 결정할 것**
- **동의 시각 저장**: 현재 동의 여부는 서버에서 검사만 하고 저장하지 않는다. 기록이 필요하면 `repair_tickets`(또는 `customers`)에 `privacy_consented_at timestamptz` 같은 컬럼이 필요하다 — 작성하지 않음.
- **"90일 자동 삭제" 문구**는 `docs/click-guard/cron.sql`을 운영에 등록해야 사실이 된다. 마이그레이션 적용과 같은 날 등록할 것.
- **첨부 사진**: 접수 사진은 `ticket-images` 버킷의 공개 URL(`getPublicUrl`)로 저장된다. 처리방침에는 "비공개 저장" 같은 표현을 쓰지 않았다. 공개 URL이 맞는지 검토 권장.
- 처리방침 문안은 작성지침 목차를 따른 초안이다. 공개 전 법률 검토를 권장한다.

## 운영 반영 시 (Brad)

1. 마이그레이션 `20261106090000_click_guard_mvp.sql` 적용 (운영 이력 상태는 2026-11-06 확인: 미적용 2건은 `migration repair`로 이력만 맞추는 안을 별도 보고함)
2. `docs/click-guard/cron.sql` 실행 (pg_cron)
3. Vercel Production 환경변수: `CLICK_GUARD_ENABLED=true`, `CLICK_GUARD_ALLOWED_HOSTS=www.digital-rescue.com,digital-rescue.com` (Preview에는 넣지 않아도 수집 안 됨)
4. `/privacy`의 [대표 확인 필요] 채우기
