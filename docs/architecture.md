# Arquitectura y modelo de datos

## 1. Visión general
La aplicación es una SPA administrada por Next.js (App Router) con renderizado server-first. Supabase aporta autenticación (Magic Link), base de datos Postgres con RLS y Storage privado para PDFs.

**Última actualización**: 2025-10-11 (Supabase CLI v2.48.3)

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
      Storage["Storage buckets\n'invoices' + 'offers'"]
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
3. Inserta `core.invoices` (`status='Pendiente'`) y responde con el `invoiceId`.

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

### 3.1 Tablas principales
| Tabla | Registros | Propósito | Campos clave |
| --- | --- | --- | --- |
| `core.customers` | 11 | Clientes vinculados a `auth.users` | `id uuid`, `user_id uuid`, `name`, `email`, `mobile_phone`, `is_active` |
| `core.invoices` | 12 | Facturas y metadatos extraídos | FK `customer_id`, `storage_object_path`, `status`, `total_amount_eur`, `currency` |
| `core.audit_logs` | 48 | Registro de eventos de auditoría | `event`, `entity`, `level`, `meta jsonb`, `actor_user_id` |
| `core.offers` | 3 | Ofertas asociadas a facturas | FK `invoice_id`, `provider_name`, `storage_object_path` |

### 3.2 Funciones RPC
| Función | Propósito | Parámetros | Retorna |
| --- | --- | --- | --- |
| `core.dashboard_invoice_aggregates(p_from, p_to, p_query)` | Agregados para dashboard | `p_from date`, `p_to date`, `p_query text` | JSON con totales y breakdowns |
| `core.get_customers_last_invoice(p_customer_ids)` | Última factura por cliente | `p_customer_ids uuid[]` | `customer_id`, `last_invoice_at` |
| `core.is_admin()` | Verificación de permisos admin | Ninguno | `boolean` |

### 3.3 Índices optimizados
- `customers_user_id_idx` (customers.user_id)
- `invoices_customer_id_idx` (invoices.customer_id) 
- `invoices_status_idx` (invoices.status)
- `audit_logs_entity_idx` (audit_logs.entity)
- `audit_logs_created_at_idx` (audit_logs.created_at)
- `offers_invoice_id_idx` (offers.invoice_id)
- `offers_provider_name_idx` (offers.provider_name)

### 3.4 Relaciones Foreign Key
- `invoices.customer_id → customers.id` (CASCADE)
- `offers.invoice_id → invoices.id` (CASCADE) 
- `audit_logs.customer_id → customers.id` (SET NULL)

## 4. Storage de facturas y ofertas

### 4.1 Buckets configurados
| Bucket | Tipo | Límite | Tipos permitidos | Registros |
| --- | --- | --- | --- | --- |
| `invoices` | Privado | Sin límite | Todos | 12 archivos |
| `offers` | Privado | 10MB | application/pdf | 3 archivos |

### 4.2 Estructura de rutas
- **Facturas**: `<segmento_email>/AAAA/MM/DD/<invoiceId>.pdf`
  - Ejemplo: `cliente.example.com/2025/01/15/uuid-factura.pdf`
  - El segmento de email se sanitiza en `lib/storage.ts`
- **Ofertas**: `<invoice_id>/<offer_id>.pdf`
  - Ejemplo: `uuid-factura/uuid-oferta.pdf`
  - Estructura más simple sin jerarquía temporal

### 4.3 Metadata obligatoria
- **Facturas**: `{ customer_id, actor_user_id, uploaded_at }`
- **Ofertas**: `{ invoice_id, offer_id, actor_user_id, provider_name, uploaded_at }`

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
