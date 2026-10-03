# Phase 7 — Physical tracking (라벨 · 보관 위치 · 스캔) — REPORT

Executed 2026-10-03 on branch `feat/repair-intelligence` (plan: `phase-7-plan.md`, APPROVED 2026-10-03 with decisions 1–10).
Local Docker Supabase only. **Production was not touched**: no production query was run in this phase.

## Result

| Acceptance / requirement | Result |
| --- | --- |
| Scanning a label opens the correct record | ✅ QR = `http(s)://<login host>/scan/<code>`. The QR content was checked against a fresh encoding of the expected URL (P-00300, D-0044). `/scan/<code>` opens the right item or donor for every role. Logged-out users go to `/login?redirect=/scan/<code>` and come back after login (E2E) |
| Mixed labelling (Q8) | ✅ Standard stock: one `label_code` per `inventory_items` row. Extracted parts: **qty n → n rows of qty 1**, each with its own label and one INBOUND of 1, on all three inbound paths (pgTAP + E2E: removed part × 2 → P-00300, P-00301). Donors: one label per device (`donor_no`) |
| Existing rows get codes without other changes (decision 3) | ✅ Migration re-applied to a DB with data: md5 of every `inventory_items` row (incl. `updated_at`) except the two new columns is identical before and after. 8 rows → 8 distinct codes |
| Storage locations (decision 4) | ✅ Flat `storage_locations` with code CHECK. Only ADMIN writes. No deletes (deactivate). Codes cannot be renamed. ADMIN/MANAGER assign on the scan page via `set_storage_location`. Inactive locations are refused |
| History visibility (decision 5) | ✅ `label_lookup` returns `history` only for ADMIN/MANAGER. TECHNICIAN / RECEPTION / CS get item/donor info + location with `history: null` (pgTAP; E2E TECHNICIAN and CS) |
| No prices / customer data | ✅ pgTAP: no price or customer keys or values in any lookup result. Tickets are shown by `receipt_no` only |
| `외주` excluded from labels (Q5) | ✅ Not listed on 라벨 인쇄 (E2E: P-00005 absent) |
| Existing objects unchanged | ✅ Snapshot (md5 + ACL of every public function, views, all policies incl. storage, triggers, columns, table/sequence ACLs) before and after. Diff: the one listed change (`ri_inbound_extracted_part` body; ACL unchanged), plus additions: 1 table, 1 sequence, 3 columns, 3 functions, 3 policies, 1 trigger. After the rollback rehearsal the snapshot is identical to before |
| pgTAP | ✅ **693/693**: existing 606 (merge assertions rewritten, +2 net), plus Phase 7: 85 |
| `db reset` twice | ✅ |
| typecheck / lint / build | ✅ 0 errors / 0 errors (16 warnings, all pre-existing) / success |
| Advisors (`db advisors --local --type all --level info`) | ✅ No new WARN or ERROR. New: 3 INFO `unused_index` on the fresh location indexes. The 14 WARNs are the pre-existing list |
| Types | ✅ `npm run db:types` regenerated |
| Rollback rehearsal | ✅ See Rollback |

## Decisions applied (Brad, 2026-10-03)

1. Local Docker.
2. **(a)** qty n → n rows of qty 1.
3. Codes: `P-00001` / donor `D-0001`. Existing rows are coded in the migration.
4. Flat location table.
5. **Keep today's permission**: history for ADMIN/MANAGER only.
6. `qrcode` dependency.
7. Thermal 50 × 30 mm.
8. **`addInventoryItem` and the n8n webhook untouched**. Fix later if errors occur.
9. Manual registration unchanged.
10. Shelf labels later.

## Changes

### Database — `supabase/migrations/20261003121512_physical_tracking.sql`

- `storage_locations`:
  - Code `^[A-Z0-9]+(-[A-Z0-9]+)*$`, ≤ 20 chars, unique. `description`, `is_active`, `created_by`, timestamps.
  - RLS: SELECT for all staff; INSERT and UPDATE for ADMIN only.
  - Column grants: INSERT on `code, description`; UPDATE only on `description, is_active`.
  - No DELETE. `anon` revoked.
- `inventory_label_seq` + `ri_next_item_label()`:
  - SECURITY DEFINER, `search_path = public`. Only consumes the sequence.
  - EXECUTE for `authenticated` and `service_role`, because the column default runs as the inserting role.
- `inventory_items.label_code`:
  - NOT NULL, UNIQUE, CHECK `^P-[0-9]{5,}$`, default `ri_next_item_label()`.
  - Added in one `ADD COLUMN`, so existing rows were coded during the table rewrite without firing triggers.
- `inventory_items.storage_location_id` and `donor_devices.storage_location_id` → `storage_locations`, RESTRICT, indexed.
- **Changed (R2, plan §3.4):** `ri_inbound_extracted_part`:
  - Same signature, ACL and validation messages.
  - New behaviour: n rows of qty 1, one INBOUND of 1 each, returns the first id.
  - Its callers are not changed.
- `label_lookup(text)`:
  - SECURITY DEFINER, any employee.
  - Item: info, location, history ≤ 50 (ADMIN/MANAGER only).
  - Donor: info, location, source `receipt_no`, candidates with their extracted item label.
- `set_storage_location(kind, id, location)`: SECURITY DEFINER, ADMIN/MANAGER only.

### Application

| File | Change |
| --- | --- |
| `src/app/(admin)/scan/{page,ScanForm,LocationSelect}.tsx` (new) | "라벨 조회": code input for keyboard or USB scanner. A full QR URL is accepted and its last path segment is used. Includes the location select (optimistic, rolls back on error) |
| `src/app/(admin)/scan/[code]/{page,ScanItemView,ScanDonorView,types}.tsx` (new) | Scan result: item or donor card, history table (ADMIN/MANAGER), links, "라벨 다시 인쇄" |
| `src/app/(admin)/labels/{page,LabelPicker,actions,shared,requireLabelPage}.ts(x)` (new) | "라벨 인쇄" (ADMIN/MANAGER): 재고 / Donor tabs, "최근 7일 등록", text filter, checkboxes (≤ 100). Location actions |
| `src/app/(admin)/labels/print/{page,LabelSheet,PrintButton}.tsx` (new) | Print view: QR (inline SVG) + code + description + location. `@page` 50 × 30 mm, one label per page. Only the label sheet is printed |
| `src/app/(admin)/inventory/locations/{page,LocationsClient}.tsx` (new) | "보관 위치 관리" (ADMIN): add, edit description, deactivate/reactivate. Optimistic with rollback; shows usage count |
| `src/lib/qr.ts` (new) | `qrcode` → SVG |
| `src/proxy.ts` | `/labels`, `/scan` in `ADMIN_PATHS` |
| `src/components/layout/AdminSidebar.tsx` | "보관 위치 관리" (ADMIN), "라벨 조회" (all), "라벨 인쇄" (ADMIN/MANAGER) |
| `inventory/page.tsx`, `InventoryClient.tsx` | Label (link to scan) and location under the product name. Search also matches the label |
| `donors/[id]/page.tsx` | Line "라벨 D-0001 · 보관 위치 … · 라벨 인쇄" |
| `tickets/[id]/page.tsx`, `TicketDetailForm.tsx`, `EstimateCard.tsx`, `AddMaterialCard.tsx` | Material picker shows "· P-00300" (optional `label_code` field, +1 line each) |
| `package.json` / lockfile | `qrcode` ^1.5.4, `@types/qrcode` (dev) |
| `src/types/supabase.ts` | Regenerated |

### Tests / fixtures

- `supabase/tests/physical_tracking.test.sql` (85 assertions). The test restores the label sequence after its own `setval`.
- `supabase/tests/inventory_flow_rpcs.test.sql` and `donor_devices.test.sql`: the merge assertions were rewritten to the qty-1 behaviour (plan §4.2). All other assertions are unchanged.
- `supabase/test-fixtures/phase7/rollback.sql`.

## Deviations from the plan

| Plan | Done | Why |
| --- | --- | --- |
| `label_lookup` history for all staff | ADMIN/MANAGER only | Decision 5 |
| `.limit(1)` in `addInventoryItem` / webhook | Not done | Decision 8 |
| `DonorInfoForm.tsx` display | Label/location line in `donors/[id]/page.tsx` only | No change to the form needed |
| E2E step 7 "dispatch of one unit" via UI | Dispatch done by calling the existing `approve_material_dispatch` RPC in SQL; scan history checked in the UI | Shorter; same RPC the UI uses |
| E2E with MANAGER | Done with ADMIN (location, inbound approval, printing) | Same role checks (`ADMIN, MANAGER`) and covered for MANAGER by pgTAP |
| `LabelPicker` dates | Formatted on the server | A client-side date format can cause hydration mismatches (seen in the existing `InventoryClient` table, see notes) |

## E2E (local stack, seed accounts, temporary `.env.development.local` — **deleted afterwards**)

Fixtures inserted by SQL and removed by `db reset`: one `STOCK` removed part with qty 2 on ticket d…09, and one donor (D-0044).

1. **Logged out** `/scan/P-00001` → login (TECHNICIAN) → back on `/scan/P-00001`: item and "보관 위치: 미지정". No history, no price ✅
2. **TECHNICIAN:** menu shows "라벨 조회" only. `/labels` → `/dashboard`. Scanning the full URL `…/scan/d-0044` → D-0044 ✅. `p-77777` → "등록되지 않은 라벨입니다." ✅
3. **ADMIN, 보관 위치 관리:**
   - `A_01` → "위치 코드는 영문 대문자·숫자와 '-'만 사용할 수 있습니다."
   - `a-01-04` stored as `A-01-04` with its description; `DONOR-C07` and `OLD-1` added.
   - Duplicate → "이미 등록된 위치 코드입니다."
   - `OLD-1` deactivated ✅
4. **ADMIN, 재고 관리:** "입고 승인" on the qty-2 removed part → **P-00300 and P-00301** (USED, qty 1 each), one INBOUND each. The old aggregate row P-00001 stays at qty 3. The removed part is linked to P-00300. Both labels appear in the list ✅
5. **Scan P-00300 (ADMIN):**
   - History shows the INBOUND by the assigned technician with receipt no. `20260927-001`.
   - Location → A-01-04, persisted.
   - Forced error (DONOR-C07 deactivated in the DB) → "사용 중지된 보관 위치입니다." and the display rolls back to A-01-04 ✅
   - D-0044 → DONOR-C07 ✅
6. **라벨 인쇄:**
   - Nothing selected → "인쇄할 라벨을 선택해 주세요."
   - P-00300 + P-00301 → print view with 2 labels with QR.
   - Mixed `P-00300,p-00301,D-0044,P-99999` → 3 labels and the warning "찾을 수 없는 라벨: P-99999".
   - `외주` item not listed ✅
7. **Ticket d…09:** the RAM picker lists "… [재고: 1] · P-00301", "· P-00300", "· P-00001". After dispatching P-00301, its scan page shows qty "0개 (출고됨)" and history OUTBOUND (테스트팀장, 20260927-001) + INBOUND ✅
8. **Apex** `/scan/P-00001`, `/labels` → `/`. **CS:** the login redirect back to `/scan/P-00300` works and shows location A-01-04 without history. `/labels` and `/inventory/locations` → `/dashboard` ✅
9. Donor detail shows "라벨 D-0044 · 보관 위치 DONOR-C07 · 라벨 인쇄" ✅

**Not tested:**
- Physical printing on a label printer (no printer here); the print CSS sets `@page 50mm 30mm`.
- A real phone camera.
- RECEPTION in the UI (same code path as CS; covered by pgTAP).

**Console:** one hydration-mismatch error on `/inventory` from the **existing** transactions table (`InventoryClient.tsx:571`, `toLocaleString` "오후" vs "PM" between server and browser). It is not caused by Phase 7 and was not changed. Server log: only `refresh_token_not_found` after logouts (local session noise).

## Rollback

App first (`git revert <phase-7 commit>`), then `supabase/test-fixtures/phase7/rollback.sql`. The script drops the Phase 7 objects and restores the Phase 2 body of `ri_inbound_extracted_part` verbatim; see the file.

**Verified locally 2026-10-03** on the database that still held the E2E data (8 items, 12 transactions, 9 materials, 1 donor with location):
- the object snapshot is identical to the pre-Phase-7 snapshot;
- item, transaction and material counts and quantities are unchanged.

The migration was then re-applied on that data (row md5 check above), followed by `db reset` ×2 and 693 tests PASS. Rollback loses only labels and locations. qty-1 rows created meanwhile stay as ordinary rows.

## Deployment (Brad)

1. Phases 0.5–6 are still pending in production. Apply in order: 0.5 → 1 → … → 6 → 7.
2. **Migration first.**
   - Existing items receive `P-` codes; no other value changes.
   - From this moment **every extracted-part inbound creates qty-1 rows**, even with the old app.
   - The old app ignores the new columns.
3. **Then the app.** Run `npm install`; `qrcode` is new.
4. Print production labels **from production** (`login.digital-rescue.com`). The QR uses the host of the page that printed it.
5. Verify (read-only):
   - `select count(*), count(distinct label_code) from inventory_items` → equal;
   - `select proname, prosecdef, proacl from pg_proc where proname in ('label_lookup','set_storage_location','ri_next_item_label')` → all definer; no `anon`.

## How Brad verifies locally

1. `npx supabase db reset` → `npx supabase test db` (693 pass) → `npm install && npm run typecheck && npm run lint && npm run build`.
2. Dev server against the local stack (`NEXT_PUBLIC_SITE_DOMAIN` empty), at `http://login.localhost:3000`:
   - `admin@example.test`: 보관 위치 관리 → add `A-01-04`.
   - 라벨 인쇄 → select → 인쇄.
   - Open `/scan/P-00001` and set the location.
   - `tech@example.test`: open `/scan/P-00001` (no history).
3. To see qty-1 extraction: as technician, register a removed part "재고등록" with qty 2 on ticket `20260927-001`. Then as `manager@example.test`, "입고 승인" on 재고 관리.

## Known risks / notes

- **Behaviour change for extracted-part inbound** (decision 2a). 재고 관리 and the material picker now list several identical USED rows; the label suffix tells them apart. A bulk extraction ("나사 20개") creates 20 rows and 20 labels.
- **qty-0 unit rows accumulate** after dispatch; kept on purpose for history. Hiding them is out of scope.
- **Decision 8 — not fixed:** once two or more identical USED rows exist, two paths break:
  - the `addInventoryItem` duplicate check silently passes (`.maybeSingle()` error ignored);
  - the n8n webhook returns **500 "Item lookup failed"** for a USED item of the same product + capacity.
  
  Fix: `.limit(1)` in both places.
- Local label numbers jump (P-00300) because test runs consume sequence values; a fresh production DB starts after the existing rows. The same applies to `donor_no`.
- The donor form still has the free-text field "보관 위치" (`storage_note`, Phase 4) next to the new structured location. Wording could be changed to "보관 메모" later.
- Location changes are not logged; the scan page shows the current location only.
- `donor_no` uses `lpad(…, 4)`: beyond D-9999 values would be truncated and refused by UNIQUE. Recorded, not changed.
- Label selection does not carry across tabs (재고 / Donor). Mixed sheets can be printed with a combined `?c=` URL.
- `next` has a pre-existing critical `npm audit` advisory (also `sharp`, `postcss`, …). `qrcode` adds no advisories. Not changed.
- **Still open from earlier phases:**
  - Phase 2 decision 6: should all EXPERT_REPAIR staff count, regardless of assignment?
  - KI-9 and KI-10.
