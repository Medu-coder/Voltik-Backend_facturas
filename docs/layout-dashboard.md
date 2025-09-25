# Dashboard layout

## Resumen rápido
- **Pantalla**: `/dashboard`, requiere sesión administradora (`requireAdmin`).
- **Fuente de datos**: Supabase (schema `core`). Se usa `fetchDashboardData` (`lib/invoices/dashboard.ts`) para obtener facturas, métricas y agregados.
- **Componentes clave**: sidebar fija, topbar con búsqueda global, tarjetas de KPI + gráficos (`StatsCard`, `BarChart`, `DonutChart`), tabla reutilizando `InvoiceTable`.

## Flujo de datos
1. `app/dashboard/page.tsx` recibe `searchParams` (`from`, `to`, `q`).
2. `fetchDashboardData` normaliza el rango (por defecto: mes corriente), aplica búsqueda (`ilike` sobre `id`, `customer.email`, `customer.name`) y consulta Supabase dos veces:
   - Rango actual.
   - Rango anterior desplazado -1 mes.
3. Se devuelven:
   - Conteo actual y anterior + delta porcentual.
   - Series diarias sincronizadas por día del mes (`created_at`, con fallback a `billing_start/end`).
   - Distribución de estados (`pending`, `processed`, `error/reprocess`).
   - Las 20 últimas facturas para la tabla (`created_at` desc).

## Componentes / estilos
- **Sidebar** (`.sidebar`, `.nav-item`) aloja menú y CTAs reales (`/upload`, `/api/invoices/export.csv`).
- **Topbar** (`.topbar`) integra formulario de búsqueda GET (mantiene rango) y acciones breves (`/logout`). Los iconos son SVG inline.
- **Tarjetas**: `StatsCard` conforma contenido semántico (`<section>`) con KPI, delta (`kpi-delta--pos/--neg`) y CTA a la tabla.
- **Gráficos**:
  - `BarChart` (`use client`) dibuja barras SVG comparando “Mes actual” vs “Mes pasado”.
  - `DonutChart` genera anillo con porcentajes, legendas accesibles (`<dl>`).
- **Tabla** reutiliza `InvoiceTable`, ahora con clases (`.table`, `.table-num`, `.btn-link`) y helper `formatCurrency` (`lib/number.ts`).
- **CSS**: `styles.css` define nuevo layout y tokens (layout, topbar, charts, badges). Sin estilos inline.

## Interacciones
- **Filtros**: Formulario de fechas (`type="date"`) y buscador GET. Al enviar, se reconstruyen los datos vía SSR.
- **Tarjetas CTA**: enlazan con `#invoices-table` para llevar al listado.
- **Acciones**: “Subir facturas” (`/upload`), “Exportar a CSV” (endpoint existente), “Ver factura” (detalle `/invoices/[id]`).

## Extensión futura
- Añadir nuevos KPIs agregando funciones puras en `lib/invoices/dashboard.ts` para mantener lógica centralizada.
- Si se requiere paginación, usar `range()` en la consulta actual y propagar metadatos al componente.
- Los estilos residen en `styles.css`; seguir usando `@layer components` y tokens (`--space-*`, `--voltik-*`).
