-- =============================================================
-- Phase 8 rollback (local rehearsal / Brad). App first: git revert <phase-8 commit>.
-- Removes everything created by 20261004090000_vector_integration.sql.
-- Knowledge created by approvals (compatibility_evidence rows, part_number_aliases) STAYS: it is ordinary Phase 3 data,
-- provenance note "AI 후보(VECTOR) 승인". Candidates (pending / rejected history) are lost.
-- =============================================================
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
DROP FUNCTION IF EXISTS vector_api.compat_row(jsonb);
DROP FUNCTION IF EXISTS vector_api.compat_order(text);
DROP FUNCTION IF EXISTS vector_api.mask_text(text, text);
DROP FUNCTION IF EXISTS vector_api.require_agent();
DROP TABLE IF EXISTS public.ai_candidates;             -- drops its trigger, policies and indexes
DROP FUNCTION IF EXISTS public.ai_candidates_protect();
DROP SCHEMA IF EXISTS vector_api;
COMMIT;

-- The role is cluster-wide: drop it separately once no connection uses it
-- (production: first ALTER ROLE vector_agent NOLOGIN and stop the n8n workflow).
REVOKE vector_agent FROM postgres;
DROP ROLE IF EXISTS vector_agent;
