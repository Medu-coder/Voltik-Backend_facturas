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

## 3. Integración continua (CI)
- Workflow `CI` en `.github/workflows/ci.yml` se ejecuta en cada push a `main` y en Pull Requests.
- Job `Lint & Typecheck`: instala dependencias con `npm ci`, ejecuta `npm run lint` y `npm run typecheck` con Node.js 20.
- Job `Supabase Schema Lint`: corre `npx supabase db lint --db-url "$SUPABASE_DB_URL"` para validar funciones, políticas RLS y tipos. El paso se omite automáticamente cuando el secreto `SUPABASE_DB_URL` está vacío, dejando constancia en logs.
- Configura el secreto en GitHub (Settings → Secrets → Actions) usando una URL de Postgres con permisos mínimos (lectura + ejecución). No lo expongas en logs.
- Falla el pipeline si cualquiera de los comandos devuelve estado distinto de cero; úsalo como requisito previo para merges.

## 4. Scripts y herramientas
- `npm run dev`: desarrollo local.
- `npm run lint`: linting basado en Next.
- `npm run typecheck`: verifica tipos TS.
- `scripts/profile-dashboard.js`: ejecuta la RPC `dashboard_invoice_aggregates` con distintos rangos. Útil para detectar regresiones en rendimiento.
  ```bash
  node scripts/profile-dashboard.js
  ```
  Asegúrate de compilar previamente `tsconfig.profile.json` si modificas librerías (`npx tsc -p tsconfig.profile.json`).

## 5. Gestión de migraciones
- Nuevas tablas/funciones van en `supabase/migrations/<fecha>_<detalle>.sql`.
- Exporta el esquema actualizado con `supabase db dump --schema core,storage --data-only=false > supabase/schema/structure.sql` (opcional para documentación).
- Documenta los cambios relevantes en `docs/architecture.md` y crea un ADR si la decisión es significativa.

## 6. Exportaciones y reporting
- **CSV oficial**: `/api/export/csv?from=YYYY-MM-DD&to=YYYY-MM-DD` (stream en memoria) requiere token admin en cabecera `Authorization: Bearer <JWT>`.
- **CSV legacy**: `/api/invoices/export.csv` sigue disponible por compatibilidad, pero ahora delega en el mismo helper `buildInvoicesCsv`. Planifica su retirada cuando no haya consumidores externos.
- **Descarga de PDF**: `/api/invoices/<id>/download` genera URL firmada con `STORAGE_SIGNED_URL_TTL_SECS` (default 120s).

## 7. Troubleshooting
| Síntoma | Diagnóstico | Acción |
| --- | --- | --- |
| 401 en `/api/upload` | Sesión expirada o falta `X-INTERNAL-KEY`. | Revalida sesión o revisa `INTERNAL_API_SECRET`. |
| 403 en rutas admin | Email no incluido en `ADMIN_EMAIL(S)` o token sin claim `admin`. | Ajusta metadata del usuario en Supabase Auth. |
| 500 al descargar PDF | `NEXT_PUBLIC_APP_URL` sin configurar o objeto inexistente en Storage. | Añade fallback de URL y valida path en Supabase Storage. |
| Webhook responde 400 “Missing sender email” | El proveedor no envía `from` válido. | Normaliza payload o añade mapping previo. |
| Webhook responde 500 tras adjuntar PDF | `persistInvoicePdf` lanza error (upload/insert). Revisa `core.audit_logs` para identificar `step` y `storage_path`. | Vuelve a subir la factura, valida permisos del bucket o migraciones pendientes. |
| CSV tarda demasiado | El rango solicitado devuelve demasiadas filas. | Ajusta `from/to`, usa filtros adicionales en Supabase o plantea generación offline. |

## 8. Operaciones programadas
- **Rotación de secretos**: ver `docs/security.md` (se recomienda cada trimestre o tras incidentes).
- **Limpieza de Storage**: programa un job manual o n8n que elimine PDFs antiguos según política de retención.
- **Reprocesado masivo**: usa script Supabase (SQL `update core.invoices set status='reprocess' where ...`) tras validar en staging.

## 9. Observabilidad (pendiente)
Actualmente no hay dashboards ni alertas externas. Recomendaciones:
- Configurar un log drain de Supabase a un SIEM o servicio como Logflare.
- Añadir métricas custom (por ejemplo, contar errores 5xx en `/api/email/inbound`).
- Instrumentar un monitor de uptime para `/api/upload` y `/api/export/csv`.

## 10. Contactos y rotación
- **Propietario técnico**: equipo de plataforma (responsable de Supabase + Next).
- **Backup**: ver `docs/review/REPORTE_AUDITORIA_2025-09-26.md` para contexto de riesgos y prioridades recientes.
