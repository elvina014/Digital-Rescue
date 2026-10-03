# Supabase support report — Postgres backend segfault in `supautils` permission hints

> ## ⚠️ NEVER RUN THE REPRODUCTION ON A PRODUCTION PROJECT
> **Throw-away test project only.** The reproduction kills a backend with signal 11, and the postmaster then restarts **all**
> connections of the database. Create a new free project for it, and delete that project afterwards.

*(Prepared 2026-10-03. No project id, URL, key or customer data is included on purpose.)*

## Summary

When a role listed in `supautils.hint_roles` (default `anon, authenticated, service_role`) calls a **function** it has no EXECUTE
privilege on, the backend crashes with **signal 11 (segmentation fault)** instead of raising
`ERROR: permission denied for function …`. Postgres then restarts all backends of the cluster.

The crash happens only in sessions where `supautils` is loaded: `session_preload_libraries = 'supautils'`.
In our tests, PostgREST sessions were not affected, because the `authenticator` role overrides `session_preload_libraries`
with `safeupdate`. Sessions that log in as `postgres` (SQL Editor including "Run as role", direct / pooler connections,
Management API SQL endpoint, migrations, pgTAP) are affected.

## Environment

| Item | Value |
| --- | --- |
| Image (reproduced) | `public.ecr.aws/supabase/postgres:17.6.1.104` (local Supabase CLI stack and a standalone container), x86_64 |
| Hosted project (same configuration, **not** tested on purpose) | PostgreSQL 17.6, aarch64 |
| `shared_preload_libraries` | `pg_stat_statements, pgaudit, plpgsql, plpgsql_check, pg_cron, pg_net, pgsodium, auto_explain, pg_tle, plan_filter, supabase_vault` |
| `session_preload_libraries` | `supautils` |
| `supautils.hint_roles` | `anon, authenticated, service_role` |
| `authenticator.rolconfig` | `session_preload_libraries=safeupdate, statement_timeout=8s, lock_timeout=8s` |

## Reproduction (as `postgres`, e.g. SQL Editor of a throw-away project)

```sql
-- !!! throw-away test project only !!!
CREATE FUNCTION public.ki8_probe() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
REVOKE ALL ON FUNCTION public.ki8_probe() FROM PUBLIC, anon, authenticated, service_role;
SET ROLE anon;
SELECT public.ki8_probe();
```

**Expected:** `ERROR: permission denied for function ki8_probe` (SQLSTATE 42501), optionally with a supautils hint.

**Actual:** the connection is lost ("server closed the connection unexpectedly"). Postmaster log:

```
LOG:  server process (PID …) was terminated by signal 11: Segmentation fault
DETAIL:  Failed process was running: SELECT public.ki8_probe();
LOG:  terminating any other active server processes
LOG:  all server processes terminated; reinitializing
LOG:  database system was not properly shut down; automatic recovery in progress
```

Cleanup afterwards: `DROP FUNCTION public.ki8_probe();`

## Isolation (standalone container, same image)

| # | Setup | Result |
| --- | --- | --- |
| 1 | default configuration, `SET ROLE anon`, call the revoked function | **crash** |
| 2 | each of `plpgsql_check`, `plan_filter`, `pg_tle`, `auto_explain`, `pg_stat_statements` removed from `shared_preload_libraries` in turn | still crashes |
| 3 | `session_preload_libraries = ''` (no `supautils`) | clean `ERROR: permission denied for function` |
| 4 | same server as #3, `supautils` loaded for one connection (`PGOPTIONS='-c session_preload_libraries=supautils'`) | **crash** |
| 5 | `supautils` loaded, a role **not** in `hint_roles` | clean error |
| 6 | `supautils` loaded, `anon` / `authenticated` / `service_role` | **crash** for each |
| 7 | `supautils` loaded, `anon`, **table** privilege error | no crash; hint "Grant the required privileges to the current role with: GRANT SELECT ON public.t TO anon;" |
| 8 | PostgREST v16.3 (`authenticator` login), anon / user JWT / service_role calling revoked functions | `401` / `403` `permission denied for function`, **no crash** |

**Conclusion:** the crash is in the `supautils` "enhanced permission hints" path (`hint_roles_check_hook` in `supautils.so`).
It happens while it builds the hint for a **function** (routine) privilege error. Table errors work.

## Impact

- Any operator using "Run as role" in the SQL Editor and calling a function the impersonated role cannot execute restarts the database.
  The same applies to scripts that `SET ROLE anon|authenticated|service_role` in a `postgres` session (tests, migrations).
- REST traffic (anon key, user JWTs) is not affected **as long as** `authenticator` keeps its `session_preload_libraries` override.

## Requests

1. Please confirm the bug and the `supautils` version / image that fixes it.
2. Until then: is it possible to clear `supautils.hint_roles` for a project? It is a managed SIGHUP setting that `postgres` cannot change.
3. Please confirm that `authenticator`'s `session_preload_libraries` override is intended to stay. Our risk assessment depends on it.

## Our workaround

We no longer withhold EXECUTE on functions in exposed schemas. Functions are granted to `anon`, `authenticated` and `service_role`
and refuse unwanted callers inside the function body (SQLSTATE 42501 with a custom message, which does not crash).
