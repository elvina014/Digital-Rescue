# VECTOR integration — setup and operation (for Brad)

Phase 8 (`phases/phase-8-plan.md`, `phases/phase-8-report.md`). This document is for **people**.
The instructions for VECTOR itself (system prompt) are in `vector-agent-guide.md` (C14).

```
VECTOR ──(HTTPS + secret header, n8n Header Auth)──▶ n8n webhook ──(Postgres node, fixed parameterised queries)──▶ Supabase Postgres
                                                     login role vector_agent → vector_api.* functions only
```

- `vector_agent` is a dedicated Postgres login role. It can only run the 8 `vector_api` functions:
  - 6 read functions;
  - 2 propose functions, which write into `public.ai_candidates`.
- It has no table, sequence or other function grants.
- `vector_api` is **not** an API schema, so nothing about it is reachable over REST / PostgREST.
- Proposals are reviewed by an ADMIN in 기기 마스터 → **AI 후보** (`/catalog/ai-candidates`). Approval creates `documented` / `inferred` knowledge only — never `verified`.
- Never give VECTOR or n8n the `service_role` key, and never reuse the `/api/inventory/webhook` key (P8).

## 1. Production activation (Brad, after the release migrations)

Order (`04-final-release-plan.md`):
1. migration `20261004090000_vector_integration.sql` (the role is created **NOLOGIN** — nothing can connect yet);
2. app deploy;
3. the SQL below;
4. n8n credential;
5. n8n workflow.

Run in the Supabase SQL Editor as `postgres`. **Do not** use "Run as role" (KI-8 §8.4 until the release with Phase 0.6 is in production).

```sql
-- 1) enable login. Generate a long random password (e.g. 40+ characters) and type it ONLY here and in the n8n credential.
ALTER ROLE vector_agent LOGIN PASSWORD '';      -- ← password between the quotes; never commit or paste it anywhere else

-- 2) check the role defaults set by the migration
SELECT rolcanlogin, rolconnlimit, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'vector_agent';
--    expected: true | 3 | false | false
SELECT setconfig FROM pg_db_role_setting WHERE setrole = 'vector_agent'::regrole;
--    expected: {search_path=vector_api,statement_timeout=5s,idle_in_transaction_session_timeout=10s}
```

### temp_file_limit (C2, decision O1)

`temp_file_limit` is a **superuser-only** parameter. `postgres` is not a superuser on Supabase, so neither the migration nor the SQL Editor can set it ("permission denied to set parameter").
- Ask Supabase support to run, as a superuser:
  ```sql
  ALTER ROLE vector_agent SET temp_file_limit = '10MB';
  ```
- Until it is set:
  - the 5 s statement timeout limits how long a query can write temp files;
  - the functions return bounded results (≤ 30 search hits, ≤ 20 cases).
- Locally it is applied by `supabase/test-fixtures/phase8/temp_file_limit.sql`.

## 2. n8n Postgres credential (C3)

Create a **Postgres** credential in n8n. The connection data is stored **only** in this n8n credential — not in the repo, not in VECTOR, not in chat.

| Field | Value |
| --- | --- |
| Host | Supabase dashboard → Connect → **Session pooler** host (`aws-0-<region>.pooler.supabase.com`) |
| Port | **5432** (session mode) |
| Database | `postgres` |
| User | `vector_agent.<project-ref>` (Supavisor needs the project ref after the role name) |
| Password | the password from §1 |
| SSL | require |
| Max connections (if the node offers it) | ≤ 3 — the role allows 3 connections; a 4th is refused with "too many connections for role" |

## 3. Webhook authentication: VECTOR → n8n (C3, decision O2 — revised 2026-10-04)

Use the **built-in authentication of the n8n Webhook node** with a **Header Auth** credential. n8n checks the header **before** the workflow runs, so an unauthenticated call never reaches a Postgres node.

1. n8n → Credentials → **Header Auth**:
   - Name: `X-Vector-Secret`;
   - Value: a random secret, 32+ characters.

   The secret is stored **only** in this n8n credential (not in the workflow, the repo or chat).
2. **Webhook** node:
   - Method `POST`;
   - Authentication **Header Auth**;
   - Credential = the one from step 1.
3. VECTOR sends `X-Vector-Secret: <secret>` on every call. Rotate it like the DB password (§6): new value in the credential and in VECTOR at the same time.
4. Test once after setup and note the codes:
   - without the header → refused;
   - wrong value → refused;
   - correct value → 200.

**Status code (C3 requires 401):**
- The n8n documentation lists Header Auth but does not state the rejection status.
- From n8n's source it is likely **403** for a wrong value; the code for a missing header may differ. This is not verified here (no n8n in this repo).
- Check it in the test above:
  - if n8n answers 401 for both cases → done;
  - if it answers 403 → the call is still refused and the workflow does not run. Brad decides whether 403 is acceptable, or uses the alternative below.

**Alternative (only if exactly 401 is required):** check the header inside the workflow.
1. Webhook node:
   - Authentication **None**;
   - Respond **"Using 'Respond to Webhook' Node"**.
2. The first node is an **IF** node: `{{ $json.headers['x-vector-secret'] }}` equals the secret. Read the secret from an n8n variable `{{ $vars.VECTOR_WEBHOOK_SECRET }}`, or from an environment variable `{{ $env.VECTOR_WEBHOOK_SECRET }}` (requires `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`).
3. false → **Respond to Webhook**, code **401**, body `{"error":"unauthorized"}`. Nothing else runs.
4. true → the Postgres nodes.

Drawbacks of the alternative:
- the workflow itself starts for unauthenticated calls, so they appear in the execution history;
- the secret is outside a credential;
- the comparison is in workflow logic that can be edited by mistake.

## 4. The functions (fixed, parameterised queries only)

**Never let the LLM write SQL.**
- Each n8n Postgres node uses exactly one of the queries below, with **Options → Query Parameters**. n8n binds the values to `$1`, `$2`, …
- Never interpolate `{{ }}` into the query text.
- Calling anything else fails with "permission denied" and gains nothing.
- (`vector_agent` is not a `supautils` hint role, so such an error does not crash the server — KI-8 §8.1.)

All functions return one `jsonb` value (column `result`). Input errors come back as `{"error": "<한국어 메시지>"}`, not as SQL errors.

| Query (Postgres node → Execute Query) | Query Parameters (example) | Returns |
| --- | --- | --- |
| `SELECT vector_api.find_devices($1, $2) AS result` | `{{ $json.body.query }}, 10` | `{models:[{model_id, variant_id, brand, model, variant, score}], boards:[{board_id, board_number, manufacturer, score}]}` (limit ≤ 30) |
| `SELECT vector_api.find_parts($1, $2) AS result` | `{{ $json.body.query }}, 10` | `{parts:[{part_spec_id, part_type, name, manufacturer, compat_target, matched, score, aliases:[{alias, alias_type}]}]}` |
| `SELECT vector_api.parts_for_device($1::uuid, $2::uuid, $3::uuid) AS result` | model id, variant id, board id (empty → NULL) | `{compatible:[…], incompatible:[…]}` (see below) |
| `SELECT vector_api.devices_for_part($1::uuid) AS result` | part spec id | `{compatible:[…], incompatible:[…]}` |
| `SELECT vector_api.part_stock($1::uuid) AS result` | part spec id | `{part_spec_id, part_type, name, stock:{NEW, USED}, donor_numbers:["D-0001"]}` |
| `SELECT vector_api.device_cases($1::uuid, $2::uuid, $3::uuid, $4) AS result` | model, variant, board, 10 | `{label, boards, model_notes:[{note_type, body, is_pinned, target_label}], cases:{total, by_result, by_status, recent:[…], skipped}}` (recent ≤ 20) |
| `SELECT vector_api.propose_compatibility($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8) AS result` | spec, `MODEL`/`VARIANT`/`BOARD`, target id, `compatible`/`conditional`/`incompatible`, limitation, reference (URL / document), rationale, n8n execution id `{{ $execution.id }}` | `{candidate_id, status:"PENDING", duplicate}` or `{error}` |
| `SELECT vector_api.propose_part_alias($1::uuid, $2, $3, $4, $5) AS result` | spec, alias, `PART_NUMBER`/`MARKING`/`OTHER`, rationale, `{{ $execution.id }}` | same |

The compatibility row (`parts_for_device`, `devices_for_part`) contains:
- `part_spec_id`, `part_type`, `part_name`, `manufacturer`;
- `target_type`, `target_id`, `target_label` (`linked_models` for boards);
- `status`, `confidence`, `limitation_note`;
- `evidence: {install_ok, install_conditional, install_incompatible, document_count}`, i.e. success / conditional / failure counts and the number of documents;
- `is_candidate`;
- for `parts_for_device` also `stock_qty`, `donor_qty`.

`compatible` is sorted **verified → documented → inferred**, then in stock, then donor available. `incompatible` is a separate list (C13).

What never appears (C5, C6):
- prices;
- customer data;
- employee names / ids;
- label codes, storage locations;
- `repair_records.notes`, ticket symptoms text, device model / tag free text.

Free text (diagnosis summary, fault / action descriptions, measurement notes, model notes, limitation notes) is masked **before** it leaves the database:
- phone numbers, e-mails, resident-number and card-number forms → `[마스킹]`;
- the case's own customer name → `[고객]`.

Masking is pattern-based (see the report's risks).

Limits (C7):
- at most **500** PENDING candidates (further proposals get an `error`);
- an identical PENDING proposal returns the existing id with `duplicate: true`;
- **3** connections;
- **5 s** per statement;
- 10 s idle in transaction.

## 5. Audit record = n8n execution history (C12)

There is no call-log table in the database. The audit trail is n8n's execution history, so configure it to be kept. Self-hosted n8n environment variables:

```sh
EXECUTIONS_DATA_SAVE_ON_SUCCESS=all          # keep successful runs (default may be "none" in tuned setups)
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=true
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=2160                 # hours → 90 days (choose the retention period)
EXECUTIONS_DATA_PRUNE_MAX_COUNT=0            # 0 = no count limit (age only)
```

- In the workflow settings, "Save successful production executions" must not be turned off.
- Pass `{{ $execution.id }}` as `p_source_ref` in the propose calls. The 기기 마스터 → AI 후보 card shows it as "실행 ID", so every candidate links back to the n8n run that produced it.
- Execution data contains the (masked) results; treat the n8n instance as internal data.
- If n8n is reinstalled or its database is lost, the history is gone (accepted, C12).

## 6. Rotation and kill switch

- **Rotate** (e.g. quarterly, or when someone with access leaves):
  1. `ALTER ROLE vector_agent PASSWORD '…'` (new value);
  2. update the n8n Postgres credential;
  3. rotate the webhook secret in the n8n Header Auth credential and in VECTOR at the same time.
- **Kill switch:**
  ```sql
  ALTER ROLE vector_agent NOLOGIN;
  ```
  New connections are refused immediately. To end open sessions too:
  ```sql
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'vector_agent';
  ```
- **Remove completely:** `supabase/test-fixtures/phase8/rollback.sql` (app revert first). Knowledge already approved stays.

## 7. Accepted residual capabilities (C11)

Anyone holding the `vector_agent` password and a raw SQL client (not the n8n workflow) can still:
- run the 8 functions;
- read system catalogs (schema metadata, function source — no business rows);
- create **temporary tables** and **large objects** (PostgreSQL PUBLIC defaults; changing them would alter database-wide grants — not done, C11);
- change **its own session settings**, including `SET statement_timeout = 0`. The 5 s / 10 s values are role defaults and a session can override them. `temp_file_limit`, once set by a superuser, can **not** be overridden (superuser-only parameter).

It cannot read or write any business table or sequence (verified by actual attempts, `vector_integration.test.sql` §3 and the real-login test in the report). Keep the password only in the n8n credential.
