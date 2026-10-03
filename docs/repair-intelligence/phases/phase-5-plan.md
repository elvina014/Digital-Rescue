# Phase 5 — Search & intake pre-check (부품·기기 검색 · 접수 사전 확인) — PLAN

Status: **APPROVED 2026-10-03 — EXECUTED 2026-10-03** (see `phase-5-report.md`; decisions in §11). Branch `feat/repair-intelligence`.

## 0. Preconditions (checked 2026-10-03)

| Check | Result |
| --- | --- |
| Phase 4 report exists, all acceptance rows ✅ | yes (`phase-4-report.md`, pgTAP 455/455, commit `d855d40`) |
| Phase 1–3 reports (dependencies) | ✅ |
| Production status | Phases 0.5–4 are "local ✅, production deploy pending" (Brad's step). Does not block local work. |
| Dev target | The session prompt left the target as a placeholder. Per Q9 / `03-working-rules.md` = **local Supabase on Docker**. Brad confirms "local" together with APPROVED (§11-1). |
| Working tree | Only pre-existing, non-RI changes (`.claude/*`, `.gitignore`) — not touched. |
| "As in the brief" | The roadmap says "intake/ticket panel and part lookup page (as in the brief)". The brief is **not in the repository**; §3–4 are my proposal from the roadmap, P9, Q5, Q7 and the real schema (§11-2). |

CLI: local-only commands (`db reset`, `test db`, `gen types --local`, `db advisors --local`). Production: no queries planned.

## 1. Goal and acceptance (roadmap)

Staff can look up, from either side, what the shop already knows:

- **device → parts:** "which parts fit this model / variant / board, which are in stock or in a donor?"
- **part → devices:** "which devices does this part number / chip marking fit?"
- **intake pre-check:** when a model is picked at intake (and on the ticket page), show notes, past cases, compatible parts in stock and donors of the same model — before the technician starts.

Acceptance: both search directions work with partial / alias input.

Ranking follows **P9**: internal repair cases > verified compatibility > inventory > donors > documented > inferred (internet / AI = Phases 8–9, not here).

## 2. What is NOT changed

- No existing table column, trigger, function, policy or view is altered. Phase 1–4 search functions (`catalog_search_models`,
  `catalog_search_boards`, `part_spec_search`) and views (`compatibility_summary`, `donor_potential_stock`, `repair_parts_used`) are
  **read, not changed**. md5 of all pre-existing functions + view definitions compared before/after, as in Phases 3–4.
- **No inventory write, no compatibility write.** Phase 5 is read-only except the new `model_notes` table.
- Past usage of a part on a model is shown as *history* ("이 모델 수리에 사용됨 n회"), never turned into compatibility (P4 / Phase 3 decision 7).
- `repair_tickets` RLS is unchanged. Cross-ticket case data reaches staff only through one SECURITY DEFINER function that returns no customer data (Q7).
- `NewTicketForm` submission, `createTicketAction`, `TicketDetailForm.tsx`: behaviour unchanged (the panel is display-only).
- No enforcement → no flag (P10).

## 3. Schema — one migration `supabase/migrations/<UTC ts>_device_knowledge.sql`

### 3.1 Table `model_notes` (모델 메모)

| Column | Type / rule |
| --- | --- |
| `id` | uuid PK `gen_random_uuid()` |
| `model_id` | uuid NULL → `catalog_models` **RESTRICT** |
| `variant_id` | uuid NULL; composite FK (`variant_id`, `model_id`) → `catalog_variants(id, model_id)` RESTRICT (same rule as tickets) |
| `board_id` | uuid NULL → `catalog_boards` RESTRICT |
| `note_type` | text NOT NULL DEFAULT `'TIP'` CHECK IN (`CAUTION` 주의, `KNOWN_ISSUE` 고질 고장, `TIP` 작업 팁, `PARTS` 부품 정보) |
| `body` | text NOT NULL, 1–1000 chars (trimmed) |
| `is_pinned` | boolean NOT NULL DEFAULT false (shown first at intake) |
| `created_by` | uuid DEFAULT `auth.uid()` → employees SET NULL |
| `updated_by` | uuid → employees SET NULL (trigger) |
| `created_at`, `updated_at` | timestamptz; `repair_set_updated_at()` trigger (existing function, reused unchanged) |

Constraints: `CHECK (num_nonnulls(model_id, board_id) = 1)` (a note is about a model **or** a board — §11-4);
`CHECK (variant_id IS NULL OR model_id IS NOT NULL)`. Indexes on every FK column.

RLS (enabled, `anon` revoked):

| SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- |
| all authenticated (Q7) | ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR; `created_by = auth.uid()` | ADMIN, MANAGER; or the author | ADMIN, MANAGER; or the author |

Column grants: `authenticated` may INSERT/UPDATE only `model_id, variant_id, board_id, note_type, body, is_pinned`.

### 3.2 Functions

All: `SET search_path = public, extensions`, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, then `GRANT EXECUTE … TO authenticated`.
Outsourced stock (spec `외주`, Q5 / KI-2) is excluded everywhere. Test tickets (`is_test`) are excluded from cases.

| Function | Security | Purpose |
| --- | --- | --- |
| `search_parts_for_device(p_model_id uuid DEFAULT NULL, p_variant_id uuid DEFAULT NULL, p_board_id uuid DEFAULT NULL) RETURNS TABLE (…)` | **INVOKER** (every table it reads is already readable by all staff) | Device → parts. Targets = the model, the given variant (or all variants of the model when none is given), the given board, and boards linked to the model/variant via `catalog_model_boards`. One row per (part spec, target) from `compatibility_summary` incl. interchange candidates. Columns: `part_spec_id, part_type, part_name, manufacturer, target_type, target_label, status, confidence, limitation_note, install_ok, install_conditional, install_incompatible, document_count, is_candidate, stock_qty, stock_rows, donor_qty, rank`. `stock_qty` = Σ `inventory_items.quantity` with that `part_spec_id` (no `외주`); `donor_qty` = Σ quantity in `donor_potential_stock`. **No prices.** At least one id required ("검색할 모델 또는 보드를 선택해 주세요."). |
| `search_devices_for_part(p_part_spec_id uuid) RETURNS TABLE (…)` | INVOKER | Part → devices. All `compatibility_summary` rows of the spec (incl. candidates): `target_type, target_id, target_label, status, confidence, limitation_note, counts, is_candidate, rank`, plus `linked_models text` — for a BOARD target the models/variants that use the board (`catalog_model_boards`), so a chip marking leads to laptops. |
| `get_device_knowledge(p_model_id uuid DEFAULT NULL, p_variant_id uuid DEFAULT NULL, p_board_id uuid DEFAULT NULL, p_exclude_ticket_id uuid DEFAULT NULL) RETURNS jsonb` | **DEFINER**, caller must be an employee (`get_my_role() IS NOT NULL`) | Intake / ticket panel. Returns `{ label, boards[], notes[], cases: { total, by_result{}, recent[≤10] }, parts_used[], compatible_in_stock, donors[] }` (§3.3). Cases = non-test tickets with the same `catalog_model_id` (and variant if given) **or** the same `catalog_board_id`; `p_exclude_ticket_id` hides the ticket being viewed. |

**Rank (P9)** used for ordering by both search functions:

| Rank | Rows |
| --- | --- |
| 1 | `verified` + (`compatible` \| `conditional`) |
| 2 | `documented` + (`compatible` \| `conditional`) |
| 3 | `inferred` (incl. interchange candidates) + not `incompatible`; and `unknown` |
| 9 | `incompatible` (shown last, in a separate "비호환 확인" block) |

Within a rank: in stock first (`stock_qty > 0`), then donor available, then name. (Internal repair cases — P9 #1 — are the case block of `get_device_knowledge` and the `parts_used` history, shown above the part list.)

### 3.3 `get_device_knowledge` — fields (whitelist; no customer data, Q7)

| Key | Content |
| --- | --- |
| `label` | brand + model (+ variant) and/or board number |
| `boards` | boards linked to the model (`board_number`) |
| `notes` | `model_notes` for the model (incl. variant-level), the variant, the given board and the model's boards: `id, note_type, body, is_pinned, author name, updated_at, can_edit` — pinned / CAUTION first |
| `cases.total`, `cases.by_result` | counts per `repair_records.result` (+ `NONE` = no record) and per ticket status COMPLETED / CANCELED / open |
| `cases.recent[]` | ≤ 10 newest: `receipt_no`, `received_at`/`completed_at` date, ticket `status`, `result`, `fault_category`, `diagnosis_summary`, symptom code names, successful actions (type + description), parts used (category / spec / product name, quantity) |
| `parts_used[]` | aggregate over the cases: category / spec / product / capacity, times used (from `repair_parts_used`, no `외주`, no prices) |
| `compatible_in_stock` | number of rank 1–2 specs with `stock_qty > 0` (detail via `search_parts_for_device`) |
| `donors[]` | `AVAILABLE` donors with the same model (or board): `donor_id, donor_no, storage_note`, available candidate count |

**Never returned:** `customer_id` / any `customers` column, `repair_tickets.symptoms` (customer's own words), `device_model`, `tag_info`, `images`,
`assignee_id`, all money columns, `ticket_logs`. Ticket identity = `receipt_no` only. Free text that *is* returned (`diagnosis_summary`, action
descriptions, notes) is staff-written and already readable by all staff in its own table (Phase 2 / Q7).

## 4. Application (UI Korean; new components < 200 lines; optimistic updates with rollback for notes — R5)

Before coding: read the relevant guides in `node_modules/next/dist/docs/` per `AGENTS.md`.

### 4.1 New files

| File | Content |
| --- | --- |
| `src/app/(admin)/lookup/page.tsx`, `LookupClient.tsx` | page **"부품·기기 검색"** with two tabs: **"기기로 부품 찾기"** (`DeviceModelPicker` + `BoardPicker` — Phase 1 pickers already search aliases and partial input) → `DeviceKnowledgePanel` + `PartsForDeviceList`; **"부품으로 기기 찾기"** (`PartSpecPicker` — searches part numbers / chip markings / aliases) → `DevicesForPartList` + stock / donor lines for that spec |
| `src/app/(admin)/lookup/actions.ts` | session-client server actions calling the three RPCs; note add / edit / delete |
| `src/components/knowledge/DeviceKnowledgePanel.tsx` | shared panel: notes (with add form for writer roles), case summary + recent cases (expandable rows), parts-used history, donors (link to `/donors/[id]` for donor roles) |
| `src/components/knowledge/PartsForDeviceList.tsx`, `DevicesForPartList.tsx`, `CompatBadge.tsx` | result lists; badges reuse the Phase 3 Korean labels (`partLabels.ts`) |
| `src/components/knowledge/ModelNoteForm.tsx`, `ModelNoteList.tsx` | note add / edit / delete (optimistic, restored on error; "메모 내용을 입력해 주세요.", "1000자 이내로 입력해 주세요.") with hint "고객 개인정보를 입력하지 마세요" |
| `src/components/knowledge/IntakePrecheck.tsx` | compact panel for the intake form: loads `get_device_knowledge` when a model is picked; collapsed by default when empty |
| `supabase/tests/device_knowledge.test.sql`, `supabase/test-fixtures/phase5/rollback.sql` | pgTAP, rollback |

### 4.2 Existing files changed

| File | Change |
| --- | --- |
| `src/app/(admin)/tickets/new/NewTicketForm.tsx` | render `<IntakePrecheck model={picked} />` under the "표준 모델" picker (≈ +3 lines; no change to submit) |
| `src/app/(admin)/tickets/[id]/page.tsx` | when the ticket has `catalog_model_id` or `catalog_board_id`: collapsible "이 기기 지식" panel (`DeviceKnowledgePanel`, current ticket excluded) — rendered in the page, `TicketDetailForm.tsx` untouched |
| `src/components/layout/AdminSidebar.tsx` | menu "부품·기기 검색" (`/lookup`) — roles per §11-5 |
| `src/proxy.ts` | `/lookup` in `ADMIN_PATHS` (served on `login.` only; apex → `/`) |
| `src/types/supabase.ts` | regenerated |
| docs | `02-roadmap.md` status, `known-issues.md` KI-5 note, this plan's status, `phase-5-report.md` |

Ticket links: recent cases show `receipt_no` as text. A link to the ticket is rendered only for ADMIN / MANAGER / RECEPTION (the roles whose
`tickets_select` policy can open any ticket); for others the case row expands inline instead (§11-6).

## 5. Rollback SQL

App first (`git revert <phase-5 commit>`), then:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.get_device_knowledge(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.search_devices_for_part(uuid);
DROP FUNCTION IF EXISTS public.search_parts_for_device(uuid, uuid, uuid);
DROP TABLE IF EXISTS public.model_notes;
DROP FUNCTION IF EXISTS public.model_note_stamp();  -- added during implementation (own trigger function, see report)
COMMIT;
```

Effect: model notes are lost; nothing else changes (no other writes happen in this phase). Rehearsed locally before the report.

## 6. Test plan (local only)

### A. pgTAP `device_knowledge.test.sql`
Fixtures (fake): 2 brands / 3 models (one with 2 variants), 2 boards linked to models, 6 part specs (panel, battery, IC on board, interchange sibling,
`incompatible` spec, spec linked only to a `외주` stock row), compatibility via `record_compatibility_result` / `record_part_install_result` (so
statuses come from evidence), stock rows with `part_spec_id`, a donor with candidates, 6 tickets on the model (completed / canceled / open / **is_test** /
other model / board only) with repair records, symptoms, actions, used materials, and a customer whose name / phone appear in `customers` and in `repair_tickets.symptoms`.

1. `model_notes`: target CHECK (none / both), variant ⇒ model, length; RLS by the 6 seed roles (read all; RECEPTION / CS insert refused; author edits own;
   TECHNICIAN cannot edit another's note; MANAGER can; anon nothing); column grants (`created_by` not writable).
2. `search_parts_for_device`: no id → Korean error; model → model rows + variant rows + linked-board IC rows; variant → that variant only (+ model rows);
   board only → IC rows; **rank order** (verified > documented > inferred/candidate > incompatible last; in stock before not in stock);
   `stock_qty` sums linked rows and **ignores `외주`**; `donor_qty` only from `AVAILABLE` donors / candidates; no price column.
3. `search_devices_for_part`: all targets of a spec incl. interchange candidate; board target lists linked models; unknown id → 0 rows.
4. `get_device_knowledge`: callable by all 6 roles incl. TECHNICIAN on tickets **not** assigned to them and CS on non-COMPLETED tickets (Q7);
   non-employee authenticated user refused; counts by result / status; `is_test` and other-model tickets excluded; `p_exclude_ticket_id` works;
   recent ≤ 10, newest first; `parts_used` aggregates and drops `외주`; donors only `AVAILABLE`;
   **PII:** the returned JSON text contains none of the fixture customer's name / phone / address, none of `symptoms`, `device_model`, `tag_info`, and no key from the forbidden list (§3.3).
5. Partial / alias input (acceptance): the existing pickers' functions find the fixtures by partial model alias ("15z90"), board alias, part-number alias and chip marking — then the search functions return the expected rows for the picked ids.
6. Privileges / definitions: no EXECUTE for PUBLIC / anon (`has_function_privilege`, KI-8); definer function has `search_path` and the role check; the two search functions are INVOKER; RLS on `model_notes`.
7. Regression: the existing 455 assertions pass; md5(`prosrc`) of all pre-existing public functions and the definitions of all pre-existing views identical before / after.

### B. E2E (local stack, seed accounts, temporary `.env.development.local` — deleted afterwards)
1. RECEPTION, 새 접수: pick "15z90" in 표준 모델 → pre-check panel shows notes, past cases (receipt no. only), compatible parts in stock, donors; submit still works unchanged.
2. TECHNICIAN, `/lookup` "기기로 부품 찾기": model by partial alias → ranked list (검증됨 first, 비호환 block last), stock / donor quantities; board only → IC parts.
3. TECHNICIAN, "부품으로 기기 찾기": search by chip marking → spec → boards with linked laptop models; by part-number alias → models.
4. TECHNICIAN: add a note ("CAUTION") → appears pinned/first; empty body → Korean validation; edit / delete own note; cannot edit MANAGER's note (no button; RPC/RLS refusal tested in A).
5. Ticket page of a linked ticket: "이 기기 지식" panel without the ticket itself; TECHNICIAN sees other cases without links, MANAGER with links.
6. CS: page works (read-only, no note form if §11-5 says so); apex `/lookup` → `/`. No console / server errors.

### C. Static / advisors / rollback
`npx supabase db reset` ×2; `npx supabase test db`; `npm run db:types`, `typecheck`, `lint`, `build`;
`npx supabase db advisors --local --type all --level info` — new findings fixed, pre-existing listed; rollback rehearsal (§5).

## 7. Implementation order

1. Migration + pgTAP A → 2. types → 3. `/lookup` page (both tabs) → 4. knowledge panel + notes → 5. intake pre-check + ticket panel →
6. menu, proxy → 7. E2E, static checks, advisors, rollback rehearsal → 8. report, docs, local commit.
Any conflict with the real schema or a step failing twice → STOP and ask (R8).

## 8. Risks

- **Empty knowledge in production.** The catalog, part specs and compatibility rows start (almost) empty in production, and only tickets linked to a
  표준 모델 count as cases (mapping tool, Phase 1). Early searches will mostly show "기록 없음" — expected; value grows with use.
- **Search needs a picked model / spec.** Free text that matches no alias finds nothing (deliberately: no guessing / auto-mapping, Phase 1). The pickers
  offer inline registration, as today.
- **Free-text PII.** `diagnosis_summary`, action descriptions and notes are staff free text shown to all staff (already readable in their own tables).
  Hint only; nothing enforces it. Customer columns and `symptoms` / `device_model` / `tag_info` are never returned.
- **Case visibility widens in practice:** a TECHNICIAN now sees (de-identified) cases of tickets not assigned to them; CS sees non-completed cases.
  This is Q7 ("all staff see repair cases").
- **`stock_qty` counts only stock rows linked to a part spec** ("재고 연결", Phase 3). Unlinked stock is invisible to the search — the inventory
  page stays the full list.
- `get_device_knowledge` is SECURITY DEFINER: the whitelist in §3.3 is the security boundary — every returned key is asserted in pgTAP.
- Performance: small data; all join columns are indexed (Phases 1–4). Recent cases capped at 10.

## 9. Out of scope

Purchase guard (Phase 6); labels / locations (Phase 7); VECTOR / AI RPCs and the separate agent role (Phase 8 — the functions here are for staff
sessions; Phase 8 will add its own read-only RPCs); similar-case search by symptoms / measurements (Phase 10); free-text search over
`device_model` of unmapped tickets; showing prices or margins; reserving stock / donor parts for a ticket; KI-7, KI-9, KI-10.

## 10. Files

| New | Changed |
| --- | --- |
| 1 migration; `supabase/tests/device_knowledge.test.sql`; `supabase/test-fixtures/phase5/rollback.sql`; §4.1 files; `phases/phase-5-report.md` | §4.2 list |

## 11. Decisions needed from Brad (with APPROVED)

**Answers (Brad, 2026-10-03):** 1–6 ✅ as proposed · 7 **show past repair prices to the admin group (ADMIN / MANAGER)** ·
8 **include canceled / open tickets, but skip a case if an error occurs while building it**. "APPROVED" given 2026-10-03.

Implementation of 7 and 8:
- 7: `get_device_knowledge` adds `final_price` (and `refunded_amount`) to each recent case **only when `get_my_role() IN ('ADMIN','MANAGER')`**;
  for every other role the keys are absent. Search functions and stock stay price-free (not asked). pgTAP asserts both.
- 8: each recent case is assembled in its own PL/pgSQL `BEGIN … EXCEPTION WHEN OTHERS` block; a failing case is left out and counted in
  `cases.skipped` (no error to the caller). In the UI, a failing knowledge / search call shows a short Korean notice and never blocks the intake form.

1. **Dev target** = local Docker Supabase? (placeholder in the prompt)
2. **Brief:** not in the repo. Are the panel contents (§3.3) and the two-tab lookup page (§4.1) what you intended? Anything missing?
3. **`model_notes` writers:** ADMIN / MANAGER / TECHNICIAN / EXPERT_REPAIR write; author or ADMIN / MANAGER edit and delete (hard delete). OK, or ADMIN-only, or keep deleted notes (soft delete)?
4. **Note targets:** a note is about a model (optionally a variant) **or** a board. OK? (Boards matter for mainboard work.)
5. **`/lookup` menu roles:** proposal **all staff** (ADMIN, MANAGER, RECEPTION, TECHNICIAN, EXPERT_REPAIR, CS) — read-only for RECEPTION / CS. OK?
6. **Case links:** receipt number as text for everyone; link to the ticket only for ADMIN / MANAGER / RECEPTION (others cannot open unassigned tickets anyway). OK?
7. **No prices** in search / cases (no `final_price`, `base_estimate`, material cost). OK, or show past repair price to ADMIN / MANAGER?
8. **Canceled tickets count as cases** (with their result, e.g. 수리불가) and open tickets are listed too (status shown). OK?
