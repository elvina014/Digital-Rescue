# Phase 4 — Donor devices (Donor 기기) — REPORT

Executed 2026-10-03 on branch `feat/repair-intelligence` (plan: `phase-4-plan.md`, APPROVED 2026-10-03 with decisions 1–9).
Local Docker Supabase only — **production untouched** (no production query was run in this phase).

## Result

| Acceptance / requirement | Result |
| --- | --- |
| Donor parts appear as potential stock | ✅ view `donor_potential_stock`; E2E: "적출 가능 부품" tab lists the remaining candidates, empty after the donor was set to 폐기 |
| Extraction creates a normal `inventory_items` row + INBOUND | ✅ pgTAP (new USED row with capacity; merge into a matching USED row) + E2E: RAM 8GB → seed item 3 → 4, one INBOUND "적출품 반환 입고" (user = MANAGER, ticket = source ticket) |
| "Donor로 전환" next to the unchanged disposal confirmation (Q6) | ✅ E2E: submit disabled until the consent checkbox is ticked; conversion hides the row, creates the donor, sets `dispose_confirmed_at`, writes the log; plain "확인 완료" on another ticket unchanged (no donor) |
| Mandatory consent wording | ✅ "고객이 기기 소유권 포기(폐기 위임)에 동의했음을 확인했습니다." — RPC refuses `false` / `NULL` (pgTAP) |
| ADMIN / MANAGER approval kept (decision 5) | ✅ TECHNICIAN: candidates + "입고 요청" only, `donor_extract_part` refused (pgTAP, E2E: no "적출 입고" button); MANAGER: dashboard widget "Donor 적출 입고 대기" or direct "적출 입고" |
| Phase 2 inbound function reused unchanged (decision 8a) | ✅ `ri_inbound_extracted_part` called, md5 unchanged |
| `DONOR_KEEP` removed parts → candidates (decision 6) | ✅ pgTAP + E2E ("적출 후보 1건" in the log) |
| Photos outside the ticket image array | ✅ private bucket `donor-photos`; E2E: upload → WebP, signed URL 200, public URL 400, anonymous fetch 400, anonymous list empty |
| Restore after conversion | ✅ E2E: existing message "기기 폐기 확인이 완료된 접수건입니다…" |
| Roles / domains (decision 7) | ✅ E2E: RECEPTION no menu, `/donors` → `/dashboard`, ticket line without link; apex `/donors` → `/` |
| Existing objects unchanged | ✅ snapshot (md5 of every public function body + ACL, all views, all policies incl. storage, all triggers) before / after: only additions; after the rollback rehearsal: identical |
| pgTAP | ✅ **455/455** (existing 351 + Phase 4: 104) |
| `db reset` twice | ✅ |
| typecheck / lint / build | ✅ 0 errors / 0 errors, 16 warnings (all pre-existing) / success |
| Advisors (`db advisors --local --type all --level info`) | ✅ no new WARN/ERROR. New: 11 INFO `unused_index` on the fresh, empty Phase 4 indexes. The 14 WARNs are the pre-existing list from Phase 1 |
| Types | ✅ `npm run db:types` regenerated |
| Rollback rehearsal | ✅ see Rollback |

## Decisions applied (Brad, 2026-10-03)

1 local Docker · 2 columns as proposed · 3 temporary `donor_no` (D-0001) · 4 donors only from a ticket · 5 technicians request, ADMIN / MANAGER book ·
6 `DONOR_KEEP` copied on conversion · 7 menu for ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR · 8 **(a)** reuse the Phase 2 function (merge into matching USED stock) · 9 private photos.

## Changes

### Database — `supabase/migrations/20261003054457_donor_devices.sql`

- Tables (RLS on, `anon` revoked, FK indexes): `donor_devices` (no direct INSERT; UPDATE ADMIN/MANAGER on granted columns only),
  `donor_part_candidates` (ADMIN/MANAGER/TECHNICIAN/EXPERT_REPAIR; `EXTRACTED` and `extracted_*`/`inventory_item_id` RPC-only; extracted rows frozen),
  `donor_photos` (insert: staff roles above; delete: ADMIN/MANAGER). Sequence `donor_no_seq` (no API privileges).
- View `donor_potential_stock` (security_invoker; no customer or ticket columns).
- Storage: bucket `donor-photos` (private, 10 MB, webp/jpeg/png) + 3 policies `donor_photos_storage_*`.
- Functions (SECURITY DEFINER, `search_path = public`, role check, EXECUTE for `authenticated` only): `donor_convert_from_ticket`, `donor_extract_part`.
- Existing functions only **called**: `ri_inbound_extracted_part`, `repair_set_updated_at` (trigger).

**No existing table column, trigger, function, policy or view was altered.**

### Application

| File | Change |
| --- | --- |
| `src/app/(admin)/donors/{actions,labels,requireDonorPage}.ts` (new) | session-client server actions (convert, donor edit, candidates, request, extract, photos with sharp → WebP, signed URLs), labels, page guard |
| `src/app/(admin)/donors/{page,DonorsClient}.tsx` (new) | list: "Donor 기기" (status filter, default 보관중) / "적출 가능 부품" tabs, text filter |
| `src/app/(admin)/donors/[id]/{page,DonorInfoForm,DonorPhotos,CandidateList,CandidateForm,ExtractForm}.tsx` (new) | detail: info (ADMIN/MANAGER edit, model/board pickers), photos, candidates (optimistic with rollback) |
| `src/components/common/DonorConvertForm.tsx` (new) | conversion form inside the disposal widget row |
| `src/components/common/DonorExtractRequest{Section,Widget}.tsx` (new) | ADMIN/MANAGER "Donor 적출 입고 대기" |
| `src/components/common/DisposalConfirmWidget.tsx` | second button "Donor로 전환" + inline form; "확인 완료" unchanged |
| `dashboard/page.tsx`, `inventory/page.tsx` | mount the request widget (2 lines each) |
| `src/components/layout/AdminSidebar.tsx` | menu "Donor 기기" |
| `src/proxy.ts` | `/donors` in `ADMIN_PATHS` |
| `tickets/[id]/page.tsx` | "Donor 전환됨 · D-0001" line (link for donor staff roles) |
| `src/types/supabase.ts` | regenerated |

`confirmDisposalAction`, `cancelTicketAction`, `restoreCanceledTicketAction`, `approveTicketAction`, the n8n webhook: unchanged.

### Tests / fixtures

`supabase/tests/donor_devices.test.sql` (104), `supabase/test-fixtures/phase4/rollback.sql`.

## Deviations from the plan

| Plan | Done | Why |
| --- | --- | --- |
| `TicketDetailForm.tsx` gets the donor line | line rendered in `tickets/[id]/page.tsx` only | no change to the 1800-line form needed |
| Rollback SQL drops `donor_no_seq` | kept, but the sequence is `OWNED BY` the column and goes with the table (`IF EXISTS` → notice only) | same effect |
| Photo description | column exists, no input in the UI | not needed for the flow; avoids another field |
| Who requested an extraction | not stored (only `updated_at`) | plan used a plain UPDATE for the request step; the widget shows donor, part and inbound values |
| E2E screenshots | one screenshot of the conversion form; the rest verified by page text, DOM state and DB queries | the app window stopped drawing mid-run; forms were driven through DOM events |

## E2E (local stack, seed accounts, temporary `.env.development.local` — **deleted afterwards**)

MANAGER: disposal widget → "Donor로 전환" disabled until consent ✅ → converted LG 14Z90R (`DONOR_KEEP` part copied, ticket confirmed, log) ✅; plain "확인 완료" on a second DISPOSE ticket → no donor ✅;
ticket page "Donor 전환됨" + restore refused ✅ ·
TECHNICIAN: `/donors` list ✅; detail read-only info ✅; empty candidate → "부품 설명을 입력해 주세요." ✅; candidate added ✅; request without category → "카테고리·사양·제품명을 입력해 주세요." ✅; request saved ✅; photo upload, no delete button ✅ ·
MANAGER: widget approval of a request with spec `외주` → "외주 항목으로는 입고할 수 없습니다.", row restored (optimistic rollback) ✅; RAM request approved → stock + INBOUND ✅; direct "적출 입고" with corrected spec ✅; donor → 폐기 → potential stock empty, no new candidates ✅ ·
RECEPTION / apex ✅. No console errors, no server errors.

Local fixtures for the E2E (one `DONOR_KEEP` removed part, one extra DISPOSE ticket) were inserted by SQL and removed by `db reset`.
The local `donor_no` showed D-0010 because test runs consume sequence values (sequences are not rolled back); a fresh database starts at D-0001.

Local note: `NEXT_PUBLIC_SITE_DOMAIN=localhost` makes the browser reject the session cookie on `login.localhost`; leave it empty for local E2E.

## Rollback

App first (`git revert <phase-4 commit>`), then `supabase/test-fixtures/phase4/rollback.sql`:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.donor_extract_part(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.donor_convert_from_ticket(uuid, boolean, text, text, text, text, text);
DROP VIEW IF EXISTS public.donor_potential_stock;
DROP POLICY IF EXISTS donor_photos_storage_select ON storage.objects;
DROP POLICY IF EXISTS donor_photos_storage_insert ON storage.objects;
DROP POLICY IF EXISTS donor_photos_storage_delete ON storage.objects;
DROP TABLE IF EXISTS public.donor_photos, public.donor_part_candidates, public.donor_devices;
DROP SEQUENCE IF EXISTS public.donor_no_seq;
COMMIT;
-- then empty and delete the bucket `donor-photos` through the Storage API / dashboard
```

**Verified locally 2026-10-03** on the database that still held the E2E data (1 donor, 3 candidates, 1 photo + object): afterwards 0 `donor*` relations;
the object snapshot (functions + ACLs, views, policies incl. storage, triggers) identical to the pre-Phase-4 snapshot; stock rows (6) and transactions (11) intact;
converted ticket still confirmed. Then `db reset` ×2 + 455 tests PASS.
Donor records are lost on rollback; extracted stock stays.

## Deployment (Brad)

1. Phases 0.5, 1, 2, 3 are still pending in production; apply in order (0.5 → 1 → 2 → 3 → 4).
2. **Migration first** (`npx supabase db push`, or SQL editor). It creates the private bucket `donor-photos` in `storage.buckets`. The old app ignores the new objects.
3. **Then the app.**
4. Verify (read-only): `select public, file_size_limit from storage.buckets where id = 'donor-photos'` → `f, 10485760`;
   `select count(*) from donor_devices` → 0; `select proacl from pg_proc where proname in ('donor_convert_from_ticket','donor_extract_part')` → no `anon`.

## How Brad verifies locally

`npx supabase db reset` → `npx supabase test db` (455 pass) → `npm run typecheck && npm run lint && npm run build` →
dev server against the local stack (`NEXT_PUBLIC_SITE_DOMAIN` empty): `manager@example.test` → 대시보드 → "폐기 기기 확인 대기" → LG 14Z90R → "Donor로 전환";
`tech@example.test` → "Donor 기기" → 후보 추가 → 입고 요청; `manager@example.test` → "Donor 적출 입고 대기" → 입고 승인.

## Known risks / notes

- **Extracted donor parts merge into matching USED stock** (decision 8a) — individual qty-1 rows come with labels in Phase 7.
- **KI-9:** a ticket approved and then canceled by ADMIN cannot be updated (`protect_approved_ticket`), so neither "확인 완료" (already today) nor "Donor로 전환" works for it.
- **PII:** brand / model / tag texts are copied only after the converting person sees and edits them (hint shown). Notes are free text visible to all staff.
- No undo for a conversion; ADMIN/MANAGER can set the donor to 폐기. Donor status is manual (보관중 / 적출 완료 / 폐기).
- `donor_no` can have gaps (sequence values are never reused).
- Signed photo URLs expire after 1 h (re-signed on every page load).
- A ticket with a donor cannot be hard-deleted (RESTRICT).
- The requester of an extraction is not recorded (see deviations).
- Still open from earlier phases: Phase 2 decision 6 (all EXPERT_REPAIR regardless of assignment?), KI-9, KI-10.
