-- Catalog parity: production (MCP, SELECT only) vs local baseline
-- (`npx supabase db reset --version 20260927141005 --no-seed`).
-- Each row: category, count, md5 of the sorted definition lines. Run the same text on both sides.
-- Allowed difference: extensions (local stack adds pg_graphql) — see rehearsal-report.md (a).
-- Function bodies are compared without CR: a Windows checkout stores CRLF bodies.
with
fn as (
  select p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
tbl as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'S')
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
),
lines(category, line) as (
  select 'columns', table_name || '.' || column_name || '=' || data_type || '|' || udt_name || '|' || is_nullable
         || '|' || coalesce(column_default, '') || '|' || coalesce(character_maximum_length::text, '')
    from information_schema.columns where table_schema = 'public'
  union all
  select 'enums', t.typname || '=' || string_agg(e.enumlabel, ',' order by e.enumsortorder)
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' group by t.typname
  union all
  select 'functions', fn.proname || '(' || fn.args || ')=' || p.prosecdef || '|' || coalesce(p.proconfig::text, '')
         || '|' || coalesce(p.proacl::text, '') || '|' || md5(replace(p.prosrc, E'\r', ''))
    from fn join pg_proc p on p.oid = fn.oid
  union all
  select 'triggers', c.relname || '.' || t.tgname || '=' || pg_get_triggerdef(t.oid) || '|' || t.tgenabled::text
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
  union all
  select 'rls', relname || '=' || relrowsecurity || '|' || relforcerowsecurity from tbl where relkind in ('r', 'p')
  union all
  select 'policies', schemaname || '.' || tablename || '.' || policyname || '=' || permissive || '|' || cmd || '|'
         || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
    from pg_policies where schemaname in ('public', 'storage')
  union all
  select 'indexes', tablename || '.' || indexname || '=' || indexdef from pg_indexes where schemaname = 'public'
  union all
  select 'constraints', c.relname || '.' || k.conname || '=' || pg_get_constraintdef(k.oid)
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
  union all
  select 'table_comments', c.relname || '.' || coalesce(a.attname, '') || '=' || d.description
    from pg_description d join pg_class c on c.oid = d.objoid and d.classoid = 'pg_class'::regclass
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid and d.objsubid > 0
   where n.nspname = 'public'
  union all
  select 'function_comments', fn.proname || '(' || fn.args || ')=' || d.description
    from fn join pg_description d on d.objoid = fn.oid and d.classoid = 'pg_proc'::regclass
  union all
  select 'table_acls', relname || '=' || coalesce(relacl::text, '') from tbl
  union all
  select 'buckets', id || '=' || public || '|' || coalesce(file_size_limit::text, '') || '|'
         || coalesce(allowed_mime_types::text, '')
    from storage.buckets
  union all
  select 'extensions', e.extname || '=' || n.nspname
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
)
select category, count(*) as n, md5(string_agg(line, E'\n' order by line)) as hash
  from lines group by category order by category;
