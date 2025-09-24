create table core.customers (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  name text null,
  email text not null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint customers_pkey primary key (id),
  constraint email_basic_format_chk check (
    (
      (email is null)
      or (POSITION(('@'::text) in (email)) > 1)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_customers_user_id on core.customers using btree (user_id) TABLESPACE pg_default;
create unique index IF not exists customers_email_name_idx on core.customers (email, lower(coalesce(name, '')));

create trigger trg_customers_set_updated_at BEFORE
update on core.customers for EACH row
execute FUNCTION core.set_updated_at ();

create table core.customers (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  name text null,
  email text not null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint customers_pkey primary key (id),
  constraint email_basic_format_chk check (
    (
      (email is null)
      or (POSITION(('@'::text) in (email)) > 1)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_customers_user_id on core.customers using btree (user_id) TABLESPACE pg_default;

create trigger trg_customers_set_updated_at BEFORE
update on core.customers for EACH row
execute FUNCTION core.set_updated_at ();

create table core.customers (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  name text null,
  email text null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint customers_pkey primary key (id),
  constraint email_basic_format_chk check (
    (
      (email is null)
      or (POSITION(('@'::text) in (email)) > 1)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_customers_user_id on core.customers using btree (user_id) TABLESPACE pg_default;

create trigger trg_customers_set_updated_at BEFORE
update on core.customers for EACH row
execute FUNCTION core.set_updated_at ();
