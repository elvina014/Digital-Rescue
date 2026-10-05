# Phase 6 — Purchase guard (구매 요청 전 내부 자원 확인) — PLAN

Status: **APPROVED 2026-10-03 — EXECUTED 2026-10-03** (see `phase-6-report.md`; decisions in §11). Branch `feat/repair-intelligence`.

## 0. Preconditions (checked 2026-10-03)

| Check | Result |
| --- | --- |
| Phase 5 report exists, all acceptance rows ✅ | yes (`phase-5-report.md`, pgTAP 535/535, commit `90dc775`) |
| Dependencies: Phase 0.5 (purchase approval fix), Phases 3–5 | all "✅ local" (reports present). Production deploy of 0.5–5 pending (Brad's step) — does not block local work |
| Dev target | The session prompt left the target as a placeholder. Per Q9 / `03-working-rules.md` = **local Supabase on Docker**. Brad confirms with APPROVED (§11-1) |
| Working tree | Only pre-existing, non-RI changes (`.claude/*`, `.gitignore`) — not touched |

Production: no queries planned.

## 1. The real purchase path (read from code, 2026-10-03)

| Step | Code | Notes |
| --- | --- | --- |
| Select item | `EstimateCard.tsx:251` (수리 시작) / `AddMaterialCard.tsx:105` (수리 중 추가) | `request_type = 'purchase'` when the chosen `inventory_items.quantity <= 0`, else `dispatch` |
| Insert row | `startRepairAction` :463 / `addTicketMaterialsAction` :662 | `ticket_materials` row with `request_status = 'pending'` — nothing is ordered yet |
| **Request** | button "자재구매요청" in `TicketDetailForm.tsx:650-672` → `requestMaterialDispatchAction(materialId)` :1373 | service_role UPDATE `pending → requested` (optimistic `eq(pending)`), `ticket_logs` "자재 구매가 요청되었습니다". **No role check today** (button shown only when `canEditEstimate`: ADMIN / MANAGER / assigned TECHNICIAN·EXPERT_REPAIR) |
| Approve | `MaterialDispatchWidget` (dashboard, inventory) lists `requested` only → `approve_material_dispatch` (Phase 0.5: purchase = no stock change) | unchanged in Phase 6 |

→ **The guard hooks the "request" step** (`pending → requested` for `purchase`). That is the moment staff commit to buying; the selection
cards only create a draft row. One entry point, no change to the estimate / selection flow.

## 2. What is NOT changed

- **Flag OFF (default, P10) → behaviour byte-identical to today**: `requestMaterialDispatchAction` takes its existing code path, no check, no log,
  no dialog. The new trigger (§3.4) is a no-op while the flag is OFF.
- Dispatch requests (`request_type = 'dispatch'`) are never guarded.
- `approve_material_dispatch`, rejection, cancel, rollback, `EstimateCard`, `AddMaterialCard`, `startRepairAction`, `addTicketMaterialsAction`: unchanged.
- No inventory write, no compatibility write, no stock reservation. The guard only **shows** resources and **records** the reason.
- Existing functions / views / policies / triggers: unchanged (md5 + ACL snapshot before / after, as in Phases 3–5).
  The one addition to an existing table is a **new** trigger on `ticket_materials` (§3.4, decision §11-4) — listed here per R2.

## 3. Schema — one migration `supabase/migrations/<UTC ts>_purchase_guard.sql`

### 3.1 Flag (Q4, P10)

`global_settings.ri_purchase_guard_enabled boolean NOT NULL DEFAULT false` — "구매 요청 시 내부 자원 확인 (기본 OFF)".
Toggle added to the existing `RepairGateSettingsCard` on `/inventory/settings` (ADMIN).

### 3.2 Table `purchase_guard_logs` (구매 사유 기록)

| Column | Type / rule |
| --- | --- |
| `id` | uuid PK `gen_random_uuid()` |
| `ticket_id` | uuid NOT NULL → `repair_tickets` **RESTRICT** (same as Phase 2–4 tables) |
| `material_id` | uuid NOT NULL → `ticket_materials` **RESTRICT**, UNIQUE (one log per purchase request) |
| `item_label` | text NOT NULL — snapshot "카테고리 / 세부 / 제품 / 용량 (신품·중고)" |
| `quantity` | integer NOT NULL (> 0) |
| `resource_count` | integer NOT NULL (≥ 0) — number of resource rows found |
| `resources` | jsonb NOT NULL DEFAULT `'[]'` — snapshot of what was shown (§3.3), **no prices, no customer data** |
| `reason_code` | text NULL CHECK IN (`INTERNAL_DEFECTIVE` 내부재고 불량, `CUSTOMER_NEW` 고객 신품요청, `DONOR_UNVERIFIED` Donor 상태 미확인, `LEAD_TIME` 납기, `OTHER` 기타) |
| `reason_note` | text NULL, ≤ 500 chars |
| `requested_by` | uuid NOT NULL → employees RESTRICT (`auth.uid()`) |
| `created_at` | timestamptz NOT NULL DEFAULT now() |

Constraints: `resource_count = 0 OR reason_code IS NOT NULL` (resources found ⇒ reason required);
`reason_code <> 'OTHER' OR char_length(btrim(reason_note)) >= 2` (기타 ⇒ text). Indexes on `ticket_id`, `requested_by`, `created_at`, `reason_code`.

Every guarded purchase request is logged — also those with 0 resources — so the report can show "구매 n건 중 내부 자원 있었던 m건".

RLS (enabled, `anon` revoked, no INSERT / UPDATE / DELETE policy — writes only through the RPC):

| SELECT | INSERT / UPDATE / DELETE |
| --- | --- |
| ADMIN (§11-5) | none (definer RPC only) |

### 3.3 Functions

All: `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE … TO authenticated` (except the internal helper and trigger function: no grant).
Caller check (both public functions): `get_my_role() IN ('ADMIN','MANAGER')`, or `TECHNICIAN` / `EXPERT_REPAIR` **assigned** to the ticket — the same people who see the button today (`canEditEstimate`). Error: "구매 요청 권한이 없습니다." (§11-3).

| Function | Purpose |
| --- | --- |
| `ri_purchase_resources(p_material_id uuid) RETURNS jsonb` (internal, no grant) | Builds the resource list for a purchase row (rules below). |
| `purchase_guard_check(p_material_id uuid) RETURNS jsonb` | For the dialog: `{ enabled, excluded, item_label, quantity, resources[], resource_count }`. Read-only. |
| `request_purchase_material(p_material_id uuid, p_reason_code text DEFAULT NULL, p_reason_note text DEFAULT NULL) RETURNS jsonb` | **One transaction:** lock the row `FOR UPDATE`; must be `purchase` + `pending` ("이미 출고 요청 중이거나 승인된 항목입니다." — same text as today); role check; flag must be ON; recompute resources (**server side, not trusted from the client**); if resources > 0 and no reason → "내부 자원이 있습니다. 구매 사유를 선택해 주세요."; `OTHER` without text → "기타 사유를 입력해 주세요."; insert `purchase_guard_logs`; set `app.purchase_guard = 'on'` (transaction-local) and UPDATE `request_status = 'requested'`. Returns `{ log_id, resource_count, reason_code }`. |

**Resources = "internal" alternatives to buying** (P9 order; outsourced spec `외주` and `is_test` data never counted, Q5). Each entry:
`{ source, label, qty, condition, note }`, no prices.

| # | `source` | Rule |
| --- | --- | --- |
| 1 | `STOCK_SAME_ITEM` | the requested stock row itself now has `quantity > 0` (restocked since selection) |
| 2 | `STOCK_SAME_PRODUCT` | other `inventory_items` rows with the same `product_id` **and** same capacity (trim / lower-case, NULL = NULL), `quantity > 0` — e.g. 신품 out, 중고 in stock |
| 3 | `STOCK_SAME_SPEC` | requested item has `part_spec_id` → other rows with that `part_spec_id`, `quantity > 0` |
| 4 | `STOCK_COMPATIBLE` | requested item has `part_spec_id` **and** the ticket has a 표준 모델 / 변형 / 보드 → specs of the **same `part_type`** that are rank 1–2 for the device (verified / documented, compatible or conditional — same targets and rank as `search_parts_for_device`) with linked stock `quantity > 0` |
| 5 | `DONOR_SAME_SPEC` | `donor_potential_stock` candidates with the same (or a rank 1–2 compatible, same `part_type`) `part_spec_id`, `condition_estimate <> 'FAULTY'` |
| 6 | `DONOR_SAME_DEVICE` | `AVAILABLE` candidates of **AVAILABLE donors with the same 표준 모델 (or board)** as the ticket whose `category_id` = the requested item's category, not FAULTY |

Duplicates (same stock row / candidate reached by two rules) are listed once under the first rule. Without part-spec links and a 표준 모델
only rules 1–2 can fire — deliberately narrow: a false "resource" forces staff to type a reason for nothing.
Items in spec `외주` → `excluded = true`, no guard (but they are never purchases in practice — qty 98/99).

### 3.4 Bypass protection — new trigger on `ticket_materials` (§11-4)

`ri_purchase_guard_enforce()` + `trg_ticket_materials_purchase_guard BEFORE INSERT OR UPDATE OF request_status`:
when `ri_purchase_guard_enabled` is true, `NEW.request_type = 'purchase'`, `NEW.request_status = 'requested'` and the row was not already
`requested`, and `current_setting('app.purchase_guard', true) IS DISTINCT FROM 'on'` → raise "구매 요청은 내부 자원 확인 후에만 가능합니다."
Effect: with the flag ON, the RPC is the **only** way to put a purchase into `requested` — also via the REST API (TECHNICIAN may INSERT
`ticket_materials` under today's RLS) or the service_role client. Flag OFF → the trigger returns `NEW` immediately.
Without this trigger the guard is enforced only in the app path.

## 4. Application (UI Korean; new components < 200 lines; optimistic update with rollback — R5)

Before coding: read the relevant guides in `node_modules/next/dist/docs/` per `AGENTS.md`.

### 4.1 Flow (flag ON)

1. Technician clicks "자재구매요청" → `PurchaseGuardDialog` opens and calls `purchase_guard_check`.
2. **No resources** → "내부 재고·Donor에서 대체 가능한 자원이 없습니다." + button "구매 요청" (no reason needed; still logged).
3. **Resources found** → list grouped "재고" / "Donor" (label, 수량, 신품·중고 / 상태, Donor 번호 + 보관 위치 메모) with hint
   "재고나 Donor 부품을 사용할 수 있다면 구매 대신 출고/적출을 진행하세요." + required reason radio (5 codes) + text for 기타
   ("구매 사유를 선택해 주세요.", "기타 사유를 입력해 주세요.") → "사유 기록 후 구매 요청".
4. Submit → optimistic `requested` (as today), rollback + Korean error on failure. Ticket log as today plus the reason:
   "시스템: 자재 구매가 요청되었습니다. (…) — 내부 자원 2건, 사유: 납기".
5. Error "내부 자원이 있습니다…" from the server (e.g. stock arrived between check and submit) → the dialog reloads the list.

### 4.2 New files

| File | Content |
| --- | --- |
| `src/app/(admin)/tickets/[id]/PurchaseGuardDialog.tsx` | dialog above |
| `src/app/(admin)/tickets/purchaseGuardActions.ts` | `getPurchaseGuardAction`, `requestPurchaseWithGuardAction` (session client → RPCs; ticket log + revalidate as today) |
| `src/app/(admin)/inventory/purchase-guard/page.tsx`, `PurchaseGuardReport.tsx` | report (§4.4) |
| `src/components/purchase-guard/labels.ts` | Korean labels for reason codes and sources |
| `supabase/tests/purchase_guard.test.sql`, `supabase/test-fixtures/phase6/rollback.sql` | pgTAP, rollback |

### 4.3 Existing files changed

| File | Change |
| --- | --- |
| `src/app/(admin)/tickets/actions.ts` | `requestMaterialDispatchAction`: for `purchase` rows read the flag; **ON → return `{ error: "구매 사유 확인이 필요합니다.", guard: true }`** (forces the dialog path); OFF → existing code untouched (≈ +8 lines) |
| `src/app/(admin)/tickets/[id]/TicketDetailForm.tsx` | new prop `purchaseGuardEnabled`; purchase button opens `PurchaseGuardDialog` when ON, else existing handler (≈ +15 lines) |
| `src/app/(admin)/tickets/[id]/page.tsx` | read the flag, pass the prop |
| `RepairGateSettingsCard.tsx`, `inventory/settings/page.tsx`, `inventoryActions.ts` `updateRepairGateFlags` | third toggle "구매 요청 시 내부 자원 확인" (ADMIN) |
| `src/components/layout/AdminSidebar.tsx` | menu "구매 사유 보고서" (`/inventory/purchase-guard`) — roles §11-5 (`/inventory` is already in `ADMIN_PATHS`, no proxy change) |
| `src/types/supabase.ts` | regenerated |
| docs | `02-roadmap.md` status, `known-issues.md` KI-5 note, this plan's status, `phase-6-report.md` |

### 4.4 Report page "구매 사유 보고서"

Period filter (default last 30 days) and reason filter. Summary: guarded purchase requests, with resources (n / %), per reason code, per source type.
Table: date, `receipt_no` (link to the ticket), item, 수량, resources found (재고 n · Donor n, expandable list), reason + note, requester,
current material status (요청중 / 승인 / 거부 / 취소). **No customer name, no prices.** Reads `purchase_guard_logs` under RLS (session client).

## 5. Rollback SQL

App first (`git revert <phase-6 commit>`), then:

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_ticket_materials_purchase_guard ON public.ticket_materials;
DROP FUNCTION IF EXISTS public.ri_purchase_guard_enforce();
DROP FUNCTION IF EXISTS public.request_purchase_material(uuid, text, text);
DROP FUNCTION IF EXISTS public.purchase_guard_check(uuid);
DROP FUNCTION IF EXISTS public.ri_purchase_material_info(uuid, boolean);  -- added during implementation (shared helper, see report)
DROP FUNCTION IF EXISTS public.ri_purchase_resources(uuid);
DROP TABLE IF EXISTS public.purchase_guard_logs;
ALTER TABLE public.global_settings DROP COLUMN IF EXISTS ri_purchase_guard_enabled;
COMMIT;
```

Effect: purchase reason logs are lost; `ticket_materials` rows and statuses stay as they are (requests made through the guard remain `requested` /
approved). Rehearsed locally before the report.

## 6. Test plan (local only)

### A. pgTAP `purchase_guard.test.sql`
Fixtures (fake): ticket with 표준 모델 + board, assigned TECHNICIAN; stock rows: requested item qty 0 (NEW), same product/capacity USED qty 1,
same product other capacity qty 3 (must **not** count), spec-linked rows, a rank-1 compatible spec of the same part type in stock, a rank-3 spec
in stock (must not count), a different part type in stock (must not count), a `외주` row; donors: same spec GOOD, same spec FAULTY (not counted),
same model same category, same model other category (not counted), SCRAPPED donor (not counted); `is_test` donor ticket.

1. Flag OFF: `request_purchase_material` refuses ("구매 요청 확인 기능이 꺼져 있습니다."); trigger lets a direct `pending → requested` UPDATE pass (old behaviour).
2. Resource rules 1–6 each found exactly when expected; negatives above not counted; duplicates listed once; no price / customer key in the JSON.
3. Flag ON, resources > 0: no reason → error, nothing written; `OTHER` without text → error; valid reason → status `requested`, one log row with snapshot and reason, `ticket_materials` otherwise unchanged; second call → "이미 출고 요청 중…"; no `inventory_items` / `inventory_transactions` change.
4. Flag ON, no resources: request without reason succeeds and is logged (`resource_count = 0`).
5. Dispatch row → "구매 요청 항목이 아닙니다."; `외주` item → `excluded`, request allowed without log (§11-6).
6. Roles: ADMIN / MANAGER any ticket; assigned TECHNICIAN / EXPERT_REPAIR ok; unassigned TECHNICIAN, RECEPTION, CS refused.
7. Bypass (flag ON): direct UPDATE `pending → requested` on a purchase as postgres/service_role and as MANAGER → refused; INSERT of a purchase already `requested` as TECHNICIAN → refused; dispatch rows unaffected; other column updates on a requested purchase (e.g. `approved` by `approve_material_dispatch`) unaffected.
8. Approval after the guard: `approve_material_dispatch` on the guarded purchase → approved, no stock change (Phase 0.5 behaviour intact).
9. RLS on `purchase_guard_logs`: ADMIN reads; other roles (incl. MANAGER) 0 rows; no direct INSERT / UPDATE / DELETE for anyone; anon nothing.
10. Privileges / definitions: no EXECUTE for PUBLIC / anon (`has_function_privilege`, KI-8); internal helper / trigger function not executable by `authenticated`; `search_path` set.
11. Regression: existing 535 assertions pass; md5 + ACL of all pre-existing functions, views, policies and triggers identical (only additions).

### B. E2E (local stack, seed accounts, temporary `.env.development.local` — deleted afterwards)
1. Flag OFF: TECHNICIAN "자재구매요청" works exactly as before (no dialog); MANAGER approves in the dashboard widget.
2. ADMIN turns the flag ON in 재고 설정.
3. TECHNICIAN: purchase with resources → dialog lists stock + donor, submit without reason → Korean validation; 기타 without text → validation; 납기 → "구매요청중", ticket log with reason.
4. TECHNICIAN: purchase without resources → dialog "자원 없음" → request works, logged.
5. MANAGER approves → stock unchanged; report page shows both rows with reasons, links, status 승인; filters work.
6. MANAGER / TECHNICIAN / CS: no report menu; `/inventory/purchase-guard` redirects. No console / server errors.

### C. Static / advisors / rollback
`npx supabase db reset` ×2; `npx supabase test db`; `npm run db:types`, `typecheck`, `lint`, `build`;
`npx supabase db advisors --local --type all --level info` — new findings fixed, pre-existing listed; rollback rehearsal (§5).

## 7. Implementation order

1. Migration + pgTAP A → 2. types → 3. server actions + dialog + `TicketDetailForm` hook → 4. flag toggle → 5. report page + menu →
6. E2E, static checks, advisors, rollback rehearsal → 7. report, docs, local commit. Conflict with the real schema or a step failing twice → STOP (R8).

## 8. Risks

- **Little to find at first in production**: part-spec links, 표준 모델 links and donors are mostly empty, so rules 3–6 rarely fire; rules 1–2 (same product)
  work immediately. The log still records every purchase.
- **Rule 2 false positives**: same product + capacity but different condition (USED instead of NEW) is listed — that is exactly the
  "고객 신품요청" / "내부재고 불량" case, so a reason is the intended answer.
- **Trigger on an existing table** (§3.4): any future code path that sets a purchase to `requested` must go through the RPC while the flag is ON.
  Today there is exactly one such path. The trigger fires only for `request_status` changes and returns immediately when the flag is OFF.
- **Race**: stock may change between dialog and submit — the RPC recomputes and refuses; the dialog reloads.
- Turning the flag ON while purchases are `pending` is fine (guard applies at request). Purchases already `requested` are untouched.
- `requestMaterialDispatchAction` keeps its missing role check for dispatch and for purchase with flag OFF (existing behaviour, not widened).

## 9. Out of scope

Reserving or auto-dispatching the found stock; switching a purchase row to dispatch / donor extraction from the dialog (staff do it with the
existing buttons); guarding dispatch requests; supplier / price data; changes to `EstimateCard` / `AddMaterialCard` (§11-7); labels / locations
(Phase 7); VECTOR (Phase 8); KI-7, KI-9, KI-10.

## 10. Files

| New | Changed |
| --- | --- |
| 1 migration; `supabase/tests/purchase_guard.test.sql`; `supabase/test-fixtures/phase6/rollback.sql`; §4.2 files; `phases/phase-6-report.md` | §4.3 list |

## 11. Decisions needed from Brad (with APPROVED)

**Answers (Brad, 2026-10-03):** 1 local Docker ✅ · 2 ✅ · 3 ✅ · 4 **trigger included** · 5 **ADMIN only** (report page, menu and
`purchase_guard_logs` SELECT policy) · 6 ✅ · 7 **no selection hint** · 8 rules 1–6 as proposed. "APPROVED" given 2026-10-03.

1. **Dev target** = local Docker Supabase? (placeholder in the prompt)
2. **Hook point**: guard at "자재구매요청" (pending → requested), not at item selection. OK?
3. **Who may request a purchase via the guard**: ADMIN / MANAGER, or the assigned TECHNICIAN / EXPERT_REPAIR (= who sees the button today). OK?
4. **DB trigger** on `ticket_materials` (§3.4) so the guard cannot be bypassed via the API while the flag is ON. Include (recommended), or app-only enforcement?
5. **Report access**: ADMIN + MANAGER (MANAGER approves purchases), or ADMIN only (Q12 default for RI admin tools)? Menu under 재고 (`/inventory/purchase-guard`).
6. **`외주` items and purchases with 0 resources**: 외주 → not guarded, not logged; 0 resources → no reason needed but **logged**. OK?
7. **Selection hint** (optional, not in the plan): show "내부 대체 자원 n건" already when a qty-0 item is picked in `EstimateCard` / `AddMaterialCard`? Proposal: no (keeps those cards unchanged).
8. **Resource rules** §3.3 (1–6): OK, or narrower / broader (e.g. also count rank-3 "추정" compatible stock)?
