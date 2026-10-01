# Phase 2 — Repair record module (수리 기록) — REPORT

Executed 2026-10-01 on branch `feat/repair-intelligence` (plan: `phase-2-plan.md`, APPROVED 2026-10-01 with decisions 1–9).
Local Docker Supabase only — **production untouched** (no production query was run in this phase).

## Result

| Acceptance / requirement | Result |
| --- | --- |
| A full ticket can be recorded end-to-end | ✅ E2E: TECHNICIAN recorded symptom, measurement, fault, failed + successful action, two removed parts (폐기 / 재고등록), summary; all rows verified in the DB |
| Gates ON block incomplete approval / cancel | ✅ E2E: approval card lists the 5 missing items, "최종 승인" disabled for MANAGER; cancel of a received ticket with an undecided part → "수리 기록이 완료되지 않아 취소할 수 없습니다: …", ticket unchanged |
| Override logged | ✅ E2E: ADMIN reason → ticket approved / canceled, `ticket_close_overrides` row with the missing snapshot + `ticket_logs` line |
| Flags OFF → existing flows unchanged | ✅ flags default false (pgTAP); with flags OFF the approval card and cancel modal render no new inputs (E2E) and `checkRepairGate` returns before any RPC; the old-flow capture below was run with flags OFF |
| RPC equivalence tests pass | ✅ real old code vs RPC on identical fixtures: identical except the two approved D1 cases; UI after the switch vs RPC: **0 differences** |
| Lock after approval / cancel | ✅ pgTAP + E2E (MANAGER sees "읽기 전용" after approval; ADMIN still edits) |
| Removed part without a `ticket_materials` row → normal stock | ✅ E2E: MANAGER "입고 승인" → `inventory_items` USED 1TB qty 1 + INBOUND "적출품 반환 입고" |
| ADMIN symptom-code tab | ✅ E2E: child code `POWER.NO_POWER` added, deactivated; delete of a used code refused and the row restored |
| pgTAP | ✅ **232/232** (Phase 0.5: 24, Phase 1: 64, repair records: 86, flow RPCs: 58) |
| `db reset` twice | ✅ |
| typecheck / lint / build | ✅ 0 errors / 0 errors, 16 warnings (all pre-existing) / success |
| Advisors (`db advisors --local --type all --level info`) | ✅ no new WARN/ERROR. New: 31 INFO `unused_index` on the fresh, empty Phase 2 indexes. All WARNs pre-existing (same list as Phase 1) |
| Types | ✅ `npm run db:types` regenerated |
| Rollback rehearsal | ✅ see Rollback |

## Decisions applied (Brad, 2026-10-01)

1 local Docker · 2 five unified result values · 3 fault-category draft list · 4 hybrid removed-part model, gate = confirmation checkbox + no undecided rows ·
5 RESTRICT on ticket delete · 6 register allowed for ADMIN, MANAGER, **assigned** TECHNICIAN / EXPERT_REPAIR (see "Open point") · 7 capacity is part of the stock match ·
8 after approval/cancel only ADMIN edits · 9 measurements and faults optional for the gate.

**Open point (decision 6):** the answer said "정밀수리팀까지 확장". The approved plan text (assigned EXPERT_REPAIR, same as the UI) was implemented.
If *all* EXPERT_REPAIR members should be allowed regardless of assignment, it is a one-line change in `register_return_material`
(new migration) — but they still cannot open tickets that are not assigned to them (existing `tickets_select` policy).

## Changes

### Database

`supabase/migrations/20261001134000_repair_records.sql` (M1)
- Tables (RLS on, `anon` revoked, FK indexes): `symptom_codes` (9 top-level codes seeded in the migration), `ticket_symptoms`, `repair_records`,
  `repair_measurements`, `repair_faults`, `repair_actions`, `ticket_removed_parts`, `ticket_close_overrides`. `ticket_id` FKs are RESTRICT.
- `global_settings`: `ri_approval_gate_enabled`, `ri_cancel_gate_enabled` (boolean NOT NULL DEFAULT false).
- View `repair_parts_used` (security_invoker).
- Functions: `repair_record_can_edit` (definer, STABLE), `repair_gate_check` (invoker), `repair_set_cancel_result` (definer),
  `repair_gate_override` (definer, ADMIN), trigger functions `repair_set_updated_at`, `repair_removed_part_stamp`.
- `ticket_removed_parts`: column privileges — API roles can only write the descriptive columns; `inbound_approved_at/by`, `inventory_item_id`, `handled_by/at` are RPC/trigger-only; a row whose stock was booked is frozen for everyone.

`supabase/migrations/20261001134100_inventory_flow_rpcs.sql` (M2)
- `ri_inbound_extracted_part` (internal, no EXECUTE for any API role incl. service_role), `register_return_material`, `approve_return_material`,
  `confirm_material_return`, `approve_removed_part_inbound` — SECURITY DEFINER, `search_path = public`, role check inside, EXECUTE for `authenticated` only.

**No existing table column, trigger, policy or function was altered.** `md5(prosrc)` of `approve_material_dispatch`, `protect_approved_ticket`,
`recalc_ticket_material_cost` is identical before and after (checked in the rollback rehearsal).

### Application

| File | Change |
| --- | --- |
| `src/app/(admin)/tickets/actions.ts` | `registerReturnMaterialAction`, `approveReturnMaterialAction`, `confirmMaterialReturnAction`: bodies replaced by one RPC call each (session client; same signature, return shape and `revalidatePath`s; −297 lines). New private `checkRepairGate()`; `approveTicketAction` / `cancelTicketAction` call it and return early only when a flag is ON. |
| `src/app/(admin)/tickets/[id]/repair-record/*` (new, 14 files) | `actions.ts`, `loadRepairRecord.ts`, `labels.ts`, `useOptimisticList.ts`, `RepairRecordSection`, `RecordSummaryForm`, `RecordList`, `SymptomPicker`, `MeasurementList`, `FaultList`, `ActionList`, `RemovedPartsList`, `RemovedPartForm` |
| `tickets/[id]/page.tsx` | loads the repair record, passes it down |
| `tickets/[id]/TicketDetailForm.tsx` | mounts the section (from RECEIVED on, or when a record exists); approval card gate block + ADMIN reason; cancel modal "취소 구분" radio + ADMIN reason — rendered only when the flag is ON (+88 lines) |
| `src/components/common/RemovedPartInboundSection.tsx`, `RemovedPartInboundWidget.tsx` (new) + one line each in `dashboard/page.tsx`, `inventory/page.tsx` | "적출 부품 입고 대기 (수리 기록 등록분)" for ADMIN/MANAGER |
| `inventory/settings/RepairGateSettingsCard.tsx` (new), `inventory/settings/page.tsx`, `src/app/actions/inventoryActions.ts` (`updateRepairGateFlags`) | ADMIN toggles for the two flags |
| `catalog/symptoms/{page,SymptomCodesClient}.tsx` (new), `catalog/CatalogTabs.tsx`, `catalog/adminActions.ts` | ADMIN tab "증상 코드" |
| `src/types/supabase.ts` | regenerated |

### Tests / fixtures

`supabase/tests/repair_records.test.sql` (86), `supabase/tests/inventory_flow_rpcs.test.sql` (58),
`supabase/test-fixtures/phase2_flow/` (`setup.sql`, `run_rpc.sql`, `dump.sql`, `rollback.sql`, captured `old_flow.json`, `new_rpc.json`, `new_ui.json` — fake seed data only).

## Equivalence of the three flows (Q3 condition 1)

Method: fresh `db reset` + `setup.sql` → run 9 steps → `dump.sql` (every row of `ticket_materials`, specs, products, items, transactions, `ticket_logs`, `material_cost`, without generated ids/timestamps).

| Run | How | File |
| --- | --- | --- |
| Old code | dev server on the local stack, **before** `actions.ts` was touched: TECHNICIAN registered an extracted part in the ticket screen; MANAGER clicked 2× "반환 확인" and 6× "입고 승인" on the dashboard | `old_flow.json` |
| New RPCs | same steps as the same users via SQL (`run_rpc.sql`) | `new_rpc.json` |
| New code through the UI | same clicks after the switch | `new_ui.json` |

- `new_ui.json` vs `new_rpc.json`: **identical**.
- `old_flow.json` vs `new_rpc.json`: identical (all `ticket_materials` columns, `ticket_logs` texts and authors, transaction users/notes/quantities, `material_cost`, specs, products) **except**:

| Fixture | Old | New | Reason |
| --- | --- | --- | --- |
| e…05 (SK하이닉스 256GB, new product) | new item with `capacity NULL` | new item with `capacity 256GB` | D1 — capacity stored (Q3 condition 3) |
| e…24 (하이닉스 DDR4, no capacity; the only USED item of that product is 8GB) | the **8GB** item was incremented | a separate item without capacity was created; 8GB item untouched | D1 / decision 7 — capacity is part of the match |

Correction to the plan text: "with `return_capacity` NULL the result is identical" holds only when no USED item with a capacity exists for that product;
otherwise the old flow added the part to an item of a *different* capacity (the second row above). This is the behaviour decision 7 replaces.

Covered scenarios: return confirm dispatch / purchase; inbound into an existing item (qty 2); new spec + new product; 불량품; return category ≠ original category;
legacy row without `return_category_id`; register → approve chain. Error paths, role refusals, atomicity (forced failure rolls back the status flip and the new spec),
D2 (two matching items → oldest incremented) and D5 are asserted in pgTAP.

## Deviations from the plan

| Plan | Done | Why |
| --- | --- | --- |
| Extend `ReturnMaterialInboundWidget` | separate `RemovedPartInbound{Section,Widget}` placed directly below it | no change to the existing widget or to the two pages' data mapping |
| `overrideGateAction` | override is part of `approveTicketAction` / `cancelTicketAction` (`overrideReason` field) | one step for the user; as described in plan §4.3 |
| `PartsUsedList.tsx` | rendered inline in `RepairRecordSection` (12 lines) | not worth a file |
| Inline *edit* of measurements / faults / actions | add + delete; editable in place: action result, removed-part disposition, summary | delete-and-re-add covers corrections; keeps components small |
| Fixtures under `supabase/tests/fixtures/` | `supabase/test-fixtures/` | `supabase test db` would try to run `.sql` files inside `supabase/tests/` |
| `supabase/seed.sql` additions | none | E2E creates the data through the UI; existing tests keep their fixed counts |
| `01-design-principles.md` P5 wording | unchanged | P5 already says "once switched … means that RPC" |

## E2E (local stack, seed accounts, temporary `.env.development.local` — **deleted afterwards**)

TECHNICIAN: full record on an IN_PROGRESS ticket ✅ (optimistic rows replaced by server rows, no console errors) ·
ADMIN: flags OFF → no gate UI ✅; toggles ON ✅; blocked approval + override ✅; blocked cancel ✅; override cancel (고객포기) ✅; symptom tab ✅ ·
MANAGER: removed-part inbound approval ✅; complete ticket approved normally, no override row ✅; record read-only after approval ✅; blocked ticket → button disabled, no reason field ✅ ·
RECEPTION: cancel of a NEW ticket fails with an RLS error — **pre-existing, see KI-10** (the cancel type itself was saved by `repair_set_cancel_result`).

Test shortcuts (local only): two tickets were moved to WAITING_APPROVAL by SQL (the "승인 요청" button shows a browser confirm dialog);
`window.confirm` was stubbed once for the symptom-code delete.

Local-stack note: after `db reset` the API gateway container (`supabase_kong_digital-rescue`) returned empty replies until restarted
(`docker restart supabase_kong_digital-rescue`). Environment issue, not related to the migrations.

## Rollback

App first (`git revert <phase-2 commit>` restores the three old server actions), then `supabase/test-fixtures/phase2_flow/rollback.sql`
(same SQL as plan §6). **Verified locally 2026-10-01:** afterwards 0 Phase 2 relations, 0 Phase 2 functions, 0 flag columns; `md5(prosrc)` of
`approve_material_dispatch`, `protect_approved_ticket`, `recalc_ticket_material_cost` unchanged; then `db reset` + 232 tests PASS.
Repair-record data is lost on rollback; stock booked through the RPCs stays (ordinary rows in existing tables).

## Deployment (Brad)

1. Phase 0.5 and Phase 1 are still pending in production; apply in order (0.5 → 1 → 2).
2. **Migrations first** (`npx supabase db push`, or SQL editor: M1 then M2). The old app ignores the new objects and its old server actions keep working.
3. **Then the app.** The new app needs the RPCs (the three inventory actions call them) and the two flag columns.
4. Flags stay OFF. Train staff, then switch on at 재고 분류 설정 → "수리 기록 필수 확인".
5. Verify (read-only): `select ri_approval_gate_enabled, ri_cancel_gate_enabled from global_settings` → `f, f`;
   `select count(*) from symptom_codes` → 9; `select proacl from pg_proc where proname = 'ri_inbound_extracted_part'` → only `postgres`.

## How Brad verifies locally

`npx supabase db reset` → `npx supabase test db` (232 pass) → `npm run typecheck && npm run lint && npm run build` →
dev server against the local stack, sign in as `tech@example.test`, open an IN_PROGRESS ticket → "수리 기록".

## Known risks / notes

- **KI-10 (new, pre-existing behaviour):** RECEPTION cannot cancel any ticket (RLS). Decide separately.
- The three inventory actions now run with the caller's session; a role without permission gets the Korean refusal from the RPC instead of the action's own check (same texts).
- Decision 7 changes where capacity-less extracted parts land (see the second row of the equivalence table) — stock counts per item stay correct, but such parts no longer merge into an item that has a capacity.
- Free text (diagnosis, notes) is visible to all staff — the placeholder asks not to enter customer data; nothing enforces it.
- Gates are enforced in the two server actions, not by a DB trigger (same level as the existing "final_price > 0" rule).
- Cancel gate: the cancel type is saved before the status update; if the update then fails (e.g. KI-10) the record keeps the chosen value on a still-open ticket.
- `DONOR_KEEP` is only a label until Phase 4. `불량품` is still booked as USED stock (unchanged).
- `SymptomCodesClient` saves name/order on blur; the code itself cannot be changed after creation.
