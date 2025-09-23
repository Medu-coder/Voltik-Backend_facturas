# Voltik · Frontend (MVP repositorio de facturas)

Aplicación Next.js destinada a un único administrador. Permite crear y mantener un repositorio central de clientes y sus facturas eléctricas. El administrador puede subir facturas manualmente, recibirlas desde servicios externos y consultar todo el histórico.

## Requisitos
- Node 18+
- Proyecto Supabase (Auth + Postgres + Storage) con el esquema `core` desplegado
- Bucket privado `invoices` en Supabase Storage

## Variables de entorno (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
SUPABASE_JWT_SECRET=…
NEXT_PUBLIC_APP_URL=http://localhost:3000
STORAGE_INVOICES_BUCKET=invoices
STORAGE_SIGNED_URL_TTL_SECS=120

# Admin (correo/nombre usados para validar sesión y asociar clientes)
ADMIN_EMAIL=admin@example.com                # lista separada por comas admitida
ADMIN_USER_ID=11111111-1111-1111-1111-111111111111  # opcional pero recomendado

# Integraciones
INTERNAL_API_SECRET=clave_para_servicios_internos
INBOUND_EMAIL_SECRET=clave_para_webhook_de_email
```

En Supabase Auth, añade `http://localhost:3000/api/auth/callback` a los Redirect URLs. La cuenta que uses para loguearte debe tener `app_metadata.role = 'admin'` **o** un email incluido en `ADMIN_EMAIL`.

## Puesta en marcha
```
pnpm install        # o npm install
pnpm dev            # o npm run dev
```
Accede a http://localhost:3000/login, introduce el email del admin y completa el enlace mágico.

## Funcionalidad clave
- **Clientes**
  - Listado en `/customers` con número de facturas y última actividad.
  - Detalle en `/customers/[id]` con toda la actividad.
  - Se crean automáticamente al subir/recibir una factura si no existen (por email).
- **Subida de facturas (manual)**
  - Formulario en `/upload`: pide nombre del cliente, email y PDF (≤10 MB).
  - Si el cliente no existía, se crea usando el email. Si existía, se actualiza el nombre.
  - El PDF se guarda en Storage con estructura `año/mes/email-normalizado/invoiceId.pdf` (ej. `2025/09/cliente_demo_at_example_com/UUID.pdf`).
- **Dashboard**
  - `/dashboard` muestra todas las facturas con filtros por fecha, descarga de CSV y acceso al detalle.
- **Detalle de factura**
  - `/invoices/[id]` muestra datos normalizados + JSON completo (`extracted_raw`), descarga firmada y opción de reprocesar.
- **Integraciones externas**
  - Los servicios que llamen a `/api/upload` pueden autenticarse con `Authorization: Bearer <access_token>` o `X-INTERNAL-KEY = INTERNAL_API_SECRET`.
  - El webhook de email (`/api/email/inbound`) acepta nombre/email y adjunta el PDF; reutiliza la misma lógica de creación de clientes/facturas.

## Scripts de prueba
- `bash scripts/run-e2e-frontend.sh`
  - Usa valores por defecto (token y cliente demo). Puedes sobreescribirlos:
    ```
    APP_URL=http://localhost:3000 \
    USER_JWT=eyJ... \
    CUSTOMER_NAME="Cliente QA" \
    CUSTOMER_EMAIL="qa@example.com" \
    bash scripts/run-e2e-frontend.sh
    ```
- `bash scripts/test-frontend.sh` funciona igual pero requiere que exportes previamente `USER_JWT`.

## Flujo de datos
1. El administrador se autentica (Magic Link).
2. Al subir una factura:
   - Se valida/crea el cliente (`core.customers`) con `ensureCustomer`.
   - El PDF se sube a Storage privado (`invoices/<admin>/<uuid>.pdf`).
   - Se inserta la fila en `core.invoices` con `status='pending'`.
3. Servicios externos siguen el mismo proceso usando `X-INTERNAL-KEY` o Bearer token.
4. El dashboard y exportaciones recorren todos los clientes/facturas (sin filtros por usuario).

## Seguridad
- Solo la cuenta admin (rol `admin` o email en `ADMIN_EMAIL`) puede acceder a cualquier página o endpoint.
- Las rutas server usan `SERVICE_ROLE_KEY` únicamente en backend (nunca en cliente).
- Storage es privado y las descargas se hacen mediante URL firmada corta (`STORAGE_SIGNED_URL_TTL_SECS`).
- Existen endpoints de depuración para desarrollo (`/api/debug/session`, `/api/debug/customers`) protegidos por `INTERNAL_API_SECRET` o por rol admin.
