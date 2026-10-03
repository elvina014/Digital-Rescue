# Phase 0.6.1 — Server action login / role checks (KI-12) — PLAN

Status: **APPROVED 2026-10-04 — EXECUTED 2026-10-04** (conditions in §10, R11; see `phase-0.6.1-report.md`). Branch `feat/repair-intelligence`. Dev target: local Docker Supabase (no DB change expected).

## 0. Preconditions (checked 2026-10-04)

| Check | Result |
| --- | --- |
| Phase 8 report | `phase-8-report.md` exists; every acceptance row ✅ |
| Phase 8 commits on this branch | `08f0bd9` feat(vector) (Phase 8), `748e4ec` test/docs(vector) follow-up; approval docs `3b2db2f`, `c4936c6` |
| Source of the scope | `02-roadmap.md` → Phase 0.6.1; `known-issues.md` KI-12; `phase-0.6-report.md` → "후속 점검" A |
| Working tree | only pre-existing non-RI changes (`.claude/*`, `.gitignore`) |

## 1. Goal and acceptance

Every non-public server action checks login itself (needed since Phase 0.6: the proxy no longer redirects action requests without a session).

**Acceptance (roadmap):**
- the audit table (`phase-0.6-report.md` → 후속 점검 A) shows an own login check for every non-public action;
- the 9 statistics actions refuse every role other than ADMIN / MANAGER;
- `requireAuth()` returns "로그인이 필요합니다. 다시 로그인해 주세요.";
- `lookupPastEvaluatedValue`: decision D2 implemented.

## 2. DB migration?

**None.** App code only. No table, function, policy, grant or type changes → no `db reset`, no advisors, no type regeneration needed
(R6 type step: run `npm run db:types` anyway and confirm the diff is empty).

## 3. Findings

### 3.1 `src/app/actions/statisticsActions.ts` (9 actions)

- Callers: `src/app/(admin)/stats/page.tsx` (server component, initial load — already redirects non-ADMIN/MANAGER to `/dashboard`)
  and `StatisticsClient.tsx` `fetchData()` (year / month change; 8 of the 9 actions, not `getBrandBreakdown`).
- Each action uses the session client; RLS decides the rows. Today (KI-12): anon → 0 rows; RECEPTION → all tickets; CS → completed tickets;
  TECHNICIAN / EXPERT_REPAIR → own tickets. `getRefundStats` also reads `ticket_refunds` (RLS similar).
- Return types are plain data (`MonthlyRevenueData[]`, `CancelStatsData`, …). There is no error channel today, so a refusal needs one (D1).

### 3.2 `src/app/actions/inventoryActions.ts` `requireAuth()`

- Line 16: `"로그인이 필요합니다."` — the last action-side login message not unified in Phase 0.6 (grep: no other old variant left in `src/`).
- Used by all 23 inventory actions; one literal change covers them.

### 3.3 `lookupPastEvaluatedValue` (`src/app/(admin)/tickets/actions.ts:211`)

What it does:
- Login check only (`getCurrentEmployee()`; logged out → `{ data: null }`), then **service_role** client (bypasses RLS).
- Input: brand + tag info, or brand + model (partial `ilike` match).
- Reads (1) `device_models` (AI value cache): `release_price`, `model_name` / `tag_info`, `release_year`;
  (2) fallback `repair_tickets` of **all** tickets: `device_model`, `tag_info`, `release_year`, `evaluated_value`.
- Returns **one** value only if the match is unique (otherwise `multipleResults: true`). Never returns ticket ids, receipt numbers,
  customer data, `final_price` or employee data.

Who uses it:
- Only `EstimateCard` (auto-fill of "기기 가치 평가"), rendered when `canChangeStatus && status === "RECEIVED"`
  = ADMIN, MANAGER, or the assigned TECHNICIAN / EXPERT_REPAIR. `startRepairAction` allows the same 4 roles.

What the service_role read adds over RLS:
- `device_models`: nothing (RLS `device_models_select` is `USING (true)` for every authenticated user).
- `repair_tickets`: TECHNICIAN / EXPERT_REPAIR see past values of **other** tickets — this is the purpose of the feature
  (a technician values a device using earlier tickets). With the session client it would only find their own tickets, so the
  service_role read must stay.
- RECEPTION / CS can call it directly over the action endpoint although the UI never offers it to them
  (RECEPTION already sees all tickets via RLS; CS sees completed ones). Exposure: device-value numbers only, no PII. Low risk.

Recommendation (D2-a): allow exactly the 4 EstimateCard roles; refuse RECEPTION / CS with `{ data: null }` (same as the logged-out
result today, the UI shows no hint). Keep service_role.

Noted, **not** changed (scope): user input goes into `ilike` without escaping `%` / `_` (e.g. brand `%`). Effect: broader match →
usually `multipleResults`. Can be recorded as a new KI if Brad wants.

## 4. Decisions for Brad

**D1. How a refused statistics call answers.**
- **(a) recommended:** each action returns `{ data: T } | { error: string }`.
  - Refusals: logged out → "로그인이 필요합니다. 다시 로그인해 주세요."; other role → "통계 조회 권한이 없습니다. (ADMIN/MANAGER만 가능)".
  - `page.tsx`: unwraps; on `error` → `redirect("/dashboard")` (same as its own gate; cannot normally happen).
  - `StatisticsClient.fetchData`: if any result has `error`, keep the current data and show the message in a red box above the charts
    (pattern used elsewhere in the app); otherwise set the data as today.
- (b) `throw new Error(...)`: in production Next.js hides the message; a throw inside `startTransition` reaches the error boundary
  ("This page couldn't load") — the problem Phase 0.6 fixed. Not recommended.
- (c) return empty data (zeros): smallest diff but silent — after session expiry staff would see "0원" as if real. Not recommended.

**D2. `lookupPastEvaluatedValue` role limit.**
- **(a) recommended:** ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR only (= EstimateCard / `startRepairAction`); others `{ data: null }`.
- (b) no role limit (keep as is; document the decision in KI-12).
- (c) (a) + TECHNICIAN / EXPERT_REPAIR only when assigned to a ticket — would need the ticket id as a new parameter. Not recommended (wider change, little gain).

**D3. Cherry-pick to `main`.** See §8. Confirm whether Brad wants the app commit kept separate from the docs commit (recommended: yes).

## 5. Changes (app only)

| File | Change |
| --- | --- |
| `src/app/actions/statisticsActions.ts` | local helper `requireStatsAccess()` (`getCurrentEmployee()`; null → login message; role ∉ {ADMIN, MANAGER} → role message). First statement of all 9 actions. Return types per D1 (one exported `StatsResult<T>` type). Query bodies unchanged |
| `src/app/(admin)/stats/page.tsx` | unwrap the 9 results (D1-a) |
| `src/app/(admin)/stats/StatisticsClient.tsx` | `fetchData`: error check + red message state (D1-a); no other UI change |
| `src/app/actions/inventoryActions.ts` | line 16 literal → "로그인이 필요합니다. 다시 로그인해 주세요." |
| `src/app/(admin)/tickets/actions.ts` | `lookupPastEvaluatedValue`: role check after the login check (D2-a); rest unchanged |
| docs | `phase-0.6.1-report.md`; `known-issues.md` KI-12 status; `02-roadmap.md` Phase 0.6.1 ✅; `phase-0.6-report.md` 후속 점검 A table rows (statistics, tickets, inventory) marked fixed in 0.6.1 |

No DB, no proxy, no types change. No other action touched.

## 6. Test plan (local dev server `next-dev` + local Supabase seed users `*@example.test`)

No test framework exists; actions are called over HTTP exactly as the browser does.

1. `npm run build` → read the action ids of the 9 statistics actions and `lookupPastEvaluatedValue` from
   `.next/server/server-reference-manifest.json`.
2. Log in as each seed role (admin, manager, reception, tech, expert, cs) in the browser pane, then `fetch` POST to `/stats`
   (`next-action: <id>`, args `[2026, 10]`) from the page:

| Call | ADMIN / MANAGER | RECEPTION / TECHNICIAN / EXPERT_REPAIR / CS | logged out (cookie deleted) |
| --- | --- | --- | --- |
| 9 statistics actions | `{ data }` = same values as before the change (captured before, compared) | `{ error: "통계 조회 권한이 없습니다. …" }` | `{ error: "로그인이 필요합니다. 다시 로그인해 주세요." }` |
| `lookupPastEvaluatedValue` (seed brand/model that matches uniquely) | value | TECH / EXPERT: value; RECEPTION / CS: `{ data: null }` | `{ data: null }` |

3. UI: `/stats` as MANAGER renders as before (screenshot); change month → data updates; delete the auth cookie, change month →
   red "로그인이 필요합니다. 다시 로그인해 주세요.", charts keep the old data, no error page.
4. Inventory: as MANAGER delete the auth cookie, trigger one inventory action (e.g. 재고 설정 저장) → new message.
5. EstimateCard: as `tech@example.test` on an assigned RECEIVED seed ticket, type a known brand/model → auto-fill hint as before.
6. `npm run typecheck`, `npm run lint`, `npm run build` pass (lint warnings: only the pre-existing 16). `npm run db:types` → no diff.
7. `npx supabase test db` → 1067/1067 unchanged (sanity; no DB change).

Before / after comparison of step 2 (ADMIN / MANAGER values) is the "allowed behaviour unchanged" proof.

## 7. Rollback

App only: `git revert <phase-0.6.1 app commit>`. No database rollback.

## 8. Cherry-pick to `main`

- **Independent: yes.** The app commit touches only the 5 files in §5. Checked against `main` (merge-base `7d237f6`):
  - `statisticsActions.ts`, `stats/page.tsx`, `StatisticsClient.tsx`: identical on `main` and this branch → clean.
  - `inventoryActions.ts`: branch only adds `updateRepairGateFlags` far below line 16 → clean.
  - `tickets/actions.ts`: `lookupPastEvaluatedValue` body identical on both; the nearest branch hunk (Phase 0.6 literal in
    `markReceivedAction`) is after the function → expected clean (verify with `git cherry-pick --no-commit` dry run on a scratch branch only if Brad asks; I will not touch `main`).
- No dependency on any migration or on Phase 1–8 code.
- Difference on `main`: there the proxy still redirects action requests without a session (Phase 0.6 proxy change is not on `main`),
  so the new login messages are rarely reached; the **role checks** work the same and are the real fix.
- Docs go in a separate commit (`docs/repair-intelligence/` exists only on this branch).

## 9. Risks

- Each statistics action now runs `getCurrentEmployee()` (Auth `getUser` + `employees` select). Initial page load: 1 + 9 calls in parallel;
  month change: 8. Small extra latency; acceptable for an admin report page. (Not optimised — would widen scope.)
- D1-a changes the 9 exported return types; only `stats/page.tsx` and `StatisticsClient.tsx` import them (grep), both updated; typecheck proves it.
- Role changes during an open session: the next month change shows the role message (intended).

## 10. 승인 조건

APPROVED by Brad, 2026-10-04 (recorded per R11 before implementation).

- **D1.** 권장안: `{ data } | { error }` 형식, 거부 시 빨간 메시지 표시.
- **D2.** 권장안: `lookupPastEvaluatedValue`는 ADMIN, MANAGER, 배정 기사(TECHNICIAN), 정밀수리팀(EXPERT_REPAIR)만 허용. RECEPTION·CS는 `{ data: null }`.
- **D3.** 권장안: 앱 커밋과 문서 커밋 분리. **앱 커밋은 §5의 5개 파일만 포함하는 단일 커밋** (main cherry-pick 대비).

추가 조건:
1. 구현 전에 통계 액션 9개 각각의 호출 위치를 `src/` 전체에서 찾아 표로 보여준다 (파일 / 화면 / 그 화면에 접근 가능한 역할).
   `/stats` 외에 ADMIN·MANAGER가 아닌 역할이 접근하는 화면에서 호출되는 액션이 있으면 **구현하지 말고 멈추고 보고**한다.
2. `ilike` 와일드카드(`%`, `_`) 미이스케이프 문제는 `known-issues.md`에 새 KI로 **기록만** 한다 (위치 목록 포함). 수정하지 않는다.
3. 보고서에 main으로 cherry-pick 하는 정확한 명령어 순서와, main에서 빌드가 통과하는지 확인하는 방법을 적는다.
   실제 cherry-pick, push, main 체크아웃은 하지 않는다.
