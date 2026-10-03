# Repair Intelligence — Final Release Plan (production)

Status: **skeleton** — created 2026-10-03 (Phase 0.6). Completed and executed by Brad after Phase 10.
Claude never applies anything to production (R3, R7); this document is Brad's checklist.

## 1. Principle

- Repair Intelligence goes to production in **one release** after Phase 10. There are no per-phase hotfixes.
  The Phase 0.6 standalone application was cancelled (KI-8 §8.3: the REST path is not affected).
- Migrations are applied **in file (timestamp) order** from `supabase/migrations/`; that order *is* the release order.
- Each phase report has its own "Deployment (Brad)" notes. This plan collects the order and the cross-phase checks.

## 2. Migration order

Production today = `20260927141005_baseline.sql` (Phase 0.1). To be applied, in this order:

| # | File | Phase | Notes |
| --- | --- | --- | --- |
| 1 | `20260928043331_fix_purchase_approval.sql` | 0.5 | purchase branch of `approve_material_dispatch` |
| 2 | `20260928043332_api_guard_baseline.sql` | **0.6a** | guard helpers; guards / grants on the 8 baseline functions. Its `approve_material_dispatch` body = **Phase 0.5 body** + one guard line → must run **after #1** |
| 3 | `20260928102040_device_catalog.sql` | 1 | |
| 4 | `20261001134000_repair_records.sql` | 2 | |
| 5 | `20261001134100_inventory_flow_rpcs.sql` | 2 | |
| 6 | `20261001221915_part_compatibility.sql` | 3 | |
| 7 | `20261003054457_donor_devices.sql` | 4 | |
| 8 | `20261003062351_device_knowledge.sql` | 5 | |
| 9 | `20261003064945_purchase_guard.sql` | 6 | |
| 10 | `20261003121512_physical_tracking.sql` | 7 | existing items receive `P-` label codes |
| 11 | `20261003141631_api_guard_ri.sql` | **0.6b** | guards / grants on the 42 Phase 1–7 functions → must run **after #3–#10** |
| 12 | `20261004090000_vector_integration.sql` | 8 | role `vector_agent` (**NOLOGIN**), schema `vector_api`, `ai_candidates`, review RPCs. Uses the 0.6a guard helper → after #2. Then app, then the activation steps in `vector-integration.md` §1 (password, `temp_file_limit` via Supabase support, n8n) |
| 13+ | Phase 9 – 10 migrations | 9–10 | to be added by those phases |

**App:** deploy the app **after** the migrations (each report explains why the old app keeps working in between). Run `npm install` (e.g. `qrcode`, Phase 7).

## 3. Rehearsal (before production — on a throw-away project or Supabase branch, never on production)

1. Restore a **schema-only** dump of production (Brad) and apply #1 … #N with `supabase db push` (or SQL editor in the same order).
2. **0.6a check (Phase 0.6):**
   - after #2, `pg_get_functiondef('public.approve_material_dispatch(uuid,uuid)'::regprocedure)` must equal the definition right after #1, with exactly one inserted line `PERFORM public.ri_api_guard_definer('{anon,authenticated}');` after `BEGIN`;
   - the same for the other 7 functions of #2, compared with the production definitions (`supabase/test-fixtures/phase0.6/functions_before.sql` holds the local before-definitions; line endings may differ by `\r` only).
3. **R10 invariant:** no function in `public` / `graphql_public` lacks EXECUTE for `anon`, `authenticated` or `service_role`:
   ```sql
   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','graphql_public')
      and (not has_function_privilege('anon', p.oid, 'EXECUTE')
        or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE'));   -- expect 0 rows
   ```
4. pgTAP suite (`npx supabase test db` against the rehearsal DB, if possible) and each phase's verification queries.
5. App smoke test against the rehearsal project: dispatch / purchase approval, refund request → approve → complete, material cost, label scan, part lookup.
6. Rollback rehearsal: per-phase `supabase/test-fixtures/phase*/rollback.sql` in **reverse** order.

## 4. Production release (Brad)

1. Announce a short maintenance window; stop the n8n inventory webhook temporarily (optional).
2. Apply the migrations of §2 in order.
3. Run the R10 invariant query (§3-3) and the per-phase read-only verification queries.
4. Deploy the app.
5. Smoke test as in §3-5 with real accounts.

## 5. Operator caution until the release (KI-8)

Until 0.6a / 0.6b are in production: **do not call functions through "Run as role" (impersonation) in the production SQL Editor.**
A privilege error in such a session restarts the whole database. Plain SQL as `postgres` is not affected.

## 6. Open items to fill in before the release

- Phase 9 – 10 rows in §2. (Phase 8: row 12.)
- Exposed schemas confirmed by Brad in the dashboard (Phase 0.6 decision 8 — implemented for `public, graphql_public`).
- KI-9, KI-10, KI-11 decisions (not part of the release unless planned).
