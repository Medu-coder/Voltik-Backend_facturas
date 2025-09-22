# Supabase REST & Storage Tests

Este documento describe las **pruebas automáticas de seguridad y RLS** que validan la configuración del backend del MVP.

---

## 🔎 Objetivo de las pruebas

1. **Validar RLS y policies** en el esquema `core` (`customers`, `invoices`, `audit_logs`).
2. **Verificar roles de acceso**:
   - **Admin**: puede hacer TODO (leer/escribir en tablas y Storage).
   - **Usuario normal**: no puede leer ni escribir (solo arrays vacíos o 401/403).
   - **Service role**: acceso completo (incluyendo Storage).
3. **Confirmar privacidad del bucket `invoices`** en Storage:
   - Lectura/escritura solo para admin y service role.
   - Nadie más puede acceder.

---

## 🧪 Tests incluidos

### Test A — REST (ADMIN)
**Qué se valida**  
- Que un token admin (`admin: true`) tiene acceso completo.

**Consultas**  
- `GET /rest/v1/customers`
- `GET /rest/v1/invoices`
- `GET /rest/v1/audit_logs`

**Resultado esperado**  
- Todas devuelven código **200** y **≥1 fila**.

---

### Test B — REST (NO ADMIN)
**Qué se valida**  
- Que un usuario normal **no puede acceder** a `audit_logs` ni a `invoices`.

**Consultas**  
- `GET /rest/v1/audit_logs`
- `GET /rest/v1/invoices`

**Resultado esperado**  
- Devuelve **401/403** *o* **200 con array vacío (`[]`)**.

---

### Test C — Storage
**Qué se valida**  
- Que las policies del bucket `invoices` se aplican correctamente.

**Acciones**  
1. **Listar** objetos con `service_role`.  
   - ✅ Esperado: `200` con JSON (puede estar vacío si no hay objetos).
2. **Descargar** `inv_dummy.pdf` con admin.  
   - ✅ Esperado: fichero descargado si existe, o aviso si no.
3. **Subir** objeto con `service_role`.  
   - ✅ Esperado: `200/201 Created`.
4. **Subir** objeto con admin.  
   - ✅ Esperado: `200/201 Created` (admin puede escribir).
5. **Subir** objeto con usuario normal.  
   - ❌ No probado en runner, pero esperado: `401/403`.

---

## ⚙️ Configuración de Policies

### Core schema (`core`)
Aplicar estas policies tras habilitar RLS en cada tabla:

```sql
-- Customers
create policy customers_admin_read
on core.customers for select
to authenticated
using (core.is_admin());

create policy customers_admin_write
on core.customers for insert, update, delete
to authenticated
using (core.is_admin())
with check (core.is_admin());

-- Invoices
create policy invoices_admin_read
on core.invoices for select
to authenticated
using (core.is_admin());

create policy invoices_admin_write
on core.invoices for insert, update, delete
to authenticated
using (core.is_admin())
with check (core.is_admin());

-- Audit logs
create policy audit_logs_admin_read
on core.audit_logs for select
to authenticated
using (core.is_admin());

create policy audit_logs_admin_write
on core.audit_logs for insert, update, delete
to authenticated
using (core.is_admin())
with check (core.is_admin());

-- Service role acceso total
create policy service_role_core
on core.customers for all
to service_role
using (true)
with check (true);

create policy service_role_core_invoices
on core.invoices for all
to service_role
using (true)
with check (true);

create policy service_role_core_logs
on core.audit_logs for all
to service_role
using (true)
with check (true);
```

---

### Storage bucket `invoices`
Policies mínimas para permitir **admin y service role**:

```sql
-- Lectura (select)
create policy invoices_read_admin_or_service
on storage.objects for select
to authenticated
using (
  bucket_id = 'invoices'
  and ( core.is_admin() or auth.role() = 'service_role' )
);

-- Escritura (insert/update/delete)
create policy invoices_write_admin_or_service
on storage.objects for insert, update, delete
to authenticated
using (
  bucket_id = 'invoices'
  and ( core.is_admin() or auth.role() = 'service_role' )
)
with check (
  bucket_id = 'invoices'
  and ( core.is_admin() or auth.role() = 'service_role' )
);
```

---

## ▶️ Ejecución de las pruebas

### Requisitos previos
- `jq` instalado (`brew install jq` en Mac).
- `curl` disponible.
- Variables en `supabase_env.sh`:
  ```bash
  export SUPABASE_URL="https://PROJECTID.supabase.co"
  export SUPABASE_PROJECT_ID="PROJECTID"
  export ANON_KEY="TU_ANON_KEY"
  export SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
  export SUPABASE_JWT_SECRET="TU_JWT_SECRET"
  export ADMIN_EMAIL="edelarosaortiz@gmail.com"
  export ADMIN_USER_ID="11111111-1111-1111-1111-111111111111"
  export USER_EMAIL="normal.user+test@voltik.es"
  export USER_USER_ID="22222222-2222-2222-2222-222222222222"
  ```

### Pasos
1. Cargar las variables:
   ```bash
   source ./supabase_env.sh
   ```
2. Ejecutar el runner:
   ```bash
   ./runner.sh
   ```
3. Interpretar resultados:
   - Todo verde ✅ → configuración correcta.
   - Algún rojo ❌ → revisar policies / grants.

---

## ✅ Criterios de aceptación

- **Admin** puede leer y escribir en `core.*` y en `storage.objects` (bucket `invoices`).  
- **Usuario normal** no accede a nada sensible (0 filas o denegado).  
- **Service role** tiene acceso total (usado por el backend).  
- **Bucket invoices** es privado y solo accesible por admin o service role.  
