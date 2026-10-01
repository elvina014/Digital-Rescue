# Phase 3 — Part knowledge & compatibility (부품 규격 · 호환성) — PLAN

Status: **APPROVED 2026-10-02 — EXECUTED 2026-10-02** (see `phase-3-report.md`). Branch `feat/repair-intelligence`.

## 0. Preconditions (checked 2026-10-01)

| Check | Result |
| --- | --- |
| Phase 2 report exists, all acceptance rows ✅ | yes (`phase-2-report.md`, pgTAP 232/232, commit `f2a9605`) |
| Phase 1 report (dependency) | ✅ (`phase-1-report.md`) |
| Production status | Phases 0.5, 1, 2 are "local ✅, production deploy pending" (Brad's step). Does not block local work. |
| Dev target | The session prompt left the target as a placeholder. Per Q9 / `03-working-rules.md` = **local Supabase on Docker** (stack is running). Brad confirms "local" together with APPROVED (§11-1). |
| Working tree | Only pre-existing, non-RI changes (`.claude/*`, `.gitignore`) — not touched. |
| Open point from Phase 2 | Decision 6 ("all EXPERT_REPAIR regardless of assignment?") is still unanswered. Not part of this phase. |

CLI: local-only commands (`db reset`, `test db`, `gen types --local`, `db advisors --local`). Production: no queries planned.

## 1. Goal and acceptance (roadmap)

Record what a part *is* (part spec), which devices/boards it fits, and why we believe it (evidence).

Acceptance: evidence accumulates; counts visible; no automatic "verified".

## 2. What is NOT changed

- No existing trigger, function, policy or view is altered or replaced. In particular the Phase 2 RPCs
  (`ri_inbound_extracted_part`, `approve_removed_part_inbound`, …), the view `repair_parts_used`,
  `approve_material_dispatch`, `protect_approved_ticket`, `repair_gate_check` stay byte-identical (md5 checked).
- Additive on existing tables: one nullable column each on `inventory_items` and `ticket_removed_parts`
  (+ a column-level GRANT for the latter, because Phase 2 gave `authenticated` column privileges only).
- No stock quantity, `inventory_transactions`, `material_cost_details` or `override_unit_price` is written (P7).
- Approval and cancel flows: no new blocking rule (§11-2). `approveTicketAction` is not modified.
- `inventory_specs` keeps its meaning ("sub-category"). The new entity is `part_specs`, UI label **"부품 규격"**.

## 3. Schema — one migration `supabase/migrations/<UTC ts>_part_compatibility.sql`

All new tables: `id uuid PK default gen_random_uuid()`, RLS enabled, `anon` revoked, index on every FK column.
Code values English upper/lower-case as below; UI shows Korean labels. Normalisation reuses the existing
`catalog_normalize()` (called, not changed).

### 3.1 Tables

| Table | Columns | Constraints |
| --- | --- | --- |
| `interchange_groups` | `name text NOT NULL` (≤ 100), `note text`, `created_by` → employees SET NULL, `created_at` | UNIQUE(`name`) |
| `part_specs` | `part_type text NOT NULL` CHECK IN (`PANEL` 액정, `BATTERY` 배터리, `KEYBOARD` 키보드, `IC` 칩/IC, `STORAGE` 저장장치, `MEMORY` 메모리, `MAINBOARD` 메인보드, `CABLE` 케이블, `FAN` 팬/쿨러, `CASE` 케이스, `ADAPTER` 어댑터, `OTHER` 기타) — §11-4; `name text NOT NULL` (대표 품번/명칭, e.g. "LP140WF7-SPB1", "BQ24780S", ≤ 150), `name_norm` GENERATED (`catalog_normalize(name)`), `manufacturer text NULL` (≤ 50), `compat_target text NOT NULL` CHECK IN (`MODEL`,`BOARD`) (what the part attaches to — P2; default by type: `IC` → `BOARD`, others → `MODEL`), `interchange_group_id uuid NULL` → interchange_groups **SET NULL**, `description text`, `needs_review boolean NOT NULL DEFAULT false`, `created_by`, `created_at`, `updated_at` | UNIQUE(`part_type`,`name_norm`); CHECK `name_norm IS NOT NULL`; trgm GIN on `name_norm` |
| `part_number_aliases` | `part_spec_id` → part_specs **CASCADE**, `alias text NOT NULL` (≤ 150), `alias_norm` GENERATED, `alias_type text NOT NULL DEFAULT 'PART_NUMBER'` CHECK IN (`PART_NUMBER` 품번, `MARKING` 칩 마킹, `OTHER`), `created_by`, `created_at` | UNIQUE(`part_spec_id`,`alias_norm`) — **not** globally unique: the same chip marking can belong to different parts (§11-9); trgm GIN on `alias_norm` |
| `part_compatibility` | `part_spec_id` → part_specs **RESTRICT**, `model_id` → catalog_models RESTRICT, `variant_id` → catalog_variants RESTRICT, `board_id` → catalog_boards RESTRICT, `status text NOT NULL DEFAULT 'unknown'` CHECK IN (`compatible`,`conditional`,`incompatible`,`unknown`), `confidence text NOT NULL DEFAULT 'inferred'` CHECK IN (`verified`,`documented`,`inferred`), `limitation_note text`, `created_at`, `updated_at` | CHECK `num_nonnulls(model_id, variant_id, board_id) = 1` (P2: exactly one target); CHECK (`status <> 'conditional'` OR `limitation_note` non-empty) (P3); three partial UNIQUE indexes (`part_spec_id`,`model_id`) / (`part_spec_id`,`variant_id`) / (`part_spec_id`,`board_id`) WHERE the target column IS NOT NULL (unique per part+target) |
| `compatibility_evidence` | `compatibility_id` → part_compatibility **RESTRICT**, `kind text NOT NULL` CHECK IN (`INSTALL` 실장 확인, `DOCUMENT` 문서 근거, `INFERENCE` 추정, `OVERRIDE` 관리자 조정), `observed_status text NOT NULL` CHECK IN (`compatible`,`conditional`,`incompatible`), `limitation_note text`, `ticket_id uuid NULL` → repair_tickets **RESTRICT**, `ticket_material_id uuid NULL` → ticket_materials **SET NULL** (must not block the existing ADMIN/MANAGER material delete), `reference text NULL` (document title / URL), `note text NULL`, `created_by uuid NOT NULL` → employees RESTRICT, `created_at`, `retracted_at timestamptz`, `retracted_by uuid` → employees SET NULL, `retract_reason text` | CHECK (`observed_status <> 'conditional'` OR `limitation_note` non-empty); CHECK (`kind <> 'DOCUMENT'` OR `reference` non-empty); CHECK (`kind <> 'OVERRIDE'` OR `note` non-empty — the reason); partial UNIQUE(`ticket_material_id`) WHERE `retracted_at IS NULL` (one active answer per used part). Rows are never deleted or edited — corrections = retract + new row. |

### 3.2 New nullable columns on existing tables

| Column | FK | Note |
| --- | --- | --- |
| `inventory_items.part_spec_id uuid NULL` | → part_specs **RESTRICT** | "default spec" of that stock row. Existing policies apply (UPDATE ADMIN/MANAGER). Index. |
| `ticket_removed_parts.part_spec_id uuid NULL` | → part_specs **RESTRICT** | + `GRANT INSERT (part_spec_id), UPDATE (part_spec_id) … TO authenticated` (same pattern as the Phase 2 editable columns; frozen after inbound approval by the existing policy). Index. |

### 3.3 Deterministic recompute (P3, P4)

Internal function `ri_recompute_compatibility(p_compatibility_id)` (no EXECUTE for any API role). Input = the
row's **active** evidence (`retracted_at IS NULL`). Same evidence set → same result, independent of call order.

1. **confidence** = highest tier present among non-OVERRIDE evidence: `INSTALL` → `verified`, else `DOCUMENT` →
   `documented`, else `inferred`. An `OVERRIDE` never contributes to confidence → an admin can never create
   "verified" without an install confirmation (P4).
2. **status**:
   - if an active `OVERRIDE` exists → status and note of the **latest** override;
   - else take the evidence of the highest tier only (lower tiers are ignored once a higher one exists):
     all `compatible` → `compatible`; all `incompatible` → `incompatible`;
     any `conditional` and no `incompatible` → `conditional` (note = latest conditional note);
     **`compatible`/`conditional` mixed with `incompatible`** → `conditional` with the generated note
     "상반된 결과: 정상 n건 / 조건부 m건 / 비호환 k건 — 근거 확인 필요" (§11-3);
   - no active evidence → `unknown` + `inferred`, note NULL.
3. `updated_at := now()`.

`part_compatibility` and `compatibility_evidence` have **no direct write policy**: every status/confidence change
comes from an evidence row through the RPCs below.

### 3.4 Functions

All: explicit `search_path`; `REVOKE ALL … FROM PUBLIC, anon, authenticated`, then GRANT as listed. Korean errors.

| Function | Kind / role check | Grant | Behaviour |
| --- | --- | --- | --- |
| `ri_recompute_compatibility(uuid)` | internal | none | §3.3 |
| `record_compatibility_result(p_part_spec_id uuid, p_target_type text, p_target_id uuid, p_kind text, p_observed_status text, p_limitation_note text DEFAULT NULL, p_reference text DEFAULT NULL, p_note text DEFAULT NULL) RETURNS jsonb` | SECURITY DEFINER; **ADMIN only** (manual entry on the admin screen: `DOCUMENT`, `INFERENCE`, `INSTALL` without ticket, `OVERRIDE` with reason) | authenticated | one transaction: validate; outsourced n/a; find-or-create the `part_compatibility` row (target type must be `MODEL`/`VARIANT`/`BOARD` and the id must exist); insert evidence (`created_by = auth.uid()`); recompute; return `{compatibility_id, evidence_id, status, confidence}` |
| `record_part_install_result(p_material_id uuid, p_part_spec_id uuid, p_answer text, p_limitation_note text DEFAULT NULL, p_target_type text DEFAULT NULL, p_target_id uuid DEFAULT NULL) RETURNS jsonb` | SECURITY DEFINER; caller must pass `repair_record_can_edit(ticket)` (= ADMIN, MANAGER, assigned TECHNICIAN/EXPERT_REPAIR, until approval/cancel; ADMIN afterwards) | authenticated | The per-used-part question. `p_answer` IN (`OK` 정상동작, `CONDITIONAL` 조건부, `INCOMPATIBLE` 비호환, `UNKNOWN` 판단불가). One transaction: lock the material; it must be `approved`/`cancel_requested`, not spec `외주`, not category `소프트웨어`; **target**: if the ticket has a catalog link matching the spec's `compat_target` (BOARD → `catalog_board_id`; MODEL → `catalog_variant_id` if set, else `catalog_model_id`) that link is used and the parameters are ignored; otherwise `p_target_*` is required (§11-6) and must fit `compat_target`; retract the material's previous active evidence (reason "응답 변경"); `UNKNOWN` → stop here (**no evidence**); else insert `INSTALL` evidence with `ticket_id`, `ticket_material_id`; recompute old and new compatibility rows. |
| `retract_compatibility_evidence(p_evidence_id uuid, p_reason text)` | SECURITY DEFINER; ADMIN; reason required | authenticated | sets `retracted_*`, recompute. This is how an override is removed, too. |
| `part_spec_create(p_part_type text, p_name text, p_manufacturer text DEFAULT NULL, p_compat_target text DEFAULT NULL)` | SECURITY DEFINER; all staff except CS (same rule as `catalog_create_model`) | authenticated | inline "새 부품 규격 등록": creates the spec (+ alias = name, type `PART_NUMBER`); `needs_review = (role <> 'ADMIN')`; existing (`part_type`,`name_norm`) → returns the existing id (`existed = true`). |
| `part_spec_search(p_query text, p_limit int DEFAULT 20)` | STABLE, **invoker** (RLS applies) | authenticated | contains-match on name/alias norm, then `similarity()` ≥ 0.2; returns spec id, type, name, manufacturer, matched alias, score. |
| `part_set_updated_at()` | trigger fn (part_specs) | none | |

AI never calls any of these (P8: Phase 8 adds its own read-only RPCs + queue).

### 3.5 View `compatibility_summary` (`security_invoker = true`)

One row per `part_compatibility` row: part spec (id, type, name, manufacturer), target (type, id, label
"브랜드 모델 [변형]" / board number), `status`, `confidence`, `limitation_note`, counts of **active** evidence
(`install_ok`, `install_conditional`, `install_incompatible`, `document_count`, `inference_count`, `has_override`),
`last_evidence_at`, `is_candidate = false`.

UNION ALL **interchange candidates** (`is_candidate = true`, computed, never stored — §11-5): for a spec B in the same
`interchange_group` as spec A, every target where A has a row with confidence `verified`/`documented` and B has **no**
own row: `status = 'compatible'` if A is `compatible`, otherwise `'unknown'`; `confidence = 'inferred'`; note
"동일 호환 그룹(<group>)의 <A name> 기준 추정". Candidates are only `unknown`/`compatible` + `inferred` (roadmap).
Rows of specs whose linked stock is exclusively outsourced do not exist by construction (Q5: outsourced lines cannot be answered and are hidden from the stock-link tab).

No customer data in the view. `REVOKE ALL … FROM anon`; writes revoked from `authenticated`.

### 3.6 RLS

| Table | SELECT | INSERT / UPDATE / DELETE |
| --- | --- | --- |
| `part_specs`, `part_number_aliases`, `interchange_groups` | all authenticated (no PII; Q7) | `get_my_role() = 'ADMIN'`. Non-admin creation only via `part_spec_create`. |
| `part_compatibility`, `compatibility_evidence` | all authenticated | none (RPC only; table privileges INSERT/UPDATE/DELETE/TRUNCATE revoked from `authenticated`) |

`compatibility_evidence` holds `ticket_id` (an id only — the ticket itself stays protected by `tickets_select`) and free-text notes;
UI hint "고객 개인정보를 적지 마세요" (same as Phase 2).

## 4. Application (UI Korean; new components < 200 lines; optimistic updates with rollback — R5)

Before coding: read the relevant guides in `node_modules/next/dist/docs/` per `AGENTS.md`.

### 4.1 New files

| File | Content |
| --- | --- |
| `src/components/catalog/PartSpecPicker.tsx`, `NewPartSpecInline.tsx` | reusable "부품 규격" search (품번/마킹/별칭) + inline registration ("관리자 검토 대기" for non-admin); reuses `useDebouncedSearch` |
| `src/app/(admin)/catalog/parts/{page,PartsClient,PartSpecEditor,CompatibilityPanel,EvidenceList}.tsx` | ADMIN tab **"부품 규격"**: list (filter 종류 / 검토 필요 / text), edit spec, aliases, interchange group; per spec the compatibility rows with status · confidence · counts, evidence history, "근거 추가" (문서/추정/실장 확인), "관리자 조정" (reason), "근거 철회" (reason) |
| `src/app/(admin)/catalog/parts/stock/{page,StockLinkClient}.tsx` | ADMIN tab **"재고 연결"**: `inventory_items` (spec `외주` excluded) with their part spec; link / unlink via `PartSpecPicker` (writes only `part_spec_id`) |
| `src/app/(admin)/catalog/partActions.ts` | session-client server actions for the above (search, create, admin CRUD, record / retract, item link) |
| `src/app/(admin)/tickets/[id]/repair-record/PartsUsedList.tsx`, `PartResultForm.tsx` | "사용 부품" list (moved out of `RepairRecordSection`, same rows) + per physical part: 부품 규격 (pre-filled from the item's `part_spec_id`), target (ticket's 표준 모델/보드, or a picker when the ticket has none), answer 정상동작 / 조건부(제한사항 필수) / 비호환 / 판단불가, current compatibility badge + counts. Disabled for 외주 / 소프트웨어 and when `canEdit` is false. |
| `supabase/tests/part_compatibility.test.sql` | pgTAP |

### 4.2 Existing files changed

| File | Change |
| --- | --- |
| `tickets/[id]/repair-record/RepairRecordSection.tsx` | inline parts list replaced by `<PartsUsedList>` |
| `repair-record/loadRepairRecord.ts`, `labels.ts` | additionally load, per used material: item `part_spec_id` + spec name, the active evidence (answer) and the summary row; ticket catalog ids |
| `repair-record/actions.ts` | `recordPartResultAction` → `record_part_install_result` |
| `repair-record/RemovedPartForm.tsx`, `RemovedPartsList.tsx` | optional "부품 규격" picker → `part_spec_id` (display in the list) |
| `tickets/[id]/TicketDetailForm.tsx` | approval card: one info line "사용 부품 호환 확인: n / m건 응답" with a hint to answer in 수리 기록 (**non-blocking**, no change to the submit button) |
| `catalog/CatalogTabs.tsx` | tabs "부품 규격", "재고 연결" |
| `src/lib/catalogErrors.ts` | reused (extended only if a new constraint name needs a Korean message) |
| `src/types/supabase.ts` | regenerated |
| docs | `02-roadmap.md` status, `known-issues.md` KI-5 note, this plan's status, `phase-3-report.md` |

`approveTicketAction`, `cancelTicketAction`, inventory screens (`InventoryClient`, `NewInventoryForm`), the n8n webhook and
`/api/*`: **unchanged**. `/catalog/*` is already ADMIN-guarded and in `ADMIN_PATHS` (`src/proxy.ts`).

## 5. Rollback SQL

App first (`git revert <phase-3 commit>`), then:

```sql
BEGIN;
DROP VIEW IF EXISTS public.compatibility_summary;
DROP FUNCTION IF EXISTS public.part_spec_search(text, integer);
DROP FUNCTION IF EXISTS public.part_spec_create(text, text, text, text);
DROP FUNCTION IF EXISTS public.retract_compatibility_evidence(uuid, text);
DROP FUNCTION IF EXISTS public.record_part_install_result(uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.record_compatibility_result(uuid, text, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.ri_recompute_compatibility(uuid);
ALTER TABLE public.ticket_removed_parts DROP COLUMN IF EXISTS part_spec_id;  -- drops its FK, index and column grants
ALTER TABLE public.inventory_items      DROP COLUMN IF EXISTS part_spec_id;
DROP TABLE IF EXISTS public.compatibility_evidence, public.part_compatibility,
  public.part_number_aliases, public.part_specs, public.interchange_groups;
DROP FUNCTION IF EXISTS public.part_set_updated_at();
COMMIT;
```

Effect: all part-spec / compatibility knowledge is lost (export first if any exists). No pre-existing column or row is
changed by Phase 3, so nothing else needs restoring. Exact signatures are repeated in the report; the rollback is
executed once locally and verified (0 Phase 3 objects, md5 of the functions in §2 unchanged, `db reset` + all tests pass).

## 6. Test plan (local only)

### A. pgTAP `part_compatibility.test.sql`
1. Constraints: exactly-one target; unique per part+target for each target type; `conditional` needs a note (row and evidence);
   `DOCUMENT` needs a reference; `OVERRIDE` needs a reason; (`part_type`,`name_norm`) unique; alias unique per spec, same marking allowed on two specs.
2. RLS with the 6 seed roles: all read; only ADMIN writes specs/aliases/groups; nobody (incl. ADMIN) writes
   `part_compatibility` / `compatibility_evidence` directly; anon nothing.
3. `record_part_install_result`: assigned technician OK; other technician, RECEPTION, CS refused; after approval only ADMIN;
   pending/rejected/cancelled material refused; `외주` and `소프트웨어` refused; ticket link wins over parameters; no link + no parameter → Korean error;
   target type not matching `compat_target` refused; `UNKNOWN` → **0 evidence rows**; changing an answer retracts the old row and keeps history;
   one active evidence per material.
4. Recompute (§3.3), each rule: 1× OK → `compatible`+`verified`; DOCUMENT only → `documented`; INFERENCE only → `inferred`;
   INSTALL outranks a contradicting DOCUMENT; mixed INSTALL results → `conditional` + generated note; OVERRIDE changes status but **not** confidence;
   OVERRIDE alone never gives `verified`; retracting everything → `unknown`+`inferred`; same evidence inserted in a different order → identical row.
5. **No automatic verified (P4):** approving/completing a ticket with unanswered parts creates no evidence and no compatibility row;
   `record_compatibility_result` refuses non-ADMIN; no code path other than an `INSTALL` evidence yields `verified`.
6. `compatibility_summary`: counts match the evidence; candidates appear only for group siblings without an own row, only as
   `compatible`/`unknown` + `inferred`; a sibling with its own row is not duplicated; retracted evidence not counted.
7. `part_spec_create` (roles, `needs_review`, duplicate → existing id); `part_spec_search` (partial part number, marking alias).
8. New columns: `inventory_items.part_spec_id` writable by ADMIN/MANAGER only (existing policy); `ticket_removed_parts.part_spec_id`
   writable by the assigned technician, frozen after inbound approval; referenced spec cannot be deleted.
9. Privileges/definitions: no EXECUTE for PUBLIC/anon (via `has_function_privilege`, KI-8); definer functions have `search_path` and a role check; RLS on 5 tables.
10. Regression: the existing 232 assertions still pass; md5(`prosrc`) of the Phase 2 RPCs, `approve_material_dispatch`,
    `protect_approved_ticket`, `recalc_ticket_material_cost` and the definition of `repair_parts_used` unchanged.

### B. E2E (local stack, seed accounts, temporary `.env.development.local` — deleted afterwards)
1. ADMIN: create a part spec (panel) with alias, link it to a stock item ("재고 연결"); create an IC spec with a marking alias.
2. TECHNICIAN on an IN_PROGRESS ticket with a linked model: "사용 부품" → 정상동작 → badge "호환 · 검증됨 (정상 1)"; change to 조건부 without note → Korean validation; with note → saved; optimistic row rolls back on a forced error.
3. Ticket without a catalog link: target picker required; inline "새 부품 규격 등록" → "관리자 검토 대기".
4. MANAGER at WAITING_APPROVAL: sees "사용 부품 호환 확인: n / m건 응답", can answer; approval works with unanswered parts (no block); after approval the answers are read-only for MANAGER, editable by ADMIN.
5. ADMIN "부품 규격": counts visible; add 문서 근거; 관리자 조정 with reason (status changes, confidence does not); 근거 철회; interchange group → candidate row "추정" on the sibling spec.
6. Removed part with a part spec; non-admin cannot open `/catalog/parts*`.

### C. Static / advisors / rollback
`npx supabase db reset` ×2; `npx supabase test db`; `npm run db:types`, `typecheck`, `lint`, `build`;
`npx supabase db advisors --local --type all --level info` — new findings fixed, pre-existing listed; rollback rehearsal (§5).

## 7. Implementation order

1. Migration + pgTAP A → 2. types → 3. pickers + admin tabs → 4. ticket "사용 부품" answers + removed-part spec →
5. approval-card info line → 6. E2E, static checks, advisors, rollback rehearsal → 7. report, docs, local commit.
Any conflict with the real schema or a step failing twice → STOP and ask (R8).

## 8. Risks

- **Empty knowledge at start:** production has no part specs and few linked tickets, so most answers need the inline spec
  registration / target picker. Staff-created specs are flagged `needs_review`; no merge tool in this phase.
- **Aggregate stock rows:** one `inventory_items` row can physically contain different part numbers; `part_spec_id` on the item is only the
  default shown in the answer form — the evidence stores the spec the technician confirms (P1).
- **Answer ≠ per-unit truth:** evidence is per material line, not per unit (quantity > 1 → one answer).
- **New column on `inventory_items`:** existing code selects named columns or `*` and ignores it; the Phase 2 fixture dumps under
  `supabase/test-fixtures/phase2_flow/` are static captures and will differ by the extra NULL key if re-captured (not part of `test db`).
- **Free text may contain customer PII** (notes, references) — visible to all staff; hint only.
- **Conflict rule (§11-3)** hides which side is right; the counts and the evidence list show the detail.
- Evidence with `ticket_id` RESTRICT: a ticket with evidence cannot be hard-deleted (same as Phase 2 repair data).
- Deploy order for Brad: migration first (old app ignores the new objects), then the app. After 0.5 → 1 → 2.

## 9. Out of scope

Donors (Phase 4); search by device/part and intake pre-check (Phase 5); purchase guard (Phase 6); labels / qty-1 items (Phase 7);
AI access and `ai_candidates` (Phase 8/9); automatic evidence from removed parts (§11-7); passing `part_spec_id` from a removed part to
the stock row created on inbound (§11-8 — would modify Phase 2 RPCs); part-spec merge tool; structured attributes (size, resolution, connector);
making the answer mandatory at approval; KI-9, KI-10; Phase 2 open point (decision 6).

## 10. Files

| New | Changed |
| --- | --- |
| 1 migration; `supabase/tests/part_compatibility.test.sql`; §4.1 files; `phases/phase-3-report.md` | §4.2 list |

## 11. Decisions needed from Brad (with APPROVED)

**Answers (Brad, 2026-10-02):** 1 local Docker ✅ · 2 as proposed ✅ · 3 `conditional` ✅ · 4–10 ✅. "APPROVED" given 2026-10-02.
Implementation note: one more internal helper, `ri_compatibility_row(uuid, text, uuid)`, was added (see the report's deviations and rollback SQL).

1. **Dev target** = local Docker Supabase? (placeholder in the prompt)
2. **Who answers, and is it mandatory?** Proposal: the question lives in 수리 기록 → "사용 부품"; whoever may edit the record answers
   (assigned technician, MANAGER, ADMIN) — the person who actually installed the part (P4). The approval card only shows "n / m건 응답";
   **approval is not blocked** (unanswered = 판단불가 = no evidence). A mandatory mode could be added later behind a flag (P10). OK?
3. **Contradicting results** at the same confidence tier (e.g. 정상 2건 + 비호환 1건): proposal → `conditional` with an automatic
   "상반된 결과 … 근거 확인 필요" note until an admin resolves it (override or retract). Alternative: `unknown`.
4. **부품 종류 (`part_type`) list** and attach rule: 액정, 배터리, 키보드, 칩/IC, 저장장치, 메모리, 메인보드, 케이블, 팬/쿨러, 케이스, 어댑터, 기타;
   칩/IC → 보드 기준, others → 모델/변형 기준 (editable per spec). Change freely.
5. **Interchange candidates** are computed in the view (never stored, so they cannot go stale and need no evidence rows). OK?
6. **Ticket without 표준 모델/보드:** the answer form lets the user pick the model/board; it is stored **on the evidence only** — the ticket
   is not modified. (Alternative: answers impossible until the ticket is linked — but the link can only be set at "수리 시작" today.) OK?
7. **Removed (original) parts as evidence:** a part taken out of a device obviously fitted it. Proposal: **not** in this phase
   (only the `part_spec_id` is stored on the removed part). Could later become `documented` evidence. OK?
8. **Stock created from a removed part does not inherit `part_spec_id`** in this phase (would require changing the Phase 2 RPCs and
   conflicts with aggregate stock rows until Phase 7). ADMIN links stock in "재고 연결". OK?
9. **Aliases unique per spec, not globally** (chip markings repeat across parts); search may return several specs. OK?
10. **Admin override** changes status only and can never produce `verified` (§3.3). OK?
