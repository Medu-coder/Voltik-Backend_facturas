# Voltik Invoices - Documentacion Tecnica

## Vision General de la Arquitectura
```
Browser (admin y automatizaciones)
   |
   v
Next.js App Router (app/*)
   |-- Server Components (SSR/SSG)
   |-- Client Components (UploadForm, Toaster, JsonViewer)
   |-- API Routes (app/api/*)
           |
           v
     Supabase Project
       |-- Auth (magic link, JWT claims)
       |-- Postgres (schema core)
       |-- Storage bucket "invoices"
```
- Autenticacion via Supabase magic link; las paginas server usan `requireAdmin()` para aplicar guardas.
- Servicios internos (webhooks, intake publico, scripts) reutilizan las mismas utilidades (`ingestInvoiceSubmission`, `ensureCustomer`).
- Auditoria centralizada en `core.audit_logs` mediante `logAudit` (service role).

## Tecnologias y Dependencias
| Componente | Version | Notas |
| --- | --- | --- |
| Runtime | Node.js 20.x | requerido por Next 14 y scripts locales |
| Framework | Next.js ^14.2.3 (App Router) | SSR/ISR habilitado; rutas en `app/` |
| UI | React 18.2 | componentes server/client |
| Supabase SDK | `@supabase/supabase-js` ^2.45.4, `@supabase/ssr` ^0.7.0 | clientes server, browser y admin |
| Auth JWT | `jose` ^5.5.0 | validacion de Bearer tokens en API privadas |
| Estilos | Tailwind base via `styles.css` | tokens custom de Voltik, no se usa `tailwind.config.js` |
| Tooling | TypeScript ^5.4.5, ESLint 8.57.1 | `npm run typecheck` / `npm run lint` |
| Supabase CLI | ^2.40.7 (devDependency) | generar tipos y ejecutar migraciones |

## Configuracion del Proyecto
### Scripts npm
| Script | Efecto |
| --- | --- |
| `npm run dev` | `next dev` en `http://localhost:3000` |
| `npm run build` | `next build` con chequeos de produccion |
| `npm run start` | `next start` tras compilar |
| `npm run lint` | `next lint` |
| `npm run typecheck` | `tsc --noEmit` |

### Variables de Entorno
| Variable | Descripcion |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL base del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | llave anonima usada por SSR/CSR |
| `SUPABASE_SERVICE_ROLE_KEY` | llave service_role (solo servidor) |
| `SUPABASE_JWT_SECRET` | secreto para verificar Bearer JWT |
| `NEXT_PUBLIC_APP_URL` | URL canonic del frontend; soporta redirects, descargas |
| `ADMIN_EMAIL` / `ADMIN_EMAILS` | correos con permisos admin (lista separada por comas) |
| `ADMIN_USER_ID` | UUID usado como actor al crear clientes desde tareas automatizadas |
| `INTERNAL_API_SECRET` | clave compartida para rutas internas (`/api/upload`, `/api/debug/session`) |
| `INBOUND_EMAIL_SECRET` | firma para `/api/email/inbound` |
| `STORAGE_INVOICES_BUCKET` | nombre del bucket (default `invoices`) |
| `STORAGE_SIGNED_URL_TTL_SECS` | TTL en segundos para URLs firmadas (default 120) |
| `PUBLIC_INTAKE_ALLOWED_ORIGINS` | lista de origenes permitidos para `/api/public/intake` (separados por comas) |
| `PUBLIC_INTAKE_CAPTCHA_SECRET` | secreto reCAPTCHA v3 para verificación de tokens |
| `PUBLIC_INTAKE_RATE_LIMIT` | solicitudes permitidas por IP (default 5) |
| `PUBLIC_INTAKE_RATE_WINDOW_MS` | ventana del rate limit en ms (default 60000) |
| `PUBLIC_INTAKE_ACTOR_ID` | UUID usado como `actor_user_id` en auditoria del intake publico |
| `NODE_ENV` | controla rutas de debug y modo Next |

### Configuracion Next y TypeScript
- `next.config.js`: activa React Strict Mode y aumenta `bodySizeLimit` de Server Actions a 10 MB (acorde al tamano maximo de PDF).
- `tsconfig.json`: alias `@/*` apuntando a la raiz, `moduleResolution: Bundler`, `strict` activado.
- `tsconfig.profile.json`: compila `lib/**` y `scripts/**` a CommonJS dentro de `tmp/ts-build/` (usado por scripts de profiling).

### Scripts auxiliares
- `scripts/profile-dashboard.js`: ejecuta `fetchDashboardData` contra Supabase para medir latencia. Carga `.env.local`, compila codigo (usando `tmp/ts-build`) y ejecuta dos escenarios (`last_12_months`, `last_10_days`).
- `tmp/ts-build/`: artefactos generados por `tsc` para los scripts (no modificar manualmente).
- `tmp/seed_*.json` y `.sql`: datasets de pruebas e inserciones de ejemplo para Supabase.

## Estructura del Repositorio
| Ruta | Contenido |
| --- | --- |
| `app/` | Paginas y rutas API en App Router (dashboard, invoices, customers, login, upload, API REST) |
| `components/` | Componentes compartidos (AppShell, InvoiceTable, UploadForm, JsonViewer, Toaster) |
| `lib/` | Lógica de negocio (auth, supabase clients, invoices, customers, export, security, utils) |
| `public/` | Recursos estaticos (`voltik-logo-web_873x229.svg`) |
| `styles.css` | Tokens y utilidades de estilo (Manrope, colores Voltik, componentes base) |
| `docs/` | Documentacion previa (arquitectura, operaciones, ADR) |
| `supabase/` | Migraciones SQL, esquema completo, muestras CSV, instrucciones de configuracion |
| `scripts/` | Scripts Node auxiliares |
| `tmp/` | Artefactos de seeds y builds temporales |
| `package.json` | Dependencias y scripts |
| `tsconfig*.json`, `next-env.d.ts`, `next.config.js` | Configuracion tooling |

## App Router y Vistas
### Layout general
- `app/layout.tsx`: aplica `styles.css`, Toaster global y metadatos, establece idioma `es`.
- `components/AppShell.tsx`: sidebar con navegacion (`Dashboard`, `Facturas`, `Clientes`), acciones rapidas (subida, export) y topbar opcional.
- `components/Toaster.tsx`: provider client que muestra notificaciones temporales.

### Paginas
| Ruta | Tipo | Datos usados | Comentarios |
| --- | --- | --- | --- |
| `/` (`app/page.tsx`) | Server | `supabaseServer().auth.getUser()` | Redirige a `/dashboard` o `/login` segun sesion |
| `/login` | Server + client form | `supabaseServer`, `LoginForm` | Form envia OTP (link magico) con `supabase.auth.signInWithOtp`; valida `NEXT_PUBLIC_APP_URL` |
| `/logout` | Route handler | `supabaseRoute().auth.signOut()` | Redirige a `/login`; GET y POST comparten logica |
| `/dashboard` | Server | `requireAdmin`, `supabaseAdmin`, `fetchDashboardData` | KPIs, comparativas mensuales, distribucion de estados, tabla de 20 facturas |
| `/invoices` | Server | `requireAdmin`, `supabaseAdmin` | Listado paginado (50), busqueda `q`, enlaces a detalle |
| `/invoices/[id]` | Server | `supabaseAdmin` | Resumen completo + `JsonViewer` del campo `extracted_raw`, acciones (descargar, reprocesar) |
| `/customers` | Server | `supabaseAdmin`, RPC `get_customers_last_invoice` | Busqueda de clientes, conteo de facturas, ultima factura |
| `/customers/[id]` | Server | `supabaseAdmin` | Ficha de cliente + tabla de facturas filtrada |
| `/upload` | Server | `requireAdmin` | Formulario de subida (`UploadForm`) |

### Componentes especificos
- `app/dashboard/components/MonthlyInvoicesCard.tsx`: genera grafico SVG agrupado mes contra mes anterior, fallback sin datos.
- `app/dashboard/components/InvoicesStatusCard.tsx`: dona de estados con porcentajes, accesibilidad via `title`/`desc`.
- `components/InvoiceTable.tsx`: tabla reutilizable con formateo de fechas (`formatDate`) y totales (`formatCurrency`), badges de estado.
- `components/UploadForm.tsx`: valida PDF ≤10 MB, email/nombre obligatorios y teléfono opcional, usa `fetch('/api/upload')` y redirige al dashboard tras exito.
- `components/JsonViewer.tsx`: expand/contrae JSON, copia al portapapeles.

### Estilos (`styles.css`)
- Define tokens CSS custom (`--voltik-*`), escalas de spacing/typografia, componentes (botones, badges, tablas, layout, toasts).
- Incluye clases especificas para charts (`app/dashboard/charts.css`).

## API Routes (app/api)
### Endpoints administrados
| Ruta | Metodo(s) | Auth | Descripcion |
| --- | --- | --- | --- |
| `/api/auth/callback` | GET | Codigo OTP de Supabase | Intercambia `code` por sesion, setea cookies y redirige |
| `/api/upload` | POST | Sesion admin o `X-INTERNAL-KEY` | Valida PDF, cliente y teléfono opcional; delega en `ingestInvoiceSubmission` con eventos de auditoria |
| `/api/invoices/export.csv` | GET | Sesion admin | Export CSV por periodo (`from`, `to`) usando `buildInvoicesCsv` (campo `billing_period`) |
| `/api/invoices/[id]/download` | GET | Sesion admin | Crea signed URL (TTL configurable) y redirige |
| `/api/invoices/[id]/reprocess` | POST | Sesion admin | Cambia `status` a `reprocess` y redirige a detalle |
| `/api/files/signed-url` | GET | Bearer admin (JWT) | Genera signed URL para `path` dado, TTL 10-300s |
| `/api/export/csv` | GET | Bearer admin (JWT) | Export CSV filtrado (`from`, `to`, campo `created_at`) para integraciones |

### Endpoints de integracion
| Ruta | Metodo | Auth | Proposito |
| --- | --- | --- | --- |
| `/api/email/inbound` | POST | `X-INBOUND-SECRET` | Webhook (p.ej. SendGrid). Extrae PDF y `from`, asegura cliente, sube factura (con eventos `email_inbound_*`). |
| `/api/public/intake` | POST | Origin permitido + reCAPTCHA v3 | Formularios publicos. Acepta multipart/form-data con archivos PDF (max 10MB), valida reCAPTCHA v3, hace rate limit por IP, crea factura con actor `PUBLIC_INTAKE_ACTOR_ID`. Campos: fecha, nombre, email, telefono, archivo, recaptchaToken. |

### Herramientas de debug (solo `NODE_ENV=development`)
| Ruta | Metodo | Descripcion |
| --- | --- | --- |
| `/api/debug/session` | GET | Devuelve `access_token`/`refresh_token` si se provee `INTERNAL_API_SECRET` |
| `/api/debug/customers` | GET | Lista clientes básicos si la sesion es admin |

## Lógica de Negocio (`lib/`)
### Autenticacion y clientes Supabase
| Archivo | Resumen |
| --- | --- |
| `lib/auth.ts` | `requireAdmin`, `getAdminSession`, `isAdminUser`. Chequea `app_metadata` o emails configurados. |
| `lib/supabase/server.ts` | Crea clientes SSR/Route (`createServerClient`) gestionando cookies. |
| `lib/supabase/client.ts` | Cliente browser (`createBrowserClient`). |
| `lib/supabase/admin.ts` | Cliente service role (`schema: core`). |
| `lib/supabase.ts` | Helpers compartidos: cachea clientes admin/anon, verifica JWT (`jose`), `HttpError`, valida `Authorization`, `requireInternalKey`. |

### Facturas y clientes
| Archivo | Funcion principal |
| --- | --- |
| `lib/customers.ts` | `ensureCustomer`: normaliza email/nombre/teléfono, reutiliza cliente o crea uno nuevo (requiere `ADMIN_USER_ID`) y actualiza `mobile_phone` si cambia. |
| `lib/invoices/upload.ts` | `persistInvoicePdf`: sube PDF a Storage (`metadata: customer_id, actor_user_id`), inserta fila `core.invoices`, revierte subida si falla insert. |
| `lib/invoices/intake.ts` | `ingestInvoiceSubmission`: orquesta `ensureCustomer`, `persistInvoicePdf`, registra auditoria personalizada (eventos configurables). |
| `lib/invoices/dashboard.ts` | `fetchDashboardData`: ejecuta RPC `dashboard_invoice_aggregates`, arma comparativas mensuales, series diarias, breakdown de estados, tabla (max 20). Incluye utilidades para normalizar filtros y construir comparaciones año vs año. |
| `lib/export/invoicesCsv.ts` | `fetchInvoiceRows`, `rowsToCsv`, `buildInvoicesCsv` con filtros por rango (`created_at` o `billing_period`). |
| `lib/storage.ts` | `buildInvoiceStoragePath`: genera rutas `segmento_email/AAAA/MM/DD/invoiceId.pdf`, sanitiza email. |

### Seguridad y auditoria
| Archivo | Resumen |
| --- | --- |
| `lib/security/captcha.ts` | Verifica token hCaptcha/Recaptcha o secreto compartido; lanza `CaptchaError`. |
| `lib/security/rate-limit.ts` | Rate limiter in-memory (mapa process-level). Controla tokens y emite `RateLimitError` con `retryAfter`. |
| `lib/logger.ts` | `logAudit`: inserta en `core.audit_logs` usando cliente admin; convierte metadata a JSON seguro, nunca lanza excepcion bloqueante. |

### Utilidades
| Archivo | Resumen |
| --- | --- |
| `lib/date.ts` | Formateo (`formatDate`, `formatDateRange`, `formatRangeSummary`), helpers UTC (`parseISODate`, `isoDateString`, `startOfMonthUtc`, `shiftRangeByMonths`). |
| `lib/number.ts` | `formatCurrency` en EUR. |
| `lib/types/supabase.ts` | Tipos generados para `Database` (tablas `customers`, `invoices`, `audit_logs`, funciones RPC). |

## Supabase
### Tablas y funciones claves (schema `core`)
| Elemento | Descripcion | Notas |
| --- | --- | --- |
| `core.customers` | Clientes vinculados a `auth.users`. Columnas: `id`, `user_id`, `name`, `email`, `mobile_phone`, bandera `is_active`, timestamps. |
| `core.invoices` | Facturas: `customer_id`, `storage_object_path`, campos energeticos (tarifa, precios), periodo de facturacion, montos, `status`, `extracted_raw` JSON. |
| `core.audit_logs` | Auditoria: `event`, `entity`, `level`, `meta` JSON. |
| `core.dashboard_invoice_aggregates(p_from, p_to, p_query)` | RPC SQL (security definer) que devuelve JSON con totales, buckets mensuales, status breakdown. Usa indices `idx_invoices_created_at`, `idx_invoices_status_created_at`. |
| `core.get_customers_last_invoice(p_customer_ids)` | RPC que calcula ultima factura (`max(created_at)`) por cliente. |
| `core.is_admin()` | Helper usado por RLS para comprobar claims `admin` o `service_role`. |

### RLS y politicas
- `core` tablas: policies `*_admin_*` permiten CRUD solo a `core.is_admin()`; service role mantiene acceso completo.
- `storage.objects`: policies `invoices_*` limitan operaciones al bucket `invoices` y exigen `core.is_admin()` o rol `service_role`.
- Migraciones en `supabase/migrations/*.sql` crean indices y funciones RPC necesarias.

### Storage y archivos
- Bucket privado (default `invoices`).
- Metadata obligatoria por politica: `customer_id`, `actor_user_id` (cargada en `persistInvoicePdf`).
- Ruta generada por `buildInvoiceStoragePath` depende de fecha de emision (`issuedAt`): `email_sanitizado/YYYY/MM/DD/invoiceId.pdf`.

### Artefactos complementarios
| Archivo | Proposito |
| --- | --- |
| `supabase/SUPABASE_CONFIG.md` | Pasos para desplegar esquema, policies y rotacion de secretos. |
| `supabase/schema/structure.sql` | Dump completo del proyecto (usuarios, funciones, policies, storage). |
| `supabase/test.pdf` | PDF de prueba para flujos de subida. |

## Integraciones Externas
- **Email inbound**: Servicios como SendGrid deben firmar con `X-INBOUND-SECRET` y enviar `multipart/form-data` con PDF (`application/pdf`). El endpoint guarda auditoria (`email_inbound_*`).
- **Formularios publicos**: Deben enviar campos `first_name`, `last_name`, `email`, `privacy_ack`, `captcha_token`, `file` y pueden incluir `phone`/`mobile_phone`. Origen debe estar en la lista permitida.
- **Automatizaciones internas**: Pueden llamar `/api/upload` con `X-INTERNAL-KEY` (sin sesion) o `/api/export/csv` con un JWT admin firmado con `SUPABASE_JWT_SECRET`.
- **Descargas firmadas**: `app/api/invoices/[id]/download` y `/api/files/signed-url` generan URLs temporales para PDF en Storage.

## Auditoria y Logging
- `lib/logger.ts` registra cualquier paso relevante en `core.audit_logs` (evento, entidad, nivel, metadata).
- Principales eventos: `invoice_upload_*`, `invoice_intake_*`, `public_intake_*`, `email_inbound_*`, `export_csv_*`, `signed_url_*`.
- Fallos en auditoria solo se registran en consola (`console.warn`) para evitar cortar la request.

## Buenas Practicas y Convenciones
- Utilizar `requireAdmin()` en paginas y funciones server que dependan de datos sensibles.
- Ante nuevas tablas Supabase, generar tipos con `supabase gen types` y actualizar `lib/types/supabase.ts`.
- Mantener `ingestInvoiceSubmission` como unica puerta de entrada para crear facturas (garantiza metadata, auditoria y politicas).
- Para nuevas rutas API, extender `HttpError` para respuestas controladas y registrar eventos en `logAudit`.
- Cumplir validaciones de PDF: MIME `application/pdf`, tamano ≤10 MB.
- Documentar cambios estructurales en `docs/architecture.md` y crear ADRs cuando aplique (`docs/adr/`).

## Despliegue y Operacion
- **Build**: `npm run build` debe pasar sin warnings; ejecutar `npm run lint` y `npm run typecheck` previamente.
- **Supabase**: aplicar migraciones antes de desplegar nuevas versiones de la app (orden cronologico).
- **Secretos**: rotar `anon`, `service_role`, `JWT` despues de pruebas; refrescar variables en proveedor (Vercel, Railway, etc.).
- **Monitoring**: revisar `core.audit_logs` y los buckets de Storage para detectar accesos inusuales.
- **Limitaciones actuales**: rate limiting en memoria (no distribuido); no hay workers para procesamientos async; `extracted_raw` se muestra tal cual sin redaccion.

## Referencias Internas
- `docs/architecture.md`: descripcion ampliada y mermaid del modelo.
- `docs/setup.md`: checklist de entorno, variables y comandos.
- `docs/operations.md`, `docs/security.md`: procedimientos operativos y controles.
- `docs/review/REPORTE_AUDITORIA_2025-09-26.md`: hallazgos de auditoria previa.
- `docs/public-intake-plan.md`: blueprint del endpoint publico (ya implementado).
