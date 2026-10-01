# Repair Intelligence — Roadmap

Each phase: **goal, scope, dependencies, acceptance criteria**. Scope lists are a starting point;
the approved `phases/phase-N-plan.md` is authoritative. "Schema notes" record adaptations to the
real schema found in Phase 0 (`00-current-state.md`).

Existing names referenced below:
tickets = `repair_tickets`; used parts = `ticket_materials`; stock = `inventory_items`
(+ `inventory_categories/specs/products`); movements = `inventory_transactions`;
settings = `global_settings` (single row); logs = `ticket_logs`; roles = `employee_role` via `get_my_role()`.

Order: 0 → **0.1 → 0.5** → 1 → 2 → … → 10.

---

## Decisions (2026-09-27)

Brad's answers to the Phase 0 questions. Binding for all later plans.

- **Q0 Inventory tiers.** "7-tier" was a wording error. The inventory is 4 tiers:
  category → spec → product → item (+ `capacity`, `condition`).
- **Q1 Device master.** Do not touch the existing `device_models` (AI value cache, R2). The new device
  master gets a different name, proposed in the Phase 1 plan. The cache's missing unique constraint
  is recorded only (`known-issues.md` KI-1).
- **Q2 Gates.** Approval gate at manager approval (`approveTicketAction`, completion = payment):
  repair record + removed-part dispositions required. Light cancel gate (`cancelTicketAction`):
  result (수리불가 / 고객포기 / 단순취소) + removed-part dispositions required.
  Both flag-controlled, default OFF.
- **Q3 Existing inventory flows.** Approved to wrap (a) extracted-part registration (~6 steps) and
  (b) admin-approved return / stock rollback, each into a single-transaction RPC. Conditions:
  1. prove by test that results equal the existing flow before switching the UI;
  2. design must support extraction without a `ticket_materials` row (e.g. donor extraction);
  3. fix the extraction capacity not being stored.
- **Q4 Flags.** Boolean columns on `global_settings`, default `false`.
- **Q5 Outsourced items** (spec "외주"): excluded from compatibility, search and purchase guard.
  Removing them from the inventory list is separate work; their references are documented in
  `known-issues.md` KI-2. No deletes or changes.
- **Q6 Donor conversion.** Checkbox wording:
  "고객이 기기 소유권 포기(폐기 위임)에 동의했음을 확인했습니다."
  Do not replace the disposal confirmation flow; add a "Donor로 전환" option to it.
- **Q7 Case visibility.** All staff may see repair cases. Customer PII (name, phone, address, etc.)
  is excluded from case-lookup screens and from VECTOR RPCs.
- **Q8 Labels (Phase 7).** Mixed: new standard parts → label per item row; extracted/used parts →
  registered as individual qty-1 items with individual labels; donor devices → one label per device.
- **Q9 Dev target.** Local Supabase on Docker. Phase 0.1 (migration baseline) comes first.
  Production is applied by Brad only.
- **Q10 Types.** Generate with `supabase gen types` into a new file; use it for new features only.
  Keep hand-written types for now; record differences in KI-5. Add a `typecheck` script; if existing
  errors are many, report the list only.
- **Q11 Purchase approval bug.** Fix separately and first, as Phase 0.5. Purchase requests must be
  approved without stock deduction. Normal dispatch approval must not change at all.
- **Q12 Admin domain.** RI admin tools live on `login.` (the ERP domain), visible to ADMIN only.

---

## Phase 0 — Investigation (read-only) ✅

- Output: `00-current-state.md`. Questions resolved (see Decisions).

---

## Phase 0.1 — Migration baseline (마이그레이션 기준점 정리) ✅ (report: `phases/phase-0.1-report.md`)

**Goal:** one baseline migration identical to the current production schema, applied cleanly to a
local Docker Supabase. No writes to production.

**Scope** (detail: `phases/phase-0.1-plan.md`)
- Supabase CLI as a devDependency; `supabase/config.toml` (Postgres 17).
- Brad runs a schema-only dump of production → baseline migration
  `supabase/migrations/<timestamp>_baseline.sql` (+ storage buckets/policies transcribed and verified).
- Move `supabase/migrations/001–042` to `supabase/migrations_archive/` (no deletes).
- `supabase/seed.sql` with fake data only (no production customer data).
- `supabase start` / `supabase db reset` succeed; schema parity with production verified by catalog comparison.
- Generated types `src/types/supabase.ts`; `typecheck` script; hand-written vs generated diff → KI-5.
- 019 duplicate / unapplied `019_cancel_method.sql` → KI-3 (Brad to confirm).
- `supabase migration repair` commands for production history are **given to Brad, not executed**.

**Acceptance:** `db reset` passes twice; parity diff empty or every difference explained;
no production data locally; app build unaffected.

---

## Phase 0.5 — Purchase approval bug fix (구매 요청 승인 버그 수정) ✅ local (report: `phases/phase-0.5-report.md`; production deploy pending)

**Goal:** purchase requests (`ticket_materials.request_type = 'purchase'`) can be approved without
touching stock. Dispatch approval behaviour stays byte-for-byte the same.

**Scope**
- New migration: `CREATE OR REPLACE FUNCTION approve_material_dispatch(uuid, uuid)` adding a
  `request_type = 'purchase'` branch that skips stock check, stock deduction and the OUTBOUND
  transaction, and only sets `request_status = 'approved'`. The dispatch path keeps every statement
  unchanged. Grants stay as today (EXECUTE for service_role only).
- `approveMaterialDispatchAction` (`src/app/(admin)/tickets/actions.ts:1364`): skip the app-side
  "fallback OUTBOUND insert" for purchase requests — otherwise approving a purchase would log a
  fake OUTBOUND transaction.
- Rollback SQL = the current function body (captured in Phase 0 from production).

**Tests (local DB):** dispatch approval → stock, `inventory_transactions`, status identical to the
old function (same fixture, before/after comparison); purchase approval on a qty-0 item → approved,
no stock change, no transaction; insufficient-stock dispatch still errors with the same message.

**Dependencies:** Phase 0.1 (local DB). **Acceptance:** tests above pass; Brad applies to production.

---

## Phase 1 — Device master data (기기 마스터) ✅ local (report: `phases/phase-1-report.md`; production deploy pending)

**Goal:** a canonical device/board vocabulary that tickets can reference, without touching the
existing free-text model field.

**Scope**
- New master tables (names proposed in the plan; must **not** reuse `device_models`):
  models, variants (optional per model, e.g. OLED/LCD, touch/non-touch), model aliases
  (unique, trigram-indexed), boards, board aliases, model/variant ↔ board (many-to-many).
- `repair_tickets`: add nullable model/variant/board FK columns. `device_brand`, `device_model`,
  `tag_info` stay untouched.
- Admin mapping tool (`login.`, ADMIN only): distinct unmapped model strings with counts,
  `pg_trgm` suggestions, human confirms → one RPC creates the alias and backfills matching tickets
  in one transaction. Nothing auto-mapped.
- Reusable Korean "모델 선택" picker (search by alias, inline "새 모델 등록").

**Schema notes**
- Existing `device_models` (AI value cache) is left untouched (Q1, KI-1).
- `pg_trgm` is not installed → plan includes `CREATE EXTENSION pg_trgm` in `extensions`.
- Backfilling approved tickets hits `trg_protect_approved_ticket`; the backfill needs an explicit
  bypass (like the `app.refund_sync` GUC) → modifies an existing trigger function → must be listed
  in the plan (R2). Done as Amendment A (`app.catalog_link_sync`, catalog columns only); see KI-9.
- 367 distinct model strings across 394 real tickets (see `00-current-state.md` §6).

**Dependencies:** Phase 0.1. **Acceptance:** picker works on ticket create/edit; mapping tool maps a
sample set; old tickets unaffected.

---

## Phase 2 — Repair record module (ticket overhaul) ✅ local (report: `phases/phase-2-report.md`; production deploy pending)

**Goal:** capture what was found and done on every repair, in structured form.

**Scope**
- `symptom_codes` (hierarchical, seeded: 전원, 충전, 디스플레이, 부팅, 발열, 입력장치, 외관, 데이터,
  기타 — admin-editable), `ticket_symptoms` (many + free text).
- `repair_records` (1 per ticket): `diagnosis_summary`, `fault_category`,
  `result` (완료 | 부분수리 | 수리불가 | 고객취소), `notes`.
- `repair_measurements`, `repair_faults`, `repair_actions` (ordered, `succeeded`, failed attempts kept).
- Parts used: a view over `ticket_materials` (`approved` / `cancel_requested`) — no re-entry.
- `ticket_removed_parts`: description, category, disposition (폐기 | 고객반환 | 재고등록 | Donor유지),
  linked `inventory_items.id`, `handled_by/at`. "재고등록" goes through the new extraction RPC (below).
- **Gates (Q2)**, flags on `global_settings` (default false):
  - approval gate in `approveTicketAction`: repair record filled + every removed part dispositioned;
  - cancel gate in `cancelTicketAction`: result (수리불가 / 고객포기 / 단순취소) + removed parts dispositioned;
  - admin override with reason → `ticket_close_overrides`.
- **Transactional RPCs (Q3):**
  - extraction registration RPC replacing `registerReturnMaterialAction` + `approveReturnMaterialAction`
    logic; works with or without a `ticket_materials` row; stores capacity;
  - return/rollback RPC replacing `confirmMaterialReturnAction` logic;
  - equivalence tests against the existing flow **before** the UI is switched.
- UI: "수리 기록" section on the ticket detail page, editable by role.

**Schema notes**
- New tables are separate from `repair_tickets`, so `protect_approved_ticket` does not cover them;
  the plan defines its own lock-after-approval rule.
- Repair records are visible to all staff (Q7) but must not expose customer PII.

**Dependencies:** Phase 0.1 (Phase 1 optional for board links).

**Acceptance:** a full ticket can be recorded end-to-end; gates ON block incomplete approval/cancel;
override logged; with flags OFF existing flows unchanged; RPC equivalence tests pass.

---

## Phase 3 — Part knowledge & compatibility

**Scope**
- `part_specs`, `part_number_aliases` (incl. chip markings), `interchange_groups`.
- `part_compatibility` (status, confidence, limitation_note, unique per part+target),
  `compatibility_evidence`, `compatibility_summary` view.
- `record_compatibility_result()` RPC (evidence + deterministic recompute, one transaction; admin
  override logged).
- Nullable `part_spec_id` on `inventory_items` and `ticket_removed_parts`.
- Approval step: per used part ask 정상동작 / 조건부 / 비호환 / 판단불가 (판단불가 → no evidence).
- Interchange-group candidates only as `unknown`/`compatible` + `inferred`.

**Schema notes**
- `inventory_specs` means "sub-category", not a part spec; UI label for `part_specs`: "부품 규격".
- Outsourced items (spec "외주") are excluded (Q5).
- P4: "verified" only from the explicit human answer.

**Dependencies:** Phases 1, 2. **Acceptance:** evidence accumulates; counts visible; no automatic "verified".

---

## Phase 4 — Donor devices

**Scope**
- `donor_devices`, `donor_part_candidates` (as in the original brief).
- Disposal confirmation (`DisposalConfirmWidget` / `confirmDisposalAction`) gets an additional
  "Donor로 전환" option with the mandatory checkbox
  "고객이 기기 소유권 포기(폐기 위임)에 동의했음을 확인했습니다." (Q6). Plain disposal stays as is.
- Extract action: extraction RPC from Phase 2 (no `ticket_materials` row) + mark candidate extracted,
  one transaction; extracted parts become qty-1 items (Q8).
- Donor photos stored outside the ticket image array (ticket images are deleted on cancel).

**Dependencies:** Phases 1, 2, 3. **Acceptance:** donor parts appear as potential stock; extraction
creates a normal `inventory_items` row + INBOUND transaction.

---

## Phase 5 — Search & intake pre-check

**Scope**
- RPCs `search_parts_for_device`, `search_devices_for_part`, `get_device_knowledge`; `model_notes`.
- Intake/ticket panel and part lookup page (as in the brief).

**Schema notes**
- Cases visible to all staff (Q7) via SECURITY DEFINER RPCs that return **no customer PII**
  (no names, phones, addresses; ticket reference by `receipt_no` only).
- Outsourced items excluded (Q5).

**Dependencies:** Phases 1–4. **Acceptance:** both search directions work with partial/alias input.

---

## Phase 6 — Purchase guard

**Scope**
- Hook the purchase request path (`ticket_materials.request_type='purchase'`, auto-selected when
  item qty ≤ 0 in `AddMaterialCard.tsx` / `EstimateCard.tsx`, then `requestMaterialDispatchAction`).
- Show internal resources; if any exist require a reason code (내부재고 불량 | 고객 신품요청 |
  Donor 상태 미확인 | 납기 | 기타+text) → `purchase_guard_logs`; report page.
- Outsourced items excluded (Q5).

**Dependencies:** Phase 0.5, Phases 3–5. **Acceptance:** purchase flow still works; bypass without
reason impossible when resources exist.

---

## Phase 7 — Physical tracking

**Scope**
- `label_code` (unique, short) + storage location structure (e.g. `A-01-04`, `DONOR-C07`).
- Mixed labelling (Q8): new standard parts per item row; extracted/used parts as qty-1 items with
  individual labels; donors one label per device.
- Printable QR label page; scan route (login required) showing item/donor history.

**Dependencies:** Phase 4. **Acceptance:** scanning a label opens the correct record.

---

## Phase 8 — VECTOR integration

**Scope**
- Read-only RPCs in a dedicated schema/role via the self-hosted n8n webhook; **no customer PII** (Q7).
- `ai_candidates` + admin review UI (`login.`, ADMIN only). Approval converts to documented/inferred only.

**Schema notes**
- Must not reuse the `/api/inventory/webhook` pattern (shared key + service_role).

**Acceptance:** agent role cannot write anywhere except `ai_candidates` (verified by test).

---

## Phase 9 — AI-assisted registration

- Extend the n8n + OpenRouter vision flow: label/board/chip-marking photo → `ai_candidates`.
- Acceptance: photo produces a candidate; nothing is registered without approval.

---

## Phase 10 — Repair knowledge engine

- Similar-case search by board + symptom codes + measurements + faults (relational first;
  `pgvector` later only if needed). No customer PII in results.
- Acceptance: returns relevant past cases for a new ticket.
