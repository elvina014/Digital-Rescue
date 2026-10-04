# Phase 9 — AI-assisted registration (사진 인식 → AI 후보) — REPORT

Executed 2026-10-04 on branch `feat/repair-intelligence`.
- Plan: `phase-9-plan.md`, APPROVED 2026-10-04 with Q1, D1–D9. Conditions recorded per R11 **before** implementation (commit `beb62fa`).
- Target: local Docker Supabase only. Production: **no queries, nothing applied**. Live n8n: **not touched**.

## Commits

| Commit | Content |
| --- | --- |
| `beb62fa` | docs: plan + approval conditions (R11) |
| `b5a9815` | **KI-14 fix, separate commit (D5)**: migration, pgTAP reproduction / pass test, rollback, `known-issues.md`, release-plan row 13 |
| (the commit containing this report) | Phase 9: migration, app, n8n workflow JSON, tests / fixtures, docs |

## Result

| Acceptance / requirement | Result |
| --- | --- |
| **A photo produces a candidate** | ✅ E2E (stub n8n): part / board / device photos → `PART_ALIAS` / `BOARD_ALIAS` / `MODEL_ALIAS` candidates, PENDING, `source PHOTO`, photo attached |
| **Nothing is registered without approval** | ✅ pgTAP §6: row counts of **all** `public` tables before / after a recognition — only `ai_photo_requests` (+1) and `ai_candidates` (+n). E2E: alias / inventory counts unchanged until the ADMIN approved; no `compatibility_evidence` from photo candidates (P4) |
| Output only to `ai_candidates` (P8) | ✅ `ai_photo_propose` is the only write path; it writes `ai_photo_requests` + `ai_candidates` only |
| Reuse of the existing flow, no parallel flow | ✅ same pattern as `analyzeDeviceLabelAction` (server action → n8n webhook, image as base64 → OpenRouter → JSON back). The n8n side is a **new workflow** (D8) that references the **same** OpenRouter credential. The existing device-label workflow, `analyzeDeviceLabelAction`, `EstimateCard` and the inventory webhook are unchanged |
| Q1 placeholders, no guessed values | ✅ `<<OPENROUTER_MODEL_ID>>`, `<<OPENROUTER_CREDENTIAL_ID/NAME>>`, `<<RI_PHOTO_HEADER_AUTH_CREDENTIAL_ID/NAME>>`. How to fill: `vector-integration.md` §8 and `n8n/README.md` §1. Post-release item "모델 ID·credential 채우기 → 실제 사진 1장으로 인식 확인": `04-final-release-plan.md` §7-2 |
| D1 three kinds | ✅ 부품 라벨·칩 마킹 / 메인보드 번호 / 기기 라벨 |
| D3 photo deleted after review | ✅ E2E: after the last candidate of a photo was approved / rejected, the object is gone (3 → 0); reviewed cards show "사진 없음 (검토 후 삭제됨)" |
| D4 upload roles | ✅ pgTAP §3 / §10 (function and storage policies); E2E: TECHNICIAN can use the page, RECEPTION is redirected and has no sidebar entry |
| D5 KI-14 | ✅ separate commit `b5a9815`. Before the fix: tests 2–4 of 9 fail (reproduction). After: 9/9. Phase 9 extends the rule to its two new result columns (pgTAP §8). E2E: ADMIN deletes an approved photo alias in 부품 규격 → works |
| D6 local n8n container | ⏭ **skipped by Brad** (asked before the download). Replaced by `workflow-check.mjs`: structure + both Code nodes run with mocked n8n inputs, 20/20 |
| D7 workflow-level saving | ✅ in the workflow file: `saveDataSuccessExecution: none`, `saveDataErrorExecution: all`, `saveManualExecutions: false`. Instance settings not touched |
| D9 KI-15 | ✅ recorded; optional deployment item in `04-final-release-plan.md` §7 |
| Photo privacy | ✅ private bucket, webp only, EXIF removed (test image with EXIF → stored WebP has none); unsigned URL / public URL → 400; anonymous list → `[]`; signed URLs (10 min) only for ADMIN on the review page |
| Not exposed through `vector_api` | ✅ pgTAP §9: `vector_agent` has no privilege on `ai_photo_requests`, `storage.objects`, `storage.buckets`, schema `storage`; actual reads → 42501; no `vector_api` function mentions photos / storage; `vector_api` bodies unchanged (snapshot) |
| R10 | ✅ `ai_photo_propose`: guard `{anon}` + role check; EXECUTE for anon / authenticated / service_role; `api_guard.test.sql` invariant passes |
| pgTAP | ✅ **1168/1168** = 1067 (Phase 8) + 9 (KI-14) + **92** (Phase 9). No existing assertion had to change |
| `db reset` ×2 | ✅ |
| Types | ✅ regenerated: `ai_photo_requests`, new `ai_candidates` columns, `ai_photo_propose`; no diff after a second reset |
| typecheck / lint / build | ✅ 0 errors / 0 errors (16 warnings, all pre-existing) / success (`/ai-photo`, `/catalog/ai-candidates` built) |
| Advisors (`db advisors --local --type all --level info`) | ✅ no new WARN (14 = pre-existing list). New: 4 INFO `unused_index` on the new indexes (empty tables) |
| Existing objects | ✅ object snapshot (KI-14 state → Phase 9): additions + exactly E1–E10 (+ the two stricter constraints below). `ai_candidate_approve`: only line 1 (`CREATE OR REPLACE`) and the inserted block differ from Phase 8 |
| Rollback rehearsal | ✅ `phase9/rollback.sql` + bucket deleted via the Storage API → snapshot **identical** to before Phase 9; then re-applied by `db reset`. KI-14: `ki14/rollback.sql` → identical to Phase 8 |

## Changes

### Database

**`20261004100000_ki14_ai_candidates_result_delete.sql`** (commit `b5a9815`)
- `CREATE OR REPLACE ai_candidates_protect()`: on a processed candidate, an UPDATE whose only change is `result_alias_id → NULL` (FK `SET NULL`) is allowed.
- The generated `alias_norm` is excluded from that comparison: it is not yet computed in `NEW` of a BEFORE trigger (found by the first test run), and it follows `alias`, which is compared.

**`20261004110000_ai_photo_recognition.sql`** (additive + listed changes)

| Object | Content |
| --- | --- |
| `public.ai_photo_requests` | per plan §3.2. RLS SELECT ADMIN only; no write grants; FK indexes. One row per photo that produced ≥ 1 new candidate |
| bucket `ai-photos` | private, 10 MB, `image/webp`; policies `ai_photos_storage_insert` (4 roles), `_select` / `_delete` (ADMIN or owner) |
| `public.ai_photo_propose(uuid,text,uuid,uuid,jsonb,text,text)` | per plan §3.4. Readings → `UNREADABLE` / `PII` / `REPEATED` / `ALREADY` / `CONFLICT` / `TOO_LONG` / duplicate / new; shared 500 cap and lock with VECTOR |
| E1–E8 on `ai_candidates` | columns `photo_request_id`, `result_model_alias_id`, `result_board_alias_id`; `part_spec_id` nullable; CHECKs `source`, `candidate_type`, `ai_candidates_shape`, `ai_candidates_results`; PENDING dedup indexes for model / board aliases |
| E9 `ai_candidates_protect()` | + `photo_request_id` immutable; KI-14 rule for all three result columns |
| E10 `ai_candidate_approve()` | + `MODEL_ALIAS` → `catalog_model_aliases` (`source 'manual'`, variant kept), `BOARD_ALIAS` → `catalog_board_aliases`. Existing branches byte-identical |

### Application

| File | Change |
| --- | --- |
| `src/app/(admin)/ai-photo/page.tsx` (new) | page "AI 사진 인식" (4 roles, others → `/dashboard`); `maxDuration = 60` (Next 16 docs: page-level value applies to the page's server actions) |
| `…/ai-photo/PhotoRecognizeForm.tsx` (new) | kind → picker (`PartSpecPicker` / `BoardPicker` / `DeviceModelPicker` incl. variant) → photo (camera capture, local preview) → "인식 요청"; OpenRouter / customer-data warning; inputs kept on error |
| `…/ai-photo/RecognitionResult.tsx` (new) | created / already pending / skipped with reasons |
| `…/ai-photo/actions.ts` (new) | `recognizePhotoAction`: own login + role check; file checks; `sharp` (rotate, ≤ 2048 px, WebP q85, metadata removed); `X-RI-Secret`; 55 s timeout; zod; upload → `ai_photo_propose` → remove the object on error or when nothing new was created |
| `…/ai-photo/labels.ts` (new) | roles, labels, result type |
| `src/app/(admin)/catalog/ai-candidates/page.tsx` | new columns / types; signed URLs (10 min); **embed `catalog_variants!ai_candidates_variant_id_fkey`** (the new composite FK made the plain embed ambiguous) |
| `…/AiCandidateCard.tsx` | type labels incl. 모델 별칭 / 보드 별칭; badge "사진 인식" / "VECTOR"; photo |
| `…/CandidatePhoto.tsx` (new) | thumbnail (opens full size), "사진 없음", "사진 삭제" on reviewed cards if a photo is still there |
| `…/AiCandidateList.tsx` | row type, intro text |
| `…/actions.ts` | photo deletion after approve / reject when no PENDING candidate of that photo remains (D3); `deleteCandidatePhotoAction` |
| `src/components/layout/AdminSidebar.tsx` | + "AI 사진 인식" (4 roles) |
| `src/types/supabase.ts` | regenerated |

Component sizes: form 120, result 40, actions 140, card 153, photo 49, review actions 116 lines.

### n8n

- `n8n/ri-photo-recognition.workflow.json`:
  - nodes: Webhook (Header Auth) → Code "요청 구성" → HTTP Request "OpenRouter" → Code "응답 검증" → Respond 200;
  - error outputs → Respond 400 / 502;
  - inactive on import.
- `n8n/README.md`: placeholders, import steps, settings, contract.

### Tests / fixtures

- `supabase/tests/ki14_ai_candidate_result_delete.test.sql` (9).
- `supabase/tests/ai_photo_recognition.test.sql` (92). Sections:
  1. schema;
  2. R10;
  3. roles;
  4. validation;
  5. readings → result;
  6. isolation;
  7. approval;
  8. immutability + KI-14;
  9. VECTOR non-exposure;
  10. storage policies.
- `supabase/test-fixtures/ki14/rollback.sql`.
- `supabase/test-fixtures/phase9/`:
  - `rollback.sql`;
  - `demo.sql` (one fake part spec for the E2E);
  - `n8n-stub.mjs`, `openrouter-stub.mjs`;
  - `workflow-check.mjs`.

### Docs

- `known-issues.md`: KI-14 (fixed), KI-15 (recorded), KI-5 note.
- `04-final-release-plan.md`: rows 13–14, §7 post-release checks + optional D9 item.
- `vector-integration.md` §8.
- `02-roadmap.md` status; plan status.

## Deviations from the plan

| Plan | Done | Why |
| --- | --- | --- |
| `functions_phase8.sql` + `\i` in the rollback | `rollback.sql` is self-contained; it restores `ai_candidate_approve` to the Phase 8 body and `ai_candidates_protect` to the **KI-14** body | KI-14 became its own migration before Phase 9 (D5); `\i` depends on the working directory |
| E6 only | + CHECK `ai_candidates_photo_source` (`source = 'PHOTO'` ⇔ photo request) and FK `ai_candidates_variant_model_fk (variant_id, model_id)` (MATCH SIMPLE, + index) | stricter: a model-alias candidate cannot carry another model's variant; a photo candidate always has its photo. Existing VARIANT compatibility rows (model NULL) are unaffected |
| Skip reasons | + `REPEATED` (same text twice in one photo), `TOO_LONG` (board alias > 100) | otherwise a second identical reading would show as a duplicate of itself, and a long board text would violate the CHECK |
| Approval-mode message for new types | "별칭 후보는 승인 방식을 선택하지 않습니다." (the Phase 8 part-alias message is untouched) | as planned; noted because the two texts differ |
| Photo deletion failure after a review → message on the card | the review stays successful; the failure is logged and the reviewed card shows "사진 삭제" (retry) | the optimistic list removes the card on success, so a message there would never be seen; a retry button is a real recovery path |
| Plan §6 C (local n8n run) | skipped by Brad; `workflow-check.mjs` instead | no image download |
| `.env.local.example` gets the two variable names | names documented in `n8n/README.md` §2 instead | `.env.local.example` is git-ignored (`.env*`) and untracked. The local copy was edited, nothing is committed |
| Migration timestamps "UTC now" | `20261004100000`, `20261004110000` | must sort after Phase 8 `20261004090000`; the container clock was 2026-10-03 23:48 UTC |

## Test results

### A. pgTAP — 1168/1168 (`npx supabase test db`)

KI-14 before the fix (recorded output):
```
# Failed test 2: "KI-14: ADMIN can delete a part alias created by an approved AI candidate"
#     died: P0001: 이미 처리된 후보입니다.
# Failed test 3: "the alias is gone"            have: 1  want: 0
# Failed test 4: "result_alias_id was set to NULL by the FK"
Failed tests: 2-4
```
After: 9/9.

### B. E2E — app against the stub n8n (local stack + `next dev` + `n8n-stub.mjs`; temporary `.env.development.local`, **deleted**)

The browser pane was hidden, so steps were driven by DOM events and verified by page text, stub request log, DB and storage queries (as in Phases 0.6 / 8).

| Step | Result |
| --- | --- |
| TECHNICIAN → 부품 라벨·칩 마킹 → BQ24780S → photo (JPEG **with EXIF**) | "후보 1건을 올렸습니다 — 관리자 검토 대기 · 8T5 BQ780S"; skipped "BQ24780S — 이미 등록됨". Stub received only `request_id, photo_kind, target_label, image`; image WebP, no EXIF chunk. DB: 1 request (model `stub/vision`, execution id, uploader), 1 candidate (MARKING, rationale with confidence) |
| same photo again | "새로 올린 후보가 없습니다 · 이미 검토 대기 중: 8T5 BQ780S · 새 후보가 없어 사진은 저장하지 않았습니다." |
| stub `pii` | "[마스킹] — 개인정보로 보여 제외", nothing stored |
| `empty` / `bad-json` / `500` | "사진에서 읽을 수 있는 번호가 없습니다…" / "AI 응답을 해석할 수 없습니다." / "AI 사진 인식에 실패했습니다 (500)." |
| `slow` (60 s) | "AI 응답 시간이 초과되었습니다…" after 55 s; the chosen spec stays selected |
| wrong secret (stub → 403) | "AI 사진 인식 인증에 실패했습니다. 관리자에게 문의해 주세요." |
| 메인보드 번호 (BA92-21345A) | candidate BA41-02345A; "NM-D451 — 다른 대상의 별칭·번호 (LA-K091P)" |
| 기기 라벨 (NT950QED + variant OLED 터치) | candidate NT950QED-KC71S with variant; "15Z90T — 다른 대상의 별칭·번호 (LG 그램 15 15Z90T)" |
| storage after ~10 requests | exactly **3** objects (one per created request); failures left nothing |
| privacy | unsigned object URL 400; public URL 400; anonymous list `[]`; stored WebP without EXIF |
| RECEPTION | `/ai-photo` → `/dashboard`; no sidebar entry |
| session cookie deleted, then "인식 요청" | "로그인이 필요합니다. 다시 로그인해 주세요." |
| ADMIN → 기기 마스터 → AI 후보 | 3 cards: "사진 인식" badge, thumbnails loaded via signed URLs, target labels (incl. "삼성 갤럭시북 프로 360 NT950QED OLED 터치") |
| approve model alias; reject board alias without / with reason; approve part alias | "반려 사유를 입력해 주세요." then rejected; DB: aliases registered (model alias `source manual` with variant, part alias MARKING), reviewer + time; **all 3 photos deleted**; reviewed cards "사진 없음 (검토 후 삭제됨)" |
| 부품 규격 → delete alias "8T5 BQ780S" (KI-14) | deleted; candidate stays APPROVED, `result_alias_id` NULL |
| console / server log | no errors; only "Refresh Token Not Found" from the deliberate logouts |

### C. Workflow file — `node supabase/test-fixtures/phase9/workflow-check.mjs` → 20/20

- Structure:
  - node types and connections;
  - Webhook POST + Header Auth + respond via node;
  - D7 settings; inactive;
  - Q1 placeholders present; no secrets or project refs.
- Code "요청 구성": model placeholder, temperature 0, `json_object`, image + target hint; invalid kind / non-data-URL → error output (400).
- Code "응답 검증":
  - trims readings, drops empty ones, caps at 10;
  - unknown type → OTHER; confidence clamped / non-number → 0; empty note → null;
  - fenced JSON accepted; non-JSON → error output (502); empty readings pass through;
  - output passes the app's zod schema (contract).

### D. Static / advisors / snapshot / rollback — see Result.

## Production (Brad)

Nothing to do now. Phase 9 ships with the final release (`04-final-release-plan.md` rows 13–14, then §7).

1. Migrations in order (#13 KI-14, #14 Phase 9 — after Phase 8 #12), **then** the app.
2. §7 post-release checks:
   - import the new workflow;
   - fill the placeholders (model ID, credentials);
   - set the app variables;
   - one real photo;
   - three test photos;
   - timing;
   - OpenRouter privacy settings.
3. Optional (D9 / KI-15): Header Auth on the existing device-label webhook, app first.

## How Brad verifies locally

1. Run the database checks:
   ```bash
   npx supabase db reset
   npx supabase test db
   ```
   Expected: 1168 pass.
2. Run the workflow file check:
   ```bash
   node supabase/test-fixtures/phase9/workflow-check.mjs
   ```
   Expected: 20 × PASS.
3. App against the stub:
   1. Load the demo part spec:
      ```bash
      docker exec -i supabase_db_digital-rescue psql -U postgres -d postgres -X < supabase/test-fixtures/phase9/demo.sql
      ```
   2. Start the stub: `STUB_SECRET=<any value> node supabase/test-fixtures/phase9/n8n-stub.mjs`.
   3. Temporary `.env.development.local`:
      - local URL / keys from `npx supabase status`;
      - `N8N_RI_PHOTO_WEBHOOK_URL=http://127.0.0.1:5679/webhook/ri-photo-recognition`;
      - `N8N_RI_PHOTO_SECRET=<same value>`.
   4. `npm run dev` → `tech@example.test` → AI 사진 인식 → 부품 라벨·칩 마킹 → BQ24780S → any photo.
   5. `admin@example.test` → 기기 마스터 → AI 후보 → approve / reject.
   6. Other cases: `curl -X POST http://127.0.0.1:5679/__mode/<pii|empty|bad-json|500|slow>`.
   7. Delete `.env.development.local` afterwards.
4. Run the app checks:
   ```bash
   npm run typecheck && npm run lint && npm run build
   ```

## Known risks / notes

- **Photos leave the company.** In production the image goes to n8n → OpenRouter → the model provider, as the device-label photos already do.
  - EXIF is removed, but visible text in the photo (stickers, screens) is sent.
  - Mitigations: UI warning; PII-form readings never become aliases; photo deleted after review; this workflow does not save successful executions.
  - Residual: provider retention (OpenRouter settings, §7-9), and **failed executions keep the photo** in n8n until the instance-wide prune.
- **The real model is untested** (Q1 pending; D6 skipped). Prompt quality, misreads (O/0, I/1, 5/S) and the actual JSON shape are first seen in §7-2.
  - The app and the DB validate everything, so a bad model output leads to an error or to skipped readings, never to registration.
- **Header Auth rejection code** (401 vs 403) is still unverified — this was also the Phase 8 O2 question. The app treats both as "인증 실패".
- **Timing:** vision calls may take 10–40 s; `maxDuration = 60`, app timeout 55 s. The hosting platform's own limit is verified in §7-7.
- **Orphan photo** if a target (part spec / board / model) is deleted: the request row and its candidates cascade, the storage object stays. Rare; it can be deleted via the dashboard.
- The pending photos of candidates that are never reviewed stay until they are reviewed (D3). The 500-candidate cap bounds the number.
- A misread equal to another model's / board's alias is shown to the uploader as `CONFLICT` and is not proposed (global alias uniqueness).
- Still open (unchanged): KI-7, KI-9, KI-10, KI-11, KI-13; KI-15 recorded.
