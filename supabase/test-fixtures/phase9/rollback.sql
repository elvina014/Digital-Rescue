-- =============================================================
-- Phase 9 rollback (local rehearsal / Brad). App first: git revert <phase-9 commit>.
-- Removes everything created by 20261004110000_ai_photo_recognition.sql and restores the Phase 8 objects it changed:
--   ai_candidate_approve → the Phase 8 body (verbatim), ai_candidates_protect → the KI-14 body (20261004100000),
--   ai_candidates columns / CHECKs / indexes → Phase 8.
-- Deletes ONLY rows created by Phase 9 (source PHOTO / the two new candidate types) (R9).
-- Aliases created by approvals STAY (ordinary Phase 1 / Phase 3 data), like Phase 8.
-- Afterwards: empty and delete the bucket `ai-photos` through the Storage API / dashboard (as Phase 4):
--   storage.buckets / storage.objects must not be changed with SQL.
-- =============================================================
BEGIN;
DELETE FROM public.ai_candidates WHERE source = 'PHOTO' OR candidate_type IN ('MODEL_ALIAS', 'BOARD_ALIAS');
DROP FUNCTION IF EXISTS public.ai_photo_propose(uuid, text, uuid, uuid, jsonb, text, text);
DROP POLICY IF EXISTS ai_photos_storage_insert ON storage.objects;
DROP POLICY IF EXISTS ai_photos_storage_select ON storage.objects;
DROP POLICY IF EXISTS ai_photos_storage_delete ON storage.objects;

-- E10: Phase 8 body of ai_candidate_approve (verbatim from 20261004090000_vector_integration.sql)
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
  'AI 후보 승인 (관리자): 호환성 → record_compatibility_result(DOCUMENT/INFERENCE), 별칭 → part_number_aliases. 검토자·시각 기록';

-- E9: KI-14 body of ai_candidates_protect (verbatim from 20261004100000_ki14_ai_candidates_result_delete.sql)
CREATE OR REPLACE FUNCTION public.ai_candidates_protect() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF OLD.status <> 'PENDING' THEN
    -- KI-14: FK ON DELETE SET NULL after the created alias was deleted — the only change allowed on a processed candidate.
    -- alias_norm is generated (not yet computed in NEW of a BEFORE trigger); it follows alias, which is compared.
    IF OLD.result_alias_id IS NOT NULL AND NEW.result_alias_id IS NULL
       AND (to_jsonb(NEW) - 'result_alias_id' - 'alias_norm') = (to_jsonb(OLD) - 'result_alias_id' - 'alias_norm') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION '이미 처리된 후보입니다.';
  END IF;
  IF ROW(NEW.id, NEW.candidate_type, NEW.source, NEW.part_spec_id, NEW.target_type, NEW.model_id, NEW.variant_id, NEW.board_id,
         NEW.observed_status, NEW.limitation_note, NEW.reference, NEW.alias, NEW.alias_type, NEW.rationale, NEW.source_ref,
         NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.candidate_type, OLD.source, OLD.part_spec_id, OLD.target_type, OLD.model_id, OLD.variant_id, OLD.board_id,
         OLD.observed_status, OLD.limitation_note, OLD.reference, OLD.alias, OLD.alias_type, OLD.rationale, OLD.source_ref,
         OLD.created_at) THEN
    RAISE EXCEPTION 'AI 후보 내용은 수정할 수 없습니다.';
  END IF;
  IF NEW.status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'AI 후보 상태는 승인 또는 반려로만 바꿀 수 있습니다.';
  END IF;
  RETURN NEW;
END;
$$;

-- E1–E8 (+ photo_source CHECK, variant/model FK)
DROP INDEX IF EXISTS public.ai_candidates_pending_model_alias_key, public.ai_candidates_pending_board_alias_key,
  public.ai_candidates_photo_request_idx, public.ai_candidates_model_alias_result_idx,
  public.ai_candidates_board_alias_result_idx, public.ai_candidates_variant_model_idx;
ALTER TABLE public.ai_candidates
  DROP CONSTRAINT ai_candidates_variant_model_fk,
  DROP CONSTRAINT ai_candidates_photo_source,
  DROP CONSTRAINT ai_candidates_results,
  DROP CONSTRAINT ai_candidates_shape,
  DROP CONSTRAINT ai_candidates_candidate_type_check,
  DROP CONSTRAINT ai_candidates_source_check,
  DROP COLUMN photo_request_id,
  DROP COLUMN result_model_alias_id,
  DROP COLUMN result_board_alias_id,
  ALTER COLUMN part_spec_id SET NOT NULL;
-- Phase 8 CHECK texts (verbatim from 20261004090000_vector_integration.sql)
ALTER TABLE public.ai_candidates
  ADD CONSTRAINT ai_candidates_source_check CHECK (source IN ('VECTOR')),
  ADD CONSTRAINT ai_candidates_candidate_type_check CHECK (candidate_type IN ('COMPATIBILITY', 'PART_ALIAS')),
  ADD CONSTRAINT ai_candidates_shape CHECK (
    (candidate_type = 'COMPATIBILITY'
     AND target_type IS NOT NULL AND observed_status IS NOT NULL
     AND num_nonnulls(model_id, variant_id, board_id) = 1
     AND (target_type = 'MODEL') = (model_id IS NOT NULL)
     AND (target_type = 'VARIANT') = (variant_id IS NOT NULL)
     AND (target_type = 'BOARD') = (board_id IS NOT NULL)
     AND alias IS NULL AND alias_type IS NULL)
    OR
    (candidate_type = 'PART_ALIAS'
     AND target_type IS NULL AND observed_status IS NULL AND limitation_note IS NULL
     AND num_nonnulls(model_id, variant_id, board_id) = 0
     AND NULLIF(btrim(alias), '') IS NOT NULL AND alias_norm IS NOT NULL AND alias_type IS NOT NULL)),
  ADD CONSTRAINT ai_candidates_results CHECK (
    (result_evidence_id IS NULL OR (status = 'APPROVED' AND candidate_type = 'COMPATIBILITY'))
    AND (result_alias_id IS NULL OR (status = 'APPROVED' AND candidate_type = 'PART_ALIAS')));

DROP TABLE IF EXISTS public.ai_photo_requests;   -- drops its policy and indexes
COMMIT;
