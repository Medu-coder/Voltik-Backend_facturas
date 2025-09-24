-- Create schema and tables for core domain
create schema if not exists core;

-- Ensure pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- Tables
create table if not exists core.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text,
  email text not null,
  created_at timestamptz default now()
);

create unique index if not exists customers_email_name_idx
on core.customers (email, lower(coalesce(name,'')));

create table if not exists core.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references core.customers(id),
  issue_date date,
  start_date date,
  end_date date,
  status text check (status in ('pending','processed','error','reprocess')) default 'pending',
  total_amount_eur numeric(10,2),
  created_at timestamptz default now()
);

create table if not exists core.audit_logs (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  entity text not null,
  entity_id uuid,
  level text check (level in ('info','warn','error')) default 'info',
  details text,
  created_at timestamptz default now()
);

-- Admin helper function
create or replace function core.is_admin()
returns boolean language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() ->> 'admin')::boolean,
    false
  );
$$;

grant execute on function core.is_admin() to authenticated;

-- Policies for core.customers
drop policy if exists customers_admin_read on core.customers;
create policy customers_admin_read
on core.customers for select to authenticated
using (core.is_admin());

drop policy if exists customers_admin_write on core.customers;
create policy customers_admin_write
on core.customers for insert, update, delete to authenticated
using (core.is_admin()) with check (core.is_admin());

drop policy if exists service_role_core on core.customers;
create policy service_role_core
on core.customers for all to service_role
using (true) with check (true);

-- Policies for core.invoices
drop policy if exists invoices_admin_read on core.invoices;
create policy invoices_admin_read
on core.invoices for select to authenticated
using (core.is_admin());

drop policy if exists invoices_admin_write on core.invoices;
create policy invoices_admin_write
on core.invoices for insert, update, delete to authenticated
using (core.is_admin()) with check (core.is_admin());

drop policy if exists service_role_core_invoices on core.invoices;
create policy service_role_core_invoices
on core.invoices for all to service_role
using (true) with check (true);

-- Policies for core.audit_logs
drop policy if exists audit_logs_admin_read on core.audit_logs;
create policy audit_logs_admin_read
on core.audit_logs for select to authenticated
using (core.is_admin());

drop policy if exists audit_logs_admin_write on core.audit_logs;
create policy audit_logs_admin_write
on core.audit_logs for insert, update, delete to authenticated
using (core.is_admin()) with check (core.is_admin());

drop policy if exists service_role_core_logs on core.audit_logs;
create policy service_role_core_logs
on core.audit_logs for all to service_role
using (true) with check (true);

-- Grants
grant usage on schema core to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema core to anon, authenticated, service_role;
grant usage, select on all sequences in schema core to anon, authenticated, service_role;
alter default privileges in schema core grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema core grant usage, select on sequences to anon, authenticated, service_role;
grant execute on function core.is_admin() to anon, authenticated, service_role;
