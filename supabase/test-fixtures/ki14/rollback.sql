-- =============================================================
-- KI-14 rollback (local rehearsal / Brad): restore the Phase 8 body of ai_candidates_protect, verbatim
-- (from 20261004090000_vector_integration.sql). Grants and the trigger are unchanged by CREATE OR REPLACE.
-- Run BEFORE the Phase 8 rollback, and AFTER the Phase 9 rollback (which restores the KI-14 body).
-- =============================================================
BEGIN;
CREATE OR REPLACE FUNCTION public.ai_candidates_protect() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF OLD.status <> 'PENDING' THEN
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
COMMIT;
