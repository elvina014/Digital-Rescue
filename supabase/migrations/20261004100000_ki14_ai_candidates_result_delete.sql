-- =============================================================
-- KI-14 fix (Phase 9 decision D5) — separate from the Phase 9 migration.
-- ai_candidates.result_alias_id is ON DELETE SET NULL. The FK action is an UPDATE and fired ai_candidates_protect,
-- which refuses every update of a processed candidate → an alias created by an approved AI candidate could not be deleted.
-- Change: CREATE OR REPLACE public.ai_candidates_protect() — on a processed candidate, an UPDATE whose ONLY change is
-- result_alias_id → NULL is allowed (all other columns equal; the generated alias_norm follows alias). Everything else of the Phase 8 body is unchanged (same name, signature, grants, trigger).
-- Rollback SQL: supabase/test-fixtures/ki14/rollback.sql (Phase 8 body, verbatim)
-- Test: supabase/tests/ki14_ai_candidate_result_delete.test.sql
-- =============================================================
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
