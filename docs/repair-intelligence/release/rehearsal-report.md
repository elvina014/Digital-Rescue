# 리허설 보고서 — Repair Intelligence 출시 (Phase 0.5 ~ 9)

## 1회차: 2026-10-04, 로컬 Docker, 커밋된 baseline 기준 (운영 덤프 전)

- 대상: 로컬 Supabase (`supabase_db_digital-rescue`, PostgreSQL 17.6). 운영은 쓰지 않음 (운영에는 SELECT만, 이번 회차에는 사용 안 함).
- 데이터: seed(가짜) + 아래 (b)에서 구 코드로 만든 데이터. **운영 데이터 없음.**
- 운영 덤프가 필요한 2회차는 Brad가 덤프한 뒤 `release-runbook.md` 단계 2대로 진행한다 (§5).

### (a) baseline 위에 0.5 ~ 9 마이그레이션 전체 적용

| 확인 | 결과 |
| --- | --- |
| `npx supabase db reset` (baseline + 14개) | ✅ 오류 없음 |
| `npx supabase test db` | ✅ **1168/1168** |
| 드리프트 비교 방법 검증: 로컬 baseline 스키마 덤프 vs Phase 0.1 운영 원본 덤프(`supabase/baseline_raw/schema.sql`) | ✅ 차이는 `CREATE EXTENSION IF NOT EXISTS "pg_graphql"` 한 줄과 빈 줄뿐 (로컬 스택이 만드는 확장. 운영 덤프끼리 비교할 때는 나타나지 않음) |

### (b) 이전 코드(`main` @ `7d237f6`) + 새 DB 호환표

방법: `git archive main`을 스크래치 폴더에 풀고 `npm ci`, 로컬 키만 넣은 `.env.local`로 `next dev -p 3100` → `login.localhost:3100`.
seed 계정(MANAGER, ADMIN)으로 화면에서 실행하고, 결과는 DB에서 직접 확인. 구매 요청 트리거만 SQL로 재현.

| 기존 흐름 (main 코드) | 영향을 주는 마이그레이션 | 결과 | DB에서 확인한 내용 |
| --- | --- | --- | --- |
| 로그인, 대시보드 위젯 | — | ✅ | 출고·구매·반환·적출 입고·폐기 확인 위젯 모두 표시 |
| **출고 승인** (`approve_material_dispatch`, service_role) | **0.5**(구매 분기 추가), **0.6a**(가드 한 줄) | ✅ 동일 | 재고 2 → 1, OUTBOUND **1건** (구 앱 fallback이 중복 기록하지 않음), 상태 approved |
| **구매 승인** | **0.5** | ⚠️ **예측대로 위험 A 재현** | 승인됨, 재고 0 그대로, 그러나 구 앱 fallback이 **가짜 OUTBOUND 1건**("자재 출고 승인") 기록 → 창 기간 구매 승인 금지 필요 (04 §2.2 A) |
| 반환 확인 (`confirmMaterialReturnAction`, 구 코드 직접 UPDATE) | 6(새 트리거) | ✅ 동일 | 상태 cancelled, 재고 +1, INBOUND "접수 취소로 인한 자재 원복" |
| 적출품 입고 승인 (`approveReturnMaterialAction`, 구 코드) | 7(라벨 기본값) | ✅ | 새 USED 행에 라벨 `P-00007` 자동 부여, INBOUND 1건. 용량 미저장·합산 방식은 **구 동작 그대로** (04 §2.2 G) |
| 폐기 확인 | — | ✅ | `dispose_confirmed_at` 기록 |
| 최종 승인 | **1**(`protect_approved_ticket` 변경) | ✅ 동일 | COMPLETED, PAID, `completed_at`, 로그 |
| 환불 요청 → 승인 → 완료 → 무효 | **0.6a**(`request_refund`, `transition_refund`, `apply_refund_material_adjustments`, `recalc_ticket_material_cost` 가드) | ✅ 동일 | R-…-001 1,000원, 자재 조정 반영·무효 시 원복, 환불액 1,000 → 0. MANAGER 본인 승인 시도 → 기존 메시지 "본인이 요청한 환불은 본인이 승인할 수 없습니다." |
| 통계 화면 | — | ✅ | 연·월 매출, 기사별, 취소율, 환불율 표시, 콘솔 오류 없음 |
| 재고 신규 등록 (session client) | 7 | ✅ | 라벨 `P-00008` 자동 (authenticated의 `ri_next_item_label` EXECUTE 확인) |
| n8n 재고 웹훅 `/api/inventory/webhook` (service_role) | 7 | ✅ | 201 created, 라벨 `P-00009` 자동 |
| 신규 접수 (테스트 체크) | 1(새 컬럼) | ✅ | 새 catalog 컬럼 NULL, `is_test = true` |
| 접수 취소 → 복원 | — (`protect_canceled_ticket` 변경 없음) | ✅ 동일 | CANCELED → NEW, 로그 2줄 |
| 구매 요청 (구 앱의 service_role UPDATE를 SQL로 재현) | **6**(새 트리거) | ✅ 플래그 OFF 통과 / ⚠️ ON이면 거부 | ON: "구매 요청은 내부 자원 확인 후에만 가능합니다." → 플래그는 새 앱 배포·교육 전까지 OFF (04 §2.2 F). 트랜잭션은 ROLLBACK |

이번 회차에서 다루지 않은 기존 흐름 → Preview 점검표에서 확인: 대고객 접수 폼(사진 업로드), CMS 편집, 기기 라벨 AI(n8n), 기사 화면(수리 시작·자재 추가·견적 제출·출고 요청), 적출품 등록(기사 화면).

관찰 (DB와 무관):
- 스크래치 폴더 경로가 길어 Turbopack이 "path length … exceeds max length" 오류를 냈고, 그 영향으로 서버 액션 `redirect()` 직후 화면이 잠깐 대고객 홈으로 보였다. 다시 열면 정상, DB 결과도 정상. 2회차는 짧은 경로(예: `C:\dr-rehearsal\main-app`)에서 실행한다.
- 자동화 브라우저에서는 `window.confirm`이 거부되므로 테스트 중에만 페이지 내에서 `true`로 바꿨다 (앱 코드 변경 없음).

### (c) `supabase/rollback/ri-full-rollback.sql` 적용 후 스키마 = baseline?

| 확인 | 결과 |
| --- | --- |
| PART A (내보내기) | ✅ `ri_rollback_backup` 33개 표 (RI 표 29 + RI 컬럼 3 + export_info). 원본·사본 행 수 차이 0. anon / authenticated / service_role 모두 이 스키마 USAGE 없음 |
| PART B (단일 트랜잭션) | ✅ 오류 없음, 약 0.5초 |
| PART C | ✅ `vector_agent` 삭제, 점검 쿼리 `0 | 0 | 0 | f | 0` |
| `ri_rollback_backup`은 PART B 후에도 남음 | ✅ (확인 후 `DROP SCHEMA … CASCADE`) |
| **스키마 덤프 비교** (`db dump` 롤백 후 vs baseline만 적용한 상태) | ✅ **차이 0줄** (2회 실행: 내보내기 없이 1회, 내보내기 포함 1회) |
| 역할·확장·storage 정책 수 | ✅ baseline과 같음 (`pg_trgm` 없음, `vector_agent` 없음, storage 정책 8개) |
| 남는 것 | storage 버킷 `ai-photos`, `donor-photos` (비어 있는 private 버킷) — SQL로 지울 수 없으므로(`storage.protect_delete`) 대시보드에서 삭제 (PART C 안내) |

### (d) data 덤프 → 빈 로컬 DB 복원 → 행 수 일치?

| 단계 | 결과 |
| --- | --- |
| 3개 파일 덤프 (`--role-only`, 스키마, `--data-only --use-copy`) | ✅ roles.sql에 비밀번호 없음 (`vector_agent`는 NOLOGIN) |
| 덤프 파일 행 수 = 원본 DB 행 수 | ✅ **83개 표 모두 일치** (`COPY` 블록을 세는 awk 명령, 런북 0.2-4) |
| 1차 복원 시도 | ❌ (의도한 실험) ① 빈 DB에도 마이그레이션이 만든 `storage.buckets` 행이 있어 중복 키 → 단일 트랜잭션이라 **아무것도 반영되지 않음** ② `storage.buckets_vectors` 권한 오류 |
| 수정 | Supabase 문서대로 덤프에 `-x "storage.buckets_vectors" -x "storage.vector_indexes"` 추가 (실제 CLI로 재확인: 81개 표, 해당 표 COPY 없음, 나머지 행 수 동일). 버킷은 대상 DB에 이미 있으면 그 블록을 빼거나, 버킷이 없는 **새 프로젝트**에 복원 |
| 2차 복원 (`--single-transaction`, `ON_ERROR_STOP=1`, 덤프 첫 줄 `SET session_replication_role = replica`) | ✅ **83/83 표 행 수 일치, 총 172행** |
| 경고 | `symptom_codes` 자기 참조 FK 때문에 pg_dump가 "circular foreign-key" 경고 → `session_replication_role = replica`가 필요 (CLI 덤프에 포함됨). 이 줄을 지우지 말 것 |

마무리: `npx supabase db reset` → `npx supabase test db` 1168/1168. `.claude/launch.json`의 임시 설정은 원래대로 되돌림. 스크래치 파일만 사용, 저장소에는 롤백 스크립트와 문서만 추가.

### 발견 사항

- **KI-16 (새로 기록):** `src/proxy.ts`의 `ADMIN_PATHS`에 Phase 9의 `/ai-photo`가 없다. 대고객 도메인에서 로그아웃 상태로 `/ai-photo` → 페이지가 `/login`으로, proxy가 다시 `/`로 보냄(문제 없음). 하지만 로그인 쿠키는 `.digital-rescue.com` 전체에 공유되므로, 로그인한 직원이 `digital-rescue.com/ai-photo`를 열면 관리자 화면이 대고객 도메인에서 열린다. 데이터 권한은 같고 노출 범위만 다르다. 코드 수정은 별도 승인 (`known-issues.md` KI-16).

## 2회차: 2026-10-05, 로컬 Docker, 운영 덤프 기반 — 4가지 모두 통과

`release-runbook.md` 단계 1 ~ 2. Brad 확인(2026-10-05) 후 실시. 운영에는 SELECT만 (MCP 읽기 전용, `db dump`, `migration list`).
- 덤프: 2026-10-05 `D:\backup\2026-10-05` (roles / schema / data, data는 `-x buckets_vectors -x vector_indexes`). 저장소 밖 그대로 읽음.
- 운영 데이터는 로컬 Docker DB와 스크래치에만 있었고, 끝난 뒤 `db reset`(seed) + 스크래치 사본 삭제 + `C:\dr-rehearsal` 삭제. 이 보고서에 고객 정보 없음.

### 단계 0.1 · 0.2-4 · 1

| 확인 | 결과 |
| --- | --- |
| 0.1 pgTAP / typecheck / lint / build / workflow-check | ✅ 1168/1168, 0 오류, 0 오류(경고 16), 성공, 20/20 |
| 0.2-4 검증 1 (roles·schema에 비밀정보) / roles.sql의 `vector_agent` | ✅ 0건 / 없음 |
| 0.2-4 검증 2 행 수 (data.sql vs 운영 SELECT) | ✅ `public` 18/18 일치, `auth` 일치 (`repair_tickets` 518, `inventory_items` 31) |
| 1-1 schema 덤프 비밀·데이터·ref·role 검사 | ✅ 0건 |
| 1-2 `baseline_raw/schema.sql` vs 새 운영 schema 덤프 | ✅ 차이 0줄 |
| 1-3 카탈로그 패리티 (`supabase/test-fixtures/release/parity.sql`, 운영 MCP vs 로컬 baseline) | ✅ 12/13 동일 + extensions는 로컬 `pg_graphql`만 차이 (허용) |
| 3.2 미리보기: `migration list --linked` | ✅ baseline 양쪽, 나머지 14개 Local만 |

패리티 메모: 함수 본문 해시가 처음에는 10개 달랐다. 원인은 줄바꿈 — Windows checkout의 baseline이 CRLF로 적용되어 로컬 함수 17개 모두 `\r`을 포함, 운영은 7개만 포함. `\r`을 빼면 17개 모두 동일 → `parity.sql`은 `replace(prosrc, E'\r', '')`로 비교한다. 실제 차이 아님.

### (a) 운영 데이터 위에 14개 적용

| 확인 | 결과 |
| --- | --- |
| 복원 (`storage.buckets` 블록 제외) → 행 수 vs `counts-file.tsv` | ✅ 49/49 일치 |
| `migration up --local` | ✅ 14개 오류 없음 |
| 3.4 확인 쿼리 | ✅ R10 0행 / `t,t` / `f,f,f` / 9 / `31,31` / 버킷 2개 private 10 MB / `vector_agent` `f,3` / 새 표 `0,0,0,0` |
| 기존 행 불변 (적용 전 스냅숏의 모든 원래 컬럼 값 vs 적용 후, 14개 표 3,292행) | ✅ 누락 0, 변경 0 |

### (b) 이전 코드(`main` @ `7d237f6`) + (a)의 DB

방법: `git archive main` → `C:\dr-rehearsal\main-app`, 로컬 키만, `next dev -p 3100`. 로그인은 Brad 계정 대신 seed의 `@example.test` 계정 6개를 **로컬 DB에만** 추가해서 사용 (운영 비밀번호 입력 없음).

화면 (읽기): 대시보드, 접수 목록, 재고, 통계, 신규 접수·재고 등록 폼 → 200. 접수 상세 18건(상태 6종 + 환불 건 5 + 자재 건 7) → 18/18 정상. 대고객 홈 + 브랜드 14개 → 정상. 콘솔 오류 없음.

쓰기 (구 앱이 하는 호출 그대로, 실제 운영 행으로, 각각 ROLLBACK). **같은 스크립트를 "운영 데이터 + baseline"(적용 전)에서도 실행해 출력 diff:**

| 흐름 | 영향 마이그레이션 | 적용 전 vs 후 |
| --- | --- | --- |
| T1 출고 승인 `approve_material_dispatch` (실제 대기 건, service_role) | 0.5, 0.6a | 같음 — 재고 19 → 18, OUTBOUND 1건, approved |
| T2 최종 승인 (MANAGER, 직접 UPDATE) | 1 | 같음 — COMPLETED / PAID |
| T3 승인된 접수건 수정 | 1 | 같음 — "승인 완료된 접수건은 수정할 수 없습니다." |
| T4 환불 본인 승인 거부 / 요청 → 승인 → 완료 → 무효 (카드 부분취소 10,000원) | 0.6a | 같음 — 거부 메시지 동일, 환불액 10,000 → 무효 후 0 |
| T5 자재비 재계산 | 0.6a | 같음 |
| T6 취소건 복원 CANCELED → NEW | — | 같음 |
| T7 재고 신규 등록 (authenticated) | 7 | **예상된 차이만** — 적용 후 라벨 자동 부여 |

구매 승인(위험 A)은 운영 데이터에 대기 중인 구매 요청이 없어 재현 대상 없음 → 1회차 결론과 직원 공지(런북 3.1) 그대로.

### 2-3 0.6a 정확성 · R10

- `db reset --version 20260928043331` vs `--version 20260928043332`의 모든 public 함수 정의(`\r` 제외) diff: **추가 5줄, 삭제 0줄** — `approve_material_dispatch`, `apply_refund_material_adjustments`에 `ri_api_guard_definer('{anon,authenticated}')`, `recalc_ticket_material_cost`, `request_refund`, `transition_refund`에 `('{anon}')` 각 한 줄. 트리거 함수 3개(`generate_refund_no`, `protect_canceled_ticket`, `sync_ticket_refunded_amount`)는 권한만 변경 — 마이그레이션 주석과 일치.
- R10 0행 ((a)에서). pgTAP 1168/1168 (seed).
- `db lint --local --level warning`: 경고 7개 — 모두 `text[]`/`uuid[]`/`jsonb` 변수의 `'{}'` 초기값을 plpgsql_check가 text로 보는 것 (`repair_gate_check`, `ri_purchase_resources`, `ai_photo_propose`). 유효한 PL/pgSQL, 테스트 통과 → 출시 차단 아님.

### (c) 전체 롤백 후 스키마 = baseline

운영 데이터 + 14개 적용 DB에서 PART A → 확인 0행 → PART B **479 ms**(1회차 0.5초) → PART C 확인 `0 | 0 | 0 | f | 0` → `ri_rollback_backup` 삭제 → 스키마 덤프 vs baseline 덤프: **차이 0줄**. 남는 것은 빈 버킷 2개(`donor-photos`, `ai-photos`).
롤백 후 행 수 vs 덤프: 운영 행 모두 그대로 (차이는 로컬 테스트 계정 +6, 버킷 +2뿐).

### (d) data 덤프 → 빈 로컬 DB(14개 적용) 복원

`db reset --no-seed` → `truncate symptom_codes cascade` → 복원 exit 0 → 49/49 일치 (`storage.buckets`만 4 vs 2 — 복원에서 제외, 마이그레이션이 만든 버킷).

### 2-6 정리

`db reset` → 1168/1168. 운영 데이터 사본(스크래치 `data-nobuckets.sql`, 결과 파일, `C:\dr-rehearsal`) 삭제. 로컬 DB에 운영 고객·사용자 행 0건 확인. `.claude/launch.json` 임시 설정 제거.
