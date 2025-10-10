-- Rework de estados de facturas
-- Migración de estados antiguos a nuevos estados comerciales

-- 1. Eliminar restricción CHECK temporalmente
ALTER TABLE core.invoices DROP CONSTRAINT invoices_status_check;

-- 2. Migrar datos existentes
UPDATE core.invoices SET status = 
  CASE 
    WHEN status = 'pending' THEN 'Pendiente'
    WHEN status = 'reprocess' THEN 'Ofertada'
    ELSE 'Pendiente'  -- Fallback para cualquier otro estado inesperado
  END;
ALTER TABLE core.invoices ADD CONSTRAINT invoices_status_check CHECK (
  status = ANY (ARRAY[
    'Pendiente'::text, 
    'Ofertada'::text, 
    'Tramitando'::text, 
    'Contratando'::text, 
    'Cancelado'::text, 
    'Contratado'::text
  ])
);

-- 3. Crear nueva restricción CHECK para nuevos estados
ALTER TABLE core.invoices ALTER COLUMN status SET DEFAULT 'Pendiente';

-- 5. Actualizar función dashboard_invoice_aggregates para nuevos estados
CREATE OR REPLACE FUNCTION core.dashboard_invoice_aggregates(
  p_from date,
  p_to date,
  p_query text default null
) returns jsonb
language sql
stable
security definer
set search_path = core, public
as $$
with params as (
  select
    least(p_from, p_to) as range_start,
    greatest(p_from, p_to) as range_end,
    (least(p_from, p_to) - interval '1 month')::date as previous_from,
    (greatest(p_from, p_to) - interval '1 month')::date as previous_to,
    (least(p_from, p_to) - interval '1 year')::date as previous_year_from,
    (greatest(p_from, p_to) - interval '1 year')::date as previous_year_to,
    case
      when p_query is null or btrim(p_query) = '' then null
      else '%' || replace(replace(btrim(p_query), '%', '\\%'), '_', '\\_') || '%'
    end as pattern
),
filtered as (
  select i.id, i.created_at, i.status
  from core.invoices i
  left join core.customers c on c.id = i.customer_id
  cross join params
  where i.created_at >= params.range_start::timestamptz
    and i.created_at < (params.range_end + interval '1 day')::timestamptz
    and (
      params.pattern is null
      or i.id::text ilike params.pattern escape '\\'
      or c.email ilike params.pattern escape '\\'
      or c.name ilike params.pattern escape '\\'
    )
),
previous_range as (
  select i.id
  from core.invoices i
  left join core.customers c on c.id = i.customer_id
  cross join params
  where i.created_at >= params.previous_from::timestamptz
    and i.created_at < (params.previous_to + interval '1 day')::timestamptz
    and (
      params.pattern is null
      or i.id::text ilike params.pattern escape '\\'
      or c.email ilike params.pattern escape '\\'
      or c.name ilike params.pattern escape '\\'
    )
),
filtered_previous_year as (
  select i.id, i.created_at
  from core.invoices i
  left join core.customers c on c.id = i.customer_id
  cross join params
  where i.created_at >= params.previous_year_from::timestamptz
    and i.created_at < (params.previous_year_to + interval '1 day')::timestamptz
    and (
      params.pattern is null
      or i.id::text ilike params.pattern escape '\\'
      or c.email ilike params.pattern escape '\\'
      or c.name ilike params.pattern escape '\\'
    )
),
status_counts as (
  select
    coalesce(sum(case when i.status = 'Pendiente' then 1 else 0 end), 0) as pendiente,
    coalesce(sum(case when i.status in ('Ofertada','Tramitando','Contratando') then 1 else 0 end), 0) as en_proceso,
    coalesce(sum(case when i.status = 'Contratado' then 1 else 0 end), 0) as contratado,
    coalesce(sum(case when i.status = 'Cancelado' then 1 else 0 end), 0) as cancelado
  from filtered i
),
month_series as (
  select
    gs::date as month_anchor,
    greatest(params.range_start, gs::date) as range_start,
    least(params.range_end, (gs + interval '1 month - 1 day')::date) as range_end
  from params,
  lateral generate_series(date_trunc('month', params.range_start), date_trunc('month', params.range_end), interval '1 month') as gs
),
monthly_current as (
  select
    ms.month_anchor,
    count(f.*) as current_count
  from month_series ms
  left join filtered f
    on f.created_at >= ms.range_start::timestamptz
   and f.created_at < (ms.range_end + interval '1 day')::timestamptz
  group by ms.month_anchor
),
monthly_previous_year as (
  select
    ms.month_anchor,
    count(f.*) as previous_year_count
  from month_series ms
  left join filtered_previous_year f
    on f.created_at >= (ms.range_start - interval '1 year')::timestamptz
   and f.created_at < (ms.range_end - interval '1 year' + interval '1 day')::timestamptz
  group by ms.month_anchor
),
monthly_data as (
  select
    ms.month_anchor,
    ms.range_start,
    ms.range_end,
    coalesce(mc.current_count, 0) as current_count,
    coalesce(mp.previous_year_count, 0) as previous_year_count
  from month_series ms
  left join monthly_current mc on mc.month_anchor = ms.month_anchor
  left join monthly_previous_year mp on mp.month_anchor = ms.month_anchor
  order by ms.month_anchor
)
select jsonb_build_object(
  'currentTotal', coalesce((select count(*) from filtered), 0),
  'previousTotal', coalesce((select count(*) from previous_range), 0),
  'statusCounts', jsonb_build_object(
    'pendiente', coalesce((select pendiente from status_counts), 0),
    'en_proceso', coalesce((select en_proceso from status_counts), 0),
    'contratado', coalesce((select contratado from status_counts), 0),
    'cancelado', coalesce((select cancelado from status_counts), 0)
  ),
  'monthlyBuckets', coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'monthAnchor', month_anchor,
        'rangeStart', range_start,
        'rangeEnd', range_end,
        'currentCount', current_count,
        'previousYearCount', previous_year_count
      ) order by month_anchor)
      from monthly_data
    ),
    '[]'::jsonb
  )
);
$$;

-- 6. Registrar migración en audit_logs
INSERT INTO core.audit_logs (event, entity, level, meta)
VALUES (
  'invoice_status_migration_completed',
  'invoice',
  'info',
  jsonb_build_object(
    'migration_date', now(),
    'new_states', ARRAY['Pendiente', 'Ofertada', 'Tramitando', 'Contratando', 'Cancelado', 'Contratado']
  )
);

-- 7. Comentario sobre la migración
COMMENT ON CONSTRAINT invoices_status_check ON core.invoices IS 'Estados comerciales: Pendiente, Ofertada, Tramitando, Contratando, Cancelado, Contratado';
