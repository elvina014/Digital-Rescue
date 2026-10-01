# Phase 2 — Repair record module (수리 기록) — PLAN

Status: **APPROVED 2026-10-01 — EXECUTED 2026-10-01** (see `phase-2-report.md`). Branch `feat/repair-intelligence`.

## 0. Preconditions (checked 2026-10-01)

| Check | Result |
| --- | --- |
| Phase 1 report exists, all acceptance rows ✅ | yes (`phase-1-report.md`, pgTAP 88/88, commit `d3f622e`) |
| Phase 0.1 / 0.5 reports | ✅ (0.5 and 1 are "local ✅, production deploy pending" — Brad's step; Phase 2 depends only on 0.1) |
| Dev target | The session prompt left the target as a placeholder. Per Q9 / `03-working-rules.md` = **local Supabase on Docker**. Brad confirms "local" together with APPROVED (§11-1). |
| Working tree | Only pre-existing, non-RI changes (`.claude/*`, `.gitignore`) — not touched. |

Every CLI call uses local-only commands (`db reset`, `test db`, `gen types --local`, `db advisors --local`).
Production: no queries planned in this phase.

## 1. Goal and acceptance (roadmap)

Capture what was found and done on every repair, in structured form.

Acceptance: a full ticket can be recorded end-to-end; gates ON block incomplete approval/cancel;
override logged; with flags OFF existing flows unchanged; RPC equivalence tests pass.

## 2. What is NOT changed

- No existing table column, trigger, policy or function is altered or replaced.
  (Additive only: 2 new columns on `global_settings`. `recalc_ticket_material_cost` is *called*, not modified.)
- `approve_material_dispatch`, dispatch request/reject/cancel, refund flows, `restoreCanceledTicketAction`,
  `confirmDisposalAction`: untouched.
- `material_cost_details`, `override_unit_price`: never written (P7).
- KI-9 (`protect_approved_ticket` keyword bug), KI-1, KI-2: untouched.

## 3. Schema

Two migrations (separately revertible):
- **M1** `supabase/migrations/<UTC ts>_repair_records.sql` — tables, view, flags, gate functions.
- **M2** `supabase/migrations/<UTC ts+1>_inventory_flow_rpcs.sql` — transactional RPCs (Q3).

All new tables: `id uuid PK default gen_random_uuid()`, RLS enabled, `anon` revoked, indexes on every FK column.
Code values are English upper-case in the DB (existing convention, e.g. `RETURN`/`DISPOSE`); the UI shows Korean labels.

### 3.1 Tables (M1)

| Table | Columns | Constraints |
| --- | --- | --- |
| `symptom_codes` | `parent_id uuid NULL` → self **RESTRICT**, `code text NOT NULL` (e.g. `POWER`, `POWER.NO_POWER`), `name text NOT NULL` (Korean), `sort_order int NOT NULL DEFAULT 0`, `is_active boolean NOT NULL DEFAULT true`, `created_at` | UNIQUE(`code`); UNIQUE NULLS NOT DISTINCT (`parent_id`,`name`). Seeded **in the migration** (reference data needed in production too): 전원 `POWER`, 충전 `CHARGING`, 디스플레이 `DISPLAY`, 부팅 `BOOT`, 발열 `THERMAL`, 입력장치 `INPUT`, 외관 `EXTERIOR`, 데이터 `DATA`, 기타 `OTHER`. No children seeded — ADMIN adds them. |
| `ticket_symptoms` | `ticket_id` → repair_tickets **RESTRICT**, `symptom_code_id uuid NULL` → symptom_codes RESTRICT, `note text NULL` (free text), `created_by uuid DEFAULT auth.uid()` → employees SET NULL, `created_at` | CHECK (`symptom_code_id IS NOT NULL OR note` non-empty); UNIQUE(`ticket_id`,`symptom_code_id`) |
| `repair_records` | `ticket_id` → repair_tickets **RESTRICT**, `diagnosis_summary text NULL`, `fault_category text NULL`, `result text NULL`, `notes text NULL`, `removed_parts_confirmed boolean NOT NULL DEFAULT false` ("적출 부품을 모두 기재했음/없음" confirmation, used by the gates), `created_by`, `updated_by`, `created_at`, `updated_at` | **UNIQUE(`ticket_id`)** (1 per ticket); CHECK `result IN ('COMPLETED','PARTIAL','UNREPAIRABLE','CUSTOMER_ABANDONED','SIMPLE_CANCEL')` (완료 / 부분수리 / 수리불가 / 고객포기 / 단순취소 — see §11-2); CHECK `fault_category IN (…)` (see §11-3) |
| `repair_measurements` | `ticket_id` RESTRICT, `sort_order int`, `label text NOT NULL` (측정 지점, e.g. "PPBUS_G3H", "19V 입력"), `kind text NOT NULL DEFAULT 'OTHER'` CHECK IN (`VOLTAGE`,`RESISTANCE`,`DIODE`,`CURRENT`,`OTHER`), `value numeric NULL`, `unit text NULL`, `value_text text NULL`, `judgement text NOT NULL DEFAULT 'UNKNOWN'` CHECK IN (`NORMAL`,`ABNORMAL`,`UNKNOWN`), `note text NULL`, `created_by`, `created_at` | CHECK (`value IS NOT NULL OR value_text` non-empty) |
| `repair_faults` | `ticket_id` RESTRICT, `sort_order int`, `component text NOT NULL` (부품/위치, e.g. "U7000", "LCD 케이블"), `fault_type text NOT NULL DEFAULT 'OTHER'` CHECK IN (`SHORT`,`OPEN`,`LEAKAGE`,`NO_OUTPUT`,`CORROSION`,`PHYSICAL`,`FIRMWARE`,`OTHER`), `description text NULL`, `created_by`, `created_at` | |
| `repair_actions` | `ticket_id` RESTRICT, `sort_order int NOT NULL`, `action_type text NOT NULL DEFAULT 'OTHER'` CHECK IN (`REPLACE`,`REWORK`,`CLEAN`,`FIRMWARE`,`ADJUST`,`OTHER`), `description text NOT NULL`, `succeeded boolean NULL` (NULL = 미확정; `false` rows are kept — failed attempts are knowledge), `fault_id uuid NULL` → repair_faults SET NULL, `performed_by uuid DEFAULT auth.uid()`, `performed_at timestamptz DEFAULT now()` | |
| `ticket_removed_parts` | `ticket_id` RESTRICT, `description text NOT NULL`, `category_id uuid NULL` → inventory_categories, `disposition text NULL` CHECK IN (`DISCARD` 폐기, `CUSTOMER_RETURN` 고객반환, `STOCK` 재고등록, `DONOR_KEEP` Donor유지) — NULL = 미정, `return_spec text`, `return_name text`, `return_capacity text` (≤ 50 chars = `inventory_items.capacity` length), `return_condition text` CHECK IN ('중고품','불량품') (same values as `ticket_materials`), `quantity int NOT NULL DEFAULT 1 CHECK > 0`, `handled_by uuid`, `handled_at timestamptz`, **RPC-only:** `inbound_approved_at timestamptz`, `inbound_approved_by uuid`, `inventory_item_id uuid NULL` → inventory_items **SET NULL** (must not block the existing admin item delete), `created_by`, `created_at`, `updated_at` | CHECK (`disposition <> 'STOCK'` OR (`category_id`, `return_spec`, `return_name`, `return_condition` all present)); CHECK (`inbound_approved_at IS NULL OR disposition = 'STOCK'`) |
| `ticket_close_overrides` | `ticket_id` RESTRICT, `gate text` CHECK IN (`APPROVAL`,`CANCEL`), `reason text NOT NULL` (non-empty), `missing jsonb NOT NULL` (snapshot of unmet items), `overridden_by uuid NOT NULL` → employees RESTRICT, `created_at` | |

`ticket_id` uses **RESTRICT** (00-current-state §8.7, same as `ticket_refunds`): a ticket with a repair record can no
longer be hard-deleted. The app has no ticket-delete feature (only the ADMIN RLS policy exists) — see §11-5.

Triggers (new functions, nothing shared with existing code):
- `repair_set_updated_at()` on `repair_records`, `ticket_removed_parts`.
- `repair_removed_part_stamp()` BEFORE INSERT/UPDATE on `ticket_removed_parts`: when `disposition` changes →
  `handled_by := auth.uid()`, `handled_at := now()` (NULL when disposition is cleared).

### 3.2 Flags (M1) — Q4

`ALTER TABLE global_settings ADD COLUMN ri_approval_gate_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN ri_cancel_gate_enabled boolean NOT NULL DEFAULT false;` (+ comments). Existing policies apply (SELECT all, UPDATE ADMIN).

### 3.3 View (M1) — parts used, no re-entry (P6)

`repair_parts_used` `WITH (security_invoker = true)`: `ticket_materials` rows with
`request_status IN ('approved','cancel_requested')` joined to item/category/spec/product names:
`ticket_id, material_id, request_type, quantity, category_name, spec_name, product_name, capacity, condition, is_outsourced (spec = '외주')`.
No prices, no customer data. Read-only in the UI.

### 3.4 Lock-after-approval rule and RLS (M1)

Helper `repair_record_can_edit(p_ticket_id uuid) RETURNS boolean` — STABLE, SECURITY DEFINER, `search_path = public`:

| Caller (`get_my_role()`) | Ticket not approved and not CANCELED | Ticket approved (`is_approved`) or CANCELED |
| --- | --- | --- |
| ADMIN | ✅ | ✅ (corrections after the fact) |
| MANAGER | ✅ | ❌ |
| TECHNICIAN / EXPERT_REPAIR, `assignee_id = auth.uid()` | ✅ | ❌ |
| others (RECEPTION, CS, unassigned technicians) | ❌ | ❌ |

| Table | SELECT | INSERT / UPDATE / DELETE |
| --- | --- | --- |
| `symptom_codes` | all authenticated | `get_my_role() = 'ADMIN'` |
| `ticket_symptoms`, `repair_records`, `repair_measurements`, `repair_faults`, `repair_actions` | all authenticated (Q7 — tables hold no customer columns; **not** scoped by ticket assignment, unlike the copy-paste risk in §8.10 this is the decided behaviour) | `repair_record_can_edit(ticket_id)` (USING + WITH CHECK) |
| `ticket_removed_parts` | all authenticated | `repair_record_can_edit(ticket_id) AND inbound_approved_at IS NULL` (a row whose stock was booked is frozen for everyone). Column privileges: `authenticated` gets INSERT/UPDATE only on the editable columns — **not** on `inbound_approved_at`, `inbound_approved_by`, `inventory_item_id`, `handled_by`, `handled_at`. |
| `ticket_close_overrides` | ADMIN, MANAGER | none (RPC only) |

### 3.5 Gate functions (M1)

All: `search_path = public`, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, then `GRANT EXECUTE … TO authenticated`.

| Function | Kind / role check | Behaviour |
| --- | --- | --- |
| `repair_gate_check(p_ticket_id uuid, p_gate text) RETURNS jsonb` | STABLE, **invoker** (RLS applies; caller must be able to read the ticket) | Returns `{"ok": bool, "missing": ["진단 요약", …]}`. **APPROVAL:** record exists; `diagnosis_summary` non-empty; `result IN (COMPLETED, PARTIAL)`; ≥ 1 `ticket_symptoms`; ≥ 1 `repair_actions`; `removed_parts_confirmed`; no removed part with `disposition IS NULL`. **CANCEL:** `result IN (UNREPAIRABLE, CUSTOMER_ABANDONED, SIMPLE_CANCEL)`; if the device was received (`received_at IS NOT NULL`): `removed_parts_confirmed` and no undispositioned removed part. Pre-receipt cancel: result only. |
| `repair_set_cancel_result(p_ticket_id uuid, p_result text)` | SECURITY DEFINER; ADMIN/MANAGER; RECEPTION only while status `NEW`; TECHNICIAN/EXPERT_REPAIR only if assignee (= who can update the ticket today); ticket not COMPLETED/CANCELED; result must be one of the three cancel values | Upserts `repair_records.result` (other fields untouched). Needed because RECEPTION cannot edit records but can cancel NEW tickets. |
| `repair_gate_override(p_ticket_id uuid, p_gate text, p_reason text)` | SECURITY DEFINER; **ADMIN only**; reason non-empty | Inserts `ticket_close_overrides` with the current `missing` snapshot; returns the row id. |

The gates are enforced in the two server actions (§4.3), like every other existing ticket rule
(e.g. "final_price > 0"); no trigger is added to `repair_tickets`.

### 3.6 Transactional RPCs (M2) — Q3

All: SECURITY DEFINER, `SET search_path = public`, role check via `get_my_role()` / `auth.uid()`, row locks
(`FOR UPDATE`), Korean error text identical to today's messages, return `jsonb` (`{"success":true,…}` / `{"error":"…"}`),
EXECUTE granted to `authenticated` only. Called with the **session** client — the service_role client is no longer
used by these three actions.

| Function | Replaces | Role | One transaction |
| --- | --- | --- | --- |
| `ri_inbound_extracted_part(p_category_id, p_spec, p_name, p_capacity, p_quantity, p_ticket_id, p_tx_user_id) RETURNS uuid` | steps 3–6 of `approveReturnMaterialAction` | **internal** — no EXECUTE for anyone; only called by the functions below (and by Phase 4 donor extraction, `p_ticket_id` may be NULL) | find-or-create `inventory_specs` (category, name) → find-or-create `inventory_products` (spec, name) → find `inventory_items` (category, spec, product, `USED`, **capacity**) and `quantity += n`, else insert (`USED`, `base_estimate 0`, **capacity stored**) → INBOUND transaction, notes `적출품 반환 입고`. Returns the item id. |
| `register_return_material(p_material_id, p_category_id, p_spec, p_name, p_condition, p_quantity, p_capacity)` | `registerReturnMaterialAction` | ADMIN, MANAGER, or assigned TECHNICIAN/EXPERT_REPAIR (same people who see the button; today the action itself has no check — §11-6) | same validations and messages; sets the same `return_*` columns + `return_status='pending'`; inserts the same `ticket_logs` line |
| `approve_return_material(p_material_id)` | `approveReturnMaterialAction` | ADMIN, MANAGER | lock row; must be registered + `pending`; `return_status='approved'`; category = `return_category_id` ?? original item's category; `ri_inbound_extracted_part(…, tx user = ticket assignee ?? caller)`; same `ticket_logs` line. Any failure rolls everything back (no manual compensation). |
| `confirm_material_return(p_material_id)` | `confirmMaterialReturnAction` | ADMIN, MANAGER | lock row; must be `cancel_requested`; → `cancelled`; if `dispatch`: lock item, `quantity += qty`, INBOUND `접수 취소로 인한 자재 원복` (user = caller); `recalc_ticket_material_cost(ticket)`; same `ticket_logs` line. `purchase`: no stock change (as today). |
| `approve_removed_part_inbound(p_removed_part_id)` | — (new: extraction **without** a `ticket_materials` row) | ADMIN, MANAGER | lock row; `disposition='STOCK'` and not yet approved; `ri_inbound_extracted_part(…)`; sets `inbound_approved_at/by`, `inventory_item_id`; `ticket_logs` line "시스템: 적출 자재 입고 승인 완료 (…)" |

**Intended differences from the old flow** (everything else must be identical — §7.B):

| # | Old | New | Why |
| --- | --- | --- | --- |
| D1 | item created with `capacity NULL`; `return_capacity` dropped | capacity stored; matching includes capacity (`IS NOT DISTINCT FROM`, trimmed, '' → NULL) | Q3 condition 3. With `return_capacity` NULL the result is identical to today. |
| D2 | if several items match (category, spec, product, USED), `.single()` errors and a **duplicate item** is inserted | the matching row (oldest `created_at`) is incremented | deterministic; old behaviour is an accident |
| D3 | partial writes possible on failure (status flipped, stock not booked, missing INBOUND row) | all-or-nothing | Q3 |
| D4 | service_role, user id passed from the app | session client, `auth.uid()` | R4 |
| D5 | `return_capacity` longer than 50 chars is accepted at registration and silently ignored | registration rejects > 50 chars ("용량은 50자 이내로 입력해 주세요.") | needed for D1 |

Unchanged on purpose: `불량품` is still booked as `USED` stock; an approved **purchase** line can still get
"+ 적출품 등록" (Phase 0.5 observation); outsourced (`외주`) lines stay excluded in the UI.

## 4. Application (UI Korean; new components < 200 lines; optimistic updates with rollback — R5)

Before coding: read the relevant guides in `node_modules/next/dist/docs/` (Server Actions / forms / `useOptimistic`) per `AGENTS.md`.

### 4.1 "수리 기록" section — new folder `src/app/(admin)/tickets/[id]/repair-record/`

| File | Content |
| --- | --- |
| `actions.ts` | session-client server actions: save record (upsert), add/update/delete symptom, measurement, fault, action, removed part; `approveRemovedPartInboundAction`; `overrideGateAction`. Korean error mapping. |
| `loadRepairRecord.ts` | server-side loader used by `page.tsx` (record, lists, symptom codes, parts-used view, material-row extracted registrations, flags, gate status) |
| `RepairRecordSection.tsx` | container; shown from status RECEIVED onward and on COMPLETED/CANCELED (read-only when `can_edit` is false) |
| `RecordSummaryForm.tsx` | 진단 요약, 고장 분류, 결과, 비고, "적출 부품 확인" checkbox |
| `SymptomPicker.tsx` | symptom code chips (2-level) + free text |
| `MeasurementList.tsx`, `FaultList.tsx`, `ActionList.tsx` | ordered lists with inline add / edit / delete; actions show 성공 / 실패 / 미확정 |
| `PartsUsedList.tsx` | read-only from `repair_parts_used` ("출고·구매 승인 내역에서 자동 표시") |
| `RemovedPartsList.tsx`, `RemovedPartForm.tsx` | removed parts **without** a material row: description, category, disposition; for 재고등록 the same spec/name/capacity/condition inputs as today's 적출품 form; also lists (read-only) the registrations made on material rows so the technician sees one complete list |
| `useOptimisticList.ts` | shared optimistic add/remove/update with rollback |
| `labels.ts` | code → Korean label maps |

### 4.2 Existing files changed

| File | Change |
| --- | --- |
| `src/app/(admin)/tickets/actions.ts` | `registerReturnMaterialAction`, `approveReturnMaterialAction`, `confirmMaterialReturnAction`: bodies replaced by the RPC call (same signature, same return shape, same `revalidatePath`s) — **only after §7.B passes**. `approveTicketAction`, `cancelTicketAction`: gate block at the top (§4.3). `getPendingReturnMaterials`: unchanged. |
| `tickets/[id]/page.tsx` | call the loader, pass props |
| `tickets/[id]/TicketDetailForm.tsx` | mount `<RepairRecordSection>`; approval card: when the flag is ON show the missing list, disable "최종 승인", ADMIN gets "사유 입력 후 강제 승인"; cancel modal: when the flag is ON add the required radio 수리불가 / 고객포기 / 단순취소 (+ missing list / ADMIN override). With both flags OFF these blocks render nothing. |
| `src/components/common/ReturnMaterialInboundWidget.tsx` + its data loading on `dashboard/page.tsx`, `inventory/page.tsx` | additionally list pending `ticket_removed_parts` (`STOCK`, not approved) with "입고 승인" → `approve_removed_part_inbound`. Existing rows unchanged. |
| `src/app/(admin)/inventory/settings/InventorySettingsClient.tsx`, `page.tsx`, `src/app/actions/inventoryActions.ts` | ADMIN-only card "수리 기록 필수 확인" with two toggles (new action `updateRepairGateFlags`; `getGlobalSettings` selects the two columns). Existing settings form untouched. |
| `src/app/(admin)/catalog/CatalogTabs.tsx` + new `catalog/symptoms/{page,SymptomCodesClient}.tsx`, `catalog/adminActions.ts` | ADMIN tab "증상 코드": add / rename / reorder / deactivate (delete only when unused). |
| `src/types/supabase.ts` | regenerated |
| `supabase/seed.sql` | fake data: one filled repair record (t5), removed parts in each disposition, fixtures for §7.B |

### 4.3 Gate flow in the server actions

`approveTicketAction` — after the existing checks, before the update:
1. read `ri_approval_gate_enabled`; if false → **existing code path, unchanged**;
2. `repair_gate_check(ticket, 'APPROVAL')`; ok → continue;
3. not ok: if ADMIN and `overrideReason` present → `repair_gate_override` then continue (+ log line
   "시스템: 수리 기록 미완료 상태로 강제 승인 (사유: …)"); otherwise return
   `{ error: "수리 기록이 완료되지 않아 승인할 수 없습니다: 진단 요약, …" }`.

`cancelTicketAction` — same pattern with `ri_cancel_gate_enabled`: `cancelResult` required →
`repair_set_cancel_result` → `repair_gate_check(ticket, 'CANCEL')` → override or error. Flag OFF → unchanged.

## 5. Files

| New | Changed |
| --- | --- |
| 2 migrations (§3); `supabase/tests/repair_records.test.sql`, `supabase/tests/inventory_flow_rpcs.test.sql`; `tickets/[id]/repair-record/*` (§4.1); `catalog/symptoms/*`; `phases/phase-2-report.md` | §4.2 list; docs (`02-roadmap.md` status, `known-issues.md` notes, `01-design-principles.md` P5 wording "once switched") |

## 6. Rollback SQL

App first (`git revert <phase-2 commit>` — restores the three old server actions), then DB:

```sql
BEGIN;
-- M2
DROP FUNCTION IF EXISTS public.approve_removed_part_inbound(uuid);
DROP FUNCTION IF EXISTS public.confirm_material_return(uuid);
DROP FUNCTION IF EXISTS public.approve_return_material(uuid);
DROP FUNCTION IF EXISTS public.register_return_material(uuid, uuid, text, text, text, integer, text);
DROP FUNCTION IF EXISTS public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid);
-- M1
DROP FUNCTION IF EXISTS public.repair_gate_override(uuid, text, text);
DROP FUNCTION IF EXISTS public.repair_set_cancel_result(uuid, text);
DROP FUNCTION IF EXISTS public.repair_gate_check(uuid, text);
DROP VIEW IF EXISTS public.repair_parts_used;
DROP TABLE IF EXISTS public.ticket_close_overrides, public.ticket_removed_parts, public.repair_actions,
  public.repair_faults, public.repair_measurements, public.repair_records, public.ticket_symptoms,
  public.symptom_codes;
DROP FUNCTION IF EXISTS public.repair_record_can_edit(uuid);
DROP FUNCTION IF EXISTS public.repair_removed_part_stamp();
DROP FUNCTION IF EXISTS public.repair_set_updated_at();
ALTER TABLE public.global_settings
  DROP COLUMN IF EXISTS ri_approval_gate_enabled,
  DROP COLUMN IF EXISTS ri_cancel_gate_enabled;
COMMIT;
```

Effect: all repair-record data is lost (export first if any exists). Stock already booked through the new RPCs
(`inventory_items`, `inventory_transactions`, `ticket_materials.return_*`) stays — it is ordinary data in existing
tables, identical in shape to what the old flow wrote. Exact signatures are repeated in the report; the rollback
is executed once locally and verified (as in Phase 1).

## 7. Test plan (local only)

### A. pgTAP `repair_records.test.sql`
1. Constraints: one record per ticket; result / fault_category / disposition CHECKs; STOCK needs category+spec+name+condition; symptom needs code or note.
2. RLS matrix with the 6 seed roles: all read; edit only per §3.4 (assigned vs other technician, MANAGER, RECEPTION, CS); `symptom_codes` ADMIN only; overrides readable by ADMIN/MANAGER only; anon nothing.
3. Lock: after `is_approved` or CANCELED — technician/MANAGER writes are refused, ADMIN allowed.
4. Column privileges: technician cannot set `inbound_approved_at` / `inventory_item_id` / `handled_by`; `handled_*` stamped by trigger.
5. `repair_gate_check`: each missing item reported individually; complete record → ok; cancel pre-receipt needs result only.
6. `repair_set_cancel_result`: RECEPTION on NEW ok / on ASSIGNED refused; unassigned technician refused; wrong value refused; existing record fields kept.
7. `repair_gate_override`: non-ADMIN refused; empty reason refused; row holds the missing snapshot.
8. `repair_parts_used`: only approved / cancel_requested rows; outsourced flagged.
9. Privileges/definitions: no EXECUTE for PUBLIC/anon (via `has_function_privilege`, KI-8); definer functions have `search_path`; RLS on all 8 tables.
10. Flags default false.

### B. Equivalence of the three flows — **before** the UI is switched
1. **Real old code, captured first.** Before `actions.ts` is touched: on a freshly reset local DB, run the existing UI
   (dev server → local stack, temporary `.env.development.local`, deleted afterwards) through fixed scenarios and dump
   the affected rows (`ticket_materials`, `inventory_specs/products/items`, `inventory_transactions`, `ticket_logs`,
   `repair_tickets.material_cost`) as JSON without ids/timestamps → `supabase/tests/fixtures/phase2_old_flow/*.json` (fake seed data only).
   Scenarios: (a) return confirm — dispatch; (b) return confirm — purchase; (c) extracted inbound — existing spec+product+item;
   (d) new spec; (e) existing spec, new product; (f) 불량품; (g) return category ≠ original category; (h) register → approve chain (technician then manager).
2. `db reset`, run the **RPCs** as the same users on the same fixtures, dump the same rows, diff. Expected: identical,
   except D1 (capacity) in scenarios with a capacity — those are run twice: capacity NULL (must be identical) and with capacity (only `inventory_items.capacity` / matching differs).
3. pgTAP `inventory_flow_rpcs.test.sql`: the same scenarios as assertions (breadth + regression), plus error paths with
   unchanged data and identical messages (not pending, already registered, wrong status, unknown id), role refusal per
   function, atomicity (forced failure inside `ri_inbound_extracted_part` → nothing changed), D2 (two matching items),
   D5, `approve_removed_part_inbound` (no material row; `p_ticket_id` NULL path of the internal function), quantity/transaction consistency.
4. After switching the actions: repeat step 1's scenarios through the UI → same dumps as step 2.

### C. E2E (local stack, seed accounts)
1. TECHNICIAN records a full repair on an IN_PROGRESS ticket (symptoms, measurements, fault, failed + successful action, removed part → 재고등록, another → 폐기, confirmation) → submits estimate.
2. MANAGER: inbound approval of the removed part in the widget → item + INBOUND row.
3. Flags ON (ADMIN toggles): MANAGER approval of an incomplete ticket → blocked with the Korean list; ADMIN override with reason → approved, override row + log; complete ticket → approved normally.
4. Cancel with flag ON: result required; RECEPTION cancels a NEW ticket with 단순취소; received ticket with an undispositioned part → blocked.
5. Flags OFF: approval and cancel behave exactly as before (no new inputs rendered).
6. After approval: record read-only for technician/MANAGER, editable by ADMIN. Another technician can read but not edit.
7. ADMIN symptom-code tab: add child code, deactivate, delete-in-use refused.

### D. Static / advisors
`npx supabase db reset` ×2; `npx supabase test db` (88 existing + new); `npm run db:types`, `typecheck`, `lint`, `build`;
`npx supabase db advisors --local --type all` — new findings fixed, pre-existing listed.

## 8. Implementation order

1. M1 + pgTAP A → 2. M2 + pgTAP B.3 → 3. capture old-flow dumps (B.1) and compare with the RPCs (B.2) —
**if any unexplained difference remains: STOP and report (R8)** → 4. switch the three actions (B.4) →
5. repair-record UI → 6. gates + flags UI → 7. symptom-code admin tab → 8. E2E, static checks, advisors, rollback rehearsal →
9. report, local commit.

## 9. Risks

- **Role tightening (D4, §11-6):** the three actions move from service_role to the session client; a role that could
  trigger them today only by crafting a request (no UI) loses that ability. Intended.
- **RESTRICT on `ticket_id`:** hard-deleting a ticket with repair data fails (§11-5).
- **Free text may contain customer PII** (diagnosis, notes) although the tables have no customer columns — visible to all staff (Q7). UI hint "고객 개인정보를 적지 마세요"; Phase 5/8 RPCs must still treat these fields carefully.
- **Two entry points for extracted parts** (material row vs removed-part list) — mitigated by showing both in one list; unification is deliberately not done now (would change the existing flow's data shape).
- **Gate is app-level**, like all existing ticket rules; a direct API call by a role with UPDATE rights could bypass it.
- **Cancel gate is two steps** (result saved, then status update): if the status update fails the result stays set on an active ticket — harmless, editable.
- `TicketDetailForm.tsx` (1809 lines) grows by the mount point + gate UI only; everything else lives in new files.
- Deploy order for Brad: migrations first (old app ignores new objects; old actions keep working), then the app.
- `DONOR_KEEP` is only a label until Phase 4.

## 10. Out of scope

Part specs / compatibility and the per-part "정상동작/조건부/비호환" question (Phase 3); donors (Phase 4); qty-1 individual
items and labels (Q8, Phase 7); board/model links on records beyond what the ticket already has; rejecting an inbound
request; unifying material-row registration into `ticket_removed_parts`; KI-9; search of past cases (Phase 5/10).

## 11. Decisions needed from Brad (with APPROVED)

**Answers (Brad, 2026-10-01):** 1 local Docker ✅ · 2 five unified values ✅ · 3 draft list as is (to be revised later) ✅ ·
4 ✅ · 5 RESTRICT ✅ · 6 ADMIN, MANAGER, assigned technician, **and 정밀수리팀 (EXPERT_REPAIR)** — implemented as written in
§3.6 (assigned EXPERT_REPAIR); "all members regardless of assignment" was asked but not answered, see the report's open point · 7 ✅ · 8 ✅ · 9 ✅.
"APPROVED" given 2026-10-01.

1. **Dev target** = local Docker Supabase? (placeholder in the prompt)
2. **Result values:** roadmap lists 완료 / 부분수리 / 수리불가 / 고객취소, Q2 lists 수리불가 / 고객포기 / 단순취소 for cancel.
   Proposal: one list of five — 완료, 부분수리, 수리불가, 고객포기, 단순취소 ("고객취소" split in two). Approval needs 완료/부분수리; cancel needs one of the other three.
3. **고장 분류 (`fault_category`) list** — proposal: 메인보드, 디스플레이, 배터리, 전원/충전, 저장장치, 메모리, 입력장치, 냉각, 외관/힌지, 소프트웨어, 침수, 기타, 이상없음. Change freely.
4. **Removed parts vs existing 적출품 등록:** keep the existing per-material registration as is (now via RPC) and use
   `ticket_removed_parts` for parts without a material row, both shown in one list; the gate asks for the
   "적출 부품 확인" checkbox + no undecided rows (it does **not** force a registration for every dispatched part — today's red warning stays a warning). OK?
5. **Ticket delete:** RESTRICT (ticket with repair data cannot be hard-deleted) — or CASCADE like the Phase 1 link log?
6. **Who may register extracted parts:** ADMIN, MANAGER, assigned TECHNICIAN/EXPERT_REPAIR (matches the UI). OK?
7. **Capacity matching (D1/D2):** extracted parts with different capacities become separate stock rows; same capacity accumulates. OK?
8. **Lock rule (§3.4):** after approval/cancel only ADMIN edits the record (MANAGER read-only). OK?
9. **Gate minimum (§3.5):** approval requires 진단 요약 + 결과 + 증상 ≥ 1 + 조치 ≥ 1 + 적출 부품 확인. Measurements and faults optional. OK?
