# Phase 0.6 — Function permission guard (KI-8 / R10) — REPORT

Executed 2026-10-03 on branch `feat/repair-intelligence` (plan: `phase-0.6-plan.md`, APPROVED 2026-10-03 with decisions 1–8 and the
"no standalone production application" change). Local Docker Supabase only.
Production: **read-only** catalog / log queries only, during planning (KI-8 §8.2–8.3). Nothing was applied to production.

## Result

| Acceptance / requirement | Result |
| --- | --- |
| R10 invariant: no function in `public` / `graphql_public` lacks EXECUTE for anon / authenticated / service_role | ✅ 0 offenders (was 50). Checked by pgTAP `api_guard.test.sql` §1 |
| Crash path no longer crashes | ✅ Before: 6/6 `postgres` + `SET ROLE` calls → **signal 11** (6 log entries, 14:17:01–14:17:19 UTC). After: the same 6 calls → clear message, **0 × signal 11**. pgTAP runs ≈ 60 refusals (39 anon, 7 + 1 DO-block authenticated, 3 service_role, 10 trigger direct calls) through the same path: 0 crashes |
| Refusals preserved, clear message | ✅ anon → "로그인이 필요합니다. 다시 로그인해 주세요." (REST **401**, as before). authenticated / service_role → "직접 호출할 수 없는 함수입니다." (REST **403**, as before). Exception: `search_devices_for_part` (see Deviations) |
| Allowed roles unchanged (1 byte) | ✅ Exactness check **50/50**: every changed definition (`pg_get_functiondef`) minus the single guard line is byte-identical to the before-definition. Only ACLs gained the listed grants. Object snapshot (917 entries: functions + ACLs, views, policies, triggers, columns, table / sequence ACLs, schemas): only the 50 target functions + 2 new helpers differ |
| Business flows identical | ✅ `test-fixtures/phase0.6/flows.sql` before vs after: **identical (96 lines)**. Covers dispatch + purchase approval (service_role), material cost + recalc, return confirmation (nested recalc), refund request → approve → complete (nested `apply_refund_material_adjustments`) → void, part spec + compatibility evidence (nested `ri_compatibility_row` / `ri_recompute_compatibility`), purchase guard (nested invoker helpers), RLS `repair_record_can_edit`, label lookup. Resulting rows compared for stock, transactions, materials, tickets, refunds, logs and compatibility |
| Session expiry (UI) | ✅ After fix: staff see "로그인이 필요합니다. 다시 로그인해 주세요." (see Test D). Before: Next.js "This page couldn't load" |
| pgTAP | ✅ **881/881**: existing 693, of which 26 ACL assertions were rewritten to the R10 form (Deviations), plus new 188 |
| `db reset` twice | ✅ (also after moving 0.6a next to 0.5) |
| typecheck / lint / build | ✅ 0 errors / 0 errors (16 warnings, all pre-existing) / success |
| Advisors (`--type all --level info`) | ✅ no new finding. The 14 WARNs are the pre-existing list. `approve_material_dispatch` "search_path mutable" is pre-existing (KI-11) and intentionally unchanged |
| Types | ✅ regenerated: only the two helpers were added |
| Rollback rehearsal | ✅ snapshot after rollback **identical** to before (917 entries); then re-applied |

## Decisions applied (Brad, 2026-10-03)

1. Full hotfix.
2. `approve_material_dispatch`: anon **and** authenticated refused, as before; service_role unchanged. Role hardening → **KI-11**.
3. `catalog_normalize`: grant only.
4. Trigger functions: grant only.
5. No standalone production application; release order 0.5 → 0.6a → … (`04-final-release-plan.md`).
6. App screens show "로그인이 필요합니다. 다시 로그인해 주세요.".
7. Repro kit via the Management API, with the "never on production" warning on top.
8. Implemented for `public, graphql_public`. **Brad to confirm in the dashboard.**

## Changes

### Database

| File | Content |
| --- | --- |
| `supabase/migrations/20260928043332_api_guard_baseline.sql` (0.6a) | helpers `ri_api_guard_definer(text[])`, `ri_api_guard_invoker(text[])` (SECURITY INVOKER, fixed `search_path`, EXECUTE for the 3 hint roles, not PUBLIC) + the 8 baseline functions. Placed **directly after Phase 0.5** (`…043331`): its `approve_material_dispatch` body is the 0.5 body |
| `supabase/migrations/20261003141631_api_guard_ri.sql` (0.6b) | the 42 Phase 1–7 functions |

Per function:
- 39 functions: `CREATE OR REPLACE` with the before-definition plus **one** first statement:
  - `PERFORM public.ri_api_guard_definer('{…}');` in SECURITY DEFINER plpgsql;
  - `PERFORM public.ri_api_guard_invoker('{…}');` in invoker plpgsql;
  - `SELECT public.ri_api_guard_invoker('{…}');` in SQL.

  `{…}` = exactly the roles that lacked EXECUTE. Then `GRANT EXECUTE` to those roles.
- 11 functions (10 triggers, `catalog_normalize`): grant only.
- Signature, return type, language, SECURITY DEFINER / INVOKER, volatility, `search_path`, owner and comments are unchanged.
- Line endings of each body are preserved (two Phase 1/4 files are CRLF in this working tree).

How the guards decide:
- **Invoker guard:** refuses when `current_user` is in the list. That is exactly the role the EXECUTE check used before.
- **Definer guard:** refuses when the request role (`current_setting('role')`, set by PostgREST / `SET ROLE`) is in the list, **unless** a SECURITY DEFINER function whose owner has EXECUTE is on the call stack above.
  - That case reproduces the old ACL semantics of nested calls (e.g. `transition_refund` → `apply_refund_material_adjustments`).
  - Top-level calls, calls from invoker functions, `DO` blocks and triggers fired by the session role are refused, like before.

### Application

| File | Change |
| --- | --- |
| `src/proxy.ts` (+4 lines) | On a protected path without a session, **server-action requests** (`next-action` header) are no longer redirected to `/login`. The action answers with its own login check (Next 16 docs: "verify authentication … inside each Server Function"). Page navigations still redirect to `/login?redirect=…` |
| 9 action files (46 literals) | `"인증이 필요합니다."` → `"로그인이 필요합니다. 다시 로그인해 주세요."` (decision 6). Files: `tickets/actions.ts` (30), `lookup/actions.ts` (6), `catalog/partActions.ts`, `purchaseGuardActions.ts`, `repair-record/actions.ts` (2 each), `catalog/actions.ts`, `donors/actions.ts`, `labels/actions.ts`, `actions/employeeActions.ts` (1 each) |
| `src/types/supabase.ts` | regenerated |

### Tests / fixtures

- `supabase/tests/api_guard.test.sql` (188):
  - R10 invariant;
  - md5 exactness of every body without the guard line;
  - right helper and role list;
  - refusals per role;
  - allowed roles pass the guard;
  - nested calls (refund, compatibility, purchase guard, RLS, label default);
  - `DO`-block refusal;
  - trigger direct-call refusal;
  - anon `catalog_normalize`.
- 9 existing test files: 26 ACL assertions rewritten (Deviations).
- `supabase/test-fixtures/phase0.6/`:
  - `functions_before.sql` (verbatim before-definitions of the 50);
  - `rollback.sql`;
  - `flows.sql` (business-flow equivalence);
  - `crash_check.sh` (local crash check).

### Docs

- `03-working-rules.md` + `CLAUDE.md`: **R10** (verbatim). The old "REVOKE … anon, authenticated" note is reworded.
- `known-issues.md`:
  - KI-8 §8.3 (REST path) and §8.4 (fix + **operator caution until the release**);
  - new **KI-11**;
  - KI-5 note.
- `02-roadmap.md`: Phase 0.6 entry and order.
- `04-final-release-plan.md`: **new**. Migration order (0.5 → 0.6a → 1 … 7 → 0.6b → 8 …) and rehearsal step "0.6a body = post-0.5 body + guard".
- `phase-8-plan.md`: R10 amendment (`ai_candidate_*` granted to the 3 hint roles, guard + ADMIN check).
- `supabase-support-report.md` (English) and `ki8-repro/{repro.sql,README.md}`: "never on production" at the top, no ids or keys.

## Deviations from the plan

| Plan | Done | Why |
| --- | --- | --- |
| Definer guard = count stack frames (≤ 2 → top-level) | Look up the caller frames; allowed only if a SECURITY DEFINER caller (whose owner has EXECUTE) is above | Frame counting would have let calls from `DO` blocks / invoker functions / pgTAP through. Before 0.6 those were refused (the ACL check used the session role). The refined guard is exact for every case, and is what makes the pgTAP refusals testable |
| Guard `search_path = pg_catalog` | `pg_catalog, public, extensions` | Found by the flow test: `PG_CONTEXT` shows a function's signature as **compiled**, so usually unqualified. Under `pg_catalog` the nested refund call was wrongly refused. Builtins stay first on the path |
| All refusals give the guard message | `search_devices_for_part` (SQL) gives Postgres' own `42501 permission denied for view compatibility_summary` to anon | A SQL function rewrites all its statements at startup. The `security_invoker` view is checked before the guard statement runs. Still a clean 42501 / HTTP 401, no crash. Changing the language is not allowed |
| "all 693 existing assertions pass unchanged" | 26 assertions of the form "role X cannot execute Y" rewritten to "EXECUTE granted **and** the guard denies X (or trigger)", with the suffix "(R10: EXECUTE granted, refused by the in-function guard)" | They asserted exactly the ACL state R10 changes. No behavioural assertion was changed |
| 0.6a timestamp after Phase 7 | renamed to `20260928043332` (right after 0.5) | Release order 0.5 → 0.6a. Phases 1–7 never redefine or re-grant those 8 functions (checked). Re-verified: exactness, snapshot, flows, 881 tests |
| Test C via E2E UI flows | SQL flow script in exact app role contexts (before vs after, byte-compared) + UI regression (dispatch approval with a valid session) | Byte-level comparison needs identical inputs. The UI path calls the same RPCs (service_role / session) |
| No app change unless test D fails | proxy + 46 literals | Test D failed ("This page couldn't load"); decision 6 |

## Test D — session expiry (local, seed MANAGER, auth cookie deleted while the page was open)

| Action | Before the fix | After the fix |
| --- | --- | --- |
| 대시보드 "출고 승인" | Next.js "This page couldn't load / Reload / Back". The proxy redirected the action POST to `/login`. Console: `An unexpected response was received from the server` | red box "로그인이 필요합니다. 다시 로그인해 주세요." in the widget; DB unchanged |
| "구매 승인", "입고 승인" | (same mechanism) | message in each widget |
| 접수건 "환불 요청" (현금 반환) | — | message in the refund card |
| 접수건 "비용 추가" | — | message under the cost form |
| 부품·기기 검색 (model search) | — | message under the picker |
| 라벨 조회 `/scan/P-00001` | redirect to `/login?redirect=/scan/P-00001` | unchanged (page navigation) |
| Valid session: "출고 승인" | works | works (material `approved`, OUTBOUND written) |

The only console error seen belongs to the pre-fix click. The temporary `.env.development.local` was **deleted**.
The pane could not draw (hidden window), so forms were driven through DOM events and verified by page text and DB queries.

## Rollback

Not needed for production (nothing was deployed). Locally: run `supabase/test-fixtures/phase0.6/rollback.sql`, which:
- restores the 39 bodies verbatim;
- revokes exactly the added grants;
- drops the helpers.

App: revert the proxy hunk and the 46 literals (`git revert <phase-0.6 commit>` restores everything).
Rehearsed: snapshot identical to before. Rollback brings back the KI-8 exposure for operator sessions only.

## Production

- **Nothing to do now.** Per Brad's decision there is no hotfix. 0.6a / 0.6b ship with the final release (`04-final-release-plan.md` §2 #2 and #11).
- That plan's rehearsal step checks that 0.6a's bodies equal the post-0.5 production definitions plus one guard line.
- **Until then (KI-8 §8.4): no "Run as role" function calls in the production SQL Editor.**

## How Brad verifies locally

1. Run the database checks:
   ```bash
   npx supabase db reset
   npx supabase test db
   sh supabase/test-fixtures/phase0.6/crash_check.sh after
   ```
   - `test db` → 881 pass.
   - `crash_check.sh` → 6 messages, 2 × 401 and 1 × 403 over REST, "signal 11 … : 0".
2. Optionally compare the business flows: run `flows.sql` (`docker exec -i supabase_db_digital-rescue psql -U postgres -d postgres -X -At < supabase/test-fixtures/phase0.6/flows.sql`) on a pre-0.6 checkout and on this commit, then diff the outputs.
3. Run the app checks: `npm run typecheck && npm run lint && npm run build`.
4. In the dev server against the local stack:
   - log in as `manager@example.test`, open the dashboard;
   - in DevTools delete the cookie `sb-127-auth-token`;
   - click "출고 승인" → "로그인이 필요합니다. 다시 로그인해 주세요.".

## Known risks / notes

- **Guard depends on the `PG_CONTEXT` text format** ("PL/pgSQL function <signature> line N"). This is stable in Postgres 17. `api_guard.test.sql` fails loudly if a future version changes it.
- **`DO` blocks / invoker functions** calling a guarded definer function run as the session role, like before. Only SECURITY DEFINER callers lift the check.
- **Server actions without a session now reach the action** instead of being redirected. Every `(admin)` action checks `getCurrentEmployee()` itself, directly or through its file's `session()` / `adminClient()` helper (audited). Statistics actions read through RLS (no rows for anon).
- **Line endings:** `functions_before.sql` holds the local definitions. Two of them carry `\r` from CRLF working-tree files. The pgTAP exactness test ignores `\r`.
- `vector_agent` (Phase 8) has no EXECUTE on public functions (they are granted to the 3 hint roles, not PUBLIC). Being outside `hint_roles`, a privilege error does not crash for it.
- **Still open:**
  - KI-9, KI-10, KI-11;
  - Phase 2 decision 6;
  - exposed-schema confirmation (decision 8).
