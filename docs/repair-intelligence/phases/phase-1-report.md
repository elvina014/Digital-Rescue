# Phase 1 — Device master data (기기 마스터) — REPORT

Executed 2026-09-28/29 on branch `feat/repair-intelligence` (plan: `phase-1-plan.md`, APPROVED 2026-09-28 with
decisions 1–4; **Amendment A** approved 2026-09-29). Local Docker Supabase only — **production untouched**
(one read-only `list_migrations` call in the precondition check).

## Result

| Acceptance / requirement | Result |
| --- | --- |
| Picker works on ticket create | ✅ E2E: RECEPTION searched "15z90" → selected → `catalog_model_id` saved on the new ticket |
| Picker works on ticket edit (start repair) | ✅ E2E: TECHNICIAN linked model + board on a RECEIVED ticket → saved with the existing update; shown on the detail page |
| Inline "새 모델 등록" (all staff except CS) | ✅ E2E (RECEPTION → `needs_review = true`, "관리자 검토 대기"); pgTAP: CS refused, ADMIN → no review flag, duplicates return the existing model |
| Mapping tool maps a sample set | ✅ E2E: group `15Z90T-GP5HL` / `15z90t gp5hl` (2 tickets, one **approved**) → linked; `updated_at` byte-identical; 2 log rows; "되돌리기" unlinked both and re-listed the group |
| Nothing auto-mapped | ✅ only on explicit "연결" + confirm |
| Old tickets unaffected | ✅ pgTAP: after mapping, every ticket's JSON minus the 3 new columns is identical to the snapshot (incl. `updated_at`); existing links never overwritten |
| ADMIN-only admin tool on `login.` | ✅ non-admin → `/dashboard`; menu only for ADMIN; apex `/catalog/*` → `/` |
| pgTAP | ✅ **88/88** (Phase 0.5: 24, Phase 1: 64) |
| `db reset` twice | ✅ |
| typecheck / lint / build | ✅ 0 errors / 0 errors, 16 warnings (all pre-existing) / success |
| Advisors (`db advisors --local --type all --level info`) | ✅ no new WARN/ERROR; only INFO `unused_index` on the new (fresh, empty) indexes. All WARNs are pre-existing (listed below) |
| Types | ✅ `npm run db:types` regenerated (`src/types/supabase.ts`, +catalog tables/functions/columns) |

## Changes

### Database — `supabase/migrations/20260928102040_device_catalog.sql`

- `CREATE EXTENSION pg_trgm WITH SCHEMA extensions`.
- Tables (RLS on; SELECT all authenticated, writes ADMIN only; `anon` revoked):
  `catalog_brands`, `catalog_models`, `catalog_variants`, `catalog_model_aliases`, `catalog_boards`,
  `catalog_board_aliases`, `catalog_model_boards`, `catalog_ticket_link_log` (SELECT ADMIN only, no direct writes).
  Normalised `*_norm` generated columns with unique constraints + trigram GIN indexes.
- `repair_tickets`: `catalog_model_id`, `catalog_variant_id`, `catalog_board_id` (nullable, FK RESTRICT,
  composite FK so a variant must belong to the model, CHECK variant ⇒ model), indexes, comments.
- Functions (all `search_path` set; EXECUTE revoked from PUBLIC/anon, granted as needed):
  `catalog_normalize`, `catalog_search_models`, `catalog_search_boards` (invoker),
  `catalog_create_model` (definer, not CS), `catalog_unmapped_model_strings`, `catalog_map_model_string`,
  `catalog_unmap_alias` (definer, ADMIN), trigger functions `catalog_set_updated_at`, `catalog_keep_ticket_updated_at`.
- New trigger `trg_zz_catalog_keep_updated_at` (decision 4).
- **Amendment A — existing function replaced:** `protect_approved_ticket()` = baseline body verbatim + one early exit
  when `app.catalog_link_sync = 'on'` **and** only the three catalog columns changed. ACL unchanged (tested).
  Reason: KI-9 — the function's `current_role` variable is the SQL keyword, so even ADMIN cannot update approved
  tickets; the plan's original assumption was wrong. KI-9 itself is **not** fixed.

### Application

| File | Change |
| --- | --- |
| `src/app/(admin)/catalog/actions.ts` (new) | search / variants / inline create / unmapped / map / unmap — session client only |
| `src/app/(admin)/catalog/adminActions.ts` (new) | ADMIN CRUD: model, variant, alias (mapping aliases only removable via 되돌리기), model↔board, board, board alias |
| `src/app/(admin)/catalog/{page,CatalogTabs,requireAdminPage,ChipList,useOptimisticRemove}` (new) | index redirect, tabs, ADMIN guard, shared chip list, optimistic delete with rollback |
| `src/app/(admin)/catalog/mapping/{page,MappingClient,MappingRow,RecentMappings}.tsx` (new) | mapping tool (optimistic row removal, restored on error) + recent list with 되돌리기 |
| `src/app/(admin)/catalog/models/{page,ModelsClient,ModelEditor,ModelLinks,types}` (new) | model list (brand / 검토 필요 / text filters), editor, variants/aliases/boards |
| `src/app/(admin)/catalog/boards/{page,BoardsClient,BoardCard}.tsx` (new) | board list, create, edit, aliases, linked models (read-only) |
| `src/components/catalog/{DeviceModelPicker,NewModelInline,BoardPicker,useDebouncedSearch}` (new) | reusable Korean pickers |
| `src/lib/catalogErrors.ts` (new) | DB error → Korean message, UUID parsing |
| `src/app/(admin)/tickets/actions.ts` | `createTicketAction`, `startRepairAction`: read and store the catalog ids only |
| `src/app/(admin)/tickets/new/NewTicketForm.tsx` | "표준 모델" picker (free-text 모델명 unchanged) |
| `src/app/(admin)/tickets/[id]/EstimateCard.tsx` | model + board pickers, pre-filled from the ticket |
| `src/app/(admin)/tickets/[id]/page.tsx`, `TicketDetailForm.tsx` | read and show "표준 모델 / 보드" |
| `src/components/layout/AdminSidebar.tsx` | menu "기기 마스터" (ADMIN) |
| `src/proxy.ts` | `/catalog` added to `ADMIN_PATHS` — **not listed in the plan's file table**; required so the ADMIN tool is served only on `login.` (plan §4.3 / Q12) and blocked on the public apex domain. One-line change. |
| `src/types/supabase.ts` | regenerated |

### Other

`supabase/seed.sql` (fake catalog rows + 2 unlinked tickets with SKU spelling variants, one approved),
`supabase/tests/device_catalog.test.sql` (64 assertions), docs (`known-issues.md` KI-5 note, KI-8, KI-9;
`02-roadmap.md`; plan amendment).

## Tests

### A. pgTAP — `npx supabase test db` → PASS 88/88

| Area | Assertions |
| --- | --- |
| normalisation | 5 |
| constraints (alias uniqueness, variant/model consistency on aliases, model_boards, tickets) | 5 |
| RLS by role (TECH/CS read, TECH insert refused, MANAGER update/delete no-op, ADMIN insert, log not writable, anon denied) | 9 |
| `catalog_create_model` (RECEPTION, created_by, ADMIN, variant, duplicate, empty, CS refused) | 8 |
| mapping (role checks, alias conflict, variant mismatch, 3 tickets incl. approved + canceled, existing link kept, **no other column changed**, log, atomic failure, log visibility) | 13 |
| unmap (count, approved unlinked, re-linked kept, alias deleted, log, `updated_at` kept, created alias kept) + normal update still bumps `updated_at` | 8 |
| Amendment A (no GUC → blocked as before; GUC + non-catalog change → blocked; GUC + catalog-only → allowed; ACL unchanged) | 4 |
| delete rules, search (partial SKU, Korean name, board alias, no match) | 6 |
| privileges/definitions (anon, search_path, trigger fn, RLS on 8 tables) | 4 |
| Phase 0.5 regression | 24 |

Function privileges are verified with `has_function_privilege()`, not by calling denied functions — see KI-8.

### B. E2E (local stack; temporary `.env.development.local`, **deleted afterwards**)

RECEPTION: create ticket with picker ✅; inline registration ✅ · TECHNICIAN: start repair with model + board ✅,
detail line ✅, `/catalog` → `/dashboard` ✅, no menu ✅ · ADMIN: mapping ✅ (`updated_at` unchanged in DB),
되돌리기 ✅, models tab (variant add ✅, duplicate alias → "이미 등록된 이름(또는 별칭)입니다." ✅),
boards tab (delete referenced board → "사용 중인 항목은 삭제할 수 없습니다…" and card restored ✅) · apex `/catalog/mapping` → `/` ✅.

Bug found and fixed during E2E: the search dropdown stayed open over the inline "새 모델 등록" form
(clicks landed in the search box) → dropdown hidden while the form is open.

Only error seen: a one-time `Unexpected end of JSON input` in Next's `load-manifest` on the first `/login`
compile of the dev server (right after a production build); not reproducible on reload, unrelated to Phase 1.

Cleanup: dev server stopped, `.env.development.local` deleted, `db reset` ×2, tests re-run (PASS).

### C. Advisors — pre-existing WARNs (not changed)

`auth_rls_initplan` (ticket_logs, ticket_refunds, repair_tickets ×2), `duplicate_index` (repair_tickets ×2),
`function_search_path_mutable` (enforce_minimum_price, get_my_role, news_items_set_updated_at,
page_contents_set_updated_at, update_inventory_items_updated_at, update_ticket_materials_updated_at,
update_updated_at, approve_material_dispatch).

## Rollback

App first (`git revert <phase-1 commit>`), then DB:

```sql
BEGIN;
-- 1) restore protect_approved_ticket() exactly as in the baseline
CREATE OR REPLACE FUNCTION "public"."protect_approved_ticket"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_role employee_role;
  new_other repair_tickets;
BEGIN
  IF OLD.is_approved = FALSE THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.refund_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  new_other := NEW;
  new_other.has_admin_message := OLD.has_admin_message;
  new_other.updated_at := OLD.updated_at;
  IF new_other IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  SELECT role INTO current_role
  FROM employees
  WHERE id = auth.uid();

  IF current_role = 'ADMIN' THEN
    RETURN NEW;
  END IF;

  IF current_role = 'MANAGER' THEN
    IF NEW.final_price <> OLD.final_price THEN
      RAISE EXCEPTION '승인 완료된 접수건의 금액은 수정할 수 없습니다.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '승인 완료된 접수건은 수정할 수 없습니다. (권한: %)' , current_role;
END;
$$;

-- 2) remove Phase 1 objects
DROP TRIGGER IF EXISTS trg_zz_catalog_keep_updated_at ON public.repair_tickets;
ALTER TABLE public.repair_tickets
  DROP CONSTRAINT IF EXISTS repair_tickets_catalog_variant_needs_model,
  DROP CONSTRAINT IF EXISTS repair_tickets_catalog_variant_fk,
  DROP CONSTRAINT IF EXISTS repair_tickets_catalog_model_fk,
  DROP CONSTRAINT IF EXISTS repair_tickets_catalog_board_fk;
ALTER TABLE public.repair_tickets
  DROP COLUMN IF EXISTS catalog_variant_id,
  DROP COLUMN IF EXISTS catalog_model_id,
  DROP COLUMN IF EXISTS catalog_board_id;
DROP FUNCTION IF EXISTS public.catalog_unmap_alias(uuid);
DROP FUNCTION IF EXISTS public.catalog_map_model_string(text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.catalog_unmapped_model_strings(integer);
DROP FUNCTION IF EXISTS public.catalog_create_model(text, text, public.device_type, text);
DROP FUNCTION IF EXISTS public.catalog_search_boards(text, integer);
DROP FUNCTION IF EXISTS public.catalog_search_models(text, integer);
DROP TABLE IF EXISTS public.catalog_ticket_link_log, public.catalog_model_boards,
  public.catalog_board_aliases, public.catalog_boards, public.catalog_model_aliases,
  public.catalog_variants, public.catalog_models, public.catalog_brands;
DROP FUNCTION IF EXISTS public.catalog_keep_ticket_updated_at();
DROP FUNCTION IF EXISTS public.catalog_set_updated_at();
DROP FUNCTION IF EXISTS public.catalog_normalize(text);
DROP EXTENSION IF EXISTS pg_trgm;
COMMIT;
```

The function must be restored **before** the columns are dropped (the amended body references them).
**Verified locally 2026-09-29:** after running this SQL, 0 `catalog_*` relations, 0 catalog columns on
`repair_tickets`, no `pg_trgm`, and `md5(prosrc)` of `protect_approved_ticket` = baseline (`211e374a…`); then `db reset` + tests PASS.
No pre-existing row was modified by mapping except the three new columns; `updated_at` was preserved.

## Deployment (Brad)

1. Phase 0.5 is still pending in production (`list_migrations` shows only the baseline). Order is independent.
2. **Migration first**: `npx supabase db push` (applies `20260928102040_device_catalog.sql`; also 0.5 if not yet applied) or SQL editor.
   Needs `pg_trgm` creatable in `extensions` (listed as available).
3. **Then the app** (Vercel). Old app ignores the new columns; the new app requires them.
4. Verify (read-only): `\d repair_tickets` shows the 3 columns; `select proacl from pg_proc where oid='public.protect_approved_ticket()'::regprocedure` unchanged;
   `select count(*) from catalog_models` = 0 (production starts empty — seed data is local only).

## Known risks / notes

- **KI-8** (new): local Postgres segfaults on "permission denied for function". Production behaviour unknown —
  an anonymous RPC call to a revoked function could restart the DB if it behaves the same. Not probed. Please check.
- **KI-9** (new): ADMIN/MANAGER cannot edit approved tickets at all (keyword bug). Existing behaviour, unchanged; decide separately.
- Normalisation may group two different strings; the admin sees all spellings and brands before confirming.
- Mapping aliases store the text the admin confirms — clear PII from the alias field if the raw model string contains any.
- Brand of a model is fixed at creation (no brand edit / merge tool in Phase 1).
- Production starts with an empty catalog; models are created via inline registration or the admin screens.
