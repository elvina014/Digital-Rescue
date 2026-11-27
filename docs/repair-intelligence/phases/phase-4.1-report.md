# Phase 4.1 — 매장 보관 기기를 Donor로 등록 (접수 기록 없음) — REPORT

Executed 2026-11-27 on branch `feat/repair-intelligence` (fast-forwarded to `main` `83cfc16` first, D0).
- Plan: `phase-4.1-plan.md`, APPROVED 2026-11-27 ("approved", no extra conditions). Conditions recorded per R11 **before** implementation (commit `08cddbe`).
- Target: local Docker Supabase only. Production: SELECT-only checks for the plan (0 donor rows, last migration `20261111090000`), **nothing applied**.

## Commits

| Commit | Content |
| --- | --- |
| `53df745` | docs: plan |
| `08cddbe` | docs: approval conditions (R11) |
| (the commit containing this report) | Phase 4.1: migration, rollback fixture, pgTAP, types, app, docs |

## Result

| Acceptance / requirement | Result |
| --- | --- |
| ADMIN/MANAGER create a Donor without a ticket; other roles refused | ✅ pgTAP §2/§3 (RECEPTION / TECHNICIAN / EXPERT_REPAIR / CS / anon refused with Korean message or guard). E2E: MANAGER registers D-0001. TECHNICIAN sees no button, and `/donors/new` redirects to `/donors` |
| Ownership checkbox + acquisition note required | ✅ pgTAP (false / NULL / blank refused). E2E: submitting without the checkbox shows "회사 소유 기기임을 확인해 주세요." |
| QR scan finds a ticket-less Donor | ✅ pgTAP §5 `label_lookup` → `kind DONOR`, origin + acquisition, receipt null, location. E2E `/scan/D-0001`: "출처: 매장 보관 · 2023년 부품용 매입", location DONOR-C07 |
| Purchase guard / search / knowledge / potential stock / VECTOR | ✅ pgTAP §5: `ri_purchase_resources` rule 5, `search_parts_for_device.donor_qty`, `get_device_knowledge.donors`, `donor_potential_stock`. VECTOR reads `donor_potential_stock` (unchanged function), and `vector_integration.test.sql` passes except the pre-existing item below |
| Extraction from a store Donor | ✅ pgTAP §6: qty 2 → two USED qty-1 items at 0원, INBOUND with null ticket and note `적출품 반환 입고 · Donor D-xxxx` (D4), candidate EXTRACTED |
| Ticket-based conversion unchanged | ✅ `donor_devices.test.sql` passes unchanged. pgTAP §6 regression: a ticket Donor gets origin `TICKET_DISPOSAL`, and its extraction keeps note `적출품 반환 입고` and the ticket id; the store-note update touches only store rows |
| No existing row changed; rollback restores the schema | ✅ Production has 0 donor rows. Rollback check below |
| D2 acquisition cost record-only | ✅ `acquisition_cost` is never read by any cost/stock function; extracted items stay `base_estimate 0` |

## What changed

### Migration `supabase/migrations/20261127090000_donor_store_devices.sql`
- `donor_devices` new columns: `origin` (`TICKET_DISPOSAL` default / `STORE_STOCK`), `acquisition_note` (≤300), `acquired_on`, `acquisition_cost` (≥0), with Korean comments.
- **Approved R2 exception:** `source_ticket_id DROP NOT NULL`, plus CHECK `donor_devices_origin_source`:
  - a ticket Donor must have a ticket;
  - a store Donor must have no ticket and a non-empty note.
  `UNIQUE(source_ticket_id)` and the FK are unchanged.
- `GRANT UPDATE (acquisition_note, acquired_on, acquisition_cost)` to authenticated (RLS UPDATE policy ADMIN/MANAGER unchanged). `origin` / `source_ticket_id` stay client-read-only.
- New `donor_register_store_device(...)`:
  - SECURITY DEFINER, `search_path = public`, first statement `ri_api_guard_definer('{anon}')` (R10)
  - ADMIN/MANAGER only; Korean validation; active-location check
  - one INSERT with `origin STORE_STOCK`; ownership confirmation goes into `consent_confirmed_by/at`
  - grants: EXECUTE to anon/authenticated/service_role (R10 pattern)
- Existing functions (plan §3.5) — generated from the verbatim Phase 0.6 bodies; diff = only the listed lines:
  - `label_lookup`: ticket join → `LEFT JOIN`, plus `origin` / `acquisition_note` / `acquired_on` in the donor JSON
  - `ri_purchase_resources`: ticket join → `LEFT JOIN`
  - `donor_extract_part`: for `STORE_STOCK`, this call's INBOUND notes → `적출품 반환 입고 · Donor D-xxxx`

### App
- New: `donors/new/page.tsx` (ADMIN/MANAGER guard), `donors/new/StoreDonorForm.tsx`, `donors/[id]/AcquisitionFields.tsx`.
- Changed:
  - `donors/actions.ts` (`registerStoreDonorAction`, acquisition fields in `updateDonorAction`)
  - `donors/labels.ts` (`ORIGIN_LABEL`, `OWNED_TEXT`)
  - `donors/page.tsx` + `DonorsClient.tsx` (button, origin filter, "매장 보관" badge, intro text)
  - `donors/[id]/page.tsx` (no ticket query when none; origin line; "회사 소유 확인")
  - `donors/[id]/DonorInfoForm.tsx` (editable asset fields for store donors)
  - `scan/[code]/types.ts` + `ScanDonorView.tsx` (nullable receipt, store-device row)
- `src/types/supabase.ts` regenerated.

### Tests / fixtures
- New `supabase/tests/donor_store_devices.test.sql` (schema, RPC refusals/success, client writes, reads, extraction + regression, R10).
- New `supabase/test-fixtures/phase4.1/rollback.sql` (refuses while STORE_STOCK rows exist; restores the three verbatim Phase 0.6 bodies).
- **Changed `supabase/tests/api_guard.test.sql`** (not listed in plan §10):
  - The test pins the md5 of every guarded function body as it was before Phase 0.6.
  - The three bodies changed by the approved plan got their new md5; the old value is kept in a comment, and a header note was added.
  - The guard-line, privilege and SECURITY checks are unchanged and pass.

## Verification

| Check | Result |
| --- | --- |
| `npx supabase db reset` | ✅ all migrations incl. `20261127090000` |
| pgTAP `npx supabase test db` | ✅ 17 files, 1311 tests. New file passes; `api_guard` passes after the md5 update. **1 pre-existing failure, not from this phase:** `vector_integration.test.sql` #20 — `cg_ad_visits`, `cg_block_log`, `cg_whitelist`, `cta_click_events` (click-guard/CTA tables added on `main` after Phase 9) refuse the agent's UPDATE with `428C9` (identity column) instead of `42501`. Still no write. Left as is (out of scope) |
| Rollback | ✅ pg_dump `public` schema: after rollback = schema of a reset **without** the migration (identical). Re-applying the migration = post-migration schema (identical except pg_dump's random `\restrict` token) |
| `npm run db:types` | ✅ 9 lines changed in `src/types/supabase.ts` |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ 0 errors (16 pre-existing warnings, none in changed files) |
| `npm run build` | ✅ `/donors/new` built |
| Advisors (`db advisors --local --type all --level info`) | ✅ no new WARN (14 = pre-existing list); no finding mentions the new function or columns |
| E2E (local stack, `next-dev-localdb` on `login.localhost:3001`, seed accounts) | ✅ MANAGER: button → form → checkbox error → register (location, note, cost "50,000" → 50000) → detail shows origin and asset fields → `/scan/D-0001` shows store-device row → list shows "매장 보관" badge. TECHNICIAN: no button, `/donors/new` redirects. No server or console errors. Ticket conversion via UI not re-clicked (covered by pgTAP regression) |

## How Brad verifies
1. `npx supabase db reset` → `npx supabase test db` (expect only the pre-existing `vector_integration` #20).
2. Run the app on local DB (`next-dev-localdb`), log in as `manager@example.test` at `http://login.localhost:3001`.
3. Donor 기기 → **+ 매장 보관 기기 등록**. Register one device, then add a candidate, extract it, and scan its D- label.
4. Production (Brad): apply `20261127090000_donor_store_devices.sql` after the usual backup. Rollback: `supabase/test-fixtures/phase4.1/rollback.sql`. It only runs while no store Donor exists.

## Known risks / notes
- Misuse (a customer device registered as a company asset): only ADMIN/MANAGER can register; the ownership checkbox and acquisition note are mandatory; who/when are stored; every screen shows an origin badge. No serial check against tickets (out of scope).
- Rollback refuses once a store Donor exists. Deleting or handling those rows first is a business decision (R9).
- The store-note update in `donor_extract_part` matches rows by transaction time (`now()`). This is safe inside the single-transaction RPC and covered by pgTAP with qty 2.
- Follow-up (not done here):
  - add "매장 보관 기기 등록" to the staff guide `docs/operations/initial-stock-registration.md` §6 (docs branch, plan §10)
  - pre-existing `vector_integration` #20 expectation for identity-column tables
