# Phase 8 — VECTOR integration (AI 읽기 전용 RPC · AI 후보 검토) — PLAN

Status: **APPROVED 2026-10-03 with conditions.** Held at precondition 0 (KI-8) and resumed after Phase 0.6 (see `phase-0.6-report.md`). Not implemented yet. Branch `feat/repair-intelligence`.

> **Amendment 2026-10-03 (Phase 0.6, R10 — approved by Brad with Phase 0.6):**
> - §3.5: `public.ai_candidate_approve` / `ai_candidate_reject` get `GRANT EXECUTE … TO anon, authenticated, service_role`, **not** "authenticated only".
>   Refusal happens inside:
>   - first statement `PERFORM public.ri_api_guard_definer('{anon}');` → "로그인이 필요합니다. 다시 로그인해 주세요.";
>   - then the existing ADMIN check (`get_my_role()` is NULL for service_role) → Korean message.
> - §3.3/§3.4: `vector_api` is **not exposed** → R10 exception. `REVOKE … FROM PUBLIC, anon, authenticated, service_role` + `GRANT … TO vector_agent` stays as planned.
>   `vector_agent` is not in `supautils.hint_roles`, so a privilege error for it does not crash (KI-8 §8.1 #5).
> - §6-A1: the R10 invariant test of Phase 0.6 (`api_guard.test.sql`) must keep passing, so `ai_candidate_*` are covered automatically.
> - KI-8 notes in §2 / §8 are superseded by KI-8 §8.3–8.4: the REST path is not affected, and operator sessions are protected by R10.
> - Caller identity inside the `ri_api_guard_definer` guard: a call from a `DO` block or invoker function runs as the request role (as before Phase 0.6).
>   This is relevant if `vector_api` functions ever call public RPCs. They do not in this plan.

## 0. Preconditions (checked 2026-10-03)

| Check | Result |
| --- | --- |
| Phase 7 report exists, all acceptance rows ✅ | yes (`phase-7-report.md`, pgTAP 693/693, commit `3ef11e5`) |
| Phases 0.1–6 reports ✅ | yes (all "local ✅, production deploy pending" — Brad's step; does not block local work) |
| Dev target | The session prompt left the target as a placeholder. Per Q9 / `03-working-rules.md` = **local Supabase on Docker** (stack is running). Brad confirms with APPROVED (§11-1). |
| Working tree | Only pre-existing, non-RI changes (`.claude/*`, `.gitignore`) — not touched. |

Investigation for this plan used **local catalog queries only** (one probe inside `BEGIN … ROLLBACK`, nothing left behind). Production: no queries.

## 1. Goal and acceptance (roadmap)

VECTOR (the in-house mainboard support agent) can **read** repair knowledge through dedicated read-only RPCs and can **propose**
knowledge, which lands in an approval queue `ai_candidates`. An ADMIN reviews on `login.`; approval converts a proposal into
`documented` or `inferred` knowledge only (never `verified` — P4). No customer PII (Q7). No `service_role` key for the agent (P8).
Must not reuse the `/api/inventory/webhook` pattern (shared key + service_role).

**Acceptance:** the agent role cannot write anywhere except `ai_candidates` (verified by test).

## 2. Real-schema findings that shape the plan

1. **Existing read RPCs cannot be reused as-is by an agent.**
   - `get_device_knowledge` checks `get_my_role() IS NOT NULL` (employee JWT) and adds prices for ADMIN/MANAGER.
   - `search_parts_for_device`, `search_devices_for_part`, `part_spec_search`, `catalog_search_models/boards` are SECURITY INVOKER.
     They read tables the agent must not be granted directly (e.g. `repair_tickets` holds customer columns).
   - → thin **SECURITY DEFINER wrappers** in a new schema. The invoker functions are called from inside the wrappers, unchanged.
     A price-free, PII-free case reader is written new (§3.4).
2. **No existing auth path fits an agent.**
   - `get_my_role()` reads `employees` via `auth.uid()`.
   - PostgREST custom roles would need JWTs signed with the project secret, and that secret can also mint `service_role` tokens.
   - → a **dedicated Postgres role `vector_agent`** that n8n uses through its Postgres node with fixed, parameterised queries.
   - The new schema `vector_api` is **not** added to the API schemas (`supabase/config.toml` unchanged). anon / authenticated cannot reach it over REST.
3. **What a fresh role can already do** (local catalog, 2026-10-03):
   - No table in any schema grants anything to PUBLIC.
   - Schema USAGE for PUBLIC exists only on `public`, `pg_catalog`, `information_schema`.
   - PUBLIC-executable functions in `public`: trigger functions, `get_my_role()` (returns NULL for the agent), and `generate_receipt_no` / `protect_approved_ticket` (trigger-only, cannot be called directly).
   - → a new role with no grants has **no write path into business tables**. The test proves it over the whole catalog (§6-A1).
4. **Caller check inside SECURITY DEFINER functions** (probed locally, rolled back):
   - In a definer function, `current_user` is the owner.
   - `session_user` is the login role in production, and `current_setting('role')` is the role after `SET ROLE` in tests.
   - → check `session_user = 'vector_agent' OR current_setting('role', true) = 'vector_agent'`.
5. **Roles are cluster-wide; `supabase db reset` recreates only the database.**
   - The role is therefore created with `IF NOT EXISTS`.
   - `postgres` is not a superuser and needs an explicit `GRANT vector_agent TO postgres` to `SET ROLE` in pgTAP. Without it, the probe failed with "permission denied to set role".
6. **Compatibility evidence already supports the needed confidence levels.**
   - `record_compatibility_result(…, p_kind …)` with `DOCUMENT` → `documented` and `INFERENCE` → `inferred` (ADMIN check inside, Phase 3).
   - Approval calls it unchanged with only those two kinds. `INSTALL` (→ verified) and `OVERRIDE` are impossible from a candidate.
7. **KI-8:** calling a function without EXECUTE crashes the local backend.
   - Tests check denied functions with `has_function_privilege` only.
   - The n8n workflow must call only the granted `vector_api` functions (§3.6, doc).

## 3. Schema — one migration `supabase/migrations/<UTC ts>_vector_integration.sql`

### 3.1 Role and schema

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vector_agent') THEN
    CREATE ROLE vector_agent NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;
  END IF;
END $$;
GRANT vector_agent TO postgres;                       -- pgTAP needs SET ROLE (finding 5)
ALTER ROLE vector_agent SET search_path = vector_api, pg_catalog;
ALTER ROLE vector_agent SET statement_timeout = '5s';
ALTER ROLE vector_agent SET idle_in_transaction_session_timeout = '10s';
CREATE SCHEMA vector_api;
REVOKE ALL ON SCHEMA vector_api FROM PUBLIC;
GRANT USAGE ON SCHEMA vector_api TO vector_agent;
```

- The migration creates the role **NOLOGIN, with no password**.
- In production Brad enables it himself: `ALTER ROLE vector_agent LOGIN PASSWORD '…'`. The password never appears in the repo (§11-10).
- The role gets **no table, sequence or `public` function grants**.

### 3.2 New table `public.ai_candidates`

| Column | Definition |
| --- | --- |
| `id` | uuid PK |
| `candidate_type` | text NOT NULL CHECK IN (`COMPATIBILITY`, `PART_ALIAS`) (§11-3) |
| `source` | text NOT NULL DEFAULT `'VECTOR'` CHECK IN (`VECTOR`) (Phase 9 adds its own value in its own plan) |
| `part_spec_id` | uuid NOT NULL → `part_specs` **ON DELETE CASCADE** (a proposal must not block deleting a spec; approved results live in evidence / aliases) |
| `target_type` | text CHECK IN (`MODEL`, `VARIANT`, `BOARD`) — COMPATIBILITY only |
| `model_id` / `variant_id` / `board_id` | uuid → `catalog_models` / `catalog_variants` / `catalog_boards`, CASCADE. Exactly one for COMPATIBILITY, none for PART_ALIAS (CHECK) |
| `observed_status` | text CHECK IN (`compatible`, `conditional`, `incompatible`). Required for COMPATIBILITY. `conditional` requires `limitation_note` |
| `limitation_note` | text ≤ 300 |
| `reference` | text ≤ 500 — document name or URL VECTOR relied on |
| `alias` / `alias_type` | text ≤ 150 / CHECK IN (`PART_NUMBER`, `MARKING`, `OTHER`). Required for PART_ALIAS |
| `rationale` | text ≤ 2000 — VECTOR's explanation (shown to the reviewer, never copied into knowledge as fact) |
| `source_ref` | text ≤ 200 — VECTOR conversation / run id |
| `status` | text NOT NULL DEFAULT `PENDING` CHECK IN (`PENDING`, `APPROVED`, `REJECTED`) |
| `approved_as` | text CHECK IN (`DOCUMENT`, `INFERENCE`) — COMPATIBILITY only, set on approval |
| `result_evidence_id` | uuid → `compatibility_evidence` RESTRICT |
| `result_alias_id` | uuid → `part_number_aliases` SET NULL |
| `reviewed_by` | uuid → employees SET NULL |
| `reviewed_at`, `review_note` (≤ 500; required for REJECTED) | |
| `created_at` | timestamptz |

- Partial unique index for dedup on PENDING identical proposals: (type, spec, target / alias_norm, observed_status).
- FK indexes on all reference columns.
- RLS on. SELECT for **ADMIN only**. No INSERT / UPDATE / DELETE policy: writes happen only through the RPCs below.
- `anon` and `authenticated` revoked except SELECT for `authenticated`, which RLS limits to ADMIN.
- `vector_agent` has **no** grant on this table either. It inserts only through `vector_api.propose_*`.

### 3.3 Agent read functions — schema `vector_api`

All functions:
- SECURITY DEFINER, `SET search_path = public, extensions`, STABLE where reading.
- Start with the caller check (finding 4) → `RAISE EXCEPTION 'VECTOR 전용 함수입니다.'`.
- `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`, then `GRANT EXECUTE … TO vector_agent` only.
- Return `jsonb`.
- **Never include:** prices (`base_estimate`, `final_price`, `refunded_amount`, `material_cost*`, `override_unit_price`), customer columns, `symptoms`, `device_model` / `tag_info` free text, `repair_records.notes`, employee names / ids, label codes, storage locations. Tickets appear by `receipt_no` only (§11-5).

| Function | Returns |
| --- | --- |
| `find_devices(p_query text, p_limit int DEFAULT 10)` | models / variants (`catalog_search_models`) and boards (`catalog_search_boards`) with ids, names, match score. Limit ≤ 30 |
| `find_parts(p_query text, p_limit int DEFAULT 10)` | part specs by name / part number / chip marking (`part_spec_search`) + their aliases. Limit ≤ 30 |
| `parts_for_device(p_model_id, p_variant_id, p_board_id)` | `search_parts_for_device` rows: status, confidence, counts, candidate flag, `stock_qty`, `donor_qty`, rank (P9 order kept) |
| `devices_for_part(p_part_spec_id)` | `search_devices_for_part` rows |
| `part_stock(p_part_spec_id)` | stock quantity by condition (NEW / USED) for rows linked to the spec, **외주 excluded** (Q5); available donor candidates of that spec (`donor_no`, donor status, candidate status). No prices, labels or locations |
| `device_cases(p_model_id, p_variant_id, p_board_id, p_limit int DEFAULT 10)` | model / board label, linked boards; totals by result / status; up to 20 recent non-test cases (incl. open and canceled, like Phase 5 decision 8). Each case: `receipt_no`, status, received / completed month, result, fault_category, symptom code names, `diagnosis_summary`, faults (component, fault_type, description), measurements (label, kind, value, unit, value_text, judgement, note), actions (type, description, succeeded), parts used (category / spec / product / capacity / qty, 외주 excluded). Model notes: type + body (no author). Per-case `EXCEPTION` skip like Phase 5 (§11-4) |

### 3.4 Agent write functions — schema `vector_api` (the only write path)

| Function | Behaviour |
| --- | --- |
| `propose_compatibility(p_part_spec_id, p_target_type, p_target_id, p_observed_status, p_limitation_note, p_reference, p_rationale, p_source_ref)` | Validates the spec, the target and its type against `part_specs.compat_target`, the status, the conditional note and the text lengths. Refuses when ≥ 500 PENDING candidates exist (§11-7). A duplicate PENDING proposal returns the existing id with `duplicate: true`. Otherwise inserts one PENDING row. Returns `{candidate_id, status, duplicate}` or `{error: '<Korean message>'}` |
| `propose_part_alias(p_part_spec_id, p_alias, p_alias_type, p_rationale, p_source_ref)` | Same pattern. An alias already registered for the spec → `{error: '이미 등록된 별칭입니다.'}` |

### 3.5 Admin review functions — schema `public` (SECURITY DEFINER, `search_path = public`, guard + ADMIN check; EXECUTE for `anon, authenticated, service_role` per R10 — see amendment at the top)

| Function | Behaviour (one transaction, candidate row locked `FOR UPDATE`, must be PENDING) |
| --- | --- |
| `ai_candidate_approve(p_candidate_id uuid, p_approve_as text DEFAULT NULL, p_reference text DEFAULT NULL, p_note text DEFAULT NULL) RETURNS jsonb` | **COMPATIBILITY:** `p_approve_as` must be `DOCUMENT` or `INFERENCE`. `DOCUMENT` needs a reference: the admin's `p_reference`, else the candidate's. Calls the existing `record_compatibility_result(spec, target_type, target_id, p_approve_as, observed_status, limitation_note, reference, 'AI 후보(VECTOR) 승인' + admin note)` → evidence `created_by` = the admin. Stores `result_evidence_id` and `approved_as`. **PART_ALIAS:** inserts into `part_number_aliases` (`created_by` = admin) and stores `result_alias_id`. Then status APPROVED, `reviewed_by/at`. Already-reviewed → "이미 처리된 후보입니다." |
| `ai_candidate_reject(p_candidate_id uuid, p_reason text) RETURNS jsonb` | Reason required ("반려 사유를 입력해 주세요."). Status REJECTED, `review_note`, `reviewed_by/at` |

Errors are `RAISE EXCEPTION` with Korean messages, like the Phase 3 RPCs. The whole call rolls back.

### 3.6 Existing objects

**None changed.** No existing table, column, trigger, function, policy, view or grant is altered.
`record_compatibility_result`, the search functions and `part_number_aliases` are only called or inserted into.
`supabase/config.toml` (API schemas) is unchanged.

## 4. Application (UI Korean; new components < 200 lines; optimistic with rollback — R5)

Before coding: read the relevant guides in `node_modules/next/dist/docs/` (server actions, route segments) per `AGENTS.md`.

### 4.1 New files

| File | Content |
| --- | --- |
| `src/app/(admin)/catalog/ai-candidates/page.tsx` | `requireAdminPage()`. Loads candidates (session client, RLS = ADMIN) with spec name, target label and reviewer name. Filter `?status=PENDING\|APPROVED\|REJECTED` (default PENDING) |
| `.../ai-candidates/AiCandidateList.tsx` | status tabs with counts; empty state "검토할 AI 후보가 없습니다." |
| `.../ai-candidates/AiCandidateCard.tsx` | type badge (호환성 / 부품 별칭); spec → target; proposed status + limitation; reference (link if URL); rationale (collapsible, labelled "AI 설명 — 사실 확인 필요"); source ref; date. Buttons: "문서 근거로 승인" (needs a reference; input pre-filled from the candidate), "추정으로 승인", alias "승인", "반려" (reason). Optimistic removal from the PENDING list with rollback + Korean error |
| `.../ai-candidates/actions.ts` | `approveAiCandidateAction`, `rejectAiCandidateAction` (session client → RPCs; Korean validation before the call) |
| `supabase/tests/vector_integration.test.sql`, `supabase/test-fixtures/phase8/rollback.sql` | pgTAP, rollback |
| `docs/repair-intelligence/vector-integration.md` | for Brad / n8n: how to enable the role in production, connection settings (Supavisor user `vector_agent.<project-ref>`), each function with an example parameterised query and JSON shape, "never let the LLM write SQL — fixed queries only (KI-8)", password rotation, how to disable (`ALTER ROLE vector_agent NOLOGIN`) |

### 4.2 Existing files changed

| File | Change |
| --- | --- |
| `src/app/(admin)/catalog/CatalogTabs.tsx` | tab "AI 후보" → `/catalog/ai-candidates` (+1 line). `/catalog` is already ADMIN-only and in `ADMIN_PATHS`, so no change to the proxy or sidebar |
| `src/types/supabase.ts` | regenerated (`ai_candidates`, two public RPCs; `vector_api` is not generated because it is not an API schema) |
| docs | `02-roadmap.md` status, `known-issues.md` KI-5 note, this plan's status, `phase-8-report.md` |

No change to the n8n webhook, ticket screens, inventory, or existing actions.

## 5. Rollback SQL (`supabase/test-fixtures/phase8/rollback.sql`)

App first (`git revert <phase-8 commit>`), then:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.ai_candidate_reject(uuid, text);
DROP FUNCTION IF EXISTS public.ai_candidate_approve(uuid, text, text, text);
DROP FUNCTION IF EXISTS vector_api.propose_part_alias(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS vector_api.propose_compatibility(uuid, text, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS vector_api.device_cases(uuid, uuid, uuid, integer);
DROP FUNCTION IF EXISTS vector_api.part_stock(uuid);
DROP FUNCTION IF EXISTS vector_api.devices_for_part(uuid);
DROP FUNCTION IF EXISTS vector_api.parts_for_device(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS vector_api.find_parts(text, integer);
DROP FUNCTION IF EXISTS vector_api.find_devices(text, integer);
-- (plus the private caller-check helper, if one is created)
DROP TABLE IF EXISTS public.ai_candidates;
DROP SCHEMA IF EXISTS vector_api;
COMMIT;
-- role is cluster-wide; drop it separately once no connection uses it:
REVOKE vector_agent FROM postgres;
DROP ROLE IF EXISTS vector_agent;
```

- Effect: candidates (pending / rejected history) are lost.
- Knowledge created by approvals **stays**: evidence rows and aliases are ordinary Phase 3 data, and their note "AI 후보(VECTOR) 승인" keeps the provenance.
- Rehearsed locally with the md5 + ACL object snapshot (as in Phase 7).

## 6. Test plan (local only)

### A. pgTAP `vector_integration.test.sql`

1. **The agent cannot write anywhere except `ai_candidates` (acceptance).**
   - Catalog-wide, as `vector_agent`:
     - `has_table_privilege` INSERT / UPDATE / DELETE / TRUNCATE = false for **every** table / view / matview in **every** schema (incl. `ai_candidates` itself);
     - `has_sequence_privilege` USAGE / UPDATE = false for every sequence;
     - `has_schema_privilege` CREATE = false for every schema;
     - `has_database_privilege` CREATE = false.
   - The set of SECURITY DEFINER functions it can execute = exactly the `vector_api` functions + `get_my_role` + the two trigger functions (finding 3).
   - Behaviour: `SET ROLE vector_agent`, then INSERT / UPDATE / DELETE attempts on every `public` table (loop) → 42501.
   - `propose_*` inserts exactly one `ai_candidates` row and touches no other table: row counts of all `public` tables are compared before and after.
2. **Agent cannot read business tables directly:** SELECT on `repair_tickets`, `customers`, `employees`, `inventory_items`, `ai_candidates` → 42501.
3. **Caller check:** every `vector_api` function refuses a non-agent caller (as postgres without SET ROLE). `authenticated` / anon / service_role have no EXECUTE (`has_function_privilege`; KI-8).
4. **Read functions:**
   - fixture (models, boards, specs, aliases, evidence, stock incl. 외주, donors, tickets with repair records, faults, measurements and customer data);
   - expected rows and P9 order;
   - partial / alias / marking input;
   - **no customer, price or employee key or value** in any JSON (same whitelist style as Phase 5/6/7);
   - test tickets excluded; 외주 excluded; `repair_records.notes` absent; limits capped.
5. **Propose functions:** valid insert; every validation message; target type mismatch; dedup returns the same id; the 500-pending cap; length limits; PART_ALIAS duplicate of an existing alias.
6. **Review functions:**
   - ADMIN approves COMPATIBILITY as DOCUMENT → evidence `DOCUMENT`, row `documented`. As INFERENCE → `inferred`;
   - **never `verified`**: no candidate path creates `INSTALL` / `OVERRIDE`;
   - DOCUMENT without any reference → refused;
   - PART_ALIAS → alias row with `created_by` = admin;
   - reject needs a reason; double review refused;
   - MANAGER / TECHNICIAN / RECEPTION / CS / EXPERT_REPAIR refused;
   - atomicity: a forced failure in `record_compatibility_result` (e.g. target deleted) leaves the candidate PENDING and creates no evidence.
7. **RLS on `ai_candidates`:** ADMIN reads; the other 5 roles see 0 rows; nobody writes directly.
8. **Regression:** all 693 existing assertions pass. The md5 + ACL snapshot of every pre-existing function / view / policy / trigger / table ACL shows **additions only**.

### B. Real login path (local only)

1. Temporarily `ALTER ROLE vector_agent LOGIN PASSWORD '<random local value>'`. The value stays in the scratchpad, never in the repo or chat.
2. Connect with `psql` as `vector_agent` on the local port and check:
   - `session_user`;
   - `search_path`;
   - each read function returns data;
   - `propose_compatibility` works;
   - direct `INSERT INTO public.repair_tickets …` → permission denied;
   - `SELECT * FROM public.customers` → permission denied.
3. Then `ALTER ROLE vector_agent NOLOGIN PASSWORD NULL`.

### C. E2E UI (local stack, seed accounts, temporary `.env.development.local` — deleted afterwards)

1. Candidates are created by step B (2 compatibility, 1 alias).
2. ADMIN → 기기 마스터 → "AI 후보":
   - 3 pending;
   - "문서 근거로 승인" without a reference → Korean message;
   - with a reference → disappears, the 부품 규격 tab shows "문서 근거 1";
   - "추정으로 승인" → `inferred`;
   - alias approve → alias chip on the spec;
   - "반려" without a reason → message; with a reason → 반려 tab.
3. Forced server error (candidate deleted in the DB meanwhile) → the card comes back with the error message.
4. MANAGER / TECHNICIAN → `/catalog/ai-candidates` → `/dashboard`. Apex → `/`.

### D. Static / advisors / rollback

- `npx supabase db reset` ×2 (proves the role `IF NOT EXISTS` logic).
- `npx supabase test db`.
- `npm run db:types`, `typecheck`, `lint`, `build`.
- `npx supabase db advisors --local --type all --level info`: new findings fixed, pre-existing ones listed.
- Rollback rehearsal (§5) with snapshot comparison, then re-apply.

## 7. Implementation order

1. Migration + pgTAP A.
2. Types.
3. Review actions + UI.
4. `vector-integration.md`.
5. B (real login) + C (E2E).
6. Static checks, advisors, rollback rehearsal.
7. Report, docs, local commit.

Any conflict with the real schema or a step failing twice → STOP and ask (R8).

## 8. Risks

- **Direct DB credentials in n8n.** Whoever holds the `vector_agent` password and a raw SQL client can:
  - run the granted functions;
  - read system catalogs (schema metadata and function source — no business rows);
  - create **temporary tables** and **large objects** (PUBLIC defaults in Postgres; revoking them would change system / database-wide grants, out of scope).

  No business table is readable or writable. Mitigations: connection limit 3, 5 s statement timeout, fixed queries in n8n, rotation and `NOLOGIN` as the kill switch (§11-11).
- **KI-8:** if n8n (or a person) calls a function the role cannot execute, the local Postgres segfaults. Production behaviour is unknown. The workflow must use only the documented calls.
- **Free text reaches the AI** (§11-4): `diagnosis_summary`, fault / action descriptions, measurement notes and model notes are staff-written and may accidentally contain customer details. If VECTOR uses an external LLM, that text leaves the company.
- **Approval quality:** an approved INFERENCE / DOCUMENT row looks like any other evidence. Provenance is only the evidence note "AI 후보(VECTOR) 승인" and `ai_candidates.result_evidence_id`. The reviewer must check the reference.
- **Production starts with little knowledge** (as Phases 3/5): VECTOR's answers will often be "no data" at first.
- Supavisor / direct connection for custom roles must be configured by Brad (doc). IPv4 users need the pooler.
- `GRANT vector_agent TO postgres` lets the `postgres` role act as the agent. It is already more privileged, so there is no escalation.
- Deploy order for Brad: after 0.5 → … → 7. **Migration first** (role NOLOGIN — nothing can connect yet), **then the app**, then `ALTER ROLE … LOGIN PASSWORD` and the n8n workflow.

## 9. Out of scope

- Building the n8n workflow or VECTOR itself (Brad; the doc describes the calls).
- Photo / vision candidates (Phase 9).
- Similar-case scoring (Phase 10).
- Candidate types other than §11-3.
- Editing a candidate before approval (reject + manual entry instead).
- Notifications for new candidates.
- Read-access logging per call (§11-12).
- KI-7, KI-9, KI-10.

## 10. Files

| New | Changed |
| --- | --- |
| 1 migration; `supabase/tests/vector_integration.test.sql`; `supabase/test-fixtures/phase8/rollback.sql`; 4 UI files under `catalog/ai-candidates/`; `docs/repair-intelligence/vector-integration.md`; `phases/phase-8-report.md` | `CatalogTabs.tsx`, `src/types/supabase.ts`, roadmap / known-issues / this plan |

## 11. Decisions needed from Brad (with APPROVED)

1. **Dev target** = local Docker Supabase? (placeholder in the prompt)
2. **Access path:** dedicated Postgres login role `vector_agent` + non-API schema `vector_api`, used by the n8n Postgres node with fixed, parameterised queries. VECTOR → n8n webhook (n8n's own auth) → DB. **Recommended.** Alternative: a Next.js route with a per-agent token, which would still need its own DB credentials in the app (no real gain, more code).
3. **Candidate types in Phase 8:** (a) **recommended** `COMPATIBILITY` (chip ↔ board, panel ↔ model) + `PART_ALIAS` (part number / chip marking); (b) `COMPATIBILITY` only.
4. **Free text sent to VECTOR:**
   - (a) **recommended** — include `diagnosis_summary`, fault / action descriptions, measurement notes and model-note bodies (the knowledge VECTOR needs). Always exclude `repair_records.notes`, `symptoms`, `device_model` / `tag_info` and every customer / employee / price field;
   - (b) structured fields only (codes, components, values, results).
5. **`receipt_no` in VECTOR results** so staff can cross-check an answer? (recommended: yes)
6. **Stock for VECTOR:** quantities by condition and donor numbers, without prices, labels or locations. OK?
7. **Limits:** max **500** PENDING candidates (then refused); identical PENDING proposals deduplicated; text length limits as in §3.2; connection limit 3; statement timeout 5 s. OK?
8. **Approval:** ADMIN chooses "문서 근거" (`documented`, reference required) or "추정" (`inferred`); no editing; rejection needs a reason; a candidate can never produce `verified` or an override. OK?
9. **UI location:** tab "AI 후보" in 기기 마스터 (`/catalog/ai-candidates`, ADMIN only). OK, or a separate sidebar menu with a pending count?
10. **Password handling:** the migration creates the role `NOLOGIN` without a password. You enable it in production (`ALTER ROLE vector_agent LOGIN PASSWORD '…'`) and put it only into the n8n credential. OK?
11. **Residual capabilities** (§8 — temp tables / large objects for anyone with the password and a raw SQL client; no business data). Accept and document, or do you want them closed (needs database-wide grant changes, separate decision)?
12. **Read logging:** none in Phase 8 (Postgres logs only). Add a call log table now (function, parameters, time)? Recommended: later, if needed.
