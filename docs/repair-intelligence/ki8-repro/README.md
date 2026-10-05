# KI-8 reproduction kit

> ## ⚠️ 운영 프로젝트에서 절대 실행 금지 — 일회용 테스트 프로젝트 전용
> ## ⚠️ NEVER RUN ON A PRODUCTION PROJECT — THROW-AWAY TEST PROJECT ONLY
> The reproduction crashes a Postgres backend, and the database restarts **all** connections.
> Use a brand-new free project and delete it afterwards. Never paste the production project ref or keys into these commands.

Background: `known-issues.md` KI-8, `supabase-support-report.md`.

## Steps (free throw-away project)

1. supabase.com → **New project** (free plan), e.g. `ki8-repro-throwaway`. Wait until it is healthy.
2. **SQL Editor** (runs as `postgres`): paste and run `repro.sql`.
   Expected bug: the editor reports a lost connection / error, and **Logs → Postgres** shows `terminated by signal 11`.
3. **The one `curl`** — the same reproduction through the Management API SQL endpoint, which also runs as `postgres`.
   Create a personal access token under Account → Access Tokens and delete it afterwards.
   Replace the placeholders **with the throw-away project only**:

   ```bash
   curl -sS -X POST "https://api.supabase.com/v1/projects/<THROWAWAY_PROJECT_REF>/database/query" -H "Authorization: Bearer <PERSONAL_ACCESS_TOKEN>" -H "Content-Type: application/json" -d '{"query":"DROP FUNCTION IF EXISTS public.ki8_probe(); CREATE FUNCTION public.ki8_probe() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$; REVOKE ALL ON FUNCTION public.ki8_probe() FROM PUBLIC, anon, authenticated, service_role; SET ROLE anon; SELECT public.ki8_probe();"}'
   ```

   - **Bug:** the request fails with a server / connection error and the Postgres log shows `signal 11`.
   - **Fixed:** `{"message":"… permission denied for function ki8_probe"}`.
4. Optional, shows that the REST path is safe. Use the throw-away project's anon key; run `NOTIFY pgrst, 'reload schema';` in the SQL Editor first:

   ```bash
   curl -sS -X POST "https://<THROWAWAY_PROJECT_REF>.supabase.co/rest/v1/rpc/ki8_probe" -H "apikey: <THROWAWAY_ANON_KEY>" -H "Authorization: Bearer <THROWAWAY_ANON_KEY>" -H "Content-Type: application/json" -d '{}'
   ```

   Expected: HTTP 401 `permission denied for function ki8_probe`, and no crash.
5. **Delete the project** (Settings → General → Delete project) and the access token.

## Local alternative (no Supabase account)

```bash
docker run -d --name ki8-probe -e POSTGRES_PASSWORD=probe-local-only public.ecr.aws/supabase/postgres:17.6.1.104
```

Wait about a minute, then run `repro.sql` with `docker exec -i -e PGPASSWORD=probe-local-only ki8-probe psql -h localhost -U postgres -d postgres < repro.sql`.
Remove the container afterwards with `docker rm -f ki8-probe`.
