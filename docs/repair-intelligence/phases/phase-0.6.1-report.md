# Phase 0.6.1 — Server action login / role checks (KI-12) — REPORT

Executed 2026-10-04 on branch `feat/repair-intelligence`.
- Plan: `phase-0.6.1-plan.md`, APPROVED 2026-10-04 with D1–D3 and conditions 1–3, recorded per R11 (commit `5aef670`) before implementation.
- Target: local only. **No migration**, nothing applied anywhere. Production: no queries.

## Commits

| Commit | Content |
| --- | --- |
| `5aef670` | docs: plan + approval conditions (R11) |
| **`b43eb58`** | **app: the 5 files only** (D3) — this is the commit to cherry-pick to `main` |
| (docs commit after this report) | report, `known-issues.md` (KI-12 status, new KI-13), `02-roadmap.md`, `phase-0.6-report.md` audit table |

## Result

| Acceptance / requirement | Result |
| --- | --- |
| Statistics actions refuse every role except ADMIN / MANAGER | ✅ RECEPTION / TECHNICIAN / EXPERT_REPAIR / CS → `{ error: "통계 조회 권한이 없습니다. (ADMIN/MANAGER만 가능)" }` for all 9 (HTTP test below) |
| Own login check in every non-public action | ✅ statistics: logged out → `{ error: "로그인이 필요합니다. 다시 로그인해 주세요." }`. Audit table in `phase-0.6-report.md` updated: no ❌ left |
| ADMIN / MANAGER results unchanged | ✅ all 9 actions: after = `{ "data": <before> }`, **byte-identical** payload (same seed data, before / after captured over HTTP) |
| `requireAuth` message | ✅ "로그인이 필요합니다. 다시 로그인해 주세요." (`getCategories` / `addCategory` logged out; no row written) |
| `lookupPastEvaluatedValue` (D2) | ✅ ADMIN / MANAGER / TECHNICIAN / EXPERT_REPAIR: same values as before (device_models and repair_tickets paths); RECEPTION / CS: `{ data: null }`; logged out: `{ data: null }` (as before) |
| UI `/stats` (D1) | ✅ MANAGER/ADMIN: page and month change as before. Session cookie deleted, month changed → red "로그인이 필요합니다. 다시 로그인해 주세요.", **selection returns to the previous month**, previous data stays, no error page, no console error |
| EstimateCard | ✅ `tech@example.test` on the assigned RECEIVED ticket: brand `asus` / model `GA403` → "동일 기기 가치 평가: 555,000원 (자동 입력됨)" from **another** ticket (service_role read kept) |
| typecheck / lint / build | ✅ 0 errors / 0 errors (16 warnings, all pre-existing) / success |
| Types (`npm run db:types`) | ✅ no diff |
| pgTAP (`npx supabase test db`) | ✅ 1067/1067 (unchanged; no DB change) |
| Condition 1 (call sites) | ✅ see below — only `/stats` |
| Condition 2 (ilike) | ✅ recorded as **KI-13**, nothing changed |
| Condition 3 (cherry-pick) | ✅ commands below; simulated without touching `main` |

## Condition 1 — call sites of the 9 statistics actions (whole `src/`, checked before implementation)

| Action | File(s) | Screen | Roles that can open it |
| --- | --- | --- | --- |
| `getAnnualRevenue` | `src/app/(admin)/stats/page.tsx`, `StatisticsClient.tsx` (`fetchData`) | `/stats` 통계 | ADMIN, MANAGER |
| `getMonthlyDailyRevenue` | 〃 | `/stats` | ADMIN, MANAGER |
| `getTechnicianMonthlyRevenue` | 〃 | `/stats` | ADMIN, MANAGER |
| `getTechnicianPerformance` | 〃 | `/stats` | ADMIN, MANAGER |
| `getBrandBreakdown` | `stats/page.tsx` only | `/stats` | ADMIN, MANAGER |
| `getStatusBreakdown` | `stats/page.tsx`, `StatisticsClient.tsx` | `/stats` | ADMIN, MANAGER |
| `getReceiptTypeBreakdown` | 〃 | `/stats` | ADMIN, MANAGER |
| `getCancelStats` | 〃 | `/stats` | ADMIN, MANAGER |
| `getRefundStats` | 〃 | `/stats` | ADMIN, MANAGER |

- `/stats` page gate: `stats/page.tsx` redirects anyone except ADMIN / MANAGER to `/dashboard`. Sidebar `AdminSidebar.tsx` shows "통계" for `["ADMIN","MANAGER"]`.
- `StatisticsClient` is rendered only by `stats/page.tsx`. No other importer of `statisticsActions` exists.
- → No screen reachable by other roles calls them; implementation went ahead.

## Changes (commit `b43eb58`)

| File | Change |
| --- | --- |
| `src/app/actions/statisticsActions.ts` | `StatsResult<T> = { data: T } \| { error: string }`; local `requireStatsAccess()` (`getCurrentEmployee()`; null → login message; not ADMIN / MANAGER → role message) as the first statement of all 9 actions; each `return X` → `return { data: X }`. Query bodies unchanged |
| `src/app/(admin)/stats/page.tsx` | if any result has `error` → `redirect("/dashboard")`; passes `.data` to the client |
| `src/app/(admin)/stats/StatisticsClient.tsx` | `fetchData`: on any `error`, show it in a red box, restore the previous year / month, keep the data; otherwise clear the message and set the data |
| `src/app/actions/inventoryActions.ts` | `requireAuth()` message (1 line) |
| `src/app/(admin)/tickets/actions.ts` | `LOOKUP_EVALUATED_VALUE_ROLES` (ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR); `lookupPastEvaluatedValue` returns `{ data: null }` for other roles |

## Deviations from the plan

| Plan | Done | Why |
| --- | --- | --- |
| D1-a: on error "keep the current data" | also **restore the previous year / month** in the selectors | otherwise the labels ("2026년 8월 매출") would show the old month's numbers; restoring keeps labels and data consistent (optimistic rollback, R5) |
| §6 step 1: action ids from the production build manifest | ids from the dev manifest (`.next/dev/server/server-reference-manifest.json`) | the HTTP test ran against `next dev`; same ids the browser uses there |

## Test details (local Docker Supabase + `next dev`)

- Temporary `.env.development.local` pointed the dev server at the local stack; **deleted** after the test (`.env.local` untouched).
- Local-only fixtures for the lookup (a `device_models` row "TBRAND / TModel X1 / 777000" and `evaluated_value = 555000` on seed ticket `…d000-000000000004`);
  removed by `npx supabase db reset` afterwards.
- HTTP test: a script signed in each seed user (`*@example.test`) with `@supabase/ssr` and POSTed to `/stats` / `/dashboard` with the
  `next-action` header, exactly like the browser. Run before the change (KI-12 reproduced: RECEPTION / CS / TECHNICIAN / EXPERT_REPAIR got revenue data)
  and after; ADMIN / MANAGER payloads compared byte for byte.

## Cherry-pick to `main` (condition 3 — commands for Brad; **not executed**)

Checked without touching `main` (it stays at `7d237f6`):
- `git merge-tree --write-tree --merge-base=b43eb58^ main b43eb58` → exit 0, **no conflicts**; the result differs from `main` in exactly the 5 files.
- That merged tree was extracted to a scratch folder (outside the repo, deleted afterwards) and checked: `tsc --noEmit` → 0 errors;
  `eslint` on the 5 files → 0 errors (1 warning `setBrandBreakdown` unused — pre-existing on `main` too).
- `next build` was **not** run on that tree (it would need the env file copied out of the repo). Run it as step 5 below.

Steps (in the repo, with a clean working tree):

```bash
git status                                   # 1. working tree clean? (else: git stash)
git switch main                              # 2.
git pull --ff-only                           # 3. if main has a remote
git switch -c fix/stats-role-check           # 4. work on a branch, not on main directly
git cherry-pick -x b43eb58                   #    expected: no conflict
npm ci                                       # 5. dependencies of main
npm run typecheck && npm run lint && npm run build
```

6. Smoke test on that branch with `npm run dev` (against the Supabase you normally use for main):
   - ADMIN or MANAGER → `/stats`: same numbers as before; change the month → data changes.
   - RECEPTION / TECHNICIAN → `/stats` still redirects to `/dashboard` (unchanged).
   - TECHNICIAN on an assigned RECEIVED ticket → "기기 가치 평가" auto-fill still works.
7. Merge and push when satisfied:
   ```bash
   git switch main
   git merge --ff-only fix/stats-role-check
   git push
   ```
8. Back to this branch: `git switch feat/repair-intelligence` (and `git stash pop` if you stashed in step 1).
   When `feat/repair-intelligence` is merged later, git sees the same change on both sides; `-x` records the origin in the message.

Notes for `main`:
- `main` does not have the Phase 0.6 proxy change, so an **expired session** is still redirected to `/login` before the action runs
  (the old "This page couldn't load" behaviour on `main` stays). The **role checks** work the same on `main`; they are the real fix there.
- No database step on `main`.

Rollback (either branch): `git revert b43eb58`.

## Production

- Nothing to apply in the database. The app change ships with the final release, or earlier via the `main` cherry-pick above (Brad).
- `04-final-release-plan.md`: no migration row needed.

## Known risks / notes

- Each statistics action now calls `getCurrentEmployee()` (Auth `getUser` + `employees` select): page load 1 + 9, month change 8 calls in parallel.
  Small extra latency, not measured on production data.
- `lookupPastEvaluatedValue` keeps the service_role read for the 4 allowed roles (by design, D2).
- KI-13 (unescaped `%` / `_` in `ilike`) — recorded only.
- KI-11 (`approve_material_dispatch` without its own role check) is unrelated and unchanged.

## How Brad verifies locally

1. `npm run typecheck && npm run lint && npm run build`
2. `npx supabase db reset && npx supabase test db` → 1067 pass (no DB change).
3. Dev server against the local stack (temporary `.env.development.local` with the local URL / keys from `npx supabase status`):
   - `manager@example.test` → `/stats`, change month → data changes;
   - DevTools: delete cookie `sb-127-auth-token`, change month → red "로그인이 필요합니다. 다시 로그인해 주세요.", month selector goes back.
4. Optional direct call: log in as `reception@example.test`, open `/dashboard`, and in the DevTools console run
   `fetch('/stats', { method: 'POST', headers: { 'next-action': '<id>', 'Accept': 'text/x-component' }, body: '[2026,9]' }).then(r => r.text())`
   with the `getCancelStats` id from `.next/dev/server/server-reference-manifest.json` → the response contains
   `"error":"통계 조회 권한이 없습니다. (ADMIN/MANAGER만 가능)"`.
