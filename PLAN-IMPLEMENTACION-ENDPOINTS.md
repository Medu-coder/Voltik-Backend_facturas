# Plan de Implementación – Endpoints Next.js + Supabase

Este documento guía la implementación de los endpoints server en Next.js para el MVP de ingesta de facturas, alineado con la configuración de Supabase descrita en `supabase/SUPABASE_CONFIG.md`.

---

## Suposiciones y Alcance
- Base de datos y RLS según `supabase/SUPABASE_CONFIG.md` (schemas `core.*`, función `core.is_admin()`, bucket privado `invoices`).
- No se cambia el esquema. Para vincular PDF↔invoice, el nombre del fichero en Storage será el `invoice_id` (uuid) generado en servidor.
- Runtime Next.js App Router (`app/api/*`), `runtime = nodejs`. Tamaño máx. de PDF: `LIMITE_PDF_MB` (por defecto 10MB).
- Auth admin: validación de JWT de Supabase (Authorization: Bearer) con `SUPABASE_JWT_SECRET`, exige `app_metadata.role = 'admin'` o claim `admin=true`.
- `/api/email/inbound` delega en `/api/upload` mediante llamada HTTP interna, autenticada con `X-INTERNAL-KEY`.
- Logging a `core.audit_logs` con service role; niveles `info|warn|error`.
- Seguridad: bucket `invoices` privado; URLs firmadas de expiración corta; no exponer `service_role` al cliente.

Entradas/inputs de esta sesión (placeholders reales a definir en `.env`):
- `NEXT_PUBLIC_SUPABASE_URL="https://lbotbfacpnwakgtjgwxs.supabase.co"`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxib3RiZmFjcG53YWtndGpnd3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyODI3NzIsImV4cCI6MjA3Mzg1ODc3Mn0._aaDgL3ukBA–lYYJNvHSVFDlvru2TEyi5cCFzz85tg"`
- `SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxib3RiZmFjcG53YWtndGpnd3hzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODI4Mjc3MiwiZXhwIjoyMDczODU4NzcyfQ.UoW1yZfCc87M2qfLOtYnt5eP8_JEMVC4sjK8mk8JMHU"`
- `SUPABASE_JWT_SECRET="eIGEpZ3QhPM4LkZVe9qXB8GLQlwd/DqesTY3uuBR5W/bH9yFxxg3KTTdcMZmyqlRdwTWXIa7tXUz4vMbgE26tA=="`
- `LIMITE_PDF_MB=10`

---

## Convenciones
- Bucket: `invoices` (privado).
- Path de storage: `invoices/YYYY/MM/{invoice_id}.pdf`.
- Eventos de log: `invoice_upload_requested|success|failed`, `email_inbound_received|no_pdf|customer_not_found|delegated|failed`, `signed_url_requested|success|denied`, `export_csv_requested|success|failed`.
- Códigos HTTP: 201 creado, 200 OK, 400 bad request, 401 unauthorized, 403 forbidden, 404 not found, 413 payload too large, 415 unsupported media type, 500 server error.

---

## Plan Global (orden recomendado)
1) Añadir clientes Supabase y helpers de auth/log.
2) Implementar `/api/upload` (POST) con validaciones y subida a Storage + insert invoice `pending`.
3) Implementar `/api/email/inbound` (POST) que parsea SendGrid y delega en `/api/upload`.
4) Implementar `/api/files/signed-url` (GET) sólo admin, expiración corta.
5) Implementar `/api/export/csv` (GET) sólo admin, descarga CSV.
6) Añadir `.env.example` y `README-backend.md` con pruebas y notas de despliegue.
7) Ejecutar pruebas E2E manuales con `curl` y verificar logs en `core.audit_logs`.

Dependencias a instalar (luego en el proyecto Next):
- `@supabase/supabase-js`
- `jose` (verificación JWT)

---

## Artefactos y Detalle de Implementación

### 1) `lib/supabase.ts`
Objetivo:
- Crear clientes Supabase: `adminClient` (service role, server-only) y `browserClient` (anon).
- Helpers de seguridad: `assertAdminFromAuthHeader(req)` y `requireInternalKey(req)`.

Tareas:
- Exportar `getAdminClient()` memoizado: `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`.
- Exportar `getBrowserClient()` (anon): `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`.
- Implementar `decodeAndCheckAdmin(authorizationHeader)` usando `jose`:
  - Validar formato `Bearer <jwt>`; verificar con `SUPABASE_JWT_SECRET`.
  - Aceptar admin si `(payload.app_metadata?.role === 'admin') || payload.admin === true`.
- Exportar `assertAdminFromAuthHeader(req)` que lanza `Response(401|403)` si no válido.
- Exportar `requireInternalKey(req)` que compara `X-INTERNAL-KEY` con `process.env.INTERNAL_API_SECRET`.

Notas:
- Añadir `import 'server-only'` para evitar uso en cliente.
- No exponer `SUPABASE_SERVICE_ROLE_KEY` en cliente (no `NEXT_PUBLIC_*`).


### 2) `lib/logger.ts`
Objetivo:
- Helper `logAudit({ event, entity, entity_id, level='info', details })` que inserta en `core.audit_logs`.

Tareas:
- Usar `getAdminClient()` y `from('audit_logs', { schema: 'core' })`.
- `details`: serializar a JSON string si es objeto; capturar errores pero nunca romper la request.
- Retornar `void`.


### 3) `app/api/upload/route.ts` (POST)
Objetivo:
- Recibe `multipart/form-data` con `file` (PDF ≤ `LIMITE_PDF_MB` MB) y `customer_id`.
- Sube el PDF a Storage (`invoices/…`) y crea un registro en `core.invoices` con `status='pending'`.

Validaciones:
- Comprobar que el request es `multipart/form-data` y existen `file` y `customer_id`.
- MIME: `application/pdf` (permitir `application/octet-stream` si extensión `.pdf`). Si no, `415`.
- Tamaño: `file.size` ≤ `LIMITE_PDF_MB * 1024 * 1024`. Si no, `413`.
- `customer_id` es UUID y existe en `core.customers`.

Flujo:
- `logAudit('invoice_upload_requested', 'invoice', null, 'info', { customer_id, size })`.
- Generar `invoice_id = crypto.randomUUID()`.
- `storagePath = invoices/YYYY/MM/${invoice_id}.pdf`.
- Subir a Storage con `adminClient.storage.from('invoices').upload(storagePath, file, { contentType: 'application/pdf', upsert: false })`.
- Insertar en `core.invoices` con `id=invoice_id`, `customer_id`, `status='pending'`.
- `logAudit('invoice_upload_success', 'invoice', invoice_id, 'info', { storagePath })`.
- Responder `201` con `{ invoice_id, storage_path: storagePath }`.

Errores y compensación:
- Si falla la subida: `logAudit('invoice_upload_failed', …, 'error', { error })`, responder `500`.
- Si falla el insert tras subir: intentar `storage.remove([storagePath])` (best-effort), loguear error y responder `500`.


### 4) `app/api/email/inbound/route.ts` (POST)
Objetivo:
- Parsear webhook de SendGrid Inbound, extraer el primer PDF, mapear `from`→`customer` y delegar en `/api/upload`.

Validaciones:
- Cabecera `X-INBOUND-SECRET` debe coincidir con `process.env.INBOUND_EMAIL_SECRET` (si no, `403`).
- `from`: obtener de `formData.get('from')` o del JSON en `envelope`.

Flujo:
- `logAudit('email_inbound_received', 'email', null, 'info', { from, subject })`.
- Buscar adjuntos tipo `File` con `type === 'application/pdf'` o nombre `.pdf`; seleccionar el primero.
- Si no hay PDF: `logAudit('email_inbound_no_pdf', …, 'warn')`, responder `400`.
- Buscar `customer` por `email` en `core.customers`. Si no existe: `logAudit('email_inbound_customer_not_found', …, 'warn')`, `404`.
- Construir `FormData` con `file` y `customer_id`.
- `fetch(new URL('/api/upload', req.url), { method: 'POST', body: formData, headers: { 'X-INTERNAL-KEY': process.env.INTERNAL_API_SECRET! } })`.
- Si éxito (201/200), `logAudit('email_inbound_delegated', 'email', null, 'info', { invoice_id })` y retornar el payload de `/api/upload`.
- En fallo inesperado: `logAudit('email_inbound_failed', …, 'error', { error })`, `500`.


### 5) `app/api/files/signed-url/route.ts` (GET)
Objetivo:
- `?path=…` → devuelve URL firmada de expiración corta (admin-only).

Validaciones:
- `assertAdminFromAuthHeader(req)` (401/403 si no admin).
- `path` requerido, con prefijo `invoices/` y sin `..`.

Flujo:
- `logAudit('signed_url_requested', 'storage', null, 'info', { path, expiresIn })`.
- `createSignedUrl(path, expiresInSeconds)` con defecto `60` y tope `300`.
- Si no existe el objeto: `404`.
- En éxito: `logAudit('signed_url_success', 'storage', null, 'info', { path })` y devolver `{ url, expiresIn }`.
- En denegación: `logAudit('signed_url_denied', …, 'warn')`.


### 6) `app/api/export/csv/route.ts` (GET)
Objetivo:
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` → CSV de `core.invoices` en rango de `created_at` (por defecto últimos 30 días).

Validaciones:
- `assertAdminFromAuthHeader(req)`.
- Normalizar rango fechas. Si faltan, usar `to=now`, `from=now-30d`.

Flujo:
- `logAudit('export_csv_requested', 'invoice', null, 'info', { from, to })`.
- Query a `core.invoices` (schema `core`) con filtros `gte/lte` sobre `created_at` y `order=created_at.desc`.
- Generar CSV manualmente con cabeceras: `id,customer_id,status,issue_date,start_date,end_date,total_amount_eur,created_at`.
- Responder con `text/csv; charset=utf-8` y `Content-Disposition: attachment; filename=invoices_YYYYMMDD-YYYYMMDD.csv`.
- `logAudit('export_csv_success', …, 'info', { rows: N })`.
- En error: `logAudit('export_csv_failed', …, 'error', { error })`, `500`.


### 7) `.env.example`
Contenido (con comentarios):

```
# Público (cliente)
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

# Sólo servidor (no prefijar con NEXT_PUBLIC_)
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET=YOUR_JWT_SECRET

# Límite de subida (MB)
LIMITE_PDF_MB=10

# Secretos internos
INTERNAL_API_SECRET=GENERATE_A_STRONG_RANDOM
INBOUND_EMAIL_SECRET=SHARED_SECRET_FROM_SENDGRID_INBOUND_PARSE

# Opcional para pruebas locales
ADMIN_EMAIL=OPTIONAL_ADMIN_EMAIL
ADMIN_USER_ID=OPTIONAL_ADMIN_USER_ID
NODE_ENV=development
```


### 8) `README-backend.md`
Secciones a documentar:
- Setup: versión Node, instalación deps (`@supabase/supabase-js`, `jose`), variables de entorno.
- Endpoints, seguridad y códigos de estado.
- Ejemplos `curl` (ver Pruebas E2E).
- Notas de despliegue (Vercel: runtime node, variables en Project Settings, región EU; tamaño máx. 10MB).

---

## Pruebas End-to-End (curl)
Precondiciones:
- Existe un `core.customers` con el email de prueba y su `id` (UUID).
- Se dispone de un JWT admin válido (firmado con `SUPABASE_JWT_SECRET` y `app_metadata.role = 'admin'`).

Comandos:
- Subida web (crea invoice `pending`):
```
curl -sS -X POST http://localhost:3000/api/upload \
  -F "file=@./samples/invoice.pdf;type=application/pdf" \
  -F "customer_id=UUID_DEL_CUSTOMER" | jq .
```

- Inbound SendGrid (simulado):
```
curl -sS -X POST http://localhost:3000/api/email/inbound \
  -H "X-INBOUND-SECRET: $INBOUND_EMAIL_SECRET" \
  -F "from=cliente@example.com" \
  -F "subject=Factura" \
  -F "attachment1=@./samples/invoice.pdf;type=application/pdf" | jq .
```

- Signed URL (admin):
```
curl -sS "http://localhost:3000/api/files/signed-url?path=invoices/2025/09/UUID.pdf" \
  -H "Authorization: Bearer $ADMIN_JWT" | jq .
```

- Export CSV (admin):
```
curl -sS -D - "http://localhost:3000/api/export/csv?from=2025-09-01&to=2025-09-30" \
  -H "Authorization: Bearer $ADMIN_JWT" -o invoices.csv
```

- Verificar logs (como admin, vía REST de Supabase si aplica):
```
# Ejemplo indicativo (ajusta URL/keys). Filtra últimos eventos.
curl -sS "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/audit_logs?select=event,entity,level,created_at&order=created_at.desc&limit=10" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Accept-Profile: core" | jq .
```

---

## Validación contra Criterios de Aceptación
- Subida web crea invoice ‘pending’ y objeto en Storage: `/api/upload` lo hace y responde `201` con `invoice_id` y `storage_path`.
- Email entrante con PDF crea invoice ‘pending’: `/api/email/inbound` mapea `from→customer`, delega en `/api/upload` y retorna éxito.
- Signed URL expira y requiere admin: `/api/files/signed-url` valida JWT admin y usa `createSignedUrl` con expiración corta.
- Export CSV descarga fichero válido: `/api/export/csv` devuelve CSV con cabeceras y `Content-Disposition`.
- Errores se registran en `core.audit_logs`: `logger.ts` registra `info|warn|error` en todos los flujos.
- Pruebas end to end: `curl` para cada endpoint + verificación en logs.

---

## Checklist de Implementación (marcar al completar)
- [ ] lib/supabase.ts creado con `getAdminClient`, `getBrowserClient`, `assertAdminFromAuthHeader`, `requireInternalKey`.
- [ ] lib/logger.ts con `logAudit` robusto.
- [ ] app/api/upload/route.ts con validaciones, subida a Storage e insert en `core.invoices`.
- [ ] app/api/email/inbound/route.ts con validación secret, parsing, mapeo customer, delegación.
- [ ] app/api/files/signed-url/route.ts admin-only, expiración ≤300s, sanitización de `path`.
- [ ] app/api/export/csv/route.ts admin-only, CSV válido y descargable.
- [ ] .env.example añadido con comentarios y placeholders.
- [ ] README-backend.md con instrucciones, `curl` y notas de despliegue.
- [ ] Pruebas E2E ejecutadas y verificación de `core.audit_logs`.

---

## Siguientes Pasos
- Crear los archivos indicados siguiendo este plan.
- Instalar dependencias (`@supabase/supabase-js`, `jose`).
- Configurar variables en `.env.local` y Vercel (no exponer service role al cliente).
- Probar localmente con los `curl` y validar logs y permisos.

