# Arquitectura y modelo de datos

## 1. Visión general
La aplicación es una SPA administrada por Next.js (App Router) con renderizado server-first. Supabase aporta autenticación (Magic Link), base de datos Postgres con RLS y Storage privado para PDFs.

```mermaid
flowchart LR
    subgraph Client
      Browser["Admin (navegador)"]
      UploadForm["Componentes client (UploadForm, Toaster)"]
    end
    subgraph Next.js
      Pages["Server Components\n(app/**/*.tsx)"]
      API["API Routes\n(app/api/*)"]
      Lib["lib/* helpers\n(supabase, auth, invoices)"]
    end
    subgraph Supabase
      Auth["Auth"]
      DB["Postgres\n(schema core)"]
      Storage["Storage bucket\n'invoices'"]
    end
    SendGrid["Webhook email inbound"]

    Browser -->|Magic link| Auth
    Browser --> Pages
    UploadForm -->|fetch| API
    SendGrid -->|POST /api/email/inbound| API
    Pages -->|requireAdmin()| Auth
    API -->|service_role queries| DB
    API -->|signed URLs / uploads| Storage
    API -->|audit events| DB
```

### Principales módulos
- `app/` – Rutas server (dashboard, invoices, customers, upload, login) + componentes específicos.
- `app/api/` – Endpoints REST (subida admin, email inbound, intake público, exportaciones, signed URLs) y herramientas dev.
- `lib/` – Clientes Supabase (`supabase/admin|server|client`), helpers de auth, lógica de dashboard (`lib/invoices/dashboard`), persistencia de facturas (`lib/invoices/upload`), formateadores (`date`, `number`), logger de auditoría.
- `components/` – Componentes compartidos (tabla de facturas, layout de dashboard, formularios, toaster, json viewer).
- `supabase/` – Migraciones SQL, esquema exportado y configuraciones de referencia.

## 2. Flujos principales
### Subida manual de facturas
1. `UploadForm` (client) envía un `FormData` a `/api/upload`.
2. La route valida sesión admin o `X-INTERNAL-KEY`, normaliza cliente con `ensureCustomer` y delega en `ingestInvoiceSubmission` para subir el PDF con metadata obligatoria.
3. Inserta `core.invoices` (`status='pending'`) y responde con el `invoiceId`.

### Email entrante (`/api/email/inbound`)
1. Valida `X-INBOUND-SECRET` y extrae remitente/adjuntos.
2. Resuelve/crea el cliente con `ensureCustomer`.
3. Reutiliza `ingestInvoiceSubmission` para subir el PDF y crear la factura con metadata consistente, registrando eventos en `core.audit_logs`.

### Intake público (`/api/public/intake`)
1. Valida el `Origin` frente a `PUBLIC_INTAKE_ALLOWED_ORIGINS` y aplica limitador por IP (`lib/security/rate-limit.ts`).
2. Verifica captcha o secreto compartido (`lib/security/captcha.ts`).
3. Construye nombre/email y delega en `ingestInvoiceSubmission` (`lib/invoices/intake.ts`) reutilizando la misma lógica que el panel admin y el webhook.

### Dashboard (`/dashboard`)
1. `fetchDashboardData` ejecuta la RPC `core.dashboard_invoice_aggregates` y una consulta limitada de facturas.
2. Normaliza KPIs, series mensuales y distribución de estados.
3. Componentes `MonthlyInvoicesCard` e `InvoicesStatusCard` pintan SVG accesibles y tabla `InvoiceTable` reutilizada.

## 3. Modelo de datos (schema `core`)
| Tabla / función | Propósito | Campos clave / notas |
| --- | --- | --- |
| `core.customers` | Clientes vinculados a `auth.users`. | `id uuid`, `user_id uuid` (owner), `name`, `email`, `mobile_phone`, índice único `customers_email_name_idx`, trigger `trg_customers_set_updated_at`. |
| `core.invoices` | Facturas y metadatos. | FK `customer_id`, `storage_object_path`, fechas de facturación, `status` (`pending`, `processed`, `error`, `reprocess`, `done`), índices por `created_at`, `(status, created_at desc)` y `(customer_id, issue_date, status)`, trigger `trg_invoices_set_updated_at`. |
| `core.audit_logs` | Registro de eventos de auditoría. | `event`, `entity`, `level`, `meta jsonb`, secuencia `core.audit_logs_id_seq`. |
| `core.dashboard_invoice_aggregates(p_from, p_to, p_query)` | RPC para dashboard (JSON). | Devuelve totales, buckets mensuales, status breakdown. Ejecuta con `security definer` y requiere índices previos. |
| `core.get_customers_last_invoice(p_customer_ids uuid[])` | RPC auxiliar. | Devuelve `customer_id` + `last_invoice_at` (`max(created_at)`) para poblar `/customers` sin escanear todas las facturas. |
| `core.is_admin()` | Helper para RLS. | Evalúa claims `admin` en JWT o rol `service_role`.

## 4. Storage de facturas
- Bucket privado configurado en Supabase (default `invoices`).
- Ruta lógica: `<segmento_email>/AAAA/MM/DD/<invoiceId>.pdf`. El segmento de email se sanitiza en `lib/storage.ts` sustituyendo caracteres no permitidos.
- Se espera adjuntar metadata `{ customer_id, actor_user_id }` en cada subida para cumplir las políticas de owner (`storage.objects`).

## 5. Autenticación y autorización
- Autenticación mediante Supabase Magic Link; las páginas server usan `requireAdmin()` para redirigir a `/login` si la sesión no es administradora.
- Autorización admin basada en:
  - `user.app_metadata.role === 'admin'`, o
  - Email incluido en `ADMIN_EMAIL`/`ADMIN_EMAILS`.
- Llamadas internas pueden usar `X-INTERNAL-KEY = INTERNAL_API_SECRET` cuando no hay sesión (webhooks, cronjobs).
- RLS: solo admin o service role pueden leer/escribir `core.*`; `storage.objects` permite lectura a admin/service y, opcionalmente, a owners usando metadata.

## 6. Integraciones externas
- **Webhook de email**: compatible con SendGrid Inbound Parse u otros servicios que envíen multipart/form-data.
- **Exports**: rutas `/api/export/csv` y `/api/invoices/export.csv` (legacy) entregan CSVs administrados.
- **Scripts internos**: `scripts/profile-dashboard.js` perfila la RPC de dashboard usando el build en `tmp/ts-build` y `.env.local`.

## 7. Consideraciones de escalabilidad
- Añadir índices adicionales si se incorporan filtros por fechas o estados distintos.
- El webhook ya reutiliza `persistInvoicePdf`; revisa periódicamente su latencia y considera colas si llegan >10 facturas/min.
- Si se incorporan múltiples administradores o clientes finales, será necesario extender `core.is_admin`, claims y políticas RLS.
