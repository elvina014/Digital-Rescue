# n8n workflows in this repository

Importable n8n workflow files. **Claude never changes the live n8n**; Brad imports these himself.

| File | Purpose | Phase |
| --- | --- | --- |
| `ri-photo-recognition.workflow.json` | AI 사진 인식: photo → OpenRouter vision → readings (JSON). **Its own new workflow** (decision D8). The existing device-label workflow is not changed | 9 |

## RI 사진 인식 (`ri-photo-recognition.workflow.json`)

```
app (server action, login + role check)
  ──POST {request_id, photo_kind, target_label, image(data URL, WebP, EXIF removed)}  + header X-RI-Secret──▶ n8n Webhook (Header Auth)
  ──▶ Code "요청 구성" ──▶ HTTP Request "OpenRouter" (existing OpenRouter credential) ──▶ Code "응답 검증" ──▶ 200 {readings, model, execution_id}
app ──▶ ai_photo_propose (DB) ──▶ ai_candidates (검토 대기). n8n never connects to the database.
```

### 1. Placeholders to fill (Q1 — no guessed values in the repo)

The file contains five placeholders. Fill them **in n8n after the import** (do not commit real values):

| Placeholder | Where | What to put |
| --- | --- | --- |
| `<<OPENROUTER_MODEL_ID>>` | Code node **요청 구성**, first line `const MODEL = '…'` | the OpenRouter model id used by the **existing device-label workflow** (the one behind `N8N_DEVICE_WEBHOOK_URL`). Open that workflow → its OpenRouter node → copy the `model` value exactly (e.g. the form `vendor/model-name`) |
| `<<OPENROUTER_CREDENTIAL_ID>>` / `<<OPENROUTER_CREDENTIAL_NAME>>` | HTTP Request node **OpenRouter** → Credential | n8n marks it as missing after import. Select the **same** OpenRouter credential the device-label workflow uses |
| `<<RI_PHOTO_HEADER_AUTH_CREDENTIAL_ID>>` / `<<RI_PHOTO_HEADER_AUTH_CREDENTIAL_NAME>>` | **Webhook** node → Credential for Header Auth | create a **new** Header Auth credential (step 2) and select it |

The HTTP node is set to *Generic Credential Type → Header Auth* (`Authorization: Bearer <key>`).
If the existing OpenRouter credential is of another type (e.g. the "OpenRouter" credential type), change the node's **Authentication** to *Predefined Credential Type → OpenRouter* and select it. Do not copy the API key into the workflow.

How to find the model id without guessing: in the device-label workflow, open the node that calls OpenRouter (HTTP Request with URL `openrouter.ai/api/v1/chat/completions`, or an OpenRouter chat-model node) and read its `model` field. Brad confirms the value; it is not stored in this repo.

### 2. Import steps (Brad)

1. n8n → Workflows → **Import from File** → `ri-photo-recognition.workflow.json`. It arrives **inactive**.
2. Credentials → **New → Header Auth**: Name `X-RI-Secret`, Value = a new random secret (32+ characters). Keep it only in this credential and in the app environment (step 5).
3. Fill the placeholders (§1).
4. Workflow **Settings** (already set by the file, check them — these apply to **this workflow only**, D7):
   - Save successful production executions: **Do not save** (`saveDataSuccessExecution: none`) — the request contains the photo;
   - Save failed production executions: **Save** (`saveDataErrorExecution: all`);
   - Save manual executions: **off**.
   The instance-wide settings (`EXECUTIONS_DATA_*`) are **not** changed. The VECTOR workflow keeps its execution history as the audit record (Phase 8 C12).
5. App environment (production host only, not in the repo):
   ```
   N8N_RI_PHOTO_WEBHOOK_URL=https://<n8n host>/webhook/ri-photo-recognition
   N8N_RI_PHOTO_SECRET=<the Header Auth value from step 2>
   ```
   Without both variables the page answers "AI 사진 인식이 설정되지 않았습니다."
6. Activate the workflow. Test as in `docs/repair-intelligence/04-final-release-plan.md` §7.

### 3. Contract

Request (from the app):

```json
{ "request_id": "uuid", "photo_kind": "PART | BOARD | DEVICE", "target_label": "BQ24780S", "image": "data:image/webp;base64,…" }
```

No customer, ticket or employee data is sent — only the kind, the chosen part / board / model label and the image.

Responses:

| Status | Body | App shows |
| --- | --- | --- |
| 200 | `{"readings":[{"text","type","confidence","note"}], "model", "execution_id"}` (≤ 10 readings; type `PART_NUMBER / MARKING / BOARD_NUMBER / MODEL_NUMBER / OTHER`) | candidates / skipped list; empty → "사진에서 읽을 수 있는 번호가 없습니다…" |
| 400 | `{"error"}` (invalid request) | "AI 사진 인식에 실패했습니다 (400)." |
| 401 / 403 | (n8n Header Auth refusal) | "AI 사진 인식 인증에 실패했습니다. 관리자에게 문의해 주세요." |
| 502 | `{"error"}` (OpenRouter failed or unreadable output) | "AI 사진 인식에 실패했습니다 (502)." |
| no answer in 55 s | — | "AI 응답 시간이 초과되었습니다…" |

The database function `ai_photo_propose` validates everything again (shape, lengths, PII forms, existing aliases, duplicates).

### 4. Local checks (no n8n needed)

- `node supabase/test-fixtures/phase9/workflow-check.mjs` — structure of the file + both Code nodes run with mocked inputs (20 checks).
- `supabase/test-fixtures/phase9/n8n-stub.mjs` — stand-in for this webhook for app tests (see the Phase 9 report).
- `supabase/test-fixtures/phase9/openrouter-stub.mjs` — fake OpenRouter for an optional local n8n run (not done in Phase 9, D6 skipped by Brad).
