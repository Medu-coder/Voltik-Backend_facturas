# Backlog de mejoras priorizado

- ✅ [P1] [Alto] [S] `supabase/SUPABASE_CONFIG.md:183` → Retirar y rotar credenciales expuestas; proveer `.env.example` sin secretos. **Quick Win** *(completado: documentación actualizada sin secretos; rotación pendiente a nivel operativo)*
- ✅ [P1] [Alto] [S] `app/api/invoices/[id]/download/route.ts:17`, `app/api/invoices/[id]/reprocess/route.ts:33` → Añadir fallback seguro para redirects cuando falte `NEXT_PUBLIC_APP_URL` y reutilizar `supabaseAdmin()`. **Quick Win** *(completado: rutas usan `supabaseAdmin()` y generan base URL seguro)*
- ✅ [P1] [Alto] [S] `app/api/upload/route.ts:58` → Adjuntar metadata (`customer_id`, `actor_user_id`), registrar `logAudit` y reutilizar helper Supabase. **Quick Win** *(completado: metadata + `logAudit` en subida)*
- [P1] [Medio] [M] `app/api/export/csv/route.ts:18`, `app/api/invoices/export.csv/route.ts:12` → Consolidar export CSV en un único endpoint con streaming y auditoría.
- [P2] [Medio] [M] `app/customers/page.tsx:41` → Refactorizar cálculo de `lastInvoiceAt` usando `max(created_at)` o RPC para evitar lecturas masivas.
- [P2] [Medio] [M] `app/api/email/inbound/route.ts:118` → Eliminar doble subida de PDF creando helper compartido con `/api/upload`.
- [P2] [Medio] [M] `docs/README-backend.md`, `supabase/SUPABASE_CONFIG.md:70` → Actualizar documentación (RLS, variables vigentes) y eliminar referencias obsoletas.
- [P3] [Medio] [L] Repositorio → Configurar lint/tests automatizados y pipelines CI que validen RLS/queries.
