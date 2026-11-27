# Phase 4.1 — 매장 보관 기기를 Donor로 등록 (접수 기록 없음) — PLAN

Status: **DRAFT — waiting for Brad's "APPROVED" (R1).** Nothing has been implemented.
Branch: `feat/repair-intelligence` (see D0). Dev target: **local Docker Supabase only** (R3). Production: SELECT-only checks (§0); nothing is applied there.

## 승인 조건 (R11)

_(APPROVED 메시지의 결정·조건을 구현 전에 여기에 원문 취지 그대로 기록한다.)_

---

## 0. Preconditions (checked 2026-11-27, production SELECT-only)

- Production `donor_devices` = **0 rows**, `donor_part_candidates` = 0 rows. No existing donor row is affected.
- Production last migration = `20261111090000` = last file in `supabase/migrations/` (repo and production match).
- `feat/repair-intelligence` (`ae80333`) is an ancestor of `main` and is **22 commits behind** it.
  The commits after it include migrations `20261004…`–`20261111…`, so implementation must start from current `main` (D0).
- Current definitions used below are the Phase 0.6 versions in `20261003141631_api_guard_ri.sql`.
  No later migration redefines `donor_*`, `label_lookup`, `ri_purchase_resources` or `ri_inbound_extracted_part` (grep-checked).

## 1. Goal and acceptance

**Problem.** A Donor can only be created by `donor_convert_from_ticket`. That function needs a ticket that is
`CANCELED` + `cancel_device_disposal = 'DISPOSE'` and not yet dispose-confirmed. `donor_devices.source_ticket_id` is `NOT NULL UNIQUE`.
Devices that have been in the store for a long time have no ticket. These include devices bought for parts, devices of unknown origin, and
devices from old disposals that were already confirmed. None of them can be registered, so their parts are invisible
to search, the purchase guard and VECTOR.

**Goal.** ADMIN/MANAGER register such a device as a Donor that is a **company asset**. The record keeps the acquisition history, the staff member who confirmed that
the company owns it, and optionally the acquisition date and cost. After that, the existing Donor flows work unchanged:
candidates, photos, location, D- label, QR scan, extraction inbound, search, purchase guard and VECTOR.

**Acceptance**
1. ADMIN/MANAGER can create a Donor without a ticket; other roles are refused with a Korean message.
2. Registration requires the ownership checkbox and an acquisition note (취득 경위).
3. A ticket-less Donor is found by D- label QR scan and appears in the purchase guard Donor list (rules 5/6). It also appears in
   `search_parts_for_device` / `get_device_knowledge` / `donor_potential_stock` / VECTOR, and its candidates can be extracted into stock.
4. Ticket-based conversion (`donor_convert_from_ticket`) behaves exactly as before (pgTAP regression).
5. No existing row changes; rollback restores the previous schema.

## 2. What is NOT changed

- `donor_convert_from_ticket`: not changed.
- `ri_inbound_extracted_part`: not changed.
- `donor_part_candidates`, `donor_photos`, the view `donor_potential_stock` and storage policies: not changed.
- `set_storage_location`: not changed (it already handles donors by id).
- Disposal confirmation flow, dispatch/cost logic and `recalc_ticket_material_cost`: not changed.
- Extracted parts keep `base_estimate = 0` (D2). Acquisition cost is recorded only and is **not** spread over parts.

## 3. Schema — one migration `supabase/migrations/20261127090000_donor_store_devices.sql`

### 3.1 `donor_devices` — new columns (additive)

| column | type | rule |
| --- | --- | --- |
| `origin` | `text NOT NULL DEFAULT 'TICKET_DISPOSAL'` | `CHECK (origin IN ('TICKET_DISPOSAL','STORE_STOCK'))`. Existing/ticket rows get the default |
| `acquisition_note` | `text` | `CHECK (acquisition_note IS NULL OR char_length(acquisition_note) <= 300)` — 취득 경위 (예: "2023년 부품용 매입", "옛 접수 R-2024-0012 폐기분") |
| `acquired_on` | `date` | optional 취득일 |
| `acquisition_cost` | `integer` | optional 취득가(원), `CHECK (acquisition_cost IS NULL OR acquisition_cost >= 0)`. Record only (D2) |

Comments in Korean on each column; `consent_confirmed_by/at` comment updated:
"TICKET_DISPOSAL: 고객 소유권 포기 동의 확인 / STORE_STOCK: 회사 소유 확인".

### 3.2 Constraint change on an existing column — **R2 exception, listed explicitly**

- `ALTER TABLE donor_devices ALTER COLUMN source_ticket_id DROP NOT NULL;`
  The `UNIQUE (source_ticket_id)` constraint and the FK stay. Postgres allows many NULLs under UNIQUE.
- Replacement consistency check (new constraint):
  ```sql
  CONSTRAINT donor_devices_origin_source CHECK (
    (origin = 'TICKET_DISPOSAL' AND source_ticket_id IS NOT NULL)
    OR (origin = 'STORE_STOCK' AND source_ticket_id IS NULL
        AND NULLIF(btrim(acquisition_note), '') IS NOT NULL))
  ```
  This keeps the old guarantee for ticket-based donors, so a ticket Donor can never lose its ticket.
- `consent_confirmed_by/at` stay `NOT NULL` and are reused (D-semantics above). No NOT NULL is dropped on them.

### 3.3 Privileges / RLS

- RLS policies unchanged (SELECT all staff, UPDATE ADMIN/MANAGER). INSERT stays RPC-only.
- `GRANT UPDATE (acquisition_note, acquired_on, acquisition_cost) ON donor_devices TO authenticated;`
  This is in addition to the existing column grant. The CHECK still forces a non-empty note for `STORE_STOCK`.
  `origin` and `source_ticket_id` are **not** updatable by clients.

### 3.4 New function `public.donor_register_store_device(...)`

```
donor_register_store_device(
  p_owned_confirmed boolean, p_device_type device_type, p_brand text, p_acquisition_note text,
  p_model_text text DEFAULT NULL, p_tag_info text DEFAULT NULL,
  p_catalog_model_id uuid DEFAULT NULL, p_catalog_variant_id uuid DEFAULT NULL, p_catalog_board_id uuid DEFAULT NULL,
  p_condition_note text DEFAULT NULL, p_storage_note text DEFAULT NULL, p_storage_location_id uuid DEFAULT NULL,
  p_acquired_on date DEFAULT NULL, p_acquisition_cost integer DEFAULT NULL
) RETURNS jsonb  -- {donor_id, donor_no}
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
```
- First statement: `PERFORM public.ri_api_guard_definer('{anon}');` (R10). Then the role check:
  ADMIN/MANAGER only → `'Donor 등록 권한이 없습니다. 관리자 또는 팀장만 가능합니다.'`
- Validation (Korean messages):
  - `p_owned_confirmed` must be true → `'회사 소유 기기임을 확인해 주세요.'`
  - brand 1–50 chars; acquisition note required (≤300) → `'취득 경위를 입력해 주세요.'`
  - variant needs a model (existing FK enforces the pair); cost ≥ 0
  - location must exist and be active (same rule as `set_storage_location`)
- Insert with `origin = 'STORE_STOCK'`, `source_ticket_id = NULL`, `consent_confirmed_by = auth.uid()`, `consent_confirmed_at = now()`, `created_by = auth.uid()`.
- One transaction. Privileges: `REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO anon, authenticated, service_role` (R10 pattern).

### 3.5 Changes to existing functions — explicit list (R2)

Each change is a `CREATE OR REPLACE` of the current Phase 0.6 body with only the lines below changed. Signatures, guards and grants are unchanged.

| function | change | why |
| --- | --- | --- |
| `label_lookup(text)` — D- branch | `JOIN repair_tickets r` → `LEFT JOIN`. Add `'origin'`, `'acquisition_note'`, `'acquired_on'` to the donor JSON. `source_receipt_no`/`source_ticket_id` become null for store devices | Without it, a ticket-less Donor's QR shows "찾을 수 없음" |
| `ri_purchase_resources(uuid)` — donor part | `JOIN repair_tickets st` → `LEFT JOIN`. `st.is_test IS NOT TRUE` is already NULL-safe | Without it, ticket-less Donor parts never appear in the purchase guard |
| `donor_extract_part(...)` | After `ri_inbound_extracted_part(…, NULL ticket, …)`, **only when `origin = 'STORE_STOCK'`**, update this call's INBOUND rows: `notes = '적출품 반환 입고 · Donor ' \|\| donor_no`. Rows are matched by `ticket_id IS NULL AND user_id = auth.uid() AND transaction_type = 'INBOUND' AND created_at = now() AND notes = '적출품 반환 입고'` (`now()` is fixed per transaction) | D4: shows which Donor the stock came from when there is no receipt no. |

`ri_inbound_extracted_part` already accepts `p_ticket_id = NULL` (`inventory_transactions.ticket_id` is nullable). It is not changed.

## 4. Application (UI Korean; components < 200 lines; R5)

### 4.1 New files
- `src/app/(admin)/donors/new/page.tsx` — guard: ADMIN/MANAGER (`DONOR_EDIT_ROLES`), others → `/donors`.
- `src/app/(admin)/donors/new/StoreDonorForm.tsx` — 매장 보관 기기 등록 form:
  - 기기 종류*, 브랜드*, 모델명, 태그 정보, 표준 모델 선택기 (+ 변형)/보드 선택기 (existing pickers)
  - 상태 메모, 보관 위치 (existing location picker), 보관 메모
  - 취득 경위*, 취득일, 취득가(원)
  - checkbox* "이 기기는 회사 소유이며 고객이 맡긴 기기가 아님을 확인했습니다."
  - Submit **등록** → redirect to `/donors/{id}`.
  - Korean validation; on error the form keeps the input (no optimistic list insert, since the page redirects).

### 4.2 Existing files changed
- `donors/actions.ts` — add `registerStoreDonorAction` (RPC call). Add acquisition fields to `updateDonorAction`.
- `donors/labels.ts` — `ORIGIN_LABEL` (`TICKET_DISPOSAL` 접수 폐기 전환 / `STORE_STOCK` 매장 보관), `OWNED_TEXT`.
- `donors/page.tsx` + `DonorsClient.tsx` — **+ 매장 보관 기기 등록** button (ADMIN/MANAGER), origin badge, origin filter, and an intro text that covers both origins.
- `donors/[id]/page.tsx` — skip the ticket query when `source_ticket_id` is null. Show "출처: 매장 보관 · {취득 경위}" and, for store devices, "회사 소유 확인: {직원} · {시각}" instead of "소유권 포기 동의 확인".
- `donors/[id]/DonorInfoForm.tsx` — editable 취득 경위/취득일/취득가 (ADMIN/MANAGER).
- `scan/[code]/types.ts` (`source_ticket_id`/`source_receipt_no` → `string | null`, add origin fields) and `ScanDonorView.tsx` (store-device text).
- `src/types/supabase.ts` — regenerated (`npm run db:types`).
- `tickets/[id]/page.tsx` — no change (it looks up by ticket id; store devices never match).

## 5. Rollback SQL (`supabase/test-fixtures/phase4.1/rollback.sql`)

```sql
BEGIN;
-- refuse if store devices exist (data would be lost / NOT NULL would fail)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.donor_devices WHERE origin = 'STORE_STOCK') THEN
    RAISE EXCEPTION 'STORE_STOCK donor rows exist — export/handle them before rollback';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.donor_register_store_device(boolean, public.device_type, text, text, text, text, uuid, uuid, uuid, text, text, uuid, date, integer);
-- restore Phase 0.6 bodies of label_lookup, ri_purchase_resources, donor_extract_part
-- (verbatim copies from 20261003141631_api_guard_ri.sql, included in the fixture file)
REVOKE UPDATE (acquisition_note, acquired_on, acquisition_cost) ON public.donor_devices FROM authenticated;
ALTER TABLE public.donor_devices DROP CONSTRAINT IF EXISTS donor_devices_origin_source;
ALTER TABLE public.donor_devices ALTER COLUMN source_ticket_id SET NOT NULL;
ALTER TABLE public.donor_devices
  DROP COLUMN IF EXISTS acquisition_cost, DROP COLUMN IF EXISTS acquired_on,
  DROP COLUMN IF EXISTS acquisition_note, DROP COLUMN IF EXISTS origin;
COMMENT ON COLUMN public.donor_devices.consent_confirmed_by IS '소유권 포기 동의를 확인한 직원';
NOTIFY pgrst, 'reload schema';
COMMIT;
```
Inventory rows created from store donors remain normal stock after rollback (by design; they are real items).

## 6. Test plan (local only)

### A. pgTAP `supabase/tests/donor_store_devices.test.sql`
1. Schema: new columns and defaults exist. `source_ticket_id` is nullable. The CHECK refuses `STORE_STOCK` + ticket, `TICKET_DISPOSAL` without a ticket, and `STORE_STOCK` with an empty note.
2. `donor_register_store_device`:
   - ADMIN and MANAGER succeed; donor_no is D-xxxx.
   - RECEPTION/TECHNICIAN/EXPERT_REPAIR/CS are refused.
   - Missing checkbox, brand or note is refused; a negative cost is refused; an inactive location is refused.
3. Client cannot INSERT directly and cannot UPDATE `origin`/`source_ticket_id`. MANAGER can update `acquisition_note`; setting it empty on a store row fails.
4. `label_lookup('D-xxxx')` for a store Donor returns `kind = DONOR` with null receipt.
5. `ri_purchase_resources` returns a store Donor candidate (rule 5 same spec, rule 6 same device).
6. `donor_extract_part` on a store Donor: it creates qty-1 USED items with an INBOUND whose ticket is null and note `적출품 반환 입고 · Donor D-xxxx`, and the candidate becomes EXTRACTED.
   A **ticket Donor extraction keeps note `적출품 반환 입고`** and its ticket id (regression).
7. `search_parts_for_device` / `get_device_knowledge` / `donor_potential_stock` include the store Donor.
8. Regression: the existing `donor_devices.test.sql`, `purchase_guard.test.sql`, `physical_tracking.test.sql`, `api_guard.test.sql` (R10 invariant) and `vector_integration.test.sql` all pass unchanged.

### B. E2E (local stack + `next dev`, seed accounts, temporary `.env.development.local` deleted afterwards)
- MANAGER: Donor 기기 → **+ 매장 보관 기기 등록** → submit without the checkbox (Korean error) → submit valid → detail shows "출처: 매장 보관".
- Add a candidate, print the D- label, open `/scan/D-xxxx` (store text, no receipt link), and extract the candidate into stock.
- TECHNICIAN: the button is not visible, and `/donors/new` redirects.
- Ticket conversion path still works from disposal confirmation.

### C. Static / advisors / rollback
- `npm run db:types`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Supabase security/performance advisors: no new findings.
- Rollback fixture applied on a fresh reset → schema equals pre-phase (snapshot diff), then re-apply the migration.

## 7. Implementation order (after APPROVED)
1. Record approval conditions in this file and commit (R11).
2. Migration + rollback fixture → `npx supabase db reset` → pgTAP.
3. Types → actions → UI → E2E.
4. Advisors, static checks → `phase-4.1-report.md` → local commit (R7) → report in Korean and stop.

## 8. Risks
- **Misuse: a customer's device registered as a company asset.** Mitigations:
  - ADMIN/MANAGER only, with a mandatory ownership checkbox
  - mandatory acquisition note, plus who and when (consent columns + `created_by`)
  - origin badge on every screen
  A tag/serial match check against open tickets is out of scope (§9).
- **R2 exception** (`DROP NOT NULL`): mitigated by the new CHECK and by production having 0 donor rows. Rollback refuses while store rows exist.
- `donor_extract_part` note update matches rows by transaction time. It is safe because the RPC is one transaction and `now()` is per transaction. pgTAP test 6 covers quantity > 1.
- Re-creating three functions risks drifting from their current bodies. Mitigated by copying them verbatim from the Phase 0.6 file and diff-reviewing them in the report.

## 9. Out of scope
- Allocating acquisition cost to extracted parts' `base_estimate` (D2).
- Linking a store Donor to an old ticket (D3: old receipt no. is written in the acquisition note only).
- Duplicate/serial checks against tickets, bulk/CSV import of store devices, asset depreciation/accounting reports.
- Changing who may convert ticket devices.

## 10. Files
- New: `supabase/migrations/20261127090000_donor_store_devices.sql`, `supabase/tests/donor_store_devices.test.sql`,
  `supabase/test-fixtures/phase4.1/rollback.sql`, `src/app/(admin)/donors/new/page.tsx`, `src/app/(admin)/donors/new/StoreDonorForm.tsx`,
  `docs/repair-intelligence/phases/phase-4.1-report.md`.
- Changed: files in §4.2, `src/types/supabase.ts`, `docs/repair-intelligence/02-roadmap.md` (Phase 4.1 entry),
  `docs/operations/initial-stock-registration.md` §6 (매장 보관 기기 등록 방법 — staff guide; separate commit, docs branch).

## 11. Decisions (recommended options pre-selected by Brad, 2026-11-27: "추천안으로 계획서 작성")
- **D0. Branch base.** Fast-forward local `feat/repair-intelligence` to current `main` (`git merge --ff-only main`, local only, no push), then work there.
  _Needs explicit confirmation: R7 forbids merges. This is a local fast-forward of the RI branch, not a merge into `main`._
- **D1. Phase name:** Phase 4.1 (Donor extension). Phase 10 stays reserved for the knowledge engine.
- **D2. Company asset scope:** record 취득일/취득가 only. Extracted parts stay at 0원, and cost calculation is unchanged.
- **D3. Old, already dispose-confirmed devices:** register them as 매장 보관 with the old receipt no. in 취득 경위 (no ticket link).
- **D4. Extraction note for store Donors:** `적출품 반환 입고 · Donor D-xxxx`.
- **D5. Permission:** ADMIN/MANAGER (same as ticket conversion).
- **D6. Checkbox wording:** "이 기기는 회사 소유이며 고객이 맡긴 기기가 아님을 확인했습니다." (change if needed)
