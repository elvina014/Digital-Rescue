# Phase 9 — AI-assisted registration (사진 인식 → AI 후보) — PLAN

Status: **APPROVED by Brad 2026-10-04 with the conditions below (recorded per R11 before implementation).** Branch `feat/repair-intelligence`.
Dev target: **local Docker Supabase only** (Brad, 2026-10-04). Production: no queries, nothing applied (R3).

## 승인 조건 (Brad, 2026-10-04, R11)

승인 메시지의 결정·조건 (원문 취지 그대로). 아래 본문과 충돌하면 이 절이 우선한다.

- **Q1. 모델 ID·credential: 추측값 금지.** 기존 워크플로의 OpenRouter 모델 ID와 credential 이름은 Brad가 확인 후 알려준다.
  - 워크플로 JSON에는 모델 ID와 credential을 명확한 자리 표시자로 둔다 (예: `<<OPENROUTER_MODEL_ID>>`).
  - `vector-integration.md` 또는 별도 절에 "자리 표시자 채우는 방법"을 적는다.
  - `04-final-release-plan.md` 출시 후 점검에 "모델 ID·credential 채우기 → 실제 사진 1장으로 인식 확인" 항목을 추가한다.
  - 로컬 검증은 stub n8n 응답으로 진행하므로 Q1과 무관하게 끝까지 진행한다.
- **D1. (a)** 부품·보드·기기 라벨 3종.
- **D3. (a)** 검토 완료 후 사진 삭제.
- **D4. (a)** 업로드 권한 ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR.
- **D5. (a)** KI-14를 이번에 수정. 단,
  - Phase 9 구현과 **별도 커밋**으로 분리한다;
  - 수정 전 **재현 테스트**와 수정 후 **통과 테스트**를 pgTAP에 추가한다.
- **D6. (a)** 로컬 n8n 컨테이너 시험 승인. **이미지 다운로드 전에 Brad에게 알린다.**
- **D7.** "성공한 실행 저장 안 함"은 **사진 인식 워크플로에만** 적용한다 (워크플로 단위 설정). n8n 전체 설정은 바꾸지 않는다.
  VECTOR 워크플로의 실행 이력은 Phase 8 C12에 따라 감사 기록으로 유지된다.
- **D8. 변경:** 기존 기기 라벨 워크플로에 노드를 추가하지 않고, 사진 인식 전용 **새 워크플로**로 만든다.
  기존 워크플로와 같은 OpenRouter credential을 참조하되, 기존 워크플로 JSON은 수정하지 않는다.
- **D9. (a)** KI-15로 기록만. 추가로 `04-final-release-plan.md`에 "기존 기기 라벨 웹훅에 Header Auth 적용(앱 쪽 헤더 전송 포함)"을
  배포 시 **선택 항목**으로 넣는다.
- D2: 별도 언급 없음 → 계획의 권장안 (a) 대상 우선(target first)으로 진행.
- 진행: 구현 → 로컬 검증 → `phase-9-report.md` → 로컬 커밋 후 커밋 해시와 브랜치명을 보고하고 멈춘다.

---

## 0. Preconditions (checked 2026-10-04)

| Check | Result |
| --- | --- |
| `phase-8-report.md` exists, acceptance rows ✅ | ✅ all rows ✅ (pgTAP 1067/1067, C0–C15 mapped) |
| `phase-0.6.1-report.md` exists, acceptance rows ✅ | ✅ all rows ✅ (KI-12 fixed) |
| Commits on `feat/repair-intelligence` | Phase 8: `3b2db2f`, `c4936c6`, `08f0bd9`, `748e4ec` (+ `f138ba7` test fix). Phase 0.6.1: `5aef670`, `b43eb58`, `d4df5d3` (HEAD) |
| Roadmap | Phase 8 ✅ local, Phase 0.6.1 ✅ local → Phase 9 is next |
| Working tree | only `.claude/settings.local.json`, `.gitignore` modified (not RI files; not touched by this phase) |

## 1. Goal and acceptance (roadmap)

- Extend the existing n8n + OpenRouter vision flow: label / board / chip-marking photo → `ai_candidates`.
- **Acceptance:** a photo produces a candidate; nothing is registered without approval.
- Binding constraints for this plan (Brad, 2026-10-04 request):
  - recognition output goes **only** to `ai_candidates` (P8). Nothing reaches inventory, `part_specs`,
    compatibility or any alias table without ADMIN approval in the Phase 8 review UI;
  - reuse the existing vision flow — no parallel flow;
  - split what is testable locally from what can only be verified after the final release;
  - photos may show customer information → storage, access and non-exposure through `vector_api` are specified;
  - any n8n change is delivered as an importable JSON file in the repo; the live n8n is not touched.

## 2. Investigation — the existing AI vision flow

### 2.1 What exists (repository + `.env.local` variable **names** only; values not read)

| Flow | Path | Facts |
| --- | --- | --- |
| **Device label → value** (the vision flow) | `EstimateCard.tsx:130–175` (file input `accept="image/*"`, `FileReader.readAsDataURL`) → server action `analyzeDeviceLabelAction` (`src/app/(admin)/tickets/actions.ts:1830`) → `fetch(process.env.N8N_DEVICE_WEBHOOK_URL)` | **Photo is not stored anywhere** — no bucket. The raw file is sent as a base64 data URL in the JSON body `{imageBase64, modelName, tagInfo, deviceType, brand}`. **No authentication header** on the webhook call. Synchronous: n8n answers `{tagInfo, brand, model, releaseYear, evaluatedValue, priceSource}`. The action fills the ticket form and writes the `device_models` cache (silently fails, KI-1). Login check only |
| n8n inventory AI inbound | n8n → `POST /api/inventory/webhook` (`src/app/api/inventory/webhook/route.ts`), shared key, **service_role**, notes `"[n8n AI 분석]"`, optional `imageUrl` | Writes inventory **directly** (no approval). Where n8n gets / stores that image is outside the repo. **Not reused** — this is exactly the pattern P8 / Phase 8 forbid for AI writes |
| New-ticket notification | `submitTicketAction` → `N8N_NEW_TICKET_WEBHOOK_URL` | no image, not AI; unrelated |
| News rewrite (reference) | `docs/04_news_automation.md` | n8n **HTTP Request node → `https://openrouter.ai/api/v1/chat/completions`**, `Authorization: Bearer {{$env.OPENROUTER_API_KEY}}`, model `anthropic/claude-3.5-haiku` (text only) |

### 2.2 What is **not** in the repository

- The n8n workflow behind `N8N_DEVICE_WEBHOOK_URL` (no export in the repo), so **its OpenRouter model, prompt and credential name cannot be read** → question **Q1**.
- The roadmap calls it "n8n + OpenRouter vision flow"; the news document shows the OpenRouter call pattern used in this n8n instance. I assume the device-label workflow uses the same pattern (HTTP Request → OpenRouter chat completions with an `image_url` content part). To be confirmed (Q1).

### 2.3 Consequences for the design

1. **Reuse** = the same app pattern (server action → n8n webhook with the image as base64 → OpenRouter vision → JSON back synchronously), the same n8n instance, the same OpenRouter credential and model.
   **No** n8n → database connection: n8n never touches Supabase in this phase (nothing like the inventory webhook, no `vector_agent` use).
   → This also removes the "production n8n cannot reach the local DB" problem for the database part: the DB side is fully local-testable.
2. The existing device-label webhook is **unauthenticated** and its response contract is used by `EstimateCard`. Changing that webhook (auth or branching on a `mode` field) would risk the ticket flow → **not changed**.
   Phase 9 adds a **second Webhook trigger (own path, Header Auth) inside n8n**, delivered as JSON. It can be pasted into the existing workflow next to the label nodes or imported as its own workflow (decision **D8**). Either way it shares the OpenRouter credential and model.
3. Today photos are never stored. Phase 9 needs the photo **for the reviewer** (an ADMIN must see what the AI read) → a new **private** bucket (§3.3), deleted after review (D3).
4. `ai_candidates.part_spec_id` is `NOT NULL` and `candidate_type` allows only `COMPATIBILITY` / `PART_ALIAS`, `source` only `VECTOR`. Board numbers and device-label model numbers cannot be expressed → Phase 8 objects must change (listed in §3.5, R2).
5. **Phase 8 defect found (proposed KI-14):** `ai_candidates.result_alias_id … ON DELETE SET NULL` fires the immutability trigger `ai_candidates_protect`. Deleting a part alias that came from an approved AI candidate fails with "이미 처리된 후보입니다."
   Reproduced locally in a rolled-back transaction (2026-10-04). Affects `deletePartAliasAction` (부품 규격 → 별칭 삭제) in the UI.
   Phase 9 adds two more such result columns, so the trigger must be fixed in the same change (D5).

## 3. Schema — one migration `supabase/migrations/<UTC ts>_ai_photo_recognition.sql`

### 3.1 Recognition model: target first (D2)

Staff choose **what the photo shows** before uploading. The AI only **reads text** from the photo. The server turns each reading into an **alias candidate for that target**.

| Photo kind (`photo_kind`) | UI label | Target picked by staff (existing pickers) | Candidate | On approval (Phase 8 UI, ADMIN) |
| --- | --- | --- | --- | --- |
| `PART` | 부품 라벨 / 칩 마킹 | part spec (`PartSpecPicker`) | `PART_ALIAS` (existing type; `alias_type` MARKING or PART_NUMBER from the reading) | `part_number_aliases` row (as Phase 8) |
| `BOARD` | 메인보드 번호 | board (`BoardPicker`) | **`BOARD_ALIAS`** (new) | `catalog_board_aliases` row |
| `DEVICE` | 기기 라벨 | model, optional variant (`DeviceModelPicker`) | **`MODEL_ALIAS`** (new) | `catalog_model_aliases` row, `source = 'manual'` (human-approved; Phase 1 CHECK unchanged) |

- An unknown part, board or model is created first with the existing inline tools (새 부품 규격, 새 모델, 보드 등록).
  "AI proposes a new part / board / model" is out of scope (§9).
- Phase 9 never creates `COMPATIBILITY` candidates → P4 untouched (no `verified`, no evidence).
- Alias approval does **not** backfill tickets. That stays with the Phase 1 mapping tool.

### 3.2 New table `public.ai_photo_requests`

One row per photo that produced at least one new candidate. Written only by `ai_photo_propose` (definer).

| Column | Type / rule |
| --- | --- |
| `id` | uuid PK — generated by the app; also the storage file name |
| `photo_kind` | text NOT NULL CHECK IN (`PART`, `BOARD`, `DEVICE`) |
| `part_spec_id` / `model_id` / `variant_id` / `board_id` | FKs → `part_specs` / `catalog_models` / `catalog_variants` / `catalog_boards`, ON DELETE CASCADE; CHECK: exactly the target of the kind (`variant_id` only with `model_id` for `DEVICE`, FK pair `(variant_id, model_id)` like `catalog_model_aliases`) |
| `storage_path` | text NOT NULL UNIQUE, CHECK = `id::text || '.webp'` (bucket `ai-photos`) |
| `ai_model` | text ≤ 100 — model name reported by n8n (audit) |
| `source_ref` | text ≤ 200 — n8n execution id |
| `reading_count`, `candidate_count` | int NOT NULL ≥ 0 |
| `requested_by` | uuid DEFAULT `auth.uid()` → `employees` ON DELETE SET NULL |
| `created_at` | timestamptz NOT NULL DEFAULT now() |

- RLS on; policy SELECT **ADMIN only** (`get_my_role() = 'ADMIN'`, same as `ai_candidates`).
- No INSERT / UPDATE / DELETE grants or policies. `REVOKE ALL FROM anon, authenticated`, then `GRANT SELECT TO authenticated`.
- Indexes on every FK column (advisor `unindexed_foreign_keys`).
- No AI free text is stored here: readings that become candidates are in `ai_candidates`; the others are only returned to the uploader.

### 3.3 Storage: bucket `ai-photos`

| Setting | Value |
| --- | --- |
| `public` | **false** (no public URL; anonymous fetch / list refused) |
| `file_size_limit` | 10 MB |
| `allowed_mime_types` | `image/webp` only (the server always converts) |

Policies on `storage.objects` (pattern of `donor_photos_storage_*`, Phase 4):

| Policy | Operation | Condition |
| --- | --- | --- |
| `ai_photos_storage_insert` | INSERT | `bucket_id = 'ai-photos'` AND role IN (ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR) (D4) |
| `ai_photos_storage_select` | SELECT | `bucket_id = 'ai-photos'` AND (role = ADMIN OR `owner_id = auth.uid()::text`) |
| `ai_photos_storage_delete` | DELETE | same as select (uploader: cleanup after a failed request; ADMIN: deletion after review) |

**Who sees a photo:**
- the **uploader** — preview in their own browser, and their own object (needed for cleanup);
- **ADMIN** — signed URLs (10 min) on the review page.
- Nobody else.
- No public URL is ever created or stored. The DB stores only the path.

**Image handling:**
- `sharp`: EXIF rotate, longest side ≤ 2048 px, WebP q85, **metadata stripped** (EXIF / GPS removed);
- the same WebP bytes go to n8n and into the bucket.

**Retention (D3 a):** when the last PENDING candidate of a photo is approved or rejected, the review action deletes the object. The `ai_photo_requests` row stays as the audit record (path only).

### 3.4 New function `public.ai_photo_propose(...)` — the only write path

```
ai_photo_propose(p_request_id uuid, p_photo_kind text, p_target_id uuid, p_variant_id uuid,
                 p_readings jsonb, p_ai_model text, p_source_ref text) RETURNS jsonb
```

- SECURITY DEFINER, `SET search_path = public, extensions`.
- First statement `PERFORM public.ri_api_guard_definer('{anon}')` (R10).
- Then: role IN (ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR), else "AI 사진 인식 권한이 없습니다." (D4).
- **Validation** (Korean messages, `RAISE` → returned to the action):
  - kind;
  - target exists and matches the kind (variant belongs to the model);
  - `p_readings` is an array with 1–10 elements of `{text ≤ 150, type ∈ PART_NUMBER|MARKING|BOARD_NUMBER|MODEL_NUMBER|OTHER, confidence 0–1, note ≤ 300}`;
  - request id not used yet.
- **Per reading:**
  1. `catalog_normalize(text)` is NULL (no letters / digits) → skipped `UNREADABLE`.
  2. **PII guard:** `vector_api.mask_text(text) <> text` → skipped `PII`. Nothing is stored; the uploader sees the masked text only. Phone, e-mail, card, resident-number forms never become aliases.
  3. Already the target's name or alias (`name_norm`, `board_number_norm`, model / alias `alias_norm`) → skipped `ALREADY`.
  4. `BOARD` / `DEVICE`: alias is globally unique in the catalog. Registered for **another** board / model → skipped `CONFLICT`, with that board / model label shown to the uploader. Useful knowledge, but not a candidate.
  5. Identical PENDING candidate (any source) → returns the existing id, `duplicate: true`.
  6. Otherwise insert into `ai_candidates`: `source = 'PHOTO'`, `photo_request_id`, `alias`, `alias_type` (PART only: MARKING if the reading type is MARKING, else PART_NUMBER).
     `rationale` = "사진 인식 · <type> · 신뢰도 0.82 · <AI note>" — the note is masked with `mask_text`.
     `source_ref` = n8n execution id.
- Shared limit: **500 PENDING** candidates (same advisory lock and message as Phase 8).
- `ai_photo_requests` row inserted **only if ≥ 1 new candidate**. Everything runs in one transaction.
- Returns `{request_id | null, created:[{candidate_id, alias, duplicate}], skipped:[{text, reason, detail}]}`.
- `vector_api.mask_text` is owner-only. The definer function (owner `postgres`) may call it; no new grant.
- EXECUTE: `REVOKE … FROM PUBLIC`, `GRANT … TO anon, authenticated, service_role` (R10); refusal inside.

### 3.5 Changes to existing (Phase 8) objects — explicit list (R2)

Phase 8 is not in production yet; these change only the local / to-be-released definitions.

| # | Object | Change | Why |
| --- | --- | --- | --- |
| E1 | `ai_candidates` | `ADD COLUMN photo_request_id uuid` → `ai_photo_requests` ON DELETE CASCADE (+ index) | link candidate ↔ photo |
| E2 | `ai_candidates` | `ADD COLUMN result_model_alias_id` → `catalog_model_aliases`, `result_board_alias_id` → `catalog_board_aliases`, both ON DELETE SET NULL (+ indexes) | approval result, like `result_alias_id` |
| E3 | `ai_candidates.part_spec_id` | `DROP NOT NULL` | board / model aliases have no part spec |
| E4 | CHECK `source` | `('VECTOR')` → `('VECTOR', 'PHOTO')` (drop + add) | |
| E5 | CHECK `candidate_type` | + `MODEL_ALIAS`, `BOARD_ALIAS` (drop + add) | |
| E6 | CHECK `ai_candidates_shape` | replaced. The `COMPATIBILITY` and `PART_ALIAS` branches keep their text and gain `part_spec_id IS NOT NULL`. New branches: `MODEL_ALIAS` = `model_id`, optional `variant_id`, `alias`, no `part_spec_id` / `board_id` / `target_type` / `observed_status` / `alias_type`. `BOARD_ALIAS` = `board_id`, `alias` ≤ 100, same NULLs | |
| E7 | CHECK `ai_candidates_results` | replaced to cover the two new result columns (each only on APPROVED of its type) | |
| E8 | new partial unique indexes | PENDING dedup for `MODEL_ALIAS (model_id, alias_norm)` and `BOARD_ALIAS (board_id, alias_norm)` | C7 dedup |
| E9 | `ai_candidates_protect()` | `CREATE OR REPLACE`: (a) `photo_request_id` added to the immutable column list; (b) **KI-14 fix** — on a processed candidate, an UPDATE that only sets `result_alias_id` / `result_model_alias_id` / `result_board_alias_id` to NULL (FK `SET NULL`) is allowed. Everything else unchanged | C8 immutability; KI-14 (D5) |
| E10 | `ai_candidate_approve(uuid,text,text,text)` | `CREATE OR REPLACE`, same signature / grants. `COMPATIBILITY` and `PART_ALIAS` branches **byte-identical**. New `MODEL_ALIAS` branch: insert `catalog_model_aliases (model_id, variant_id, alias, source 'manual', created_by auth.uid())`. New `BOARD_ALIAS` branch: insert `catalog_board_aliases`. Both: `p_approve_as` must be NULL ("별칭 후보는 승인 방식을 선택하지 않습니다." — the existing PART_ALIAS message is kept as is); "이미 등록된 별칭입니다." / "이미 다른 모델(보드)의 별칭으로 등록되어 있습니다." | approval path |

**Unchanged:**
- `ai_candidate_reject`;
- every `vector_api` function and grant;
- the `vector_agent` role;
- `analyzeDeviceLabelAction`, `EstimateCard`, the inventory webhook;
- all Phase 1–7 objects (only inserted into on approval).

Object snapshot (as in Phase 8): **additions + exactly E1–E10** as changes.

### 3.6 `vector_api` / VECTOR — no exposure of images

- No `vector_api` function reads `ai_photo_requests`, `ai_candidates.photo_request_id` or `storage.*`. The functions are not modified (snapshot: body md5 unchanged).
- `vector_agent` gets **no** grant on `ai_photo_requests`, the bucket or the `storage` schema. Tested: privilege checks + actual SELECT attempts → 42501.
- The webhook payload contains only:
  - the request id;
  - the kind;
  - the target label (part / board / model name — no customer, ticket or employee data);
  - the image.
- n8n returns only readings; it holds no DB credential for this flow.

## 4. Application (UI Korean; components < 200 lines; R5)

### 4.1 New files

| File | Content |
| --- | --- |
| `src/app/(admin)/ai-photo/page.tsx` | page "AI 사진 인식" for ADMIN / MANAGER / TECHNICIAN / EXPERT_REPAIR (others → `/dashboard`). `export const maxDuration = 60` if the Next 16 docs confirm it applies to the page's actions (checked in `node_modules/next/dist/docs/` at implementation) |
| `…/ai-photo/PhotoRecognizeForm.tsx` | kind (부품 라벨·칩 마킹 / 메인보드 번호 / 기기 라벨) → matching picker → photo (`accept="image/*" capture="environment"`, local preview) → "인식 요청". Warning: "사진은 외부 AI(OpenRouter)로 전송됩니다. 고객 이름·전화번호·주소가 보이지 않게 촬영하세요." Button disabled with "인식 중…" while pending; the form keeps its inputs on error (no optimistic list here — nothing is shown as created until the server confirms) |
| `…/ai-photo/RecognitionResult.tsx` | created (→ "관리자 검토 대기 n건"), skipped with reasons: 이미 등록됨 / 다른 모델(보드)의 별칭 X / 개인정보로 보여 제외 ([마스킹]) / 읽을 수 없음 |
| `…/ai-photo/actions.ts` | `recognizePhotoAction(formData)`: own login check ("로그인이 필요합니다. 다시 로그인해 주세요.") + role check; file type / size (jpeg, png, webp, heic, heif ≤ 10 MB); `sharp`; env `N8N_RI_PHOTO_WEBHOOK_URL` + `N8N_RI_PHOTO_SECRET` (missing → "AI 사진 인식이 설정되지 않았습니다."); POST with header `X-RI-Secret`, timeout 55 s; zod validation of the response. Steps: no readings → message, **nothing stored**; else upload → `ai_photo_propose` (session client) → on error or 0 created: delete the object. Korean errors for timeout / 401·403 / 5xx / invalid JSON |
| `n8n/ri-photo-recognition.workflow.json` | importable n8n workflow (§4.3) |
| `n8n/README.md` | import steps, credentials to map, settings (D7), the response contract |
| `supabase/tests/ai_photo_recognition.test.sql` | pgTAP (§6 A) |
| `supabase/test-fixtures/phase9/rollback.sql` | §5 |
| `supabase/test-fixtures/phase9/n8n-stub.mjs` | local stand-in for the n8n webhook (Node `http`, no dependencies). Checks the header, returns canned readings by `STUB_MODE` (`ok`, `pii`, `empty`, `bad-json`, `500`, `slow`) — **local tests only, not imported by the app** |
| `supabase/test-fixtures/phase9/openrouter-stub.mjs` | fake OpenRouter `chat/completions` for the optional local n8n test (D6) |
| `supabase/test-fixtures/phase9/functions_phase8.sql` | Phase 8 bodies of E9 / E10 (rollback source and snapshot comparison) |

### 4.2 Existing files changed

| File | Change |
| --- | --- |
| `src/app/(admin)/catalog/ai-candidates/page.tsx` | select `source`, `photo_request_id`, `ai_photo_requests(storage_path, photo_kind)`, `catalog_board_aliases` / model targets of the new types; signed URLs (10 min) for PENDING photos; map the new types |
| `…/AiCandidateCard.tsx` | badge "사진 인식" vs "VECTOR"; photo thumbnail (click → full size); labels for `MODEL_ALIAS` / `BOARD_ALIAS` ("모델 별칭 후보", "보드 별칭 후보"); "승인" button as for part aliases; "사진 없음" when the object is gone |
| `…/AiCandidateList.tsx` | type of the row only (if needed) |
| `…/ai-candidates/actions.ts` | after a successful approve / reject: if no PENDING candidate of that photo remains → delete the storage object (D3 a). A failed deletion does not undo the review; it shows "사진 삭제에 실패했습니다 — 다시 시도해 주세요." |
| `src/components/layout/AdminSidebar.tsx` | + "AI 사진 인식" for the 4 roles (D4) |
| `.env.local.example` | `N8N_RI_PHOTO_WEBHOOK_URL=`, `N8N_RI_PHOTO_SECRET=` (names only) |
| `src/types/supabase.ts` | regenerated |

Untouched: `EstimateCard.tsx`, `analyzeDeviceLabelAction`, `/api/inventory/webhook`, ticket and inventory screens.

### 4.3 n8n workflow JSON (`n8n/ri-photo-recognition.workflow.json`)

| Node | Content |
| --- | --- |
| Webhook | POST, path `ri-photo-recognition`, **Authentication: Header Auth** (credential placeholder "RI Photo Secret", header `X-RI-Secret`), respond "Using Respond to Webhook node" |
| Code "요청 구성" | builds the OpenRouter body. Model = **the model of the existing device-label workflow (Q1)**. `temperature 0`, `response_format: {type: json_object}`. Messages: system prompt "read only printed text, JSON `{readings:[{text,type,confidence,note}]}`, max 10, never output personal data (names, phone numbers, addresses)", then text + `image_url` (data URL). Kind and target label are given as hints |
| HTTP Request | POST `https://openrouter.ai/api/v1/chat/completions`, the **existing OpenRouter credential** (mapped on import), timeout 50 s, "continue on fail" → error branch |
| Code "응답 검증" | parse `choices[0].message.content` as JSON; keep valid readings only (≤ 10, text ≤ 150, type in list, confidence clamped 0–1, note ≤ 300); add `model` and `execution_id = $execution.id` |
| Respond to Webhook | 200 `{readings, model, execution_id}`; error branch 502 `{error}` |
| Workflow settings (D7) | `saveDataSuccessExecution: none`, `saveDataErrorExecution: all` |

- No credentials, secrets or URLs of the live instance are in the file. Credentials are mapped by name on import.
- The live n8n is **not** modified by Claude.

## 5. Rollback SQL (`supabase/test-fixtures/phase9/rollback.sql`)

```sql
BEGIN;
-- Phase 9 candidates (approved aliases stay as knowledge, like Phase 8)
DELETE FROM public.ai_candidates
 WHERE source = 'PHOTO' OR candidate_type IN ('MODEL_ALIAS', 'BOARD_ALIAS');
DROP FUNCTION IF EXISTS public.ai_photo_propose(uuid, text, uuid, uuid, jsonb, text, text);
-- E9 / E10: restore the Phase 8 bodies (byte-identical, from functions_phase8.sql)
\i functions_phase8.sql
-- E8
DROP INDEX IF EXISTS public.ai_candidates_pending_model_alias_key, public.ai_candidates_pending_board_alias_key;
-- E4–E7: restore the Phase 8 CHECKs (text from 20261004090000_vector_integration.sql)
ALTER TABLE public.ai_candidates
  DROP CONSTRAINT ai_candidates_shape, DROP CONSTRAINT ai_candidates_results,
  DROP CONSTRAINT ai_candidates_source_check, DROP CONSTRAINT ai_candidates_candidate_type_check;
ALTER TABLE public.ai_candidates
  ADD CONSTRAINT ai_candidates_source_check CHECK (source IN ('VECTOR')),
  ADD CONSTRAINT ai_candidates_candidate_type_check CHECK (candidate_type IN ('COMPATIBILITY', 'PART_ALIAS')),
  ADD CONSTRAINT ai_candidates_shape CHECK ( /* Phase 8 text, verbatim */ ),
  ADD CONSTRAINT ai_candidates_results CHECK ( /* Phase 8 text, verbatim */ );
-- E1–E3
ALTER TABLE public.ai_candidates
  DROP COLUMN photo_request_id, DROP COLUMN result_model_alias_id, DROP COLUMN result_board_alias_id,
  ALTER COLUMN part_spec_id SET NOT NULL;
DROP TABLE public.ai_photo_requests;
DROP POLICY IF EXISTS ai_photos_storage_select ON storage.objects;
DROP POLICY IF EXISTS ai_photos_storage_insert ON storage.objects;
DROP POLICY IF EXISTS ai_photos_storage_delete ON storage.objects;
COMMIT;
-- then empty and delete the bucket `ai-photos` through the Storage API / dashboard (as Phase 4)
```

- The real file carries the verbatim CHECK texts.
- Constraint names are confirmed from the catalog at implementation.
- Rehearsal: snapshot after rollback = snapshot before Phase 9 (as in Phase 8).
- The rollback deletes **only rows created by Phase 9** (R9).

## 6. Test plan

### (a) Fully testable locally

#### A. pgTAP `ai_photo_recognition.test.sql`

1. **Schema:** table, columns, CHECKs, FK indexes, RLS on, SELECT policy ADMIN only, no write grants; bucket private / 10 MB / webp; 3 storage policies.
2. **R10:** `ai_photo_propose` EXECUTE for anon / authenticated / service_role; anon → "로그인이 필요합니다. 다시 로그인해 주세요."; `api_guard.test.sql` invariant passes.
3. **Roles:** ADMIN / MANAGER / TECHNICIAN / EXPERT_REPAIR allowed; RECEPTION / CS refused.
4. **Validation:** every message (kind, target missing / wrong kind, variant of another model, 0 or 11 readings, text > 150, bad type, confidence out of range, request id reused).
5. **Readings → result:** new → candidate (`source PHOTO`, `photo_request_id`, rationale with confidence, masked note); `UNREADABLE`; **PII** (phone, e-mail, card, resident-number forms → skipped, text returned masked, nothing stored); `ALREADY` (name, existing alias); `CONFLICT` (alias of another model / board); `duplicate` (incl. a VECTOR PENDING alias); 500 cap.
6. **Isolation:** row counts of **all** `public` tables before / after a call — only `ai_photo_requests` (+1) and `ai_candidates` (+n) change; 0 created → no request row. `inventory_*`, `part_specs`, `part_compatibility`, `compatibility_evidence`, all alias tables unchanged.
7. **Approval:** `MODEL_ALIAS` → `catalog_model_aliases` (`source manual`, `created_by`, variant kept); `BOARD_ALIAS` → `catalog_board_aliases`; photo `PART_ALIAS` → `part_number_aliases`; `p_approve_as` must be NULL; alias registered meanwhile → message, candidate stays PENDING; reject; reviewer / time; non-ADMIN refused.
8. **Immutability (E9):** content incl. `photo_request_id` cannot change; **KI-14:** deleting an approved part / model / board alias succeeds, the `result_*_id` becomes NULL, nothing else may change on that row.
9. **VECTOR non-exposure:** `vector_agent` has no privilege on `ai_photo_requests`, `storage.objects`, `storage.buckets`, schema `storage`; actual SELECT attempts → 42501; `vector_api` function bodies unchanged (md5); `propose_*` still insert `source = 'VECTOR'`.
10. **Storage policies:** as `authenticated` with seed-user JWT claims: INSERT allowed for the 4 roles only; SELECT / DELETE for ADMIN and the owner only; other buckets unaffected.
11. **Regression:** the full suite (1067 existing) passes. Any Phase 8 assertion that has to change (e.g. one that expects `source = 'PHOTO'` to be rejected) is listed in the report with the reason.

#### B. App against a stub n8n (local stack + `next dev` + `n8n-stub.mjs`; temporary `.env.development.local`, **deleted** afterwards)

| Step | Expected |
| --- | --- |
| TECHNICIAN → AI 사진 인식 → 부품 라벨·칩 마킹 → spec → photo (stub `ok`: 1 new, 1 existing) | "후보 1건 생성 · 1건 이미 등록됨"; one object `ai-photos/<id>.webp`; DB: 1 request, 1 candidate PENDING |
| 메인보드 번호 / 기기 라벨 | BOARD_ALIAS / MODEL_ALIAS candidates; CONFLICT shown with the other model's name |
| stub `pii` | "개인정보로 보여 제외: [마스킹]"; nothing stored when it was the only reading |
| stub `empty` / `bad-json` / `500` / `slow` (> 55 s) / wrong secret (401) | Korean errors; **no object left in the bucket, no rows** |
| env vars missing | "AI 사진 인식이 설정되지 않았습니다." |
| RECEPTION / CS | page → `/dashboard`, no sidebar entry; direct action call → role message |
| session expired | "로그인이 필요합니다. 다시 로그인해 주세요." |
| ADMIN → 기기 마스터 → AI 후보 | "사진 인식" badge, thumbnail via signed URL; approve MODEL_ALIAS → alias visible on the model; last candidate of a photo reviewed → object deleted, card of reviewed candidate shows "사진 없음" |
| privacy | object URL without a signature / anonymous list / public URL → refused; EXIF absent in the stored WebP |
| KI-14 in UI | 부품 규격 → delete an alias created from a candidate → succeeds |
| side effects | DB counts: no inventory / spec / compatibility change before approval |

#### C. Optional (D6): the n8n workflow JSON in a local, disposable n8n container

- Import `n8n/ri-photo-recognition.workflow.json` into a temporary `n8nio/n8n` container. Use dummy credentials. The OpenRouter URL is replaced **in a scratch copy only** by `openrouter-stub.mjs`.
- Call the webhook without / with wrong / with correct header → **record the status codes** (this also answers the open Phase 8 O2 question about Header Auth → 401 or 403).
- Check response parsing (valid, invalid JSON, > 10 readings, missing fields) and execution saving (success not saved).
- Then run B against this local n8n instead of the stub.
- Container and scratch files removed afterwards.

#### D. Static / advisors / snapshot / rollback

- `npx supabase db reset` ×2; `npx supabase test db`;
- `npm run db:types`; typecheck / lint / build;
- advisors `--type all --level info` → no new WARN;
- object snapshot: additions + exactly E1–E10;
- rollback rehearsal → snapshot equals pre-Phase-9; re-apply;
- the workflow JSON parses and contains only the expected node types (script check).

### (b) Only verifiable after the final release (added to `04-final-release-plan.md`, §7)

1. Import / paste the workflow (D8) into the production n8n; map the existing OpenRouter credential; create the Header Auth credential `X-RI-Secret`; confirm the model (Q1).
2. App environment: `N8N_RI_PHOTO_WEBHOOK_URL`, `N8N_RI_PHOTO_SECRET` (production host only).
3. Webhook without / with wrong / with correct header → status codes as noted in C (or first check here if C is not done).
4. Real OpenRouter calls with three test photos without customer data (chip marking, board silkscreen, device label): readings plausible, candidates PENDING with photo; one approval each → alias registered; photo deleted after review.
5. Latency: the action finishes within the hosting function limit (`maxDuration`) for typical photos; note the time.
6. n8n: success executions not saved for this workflow, error executions saved; the existing device-label workflow and `EstimateCard` AI fill still work (unchanged).
7. OpenRouter account privacy settings (provider data retention / training) reviewed by Brad.
8. `ai-photos` bucket in production: private, 10 MB, webp; anonymous access refused.

## 7. Documents

- `04-final-release-plan.md`:
  - §2 row 13 (Phase 9 migration, after row 12; uses the 0.6a guard helper and Phase 8 objects);
  - new §7 "Post-release checks — Phase 9 (AI 사진 인식)" with the (b) list — **added together with this plan**;
  - the migration file name is filled in at implementation.
- `known-issues.md`:
  - **KI-14** (FK SET NULL vs `ai_candidates_protect`, fixed by E9 if D5 a);
  - **KI-15** "device-label webhook (`N8N_DEVICE_WEBHOOK_URL`) has no authentication; anyone with the URL can use the OpenRouter credit" — recorded only (D9);
  - KI-5 note (generated types).
- `vector-integration.md`: one paragraph "사진 인식 후보(source PHOTO)는 VECTOR 경로와 무관, 이미지·URL은 vector_api에 노출되지 않음".
- `n8n/README.md`, `phase-9-report.md`, `02-roadmap.md` status.

## 8. Risks

- **Photos leave the company.** The image goes to n8n → OpenRouter → the model provider (as today for device labels). EXIF is stripped, but text visible in the photo (a sticker with a name or phone number, a screen) is sent.
  Mitigations: the UI warning; masked readings; PII readings never become aliases; photo deleted after review; success executions not saved in n8n.
  Residual: the provider's own retention (Brad, OpenRouter settings).
- **n8n error executions contain the photo** until the instance-wide prune (Phase 8 suggested 90 days). Accepted with D7, or Brad shortens the global retention.
- **AI misreads** (O/0, I/1, 5/S). Aliases are only proposed; the reviewer must compare with the photo. Confidence is shown, there is no threshold.
- **Global alias uniqueness** (model / board): a misread that equals another model's alias is skipped as `CONFLICT`, not proposed.
- **Vercel / hosting time limit:** vision calls can take 10–40 s. `maxDuration` and the 55 s timeout keep the error controlled. Verified only after release (b5).
- **Body size:** server actions are limited to 10 MB (`next.config.ts`). Larger originals are refused with a message; phones usually produce < 10 MB.
- **Phase 8 objects change (E1–E10).** Mitigated by the byte-identical existing branches, the full Phase 8 suite and the snapshot. The rollback restores the Phase 8 definitions verbatim.
- **Orphan photo** if the object deletion fails after a review: the reviewer sees the message and can retry. The row keeps the path for a manual cleanup.
- Model choice and prompt quality are unknown until Q1 and the post-release test.

## 9. Out of scope

- AI proposing **new** part specs, boards or models (no target).
- Compatibility candidates from photos.
- OCR of ticket intake documents.
- Changing `analyzeDeviceLabelAction`, `EstimateCard`, the device-label webhook (KI-15) or the inventory webhook.
- Any n8n change on the live instance.
- Bulk / batch uploads; a photo history page for uploaders.
- Ticket backfill on alias approval (Phase 1 mapping tool).
- Phase 10.

## 10. Implementation order (after APPROVED)

1. R11: record the approval conditions in this file → commit.
2. Migration + `functions_phase8.sql` + rollback → `db reset` → pgTAP A (incl. regression) → advisors → snapshot → rollback rehearsal.
3. Types → actions / UI → B (stub) → optional C (D6).
4. Workflow JSON + `n8n/README.md` → JSON check.
5. Docs (§7), report, typecheck / lint / build, local commit(s). Report hashes and branch in Korean. STOP.

## 11. Questions and decisions for Brad

| # | Question / decision | Options (recommendation first) |
| --- | --- | --- |
| **Q1** | Which OpenRouter **model** does the existing device-label workflow (`N8N_DEVICE_WEBHOOK_URL`) use, and what is its OpenRouter credential called in n8n? | Tell me the model id + credential name; or export that workflow (n8n exports credentials as references only) so I can copy the exact request style. Without an answer: placeholder in the JSON, set by Brad on import (b1) |
| D1 | Scope | **(a)** three kinds `PART` / `BOARD` / `DEVICE` with new types `MODEL_ALIAS` / `BOARD_ALIAS` (roadmap: label / board / chip). (b) `PART` only: E2, E3, E5, E6-new branches and E10-new branches drop out |
| D2 | Recognition model | **(a)** target first (staff picks part / board / model, AI reads text). (b) AI-first with "new object" candidates — much larger, not planned |
| D3 | Photo retention | **(a)** delete the object when the last candidate of the photo is reviewed. (b) keep photos |
| D4 | Who may upload | **(a)** ADMIN, MANAGER, TECHNICIAN, EXPERT_REPAIR (as donors). (b) ADMIN only. Review stays ADMIN only |
| D5 | KI-14 (Phase 8 trigger blocks alias deletion) | **(a)** fix in E9 now. (b) record only (Phase 9 then needs no `ON DELETE SET NULL` → would use RESTRICT on the new result columns) |
| D6 | Local n8n container test (C) | **(a)** yes — pulls the official `n8nio/n8n` Docker image (about 0.5–1 GB) once; I ask before the download. (b) no — the workflow is first run after the release |
| D7 | n8n execution saving for this workflow | **(a)** success not saved, errors saved. (b) all saved (Phase 8 retention) |
| D8 | Where the workflow goes in n8n | **(a)** add the nodes to the existing device-label workflow (second Webhook trigger, same credential; existing nodes unchanged — paste from the JSON). (b) import as its own workflow sharing the credential. Both use the same file |
| D9 | KI-15 (device-label webhook unauthenticated) | **(a)** record only. (b) separate plan later |
