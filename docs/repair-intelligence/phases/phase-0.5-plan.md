# Phase 0.5 — Purchase approval bug fix (구매 요청 승인 버그 수정) — PLAN

Status: **awaiting Brad's "APPROVED"**. Nothing below has been executed.

## Goal

A purchase request (`ticket_materials.request_type = 'purchase'`) is approved **without** any stock
deduction and **without** any `inventory_transactions` row. Approval of a normal dispatch request
(`request_type = 'dispatch'`) behaves exactly as today. (Decision Q11, KI-4.)

## Current behaviour (verified)

- Only one code path approves materials: `MaterialDispatchWidget` ("출고 승인" / "구매 승인" buttons,
  dashboard and inventory pages) → `approveMaterialDispatchAction`
  (`src/app/(admin)/tickets/actions.ts:1364`) → RPC `approve_material_dispatch(p_material_id, p_user_id)`
  via the service_role client.
- The live RPC (migration 014 version, baseline lines 386–458) ignores `request_type`:
  locks the item, fails with `재고 부족 (현재 0개, 요청 1개)` if stock is short, otherwise deducts stock,
  sets `approved`, inserts OUTBOUND "자재 출고 승인".
- The UI creates `purchase` exactly when the chosen item has quantity ≤ 0
  (`AddMaterialCard.tsx:105`, `EstimateCard.tsx:239`) → purchase approval practically always fails.
  If stock happened to be > 0, a purchase would wrongly deduct stock.
- After the RPC, the action runs an **app-side fallback**: if no OUTBOUND row for this ticket+item exists
  in the last 10 s, it inserts one. Once the RPC stops writing OUTBOUND for purchases, this fallback
  would insert a fake OUTBOUND for every purchase approval → must be skipped for purchases.
- Downstream is already consistent with "purchase never touches stock":
  `confirmMaterialReturnAction` restores stock only for `dispatch`; column comment says
  "purchase(구매 요청 — 재고 차감 없음)".
- Production today: no `requested`/`pending` purchase rows (only 1 `purchase/cancelled`).

## Changes

### 1. Migration `supabase/migrations/<timestamp>_fix_purchase_approval.sql`

`CREATE OR REPLACE FUNCTION public.approve_material_dispatch(uuid, uuid)` — same signature, same
`SECURITY DEFINER`, same (absent) `search_path`, same messages. Differences only:
- `request_type` is read in the existing `SELECT … FOR UPDATE` (new variable `v_request_type`).
- Right after the existing status check, a new early branch:

```sql
  -- 구매 요청: 재고 확인·차감·출고 기록 없이 승인만 한다
  IF v_request_type = 'purchase' THEN
    UPDATE ticket_materials
       SET request_status = 'approved',
           updated_at     = now()
     WHERE id = p_material_id;
    RETURN jsonb_build_object('success', true);
  END IF;
```

- Everything after it (stock check, deduction, approve, OUTBOUND) is **copied unchanged** — this is the
  dispatch path.
- `COMMENT ON FUNCTION` updated to mention the purchase branch.
- **Grants:** `CREATE OR REPLACE` keeps the existing ACL (postgres, service_role only). The migration
  restates `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role;` anyway
  (working rule from Phase 0.1) — identical to production's current ACL.
- Not included (would change the dispatch path or scope): `SET search_path`, role check inside the
  function. Can be a later hardening item.

### 2. App: `src/app/(admin)/tickets/actions.ts` — `approveMaterialDispatchAction`

Wrap only the fallback block (the `count` query + OUTBOUND insert, currently lines ~1398–1418) in
`if (mat.request_type !== "purchase") { … }`, with a Korean comment. Everything else
(permission check, RPC call, error handling, `recalc_ticket_material_cost`, log message
"자재 구매가 승인되었습니다", revalidation) unchanged.

Note (existing behaviour, unchanged): after approval `recalc_ticket_material_cost` counts approved
purchases at `base_estimate × quantity` into `material_cost` — same as dispatch, which is the intended
cost accounting.

### Files

| New | Changed |
| --- | --- |
| `supabase/migrations/<ts>_fix_purchase_approval.sql`, `supabase/tests/approve_material_dispatch.test.sql`, `phases/phase-0.5-report.md` | `src/app/(admin)/tickets/actions.ts` (one `if`), `known-issues.md` (KI-4 → fixed), `02-roadmap.md` |

## Test plan

### A. Database — pgTAP, `npx supabase test db` (local only)

`supabase/tests/approve_material_dispatch.test.sql`, runs inside a transaction that is rolled back.
The **old function body is recreated as `pg_temp.approve_old(uuid, uuid)`** (verbatim from the baseline),
and each case is run on two identical fixtures — one with the old function, one with the new — then
compared:

| # | Case | Expected |
| --- | --- | --- |
| 1 | dispatch, stock 3, qty 1, `requested` | old = new: same JSON result, stock −1, status `approved`, exactly 1 OUTBOUND with same user/qty/ticket/notes |
| 2 | dispatch, `pending` status (legacy) | old = new |
| 3 | dispatch, stock 0 | old = new: same error text `재고 부족 (현재 0개, 요청 1개)`, no change to stock/status/transactions |
| 4 | dispatch, status `approved` / `cancelled` / `rejected` | old = new: same error text, no change |
| 5 | unknown material id | old = new: `자재 요청을 찾을 수 없습니다.` |
| 6 | dispatch, `created_by` NULL | old = new: OUTBOUND `user_id` = `p_user_id` |
| 7 | purchase, stock 0 | old: `재고 부족` (documents the bug); **new: success, status `approved`, stock unchanged, 0 transactions** |
| 8 | purchase, stock 5 | old: stock −1 + OUTBOUND (bug); **new: success, stock unchanged, 0 transactions** |
| 9 | purchase, status `approved` | new: same error as dispatch (`출고 요청 상태가 아닙니다. (현재: approved)`) |
| 10 | privileges | `anon`, `authenticated` cannot EXECUTE; `service_role` can (same as production) |
| 11 | definition | `prosecdef = true`, `proconfig IS NULL` (unchanged) |

Plus `npx supabase db reset` (baseline + new migration + seed) succeeds.

### B. App — end to end on the local stack

Needs the dev server to talk to the **local** DB. Proposal:
- Create `.env.development.local` (git-ignored by `.env*`) with the local API URL, anon and service
  keys printed by `npx supabase status` (public demo keys of the local stack). Next.js gives it priority
  over `.env.local` in `npm run dev` only.
- **Delete the file after the test**, so Brad's normal `npm run dev` keeps using `.env.local`.
- Sign in on `http://login.localhost:3000` with the seed account `admin@example.test` (local test credential).

Checks in the browser pane, then SQL on the local DB:
1. Dashboard → "자재 구매 승인 대기" → approve the seeded purchase (ticket IN_PROGRESS, 16GB RAM, stock 0)
   → success message; item stock stays 0; **no** new `inventory_transactions` row; status `approved`;
   ticket log "시스템: 자재 구매가 승인되었습니다. (…)"; `material_cost` recalculated.
2. "자재 출고 승인 대기" → approve the seeded dispatch (512GB SSD, stock 2) → stock 1; **exactly one**
   OUTBOUND row (no duplicate from the fallback); log "자재 출고가 승인되었습니다".
3. Screenshot of both results for the report.

### C. Static checks
`npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:types` (no type change expected).

## Rollback

**Database** — restore the current function body exactly (from the baseline):

```sql
CREATE OR REPLACE FUNCTION public.approve_material_dispatch(p_material_id uuid, p_user_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id      UUID;
  v_ticket_id    UUID;
  v_quantity     INTEGER;
  v_status       TEXT;
  v_inv_qty      INTEGER;
  v_requester_id UUID;   -- 자재를 요청한 담당기사 ID
BEGIN
  -- 1) ticket_materials 조회 (created_by = 요청자)
  SELECT inventory_item_id, ticket_id, quantity, request_status, created_by
    INTO v_item_id, v_ticket_id, v_quantity, v_status, v_requester_id
    FROM ticket_materials
   WHERE id = p_material_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '자재 요청을 찾을 수 없습니다.');
  END IF;

  -- request_status가 'requested' 또는 'pending'인 경우 모두 허용 (기존 데이터 호환)
  IF v_status NOT IN ('requested', 'pending') THEN
    RETURN jsonb_build_object('error', '출고 요청 상태가 아닙니다. (현재: ' || v_status || ')');
  END IF;

  -- 2) 재고 수량 확인
  SELECT quantity INTO v_inv_qty
    FROM inventory_items
   WHERE id = v_item_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '재고 아이템을 찾을 수 없습니다.');
  END IF;

  IF v_inv_qty < v_quantity THEN
    RETURN jsonb_build_object('error', '재고 부족 (현재 ' || v_inv_qty || '개, 요청 ' || v_quantity || '개)');
  END IF;

  -- 3) 재고 차감
  UPDATE inventory_items
     SET quantity   = quantity - v_quantity,
         updated_at = now()
   WHERE id = v_item_id;

  -- 4) ticket_materials 승인 처리
  UPDATE ticket_materials
     SET request_status = 'approved',
         updated_at     = now()
   WHERE id = p_material_id;

  -- 5) inventory_transactions OUTBOUND 기록 (담당자 = 자재 요청자 created_by)
  INSERT INTO inventory_transactions (
    item_id,
    user_id,
    transaction_type,
    quantity_changed,
    ticket_id,
    notes
  ) VALUES (
    v_item_id,
    COALESCE(v_requester_id, p_user_id),  -- 요청자 우선, 없으면 승인자
    'OUTBOUND',
    v_quantity,
    v_ticket_id,
    '자재 출고 승인'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.approve_material_dispatch(uuid, uuid) IS '자재 출고 승인: 재고 차감 + 상태 변경 + OUTBOUND 트랜잭션 기록을 단일 트랜잭션으로 처리';
```

(ACL is preserved by `CREATE OR REPLACE`.) Purchases approved while the fix was live stay `approved`
with no stock movement — correct data, no cleanup needed.

**App** — `git revert` of the Phase 0.5 commit.

## Deployment order (for Brad)

1. **App first** (Vercel): the new `if` only skips the fallback for purchases. With the old RPC still
   live, purchase approval keeps failing as today — no new harm.
2. **Then the migration** on production (SQL editor, or `npx supabase db push` once the Phase 0.1
   history repair is done).

Reverse order would open a window where the old app inserts a fake OUTBOUND for each approved purchase.
Production currently has no waiting purchase requests, so the risk is small either way.

## Risks

- Dispatch regression → covered by old-vs-new equivalence tests (cases 1–6) on identical fixtures.
- Fallback skipped for purchase only; dispatch keeps its fallback (unchanged behaviour).
- A purchase request created while stock > 0 (stock changed after selection) will no longer deduct
  stock — this is the intended meaning of "purchase".
- `.env.development.local` must not be left behind → deleted at the end, listed in the report.

## Out of scope

`search_path`/role-check hardening of this function, `cancel_material_dispatch` (absent), any change to
the return/rollback flows (Phase 2, Q3), purchase guard (Phase 6).
