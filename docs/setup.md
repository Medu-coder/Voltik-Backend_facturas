# Setup y configuración

Guía paso a paso para preparar un entorno local o de despliegue para Voltik Invoices.

## 1. Prerrequisitos
- **Node.js 20.x** (usa `nvm use 20` si tienes múltiples versiones).
- **npm** ≥ 9 (viene con Node 20).
- **Proyecto Supabase** con:
  - Postgres y Storage en la región EU.
  - Bucket privado `invoices` (se puede renombrar via `STORAGE_INVOICES_BUCKET`).
  - RLS habilitado (las políticas se aplican con las migraciones).
- Opcional: [Supabase CLI](https://supabase.com/docs/reference/cli/getting-started) para gestionar migraciones y secretos.

## 2. Clonado del repositorio
```bash
git clone <URL_DEL_REPO> voltik-invoices
cd voltik-invoices
npm install
```

## 3. Variables de entorno (`.env.local`)
Crea un archivo `.env.local` en la raíz del proyecto. **Nunca** subas este archivo a git.

| Variable | Scope | Obligatoria | Descripción |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente + servidor | Sí | URL base de tu proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente + servidor | Sí | API key anónima (solo lectura) usada por SSR/CSR. |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor | Sí | API key con rol `service_role` (solo usar en server). |
| `SUPABASE_JWT_SECRET` | Servidor | Sí | Se usa para validar tokens Bearer en rutas API. |
| `NEXT_PUBLIC_APP_URL` | Cliente + servidor | Recomendado | URL pública del frontend. Necesaria para redirects correctos (login/logout, descargas). |
| `ADMIN_EMAIL` / `ADMIN_EMAILS` | Servidor | Sí | Lista (separada por comas) de correos con acceso admin. |
| `ADMIN_USER_ID` | Servidor | Sí | UUID usado para crear clientes automáticamente cuando no hay sesión. |
| `INTERNAL_API_SECRET` | Servidor | Sí | Clave compartida para integraciones internas (`/api/upload`, `/api/debug/session`). |
| `INBOUND_EMAIL_SECRET` | Servidor | Sí | Firma las peticiones del webhook de email entrante. |
| `STORAGE_INVOICES_BUCKET` | Servidor | No (default `invoices`) | Nombre del bucket privado en Supabase Storage para facturas. |
| `STORAGE_OFFERS_BUCKET` | Servidor | No (default `offers`) | Nombre del bucket privado en Supabase Storage para ofertas. |
| `STORAGE_SIGNED_URL_TTL_SECS` | Servidor | No (default `120`) | Tiempo de vida (segundos) de las URLs firmadas para descargas. |
| `PUBLIC_INTAKE_ALLOWED_ORIGINS` | Servidor | Recomendado | Lista separada por comas de orígenes permitidos para `/api/public/intake`. Dejar vacío en desarrollo. |
| `PUBLIC_INTAKE_SHARED_SECRET` | Servidor | Opcional | Token compartido para validar formularios públicos (si no se usa captcha). |
| `PUBLIC_INTAKE_CAPTCHA_SECRET` | Servidor | Opcional | Clave secreta de hCaptcha/Recaptcha para verificar `captcha_token`. |
| `PUBLIC_INTAKE_RATE_LIMIT` | Servidor | No (default `5`) | Número de envíos permitidos por IP en la ventana configurada. |
| `PUBLIC_INTAKE_RATE_WINDOW_MS` | Servidor | No (default `60000`) | Ventana del rate limit en ms. |
| `PUBLIC_INTAKE_ACTOR_ID` | Servidor | Sí (cuando se usa intake público) | UUID utilizado como `actor_user_id` en auditoría para submissions públicas. |
| `NODE_ENV` | Servidor | Sí en despliegue | Define el modo (`production`/`development`). Rutas de debug solo funcionan en `development`. |

> **Consejo**: usa un gestor de secretos (Supabase/Vercel) para entornos productivos en lugar de variables planas.

## 4. Configuración de Supabase

### 4.1 Buckets de Storage
1. **Bucket de facturas**: Crea el bucket privado `invoices` desde la consola de Supabase (Storage > New bucket > Private).
2. **Bucket de ofertas**: Crea el bucket privado `offers` con las siguientes configuraciones:
   - Tipo: Privado
   - Límite de archivo: 10MB
   - Tipos permitidos: application/pdf

### 4.2 Base de datos
Ejecuta las migraciones SQL incluidas:
   - sube los archivos `supabase/migrations/*.sql` usando Supabase CLI o la consola SQL (`Run SQL`).
   - verifica que la función `core.dashboard_invoice_aggregates` y los índices existan (`
select proname from pg_proc where proname = 'dashboard_invoice_aggregates';`).
3. Importa el esquema completo si aún no existe (`supabase/schema/structure.sql`). Utiliza la consola `psql` o Supabase CLI (`supabase db push`) según tus necesidades.
4. Comprueba Policies en `core.*` y `storage.objects` para los buckets `invoices` y `offers`.

## 5. Generar tipos TypeScript de Supabase
Para que TypeScript controle el contrato con la base de datos, genera los tipos del proyecto y guárdalos en `lib/types/supabase.ts`.

```bash
# Requiere tener Supabase CLI autenticado con el proyecto
supabase gen types typescript --linked > lib/types/supabase.ts
```

- Ejecuta el comando tras cada cambio de esquema (nueva columna, tabla o función).
- Si trabajas sin proyecto “linked”, puedes usar `--project-id` y `--password` en su lugar.

## 6. Levantar el entorno local
```bash
npm run dev
```
El servidor se levanta en `http://localhost:3000`. Accede a `/login`, introduce un email autorizado y completa el enlace mágico que envía Supabase.

### Comandos útiles
- `npm run build`: build de producción.
- `npm run start`: arranque en modo producción (tras `build`).
- `npm run lint`: ejecuta `next lint`.
- `npm run typecheck`: ejecuta `tsc --noEmit`.

## 7. Webhook de email (opcional en local)
Puedes simular el inbound enviando un formulario multipart:
```bash
curl -X POST http://localhost:3000/api/email/inbound \
  -H "X-INBOUND-SECRET: $INBOUND_EMAIL_SECRET" \
  -F "from=cliente@example.com" \
  -F "subject=Factura" \
  -F "attachment1=@./supabase/test.pdf;type=application/pdf"
```

## 8. Mantenimientos y migraciones futuras
- Añade nuevos cambios de base de datos en `supabase/migrations/<YYYYMMDD>_<name>.sql`.
- Documenta cualquier cambio estructural en `docs/architecture.md` y, si altera la seguridad, actualiza `docs/security.md`.
- Para despliegues en Vercel/infra propia, replica las variables del `.env.local` en el gestor de secretos del proveedor.

## 9. Checklist previo a producción
- [ ] Todos los secretos configurados y rotados tras pruebas locales.
- [ ] Bucket `invoices` validado como privado y con metadata (`customer_id`, `actor_user_id`) adjunta en las subidas.
- [ ] Bucket `offers` validado como privado, límite 10MB, solo PDFs, con metadata (`invoice_id`, `offer_id`, `actor_user_id`, `provider_name`) adjunta en las subidas.
- [ ] Sistema de ofertas probado (subir, listar, descargar, eliminar).
- [ ] `npm run build` y `npm run lint` ejecutados sin errores.
- [ ] Auditoría de logs (`core.audit_logs`) confirmada.
- [ ] Webhook de email probado en entorno staging.
