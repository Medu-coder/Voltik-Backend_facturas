# Voltik Invoices · Documentación

Esta carpeta centraliza todo el conocimiento operativo y técnico del proyecto Voltik Invoices (Next.js + Supabase). La información está organizada en guías enfocadas para que cualquier integrante del equipo pueda instalar, operar y evolucionar la plataforma con seguridad.

## Índice rápido
- [Setup y configuración](./setup.md)
- [Arquitectura y modelo de datos](./architecture.md)
- [Operaciones y runbooks](./operations.md)
- [Seguridad y cumplimiento](./security.md)
- [ADR y decisiones](./adr)
- [Informes de auditoría](./review)
- [Backlog de mejoras](./review/BACKLOG_MEJORAS.md)

## Contexto del producto
- **Stack principal:** Next.js 14 (App Router) + Supabase (Auth, Postgres, Storage).
- **Caso de uso:** ingesta, almacenamiento y consulta de facturas eléctricas controlada por un único administrador.
- **Integraciones externas:** Supabase, webhook de email entrante (SendGrid u otro proveedor), scripts internos.
- **Principios clave:** mínimo privilegio, URLs firmadas, cumplimiento GDPR/EU, coste controlado.

## Convenciones de documentación
- Cada guía indica claramente pre-requisitos y responsables.
- Fragmentos de código usan TypeScript/SQL según corresponda.
- Las rutas y variables de entorno se muestran en backticks (`/api/upload`, `SUPABASE_SERVICE_ROLE_KEY`).
- No se incluyen secretos reales; utiliza siempre archivos `.env.*` locales o gestores seguros.

## Cómo contribuir a la documentación
1. Actualiza la guía específica (setup/arquitectura/operaciones/seguridad) en vez de duplicar información en múltiples archivos.
2. Si una decisión técnica cambia, registra la razón en `docs/adr/` y enlaza desde el documento afectado.
3. Para cambios mayores, añade un resumen en `docs/review/REPORTE_AUDITORIA_<fecha>.md` o abre un PR con la descripción del impacto.
4. Mantén la tabla de variables de entorno en `docs/setup.md` como fuente única de verdad.

## Próximos pasos recomendados
- Revisar el [Backlog de mejoras](./review/BACKLOG_MEJORAS.md) antes de iniciar nuevas tareas.
- Leer la [guía de seguridad](./security.md) para entender responsabilidades de protección de datos.
- Consultar la [arquitectura](./architecture.md) para cualquier cambio estructural o de dominio.
