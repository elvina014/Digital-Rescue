# Phase 0.1 — Migration baseline — REPORT

Executed 2026-09-27 on branch `feat/repair-intelligence`. Plan: `phase-0.1-plan.md` (APPROVED with 5 conditions).
**Production was not written to.** Claude ran SELECT queries only; the dump was run by Brad.

## Result

| Acceptance criterion | Result |
| --- | --- |
| `supabase db reset` succeeds twice in a row | ✅ 4 clean runs (`start` + 3× `db reset`, the last after the ACL fix) |
| Schema parity with production | ✅ 13/13 catalog categories identical (hash comparison, see below) |
| No production data locally | ✅ seed only: 6 `@example.test` users, 5 `테스트고객*`, 10 tickets |
| Generated types, existing build unaffected | ✅ `src/types/supabase.ts` (not imported by existing code); typecheck/lint/build pass |
| Only SELECT on production | ✅ (queries listed below) |

## What changed

| Kind | Path |
| --- | --- |
| New | `supabase/config.toml` (project_id `digital-rescue`, Postgres 17), `supabase/.gitignore` (+ `baseline_raw/`) |
| New | `supabase/migrations/20260927141005_baseline.sql` |
| New | `supabase/seed.sql` |
| New | `supabase/migrations_archive/README.md` |
| Moved | `supabase/migrations/0*.sql` (43 files, 001–042 incl. both 019) → `supabase/migrations_archive/` (git mv, unchanged) |
| New | `src/types/supabase.ts` (generated) |
| Changed | `package.json` / `package-lock.json`: devDependency `supabase` pinned `2.118.0`; scripts `typecheck`, `db:types` |
| Docs | `known-issues.md` (KI-3 resolved, KI-5 filled, KI-7 added), `02-roadmap.md`, `03-working-rules.md`, this report |

No application code (`src/app`, `src/components`, `src/lib`) was changed.
Not committed (pre-existing, not mine): staged deletions of `.claude/worktrees/*`, `.gitignore`, `.claude/settings.local.json`.

## Dump check (plan step 2b)

`supabase/baseline_raw/schema.sql` (2,906 lines, not committed):

| Check | Matches |
| --- | --- |
| connection strings / password / pooler host / ports / sslmode / keys / JWT (`eyJhbGci`) | 0 |
| data rows (`COPY`, `INSERT INTO`) | 0 |
| project ref `wnddkgeohcgcidoklrps` | 0 |
| role statements / role passwords | 0 |

## Baseline composition

1. **Dump, unmodified** (CRLF → LF only). No statements were removed — nothing failed locally.
2. **Storage section** (not in the dump), reconstructed from production's catalog as-is:
   buckets `ticket-images` (public, no size/MIME limit) and `page-content-images` (public, 10 MB, 6 image types);
   8 `storage.objects` policies with production names and expressions, including
   `Allow Public Access zutf89_0` (see KI-7). No changes.
3. **Function EXECUTE privileges section** — found by the parity check (see below).

### Finding: function privileges were not reproduced by the dump

`pg_dump` writes function ACLs relative to the built-in default (PUBLIC) only. On a fresh Supabase
database, `ALTER DEFAULT PRIVILEGES` grants EXECUTE to `anon`/`authenticated` at creation, so the
explicit revocations made in production (archived 031, 039, 041, 042) were lost. Before the fix, the
local DB let `anon` execute e.g. `approve_material_dispatch` and `apply_refund_material_adjustments`.
The baseline now restates production's ACLs for 8 functions:

| Function | Production EXECUTE |
| --- | --- |
| `apply_refund_material_adjustments`, `approve_material_dispatch`, `generate_refund_no`, `protect_canceled_ticket`, `sync_ticket_refunded_amount` | postgres, service_role |
| `recalc_ticket_material_cost`, `request_refund`, `transition_refund` | postgres, authenticated, service_role |

Production itself was not affected. Relevance: any future migration that creates a function must
REVOKE explicitly (R4) — this is the same default-privilege behaviour as in production.

## Parity check (plan step 7)

Same catalog query on production (MCP) and local (`docker exec supabase_db_digital-rescue psql`);
per-category count + md5 of sorted `name=definition` lines:

| Category | Count | Prod = Local |
| --- | --- | --- |
| columns (type, nullability, default, length) | 176 | ✅ |
| enums (labels in order) | 13 | ✅ |
| functions (args, SECURITY DEFINER, proconfig, ACL, body md5) | 17 | ✅ (after ACL section) |
| triggers (definition, enabled) | 12 | ✅ |
| RLS enabled/forced | 18 | ✅ |
| policies public + storage (permissive, cmd, roles, qual, with_check) | 64 | ✅ |
| indexes | 67 | ✅ |
| constraints | 66 | ✅ |
| table/column comments | 61 | ✅ |
| function comments | 1 | ✅ |
| table/sequence ACLs | 18 | ✅ |
| storage buckets (public, limit, MIME) | 2 | ✅ |
| extensions (name, schema) | 5 | ✅ |

## Seed (`supabase/seed.sql`)

- 6 employees (one per role) + auth users `admin|manager|reception|tech|expert|cs@example.test`;
  the local-only test password is in the seed header. Sign-in verified against local Auth (`tech@example.test`).
- `global_settings` (production pricing parameters), `page_contents` 25 rows (archived 021 + 022 default copy).
- Inventory: 3 categories, 3 specs (incl. `외주`), 5 products, 6 items — incl. qty-0 items (Phase 0.5 purchase test) and one outsourced item.
- 5 fake customers, 10 tickets (NEW ×2, ASSIGNED, RECEIVED, IN_PROGRESS ×2, WAITING_APPROVAL, COMPLETED approved, CANCELED DISPOSE / RETURN).
- 8 `ticket_materials`: pending, requested (dispatch + **purchase**), rejected, approved ×2 (one with extracted-part registration pending, capacity 256GB), cancel_requested, cancelled.
- `inventory_transactions` consistent with quantities (checked: 0 mismatches).

## Checks

| Command | Result |
| --- | --- |
| `npm run typecheck` | ✅ 0 errors (no pre-existing errors to list) |
| `npm run lint` | ✅ 0 errors, 16 warnings — all pre-existing (`no-img-element`, one `exhaustive-deps`); none in `src/types/supabase.ts` |
| `npm run build` | ✅ success |

## Production queries run (all SELECT)

`storage.buckets`, `pg_policies` (storage), `storage.objects` counts/sizes/folders, `auth.users` counts,
`pg_proc` / `pg_policies` / `information_schema.columns` search for `cancel_method` / `disposal_confirmed`,
the parity catalog query, per-function ACL/body hashes.

## For Brad — production migration history (NOT executed)

Run in `C:\Users\BRAD\Documents\workspace\Digital-Rescue`:

```bash
npx supabase login
npx supabase link --project-ref wnddkgeohcgcidoklrps
npx supabase migration repair --status reverted 20260504055736 20260505035051 20260528114402 20260603100748 20260607231033 20260608074654 20260608082809 20260608091709 20260609023751 20260610061752 20260903112727 20260903113529 20260903113735 20260903113954 20260903114406 20260903114537 20260914114955 20260914130318
npx supabase migration repair --status applied 20260927141005
npx supabase migration list
```

Effect on production: only `supabase_migrations.schema_migrations` changes — 18 history rows deleted
(`reverted`), 1 row inserted for `20260927141005` (`applied`). No SQL from the baseline is executed;
schemas, data, functions, RLS, storage are untouched. Minimal alternative (only the `applied` line):
+1 row, but the CLI will then report 18 remote-only versions and `db push` will refuse.
Undo: `repair --status reverted 20260927141005` + `repair --status applied <18 versions>`.

## How Brad verifies

1. `git show --stat HEAD` — only the files listed above.
2. With Docker Desktop running, in the project root:
   `npx supabase start` then `npx supabase db reset` → ends with "Finished supabase db reset".
3. Studio at http://127.0.0.1:54323 → `repair_tickets` shows 10 test tickets, `customers` only `테스트고객*`.
4. `npm run typecheck`, `npm run lint`, `npm run build`.

## Risks / notes

- Keep the storage and ACL sections in mind if the baseline is ever regenerated: a new dump again
  won't contain them.
- The raw dump stays in `supabase/baseline_raw/` (git-ignored). Brad may delete it.
- The app is not yet pointed at the local DB (`.env.local` unchanged) — out of scope; can be proposed with Phase 0.5.
- Local stack keeps running until `npx supabase stop`.
