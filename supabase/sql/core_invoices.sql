create table core.invoices (
  id uuid not null default gen_random_uuid (),
  customer_id uuid not null,
  storage_object_path text not null,
  cups text null,
  energy_price_eur_per_kwh numeric(10, 6) null,
  power_price_eur_per_kw numeric(10, 6) null,
  contracted_power_by_period jsonb null,
  provider text null,
  tariff text null,
  billing_start_date date null,
  billing_end_date date null,
  issue_date date null,
  total_amount_eur numeric(12, 2) null,
  currency text not null default 'EUR'::text,
  status text not null default 'pending'::text,
  extracted_raw jsonb null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint invoices_pkey primary key (id),
  constraint invoices_customer_id_fkey foreign KEY (customer_id) references core.customers (id) on delete CASCADE,
  constraint billing_range_chk check (
    (
      (billing_start_date is null)
      or (billing_end_date is null)
      or (billing_start_date <= billing_end_date)
    )
  ),
  constraint invoices_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'processed'::text,
          'error'::text,
          'reprocess'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_invoices_customer_issue_status on core.invoices using btree (customer_id, issue_date, status) TABLESPACE pg_default;

create trigger trg_invoices_set_updated_at BEFORE
update on core.invoices for EACH row
execute FUNCTION core.set_updated_at ();