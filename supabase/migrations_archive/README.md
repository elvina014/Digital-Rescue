# Migrations archive (history only)

These files (001–042, including the two `019_*` files) are the migration history **before the
baseline** `supabase/migrations/<timestamp>_baseline.sql` created in Repair Intelligence Phase 0.1
(2026-09-27).

- **Never executed** — the Supabase CLI only reads `supabase/migrations/`.
- **Do not edit** — they document how the schema evolved.
- `019_cancel_method.sql` was never applied to production (see
  `docs/repair-intelligence/known-issues.md` KI-3).
- `023`/`026` storage definitions differ from production; the baseline follows production (KI-7).
