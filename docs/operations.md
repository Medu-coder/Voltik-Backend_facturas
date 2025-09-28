# Operaciones y runbooks

Guía para ejecutar tareas recurrentes (despliegues, mantenimiento, soporte) en Voltik Invoices.

## 1. Tareas diarias / soporte de primer nivel
| Tarea | Responsable | Frecuencia | Pasos |
| --- | --- | --- | --- |
| Revisar facturas subidas | Admin | Diario | `/dashboard` muestra últimas 20. Si falta metadata, consulta `core.invoices` en Supabase. |
| Revisar logs de auditoría | Operaciones | Diario | Filtra `core.audit_logs` por `level != 'info'`. Usa Supabase UI o REST. |
| Procesar incidencias | Operaciones | Bajo demanda | Cambia `status` a `reprocess` usando `/api/invoices/<id>/reprocess` o `supabaseAdmin().from('invoices').update(...)`. |

## 2. Despliegues
1. Confirma que `main` pasa `npm run lint`, `npm run typecheck` y `npm run build`.
2. Aplica nuevas migraciones SQL en Supabase:
   ```bash
   supabase db push # opcional si usas Supabase CLI
   # o ejecuta el SQL desde supabase/migrations/*.sql en la consola
   ```
3. Actualiza secretos en el proveedor (Vercel/infra propia) con los valores del `.env.local`.
4. Despliega (p. ej. `vercel --prod`).
5. Valida `GET /api/files/signed-url` con un path existente y comprueba caducidad.
6. Si está habilitado el intake público, verifica que las variables `PUBLIC_INTAKE_*` están configuradas en el proveedor.

## 3. Integración continua (CI)
- Workflow `CI` en `.github/workflows/ci.yml` se ejecuta en cada push a `main` y en Pull Requests.
- Job `Lint & Typecheck`: instala dependencias con `npm ci`, ejecuta `npm run lint` y `npm run typecheck` con Node.js 20.
- Job `Supabase Schema Lint`: corre `npx supabase db lint --db-url "$SUPABASE_DB_URL"` para validar funciones, políticas RLS y tipos. El paso se omite automáticamente cuando el secreto `SUPABASE_DB_URL` está vacío, dejando constancia en logs.
- Configura el secreto en GitHub (Settings → Secrets → Actions) usando una URL de Postgres con permisos mínimos (lectura + ejecución). No lo expongas en logs.
- Falla el pipeline si cualquiera de los comandos devuelve estado distinto de cero; úsalo como requisito previo para merges.

## 4. Intake público (`/api/public/intake`)
- Permite a formularios externos subir facturas sin sesión admin.
- Requiere configurar: `PUBLIC_INTAKE_ALLOWED_ORIGINS`, `PUBLIC_INTAKE_ACTOR_ID`, y **uno** de `PUBLIC_INTAKE_SHARED_SECRET` (token estático) o `PUBLIC_INTAKE_CAPTCHA_SECRET` (hCaptcha/Recaptcha).
- Rate limit configurable vía `PUBLIC_INTAKE_RATE_LIMIT` y `PUBLIC_INTAKE_RATE_WINDOW_MS`.
- Prueba rápida:
  ```bash
  curl -X POST https://<host>/api/public/intake \
    -H "Origin: https://<dominio_permitido>" \
    -F "first_name=Ana" -F "last_name=Pérez" \
    -F "email=ana@example.com" \
    -F "privacy_ack=true" \
    -F "captcha_token=$PUBLIC_INTAKE_SHARED_SECRET" \
    -F "file=@./supabase/test.pdf;type=application/pdf"
  ```
- Auditoría: eventos `public_intake_received|success|failed` quedan en `core.audit_logs` con `actor_user_id = PUBLIC_INTAKE_ACTOR_ID`.

## 5. Scripts y herramientas
- `npm run dev`: desarrollo local.
- `npm run lint`: linting basado en Next.
- `npm run typecheck`: verifica tipos TS.
- `scripts/profile-dashboard.js`: ejecuta la RPC `dashboard_invoice_aggregates` con distintos rangos. Útil para detectar regresiones en rendimiento.
  ```bash
  node scripts/profile-dashboard.js
  ```
  Asegúrate de compilar previamente `tsconfig.profile.json` si modificas librerías (`npx tsc -p tsconfig.profile.json`).

## 6. Gestión de migraciones
- Nuevas tablas/funciones van en `supabase/migrations/<fecha>_<detalle>.sql`.
- Exporta el esquema actualizado con `supabase db dump --schema core,storage --data-only=false > supabase/schema/structure.sql` (opcional para documentación).
- Documenta los cambios relevantes en `docs/architecture.md` y crea un ADR si la decisión es significativa.

## 7. Exportaciones y reporting
- **CSV oficial**: `/api/export/csv?from=YYYY-MM-DD&to=YYYY-MM-DD` (stream en memoria) requiere token admin en cabecera `Authorization: Bearer <JWT>`.
- **CSV legacy**: `/api/invoices/export.csv` sigue disponible por compatibilidad, pero ahora delega en el mismo helper `buildInvoicesCsv`. Planifica su retirada cuando no haya consumidores externos.
- **Descarga de PDF**: `/api/invoices/<id>/download` genera URL firmada con `STORAGE_SIGNED_URL_TTL_SECS` (default 120s).

## 8. Troubleshooting
| Síntoma | Diagnóstico | Acción |
| --- | --- | --- |
| 401 en `/api/upload` | Sesión expirada o falta `X-INTERNAL-KEY`. | Revalida sesión o revisa `INTERNAL_API_SECRET`. |
| 403 en rutas admin | Email no incluido en `ADMIN_EMAIL(S)` o token sin claim `admin`. | Ajusta metadata del usuario en Supabase Auth. |
| 500 al descargar PDF | `NEXT_PUBLIC_APP_URL` sin configurar o objeto inexistente en Storage. | Añade fallback de URL y valida path en Supabase Storage. |
| Webhook responde 400 “Missing sender email” | El proveedor no envía `from` válido. | Normaliza payload o añade mapping previo. |
| Webhook responde 500 tras adjuntar PDF | `persistInvoicePdf` lanza error (upload/insert). Revisa `core.audit_logs` para identificar `step` y `storage_path`. | Vuelve a subir la factura, valida permisos del bucket o migraciones pendientes. |
| CSV tarda demasiado | El rango solicitado devuelve demasiadas filas. | Ajusta `from/to`, usa filtros adicionales en Supabase o plantea generación offline. |
| `/api/public/intake` devuelve 403 | `Origin` no listado o captcha inválido. | Revisa `PUBLIC_INTAKE_ALLOWED_ORIGINS` y el token enviado. |
| `/api/public/intake` devuelve 429 | Rate limit alcanzado. | Ajusta `PUBLIC_INTAKE_RATE_LIMIT/WINDOW_MS` o investiga abuso. |

## 9. Operaciones programadas
- **Rotación de secretos**: ver `docs/security.md` (se recomienda cada trimestre o tras incidentes).
- **Limpieza de Storage**: programa un job manual o n8n que elimine PDFs antiguos según política de retención.
- **Reprocesado masivo**: usa script Supabase (SQL `update core.invoices set status='reprocess' where ...`) tras validar en staging.

## 10. Observabilidad (pendiente)
Actualmente no hay dashboards ni alertas externas. Recomendaciones:
- Configurar un log drain de Supabase a un SIEM o servicio como Logflare.
- Añadir métricas custom (por ejemplo, contar errores 5xx en `/api/email/inbound`).
- Instrumentar un monitor de uptime para `/api/upload` y `/api/export/csv`.

## 11. Contactos y rotación
- **Propietario técnico**: equipo de plataforma (responsable de Supabase + Next).
- **Backup**: ver `docs/review/REPORTE_AUDITORIA_2025-09-26.md` para contexto de riesgos y prioridades recientes.
