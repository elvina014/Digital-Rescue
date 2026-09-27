# Repair Intelligence — Roadmap

Each phase: **goal, scope, dependencies, acceptance criteria**. Scope lists are a starting point;
the approved `phases/phase-N-plan.md` is authoritative. "Schema notes" record adaptations to the
real schema found in Phase 0 (`00-current-state.md`). Items marked **[Q]** need Brad's decision
before that phase's plan can be finalised.

Existing names referenced below:
tickets = `repair_tickets`; used parts = `ticket_materials`; stock = `inventory_items`
(+ `inventory_categories/specs/products`); movements = `inventory_transactions`;
settings = `global_settings` (single row); logs = `ticket_logs`; roles = `employee_role` via `get_my_role()`.

---

## Phase 0 — Investigation (read-only) ✅

- Goal: document the current state before touching anything.
- Output: `00-current-state.md`.
- Acceptance: Brad has reviewed findings and answered open questions (§9 of that doc).

---

## Phase 1 — Device master data

**Goal:** a canonical device/board vocabulary that tickets can reference, without touching the
existing free-text model field.

**Scope**
- Tables: `device_models`, `device_variants` (optional per model, e.g. OLED/LCD, touch/non-touch),
  `model_aliases` (unique, trigram-indexed), `boards`, `board_aliases`,
  `device_model_boards` (model/variant ↔ board, many-to-many).
- `repair_tickets`: add nullable `device_model_id`, `device_variant_id`, `board_id`.
  `device_brand`, `device_model`, `tag_info` stay untouched.
- Admin mapping tool: list distinct unmapped model strings from tickets with counts, suggest matches
  via `pg_trgm` similarity, human confirms → one RPC creates the alias + backfills matching tickets
  in one transaction. Nothing is auto-mapped without confirmation.
- Reusable Korean "모델 선택" picker (search by alias, inline "새 모델 등록").

**Schema notes**
- **[Q1] `device_models` already exists** (migration 001, 0 rows) and is used by the AI label
  flow as a value-estimate cache (`analyzeDeviceLabelAction`, `startRepairAction`,
  `lookupPastEvaluatedValue`). Options: (a) extend it with additive nullable columns and keep its
  current usage, or (b) create the new master under a different name (e.g. `device_catalog_models`).
- `pg_trgm` is **not installed** → plan must include `CREATE EXTENSION pg_trgm` (in `extensions` schema).
- Backfilling `repair_tickets` hits `trg_protect_approved_ticket` for COMPLETED/approved rows
  (≈ 116 real tickets). Backfill RPC needs an explicit, documented bypass (like the existing
  `app.refund_sync` GUC) — this counts as modifying an existing trigger function → must be listed
  in the plan (R2).
- `repair_tickets.tickets_update` RLS lets TECHNICIAN update only assigned tickets; CS has no UPDATE.
- 367 distinct model strings across 394 real tickets; heavy noise (brand in model field,
  Korean/English brand variants, full label text pasted). See `00-current-state.md` §6.

**Dependencies:** none (after Phase 0 answers).

**Acceptance:** picker works on ticket create/edit; mapping tool maps a sample set; old tickets
unaffected (free-text fields unchanged, NULL FKs render as today).

---

## Phase 2 — Repair record module (ticket overhaul)

**Goal:** capture what was found and done on every repair, in structured form.

**Scope**
- `symptom_codes` (hierarchical, seeded minimal Korean set: 전원, 충전, 디스플레이, 부팅, 발열,
  입력장치, 외관, 데이터, 기타 — admin-editable), `ticket_symptoms` (many + free text).
- `repair_records` (1 per ticket): `diagnosis_summary`, `fault_category`,
  `result` (완료 | 부분수리 | 수리불가 | 고객취소), `notes`.
- `repair_measurements`: point/rail name (19V 입력, 3VALW, 5VALW …), expected, measured, unit, note.
- `repair_faults`: location reference (e.g. PU301), component description, cause.
- `repair_actions`: ordered list, action type, description, `succeeded` (bool) — failed attempts kept.
- Parts used: a **view** over `ticket_materials` (status `approved` / `cancel_requested`) — no re-entry.
- `ticket_removed_parts`: description, category, disposition (폐기 | 고객반환 | 재고등록 | Donor유지),
  linked `inventory_items.id` when registered, `handled_by/at`.
  "재고등록" MUST reuse the existing extracted-part registration logic.
- Close-gate RPC: completion requires a filled `repair_record` and every removed part dispositioned.
  Admin override requires a reason, logged to `ticket_close_overrides`.
  Gate controlled by a setting flag (default OFF).
- UI: "수리 기록" section on the ticket detail page, editable by role.

**Schema notes**
- **[Q2] Where is "close"?** Today: TECHNICIAN `submitEstimateAction` → `WAITING_APPROVAL`, then
  ADMIN/MANAGER `approveTicketAction` → `COMPLETED` + `is_approved=true` (+ `PAID`). Cancellation is
  `cancelTicketAction` → `CANCELED`. The gate must hook one (or both) of these server actions.
- **[Q3] Existing extracted-part registration is tied to a `ticket_materials` row** (return fields
  on the row of the part that *replaced* it) and runs as a multi-step server action with
  compensating updates, not a DB transaction. A removed part with no dispatched replacement cannot
  use it as-is. Phase 2 needs a decision: wrap the existing logic into an RPC (changes an existing
  code path) or extend it.
- **[Q4] Setting flags:** no flag mechanism exists. `global_settings` is a single typed row.
  Proposal: add nullable/boolean columns there (e.g. `ri_close_gate_enabled boolean default false`).
- New tables are separate from `repair_tickets`, so `protect_approved_ticket` does not block them;
  the plan must define its own "locked after approval" rule for repair records.
- CS can SELECT only COMPLETED tickets; RLS of new tables should mirror `tickets_select`.

**Dependencies:** Phase 1 (board_id for faults/measurements is useful but optional).

**Acceptance:** a full ticket can be recorded end-to-end; gate ON blocks incomplete close; override
logged; existing ticket flows unchanged with gate OFF.

---

## Phase 3 — Part knowledge & compatibility

**Goal:** know which part fits what, with evidence.

**Scope**
- `part_specs` (part_number, manufacturer, category, spec jsonb, interchange_group_id),
  `part_number_aliases` (incl. chip marking codes), `interchange_groups` (spec_signature jsonb).
- `part_compatibility` (part_spec_id, target_type, target_id, status, confidence, limitation_note,
  unique per part+target), `compatibility_evidence` (source: repair | datasheet | supplier | manual |
  ai_approved, ticket_id, result: success | partial | fail, detail, recorded_by, created_at),
  `compatibility_summary` view (evidence counts).
- `record_compatibility_result()` RPC: inserts evidence and recomputes status/confidence with
  documented deterministic rules, in one transaction. Admin manual override is logged.
- Add nullable `part_spec_id` to `inventory_items` and `ticket_removed_parts`.
- Close step: per used part ask 정상동작 / 조건부 / 비호환 / 판단불가 (판단불가 → no evidence).
- Interchange-group candidates are created only as `unknown`/`compatible` + `inferred`.

**Schema notes**
- `inventory_specs` already exists but means "sub-category" (e.g. "노트북용 DDR4", "외주"),
  not a part spec. `part_specs` is a new concept — naming must avoid confusion in UI (Korean label
  e.g. "부품 규격").
- Several `inventory_items` are **outsourced services** (카테고리 액정/메인보드/케이스, spec "외주",
  qty 98–99) rather than physical stock. Compatibility logic must not treat them as parts. **[Q5]**
- P4: "verified" only via the explicit per-part question answered by a human at close.

**Dependencies:** Phase 1 (targets), Phase 2 (close step, removed parts).

**Acceptance:** evidence accumulates from closes; counts visible; no automatic "verified".

---

## Phase 4 — Donor devices

**Scope**
- `donor_devices` (model/variant/board, serial, location, status: intact | partially_harvested |
  depleted | discarded, source_ticket_id, photos), `donor_part_candidates` (category, part_spec_id,
  condition: ok | faulty | unknown | extracted, extracted_item_id).
- Convert 수리불가/고객포기 ticket → donor, requiring an explicit "소유권 이전 확인" checkbox.
- Extract action: calls existing extracted-part registration + marks candidate extracted, one transaction.

**Schema notes**
- Today a customer-abandoned device is a CANCELED ticket with `cancel_device_disposal='DISPOSE'`,
  confirmed via `dispose_confirmed_at` (`DisposalConfirmWidget`). "Convert to donor" fits naturally
  as an alternative to disposal confirmation. **[Q6]** Legal/ownership wording of the checkbox.
- Extraction-into-stock depends on the Q3 decision.
- Photos: reuse the `ticket-images` storage pattern (`docs/03_image_storage_guide.md`).

**Dependencies:** Phases 1, 3 (Q3 resolved).

**Acceptance:** donor parts appear as potential stock; extraction creates a normal `inventory_items`
row (+ INBOUND `inventory_transactions`).

---

## Phase 5 — Search & intake pre-check

**Scope**
- RPCs: `search_parts_for_device(query)`, `search_devices_for_part(query)`,
  `get_device_knowledge(model/variant/board)` (past repairs, symptoms, notes).
- `model_notes` (e.g. "상판 분해 시 케이블 주의").
- Intake/ticket panel: past repairs, compatible parts grouped by status/confidence with evidence
  counts, stock counts + locations, donor candidates, notes. Incompatible shown separately.
- Part lookup page (reverse search).

**Schema notes**
- RPCs must respect ticket RLS (TECHNICIAN sees only assigned tickets) — "past repairs" for other
  tickets needs an explicit decision on what a technician may see (anonymised summary?). **[Q7]**

**Dependencies:** Phases 1–4.

**Acceptance:** both search directions work with partial/alias input.

---

## Phase 6 — Purchase guard

**Scope**
- Hook the existing purchase request path: before creating a request, show internal resources
  (exact stock, verified alternatives, inferred candidates, donors, past usage).
- If resources exist, require a reason code (내부재고 불량 | 고객 신품요청 | Donor 상태 미확인 |
  납기 | 기타+text). Log to `purchase_guard_logs`. Report page: purchases made despite internal resources.

**Schema notes**
- There is no DB trigger for purchases. A "purchase request" is a `ticket_materials` row with
  `request_type='purchase'`, chosen automatically in the UI when the selected item's quantity ≤ 0
  (`AddMaterialCard.tsx:105`, `EstimateCard.tsx:239`), then `requestMaterialDispatchAction` →
  `approveMaterialDispatchAction`.
- **Existing defect (not in scope to fix without approval):** the live `approve_material_dispatch`
  (migration 014 version) deducts stock and fails on insufficient stock for *purchase* requests too,
  so a qty-0 purchase request cannot be approved. See `00-current-state.md` §8.

**Dependencies:** Phases 3–5.

**Acceptance:** purchase flow still works; bypass without reason impossible when resources exist.

---

## Phase 7 — Physical tracking

**Scope**
- No location/label fields exist today → add `label_code` (unique, short) and a storage location
  structure (e.g. `A-01-04`, `DONOR-C07`).
- Printable QR label page; scan route (login required) showing item/donor history.

**Schema notes**
- `inventory_items` is an aggregate row (quantity N of identical items), not a single physical unit.
  A label per `inventory_items` row = label per bin/lot, not per piece. **[Q8]**

**Dependencies:** Phase 4.

**Acceptance:** scanning a label opens the correct record.

---

## Phase 8 — VECTOR integration

**Scope**
- Read-only RPCs in a dedicated schema/role; access routed via the self-hosted n8n webhook.
- `ai_candidates` (type, payload, confidence, evidence, source_url, status: pending | approved |
  rejected, reviewed_by/at) + admin review UI. Approval converts to documented/inferred data only.

**Schema notes**
- Existing n8n integrations: `N8N_DEVICE_WEBHOOK_URL` (label analysis, outbound from app) and
  `/api/inventory/webhook` (inbound, shared API key, writes inventory with the **service_role**
  client). The new agent path must not reuse that inbound pattern (P8).

**Acceptance:** agent role cannot write anywhere except `ai_candidates` (verified by test).

---

## Phase 9 — AI-assisted registration

- Extend the existing n8n + OpenRouter vision flow: label/board/chip-marking photo → `ai_candidates`.
- Acceptance: photo produces a candidate; nothing is registered without approval.

---

## Phase 10 — Repair knowledge engine

- Similar-case search by board + symptom codes + measurements + faults (relational first;
  `pgvector` later only if needed — available but not installed).
- Acceptance: returns relevant past cases for a new ticket.
