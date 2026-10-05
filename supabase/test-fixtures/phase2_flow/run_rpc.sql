-- Runs the same scenario steps as the UI run, through the new RPCs, as the same users.
--   docker exec -i supabase_db_digital-rescue psql -U postgres -v ON_ERROR_STOP=1 < run_rpc.sql
BEGIN;
-- 1. technician (a…04) registers an extracted part on e…02 (picks 저장장치 / M.2 NVMe / WD / 256GB)
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.register_return_material('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-b100-000000000002', 'M.2 NVMe', 'WD', '중고품', 1, '256GB');
RESET ROLE;
-- 2. manager (a…02) confirms returns, then approves inbounds
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT public.confirm_material_return('00000000-0000-4000-e000-000000000007');
SELECT public.confirm_material_return('00000000-0000-4000-e000-000000000021');
SELECT public.approve_return_material('00000000-0000-4000-e000-000000000005');
SELECT public.approve_return_material('00000000-0000-4000-e000-000000000022');
SELECT public.approve_return_material('00000000-0000-4000-e000-000000000023');
SELECT public.approve_return_material('00000000-0000-4000-e000-000000000024');
SELECT public.approve_return_material('00000000-0000-4000-e000-000000000025');
SELECT public.approve_return_material('00000000-0000-4000-e000-000000000002');
RESET ROLE;
COMMIT;
