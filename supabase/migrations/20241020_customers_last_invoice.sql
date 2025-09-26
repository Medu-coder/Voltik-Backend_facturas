-- Helper to obtain last invoice timestamp per customer
create or replace function core.get_customers_last_invoice(
  p_customer_ids uuid[]
) returns table (
  customer_id uuid,
  last_invoice_at timestamptz
)
language sql
stable
security definer
set search_path = core, public
as $$
  select
    i.customer_id,
    max(i.created_at) as last_invoice_at
  from core.invoices i
  where p_customer_ids is null
     or i.customer_id = any(p_customer_ids)
  group by i.customer_id;
$$;

grant execute on function core.get_customers_last_invoice(uuid[]) to service_role;
