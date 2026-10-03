-- !!! NEVER RUN ON A PRODUCTION PROJECT — THROW-AWAY TEST PROJECT ONLY !!!
-- !!! 운영 프로젝트에서 절대 실행 금지 — 일회용 테스트 프로젝트 전용 !!!
-- KI-8 reproduction: a supautils hint role calling a function without EXECUTE kills the backend (signal 11)
-- and restarts every connection of the database. Run as postgres (SQL Editor) in a new free project, then delete the project.

CREATE FUNCTION public.ki8_probe() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
REVOKE ALL ON FUNCTION public.ki8_probe() FROM PUBLIC, anon, authenticated, service_role;

SET ROLE anon;
SELECT public.ki8_probe();   -- expected: ERROR 42501 permission denied; actual (bug): connection lost, DB restarts
RESET ROLE;

-- cleanup (new connection after the restart):
-- DROP FUNCTION public.ki8_probe();
