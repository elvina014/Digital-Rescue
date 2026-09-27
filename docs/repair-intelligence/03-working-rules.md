# Repair Intelligence — Working Rules

Read `01-design-principles.md`, `02-roadmap.md`, `00-current-state.md` and the relevant
`phases/*.md` before any Repair Intelligence work. These rules are strict.

**R1. One phase per session.**
First write `docs/repair-intelligence/phases/phase-N-plan.md` (tables, columns, functions, RLS,
UI files, migration names, rollback SQL, test plan, risks) and STOP. Implement only after Brad
replies "APPROVED".

**R2. Additive changes only.**
New tables, new nullable columns, new functions. No DROP / RENAME / type changes on existing
objects, and no changes to existing triggers or functions unless the approved plan explicitly lists them.

**R3. Migrations.**
New files only (never edit existing migrations). Every plan includes rollback SQL.
Apply ONLY to the development target Brad specifies. Never apply to production; Brad does that.
If a Supabase MCP is available, use it read-only for production; never run DDL/DML there.

**R4. Security.**
Every new table: RLS enabled, policies mirroring the existing role pattern (`get_my_role()`).
Every SECURITY DEFINER function sets `search_path` explicitly and checks the caller's role.
Run the Supabase security/performance advisors after migrations and fix new findings.

**R5. Transactions & UX.**
Inventory-affecting logic lives in Postgres functions executing as one transaction.
UI uses optimistic updates with rollback on error, and Korean validation warnings.

**R6. Verification & report.**
After implementation: regenerate Supabase TypeScript types; typecheck, lint and build must pass;
run the test plan. Write `phases/phase-N-report.md` (what changed, files, migrations, how Brad
verifies, known risks) and give the summary in Korean.

**R7. Git.**
Work on branch `feat/repair-intelligence`. Commit locally per phase with a clear message.
Never push, never merge, never deploy — Brad does that.

**R8. Stop on ambiguity.**
If anything is ambiguous, conflicts with the real schema, or a step fails twice: STOP and ask.
Do not guess, do not work around principles, do not silently widen scope.

**R9. Business data is untouchable.**
Never delete or modify existing business data. Backfills only through the confirmed tools
defined in the approved plan.

## Project-specific notes (from Phase 0)

- **Dev target = local Supabase on Docker** (decision Q9). Production (`wnddkgeohcgcidoklrps`) is
  read-only for Claude; Brad applies migrations to production himself.
  Until Phase 0.1 is complete, no migration may be applied anywhere.
- Since Phase 0.1 (baseline `20260927141005_baseline.sql`): migrations are `supabase/migrations/<timestamp>_name.sql` on top of the
  baseline; files 001–042 live in `supabase/migrations_archive/` (history only, never executed).
  Workflow: `npx supabase db reset` locally → tests → commit → Brad applies to production.
- Types: generated `src/types/supabase.ts` (`npm run db:types`) is used by **new** features only.
  Hand-written `src/types/database.ts` / `enums.ts` stay for existing code (differences: KI-5).
- Checks: `npm run typecheck` (added in Phase 0.1), `npm run lint`, `npm run build`.
  No test framework yet — each plan states how its tests run (SQL/pgTAP against the local DB).
- Every new function must `REVOKE ALL … FROM PUBLIC, anon, authenticated` and then GRANT only what
  it needs: Supabase default privileges grant EXECUTE to `anon`/`authenticated` on creation
  (see `phases/phase-0.1-report.md` → "function privileges").
- RI admin screens live on `login.` and are visible to ADMIN only.
- Known issues and deferred work: `known-issues.md`.
- Communicate with Brad in Korean. All UI labels in Korean.
