# Repair Intelligence — Known Issues

Issues found during Repair Intelligence work that are **outside the current phase's scope**.
Recorded only; nothing here is changed without an explicit decision from Brad.

| ID | Title | Status |
| --- | --- | --- |
| KI-1 | `device_models` cache: missing unique constraint | Recorded only |
| KI-2 | Outsourced (외주) items modelled as inventory | Recorded only — separate cleanup planned by Brad |
| KI-3 | Migration 019 duplicate / `019_cancel_method.sql` never applied | Resolved 2026-09-27 — not applied, archived (no references) |
| KI-4 | `approve_material_dispatch` breaks purchase requests | Fixed locally in Phase 0.5 (migration `20260928043331`) — awaiting production deploy by Brad |
| KI-5 | Hand-written types vs generated types | Recorded (Phase 0.1) — no change to existing types |
| KI-6 | Production migration history out of sync with files | Resolved by Brad running the repair commands from Phase 0.1 |
| KI-7 | `ticket-images` storage: public access, extra dashboard policy, no size limit | Recorded only — Brad to decide |
| KI-8 | Postgres crashes on "permission denied for function" (`supautils` hint) | **Fixed locally in Phase 0.6** (R10 guards) — production with the final release. Until then: **no "Run as role" function calls in the production SQL Editor** (§8.4). Do NOT probe on production |
| KI-9 | `protect_approved_ticket`: `current_role` variable is the SQL keyword → ADMIN/MANAGER branches never match | Recorded (Phase 1) — Brad to decide |
| KI-10 | RECEPTION cannot cancel tickets (`tickets_update` has no WITH CHECK) | Recorded (Phase 2) — Brad to decide |
| KI-11 | `approve_material_dispatch` has no role check of its own | Recorded (Phase 0.6) — Brad to decide |
| KI-12 | Server actions without their own login / role check (statistics) | **Fixed locally in Phase 0.6.1** (commit `b43eb58`, app only) — production with the final release, or cherry-pick to `main` (Brad) |
| KI-13 | `ilike` / PostgREST filters: user input not escaped (`%`, `_`) | Recorded (Phase 0.6.1) — Brad to decide |
| KI-14 | Deleting an alias created by an approved AI candidate fails (FK `SET NULL` vs `ai_candidates_protect`) | **Fixed locally (Phase 9 D5)** — migration `20261004100000_ki14_ai_candidates_result_delete.sql`, production with the final release |
| KI-15 | Device-label n8n webhook (`N8N_DEVICE_WEBHOOK_URL`) has no authentication | Recorded (Phase 9, D9) — optional at deployment (`04-final-release-plan.md` §7) |

---

## KI-1. `device_models` cache: missing unique constraint

- Two code paths write the AI value cache with
  `upsert(..., { onConflict: "brand,model_name" })`:
  - `startRepairAction` — `src/app/(admin)/tickets/actions.ts:486`
  - `analyzeDeviceLabelAction` — `src/app/(admin)/tickets/actions.ts:2011` (write at :2053)
- `device_models` has no UNIQUE constraint/index on `(brand, model_name)` (only PK, `brand`,
  partial `tag_info` indexes). Postgres rejects `ON CONFLICT` without a matching constraint;
  the error result is not checked, so the write fails silently. Production row count: **0**.
- The read path (`lookupPastEvaluatedValue`, :205) therefore never gets a cache hit from this table.
- **Caution:** adding the constraint would suddenly activate the cache writes (and brand spellings
  like "LG"/"lg" would create separate rows). Decide separately. Repair Intelligence does not touch
  `device_models` (decision Q1).

## KI-2. Outsourced (외주) items modelled as inventory

Investigated 2026-09-27 (production, SELECT only).

**Items:** 13 `inventory_items` under spec `외주` — 액정 11 (메티스 2, 피맥월드쏘 9), 메인보드 1
(엠에스텍, "메인보드수리 66,000"), 케이스 1 (아이엔텍, "서피스 1866 케이스").
Quantities are placeholders (10 / 98 / 99). The service description is stored in `capacity`.

**References**

| Where | What | Count |
| --- | --- | --- |
| `ticket_materials.inventory_item_id` | all `request_type='dispatch'`; approved 7, cancelled 3 | 10 rows on 8 items (5 items unreferenced) |
| `inventory_transactions.item_id` | INBOUND on registration, OUTBOUND on approval, INBOUND on rollback | 26 rows |
| `ticket_refunds.material_adjustments` | one adjustment references a material on "맥북에어 M2 액정교체" | 1 |
| `ticket_materials.override_unit_price` | none set on outsourced materials | 0 |

**Behaviour**
- Requested as `dispatch`, so approval **deducts the placeholder quantity** (e.g. 99 → 98) and logs
  OUTBOUND like physical stock.
- Cost: `recalc_ticket_material_cost` adds `COALESCE(override_unit_price, base_estimate) × quantity`
  → outsourced price flows into `repair_tickets.material_cost`.
- FKs: `ticket_materials → inventory_items` is **ON DELETE RESTRICT** (referenced items cannot be
  deleted); `inventory_transactions → inventory_items` is **ON DELETE CASCADE** (deleting an item
  would erase its history); `inventory_items → specs/products/categories` RESTRICT.
- Code identifies outsourced items by string comparison `spec_name === "외주"`:
  - `src/app/(admin)/tickets/[id]/TicketDetailForm.tsx:605` — excluded from extracted-part registration
  - `TicketDetailForm.tsx:826`, `:1101` — same exclusion in other lists
  - `src/app/(admin)/tickets/[id]/RefundCard.tsx:109` — price-adjustable in refunds (with category 소프트웨어)
- Renaming the spec, or moving these items, would silently change the three behaviours above.

**Repair Intelligence:** outsourced items are excluded from compatibility, search and purchase guard (Q5).
Filter by the same rule (`inventory_specs.name = '외주'`) until the separate cleanup defines a proper flag.

## KI-3. Migration 019 duplicate / `019_cancel_method.sql` never applied

| File | Adds | In production? |
| --- | --- | --- |
| `019_cancel_device_disposal.sql` | `cancel_device_disposal text CHECK (RETURN, DISPOSE)`, `dispose_confirmed_at timestamptz`, index, comments | **Yes** |
| `019_cancel_method.sql` | `cancel_method text CHECK (return, dispose)`, `disposal_confirmed boolean NOT NULL DEFAULT false` | **No** (columns absent) |

- Same purpose (how a canceled device is handled + whether disposal was confirmed), two designs.
  The applied one stores *when* disposal was confirmed; the other only a boolean.
- No code in `src/` references `cancel_method` or `disposal_confirmed`; all code uses
  `cancel_device_disposal` / `dispose_confirmed_at` (`cancelTicketAction`, `confirmDisposalAction`,
  `getDisposalPendingTickets`, `restoreCanceledTicketAction`).
- **Assessment:** `019_cancel_method.sql` is an abandoned draft; no new migration appears necessary.
  Both files move to `supabase/migrations_archive/` in Phase 0.1 unchanged.
- **Decision (Brad, 2026-09-27):** do not apply; archive after verifying there are no references.
- **Verification (2026-09-27):** the file creates only two columns (no functions, policies, triggers).
  - Repo-wide search (excluding `node_modules`, `.next`, `.git`) for `cancel_method`, `cancelMethod`,
    `disposal_confirmed`, `disposalConfirmed`: matches only in this doc set, `00-current-state.md`,
    `02-roadmap.md` and the file itself. **No application code references.**
  - Production (SELECT): no column with either name in any schema; no function body (`pg_proc.prosrc`)
    and no RLS policy (`pg_policies` qual/with_check) mentions either name.
  - → archived unchanged in Phase 0.1.

## KI-4. `approve_material_dispatch` breaks purchase requests

- Live function = migration 014 version. It ignores `request_type`: purchase requests also check
  and deduct stock and insert OUTBOUND. Purchase is auto-selected when the item quantity is ≤ 0,
  so approval fails with "재고 부족".
- The app-side fallback in `approveMaterialDispatchAction` (`actions.ts:1364`) would also insert an
  OUTBOUND row for purchases once the RPC stops doing it.
- Also: no role check and no `search_path` in the function (mitigated — EXECUTE is granted to
  service_role only).
- **Fixed in Phase 0.5** (purchase branch only; dispatch path unchanged; app fallback skipped for purchases) — see `phases/phase-0.5-report.md`. Production deploy pending — with the release, migrations first (`04-final-release-plan.md` §1; window risk of the old app's OUTBOUND fallback: §2.2 A).

## KI-5. Hand-written types vs generated types

Compared 2026-09-27 (Phase 0.1): hand-written `src/types/database.ts` / `enums.ts` vs the local
baseline DB, which the generated `src/types/supabase.ts` mirrors. Decision Q10: **record only** —
existing code keeps the hand-written types; new features use the generated file.

**Columns present in DB but missing from the hand-written interface**

| Table / interface | Missing | Note |
| --- | --- | --- |
| `repair_tickets` / `RepairTicket` | `images` (jsonb), `has_admin_message` (bool), `cancel_device_disposal` (text\|null), `canceled_at`, `completed_at`, `dispose_confirmed_at` (timestamptz\|null) | Code reads these through local ad-hoc types (e.g. `TicketDetailForm.tsx`) |
| `ticket_materials` / `TicketMaterial` | `request_type` (text: dispatch\|purchase), `return_capacity` (text\|null) | `request_type` is central to Phase 0.5 |
| `device_models` / `DeviceModel` | `created_at`, `tag_info` (text\|null) | |
| `global_settings` / `GlobalSettings` | `id` (boolean, single-row key) | harmless |

**Nullability mismatches (DB nullable, TS non-null)**

| Column | DB | TS |
| --- | --- | --- |
| `repair_tickets.evaluated_value`, `minimum_estimate`, `confirmed_estimate` | `numeric \| null` | `number` |
| `device_models.release_year`, `release_price`, `min_repair_cost` | `integer \| null` | `number` |

(`device_models` columns were `NOT NULL` in migration 001; production has them nullable —
changed outside the migration files. The baseline follows production.)

**Enums**

| Enum | Difference |
| --- | --- |
| `receipt_type` | TS `ReceiptType` lacks `DELIVERY` (legacy value, split into QUICK/PARCEL by 004 but still in the enum) and `미정` (024) |
| `inventory_transaction_type` | no TS enum (INBOUND \| OUTBOUND \| ADJUSTMENT) |
| all other 11 enums | identical |

**Phase 1 (2026-09-29):** `repair_tickets.catalog_model_id` / `catalog_variant_id` / `catalog_board_id` and all
`catalog_*` tables exist only in the generated types; the hand-written `RepairTicket` was not extended (new code uses
`src/types/supabase.ts`).

**Phase 2 (2026-10-01):** `global_settings.ri_approval_gate_enabled` / `ri_cancel_gate_enabled` and all repair-record tables
(`symptom_codes`, `ticket_symptoms`, `repair_*`, `ticket_removed_parts`, `ticket_close_overrides`) exist only in the generated types.

**Phase 3 (2026-10-02):** `inventory_items.part_spec_id`, `ticket_removed_parts.part_spec_id` and all part-knowledge tables
(`part_specs`, `part_number_aliases`, `interchange_groups`, `part_compatibility`, `compatibility_evidence`, view `compatibility_summary`)
exist only in the generated types; the hand-written `InventoryItem` was not extended.

**Phase 4 (2026-10-03):** `donor_devices`, `donor_part_candidates`, `donor_photos`, view `donor_potential_stock` and the RPCs
`donor_convert_from_ticket` / `donor_extract_part` exist only in the generated types.

**Phase 5 (2026-10-03):** `model_notes` and the RPCs `search_parts_for_device` / `search_devices_for_part` / `get_device_knowledge`
exist only in the generated types (the jsonb result of `get_device_knowledge` is typed by hand in `src/app/(admin)/lookup/actions.ts`).

**Phase 6 (2026-10-03):** `global_settings.ri_purchase_guard_enabled`, `purchase_guard_logs` and the RPCs `purchase_guard_check` /
`request_purchase_material` exist only in the generated types (the jsonb results are typed by hand in `src/app/(admin)/tickets/purchaseGuardActions.ts`).

**Phase 7 (2026-10-03):** `inventory_items.label_code` / `storage_location_id`, `donor_devices.storage_location_id`, `storage_locations` and the RPCs
`label_lookup` / `set_storage_location` exist only in the generated types (the jsonb result of `label_lookup` is typed by hand in `src/app/(admin)/scan/[code]/types.ts`).
The ticket picker rows got an optional `label_code` in the local interfaces of `TicketDetailForm` / `EstimateCard` / `AddMaterialCard`.

**Phase 0.6 (2026-10-03):** the guard helpers `ri_api_guard_definer` / `ri_api_guard_invoker` appear only in the generated types (not called by the app).

**Phase 8 (2026-10-04):** `ai_candidates` and the RPCs `ai_candidate_approve` / `ai_candidate_reject` exist only in the generated types
(the candidate row is mapped by hand in `src/app/(admin)/catalog/ai-candidates/page.tsx`). Schema `vector_api` is not an API schema and is not generated.

**Phase 9 (2026-10-04):** `ai_photo_requests`, the new `ai_candidates` columns (`photo_request_id`, `result_model_alias_id`, `result_board_alias_id`, nullable `part_spec_id`) and the RPC `ai_photo_propose`
exist only in the generated types (the jsonb result of `ai_photo_propose` is typed by hand in `src/app/(admin)/ai-photo/actions.ts`).

**Tables without a hand-written interface:** `inventory_transactions`, `news_items`, `page_contents`,
`receipt_no_sequence`, `refund_no_sequence`.

**Generated file note:** `supabase gen types` (CLI 2.118.0) emits unformatted output
(several keys per line). It type-checks and lints cleanly; formatting is cosmetic
(the CLI suggests `npx oxfmt src/types/supabase.ts`, not adopted).

## KI-6. Production migration history out of sync with files

- `supabase_migrations.schema_migrations` in production has 18 rows (024–042, timestamp versions).
  001–023 and 026 were applied manually (SQL editor); 034 is recorded as
  `allow_admin_message_dismiss_on_approved`; local files use `NNN_` numbering.
- Phase 0.1 replaces the file history with a single baseline and provides the exact
  `supabase migration repair` commands. **Brad runs them; Claude does not.**

## KI-7. `ticket-images` storage: public access, extra dashboard policy, no size limit

Investigated 2026-09-27 (production catalog, SELECT only). **No policy changes made.**
Phase 0.1 baseline reproduces the current state exactly.

### 7.1 Current state

Bucket `ticket-images` (created 2026-04-16 in the dashboard; archived `026_ticket_images_storage.sql`
was never applied, which is why names/limits differ):

| Setting | Value |
| --- | --- |
| `public` | **true** — files are downloadable by anyone who has the URL, without auth, regardless of RLS |
| `file_size_limit` | **NULL** (no limit) |
| `allowed_mime_types` | **NULL** (any type) |
| Objects | 121, in 80 top-level folders named by ticket UUID; largest 6.1 MB; none > 10 MB; none under `public/` |

Policies on `storage.objects` that concern this bucket:

| Policy | Operation | Role(s) | Condition |
| --- | --- | --- | --- |
| **`Allow Public Access zutf89_0`** | SELECT | `anon` | `bucket_id='ticket-images'` AND first folder = `public` AND `auth.role()='anon'` |
| `ticket_images_public_read` | SELECT | `public` (= every role incl. anon) | `bucket_id='ticket-images'` |
| `ticket_images_auth_insert` | INSERT | `public` | WITH CHECK `bucket_id='ticket-images'` AND `auth.role()='authenticated'` |
| `ticket_images_auth_delete` | DELETE | `public` | `bucket_id='ticket-images'` AND `auth.role()='authenticated'` |
| (none) | UPDATE | — | not allowed |

- `Allow Public Access zutf89_0` (dashboard template) targets **only** `ticket-images/public/*`,
  **SELECT only**, **anon only**. The folder `public/` holds 0 objects and the app never writes there,
  so today it grants nothing beyond `ticket_images_public_read`, which is broader.
- The effective exposure comes from `ticket_images_public_read` + `public = true`:
  anyone (anon key is public in the browser bundle) can **list** every object in the bucket via the
  Storage API, not only fetch known URLs. Paths are `<ticket_uuid>/<timestamp>_<name>.webp`, so a listing
  reveals all ticket IDs and customer device photos.
- INSERT/DELETE: any authenticated user = every employee (9 auth users, all linked to `employees`,
  0 anonymous users). Deleting is not limited by role or ticket assignment.

### 7.2 How the app writes and shows images

| Path | Code | Client |
| --- | --- | --- |
| Public intake form upload | `submitTicketAction` — `src/app/actions/ticketActions.ts:117` (client), upload :223, URL :233 | **service_role** (`createAdminClient`) — bypasses storage RLS |
| Staff upload on ticket detail | `uploadTicketImageAction` — `src/app/(admin)/tickets/actions.ts:1164` (upload :1235, URL :1247) | session (`createClient`) → `ticket_images_auth_insert` |
| Delete one image | `removeTicketImageAction` — `actions.ts:1270` (:1291) | session → `ticket_images_auth_delete` |
| Delete all on cancel | `cancelTicketAction` — `actions.ts:1097` | session |
| Display | `repair_tickets.images[].url` rendered as `<img src={img.url}>` — `TicketDetailForm.tsx:1646`, `:1769` | — |

- URLs are **public URLs** from `getPublicUrl()` (`/storage/v1/object/public/ticket-images/...`), stored
  permanently in `repair_tickets.images`. **No signed URLs are used anywhere** (`createSignedUrl` not found in `src/`).
- Size is limited only in the app: 10 MB check (`actions.ts` `MAX_IMAGE_SIZE`, `src/lib/imageUpload.ts:61`),
  then `sharp` resize + WebP conversion. The bucket itself would accept any size/type from any
  authenticated client that bypasses the app.

### 7.3 Options for Brad (not implemented)

| # | Option | Effect | Impact / cost |
| --- | --- | --- | --- |
| A | Drop `Allow Public Access zutf89_0` | Removes an unused dashboard policy | **No functional impact today** (0 objects under `public/`). Pure cleanup. |
| B | Drop `ticket_images_public_read` (keep bucket public) | Stops anonymous **listing/enumeration** via the API; public URLs keep working because public buckets serve `/object/public/` without RLS | Low. Need to check that nothing lists the bucket as anon (app code does not). Staff listing would need an authenticated-only SELECT policy if ever required. |
| C | Set `file_size_limit` (e.g. 10 MB) and `allowed_mime_types` (image types incl. `image/webp`) | Server-side enforcement matching the app rule | Low. App already converts to WebP ≤ 10 MB; check HEIC originals are never uploaded raw. |
| D | Restrict INSERT/DELETE by role/assignment (e.g. via `get_my_role()` and ticket assignment) | Prevents any employee from deleting any ticket's images | Medium. Must mirror `tickets_update` rules; cancel flow deletes via session client and must keep working. |
| E | Make the bucket private + switch to signed URLs | Photos no longer reachable by URL alone | **High.** `images[].url` stores public URLs permanently → need URL generation at render time (server side), migration of 121 stored URLs or path-based rendering, changes in `TicketDetailForm`, intake flow, any customer-facing view; signed-URL expiry handling. |

Suggested order if Brad wants to tighten: A → C → B → D; E only as a separate project.

## KI-8. Local Postgres crashes on "permission denied for function"

Found 2026-09-28 (Phase 1 tests), local stack only (`supabase_db_digital-rescue`, PostgreSQL 17.6,
`shared_preload_libraries` incl. `pgaudit`, `plpgsql_check`, `pg_tle`, `plan_filter`, `supautils`, …).

- Calling **any** function the current role has no EXECUTE on (e.g. `SET ROLE anon; SELECT approve_material_dispatch(gen_random_uuid());`,
  or a fresh `public.zz_probe()` with EXECUTE revoked) kills the backend with **signal 11 (segfault)**;
  the postmaster restarts all connections. Table permission errors (42501 on SELECT/INSERT) do not crash.
- Not caused by Repair Intelligence migrations (reproduced with a baseline function and a throw-away function).
- **Production risk unknown.** If production behaves the same, an anonymous `POST /rest/v1/rpc/<revoked function>`
  would restart the database. **Must not be tested on production by Claude.** Brad may check with Supabase support
  or on a disposable project.
- Tests therefore verify function ACLs with `has_function_privilege()` instead of calling denied functions.

### 8.1 Root cause (investigated 2026-10-03, Phase 8 precondition)

All crash tests ran in a **disposable container** (`ki8-probe`, image `public.ecr.aws/supabase/postgres:17.6.1.104`, same as the dev
stack), removed afterwards. Dev stack and production were not used for crash tests.

| # | Setup | Result |
| --- | --- | --- |
| 1 | Default config, `SET ROLE anon; SELECT public.zz_probe()` (EXECUTE revoked) | **signal 11**, postmaster restarts all backends (log: `server process … was terminated by signal 11: Segmentation fault`, `Failed process was running: SELECT public.zz_probe()`) |
| 2 | Each shared library removed in turn (`plpgsql_check`, `plan_filter`, `pg_tle`, `auto_explain`, `pg_stat_statements`) | still crashes |
| 3 | `session_preload_libraries` empty (**no `supautils`**) | clean `ERROR: permission denied for function zz_probe` |
| 4 | Same server as #3, `supautils` loaded for one connection (`PGOPTIONS=-c session_preload_libraries=supautils`) | **crash** → the only difference is `supautils` |
| 5 | `supautils` loaded, role **not** in `supautils.hint_roles` (new role `zz_plain`) | clean error, no crash |
| 6 | `supautils` loaded, `anon` / `authenticated` / `service_role` (= `hint_roles`) | **crash** for each |
| 7 | `supautils` loaded, `anon`, **table** permission error | no crash; message has the hint "Grant the required privileges to the current role with: GRANT SELECT ON public.zz_t TO anon;" |
| 8 | `supautils` loaded, `anon`, connection-level `-c supautils.hint_roles=` (refused with "cannot be changed now") | no crash |

**Cause:** the `supautils` feature "enhanced permission hints" (`supautils.hint_roles`, function `hint_roles_check_hook` in
`supautils.so`) segfaults while building the hint for a **function** privilege error. It happens only when the current role is
listed in `supautils.hint_roles` (`anon, authenticated, service_role`). Table errors get a correct hint, so the crash is specific
to the function/routine object type. This is a bug in the Supabase-managed extension, not in this project's schema.

### 8.2 Production assessment (read-only, 2026-10-03)

| Fact (production, SELECT / SHOW / log query only) | Value |
| --- | --- |
| Server | PostgreSQL 17.6, **aarch64** (local is x86_64) |
| `shared_preload_libraries` | identical to local |
| `session_preload_libraries` | `supautils` |
| `supautils.hint_roles` | `anon, authenticated, service_role` — identical |
| `public` functions callable over REST that **anon** cannot execute | `approve_material_dispatch`, `apply_refund_material_adjustments`, `recalc_ticket_material_cost`, `request_refund`, `transition_refund` (+ 3 trigger-only functions) |
| … that **authenticated** cannot execute | `approve_material_dispatch`, `apply_refund_material_adjustments` (+ 3 trigger-only) |
| Postgres log, last 24 h: `signal 11` / `terminated by signal` / `automatic recovery` / `permission denied for function` | none (only a 24 h window can be queried) |

> **Correction 2026-10-03 (Phase 0.6 planning) — see §8.3.** The REST path is most likely **not** affected.
> The judgement below was written before the `authenticator` role setting was checked.

**Original judgement (superseded): production is very likely affected.** It runs the same extension with the same configuration, and the fault is a
code-path bug (NULL / invalid access during hint building), not something tied to the CPU architecture. The exact `supautils`
build in production cannot be read without OS access. If affected, anyone holding the public anon key could restart the
production database with one `POST /rest/v1/rpc/approve_material_dispatch` (or any of the functions above), as long as PostgREST
forwards the call to Postgres. Not verified on purpose: it must not be tested on production.

**Phase 8 relevance:** `vector_agent` would **not** be in `hint_roles` (#5), so the agent path itself does not trigger the crash.
The production exposure through anon / authenticated exists today, independent of Repair Intelligence.

**Options for Brad (none implemented):**
1. Report to Supabase support with the reproduction above (#1, #4–#6) and ask for a fixed `supautils` / Postgres image, or ask
   them to clear `supautils.hint_roles` for the project. The setting is managed (SIGHUP, not changeable by `postgres`).
2. Check whether "Upgrade project" in the dashboard offers a newer Postgres image. Reproduce first on a disposable project.
3. Interim, needs a separate approved plan because it changes existing grants (R2): make the 5 REST-reachable functions
   unreachable for anon. For example, move them to a non-exposed schema, or put a role check inside and GRANT EXECUTE.
   `approve_material_dispatch` has no internal role check, so it must not simply be granted.

### 8.3 Which sessions crash (2026-10-03, local stack + read-only production catalog)

- **Production and local** both set `authenticator.rolconfig = {session_preload_libraries=safeupdate, statement_timeout=8s, lock_timeout=8s}`.
  PostgREST logs in as `authenticator`. A role-level `session_preload_libraries` **replaces** the global value
  `supautils`, so REST sessions do not load `supautils`.
- **Local REST tests (`curl`, PostgREST v16.3):**

  | Caller | Function | Result |
  | --- | --- | --- |
  | anon | `approve_material_dispatch`, `ri_recompute_compatibility`, `recalc_ticket_material_cost` | `401` `{"code":"42501","message":"permission denied for function …"}` |
  | authenticated (seed TECHNICIAN JWT) | `apply_refund_material_adjustments`, `approve_material_dispatch` | `403` |
  | service_role | `ri_compatibility_row` | `403` |
  | anon | trigger function `protect_canceled_ticket` | `404` (PostgREST does not expose trigger functions) |

  **No crash.** The DB log shows plain `ERROR: permission denied` lines from `authenticator@postgres`.
- **Direct proof:** login as `authenticator` with `psql` → `SET ROLE anon` → call `approve_material_dispatch` → clean `permission denied`, no crash.
- **Crashing sessions** = logins whose role has **no** `session_preload_libraries` override, so `supautils` loads, followed by
  `SET ROLE anon | authenticated | service_role` and a call to a function without EXECUTE:
  - `postgres` in the Studio SQL editor, including the "run as role" impersonation;
  - Supavisor / direct connections as `postgres`;
  - migrations and pgTAP;
  - the Management API SQL endpoint;
  - any new login role (e.g. the planned `vector_agent`, which is safe because it is not in `hint_roles` and cannot `SET ROLE`).
- **Revised judgement:** production is affected **only through privileged operator sessions** (`postgres` / dashboard).
  It is **not exploitable with the public anon key or an employee JWT**, provided Supabase keeps the `authenticator` override.
  This is high confidence: the configuration is identical, and the mechanism was demonstrated locally. It remains untested on production by design.

### 8.4 Fix — Phase 0.6 (local, 2026-10-03; production with the final release)

- Migrations `20260928043332_api_guard_baseline.sql` (0.6a) and `20261003141631_api_guard_ri.sql` (0.6b), report `phases/phase-0.6-report.md`.
- Every exposed function that withheld EXECUTE from a hint role now grants it and refuses inside:
  - 39 functions get one guard statement;
  - 10 trigger functions and `catalog_normalize` get the grant only.
- Rule **R10** (`03-working-rules.md`).
- Local: the crash reproduction no longer crashes (0 × signal 11). Business flows are byte-identical. pgTAP 881/881.
- **Production is unchanged until the final release** (`04-final-release-plan.md`, order 0.5 → 0.6a → … ). No hotfix, no manual production application (Brad, 2026-10-03).

### 8.5 Supabase 신고 시 함께 요청할 것 (Phase 8, 2026-10-04)

- `supabase-support-report.md`로 KI-8을 신고할 때 **`vector_agent`의 `temp_file_limit` 설정 요청을 같은 티켓에 포함**한다
  (신고서 "Requests" #4에 추가됨).
- 요청 SQL: `ALTER ROLE vector_agent SET temp_file_limit = '10MB';`
- 이유: `temp_file_limit`은 슈퍼유저 전용 파라미터라 `postgres`(마이그레이션·SQL Editor)로는 설정할 수 없다 (Phase 8 결정 O1 (a), `phases/phase-8-report.md`).
- 전제: Phase 8 마이그레이션이 운영에 적용되어 역할이 존재한 뒤에 요청한다. 프로젝트 ref는 신고서 문서가 아니라 티켓에만 적는다.
- 설정 확인 (`postgres`, 읽기 전용): `SELECT setconfig FROM pg_db_role_setting WHERE setrole = 'vector_agent'::regrole;` → `temp_file_limit=10MB` 포함.

> **운영 주의사항 (일괄 배포 전까지):** 운영 Supabase **SQL Editor에서 역할 전환(impersonation, "Run as role" anon/authenticated/service_role)으로 함수를 호출하지 마세요.**
> 권한 없는 함수를 호출하면 DB 전체가 재시작됩니다(위 §8.1). `postgres`로 직접 실행하는 일반 SQL은 해당되지 않습니다.

## KI-9. `protect_approved_ticket`: `current_role` shadowed by the SQL keyword

Found 2026-09-28 (Phase 1). The function declares a variable `current_role employee_role` and does
`SELECT role INTO current_role …; IF current_role = 'ADMIN' …`. In PL/pgSQL expressions `current_role` is the
SQL keyword `CURRENT_ROLE` (the executing DB role). The function is SECURITY DEFINER, so it evaluates to
`postgres` → the ADMIN and MANAGER branches never match, and every update of an approved ticket raises
"승인 완료된 접수건은 수정할 수 없습니다. (권한: postgres)" — for ADMIN too.
Verified locally: ADMIN (`get_my_role() = ADMIN`) updating `symptoms` of an approved ticket fails. Production has
the same function body (Phase 0.1 parity).

- Effective behaviour today: approved tickets can only change through the `app.refund_sync` GUC or a
  `has_admin_message`-only change. Code that "uses the admin client to bypass" (e.g. `toggleTestFlagAction`) is also blocked.
- Fixing it (renaming the variable) would **change behaviour**: ADMIN could edit approved tickets, MANAGER everything except price.
  Separate decision for Brad; not part of Phase 1.

## KI-10. RECEPTION cannot cancel tickets (RLS)

Found 2026-10-01 (Phase 2 E2E), local stack; the policy is identical in production (Phase 0.1 parity).

- `tickets_update` has only a USING clause (`RECEPTION → status = 'NEW'`). Without WITH CHECK, Postgres applies USING to the
  **new** row as well, so a RECEPTION update that changes the status away from `NEW` (cancel → `CANCELED`) fails with
  `new row violates row-level security policy for table "repair_tickets"`.
- `cancelTicketAction` has no role check and uses the session client, so the "접수 취소" button is shown to RECEPTION but always fails
  with "취소 처리에 실패했습니다: new row violates …". Reproduced with a plain SQL UPDATE as the seed RECEPTION user (rolled back).
- Not caused by Phase 2 and not changed (R2). With the cancel gate ON, the chosen cancel type is saved before the failing update.
- Options for Brad: add a WITH CHECK allowing RECEPTION `NEW → CANCELED`, or hide the button for RECEPTION.

## KI-11. `approve_material_dispatch` has no role check of its own

Found 2026-10-03 (Phase 0.6 planning). Recorded only — Brad to decide.

- The function (baseline, purchase branch from Phase 0.5) checks stock and request state, but **not who calls it**.
  It is SECURITY DEFINER without `search_path` (advisor `function_search_path_mutable`, pre-existing).
- Today the only caller is `approveMaterialDispatchAction` (`src/app/(admin)/tickets/actions.ts`), which checks ADMIN / MANAGER and then
  calls the RPC with the **service_role** admin client.
- Phase 0.6 kept the access exactly as before:
  - anon → "로그인이 필요합니다. 다시 로그인해 주세요.";
  - authenticated → "직접 호출할 수 없는 함수입니다.";
  - service_role → allowed.

  Brad's earlier "로그인 필수만" request was withdrawn because it would let every logged-in employee approve dispatches over REST.
- Consequence: anything holding the service_role key (server code, the n8n inventory webhook's environment) can approve any dispatch.
- Possible hardening (separate plan, R2):
  - check `p_user_id` against `employees.role IN ('ADMIN','MANAGER')` inside the function;
  - set `search_path = public`;
  - optionally switch the action to the session client, with an `authenticated` + role check.

## KI-12. Server actions without their own login / role check

Found 2026-10-04 (Phase 0.6 follow-up audit, `phases/phase-0.6-report.md` → "후속 점검"). Recorded only — fixed in **Phase 0.6.1** (separate session, after Phase 8).

Since Phase 0.6 the proxy no longer redirects server-action requests without a session, so every action must check login itself.
The audit of all 151 exported actions in 16 `"use server"` files found:

- **`src/app/actions/statisticsActions.ts` — 9 actions with no login and no role check** (`getAnnualRevenue`, `getMonthlyDailyRevenue`,
  `getTechnicianMonthlyRevenue`, `getTechnicianPerformance`, `getBrandBreakdown`, `getStatusBreakdown`, `getReceiptTypeBreakdown`,
  `getCancelStats`, `getRefundStats`).
  - anon: session client + RLS → 0 rows (no leak).
  - The `/stats` page is ADMIN / MANAGER only, but a direct call returns what RLS allows:
    RECEPTION → every ticket (revenue), CS → all completed tickets (revenue), TECHNICIAN → own tickets.
- `src/app/actions/inventoryActions.ts` `requireAuth()` still returns the old text "로그인이 필요합니다." (not updated in Phase 0.6 decision 6).
- `lookupPastEvaluatedValue` (`src/app/(admin)/tickets/actions.ts`): login check only, then reads `device_models` (release price / year)
  and past `repair_tickets` (`evaluated_value`, `tag_info`) with the **service_role** client, i.e. bypassing RLS, for any role.
  Used by `EstimateCard`. Whether a role limit is needed is to be investigated in the Phase 0.6.1 plan.
- Intentionally public (no change): `submitTicketAction` (customer receipt form), `loginAction`, `logoutAction`.

Phase 0.6.1 scope (Brad, 2026-10-04): login + ADMIN/MANAGER check in the 9 statistics actions; unify the `requireAuth` message to
"로그인이 필요합니다. 다시 로그인해 주세요."; investigate `lookupPastEvaluatedValue` and include a decision in the plan.

**Fixed in Phase 0.6.1 (2026-10-04, `phases/phase-0.6.1-report.md`, commit `b43eb58`):**
- the 9 statistics actions check login + ADMIN / MANAGER and return `{ data } | { error }`;
- `requireAuth()` returns "로그인이 필요합니다. 다시 로그인해 주세요.";
- `lookupPastEvaluatedValue`: ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR only (= the roles that see `EstimateCard`); RECEPTION / CS get `{ data: null }`.
  The service_role read stays (technicians value a device from **other** tickets; it returns device-value numbers only, no PII).

## KI-13. `ilike` / PostgREST filters: user input not escaped

Found 2026-10-04 (Phase 0.6.1 planning). **Recorded only — not changed** (Phase 0.6.1 approval condition 2). Brad to decide.

User input is put into `ilike` patterns as `%${input}%` without escaping the LIKE wildcards `%` and `_` (and, in `.or()` filter strings,
PostgREST syntax characters other than `,`). Effect: the input matches more than typed (`_` = any one character, `%` = anything).
No privilege change — each query still runs with the same client and filters as before.

| Location | Input | Client | Effect |
| --- | --- | --- | --- |
| `src/app/(admin)/tickets/actions.ts` `lookupPastEvaluatedValue` — `.ilike("brand" / "tag_info")` on `device_models`, `.ilike("device_brand" / "tag_info")` on `repair_tickets` (tag branch) | `EstimateCard` brand / tag info | service_role | broader match; usually ends in `multipleResults` (one value is returned only for a unique match) |
| same function — `.ilike("brand" / "model_name")`, `.ilike("device_brand" / "device_model")` (model branch) | brand / model | service_role | same |
| `src/app/(admin)/tickets/page.tsx` — `.or("name.ilike.%…%,phone.ilike.%…%", { referencedTable: "customers" })` | ticket list search box | session (RLS) | `,` is stripped; `%` / `_` act as wildcards; other filter-syntax characters (e.g. `(`, `)`) may make the filter fail → no results |
| `src/app/actions/inventoryActions.ts` `getInventoryItems` — `.ilike("capacity", …)` | inventory search | session (RLS) | broader match |

Not affected: the Repair Intelligence SQL functions (`catalog_*`, `part_spec_search`) compare with `LIKE` only after `catalog_normalize()`,
which keeps only `[0-9A-Za-z가-힣]`, so `%` / `_` cannot reach the pattern. The label lookups use fixed patterns (`'P-%'`, `'D-%'`).
Possible fix (separate plan): a small `escapeLike()` helper (`\`, `%`, `_` → escaped) used at the 4 locations.

## KI-14. Deleting an alias created by an approved AI candidate fails

Found 2026-10-04 (Phase 9 planning), local stack. Phase 8 object — not in production yet.

- `ai_candidates.result_alias_id` references `part_number_aliases` **ON DELETE SET NULL**. The FK action is an UPDATE on `ai_candidates`,
  so the BEFORE UPDATE trigger `ai_candidates_protect` runs. It refuses every update of a processed candidate ("이미 처리된 후보입니다.").
- Effect: an ADMIN cannot delete a part alias that was created by approving an AI candidate (기기 마스터 → 부품 규격 → 별칭 삭제, `deletePartAliasAction`);
  the delete fails with "이미 처리된 후보입니다.".
- **Fix (Phase 9 decision D5, separate commit):** `20261004100000_ki14_ai_candidates_result_delete.sql` — `CREATE OR REPLACE ai_candidates_protect()`:
  on a processed candidate, an UPDATE whose **only** change is `result_alias_id → NULL` is allowed (the generated `alias_norm` is ignored in that
  comparison because it is not yet computed in `NEW` of a BEFORE trigger; it follows `alias`, which is compared). Everything else unchanged.
- Tests: `supabase/tests/ki14_ai_candidate_result_delete.test.sql` (9). Before the fix: tests 2–4 fail (reproduction). After: 9/9.
- Rollback: `supabase/test-fixtures/ki14/rollback.sql` (Phase 8 body, verbatim). Snapshot: only the function body differs; rollback → identical.
- Phase 9 extends the same rule to its two new result columns (`result_model_alias_id`, `result_board_alias_id`).

## KI-15. Device-label n8n webhook has no authentication

Found 2026-10-04 (Phase 9 planning, §2.1). **Recorded only** (Phase 9 decision D9).

- `analyzeDeviceLabelAction` (`src/app/(admin)/tickets/actions.ts`) posts the label photo (base64) to `process.env.N8N_DEVICE_WEBHOOK_URL`
  with only `Content-Type` — no secret header. The action itself checks login.
- Anyone who learns the webhook URL can call that n8n workflow directly and use the OpenRouter credit behind it
  (and receive AI value estimates). It does not reach the database (the workflow only answers JSON; the app writes the cache).
- The Phase 9 photo-recognition workflow is separate and uses Header Auth (`X-RI-Secret`).
- Option at deployment (`04-final-release-plan.md` §7 "Optional at deployment"): the app sends a header + Header Auth on that webhook,
  app first. Needs its own approved plan (changes an existing action).
