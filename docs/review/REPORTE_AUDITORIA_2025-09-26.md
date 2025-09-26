# 1. Resumen ejecutivo
- Estado actual: plataforma estable tras cerrar las brechas críticas detectadas en la auditoría previa. El flujo de ingesta (manual + webhook) comparte ahora un único helper tipado (`lib/invoices/upload.ts`) con trazabilidad completa y metadata obligatoria.
- Todas las mejoras priorizadas se aplicaron: el listado de clientes usa la RPC `core.get_customers_last_invoice` para evitar escaneos masivos (`app/customers/page.tsx:48`), las exportaciones CSV comparten helper (`lib/export/invoicesCsv.ts:47`) y la documentación refleja la realidad del esquema.
- Seguridad reforzada: no quedan secretos en el repositorio, la documentación guía la configuración sin credenciales, y la CI valida esquema y políticas RLS con un usuario de solo lectura (`.github/workflows/ci.yml:32`).
- Persisten oportunidades en observabilidad y gestión operativa: aún no hay métricas ni alertas automáticas, y las exportaciones cargan el resultado en memoria antes de enviarlo, lo que puede impactar con datasets muy grandes.
- Roadmap centrado en observabilidad, tests automatizados de negocio y optimizaciones progresivas (streaming CSV, políticas de retención en Storage).

# 2. Scorecard 0-5
| Dimensión | Score | Justificación breve | Cómo subir +1 |
| --- | --- | --- | --- |
| Rendimiento | 4 | Hotspots resueltos (RPC de clientes, exportación consolidada) y consultas indexadas. Falta streaming en CSV para cargas masivas. | Implementar streaming/chunking en `lib/export/invoicesCsv.ts:83` o generar exports asíncronos. |
| Seguridad (Auth/RLS/Storage/PII) | 4 | Sin secretos en repo, metadata consistente y CI que valida el esquema. Rotación de claves depende aún de proceso manual. | Automatizar rotaciones (cron o alerta) y añadir monitoreo de uso del usuario `ci_lint` en Supabase. |
| Calidad de código | 4 | Código tipado y reutilización centralizada (`persistInvoicePdf`) reduce duplicaciones. Carece de test de regresión automatizados. | Añadir pruebas E2E/unitarias para rutas críticas (`/api/upload`, `/api/export/csv`). |
| Arquitectura & organización | 4 | App Router modular, librerías Supabase unificadas y helpers compartidos. Rutas legacy como `/api/invoices/export.csv` siguen expuestas. | Despublicar endpoints legacy y documentar plan de deprecación. |
| DX (experiencia dev) | 4 | CI con lint/TypeScript y lint de Supabase, docs de setup limpias. Aún no hay suite de tests ni scripts de smoke. | Incorporar `npm run test` (p. ej. Playwright) y plantillas de PR. |
| Documentación | 4 | `/docs` actualizado, referencias consistentes, reporte actualizado. Falta historial de decisiones (ADRs recientes). | Registrar nuevas decisiones (p. ej. helper de uploads, política de CI) en `docs/adr/`. |
| Observabilidad mínima | 3 | Audit logs homogéneos y metadata en Storage; sin métricas ni alertas. | Conectar Supabase Log Drain, alertas básicas y uptime checks. |
| Coste / eficiencia operativa | 4 | Uso eficiente de Supabase y metadata para RLS; sin procesos redundantes. Podría añadirse retención automática en Storage. | Automatizar limpieza/archivado de PDFs antiguos y limitar exportaciones por rango por defecto. |

# 3. Mapa de arquitectura
```mermaid
flowchart TD
    Browser["Admin browser"]
    Next["Next.js App Router\n(server components)"]
    API["API routes\n(app/api/*)"]
    UploadHelper["Helpers\n(lib/invoices/upload.ts)"]
    SupabaseAuth["Supabase Auth"]
    SupabaseDB["Supabase Postgres\n(core schema)"]
    SupabaseStorage["Supabase Storage\n(bucket invoices)"]
    SendGrid["Inbound email provider"]

    Browser -->|Magic link| SupabaseAuth
    Browser --> Next
    Next -->|requireAdmin()| SupabaseAuth
    Next --> API
    SendGrid -->|POST /api/email/inbound| API
    API --> UploadHelper
    UploadHelper --> SupabaseStorage
    UploadHelper --> SupabaseDB
    API -->|audit logs| SupabaseDB
```

# 4. Inventario del sistema
## 4.1 Endpoints y handlers
| Ruta | Método | Autorización | Descripción | Código |
| --- | --- | --- | --- | --- |
| `/api/upload` | POST | Admin sesión o `X-INTERNAL-KEY` | Valida PDF, asegura cliente y persiste factura vía `persistInvoicePdf`. | `app/api/upload/route.ts:16` |
| `/api/email/inbound` | POST | `INBOUND_EMAIL_SECRET` | Webhook SendGrid → reusa helper de subida + auditoría. | `app/api/email/inbound/route.ts:64` |
| `/api/export/csv` | GET | Bearer admin (JWT) | Exporta CSV (helper compartido) y registra auditoría. | `app/api/export/csv/route.ts:17` |
| `/api/invoices/export.csv` | GET | Sesión admin | Alias legacy que reusa el helper; planificada su retirada. | `app/api/invoices/export.csv/route.ts:12` |
| `/api/invoices/[id]/download` | GET | Sesión admin | Genera URL firmada (con fallback seguro). | `app/api/invoices/[id]/download/route.ts:12` |
| `/api/invoices/[id]/reprocess` | POST | Sesión admin | Marca factura como `reprocess`. | `app/api/invoices/[id]/reprocess/route.ts:12` |
| `/api/files/signed-url` | GET | Bearer admin | Devuelve URL firmada temporal para Storage. | `app/api/files/signed-url/route.ts:10` |

## 4.2 Modelo de datos (schema `core`)
| Recurso | Descripción | Código |
| --- | --- | --- |
| `core.customers` | Clientes administrados, FK optional a `auth.users`. | `supabase/schema/structure.sql` (tabla base) |
| `core.invoices` | Facturas y metadatos de Storage. Índices por `created_at`, `status`. | `supabase/schema/structure.sql` |
| `core.audit_logs` | Auditoría de eventos (`logAudit`). | `lib/logger.ts:21` |
| `core.dashboard_invoice_aggregates` | RPC para dashboard (KPI). | `supabase/migrations/20241019_dashboard_aggregates.sql:5` |
| `core.get_customers_last_invoice` | RPC para `last_invoice_at` optimizado. | `supabase/migrations/20241020_customers_last_invoice.sql:2` |

## 4.3 Variables de entorno (fuente: código)
| Variable | Lugar de uso | Scope |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Clientes Supabase (`lib/supabase/*.ts`) | Cliente + servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `getBrowserClient` (`lib/supabase.ts:32`) | Cliente |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabaseAdmin` (`lib/supabase/admin.ts:5`) y `getAdminClient` (`lib/supabase.ts:21`) | Servidor |
| `SUPABASE_JWT_SECRET` | Verificación Bearer (`lib/supabase.ts:70`) | Servidor |
| `ADMIN_EMAIL` / `ADMIN_EMAILS` | `isAdminUser` (`lib/auth.ts`) | Servidor |
| `ADMIN_USER_ID` | Upload & webhook (`app/api/upload/route.ts:27`, `app/api/email/inbound/route.ts:111`) | Servidor |
| `INTERNAL_API_SECRET` | `/api/upload` (`app/api/upload/route.ts:21`) | Servidor |
| `INBOUND_EMAIL_SECRET` | `/api/email/inbound` (`app/api/email/inbound/route.ts:10`) | Servidor |
| `STORAGE_INVOICES_BUCKET` | Upload helper (`lib/invoices/upload.ts:50`) | Servidor |
| `STORAGE_SIGNED_URL_TTL_SECS` | Signed URLs (`app/api/files/signed-url/route.ts:16`) | Servidor |
| `NODE_ENV` | Next runtime | Ambos |
| `SUPABASE_DB_URL` (GitHub Secret) | CI Supabase lint (`.github/workflows/ci.yml:37`) | CI |

# 5. Hotspots de rendimiento
| Hotspot | Riesgo | Alternativas (pros/cons/esfuerzo) | Recomendación |
| --- | --- | --- | --- |
| Export CSV genera todo en memoria (`lib/export/invoicesCsv.ts:83`) | Con >50k registros puede saturar memoria y producir timeouts. | 1) **Streaming chunked** con `ReadableStream` y `TextEncoder`. Pros: O(1) memoria; Cons: implementación más compleja. Esfuerzo M. 2) **Export asíncrono** vía job (Edge Function o cron) que guarda el CSV en Storage. Pros: escala masivo; Cons: requiere cola y notificaciones. Esfuerzo L. 3) **Limitar rango y paginar** forzando `limit` + iteraciones. Pros: simple; Cons: más round-trips. Esfuerzo S. | Implementar alternativa 1 a corto plazo; alternativa 2 a medio si el volumen crece. |

# 6. Seguridad y privacidad
- **Auth & RLS**: `requireAdmin()` y `isAdminUser` verifican claims; RPCs con `security definer` controlado (`supabase/migrations/20241020_customers_last_invoice.sql:9`). Ejecutar `supabase db lint` en la CI asegura políticas.
- **Storage**: Upload centralizado adjunta metadata `customer_id` y `actor_user_id` (`lib/invoices/upload.ts:58`). URLs firmadas limitadas por TTL y clamp (`app/api/files/signed-url/route.ts:16`).
- **Secretos**: Ninguno en el repo; documentación instruye configurarlos en `.env.local`/GitHub Secrets (`docs/setup.md`). Rotar `ci_lint` y demás claves trimestralmente.
- **PII y logs**: `logAudit` captura eventos con contexto controlado (`lib/logger.ts:19`). Recomendar retención de logs ≤180 días y anonimizar sujetos cuando no sea necesario.
- **Webhooks**: `INBOUND_EMAIL_SECRET` obligatorio; fallback usa helper común garantizando metadata y auditoría (`app/api/email/inbound/route.ts:108`). Considerar rate-limiting por IP en la CDN.

# 7. Calidad de código & arquitectura
- Código consolidado en helpers reutilizables (`persistInvoicePdf`, `buildInvoicesCsv`). Se eliminó duplicación previa en rutas.
- Tipos generados de Supabase usados en todos los clientes (`lib/types/supabase.ts`). TS `strict` y `npm run typecheck` en CI.
- CI asegura linting y validez de esquema (`.github/workflows/ci.yml:10`). Siguiente paso lógico: añadir pruebas de negocio y limpiar rutas legacy.

# 8. Roadmap
## Quick Wins (1–3 días)
1. Implementar streaming en CSV (`lib/export/invoicesCsv.ts:83`) o limitar rango por defecto.<br>2. Añadir monitor básico (Logflare o cron de error) y uptime checks a `/api/upload`.

## Core (1–2 sprints)
1. Suite de tests automatizados (unit + e2e) para ingesta y export.
2. Deprecación controlada de `/api/invoices/export.csv` con comunicación y feature flag.
3. Pipeline de rotación de claves (Supabase secrets + GitHub) con checklist en `docs/operations.md`.

## Plus (1–2 meses)
1. Observabilidad completa: log drain, alertas de errores 5xx y métricas de latencia.
2. Retención automatizada: limpieza de PDFs antiguos y archivado de logs sensibles.
3. Apertura multicliente (si aplica): rediseño RLS y claims para roles adicionales.

# 9. Suposiciones
- Se mantiene un único administrador humano; no se modelaron flujos multi-tenant.
- Volúmenes de facturas esperados <100k; las recomendaciones de streaming cobran mayor importancia si se supera esa cifra.
- Los secretos ya fueron rotados tras eliminarse del repositorio; si no, realizarlo antes de siguientes despliegues.
