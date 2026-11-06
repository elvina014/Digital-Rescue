# Click Guard MVP 2/2 — 구현 보고 (ERP 의심 IP 조회 화면)

- 작업일: 2026-11-06
- 브랜치: `feat/click-guard` (main `78a8ebc` = 운영 반영본 기준)
- DB 적용: **로컬 Docker Supabase에만** (`npx supabase migration up --local`). 운영/`--linked` 쓰기 없음
- push 안 함

## 운영 반영 상태 확인 (MVP 1/2, 읽기 전용 조회)

| 항목 | 결과 |
|---|---|
| 마이그레이션 이력 | `20261007090000`, `20261026090000`, `20261106090000` 기록됨 |
| cg_ 테이블 | 4개 존재 |
| 수집 | `cg_ad_visits` 2건(click_key 1개), 마지막 2026-11-06 02:42 UTC — 수집 동작 중 |
| **pg_cron** | **설치 안 됨** → `docs/click-guard/cron.sql`(90일 정리)이 등록되지 않았다. 대시보드 Database → Extensions에서 pg_cron을 켠 뒤 `cron.sql`을 실행해야 처리방침의 "90일 자동 삭제"가 사실이 된다 |

## 결정·변경 사항 (요청과 다르게 한 부분)

| # | 내용 | 이유 |
|---|---|---|
| D1 | 함수 권한: 요청의 "REVOKE PUBLIC/anon 후 GRANT authenticated" 대신 `REVOKE ALL FROM PUBLIC` → `GRANT EXECUTE TO anon, authenticated, service_role` + 함수 안 ADMIN 검사 | SPEC에 기록된 2026-11-06 결정(R10/KI-8). anon에서 EXECUTE를 빼면 anon 호출 시 Postgres가 재시작될 수 있다. anon 호출은 함수 안에서 "부정클릭 감시는 관리자만 이용할 수 있습니다."로 거부된다 |
| D2 | 전환 감점은 `phone`·`kakao`·`form_submit`만 센다. `contact`(접수 섹션 이동 버튼)는 제외 | 버튼 이동은 실제 전환이 아니다. 최초 설계의 "전환(tel/kakao/form)"과 같은 기준 |
| D3 | "표시 이력"은 현재 표시 1건(상태·메모·처리자·시각)을 보여준다 | `cg_ip_marks`는 IP당 현재 상태 1행이다. 변경 이력을 남기려면 별도 로그 테이블이 필요해 만들지 않았다(범위 밖) |
| D4 | 화이트리스트: IPv4 /16, IPv6 /32보다 넓은 대역은 거부. 단일 IP는 /32·/128로 저장 | "입력 검증". 실수로 넓은 대역을 넣으면 전체가 집계에서 빠진다 |
| D5 | 저참여 판정에서 참여도 행이 없는 세션은 저참여로 본다 | 비콘이 한 번도 오지 않은 방문(즉시 이탈·봇 의심)을 놓치지 않도록. 실제로는 `cg_record_visit`가 항상 행을 만든다 |
| D6 | 클립보드 권한이 거부되면 `execCommand("copy")`로 대신 복사 | 브라우저 패널 검증에서 `navigator.clipboard.writeText`가 권한 거부됨 |
| D7 | 의심 IP 필터는 요청의 4개(미처리/네이버 등록완료/관찰/정상)만, 기본은 "미처리" | "전체" 탭은 요청에 없어 추가하지 않음 |
| D8 | 의심 점수 밖으로 내려간 IP는 표시 상태와 관계없이 목록에 나오지 않는다 (요약 카드의 "노출제한 등록 표시 n/600"은 전체 표시 수) | 요청 범위. 등록 해제 관리는 후속 |

## 변경 파일

**DB**
- `supabase/migrations/20261106120000_click_guard_review.sql` — RPC 6개, 기존 객체 변경 없음
- `supabase/test-fixtures/click-guard/rollback-review.sql` — 롤백 SQL (함수만 제거, 표시·화이트리스트 기록은 유지)
- `supabase/tests/click_guard_review.test.sql` — pgTAP 27개
- `supabase/seed/click_guard_demo.sql` — 로컬 전용 데모 시드 (로컬 시드 계정이 없으면 중단, `db.seed`에 넣지 않음)
- `src/types/supabase.ts` — 재생성 (+20줄, 추가분만)

**화면**
- `src/app/(admin)/click-guard/page.tsx` — ADMIN 가드, 기간·최소 점수·탭, 사용자 세션으로 RPC 조회
- `src/app/(admin)/click-guard/ClickGuardClient.tsx` — 요약 카드·수집 중단 경고·의심 IP 표·필터·다중 선택 복사·행 액션·확인 대화상자·토스트
- `src/app/(admin)/click-guard/IpDetailDrawer.tsx` — 상세 드로어
- `src/app/(admin)/click-guard/WhitelistPanel.tsx` — 화이트리스트 탭
- `src/app/(admin)/click-guard/actions.ts` — Server Actions (ADMIN 확인 → RPC, service role 없음)
- `src/app/(admin)/click-guard/shared.ts` — 타입·라벨
- `src/components/layout/AdminSidebar.tsx` — "부정클릭 감시" 메뉴 (ADMIN)
- `src/proxy.ts` — `ADMIN_PATHS`에 `/click-guard` 추가 (마케팅 호스트 차단, 미인증 → 로그인)

**문서**: `docs/click-guard/SPEC.md`(MVP 2/2 항목 추가), 이 보고서

## 검증 결과

| # | 항목 | 결과 |
|---|---|---|
| 1 | lint | 오류 0 (경고 16 — 기존 `<img>` 경고) |
| 1 | typecheck / build | 통과 (`/click-guard` 생성) |
| 1 | 단위 테스트 | 18/18 통과 (변경 없음) |
| 2 | 데모 시드 (24시간, 최소 점수 무시하고 점수 확인) | 아래 표 |
| 3 | MANAGER 로그인 | 사이드바에 메뉴 없음, `/click-guard` 직접 접속 → `/dashboard`로 이동 |
| 3 | RPC 직접 호출 (pgTAP) | 함수 안에서 거부 확인: anon(`cg_suspect_ips`, `cg_mark_ip`), MANAGER(`cg_suspect_ips`, `cg_ad_summary`, `cg_ip_detail`, `cg_whitelist_upsert`, `cg_whitelist_delete`) — 6개 함수 모두 같은 ADMIN 검사 첫 줄 |
| 4 | 네이버 등록 완료 | 확인 대화상자 안내문 + 모바일 100% IP에 "모바일/공용 IP일 수 있어…" 경고 + 메모 → 저장, 토스트, 필터 이동 |
| 4 | 관찰 / 정상 / 표시 해제 | 각각 저장·토스트·필터 이동 확인 |
| 4 | 새로고침 후 유지 | 표시 상태, "노출제한 등록 표시 1 / 600", 화이트리스트 목록 모두 유지 |
| 4 | 복사 | 단일 IP 복사, 다중 선택 복사 → `192.0.2.60\n203.0.113.10`(줄바꿈 구분) 확인 |
| 4 | 화이트리스트 | 행에서 추가 → 목록에서 즉시 사라짐. 탭에서 추가·삭제, 형식 오류 3종 안내(형식 / 호스트 비트 / 너무 넓은 대역) |
| 4 | 실패 시 되돌림 | 서버 액션 요청을 강제로 실패시켜 표시 상태가 원래대로 돌아오고 "서버에 연결하지 못했습니다" 토스트가 뜨는 것 확인 |
| - | 상세 드로어 | 표시 정보(상태·메모·처리자·KST 시각), 같은 대역 클릭 수, 방문 타임라인 4건 |
| - | 브라우저 콘솔 에러 | 0 |
| - | pgTAP 전체 | 1223개 중 1개 실패 — 기존 `vector_integration` #20(MVP 1/2 보고서 "알려진 문제"와 동일, 이번 변경과 무관) |
| - | `supabase db lint` | cg_ 함수 경고 없음 |

**데모 시드 판정 (cg_suspect_ips 24시간)**

| 케이스 | IP | 점수 | 사유 | 기본(60점) 목록 |
|---|---|---|---|---|
| 반복·짧은 체류 | 203.0.113.10 | 100 | 반복 유입 4, 10분 내 연속 클릭 3, 짧은 체류·무반응 4 | 노출 |
| 같은 패턴 + 전화 전환 | 198.51.100.20 | 0 | R1·R2·R3 + 전환 있음(−100) | 제외 |
| 화이트리스트 | 192.0.2.30 | — | 집계 대상 아님 | 제외 |
| 봇 UA | 203.0.113.40 | — | 집계 대상 아님 | 제외 |
| 같은 NaPm 새로고침 5회 | 198.51.100.50 | 0 | 없음 (클릭 1, R1 미해당) | 제외 |
| 심야 클릭 | 192.0.2.60 | 80 | 반복 유입 3, 짧은 체류·무반응 3, **심야 클릭 3** | 노출 |

**확인하지 못한 것**
- "수집 중단 의심" 빨간 경고는 실제로 띄워 보지 않았다(로컬 데이터가 최근이라). 조건은 마지막 수집이 없거나 24시간 이상 전.
- 500건 이상 경고색도 데이터가 없어 화면으로는 확인하지 않았다.

## 운영 반영 시 (Brad)
1. pg_cron 켜기 + `docs/click-guard/cron.sql` 실행 (MVP 1/2 미완료분)
2. `npx supabase db push --dry-run --linked` → `20261106120000_click_guard_review.sql` 1개만 나오는지 확인 후 적용
3. main 병합·push → Vercel 배포
4. 데모 시드(`supabase/seed/click_guard_demo.sql`)는 운영에 실행하지 않는다
