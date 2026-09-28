# Phase 0.5 — Purchase approval bug fix — REPORT

Executed 2026-09-28 on branch `feat/repair-intelligence` (plan: `phase-0.5-plan.md`, approved incl. the
temporary `.env.development.local`). Local only — **production untouched** (no queries needed this phase).

## Result

| Requirement | Result |
| --- | --- |
| Purchase approval: no stock deduction | ✅ pgTAP 7b/8b + E2E (stock 0 → 0) |
| Purchase approval: no inventory transaction (neither RPC nor app fallback) | ✅ pgTAP 7b/8b + E2E (0 rows) |
| Dispatch approval identical to before | ✅ pgTAP old-vs-new cases 1–6 (13 assertions) + E2E |
| Function privileges / definition unchanged | ✅ pgTAP 10a–c, 11 |
| typecheck / lint / build | ✅ 0 errors / 0 errors (16 pre-existing warnings) / success |
| Generated types | unchanged (signature unchanged) |

## Changes

| File | Change |
| --- | --- |
| `supabase/migrations/20260928043331_fix_purchase_approval.sql` | `CREATE OR REPLACE approve_material_dispatch`: reads `request_type`; purchase → set `approved` and return. Dispatch path copied verbatim from the baseline. Comment updated; ACL restated (PUBLIC/anon/authenticated revoked, service_role granted — same as production). |
| `src/app/(admin)/tickets/actions.ts` | `approveMaterialDispatchAction`: OUTBOUND fallback block wrapped in `if (mat.request_type !== "purchase")`. Nothing else changed. |
| `supabase/tests/approve_material_dispatch.test.sql` | New pgTAP test (24 assertions). |
| Docs | `known-issues.md` KI-4, `02-roadmap.md`, plan status, this report. |

## Tests

### A. pgTAP — `npx supabase test db` → **PASS, 24/24**

The pre-fix function is recreated verbatim as `pg_temp.approve_old` (checked with `diff` against
baseline lines 389–458: identical). Each case builds two identical fixtures and runs old vs new.

| Cases | Assertions | Result |
| --- | --- | --- |
| Dispatch: enough stock, legacy `pending`, no stock, stock < qty, status approved / cancelled / rejected / cancel_requested, unknown id, no requester | 13 (incl. "old = new" on result JSON, stock, status, transaction rows) | ✅ identical |
| Purchase: old failed with `재고 부족` at stock 0 and deducted stock at stock 5 (bug documented); new approves with stock unchanged and 0 transactions (stock 0 and 5, legacy pending); already-approved purchase → same error as before | 7 | ✅ |
| `anon`/`authenticated` cannot execute, `service_role` can; SECURITY DEFINER, no proconfig | 4 | ✅ |

### B. E2E on the local stack (dev server → local DB, seed account `admin@example.test`)

| Action (dashboard widget) | DB after | 
| --- | --- |
| "구매 승인" — 16GB RAM, stock 0 | status `approved`; stock **0** (unchanged); inventory transactions for the item **0**; ticket `material_cost` 0 → 90,000; log "시스템: 자재 구매가 승인되었습니다. (RAM / 노트북용 DDR4 / 삼성 DDR4-3200 / 16GB)" |
| "출고 승인" — 512GB SSD, stock 2 | status `approved`; stock **1**; exactly **1** OUTBOUND (qty 1, user = requesting technician, "자재 출고 승인"); `material_cost` 170,000; log "시스템: 자재 출고가 승인되었습니다. (…)" |

Ticket detail page shows both lines as "승인완료" (purchase line tagged "구매"). No server errors, no console errors.

Cleanup: dev server stopped, **`.env.development.local` deleted** (only `.env.local` / `.env.local.example` remain),
local DB reset to seed, tests re-run (PASS).

## Observation (existing behaviour, not changed)

On the ticket detail page, an approved **purchase** line now also shows "+ 적출품 등록" and counts toward the
warning "출고된 실물 자재 중 N건의 적출품이 아직 등록되지 않았습니다" (`TicketDetailForm.tsx`, which excludes
only spec `외주`). This path was unreachable before because purchases could never be approved. It is
arguably correct (a purchased part replaces a removed one), but Brad may want to confirm it — relevant to
Phase 2 (removed parts).

## Deployment (Brad)

1. **Deploy the app first** (Vercel) — with the old RPC still live nothing changes for users.
2. **Then apply the migration** to production:
   - after the Phase 0.1 history repair: `npx supabase db push` (applies `20260928043331_fix_purchase_approval.sql`), or
   - SQL editor: run the file's contents.
3. Verify in production (read-only): `SELECT pg_get_functiondef('public.approve_material_dispatch(uuid,uuid)'::regprocedure);`
   contains `v_request_type`, and
   `SELECT proacl FROM pg_proc WHERE oid = 'public.approve_material_dispatch(uuid,uuid)'::regprocedure;`
   is still `{postgres=X/postgres,service_role=X/postgres}`.

Rollback: SQL in `phase-0.5-plan.md` → Rollback; app via `git revert`.

## Risks

- Deploy order (see above). Production currently has no waiting purchase requests.
- A purchase created while stock > 0 no longer deducts stock — intended meaning of "purchase".
