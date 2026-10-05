-- =============================================================
-- Phase 8, O1 (a): temp_file_limit for vector_agent — LOCAL ONLY, run as a superuser.
-- temp_file_limit is a superuser-only parameter, so the migration (run as postgres) cannot set it.
--   docker exec -i supabase_db_digital-rescue psql -h 127.0.0.1 -U supabase_admin -d postgres -X < supabase/test-fixtures/phase8/temp_file_limit.sql
--   (inside the local container 127.0.0.1 is "trust" in pg_hba; no password)
-- Role settings are cluster-wide: they survive `supabase db reset`. Production: see docs/repair-intelligence/vector-integration.md.
-- =============================================================
ALTER ROLE vector_agent SET temp_file_limit = '10MB';
SELECT setconfig FROM pg_db_role_setting WHERE setrole = 'vector_agent'::regrole AND setdatabase = 0;
