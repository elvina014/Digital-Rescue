# 운영 적용 명령어 — Phase 4.1 (매장 보관 기기 Donor 등록) + 직원 안내서

작성 2026-11-27 · 실행: **Brad** (Claude는 push·merge·운영 DB 적용을 하지 않음, R3·R7)
기준: `origin/main` = `83cfc16` (현재 운영 코드), 운영 DB 마지막 마이그레이션 = `20261111090000`

| 대상 | 브랜치 / 커밋 | 내용 |
| --- | --- | --- |
| DB | `supabase/migrations/20261127090000_donor_store_devices.sql` | 컬럼 4개 + CHECK, `source_ticket_id` NOT NULL 해제, 새 함수 1개, 기존 함수 3개 교체 |
| 앱 | `feat/repair-intelligence` @ `60cebe4` (+ 이 문서 커밋) | `main`보다 커밋 4개 앞. `main`에서 fast-forward 한 브랜치라 충돌 없음 |
| 직원 안내서 | `docs/initial-stock-registration` @ `bfcc850` | `docs/operations/initial-stock-registration.md` 커밋 2개 (원격에 아직 없음) |

## 순서와 이유

**DB 먼저 → 앱 나중.** 이유:
- 구 앱(현재 운영)은 새 DB에서 그대로 동작합니다.
  - 새 컬럼은 읽지 않고, 바뀐 함수 3개는 결과에 항목만 늘었습니다.
  - 기존 접수 폐기 → Donor 전환은 변경 없습니다 (pgTAP 회귀 확인).
- 반대로 새 앱은 옛 DB에서 Donor 화면이 깨집니다 (`origin` 컬럼 없음).
- 이번 변경은 구매 승인·재고 출고와 무관하므로 Phase 0.5–9 때 같은 업무 금지 공지는 필요 없습니다. Donor 적출 입고만 적용하는 몇 분 동안 피하면 됩니다.

---

## 0. 사전 확인 (로컬)

```powershell
git fetch origin
```
```powershell
git rev-parse origin/main
```
기대: `83cfc16eb30cb6a7c8bf5de735bf6e5e11f09d9c`. 다르면 **중단** — 그 사이 `main`이 바뀌었으니 Claude에게 다시 확인을 요청하세요.

```powershell
git log --oneline origin/main..feat/repair-intelligence
```
기대: Phase 4.1 커밋 4~5개만 (plan, 승인 조건, 구현, 이 문서).

## 1. 백업 (Brad)

백업 폴더는 저장소 밖에 만듭니다 (예: `C:\dr-backup\phase-4.1\`). data.sql에는 고객 개인정보가 들어 있으니 외부 공유 금지입니다.

```powershell
New-Item -ItemType Directory -Force C:\dr-backup\phase-4.1
```
```powershell
git tag -a pre-phase-4.1 origin/main -m "Production before Phase 4.1 (store devices as Donor)"
```
```powershell
git push origin pre-phase-4.1
```
연결 (DB 비밀번호는 프롬프트에만 입력):
```powershell
npx supabase link --project-ref wnddkgeohcgcidoklrps
```
```powershell
npx supabase db dump --linked -f "C:/dr-backup/phase-4.1/schema.sql"
```
```powershell
npx supabase db dump --linked --data-only --use-copy -x "storage.buckets_vectors" -x "storage.vector_indexes" -f "C:/dr-backup/phase-4.1/data.sql"
```
- `-x` 두 개는 필수입니다. 빠지면 복원할 때 실패합니다 (`release-runbook.md` 0.2-4).
- Vercel → Deployments → 현재 **Production** 배포의 ID·커밋(`83cfc16`)을 적어 둡니다 (앱 롤백 L1용).

## 2. 운영 DB 마이그레이션 (Brad)

```powershell
npx supabase migration list --linked
```
기대: `20261127090000` **하나만 Local에만** 있음. 나머지는 Local·Remote 일치. Remote에만 있는 버전이 있으면 **중단**.

```powershell
npx supabase db push --linked --dry-run
```
기대: 적용 예정 = `20261127090000_donor_store_devices.sql` **1개**.

```powershell
npx supabase db push --linked
```
- 확인 프롬프트에 `Y`. `--include-all`, `--include-seed`, `--include-roles`는 쓰지 않습니다.
- 기대: `Applying migration 20261127090000_donor_store_devices.sql...` → `Finished supabase db push.`
- 실패하면 **다시 실행하지 말고** 오류 원문을 Claude에게 주세요. 3단계 확인 SQL로 무엇이 적용됐는지 먼저 본 뒤, 재시도할지 L2로 되돌릴지 정합니다.

## 3. 적용 확인 (Supabase SQL Editor, 읽기만)

```powershell
npx supabase migration list --linked
```
기대: `20261127090000`까지 Local·Remote 모두 일치.

```sql
-- ① 새 컬럼 4개: acquired_on date | acquisition_cost integer | acquisition_note text | origin text
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'donor_devices'
   and column_name in ('origin', 'acquisition_note', 'acquired_on', 'acquisition_cost') order by 1;

-- ② source_ticket_id: YES (nullable) / CHECK 존재: 1
select is_nullable from information_schema.columns
 where table_schema = 'public' and table_name = 'donor_devices' and column_name = 'source_ticket_id';
select count(*) from pg_constraint where conname = 'donor_devices_origin_source';

-- ③ 기존 Donor는 모두 TICKET_DISPOSAL: STORE_STOCK 0
select origin, count(*) from donor_devices group by origin;

-- ④ 새 함수: true | true
select prosecdef, prosrc like '%ri_api_guard_definer(''{anon}'')%'
  from pg_proc where proname = 'donor_register_store_device';

-- ⑤ 바뀐 함수 3개 반영: true | true | true
select position('LEFT JOIN repair_tickets r ON r.id = d.source_ticket_id' in pg_get_functiondef('public.label_lookup(text)'::regprocedure)) > 0,
       position('LEFT JOIN repair_tickets st ON st.id = d.source_ticket_id' in pg_get_functiondef('public.ri_purchase_resources(uuid)'::regprocedure)) > 0,
       position('Donor '' || v_donor.donor_no' in pg_get_functiondef('public.donor_extract_part(uuid,uuid,text,text,text)'::regprocedure)) > 0;

-- ⑥ R10 불변식: 0행
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'graphql_public')
   and (not has_function_privilege('anon', p.oid, 'EXECUTE')
     or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
     or not has_function_privilege('service_role', p.oid, 'EXECUTE'));
```
기대와 다른 값이 하나라도 나오면 **중단**하고 Claude에게 보여 주세요 (되돌리기는 아래 L2).

Supabase 대시보드 → Advisors (Security / Performance): `donor_register_store_device`나 `donor_devices` 관련 **새 경고가 없어야** 합니다.

**구 앱 확인** (아직 앱은 `83cfc16`): `login.digital-rescue.com`에서 다음이 오류 없이 열려야 합니다.
- **Donor 기기** 목록·상세
- **라벨 조회**에서 기존 D- 라벨
- 대시보드

## 4. 앱 배포 (Brad)

```powershell
git push origin feat/repair-intelligence
```
```powershell
gh pr create --base main --head feat/repair-intelligence --title "feat(donors): 매장 보관 기기를 Donor로 등록 (Phase 4.1)" --body "Plan/report: docs/repair-intelligence/phases/phase-4.1-plan.md, phase-4.1-report.md. DB migration 20261127090000 applied to production first."
```
- Vercel Preview가 **Ready**인지 확인합니다. 빌드가 실패하면 로그를 Claude에게 주세요.
- Preview는 운영 DB를 씁니다. Preview에서 등록 버튼을 눌러 시험하면 **운영 데이터가 생기므로**, Preview에서는 화면이 열리는지만 봅니다.

병합 (GitHub 화면에서 **Merge pull request**, 또는):
```powershell
gh pr merge --merge
```
Vercel이 `main`을 운영에 배포합니다. Hobby 플랜이면 병합 뒤 다른 커밋을 바로 `main`에 넣지 마세요. 그래야 "바로 이전 배포"로 롤백할 수 있습니다.

## 5. 운영 확인 (Brad, 관리자 또는 팀장 계정)

1. `login.digital-rescue.com` → **Donor 기기**: 오른쪽 위 **+ 매장 보관 기기 등록**, 출처 필터 **전체 출처**가 보입니다.
2. 실제 매장 보관 기기 1대를 등록합니다. 시험용 가짜 기기는 등록하지 마세요 — 삭제 화면이 없고, 되돌리기(L2)도 막힙니다.
   - 필수: 기기 종류, 브랜드, 취득 경위, 회사 소유 확인 체크
   - 등록 후 상세 화면에 **출처: 매장 보관** 이 보이면 정상
3. Donor 상세 **라벨 인쇄** → 인쇄한 라벨을 **라벨 조회**로 스캔 → **출처: 매장 보관 · (취득 경위)** 가 보이면 정상.
4. 기사 계정 (가능하면): Donor 기기 목록에 등록 버튼이 **없어야** 합니다.

## 6. 직원 안내서 반영 (Brad, 선택)

안내서는 별도 브랜치입니다 (§6.5 매장 보관 기기 등록 추가).
```powershell
git push -u origin docs/initial-stock-registration
```
```powershell
gh pr create --base main --head docs/initial-stock-registration --title "docs(operations): 매장 재고 첫 등록 직원 안내서" --body "직원 교육용 안내서. §6.5는 Phase 4.1 운영 적용 후 기준."
```
```powershell
gh pr merge --merge
```
- 문서만 바뀌므로 앱 동작에는 영향이 없습니다. 4단계 병합 뒤에 하면 운영 배포가 한 번 더 생기니, Hobby 플랜이면 5단계 확인을 끝낸 다음에 병합하세요.
- 인쇄본(`docs/operations/print/`)은 커밋하지 않기로 했습니다 (로컬에만 있음, §6.5 반영해 다시 만듦).

---

## 되돌리기

### L1 — 앱만 (DB는 그대로)
Vercel → Project → **Instant Rollback** → 1단계에서 적어 둔 배포(`83cfc16`) 선택 → Confirm.
구 앱은 새 DB에서 정상 동작하므로 L1만으로 충분한 경우가 대부분입니다.
롤백 후 Vercel이 Production 자동 할당을 끄니, 수정 배포 뒤 **Undo Rollback**으로 다시 켭니다 (`release-runbook.md` L1).

### L2 — DB까지 (반드시 L1 먼저)
조건: **매장 보관 Donor가 0건**일 때만 가능합니다. 하나라도 있으면 스크립트가 스스로 멈춥니다.
- 이미 등록했다면 어떻게 처리할지(그 행을 보존할지 등)를 먼저 정해야 합니다. 업무 데이터라 Claude가 임의로 지우지 않습니다 (R9).

SQL Editor에 `supabase/test-fixtures/phase4.1/rollback.sql` 내용 전체를 붙여 넣고 실행합니다. 이 파일은 한 트랜잭션입니다.
마이그레이션 기록도 되돌립니다:
```powershell
npx supabase migration repair --linked --status reverted 20261127090000
```
확인:
```powershell
npx supabase migration list --linked
```
기대: `20261127090000`이 Local에만 있음.

로컬에서는 같은 절차로 롤백 → 적용 전 스키마와 완전히 같은지 확인했습니다 (`phase-4.1-report.md` Verification).
