-- Produces a single-row JSON report with schema, policies, functions and storage bucket info
with tables as (
  select
    c.table_schema,
    c.table_name,
    json_agg(json_build_object(
      'column_name', c.column_name,
      'data_type', c.data_type,
      'is_nullable', c.is_nullable,
      'column_default', c.column_default
    ) order by c.ordinal_position) as columns
  from information_schema.columns c
  where c.table_schema in ('core')
  group by c.table_schema, c.table_name
  order by c.table_schema, c.table_name
),
constraints as (
  select
    n.nspname as table_schema,
    cls.relname as table_name,
    con.conname as constraint_name,
    con.contype as type,
    pg_get_constraintdef(con.oid) as definition
  from pg_constraint con
  join pg_class cls on cls.oid = con.conrelid
  join pg_namespace n on n.oid = cls.relnamespace
  where n.nspname in ('core')
),
policies as (
  select
    n.nspname as table_schema,
    c.relname as table_name,
    pol.polname as policy_name,
    pol.polcmd as command,
    pg_get_expr(pol.polqual, pol.polrelid) as using,
    pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check,
    (select json_agg(rolname) from pg_roles r where r.oid = any(pol.polroles)) as roles
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core','storage')
),
rls as (
  select
    n.nspname as table_schema,
    c.relname as table_name,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as rls_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core','storage') and c.relkind = 'r'
),
functions as (
  select
    n.nspname as schema,
    p.proname as name,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('core')
),
buckets as (
  select name, public, avif_autodetection, file_size_limit, owner
  from storage.buckets
  where name in ('invoices')
)
select json_build_object(
  'tables', (select json_agg(t) from tables t),
  'constraints', (select json_agg(c) from constraints c),
  'policies', (select json_agg(p) from policies p),
  'rls', (select json_agg(r) from rls r),
  'functions', (select json_agg(f) from functions f),
  'buckets', (select json_agg(b) from buckets b)
) as report;

