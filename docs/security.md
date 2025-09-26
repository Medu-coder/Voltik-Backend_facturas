# Seguridad y cumplimiento

Esta guía resume los controles de seguridad actuales y las acciones recomendadas para mantener el cumplimiento (GDPR/EU) y el principio de mínimo privilegio.

## 1. Principios actuales
- **Rol único administrador**: todas las operaciones requieren sesión admin o clave interna (`INTERNAL_API_SECRET`).
- **Service role encapsulado**: solo se usa en server (API routes) mediante `supabaseAdmin()` o `createClient` server-side.
- **RLS activas**: `core.is_admin()` y políticas específicas limitan acceso a `core.customers`, `core.invoices` y `core.audit_logs`.
- **Storage privado**: bucket `invoices` con políticas que exigen rol admin/service o metadata del owner.
- **Audit logs**: `lib/logger.ts` registra eventos relevantes en `core.audit_logs` usando el service role.

## 2. Gestión de secretos
- **Nunca** comitees claves reales al repositorio (rotar las existentes en `supabase/SUPABASE_CONFIG.md` si aún no se ha hecho).
- Mantén un `.env.example` sin secretos reales y sincroniza las variables activas en `docs/setup.md`.
- Usa gestores de secretos (Vercel, 1Password, Vault) para entornos productivos.
- Regenera los tokens (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`) tras cada incidente o fuga.

## 3. Control de acceso
- **Autenticación**: Supabase Magic Link (`/api/auth/callback`).
- **Autorización**:
  - `requireAdmin()` valida rol y lista blanca de emails.
  - `assertAdminFromAuthHeader()` verifica tokens Bearer usando `SUPABASE_JWT_SECRET`.
  - Endpoints internos usan `INTERNAL_API_SECRET` (`/api/upload`, `/api/debug/session`).
- **Operaciones críticas** (upload, fallback del webhook) siempre se ejecutan en el servidor con credenciales `service_role`.

## 4. Supabase RLS y Storage
- **RLS**: asegúrate de desplegar las migraciones para mantener las políticas:
  - `core.customers` y `core.invoices`: admin o service role.
  - `core.audit_logs`: lectura admin; escritura service role.
- **Storage** (`storage.objects`):
  - Admin/service role pueden leer/escribir el bucket `invoices`.
  - Lectura por owners depende de metadata (`customer_id`, `actor_user_id`). Actualiza `/api/upload` para adjuntar dicha metadata.
  - URLs firmadas se limitan a 10–300 segundos (`clampExpires`).

## 5. Protección de datos personales
- Los PDFs y metadatos contienen PII (nombre, email, CUPS). Acceso restringido a un único admin.
- Logs (`core.audit_logs`) incluyen emails y subjects. Define política de retención (p.ej. 90 días) y anonimiza cuando no sea necesario almacenar PII completa.
- Enmascara emails en rutas públicas y evita loguear tokens/secrets.
- Revisa periódicamente el bucket y elimina facturas expiradas según política de retención.

## 6. Checklist de seguridad continua
- [ ] Revisar `core.audit_logs` semanalmente en busca de eventos `level='error'`.
- [ ] Confirmar que `INTERNAL_API_SECRET` y `INBOUND_EMAIL_SECRET` se rotan trimestralmente.
- [ ] Ejecutar un test de subida (`curl` o UploadForm) tras rotar secretos.
- [ ] Validar que los endpoints legacy (`/api/invoices/export.csv`) siguen restringidos y evalúa consolidarlos.
- [ ] Documentar cualquier cambio de RLS en `docs/adr/` (nueva política, nuevas tablas).

## 7. Plan de respuesta ante incidentes
1. Revocar claves (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `INTERNAL_API_SECRET`).
2. Invalidar sesiones activas desde la consola Auth de Supabase.
3. Revisar `core.audit_logs` y Storage para detectar accesos inusuales.
4. Notificar al responsable de cumplimiento y documentar el incidente.
5. Actualizar esta guía y los ADRs pertinentes.

## 8. Recomendaciones pendientes
- Incluir métricas y alertas (Supabase Log Drain, Vercel Analytics) para detectar fallos 5xx y accesos indebidos.
- Añadir pruebas automatizadas que verifiquen que el service role no se expone al cliente.
- Evaluar cifrado en reposo adicional (KMS del proveedor) si se suben facturas con datos sensibles adicionales.
