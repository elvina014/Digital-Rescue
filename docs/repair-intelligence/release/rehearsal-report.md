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

## 2회차: 운영 덤프 기반 (Brad 덤프 후 — 미실시)

`release-runbook.md` 단계 2의 2-1 ~ 2-6. 결과는 이 아래에 기록한다.
- 전제: 운영 데이터(고객 개인정보 포함)가 로컬 Docker DB에 올라간다 → Phase 0.1 수용 기준 "No production data locally"와 충돌한다.
  Brad의 2026-10-04 지시(3-a "새 운영 덤프 기반 로컬 DB", 3-d "data 덤프를 빈 로컬 DB에 복원")에 따른 예외로 보되, **시작 전에 Brad가 한 번 더 확인**한다 (R8).
  조건: 리허설 직후 `npx supabase db reset`으로 seed 상태로 되돌린다, 덤프 파일은 저장소 밖에만 둔다, 화면 캡처·보고서에 고객 정보를 남기지 않는다.
