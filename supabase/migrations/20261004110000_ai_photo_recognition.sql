-- =============================================================
-- Phase 9 — AI-assisted registration (사진 인식 → AI 후보). Plan: docs/repair-intelligence/phases/phase-9-plan.md
-- Adds: table public.ai_photo_requests, private bucket ai-photos (+ 3 storage policies), function public.ai_photo_propose.
-- Changes Phase 8 objects (plan §3.5, R2, approved 2026-10-04):
--   E1 ai_candidates.photo_request_id   E2 result_model_alias_id / result_board_alias_id   E3 part_spec_id DROP NOT NULL
--   E4 CHECK source + PHOTO   E5 CHECK candidate_type + MODEL_ALIAS / BOARD_ALIAS   E6 CHECK ai_candidates_shape
--   E7 CHECK ai_candidates_results   E8 PENDING dedup indexes   E9 ai_candidates_protect()   E10 ai_candidate_approve()
--   (+ CHECK ai_candidates_photo_source and FK ai_candidates_variant_model_fk — stricter, see the Phase 9 report)
-- Recognition output goes ONLY to ai_candidates (P8); nothing reaches aliases / specs / inventory without ADMIN approval.
-- No vector_api object is changed; vector_agent gets no grant on anything created here.
-- Rollback SQL: supabase/test-fixtures/phase9/rollback.sql
-- =============================================================

-- ---------- 1. table: ai_photo_requests (one row per photo that produced ≥ 1 new candidate) ----------
CREATE TABLE public.ai_photo_requests (
  id              uuid PRIMARY KEY,
  photo_kind      text NOT NULL CHECK (photo_kind IN ('PART', 'BOARD', 'DEVICE')),
  part_spec_id    uuid REFERENCES public.part_specs(id) ON DELETE CASCADE,
  model_id        uuid REFERENCES public.catalog_models(id) ON DELETE CASCADE,
  variant_id      uuid,
  board_id        uuid REFERENCES public.catalog_boards(id) ON DELETE CASCADE,
  storage_path    text NOT NULL UNIQUE,
  ai_model        text CHECK (ai_model IS NULL OR char_length(ai_model) <= 100),
  source_ref      text CHECK (source_ref IS NULL OR char_length(source_ref) <= 200),
  reading_count   integer NOT NULL CHECK (reading_count BETWEEN 1 AND 10),
  candidate_count integer NOT NULL CHECK (candidate_count >= 1),
  requested_by    uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_photo_requests_variant_fk FOREIGN KEY (variant_id, model_id)
    REFERENCES public.catalog_variants(id, model_id) ON DELETE CASCADE,
  CONSTRAINT ai_photo_requests_path CHECK (storage_path = id::text || '.webp'),
  CONSTRAINT ai_photo_requests_target CHECK (
    (photo_kind = 'PART'   AND part_spec_id IS NOT NULL AND num_nonnulls(model_id, variant_id, board_id) = 0) OR
    (photo_kind = 'BOARD'  AND board_id IS NOT NULL     AND num_nonnulls(part_spec_id, model_id, variant_id) = 0) OR
    (photo_kind = 'DEVICE' AND model_id IS NOT NULL     AND num_nonnulls(part_spec_id, board_id) = 0))
);
COMMENT ON TABLE public.ai_photo_requests IS 'AI 사진 인식 요청 (Phase 9) — 새 후보를 1건 이상 만든 사진만. 사진은 비공개 버킷 ai-photos, 경로만 저장';
COMMENT ON COLUMN public.ai_photo_requests.source_ref IS 'n8n 실행 ID (사진 인식 워크플로는 성공 실행을 저장하지 않음, D7)';
CREATE INDEX ai_photo_requests_part_spec_idx    ON public.ai_photo_requests (part_spec_id);
CREATE INDEX ai_photo_requests_model_idx        ON public.ai_photo_requests (model_id);
CREATE INDEX ai_photo_requests_variant_idx      ON public.ai_photo_requests (variant_id, model_id);
CREATE INDEX ai_photo_requests_board_idx        ON public.ai_photo_requests (board_id);
CREATE INDEX ai_photo_requests_requested_by_idx ON public.ai_photo_requests (requested_by);

ALTER TABLE public.ai_photo_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_photo_requests_select ON public.ai_photo_requests FOR SELECT TO authenticated
  USING (public.get_my_role() = 'ADMIN'::public.employee_role);
REVOKE ALL ON public.ai_photo_requests FROM anon, authenticated;
GRANT SELECT ON public.ai_photo_requests TO authenticated;

-- ---------- 2. ai_candidates (E1–E8) ----------
ALTER TABLE public.ai_candidates
  ADD COLUMN photo_request_id      uuid REFERENCES public.ai_photo_requests(id) ON DELETE CASCADE,
  ADD COLUMN result_model_alias_id uuid REFERENCES public.catalog_model_aliases(id) ON DELETE SET NULL,
  ADD COLUMN result_board_alias_id uuid REFERENCES public.catalog_board_aliases(id) ON DELETE SET NULL,
  ALTER COLUMN part_spec_id DROP NOT NULL,
  DROP CONSTRAINT ai_candidates_source_check,
  DROP CONSTRAINT ai_candidates_candidate_type_check,
  DROP CONSTRAINT ai_candidates_shape,
  DROP CONSTRAINT ai_candidates_results;
ALTER TABLE public.ai_candidates
  ADD CONSTRAINT ai_candidates_source_check CHECK (source IN ('VECTOR', 'PHOTO')),
  ADD CONSTRAINT ai_candidates_candidate_type_check
    CHECK (candidate_type IN ('COMPATIBILITY', 'PART_ALIAS', 'MODEL_ALIAS', 'BOARD_ALIAS')),
  ADD CONSTRAINT ai_candidates_shape CHECK (
    (candidate_type = 'COMPATIBILITY' AND part_spec_id IS NOT NULL
     AND target_type IS NOT NULL AND observed_status IS NOT NULL
     AND num_nonnulls(model_id, variant_id, board_id) = 1
     AND (target_type = 'MODEL') = (model_id IS NOT NULL)
     AND (target_type = 'VARIANT') = (variant_id IS NOT NULL)
     AND (target_type = 'BOARD') = (board_id IS NOT NULL)
     AND alias IS NULL AND alias_type IS NULL)
    OR
    (candidate_type = 'PART_ALIAS' AND part_spec_id IS NOT NULL
     AND target_type IS NULL AND observed_status IS NULL AND limitation_note IS NULL
     AND num_nonnulls(model_id, variant_id, board_id) = 0
     AND NULLIF(btrim(alias), '') IS NOT NULL AND alias_norm IS NOT NULL AND alias_type IS NOT NULL)
    OR
    (candidate_type = 'MODEL_ALIAS' AND model_id IS NOT NULL
     AND part_spec_id IS NULL AND board_id IS NULL
     AND target_type IS NULL AND observed_status IS NULL AND limitation_note IS NULL AND alias_type IS NULL
     AND NULLIF(btrim(alias), '') IS NOT NULL AND alias_norm IS NOT NULL)
    OR
    (candidate_type = 'BOARD_ALIAS' AND board_id IS NOT NULL
     AND part_spec_id IS NULL AND model_id IS NULL AND variant_id IS NULL
     AND target_type IS NULL AND observed_status IS NULL AND limitation_note IS NULL AND alias_type IS NULL
     AND NULLIF(btrim(alias), '') IS NOT NULL AND alias_norm IS NOT NULL AND char_length(alias) <= 100)),
  ADD CONSTRAINT ai_candidates_results CHECK (
    (result_evidence_id IS NULL OR (status = 'APPROVED' AND candidate_type = 'COMPATIBILITY'))
    AND (result_alias_id IS NULL OR (status = 'APPROVED' AND candidate_type = 'PART_ALIAS'))
    AND (result_model_alias_id IS NULL OR (status = 'APPROVED' AND candidate_type = 'MODEL_ALIAS'))
    AND (result_board_alias_id IS NULL OR (status = 'APPROVED' AND candidate_type = 'BOARD_ALIAS'))),
  ADD CONSTRAINT ai_candidates_photo_source CHECK ((source = 'PHOTO') = (photo_request_id IS NOT NULL)),
  -- MATCH SIMPLE: checked only when both are set (MODEL_ALIAS with a variant); VARIANT compatibility rows have model_id NULL
  ADD CONSTRAINT ai_candidates_variant_model_fk FOREIGN KEY (variant_id, model_id)
    REFERENCES public.catalog_variants(id, model_id) ON DELETE CASCADE;
COMMENT ON COLUMN public.ai_candidates.photo_request_id IS 'AI 사진 인식 요청 (source PHOTO, Phase 9)';

CREATE UNIQUE INDEX ai_candidates_pending_model_alias_key ON public.ai_candidates (model_id, alias_norm)
  WHERE status = 'PENDING' AND candidate_type = 'MODEL_ALIAS';
CREATE UNIQUE INDEX ai_candidates_pending_board_alias_key ON public.ai_candidates (board_id, alias_norm)
  WHERE status = 'PENDING' AND candidate_type = 'BOARD_ALIAS';
CREATE INDEX ai_candidates_photo_request_idx      ON public.ai_candidates (photo_request_id);
CREATE INDEX ai_candidates_model_alias_result_idx ON public.ai_candidates (result_model_alias_id);
CREATE INDEX ai_candidates_board_alias_result_idx ON public.ai_candidates (result_board_alias_id);
CREATE INDEX ai_candidates_variant_model_idx      ON public.ai_candidates (variant_id, model_id);

-- ---------- 3. E9: immutability trigger (+ photo_request_id; the KI-14 rule for all three result columns) ----------
CREATE OR REPLACE FUNCTION public.ai_candidates_protect() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF OLD.status <> 'PENDING' THEN
    -- KI-14: FK ON DELETE SET NULL after a created alias was deleted — the only change allowed on a processed candidate.
    -- Each result column is unchanged or set to NULL, at least one goes NULL, every other column is equal.
    -- alias_norm is generated (not yet computed in NEW of a BEFORE trigger); it follows alias, which is compared.
    IF (NEW.result_alias_id IS NULL OR NEW.result_alias_id = OLD.result_alias_id)
       AND (NEW.result_model_alias_id IS NULL OR NEW.result_model_alias_id = OLD.result_model_alias_id)
       AND (NEW.result_board_alias_id IS NULL OR NEW.result_board_alias_id = OLD.result_board_alias_id)
       AND ((OLD.result_alias_id IS NOT NULL AND NEW.result_alias_id IS NULL)
         OR (OLD.result_model_alias_id IS NOT NULL AND NEW.result_model_alias_id IS NULL)
         OR (OLD.result_board_alias_id IS NOT NULL AND NEW.result_board_alias_id IS NULL))
       AND (to_jsonb(NEW) - 'result_alias_id' - 'result_model_alias_id' - 'result_board_alias_id' - 'alias_norm')
         = (to_jsonb(OLD) - 'result_alias_id' - 'result_model_alias_id' - 'result_board_alias_id' - 'alias_norm') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION '이미 처리된 후보입니다.';
  END IF;
  IF ROW(NEW.id, NEW.candidate_type, NEW.source, NEW.part_spec_id, NEW.target_type, NEW.model_id, NEW.variant_id, NEW.board_id,
         NEW.observed_status, NEW.limitation_note, NEW.reference, NEW.alias, NEW.alias_type, NEW.rationale, NEW.source_ref,
         NEW.created_at, NEW.photo_request_id)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.candidate_type, OLD.source, OLD.part_spec_id, OLD.target_type, OLD.model_id, OLD.variant_id, OLD.board_id,
         OLD.observed_status, OLD.limitation_note, OLD.reference, OLD.alias, OLD.alias_type, OLD.rationale, OLD.source_ref,
         OLD.created_at, OLD.photo_request_id) THEN
    RAISE EXCEPTION 'AI 후보 내용은 수정할 수 없습니다.';
  END IF;
  IF NEW.status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'AI 후보 상태는 승인 또는 반려로만 바꿀 수 있습니다.';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- 4. E10: review RPC — COMPATIBILITY / PART_ALIAS branches byte-identical to Phase 8; + MODEL_ALIAS / BOARD_ALIAS ----------
CREATE OR REPLACE FUNCTION public.ai_candidate_approve(p_candidate_id uuid, p_approve_as text DEFAULT NULL,
                                            p_reference text DEFAULT NULL, p_note text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  c          ai_candidates;
  v_note     text := NULLIF(btrim(p_note), '');
  v_ref      text;
  v_res      jsonb;
  v_alias_id uuid;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '관리자만 AI 후보를 검토할 수 있습니다.';
  END IF;
  SELECT * INTO c FROM ai_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI 후보를 찾을 수 없습니다.';
  END IF;
  IF c.status <> 'PENDING' THEN
    RAISE EXCEPTION '이미 처리된 후보입니다.';
  END IF;
  IF char_length(v_note) > 500 THEN
    RAISE EXCEPTION '검토 메모는 500자 이내로 입력해 주세요.';
  END IF;

  IF c.candidate_type = 'COMPATIBILITY' THEN
    -- 문서 근거(documented) 또는 추정(inferred)만 — 실장(verified)·관리자 조정은 후보에서 만들 수 없다 (P4)
    IF p_approve_as IS NULL OR p_approve_as NOT IN ('DOCUMENT', 'INFERENCE') THEN
      RAISE EXCEPTION '승인 방식(문서 근거 / 추정)을 선택해 주세요.';
    END IF;
    v_ref := coalesce(NULLIF(btrim(p_reference), ''), NULLIF(btrim(c.reference), ''));
    IF char_length(v_ref) > 500 THEN
      RAISE EXCEPTION '출처는 500자 이내로 입력해 주세요.';
    END IF;
    IF p_approve_as = 'DOCUMENT' AND v_ref IS NULL THEN
      RAISE EXCEPTION '문서 근거로 승인하려면 출처를 입력해 주세요.';
    END IF;
    v_res := record_compatibility_result(c.part_spec_id, c.target_type, coalesce(c.model_id, c.variant_id, c.board_id),
                                         p_approve_as, c.observed_status, c.limitation_note, v_ref,
                                         'AI 후보(VECTOR) 승인' || coalesce(' — ' || v_note, ''));
    UPDATE ai_candidates
       SET status = 'APPROVED', approved_as = p_approve_as, result_evidence_id = (v_res->>'evidence_id')::uuid,
           reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
     WHERE id = c.id;
    RETURN jsonb_build_object('candidate_id', c.id, 'status', 'APPROVED', 'approved_as', p_approve_as,
                              'evidence_id', v_res->'evidence_id', 'compat_status', v_res->'status',
                              'confidence', v_res->'confidence');
  END IF;

  -- MODEL_ALIAS / BOARD_ALIAS (Phase 9, photo candidates) — no approval mode; aliases are globally unique in the catalog
  IF c.candidate_type IN ('MODEL_ALIAS', 'BOARD_ALIAS') THEN
    IF p_approve_as IS NOT NULL THEN
      RAISE EXCEPTION '별칭 후보는 승인 방식을 선택하지 않습니다.';
    END IF;
    IF c.candidate_type = 'MODEL_ALIAS' THEN
      IF EXISTS (SELECT 1 FROM catalog_model_aliases WHERE alias_norm = c.alias_norm AND model_id = c.model_id)
         OR EXISTS (SELECT 1 FROM catalog_models WHERE id = c.model_id AND name_norm = c.alias_norm) THEN
        RAISE EXCEPTION '이미 등록된 별칭입니다.';
      END IF;
      IF EXISTS (SELECT 1 FROM catalog_model_aliases WHERE alias_norm = c.alias_norm) THEN
        RAISE EXCEPTION '이미 다른 모델의 별칭으로 등록되어 있습니다.';
      END IF;
      INSERT INTO catalog_model_aliases (model_id, variant_id, alias, source, created_by)
      VALUES (c.model_id, c.variant_id, c.alias, 'manual', auth.uid())
      RETURNING id INTO v_alias_id;
      UPDATE ai_candidates
         SET status = 'APPROVED', result_model_alias_id = v_alias_id, reviewed_by = auth.uid(), reviewed_at = now(),
             review_note = v_note
       WHERE id = c.id;
      RETURN jsonb_build_object('candidate_id', c.id, 'status', 'APPROVED', 'model_alias_id', v_alias_id);
    END IF;
    IF EXISTS (SELECT 1 FROM catalog_board_aliases WHERE alias_norm = c.alias_norm AND board_id = c.board_id)
       OR EXISTS (SELECT 1 FROM catalog_boards WHERE id = c.board_id AND board_number_norm = c.alias_norm) THEN
      RAISE EXCEPTION '이미 등록된 별칭입니다.';
    END IF;
    IF EXISTS (SELECT 1 FROM catalog_board_aliases WHERE alias_norm = c.alias_norm)
       OR EXISTS (SELECT 1 FROM catalog_boards WHERE board_number_norm = c.alias_norm) THEN
      RAISE EXCEPTION '이미 다른 보드의 번호 또는 별칭으로 등록되어 있습니다.';
    END IF;
    INSERT INTO catalog_board_aliases (board_id, alias, created_by)
    VALUES (c.board_id, c.alias, auth.uid())
    RETURNING id INTO v_alias_id;
    UPDATE ai_candidates
       SET status = 'APPROVED', result_board_alias_id = v_alias_id, reviewed_by = auth.uid(), reviewed_at = now(),
           review_note = v_note
     WHERE id = c.id;
    RETURN jsonb_build_object('candidate_id', c.id, 'status', 'APPROVED', 'board_alias_id', v_alias_id);
  END IF;

  -- PART_ALIAS
  IF p_approve_as IS NOT NULL THEN
    RAISE EXCEPTION '부품 별칭 후보는 승인 방식을 선택하지 않습니다.';
  END IF;
  IF EXISTS (SELECT 1 FROM part_number_aliases WHERE part_spec_id = c.part_spec_id AND alias_norm = c.alias_norm) THEN
    RAISE EXCEPTION '이미 등록된 별칭입니다.';
  END IF;
  INSERT INTO part_number_aliases (part_spec_id, alias, alias_type)
  VALUES (c.part_spec_id, c.alias, c.alias_type)
  RETURNING id INTO v_alias_id;
  UPDATE ai_candidates
     SET status = 'APPROVED', result_alias_id = v_alias_id, reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
   WHERE id = c.id;
  RETURN jsonb_build_object('candidate_id', c.id, 'status', 'APPROVED', 'alias_id', v_alias_id);
END;
$$;
COMMENT ON FUNCTION public.ai_candidate_approve(uuid, text, text, text) IS
  'AI 후보 승인 (관리자): 호환성 → record_compatibility_result(DOCUMENT/INFERENCE), 부품 별칭 → part_number_aliases, 모델/보드 별칭(사진) → catalog_model_aliases / catalog_board_aliases. 검토자·시각 기록';

-- ---------- 5. storage: private bucket ai-photos (D3, D4) ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ai-photos', 'ai-photos', false, 10485760, ARRAY['image/webp'])
ON CONFLICT (id) DO NOTHING;

-- upload: the 4 staff roles (D4); read / delete: ADMIN (review, deletion after review) or the uploader (cleanup of a failed request)
CREATE POLICY ai_photos_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ai-photos'
              AND (public.get_my_role())::text = ANY (ARRAY['ADMIN', 'MANAGER', 'TECHNICIAN', 'EXPERT_REPAIR']));
CREATE POLICY ai_photos_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ai-photos'
         AND (public.get_my_role() = 'ADMIN'::public.employee_role OR owner_id = (SELECT auth.uid())::text));
CREATE POLICY ai_photos_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ai-photos'
         AND (public.get_my_role() = 'ADMIN'::public.employee_role OR owner_id = (SELECT auth.uid())::text));

-- ---------- 6. the only write path: readings of one photo → alias candidates for the chosen target ----------
CREATE FUNCTION public.ai_photo_propose(
  p_request_id uuid, p_photo_kind text, p_target_id uuid, p_variant_id uuid DEFAULT NULL,
  p_readings jsonb DEFAULT NULL, p_ai_model text DEFAULT NULL, p_source_ref text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, extensions
AS $$
DECLARE
  v_role    employee_role;
  v_model   text := NULLIF(btrim(p_ai_model), '');
  v_source  text := NULLIF(btrim(p_source_ref), '');
  v_r       jsonb;
  v_text    text;
  v_norm    text;
  v_detail  text;
  v_id      uuid;
  v_seen    text[] := '{}';
  v_new     jsonb := '[]';
  v_created jsonb := '[]';
  v_skipped jsonb := '[]';
  v_n       integer;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  v_role := get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'MANAGER', 'TECHNICIAN', 'EXPERT_REPAIR') THEN
    RAISE EXCEPTION 'AI 사진 인식 권한이 없습니다.';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION '사진 요청 ID가 없습니다.';
  END IF;
  IF p_photo_kind IS NULL OR p_photo_kind NOT IN ('PART', 'BOARD', 'DEVICE') THEN
    RAISE EXCEPTION '사진 종류(부품 라벨·칩 마킹 / 메인보드 번호 / 기기 라벨)를 선택해 주세요.';
  END IF;
  IF p_photo_kind <> 'DEVICE' AND p_variant_id IS NOT NULL THEN
    RAISE EXCEPTION '변형은 기기 라벨에서만 선택할 수 있습니다.';
  END IF;
  IF p_photo_kind = 'PART' AND (p_target_id IS NULL OR NOT EXISTS (SELECT 1 FROM part_specs WHERE id = p_target_id)) THEN
    RAISE EXCEPTION '부품 규격을 선택해 주세요.';
  END IF;
  IF p_photo_kind = 'BOARD' AND (p_target_id IS NULL OR NOT EXISTS (SELECT 1 FROM catalog_boards WHERE id = p_target_id)) THEN
    RAISE EXCEPTION '메인보드를 선택해 주세요.';
  END IF;
  IF p_photo_kind = 'DEVICE' THEN
    IF p_target_id IS NULL OR NOT EXISTS (SELECT 1 FROM catalog_models WHERE id = p_target_id) THEN
      RAISE EXCEPTION '모델을 선택해 주세요.';
    END IF;
    IF p_variant_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM catalog_variants WHERE id = p_variant_id AND model_id = p_target_id) THEN
      RAISE EXCEPTION '선택한 변형이 해당 모델에 속하지 않습니다.';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM ai_photo_requests WHERE id = p_request_id) THEN
    RAISE EXCEPTION '이미 처리된 사진 요청입니다.';
  END IF;
  IF char_length(v_model) > 100 THEN
    RAISE EXCEPTION 'AI 모델명은 100자 이내여야 합니다.';
  END IF;
  IF char_length(v_source) > 200 THEN
    RAISE EXCEPTION '실행 ID는 200자 이내로 입력해 주세요.';
  END IF;
  IF p_readings IS NULL OR jsonb_typeof(p_readings) <> 'array' OR jsonb_array_length(p_readings) = 0 THEN
    RAISE EXCEPTION '인식 결과가 없습니다.';
  END IF;
  IF jsonb_array_length(p_readings) > 10 THEN
    RAISE EXCEPTION '인식 결과는 10건까지 처리할 수 있습니다.';
  END IF;

  -- shape of every reading first: {text, type, confidence, note?}
  FOR v_r IN SELECT e FROM jsonb_array_elements(p_readings) AS t(e) LOOP
    IF jsonb_typeof(v_r) <> 'object' OR jsonb_typeof(v_r->'text') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION '인식 결과 형식이 올바르지 않습니다.';
    END IF;
    IF char_length(btrim(v_r->>'text')) > 150 THEN
      RAISE EXCEPTION '인식된 텍스트는 150자 이내여야 합니다.';
    END IF;
    IF (v_r->>'type') IS NULL OR (v_r->>'type') NOT IN ('PART_NUMBER', 'MARKING', 'BOARD_NUMBER', 'MODEL_NUMBER', 'OTHER') THEN
      RAISE EXCEPTION '인식 결과 종류가 올바르지 않습니다.';
    END IF;
    IF jsonb_typeof(v_r->'confidence') IS DISTINCT FROM 'number'
       OR (v_r->>'confidence')::numeric < 0 OR (v_r->>'confidence')::numeric > 1 THEN
      RAISE EXCEPTION '신뢰도는 0에서 1 사이 숫자여야 합니다.';
    END IF;
    IF v_r ? 'note' AND jsonb_typeof(v_r->'note') <> 'null'
       AND (jsonb_typeof(v_r->'note') <> 'string' OR char_length(v_r->>'note') > 300) THEN
      RAISE EXCEPTION '설명은 300자 이내 문자열이어야 합니다.';
    END IF;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtext('vector_api.propose'));   -- shared with the VECTOR proposals (dedup, 500 cap)

  FOR v_r IN SELECT e FROM jsonb_array_elements(p_readings) WITH ORDINALITY AS t(e, i) ORDER BY i LOOP
    v_text := btrim(v_r->>'text');
    v_norm := catalog_normalize(v_text);
    IF v_norm IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('text', v_text, 'reason', 'UNREADABLE', 'detail', NULL);
      CONTINUE;
    END IF;
    -- PII guard: anything the VECTOR masking would change (phone, e-mail, card, resident-number forms) never becomes an alias
    IF vector_api.mask_text(v_text) IS DISTINCT FROM v_text THEN
      v_skipped := v_skipped || jsonb_build_object('text', vector_api.mask_text(v_text), 'reason', 'PII', 'detail', NULL);
      CONTINUE;
    END IF;
    IF v_norm = ANY (v_seen) THEN
      v_skipped := v_skipped || jsonb_build_object('text', v_text, 'reason', 'REPEATED', 'detail', NULL);
      CONTINUE;
    END IF;
    v_seen := v_seen || v_norm;
    v_id := NULL;
    v_detail := NULL;

    IF p_photo_kind = 'PART' THEN
      IF EXISTS (SELECT 1 FROM part_specs WHERE id = p_target_id AND name_norm = v_norm)
         OR EXISTS (SELECT 1 FROM part_number_aliases WHERE part_spec_id = p_target_id AND alias_norm = v_norm) THEN
        v_skipped := v_skipped || jsonb_build_object('text', v_text, 'reason', 'ALREADY', 'detail', NULL);
        CONTINUE;
      END IF;
      SELECT id INTO v_id FROM ai_candidates
       WHERE status = 'PENDING' AND candidate_type = 'PART_ALIAS' AND part_spec_id = p_target_id AND alias_norm = v_norm;
    ELSIF p_photo_kind = 'BOARD' THEN
      IF EXISTS (SELECT 1 FROM catalog_boards WHERE id = p_target_id AND board_number_norm = v_norm)
         OR EXISTS (SELECT 1 FROM catalog_board_aliases WHERE board_id = p_target_id AND alias_norm = v_norm) THEN
        v_skipped := v_skipped || jsonb_build_object('text', v_text, 'reason', 'ALREADY', 'detail', NULL);
        CONTINUE;
      END IF;
      SELECT x.board_number INTO v_detail FROM (
        SELECT b.board_number FROM catalog_boards b WHERE b.board_number_norm = v_norm AND b.id <> p_target_id
        UNION ALL
        SELECT b.board_number FROM catalog_board_aliases a JOIN catalog_boards b ON b.id = a.board_id
         WHERE a.alias_norm = v_norm AND a.board_id <> p_target_id) x
       LIMIT 1;
      IF v_detail IS NOT NULL THEN
        v_skipped := v_skipped || jsonb_build_object('text', v_text, 'reason', 'CONFLICT', 'detail', v_detail);
        CONTINUE;
      END IF;
      IF char_length(v_text) > 100 THEN
        v_skipped := v_skipped || jsonb_build_object('text', v_text, 'reason', 'TOO_LONG', 'detail', NULL);
        CONTINUE;
      END IF;
      SELECT id INTO v_id FROM ai_candidates
       WHERE status = 'PENDING' AND candidate_type = 'BOARD_ALIAS' AND board_id = p_target_id AND alias_norm = v_norm;
    ELSE
      IF EXISTS (SELECT 1 FROM catalog_models WHERE id = p_target_id AND name_norm = v_norm)
         OR EXISTS (SELECT 1 FROM catalog_model_aliases WHERE model_id = p_target_id AND alias_norm = v_norm) THEN
        v_skipped := v_skipped || jsonb_build_object('text', v_text, 'reason', 'ALREADY', 'detail', NULL);
        CONTINUE;
      END IF;
      SELECT concat_ws(' ', br.name, m.name) INTO v_detail
        FROM catalog_model_aliases a JOIN catalog_models m ON m.id = a.model_id JOIN catalog_brands br ON br.id = m.brand_id
       WHERE a.alias_norm = v_norm AND a.model_id <> p_target_id
       LIMIT 1;
      IF v_detail IS NOT NULL THEN
        v_skipped := v_skipped || jsonb_build_object('text', v_text, 'reason', 'CONFLICT', 'detail', v_detail);
        CONTINUE;
      END IF;
      SELECT id INTO v_id FROM ai_candidates
       WHERE status = 'PENDING' AND candidate_type = 'MODEL_ALIAS' AND model_id = p_target_id AND alias_norm = v_norm;
    END IF;

    IF v_id IS NOT NULL THEN
      v_created := v_created || jsonb_build_object('candidate_id', v_id, 'alias', v_text, 'duplicate', true);
      CONTINUE;
    END IF;
    v_new := v_new || jsonb_build_object('text', v_text, 'type', v_r->'type', 'confidence', v_r->'confidence', 'note', v_r->'note');
  END LOOP;

  v_n := jsonb_array_length(v_new);
  IF v_n > 0 THEN
    IF (SELECT count(*) FROM ai_candidates WHERE status = 'PENDING') + v_n > 500 THEN
      RAISE EXCEPTION '검토 대기 중인 AI 후보가 500건이라 더 제안할 수 없습니다. 관리자 검토 후 다시 제안해 주세요.';
    END IF;
    INSERT INTO ai_photo_requests (id, photo_kind, part_spec_id, model_id, variant_id, board_id, storage_path,
                                   ai_model, source_ref, reading_count, candidate_count)
    VALUES (p_request_id, p_photo_kind,
            CASE WHEN p_photo_kind = 'PART' THEN p_target_id END,
            CASE WHEN p_photo_kind = 'DEVICE' THEN p_target_id END,
            CASE WHEN p_photo_kind = 'DEVICE' THEN p_variant_id END,
            CASE WHEN p_photo_kind = 'BOARD' THEN p_target_id END,
            p_request_id::text || '.webp', v_model, v_source, jsonb_array_length(p_readings), v_n);
    FOR v_r IN SELECT e FROM jsonb_array_elements(v_new) WITH ORDINALITY AS t(e, i) ORDER BY i LOOP
      INSERT INTO ai_candidates (candidate_type, source, photo_request_id, part_spec_id, model_id, variant_id, board_id,
                                 alias, alias_type, rationale, source_ref)
      VALUES (CASE p_photo_kind WHEN 'PART' THEN 'PART_ALIAS' WHEN 'BOARD' THEN 'BOARD_ALIAS' ELSE 'MODEL_ALIAS' END,
              'PHOTO', p_request_id,
              CASE WHEN p_photo_kind = 'PART' THEN p_target_id END,
              CASE WHEN p_photo_kind = 'DEVICE' THEN p_target_id END,
              CASE WHEN p_photo_kind = 'DEVICE' THEN p_variant_id END,
              CASE WHEN p_photo_kind = 'BOARD' THEN p_target_id END,
              v_r->>'text',
              CASE WHEN p_photo_kind = 'PART' THEN CASE WHEN v_r->>'type' = 'MARKING' THEN 'MARKING' ELSE 'PART_NUMBER' END END,
              format('사진 인식 · %s · 신뢰도 %s', v_r->>'type', to_char((v_r->>'confidence')::numeric, 'FM0.00'))
                || coalesce(' · ' || vector_api.mask_text(NULLIF(btrim(v_r->>'note'), '')), ''),
              v_source)
      RETURNING id INTO v_id;
      v_created := v_created || jsonb_build_object('candidate_id', v_id, 'alias', v_r->>'text', 'duplicate', false);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('request_id', CASE WHEN v_n > 0 THEN p_request_id END,
                            'created', v_created, 'skipped', v_skipped);
END;
$$;
COMMENT ON FUNCTION public.ai_photo_propose(uuid, text, uuid, uuid, jsonb, text, text) IS
  'AI 사진 인식 결과 → 대상(부품 규격/보드/모델)의 별칭 후보 (ai_candidates, PENDING). 개인정보 형태·기존 별칭·다른 대상 별칭은 제외. 직원 4역할';

-- ---------- 7. function privileges (R10: exposed schema → hint roles get EXECUTE, refusal inside) ----------
REVOKE ALL ON FUNCTION public.ai_photo_propose(uuid, text, uuid, uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_photo_propose(uuid, text, uuid, uuid, jsonb, text, text) TO anon, authenticated, service_role;
