# Click Guard — P0 사전 조사 보고서

- 조사일: 2026-11-05
- 브랜치: `feat/click-guard` (main `2529567`에서 분기, feat/repair-intelligence 아님)
- 범위: 읽기 전용 조사. 코드·DB 변경 없음. 운영 DB는 SELECT만 실행(`list_migrations`, `page_contents` 조회 2건).
- 설계 기준: [SPEC.md](SPEC.md) (원문 그대로 저장, 수정하지 않음)

---

## 1. Next.js 버전·라우터·미들웨어(proxy)

| 항목 | 결과 |
|---|---|
| Next.js | **16.2.3** (`node_modules/next/package.json`), React 19.2.4 |
| 라우터 | **App Router** (`src/app`, 라우트 그룹 `(main)` / `(admin)` / `(cms)`) |
| 미들웨어 | **`src/proxy.ts`** (Next 16에서 `middleware.ts` → `proxy.ts`로 이름 변경됨). 루트·`src/`에 `middleware.ts` 없음 |
| 런타임 | proxy는 **Node.js 런타임 고정** (`runtime` 설정 불가, Next 16 문서 `03-file-conventions/proxy.md`) |
| 백그라운드 작업 | `export function proxy(req: NextRequest, event: NextFetchEvent)` → `event.waitUntil(promise)` 지원 (문서 확인). 현재 코드는 `event` 인자를 쓰지 않음 |
| matcher | `_next/static`, `_next/image`, `favicon.ico`, 이미지 확장자 제외 전 경로 |

### 현재 proxy.ts의 역할 (호스트 분기)
호스트 판정은 **`host` 헤더 접두어**만 본다.

1. 모든 요청에서 먼저 `updateSession(request)` (Supabase `auth.getUser()` 호출, `src/utils/supabase/middleware.ts`) 실행 — 마케팅 호스트에서도 매 요청 실행된다.
2. `login.` / `edit.` 호스트 + 로그인 상태 → 1시간 비활동 세션 만료 검사(`dr_last_activity` 쿠키).
3. **`edit.`** (`isEditHost`): 미인증 → `login.…/login?redirect=` / `/` → `/editor`로 rewrite / 그 외 통과.
4. **그 외(= 마케팅 호스트, `!onAdmin`)**: `ADMIN_PATHS` 접근 시 `/`로 리다이렉트, 1단 경로의 브랜드 슬러그 대소문자 정규화(308), 나머지는 `supabaseResponse` 통과. ← **Click Guard 수집 삽입 지점**
5. **`login.`** (`isAdminHost`): `/editor*` → `edit.`로 리다이렉트, `/` → `/dashboard` 또는 `/login`, 보호 경로 미인증 → `/login` (서버 액션 POST는 예외), 로그인 상태 `/login` → `/dashboard`.

즉 "마케팅 호스트"는 별도 allowlist가 아니라 **`login.`/`edit.`이 아닌 모든 호스트**(www, apex, localhost, `*.vercel.app` 프리뷰 포함)로 처리되고 있다.

## 2. 홈페이지·브랜드 랜딩 라우트와 호스트

| 화면 | 파일 | URL |
|---|---|---|
| 홈페이지 | `src/app/(main)/page.tsx` | `/` |
| 브랜드 랜딩 | `src/app/(main)/[brand]/page.tsx` (`generateStaticParams` + `dynamicParams = false`, 정적 생성) | `/{slug}` |
| 공통 레이아웃 | `src/app/(main)/layout.tsx` (Header/Footer/MobileCTA/CtaTracker, Google Ads gtag) | |

브랜드 슬러그(14개, `src/lib/brands.ts` `BRAND_ROUTES`): samsung, dell, lg, surface, apple, acer, hp, asus, msi, hansung, lenovo, sandisk, razer, nas.

### 호스트명 (DNS·응답 헤더로 확인)
| 호스트 | 해석 | 비고 |
|---|---|---|
| `digital-rescue.com` (apex) | A 64.29.17.1 / 216.198.79.1 (Vercel) | Vercel 도메인 설정으로 **307 → `www.`**, 쿼리스트링 보존 확인(`/samsung?n_keyword=probe` → `https://www.digital-rescue.com/samsung?n_keyword=probe`). proxy에 도달하는 마케팅 호스트는 사실상 `www.` |
| `www.digital-rescue.com` | CNAME `…vercel-dns-017.com` | 실제 마케팅 서비스 호스트, `Server: Vercel` |
| `login.digital-rescue.com` | CNAME `cname.vercel-dns.com` | ERP (수집 제외) |
| `edit.digital-rescue.com` | CNAME `cname.vercel-dns.com` | CMS (수집 제외) |
| 로컬 | `localhost`, `login.localhost`, `edit.localhost` | |

## 3. Supabase 마이그레이션·CLI·로컬 Docker

| 항목 | 결과 |
|---|---|
| 폴더 | `supabase/migrations/` (구 001~042는 `supabase/migrations_archive/`) |
| 파일명 규칙 | `YYYYMMDDHHMMSS_snake_name.sql` (UTC 타임스탬프 14자리) |
| 최신 파일 | **`20261026090000_cta_click_events.sql`** (총 17개, baseline `20260927141005_baseline.sql`) |
| 롤백 SQL 위치 | 기능별 `supabase/test-fixtures/<기능>/rollback.sql` (예: `test-fixtures/cta-click-events/rollback.sql`), 전체 롤백 `supabase/rollback/ri-full-rollback.sql` |
| 테스트 | pgTAP `supabase/tests/*.test.sql`, 실행 `npx supabase test db` |
| CLI | devDependency `supabase@2.118.0` (`npx supabase …`), `supabase/config.toml` `project_id = "digital-rescue"`, Postgres 17 |
| 로컬 포트 | API 54321, DB 54322, Studio 54323, Inbucket 54324 |
| 타입 생성 | `npm run db:types` (= `supabase gen types typescript --local > src/types/supabase.ts`) |
| 로컬 실행 | Docker Desktop(`%LOCALAPPDATA%\Programs\DockerDesktop`) 실행 → `npx supabase start` → `npx supabase db reset`(전 마이그레이션+seed 적용) → `npx supabase test db` |
| 운영 반영 | Brad가 직접 (`npx supabase db push --linked`, `--dry-run` 선행). Claude는 운영 DB에 DDL/DML 금지(MCP SELECT 전용) |

### 운영 DB 마이그레이션 상태 (`list_migrations`, 읽기 전용)
운영(`wnddkgeohcgcidoklrps`)에는 **15개**만 적용되어 있다. 아래 2개는 main에 커밋되어 있으나 운영 **미적용**:
- `20261007090000_completed_ticket_manual_cost`
- `20261026090000_cta_click_events`

→ "충돌/제안" C1 참조.

## 4. service role 클라이언트

- 유틸: **`src/utils/supabase/admin.ts`** → `createAdminClient()` (`@supabase/supabase-js`, `persistSession: false`)
- 환경변수: **`NEXT_PUBLIC_SUPABASE_URL`**, **`SUPABASE_SERVICE_ROLE_KEY`** (없으면 throw)
- 기타 env(`.env.local.example` 기준 이름만): `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_DOMAIN`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_MAIN_URL`, `INVENTORY_WEBHOOK_API_KEY`
- 기존 사용례: `src/app/api/cta/route.ts` (CTA 클릭을 service role로 insert, 실패 시 로그만 남기고 204)

## 5. ERP ADMIN 권한 검사

### DB (RLS·RPC)
- **`is_admin()` 함수는 없다.** 역할 판정 헬퍼는 **`public.get_my_role() RETURNS public.employee_role`** 하나다.
  - 정의(baseline 554행): `LANGUAGE sql STABLE SECURITY DEFINER`, 본문 `SELECT role FROM employees WHERE id = auth.uid();` (search_path 미지정 — 기존 함수라 손대지 않음)
  - enum `public.employee_role`: `ADMIN`, `MANAGER`, `RECEPTION`, `TECHNICIAN`, `EXPERT_REPAIR`, `CS`
- RLS 패턴(예: cta_click_events): `FOR SELECT TO authenticated USING (public.get_my_role() IN ('ADMIN'::public.employee_role, …))` + `REVOKE ALL … FROM anon` + `REVOKE INSERT, UPDATE, DELETE, TRUNCATE … FROM authenticated`
- RPC 패턴: `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` + 본문 첫 줄에서 `IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN RAISE EXCEPTION '<한국어 메시지>'; END IF;`
- **R10/KI-8**: 노출 스키마(public) 함수는 anon/authenticated에게서 EXECUTE를 REVOKE하지 말고 함수 내부 검사로 거부한다(로컬 supautils segfault). Click Guard RPC도 동일하게 적용해야 한다.

### 앱
- proxy: `login.` 호스트 보호 경로는 **로그인 여부만** 확인(`ADMIN_PATHS`). 역할 검사는 하지 않는다.
- `(admin)/layout.tsx`: `getCurrentEmployeeFull()`로 직원 정보 조회, 없으면 셸 없이 렌더. 역할 검사 없음.
- **페이지별 가드**: 각 `page.tsx`에서 `getCurrentEmployee()`(`src/lib/auth.ts`) → `employee.role` 비교 → `redirect("/dashboard")`. 예: `stats/cta/page.tsx`.
- 서버 액션도 자체적으로 `getCurrentEmployee()` + 역할 검사 (KI-12 이후 규칙).
- CMS는 `requireCmsAccess()` (ADMIN/MANAGER).
- 새 경로 추가 시 proxy의 **`ADMIN_PATHS` 배열에 등록**해야 마케팅 호스트에서 차단되고 미인증 시 로그인으로 보내진다.

## 6. ERP 관리자 화면 구조·UI

- 페이지 위치: `src/app/(admin)/<기능>/page.tsx` (서버 컴포넌트) + `<Name>Client.tsx` (클라이언트) + `actions.ts` 또는 `src/app/actions/<name>Actions.ts` (`"use server"`)
- 셸: `src/components/layout/AdminLayoutShell.tsx` (데스크톱 고정 사이드바 / 모바일 드로어)
- **사이드바 메뉴 정의**: `src/components/layout/AdminSidebar.tsx`의 `NAV_ITEMS` 배열 (`{ label, href, roles: EmployeeRole[] }`, 빈 배열 = 전체)
- UI 라이브러리: **없음** — Tailwind CSS v4 직접 작성, 아이콘 `lucide-react`, 폼 `react-hook-form` + `zod`, 차트 `recharts`, 상태 `zustand`
- 토스트: 라이브러리 없음. 컴포넌트 로컬 `useState<{type: "success"|"error"; message}>` + `setTimeout(3000)` 패턴 (예: `inventory/settings/InventorySettingsClient.tsx`)
- 에러 처리: 서버 액션이 `{ data } | { error: string }` 반환 → 클라이언트에서 토스트 또는 `bg-red-50 text-red-700` 박스. DB 오류 → 한국어 매핑 함수(`src/lib/catalogErrors.ts` `catalogErrorMessage`: P0001은 RPC 한국어 메시지 그대로, 42501 "권한이 없습니다." 등)
- 참고 화면: `src/app/(admin)/stats/cta/page.tsx` (기간 탭 + 요약 카드 + 표, 서버 컴포넌트만으로 구성)

## 7. 홈페이지 전화·카카오톡·문의 폼

CTA 링크는 코드 하드코딩이 아니라 **CMS 데이터(`public.page_contents`)**로 그려진다. 폴백 `src/data/mainPageData.json`은 자리표시값(`tel:010-0000-0000`, `https://pf.kakao.com/`).

운영 `page_contents` 실제 값(읽기 전용 조회):
| page_key / section | href |
|---|---|
| main / header | `tel:1544-9814` |
| main / footer | `tel:1544-9814`, `http://pf.kakao.com/_zmkxjX/chat` |

렌더 위치: `Header.tsx`(헤더 CTA), `Footer.tsx`(푸터 연락처), `MobileCTA.tsx`(모바일 하단 고정바 — footer 항목에서 tel/kakao href 추출), `ProcessSection`/히어로 등.

**이미 있는 클릭 계측(랜딩 개편 Phase 0, 2026-10-26)** — Click Guard와 직접 겹친다:
- `src/components/common/CtaTracker.tsx`: `(main)/layout.tsx`에 마운트, document capture 클릭 리스너로 `tel:`/`kakao.com`/`#contact` 판별
- `src/lib/ctaTracking.ts`: `sendBeacon('/api/cta')`, 탭 단위 `sessionStorage` 세션 ID(`dr_cta_session`, **text, uuid 보장 안 됨**), 첫 진입 유입정보(`NaPm`/`n_media` → `naver_ad`, `n_keyword`/`n_query`)
- `src/app/api/cta/route.ts`: Origin=Host 검사, zod 검증, service role insert, 실패 시 204
- 테이블 `public.cta_click_events` (event_type: `phone` / `kakao` / `contact` / `form_submit`)

문의 폼: `src/components/common/ContactForm.tsx` — 홈(`(main)/page.tsx`)과 브랜드 랜딩(`[brand]/page.tsx`)의 `#contact` 섹션. `ticketActions`의 서버 액션으로 접수, 성공 시 `trackCta("form_submit", "contact_form")`.

## 8. 개인정보처리방침

- **페이지 없음.** `src/app` 아래 privacy/개인정보 라우트 없음, 코드·`page_contents`(운영) 어디에도 "개인정보" 문구 없음.
- 문의 폼(`ContactForm.tsx`)에도 개인정보 수집·이용 동의 문구/체크박스가 없다.
- → "충돌/제안" C6 참조.

## 9. 패키지 매니저·스크립트

- **npm** (`package-lock.json`)
- `npm run lint` (= `eslint`), `npm run typecheck` (= `tsc --noEmit`), `npm run build` (= `next build`), `npm run dev`, `npm run db:types`

## 10. Cloudflare 경유 여부 (추정)

- 네임서버: **Cloudflare** (`anna.ns.cloudflare.com`, `clay.ns.cloudflare.com`)
- 그러나 모든 레코드가 **Vercel IP/CNAME으로 직접 해석**되고(64.29.17.1, 216.198.79.1, 76.76.21.98, 66.33.60.67), 응답에 `Server: Vercel`·`X-Vercel-Id`만 있고 `cf-ray`/`Server: cloudflare` 없음.
- **결론: Cloudflare는 DNS only(회색 구름), 프록시 미경유로 추정.** 현재 Vercel의 `x-real-ip`가 곧 방문자 IP이며, `cf-connecting-ip`는 방문자가 임의로 넣을 수 있는 위조 가능 헤더다. SPEC의 "edge_ip가 CF 대역일 때만 cf-connecting-ip 신뢰" 규칙이 정확히 이 상황을 막는다(현재는 그 분기가 실행되지 않음).

---

## 충돌/제안

SPEC은 수정하지 않았다. 아래는 구현 계획(P1) 작성 전에 Brad가 결정할 사항이다.

**C1. 운영 DB 미적용 마이그레이션 2개 (독립 반영과 충돌 가능)**
운영에는 `20261007090000_completed_ticket_manual_cost`, `20261026090000_cta_click_events`가 적용되어 있지 않다. Click Guard 마이그레이션은 이보다 뒤 타임스탬프가 되므로 `supabase db push`를 하면 이 2개가 같이 적용된다. (main의 앱 코드는 이미 이 테이블들을 사용 중이므로 운영 앱이 오류를 내고 있을 가능성도 있다.)
→ 제안: Click Guard 반영 전에 Brad가 두 마이그레이션을 먼저 운영에 적용하거나, 적용 순서를 계획서에 명시.

**C2. ADMIN 헬퍼 이름**
SPEC의 "기존 ADMIN 판정 헬퍼"는 `is_admin()`이 아니라 `public.get_my_role() = 'ADMIN'::employee_role`. 새 헬퍼를 만들지 않고 이것을 재사용한다. (기존 통계·CTA 화면은 ADMIN+MANAGER지만 SPEC은 ADMIN 전용 — SPEC대로 ADMIN만으로 이해함.)

**C3. 권한 차단 방식 (R10/KI-8)**
SPEC "anon/authenticated 직접 insert 불가"는 테이블 권한 REVOKE로 처리 가능(cta_click_events와 동일). 단 **RPC는 EXECUTE REVOKE 금지**, 함수 내부에서 거부해야 한다. n8n 전용 RPC(상태 blocked/failed/released 전이, 정리 작업)는 내부에서 `auth.role() = 'service_role'`(또는 `current_setting('request.jwt.claim.role')`)을 검사해 그 외 호출을 `RAISE EXCEPTION`으로 거부하는 방식을 제안. (메모리의 "새 함수는 EXECUTE를 명시적 REVOKE" 지침은 R10과 충돌 — R10 우선.)

**C4. 기존 CTA 계측과 중복 (cg_engagement.conversions)**
이미 `CtaTracker` + `/api/cta` + `cta_click_events`가 전화/카톡/폼 전환을 수집한다. 별도 비콘을 하나 더 만들면 클릭 1회에 요청 2건, 세션 ID 2종이 생긴다.
- 세션 ID: SPEC `session_id uuid` vs 기존 `sessionStorage` text ID. proxy는 sessionStorage를 읽을 수 없으므로, **광고 유입 시 proxy가 uuid 쿠키(예: `cg_sid`, 세션 쿠키)를 발급**하고 비콘·CtaTracker가 같은 값을 쓰는 방식을 제안.
- 전환 키 이름: SPEC `tel/kakao/form` ↔ 기존 `phone/kakao/form_submit` (`contact`는 버튼 클릭이라 전환 아님) 매핑 필요.
- 제안: 기존 `CtaTracker` 리스너에 Click Guard 참여도 비콘을 덧붙이거나, 탐지 함수가 `cta_click_events`를 세션 ID로 조인해 전환을 판단(단, 그러려면 기존 테이블 session_id를 cg_sid와 일치시켜야 함).

**C5. 광고 유입 판정 기준이 기존 계측과 다름**
기존 `rememberLanding()`은 `NaPm` 또는 `n_media`로 네이버 광고를 판정, SPEC은 `n_ad`/`n_keyword`/`n_campaign_type`. 통계 화면 간 수치가 어긋날 수 있다. SPEC 기준을 그대로 쓰되 차이를 화면 설명에 적을 것을 제안.

**C6. 개인정보처리방침 부재**
IP·User-Agent·체류행동을 90일 보관하는 수집은 처리방침에 수집 항목·목적(부정클릭 방지)·보유기간 고지가 필요할 수 있다. 현재 처리방침 페이지가 없고 문의 폼에도 동의 문구가 없다. (법률 판단은 Brad/전문가 몫) → Click Guard 운영 반영 전 선행 과제로 등록 제안.

**C7. 마케팅 호스트 판정**
현재 proxy는 "login./edit.이 아닌 모든 호스트"를 마케팅으로 본다. 그대로 쓰면 `*.vercel.app` 프리뷰·로컬 접속도 수집된다. 제안: `VERCEL_ENV === "production"` 이고 host가 `www.digital-rescue.com`/`digital-rescue.com`일 때만 수집(로컬 테스트용 env 스위치 별도).

**C8. 수집 지연 최소화**
proxy는 이미 매 요청 `updateSession()`(Supabase 왕복)을 await한다. Click Guard insert는 **await하지 말고 `event.waitUntil()` + `AbortSignal.timeout(1500)`** 으로 처리해야 SPEC의 fail-silent·지연 0 요건을 만족한다. `proxy(request)` 시그니처에 `event: NextFetchEvent` 인자 추가가 필요(기존 함수 시그니처 변경 — 계획서에 명시).

**C9. 새로고침·중복 집계**
광고 URL을 새로고침하면 같은 n_* 쿼리로 다시 기록되어 R1(24h ≥3회)·R2(10분 내 연속)가 오탐될 수 있다. 같은 cg_sid + 같은 n_ad의 짧은 시간 내 재요청은 1회로 보거나, 탐지 시 세션 단위로 세는 방식을 계획 단계에서 정할 것을 제안.

**C10. 기타 관찰 (Click Guard 범위 밖, 수정 안 함)**
- **`/ai-photo`는 proxy `ADMIN_PATHS`에 없다** → 마케팅 호스트에서 `/ai-photo` 요청이 차단되지 않고, login.에서 미인증 시 로그인 리다이렉트도 proxy 단에서 안 걸린다(페이지 내부 가드에 의존).
- `get_my_role()`에 `SET search_path`가 없다(기존 함수, R2에 따라 변경하지 않음).
