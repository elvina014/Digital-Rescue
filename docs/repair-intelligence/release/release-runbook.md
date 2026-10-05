# 출시 런북 — Repair Intelligence (Phase 0.5 ~ 9)

순서대로 실행한다. 각 단계: **누가 / 명령·화면 / 기대 결과 / 확인 방법 / 중단 조건 / 되돌리기**.
배경·이유: `../04-final-release-plan.md`. 수동 점검: `regression-checklist.md`. 리허설 결과: `rehearsal-report.md`.

## 원칙 — 백업 우선 · 즉시 롤백 가능

1. **백업이 먼저다.** 단계 0의 백업 8가지가 모두 끝나고 검증되기 전에는 운영에 아무것도 적용하지 않는다.
2. **모든 단계는 되돌릴 수 있어야 한다.** 단계마다 되돌리기 방법이 있고, 롤백은 세 수준으로 준비한다 (맨 아래 "롤백 L1 / L2 / L3"):
   - **L1 앱만** — Vercel Instant Rollback (수 초). DB는 그대로 둔다. 구 앱이 새 DB에서 동작함은 리허설 (b)에서 확인했다.
   - **L2 DB 스키마** — `supabase/rollback/ri-full-rollback.sql` (RI 데이터는 먼저 내보냄).
   - **L3 덤프 복원** — 단계 0 덤프로 복원. **덤프 이후의 운영 데이터는 모두 잃는다.** 최후 수단.
3. 운영 Supabase는 **Free 플랜**이다 (2026-10-04 확인): 대시보드 자동 백업·복원과 PITR이 **없다**. 그래서 단계 0의 `db dump` 3종이 유일한 DB 백업이다.

공통 규칙
- 운영 프로젝트 ref: `wnddkgeohcgcidoklrps`. 비밀번호·접속 문자열·키는 **어떤 파일에도, 채팅에도 남기지 않는다.** 비밀번호는 CLI 프롬프트에만 입력한다.
- Claude는 운영에 **SELECT만** 한다. 운영 쓰기(마이그레이션, 데이터 정리, 설정, 롤백)는 모두 Brad.
- Claude는 push / merge / 배포를 하지 않는다 (R7). 태그 push, PR, 병합은 Brad.
- 운영 SQL Editor: `postgres`로 일반 SQL만. **"Run as role" 금지** (KI-8).
- 중단 조건에 걸리면 다음 단계로 가지 말고, 출력 원문(비밀값 제외)을 Claude에게 전달한다.
- 명령은 Git Bash 기준이다 (`npx`는 PowerShell에서도 같다; `awk`, `diff`는 Git Bash).

## 진행 기록 (Brad가 채움)

| 단계 | 시작 | 끝 | 결과 / 메모 |
| --- | --- | --- | --- |
| 0 사전 조건·백업 | | | 백업 폴더: |
| 1 드리프트 확인 | | | |
| 2 리허설 (Claude) | | | |
| 3 운영 마이그레이션 | | | `db push` 시각 = 창 시작: |
| 4 PR·Preview 준비 | | | |
| 5 Preview 점검·정리 | | | 점검 시작 시각: |
| 6 병합·운영 확인 | | | 병합 시각 = 창 종료: |
| 7 출시 후 작업 | | | "실패 실행 저장" OFF 전환일: |

### 백업 기록 (단계 0.2에서 채움 — 값이 아니라 위치·식별자만)

| 항목 | 기록 |
| --- | --- |
| Git 태그 `pre-ri-release` → 커밋 | |
| Vercel 플랜 (Hobby / Pro) | |
| Vercel 현재 Production 배포 ID (`dpl_…`) / URL (`….vercel.app`) / 커밋 | |
| Supabase 플랜 / 자동 백업 / PITR | Free / 없음 / 없음 (2026-10-04 확인, 0.2-3에서 재확인) |
| 덤프 폴더 (저장소 밖) | |
| roles.sql / schema.sql / data.sql 크기 | |
| 행 수 비교 결과 (0.2-4) | |
| Vercel 환경 변수 이름 목록 파일 | |
| n8n 워크플로 JSON 파일들 | |
| Cloudflare DNS 내보내기 파일 / SSL 모드 | |

---

## 단계 0 — 사전 조건과 배포 전 백업

### 0.1 로컬 확인 (Claude)
```bash
git status --short
npx supabase db reset
npx supabase test db
npm run typecheck && npm run lint && npm run build
node supabase/test-fixtures/phase9/workflow-check.mjs
```
기대: 커밋 안 된 코드 변경 없음 (`.gitignore`, `.claude/settings.local.json`은 Brad 결정 — 출시 커밋에 넣지 않음) / pgTAP **1168 pass** /
typecheck 0 오류, lint 0 오류(기존 경고 16개), build 성공 / workflow-check **20/20 PASS**.

### 0.2 배포 전 백업 (Brad) — 8가지

백업 폴더는 **저장소 밖, 클라우드 동기화(OneDrive 등) 밖**에 만든다. 예: `C:\dr-backup\pre-ri\`.
data.sql에는 고객 개인정보와 로그인 해시가 들어 있다 → 외부 공유 금지, 보관 기간은 Brad가 정한다.

#### 0.2-1 Git 태그 `pre-ri-release` (현재 `main`)
```bash
git fetch origin
```
```bash
git rev-parse origin/main
```
기대: `7d237f64cb70e8d9e4d0d7b10e8967cee9f6c87b`. 다르면 **중단** (그 사이 `main`이 바뀜 → PR 범위·호환표 재확인).
```bash
git tag -a pre-ri-release origin/main -m "Production before Repair Intelligence release (Phase 0.5-9)"
```
```bash
git push origin pre-ri-release
```
확인:
```bash
git ls-remote --tags origin pre-ri-release
```
기대: 두 줄 — `<태그 객체 해시> refs/tags/pre-ri-release`, `7d237f6… refs/tags/pre-ri-release^{}`. 두 번째 줄의 해시가 `7d237f6…`이면 성공.
용도: L1이 안 될 때 이 태그로 재배포할 수 있다 (롤백 L1-대안).

#### 0.2-2 Vercel 현재 Production 배포 기록과 Instant Rollback 준비
1. Vercel → Project → **Deployments** → 필터 Environment = **Production** → **Current** 표시가 있는 배포를 연다.
2. 기록: **Deployment ID**(`dpl_…`, 배포 상세 화면 또는 URL), **배포 URL**(`<project>-<hash>-<team>.vercel.app`), **커밋**(`7d237f6`), 생성 시각.
3. 확인: 기록한 배포 URL을 브라우저로 열면 지금의 운영과 같은 화면 (관리자 화면은 `login.` 호스트가 아니므로 대고객 홈만 보이는 것이 정상).
4. Settings → **Billing**(또는 팀 설정)에서 플랜 확인: **Hobby는 "바로 이전" Production 배포로만** 롤백할 수 있다. Pro는 기록한 어떤 배포로든 가능.
   → Hobby라면: 병합 후 운영 배포가 **하나만** 생기도록 한다 (병합 후 다른 커밋을 `main`에 넣지 않는다). 그래야 "바로 이전" = 기록한 배포.
5. Instant Rollback 절차는 맨 아래 L1에 있다. 지금은 실행하지 않는다.

#### 0.2-3 Supabase 자동 백업·PITR 확인
1. Supabase 대시보드 → 프로젝트 → **Database → Backups** (Scheduled backups 탭, Point in Time 탭).
2. 기대 (Free 플랜): 예약 백업 목록이 없거나 "Pro 플랜 이상" 안내, PITR 비활성. 
3. 기록: 플랜, 마지막 자동 백업 시각(있으면), PITR 여부.
4. 판단: 자동 백업이 없으면 0.2-4의 덤프가 **유일한** DB 백업이다. 덤프 검증이 통과하기 전에는 단계 3으로 가지 않는다.
   (선택: 출시 기간만 Pro로 올려 일일 백업을 받는 것은 비용·결정 사항 — Brad.)

#### 0.2-4 `supabase db dump` 3개 파일 (저장소 밖, 비밀번호 미포함)
연결 (비밀번호는 프롬프트에서만):
```bash
npx supabase link --project-ref wnddkgeohcgcidoklrps
```
덤프 (`C:/dr-backup/pre-ri` 부분을 실제 폴더로):
```bash
npx supabase db dump --linked --role-only -f "C:/dr-backup/pre-ri/roles.sql"
```
```bash
npx supabase db dump --linked -f "C:/dr-backup/pre-ri/schema.sql"
```
```bash
npx supabase db dump --linked --data-only --use-copy -x "storage.buckets_vectors" -x "storage.vector_indexes" -f "C:/dr-backup/pre-ri/data.sql"
```
- `-x` 두 개는 필수 — 없으면 복원 때 `permission denied for table buckets_vectors`로 실패한다 (리허설 (d), Supabase 문서).
- 기대 출력: 각각 `Dumped schema to …`. pg_dump 경고 "circular foreign-key constraints on this table: symptom_codes"는 단계 3 이후 덤프에서만 나오며 정상 (복원 시 `session_replication_role = replica`로 해결, 덤프 첫 줄에 포함).
- 출시 전 덤프이므로 roles.sql에는 `vector_agent`가 없어야 한다.

**검증 1 — 비밀정보 없음 (roles/schema):**
```bash
grep -niE "postgres(ql)?://|ENCRYPTED PASSWORD|SCRAM-SHA|PASSWORD '|eyJhbGci" "C:/dr-backup/pre-ri/roles.sql" "C:/dr-backup/pre-ri/schema.sql"
```
기대: 출력 없음.

**검증 2 — data.sql 행 수 = 운영 SELECT 결과.** 파일 쪽:
```bash
awk '/^COPY /{t=$2; n=0; next} /^\\\.$/{if(t!=""){print t"\t"n}; t=""; next} t!=""{n++}' "C:/dr-backup/pre-ri/data.sql" | sed 's/"//g' | sort > "C:/dr-backup/pre-ri/counts-file.tsv"
```
운영 쪽 (SQL Editor, `postgres`, 읽기 전용 — 또는 Claude에게 요청하면 MCP로 SELECT):
```sql
select table_schema || '.' || table_name as t,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as n
  from information_schema.tables
 where table_schema in ('public', 'auth') and table_type = 'BASE TABLE'
 order by 1;
```
기대: `public.*` 표는 **모두 같은 수** (덤프 직후 업무가 없을 때 실행). `auth.sessions`, `auth.refresh_tokens`, `auth.audit_log_entries`는 로그인 활동으로 조금 다를 수 있다 (허용).
2026-10-04 참고값 (운영 SELECT): `repair_tickets` 518, `inventory_items` 31.
리허설에서 같은 방법으로 83개 표 전부 일치를 확인했다 (`rehearsal-report.md` (d)).

**검증 3 — 드리프트 확인용 사본:** schema.sql(데이터 없음)만 `supabase/baseline_raw/prod-schema-release.sql`로 복사한다 (git 제외 폴더). 단계 1에서 Claude가 사용.
data.sql은 저장소 안으로 복사하지 않는다.

#### 0.2-5 Vercel 환경 변수 이름 목록 (값 없이)
Vercel → Settings → **Environment Variables** → 각 변수의 **이름**과 **적용 환경**(Production / Preview / Development)만 백업 폴더의 `vercel-env-names.txt`에 적는다. 값은 적지 않는다.
2026-10-04 Brad 확인: Supabase 관련 변수는 **All Environments** → Preview도 운영 DB를 쓴다.
코드가 읽는 변수 (확인용): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_DOMAIN`, `REVALIDATE_SECRET`,
`INVENTORY_WEBHOOK_API_KEY`, `N8N_NEW_TICKET_WEBHOOK_URL`, `N8N_DEVICE_WEBHOOK_URL`, `N8N_RI_PHOTO_WEBHOOK_URL`, `N8N_RI_PHOTO_SECRET`(새 앱).

#### 0.2-6 기존 n8n 워크플로 JSON 내보내기
n8n → Workflows → 각 워크플로 열기 → 오른쪽 위 **⋯ → Download** → 백업 폴더에 저장.
대상: 기기 라벨 AI(`N8N_DEVICE_WEBHOOK_URL`), 신규 접수 알림(`N8N_NEW_TICKET_WEBHOOK_URL`), 재고 입고(`/api/inventory/webhook` 호출), 그 밖에 운영 중인 것 전부.
기대: 워크플로마다 `.json` 1개. 자격 증명 값은 내보내기에 들어가지 않는다 (이름·ID만).
확인: 파일을 열어 `"nodes"` 배열이 있고, 각 워크플로의 활성 상태(Active)를 기록표에 적는다.

#### 0.2-7 Cloudflare DNS 현재 상태 기록
Cloudflare → `digital-rescue.com` → **DNS → Records**:
1. **Import and Export → Export** → BIND 파일을 백업 폴더에 저장.
2. 표의 `@`(apex), `www`, `login`, `edit` 행의 **Type / Target / Proxy status(주황 구름 Proxied / 회색 DNS only)**를 기록 (BIND 파일에는 Proxy 상태가 없음 — 화면 캡처).
3. **SSL/TLS → Overview**의 모드(Full / Full (strict) 등) 기록.
용도: 단계 4.3에서 레코드를 추가한 뒤, 문제가 생기면 이 상태로 되돌린다.

#### 0.2-8 백업 완료 판정
위 기록표 10칸이 모두 채워졌고 검증 1·2가 통과 → 단계 1로.

**중단:** 태그 커밋이 `7d237f6`이 아님, 덤프 실패, 행 수 불일치(`public`), 비밀정보 발견, 백업 폴더가 동기화 폴더 안.
**되돌리기:** 태그 삭제가 필요하면 `git push origin :refs/tags/pre-ri-release` (Brad). 나머지는 읽기만 했다.

---

## 단계 1 — 운영 스키마 드리프트 확인 (Claude, 읽기만)

입력: 0.2-4 검증 3의 `supabase/baseline_raw/prod-schema-release.sql`.

1. 비밀·데이터 점검 (Phase 0.1 plan 2b와 동일):
   ```bash
   grep -niE "postgres(ql)?://|password|passwd|pooler\.supabase|:6543|:5432|sslmode|PGPASSWORD|service_role_key|anon_key|eyJhbGci" supabase/baseline_raw/prod-schema-release.sql
   grep -nE "^(COPY |INSERT INTO)" supabase/baseline_raw/prod-schema-release.sql
   grep -n "wnddkgeohcgcidoklrps" supabase/baseline_raw/prod-schema-release.sql
   grep -niE "CREATE ROLE|ALTER ROLE|ENCRYPTED PASSWORD|SCRAM-SHA" supabase/baseline_raw/prod-schema-release.sql
   ```
   기대: 일치 없음. 의심스러우면 Claude는 멈추고 줄 번호만 보고한다.
2. 기준 덤프와 비교:
   ```bash
   diff <(tr -d '\r' < supabase/baseline_raw/schema.sql) <(tr -d '\r' < supabase/baseline_raw/prod-schema-release.sql)
   ```
   기대: 차이 없음 (pg_dump 버전 주석 정도만).
3. 카탈로그 패리티 (덤프가 보여주지 않는 storage 버킷·정책, 함수 ACL 포함): Phase 0.1과 같은 13개 범주를 운영(MCP SELECT)과 로컬(`db reset --version 20260927141005 --no-seed`)에서 같은 쿼리로 해시 비교 → 13/13 동일.
   쿼리는 2회차 리허설 때 `supabase/test-fixtures/release/parity.sql`로 저장한다.
   허용 차이: 로컬에만 있는 `pg_graphql` 확장 줄 (`rehearsal-report.md` (a)).
4. 결과를 `rehearsal-report.md` 2회차에 기록.

**중단:** 설명할 수 없는 차이 → Brad에게 목록 보고. 반영 방법은 별도 계획·승인.
**되돌리기:** 없음.

---

## 단계 2 — 리허설 (Claude, 로컬 Docker 전용) — 아래 4가지 모두 필수

1회차(커밋된 baseline + seed)는 2026-10-04에 끝났다 → `rehearsal-report.md`. 2회차는 **운영 덤프 기반**으로 같은 4가지를 다시 한다.
2회차는 운영 데이터(고객 정보)를 로컬 DB에 올린다 → **시작 전 Brad 확인** (`rehearsal-report.md` 2회차 전제). 끝나면 반드시 `npx supabase db reset`.
data.sql 경로는 Brad가 알려준다 (저장소 밖 그대로 읽는다).

### 2-1 (a) 운영 덤프 기반 로컬 DB에 0.5 ~ 9 전체 적용
```bash
npx supabase db reset --version 20260927141005 --no-seed
```
→ baseline만 있는 빈 DB (단계 1에서 운영 스키마 = baseline 확인). baseline이 만든 버킷 2개가 이미 있으므로 data.sql에서 `storage.buckets` 블록을 뺀 사본으로 복원한다:
```bash
awk 'BEGIN{s=0} /^COPY "storage"."buckets" /{s=1; next} s && /^\\\.$/{s=0; next} !s' "<BACKUP_DIR>/data.sql" > "<SCRATCH>/data-nobuckets.sql"
docker exec -i supabase_db_digital-rescue psql -U postgres --single-transaction -v ON_ERROR_STOP=1 -q -f - < "<SCRATCH>/data-nobuckets.sql"
```
기대: 오류 없이 종료 (exit 0). 그다음 행 수를 0.2-4의 `counts-file.tsv`와 비교 → 같음.
```bash
npx supabase migration up --local
```
기대: 14개 마이그레이션이 **실제 운영 데이터 위에서** 오류 없이 적용 (특히 #3 `repair_tickets` FK 추가 518행, #10 `inventory_items` 라벨 31행).
확인: 운영 확인 쿼리(단계 3.4)를 로컬에서 실행 → 기대값 / `count(*) = count(distinct label_code)` / 기존 행의 다른 컬럼 불변(마이그레이션 전후 md5 비교).

### 2-2 (b) 현재 `main` 코드 + (a)의 DB → "이전 코드 + 새 DB 호환표"
```bash
git archive main | tar -x -C "C:/dr-rehearsal/main-app"
```
짧은 경로를 쓴다 (긴 경로에서 Turbopack 경로 길이 오류, 1회차 관찰). `C:/dr-rehearsal/main-app/.env.local`에는 **로컬** URL·키만 (`npx supabase status -o env`), `npm ci`, `npx next dev -p 3100` → `http://login.localhost:3100`.
- 로그인: 운영 사용자 데이터가 복원되어 있으므로 **Brad가 자기 계정으로 직접 로그인**한다 (Claude는 실제 비밀번호를 입력하지 않음). Claude는 DB 결과를 확인하고 표를 채운다.
- 대상 흐름: 1회차 표의 14개 + 대고객 홈·브랜드 페이지·접수 폼(사진 제외) + 기사 화면(수리 시작·자재 추가·출고 요청·견적 제출).
- 특히 기존 함수 동작을 바꾸는 마이그레이션: **0.5**(구매 승인 → 가짜 OUTBOUND 재현 여부), **0.6a**(출고 승인·환불 4종·자재비 재계산이 같은 결과), **1**(승인된 접수건 수정 거부 그대로), **6**(플래그 OFF), **7**(구 앱 입고 행에 라벨).
- 결과: `rehearsal-report.md` 2회차 호환표. ⚠️ 항목은 04 §2.2와 대조.

### 2-3 0.6a 정확성·R10
- 0.6a: `db reset --version 20260928043331 --no-seed` 상태의 8개 함수 정의 저장 → `migration up` 후 비교 → 가드 한 줄 차이만 (04 §4-3).
- R10 불변식 0행 (04 §4-4). `npx supabase test db` 1168 pass (seed 상태에서). advisors 새 WARN 없음.

### 2-4 (c) 전체 롤백 후 스키마 = baseline
(a)의 DB(운영 데이터 + 14개 적용 + (b)의 테스트 흔적)에서:
```bash
npx supabase db dump --local -f "<SCRATCH>/schema-before-rollback-check.sql"
```
`supabase/rollback/ri-full-rollback.sql`의 PART A → 확인 쿼리(0행) → PART B → PART C를 차례로 실행 (`docker exec -i … psql -U postgres -v ON_ERROR_STOP=1 -f -`).
```bash
docker exec -i supabase_db_digital-rescue psql -U postgres -c "drop schema ri_rollback_backup cascade"
npx supabase db dump --local -f "<SCRATCH>/schema-after-rollback.sql"
diff <(tr -d '\r' < "<SCRATCH>/schema-baseline.sql") <(tr -d '\r' < "<SCRATCH>/schema-after-rollback.sql")
```
`schema-baseline.sql` = `db reset --version 20260927141005 --no-seed` 직후의 `db dump --local`.
기대: **차이 0줄** (1회차 결과 동일), 남는 것은 빈 버킷 2개뿐. PART B 소요 시간을 기록 (1회차 0.5초 — 운영 데이터 양에서 다시 측정).

### 2-5 (d) data 덤프를 빈 로컬 DB에 복원 → 행 수 일치
```bash
npx supabase db reset --no-seed
```
마이그레이션이 넣는 행(`symptom_codes` 9행, 버킷 4개)을 비운 뒤 복원한다 (L3는 빈 새 프로젝트에 복원하므로 이 충돌이 없다):
```bash
docker exec -i supabase_db_digital-rescue psql -U postgres -c "truncate public.symptom_codes cascade"
docker exec -i supabase_db_digital-rescue psql -U postgres --single-transaction -v ON_ERROR_STOP=1 -q -f - < "<SCRATCH>/data-nobuckets.sql"
```
행 수를 `counts-file.tsv`와 비교. 기대: `public` / `auth` 모든 표 일치 (1회차: 83/83).
이 단계는 L3의 "데이터 복원" 부분이 실제 운영 덤프로 되는지 증명한다.

### 2-6 정리
```bash
npx supabase db reset
npx supabase test db
```
기대: seed 상태, 1168 pass. 스크래치의 덤프 사본 삭제. 결과를 `rehearsal-report.md`에 기록하고 커밋 (로컬만).

**중단:** 어떤 단계든 실패, 같은 단계 두 번 실패, 호환표에 예측하지 않은 ⚠️ → Brad에게 보고 (R8).

---

## 단계 3 — 운영 마이그레이션 (Brad) — 여기서 창(window) 시작

**시점:** 업무 종료 후. 단계 3 → 6을 **같은 날** 끝낼 수 있을 때 시작 (04 §2.2).

### 3.1 직원 공지와 준비
1. **직원 공지** (메신저 공지 예시 — 시각만 바꿔서):

   > [시스템 점검 안내] 오늘 **19:00부터 점검이 끝났다고 다시 알릴 때까지** 다음 두 가지를 하지 말아 주세요.
   > 1. **"구매 승인" 버튼을 누르지 마세요.** (대시보드 → 자재 구매 승인 대기) — 승인은 점검 후에 해 주세요. 구매 요청을 올리는 것은 괜찮습니다.
   > 2. **19:00~19:15에는 재고 등록·적출품 입고 승인을 하지 마세요.**
   >
   > 그 밖의 접수·견적·출고 승인·환불은 평소대로 하시면 됩니다. 화면이 이상하거나 오류가 나면 바로 Brad에게 알려 주세요. 점검이 끝나면 다시 공지하겠습니다.

   이유: 구 앱으로 구매를 승인하면 재고 이력에 실제로 없었던 출고(OUTBOUND)가 기록된다 (04 §2.2 A, 리허설 (b)에서 재현). 금지는 **`db push`부터 `main` 병합 배포 확인까지** 유지한다.
2. n8n: 재고 입고 웹훅 워크플로 **비활성화** (마이그레이션 동안 `inventory_items` 쓰기 방지, 04 §2.2 G).
3. 백업 기록표가 다 찼는지 확인 (원칙 1).

### 3.2 마이그레이션 목록 확인
```bash
npx supabase migration list --linked
```
기대: `20260927141005`는 Local·Remote 모두, 나머지 **14개는 Local만**. Remote에만 있는 버전 없음.
**중단:** Remote에만 있는 버전, 또는 baseline이 Remote에 없음.

### 3.3 적용
```bash
npx supabase db push --linked --dry-run
```
기대: 적용 예정 목록이 정확히 14개, 이 순서:
`20260928043331` `20260928043332` `20260928102040` `20261001134000` `20261001134100` `20261001221915` `20261003054457`
`20261003062351` `20261003064945` `20261003121512` `20261003141631` `20261004090000` `20261004100000` `20261004110000`.
```bash
npx supabase db push --linked
```
- 확인 프롬프트에 `Y`. `--include-all`, `--include-seed`, `--include-roles`는 **쓰지 않는다**.
- 기대: 파일마다 `Applying migration <파일>...`, 끝에 `Finished supabase db push.` 시각을 기록 (= 창 시작).

**중단 (실패 시):** 실패한 파일명·오류 원문 기록, **다시 실행하지 않음**. 앞선 파일은 적용·기록된 상태이며 구 앱은 어느 지점에서도 동작한다 (04 §2.2, 리허설 (b)).
특히 `CREATE EXTENSION pg_trgm`(#3), `CREATE ROLE vector_agent`(#12), `INSERT INTO storage.buckets`(#7, #14). Claude에게 오류 원문 → 재개 또는 L2를 Brad가 결정.

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

-- Phase 4 / 9 버킷: ai-photos f 10485760 {image/webp} / donor-photos f 10485760
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id in ('donor-photos','ai-photos') order by id;

-- Phase 8: false | 3
select rolcanlogin, rolconnlimit from pg_roles where rolname = 'vector_agent';

-- 새 테이블은 비어 있음: 0 0 0 0
select (select count(*) from catalog_models), (select count(*) from part_specs),
       (select count(*) from donor_devices), (select count(*) from ai_candidates);

-- 창 감시 기준값 (단계 5.4, 6.3에서 비교): 기록해 둘 것
select count(*), sum(quantity), md5(string_agg(id::text || ':' || quantity, ',' order by id)) from inventory_items;
```
**중단:** 기대와 다른 값 하나라도 → L2 여부를 Brad가 결정.

### 3.5 구 앱 확인 (운영, 쓰기 없이)
- `login.digital-rescue.com`: 대시보드, 접수건 목록·상세, 재고 관리, 통계가 오류 없이 열린다.
- `digital-rescue.com`: 홈, 브랜드 페이지 1개, 접수 폼 화면이 열린다 (제출하지 않음).
- n8n 재고 입고 웹훅 워크플로 **재활성화**.

**되돌리기 (단계 3):** L2 (앱은 아직 구 버전이므로 L1 불필요). 이 시점의 RI 표는 비어 있어 L2의 데이터 손실은 없다 (라벨 코드만 사라짐).

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
기대: Vercel이 Preview 배포를 만들고 **Ready**. **중단:** 빌드 실패 → 로그를 Claude에게.

### 4.2 Preview 환경 변수
2026-10-04 Brad 확인: Supabase 변수는 **All Environments** → Preview = 운영 DB. 다시 확인할 것:
- `NEXT_PUBLIC_SITE_DOMAIN`도 All Environments인지 (쿠키 공유, 4.4).
- `N8N_RI_PHOTO_WEBHOOK_URL` / `N8N_RI_PHOTO_SECRET`: Preview에서는 비워 둔다 (04 §7 전까지). 이미 All Environments로 넣었다면 Preview에서는 사진 인식이 운영 n8n을 호출한다는 뜻 → Brad 결정.
- `N8N_NEW_TICKET_WEBHOOK_URL`: Preview에서 대고객 폼으로 테스트 접수를 하면 평소 신규 접수 알림이 간다 → 알림을 받아도 되는지, Preview 전용으로 비울지 결정.
- 값을 바꿨다면 Deployments → Preview → **Redeploy**.

### 4.3 Preview 전용 도메인 `login.preview.digital-rescue.com` (Vercel 브랜치 도메인 + Cloudflare CNAME)
이유: 관리자 포털은 `login.`으로 시작하는 호스트에서만 열린다 (`src/proxy.ts`). 기본 `*.vercel.app` 주소에서는 관리자 경로가 `/`로 돌아간다.

1. **Vercel:** Project → Settings → **Domains** → **Add Domain** → `login.preview.digital-rescue.com` 입력 →
   연결 대상을 **Preview / Git Branch = `feat/repair-intelligence`** 로 지정 (Production에 연결하지 않는다) → Add.
2. Vercel이 보여주는 DNS 안내를 확인한다: 보통 **CNAME `login.preview` → `cname.vercel-dns.com`** (프로젝트별 값이 따로 표시되면 그 값을 쓴다).
   도메인 소유 확인용 **TXT** 레코드를 요구하면 그것도 함께 추가한다.
3. **Cloudflare:** `digital-rescue.com` → **DNS → Records → Add record**:
   - Type **CNAME**, Name **`login.preview`**, Target = Vercel이 안내한 값, **Proxy status = DNS only (회색 구름)**, TTL Auto → Save.
   - DNS only로 두는 이유: Vercel이 직접 인증서를 발급·갱신해야 한다. 주황 구름(Proxied)이면 인증서 발급·리다이렉트가 꼬일 수 있다.
4. CMS도 Preview에서 보려면 `edit.preview.digital-rescue.com`을 같은 방식으로 추가한다 (proxy가 `edit.` → `login.`으로 바꿔 로그인 화면을 찾으므로 두 이름이 짝이 맞아야 한다).
5. 확인: Vercel Domains 화면에서 **Valid Configuration** + 인증서 발급 완료 → `https://login.preview.digital-rescue.com/login`에 로그인 화면.
   그리고 `https://login.digital-rescue.com`(운영)은 여전히 **구 버전**인지 확인 (사이드바에 "기기 마스터" 없음).
6. 출시 후 정리: Vercel 도메인 삭제 + Cloudflare 레코드 삭제 → 0.2-7의 DNS 기록과 같아졌는지 확인 (Phase 10용으로 남길지는 Brad 결정).

**중단:** 도메인이 Production 배포를 가리킴, 인증서 오류, 운영 `login.` 화면이 바뀜 → 레코드 삭제 후 원인 확인.

### 4.4 로그인 쿠키 공유 — 주의
- `NEXT_PUBLIC_SITE_DOMAIN=digital-rescue.com`이 Preview에도 적용되면, `login.preview.digital-rescue.com`에서도 쿠키 도메인이 **`.digital-rescue.com`** 이 된다 (`src/proxy.ts` `getCookieDomain`).
  → 운영 `login.digital-rescue.com`과 **같은 쿠키**(`sb-…-auth-token`, `dr_last_activity`)를 쓴다. Supabase 프로젝트도 같으므로 세션이 서로 유효하다.
- 결과:
  1. 같은 브라우저에서 Preview에 로그인하면 운영에도 같은 계정으로 로그인된다 (반대도 같음). 역할별 점검 중 계정을 바꾸면 **운영 탭의 사용자도 바뀐다.**
  2. 한쪽에서 로그아웃하면 양쪽 다 로그아웃된다.
  3. 1시간 비활동 만료 쿠키도 공유된다 — Preview에서 활동하면 운영 세션도 연장된다.
  4. Preview는 운영 DB에 쓴다 → Preview에서 한 모든 저장은 **실제 운영 데이터**다 (`[테스트]` 규칙, 점검표 0.2).
- 지킬 것:
  1. Preview 점검은 **전용 브라우저 프로필**(또는 다른 브라우저)에서만 한다. 평소 업무 프로필과 섞지 않는다.
  2. 점검 중에는 같은 프로필로 운영 화면을 열지 않는다. 끝나면 로그아웃하고 그 프로필을 닫는다.
  3. Preview 주소를 직원에게 공유하지 않는다.
  4. 비밀번호 재설정·매직 링크는 Supabase Site URL(운영)로 가므로 Preview에서 시험하지 않는다.

### 4.5 Deployment Protection
Preview가 Vercel 인증으로 보호되면 Vercel에 로그인한 브라우저(4.4의 전용 프로필)로 연다. 우회 토큰은 만들지 않는다.

**되돌리기 (단계 4):** PR 닫기, 브랜치 도메인·CNAME 삭제. DB는 그대로 (구 앱 정상).

---

## 단계 5 — Preview 점검과 정리 (Brad)

### 5.1 점검
`regression-checklist.md` 0 → 1 → 2장 (홈페이지·랜딩 1-0 포함). 시작 시각을 진행 기록표에.

### 5.2 중단 조건
- 재고 수량·이력, 접수건 금액·상태, 환불, 대고객 홈·접수 폼이 기대와 다름 → 점검 중지, **병합하지 않음**, 화면·접수번호를 Claude에게.
- 구 앱(운영)에서 직원이 이상을 보고 → 같음.
- 수정이 필요하면: 별도 계획·승인 → 브랜치에서 수정 → Preview 재배포 → 해당 항목 재점검.

### 5.3 정리
`regression-checklist.md` 3장 (앱 화면으로).

### 5.4 잔여 데이터 확인 (SQL Editor, `postgres`, 읽기 전용)
`<TEST_START>` = 5.1 시작 시각 (예: `'2026-10-10 19:00+09'`).
```sql
select 'model' k, name, created_at from catalog_models where name like '[테스트]%'
union all select 'board', board_number, created_at from catalog_boards where created_at >= '<TEST_START>'
union all select 'part_spec', name, created_at from part_specs where name like '[테스트]%'
union all select 'location', code || ' active=' || is_active, created_at from storage_locations where code like 'TEST%'
union all select 'symptom', code || ' active=' || is_active, created_at from symptom_codes where code like 'TEST.%'
union all select 'note', left(body, 30), created_at from model_notes where body like '[테스트]%'
union all select 'donor', donor_no || ' ' || status, created_at from donor_devices where created_at >= '<TEST_START>'
union all select 'ai_candidate', candidate_type || ' ' || status, created_at from ai_candidates where created_at >= '<TEST_START>';

select t.receipt_no, t.status, t.is_test, c.name
  from repair_tickets t join customers c on c.id = t.customer_id
 where t.created_at >= '<TEST_START>' order by t.created_at;

select count(*), sum(quantity), md5(string_agg(id::text || ':' || quantity, ',' order by id))
  from inventory_items where created_at < '<TEST_START>';

select i.label_code, p.name, i.quantity from inventory_items i join inventory_products p on p.id = i.product_id
 where p.name like '[테스트]%' order by i.label_code;
```
- 실제 업무 데이터가 섞여 나오면 무시하지 말고 확인.
- 남은 테스트 행의 **SQL 삭제는 Brad 결정**: `BEGIN;` … `ROLLBACK;`으로 영향 행 수를 먼저 보고 나서만 `COMMIT`.

**되돌리기 (단계 5):** 테스트 데이터는 위 정리로. 앱·DB 변경 없음.

---

## 단계 6 — 병합과 운영 확인 (Brad) — 여기서 창 종료

### 6.1 병합
GitHub에서 PR **Merge** (Brad). Vercel → Deployments → Production이 병합 커밋으로 **Ready** → 새 배포 ID 기록, 진행 기록표에 시각 (= 창 종료).
Hobby 플랜이면 이후 다른 커밋을 `main`에 넣지 않는다 (L1이 "바로 이전" 배포로만 가능, 0.2-2).
**중단:** 운영 빌드 실패 → 운영은 이전 배포 유지 (Vercel은 실패한 빌드를 승격하지 않음).

### 6.2 배포 당일 점검 (운영)
`regression-checklist.md` 4장 — **대고객 홈·랜딩 먼저** (4-0), 그다음 관리자.
그리고 직원 공지: 점검 종료, **구매 승인 다시 가능**, 새 메뉴 안내 (교육은 04 §8.2).

### 6.3 창 기간 감시 (읽기 전용)
```sql
-- 구 앱이 구매 승인 시 넣은 가짜 OUTBOUND (04 §2.2 A). 기대: 0행
select t.id, t.created_at, t.ticket_id, t.item_id, t.quantity_changed, t.notes
  from inventory_transactions t
  join ticket_materials m on m.ticket_id = t.ticket_id and m.inventory_item_id = t.item_id
 where m.request_type = 'purchase'
   and t.transaction_type = 'OUTBOUND'
   and t.created_at >= '<DB_PUSH_TIME>';

-- 창 동안 구 앱 경로로 입고·갱신된 행 (04 §2.2 G) — 정보용
select i.label_code, p.name, i.condition, i.quantity, i.updated_at
  from inventory_items i join inventory_products p on p.id = i.product_id
 where i.updated_at >= '<DB_PUSH_TIME>' and i.updated_at < '<MERGE_TIME>' order by i.updated_at;

-- 플래그 f | f | f
select ri_approval_gate_enabled, ri_cancel_gate_enabled, ri_purchase_guard_enabled from global_settings;
```
첫 쿼리에 행이 있으면 목록을 기록, 처리는 Brad 결정 (Claude는 운영 데이터를 바꾸지 않음, R9).

### 6.4 출시 직후 백업
출시 상태를 기준점으로 남긴다 (L3를 쓰게 될 때 잃는 범위를 줄인다): 0.2-4의 덤프 3개를 새 폴더(예: `C:\dr-backup\post-ri\`)에 다시 받고 검증 2를 한다.

**되돌리기 (단계 6):** L1 (우선). DB까지 필요하면 L2. 아래 참조.

---

## 단계 7 — 출시 후 작업 (Brad, 일정은 Brad 결정)

1. **AI 사진 인식** — 04 §7.
2. **"실패 실행 저장"** — 04 §7.1: 초기 검증 동안만 ON → 통과하면 OFF, 남은 실패 실행 삭제, 전환일 기록.
3. **모델명 매핑 백필** — 04 §8.1.
4. **직원 교육** — 04 §8.2 (플래그 OFF 상태에서).
5. **수리 기록 게이트·구매 가드 OFF 유지** — 04 §8.3.
6. **VECTOR 활성화** — 04 §8.4.
7. **OpenRouter 자리 표시자** — 04 §8.5 (= 1번 안에서).
8. Preview 도메인·CNAME 정리 (4.3-6), 백업 폴더 보관 기간 결정.
9. Phase 10 — 실제 수리 데이터가 쌓인 뒤 별도 계획 (`02-roadmap.md`).

---

## 롤백 L1 / L2 / L3

어떤 수준이든 먼저: 직원에게 "잠시 시스템 사용 중지" 공지 → 무엇이 문제인지 한 줄로 기록 (화면, 접수번호, 시각) → Claude에게 공유 (가능하면).

### L1 — 앱만 되돌림 (Vercel Instant Rollback, 수 초)
언제: 새 앱 화면·기능 문제. DB는 정상 (구 앱이 새 DB에서 동작함 — 리허설 (b)).

대시보드:
1. Vercel → Project → **Overview**의 Production Deployment 타일 → **Instant Rollback**
   (또는 Deployments → 0.2-2에서 기록한 배포 행의 **⋮ → Instant Rollback**).
2. 대화상자에서 되돌릴 배포 = **0.2-2에 기록한 배포 ID/커밋 `7d237f6`** 인지 확인 → Continue.
3. 확인 화면: 롤백될 도메인 목록(apex, `www`, `login.`, `edit.`)과 "환경 변수는 바뀌지 않음" 안내를 확인 → **Confirm Rollback**.

CLI (선택, `npx vercel login` 후 `npx vercel link`한 상태에서):
```bash
npx vercel rollback <0.2-2에 기록한 배포 URL 또는 ID>
```
```bash
npx vercel rollback status
```
기대: 수 초 안에 운영 도메인이 이전 배포를 서비스. 확인: `login.digital-rescue.com` 사이드바에 "기기 마스터"가 **없음**, 대고객 홈 정상.

주의:
- **Hobby 플랜은 바로 이전 Production 배포로만** 롤백된다 (0.2-2).
- 롤백 후 Vercel은 **Production 도메인 자동 할당을 끈다** → 이후 `main`에 push해도 운영에 반영되지 않는다.
  복구: 수정 배포가 준비되면 Overview의 **Undo Rollback** (또는 `npx vercel promote <배포 URL>`)로 승격 → 자동 할당이 다시 켜진다.
- 환경 변수는 롤백되지 않는다. 출시 때 추가한 변수(`N8N_RI_PHOTO_*`)는 구 앱이 읽지 않으므로 그대로 둬도 된다.
- L1 후에도 DB는 새 스키마다 → 단계 3.1의 **구매 승인 금지 공지를 다시** 낸다 (04 §2.2 A).

L1 대안 (Instant Rollback이 안 될 때): GitHub에서 병합 커밋을 revert하는 PR을 만들어 병합 (또는 `pre-ri-release` 태그 상태로 되돌리는 커밋) → 새 운영 배포. 몇 분 걸린다.

### L2 — DB 스키마까지 되돌림 (`supabase/rollback/ri-full-rollback.sql`)
언제: 새 DB가 구 앱을 깨뜨리거나, 출시 자체를 취소할 때. **반드시 L1 먼저.**
잃는 것: RI 표·RI 컬럼의 모든 데이터 (수리 기록, 표준 모델 연결, 호환 근거, Donor, 라벨, 보관 위치, 구매 사유 로그, AI 후보). PART A와 파일 내보내기에만 남는다.
남는 것 (R9): RI가 기존 표에 쓴 행 (qty-1 재고 행, 재고 이력, 자재 상태, 로그).

1. L1 완료 확인.
2. VECTOR·사진 인식 중지: SQL Editor `ALTER ROLE vector_agent NOLOGIN;` + n8n VECTOR / RI 사진 워크플로 비활성.
3. 파일로 내보내기 (저장소 밖):
   ```bash
   npx supabase db dump --linked --data-only --use-copy -s public -f "C:/dr-backup/before-l2/ri-before-rollback-data.sql"
   ```
   기대: `Dumped schema to …`. 파일 크기 기록.
4. SQL Editor(`postgres`)에서 스크립트의 **PART A**만 실행 → 이어지는 확인 쿼리 → **0행**.
5. **PART B**만 실행 (단일 트랜잭션). 기대: 오류 없이 `COMMIT`. 오류가 나면 전체가 취소되어 **아무것도 바뀌지 않는다** → 멈추고 Claude에게 오류 원문.
6. **PART C** 1)~4): 역할 삭제, 대시보드에서 버킷 `ai-photos`·`donor-photos` 비우고 삭제, 마이그레이션 이력:
   ```bash
   npx supabase migration repair --status reverted 20261004110000 20261004100000 20261004090000 20261003141631 20261003121512 20261003064945 20261003062351 20261003054457 20261001221915 20261001134100 20261001134000 20260928102040 20260928043332 20260928043331
   ```
   ```bash
   npx supabase migration list --linked
   ```
   기대: `20260927141005`만 양쪽에. 점검 쿼리 `0 | 0 | 0 | f | 0`.
7. 구 앱 확인 (단계 3.5와 같음). 구매 승인 금지 공지 해제 (DB가 0.5 이전으로 돌아갔으므로 구매 승인은 원래처럼 "재고 부족"으로 실패 — 출시 전과 같음).
8. `ri_rollback_backup` 스키마는 파일 사본을 확보한 뒤에만 `DROP SCHEMA ri_rollback_backup CASCADE;` (Brad 결정).

리허설: 1회차에서 PART A~C 후 스키마 덤프가 baseline과 **0줄 차이** (`rehearsal-report.md` (c)). 2회차에서 운영 데이터로 재확인한다.

### L3 — 덤프로 복원 (최후 수단)
> ⚠️ **경고: L3는 0.2-4(또는 6.4) 덤프 시점 이후의 운영 데이터를 모두 잃는다.** 접수, 결제·환불, 재고 이동, 작업 로그, 직원 계정 변경, 고객이 대고객 폼으로 낸 접수까지 전부.
> 덤프에는 **Storage 파일(사진)이 없다** — 파일은 Storage에 그대로 있지만, 덤프 이후 생긴 사진을 가리키는 DB 행은 사라지고, 덤프 이후 지운 사진은 돌아오지 않는다.
> L1·L2로 해결되지 않고 DB 자체가 손상됐을 때만, Brad가 결정한다.

Free 플랜에는 대시보드 복원이 없다. 권장 방식은 **새 Supabase 프로젝트에 복원하고 앱을 그쪽으로 옮기는 것**이다 (현재 프로젝트는 조사용으로 남김).
1. 새 프로젝트 생성 (같은 리전 `ap-northeast-2`, PostgreSQL 17). Dashboard → Connect → Session pooler URI 확인 (채팅·파일에 남기지 않음).
2. 복원 (호스트에 psql이 없으므로 Docker 사용; 백업 폴더를 마운트):
   ```bash
   docker run --rm -it -v "C:/dr-backup/pre-ri:/b" postgres:17 psql --single-transaction --variable ON_ERROR_STOP=1 --file /b/roles.sql --file /b/schema.sql --command "SET session_replication_role = replica" --file /b/data.sql --dbname "<NEW_PROJECT_SESSION_POOLER_URI>"
   ```
   (Supabase 공식 절차와 같은 순서: roles → schema → replica 모드 → data.)
   기대: 오류 없이 종료. 오류가 나면 단일 트랜잭션이라 새 프로젝트에 아무것도 남지 않는다 → 원인 확인 후 재시도.
   새 프로젝트에도 버킷 행이 이미 있으면 리허설 (d)처럼 data.sql에서 `storage.buckets` 블록을 뺀 사본을 쓴다.
3. 확인: 0.2-4 검증 2의 행 수 쿼리를 새 프로젝트에서 실행 → `counts-file.tsv`와 같음.
4. 덤프에 없는 것 다시 만들기:
   - Storage 버킷·정책: `supabase/migrations/20260927141005_baseline.sql`의 storage 섹션 (`ticket-images`, `page-content-images`, 정책 8개);
   - Storage 파일: 이전 프로젝트에서 복사 (Supabase 문서의 storage 이전 스크립트);
   - 마이그레이션 이력: `npx supabase link --project-ref <새 ref>` → `npx supabase migration repair --status applied 20260927141005`;
   - Auth 설정(Site URL, 이메일 템플릿 등)은 대시보드에서 다시 설정. 사용자 계정·비밀번호 해시는 data.sql에 들어 있지만 새 프로젝트는 JWT 비밀이 달라 **모든 직원이 다시 로그인**해야 한다.
5. Vercel 환경 변수 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`를 새 프로젝트 값으로 바꾸고 Production **Redeploy** (구 앱, L1 상태).
6. n8n의 Supabase 관련 자격 증명(재고 웹훅은 앱 경유이므로 앱 URL만 확인)과 VECTOR(활성화했었다면)를 새 프로젝트로 바꾼다.
7. 대고객 홈·접수 폼과 관리자 핵심 흐름을 점검표 4장으로 확인.

같은 프로젝트에 덮어쓰는 복원(기존 `public` 객체 삭제 후 복원)은 권장하지 않는다. 필요하면 별도 계획을 세운다.
