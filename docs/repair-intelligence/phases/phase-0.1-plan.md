# Phase 0.1 — Migration baseline (마이그레이션 기준점 정리) — PLAN

Status: **awaiting Brad's "APPROVED"**. Nothing below has been executed.

## Goal

One baseline migration that reproduces the **current production schema** exactly, applied cleanly to
a **local Docker Supabase** with fake seed data. Generated types and a `typecheck` script are added.
Production is never written to (SELECT via MCP only; history repair commands are run by Brad).

## Decisions this plan relies on

- Q9: dev target = local Supabase on Docker. Docker Desktop 29.8.0 is installed per-user
  (`%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe`), engine running.
  A fresh shell is needed for `docker` to be on PATH.
- Archive **all** of `supabase/migrations/001–042` (43 files). If only 001–023 were archived,
  `db reset` would replay 024–042 on top of a full baseline and fail (e.g. 027 `ADD COLUMN receipt_no`).
- Brad runs the production schema dump himself (the DB password never passes through Claude).
- Q10: generated types go to a new file; existing code keeps the hand-written types.

## Steps

### 1. Supabase CLI (local only)
- `npm i -D supabase` → pinned in `package.json` / `package-lock.json`.
- `npx supabase init` → `supabase/config.toml`, `supabase/.gitignore`.
  Set `[db] major_version = 17` (production is Postgres 17.6). `project_id = "digital-rescue"`.
  No secrets in `config.toml`.
- Add `supabase/baseline_raw/` to the root `.gitignore` (raw dump is a working file, not committed).

### 2. Production schema dump — **run by Brad**
Get the **Session pooler** URI from Dashboard → Connect (it contains the password; do not paste it to Claude).
```bash
npx supabase db dump --db-url "<SESSION_POOLER_URI>" -f supabase/baseline_raw/schema.sql
```
- Default `db dump` = schema only (no data), excludes Supabase-managed schemas (auth, storage, …).
- Do not use `--data-only`. Tell Claude when the file exists.

### 3. Assemble the baseline
File: `supabase/migrations/<UTC timestamp at execution>_baseline.sql` (must be later than the last
production history version `20260914130318`). Saved with LF line endings.

Sections:
1. **public schema** — the dump as-is: enums, tables, sequences, functions, triggers, RLS policies,
   indexes, constraints, comments, GRANT/REVOKE.
   Remove only statements that fail locally because they refer to platform-owned objects/roles;
   every removal is listed in the report.
2. **storage** — not in the dump; reconstructed **from production's catalog, not from archived files**,
   because production has drifted:

   | Object | Archived file says | Production has |
   | --- | --- | --- |
   | bucket `ticket-images` | `file_size_limit` 10 MB (026) | `NULL` (no limit) |
   | `ticket-images` policies | `ticket_images_select/insert/delete` (026) | `ticket_images_public_read`, `ticket_images_auth_insert`, `ticket_images_auth_delete` |
   | extra policy | — | `Allow Public Access zutf89_0` (SELECT, created in dashboard) |
   | bucket `page-content-images` + 4 policies | 023 | matches by name |

   Method: MCP SELECT of `storage.buckets` and `pg_policies WHERE schemaname='storage'`
   (qual / with_check / roles) → `INSERT … ON CONFLICT (id) DO UPDATE` for buckets +
   `CREATE POLICY` statements reproducing production exactly. The dashboard-created
   `Allow Public Access zutf89_0` policy is reproduced too and flagged in the report for Brad
   to review (it may widen access).
3. **extensions** — only what production has installed (`pgcrypto`, `uuid-ossp`,
   `pg_stat_statements` in `extensions`; `supabase_vault`); verify the local stack already provides them.

### 4. Archive old migrations
```bash
git mv supabase/migrations/0*.sql supabase/migrations_archive/
```
(43 files incl. both 019 files; no deletes, git history preserved.)
Add `supabase/migrations_archive/README.md`: "History before the baseline. Never executed. Do not edit."

### 5. `supabase/seed.sql` — fake data only
No production customer data is copied.
- `auth.users` + `auth.identities` + `employees`: one fake employee per role (6), emails
  `*@example.test`. Local-only test password documented **in the seed file only**.
- `global_settings`: the single row with production's pricing parameters
  (base_service_cost 132000, value_reference_amount 1500000, discount_surcharge_rate 100) — configuration, not customer data.
- `page_contents`: default CMS copy from archived `021_page_contents.sql` §4 (public website text),
  so the local site renders.
- Inventory: ~3 categories, ~4 specs (incl. `외주`), ~5 products, ~8 items, including
  - an in-stock dispatchable item,
  - a **qty-0 item** (Phase 0.5 purchase test),
  - one outsourced (`외주`) item.
- 5 fake customers (`테스트고객1…`, `010-0000-000x`); ~10 tickets covering
  NEW / ASSIGNED / RECEIVED / IN_PROGRESS / WAITING_APPROVAL / COMPLETED (approved) / CANCELED (RETURN, DISPOSE).
- `ticket_materials` in states pending / requested / approved / cancel_requested / cancelled,
  one `purchase` request, one extracted-part registration (`is_return_registered`, `return_status='pending'`).
- Matching `inventory_transactions` so quantities are consistent.

### 6. Local run
```bash
npx supabase start
npx supabase db reset
npx supabase db reset
```
Both resets must finish with no errors. (First `start` downloads several GB of images.)

### 7. Parity check (production vs local)
Run the same catalog queries on production (MCP, SELECT) and local
(`docker exec supabase_db_digital-rescue psql -U postgres -At -c …`), normalise, diff:
- tables/columns (type, nullability, default), enum labels in order,
- functions (identity args, SECURITY DEFINER, proconfig, ACL, `md5(prosrc)`),
- triggers, RLS enabled flags, policies (cmd, roles, qual, with_check),
- indexes, constraints (definition), comments,
- storage buckets and storage policies, installed extensions.

Expected: no differences. Any difference is fixed or explained in the report.

### 8. Types and scripts
- `package.json` scripts:
  - `"typecheck": "tsc --noEmit"`
  - `"db:types": "supabase gen types typescript --local > src/types/supabase.ts"`
- `npm run db:types` → new file `src/types/supabase.ts` (not imported by existing code).
- Run `npm run typecheck`, `npm run lint`, `npm run build`. Existing errors are **not fixed**;
  if there are many, the list goes into the report.
- Fill `known-issues.md` KI-5: differences between `src/types/database.ts` / `enums.ts` and the
  generated types (missing columns, nullability, enum values).

### 9. Production history repair — **commands for Brad, not executed by Claude**
```bash
npx supabase login
npx supabase link --project-ref wnddkgeohcgcidoklrps
npx supabase migration repair --status reverted 20260504055736 20260505035051 20260528114402 20260603100748 20260607231033 20260608074654 20260608082809 20260608091709 20260609023751 20260610061752 20260903112727 20260903113529 20260903113735 20260903113954 20260903114406 20260903114537 20260914114955 20260914130318
npx supabase migration repair --status applied <BASELINE_TIMESTAMP>
npx supabase migration list
```
- `repair` only edits rows in `supabase_migrations.schema_migrations`; no schema or data change.
- Without it, later `db push` / `migration list` report local/remote mismatches.
- The final command list (with the real `<BASELINE_TIMESTAMP>`) is repeated in the report.

### 10. Docs, report, commit
- Update `03-working-rules.md` / `CLAUDE.md` workflow notes and the team memory entry on migrations.
- Write `phases/phase-0.1-report.md` (what changed, files, removed dump statements, parity result,
  typecheck/lint/build results, how Brad verifies, risks).
- Local commit on `feat/repair-intelligence`. No push.

## Files

| New | Changed | Moved |
| --- | --- | --- |
| `supabase/config.toml`, `supabase/.gitignore`, `supabase/migrations/<ts>_baseline.sql`, `supabase/seed.sql`, `supabase/migrations_archive/README.md`, `src/types/supabase.ts`, `phases/phase-0.1-report.md` | `package.json`, `package-lock.json`, `.gitignore`, `docs/repair-intelligence/known-issues.md`, `03-working-rules.md`, `CLAUDE.md` | `supabase/migrations/0*.sql` → `supabase/migrations_archive/` |

No application code (`src/app`, `src/components`, `src/lib`) is changed.

## Rollback

- Repo: `git revert <phase-0.1 commit>` restores the migrations folder, removes baseline/config/seed/types/scripts.
- Local: `npx supabase stop --no-backup` removes containers and volumes.
- Production: untouched by Claude. If Brad has run step 9, reverse it:
  `migration repair --status reverted <BASELINE_TIMESTAMP>` and
  `migration repair --status applied <the 18 versions>`.

## Test plan / acceptance

1. `npx supabase db reset` succeeds twice in a row.
2. Parity diff (step 7) is empty, or every difference is explained in the report.
3. Local DB contains only seed data (spot check: customers are `테스트고객*`, emails `@example.test`).
4. `src/types/supabase.ts` generated; `npm run build` result identical to before (existing code doesn't import it).
5. Only SELECT statements were run against production; every query is listed in the report.

## Risks

- Dump may contain platform-owned statements that fail locally → removed and listed (step 3).
- Storage drift (see table) → reconstructed from production catalog; the dashboard-created public
  policy is surfaced for Brad's review, not silently dropped or changed.
- `auth.users` seeding depends on the local GoTrue schema version; fallback is creating users through
  the local Auth admin API in a seed script.
- Image download size/time for `supabase start` (machine has 32 GB RAM — sufficient).
- Filename scheme changes from `NNN_` to timestamps; old habits (MCP `apply_migration` to production)
  must stop — updated in rules and memory.
- `typecheck` may surface many pre-existing errors → reported, not fixed (Q10).

## Out of scope

Phase 0.5 bug fix, any schema change, KI-1/KI-2/KI-3 fixes, `.env` changes to point the app at the
local DB (can be proposed later).
