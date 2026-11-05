-- =============================================================
-- Click Guard: 보존 기간(90일) 지난 광고 유입·참여도 기록을 매일 삭제하는 pg_cron 작업
--
-- 실행 주체: Brad (Supabase 대시보드 SQL Editor). 마이그레이션에는 넣지 않는다.
-- 전제: 20261106090000_click_guard_mvp.sql 적용 완료, pg_cron 확장 활성화
--       (대시보드 Database → Extensions → pg_cron).
-- 시각: 매일 03:30 KST = 18:30 UTC (pg_cron은 UTC 기준)
--
-- cg_purge_old는 service_role이 아니면 거부한다(R10). pg_cron은 postgres로 실행되어 auth.role()이 NULL이므로,
-- 같은 트랜잭션 안에서 request.jwt.claims를 service_role로 설정한 뒤 호출한다.
-- (한 명령 문자열의 여러 문장은 하나의 트랜잭션으로 실행되고, set_config(..., true)는 그 트랜잭션에만 적용된다)
-- =============================================================

SELECT cron.schedule(
  'click-guard-purge',
  '30 18 * * *',
  $cmd$
    SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
    SELECT public.cg_purge_old(90);
  $cmd$
);

-- 확인
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'click-guard-purge';
--   SELECT status, return_message, start_time FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'click-guard-purge')
--    ORDER BY start_time DESC LIMIT 5;
--
-- 해제
--   SELECT cron.unschedule('click-guard-purge');
