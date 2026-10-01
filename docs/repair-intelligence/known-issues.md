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
| KI-8 | Local Postgres crashes on "permission denied for function" | Recorded (Phase 1) — do NOT probe on production |
| KI-9 | `protect_approved_ticket`: `current_role` variable is the SQL keyword → ADMIN/MANAGER branches never match | Recorded (Phase 1) — Brad to decide |
| KI-10 | RECEPTION cannot cancel tickets (`tickets_update` has no WITH CHECK) | Recorded (Phase 2) — Brad to decide |

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
- **Fixed in Phase 0.5** (purchase branch only; dispatch path unchanged; app fallback skipped for purchases) — see `phases/phase-0.5-report.md`. Production deploy pending (app first, then migration).

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
