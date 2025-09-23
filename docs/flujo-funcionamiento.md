# Flujo de funcionamiento (Administrador único)

El MVP opera con un único usuario administrador capaz de gestionar todos los clientes y facturas. Tanto las acciones manuales como las integraciones externas siguen el mismo proceso de normalización para mantener el repositorio centralizado.

## Autenticación y autorización
1. El administrador accede a `/login` y solicita un enlace mágico (Supabase Auth).
2. Tras validar el enlace, la sesión debe cumplir uno de estos criterios:
   - `app_metadata.role === 'admin'`, **o**
   - El email pertenece a la lista definida en `ADMIN_EMAIL`/`ADMIN_EMAILS`.
3. Todas las páginas server (`/dashboard`, `/customers`, `/invoices/[id]`, `/upload`) usan `requireAdmin()` y redirigen a `/login` si la sesión no es admin.
4. Las rutas API verifican el token Bearer o, para integraciones internas, `X-INTERNAL-KEY = INTERNAL_API_SECRET`.

## Modelo de datos relevante
- `core.customers`
  - `id uuid`
  - `user_id uuid` (se rellena con `ADMIN_USER_ID` o el `user.id` del admin)
  - `name`, `email`
- `core.invoices`
  - `customer_id uuid` FK → `core.customers`
  - `storage_object_path` (ruta del PDF en Storage)
  - `status` (`pending | processed | error | reprocess`)
  - Resto de campos normalizados (`billing_start_date`, `issue_date`, `total_amount_eur`, etc.)

## Subida manual (`/upload` → `/api/upload`)
1. El administrador rellena **Nombre del cliente**, **Email** y adjunta el PDF (≤10 MB).
2. `ensureCustomer()` busca el email en `core.customers`:
   - Si existe, reutiliza el registro y actualiza el nombre en caso de haber cambiado.
   - Si no existe, crea el cliente con `user_id = ADMIN_USER_ID` (o `session.user.id`).
3. Se sube el PDF a Storage siguiendo la estructura `invoices/<año>/<mes>/<email_normalizado>/<uuid>.pdf` (ej. `invoices/2025/09/cliente_demo_at_example_com/UUID.pdf`).
4. Se inserta la factura en `core.invoices` con `status='pending'`.

## Integraciones externas
- **Servicios internos** (ej. email entrante, webhooks):
  - Envían `X-INTERNAL-KEY` para autenticarse.
  - Deben incluir `customer_name`, `customer_email` y el PDF.
  - Reutilizan `ensureCustomer()` y generan la factura igual que la subida manual.
- **Email inbound (`/api/email/inbound`)**:
  - Extrae email/nombre del remitente.
  - Genera el cliente si no existe.
  - Reenvía al endpoint `/api/upload` o, si falla, ejecuta el proceso directamente.

## Dashboard y consultas
- `/dashboard` lista todas las facturas (sin filtros por usuario) y permite exportar CSV.
- `/customers` muestra el directorio de clientes con nº de facturas y última actividad.
- `/customers/[id]` detalla la ficha del cliente y su histórico de facturas.
- `/invoices/[id]` muestra los campos normalizados + `extracted_raw` y permite descargar/reprocesar.

## Exportaciones y descargas
- `/api/invoices/export.csv` genera un CSV global (restringido a admin).
- `/api/invoices/[id]/download` firma una URL temporal contra el bucket `invoices`.
- `/api/invoices/[id]/reprocess` marca la factura como `reprocess`.

## Seguridad
- Todas las operaciones críticas se ejecutan en el server utilizando el cliente Supabase de servicio (`SERVICE_ROLE_KEY`), nunca expuesto al navegador.
- Storage es privado; los PDFs solo se entregan mediante URLs firmadas con expiración corta (`STORAGE_SIGNED_URL_TTL_SECS`).
- `INTERNAL_API_SECRET` protege endpoints utilizados por orquestaciones internas.

## Pruebas y devtools
- `scripts/run-e2e-frontend.sh` realiza un flujo completo creando cliente + factura y validando descarga/reproceso.
- Endpoints de depuración (solo en `NODE_ENV=development`):
  - `/api/debug/session?key=INTERNAL_API_SECRET` → recupera el `access_token` actual.
  - `/api/debug/customers` → lista clientes registrados (requiere sesión admin).

Así se garantiza que cualquier canal (manual o externo) alimenta un repositorio único de clientes/facturas administrado por la misma persona.
