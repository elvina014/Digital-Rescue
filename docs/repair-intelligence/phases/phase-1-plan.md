# Phase 1 — Device master data (기기 마스터 데이터) — PLAN

Status: **APPROVED 2026-09-28 (Amendment A approved 2026-09-29) — EXECUTED 2026-09-29** (see `phase-1-report.md`). Branch `feat/repair-intelligence`.

## 0. Preconditions (checked 2026-09-28)

| Check | Result |
| --- | --- |
| Phase 0.1 report, all acceptance rows ✅ | yes (`phase-0.1-report.md`) |
| Phase 0.5 report, all acceptance rows ✅ | yes locally (`phase-0.5-report.md`). **Production:** `list_migrations` (read-only) shows only `20260927141005 baseline` → `20260928043331_fix_purchase_approval` not yet applied by Brad. Phase 1 depends only on 0.1, so this does not block. |
| Dev target | **Local Supabase on Docker** (Q9, `03-working-rules.md`). The session prompt left the target as a placeholder → Brad confirms "local" together with APPROVED. |
| Note | The repo is now `supabase link`-ed to production. Every CLI call in this phase uses `--local` or a local-only command (`db reset`, `test db`, `gen types --local`, `db advisors --local`). Nothing runs against the linked project. |

## 1. Goal

A canonical device/board vocabulary that tickets can reference, **without touching** the free-text
fields `device_brand`, `device_model`, `tag_info`, and without touching the AI value cache `device_models` (Q1, KI-1).

Acceptance (roadmap): picker works on ticket create/edit; mapping tool maps a sample set; old tickets unaffected.

## 2. Naming

Prefix **`catalog_`** for all new objects — clearly different from `device_models`, short, and reusable
for later master data. UI name: "기기 마스터". (Alternative if Brad prefers: `hw_`.)

## 3. Schema — migration `supabase/migrations/<UTC ts>_device_catalog.sql`

### 3.1 Extension
`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;` (available, not installed; needed for suggestions/search).

### 3.2 Normalisation function
`public.catalog_normalize(p text) RETURNS text` — `LANGUAGE sql IMMUTABLE PARALLEL SAFE`, `SET search_path = ''`:
`lower(regexp_replace(coalesce(p,''), '[^0-9A-Za-z가-힣]', '', 'g'))`, empty → NULL.
Examples: `"15Z90T-GP5HL"`, `"15z90t gp5hl"` → `15z90tgp5hl`; `"[Lenovo]ThinkPad X390 Yoga"` → `lenovothinkpadx390yoga`.
Used for alias uniqueness, grouping unmapped strings and backfill matching. Explicit character class (not `[:alnum:]`) so the result does not depend on the DB locale.

### 3.3 Tables (all: `id uuid PK default gen_random_uuid()`, RLS enabled)

| Table | Columns | Constraints / indexes |
| --- | --- | --- |
| `catalog_brands` | `name text NOT NULL` (display, e.g. "LG"), `name_norm text GENERATED ALWAYS AS (catalog_normalize(name)) STORED`, `created_at` | UNIQUE(`name_norm`), CHECK name_norm not null |
| `catalog_models` | `brand_id` → brands **RESTRICT**, `name text NOT NULL` (e.g. "그램 15 15Z90T"), `name_norm` generated, `device_type device_type NULL` (existing enum), `release_year int NULL`, `notes text NULL`, `needs_review boolean NOT NULL DEFAULT false`, `created_by uuid` → employees SET NULL, `created_at`, `updated_at` | UNIQUE(`brand_id`,`name_norm`); trgm GIN on `name_norm` |
| `catalog_variants` | `model_id` → models **CASCADE**, `name text NOT NULL` (e.g. "OLED", "LCD 터치"), `name_norm` generated, `notes`, `created_at` | UNIQUE(`model_id`,`name_norm`); UNIQUE(`id`,`model_id`) (target of composite FKs) |
| `catalog_model_aliases` | `model_id` → models CASCADE, `variant_id uuid NULL`, `alias text NOT NULL`, `alias_norm` generated, `source text NOT NULL CHECK IN ('created','manual','mapping')`, `created_by`, `created_at` | **UNIQUE(`alias_norm`)** (global); FK (`variant_id`,`model_id`) → variants(`id`,`model_id`) CASCADE; trgm GIN on `alias_norm` |
| `catalog_boards` | `board_number text NOT NULL` (e.g. `LA-K091P`, `NM-D451`, `BA92-12345A`, `DA0X39MBAE0`), `board_number_norm` generated, `manufacturer text NULL` (Compal/Quanta/…), `notes`, `created_by`, `created_at`, `updated_at` | UNIQUE(`board_number_norm`); trgm GIN |
| `catalog_board_aliases` | `board_id` → boards CASCADE, `alias text NOT NULL`, `alias_norm` generated, `created_by`, `created_at` | UNIQUE(`alias_norm`); trgm GIN |
| `catalog_model_boards` | `model_id` → models CASCADE, `variant_id uuid NULL`, `board_id` → boards CASCADE, `note text NULL`, `created_by`, `created_at` | `UNIQUE NULLS NOT DISTINCT (model_id, variant_id, board_id)`; FK (`variant_id`,`model_id`) → variants CASCADE; index on `board_id` |
| `catalog_ticket_link_log` | `ticket_id` → repair_tickets **CASCADE** (a log must not block the existing ADMIN ticket delete), `action text CHECK IN ('link','unlink')`, `alias_id` → aliases SET NULL, `old_model_id`, `old_variant_id`, `new_model_id`, `new_variant_id` (uuid, no FK — history), `done_by uuid`, `done_at timestamptz default now()` | index on (`alias_id`), (`ticket_id`) |

`updated_at` on models/boards: new trigger function `catalog_set_updated_at()` (not the shared `update_updated_at`, so nothing existing is reused/changed).

### 3.4 New columns on `repair_tickets` (nullable, additive)

| Column | FK |
| --- | --- |
| `catalog_model_id uuid NULL` | → `catalog_models(id)` **RESTRICT** |
| `catalog_variant_id uuid NULL` | composite (`catalog_variant_id`,`catalog_model_id`) → `catalog_variants(id, model_id)` **RESTRICT** (variant must belong to the model; MATCH SIMPLE → unchecked when variant is NULL) |
| `catalog_board_id uuid NULL` | → `catalog_boards(id)` **RESTRICT** |

Plus indexes on the three columns and comments. Existing columns, triggers and policies on `repair_tickets` are **not changed**.

### 3.5 New trigger on `repair_tickets` (additive — no existing trigger/function modified)

`trg_zz_catalog_keep_updated_at` BEFORE UPDATE, function `catalog_keep_ticket_updated_at()`:
if `current_setting('app.catalog_link_sync', true) = 'on'` → `NEW.updated_at := OLD.updated_at`.
The name sorts after `trg_repair_tickets_updated_at`, so it runs last. The GUC is set (transaction-local)
only inside the mapping RPCs → backfill does **not** change the "최종 수정" time shown in the ticket list.
Normal edits are unaffected.

~~Why no change to `protect_approved_ticket`~~ — **superseded 2026-09-29 (Amendment A, approved by Brad):**
the assumption that the trigger lets ADMIN through was wrong (KI-9: `current_role` is the SQL keyword, so
the ADMIN/MANAGER branches never match; every update of an approved ticket fails, ADMIN included).

**Amendment A — `CREATE OR REPLACE FUNCTION protect_approved_ticket()`** (existing function, listed here per R2):
one narrow early exit is inserted right after the existing `app.refund_sync` check; every other line is
copied verbatim from the baseline (KI-9 is **not** fixed):

```sql
  -- 기기 마스터 매핑 RPC: 표준 모델 연결 컬럼만 바뀌는 경우에만 통과
  IF current_setting('app.catalog_link_sync', true) = 'on' THEN
    new_other := NEW;
    new_other.catalog_model_id   := OLD.catalog_model_id;
    new_other.catalog_variant_id := OLD.catalog_variant_id;
    new_other.catalog_board_id   := OLD.catalog_board_id;
    new_other.updated_at         := OLD.updated_at;
    IF new_other IS NOT DISTINCT FROM OLD THEN
      RETURN NEW;
    END IF;
  END IF;
```
The GUC is set transaction-locally only inside `catalog_map_model_string` / `catalog_unmap_alias`
(ADMIN-checked). ACL is kept by `CREATE OR REPLACE`. Rollback = baseline body (added to §6).
`enforce_minimum_price` only fires when `final_price` changes; `protect_canceled_ticket` only when leaving CANCELED — unchanged.
Extra tests: with the GUC on, changing any non-catalog column of an approved ticket is still blocked;
without the GUC, behaviour is identical to before (approved update still fails).

### 3.6 Functions (all: explicit `search_path`; `REVOKE ALL … FROM PUBLIC, anon, authenticated` then GRANT as listed)

| Function | Kind | Role check | Grant | Purpose |
| --- | --- | --- | --- | --- |
| `catalog_normalize(text)` | SQL IMMUTABLE, invoker | — | authenticated | see 3.2 |
| `catalog_search_models(p_query text, p_limit int default 20)` | STABLE, **invoker** (RLS applies) | — | authenticated | alias/name search: contains-match on norm first, then `similarity()` ≥ 0.2; returns model_id, variant_id, brand, model, variant, matched alias, score |
| `catalog_search_boards(p_query text, p_limit int default 20)` | STABLE, invoker | — | authenticated | same for boards/board aliases |
| `catalog_create_model(p_brand text, p_model text, p_device_type device_type, p_variant text default null)` | **SECURITY DEFINER** | ADMIN, MANAGER, RECEPTION, TECHNICIAN, EXPERT_REPAIR (not CS) | authenticated | inline "새 모델 등록": find-or-create brand, create model (+ variant), alias `source='created'`; `needs_review = (role <> 'ADMIN')`. Existing model/alias → returns the existing id (`existed=true`) instead of a duplicate. Korean errors. |
| `catalog_unmapped_model_strings(p_limit int default 200)` | SECURITY DEFINER, STABLE | ADMIN | authenticated | groups tickets with `catalog_model_id IS NULL` by `catalog_normalize(device_model)`: raw spellings, brands, ticket count (real/test), top-3 trgm suggestions from aliases. Returns **no customer data** (only brand/model strings and counts). |
| `catalog_map_model_string(p_norm text, p_model_id uuid, p_variant_id uuid default null, p_alias text)` | SECURITY DEFINER | ADMIN | authenticated | one transaction: create alias (`source='mapping'`; if `alias_norm` already points to another model → error "이미 다른 모델에 연결된 별칭입니다."), set `app.catalog_link_sync`, update tickets where `catalog_normalize(device_model) = p_norm AND catalog_model_id IS NULL` (existing links never overwritten), insert one `link` log row per ticket, return count. |
| `catalog_unmap_alias(p_alias_id uuid)` | SECURITY DEFINER | ADMIN | authenticated | one transaction: unlink tickets that this alias linked **and whose link is still unchanged**, log `unlink`, delete the alias. Undo for mistakes. |
| `catalog_set_updated_at()`, `catalog_keep_ticket_updated_at()` | trigger functions | — | none (revoked) | |

### 3.7 RLS (mirrors existing inventory reference-data pattern)

| Table | SELECT | INSERT / UPDATE / DELETE |
| --- | --- | --- |
| brands, models, variants, model_aliases, boards, board_aliases, model_boards | all `authenticated` (all staff, Q7 — contains no PII) | `get_my_role() = 'ADMIN'` (admin screens). Non-admin creation only through `catalog_create_model`. |
| `catalog_ticket_link_log` | ADMIN | none (RPC only) |

Table grants: revoke `anon` on all new tables (defence in depth; default privileges would grant it).
`repair_tickets` new columns follow the existing ticket policies unchanged.

## 4. Application (all UI Korean; new components < 200 lines each)

Before coding: read the relevant guides in `node_modules/next/dist/docs/` (Server Actions, forms, route groups) per `AGENTS.md`.

### 4.1 Reusable picker — `src/components/catalog/`
- `DeviceModelPicker.tsx` — "표준 모델" search box (debounced server-action search via `catalog_search_models`), result list "브랜드 · 모델 · 변형 (일치 별칭)", selected chip with "해제", writes hidden inputs `catalogModelId` / `catalogVariantId`. Optional — ticket saving never requires it.
- `NewModelInline.tsx` — "새 모델 등록" (브랜드, 모델명, 변형 선택사항) → `catalog_create_model`; message "관리자 검토 대기" for non-admin.
- `BoardPicker.tsx` — same pattern for `catalog_search_boards` → `catalogBoardId` (no inline board creation; boards are ADMIN-maintained).
- Server actions: `src/app/(admin)/catalog/actions.ts` (search, create, admin CRUD, map/unmap). Session client (`createClient()`) only — never service_role (else `protect_approved_ticket` blocks and RLS is bypassed).

### 4.2 Ticket create / edit
- `tickets/new/NewTicketForm.tsx`: add `DeviceModelPicker` under the existing "모델명" input (free-text input unchanged).
- `tickets/[id]/EstimateCard.tsx` (the only edit path for device info, RECEIVED → IN_PROGRESS): add model picker + board picker, pre-filled with the ticket's current links; `fd.set(...)`.
- `tickets/actions.ts`:
  - `createTicketAction`: read `catalogModelId`/`catalogVariantId` (UUID check; empty → NULL) into the insert.
  - `startRepairAction`: same three ids into the existing update.
  - Nothing else in the file changes; the `device_models` cache write stays as is.
- `tickets/[id]/page.tsx` + `TicketDetailForm.tsx`: select and show "표준 모델 / 보드" line (read-only) next to 모델명.
- Public form (`ContactForm`, `submitTicketAction`): **unchanged**.

### 4.3 Admin tool "기기 마스터" (`login.`, ADMIN only — Q12)
Route guard: `getCurrentEmployee()` role ADMIN, else redirect; sidebar item "기기 마스터" (`AdminSidebar.tsx`, roles `["ADMIN"]`).
- `/catalog/mapping` — `MappingClient.tsx`: unmapped groups sorted by count (raw spellings, brands, count), top-3 suggestions; per row: pick suggestion / search / create model → "연결" (confirm dialog "N건의 접수건이 연결됩니다"). Optimistic removal of the row, restored on error with the Korean message. "최근 연결" list with "되돌리기" (`catalog_unmap_alias`). **Nothing is auto-mapped.**
- `/catalog/models` — models list (filter 브랜드, "검토 필요"), edit model/variants/aliases/linked boards, clear `needs_review`.
- `/catalog/boards` — boards list, create/edit, board aliases, linked models.
Delete buttons only succeed when unreferenced (FK RESTRICT → "사용 중인 항목은 삭제할 수 없습니다.").

### 4.4 Types
`npm run db:types` → `src/types/supabase.ts`; new code uses it. Hand-written `database.ts` stays (KI-5 note: new ticket columns not in hand-written type).

## 5. Files

| New | Changed |
| --- | --- |
| `supabase/migrations/<ts>_device_catalog.sql`; `supabase/tests/device_catalog.test.sql`; `src/components/catalog/{DeviceModelPicker,NewModelInline,BoardPicker}.tsx`; `src/app/(admin)/catalog/{actions.ts, mapping/page.tsx, mapping/MappingClient.tsx, models/page.tsx, models/ModelsClient.tsx, models/ModelEditor.tsx, boards/page.tsx, boards/BoardsClient.tsx}`; `phases/phase-1-report.md` | `src/app/(admin)/tickets/actions.ts` (2 actions, id fields only); `tickets/new/NewTicketForm.tsx`; `tickets/[id]/EstimateCard.tsx`; `tickets/[id]/page.tsx`; `tickets/[id]/TicketDetailForm.tsx` (display line); `src/components/layout/AdminSidebar.tsx`; `src/types/supabase.ts` (generated); `supabase/seed.sql` (a few extra fake tickets with spelling variants, e.g. "15Z90T-GP5HL" / "15z90t gp5hl", + one approved ticket to exercise backfill); docs (`02-roadmap.md`, `known-issues.md` KI-5 note) |

## 6. Rollback SQL

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_zz_catalog_keep_updated_at ON public.repair_tickets;
ALTER TABLE public.repair_tickets
  DROP CONSTRAINT IF EXISTS repair_tickets_catalog_variant_fk,
  DROP CONSTRAINT IF EXISTS repair_tickets_catalog_model_id_fkey,
  DROP CONSTRAINT IF EXISTS repair_tickets_catalog_board_id_fkey;
ALTER TABLE public.repair_tickets
  DROP COLUMN IF EXISTS catalog_variant_id,
  DROP COLUMN IF EXISTS catalog_model_id,
  DROP COLUMN IF EXISTS catalog_board_id;
DROP FUNCTION IF EXISTS public.catalog_unmap_alias(uuid);
DROP FUNCTION IF EXISTS public.catalog_map_model_string(text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.catalog_unmapped_model_strings(int);
DROP FUNCTION IF EXISTS public.catalog_create_model(text, text, public.device_type, text);
DROP FUNCTION IF EXISTS public.catalog_search_boards(text, int);
DROP FUNCTION IF EXISTS public.catalog_search_models(text, int);
DROP TABLE IF EXISTS public.catalog_ticket_link_log, public.catalog_model_boards,
  public.catalog_board_aliases, public.catalog_boards, public.catalog_model_aliases,
  public.catalog_variants, public.catalog_models, public.catalog_brands;
DROP FUNCTION IF EXISTS public.catalog_keep_ticket_updated_at();
DROP FUNCTION IF EXISTS public.catalog_set_updated_at();
DROP FUNCTION IF EXISTS public.catalog_normalize(text);
DROP EXTENSION IF EXISTS pg_trgm;  -- only if nothing else uses it by then
COMMIT;
```
Amendment A: **before** dropping the columns, restore the baseline `protect_approved_ticket()` body
(`supabase/migrations/20260927141005_baseline.sql`, the `CREATE OR REPLACE FUNCTION "public"."protect_approved_ticket"()`
block — the full statement is repeated in the report). The restored body no longer references the catalog columns.
(Exact constraint names are taken from the final migration and repeated in the report.)
Effect: the three link columns and all catalog data disappear; no pre-existing column/row is changed —
`updated_at` of backfilled tickets was never modified. App: `git revert` of the Phase 1 commit (deploy the app revert **before** the DB rollback).

## 7. Test plan (local only)

### A. pgTAP — `supabase/tests/device_catalog.test.sql`, `npx supabase test db`
1. `catalog_normalize` cases (hyphen/space/case, Hangul kept, brackets removed, empty → NULL).
2. Uniqueness: duplicate alias norm rejected; variant of another model rejected on alias, model_boards and `repair_tickets` (composite FK).
3. RLS per role (JWT claims of the 6 seed roles): all read catalog; only ADMIN inserts/updates/deletes; link log readable by ADMIN only; anon has no access.
4. `catalog_create_model`: allowed roles succeed (`needs_review` true for non-admin, false for ADMIN); CS → error; duplicate → returns existing id.
5. `catalog_map_model_string` as ADMIN: links exactly the matching unlinked tickets incl. an **approved** and a **CANCELED** ticket; already-linked ticket untouched; **all other columns identical** (row compare excluding the 3 new columns) **and `updated_at` unchanged**; one log row per ticket; alias conflict → Korean error, nothing changed (atomic).
6. Non-ADMIN (MANAGER, TECHNICIAN) calling map/unmap/unmapped → error, nothing changed.
7. `catalog_unmap_alias`: reverts only tickets still on that link; manually re-linked ticket kept; alias removed; log rows.
8. Normal ticket UPDATE (without GUC) still bumps `updated_at` (existing trigger unaffected).
9. Delete referenced model/board → FK error; unreferenced → ok.
10. Search: partial/alias input ("15z90", "그램", board "la-k0") returns expected rows; invoker security.
11. Privileges: every new function has no EXECUTE for PUBLIC/anon; SECURITY DEFINER ones have `search_path` set.
12. Existing `approve_material_dispatch.test.sql` still passes (24/24).

Plus `npx supabase db reset` twice.

### B. E2E on the local stack (same approach as Phase 0.5)
Temporary `.env.development.local` with local URL/keys → **deleted afterwards**. Seed accounts `@example.test`.
1. RECEPTION: new ticket with picker → search alias → select → saved `catalog_model_id`; "새 모델 등록" inline → model with `needs_review`.
2. TECHNICIAN: EstimateCard on RECEIVED ticket → model + board picker → start repair → columns set.
3. ADMIN: `/catalog/mapping` → map the seeded spelling group (2 tickets incl. the approved one) → counts, ticket list "최종 수정" unchanged; "되돌리기" works.
4. Non-admin cannot open `/catalog/*` (redirect) and does not see the menu item.
5. Screenshots for the report.

### C. Static / advisors
`npm run db:types`, `npm run typecheck`, `npm run lint`, `npm run build`;
`npx supabase db advisors --local` (security + performance) — new findings fixed; pre-existing ones listed only.

## 8. Risks

- **Production extension:** `pg_trgm` must be creatable in `extensions` when Brad applies (it is listed as available).
- **Normalisation over-merging**: two genuinely different strings with the same norm would share a group; the admin sees all raw spellings before confirming. Mapping only fills NULL links.
- **Brand ambiguity**: grouping is by model string only (brands like LG/lg differ); the group shows all brand spellings so the admin can spot conflicts.
- **PII in `device_model`** (see `00-current-state.md` §6): mapping screen is ADMIN-only; raw strings are not copied into aliases unless the admin confirms (alias text editable before "연결").
- **Staff-created duplicates** via inline registration → `needs_review` filter in the admin list. Merging models is out of scope (Phase 1 has no merge tool).
- **Deploy order** (for Brad): migration first, then app (new app code reads the new columns; old app ignores them). Phase 0.5 is independent.
- `startRepairAction` now writes 3 extra nullable columns in its existing update — if the picker is empty they are written as NULL, i.e. the picker is authoritative on that screen (pre-filled with current values so nothing is lost).

## 9. Out of scope

`device_models` / KI-1; public intake form; brand normalisation of `device_brand`; mapping by `tag_info`;
model merge tool; part compatibility (Phase 3); any change to existing triggers/functions/policies.

## 10. Decisions (Brad, 2026-09-28)

1. **Dev target** = local Docker Supabase. ✅
2. **Prefix** `catalog_`. ✅
3. **Inline "새 모델 등록"** by all staff except CS, flagged `needs_review` (recommended option). ✅
4. **Keep `updated_at` unchanged on backfill** via the additive trigger (3.5). ✅
