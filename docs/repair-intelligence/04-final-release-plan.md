# Repair Intelligence — Final Release Plan (production)

Status: **release-ready draft** — 2026-10-04 (release preparation session). The release covers **Phases 0.5 – 9**.
Phase 10 is **after** the release, with its own per-phase deployment once real repair data exists (`02-roadmap.md`).
Claude never applies anything to production (R3, R7); this document is Brad's plan. The executable, step-by-step version is
`release/release-runbook.md`; the manual test list is `release/regression-checklist.md`; rehearsal results: `release/rehearsal-report.md`.
Updated 2026-10-04 (second pass): principle "backup first, instant rollback", stage-0 backups, rollback levels L1 / L2 / L3,
mandatory rehearsal items (a)–(d) with a first local run, public homepage in scope, Preview domain and cookie notes, staff notice.

## 0. Preconditions checked (2026-10-04, production SELECT only)

| Check | Result |
| --- | --- |
| `supabase_migrations.schema_migrations` on production | exactly **1 row**: `20260927141005 baseline` (495 statements) → KI-6 repair is in place, `db push` will see 14 pending files |
| Repair Intelligence objects on production | none: 0 of the RI tables, no `vector_agent`, no `vector_api`, no guard helpers, no `pg_trgm`; `approve_material_dispatch` = pre-0.5 body; buckets `ticket-images`, `page-content-images` only |
| Size of the tables the migrations touch | `repair_tickets` 518, `inventory_items` 31 rows → the `ALTER TABLE`s lock for milliseconds |
| `ticket_materials` purchase rows | only `purchase / cancelled` × 1 → **no purchase request is waiting for approval** (relevant to §2.2 A) |
| `main` vs `feat/repair-intelligence` | `main` = `7d237f6` = merge base → the PR has no conflicts. Brad confirms in Vercel that production runs `7d237f6` (runbook stage 0) |
| Branch | every phase report 0.1 – 9 (incl. 0.5, 0.6, 0.6.1) and every migration file is committed on `feat/repair-intelligence` |
| Supabase plan (Management API, read-only) | organisation plan **free** → **no dashboard backups, no PITR**. The stage-0 `db dump` files are the only database backup (runbook 0.2-3 / 0.2-4) |
| Vercel environment variables (Brad, 2026-10-04) | Supabase variables are set for **All Environments** → the Preview uses the **production** database |
| Same Vercel project serves the public site | yes — `src/proxy.ts` routes by host: apex → `(main)` (home `/`, 14 brand landing pages `/[brand]`, intake form), `login.` → admin, `edit.` → CMS. The merge redeploys the public site too (§3.5) |

## 1. Principle

- **Backup first, instant rollback (decision 2026-10-04).** Nothing is applied to production before the stage-0 backups exist and are verified
  (Git tag `pre-ri-release`, recorded Vercel production deployment, three `db dump` files outside the repository with row counts checked against production,
  Vercel variable names, n8n workflow exports, Cloudflare DNS export — runbook 0.2). Every stage has a way back, in three levels (§5.3):
  **L1** app only (Vercel Instant Rollback, seconds), **L2** schema (`supabase/rollback/ri-full-rollback.sql`, RI data exported first),
  **L3** restore from the stage-0 dumps (loses all production data written after the dump — last resort).
- One release for Phases 0.5 – 9. No per-phase hotfixes (the Phase 0.6 standalone application was cancelled, KI-8 §8.3).
- Migrations are applied **in file (timestamp) order** from `supabase/migrations/`; that order *is* the release order.
- **Order of the release (decision 2026-10-04): migrations first → PR → Preview tested against production data → merge to `main`.**
  This reverses the "app first" note of the Phase 0.5 report: it is safe because every migration keeps the old app working (§2.2),
  and it lets the new app be tested on the Preview against the real schema and data before production users see it.
- Each phase report has its own "Deployment (Brad)" notes. This plan collects the order and the cross-phase checks.

## 2. Migrations

### 2.1 Full ordered list (all 14 are applied, in this order)

Production today = `20260927141005_baseline.sql` (Phase 0.1).

| # | File | Phase | Notes |
| --- | --- | --- | --- |
| 1 | `20260928043331_fix_purchase_approval.sql` | 0.5 | purchase branch of `approve_material_dispatch` |
| 2 | `20260928043332_api_guard_baseline.sql` | **0.6a** | guard helpers; guards / grants on the 8 baseline functions. Its `approve_material_dispatch` body = **Phase 0.5 body** + one guard line → must run **after #1** |
| 3 | `20260928102040_device_catalog.sql` | 1 | `CREATE EXTENSION pg_trgm` (schema `extensions`) |
| 4 | `20261001134000_repair_records.sql` | 2 | |
| 5 | `20261001134100_inventory_flow_rpcs.sql` | 2 | |
| 6 | `20261001221915_part_compatibility.sql` | 3 | |
| 7 | `20261003054457_donor_devices.sql` | 4 | private bucket `donor-photos` + 3 storage policies |
| 8 | `20261003062351_device_knowledge.sql` | 5 | |
| 9 | `20261003064945_purchase_guard.sql` | 6 | |
| 10 | `20261003121512_physical_tracking.sql` | 7 | existing items receive `P-` label codes |
| 11 | `20261003141631_api_guard_ri.sql` | **0.6b** | guards / grants on the 42 Phase 1–7 functions → must run **after #3–#10** |
| 12 | `20261004090000_vector_integration.sql` | 8 | role `vector_agent` (**NOLOGIN**), schema `vector_api`, `ai_candidates`, review RPCs. Uses the 0.6a guard helper → after #2. Activation is a separate post-release step (§8.4) |
| 13 | `20261004100000_ki14_ai_candidates_result_delete.sql` | 9 (D5) | **KI-14** fix: `ai_candidates_protect` allows the FK `SET NULL` of `result_alias_id`. After #12 |
| 14 | `20261004110000_ai_photo_recognition.sql` | 9 | `ai_photo_requests`, `ai_photo_propose`, private bucket `ai-photos` + 3 storage policies; changes Phase 8 objects E1–E10 (`phases/phase-9-report.md`) → after #12 and #13 |

Phase 10 is not in this list (after the release, per-phase deployment).

**App:** the new app reaches production only through the merge to `main` (§3), after the migrations. `npm install` happens in the Vercel build (`qrcode`, Phase 7).

### 2.2 Migrations that CHANGE existing objects' behaviour — the old-app window

**The window** = from `db push` until the merge to `main` is live on production (runbook stages 3 → 6; it includes the whole Preview test).
In the window the **old app** (`main` @ `7d237f6`) serves all staff against the **new** database, and the Preview (new app) writes to the same database.

Migrations that only **add** objects the old app never references (#4 tables, #5, #6, #8, #11, #12, #13, #14 and the new tables of #3, #7, #9, #10)
cannot change old-app behaviour and are not listed. The remaining ones:

| | Migration | Existing object changed | What changes | What can go wrong with the old app in the window | How to minimise |
| --- | --- | --- | --- | --- | --- |
| **A** | #1 `fix_purchase_approval` (0.5) | `approve_material_dispatch` | purchase requests are approved **without** stock check / deduction / OUTBOUND. Dispatch path byte-identical | Old `approveMaterialDispatchAction` has an app-side "fallback OUTBOUND" insert. For a **purchase** approval the RPC now succeeds and writes no OUTBOUND, so the old app inserts a **fake OUTBOUND** row ("자재 출고 승인", qty of the request) into `inventory_transactions`. Stock quantity is **not** changed (only the history shows an outflow that did not happen). Dispatch approvals are unaffected | (1) **No "구매 승인" in the window** — tell ADMIN / MANAGER. Today purchase approval always fails ("재고 부족") and 0 purchases are waiting, so nothing is lost by waiting. (2) Keep the window short. (3) After the merge, run the detection query in runbook stage 6 (OUTBOUND rows of purchase materials approved in the window). If rows are found, Brad decides; there is no UPDATE/DELETE policy on `inventory_transactions` and Claude does not change it (R9) |
| **B** | #2 `api_guard_baseline` (0.6a) | `approve_material_dispatch`, `apply_refund_material_adjustments`, `recalc_ticket_material_cost`, `request_refund`, `transition_refund` + 3 trigger functions | one guard line; EXECUTE granted to the hint roles. Allowed callers: byte-identical behaviour. Refused callers: same HTTP status, new message | None for staff: the old app calls each function as an allowed role (service_role for `approve_material_dispatch` / `recalc`; session for refunds). Only direct REST calls by refused roles get a different message | Must run after #1 (same body). Effect for operators: the KI-8 crash path closes from this moment |
| **C** | #3 `device_catalog` (1) | `repair_tickets` (+3 nullable FK columns, +trigger `trg_zz_catalog_keep_updated_at`), `protect_approved_ticket()` (Amendment A) | new GUC `app.catalog_link_sync` bypass for the 3 catalog columns only; new trigger keeps `updated_at` only while that GUC is on | None expected: the old app never sets the GUC, so both changes are no-ops; `select *` returns 3 extra NULL columns, which the old code ignores. `ALTER TABLE` takes an exclusive lock on `repair_tickets` for milliseconds (518 rows) | Apply outside business hours; a ticket save that collides with the lock just waits. KI-9 is unchanged (approved tickets still not editable) |
| **D** | #4 `repair_records` (2) | `global_settings` (+2 flags, default `false`) | approval / cancel gates exist but are OFF | None: the old app neither reads nor sets the flags; it has no toggle for them | Keep both OFF (§8.3). Only the new app can switch them |
| **E** | #6 `part_compatibility` (3) | `inventory_items` (+`part_spec_id` nullable) | new nullable column | None (old app ignores it) | — |
| **F** | #9 `purchase_guard` (6) | `global_settings` (+flag, default `false`), **new trigger on `ticket_materials`** (`BEFORE INSERT OR UPDATE OF request_status, request_type`) | with the flag OFF the trigger only reads the flag and returns | With the flag OFF: none (one extra single-row read per material write). **If the flag were switched ON while the old app runs**, the old `requestMaterialDispatchAction` (plain UPDATE to `requested`) would be refused for purchases with "구매 요청은 내부 자원 확인 후에만 가능합니다." | Flag stays OFF through the window and until Brad decides after training (§8.3, P10). The toggle exists only in the new app |
| **G** | #10 `physical_tracking` (7) | `inventory_items` (+`label_code` NOT NULL UNIQUE with default `ri_next_item_label()`, +`storage_location_id`), `donor_devices` (+column), `ri_inbound_extracted_part()` (qty-1 rows) | existing 31 items get `P-` codes in a table rewrite; every new item row gets a code from the column default | (1) Old-app inserts into `inventory_items` (`addInventoryItem`, `approveReturnMaterialAction`, n8n `/api/inventory/webhook` via service_role) now also run the default → needs EXECUTE on `ri_next_item_label` for `authenticated` and `service_role` (granted by #10; verified locally). (2) The old app's extracted-part inbound is its own code, not the changed RPC: in the window extracted parts are still **merged into an existing USED row** (old behaviour), not split into qty-1 rows. The row gets one label; nothing breaks. (3) The table rewrite locks `inventory_items` for milliseconds | No inventory registration / n8n inbound during the `db push` minute (pause the n8n inventory webhook workflow, runbook stage 3). Accept merged rows created in the window (they are ordinary stock rows) |
| **H** | #7 `donor_devices` (4), #14 `ai_photo_recognition` (9) | `storage.buckets` (+1 row each), `storage.objects` (+3 policies each, all scoped to their own `bucket_id`) | new private buckets | None for `ticket-images` / `page-content-images`: the new policies match only their own bucket | — |
| **I** | #13 KI-14, #14 Phase 9 | `ai_candidates_protect()`, `ai_candidate_approve()`, `ai_candidates` constraints | Phase 8 objects, created by #12 in the same push | None: the old app does not know these objects | Order #12 → #13 → #14 (file order) |

**Mixed use (old app + Preview on the same rows).** Both apps read and write the same `ticket_materials` columns; the Phase 2 RPCs were proven equal to the
old flows on identical fixtures (Phase 2 report "Equivalence"). Preview write tests use only `[테스트]` data (§3.4), so real rows are not mixed.

**General rules for the window**
1. Keep it short: stages 3 → 6 of the runbook on **one day**, starting after business hours.
2. Announce to staff (text: runbook 3.1): **no "구매 승인" from `db push` until the merged app is live**, no inventory registration while `db push` runs,
   report anything unusual. Reproduced in rehearsal (b): the old app's purchase approval on the new DB writes one fake OUTBOUND row.
3. All flags stay OFF (`ri_approval_gate_enabled`, `ri_cancel_gate_enabled`, `ri_purchase_guard_enabled`).
4. If the old app misbehaves in the window: stop testing, do **not** merge; decide between fixing forward and L2 (§5.3).

**Old code + new DB, verified (rehearsal (b), `release/rehearsal-report.md`):** `main` @ `7d237f6` was run against baseline + all 14 migrations.
Dispatch approval, return confirmation, extracted-part inbound, disposal confirmation, final approval, refund request → approve → complete → void,
statistics, new inventory item, n8n inventory webhook, ticket create / cancel / restore: same results as before. Two expected deviations, both covered above:
A (fake OUTBOUND on purchase approval) and F (purchase request refused only if the guard flag were ON). The second run repeats this on the production dump.

## 3. Release strategy — Vercel Preview against production

Executable steps with expected outputs and stop conditions: `release/release-runbook.md`. Summary:

1. **Rehearsal** (§4) passes, drift check shows production = baseline.
2. **Migrations to production** (`npx supabase db push --linked`, after `--dry-run`), then read-only verification queries.
3. **PR** `feat/repair-intelligence` → `main` (Brad opens it; Claude does not push). Vercel builds a **Preview** deployment.
4. **Brad verifies the Preview environment variables in the Vercel dashboard** (§3.1) before using the Preview.
5. **Preview test against production data** with `release/regression-checklist.md`; writes only with `[테스트]` data (§3.4).
6. **Cleanup** of the `[테스트]` data (§3.4).
7. **Merge to `main`** → Vercel production deployment → smoke test on `login.digital-rescue.com` → post-release items (§7, §8).

### 3.1 Vercel dashboard — which Supabase does the Preview use? (Brad)

Vercel → Project → **Settings → Environment Variables**, filter **Preview** (and check for a branch-specific value for `feat/repair-intelligence`):

| Variable | Expected for this test | Note |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wnddkgeohcgcidoklrps.supabase.co` (production) | **Confirmed by Brad 2026-10-04: All Environments.** If it ever points elsewhere, the Preview does not test against production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | the production project's keys | must belong to the same project as the URL |
| `NEXT_PUBLIC_SITE_DOMAIN` | as Production (`digital-rescue.com`) | cookie domain, see §3.2 |
| `N8N_NEW_TICKET_WEBHOOK_URL` | Brad decides | if set, a `[테스트]` intake from the public form sends the usual new-ticket notification |
| `N8N_DEVICE_WEBHOOK_URL` | as Production | device-label AI fill (`EstimateCard`) |
| `N8N_RI_PHOTO_WEBHOOK_URL`, `N8N_RI_PHOTO_SECRET` | **unset** until §7 is done | unset → "AI 사진 인식이 설정되지 않았습니다." (expected) |
| `INVENTORY_WEBHOOK_API_KEY` | as Production | only used by n8n calling the production URL |
| `REVALIDATE_SECRET` | as Production | CMS |

Do not copy any value into the repository or a chat. Changing a Preview variable needs a **redeploy** of the Preview.

### 3.2 Host names on the Preview (required for admin screens)

`src/proxy.ts` serves the admin portal only on hosts that start with **`login.`** and the CMS only on **`edit.`**.
On the default `*.vercel.app` Preview URL every admin path (`/dashboard`, `/tickets`, …) is redirected to `/`; only the public site works there.

- Vercel → Settings → **Domains** → add `login.preview.digital-rescue.com` (and optionally `edit.preview.digital-rescue.com`), attached to **Preview, Git branch
  `feat/repair-intelligence`**; Cloudflare → DNS → CNAME `login.preview` → the target Vercel shows, **DNS only** (grey cloud). Exact steps: runbook 4.3.
- **Shared login cookie.** With `NEXT_PUBLIC_SITE_DOMAIN=digital-rescue.com` the cookie domain becomes `.digital-rescue.com` on the Preview as well, i.e. the same
  `sb-…-auth-token` and `dr_last_activity` cookies as production `login.digital-rescue.com`, same Supabase project. Logging in or switching the test account on
  the Preview changes the production session in the same browser; logging out ends both; activity on one keeps the other alive. Use a **dedicated browser
  profile** for the Preview only (runbook 4.4).
- QR labels encode the host of the printing page: **do not print real labels from the Preview** (Phase 7 report → Deployment 4).
- Remove the branch domain after the release (or keep it for Phase 10).

### 3.3 Deployment Protection

If Vercel Authentication protects Previews, Brad opens the Preview logged in to Vercel. Do not create a bypass token for this test.

### 3.4 `[테스트]` data on the Preview — rules and cleanup

Rules (also at the top of the regression checklist):
- Every name typed on the Preview starts with **`[테스트]`**: customer name, model / board / part-spec names, aliases, inventory product names, notes.
  Codes with a fixed format cannot carry the prefix: storage location → code **`TEST-01`** with description `[테스트]` (locations cannot be deleted or renamed → deactivate afterwards);
  symptom code → **`TEST.PREVIEW`** with label `[테스트] …`.
- Every test ticket must be `is_test = true` — statistics, dashboard, knowledge search and VECTOR exclude `is_test` tickets. The checkbox "테스트 접수입니다" exists only on the
  ADMIN / MANAGER intake form; tickets created by RECEPTION or the public form are flagged by ADMIN with "테스트로 표시" right away, **before** approval (KI-9: approved tickets cannot be changed).
  `is_test` tickets are hidden from the ticket list for every role except ADMIN / MANAGER → other roles open them by their detail URL.
- **Never dispatch real stock** to a test ticket. First register a `[테스트]` inventory item (qty 2) and use only that one.
- Do not approve AI candidates on real part specs; do not use real customer photos.
- Write down every created receipt no., `P-` / `D-` code and name in the cleanup log (checklist part 0).

Cleanup (Brad, after the Preview test, before the merge) — **first through the app**, so stock and history stay consistent:
1. Material lines of test tickets: cancel / "원복 승인" every approved dispatch of the `[테스트]` item → its quantity returns; reject open requests.
2. Test tickets: cancel (RETURN) every test ticket that is not completed. Completed test tickets stay as `is_test` (as the 109 existing test tickets do today).
3. Donor created from a test ticket → set to 폐기.
4. `[테스트]` inventory item → quantity 0 via 재고 관리 (ADJUSTMENT logged), or delete it if it has no material rows.
5. `[테스트]` catalog models / boards / aliases / part specs / symptom codes → delete in 기기 마스터 (ADMIN). If a delete is refused because it is referenced, deactivate / leave it and note it.
6. AI candidates from the test → reject (approved ones: delete the created alias in 부품 규격 — KI-14 fix makes this possible).
7. Model notes written in the test → delete. Storage location `TEST-01` → deactivate (after un-assigning it).
8. Then the read-only leftover query in runbook stage 5.4. Anything left is listed for Brad; **hard deletes in SQL are Brad's decision**, run as `postgres` in the SQL Editor
   (plain SQL, **never "Run as role"**), inside `BEGIN … ROLLBACK` first. Claude does not write production data (R3, R9).

### 3.5 Public homepage and landing pages are part of this release

The same Next.js app and Vercel project serve the public site (apex `digital-rescue.com`: home `/`, brand landing pages `/[brand]` for 14 slugs with
lower-case redirects, the intake form, news / CMS content). The merge to `main` therefore redeploys the public site. Code changes on the branch that touch it:
`src/proxy.ts` only (new admin paths blocked on the apex, server actions no longer redirected) — the `(main)` routes and the intake action are unchanged.
Regression: checklist 1-0 (Preview) and 4-0 (deployment day), first. Gap found: `/ai-photo` is not in the proxy's `ADMIN_PATHS` (KI-16).

## 4. Rehearsal (before production — local, never on production)

Details and commands: runbook stages 1–2. **Mandatory items (a)–(d)** — all four must pass before stage 3:
- **(a)** a local database built from the new production dump gets all 14 migrations;
- **(b)** the current `main` code runs against (a) → "old code + new DB" compatibility table, with the effect of 0.5 / 0.6a / 1 / 6 / 7 stated;
- **(c)** after `supabase/rollback/ri-full-rollback.sql` the schema dump equals the baseline dump;
- **(d)** the data dump restored into an empty local database gives the same row count for every table.

First run (2026-10-04, committed baseline + seed, no production data): **all four passed** — (a) 1168/1168; (b) table in `release/rehearsal-report.md`,
deviations A and F reproduced as predicted; (c) **0 lines** of schema difference, only the two empty buckets remain (dashboard delete); (d) 83/83 tables equal after
the restore, once the dump excludes `storage.buckets_vectors` / `storage.vector_indexes` (Supabase doc). The second run repeats (a)–(d) on Brad's production dump
(it puts production data into the local Docker database — Brad confirms first, reset afterwards).

Also:

1. **Drift check.** Brad dumps the production schema (schema only, no password in any file or chat). Claude checks the dump for secrets and data,
   compares it with `supabase/baseline_raw/schema.sql` (the dump the baseline was built from), and re-runs the Phase 0.1 parity catalog query
   (production via read-only MCP vs local at the baseline version; covers storage and ACLs that `pg_dump` does not show). Any unexplained difference → stop.
2. **Rehearsal on the local stack** (equivalent to production once 1 is clean): `db reset --version 20260927141005` (baseline only), then the 14 migrations in order.
3. **0.6a check:** after #2, `pg_get_functiondef('public.approve_material_dispatch(uuid,uuid)'::regprocedure)` equals the definition right after #1 plus exactly one inserted line
   `PERFORM public.ri_api_guard_definer('{anon,authenticated}');` after `BEGIN`; the same for the other 7 functions of #2 against `supabase/test-fixtures/phase0.6/functions_before.sql`
   (line endings may differ by `\r` only).
4. **R10 invariant:** no function in `public` / `graphql_public` lacks EXECUTE for `anon`, `authenticated` or `service_role`:
   ```sql
   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','graphql_public')
      and (not has_function_privilege('anon', p.oid, 'EXECUTE')
        or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE'));   -- expect 0 rows
   ```
5. pgTAP suite (`npx supabase test db`, expect 1168 pass), `node supabase/test-fixtures/phase9/workflow-check.mjs` (20/20), typecheck / lint / build.
6. Rollback rehearsal = item (c), with `supabase/rollback/ri-full-rollback.sql` (PART A export → PART B → PART C).

## 5. Production release (Brad)

### 5.1 Steps

Runbook stages 3 – 6: maintenance notice → `db push --dry-run` → `db push` → verification queries (R10 invariant, per-phase checks) → PR → Preview variables →
Preview test → cleanup → merge → production smoke test → post-release items.

### 5.2 Verification after `db push` (read-only)

- `npx supabase migration list --linked` → all 15 versions in both columns.
- R10 invariant (§4-4) → 0 rows.
- Per phase (from the reports): `approve_material_dispatch` contains `v_request_type` and `ri_api_guard_definer`; `global_settings` flags `f, f, f`;
  `count(*) = count(distinct label_code)` on `inventory_items`; buckets `donor-photos` / `ai-photos` private with 10 MB limit; `vector_agent` `rolcanlogin = false`.
  Exact queries: runbook stage 3.4.

### 5.3 Rollback — levels L1 / L2 / L3 (commands: runbook "롤백 L1 / L2 / L3")

| Level | What | When | Data loss | Time |
| --- | --- | --- | --- | --- |
| **L1** | Vercel **Instant Rollback** to the production deployment recorded in stage 0 (dashboard or `vercel rollback`). DB unchanged | any problem in the new app | none | seconds |
| **L2** | L1, then `supabase/rollback/ri-full-rollback.sql`: PART A exports every RI table / column into schema `ri_rollback_backup` (+ a `db dump --data-only -s public` file), PART B removes all 14 migrations in **one transaction**, PART C drops `vector_agent`, buckets via dashboard, `migration repair --status reverted` | the new database breaks the old app, or the release is cancelled | RI data (kept in the export only); rows RI wrote into existing tables stay (R9) | minutes |
| **L3** | restore the stage-0 dumps (roles → schema → replica mode → data) into a **new** Supabase project and point Vercel at it | the database itself is damaged and L1 / L2 do not help | **everything written to production after the dump**; storage files are not in the dump | hours |

Notes
- L1 is enough in most cases: rehearsal (b) showed the old app works on the new database. After L1 the "no purchase approval" notice applies again (§2.2 A).
- Vercel Hobby can roll back only to the **immediately previous** production deployment; after a rollback Vercel stops auto-assigning production domains until
  "Undo Rollback" / promote (runbook L1). Brad records the plan in stage 0.
- L2 order inside the script: 9 → KI-14 → 8 → 0.6b+0.6a (before the Phase 1–7 parts, it restores their bodies) → 7 → 6 → 5 → 4 → 3 → 2 → 1 → 0.5.
  Generated verbatim from the per-phase rollbacks; rehearsed as item (c).
- The Supabase project is on the Free plan: no dashboard restore, no PITR — L3 relies on the stage-0 dumps (and the post-release dump, runbook 6.4).

## 6. Operator caution until 0.6a is in production (KI-8)

Until #2 / #11 are applied: **do not call functions through "Run as role" (impersonation) in the production SQL Editor.**
A privilege error in such a session restarts the whole database. Plain SQL as `postgres` is not affected.
After the release the guards refuse inside the function; still prefer plain `postgres` SQL in the SQL Editor.

## 7. Post-release checks — Phase 9 (AI 사진 인식)

Status: from `phases/phase-9-report.md` (implemented locally 2026-10-04).
These cannot be tested locally: the production n8n cannot reach the local stack, and the real OpenRouter call is made only here.
Tested locally: the database side (pgTAP), the app against a stub n8n, and the workflow file's structure and Code nodes (mocked). The local n8n container run (plan D6) was skipped by Brad.

1. n8n: import `n8n/ri-photo-recognition.workflow.json` as a **new workflow** (decision D8). Do **not** add nodes to, or change, the existing device-label workflow. It arrives inactive.
2. **Fill the placeholders: model ID and credentials → then confirm recognition with one real photo** (approval condition Q1; how: `vector-integration.md` §8 / `n8n/README.md` §1):
   - `<<OPENROUTER_MODEL_ID>>` = the model id of the existing device-label workflow;
   - OpenRouter credential = the **same** credential as the device-label workflow;
   - Header Auth credential `X-RI-Secret` = new random secret.
   Then one real photo (no customer data) in "AI 사진 인식" → readings come back, a candidate appears in 기기 마스터 → AI 후보.
3. Workflow settings (this workflow only, D7): successful executions not saved, manual not saved; **failed executions: see §7.1**. Instance-wide settings unchanged; the VECTOR workflow keeps its history (C12).
4. App environment (production): `N8N_RI_PHOTO_WEBHOOK_URL`, `N8N_RI_PHOTO_SECRET`. Order: migrations → app → variables (→ redeploy) → activate the workflow.
5. Webhook without header / wrong header / correct header → note the status codes (refused / refused / 200). The app treats 401 and 403 the same ("인증에 실패").
6. Three test photos **without customer data** (chip marking, board silkscreen, device label):
   - readings plausible;
   - candidates PENDING with the photo in 기기 마스터 → AI 후보;
   - one approval per type → alias registered on the part / board / model;
   - after the last candidate of a photo is reviewed, the photo is gone.
7. Time per request within the hosting function limit (`maxDuration = 60` on `/ai-photo`, app timeout 55 s); note typical seconds.
8. The existing device-label AI fill in the ticket screen (`EstimateCard`) still works (unchanged).
9. OpenRouter account: provider data retention / training settings reviewed (Brad).
10. Storage: `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'ai-photos'` → `f | 10485760 | {image/webp}`; an unsigned object URL is refused.

### 7.1 "Save failed executions" — ON only during the initial verification, then OFF

Why: a failed execution stores its input, i.e. **the photo (base64)**, in n8n until the instance-wide prune (Phase 9 report → Known risks). It is useful only while the
placeholders and the prompt are being verified.

1. **During §7-2 … §7-7 (initial verification):** keep the imported setting — n8n → workflow "RI 사진 인식" → **⋯ → Settings** →
   "Save failed production executions" = **Save** (`saveDataErrorExecution: all` in the file). Successful / manual executions stay "Do not save".
2. Use only photos **without customer data** during this period.
3. **When §7 passes:** same dialog → "Save failed production executions" = **Do not save** → **Save** the settings → keep the workflow **Active**.
   (In the exported JSON this is `"saveDataErrorExecution": "none"`.)
4. Delete the failed executions kept during the verification: workflow → **Executions** → filter status **Error** → select all → **Delete**.
5. Check: trigger one deliberate failure (e.g. a webhook call with the correct header and an empty body) → no new entry under Executions.
6. Record the date of the switch in the release log (runbook stage 7). Do not export the workflow back into the repository with real credential ids; if the repo file
   is updated later, only the setting changes to `none` (separate approved change).
7. For a later investigation, switch it ON temporarily, reproduce with a photo without customer data, then repeat 3–4.

### Optional at deployment (D9, KI-15)

- **Header Auth on the existing device-label webhook, including the app sending the header.** Today `analyzeDeviceLabelAction` calls `N8N_DEVICE_WEBHOOK_URL` without any authentication (KI-15).
  If chosen, it needs both sides at once:
  1. app: send a header (e.g. `X-RI-Secret` or a separate secret) in `analyzeDeviceLabelAction` — a small code change that needs its own approved plan;
  2. n8n: Header Auth on that workflow's Webhook node;
  3. deploy the app change first, then switch on Header Auth (otherwise the ticket AI fill fails).
  Not part of this release; recorded only.

## 8. Post-release operations

Order: §7 first (photo flow), then these. None of them is required for the release itself; each is Brad's decision and timing.

### 8.1 Model name mapping (기기 마스터 → 모델 매핑) — backfill

- Production starts with **empty** catalog tables. Search, knowledge, purchase guard rules 3–6 and VECTOR answer "없음" until models / boards / specs exist (Phase 5, 6, 8 reports).
- Tool: `login.digital-rescue.com/catalog/mapping` (ADMIN). It lists distinct unmapped model strings with counts and `pg_trgm` suggestions; a person confirms each group → one RPC creates the alias
  and links the matching tickets (approved ones too, `updated_at` unchanged). **Nothing is auto-mapped.** "되돌리기" unlinks a group.
- Suggested order: (1) register the most frequent models in 모델 목록 (brand spellings LG / lg, 삼성 / samsung are separate strings — map them to one model);
  (2) map groups from the top of the count list; (3) register boards for repaired mainboards; (4) link stock rows to part specs (기기 마스터 → 재고 연결).
- About 367 distinct model strings (Phase 0); work in batches, e.g. 30 per day. Test tickets (`is_test`) are not counted as cases.

### 8.2 Staff training

| Who | Topic | Screens |
| --- | --- | --- |
| RECEPTION | 표준 모델 선택 on intake, 접수 사전 확인 panel, "새 모델 등록" (→ 관리자 검토 대기) | 신규 접수 |
| TECHNICIAN / EXPERT_REPAIR | 수리 기록 (증상, 측정, 고장, 조치, 적출 부품 처분), 사용 부품 호환 응답, 구매 요청 사유, Donor 적출 요청, AI 사진 인식, 모델 메모 | 접수 상세, Donor 기기, AI 사진 인식 |
| MANAGER | 적출품 입고 승인 (qty-1 rows + labels), Donor 전환 / 적출 입고, 보관 위치 지정, 라벨 인쇄 / 스캔 | 대시보드 widgets, 라벨 인쇄, 라벨 조회 |
| ADMIN | 기기 마스터 (매핑, 증상 코드, 부품 규격, AI 후보 검토), 구매 사유 보고서, 보관 위치 관리, flags | 기기 마스터, 재고 분류 설정 |
| CS | 부품·기기 검색 (cases without customer data) | 부품·기기 검색 |

Training happens while all flags are OFF (P10).

### 8.3 Flags stay OFF until Brad decides

- `ri_approval_gate_enabled` (최종 승인 시 수리 기록 필수 확인) — **the repair record close gate stays OFF** until Brad decides.
- `ri_cancel_gate_enabled` (접수 취소 시 취소 구분·적출 부품 필수 확인) — OFF.
- `ri_purchase_guard_enabled` (구매 요청 시 내부 자원 확인) — OFF.
- Where: 재고 분류 설정 (ADMIN). Check any time: `select ri_approval_gate_enabled, ri_cancel_gate_enabled, ri_purchase_guard_enabled from global_settings;` → `f | f | f`.
- When switching one ON later: announce first; ADMIN override with reason exists for the gates (logged in `ticket_close_overrides`).

### 8.4 VECTOR activation (from `phases/phase-8-report.md` → "Production (Brad) — C10" and `vector-integration.md` §1–7)

1. SQL Editor as `postgres` (not "Run as role"): `ALTER ROLE vector_agent LOGIN PASSWORD '<long random>';` — the password lives only in the n8n credential.
2. Check: `SELECT rolcanlogin, rolconnlimit FROM pg_roles WHERE rolname = 'vector_agent';` → `true | 3`; role settings → search_path, 5s, 10s.
3. `temp_file_limit` for `vector_agent` → request from Supabase support together with the KI-8 report (`supabase-support-report.md` Requests #4, KI-8 §8.5). Not active until support sets it.
4. n8n Postgres credential via the **Session pooler** (port 5432, user `vector_agent.<project-ref>`, SSL require, ≤ 3 connections).
5. Webhook Header Auth (`X-Vector-Secret`); test without / wrong / correct header and note the status codes (O2: 401 or 403).
6. n8n execution history retention for the VECTOR workflow (audit, C12); `{{ $execution.id }}` as `p_source_ref`.
7. Put `vector-agent-guide.md` (between `---`) into VECTOR's system prompt.
8. Kill switch: `ALTER ROLE vector_agent NOLOGIN;`.

### 8.5 OpenRouter placeholders (Phase 9)

= §7-2. Fill `<<OPENROUTER_MODEL_ID>>` and the two credential placeholders **in n8n after import**, never in the repository (`vector-integration.md` §8, `n8n/README.md` §1).

## 9. Open items (not part of the release unless planned)

- KI-7 (`ticket-images` public), KI-9, KI-10, KI-11, KI-13, KI-15, **KI-16** (`/ai-photo` missing from the proxy's `ADMIN_PATHS`) — Brad to decide.
- Phase 2 decision 6 (all EXPERT_REPAIR regardless of assignment?).
- Phase 7 decision 8 (`.limit(1)` in `addInventoryItem` and the n8n webhook once identical USED rows exist) — becomes relevant after the first qty-1 inbound on production.
- Exposed schemas confirmed by Brad in the dashboard (Phase 0.6 decision 8 — implemented for `public, graphql_public`).
- Phase 10: plan after the release, once real data exists (`02-roadmap.md`).
