-- Phase 3 rollback (see docs/repair-intelligence/phases/phase-3-report.md → Rollback).
-- Run AFTER reverting the app (git revert <phase-3 commit>). All part-spec / compatibility data is lost.
BEGIN;
DROP VIEW IF EXISTS public.compatibility_summary;
DROP FUNCTION IF EXISTS public.part_spec_search(text, integer);
DROP FUNCTION IF EXISTS public.part_spec_create(text, text, text, text);
DROP FUNCTION IF EXISTS public.retract_compatibility_evidence(uuid, text);
DROP FUNCTION IF EXISTS public.record_part_install_result(uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.record_compatibility_result(uuid, text, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.ri_compatibility_row(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.ri_recompute_compatibility(uuid);
ALTER TABLE public.ticket_removed_parts DROP COLUMN IF EXISTS part_spec_id;  -- drops its FK, index and column grants
ALTER TABLE public.inventory_items      DROP COLUMN IF EXISTS part_spec_id;
DROP TABLE IF EXISTS public.compatibility_evidence, public.part_compatibility,
  public.part_number_aliases, public.part_specs, public.interchange_groups;
DROP FUNCTION IF EXISTS public.part_set_updated_at();
COMMIT;
