# Supabase – Configuración del proyecto

Este documento resume **cómo está configurada la base de datos y el storage en Supabase** para el MVP de procesamiento de facturas eléctricas.  
Sirve como referencia cuando se implemente el backend en Node.js (Next.js API routes o server en Express/Fastify).

---

## 🏗️ Arquitectura Supabase

- **Proyecto:** `lbotbfacpnwakgtjgwxs`
- **Schemas expuestos en API:** `public`, `graphql_public`, `core`
- **Base de datos:** PostgreSQL (Supabase)
- **Auth:** JWT con secret (`SUPABASE_JWT_SECRET`), roles:
  - `anon`
  - `authenticated`
  - `service_role`

---

## 📂 Esquema `core`

### Tablas

#### `core.customers`
- Campos:  
  - `id uuid primary key default gen_random_uuid()`
  - `user_id uuid not null`
  - `name text`
  - `email text unique`
  - `created_at timestamptz default now()`

#### `core.invoices`
- Campos:  
  - `id uuid primary key default gen_random_uuid()`
  - `customer_id uuid references core.customers(id)`
  - `issue_date date`
  - `start_date date`
  - `end_date date`
  - `status text check (status in ('pending','processed','error','reprocess')) default 'pending'`
  - `total_amount_eur numeric(10,2)`
  - `created_at timestamptz default now()`

#### `core.audit_logs`
- Campos:  
  - `id uuid primary key default gen_random_uuid()`
  - `event text not null`
  - `entity text not null`
  - `entity_id uuid`
  - `level text check (level in ('info','warn','error')) default 'info'`
  - `details text`
  - `created_at timestamptz default now()`

---

## 🔒 Seguridad y Policies

### Función helper
```sql
create or replace function core.is_admin()
returns boolean language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() ->> 'admin')::boolean,
    false
  );
$$;
grant execute on function core.is_admin() to authenticated;
```

### Policies – `core.customers`
```sql
create policy customers_admin_read
on core.customers for select to authenticated
using (core.is_admin());

create policy customers_admin_write
on core.customers for insert, update, delete
to authenticated
using (core.is_admin()) with check (core.is_admin());

create policy service_role_core
on core.customers for all to service_role
using (true) with check (true);
```

### Policies – `core.invoices`
```sql
create policy invoices_admin_read
on core.invoices for select to authenticated
using (core.is_admin());

create policy invoices_admin_write
on core.invoices for insert, update, delete
to authenticated
using (core.is_admin()) with check (core.is_admin());

create policy service_role_core_invoices
on core.invoices for all to service_role
using (true) with check (true);
```

### Policies – `core.audit_logs`
```sql
create policy audit_logs_admin_read
on core.audit_logs for select to authenticated
using (core.is_admin());

create policy audit_logs_admin_write
on core.audit_logs for insert, update, delete
to authenticated
using (core.is_admin()) with check (core.is_admin());

create policy service_role_core_logs
on core.audit_logs for all to service_role
using (true) with check (true);
```

---

## 📦 Storage

- **Bucket:** `invoices` (privado)

### Policies – `storage.objects`
```sql
-- Lectura
create policy invoices_read_admin_or_service
on storage.objects for select to authenticated
using (
  bucket_id = 'invoices'
  and (core.is_admin() or auth.role() = 'service_role')
);

-- Escritura
create policy invoices_write_admin_or_service
on storage.objects for insert, update, delete
to authenticated
using (
  bucket_id = 'invoices'
  and (core.is_admin() or auth.role() = 'service_role')
)
with check (
  bucket_id = 'invoices'
  and (core.is_admin() or auth.role() = 'service_role')
);
```

---

## 🔑 GRANTS aplicados

```sql
grant usage on schema core to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema core to anon, authenticated, service_role;
grant usage, select on all sequences in schema core to anon, authenticated, service_role;

alter default privileges in schema core
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema core
  grant usage, select on sequences to anon, authenticated, service_role;

grant execute on function core.is_admin() to anon, authenticated, service_role;
```

---

## 🧪 Pruebas automatizadas

- Script: `supabase/tests/runner.sh`
- Documentación: `supabase/tests/TESTS.md`
- Tokens se generan en local con `SUPABASE_JWT_SECRET` (no dependemos de Auth).
- **Casos cubiertos**:
  - Admin → acceso completo.
  - Usuario normal → sin acceso (200 vacío o 403).
  - Service role → acceso total.
  - Storage → privado, acceso solo admin + service role.

---

## 🌍 Variables de entorno (para Vercel/Node.js)

```bash
NEXT_PUBLIC_SUPABASE_URL="https://lbotbfacpnwakgtjgwxs.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxib3RiZmFjcG53YWtndGpnd3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyODI3NzIsImV4cCI6MjA3Mzg1ODc3Mn0._aaDgL3ukBA–lYYJNvHSVFDlvru2TEyi5cCFzz85tg"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxib3RiZmFjcG53YWtndGpnd3hzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODI4Mjc3MiwiZXhwIjoyMDczODU4NzcyfQ.UoW1yZfCc87M2qfLOtYnt5eP8_JEMVC4sjK8mk8JMHU"
SUPABASE_JWT_SECRET="eIGEpZ3QhPM4LkZVe9qXB8GLQlwd/DqesTY3uuBR5W/bH9yFxxg3KTTdcMZmyqlRdwTWXIa7tXUz4vMbgE26tA=="

# Identidad admin para pruebas locales
ADMIN_EMAIL="edelarosaortiz@gmail.com"
ADMIN_USER_ID="11111111-1111-1111-1111-111111111111"
USER_EMAIL="normal.user+test@voltik.es"
USER_USER_ID="22222222-2222-2222-2222-222222222222"
```

---

## ✅ Criterios de aceptación

- Admin puede leer y escribir en `core.*` y en `storage.objects` (bucket `invoices`).  
- Usuario normal no accede a nada sensible.  
- Service role tiene acceso total (usado por el backend/orquestador).  
- Bucket `invoices` es privado, sin acceso público.  
- Tests (`runner.sh`) pasan todos en verde.  
