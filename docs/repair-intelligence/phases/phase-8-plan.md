# Phase 8 — VECTOR integration (AI 읽기 전용 RPC · AI 후보 검토) — PLAN

Status: **APPROVED 2026-10-03 with conditions; conditions recorded 2026-10-04 (R11); this revision APPROVED by Brad 2026-10-04.** Branch `feat/repair-intelligence`.
Held at precondition 0 (KI-8) and resumed after Phase 0.6 (see `phase-0.6-report.md`, incl. "후속 점검").

## 승인 조건 (Brad, 2026-10-03 승인 시 전달 · 2026-10-04 기록, R11)

Recorded as given by Brad. Where each condition is reflected: checklist in §13.

- **C0.** KI-8은 §8.3 재검증으로 해소. `vector_api`는 노출되지 않는 스키마이므로 R10 예외. 단 노출 스키마의 `ai_candidate_*` 함수는 R10 준수
  (hint 역할에 GRANT + 함수 내부 확인으로 거부). 노출 스키마 = `public`, `graphql_public` (Brad 2026-10-04; 대시보드 확인 결과는 Brad가 별도 전달).
- **C1.** 개발 대상: local.
- **C2.** `vector_agent` 역할: 마이그레이션에서는 NOLOGIN. CONNECTION LIMIT 3, `statement_timeout` 5s,
  `idle_in_transaction_session_timeout` 설정, `search_path`는 `vector_api` 고정, `temp_file_limit` 낮게 설정.
- **C3.** n8n은 전용 역할 + Postgres 노드로 접속(Session pooler, 포트 5432). 접속 정보는 n8n credential에만 저장.
  VECTOR → n8n 웹훅은 비밀 헤더 인증 필수(없거나 틀리면 401). 설정 방법 문서화.
- **C4.** 후보 종류: 호환성 + 부품 별칭.
- **C5.** 자유 텍스트(진단 요약, 고장·조치 설명, 측정 메모, 모델 메모)는 포함하되, `vector_api` 함수가 반환하기 전에 마스킹:
  전화번호, 이메일, 주민번호 형태, 카드번호 형태 → `[마스킹]` / 해당 티켓의 고객명이 텍스트에 있으면 → `[고객]`.
  마스킹 테스트 케이스를 테스트 계획에 포함.
- **C6.** 결과에 접수번호 포함. 재고는 상태별 수량 + Donor 번호만. 고객 정보, 가격, 직원 정보, 라벨, 보관 위치는 어떤 결과에도 제외.
- **C7.** 제한: 대기 후보 최대 500건, 동일 대기 제안 중복 제거, 동시 접속 3, 쿼리 5초.
- **C8.** 승인 방식: "문서 근거로 승인"(출처 필수) → documented / "추정으로 승인" → inferred / "반려"(사유 필수).
  후보 내용 수정 불가. 어떤 경로로도 verified가 생성되면 안 됨(P4). 승인·반려 시 검토자와 시각 기록.
  승인은 기존 `record_compatibility_result`를 호출.
- **C9.** UI: 기기 마스터의 "AI 후보" 탭, ADMIN 전용.
- **C10.** 운영 비밀번호는 Brad가 직접 설정. 운영 활성화 SQL(비밀번호 자리는 비움)과 n8n credential 설정 절차를 `phase-8-report.md`에 기록.
- **C11.** 임시 테이블/large object: DB 전체 권한은 변경하지 않고 "문서화하고 수용". 역할 단위 제한(C2) 적용.
- **C12.** DB 호출 로그 테이블은 만들지 않음. 대신 n8n 실행 이력 보존 설정으로 감사 기록을 대체하는 방법 문서화.
- **C13.** 조회 결과(P9): 호환성 결과에 status, confidence, 근거 횟수(성공/조건부/실패) 포함.
  verified → documented → inferred 순 정렬, incompatible은 별도 목록.
- **C14.** 문서 두 개를 구분:
  - `vector-integration.md`: 사람(Brad)용 설치·연동 절차 (기존 계획 유지)
  - `vector-agent-guide.md`: VECTOR 시스템 프롬프트용 지침 — 조회 우선순위
    (내부 수리 사례 > verified 호환 > 재고 > Donor > documented > 인터넷 > AI 추론),
    답변 시 근거 출처와 confidence 표기, 인터넷 정보는 출처 URL과 함께 `ai_candidates`로만 제안,
    verified로 단정하는 표현 금지, 사용 가능한 함수 목록과 파라미터.
- **C15.** 수용 기준: `vector_agent`는 `ai_candidates` 제안 함수 외에는 어떤 테이블·시퀀스에도 쓰기 불가(실제 INSERT/UPDATE/DELETE 시도로 검증),
  로컬에서 로그인 활성화 후 실제 접속 검증 → 다시 NOLOGIN으로 복귀.

- **APPROVED 2026-10-04 (최종).** Brad: "체크리스트 확인했습니다. APPROVED. phase-8-plan.md대로 구현 → 로컬 검증 → phase-8-report.md → 로컬 커밋 후 커밋 해시와 브랜치명을 알려주고 멈추세요."
  O1·O2는 별도 선택 없이 "계획서대로" 승인됨 → 계획서 권장안 적용: **O1 (a)** 마이그레이션에서 `temp_file_limit` 미설정, 문서화 + 로컬은 `supabase_admin` 픽스처, 값 **10MB**;
  **O2 (a)** n8n 워크플로가 헤더를 직접 비교해 "Respond to Webhook"으로 **401** 응답. Brad가 다른 선택을 원하면 보고서 검토 시 수정.

Earlier decisions of §11 (2026-10-03 plan) are superseded where a condition above says otherwise; otherwise the recommended option was approved.

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

## 0. Preconditions (checked 2026-10-03, re-checked 2026-10-04)

| Check | Result |
| --- | --- |
| Phase 7 report exists, all acceptance rows ✅ | yes (`phase-7-report.md`, commit `3ef11e5`) |
| Phase 0.6 + follow-up | yes (`257022e`, follow-up `2409e3a`; pgTAP **884/884** on 2026-10-04) |
| Phases 0.1–6 reports ✅ | yes (all "local ✅, production deploy pending" — Brad's step; does not block local work) |
| Dev target | **local Supabase on Docker** (C1) |
| Exposed API schemas | `public`, `graphql_public` (C0; `supabase/config.toml` unchanged) |
| Working tree | Only pre-existing, non-RI changes (`.claude/*`, `.gitignore`) — not touched, never committed |

Investigation used **local catalog queries only** (probes inside `BEGIN … ROLLBACK`, nothing left behind). Production: no queries.

## 1. Goal and acceptance (roadmap)

VECTOR (the in-house mainboard support agent) can **read** repair knowledge through dedicated read-only RPCs and can **propose**
knowledge, which lands in an approval queue `ai_candidates`. An ADMIN reviews on `login.`; approval converts a proposal into
`documented` or `inferred` knowledge only (never `verified` — P4). No customer PII (Q7, C5, C6). No `service_role` key for the agent (P8).
Must not reuse the `/api/inventory/webhook` pattern (shared key + service_role).

**Acceptance (C15):**
- `vector_agent` cannot write to any table or sequence except through the `vector_api.propose_*` functions —
  verified by **actual** INSERT / UPDATE / DELETE / TRUNCATE and `nextval` / `setval` attempts (§6-A1);
- real login on the local stack works, then the role is back to `NOLOGIN` (§6-B).

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
   - → a **dedicated Postgres role `vector_agent`** that n8n uses through its Postgres node with fixed, parameterised queries (C3).
   - The new schema `vector_api` is **not** added to the API schemas. anon / authenticated cannot reach it over REST.
3. **What a fresh role can already do** (local catalog, 2026-10-03):
   - No table in any schema grants anything to PUBLIC.
   - Schema USAGE for PUBLIC exists only on `public`, `pg_catalog`, `information_schema`.
   - PUBLIC-executable functions in `public`: trigger functions, `get_my_role()` (returns NULL for the agent), and `generate_receipt_no` / `protect_approved_ticket` (trigger-only).
   - → a new role with no grants has **no write path into business tables**. The test proves it over the whole catalog (§6-A1).
4. **Caller check inside SECURITY DEFINER functions** (probed locally, rolled back):
   - In a definer function, `current_user` is the owner.
   - `session_user` is the login role in production, and `current_setting('role')` is the role after `SET ROLE` in tests.
   - → check `session_user = 'vector_agent' OR current_setting('role', true) = 'vector_agent'`.
5. **Roles are cluster-wide; `supabase db reset` recreates only the database.**
   - The role is therefore created with `IF NOT EXISTS`.
   - `postgres` is not a superuser and needs an explicit `GRANT vector_agent TO postgres` to `SET ROLE` in pgTAP.
6. **Compatibility evidence already supports the needed confidence levels.**
   - `record_compatibility_result(…, p_kind …)` with `DOCUMENT` → `documented` and `INFERENCE` → `inferred` (ADMIN check inside, Phase 3).
   - Approval calls it unchanged with only those two kinds. `INSTALL` (→ verified) and `OVERRIDE` are impossible from a candidate (C8).
7. **`temp_file_limit` cannot be set by a migration** (probed 2026-10-04, rolled back):
   - it is a `superuser`-context parameter; `postgres` is not a superuser and has no `SET` privilege on it (`pg_parameter_acl` grants only `log_min_messages`);
   - both `ALTER ROLE … SET temp_file_limit` and a function-level `SET temp_file_limit` fail with "permission denied to set parameter".
   - → conflicts with C2 → **open decision O1** (§12). The other role settings (`statement_timeout`, `idle_in_transaction_session_timeout`, `search_path`) are user-context and work.
8. **Search ordering (C13):** `search_parts_for_device` ranks 1 = verified compatible/conditional, 2 = documented, **3 = everything else**
   (inferred, incompatible and unproven candidates together). The wrapper therefore sorts itself and splits `incompatible` out (§3.3).
9. **Free text that reaches VECTOR (C5)** — staff-written columns returned by §3.3:
   `repair_records.diagnosis_summary`, `repair_faults.description`, `repair_actions.description`, `repair_measurements.note` and `.value_text`,
   `model_notes.body`, and `limitation_note` (from compatibility evidence, via the search functions).
   The ticket's customer name is `customers.name` via `repair_tickets.customer_id`.

## 3. Schema — one migration `supabase/migrations/<UTC ts>_vector_integration.sql`

### 3.1 Role and schema (C2, C7, C11)

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vector_agent') THEN
    CREATE ROLE vector_agent NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;
  END IF;
END $$;
ALTER ROLE vector_agent NOLOGIN CONNECTION LIMIT 3;              -- also when the role already existed
GRANT vector_agent TO postgres;                                  -- pgTAP needs SET ROLE (finding 5)
ALTER ROLE vector_agent SET search_path = vector_api;            -- C2 "vector_api 고정" (pg_catalog is always searched implicitly)
ALTER ROLE vector_agent SET statement_timeout = '5s';            -- C2, C7
ALTER ROLE vector_agent SET idle_in_transaction_session_timeout = '10s';  -- C2
-- temp_file_limit: see O1 (§12) — a migration cannot set it (finding 7)
CREATE SCHEMA vector_api;
REVOKE ALL ON SCHEMA vector_api FROM PUBLIC;
GRANT USAGE ON SCHEMA vector_api TO vector_agent;
```

- The migration creates the role **NOLOGIN, with no password** (C2, C10).
- In production Brad enables it himself (SQL with an empty password placeholder in `phase-8-report.md` and `vector-integration.md`, C10).
- The role gets **no table, sequence or `public` function grants**.
- "고정" means the role default. A raw SQL session could still `SET search_path`, but every `vector_api` function has its own fixed `search_path`, so this changes nothing.
- C11: temporary tables / large objects (PUBLIC defaults) are **not** changed database-wide; documented and accepted.
  Role-level limits: connection limit 3, 5 s statement timeout, 10 s idle-in-transaction, plus `temp_file_limit` per O1.

### 3.2 New table `public.ai_candidates` (C4, C7, C8)

| Column | Definition |
| --- | --- |
| `id` | uuid PK |
| `candidate_type` | text NOT NULL CHECK IN (`COMPATIBILITY`, `PART_ALIAS`) (C4) |
| `source` | text NOT NULL DEFAULT `'VECTOR'` CHECK IN (`VECTOR`) (Phase 9 adds its own value in its own plan) |
| `part_spec_id` | uuid NOT NULL → `part_specs` **ON DELETE CASCADE** |
| `target_type` | text CHECK IN (`MODEL`, `VARIANT`, `BOARD`) — COMPATIBILITY only |
| `model_id` / `variant_id` / `board_id` | uuid → `catalog_models` / `catalog_variants` / `catalog_boards`, CASCADE. Exactly one for COMPATIBILITY, none for PART_ALIAS (CHECK) |
| `observed_status` | text CHECK IN (`compatible`, `conditional`, `incompatible`). Required for COMPATIBILITY. `conditional` requires `limitation_note` |
| `limitation_note` | text ≤ 300 |
| `reference` | text ≤ 500 — document name or URL VECTOR relied on (internet info must carry its URL, C14) |
| `alias` / `alias_type` | text ≤ 150 / CHECK IN (`PART_NUMBER`, `MARKING`, `OTHER`). Required for PART_ALIAS |
| `rationale` | text ≤ 2000 — VECTOR's explanation (shown to the reviewer, never copied into knowledge as fact) |
| `source_ref` | text ≤ 200 — VECTOR conversation / n8n execution id (links to the n8n execution history, C12) |
| `status` | text NOT NULL DEFAULT `PENDING` CHECK IN (`PENDING`, `APPROVED`, `REJECTED`) |
| `approved_as` | text CHECK IN (`DOCUMENT`, `INFERENCE`) — COMPATIBILITY only, set on approval. No other value possible (C8) |
| `result_evidence_id` | uuid → `compatibility_evidence` RESTRICT |
| `result_alias_id` | uuid → `part_number_aliases` SET NULL |
| `reviewed_by` | uuid → employees SET NULL — **set on approve and reject** (C8) |
| `reviewed_at` | timestamptz — **set on approve and reject** (C8). CHECK: `status = 'PENDING'` ⇔ `reviewed_by/at` NULL |
| `review_note` | text ≤ 500; required for REJECTED (C8) |
| `created_at` | timestamptz |

- Partial unique index for dedup on PENDING identical proposals: (type, spec, target / alias_norm, observed_status) (C7).
- FK indexes on all reference columns.
- RLS on. SELECT for **ADMIN only**. No INSERT / UPDATE / DELETE policy: writes happen only through the RPCs below.
- `anon` and `authenticated` revoked except SELECT for `authenticated`, which RLS limits to ADMIN.
- `vector_agent` has **no** grant on this table either. It inserts only through `vector_api.propose_*`.
- **Candidate content is immutable (C8):** a BEFORE UPDATE trigger `ai_candidates_protect` (new function, guard-free trigger per R10)
  refuses any change to the proposal columns (`candidate_type` … `source_ref`, `created_at`) and allows only the
  `PENDING → APPROVED/REJECTED` transition with the review columns. Raises "AI 후보 내용은 수정할 수 없습니다.".

### 3.3 Agent read functions — schema `vector_api` (C5, C6, C13)

All functions:
- SECURITY DEFINER, `SET search_path = public, extensions`, STABLE.
- Start with the caller check (finding 4) → `RAISE EXCEPTION 'VECTOR 전용 함수입니다.'`.
- `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`, then `GRANT EXECUTE … TO vector_agent` only (C0: non-exposed schema, R10 exception).
- Return `jsonb`.
- **Never include (C6):** prices (`base_estimate`, `final_price`, `refunded_amount`, `material_cost*`, `override_unit_price`, release price, evaluated value),
  customer columns, `symptoms`, `device_model` / `tag_info` free text, `repair_records.notes`, employee names / ids, label codes, storage locations.
  Tickets appear by **`receipt_no`** (C6).
- **Every free-text value passes through `vector_api.mask_text(text, customer_name)` before it is put into the JSON (C5)** — see below.

| Function | Returns |
| --- | --- |
| `find_devices(p_query text, p_limit int DEFAULT 10)` | models / variants (`catalog_search_models`) and boards (`catalog_search_boards`) with ids, names, match score. Limit ≤ 30 |
| `find_parts(p_query text, p_limit int DEFAULT 10)` | part specs by name / part number / chip marking (`part_spec_search`) + their aliases. Limit ≤ 30 |
| `parts_for_device(p_model_id, p_variant_id, p_board_id)` | `{compatible: [...], incompatible: [...]}` from `search_parts_for_device` (C13). Each row: spec, target, `status`, `confidence`, `limitation_note` (masked), **evidence counts** `install_ok` (성공) / `install_conditional` (조건부) / `install_incompatible` (실패) and `document_count`, `is_candidate`, `stock_qty`, `donor_qty`. `compatible` = status ≠ `incompatible`, sorted **verified → documented → inferred → other**, then in stock, then donor available, then name. `incompatible` = status `incompatible`, same keys, separate list |
| `devices_for_part(p_part_spec_id)` | same shape and ordering from `search_devices_for_part` (C13) |
| `part_stock(p_part_spec_id)` | **stock quantity by condition** (NEW / USED) for rows linked to the spec, 외주 excluded (Q5); **donor numbers** (`donor_no`) of available donor candidates of that spec. Nothing else — no donor status, prices, labels or locations (C6) |
| `device_cases(p_model_id, p_variant_id, p_board_id, p_limit int DEFAULT 10)` | model / board label, linked boards; totals by result / status; up to 20 recent non-test cases (incl. open and canceled, like Phase 5 decision 8). Each case: **`receipt_no`**, status, received / completed month, result, fault_category, symptom code names, `diagnosis_summary` (masked), faults (component, fault_type, description masked), measurements (label, kind, value, unit, value_text masked, judgement, note masked), actions (type, description masked, succeeded), parts used (category / spec / product / capacity / qty, 외주 excluded). Model notes: type + body (masked, no author). Per-case `EXCEPTION` skip like Phase 5 |

**Masking helper `vector_api.mask_text(p_text text, p_customer_name text DEFAULT NULL) RETURNS text`** (C5):
- IMMUTABLE, SECURITY INVOKER, fixed `search_path`. **Not** granted to `vector_agent` or any API role — only the owner calls it, from inside the definer functions.
- Order of replacement (longer patterns first so a phone pattern cannot eat part of a card / RRN), each with digit boundaries `(?<!\d)…(?!\d)`:
  1. card number form: 16 digits in groups of 4 (`-`, space or none), and 15-digit 4-6-5 → `[마스킹]`;
  2. RRN form: 6 digits, optional `-` / space, then `[1-8]` + 6 digits → `[마스킹]`;
  3. phone: Korean mobile / landline `0\d{1,2}[-. ]?\d{3,4}[-. ]?\d{4}`, and `+82` forms → `[마스킹]`;
  4. e-mail `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` → `[마스킹]`;
  5. customer name: when `p_customer_name` (trimmed) has ≥ 2 characters, every case-insensitive literal occurrence (regex-escaped), and the same name with spaces removed → `[고객]`.
- Customer name source: the case's own ticket (`repair_tickets.customer_id → customers.name`). Model notes have no ticket → patterns only.
- NULL in → NULL out.

### 3.4 Agent write functions — schema `vector_api` (the only write path; C4, C7)

| Function | Behaviour |
| --- | --- |
| `propose_compatibility(p_part_spec_id, p_target_type, p_target_id, p_observed_status, p_limitation_note, p_reference, p_rationale, p_source_ref)` | Validates the spec, the target and its type against `part_specs.compat_target`, the status, the conditional note and the text lengths. Refuses when ≥ **500** PENDING candidates exist (C7). A duplicate PENDING proposal returns the existing id with `duplicate: true` (C7). Otherwise inserts one PENDING row. Returns `{candidate_id, status, duplicate}` or `{error: '<Korean message>'}` |
| `propose_part_alias(p_part_spec_id, p_alias, p_alias_type, p_rationale, p_source_ref)` | Same pattern. An alias already registered for the spec → `{error: '이미 등록된 별칭입니다.'}` |

### 3.5 Admin review functions — schema `public` (C0, C8)

SECURITY DEFINER, `search_path = public`. First statement `PERFORM public.ri_api_guard_definer('{anon}');`, then the ADMIN check.
`GRANT EXECUTE … TO anon, authenticated, service_role` (R10, C0); `REVOKE ALL … FROM PUBLIC`.

| Function | Behaviour (one transaction, candidate row locked `FOR UPDATE`, must be PENDING) |
| --- | --- |
| `ai_candidate_approve(p_candidate_id uuid, p_approve_as text DEFAULT NULL, p_reference text DEFAULT NULL, p_note text DEFAULT NULL) RETURNS jsonb` | **COMPATIBILITY:** `p_approve_as` must be `DOCUMENT` ("문서 근거로 승인") or `INFERENCE` ("추정으로 승인") — anything else refused. `DOCUMENT` needs a reference: the admin's `p_reference`, else the candidate's; none → "문서 근거로 승인하려면 출처를 입력해 주세요.". Calls the existing **`record_compatibility_result`**(spec, target_type, target_id, p_approve_as, observed_status, limitation_note, reference, 'AI 후보(VECTOR) 승인' + admin note) → evidence `created_by` = the admin. Stores `result_evidence_id`, `approved_as`. **PART_ALIAS:** inserts into `part_number_aliases` (`created_by` = admin), stores `result_alias_id`. Then status APPROVED, **`reviewed_by` = admin, `reviewed_at` = now()**. The admin's reference goes to the evidence row only; the candidate's proposal columns are never changed (C8). Already-reviewed → "이미 처리된 후보입니다." |
| `ai_candidate_reject(p_candidate_id uuid, p_reason text) RETURNS jsonb` | Reason required ("반려 사유를 입력해 주세요."). Status REJECTED, `review_note`, **`reviewed_by`, `reviewed_at`** |

Errors are `RAISE EXCEPTION` with Korean messages, like the Phase 3 RPCs. The whole call rolls back.
No path produces `INSTALL` / `OVERRIDE` evidence, so no candidate can make knowledge `verified` (C8, P4).

### 3.6 Existing objects

**None changed.** No existing table, column, trigger, function, policy, view or grant is altered.
`record_compatibility_result`, the search functions and `part_number_aliases` are only called or inserted into.
`supabase/config.toml` (API schemas) is unchanged.

## 4. Application and documents (UI Korean; new components < 200 lines; optimistic with rollback — R5)

Before coding: read the relevant guides in `node_modules/next/dist/docs/` (server actions, route segments) per `AGENTS.md`.

### 4.1 New files

| File | Content |
| --- | --- |
| `src/app/(admin)/catalog/ai-candidates/page.tsx` | `requireAdminPage()` (C9). Loads candidates (session client, RLS = ADMIN) with spec name, target label and reviewer name. Filter `?status=PENDING\|APPROVED\|REJECTED` (default PENDING) |
| `.../ai-candidates/AiCandidateList.tsx` | status tabs with counts; empty state "검토할 AI 후보가 없습니다." |
| `.../ai-candidates/AiCandidateCard.tsx` | type badge (호환성 / 부품 별칭); spec → target; proposed status + limitation; reference (link if URL); rationale (collapsible, labelled "AI 설명 — 사실 확인 필요"); source ref; date; for reviewed ones **검토자 + 검토 시각** (C8). Buttons: "문서 근거로 승인" (reference required; input pre-filled from the candidate), "추정으로 승인", alias "승인", "반려" (reason). No edit controls (C8). Optimistic removal from the PENDING list with rollback + Korean error |
| `.../ai-candidates/actions.ts` | `approveAiCandidateAction`, `rejectAiCandidateAction` — **own login check** (`getCurrentEmployee`, "로그인이 필요합니다. 다시 로그인해 주세요.") + ADMIN check (KI-12 lesson), session client → RPCs; Korean validation before the call |
| `supabase/tests/vector_integration.test.sql`, `supabase/test-fixtures/phase8/rollback.sql` | pgTAP, rollback |
| `docs/repair-intelligence/vector-integration.md` | **for Brad (C14):** enabling the role in production (SQL, password placeholder empty — C10); n8n Postgres credential: **Session pooler, port 5432**, user `vector_agent.<project-ref>`, credential stored only in n8n (C3); **webhook secret-header authentication** VECTOR → n8n, per O2 (C3); each function with an example parameterised query and JSON shape; "never let the LLM write SQL — fixed queries only (KI-8)"; password rotation; kill switch `ALTER ROLE vector_agent NOLOGIN`; **n8n execution-history retention as the audit record** (`EXECUTIONS_DATA_SAVE_ON_SUCCESS` / `_ON_ERROR`, `EXECUTIONS_DATA_PRUNE`, `EXECUTIONS_DATA_MAX_AGE`, `EXECUTIONS_DATA_PRUNE_MAX_COUNT`; `source_ref` = execution id; note that execution data holds the masked results) (C12); residual capabilities temp tables / large objects, accepted (C11) |
| `docs/repair-intelligence/vector-agent-guide.md` | **for VECTOR's system prompt (C14):** lookup priority **내부 수리 사례 > verified 호환 > 재고 > Donor > documented > 인터넷 > AI 추론**; every answer names its evidence source and confidence; internet information only as an `ai_candidates` proposal with its source URL (`p_reference`); never state anything as verified unless the result says `verified`; `incompatible` list = do not recommend; `[마스킹]` / `[고객]` are redactions — never try to recover them; the function list with parameters, limits and error JSON |

### 4.2 Existing files changed

| File | Change |
| --- | --- |
| `src/app/(admin)/catalog/CatalogTabs.tsx` | tab "AI 후보" → `/catalog/ai-candidates` (+1 line, C9). `/catalog` is already ADMIN-only and in `ADMIN_PATHS` |
| `src/types/supabase.ts` | regenerated (`ai_candidates`, two public RPCs; `vector_api` is not generated because it is not an API schema) |
| docs | `02-roadmap.md` status, `04-final-release-plan.md` (Phase 8 migration row), `known-issues.md` KI-5 note, this plan's status, `phase-8-report.md` (incl. **production activation SQL with empty password and the n8n credential procedure**, C10) |

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
DROP FUNCTION IF EXISTS vector_api.mask_text(text, text);
-- (plus the private caller-check helper, if one is created)
DROP TABLE IF EXISTS public.ai_candidates;            -- drops its trigger
DROP FUNCTION IF EXISTS public.ai_candidates_protect();
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

1. **Write isolation — actual attempts (C15, acceptance).** As `SET ROLE vector_agent`:
   - for **every** table / view / matview in **every** schema: real `INSERT … DEFAULT VALUES`, `UPDATE … SET <first col> = <first col> WHERE false`,
     `DELETE … WHERE false`, `TRUNCATE` → each must fail with **42501** (privilege is checked before any constraint, so any other SQLSTATE fails the test).
     Includes `ai_candidates` itself;
   - for **every** sequence: real `nextval` and `setval` → 42501;
   - plus the catalog checks: `has_table_privilege` / `has_sequence_privilege` / `has_schema_privilege` CREATE / `has_database_privilege` CREATE all false;
   - SECURITY DEFINER functions it can execute = exactly the `vector_api` functions (without `mask_text`) + `get_my_role` + the two trigger functions (finding 3);
   - `propose_*` inserts exactly one `ai_candidates` row and touches no other table: row counts of all `public` tables before / after.
   - (`vector_agent` is not in `hint_roles`, so these privilege errors do not hit KI-8.)
2. **Agent cannot read business tables directly:** SELECT on `repair_tickets`, `customers`, `employees`, `inventory_items`, `ai_candidates` → 42501.
3. **Caller check:** every `vector_api` function refuses a non-agent caller (as postgres without SET ROLE) with "VECTOR 전용 함수입니다.".
   `authenticated` / anon / service_role have no EXECUTE — checked with `has_function_privilege` only, never called (KI-8).
4. **Role settings (C2):** `pg_roles` / `pg_db_role_setting`: `rolcanlogin = false`, `rolconnlimit = 3`, `statement_timeout=5s`,
   `idle_in_transaction_session_timeout=10s`, `search_path=vector_api`; `temp_file_limit` per O1.
5. **Read functions:**
   - fixture (models, boards, specs, aliases, evidence incl. verified / documented / inferred / incompatible, stock incl. 외주, donors,
     tickets with repair records, faults, measurements, model notes and customer data);
   - **C13:** `compatible` order verified → documented → inferred; `incompatible` only in its own list; counts `install_ok` / `install_conditional` / `install_incompatible` / `document_count` present;
   - partial / alias / marking input;
   - **C6:** no customer, price, employee, label or storage-location key or value in any JSON (whitelist style as Phase 5/6/7); `receipt_no` present; `part_stock` = quantities by condition + `donor_no` only;
   - test tickets excluded; 외주 excluded; `repair_records.notes` absent; limits capped.
6. **Masking (C5)** — `mask_text` directly (as owner) and end-to-end through `device_cases` / `parts_for_device`:

   | Input in free text | Expected |
   | --- | --- |
   | `010-1234-5678`, `01012345678`, `010 1234 5678`, `010.1234.5678`, `02-123-4567`, `031-1234-5678`, `+82 10-1234-5678`, `+821012345678` | `[마스킹]` |
   | `hong.gildong@example.com`, `a_b+c@mail.co.kr` | `[마스킹]` |
   | `900101-1234567`, `9001011234567`, `900101 2234567` | `[마스킹]` |
   | `1234-5678-9012-3456`, `1234 5678 9012 3456`, `1234567890123456`, `3782-822463-10005` | `[마스킹]` |
   | customer `홍길동` in `홍길동 고객님 요청으로 …`, `고객(홍 길동) …` | `홍길동` / `홍 길동` → `[고객]` |
   | another ticket's customer name in this case's text | unchanged (only the own ticket's name — documented limitation) |
   | one-character customer name | not replaced (≥ 2 characters rule) |
   | `19.5V`, `1.05V`, `3.3 Ω`, `2026-10-04`, `NM-A311`, `K4A8G165WC-BCTD`, `SN 5CG1234XYZ`, `220uF` | unchanged |
   | NULL, empty string | NULL, empty string |
   | several items in one text | all replaced, rest unchanged |

7. **Propose functions:** valid insert; every validation message; target type mismatch; dedup returns the same id; the 500-pending cap (C7); length limits; PART_ALIAS duplicate of an existing alias.
8. **Review functions (C8):**
   - ADMIN approves COMPATIBILITY as DOCUMENT → evidence `DOCUMENT`, row `documented`. As INFERENCE → `inferred`;
   - **never `verified`**: `p_approve_as` `INSTALL` / `OVERRIDE` / other → refused; after every test path, no evidence of kind `INSTALL` / `OVERRIDE` created by a candidate and no `verified` row that did not exist before;
   - DOCUMENT without any reference → refused;
   - PART_ALIAS → alias row with `created_by` = admin;
   - reject needs a reason; double review refused;
   - **`reviewed_by` = the admin and `reviewed_at` set** on approve and on reject;
   - **content immutable:** direct UPDATE of a proposal column (as postgres, bypassing RLS) → "AI 후보 내용은 수정할 수 없습니다.";
   - MANAGER / TECHNICIAN / RECEPTION / CS / EXPERT_REPAIR refused; anon → "로그인이 필요합니다. 다시 로그인해 주세요." (R10 guard);
   - atomicity: a forced failure in `record_compatibility_result` (e.g. target deleted) leaves the candidate PENDING and creates no evidence.
9. **RLS on `ai_candidates`:** ADMIN reads; the other 5 roles see 0 rows; nobody writes directly.
10. **Regression:** all 884 existing assertions pass (incl. the R10 invariant of `api_guard.test.sql`, which covers `ai_candidate_*`, C0).
    The md5 + ACL snapshot of every pre-existing function / view / policy / trigger / table ACL shows **additions only**.

### B. Real login path (local only, C15)

1. Temporarily `ALTER ROLE vector_agent LOGIN PASSWORD '<random local value>'`. The value stays in the scratchpad, never in the repo or chat.
2. Connect with `psql` as `vector_agent` on the local port and check:
   - `session_user`, `search_path`, `statement_timeout`, `idle_in_transaction_session_timeout` (and `temp_file_limit` per O1);
   - each read function returns data, masked;
   - `propose_compatibility` works;
   - direct `INSERT INTO public.repair_tickets …`, `UPDATE`, `DELETE`, `nextval` → permission denied;
   - `SELECT * FROM public.customers` → permission denied;
   - `SELECT pg_sleep(6)` → canceled by the 5 s timeout;
   - a 4th concurrent connection → refused (connection limit 3).
3. Then `ALTER ROLE vector_agent NOLOGIN PASSWORD NULL` and verify `rolcanlogin = false`.

### C. E2E UI (local stack, seed accounts, temporary `.env.development.local` — deleted afterwards)

1. Candidates are created by step B (2 compatibility, 1 alias).
2. ADMIN → 기기 마스터 → "AI 후보":
   - 3 pending;
   - "문서 근거로 승인" without a reference → Korean message;
   - with a reference → disappears, the 부품 규격 tab shows "문서 근거 1";
   - "추정으로 승인" → `inferred`;
   - alias approve → alias chip on the spec;
   - "반려" without a reason → message; with a reason → 반려 tab, showing reviewer and time.
3. Forced server error (candidate deleted in the DB meanwhile) → the card comes back with the error message.
4. MANAGER / TECHNICIAN → `/catalog/ai-candidates` → `/dashboard`. Apex → `/`.
5. Session expired (cookie deleted) → "로그인이 필요합니다. 다시 로그인해 주세요." on approve.

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
4. `vector-integration.md`, `vector-agent-guide.md`.
5. B (real login) + C (E2E).
6. Static checks, advisors, rollback rehearsal.
7. Report (incl. C10 production SQL and n8n credential procedure), docs, local commit.

Any conflict with the real schema or a step failing twice → STOP and ask (R8).

## 8. Risks

- **Direct DB credentials in n8n.** Whoever holds the `vector_agent` password and a raw SQL client can:
  - run the granted functions;
  - read system catalogs (schema metadata and function source — no business rows);
  - create **temporary tables** and **large objects** (PUBLIC defaults; accepted and documented, C11).

  No business table is readable or writable. Mitigations: connection limit 3, 5 s statement timeout, 10 s idle-in-transaction, `temp_file_limit` per O1,
  fixed queries in n8n, credential only in n8n (C3), rotation and `NOLOGIN` as the kill switch.
- **Masking is pattern-based (C5).** It can miss PII written in unusual forms (e.g. a phone number split by words, another customer's name,
  an address) and can over-mask number sequences that look like phone / RRN / card numbers (e.g. a 13-digit serial). Over-masking is the safe direction.
  Staff-written free text still leaves the company if VECTOR uses an external LLM.
- **KI-8:** if n8n (or a person) calls a function the role cannot execute — `vector_agent` is not in `hint_roles`, so no crash; the workflow should still use only the documented calls.
- **Approval quality:** an approved INFERENCE / DOCUMENT row looks like any other evidence. Provenance is the evidence note "AI 후보(VECTOR) 승인" and `ai_candidates.result_evidence_id`. The reviewer must check the reference.
- **Audit trail lives in n8n (C12):** if n8n prunes executions or is reinstalled, call history is lost. Retention settings are documented.
- **Webhook authentication (C3)** is configured in n8n, outside this repo; see O2.
- **Production starts with little knowledge** (as Phases 3/5): VECTOR's answers will often be "no data" at first.
- `GRANT vector_agent TO postgres` lets the `postgres` role act as the agent. It is already more privileged, so there is no escalation.
- Deploy order for Brad: after 0.5 → … → 7 → 0.6b. **Migration first** (role NOLOGIN — nothing can connect yet), **then the app**, then `ALTER ROLE … LOGIN PASSWORD` and the n8n workflow (C10).

## 9. Out of scope

- Building the n8n workflow or VECTOR itself (Brad; the docs describe the calls and the webhook auth).
- Photo / vision candidates (Phase 9).
- Similar-case scoring (Phase 10).
- Candidate types other than C4.
- Editing a candidate before approval (C8: reject + manual entry instead).
- Notifications for new candidates.
- A DB call-log table (C12: n8n execution history instead).
- Database-wide changes for temp tables / large objects (C11).
- KI-7, KI-9, KI-10, KI-11, KI-12 (Phase 0.6.1).

## 10. Files

| New | Changed |
| --- | --- |
| 1 migration; `supabase/tests/vector_integration.test.sql`; `supabase/test-fixtures/phase8/rollback.sql`; 4 UI files under `catalog/ai-candidates/`; `docs/repair-intelligence/vector-integration.md`; `docs/repair-intelligence/vector-agent-guide.md`; `phases/phase-8-report.md` | `CatalogTabs.tsx`, `src/types/supabase.ts`, roadmap / final-release plan / known-issues / this plan |

## 11. Decisions from the 2026-10-03 plan — resolved

| # | Question | Resolution |
| --- | --- | --- |
| 1 | Dev target | local (C1) |
| 2 | Access path | dedicated role + `vector_api` + n8n Postgres node (C3) |
| 3 | Candidate types | COMPATIBILITY + PART_ALIAS (C4) |
| 4 | Free text to VECTOR | included, **masked** (C5) |
| 5 | `receipt_no` in results | yes (C6) |
| 6 | Stock | quantities by condition + donor numbers only (C6) |
| 7 | Limits | 500 pending, dedup, 3 connections, 5 s (C7) |
| 8 | Approval | documented (reference) / inferred / reject (reason); no edit; never verified; reviewer + time (C8) |
| 9 | UI | "AI 후보" tab in 기기 마스터, ADMIN only (C9) |
| 10 | Password | Brad sets it; SQL with empty placeholder in the report (C10) |
| 11 | Residual capabilities | documented and accepted; role-level limits (C11) |
| 12 | Read logging | no table; n8n execution history documented (C12) |

## 12. Open decisions (new, from the 2026-10-04 check)

**O1. `temp_file_limit` (C2) cannot be set by a migration** (finding 7: superuser-only parameter; `postgres` is not a superuser locally, and production is the same Supabase setup — not queried).
- **(a) Recommended:**
  - the migration does not set it;
  - the limit is documented in `vector-integration.md` as a one-line SQL for whoever has superuser rights (Supabase support / a future dashboard option): `ALTER ROLE vector_agent SET temp_file_limit = '10MB';`;
  - locally it is applied once through `supabase_admin` in a test fixture, and the B tests verify it;
  - until it is set in production, the 5 s statement timeout and the bounded function outputs (≤ 30 rows, ≤ 20 cases) limit temp-file use.
- (b) The migration tries it in a `DO` block and only raises a NOTICE when not permitted. The result would silently differ between environments — not recommended.
- Also needed: the value. Proposal **10MB** (the functions sort at most a few hundred rows).

**O2. Webhook rejection code (C3: missing / wrong secret → 401).** The n8n docs list Header Auth as a webhook authentication method but do not state the rejection status.
As far as I know from n8n's source, the built-in Header Auth answers **403**; this is not verified (no local n8n).
- **(a) Recommended (guarantees 401):**
  - Webhook node with "Respond: Using 'Respond to Webhook' node";
  - the first node compares the header (e.g. `X-Vector-Secret`) with the secret, taken from an n8n credential or variable;
  - on mismatch, "Respond to Webhook" returns 401 and the workflow stops before any Postgres node.
- (b) Built-in Header Auth (simpler; the secret sits in a credential), accepting 403 if that is what n8n returns. Brad checks the code once.

## 13. Approval conditions → plan sections (checklist)

| Condition | Reflected in |
| --- | --- |
| C0 KI-8 resolved; `vector_api` R10 exception; `ai_candidate_*` R10 | 승인 조건, Amendment, §0, §3.3 (grants), §3.5, §6-A3, §6-A10 |
| C1 local | §0 |
| C2 role limits | §3.1, §6-A4, §6-B2, finding 7 — **`temp_file_limit` → O1** |
| C3 n8n session pooler 5432, credential only in n8n, webhook secret header 401, documented | §4.1 `vector-integration.md`, §8 — **401 → O2** |
| C4 two candidate types | §3.2, §3.4 |
| C5 masking + tests | finding 9, §3.3 (`mask_text`), §6-A6 (cases), §8 |
| C6 `receipt_no`; stock = quantities + donor numbers; exclusions | §3.3, §6-A5 |
| C7 500 / dedup / 3 connections / 5 s | §3.1, §3.2, §3.4, §6-A7, §6-B2 |
| C8 approval modes, no edit, never verified, reviewer + time, `record_compatibility_result` | §3.2 (immutability trigger, review columns), §3.5, §4.1 card, §6-A8 |
| C9 "AI 후보" tab, ADMIN | §4.1 page, §4.2 `CatalogTabs`, §6-C4 |
| C10 Brad sets the password; activation SQL + n8n credential procedure in the report | §3.1, §4.1, §4.2 (report), §7-7, §8 |
| C11 document and accept; role-level limits | §3.1, §4.1 doc, §8, §9 |
| C12 no log table; n8n execution history documented | §3.2 `source_ref`, §4.1 doc, §8, §9 |
| C13 status, confidence, counts; order; incompatible separate | finding 8, §3.3, §6-A5 |
| C14 two documents | §4.1, §7-4, §10 |
| C15 actual write attempts; real login then NOLOGIN | §1, §6-A1, §6-B |
