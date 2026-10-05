# Phase 0.6 — Security hotfix: function permission errors vs `supautils` crash (KI-8) — PLAN

Status: **APPROVED 2026-10-03 — EXECUTED 2026-10-03** (see `phase-0.6-report.md`; decisions in §11). Branch `feat/repair-intelligence`.

> **Changed with the approval (Brad, 2026-10-03):** standalone / manual production application is **cancelled** (reason: KI-8 §8.3 re-verification — the REST path is not affected).
> 0.6a and 0.6b are ordinary migrations, released with everything else after Phase 10 (`04-final-release-plan.md`, order 0.5 → 0.6a → …).
> No `supabase/hotfix/` files and no "production manual application" section exist.

## 0. Preconditions and what changed since the request (2026-10-03)

| Check | Result |
| --- | --- |
| KI-8 root cause | `supautils` "enhanced permission hints" (`supautils.hint_roles = anon, authenticated, service_role`) segfaults while building the hint for a **function** privilege error (`known-issues.md` §8.1) |
| Dev target | local Docker Supabase (Brad, Phase 8 decision 1) |
| Working tree | Only pre-existing, non-RI changes (`.claude/*`, `.gitignore`), plus the uncommitted Phase 8 plan and KI-8 notes |

**New finding while planning — please read first (`known-issues.md` §8.3).**
- On **production and local**, the role `authenticator` (the login PostgREST uses) has `session_preload_libraries=safeupdate`.
  A role-level setting replaces the global `supautils`, so **REST sessions do not load `supautils`**.
- Local REST tests to revoked functions, as anon, an employee JWT and service_role → clean `401` / `403`, **no crash**.
  `psql` as `authenticator` + `SET ROLE anon` → clean error.
- Crashes happen only in sessions that log in as `postgres` (or another role without the override) and then `SET ROLE` to a hint role:
  Studio SQL editor / "run as role" impersonation, Supavisor or direct `postgres` connections, migrations, pgTAP, the Management API SQL endpoint.
- **So the public anon key cannot restart production (high confidence, untested on production by design).** The hotfix is
  defense-in-depth plus operator safety, not an emergency. Decision §11-1 asks whether to keep the full scope.

## 1. Goal and acceptance

- No function in a PostgREST-exposed schema refuses a hint role (`anon`, `authenticated`, `service_role`) by missing EXECUTE.
  Refusals happen **inside** the function with a clear error, so no session can hit the `supautils` crash.
- Behaviour for roles that are allowed today is **unchanged**.
- Every call that is refused today is still refused, now with an explicit message and the same HTTP status (401 anon / 403 others) over REST.
- New working rule **R10** (§4).

**Acceptance:**
- the catalog invariant test (§6-A1) finds no exposed function lacking EXECUTE for a hint role;
- the crash reproduction from §6-B no longer crashes;
- all existing tests and the listed flows behave identically.

## 2. Inventory (task 1)

Exposed schemas: `public`, `graphql_public` (local `config.toml`; production default — Brad confirms in the dashboard, §11-8).
`graphql_public`: no function lacks a grant (local and production). All findings are in `public`.

### 2.1 Production (SELECT only, 2026-10-03) — 8 functions

Production has only the baseline schema; Phases 0.5–7 are not deployed.

| Function | Missing EXECUTE | Kind | App call site | Called by other functions |
| --- | --- | --- | --- | --- |
| `approve_material_dispatch(uuid, uuid)` | anon, authenticated | definer | `tickets/actions.ts:1450` `approveMaterialDispatchAction` — **admin client (service_role)** | — |
| `apply_refund_material_adjustments(uuid, boolean)` | anon, authenticated | definer | — | **yes**: `transition_refund` (nested, as owner) |
| `recalc_ticket_material_cost(uuid)` | anon | definer | `tickets/actions.ts:564, 645, 1500` (session) | yes (baseline line 362 and RI functions) |
| `request_refund(…)` | anon | definer | `tickets/actions.ts:2071` (session) | — |
| `transition_refund(uuid, text, text, boolean)` | anon | definer | `tickets/actions.ts:2128` (session) | — |
| `generate_refund_no()` | anon, authenticated | trigger | — | trigger only |
| `protect_canceled_ticket()` | anon, authenticated | trigger | — | trigger only |
| `sync_ticket_refunded_amount()` | anon, authenticated | trigger | — | trigger only |

### 2.2 Local DB = production + Phases 0.5–7 (catalog query, 2026-10-03) — 50 functions

The 8 above (`approve_material_dispatch` local body = Phase 0.5) plus 42 from Phase 1–7 migrations. "Deployed" = in production.

**RI trigger functions (7)** — anon, authenticated missing — not deployed:
- `catalog_keep_ticket_updated_at`, `catalog_set_updated_at` (`20260928102040`)
- `repair_removed_part_stamp`, `repair_set_updated_at` (`20261001134000`)
- `part_set_updated_at` (`20261001221915`)
- `model_note_stamp` (`20261003062351`)
- `ri_purchase_guard_enforce` (`20261003064945`)

**RI internal helpers (8)** — no app call, or a call only through RLS / defaults — not deployed:

| Function | Missing | Kind | Used by |
| --- | --- | --- | --- |
| `ri_compatibility_row` | anon, authenticated, service_role | definer | `record_*` (nested) |
| `ri_recompute_compatibility` | anon, authenticated, service_role | definer | `record_*`, `retract_*` (nested) |
| `ri_inbound_extracted_part` | anon, authenticated, service_role | **invoker** | `approve_return_material`, `approve_removed_part_inbound`, `donor_extract_part` (nested) |
| `ri_purchase_material_info` | anon, authenticated | invoker | purchase guard functions (nested) |
| `ri_purchase_resources` | anon, authenticated | invoker | purchase guard functions (nested) |
| `ri_next_item_label` | anon | definer | default of `inventory_items.label_code` |
| `repair_record_can_edit` | anon | definer | RLS policies on repair tables; `loadRepairRecord.ts:38` (session) |
| `catalog_normalize` | anon | **SQL, IMMUTABLE** | generated columns `alias_norm` / `name_norm`, indexes, search functions |

**RI app RPCs (27)** — **anon only** missing — session client, every server action checks `getCurrentEmployee()` first — not deployed:
- `20260928102040`: `catalog_create_model`, `catalog_map_model_string`, `catalog_unmap_alias`, `catalog_unmapped_model_strings` (`catalog/actions.ts`); `catalog_search_models`, `catalog_search_boards` (SQL, invoker)
- `20261001134000`: `repair_gate_check` (invoker), `repair_gate_override`, `repair_set_cancel_result` (`tickets/actions.ts:903–917`, `loadRepairRecord.ts:59`)
- `20261001134100`: `approve_return_material`, `confirm_material_return`, `register_return_material` (`tickets/actions.ts:1709–1800`), `approve_removed_part_inbound` (`repair-record/actions.ts:250`)
- `20261001221915`: `part_spec_create`, `part_spec_search` (SQL), `record_compatibility_result`, `retract_compatibility_evidence` (`catalog/partActions.ts`), `record_part_install_result` (`repair-record/actions.ts:222`)
- `20261003054457`: `donor_convert_from_ticket`, `donor_extract_part` (`donors/actions.ts`)
- `20261003062351`: `get_device_knowledge`, `search_parts_for_device` (invoker), `search_devices_for_part` (SQL) (`lookup/actions.ts`)
- `20261003064945`: `purchase_guard_check`, `request_purchase_material` (`purchaseGuardActions.ts`)
- `20261003121512`: `label_lookup` (`scan/[code]/page.tsx:20`), `set_storage_location` (`labels/actions.ts:40`)

The full table (function / schema / missing roles / call site / deployed) is regenerated by the test (§6-A1) and attached to the report.

## 3. Fix design (task 2–3)

### 3.1 Why the guard cannot simply be `auth.uid() IS NULL`

1. **service_role also has `auth.uid() IS NULL`.** `approve_material_dispatch` is called *only* by service_role (admin client), so a uid check would break the dispatch approval.
2. **Nested calls.** `apply_refund_material_adjustments` runs inside `transition_refund` while the request role is still `authenticated`. Today the nested call is allowed, because the ACL check uses the outer definer's owner.
   A plain role check would break refunds. The same applies to `ri_compatibility_row` / `ri_recompute_compatibility` / `recalc_ticket_material_cost` when they are called inside other functions.
3. **Definer functions** see `current_user` = owner. The original caller is only visible as the request role (`current_setting('role')`, set by PostgREST / `SET ROLE`).

### 3.2 Two new helpers (additive; verified in a disposable container, 0 crashes)

| Helper | Logic | Used by |
| --- | --- | --- |
| `public.ri_api_guard_definer(p_denied text[]) RETURNS void` | Counts function frames in `GET DIAGNOSTICS … PG_CONTEXT`: guard + target = **top-level call**; more = nested call from another function (owner = postgres, allowed today). Raises **only** when top-level **and** `current_setting('role', true) = ANY(p_denied)` | SECURITY DEFINER targets |
| `public.ri_api_guard_invoker(p_denied text[]) RETURNS void` | Raises when `current_user = ANY(p_denied)`. In an invoker target, `current_user` is exactly the role the ACL check used today. A nested call from a definer function sees the owner → allowed, like today | SECURITY INVOKER targets (plpgsql and SQL) |

Both helpers:
- are plpgsql, SECURITY INVOKER, `SET search_path = pg_catalog`;
- have EXECUTE for `anon, authenticated, service_role` (R10). Calling them directly only raises or returns nothing.

Messages, with ERRCODE `42501` so PostgREST keeps the same HTTP status (401 anon, 403 others):
- anon: **"로그인이 필요합니다. 다시 로그인해 주세요."**
- authenticated / service_role: **"직접 호출할 수 없는 함수입니다."**

A custom 42501 raise under `supautils` was tested: it gets no hint and does not crash.

Probe results (container `supabase/postgres:17.6.1.104`, `supautils` loaded):

| Call | Result |
| --- | --- |
| anon → guarded definer, top-level | raised |
| authenticated → same, top-level | raised |
| authenticated → outer definer → guarded definer | allowed |
| service_role, and no `SET ROLE` | allowed |
| anon → trigger function with EXECUTE granted | `ERROR: trigger functions can only be called as triggers` — no crash, body never runs |

### 3.3 Per-function change (`CREATE OR REPLACE`, body only)

- Signature, return type, language, SECURITY DEFINER / INVOKER, volatility, `search_path`, owner and comments stay **unchanged**.
- The **only** body change is one first statement:
  - plpgsql: `PERFORM public.ri_api_guard_definer('{anon}');` (or `_invoker`), right after `BEGIN`;
  - SQL: an extra first statement `SELECT public.ri_api_guard_invoker('{anon}');`.

  `p_denied` is exactly the "missing" set from §2.
- Then `GRANT EXECUTE … TO anon, authenticated, service_role` (only the missing ones).
- Existing REVOKEs on tables and other objects are untouched.

| Group | Change |
| --- | --- |
| Triggers (10) | **grant only, no body change** — Postgres refuses direct calls itself, and PostgREST does not expose trigger functions (404) (§11-4) |
| `approve_material_dispatch` | guard denies **anon, authenticated** (= today). service_role (admin client) unchanged. See §11-2: the request said "로그인 필수만", but that would *widen* access for every logged-in employee. Exact preservation is proposed instead; role hardening is recorded as a new known issue |
| `catalog_normalize` | §11-3: (a) **recommended** grant to anon **without** a guard (pure string function used in generated columns / indexes; adding a statement stops SQL inlining in every alias search); (b) guard like the others |
| all other 38 functions | guard + grant as described |

### 3.4 Migrations (new files only; existing migrations untouched)

| File | Content | Production |
| --- | --- | --- |
| `20260928043332_api_guard_baseline.sql` (0.6a) | the two helpers + the 8 production functions (§2.1). Bodies are copied from the **current local definition**; `approve_material_dispatch` = Phase 0.5 body | ~~can be applied alone~~ **취소됨(사유: KI-8 §8.3 재검증)** — final release, directly after 0.5 |
| `20261003141631_api_guard_ri.sql` (0.6b) | the 42 RI functions (§2.2), bodies from the current local definitions (Phase 7 state) | final release, after Phase 7 |

**Important — `approve_material_dispatch` in production still has the pre-0.5 body.**
- Applying `<ts1>` without Phase 0.5 would bring the 0.5 purchase fix along silently.
- → proposal: deploy **0.5 + 0.6a together** (0.5 is tested and approved), §11-5.
- Alternative: a separate production-only variant with the production body + guard.

### 3.5 Exactness check built into the work

For every changed function, a script compares `pg_get_functiondef()` before and after:
- after removing the single guard line, the definition must be **byte-identical**;
- `proacl` may differ only by the added grants.

The before-snapshot is saved to `supabase/test-fixtures/phase0.6/functions_before.sql`; it is also the rollback source.

## 4. Rules and docs (task 4)

- `03-working-rules.md` and `CLAUDE.md`: add **R10** verbatim:
  "노출된 스키마의 함수는 hint_roles 역할(anon/authenticated/service_role)에게서 EXECUTE를 빼앗는 방식으로 막지 않는다. 함수 내부 확인으로 거부한다. (KI-8, supautils 크래시) 노출되지 않는 스키마(vector_api 등)는 예외."
- `03-working-rules.md`: the old note "Every new function must `REVOKE ALL … FROM PUBLIC, anon, authenticated` and then GRANT only what it needs" conflicts with R10. It is reworded:
  - revoke from PUBLIC;
  - grant EXECUTE to all three hint roles;
  - refuse inside with `ri_api_guard_*`;
  - non-exposed schemas excepted.
- **Phase 8 plan re-check:**
  - `vector_api` (not exposed, R10 exception) ✅;
  - `public.ai_candidate_approve` / `ai_candidate_reject` were planned with "EXECUTE for authenticated only" ✗ → amended: grant to all three hint roles. The existing ADMIN check (`get_my_role()` is NULL for anon / service_role) refuses them with a message.
  - The plan file is updated accordingly (status note + §3.5).
- `known-issues.md`:
  - KI-8 → fixed locally;
  - new **KI-11** "`approve_material_dispatch` has no role check (any service_role caller can approve)", recorded only.

## 5. Application

- No app code change is required: every server action already returns "인증이 필요합니다." before calling an RPC when the session is gone.
- Test §6-D checks what staff see with an expired session.
- §11-6: optionally change that text to "로그인이 만료되었습니다. 다시 로그인해 주세요." in the shared place, if one exists. Otherwise leave it (≈ 50 call sites, out of scope).

## 6. Test plan (local; task 5)

### A. pgTAP `supabase/tests/api_guard.test.sql`
1. **R10 invariant:** no function in `public` / `graphql_public` lacks EXECUTE for `anon`, `authenticated` or `service_role` (catalog-wide; the failure message lists offenders). This keeps future phases honest.
2. **Refusals preserved, per function and per formerly-missing role:** `SET ROLE <role>` + top-level call → `throws_ok` with the exact message / 42501. Runs as `postgres`, so `supautils` is loaded: this *is* the crash path, now safe.
3. **Allowed roles unchanged:** for each function, every role that had EXECUTE gets past the guard (it reaches the function's own validation / result, same as the existing tests).
4. **Nested calls:** `transition_refund` → `apply_refund_material_adjustments`; `record_compatibility_result` → `ri_compatibility_row` / `ri_recompute_compatibility`; extraction RPCs → `ri_inbound_extracted_part`; purchase guard → `ri_purchase_*`; RLS → `repair_record_can_edit`; `inventory_items` insert → `ri_next_item_label`. Each works as authenticated.
5. **Triggers:** granted; a direct call → "trigger functions can only be called as triggers".
6. **Exactness (§3.5):** stored before-definitions vs current, guard line removed → identical.
7. **Regression:** all 693 existing assertions pass unchanged.

### B. Crash reproduction before / after (dev stack)
- **Before** (on a `db reset` to the pre-0.6 state):
  - `postgres` + `SET ROLE anon` + `SELECT approve_material_dispatch(…)` → **signal 11** (log captured).
  - One representative per group (`ri_recompute_compatibility` as service_role, `recalc_ticket_material_cost` as anon).
  - REST `curl` of the same functions → 401 / 403 (current behaviour, recorded).
- **After:** the same `psql` calls → the guard message, **no crash** (log shows no `signal 11`). The same `curl` calls → 401 / 403 with the new message.

### C. Business flows identical (E2E, seed accounts, temporary `.env.development.local` deleted afterwards)
- MANAGER: **출고 승인** (dispatch and purchase).
- TECHNICIAN / MANAGER: **자재비 추가·수정** → `recalc_ticket_material_cost`.
- **환불 요청** → **승인 / 완료 / 취소 전이** incl. material adjustments (nested `apply_refund_material_adjustments`) and revert.
- Extracted-part inbound, compatibility answer, label lookup.

For each flow, the resulting rows (`inventory_items`, `inventory_transactions`, `ticket_materials`, `repair_tickets.material_cost / refunded_amount`, `ticket_refunds`, logs) are captured. They are compared with the same flow on the pre-0.6 database (same fixture, `db reset`), ignoring ids and timestamps.

### D. Session expiry (UI)
- Log in, then delete the auth cookies, or force a JWT expiry with the inactivity limit lowered in a temporary local env.
- Click: 출고 승인, 자재비 추가, 환불 요청, 라벨 조회, 부품 검색.
- Record the message or redirect each one shows, with screenshots. Expected: "인증이 필요합니다." or a redirect to `/login`.
- If any screen shows a raw DB error or stays silent → listed, and fixed only if §11-6 allows.

### E. Static / advisors / rollback
- `db reset` ×2; `test db`; `db:types` (no type change expected); `typecheck`, `lint`, `build`.
- Advisors (new findings fixed, pre-existing listed).
- Rollback rehearsal with the snapshot comparison.

## 7. Supabase support material (task 6)

- `docs/repair-intelligence/supabase-support-report.md` (English, no project id / keys / URLs):
  - image `supabase/postgres:17.6.1.104` (x86_64), production 17.6 aarch64 with the same `supautils` config;
  - `supautils.hint_roles`;
  - conditions (function ACL error, current role ∈ `hint_roles`, `supautils` loaded);
  - reproduction SQL;
  - expected vs actual result + postmaster log;
  - isolation results (§8.1 #2–#8);
  - the `authenticator` override observation;
  - impact (operator sessions, Studio "run as role").
- `docs/repair-intelligence/ki8-repro/` (§11-7):
  - `repro.sql` (create a throw-away function, revoke, `SET ROLE anon`, call);
  - `README.md` with the steps for a **free throw-away project**:
    1. run `repro.sql` in the SQL editor → connection lost / DB restarts;
    2. **one `curl`** to the Management API SQL endpoint `POST https://api.supabase.com/v1/projects/<ref>/database/query` with a personal access token, running the same SQL as `postgres` → error / restart;
    3. optionally `curl` the REST RPC with the anon key → 401 (shows the REST path is safe);
    4. delete the project afterwards.

  Placeholders only; nothing secret in the repo.

## 8. Rollback

App: nothing to revert. DB: `supabase/test-fixtures/phase0.6/rollback.sql`:
- restore each function from `functions_before.sql` (`CREATE OR REPLACE`, verbatim);
- `REVOKE EXECUTE … FROM <role>` exactly for the grants added;
- `DROP FUNCTION public.ri_api_guard_definer(text[]), public.ri_api_guard_invoker(text[])`.

Rehearsed locally with the md5 + ACL snapshot. Rollback brings back the crash exposure for operator sessions only.

## 9. Risks

- **Large surface, small change:** 39 function bodies (40 with §11-3b) get one line each. The automated exactness check (§3.5) and the full regression are the safeguards.
- **`PG_CONTEXT` frame counting** depends on Postgres' context text format ("PL/pgSQL function …" / "SQL function …"). This is stable across 17.x. Test A2/A4 fail loudly if a future Postgres changes it.
- **Request role semantics:**
  - Direct `postgres` sessions without `SET ROLE` see role `none` → allowed (= today: postgres has EXECUTE).
  - A `postgres` session that does `SET ROLE authenticated` and then calls a nested-only helper top-level is refused (= today, minus the crash).
- **Invoker functions nested in invoker functions** called by authenticated were refused today *with a crash in `postgres` sessions / a 403 over REST*. None exist (checked via the call graph); the invoker guard keeps them refused.
- **Production body drift for `approve_material_dispatch`** (§3.4).
- Future Supabase changes to the `authenticator` override would re-open the REST path for **non-guarded** functions — R10 prevents new ones.

## 10. Files

| New | Changed |
| --- | --- |
| 2 migrations; `supabase/tests/api_guard.test.sql`; `supabase/test-fixtures/phase0.6/{functions_before,rollback}.sql`; `supabase-support-report.md`; `ki8-repro/{repro.sql,README.md}`; `phases/phase-0.6-report.md` | `03-working-rules.md`, `CLAUDE.md`, `known-issues.md` (KI-8, KI-11), `02-roadmap.md` (Phase 0.6 entry), `phases/phase-8-plan.md` (§3.5 grants) |

## 11. Decisions needed from Brad (with APPROVED)

**Answers (Brad, 2026-10-03):** 1 full hotfix ✅ · 2 (a) deny anon **and** authenticated, KI-11 ✅ · 3 (a) grant only ✅ · 4 grant only ✅ ·
5 n/a — final release, order 0.5 → 0.6a ✅ · 6 app screens show "로그인이 필요합니다. 다시 로그인해 주세요." (judge by test D) ✅ ·
7 ✅, with "never on a production project, throw-away test project only" at the top ✅ · 8 implement for `public, graphql_public`; Brad confirms in the dashboard. R10 and the Phase 8 amendment approved. "APPROVED" given 2026-10-03.


1. **Scope given the new finding (§0):** the REST path is safe today; only operator `postgres` sessions crash.
   - (a) **recommended** — full hotfix as specified (defense-in-depth; protects Studio "run as role" use and any future `authenticator` change);
   - (b) rules + support report + invariant test for *new* functions only, no change to the 50 existing functions.
2. **`approve_material_dispatch`:** (a) **recommended** — guard denies anon **and** authenticated (exactly today; service_role admin client unchanged); (b) "로그인 필수" only, as requested — this lets **every logged-in employee** (incl. CS) approve dispatches directly via REST. Role hardening → KI-11 either way.
3. **`catalog_normalize`:** (a) **recommended** grant to anon without a guard (pure, no data); (b) guard like the others.
4. **Trigger functions (10):** grant only, no body change (Postgres refuses direct calls; not exposed over REST). OK?
5. **Production order:** apply **0.5 + 0.6a together** (recommended), or a production-only 0.6a variant that keeps the pre-0.5 `approve_material_dispatch` body?
6. **Session-expiry text:** keep "인증이 필요합니다." (recommended unless test D shows a raw / empty error), or change to "로그인이 만료되었습니다. 다시 로그인해 주세요." where it is centralised?
7. **Repro kit** in `docs/repair-intelligence/ki8-repro/` with the Management API `curl` as the single curl (the REST curl does **not** crash). OK?
8. Please confirm production's exposed schemas in Dashboard → API settings are only `public, graphql_public` (cannot be read with SQL).
