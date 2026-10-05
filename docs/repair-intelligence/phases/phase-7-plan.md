# Phase 7 — Physical tracking (라벨 · 보관 위치 · 스캔) — PLAN

Status: **APPROVED 2026-10-03 — EXECUTED 2026-10-03** (see `phase-7-report.md`; decisions in §11). Branch `feat/repair-intelligence`.

## 0. Preconditions (checked 2026-10-03)

| Check | Result |
| --- | --- |
| Phase 6 report exists, all acceptance rows ✅ | yes (`phase-6-report.md`, pgTAP 606/606, commit `b54e829`) |
| Phase 4 (dependency) report ✅ | yes (`phase-4-report.md`, commit `d855d40`) |
| Production status | Phases 0.5–6 are "local ✅, production deploy pending" (Brad's step). Does not block local work. |
| Dev target | The session prompt left the target as a placeholder. Per Q9 / `03-working-rules.md` = **local Supabase on Docker** (stack is running). Brad confirms with APPROVED (§11-1). |
| Working tree | Only pre-existing, non-RI changes (`.claude/*`, `.gitignore`) — not touched. |

CLI: local-only commands (`db reset`, `test db`, `gen types --local`, `db advisors --local`). Production: no queries planned.

## 1. Goal and acceptance (roadmap)

Every physical thing we keep can carry a short label with a QR code; scanning it (login required) opens the
right record and its history. Storage locations get a structure (`A-01-04`, `DONOR-C07`).

Mixed labelling (Q8):
- new standard parts → **one label per `inventory_items` row** (a bin/bag label; qty may be > 1);
- extracted/used parts → **individual qty-1 `inventory_items` rows**, one label each;
- donor devices → **one label per device**.

Acceptance: scanning a label opens the correct record.

## 2. Real-schema findings that shape the plan

1. **All extracted-part inbound goes through one function.** `ri_inbound_extracted_part` (Phase 2, internal) is called by
   `approve_return_material`, `approve_removed_part_inbound` and `donor_extract_part`. Today it **merges** into the oldest
   matching USED row (decision 8a of Phase 4: "qty-1 rows arrive with labels in Phase 7"). Q8 therefore needs a change to
   this existing function → listed explicitly here (R2), §3.4 / §11-2.
2. `inventory_items` has no label/location column and no unique key on (category, spec, product, capacity, condition).
   Two app paths *assume* at most one matching row via `.maybeSingle()`:
   - `addInventoryItem` duplicate check (`src/app/actions/inventoryActions.ts:373`) — with ≥ 2 matches `maybeSingle` returns an
     error, the error is ignored, and the duplicate check silently passes;
   - n8n webhook (`src/app/api/inventory/webhook/route.ts:145`) — with ≥ 2 matches it returns **500 "Item lookup failed"**.
   Once extracted parts become separate qty-1 USED rows, both cases become reachable → §11-8.
3. `donor_devices.donor_no` ("D-0001", unique, sequence) already is a short human id → reused as the donor label (§11-3).
   Donors have a free-text `storage_note` (Phase 4) — kept; the structured location is added beside it.
4. `inventory_transactions` SELECT is ADMIN/MANAGER only; `inventory_items` SELECT is all staff. A scan page for technicians
   needs a definer RPC to show history (§11-5).
5. The proxy already sends unauthenticated users to `/login?redirect=<pathname>` and returns after login → a path-based scan
   URL (`/scan/P-00012`) works from a phone camera without extra code.
6. No QR library in `package.json` → one new dependency (§11-6).
7. `inventory_items` has `trg_inventory_items_updated_at` (sets `updated_at` on every UPDATE). Filling label codes for existing rows
   by UPDATE would change `updated_at` of business rows; `ADD COLUMN … DEFAULT <volatile>` fills them during the table rewrite
   without firing triggers → existing values stay untouched (§3.1).

## 3. Schema — one migration `supabase/migrations/<UTC ts>_physical_tracking.sql`

### 3.1 New objects / additive columns

| Object | Definition |
| --- | --- |
| sequence `inventory_label_seq` | no API grants |
| function `ri_next_item_label() RETURNS text` | SECURITY DEFINER, `search_path = public`, VOLATILE; returns `'P-' \|\| lpad(n, 5, '0')` (`n::text` once n ≥ 100000 — no truncation). Only burns a sequence value, so EXECUTE is granted to `authenticated` and `service_role` (needed because the column default runs as the inserting role: session client, webhook service_role, definer functions) — no `anon`. |
| `inventory_items.label_code text` | `DEFAULT ri_next_item_label()`, `UNIQUE`, CHECK `label_code ~ '^P-[0-9]{5,}$'`. Added with the default in one `ADD COLUMN` → **existing rows receive codes during the rewrite; no trigger fires, no other column changes** (§11-3). Then `SET NOT NULL`. |
| table `storage_locations` | `id uuid PK`, `code text NOT NULL UNIQUE` CHECK `^[A-Z0-9]+(-[A-Z0-9]+)*$` and ≤ 20 chars (e.g. `A-01-04`, `DONOR-C07`; stored upper-case), `description text` (≤ 100), `is_active boolean NOT NULL DEFAULT true`, `created_by uuid DEFAULT auth.uid()` → employees SET NULL, `created_at`, `updated_at` (trigger `repair_set_updated_at`, existing function reused). No hierarchy table: the code itself is the structure (zone-rack-slot) — §11-4. |
| `inventory_items.storage_location_id uuid NULL` | → storage_locations **RESTRICT**, index |
| `donor_devices.storage_location_id uuid NULL` | → storage_locations **RESTRICT**, index |

### 3.2 RLS / privileges

| Table | SELECT | INSERT / UPDATE | DELETE |
| --- | --- | --- | --- |
| `storage_locations` | all authenticated | ADMIN (`get_my_role() = 'ADMIN'`) | none (deactivate with `is_active`) — RESTRICT FKs protect used codes |

`anon` revoked on the new table. Location of an item / donor is changed **only** through `set_storage_location` (below);
no new column grant on `donor_devices`. `inventory_items` policies unchanged.

### 3.3 New functions (SECURITY DEFINER, `search_path = public`, role check, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, then `GRANT EXECUTE … TO authenticated`)

| Function | Role | Behaviour |
| --- | --- | --- |
| `label_lookup(p_code text) RETURNS jsonb` | any employee (`get_my_role() IS NOT NULL`) | Normalises the code (trim, upper). `P-…` → `{kind:'ITEM', item:{id, label_code, category, spec, product, capacity, condition, quantity, part_spec name, location code, is_outsourced}, history:[≤ 50 newest inventory_transactions: created_at, type, quantity_changed, notes, employee name, receipt_no]}`. `D-…` → `{kind:'DONOR', donor:{id, donor_no, status, device_type, brand, model_text, catalog model label, board number, location code, storage_note, source receipt_no}, candidates:[description, status, quantity, part spec, extracted item label_code]}`. Unknown → `{error:'등록되지 않은 라벨입니다.'}`. **No prices (`base_estimate`), no customer columns, tickets by `receipt_no` only (Q7).** |
| `set_storage_location(p_kind text, p_id uuid, p_location_id uuid) RETURNS jsonb` | ADMIN, MANAGER | `p_kind` `ITEM` \| `DONOR`; `p_location_id` NULL clears; inactive location refused ("사용 중지된 보관 위치입니다."); row locked and updated in one statement. |

### 3.4 Existing function changed (R2 — explicitly listed)

`CREATE OR REPLACE FUNCTION public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid) RETURNS uuid` —
same signature, same privileges (internal, no API grant), same spec/product find-or-create and validation messages. Change:

| Before (Phase 2) | After (Phase 7, §11-2 option a) |
| --- | --- |
| lock oldest USED row with same category/spec/product/capacity → `quantity += n`, else insert one row with qty n; one INBOUND of n | **never merge**: insert **n rows with quantity 1** (USED, `base_estimate 0`, capacity stored, label from the default), **one INBOUND of 1 per row** (same note "적출품 반환 입고", same ticket / user); return the **first** row id |

Callers (`approve_return_material`, `approve_removed_part_inbound`, `donor_extract_part`) are **not changed**; they store the
returned id as before. For n > 1 the other rows are found by `inventory_transactions.ticket_id` and by the scan history.
Existing aggregate rows (incl. extracted USED rows merged before Phase 7) stay exactly as they are (R9).

## 4. Application (UI Korean; new components < 200 lines; optimistic updates with rollback — R5)

Before coding: read the relevant guides in `node_modules/next/dist/docs/` (route params, `headers()`, print-friendly pages) per `AGENTS.md`.

### 4.1 New files

| File | Content |
| --- | --- |
| `src/app/(admin)/labels/actions.ts` | session-client actions: `lookupLabelAction`, `setStorageLocationAction`, location create / update / deactivate |
| `src/app/(admin)/scan/page.tsx`, `ScanForm.tsx` | "라벨 조회": code input (keyboard or USB scanner) → `/scan/<code>`; all staff |
| `src/app/(admin)/scan/[code]/page.tsx`, `ScanItemView.tsx`, `ScanDonorView.tsx`, `LocationSelect.tsx` | result of `label_lookup`: item / donor card, history table, links (ADMIN/MANAGER → `/inventory`, donor staff → `/donors/[id]`, ticket → `/tickets/[id]` only where the viewer may open it), "보관 위치 변경" (ADMIN/MANAGER, optimistic with rollback), "라벨 다시 인쇄" |
| `src/app/(admin)/labels/page.tsx`, `LabelPicker.tsx` | ADMIN/MANAGER "라벨 인쇄": tabs 재고 / Donor, text filter, filter "최근 7일 입고", checkboxes → print view. `외주` items not listed (Q5) |
| `src/app/(admin)/labels/print/page.tsx`, `LabelSheet.tsx` | print view `?c=P-00012,D-0003` (≤ 100 codes): per label QR (inline SVG, URL `https://<login host>/scan/<code>` built from the request host) + code in large type + one line (분류/사양/제품/용량, 중고·신품 — or brand/model for donors) + location code. `@page` sized for the label stock (§11-7), "인쇄" button (`window.print()`) |
| `src/app/(admin)/inventory/locations/page.tsx`, `LocationsClient.tsx` | ADMIN "보관 위치 관리": list, add (code upper-cased, Korean validation "위치 코드는 영문 대문자·숫자와 '-'만 사용할 수 있습니다."), edit description, 사용 중지 / 재사용 |
| `src/lib/qr.ts` | server-side SVG generation via the new dependency |
| `supabase/tests/physical_tracking.test.sql`, `supabase/test-fixtures/phase7/rollback.sql` | pgTAP, rollback |

### 4.2 Existing files changed

| File | Change |
| --- | --- |
| `src/proxy.ts` | `/labels`, `/scan` added to `ADMIN_PATHS` (login-protected, `login.` only) |
| `src/components/layout/AdminSidebar.tsx` | "라벨 조회" (all staff), "라벨 인쇄" (ADMIN/MANAGER), "보관 위치 관리" (ADMIN) |
| `src/app/(admin)/inventory/page.tsx`, `InventoryClient.tsx` | select `label_code`, location code; show both as small columns; row link "라벨" → print view. No other behaviour change |
| `src/app/(admin)/donors/[id]/page.tsx` (+ `DonorInfoForm.tsx` display only) | show label (`donor_no`) and location; "라벨 인쇄" link |
| `src/app/(admin)/tickets/[id]/page.tsx`, `EstimateCard.tsx`, `AddMaterialCard.tsx` | select `label_code`; the item text gets " · P-00012" so identical qty-1 units can be told apart (§11-9) — one line each |
| `src/app/actions/inventoryActions.ts` `addInventoryItem` | duplicate check `.maybeSingle()` → `.limit(1)` (§11-8) |
| `src/app/api/inventory/webhook/route.ts` | item lookup: `.order("created_at").limit(1)` instead of `.maybeSingle()` → no 500 when several units match (§11-8) |
| `supabase/tests/inventory_flow_rpcs.test.sql`, `supabase/tests/donor_devices.test.sql` | the merge assertions (`inventory_flow_rpcs` lines ~106–140, ~199; `donor_devices` lines ~231–237, ~275) are rewritten to the qty-1 behaviour; all other assertions unchanged |
| `package.json` / lockfile | `qrcode` + `@types/qrcode` (dev) (§11-6) |
| `src/types/supabase.ts` | regenerated |
| docs | `02-roadmap.md` status, `known-issues.md` KI-5 note, this plan's status, `phase-7-report.md` |

## 5. Rollback SQL

App first (`git revert <phase-7 commit>`), then `supabase/test-fixtures/phase7/rollback.sql`:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.label_lookup(text);
DROP FUNCTION IF EXISTS public.set_storage_location(text, uuid, uuid);
ALTER TABLE public.donor_devices   DROP COLUMN IF EXISTS storage_location_id;
ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS storage_location_id;
ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS label_code;
DROP FUNCTION IF EXISTS public.ri_next_item_label();
DROP SEQUENCE IF EXISTS public.inventory_label_seq;
DROP TABLE IF EXISTS public.storage_locations;
-- restore the Phase 2 body of ri_inbound_extracted_part (merge behaviour), copied verbatim from
-- 20261001134100_inventory_flow_rpcs.sql §1 into the fixture file (CREATE OR REPLACE, same signature, no grants change)
COMMIT;
```

Effect: label codes and locations are lost. qty-1 rows created while Phase 7 was active **stay** as separate rows (ordinary
stock rows; R9). Rehearsed locally: object snapshot (md5 + ACL of every public function, views, policies incl. storage,
triggers, columns) identical to the pre-Phase-7 snapshot.

## 6. Test plan (local only)

### A. pgTAP `physical_tracking.test.sql`
1. Label codes: existing seed items all have a unique `P-` code after migration, their `updated_at` / quantities unchanged; a new item gets the next code
   automatically via session client (MANAGER), service_role and a definer function; format CHECK and UNIQUE reject manual duplicates / bad codes; code ≥ 100000 not truncated.
2. `storage_locations`: RLS — all staff read, only ADMIN writes, nobody deletes, anon nothing; code CHECK (lower-case / spaces / > 20 chars refused); RESTRICT when in use.
3. `ri_inbound_extracted_part` via each caller (`approve_return_material`, `approve_removed_part_inbound`, `donor_extract_part`):
   qty 1 → one new USED row qty 1 with capacity + label, one INBOUND of 1; qty 3 → three rows / three INBOUNDs, returned id is the first;
   an existing matching USED row is **not** touched; spec/product find-or-create and all error messages as before; atomicity (forced failure → nothing written).
4. `label_lookup`: item / donor / unknown code / lower-case input; history newest first, ≤ 50; **no `base_estimate`, no customer keys or values** in the JSON
   (same check style as Phase 6); every role incl. CS gets a result; anon has no EXECUTE (`has_function_privilege`, KI-8).
5. `set_storage_location`: ADMIN/MANAGER ok (item and donor), TECHNICIAN/RECEPTION/CS refused, inactive location refused, NULL clears, unknown id → Korean error.
6. Privileges/definitions: definer functions set `search_path` and check the role; `ri_next_item_label` executable by authenticated/service_role, not anon; RLS on the new table.
7. Regression: all existing assertions pass (606, with the merge assertions rewritten per §4.2); md5 + ACL snapshot of every pre-existing public function / view / policy / trigger: only
   the listed change (`ri_inbound_extracted_part`) and additions.

### B. E2E (local stack, seed accounts, temporary `.env.development.local` — deleted afterwards)
1. ADMIN: 보관 위치 관리 → add `A-01-04`, `DONOR-C07`; invalid code → Korean message; deactivate / reactivate.
2. MANAGER: approve a removed-part inbound with qty 2 → two USED rows qty 1 with two labels in 재고 관리; the matching old USED row unchanged.
3. MANAGER: 라벨 인쇄 → select the two units + a donor → print view shows 3 labels with QR + code; decode the QR text (DOM/SVG) = `/scan/<code>` URL.
4. Logged out: open `/scan/P-…` → login → back on the scan page with the right item; TECHNICIAN sees history without prices; CS sees the page too.
5. MANAGER on the scan page: set location `A-01-04` → shown immediately (optimistic), persisted; forced error → rolled back with Korean message. Donor: `DONOR-C07`.
6. `/scan` input with lower-case code and unknown code → "등록되지 않은 라벨입니다."
7. Ticket detail: material picker shows "· P-…" for the units; dispatch of one unit → its scan history shows OUTBOUND with receipt no.
8. Apex `/scan`, `/labels` → `/`. RECEPTION: no 라벨 인쇄 menu, `/labels` → `/dashboard`.

### C. Static / advisors / rollback
`npx supabase db reset` ×2; `npx supabase test db`; `npm run db:types`, `typecheck`, `lint`, `build`;
`npx supabase db advisors --local --type all --level info` — new findings fixed, pre-existing listed; rollback rehearsal (§5).

## 7. Implementation order

1. Migration + pgTAP A (incl. rewriting the merge assertions) → 2. types → 3. locations admin page → 4. scan pages + `set_storage_location` →
5. label picker + print view (QR) → 6. inventory / donor / ticket display lines, menu, proxy, `.limit(1)` fixes → 7. E2E, static checks, advisors,
rollback rehearsal → 8. report, docs, local commit. Any conflict with the real schema or a step failing twice → STOP and ask (R8).

## 8. Risks

- **Behaviour change for every extracted-part inbound** (§3.4): 재고 관리 shows several identical USED rows instead of one aggregate row; the material picker lists
  them separately (mitigated by the label suffix). Bulk extractions (e.g. "나사 20개") create 20 rows / 20 labels — see §11-2 for the alternative.
- **qty-0 unit rows accumulate** after dispatch (kept on purpose: the label keeps its history). A "재고 0 숨기기" filter is out of scope.
- Rows that were merged before Phase 7 keep qty > 1 under one label; they cannot be split by this phase (R9).
- `.limit(1)` in the webhook: an n8n USED inbound that matches several units is added to the **oldest** of them (today it would fail with 500). n8n sends condition per item; if it sends USED for extracted-type parts, that unit row grows beyond 1.
- Location changes are not logged (no movement history); the scan page shows the current location only.
- Label printing depends on the browser print dialog and printer driver margins; the size is a CSS constant (§11-7).
- QR encodes the `login.` URL of the host that printed it: labels printed locally point to `login.localhost` — print production labels from production.
- `donor_no` (Phase 4) uses `lpad(…, 4)` — after D-9999 the 5-digit value would be truncated and collide (UNIQUE would refuse). Far away; recorded, not changed.
- Deploy order for Brad: after 0.5 → 1 → … → 6; migration first (existing rows get codes; the old app ignores the new columns; extracted inbound switches to qty-1 immediately), then the app.

## 9. Out of scope

Location hierarchy tables / location move history / location (shelf) labels with their own QR (§11-10); stock-taking by scan; dispatch by scanning; hiding qty-0 rows;
splitting existing aggregate rows; manual "/inventory/new" registration of USED parts as qty-1 units (§11-9); serial numbers; label for outsourced (`외주`) items;
AI access (Phase 8/9); KI-7, KI-9, KI-10.

## 10. Files

| New | Changed |
| --- | --- |
| 1 migration; `supabase/tests/physical_tracking.test.sql`; `supabase/test-fixtures/phase7/rollback.sql`; §4.1 files; `phases/phase-7-report.md` | §4.2 list |

## 11. Decisions needed from Brad (with APPROVED)

**Answers (Brad, 2026-10-03):** 1 local Docker ✅ · 2 **(a)** n rows of qty 1 ✅ · 3 ✅ · 4 flat table as planned ✅ ·
5 **keep today's permission** — movement history only for ADMIN/MANAGER; other staff see item/donor info and location without history ✅ ·
6 ✅ · 7 thermal 50 × 30 mm ✅ · 8 **leave `addInventoryItem` and the webhook untouched**; fix later if errors occur (risk recorded) ✅ ·
9 manual registration unchanged ✅ · 10 shelf labels later ✅. "APPROVED" given 2026-10-03.

Applied changes to this plan: `label_lookup` returns `history` only when the caller is ADMIN/MANAGER (others get `history: null`);
the two `.limit(1)` rows of §4.2 are dropped.


1. **Dev target** = local Docker Supabase? (placeholder in the prompt)
2. **qty-1 extracted parts (Q8)** — change `ri_inbound_extracted_part` (§3.4):
   (a) **recommended** — quantity n → n rows of qty 1, n labels, n INBOUNDs; callers store the first id;
   (b) one new row per extraction with qty n (never merged, one label per extraction batch) — simpler for bulk parts but not "individual";
   (c) keep merging (no Q8 change for extracted parts).
3. **Label codes:** items `P-00001` (new sequence), donors reuse `donor_no` `D-0001`. Existing item rows receive codes **in the migration** (no `updated_at` change). OK?
4. **Locations:** flat table, the code carries the structure (`A-01-04`, `DONOR-C07`); managed by ADMIN; assigned by ADMIN/MANAGER on the scan page. OK, or do you want zone/rack/slot as separate fields?
5. **Scan history visibility:** all staff see the item's movement history (date, type, qty, note, employee, receipt no.; no prices, no customer data) via `label_lookup`. Today `inventory_transactions` is ADMIN/MANAGER only. OK, or history for ADMIN/MANAGER only?
6. **New dependency `qrcode`** (MIT, server-side SVG) + `@types/qrcode`. OK?
7. **Label stock / printer:** which printer and label size? Proposal: thermal label printer, **50 × 30 mm, one label per page**. Alternative: A4 label sheets (e.g. 3 × 8). The size is one CSS constant.
8. **`.maybeSingle()` → `.limit(1)`** in `addInventoryItem` duplicate check and the n8n webhook item lookup (prevents a silent pass / 500 once qty-1 rows exist). OK, or leave both untouched and accept the risk?
9. **Scope of "used parts":** only the extraction paths (§3.4) create qty-1 units; manual registration (`/inventory/new`, any condition) keeps one row per product. The ticket material picker shows the label suffix. OK?
10. **Location (shelf) labels:** not included (scanning a shelf to list its contents). Add now, or later?
