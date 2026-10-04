# 출시 런북 — Repair Intelligence (Phase 0.5 ~ 9)

순서대로 실행한다. 각 단계: **누가 / 명령·화면 / 기대 출력 / 중단 조건 / 되돌리기**.
배경·이유: `../04-final-release-plan.md`. 수동 점검: `regression-checklist.md`.

- 운영 프로젝트 ref: `wnddkgeohcgcidoklrps`. 비밀번호·접속 문자열·키는 **어떤 파일에도, 채팅에도 남기지 않는다.**
- Claude는 운영에 **SELECT만** 한다. 운영 쓰기(마이그레이션, 데이터 정리, 설정)는 모두 Brad.
- Claude는 push / merge / 배포를 하지 않는다 (R7). PR과 병합은 Brad.
- 운영 SQL Editor: `postgres`로 일반 SQL만. **"Run as role" 금지** (KI-8).
- 중단 조건에 걸리면: 다음 단계로 가지 말고, 출력 원문(비밀값 제외)을 Claude에게 전달한다.

## 진행 기록 (Brad가 채움)

| 단계 | 시작 시각 | 끝난 시각 | 결과 / 메모 |
| --- | --- | --- | --- |
| 0 사전 조건 | | | |
| 1 스키마 재덤프·드리프트 | | | |
| 2 리허설 (Claude) | | | |
| 3 운영 마이그레이션 | | | `db push` 시각 = 창(window) 시작: |
| 4 PR·Preview 준비 | | | |
| 5 Preview 점검·정리 | | | 점검 시작 시각: |
| 6 병합·운영 확인 | | | 창 종료 시각: |
| 7 출시 후 작업 | | | "실패 실행 저장" OFF 전환일: |

---

## 단계 0 — 사전 조건

**누가:** Claude (로컬) + Brad (Vercel)

1. Claude, 로컬:
   ```bash
   git status --short
   npx supabase db reset
   npx supabase test db
   npm run typecheck && npm run lint && npm run build
   node supabase/test-fixtures/phase9/workflow-check.mjs
   ```
   기대: `git status`에 커밋 안 된 코드 변경 없음 (현재 `.gitignore`, `.claude/settings.local.json`의 변경은 Brad 결정 — 출시 커밋에 넣지 않음) /
   `db reset` 성공 / pgTAP **1168 pass** / typecheck 0 오류, lint 0 오류(경고 16개는 기존), build 성공 / workflow-check **20/20 PASS**.
2. Brad, Vercel → Project → **Deployments** → Production 배포의 커밋이 `7d237f6`(`main`)인지 확인.
3. Brad, Supabase 대시보드 → **Database → Backups**: 최근 일일 백업이 있는지(또는 PITR 사용 여부) 확인, 시각 기록.

**중단:** 테스트 실패, 운영 배포 커밋이 `7d237f6`이 아님(그 사이 `main`이 바뀌었다면 PR 충돌·회귀 범위를 다시 본다), 백업 없음 → Brad 결정.
**되돌리기:** 없음 (읽기만).

---

## 단계 1 — 운영 스키마 재덤프와 드리프트 확인

**목적:** Phase 0.1 기준점(`20260927141005_baseline.sql`) 이후 운영 스키마가 대시보드 등에서 바뀌지 않았는지 확인. 바뀌었다면 마이그레이션이 운영에서 다르게 동작할 수 있다.

### 1.1 덤프 (Brad가 직접 실행, 비밀번호는 포함하지 않음)

권장 — 프로젝트 연결 후 덤프 (비밀번호는 프롬프트에서만 입력, 명령 기록에 남지 않음):
```bash
npx supabase login
```
```bash
npx supabase link --project-ref wnddkgeohcgcidoklrps
```
```bash
npx supabase db dump --linked -f supabase/baseline_raw/prod-schema-release.sql
```

대안 — Phase 0.1과 같은 방식 (대시보드 → Connect → **Session pooler** URI. URI에 비밀번호가 들어 있으므로 Claude에게 붙여넣지 말 것):
```bash
npx supabase db dump --db-url "<SESSION_POOLER_URI>" -f supabase/baseline_raw/prod-schema-release.sql
```

- 기본 `db dump` = **스키마만** (데이터 없음), Supabase 관리 스키마(auth, storage …) 제외. `--data-only`, `--role-only` 쓰지 않는다.
- `supabase/baseline_raw/`는 git에서 제외되어 있다 (`supabase/.gitignore`). 이 파일은 커밋되지 않는다.
- 기대 출력: `Dumping schemas from remote database...` 후 `Dumped schema to …/prod-schema-release.sql`. 크기 약 90–100 KB (기준 덤프 `schema.sql`은 93,858 바이트).
- 끝나면 Claude에게 "덤프 완료"라고만 알린다.

**중단:** 오류, 파일이 비어 있음.

### 1.2 Claude가 덤프로 하는 일 (읽기만, 운영에는 SELECT만)

1. **비밀·데이터 점검** (Phase 0.1 plan 2b와 동일). 파일을 다른 곳에 복사하기 전에 실행:
   ```bash
   grep -niE "postgres(ql)?://|password|passwd|pooler\.supabase|:6543|:5432|sslmode|PGPASSWORD|service_role_key|anon_key|eyJhbGci" supabase/baseline_raw/prod-schema-release.sql
   grep -nE "^(COPY |INSERT INTO)" supabase/baseline_raw/prod-schema-release.sql
   grep -n "wnddkgeohcgcidoklrps" supabase/baseline_raw/prod-schema-release.sql
   grep -niE "CREATE ROLE|ALTER ROLE|ENCRYPTED PASSWORD|SCRAM-SHA" supabase/baseline_raw/prod-schema-release.sql
   ```
   기대: 일치 없음 (정상 SQL의 단어 일치는 줄 번호와 함께 설명). 무엇이든 의심스러우면 Claude는 멈추고 파일을 쓰지 않으며 줄 번호만 보고한다.
2. **드리프트 비교** — 기준점을 만든 원본 덤프와 비교 (줄바꿈만 정규화):
   ```bash
   diff <(tr -d '\r' < supabase/baseline_raw/schema.sql) <(tr -d '\r' < supabase/baseline_raw/prod-schema-release.sql)
   ```
   기대: **차이 없음**, 또는 pg_dump 버전 주석 같은 설명 가능한 줄만.
3. **카탈로그 패리티** — `pg_dump`가 보여주지 않는 storage 버킷·정책과 함수 ACL까지 포함. Phase 0.1과 같은 13개 범주(컬럼, enum, 함수(인자·DEFINER·proconfig·ACL·본문 md5), 트리거, RLS, 정책(public + storage), 인덱스, 제약, 주석, 테이블/시퀀스 ACL, 버킷, 확장)를
   운영(MCP, SELECT)과 로컬(`db reset --version 20260927141005 --no-seed` 상태)에서 같은 쿼리로 해시 비교. 쿼리는 리허설 세션에서 `supabase/test-fixtures/release/parity.sql`로 저장한다.
   기대: 13/13 동일.
4. 결과를 `release/rehearsal-report.md`(리허설 세션에서 작성)에 기록.
5. **덤프 파일의 이후 처리:** 드리프트 비교와 리허설 판단 근거로만 쓴다. 로컬 DB에 적용하지 않는다 (차이가 없으면 커밋된 baseline이 운영과 같으므로 baseline으로 리허설한다). 커밋하지 않고, 다른 곳에 복사하지 않는다.
   출시가 끝나면 Brad가 삭제 여부를 정한다.

**중단:** 비밀·데이터 발견, 설명할 수 없는 스키마 차이, 패리티 불일치 → Brad에게 차이 목록 보고. 차이를 반영하는 방법(새 마이그레이션 등)은 별도 계획·승인 후.
**되돌리기:** 없음 (읽기만).

---

## 단계 2 — 리허설 (Claude, 로컬 Docker 전용, 운영 아님)

단계 1이 깨끗하면 로컬 baseline = 운영이므로 로컬 리허설이 운영과 같은 스키마에서 이루어진다. 데이터는 seed(가짜)만 쓴다.

```bash
npx supabase db reset --version 20260928043331 --no-seed
```
→ baseline + #1(0.5)까지. 이 시점의 8개 함수 정의를 저장 (0.6a 검사용).
```bash
npx supabase migration up --local
```
기대: `Applying migration 20260928043332_api_guard_baseline.sql...` 부터 `20261004110000_ai_photo_recognition.sql`까지 **13개**가 파일 순서대로 적용, 오류 없음.

검사:
1. **0.6a 정확성** (04 §4-3): 8개 함수 = #1 직후 정의 + `PERFORM public.ri_api_guard_definer(...)` 한 줄 (`\r` 차이만 허용).
2. **R10 불변식** (04 §4-4): 0행.
3. 운영 확인 쿼리(단계 3.4)를 로컬에서 실행 → 기대값과 같음.
4. 전체 재설정 후 테스트:
   ```bash
   npx supabase db reset
   npx supabase test db
   npx supabase db advisors --local --type all --level info
   ```
   기대: **1168 pass**, advisors 새 WARN 없음 (기존 14개).
5. **롤백 리허설** (04 §5.3 역순): 9 → KI-14 → 8 → 0.6(a+b) → 7 → 6 → 5 → 4 → 3 → 2 → 1 → 0.5. 끝난 뒤 카탈로그 스냅샷 = baseline 상태 (단계 1.2-3 쿼리). 그다음 `npx supabase db reset`으로 복구.
6. 결과·소요 시간을 `release/rehearsal-report.md`에 기록하고 커밋 (로컬만).

**중단:** 어떤 마이그레이션이든 실패, 검사 불일치, 같은 단계 두 번 실패 → Brad에게 보고 (R8).
**되돌리기:** `npx supabase db reset` (로컬).

---

## 단계 3 — 운영 마이그레이션 (Brad) — 여기서 창(window) 시작

**시점:** 업무 종료 후. 단계 3 → 6을 **같은 날** 끝낼 수 있을 때 시작 (04 §2.2).

### 3.1 준비
1. 직원 공지: "오늘 저녁 시스템 점검. 점검 중 **구매 승인 금지**, 재고 등록 금지. 이상하면 바로 알려주세요."
2. n8n: 재고 입고 웹훅 워크플로(`/api/inventory/webhook` 호출)를 **비활성화** (마이그레이션 동안 `inventory_items` 쓰기 방지, 04 §2.2 G).
3. 진행 기록표에 시각 기록.

### 3.2 마이그레이션 목록 확인
```bash
npx supabase link --project-ref wnddkgeohcgcidoklrps
```
```bash
npx supabase migration list --linked
```
기대: `20260927141005`는 Local·Remote 모두, 나머지 **14개는 Local만**. Remote에만 있는 버전 없음.
**중단:** Remote에만 있는 버전, 또는 baseline이 Remote에 없음 (KI-6 상태가 바뀜).

### 3.3 적용
```bash
npx supabase db push --linked --dry-run
```
기대: 적용 예정 목록이 정확히 아래 14개, 이 순서:
`20260928043331` `20260928043332` `20260928102040` `20261001134000` `20261001134100` `20261001221915` `20261003054457`
`20261003062351` `20261003064945` `20261003121512` `20261003141631` `20261004090000` `20261004100000` `20261004110000`.
```bash
npx supabase db push --linked
```
- 확인 프롬프트에 `Y`. `--include-all`, `--include-seed`, `--include-roles`는 **쓰지 않는다** (seed는 가짜 데이터, 역할은 마이그레이션이 만든다).
- 기대: 각 파일마다 `Applying migration <파일>...`, 마지막에 `Finished supabase db push.`
- 시각을 진행 기록표에 적는다 (= 창 시작, 단계 6.3에서 사용).

**중단 (실패 시):**
- 실패한 파일명과 오류 원문을 기록, **다시 실행하지 않는다**.
- 실패한 파일은 적용되지 않고, 그 앞의 파일은 적용·기록된 상태다 (`migration list --linked`로 확인). 구 앱은 앞선 어떤 지점에서도 동작한다 (04 §2.2).
- 특히 확인할 곳: `CREATE EXTENSION pg_trgm`(#3), `CREATE ROLE vector_agent`(#12), `INSERT INTO storage.buckets`(#7, #14). 운영 권한이 로컬과 다르면 여기서 실패할 수 있다.
- Claude에게 오류 원문 전달 → 원인 확인 후 재개 또는 롤백을 Brad가 결정.

### 3.4 확인 (SQL Editor, `postgres`, 읽기 전용)
```bash
npx supabase migration list --linked
```
기대: 15개 버전 모두 Local·Remote 일치.

```sql
-- R10 불변식: 0행
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','graphql_public')
   and (not has_function_privilege('anon', p.oid, 'EXECUTE')
     or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
     or not has_function_privilege('service_role', p.oid, 'EXECUTE'));

-- 0.5 + 0.6a: true | true
select position('v_request_type' in d) > 0, position('ri_api_guard_definer' in d) > 0
  from (select pg_get_functiondef('public.approve_material_dispatch(uuid,uuid)'::regprocedure) d) x;

-- 플래그: f | f | f
select ri_approval_gate_enabled, ri_cancel_gate_enabled, ri_purchase_guard_enabled from global_settings;

-- Phase 2: 9
select count(*) from symptom_codes;

-- Phase 7: 두 값이 같고 31 이상
select count(*), count(distinct label_code) from inventory_items;

-- Phase 4 / 9 버킷: donor-photos f 10485760 / ai-photos f 10485760 {image/webp}
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id in ('donor-photos','ai-photos') order by id;

-- Phase 8: false | 3
select rolcanlogin, rolconnlimit from pg_roles where rolname = 'vector_agent';

-- 새 테이블은 비어 있음: 0 0 0 0
select (select count(*) from catalog_models), (select count(*) from part_specs),
       (select count(*) from donor_devices), (select count(*) from ai_candidates);

-- 창 감시 기준값 (단계 5.4, 6.3에서 비교): 기록해 둘 것
select count(*), sum(quantity), md5(string_agg(id::text || ':' || quantity, ',' order by id)) from inventory_items;
```
**중단:** 기대와 다른 값 하나라도.

### 3.5 구 앱 확인 (운영 `login.digital-rescue.com`, 쓰기 없이)
- 대시보드, 접수건 목록·상세, 재고 관리, 통계가 오류 없이 열린다.
- n8n 재고 입고 웹훅 워크플로 **재활성화**.

**되돌리기 (단계 3):** 04 §5.3의 DB 롤백 (역순, 각 파일을 SQL Editor에서 `postgres`로) 후
`npx supabase migration repair --status reverted <되돌린 버전들>` → `migration list --linked`로 baseline만 남았는지 확인.
신규 RI 테이블은 비어 있으므로 이 시점의 롤백은 데이터 손실이 없다 (라벨 코드 제외).

---

## 단계 4 — PR과 Preview 준비 (Brad)

### 4.1 PR
Claude는 push하지 않는다. Brad:
```bash
git push -u origin feat/repair-intelligence
```
```bash
gh pr create --base main --head feat/repair-intelligence --title "Repair Intelligence (Phase 0.5–9)"
```
(또는 GitHub 화면에서 PR 생성.) 기대: Vercel이 Preview 배포를 만들고 **Ready**. 
**중단:** Preview 빌드 실패 → 로그를 Claude에게.

### 4.2 Preview 환경 변수 확인 (Vercel 대시보드)
Vercel → Project → **Settings → Environment Variables** → 환경 **Preview** 필터 (브랜치 `feat/repair-intelligence` 전용 값이 있는지도 확인). 표: 04 §3.1.
- `NEXT_PUBLIC_SUPABASE_URL` = `https://wnddkgeohcgcidoklrps.supabase.co` 인지 **직접 눈으로** 확인. 키 두 개가 같은 프로젝트의 것인지 확인.
- `N8N_RI_PHOTO_*`는 비워 둔다 (04 §7 전까지). `N8N_NEW_TICKET_WEBHOOK_URL`은 둘지 정한다.
- 값을 바꿨다면 Deployments → Preview → **Redeploy**.

**중단:** Preview가 운영이 아닌 Supabase를 가리킴 → 이 계획(운영 데이터로 Preview 점검)이 성립하지 않음. 계속할지 Brad 결정.

### 4.3 Preview 도메인 (관리자 화면에 필요)
Vercel → Settings → **Domains** → `login.preview.digital-rescue.com` 추가 → Git Branch = `feat/repair-intelligence` → DNS에 Vercel이 안내하는 CNAME 추가.
CMS도 Preview에서 보려면 `edit.preview.digital-rescue.com`도 같은 방식으로. 이유: 04 §3.2.
기대: `https://login.preview.digital-rescue.com/login`에 로그인 화면.
**중단:** 도메인이 다른 배포(운영)를 가리킴.

### 4.4 Deployment Protection
Preview가 Vercel 인증으로 보호되면 Vercel에 로그인한 브라우저로 연다. 우회 토큰은 만들지 않는다.

**되돌리기 (단계 4):** PR 닫기, 브랜치 도메인 제거. DB는 그대로 (구 앱 정상).

---

## 단계 5 — Preview 점검과 정리 (Brad)

### 5.1 점검
`regression-checklist.md` 0 → 1 → 2장. 시작 시각을 진행 기록표에 기록 (5.4에서 사용).

### 5.2 중단 조건
- 재고 수량·이력, 접수건 금액·상태, 환불이 기대와 다름 → 점검 중지, **병합하지 않음**, 해당 화면·접수번호를 Claude에게.
- 구 앱(운영)에서 직원이 이상을 보고 → 같음.
- 수정이 필요하면: 별도 계획·승인 → 브랜치에서 수정 → Preview 재배포 → 해당 항목 재점검.

### 5.3 정리
`regression-checklist.md` 3장 (앱 화면으로).

### 5.4 잔여 데이터 확인 (SQL Editor, `postgres`, 읽기 전용)
`<TEST_START>` = 5.1 시작 시각 (예: `'2026-10-10 19:00+09'`).
```sql
-- 남은 테스트 마스터 데이터 (기대: 삭제했거나 비활성인 것만)
select 'model' k, name, created_at from catalog_models where name like '[테스트]%'
union all select 'board', board_number, created_at from catalog_boards where created_at >= '<TEST_START>'
union all select 'part_spec', name, created_at from part_specs where name like '[테스트]%'
union all select 'location', code || ' active=' || is_active, created_at from storage_locations where code like 'TEST%'
union all select 'symptom', code || ' active=' || is_active, created_at from symptom_codes where code like 'TEST.%'
union all select 'note', left(body, 30), created_at from model_notes where body like '[테스트]%'
union all select 'donor', donor_no || ' ' || status, created_at from donor_devices where created_at >= '<TEST_START>'
union all select 'ai_candidate', candidate_type || ' ' || status, created_at from ai_candidates where created_at >= '<TEST_START>';

-- 테스트 접수건: 전부 is_test = true, 상태는 COMPLETED 또는 CANCELED
select t.receipt_no, t.status, t.is_test, c.name
  from repair_tickets t join customers c on c.id = t.customer_id
 where t.created_at >= '<TEST_START>' order by t.created_at;

-- 실제 재고가 그대로인가: 점검 전부터 있던 행의 수량 (단계 3.4 기준값과 같은 값이어야 함, 점검 중 실제 업무가 없었다면)
select count(*), sum(quantity), md5(string_agg(id::text || ':' || quantity, ',' order by id))
  from inventory_items where created_at < '<TEST_START>';

-- 테스트 재고 행: 수량 0 (또는 삭제됨)
select i.label_code, p.name, i.quantity from inventory_items i join inventory_products p on p.id = i.product_id
 where p.name like '[테스트]%' order by i.label_code;
```
- 첫 번째 결과에 실제 업무 데이터가 섞여 나오면 무시하지 말고 확인 (같은 시간대에 직원이 만든 보드 등).
- 남은 테스트 행의 **SQL 삭제는 Brad 결정**: `BEGIN;` … `ROLLBACK;`으로 먼저 영향 행 수를 확인한 뒤에만 `COMMIT`. FK가 RESTRICT인 표(수리 기록, 근거, 구매 사유 로그, 환불, Donor)는 앱 정리를 우선한다.

**되돌리기 (단계 5):** 테스트 데이터는 위 정리로. 앱·DB 변경 없음.

---

## 단계 6 — 병합과 운영 확인 (Brad) — 여기서 창 종료

### 6.1 병합
GitHub에서 PR **Merge** (Brad). Vercel → Deployments → Production이 병합 커밋으로 **Ready** → 진행 기록표에 시각 (= 창 종료).
**중단:** 운영 빌드 실패 → 운영은 이전 배포 유지(Vercel은 실패한 빌드를 승격하지 않음). 로그를 Claude에게.

### 6.2 운영 스모크
`regression-checklist.md` 4장.

### 6.3 창 기간 감시 (읽기 전용)
```sql
-- 구 앱이 구매 승인 시 넣은 가짜 OUTBOUND (04 §2.2 A). 기대: 0행
select t.id, t.created_at, t.ticket_id, t.item_id, t.quantity_changed, t.notes
  from inventory_transactions t
  join ticket_materials m on m.ticket_id = t.ticket_id and m.inventory_item_id = t.item_id
 where m.request_type = 'purchase'
   and t.transaction_type = 'OUTBOUND'
   and t.created_at >= '<DB_PUSH_TIME>';

-- 창 동안 구 앱 경로로 입고된 행 (병합된 USED 행, 04 §2.2 G) — 정보용
select i.label_code, p.name, i.condition, i.quantity, i.updated_at
  from inventory_items i join inventory_products p on p.id = i.product_id
 where i.updated_at >= '<DB_PUSH_TIME>' and i.updated_at < '<MERGE_TIME>' order by i.updated_at;

-- 플래그는 여전히 f | f | f
select ri_approval_gate_enabled, ri_cancel_gate_enabled, ri_purchase_guard_enabled from global_settings;
```
첫 쿼리에 행이 있으면 목록을 기록하고 처리 방법은 Brad 결정 (Claude는 운영 데이터를 바꾸지 않음, R9).

### 6.4 정리
- Vercel 브랜치 도메인(`login.preview…`, `edit.preview…`) 제거 또는 Phase 10용으로 유지 — Brad 결정.
- 직원 공지: 점검 종료, 새 메뉴 안내 (교육은 04 §8.2).

**되돌리기 (단계 6):**
1. **앱만 (우선):** Vercel → Deployments → 직전 Production 배포 → **Instant Rollback** (또는 병합 커밋 revert 후 배포). DB는 그대로 — 구 앱은 새 DB에서 동작한다 (04 §2.2).
2. **DB까지:** 앱을 먼저 되돌린 뒤 04 §5.3 역순 롤백 + `migration repair --status reverted`. 출시 후 RI 테이블에 쌓인 데이터(수리 기록, 라벨, 근거 등)는 사라진다 → 반드시 Brad 결정, 가능하면 Claude와 원인 확인 먼저.

---

## 단계 7 — 출시 후 작업 (Brad, 일정은 Brad 결정)

1. **AI 사진 인식** — 04 §7 (워크플로 가져오기, 자리 표시자, 운영 변수 + Redeploy, 헤더 점검, 사진 3장, 시간, OpenRouter 설정, 버킷 확인).
2. **"실패 실행 저장"** — 04 §7.1: 초기 검증 동안만 ON → 통과하면 OFF, 남은 실패 실행 삭제, 전환일 기록.
3. **모델명 매핑 백필** — 04 §8.1.
4. **직원 교육** — 04 §8.2 (플래그 OFF 상태에서).
5. **수리 기록 게이트·구매 가드 OFF 유지** — 04 §8.3, ON 시점은 Brad 결정.
6. **VECTOR 활성화** — 04 §8.4 (Phase 8 운영 절차, `temp_file_limit`은 Supabase 지원 요청).
7. **OpenRouter 자리 표시자** — 04 §8.5 (= 1번 안에서).
8. Phase 10 — 실제 수리 데이터가 쌓인 뒤 별도 계획 (`02-roadmap.md`).
