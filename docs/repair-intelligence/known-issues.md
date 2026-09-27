# Repair Intelligence — Known Issues

Issues found during Repair Intelligence work that are **outside the current phase's scope**.
Recorded only; nothing here is changed without an explicit decision from Brad.

| ID | Title | Status |
| --- | --- | --- |
| KI-1 | `device_models` cache: missing unique constraint | Recorded only |
| KI-2 | Outsourced (외주) items modelled as inventory | Recorded only — separate cleanup planned by Brad |
| KI-3 | Migration 019 duplicate / `019_cancel_method.sql` never applied | **Awaiting Brad's confirmation** |
| KI-4 | `approve_material_dispatch` breaks purchase requests | Scheduled: Phase 0.5 |
| KI-5 | Hand-written types vs generated types | To be filled in Phase 0.1 |
| KI-6 | Production migration history out of sync with files | Resolved by Brad running the repair commands from Phase 0.1 |

---

## KI-1. `device_models` cache: missing unique constraint

- Two code paths write the AI value cache with
  `upsert(..., { onConflict: "brand,model_name" })`:
  - `startRepairAction` — `src/app/(admin)/tickets/actions.ts:486`
  - `analyzeDeviceLabelAction` — `src/app/(admin)/tickets/actions.ts:2011` (write at :2053)
- `device_models` has no UNIQUE constraint/index on `(brand, model_name)` (only PK, `brand`,
  partial `tag_info` indexes). Postgres rejects `ON CONFLICT` without a matching constraint;
  the error result is not checked, so the write fails silently. Production row count: **0**.
- The read path (`lookupPastEvaluatedValue`, :205) therefore never gets a cache hit from this table.
- **Caution:** adding the constraint would suddenly activate the cache writes (and brand spellings
  like "LG"/"lg" would create separate rows). Decide separately. Repair Intelligence does not touch
  `device_models` (decision Q1).

## KI-2. Outsourced (외주) items modelled as inventory

Investigated 2026-09-27 (production, SELECT only).

**Items:** 13 `inventory_items` under spec `외주` — 액정 11 (메티스 2, 피맥월드쏘 9), 메인보드 1
(엠에스텍, "메인보드수리 66,000"), 케이스 1 (아이엔텍, "서피스 1866 케이스").
Quantities are placeholders (10 / 98 / 99). The service description is stored in `capacity`.

**References**

| Where | What | Count |
| --- | --- | --- |
| `ticket_materials.inventory_item_id` | all `request_type='dispatch'`; approved 7, cancelled 3 | 10 rows on 8 items (5 items unreferenced) |
| `inventory_transactions.item_id` | INBOUND on registration, OUTBOUND on approval, INBOUND on rollback | 26 rows |
| `ticket_refunds.material_adjustments` | one adjustment references a material on "맥북에어 M2 액정교체" | 1 |
| `ticket_materials.override_unit_price` | none set on outsourced materials | 0 |

**Behaviour**
- Requested as `dispatch`, so approval **deducts the placeholder quantity** (e.g. 99 → 98) and logs
  OUTBOUND like physical stock.
- Cost: `recalc_ticket_material_cost` adds `COALESCE(override_unit_price, base_estimate) × quantity`
  → outsourced price flows into `repair_tickets.material_cost`.
- FKs: `ticket_materials → inventory_items` is **ON DELETE RESTRICT** (referenced items cannot be
  deleted); `inventory_transactions → inventory_items` is **ON DELETE CASCADE** (deleting an item
  would erase its history); `inventory_items → specs/products/categories` RESTRICT.
- Code identifies outsourced items by string comparison `spec_name === "외주"`:
  - `src/app/(admin)/tickets/[id]/TicketDetailForm.tsx:605` — excluded from extracted-part registration
  - `TicketDetailForm.tsx:826`, `:1101` — same exclusion in other lists
  - `src/app/(admin)/tickets/[id]/RefundCard.tsx:109` — price-adjustable in refunds (with category 소프트웨어)
- Renaming the spec, or moving these items, would silently change the three behaviours above.

**Repair Intelligence:** outsourced items are excluded from compatibility, search and purchase guard (Q5).
Filter by the same rule (`inventory_specs.name = '외주'`) until the separate cleanup defines a proper flag.

## KI-3. Migration 019 duplicate / `019_cancel_method.sql` never applied

| File | Adds | In production? |
| --- | --- | --- |
| `019_cancel_device_disposal.sql` | `cancel_device_disposal text CHECK (RETURN, DISPOSE)`, `dispose_confirmed_at timestamptz`, index, comments | **Yes** |
| `019_cancel_method.sql` | `cancel_method text CHECK (return, dispose)`, `disposal_confirmed boolean NOT NULL DEFAULT false` | **No** (columns absent) |

- Same purpose (how a canceled device is handled + whether disposal was confirmed), two designs.
  The applied one stores *when* disposal was confirmed; the other only a boolean.
- No code in `src/` references `cancel_method` or `disposal_confirmed`; all code uses
  `cancel_device_disposal` / `dispose_confirmed_at` (`cancelTicketAction`, `confirmDisposalAction`,
  `getDisposalPendingTickets`, `restoreCanceledTicketAction`).
- **Assessment:** `019_cancel_method.sql` is an abandoned draft; no new migration appears necessary.
  Both files move to `supabase/migrations_archive/` in Phase 0.1 unchanged.
- **Question for Brad:** confirm that `019_cancel_method.sql` should *not* be applied.

## KI-4. `approve_material_dispatch` breaks purchase requests

- Live function = migration 014 version. It ignores `request_type`: purchase requests also check
  and deduct stock and insert OUTBOUND. Purchase is auto-selected when the item quantity is ≤ 0,
  so approval fails with "재고 부족".
- The app-side fallback in `approveMaterialDispatchAction` (`actions.ts:1364`) would also insert an
  OUTBOUND row for purchases once the RPC stops doing it.
- Also: no role check and no `search_path` in the function (mitigated — EXECUTE is granted to
  service_role only).
- **Fix: Phase 0.5** (purchase branch only; dispatch path unchanged).

## KI-5. Hand-written types vs generated types

To be filled in Phase 0.1 after `supabase gen types` against the local baseline
(missing columns, nullability mismatches, missing enum values in `src/types/database.ts` / `enums.ts`).

## KI-6. Production migration history out of sync with files

- `supabase_migrations.schema_migrations` in production has 18 rows (024–042, timestamp versions).
  001–023 and 026 were applied manually (SQL editor); 034 is recorded as
  `allow_admin_message_dismiss_on_approved`; local files use `NNN_` numbering.
- Phase 0.1 replaces the file history with a single baseline and provides the exact
  `supabase migration repair` commands. **Brad runs them; Claude does not.**
