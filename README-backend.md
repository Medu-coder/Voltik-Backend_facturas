# Backend – Endpoints Next.js + Supabase

Este backend implementa endpoints para ingesta de facturas (PDF), recepción por email (SendGrid Inbound), generación de URLs firmadas y exportación CSV. Usa Supabase (Postgres + Storage) según `supabase/SUPABASE_CONFIG.md`.

## Requisitos
- Node.js 20+ (recomendado; 18 está deprecado en supabase-js)
- Variables de entorno configuradas (ver `.env.example`)
- Dependencias: `@supabase/supabase-js`, `jose`

## Variables de Entorno
Copia `.env.example` a `.env.local` y completa los valores.

Claves importantes:
- `SUPABASE_SERVICE_ROLE_KEY`: sólo servidor (no exponer en cliente)
- `SUPABASE_JWT_SECRET`: para verificar tokens (admin)
- `INTERNAL_API_SECRET`: para llamadas internas (`/api/email/inbound` → `/api/upload`)
- `INBOUND_EMAIL_SECRET`: secret compartido con SendGrid Inbound Parse
- `LIMITE_PDF_MB`: tamaño máximo de PDF (MB)

## Endpoints

- POST `/api/upload`
  - Multipart form-data: `file` (PDF ≤ `LIMITE_PDF_MB` MB), `customer_id` (UUID)
  - Crea objeto en Storage bucket `invoices` en ruta `YYYY/MM/{invoice_id}__{actor_user_id}.pdf` (ruta relativa al bucket). `actor_user_id` se toma del JWT si está presente; si no, se usa `customers.user_id`.
  - Inserta en `core.invoices` con `status='pending'` y `storage_object_path`.
  - Respuesta 201: `{ invoice_id, storage_path }`
  - Errores: 400/413/415/404/500 (todos registran en `core.audit_logs`).

- POST `/api/email/inbound`
  - Multipart SendGrid Inbound. Requiere cabecera `X-INBOUND-SECRET`.
  - Extrae remitente y adjunto PDF, busca `customer` por email y delega en `/api/upload`.
  - Respuesta 200: payload de `/api/upload`.

- GET `/api/files/signed-url?path=YYYY/MM/{invoice_id}__{actor_user_id}.pdf[&expiresIn=60]`
  - Sólo admin (`Authorization: Bearer <admin JWT>`).
  - Devuelve `{ url, expiresIn }`. Expiración por defecto 60s (máx 300s).

- GET `/api/export/csv?from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Sólo admin (`Authorization: Bearer <admin JWT>`).
  - Responde CSV con cabeceras y `Content-Disposition` para descarga.

## Pruebas Rápidas (curl)
Asegúrate de tener un `customer_id` válido en `core.customers` y un JWT admin.

- Subida web
```bash
curl -sS -X POST http://localhost:3000/api/upload \
  -F "file=@./samples/invoice.pdf;type=application/pdf" \
  -F "customer_id=UUID_DEL_CUSTOMER" | jq .
```

- Inbound SendGrid (simulado)
```bash
curl -sS -X POST http://localhost:3000/api/email/inbound \
  -H "X-INBOUND-SECRET: $INBOUND_EMAIL_SECRET" \
  -F "from=cliente@example.com" \
  -F "subject=Factura" \
  -F "attachment1=@./samples/invoice.pdf;type=application/pdf" | jq .
```

- Signed URL (admin)
```bash
curl -sS "http://localhost:3000/api/files/signed-url?path=2025/09/INVOICE_ID__USER_ID.pdf" \
  -H "Authorization: Bearer $ADMIN_JWT" | jq .
```

- Export CSV (admin)
```bash
curl -sS -D - "http://localhost:3000/api/export/csv?from=2025-09-01&to=2025-09-30" \
  -H "Authorization: Bearer $ADMIN_JWT" -o invoices.csv
```

- Verificar logs (como admin, vía REST de Supabase si aplica)
```bash
curl -sS "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/audit_logs?select=event,entity,level,created_at&order=created_at.desc&limit=10" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Accept-Profile: core" | jq .
```

## Notas de Despliegue
- Next.js App Router (`app/api/*`), `runtime = 'nodejs'` en todas las routes.
- Vercel: configurar variables en Project Settings. No expongas `SUPABASE_SERVICE_ROLE_KEY` en cliente.
- Región EU recomendada para latencia con Supabase EU.
- Tamaño máximo: `LIMITE_PDF_MB` (10MB por defecto) para archivos PDF.
- Node 20+: si usas `nvm`, ejecuta `nvm install 20 && nvm use 20` (también añadimos `.nvmrc`).

## E2E Test Runner
- Script: `./run-e2e-tests.sh`
- Requisitos: servidor dev corriendo en `http://localhost:3000`, `.env.local` completo, acceso a Supabase.
- Qué hace: crea customer de prueba (vía REST), genera PDF, prueba las 4 rutas y muestra resumen PASS/FAIL.

## Errores Comunes
- 401/403: falta token o no es admin (en rutas admin).
- 413: PDF supera el límite.
- 415: MIME no válido (se requiere PDF).
- 404: `customer` no existe o objeto de Storage no existe.
- 500: fallo en subida/insert/query.

## Criterios de Aceptación (validación)
- Subida web crea invoice `pending` y objeto en Storage (verificar respuesta 201 + presencia en DB/Storage).
- Email entrante con PDF crea invoice `pending` (delegación correcta a `/api/upload`).
- Signed URL expira y requiere admin (probar acceso antes/después de 60s).
- Export CSV descarga fichero válido con cabeceras y filas.
- Errores registrados en `core.audit_logs`.
