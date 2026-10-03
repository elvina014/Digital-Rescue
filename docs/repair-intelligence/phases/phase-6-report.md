# Phase 6 — Purchase guard (구매 요청 전 내부 자원 확인) — REPORT

Executed 2026-10-03 on branch `feat/repair-intelligence` (plan: `phase-6-plan.md`, APPROVED 2026-10-03 with decisions 1–8).
Local Docker Supabase only. **Production was not touched**: no production query was run in this phase.

## Result

| Acceptance / requirement | Result |
| --- | --- |
| Purchase flow still works | ✅ Flag OFF: TECHNICIAN "자재구매요청" behaves as before (no dialog, same log, no guard log; E2E + pgTAP). Flag ON: request → MANAGER "구매 승인" → `approved`, stock unchanged (0), no inventory transaction (E2E + pgTAP) |
| Bypass without reason impossible when resources exist | ✅ RPC refuses with "내부 자원이 있습니다. 구매 사유를 선택해 주세요." and writes nothing. With the flag ON, the trigger refuses every other way to set a purchase to `requested`, tested via pgTAP: owner, service_role, MANAGER through RLS, TECHNICIAN INSERT of an already-requested row, dispatch → purchase type switch. The app action returns "구매 사유 확인이 필요합니다." |
| Resource rules 1–6 (decision 8) | ✅ pgTAP `results_eq`: exactly 6 expected rows. Duplicates are listed once under the first matching rule. Every negative case is excluded: other capacity, rank-3 spec, other part type, qty 0, `외주`, FAULTY, other category, REQUESTED candidate without a spec, scrapped donor, test donor. Rule 1 (item restocked) is tested separately |
| Reason codes, 기타 text | ✅ pgTAP + E2E. No reason → "구매 사유를 선택해 주세요." 기타 without text → "기타 사유를 입력해 주세요." Unknown code and notes over 500 chars are refused. 납기 → logged with a resource snapshot |
| 0 resources / `외주` (decision 6) | ✅ 0 resources → request without a reason, logged with `resource_count 0`. `외주` → "외주 품목은 확인 대상이 아닙니다.", requested, not logged |
| Roles (decision 3) | ✅ ADMIN and MANAGER allowed. TECHNICIAN and EXPERT_REPAIR allowed only when assigned to the ticket. RECEPTION, CS and unassigned staff → "구매 요청 권한이 없습니다." |
| Report ADMIN only (decision 5) | ✅ RLS: only ADMIN reads `purchase_guard_logs`. MANAGER, TECHNICIAN and CS read 0 rows. Nobody can INSERT, UPDATE or DELETE directly; anon has no access. E2E: menu shown to ADMIN only; MANAGER and TECHNICIAN are redirected to `/dashboard` |
| No selection hint (decision 7) | ✅ `EstimateCard` and `AddMaterialCard` unchanged |
| No prices / customer data | ✅ pgTAP: check result has no price, `base_estimate`, `final_price` or customer keys or values. The report shows receipt no., item, resources, reason and requester only |
| Existing objects unchanged | ✅ Snapshot of md5 + ACL of every public function, every view, every policy incl. storage, every trigger and every column, before and after. Diff contains only additions: 1 column, 1 table, 5 functions, 1 policy, 1 trigger. After the rollback rehearsal the snapshot is identical to before |
| pgTAP | ✅ **606/606** (existing 535 + Phase 6: 71) |
| `db reset` twice | ✅ |
| typecheck / lint / build | ✅ 0 errors / 0 errors (16 warnings, all pre-existing) / success |
| Advisors (`db advisors --local --type all --level info`) | ✅ No new WARN or ERROR. New: 2 INFO `unused_index` on the fresh `purchase_guard_logs` indexes. The 14 WARNs are the pre-existing list |
| Types | ✅ `npm run db:types` regenerated |
| Rollback rehearsal | ✅ See Rollback |

## Decisions applied (Brad, 2026-10-03)

1. Local Docker
2. Guard at "자재구매요청"
3. Requesters: ADMIN / MANAGER / assigned TECHNICIAN·EXPERT_REPAIR
4. **DB trigger included**
5. **Report ADMIN only**
6. `외주` not guarded; 0 resources logged without a reason
7. **No selection hint**
8. Rules 1–6 as proposed

## Changes

### Database — `supabase/migrations/20261003064945_purchase_guard.sql`

- `global_settings.ri_purchase_guard_enabled` boolean, default `false`.
- Table `purchase_guard_logs`:
  - RLS on: SELECT for ADMIN only; no write policy; anon revoked; INSERT / UPDATE / DELETE / TRUNCATE revoked from `authenticated`.
  - Constraints: one row per material; reason required when resources exist; `OTHER` requires text.
  - Indexes on ticket, requester, `created_at` and reason.
- `ri_purchase_resources(material)`: internal, no API grant. Applies rules 1–6. Reads `search_parts_for_device` (Phase 5) for rank-1/2 compatible specs.
- `ri_purchase_material_info(material, lock)`: internal, no API grant. Returns material info and checks the caller role.
- `purchase_guard_check(material)`: **SECURITY DEFINER**, read-only. Feeds the dialog.
- `request_purchase_material(material, reason, note)`: **SECURITY DEFINER**, one transaction:
  1. row lock;
  2. role / type / status / flag checks;
  3. resources recomputed on the server;
  4. reason validation;
  5. log insert;
  6. `pending → requested` under a transaction-local `app.purchase_guard = on`.
- Trigger `trg_ticket_materials_purchase_guard`: `BEFORE INSERT OR UPDATE OF request_status, request_type` on `ticket_materials`, function `ri_purchase_guard_enforce()`. It returns immediately while the flag is OFF.
- Privileges and settings:
  - All 5 functions set `search_path = public`.
  - EXECUTE is revoked from PUBLIC / anon / authenticated on all 5.
  - Only the two public RPCs are granted back to `authenticated`.

**No existing column, function, policy, view or trigger was altered.** The one addition to an existing table is the new trigger (decision 4).

### Application

| File | Change |
| --- | --- |
| `src/app/(admin)/tickets/purchaseGuardActions.ts` (new) | Session-client actions for the two RPCs. Writes the ticket log as before, with the guard result appended: "— 내부 자원 n건, 사유: 납기" or "— 내부 자원 없음" |
| `src/app/(admin)/tickets/[id]/PurchaseGuardDialog.tsx` (new) | Dialog with stock and Donor groups, reason chips, 기타 text and Korean validation. Updates optimistically and rolls back on error. Reloads the resource list when the server reports new resources |
| `src/app/(admin)/inventory/purchase-guard/{page,PurchaseGuardReport}.tsx` (new) | Report "구매 사유 보고서". Filters: period (7 / 30 / 90 / 365 days) and reason (incl. "사유 없음"). Summary: total, with resources (%), per reason, per source. Table: receipt-no. link, item, resources (expandable), reason, requester, current status |
| `src/components/purchase-guard/labels.ts` (new) | Korean labels |
| `src/app/(admin)/tickets/actions.ts` | `requestMaterialDispatchAction`: for purchase rows, if the flag is ON → "구매 사유 확인이 필요합니다." (+9 lines). Flag OFF and dispatch paths unchanged |
| `src/app/(admin)/tickets/[id]/TicketDetailForm.tsx` | Prop `purchaseGuardEnabled`. The purchase button opens the dialog when ON (+25 lines) |
| `src/app/(admin)/tickets/[id]/page.tsx` | Reads the flag and passes it down (separate query; the existing settings select is unchanged) |
| `RepairGateSettingsCard.tsx`, `inventory/settings/page.tsx`, `inventoryActions.ts` | Third toggle "구매 요청 시 내부 자원 확인". Heading changed to "수리 기록 · 구매 요청 필수 확인" |
| `src/components/layout/AdminSidebar.tsx` | Menu "구매 사유 보고서" (ADMIN) |
| `src/types/supabase.ts` | Regenerated |

### Tests / fixtures

`supabase/tests/purchase_guard.test.sql` (71 assertions), `supabase/test-fixtures/phase6/rollback.sql`.

## Deviations from the plan

| Plan | Done | Why |
| --- | --- | --- |
| Role check inside both public functions | Shared internal helper `ri_purchase_material_info()` (no API grant) | One copy of the role / item-label logic. The rollback SQL in the plan and the fixture was extended by one line |
| Trigger `BEFORE INSERT OR UPDATE OF request_status` | `… OF request_status, request_type` | Otherwise a requested **dispatch** row could be switched to purchase without the guard. Covered by pgTAP |
| Rule 5 "same or compatible spec" | Includes candidates in status `REQUESTED` (extraction already requested); rule 6 is `AVAILABLE` only | Same set as `donor_potential_stock` for spec matches. A same-device match without a spec is weaker, so it stays strict |
| E2E screenshots | None — verified by page text, DOM state and DB queries | The app pane was hidden (viewport 0×0), as in Phases 4–5. Forms were driven through DOM events |

## E2E (local stack, seed accounts, temporary `.env.development.local` — **deleted afterwards**)

Fixture data: the pgTAP fixture block, loaded by SQL and removed by `db reset`.

1. **TECHNICIAN, flag OFF:** "자재구매요청" on the 16GB RAM → "구매요청중" with no dialog. Log is unchanged. `purchase_guard_logs` = 0 ✅
2. **ADMIN:** 재고 분류 설정 → "구매 요청 시 내부 자원 확인" → 켜짐 (DB `t`; the other two flags stay `f`). Menu shows "구매 사유 보고서" ✅
3. **TECHNICIAN, panel purchase on ticket d…09:** dialog lists 재고 3 (같은 제품·용량 / 같은 부품 규격 / 호환 확인된 규격) and Donor 3 (D-0009 · 선반 B).
   - Submit without a reason → "구매 사유를 선택해 주세요."
   - 기타 without text → "기타 사유를 입력해 주세요."
   - 납기 → "구매요청중"; log "… — 내부 자원 6건, 사유: 납기" ✅
4. **TECHNICIAN, 외주 item** → "외주 품목은 확인 대상이 아닙니다." → requested, not logged ✅
5. **TECHNICIAN, 16GB RAM on ticket d…04** → "내부 재고·Donor에서 대체 가능한 자원이 없습니다." → requested; log "— 내부 자원 없음" ✅
6. **TECHNICIAN:** no report menu; `/inventory/purchase-guard` → `/dashboard` ✅
7. **MANAGER:** no report menu, redirected. Dashboard "구매 승인" on the guarded panel → `approved`, stock 0, transactions unchanged (9) ✅
8. **ADMIN report:** 2건, 1건 (50%) with resources, 납기 1건, source breakdown, both rows with receipt no. / status (요청중, 승인). Filters: 납기 → 1, 사유 없음 → 1, 기타 (7일) → 0; invalid parameters fall back to 30 days / all ✅

No console errors and no server errors.

Not covered by E2E (pgTAP only): the reload when stock arrives between opening the dialog and submitting; EXPERT_REPAIR and CS in the UI (same guard code path as the tested roles).

## Rollback

App first (`git revert <phase-6 commit>`), then `supabase/test-fixtures/phase6/rollback.sql`:

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_ticket_materials_purchase_guard ON public.ticket_materials;
DROP FUNCTION IF EXISTS public.ri_purchase_guard_enforce();
DROP FUNCTION IF EXISTS public.request_purchase_material(uuid, text, text);
DROP FUNCTION IF EXISTS public.purchase_guard_check(uuid);
DROP FUNCTION IF EXISTS public.ri_purchase_material_info(uuid, boolean);
DROP FUNCTION IF EXISTS public.ri_purchase_resources(uuid);
DROP TABLE IF EXISTS public.purchase_guard_logs;
ALTER TABLE public.global_settings DROP COLUMN IF EXISTS ri_purchase_guard_enabled;
COMMIT;
```

**Verified locally 2026-10-03** on the database that still held the E2E data (2 logs, 4 guarded requests):
- the object snapshot (functions + ACLs, views, policies incl. storage, triggers, columns) is identical to the pre-Phase-6 snapshot;
- all `ticket_materials` rows and statuses are unchanged.

Then `db reset` ×2 and 606 tests PASS. Only the purchase reason logs are lost on rollback.

## Deployment (Brad)

1. Phases 0.5–5 are still pending in production. Apply in order (0.5 → 1 → 2 → 3 → 4 → 5 → 6). Phase 6 depends on Phase 5 (`search_parts_for_device`) and Phase 0.5.
2. **Migration first** (`npx supabase db push`, or the SQL editor). The flag is OFF and the trigger is a no-op, so the old app keeps working.
3. **Then the app.**
4. Turn the flag on in 재고 분류 설정 only after staff are trained (P10).
5. Verify (read-only):
   - `select ri_purchase_guard_enabled from global_settings` → `f`;
   - `select proname, prosecdef, proacl from pg_proc where proname in ('purchase_guard_check','request_purchase_material','ri_purchase_resources','ri_purchase_material_info','ri_purchase_guard_enforce')` → definer only for the first two; `authenticated` only on those two; no `anon` anywhere.

## How Brad verifies locally

1. `npx supabase db reset` → `npx supabase test db` (606 pass) → `npm run typecheck && npm run lint && npm run build`.
2. For sample data, run the fixture block of `supabase/tests/purchase_guard.test.sql` (from "fixtures (as owner)" up to section 1, without the `res` inserts) as `postgres`.
3. Run the dev server against the local stack (`NEXT_PUBLIC_SITE_DOMAIN` empty, open `http://login.localhost:3000`):
   - `admin@example.test`: turn the flag on in 재고 분류 설정.
   - `tech@example.test`: open ticket `20260927-001` (d…09) → "자재구매요청" on the panel.
   - `admin@example.test`: open "구매 사유 보고서".

## Known risks / notes

- **Little to find at first in production.** Part-spec links, 표준 모델 links and donors are mostly empty, so rules 3–6 rarely fire. Rules 1–2 (same item / same product + capacity) work immediately.
- **Rule 2 lists USED stock when NEW is requested.** That is intended: the reasons "고객 신품요청" / "내부재고 불량" exist for it.
- **New trigger on `ticket_materials`.** While the flag is ON, any future code that sets a purchase to `requested` must go through `request_purchase_material`. Today there is exactly one such path.
- **MANAGER cannot see the report** (decision 5). The ticket log line still shows each reason on the ticket.
- `requestMaterialDispatchAction` still has no role check for dispatch requests, or for purchases while the flag is OFF. This is existing behaviour and was deliberately not widened.
- Pending purchases created before the flag is turned on are guarded when they are requested. Purchases already `requested` are untouched.
- **Still open from earlier phases:**
  - Phase 2 decision 6: should all EXPERT_REPAIR staff count, regardless of assignment?
  - KI-9 and KI-10.
