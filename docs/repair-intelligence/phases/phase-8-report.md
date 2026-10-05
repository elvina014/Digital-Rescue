# Phase 8 — VECTOR integration (AI 읽기 전용 RPC · AI 후보 검토) — REPORT

Executed 2026-10-04 on branch `feat/repair-intelligence`.
- Plan: `phase-8-plan.md`, APPROVED 2026-10-03 with conditions C0–C15, recorded per R11. Final APPROVED 2026-10-04.
- O1 / O2: no separate choice was given, so the plan's recommended options (a) were applied, as recorded in the plan.
- Target: local Docker Supabase only. Production: **no queries, nothing applied**.

## Result

| Acceptance / requirement | Result |
| --- | --- |
| **`vector_agent` cannot write anywhere except through `vector_api.propose_*` (C15)** | ✅ Actual attempts as `vector_agent` on **all 317 relations in every schema** (INSERT / UPDATE / DELETE / TRUNCATE) and **all 6 sequences** (`nextval` / `setval`). Every table and every sequence → 42501. Views / matviews: no attempt succeeds. Only exception: `UPDATE pg_catalog.pg_settings … WHERE false` (PostgreSQL default; equals a session `SET`, no data). `ai_candidates` itself is not writable directly. A `propose_*` call changes exactly one row in exactly one table (row counts of all `public` tables before / after) |
| Real login, then back to NOLOGIN (C15) | ✅ Local password login (random value, scratchpad only, deleted). Reads, proposals, refusals, timeouts and connection limit as expected (B below). Then `NOLOGIN PASSWORD NULL` → login refused |
| Role limits (C2, C7) | ✅ NOLOGIN, CONNECTION LIMIT 3 (4th connection refused), `statement_timeout` 5s (pg_sleep(6) cancelled), `idle_in_transaction_session_timeout` 10s, `search_path` vector_api. `temp_file_limit`: **cannot be set by the migration** (superuser-only, O1 (a)). Set locally by fixture to 10MB; a 3M-row sort fails with "temporary file size exceeds temp_file_limit". Production: via Supabase support (§ Production) |
| Masking (C5) | ✅ 29 direct `mask_text` cases + 20 false-positive / true-positive cases (2026-10-04, see "Masking: false positives") + end-to-end through `device_cases` / `parts_for_device` (diagnosis, faults, measurements, actions, model notes, limitation notes) |
| No customer / price / employee / label / location data (C6) | ✅ key + value scan over every read result (incl. fixture values such as the customer phone, address, employee names, prices 234567 / 53210, label `P-`, location `VX-01`, record notes, symptoms text) |
| Ordering (C13) | ✅ `compatible` = verified → documented → inferred; `incompatible` separate; evidence counts present |
| Never `verified` (C8, P4) | ✅ `INSTALL` / `OVERRIDE` / no mode refused; verified-row count unchanged; candidate evidence only DOCUMENT / INFERENCE |
| Reviewer + time (C8) | ✅ `reviewed_by` / `reviewed_at` on approve and reject; shown on the card |
| Content immutable (C8) | ✅ trigger refuses any change to the proposal columns, also together with a review |
| R10 (C0) | ✅ `ai_candidate_*` and the trigger granted to the 3 hint roles, refused inside. `api_guard.test.sql` invariant passes. `vector_api` exception: no EXECUTE for anon / authenticated / service_role / PUBLIC |
| pgTAP | ✅ **1067/1067** = 884 existing + **183** new (`vector_integration.test.sql`; 163 + 20 masking false-positive / true-positive cases added 2026-10-04) |
| `db reset` ×2 | ✅ (incl. after the rollback, which dropped the role → fresh create, then the `IF NOT EXISTS` path) |
| typecheck / lint / build | ✅ 0 errors / 0 errors (16 warnings, all pre-existing) / success (`/catalog/ai-candidates` built) |
| Advisors (`--type all --level info`) | ✅ no new WARN (14 = pre-existing list). New: only INFO `unused_index` on the new table's FK indexes (empty table) |
| Existing objects unchanged | ✅ object snapshot (1564 entries: functions + ACL + body md5, views, policies, triggers, columns, relation ACLs, schemas): Phase 8 = **43 additions, 0 changes** |
| Rollback rehearsal | ✅ `rollback.sql` → snapshot **identical** to before Phase 8 (1564 = 1564), role dropped; re-applied |
| E2E UI (C9) | ✅ see C below; one UI bug found and fixed (error message lost on optimistic rollback) |
| Types | ✅ regenerated: `ai_candidates`, `ai_candidate_approve`, `ai_candidate_reject` only |

## Approval conditions → implementation

| Condition | Implemented | Verified |
| --- | --- | --- |
| C0 KI-8 / R10 | `vector_api` not exposed (config.toml unchanged), grants only to `vector_agent`; `ai_candidate_*` guard + ADMIN check, grants to hint roles | pgTAP §2, §9 (anon → login message), `api_guard` invariant |
| C1 local | local Docker only | — |
| C2 role | migration §1; `temp_file_limit` fixture `test-fixtures/phase8/temp_file_limit.sql` (O1) | pgTAP §1, B |
| C3 n8n / webhook | `vector-integration.md` §2 (Session pooler 5432, credential only in n8n), §3 (**n8n Webhook node built-in Header Auth credential**, O2 revised 2026-10-04; in-workflow check = alternative only) | doc (n8n is outside this repo); rejection status to be checked once (see Known risks) |
| C4 two types | table CHECK, two propose functions | pgTAP §8 |
| C5 masking | `vector_api.mask_text` applied to every free-text value before it is returned | pgTAP §6 (29 + 20 cases), §7, B |
| C6 exclusions, `receipt_no`, stock | `part_stock` = `{stock:{NEW,USED}, donor_numbers}`; cases by `receipt_no` | pgTAP §7 key list + privacy scan |
| C7 limits | 500 cap (advisory lock), dedup (lookup + partial unique indexes), 3 connections, 5 s | pgTAP §8, B |
| C8 approval | `ai_candidate_approve` (DOCUMENT needs a reference; calls `record_compatibility_result`), `ai_candidate_reject` (reason), immutability trigger, `reviewed_by/at` | pgTAP §9, C |
| C9 UI | `/catalog/ai-candidates`, tab "AI 후보", `requireAdminPage` | C |
| C10 password, activation SQL | migration NOLOGIN; SQL + n8n steps below and in `vector-integration.md` §1–2 | — |
| C11 accept residuals | documented (`vector-integration.md` §7); role-level limits | pgTAP §2 (TEMP still granted, by design) |
| C12 n8n history | `vector-integration.md` §5; `source_ref` = `{{ $execution.id }}` shown as "실행 ID" | C (card shows it) |
| C13 ordering | `vector_api.compat_order` / `compat_row`; two lists | pgTAP §7, B |
| C14 two documents | `vector-integration.md` (people), `vector-agent-guide.md` (VECTOR prompt, Korean) | — |
| C15 acceptance | see Result | pgTAP §3, B |

## Changes

### Database — `supabase/migrations/20261004090000_vector_integration.sql` (additive only)

| Object | Content |
| --- | --- |
| role `vector_agent` | `IF NOT EXISTS` create, NOLOGIN, NOINHERIT, no create/replication/bypassrls, CONNECTION LIMIT 3; `GRANT vector_agent TO postgres` (pgTAP `SET ROLE`); role defaults `search_path=vector_api`, `statement_timeout=5s`, `idle_in_transaction_session_timeout=10s` |
| schema `vector_api` | USAGE only for `vector_agent` |
| `public.ai_candidates` | columns per plan §3.2 + generated `alias_norm`; shape / conditional / review / result CHECKs; dedup partial unique indexes; FK + status indexes; RLS SELECT ADMIN only; no write grants; trigger `ai_candidates_protect` (content immutable; PENDING → APPROVED / REJECTED only) |
| `vector_api` agent functions (definer, caller check) | `find_devices`, `find_parts`, `parts_for_device`, `devices_for_part`, `part_stock`, `device_cases`, `propose_compatibility`, `propose_part_alias` → EXECUTE for `vector_agent` only |
| `vector_api` helpers (owner only) | `require_agent()` ("VECTOR 전용 함수입니다."), `mask_text(text, text)`, `compat_order(text)`, `compat_row(jsonb)` |
| `public` review RPCs | `ai_candidate_approve(uuid, text, text, text)`, `ai_candidate_reject(uuid, text)` — guard `{anon}` + ADMIN check; EXECUTE for anon / authenticated / service_role (R10) |

Existing objects: only **called** (`catalog_search_models/boards`, `part_spec_search`, `search_parts_for_device`, `search_devices_for_part`, `record_compatibility_result`) or **inserted into** (`part_number_aliases`). Snapshot: 0 changes.

### Application

| File | Change |
| --- | --- |
| `src/app/(admin)/catalog/ai-candidates/page.tsx` (new) | ADMIN page, status filter, counts, candidate mapping (spec, target label, reviewer, Seoul time) |
| `…/AiCandidateList.tsx` (new) | status tabs, empty state, optimistic removal; keeps the per-card server error (see C3) |
| `…/AiCandidateCard.tsx` (new) | content (read-only), "AI 설명 — 사실 확인 필요", "실행 ID", buttons 문서 근거로 승인 (reference pre-filled, required) / 추정으로 승인 / 승인 (alias) / 반려 (reason), reviewer + time on reviewed cards |
| `…/actions.ts` (new) | `approveAiCandidateAction`, `rejectAiCandidateAction`: own login check ("로그인이 필요합니다. 다시 로그인해 주세요.") + ADMIN check (KI-12 lesson), Korean validation, session client → RPC |
| `src/app/(admin)/catalog/CatalogTabs.tsx` | +1 tab "AI 후보" |
| `src/types/supabase.ts` | regenerated |

Component sizes (card / list / page / actions): 137 / 95 / 92 / 68 lines.

### Tests / fixtures

- `supabase/tests/vector_integration.test.sql` (163). Sections:
  1. role settings;
  2. catalog-wide privileges;
  3. **actual write attempts**;
  4. no direct reads;
  5. caller check;
  6. masking (29 cases + 20 false-positive / true-positive cases);
  7. read functions incl. C13 ordering and the privacy scan;
  8. propose (all messages, dedup, 500 cap, one-row effect);
  9. review (all roles, modes, never verified, reviewer / time, immutability, atomicity);
  10. RLS.
- `supabase/test-fixtures/phase8/`:
  - `rollback.sql`;
  - `temp_file_limit.sql` (local superuser, O1);
  - `demo.sql` (local fake knowledge for B / C).
- Separate commit `f138ba7`: two Phase 7 assertions compared receipt numbers with fixed dates (seed tickets are `now() - N days`). They failed after any reset on a later day. Now compared with the ticket's own receipt number; no behaviour change.

### Docs

- `vector-integration.md` (new, people).
- `vector-agent-guide.md` (new, VECTOR prompt, Korean).
- `02-roadmap.md` status; `04-final-release-plan.md` row 12; `known-issues.md` KI-5 note; plan status.

## Deviations from the plan

| Plan | Done | Why |
| --- | --- | --- |
| Masking order card → RRN → phone → e-mail | **e-mail first**, then card, RRN, phone, name | A phone-like local part (`010…@x.com`) would otherwise be masked partially and leave the domain |
| Mask the listed free-text columns | also `repair_faults.component` and `repair_measurements.label` | Also staff-typed text (e.g. "PU8 (고객 확인)"); masking more is the safe direction |
| `device_cases` key `notes` for model notes | `model_notes` | Unambiguous for VECTOR; `notes` looked like `repair_records.notes` (excluded) |
| "(private caller-check helper, if one is created)" | 4 helpers: `require_agent`, `mask_text`, `compat_order`, `compat_row` | Shared code; executable by the owner only (test §2) |
| Read-function errors (not specified) | input errors → `{"error": "<Korean>"}`, like the propose functions; the caller check still raises 42501 | Predictable JSON for n8n / VECTOR |
| `reviewed_by/at` NULL ⇔ PENDING | CHECK on `reviewed_at` only | `reviewed_by` is `ON DELETE SET NULL`; a deleted employee must not break the check |
| Alias approval | `p_approve_as` must be NULL for aliases ("부품 별칭 후보는 승인 방식을 선택하지 않습니다.") | Stricter; no meaningless mode stored |
| A1 "every relation → 42501" | tables and sequences: strictly 42501. Views / matviews: no attempt succeeds and no privilege. `pg_settings` UPDATE allowed | For non-updatable views Postgres raises the rewriter error before the privilege check. `pg_settings` UPDATE is a PostgreSQL default (= `SET`) |
| B over the local port | inside the container, connecting to the container's network address | No `psql` on the Windows host. That path uses scram (password) — `127.0.0.1` inside the container is `trust` and would not prove the password |
| C3 "candidate deleted meanwhile → card comes back with the message" | deleted candidate: the action refreshes the page and the card **disappears** (correct — it no longer exists). Re-tested with "alias registered meanwhile" | That run found a bug (below) |
| `temp_file_limit` in the role settings | not in the migration (O1 (a)) | Superuser-only parameter |

**Bug found in E2E and fixed before the commit:**
- Symptom: a failed approval brought the card back **without** the error message.
- Cause: the optimistic hide unmounts the card, so the error was set on an unmounted instance.
- Fix: the error is kept per candidate in `AiCandidateList` and passed to the card.
- Re-tested: "이미 등록된 별칭입니다." shown, candidate still PENDING.

## Masking: false positives and 16-digit numbers (2026-10-04)

Because masking also covers `repair_faults.component` and `repair_measurements.label`, the following values were tested (pgTAP §6, +20 assertions).

| Values | Result |
| --- | --- |
| board numbers `BA92-12345A`, `NM-D561`, `LA-K201P`, `DA0X8CMB8E0` | unchanged |
| part / panel numbers `LP156WFC-SPY1`, `NV156FHM-N48`, `B156HAN02.1`, `BQ24780S` | unchanged |
| measurement labels `19V`, `3VALW`, `5VALW`, `PP3V3_S5` | unchanged |
| digits-only 12 characters `123456789012`, and `012345678901` (leading 0, like a phone prefix) | unchanged |
| a full sentence with these values (`PU8 (BA92-12345A) 3VALW 3.3V, 5VALW 0V, PP3V3_S5 쇼트 → BQ24780S 교체`) | unchanged |
| `010-1234-5678`, `01012345678`, `test@example.com`, `900101-1234567` | `[마스킹]` |
| **digits-only 16 characters `1234567890123456`** | **`[마스킹]` — kept on purpose** |

**No false positive was found, so no pattern was changed.**

**16 digits only — kept masked.** A 16-digit number without separators has exactly the card-number form and cannot be told apart from a serial. Reasons for masking:
1. Missing a card number would send payment data out of the company (possibly to an external LLM) — the harm is not reversible. Masking a serial only loses a detail VECTOR does not need for repair knowledge.
2. Laptop / board serials are usually alphanumeric (e.g. `5CG1234XYZ`, `PF2ABCDE`) and stay unchanged. Digits-only 16-character serials are rare.
3. A Luhn check would let about 1 in 10 random serials through as "cards" anyway, while letting typo'd card numbers through unmasked. Not adopted.

Other number lengths:
- 12 digits stays unchanged.
- **13 digits only** is the resident-number form (6 + 7, 7th digit 1–8) and is masked for the same reason (documented in Known risks).

## Test results

### A. pgTAP — 1067/1067 (after the 2026-10-04 additions; 1047 at the Phase 8 commit) (`npx supabase test db`)

### B. Real login (local)

| Check | Result |
| --- | --- |
| session | `session_user` / `current_user` = `vector_agent`, `search_path` = `vector_api`, `statement_timeout` = 5s, idle 10s, `temp_file_limit` = 10MB (fixture) |
| reads (unqualified names) | `find_devices('15Z90T')` → model; `find_parts('BQ24780S')` → BQ24780SRUYR; `parts_for_device` → verified panel in `compatible`; `devices_for_part` → Lenovo in `incompatible`; `part_stock` → `{NEW: 2, USED: 0}`, donors `[]`; `device_cases` → `"[고객] 요청 — 패널 불량, 연락처 [마스킹]"`, `receipt_no` present |
| proposals | 2 compatibility + 1 alias → PENDING |
| refusals | INSERT repair_tickets, UPDATE inventory_items, DELETE customers, INSERT ai_candidates, `nextval(donor_no_seq)`, SELECT customers, `ai_candidate_approve` → all "permission denied" (no crash: not a hint role) |
| limits | `pg_sleep(6)` → statement timeout; 3M-row sort → temp_file_limit exceeded; 4th concurrent connection → "too many connections for role" |
| session override | `SET statement_timeout = 0` **accepted** (role defaults are overridable — documented, residual); `SET temp_file_limit` → permission denied |
| back to NOLOGIN | `ALTER ROLE vector_agent NOLOGIN PASSWORD NULL` → `rolcanlogin = false`, password NULL, login fails |

### C. E2E UI (local stack, seed accounts, temporary `.env.development.local` — **deleted**)

The browser pane was hidden, so some steps were driven by DOM events and verified by page text, network responses and DB queries (as in Phase 0.6).

| Step | Result |
| --- | --- |
| ADMIN → 기기 마스터 → "AI 후보" | 3 pending from B (later 5); tab counts |
| "문서 근거로 승인" with empty reference | "문서 근거로 승인하려면 출처를 입력해 주세요." |
| with the pre-filled reference (candidate URL) | card disappears; 부품 규격 → L19M3PF7 → "LG 그램 15 15Z90T · 호환 · 문서 근거 · 근거: 문서 1" |
| "추정으로 승인" (variant, conditional) | approved, evidence INFERENCE |
| alias "승인" | alias LP156WF9-SPL1 on the spec (count "별칭 1") |
| "반려" without / with reason | "반려 사유를 입력해 주세요." / 반려 tab shows reason, "테스트관리자", time |
| forced server error (alias registered in the DB meanwhile) | card returns with "이미 등록된 별칭입니다."; DB still PENDING (after the fix above) |
| session expired (auth cookie deleted) → "승인" | "로그인이 필요합니다. 다시 로그인해 주세요."; DB unchanged |
| MANAGER / TECHNICIAN → `/catalog/ai-candidates` | → `/dashboard` |
| main domain `localhost:3000/catalog/ai-candidates` | → `/` |
| DB after C | APPROVED: DOCUMENT 1, INFERENCE 1, alias 1 (all with reviewer + time); REJECTED 1; PENDING 1; evidence notes "AI 후보(VECTOR) 승인" |

Console: no errors. Server log: only "Refresh Token Not Found" from the sessions ended on purpose (cookie deletion / logout).

### D. Static / advisors / rollback — see Result.

## Production (Brad) — C10

Nothing to do now. Phase 8 ships with the final release (`04-final-release-plan.md` row 12, after 0.6a).

1. Migrations in order, **then** the app.
2. Activation, in the SQL Editor as `postgres` (not "Run as role"):

   ```sql
   ALTER ROLE vector_agent LOGIN PASSWORD '';   -- ← type a long random password between the quotes; never store it anywhere else
   SELECT rolcanlogin, rolconnlimit FROM pg_roles WHERE rolname = 'vector_agent';                 -- true | 3
   SELECT setconfig FROM pg_db_role_setting WHERE setrole = 'vector_agent'::regrole;              -- search_path, 5s, 10s
   ```

3. `temp_file_limit` (O1 (a), accepted by Brad 2026-10-04): requested from Supabase support with the KI-8 report (step 6).
4. n8n credential (details: `vector-integration.md` §2):
   1. n8n → Credentials → **Postgres**;
   2. Host = dashboard → Connect → **Session pooler** host; Port **5432**; Database `postgres`;
   3. User `vector_agent.<project-ref>`; Password = the one from step 2; SSL require;
   4. at most 3 connections;
   5. save — the connection data lives only in this credential.
5. Webhook: Webhook node → Authentication **Header Auth** with an n8n Header Auth credential (`X-Vector-Secret`) (`vector-integration.md` §3). Test without / wrong / correct header and note the status codes (401 required by C3; n8n may answer 403 — then decide, or use the alternative in §3).
6. Supabase support: request `temp_file_limit` for `vector_agent` together with the KI-8 report (`supabase-support-report.md` Requests #4, KI-8 §8.5).
7. n8n execution history retention (`vector-integration.md` §5) and `{{ $execution.id }}` as `p_source_ref`.
8. Put `vector-agent-guide.md` (the part between `---`) into VECTOR's system prompt.
9. Kill switch: `ALTER ROLE vector_agent NOLOGIN;`.

## How Brad verifies locally

1. Run the database checks:
   ```bash
   npx supabase db reset
   npx supabase test db
   ```
   Expected: 1067 pass.
2. Optional `temp_file_limit`:
   ```bash
   docker exec -i supabase_db_digital-rescue psql -h 127.0.0.1 -U supabase_admin -d postgres -X < supabase/test-fixtures/phase8/temp_file_limit.sql
   ```
3. Demo knowledge and proposals:
   1. Load the demo knowledge:
      ```bash
      docker exec -i supabase_db_digital-rescue psql -U postgres -d postgres -X < supabase/test-fixtures/phase8/demo.sql
      ```
   2. Then, in `psql -U postgres`, run `SET ROLE vector_agent;` and call e.g.
      `SELECT vector_api.propose_compatibility('00000000-0000-4000-9100-000000000002','MODEL','00000000-0000-4000-f200-000000000001','compatible',NULL,'https://example.com/ds.pdf');`
4. Dev server against the local stack, `admin@example.test` → 기기 마스터 → AI 후보 → approve / reject.
5. Run the app checks: `npm run typecheck && npm run lint && npm run build`.

## Known risks / notes

- **Masking is pattern-based.** It can miss PII in unusual forms (a number split by words, an address, another customer's name). It can over-mask number sequences that look like a phone / resident / card number (e.g. a 13-digit serial). Text still leaves the company if VECTOR uses an external LLM.
- **Role defaults can be overridden by the session.** Anyone with the password and a raw SQL client can `SET statement_timeout = 0`. `temp_file_limit`, once set by a superuser, cannot be overridden. The n8n workflow uses fixed queries; keep the password only in n8n (C11, `vector-integration.md` §7).
- **`temp_file_limit` is not active in production** until Supabase support sets it (O1).
- **Webhook rejection status (O2, revised):** the built-in Header Auth refuses unauthenticated calls before the workflow runs, but the n8n docs do not state the status code (possibly 403, not 401 as C3 says). Check once after setup; if it is not 401, Brad decides (accept 403, or the in-workflow alternative in `vector-integration.md` §3).
- **Audit = n8n execution history** (C12). If n8n prunes or loses it, the call history is gone.
- **Approval quality:** an approved DOCUMENT / INFERENCE looks like other evidence. Provenance is the evidence note "AI 후보(VECTOR) 승인" and `ai_candidates.result_evidence_id`. The reviewer must check the reference.
- **Production knowledge is sparse at first** (as in Phases 3 / 5): VECTOR will often answer "no data".
- `GRANT vector_agent TO postgres`: `postgres` can act as the agent; it is already more privileged (no escalation).
- Local only: the rollback drops the role, so re-run `temp_file_limit.sql` after a rehearsal.
- Still open (unchanged): KI-7, KI-9, KI-10, KI-11, **KI-12 → Phase 0.6.1** (after Phase 8).
