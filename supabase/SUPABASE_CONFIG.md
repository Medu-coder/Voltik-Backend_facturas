# Supabase – Configuración del proyecto

Este documento describe cómo preparar Supabase para Voltik Invoices sin exponer credenciales sensibles. Usa esta guía junto con la documentación principal en [`docs/`](../docs/README.md).

## 1. Creación del proyecto
1. Crea un proyecto Supabase en la región EU (recomendado).
2. Habilita Postgres, Auth y Storage (vienen activos por defecto).
3. Anota el identificador del proyecto (por ejemplo `abcd1234`) para construir las URLs cuando configures el entorno.

## 2. Despliegue del esquema
1. Ejecuta las migraciones incluidas en `supabase/migrations/*.sql` desde la consola SQL o usando Supabase CLI:
   ```bash
   supabase db push
   ```
2. Si necesitas recrear el esquema completo, utiliza `supabase/schema/structure.sql` como referencia.
3. Verifica que existen:
   - Tablas `core.customers`, `core.invoices`, `core.audit_logs`.
   - Función `core.dashboard_invoice_aggregates`.
   - Índices `idx_invoices_created_at`, `idx_invoices_status_created_at`, `customers_email_name_idx`.

## 3. Políticas de seguridad (RLS)
Las migraciones aplican las políticas recomendadas:
- `core.is_admin()` como helper para roles admin/service.
- Acceso admin para `core.customers`, `core.invoices`, `core.audit_logs`.
- Policies de Storage para el bucket privado `invoices`.

Si añades nuevas tablas, replica el patrón en el SQL y documenta la decisión en `docs/adr/`.

## 4. Bucket de Storage
1. Crea un bucket privado llamado `invoices` (o el nombre que definas en `STORAGE_INVOICES_BUCKET`).
2. Asegúrate de adjuntar metadata (`customer_id`, `actor_user_id`) en las subidas para cumplir las políticas de owner.
3. Revisa periódicamente que no haya objetos públicos.

## 5. Variables de entorno
Define las claves en `.env.local`, gestores de secretos o la consola de tu proveedor.

| Variable | Ejemplo | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<PROJECT_ID>.supabase.co` | URL base del proyecto. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `SUPABASE_ANON_KEY=...` | Genera uno nuevo desde Settings → API. |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY=...` | Solo servidor. Nunca lo expongas en cliente ni en git. |
| `SUPABASE_JWT_SECRET` | `SUPABASE_JWT_SECRET=...` | Obtén el valor desde Settings → Auth → JWT. |

> Consulta [`docs/setup.md`](../docs/setup.md#3-variables-de-entorno-envlocal) para la tabla completa de configuración y buenas prácticas.

## 6. Rotación de secretos
- Regenera las claves (`anon`, `service_role`, `JWT`) tras las pruebas locales o ante cualquier sospecha de fuga.
- Actualiza los valores en todos los entornos y despliega nuevamente.
- Documenta la rotación en el registro operativo correspondiente.

## 7. Auditoría y monitoreo
- Usa `core.audit_logs` para registrar eventos críticos (`logAudit` en el código).
- Configura un log drain o exportación periódica según se describe en [`docs/operations.md`](../docs/operations.md#8-observabilidad-pendiente).

## 8. Próximos pasos
1. Verifica que no quedan secretos reales en el repositorio (`git grep -n "SUPABASE_*"`).
2. Mantén este archivo actualizado si cambian las políticas o el flujo de despliegue.
3. Alinea cualquier cambio con la guía de seguridad en [`docs/security.md`](../docs/security.md).
