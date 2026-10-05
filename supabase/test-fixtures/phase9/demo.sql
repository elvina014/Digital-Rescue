-- Phase 9 — local demo data for the E2E with n8n-stub.mjs (fake values only; removed by `npx supabase db reset`).
-- Run: docker exec -i supabase_db_digital-rescue psql -U postgres -d postgres -X < supabase/test-fixtures/phase9/demo.sql
INSERT INTO public.part_specs (id, part_type, name, compat_target)
VALUES ('00000000-0000-4000-9930-000000000001', 'IC', 'BQ24780S', 'BOARD')
ON CONFLICT DO NOTHING;
