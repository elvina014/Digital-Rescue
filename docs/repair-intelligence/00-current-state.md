# Repair Intelligence — Phase 0: Current State

Investigated 2026-09-27 on branch `main` @ `7d237f6`. Read-only: repository files plus
SELECT-only queries against Supabase project `wnddkgeohcgcidoklrps` (the only project — production).
No schema, data or application code was changed.

Legend: `file:line` references are to the repo root.

---

## 1. Inventory

### 1.1 Tables (live)

The brief mentions a "7-tier" inventory. The live schema has **4 reference/stock tables + 2 attributes**:

| Tier | Table | Key columns | Rows |
| --- | --- | --- | --- |
| 1 | `inventory_categories` | `name` UNIQUE | 11 (RAM, 저장장치, 배터리, 액정, 소프트웨어, 노트북 키보드, 데스크탑, 랜카드, 메인보드, 기타, 케이스) |
| 2 | `inventory_specs` | `category_id` → categories (CASCADE), `name`, UNIQUE(category_id,name) | 24 |
| 3 | `inventory_products` | `spec_id` → specs (CASCADE), `name`, UNIQUE(spec_id,name) | 70 |
| 4 | `inventory_items` | `category_id`/`spec_id`/`product_id` (RESTRICT), `capacity` varchar (free text: "8GB", "LG 그램 14인치 LCD"…), `condition item_condition` (NEW \| USED), `quantity ≥ 0`, `base_estimate ≥ 0`, `created_at`, `updated_at` | 31 |
| log | `inventory_transactions` | `item_id` (CASCADE), `user_id`, `transaction_type` (INBOUND \| OUTBOUND \| ADJUSTMENT), `quantity_changed`, `ticket_id` (SET NULL), `notes` | 74 |
| usage | `ticket_materials` | see §3 | 44 |

Possible reading of "7 tiers": category → spec → product → capacity → condition (NEW/USED/적출=USED) → item → transaction. **[Open question Q0]**

- **New / used / extracted:** only `item_condition` NEW \| USED. Extracted parts are inserted as
  `USED` with `base_estimate = 0` (`src/app/(admin)/tickets/actions.ts:1854`). There is no
  "extracted" flag on the item; provenance lives only in `inventory_transactions.notes`
  ("적출품 반환 입고") and `ticket_materials.return_*`.
- **Location / label / barcode fields:** none.
- **Outsourced services as stock:** several items are services, not parts — spec "외주"
  (e.g. 액정/외주/피맥월드쏘 "맥북에어 M2 액정교체" qty 99; 메인보드/외주/엠에스텍 "메인보드수리 66,000").
  Quantity 98–99 is a placeholder.
- **Legacy:** `inventory` table (migration 001, 0 rows) is unused by the app.
- One aggregate row = N identical items; there is no per-unit identity (serial, location).

### 1.2 RLS

| Table | SELECT | INSERT / UPDATE / DELETE |
| --- | --- | --- |
| categories/specs/products | all authenticated | ADMIN |
| `inventory_items` | all authenticated | ADMIN, MANAGER |
| `inventory_transactions` | ADMIN, MANAGER | INSERT ADMIN, MANAGER; no UPDATE/DELETE policy |
| `ticket_materials` | all authenticated | INSERT ADMIN/MANAGER/TECHNICIAN (not EXPERT_REPAIR); UPDATE/DELETE ADMIN/MANAGER |

In practice most writes go through the **service_role** client (`createAdminClient()`), so RLS is
bypassed and authorisation lives in server actions.

---

## 2. Tickets

### 2.1 Table `repair_tickets` (503 rows; 109 `is_test`, 394 real)

Device identity:
- `device_type` enum (노트북 \| 데스크탑 \| 서버 \| 나스 \| 기타저장장치 \| 태블릿)
- `device_brand` varchar NOT NULL (free text: "LG", "lg", "삼성", "samsung", "애플"…)
- `device_model` varchar NULL (free text)
- `tag_info` text (label string, e.g. "15U780-GA56K"; filled on 59 real tickets)
- `release_year` text, `evaluated_value` numeric (AI/manual value estimate)
- **No serial number field.**

Repair content today: only `symptoms` text NOT NULL (intake description) and `images` jsonb
(max 12, deleted on cancel). Everything else is in `ticket_logs.message` free text.
**No diagnosis / measurements / faults / actions / result fields.**

Money: `initial_estimate`, `expected_estimate`, `minimum_estimate`, `confirmed_estimate`,
`final_price`, `material_cost` (derived, see §3.1), `material_cost_details` jsonb (manual cost lines),
`payment_status`, `payment_method`, `paid_at`, `cash_receipt_issued`, `refunded_amount` (trigger-maintained).

Lifecycle: `status`, `is_approved`, `received_at`, `completed_at`, `canceled_at`,
`cancel_device_disposal` (RETURN \| DISPOSE), `dispose_confirmed_at`, `receipt_no` (unique, trigger),
`is_test`, `has_admin_message`.

### 2.2 Status values and transitions

`ticket_status`: NEW → ASSIGNED → RECEIVED → IN_PROGRESS → WAITING_APPROVAL → COMPLETED; CANCELED.
Real-ticket counts: NEW 36, ASSIGNED 109, RECEIVED 5, IN_PROGRESS 9, COMPLETED 116, CANCELED 119.

| Transition | Server action (`src/app/(admin)/tickets/actions.ts`) | Who |
| --- | --- | --- |
| create → NEW | `createTicketAction` :23, public form `submitTicketAction` (`src/app/actions/ticketActions.ts:54`) | ADMIN/MANAGER/RECEPTION; public |
| NEW → ASSIGNED | `assignTechnicianAction` :130 | ADMIN/MANAGER/RECEPTION |
| → RECEIVED | `markReceivedAction` :328 (sets `received_at`) | |
| → IN_PROGRESS | `startRepairAction` :381 (can insert initial `ticket_materials`, caches `device_models`) | TECHNICIAN/EXPERT |
| → WAITING_APPROVAL | `submitEstimateAction` :711 | TECHNICIAN/EXPERT |
| WAITING_APPROVAL → COMPLETED | `approveTicketAction` :871 — sets `is_approved`, `completed_at`, `payment_status=PAID`, `paid_at` | ADMIN/MANAGER |
| → CANCELED | `cancelTicketAction` :1011 — flips `approved` materials to `cancel_requested`, deletes images | |
| CANCELED → chosen state | `restoreCanceledTicketAction` :2444 | ADMIN/MANAGER (trigger-enforced) |

There is **no separate "close" step**: final approval = completion = payment. "수리불가 / 고객포기"
end as CANCELED (with RETURN or DISPOSE).

### 2.3 Triggers on `repair_tickets` (all BEFORE)

| Trigger | Function | Effect |
| --- | --- | --- |
| `trg_repair_tickets_receipt_no` (INSERT) | `generate_receipt_no()` | receipt no. |
| `trg_repair_tickets_updated_at` | `update_updated_at()` | |
| `trg_enforce_minimum_price` | `enforce_minimum_price()` | `final_price ≥ initial_estimate` |
| `trg_protect_approved_ticket` | `protect_approved_ticket()` SECURITY DEFINER | once `is_approved`, only ADMIN (and MANAGER except price) may update. Bypasses: `app.refund_sync='on'` GUC; `has_admin_message`-only change. **Blocks service_role (auth.uid() NULL).** |
| `trg_protect_canceled_ticket` | `protect_canceled_ticket()` | only ADMIN/MANAGER can leave CANCELED |

### 2.4 RLS on `repair_tickets`

SELECT: ADMIN/MANAGER/RECEPTION all; TECHNICIAN/EXPERT_REPAIR `assignee_id = auth.uid()`; CS only `status='COMPLETED'`.
UPDATE: ADMIN/MANAGER all; RECEPTION only NEW; TECHNICIAN/EXPERT assigned. INSERT: ADMIN/MANAGER/RECEPTION. DELETE: ADMIN.
`ticket_logs`: SELECT all authenticated (not scoped to ticket!), INSERT own `employee_id`.

---

## 3. Parts flow

### 3.1 Quotation / cost

- `EstimateCard.tsx` (ticket detail) — technician picks inventory items + manual cost lines.
  `request_type` is chosen automatically: item quantity ≤ 0 → `purchase`, else `dispatch`
  (`EstimateCard.tsx:239`, `AddMaterialCard.tsx:105`).
- `addMaterialCostAction` :508 / `updateMaterialCostAction` :568 edit `material_cost_details`.
- `material_cost` is always recomputed by RPC `recalc_ticket_material_cost(ticket_id)`
  (SECURITY DEFINER, search_path set): Σ(`override_unit_price` ?? `base_estimate`) × qty for
  `approved`/`cancel_requested` materials + Σ manual lines. Uses `app.refund_sync` to pass the approval guard.

### 3.2 `ticket_materials` lifecycle

`request_status` (enum): `pending → requested → approved`; `rejected`; `approved → cancel_requested → cancelled`.
`request_type`: `dispatch` | `purchase`. Live distribution: dispatch/approved 31, dispatch/cancelled 10,
dispatch/pending 1, dispatch/rejected 1, purchase/cancelled 1.

| Step | Code | Transactional? |
| --- | --- | --- |
| add | `addTicketMaterialsAction` :649 (only in IN_PROGRESS), `startRepairAction` :381 | — |
| request | `requestMaterialDispatchAction` :1307 (service_role, optimistic `eq(pending)`) | single UPDATE |
| approve | `approveMaterialDispatchAction` :1364 → RPC `approve_material_dispatch(material_id, user_id)` | **yes** (RPC: lock, check stock, deduct, approve, OUTBOUND tx). Then app-side fallback OUTBOUND insert + recalc + log |
| reject | `rejectMaterialDispatchAction` :1479 | single UPDATE |
| cancel request | `cancelMaterialDispatchAction` :1534 → `cancel_requested` (no stock change) | single UPDATE |
| ticket cancel | `cancelTicketAction` :1011 → all `approved` → `cancel_requested` | |
| admin-approved rollback | `confirmMaterialReturnAction` :1621 → `cancelled` + stock += qty + INBOUND "접수 취소로 인한 자재 원복" + recalc | **no** — 3–4 separate statements with a manual compensating update |
| restore canceled ticket | `restoreCanceledTicketAction` :2444 → `cancel_requested` back to `approved` | |

Note: RPC `cancel_material_dispatch` (defined in migration 010) **does not exist** in the live DB;
rollback is done only by `confirmMaterialReturnAction`.

### 3.3 Purchase request

There is no DB trigger. A purchase request = `ticket_materials` row with `request_type='purchase'`,
created automatically when the chosen item has quantity ≤ 0, shown in `MaterialDispatchWidget`
under a separate "구매" list and approved via the same `approve_material_dispatch` RPC.

### 3.4 Other inventory writes

- Manual registration: `/inventory/new` → `NewInventoryForm.tsx` → `addInventoryItem` (`src/app/actions/inventoryActions.ts:350`, INBOUND "신규 재고 등록").
- Admin edits: `updateInventoryItem` :425, `adminInlineUpdateInventoryItem` :663 (ADJUSTMENT / INBOUND logs).
- Reference data CRUD: `inventoryActions.ts` :36–:574, UI `inventory/settings/InventorySettingsClient.tsx`.
- n8n inbound: `POST /api/inventory/webhook` (`src/app/api/inventory/webhook/route.ts`) — shared API key, service_role, upserts categories/specs/products/items + INBOUND.

### 3.5 Extracted-part registration (existing flow — referenced by P5)

1. Technician: `registerReturnMaterialAction` :1722 — sets `is_return_registered`, `return_category_id`,
   `return_spec`, `return_name`, `return_condition` (중고품 \| 불량품), `return_quantity`,
   `return_capacity`, `return_status='pending'` **on an existing `ticket_materials` row** (status
   approved / cancel_requested / cancelled). UI: `MaterialReturnWidget`/ticket detail.
2. ADMIN/MANAGER: `approveReturnMaterialAction` :1813 (UI `ReturnMaterialInboundWidget`) —
   find-or-create spec/product, find-or-increment `inventory_items` (condition USED, base_estimate 0,
   capacity NULL — **the captured `return_capacity` is not written to the item**), INBOUND tx
   "적출품 반환 입고", log. **Not transactional**: ~6 statements with manual compensation.
   Condition 불량품 is still inserted as USED stock.

Consequence: an extracted part can only be registered if it is attached to a material row of the
same ticket. A part removed without a replacement being dispatched has no entry point.

---

## 4. Auth, roles, RLS, settings

- Roles: enum `employee_role` = ADMIN, MANAGER, RECEPTION, TECHNICIAN, EXPERT_REPAIR, CS (9 employees).
- Role source: `employees.role` (1:1 with `auth.users`). DB: `get_my_role()` (SECURITY DEFINER, STABLE).
  App: `getCurrentEmployee()` (`src/lib/auth.ts`), CMS guard `requireCmsAccess()` (ADMIN/MANAGER).
- Policy pattern: `CASE get_my_role() WHEN … END` for row scoping, `get_my_role() IN (…)` for writes.
  Newer RPCs (refund, recalc) are SECURITY DEFINER with `SET search_path = public`, EXECUTE revoked
  from PUBLIC/anon, role checks inside, called with the **session** client (`createClient()`).
  Older ones (`approve_material_dispatch`) have no role check / search_path and are callable only by service_role.
- Domains (`src/proxy.ts`): `login.` → admin portal `(admin)` (tickets, inventory, dashboard, stats, employees);
  `edit.` → CMS `(cms)/editor` only (page contents, news); apex → public site `(main)`.
  **All ticket/inventory screens live on login.**; edit. has no operational screens.
- Settings/flags: `global_settings` single row (`id boolean PK CHECK id`), numeric pricing columns only,
  SELECT all / UPDATE ADMIN. **No feature-flag mechanism.**

---

## 5. UI map (all under `login.` domain)

| Screen | Files |
| --- | --- |
| Ticket list | `src/app/(admin)/tickets/page.tsx`, `TicketFilters.tsx` |
| Ticket create | `src/app/(admin)/tickets/new/page.tsx`, `NewTicketForm.tsx`; public `src/components/common/ContactForm.tsx` |
| Ticket detail | `src/app/(admin)/tickets/[id]/page.tsx`, `TicketDetailForm.tsx` (1809 lines), `EstimateCard.tsx`, `AddMaterialCard.tsx`, `RefundCard.tsx`, `RestoreCancelCard.tsx`, `src/components/common/SymptomModal.tsx` |
| Ticket "close" (approve) | button in `TicketDetailForm.tsx` → `approveTicketAction` |
| Dispatch/purchase approval | `src/components/common/MaterialDispatchWidget.tsx` on `dashboard/page.tsx` and `inventory/page.tsx` |
| Admin-approved rollback | `src/components/common/MaterialReturnWidget.tsx` (same pages) |
| Extracted-part inbound | `src/components/common/ReturnMaterialInboundWidget.tsx` (same pages) |
| Disposal confirm | `src/components/common/DisposalConfirmWidget.tsx` (dashboard) |
| Inventory list / registration / settings | `src/app/(admin)/inventory/InventoryClient.tsx`, `new/NewInventoryForm.tsx`, `settings/InventorySettingsClient.tsx` |
| Server actions | `src/app/(admin)/tickets/actions.ts` (2557 lines), `src/app/actions/*.ts` |

---

## 6. Data quality — device model strings

Real tickets: 394; distinct `lower(trim(device_model))`: **367**; empty model: 14; with `tag_info`: 59.
Almost every string is unique → a trigram/alias mapping tool is essential, and auto-mapping would be unsafe.

Top 30 (brand / model / type / count), real tickets only:

| Brand | Model | Type | n |
| --- | --- | --- | --- |
| lenovo | L15 Gen2 | 노트북 | 4 |
| ms서피스 | 1866 | 노트북 | 2 |
| asus | GA403 | 노트북 | 2 |
| 삼성 | NT950QCG | 노트북 | 2 |
| samsung | NT950QED | 노트북 | 2 |
| 애플 | 아이패드 프로 11 1세대 | 태블릿 | 2 |
| 애플 | 아이패드12.9 m4 | 태블릿 | 2 |
| HP / samsung / LG / 레노버 | *(NULL)* | 노트북 | 2 each |
| 기타 | *(long pasted label text incl. a person's name — redacted; model PCG-74FP)* | 노트북 | 1 |
| 레노버 | [Lenovo]ThinkPad X390 Yoga | 노트북 | 1 |
| 애플 | 13pro retina | 노트북 | 1 |
| lg | 13ZD940-GX50K | 노트북 | 1 |
| LG | 14ZB970-GP5DL | 노트북 | 1 |
| LG | 14ZB970-GPCNL | 노트북 | 1 |
| LG | 14zd90r gx50k | 노트북 | 1 |
| LG | 14zd980-gx30k | 노트북 | 1 |
| LG | 15U480 | 노트북 | 1 |
| lg | 15UB470 | 노트북 | 1 |
| LG | 15Z90T-GP5HL | 노트북 | 1 |
| LG | 15Z95N-GRF6K | 노트북 | 1 |
| lg | 15Z95P-GR5WL | 노트북 | 1 |
| lg | 15zb995-gp5alf | 노트북 | 1 |
| LG | 15ZD90P-GX56K | 노트북 | 1 |
| LG | 15ZG95N-GR50KN | 노트북 | 1 |
| LG | 16T90TP | 노트북 | 1 |
| LG | 16Z909 XSV01KB | 노트북 | 1 |
| LG | 16Z90S-H.ADB9U1 | 노트북 | 1 |

Observations: brand spelled several ways (LG/lg, 삼성/samsung, 레노버/lenovo); LG strings are full SKUs
(model + config suffix `-GX56K`) — a variant/SKU level is needed or suffixes must be alias-stripped;
brand repeated inside model ("[Lenovo]ThinkPad…"); free-text Korean names for Apple devices;
PII occasionally pasted into the model field.

---

## 7. Tooling

- Migrations: `supabase/migrations/NNN_name.sql` (001–042; **two files numbered 019**).
  Remote history (`supabase_migrations`) only has 024–042 — 001–023 and 026 were applied manually
  (SQL editor). `019_cancel_method.sql` was **never applied** (its columns are absent).
  Current workflow (per team memory): save file + apply via Supabase MCP `apply_migration`.
- Supabase CLI: not installed; no `supabase/config.toml`.
- Types: **hand-written** `src/types/database.ts`, `src/types/enums.ts` — not generated.
- Scripts: `dev`, `build`, `start`, `lint` (eslint 9, `eslint-config-next`). No `typecheck`
  (use `npx tsc --noEmit`, TS 5.9.3), **no test framework**.
- Stack: Next.js 16.2.3 (App Router, `src/proxy.ts` instead of middleware), React 19.2, Supabase JS 2.103, zod 4, Tailwind 4.
- **Dev database: none.** One Supabase project (production), zero branches.
- Extensions: `pg_trgm` and `vector` are available but **not installed**; `pgtap` available (useful for RLS tests).

---

## 8. Risks for Phases 1–3

1. **No dev DB** — every migration would hit production. R3 cannot be satisfied until a target exists
   (Supabase branch, second project, or local stack).
2. **`device_models` name collision** — existing table (0 rows) used by 3 code paths as an AI price cache;
   its `upsert(onConflict: brand,model_name)` has no matching unique constraint, so the cache write
   silently fails today (explains 0 rows). Adding a unique constraint in Phase 1 would suddenly
   "activate" that write path.
3. **Backfill vs `protect_approved_ticket`** — updating `device_model_id` on approved tickets is
   blocked for everyone except ADMIN (and blocks service_role). Needs a documented bypass → modifies
   an existing trigger function (must be in the plan).
4. **`approve_material_dispatch` defect** — the live version (from 014) ignores `request_type`:
   purchase requests also deduct stock and fail with "재고 부족" when qty is 0, which is exactly
   when purchase is auto-selected. Also no role check / search_path (mitigated: EXECUTE only for service_role).
   Relevant to Phase 6; not touched now.
5. **Non-transactional flows** — admin-approved rollback and extracted-part inbound are multi-statement
   server actions with manual compensation. P7 requires RPCs for *new* inventory operations; reusing
   these flows (P5, Phase 2 "재고등록", Phase 4) inherits their non-atomicity unless wrapped.
6. **Extracted-part flow requires a `ticket_materials` row** and drops `return_capacity`.
7. **Cascades:** `ticket_materials`, `ticket_logs` CASCADE on ticket delete; `inventory_transactions`
   CASCADE on item delete; specs/products CASCADE from category. New tables referencing tickets/items
   should use RESTRICT (like `ticket_refunds`) to avoid silent knowledge loss.
8. **No views, materialized views or generated columns** depend on tickets/inventory today — low risk.
   No realtime publication, no pg_cron.
9. **Images deleted on cancel** — donor photos (Phase 4) must not live in the ticket image array.
10. **`ticket_logs` SELECT is not scoped** (all authenticated) — do not copy that pattern for repair records.
11. **Outsourced services modelled as stock** (qty 99) will pollute "stock available" searches (Phase 5/6).
12. Large files (`actions.ts` 2557 lines, `TicketDetailForm.tsx` 1809 lines) vs the project's own
    200-line component rule — new UI should be separate components.

---

## 9. Open questions for Brad

- **Q0.** What are the "7 tiers"? Live inventory is categories → specs → products → items (+capacity, condition).
- **Q1.** `device_models` exists as a value-estimate cache. Extend it (additive columns) or create a new master table under a different name?
- **Q2.** Where should the Phase 2 close gate hook: technician `submitEstimateAction` (→ WAITING_APPROVAL), manager `approveTicketAction` (→ COMPLETED), and/or `cancelTicketAction`?
- **Q3.** Existing extracted-part registration needs a `ticket_materials` row and is not transactional. May Phase 2 wrap it in a new RPC (and switch the existing actions to it), or must the existing code path stay byte-identical?
- **Q4.** Feature flags: OK to add boolean columns to `global_settings` (e.g. `ri_close_gate_enabled`)?
- **Q5.** Should outsourced service items (spec "외주") be excluded from part/compatibility features, or tagged?
- **Q6.** Donor conversion: exact "소유권 이전 확인" wording, and is it an alternative to DISPOSE confirmation?
- **Q7.** May a TECHNICIAN see past repairs of tickets not assigned to them (full, or anonymised summary)?
- **Q8.** Labels: per `inventory_items` row (bin/lot) or per physical unit (would require unit-level records)?
- **Q9.** Development target for migrations: create a Supabase branch, a separate project, or local Supabase (Docker)? Until then nothing can be applied.
- **Q10.** Types: introduce `supabase gen types` (would add a generated file alongside the hand-written types), or keep hand-writing types?
- **Q11.** Should the `approve_material_dispatch` purchase defect (§8.4) be fixed in its own small change before Phase 6?
- **Q12.** The brief says "management backend: edit.digital-rescue.com". In code, edit. is CMS-only and all operational screens are on login. Should RI admin tools live on login. (as assumed in this doc)?
