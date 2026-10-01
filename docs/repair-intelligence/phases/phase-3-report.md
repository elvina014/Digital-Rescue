# Phase 3 — Part knowledge & compatibility (부품 규격 · 호환성) — REPORT

Executed 2026-10-02 on branch `feat/repair-intelligence` (plan: `phase-3-plan.md`, APPROVED 2026-10-02 with decisions 1–10).
Local Docker Supabase only — **production untouched** (no production query was run in this phase).

## Result

| Acceptance / requirement | Result |
| --- | --- |
| Evidence accumulates | ✅ E2E: TECHNICIAN answered "정상동작" on a used SSD → `INSTALL` evidence (ticket, material, person) → row `compatible / verified`; ADMIN document evidence, override and retraction all change the row through evidence only |
| Counts visible | ✅ ticket "사용 부품": "LG 그램 15 15Z90T 호환 · 검증됨 (정상 1 · 문서 1)"; ADMIN "부품 규격" tab: status · confidence · counts · history per target |
| No automatic "verified" | ✅ pgTAP: ticket approval creates no evidence / no row; no `verified` row without an active `INSTALL` evidence; override alone → `inferred`. E2E: MANAGER approved a ticket with an unanswered part → nothing created |
| 판단불가 → no evidence | ✅ pgTAP + E2E (answer retracted, row back to `documented`, approval card "0 / 1건 응답") |
| Approval not blocked (decision 2) | ✅ `approveTicketAction` untouched; approval with 0 / 1 answered succeeded |
| Lock after approval | ✅ pgTAP + E2E: MANAGER "읽기 전용" (no button), TECHNICIAN refused, ADMIN corrected the answer (조건부 + 제한사항) |
| Ticket without 표준 모델 (decision 6) | ✅ E2E: model picked in the answer form, stored on the evidence only — `repair_tickets.catalog_model_id` still NULL, `updated_at` unchanged |
| Interchange candidates (decision 5) | ✅ pgTAP + E2E: sibling spec shows "미확인 · 추정 · 호환 그룹 후보 — 동일 호환 그룹(NVMe 2280)의 PM9A1 512GB 기준 추정"; nothing stored |
| Admin override (decision 10) | ✅ E2E: status → 비호환, confidence stayed 검증됨, badge "관리자 조정"; reason required |
| Existing objects unchanged | ✅ `md5(prosrc)` of all 37 pre-existing public functions and the definition of `repair_parts_used` identical before / after the migration and again after the rollback rehearsal |
| pgTAP | ✅ **351/351** (existing 232 + Phase 3: 119) |
| `db reset` twice | ✅ |
| typecheck / lint / build | ✅ 0 errors / 0 errors, 16 warnings (all pre-existing) / success |
| Advisors (`db advisors --local --type all --level info`) | ✅ no new WARN/ERROR. New: 12 INFO `unused_index` on the fresh, empty Phase 3 indexes. The 14 WARNs are the pre-existing list from Phase 1 |
| Types | ✅ `npm run db:types` regenerated |
| Rollback rehearsal | ✅ see Rollback |

## Decisions applied (Brad, 2026-10-02)

1 local Docker · 2 answered by whoever may edit the repair record, never blocks approval · 3 contradicting results → `conditional` with a generated note ·
4 part-type list as proposed (IC → board, others → model/variant) · 5 interchange candidates computed in the view · 6 target picked in the answer form when the ticket has no link, stored on the evidence only ·
7 removed parts are not evidence · 8 inbound stock does not inherit `part_spec_id` · 9 aliases unique per spec · 10 override changes status only.

## Changes

### Database — `supabase/migrations/20261001221915_part_compatibility.sql`

- Tables (RLS on, `anon` revoked, FK indexes): `interchange_groups`, `part_specs`, `part_number_aliases` (read: all staff, write: ADMIN),
  `part_compatibility`, `compatibility_evidence` (read: all staff; **no direct writes for anyone** — RPC only).
- Columns: `inventory_items.part_spec_id`, `ticket_removed_parts.part_spec_id` (nullable, FK RESTRICT, index; column-level INSERT/UPDATE grant on the latter).
- View `compatibility_summary` (security_invoker): status, confidence, active-evidence counts, target label + computed interchange candidates.
- Functions (all `search_path` set; EXECUTE revoked from PUBLIC/anon):
  `record_compatibility_result` (definer, ADMIN), `record_part_install_result` (definer, `repair_record_can_edit`), `retract_compatibility_evidence` (definer, ADMIN),
  `part_spec_create` (definer, not CS), `part_spec_search` (invoker) — EXECUTE for `authenticated`;
  internal `ri_recompute_compatibility`, `ri_compatibility_row` (no EXECUTE for any API role incl. service_role); trigger function `part_set_updated_at`.

**No existing table column, trigger, policy, function or view was altered.**

### Application

| File | Change |
| --- | --- |
| `src/app/(admin)/catalog/partActions.ts` (new) | search / inline create (all staff); ADMIN: spec CRUD, aliases, groups, record / retract evidence, stock link — session client only |
| `src/app/(admin)/catalog/parts/{page,PartsClient,PartSpecEditor,CompatibilityPanel,EvidenceList}.tsx`, `types.ts` (new) | ADMIN tab "부품 규격" |
| `src/app/(admin)/catalog/parts/stock/{page,StockLinkClient}.tsx` (new) | ADMIN tab "재고 연결" (외주 excluded; writes only `part_spec_id`, optimistic with rollback) |
| `src/components/catalog/{PartSpecPicker,NewPartSpecInline}.tsx`, `partLabels.ts` (new) | reusable picker + inline registration + Korean labels |
| `tickets/[id]/repair-record/{PartsUsedList,PartResultForm}.tsx` (new) | "사용 부품" with the per-part answer (optimistic, Korean validation) |
| `repair-record/RepairRecordSection.tsx` | inline parts list replaced by `PartsUsedList`; two new props (ticket model / board) |
| `repair-record/loadRepairRecord.ts`, `labels.ts` | load default spec, active answer and summary per used material; removed-part spec join |
| `repair-record/actions.ts` | `recordPartResultAction`; removed-part payload carries `part_spec_id` |
| `repair-record/RemovedPartForm.tsx`, `RemovedPartsList.tsx` | optional "부품 규격" picker + chip |
| `tickets/[id]/TicketDetailForm.tsx` | passes the ticket's catalog links to the section; approval card info line "사용 부품 호환 확인: n / m건 응답" (+10 lines, non-blocking) |
| `catalog/CatalogTabs.tsx` | tabs "부품 규격", "재고 연결" |
| `src/types/supabase.ts` | regenerated |

`approveTicketAction`, `cancelTicketAction`, inventory screens, the n8n webhook, `src/proxy.ts`: unchanged.

### Tests / fixtures

`supabase/tests/part_compatibility.test.sql` (119), `supabase/test-fixtures/phase3/rollback.sql`.

## Deviations from the plan

| Plan | Done | Why |
| --- | --- | --- |
| one internal function `ri_recompute_compatibility` | plus internal `ri_compatibility_row(uuid, text, uuid)` (find-or-create the row, validates target) | shared by both record functions; same privileges (none) |
| `src/lib/catalogErrors.ts` "extended only if needed" | unchanged | existing messages fit |
| `supabase/seed.sql` | unchanged | tests build their own fixtures; E2E data is created through the UI |
| E2E screenshots | none — verified by page text and DB queries | the app window was hidden, the preview could not render screenshots |
| Error style of the RPCs | `RAISE EXCEPTION` (P0001, Korean) like the Phase 1 / gate functions, not `{"error":…}` JSON like the Phase 2 flow RPCs | whole call rolls back; the UI maps P0001 messages already |

## E2E (local stack, seed accounts, temporary `.env.development.local` — **deleted afterwards**)

ADMIN: new spec "PM9A1 512GB" (저장장치) + group "NVMe 2280" ✅; evidence form validation ("호환 대상…을 선택해 주세요.") ✅; 문서 근거 → "호환 · 문서 근거 · 근거: 문서 1" ✅;
재고 연결 (외주 row not listed; SSD row linked, quantity unchanged) ✅ ·
TECHNICIAN (ticket t5, no 표준 모델): form pre-filled with the linked spec ✅; 조건부 without note → "조건부는 제한사항을 입력해 주세요." ✅; no model → "호환을 확인한 표준 모델을 선택해 주세요." ✅;
정상동작 → "호환 · 검증됨 (정상 1 · 문서 1)" ✅; removed part with inline "새 부품 규격 등록" → "관리자 검토 대기", chip "배터리 · L19M3PF7" ✅; `/catalog/parts` → `/dashboard` ✅ ·
MANAGER: approval card "1 / 1건 응답" ✅; changed to 판단불가 → "0 / 1건 응답 … (선택 사항)", evidence retracted ("응답 변경") ✅; 최종 승인 succeeded ✅; afterwards "읽기 전용", no answer button ✅ ·
ADMIN: answer after approval (조건부 "방열판 간섭") → "조건부 · 검증됨 (조건부 1 · 문서 1)" ✅; evidence history shows kind, person, date, "접수 20260927-001" (no customer data) ✅;
철회 without reason refused, with reason → counts "조건부 1" ✅; 관리자 조정 without reason refused; with reason → 비호환, still 검증됨 ✅; sibling spec "SN740 512GB" in the group → candidate row ✅.
No console errors.

Not covered by E2E (pgTAP only): board-based (IC) specs, variant targets, EXPERT_REPAIR / RECEPTION / CS refusals, ticket-link-wins rule, optimistic rollback on a server error
(client validation prevented the error paths that were tried; the rollback code path is the same pattern as Phase 2's lists).

## Rollback

App first (`git revert <phase-3 commit>`), then `supabase/test-fixtures/phase3/rollback.sql`:

```sql
BEGIN;
DROP VIEW IF EXISTS public.compatibility_summary;
DROP FUNCTION IF EXISTS public.part_spec_search(text, integer);
DROP FUNCTION IF EXISTS public.part_spec_create(text, text, text, text);
DROP FUNCTION IF EXISTS public.retract_compatibility_evidence(uuid, text);
DROP FUNCTION IF EXISTS public.record_part_install_result(uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.record_compatibility_result(uuid, text, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.ri_compatibility_row(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.ri_recompute_compatibility(uuid);
ALTER TABLE public.ticket_removed_parts DROP COLUMN IF EXISTS part_spec_id;
ALTER TABLE public.inventory_items      DROP COLUMN IF EXISTS part_spec_id;
DROP TABLE IF EXISTS public.compatibility_evidence, public.part_compatibility,
  public.part_number_aliases, public.part_specs, public.interchange_groups;
DROP FUNCTION IF EXISTS public.part_set_updated_at();
COMMIT;
```

**Verified locally 2026-10-02** on the database that still held the E2E data (specs, evidence, a linked stock row, a removed part with a spec):
afterwards 0 Phase 3 relations, 0 `part_spec_id` columns, stock rows intact (6), Phase 2 column grants on `ticket_removed_parts` intact (9),
every function hash and the `repair_parts_used` definition identical to the pre-Phase-3 snapshot; then `db reset` ×2 + 351 tests PASS.
All part-spec / compatibility knowledge is lost on rollback; nothing else changes.

## Deployment (Brad)

1. Phases 0.5, 1, 2 are still pending in production; apply in order (0.5 → 1 → 2 → 3).
2. **Migration first** (`npx supabase db push`, or SQL editor). The old app ignores the new objects.
3. **Then the app.** The new ticket page reads `part_specs`, `compatibility_evidence`, `compatibility_summary` and the new column on `ticket_removed_parts`.
4. Verify (read-only): `select count(*) from part_specs` → 0;
   `select proacl from pg_proc where proname in ('ri_recompute_compatibility','ri_compatibility_row')` → only `postgres`;
   `select count(*) from information_schema.columns where column_name = 'part_spec_id' and table_schema = 'public'` → 2.

## How Brad verifies locally

`npx supabase db reset` → `npx supabase test db` (351 pass) → `npm run typecheck && npm run lint && npm run build` →
dev server against the local stack: `admin@example.test` → 기기 마스터 → "부품 규격" / "재고 연결"; `tech@example.test` → ticket `…d000-000000000005` → 수리 기록 → "사용 부품" → "호환 확인".

## Known risks / notes

- **Production starts empty** (no part specs, catalog almost empty): most answers need the inline spec registration and the target picker. Staff-created specs are flagged "검토 필요"; there is no merge tool.
- **"호환 기준" of a spec** (모델/변형 ↔ 메인보드) is locked in the UI once the spec has compatibility rows, but not by a DB constraint (ADMIN could change it through the API).
- Linking a stock row ("재고 연결") updates `inventory_items` → its `updated_at` changes (existing trigger). Quantity, price and transactions are not touched.
- One answer per material line, not per unit. `part_spec_id` on a stock row is only the default — the evidence stores the spec the person confirms.
- Free text (notes, references, limitation notes) is visible to all staff — hint only, nothing enforces "no customer data".
- A ticket with evidence can no longer be hard-deleted (RESTRICT, same rule as Phase 2 repair data). Deleting a material row keeps its evidence (link set to NULL).
- Contradicting results show as "조건부 — 상반된 결과 …" until an admin retracts the wrong evidence or adds an override.
- The Phase 2 fixture dumps (`supabase/test-fixtures/phase2_flow/*.json`) are static captures; a re-capture would show the extra `part_spec_id` key on item rows.
- Still open from Phase 2: decision 6 (all EXPERT_REPAIR regardless of assignment?), KI-9, KI-10.
