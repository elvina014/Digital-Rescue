# Phase 5 — Search & intake pre-check (부품·기기 검색 · 접수 사전 확인) — REPORT

Executed 2026-10-03 on branch `feat/repair-intelligence` (plan: `phase-5-plan.md`, APPROVED 2026-10-03 with decisions 1–8).
Local Docker Supabase only — **production untouched** (no production query was run in this phase).

## Result

| Acceptance / requirement | Result |
| --- | --- |
| Both search directions work with partial / alias input | ✅ pgTAP: "15z90" → model, "nm-d45" → board, "bq2478" (chip marking) and "L19C3" (part-number alias) → specs, then the search functions return the expected rows. E2E: "15z9" → model → ranked part list; "bq2478" → chip → board BA92-21345A with laptop "삼성 갤럭시북 프로 360 NT950QED"; "L19C3" → battery → model + stock 2 |
| P9 ranking | ✅ pgTAP `results_eq` on the full order: 검증됨 → 문서 근거 (in stock first) → 추정 / 호환 그룹 후보 → 비호환 last; E2E shows the four groups |
| Outsourced stock excluded (Q5) | ✅ spec linked only to the `외주` item → `stock_qty 0` (pgTAP), "재고 (외주 제외) · 합계 0개" (E2E); 외주 parts dropped from case parts and parts history |
| Intake pre-check | ✅ E2E (RECEPTION): picking 표준 모델 shows notes, 3 past cases (receipt no. only), "호환 부품 재고 1종", donor D-0011; the ticket was then submitted unchanged and stored with `catalog_model_id` |
| Ticket panel | ✅ E2E: "이 기기 지식" on a linked ticket, the ticket itself excluded |
| No customer data (Q7) | ✅ pgTAP: result JSON of all roles contains no customer name / phone / address, no `symptoms`, no symptom free-text note, no `device_model` / `tag_info`; case keys and top-level keys asserted against the whitelist |
| Cases for all staff (Q7) | ✅ pgTAP: all 6 roles get the same 3 cases (TECHNICIAN not assigned, CS on non-completed); E2E CS sees 4 cases |
| Decision 6 — ticket links | ✅ E2E: RECEPTION / MANAGER "접수 열기" links; TECHNICIAN / CS no links |
| Decision 7 — prices for the admin group | ✅ pgTAP: `final_price` / `refunded_amount` only for ADMIN / MANAGER (230,000 on the completed case), absent for the other 4 roles; E2E MANAGER sees "230,000원", TECHNICIAN / CS none |
| Decision 8 — skip a failing case | ✅ pgTAP: a forced error (division by zero in one case's parts) → that case and the parts history skipped, `skipped = 2`, other cases listed, call succeeds; UI shows "일부 정보(n건)를 불러오지 못해 건너뛰었습니다." and a failing panel never blocks the intake form |
| Model notes | ✅ pgTAP (constraints, RLS for 6 roles, column grants, `updated_by`); E2E TECHNICIAN: empty → "메모 내용을 입력해 주세요.", add 주의 note, edit own note; MANAGER sees 수정 on it; RECEPTION / CS no form |
| Roles / domains (decision 5) | ✅ menu "부품·기기 검색" for every role; apex `/lookup` → `/` |
| Existing objects unchanged | ✅ snapshot (md5 + ACL of every public function, every view definition, every policy incl. storage, every trigger) before / after: only additions; after the rollback rehearsal: identical |
| pgTAP | ✅ **535/535** (existing 455 + Phase 5: 80) |
| `db reset` twice | ✅ |
| typecheck / lint / build | ✅ 0 errors / 0 errors, 16 warnings (all pre-existing) / success |
| Advisors (`db advisors --local --type all --level info`) | ✅ no new WARN/ERROR. New: 3 INFO `unused_index` on the fresh `model_notes` indexes. The 14 WARNs are the pre-existing list from Phase 1 |
| Types | ✅ `npm run db:types` regenerated |
| Rollback rehearsal | ✅ see Rollback |

## Decisions applied (Brad, 2026-10-03)

1 local Docker · 2 panel contents / two-tab page as proposed · 3 writers ADMIN / MANAGER / TECHNICIAN / EXPERT_REPAIR, author or ADMIN / MANAGER edit and delete ·
4 note target = model (+ variant) or board · 5 menu for all staff · 6 receipt no. for all, link for ADMIN / MANAGER / RECEPTION ·
7 **past repair price shown to ADMIN / MANAGER** · 8 **canceled and open tickets included; a case that fails while being built is skipped**.

## Changes

### Database — `supabase/migrations/20261003062351_device_knowledge.sql`

- Table `model_notes` (RLS on, `anon` revoked, FK indexes, column grants: only target / type / body / pinned writable). Trigger `trg_model_notes_stamp` (`updated_at`, `updated_by`).
- `search_parts_for_device(model, variant, board)` and `search_devices_for_part(spec)` — **SECURITY INVOKER** (everything they read is already readable by all staff), `search_path` set.
- `get_device_knowledge(model, variant, board, exclude_ticket)` — **SECURITY DEFINER**, `search_path = public`, employee check, whitelisted jsonb (see plan §3.3), price keys only for ADMIN / MANAGER, per-case `EXCEPTION` block (decision 8).
- EXECUTE revoked from PUBLIC / anon / authenticated, granted to `authenticated` for the three functions; the trigger function has no API grant.

**No existing table column, trigger, function, policy or view was altered.** Read only: `compatibility_summary`, `donor_potential_stock`, `repair_parts_used`, `catalog_*`, `part_specs`, `repair_*`, `ticket_symptoms`.

### Application

| File | Change |
| --- | --- |
| `src/app/(admin)/lookup/{page,LookupClient,actions}.ts(x)` (new) | page "부품·기기 검색" (tabs "기기로 부품 찾기" / "부품으로 기기 찾기"), session-client actions for the 3 RPCs, the spec's stock / donor rows and notes |
| `src/components/knowledge/*` (new, 9 files) | `DeviceKnowledgePanel`, `IntakePrecheck`, `PartsForDeviceList`, `DevicesForPartList`, `CompatBadge`, `CaseList`, `ModelNoteList` (optimistic add / edit / delete with rollback), `ModelNoteForm`, `labels` |
| `src/app/(admin)/tickets/new/NewTicketForm.tsx` | `<IntakePrecheck>` under the 표준 모델 picker (+5 lines; submit unchanged) |
| `src/app/(admin)/tickets/[id]/page.tsx` | collapsible "이 기기 지식" when the ticket has a model or board (`TicketDetailForm.tsx` untouched) |
| `src/components/layout/AdminSidebar.tsx` | menu "부품·기기 검색" (all roles) |
| `src/proxy.ts` | `/lookup` in `ADMIN_PATHS` |
| `src/types/supabase.ts` | regenerated |

### Tests / fixtures

`supabase/tests/device_knowledge.test.sql` (80), `supabase/test-fixtures/phase5/rollback.sql`.

## Deviations from the plan

| Plan | Done | Why |
| --- | --- | --- |
| `model_notes` reuses `repair_set_updated_at()` | own trigger function `model_note_stamp()` | the existing function sets `updated_by` only for `repair_records`; reusing it would have needed a change to an existing function (R2). Rollback SQL extended by one line |
| Ticket links in the RPC result | RPC returns `receipt_no` only; the server action looks up ticket ids with a normal `repair_tickets` SELECT (RLS) for ADMIN / MANAGER / RECEPTION | keeps the definer function free of any ticket id, and the link appears only where RLS already allows opening the ticket |
| Lookup page pickers with inline registration | registration disabled on the search page (`allowCreate={false}`) | a search page should not create master data; the intake form and repair record keep inline registration |
| Decision 8 scope | per-case block for recent cases **and** one block for the parts-used history | both read the same per-ticket data; one bad row must not hide the whole panel |
| E2E screenshots | none — verified by page text, DOM state and DB queries | the app pane was hidden (`visibilityState = hidden`); forms were driven through DOM events, as in Phase 4 |

## E2E (local stack, seed accounts, temporary `.env.development.local` — **deleted afterwards**)

Fixture data = the pgTAP fixture block (specs, evidence via the Phase 3 RPC, linked stock, donors, 6 tickets) loaded by SQL and removed by `db reset`.

RECEPTION: 새 접수 → "15z9" → model → pre-check panel (3 cases with links, no prices, no note form) ✅; submit → ticket `20261003-009` with `catalog_model_id` ✅ ·
TECHNICIAN: `/lookup` model → 6 parts in 4 rank groups, stock / donor badges ✅; knowledge with 4 cases, no links, no prices ✅; empty note → Korean validation ✅; note add + edit (DB: `created_by` = `updated_by` = TECHNICIAN) ✅; chip marking / part-number alias / outsourced spec searches ✅; ticket page panel without the current ticket ✅ ·
MANAGER: ticket page → prices, 3 ticket links + donor link, 수정 on the TECHNICIAN's note ✅ ·
CS: menu present, no note form, no create option, no links, no prices, 4 cases ✅ · apex `/lookup` → `/` ✅. No console errors, no server errors.

Not covered by E2E (pgTAP only): board-only search in the UI, variant-specific results, optimistic rollback on a server error (client validation blocks the reachable error paths; same pattern as earlier phases).

## Rollback

App first (`git revert <phase-5 commit>`), then `supabase/test-fixtures/phase5/rollback.sql`:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.get_device_knowledge(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.search_devices_for_part(uuid);
DROP FUNCTION IF EXISTS public.search_parts_for_device(uuid, uuid, uuid);
DROP TABLE IF EXISTS public.model_notes;
DROP FUNCTION IF EXISTS public.model_note_stamp();
COMMIT;
```

**Verified locally 2026-10-03** on the database that still held the E2E data (1 note, the new ticket): afterwards no `model_notes`; the object snapshot
(functions + ACLs, views, policies incl. storage, triggers) identical to the pre-Phase-5 snapshot; stock rows (8 / qty 107), transactions (9) and tickets (19) unchanged.
Then `db reset` ×2 + 535 tests PASS. Only model notes are lost on rollback.

## Deployment (Brad)

1. Phases 0.5, 1, 2, 3, 4 are still pending in production; apply in order (0.5 → 1 → 2 → 3 → 4 → 5).
2. **Migration first** (`npx supabase db push`, or SQL editor). The old app ignores the new objects.
3. **Then the app.**
4. Verify (read-only): `select count(*) from model_notes` → 0;
   `select proname, prosecdef, proacl from pg_proc where proname in ('search_parts_for_device','search_devices_for_part','get_device_knowledge')` → definer only for `get_device_knowledge`, no `anon` in any ACL.

## How Brad verifies locally

`npx supabase db reset` → `npx supabase test db` (535 pass) → `npm run typecheck && npm run lint && npm run build` →
for sample data run the fixture block of `supabase/tests/device_knowledge.test.sql` (section "fixtures", with the jwt line replaced by
`set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true)`) → dev server against the local stack
(`NEXT_PUBLIC_SITE_DOMAIN` empty): `tech@example.test` → "부품·기기 검색" → "15z90"; `reception@example.test` → 신규 접수 → 표준 모델 "15z90".

## Known risks / notes

- **Production starts with little knowledge**: only tickets linked to a 표준 모델 / board count as cases, and specs / compatibility are mostly empty — many lookups will show "없음" at first.
- **Free text** (`diagnosis_summary`, action descriptions, notes) is staff-written and visible to all staff — hint only. Customer columns, `symptoms`, symptom notes, `device_model`, `tag_info` are never returned.
- **Case visibility widens in practice** (Q7): TECHNICIAN sees de-identified cases of tickets not assigned to them; CS sees non-completed cases.
- **Prices** (decision 7) appear only in the case list for ADMIN / MANAGER; stock and search stay price-free.
- `stock_qty` counts only stock rows linked to a part spec ("재고 연결", Phase 3).
- Note target label in the panel shows the model name without the brand (cosmetic).
- Model notes are hard-deleted (decision 3) — no history.
- Still open from earlier phases: Phase 2 decision 6 (all EXPERT_REPAIR regardless of assignment?), KI-9, KI-10.
