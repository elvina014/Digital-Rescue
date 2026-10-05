# Phase 4 — Donor devices (Donor 기기) — PLAN

Status: **APPROVED 2026-10-03 — EXECUTED 2026-10-03** (see `phase-4-report.md`; decisions in §11). Branch `feat/repair-intelligence`.

## 0. Preconditions (checked 2026-10-02)

| Check | Result |
| --- | --- |
| Phase 3 report exists, all acceptance rows ✅ | yes (`phase-3-report.md`, pgTAP 351/351, commit `ec22d4b`) |
| Phase 1 / 2 reports (dependencies) | ✅ |
| Production status | Phases 0.5, 1, 2, 3 are "local ✅, production deploy pending" (Brad's step). Does not block local work. |
| Dev target | The session prompt left the target as a placeholder. Per Q9 / `03-working-rules.md` = **local Supabase on Docker** (stack is running). Brad confirms "local" together with APPROVED (§11-1). |
| Working tree | Only pre-existing, non-RI changes (`.claude/*`, `.gitignore`) — not touched. |
| "Original brief" | The roadmap says "`donor_devices`, `donor_part_candidates` (as in the original brief)". The brief is **not in the repository**; the columns below are my proposal from the roadmap, Q6, Q8, P5 and the real schema. Brad checks them against the brief (§11-2). |

CLI: local-only commands (`db reset`, `test db`, `gen types --local`, `db advisors --local`). Production: no queries planned.

## 1. Goal and acceptance (roadmap)

A device the customer gave up can be kept as a **donor** instead of being scrapped; its usable parts are listed as
*potential stock* and are booked into the normal inventory only when someone actually extracts them (P5, lazy).

Acceptance: donor parts appear as potential stock; extraction creates a normal `inventory_items` row + INBOUND transaction.

## 2. What is NOT changed

- No existing table column, trigger, function, policy or view is altered. `ri_inbound_extracted_part` (Phase 2) is
  **called, not changed**; `repair_set_updated_at` is reused as trigger function (not changed). md5 of all pre-existing
  functions is compared before/after, as in Phase 3.
- `confirmDisposalAction` and the "확인 완료" button: untouched (Q6 — donor conversion is an *additional* option).
- `cancelTicketAction`, `restoreCanceledTicketAction`, `approveTicketAction`: untouched. A converted ticket gets
  `dispose_confirmed_at` set, so the existing restore rule ("폐기 확인이 완료된 접수건은 복원할 수 없습니다") applies as is.
- No stock is written at conversion or when candidates are listed — only at extraction, through the Phase 2 function (P7).
- `ticket-images` bucket and its policies (KI-7): untouched. No new enforcement → no flag needed (P10).
- `material_cost_details`, `override_unit_price`: never written.

## 3. Schema — one migration `supabase/migrations/<UTC ts>_donor_devices.sql`

All new tables: `id uuid PK default gen_random_uuid()`, RLS enabled, `anon` revoked, index on every FK column.
Code values English upper-case; UI Korean.

### 3.1 Tables

| Table | Columns | Constraints |
| --- | --- | --- |
| `donor_devices` | `donor_no text NOT NULL DEFAULT 'D-' \|\| lpad(nextval('donor_no_seq')::text, 4, '0')` (human-readable id until Phase 7 labels; §11-3), `source_ticket_id uuid NOT NULL` → repair_tickets **RESTRICT** (§11-4), `device_type device_type NOT NULL`, `brand text NOT NULL` (≤ 50), `model_text text` (≤ 150), `tag_info text` (≤ 150) — snapshots confirmed by the person converting (no customer columns), `catalog_model_id` / `catalog_variant_id` / `catalog_board_id uuid NULL` → catalog_* RESTRICT (copied from the ticket, editable), `status text NOT NULL DEFAULT 'AVAILABLE'` CHECK IN (`AVAILABLE` 보관중, `DEPLETED` 적출 완료, `SCRAPPED` 폐기), `condition_note text`, `storage_note text` (free text location; structured locations = Phase 7), `consent_confirmed_by uuid NOT NULL` → employees RESTRICT, `consent_confirmed_at timestamptz NOT NULL`, `created_by`, `created_at`, `updated_at` | UNIQUE(`donor_no`); UNIQUE(`source_ticket_id`) (one donor per ticket); CHECK variant ⇒ model (same rule as tickets) |
| `donor_part_candidates` | `donor_id` → donor_devices **RESTRICT**, `description text NOT NULL` (1–200), `part_spec_id uuid NULL` → part_specs RESTRICT, `quantity int NOT NULL DEFAULT 1 CHECK > 0`, `condition_estimate text NOT NULL DEFAULT 'UNTESTED'` CHECK IN (`GOOD` 양호, `UNTESTED` 미확인, `FAULTY` 불량), `status text NOT NULL DEFAULT 'AVAILABLE'` CHECK IN (`AVAILABLE` 적출 가능, `REQUESTED` 적출 입고 요청, `EXTRACTED` 입고 완료, `UNUSABLE` 사용 불가), `note text`, inbound fields (same meaning as `ticket_removed_parts`): `category_id` → inventory_categories, `return_spec text`, `return_name text`, `return_capacity text` (≤ 50), **RPC-only:** `extracted_at`, `extracted_by` → employees SET NULL, `inventory_item_id` → inventory_items **SET NULL**, `source_removed_part_id uuid NULL` → ticket_removed_parts SET NULL (§11-6), `created_by`, `created_at`, `updated_at` | CHECK (`status NOT IN ('REQUESTED','EXTRACTED')` OR category + spec + name present); CHECK (`extracted_at IS NULL` = (`status <> 'EXTRACTED'`)) |
| `donor_photos` | `donor_id` → donor_devices **CASCADE**, `path text NOT NULL` (object path in bucket `donor-photos`), `description text`, `uploaded_by uuid DEFAULT auth.uid()` → employees SET NULL, `created_at` | UNIQUE(`path`) |

Sequence `donor_no_seq` (no API grants; used only by the column default inside the definer function).
Triggers: `repair_set_updated_at()` (existing function) on `donor_devices`, `donor_part_candidates`.

### 3.2 View `donor_potential_stock` (`security_invoker = true`) — "potential stock"

One row per candidate with `status IN ('AVAILABLE','REQUESTED')` on a donor with `status = 'AVAILABLE'`:
candidate (id, description, quantity, condition_estimate, status, note), part spec (id, type, name),
donor (id, `donor_no`, brand, model_text, catalog model label, board number, storage_note). No customer data,
no ticket id. `REVOKE ALL … FROM anon`; writes revoked from `authenticated`.
This is the object Phase 5 search and the Phase 6 purchase guard will read.

### 3.3 Storage — photos outside the ticket image array

New bucket `donor-photos`: **private**, 10 MB limit, MIME `image/webp, image/jpeg, image/png` (does not repeat KI-7).
Policies on `storage.objects` (new, named `donor_photos_*`; existing policies untouched):

| Operation | Rule |
| --- | --- |
| SELECT | `bucket_id = 'donor-photos' AND get_my_role() IS NOT NULL` (staff only; shown through signed URLs) |
| INSERT | `bucket_id = 'donor-photos' AND get_my_role() IN ('ADMIN','MANAGER','TECHNICIAN','EXPERT_REPAIR')` |
| DELETE | `bucket_id = 'donor-photos' AND get_my_role() IN ('ADMIN','MANAGER')` |

Path `<donor_id>/<timestamp>.webp`; server action converts with `sharp` (same as the ticket upload path), max 12 per donor.

### 3.4 RLS

| Table | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `donor_devices` | all authenticated (no PII; Q7) | none (RPC only) | ADMIN, MANAGER — column grant only on `brand, model_text, tag_info, catalog_*, status, condition_note, storage_note` | none |
| `donor_part_candidates` | all authenticated | ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR; `status <> 'EXTRACTED'` | same roles; USING and WITH CHECK `status <> 'EXTRACTED'` (an extracted row is frozen for everyone). Column grants exclude `extracted_at/by`, `inventory_item_id`, `source_removed_part_id`, `donor_id` | same roles, `status IN ('AVAILABLE','UNUSABLE')` |
| `donor_photos` | all authenticated | ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR | none | ADMIN, MANAGER |

### 3.5 Functions

Both: SECURITY DEFINER, `SET search_path = public`, role check via `get_my_role()`, Korean `RAISE EXCEPTION` (whole call rolls back),
`REVOKE ALL … FROM PUBLIC, anon, authenticated` then `GRANT EXECUTE … TO authenticated`. Called with the session client.

| Function | Role | One transaction |
| --- | --- | --- |
| `donor_convert_from_ticket(p_ticket_id uuid, p_consent boolean, p_brand text, p_model_text text, p_tag_info text DEFAULT NULL, p_condition_note text DEFAULT NULL, p_storage_note text DEFAULT NULL) RETURNS jsonb` | ADMIN, MANAGER (same as `confirmDisposalAction`) | lock ticket; must be `CANCELED` + `cancel_device_disposal = 'DISPOSE'` + `dispose_confirmed_at IS NULL` (= exactly the rows of the disposal widget); `p_consent` must be true ("소유권 포기 동의 확인이 필요합니다."); insert `donor_devices` (type + catalog ids from the ticket, texts from the parameters, consent by/at = caller/now); copy the ticket's removed parts with disposition `DONOR_KEEP` as `AVAILABLE` candidates (§11-6); `UPDATE repair_tickets SET dispose_confirmed_at = now()`; `ticket_logs` "시스템: 기기가 Donor로 전환되었습니다. (D-0001, 소유권 포기 동의 확인)". Returns `{donor_id, donor_no}`. |
| `donor_extract_part(p_candidate_id uuid, p_category_id uuid DEFAULT NULL, p_spec text DEFAULT NULL, p_name text DEFAULT NULL, p_capacity text DEFAULT NULL) RETURNS jsonb` | ADMIN, MANAGER (the roles that approve every other inbound today; §11-5) | lock candidate + donor; candidate `AVAILABLE` or `REQUESTED`; donor `AVAILABLE`; inbound fields = parameters if given, else the stored ones (required); category's spec must not be `외주`; `v_item := ri_inbound_extracted_part(category, spec, name, capacity, quantity, p_ticket_id := donor.source_ticket_id, p_tx_user_id := auth.uid())`; set `status = 'EXTRACTED'`, `extracted_at/by`, `inventory_item_id`, inbound fields. Returns `{item_id}`. |

Technician request step (no extra RPC): an ordinary UPDATE of the candidate to `status = 'REQUESTED'` with the inbound
fields (allowed by §3.4; the CHECK enforces the fields) — the same pattern as `ticket_removed_parts.disposition = 'STOCK'`
followed by `approve_removed_part_inbound`.

## 4. Application (UI Korean; new components < 200 lines; optimistic updates with rollback — R5)

Before coding: read the relevant guides in `node_modules/next/dist/docs/` per `AGENTS.md`.

### 4.1 New files

| File | Content |
| --- | --- |
| `src/app/(admin)/donors/actions.ts` | session-client server actions: `convertToDonorAction`, donor update, candidate add / update / delete / request, `extractDonorPartAction`, photo upload (sharp → WebP) / delete, signed URLs |
| `src/app/(admin)/donors/page.tsx`, `DonorsClient.tsx` | list: tabs "Donor 기기" (status filter, text) and "적출 가능 부품" (from `donor_potential_stock`, text filter on description / spec / model) |
| `src/app/(admin)/donors/[id]/page.tsx`, `DonorDetail.tsx`, `DonorInfoForm.tsx`, `CandidateList.tsx`, `CandidateForm.tsx`, `ExtractForm.tsx`, `DonorPhotos.tsx` | detail: info (ADMIN/MANAGER edit; `DeviceModelPicker` / `BoardPicker` reuse), photos, candidates (`PartSpecPicker` reuse; 상태; "적출 입고 요청" for technicians, "적출 입고" for ADMIN/MANAGER with category / spec / name / capacity — same inputs as the removed-part form), link to the source ticket by `receipt_no` |
| `src/components/common/DonorConvertForm.tsx` | inline form inside the disposal widget row: brand / model / tag (pre-filled, editable, hint "고객 개인정보를 지우고 저장하세요"), 상태 메모, 보관 위치, mandatory checkbox **"고객이 기기 소유권 포기(폐기 위임)에 동의했음을 확인했습니다."** — submit disabled until checked; row removed optimistically, restored on error |
| `src/components/common/DonorExtractRequestWidget.tsx` (+ small section loader) | ADMIN/MANAGER: "Donor 적출 입고 대기" (candidates in `REQUESTED`) with "입고 승인" → `donor_extract_part`; same look and optimistic behaviour as `RemovedPartInboundWidget` |
| `supabase/tests/donor_devices.test.sql`, `supabase/test-fixtures/phase4/rollback.sql` | pgTAP, rollback |

### 4.2 Existing files changed

| File | Change |
| --- | --- |
| `src/components/common/DisposalConfirmWidget.tsx` | second button "Donor로 전환" per row → toggles `<DonorConvertForm>`; needs `device_type` not required (taken from the ticket in the RPC). "확인 완료" unchanged. |
| `src/app/(admin)/dashboard/page.tsx`, `inventory/page.tsx` | mount the extract-request widget (one line each + loader call) |
| `src/components/layout/AdminSidebar.tsx` | menu "Donor 기기" for ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR (§11-7) |
| `src/proxy.ts` | `/donors` added to `ADMIN_PATHS` (served on `login.` only, blocked on the apex — same one-line change as `/catalog` in Phase 1) |
| `tickets/[id]/page.tsx`, `TicketDetailForm.tsx` | when the ticket has a donor: one read-only line "Donor 전환됨 · D-0001" linking to the donor (≈ +10 lines) |
| `src/types/supabase.ts` | regenerated |
| docs | `02-roadmap.md` status, `known-issues.md` KI-5 note, this plan's status, `phase-4-report.md` |

## 5. Rollback SQL

App first (`git revert <phase-4 commit>`), then:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.donor_extract_part(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.donor_convert_from_ticket(uuid, boolean, text, text, text, text, text);
DROP VIEW IF EXISTS public.donor_potential_stock;
DROP POLICY IF EXISTS donor_photos_select ON storage.objects;
DROP POLICY IF EXISTS donor_photos_insert ON storage.objects;
DROP POLICY IF EXISTS donor_photos_delete ON storage.objects;
DROP TABLE IF EXISTS public.donor_photos, public.donor_part_candidates, public.donor_devices;
DROP SEQUENCE IF EXISTS public.donor_no_seq;
COMMIT;
-- Bucket: empty and delete `donor-photos` through the Storage API / dashboard
-- (direct DELETE on storage tables is blocked by Supabase). An empty private bucket left behind is harmless.
```

Effect: donor records, candidates and photo rows are lost. Stock already booked by extraction stays (ordinary
`inventory_items` / `inventory_transactions` rows). Converted tickets keep `dispose_confirmed_at` and their log line —
they then look like normally confirmed disposals. Rehearsed locally and verified (0 Phase 4 objects, function md5 unchanged, `db reset` + all tests).

## 6. Test plan (local only)

### A. pgTAP `donor_devices.test.sql`
1. Constraints: one donor per ticket; `donor_no` unique and generated; status CHECKs; `REQUESTED` needs inbound fields; `EXTRACTED` ⇔ `extracted_at`.
2. RLS with the 6 seed roles: all read; nobody inserts `donor_devices` directly; UPDATE only ADMIN/MANAGER and only granted columns;
   candidates writable by ADMIN/MANAGER/TECHNICIAN/EXPERT_REPAIR, not RECEPTION/CS; nobody can set `EXTRACTED`, `extracted_*`, `inventory_item_id` directly; extracted row frozen; anon nothing.
3. `donor_convert_from_ticket`: TECHNICIAN/RECEPTION/CS refused; consent false/NULL refused; ticket not CANCELED, `RETURN`, pre-receipt cancel (NULL), already confirmed, already converted → Korean errors, nothing written;
   success → donor row with ticket's type/catalog ids, `dispose_confirmed_at` set, log line, `DONOR_KEEP` removed parts copied (other dispositions not); **every other ticket column unchanged**; no `inventory_*` row written.
4. `donor_extract_part`: non-ADMIN/MANAGER refused; missing inbound fields refused; donor `SCRAPPED` refused; already extracted refused;
   success, no matching stock → new `inventory_items` (USED, qty = candidate qty, capacity stored, `base_estimate 0`) + exactly one INBOUND "적출품 반환 입고" (user = caller, ticket = source ticket);
   success, matching USED row → quantity incremented (same result as `approve_removed_part_inbound` on the same fixture);
   atomicity: forced failure inside the inbound function → candidate still `AVAILABLE`, no stock/transaction change; `외주` spec refused.
5. `donor_potential_stock`: only `AVAILABLE`/`REQUESTED` candidates of `AVAILABLE` donors; extracted / unusable / scrapped-donor rows absent; no customer columns.
6. Storage: bucket private with limit and MIME list; policies by role (ADMIN/TECH insert, CS refused, anon cannot select); existing `ticket_images_*` / `page_content_images_*` policy definitions unchanged.
7. Privileges/definitions: no EXECUTE for PUBLIC/anon (via `has_function_privilege`, KI-8); definer functions have `search_path` and a role check; RLS on 3 tables.
8. Regression: the existing 351 assertions pass; md5(`prosrc`) of all pre-existing public functions identical before/after.

### B. E2E (local stack, seed accounts, temporary `.env.development.local` — deleted afterwards)
1. MANAGER, dashboard "폐기 기기 확인 대기": "Donor로 전환" → submit disabled until the checkbox is ticked → convert → row disappears, donor `D-0001` exists, ticket shows "Donor 전환됨"; "취소 복원" refused with the existing message.
2. Another DISPOSE ticket: plain "확인 완료" works exactly as before (no donor row).
3. TECHNICIAN: `/donors` → add candidates (with / without 부품 규격), upload a photo, "적출 입고 요청" without category → Korean validation; with fields → `REQUESTED`; cannot see "적출 입고".
4. MANAGER: widget "Donor 적출 입고 대기" → "입고 승인" → stock row + INBOUND visible in 재고 관리; candidate "입고 완료", read-only; optimistic row restored on a forced error.
5. "적출 가능 부품" tab lists remaining candidates; after setting the donor to 폐기 they disappear.
6. RECEPTION/CS: no menu; apex `/donors` → `/`. Photo URL without a session → not accessible.

### C. Static / advisors / rollback
`npx supabase db reset` ×2; `npx supabase test db`; `npm run db:types`, `typecheck`, `lint`, `build`;
`npx supabase db advisors --local --type all --level info` — new findings fixed, pre-existing listed; rollback rehearsal (§5).

## 7. Implementation order

1. Migration + pgTAP A → 2. types → 3. conversion form in the disposal widget → 4. `/donors` list + detail (info, candidates, photos) →
5. extraction (request + approve widget) → 6. ticket line, menu, proxy → 7. E2E, static checks, advisors, rollback rehearsal → 8. report, docs, local commit.
Any conflict with the real schema or a step failing twice → STOP and ask (R8).

## 8. Risks

- **Roadmap conflict — "qty-1 items (Q8)" vs the Phase 2 function (§11-8).** `ri_inbound_extracted_part` *adds to* an existing USED row with the same
  category / spec / product / capacity. As planned, donor extraction therefore behaves exactly like every other extracted part (acceptance is met:
  normal item + INBOUND), but parts are **not** individual qty-1 rows yet.
- **KI-9:** a ticket that was approved and then canceled by ADMIN cannot be updated at all (`protect_approved_ticket` keyword bug), so neither
  "확인 완료" (already today) nor "Donor로 전환" works for such tickets. Not worked around.
- **Consent is a checkbox + who/when**, not a signed document. The wording is Q6's.
- **PII:** `device_model` / `tag_info` sometimes contain pasted customer text (00 §6); the donor table is readable by all staff. Mitigation: the
  converting person sees and edits the texts before saving (hint), nothing is copied silently.
- **Restore blocked after conversion** with the existing message ("실물이 남아 있지 않으므로…") — wording slightly off for a donor, but the rule is right.
  Undoing a conversion (wrong click) has no tool in this phase: ADMIN sets the donor to 폐기; the ticket stays confirmed.
- **Donor status is manual** (적출 완료 / 폐기); nothing auto-closes a donor when its last candidate is extracted.
- New private bucket: signed URLs expire (1 h) — pages re-sign on load.
- `source_ticket_id` RESTRICT: a ticket with a donor cannot be hard-deleted (same rule as Phase 2/3 data).
- Deploy order for Brad: migration first (old app ignores new objects), then the app. After 0.5 → 1 → 2 → 3.

## 9. Out of scope

Search by device / part and showing donor parts at intake (Phase 5); purchase guard using donor parts (Phase 6); labels, `label_code`, storage-location
structure, qty-1 individual items (Phase 7); AI access (Phase 8/9); donors without a source ticket (purchased junk units — §11-4); reserving a donor part
for a ticket or dispatching it directly to a ticket (extracted parts go to stock and are then requested through the normal dispatch flow — P6/P7);
compatibility evidence from donor parts (Phase 3 decision 7); stock inheriting `part_spec_id` (Phase 3 decision 8); undo-conversion tool; KI-7, KI-9, KI-10.

## 10. Files

| New | Changed |
| --- | --- |
| 1 migration; `supabase/tests/donor_devices.test.sql`; `supabase/test-fixtures/phase4/rollback.sql`; §4.1 files; `phases/phase-4-report.md` | §4.2 list |

## 11. Decisions needed from Brad (with APPROVED)

**Answers (Brad, 2026-10-03):** 1 local Docker ✅ · 2 columns as proposed ✅ · 3 temporary `donor_no` ✅ · 4 ticket-sourced donors only ✅ ·
5 keep the ADMIN / MANAGER approval step (technicians request, ADMIN / MANAGER book) ✅ · 6 ✅ · 7 ✅ · 8 **(a)** reuse the Phase 2 function ✅ · 9 ✅. "APPROVED" given 2026-10-03.

1. **Dev target** = local Docker Supabase? (placeholder in the prompt)
2. **Columns vs the original brief:** the brief is not in the repo. Are §3.1's `donor_devices` / `donor_part_candidates` columns what you intended? Anything missing (e.g. 매입가, 외관 등급)?
3. **`donor_no`** ("D-0001", sequence) as the temporary human id until Phase 7 labels. OK?
4. **Donors only from the disposal confirmation** (`source_ticket_id NOT NULL`). Company-bought junk units without a ticket are out of scope. OK, or should manual registration (ADMIN) be included now?
5. **Who extracts:** proposal — TECHNICIAN / EXPERT_REPAIR list candidates and send "적출 입고 요청"; ADMIN / MANAGER book the stock ("입고 승인", or directly in one step). Same control as today's extracted-part flow. Alternative: technicians book directly.
6. **`DONOR_KEEP` removed parts** (Phase 2 "Donor유지"): on conversion they are copied into the donor's candidate list. On tickets that are never converted the value stays a label. OK?
7. **Screen access:** `/donors` menu for ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR (operational screen, not an ADMIN-only tool; Q12 covered admin tools). RECEPTION / CS: no menu (DB read stays allowed for Phase 5). OK?
8. **qty-1 items (Q8):** (a) **recommended** — reuse the Phase 2 function unchanged; extracted donor parts merge into matching USED stock like all other extracted parts; individual qty-1 rows arrive with labels in Phase 7 (as the Phase 2 and 3 plans already state).
   (b) always create a new qty-1 `inventory_items` row now — needs a second internal inbound function, and later ordinary extractions could still merge into those rows until Phase 7 adds `label_code`. Which one?
9. **Photos:** private bucket + signed URLs, staff only, max 12 per donor, 10 MB. OK?
