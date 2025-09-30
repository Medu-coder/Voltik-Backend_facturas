# ADR: Pipeline de datos agregados para el dashboard de facturas

## Contexto

El dashboard cargaba la información llamando a `fetchDashboardData`, que lanzaba tres consultas `select *` amplias contra Supabase (`rango actual`, `rango previo`, `mismo rango año anterior`). Cada consulta recuperaba filas completas de facturas más el cliente relacionado y luego TypeScript recalculaba en memoria las comparativas mensuales y el desglose de estados (`O(n·m)`). Con rangos de fechas amplios Supabase acababa devolviendo timeouts (HTTP 522) porque intentaba enviar miles de filas, a pesar de que la interfaz solo necesitaba:

1. Conteos mensuales para el rango seleccionado comparados con los mismos meses del año anterior.
2. Conteos por estado agrupados en `Pendiente / Procesada / Éxito`.
3. Las 20 facturas más recientes para la tabla.

La instrumentación sobre el código existente (rango de 12 meses, 7 filas en la BD) ya mostraba ~1,5 s por llamada a Supabase, cargas útiles de 2–3 KB cada una y postprocesado redundante en el servidor.

## Opciones evaluadas

| Opción | Resumen | Ventajas | Inconvenientes | Esfuerzo | Impacto RLS | Mantenimiento |
| --- | --- | --- | --- | --- | --- | --- |
| **A. RPC SQL agregada** | Mover los conteos a una función de Postgres que devuelva agregados estructurados y limitar la consulta de tabla. | Una sola llamada, agregación en servidor, más fácil de optimizar con índices, mantiene contratos estables. | Requiere migración y coordinación; la RPC debe existir antes de desplegar el código. | Medio (SQL + refactor) | Corre con service role, compatible con RLS existente. | Función única fácil de evolucionar; el SQL vive junto a las migraciones. |
| **B. Vista materializada** | Precalcular resúmenes mensuales/estados en una MV refrescable. | Lecturas rápidas, payload predecible. | Necesita workflow de refresco (cron/n8n); riesgo de datos obsoletos; sobredimensionado para el volumen actual. | Alto | El service role puede saltarse RLS, pero hay que añadir políticas extra para otros roles. | Más superficie operativa (cadencia de refresco, invalidación). |
| **C. Selects agrupados PostgREST** | Usar consultas con `select=..., count` / `group` con rangos acotados, sin función SQL. | No necesita migración; reutiliza las APIs actuales. | Difícil replicar la búsqueda de clientes en múltiples consultas; aumenta las rondas (por mes y por estado); consultas string frágiles. | Medio | Funciona con la RLS actual. | Menos extensible; cadenas duplicadas. |
| **D. Caché en servidor** | Cachear la respuesta agregada por rango/usuario en edge/servidor. | Protege Supabase ante picos; funciona independientemente del almacenamiento. | Añade complejidad de invalidación; el dashboard quiere datos frescos tras cada subida; sigue siendo necesaria una primera consulta eficiente. | Medio/Alto | La capa de caché debe respetar la autenticación. | Subsystema adicional a operar. |
| **E. Nuevos índices** | Añadir índices `created_at` / `(status, created_at)` para respaldar escaneos por rango. | Mejora cualquier enfoque que filtre por fecha o estado. | Sobrecoste de escritura, aunque marginal. | Bajo | Sin cambios. | Mantenimiento mínimo. |

## Decisión

Adoptar **la opción A (RPC SQL agregada)** combinada con **la opción E (índices para rangos)**.

* La RPC (`core.dashboard_invoice_aggregates`) encapsula todos los cálculos de mes/estado en una única llamada, evitando descargar facturas completas solo para contarlas. También centraliza el filtro de búsqueda para que los componentes mantengan sus contratos actuales.
* Los índices complementarios sobre `created_at` y `(status, created_at DESC)` estabilizan los escaneos tanto de la función agregada como de la consulta limitada de últimas facturas.
* La opción C se consideró como plan B, pero reproducir la búsqueda del cliente en múltiples consultas agrupadas PostgREST duplicaría lógica o reintroduciría selects anchos. Las vistas materializadas (opción B) son prematuras con ~7 filas y añaden complejidad de refresco.
* Una caché (opción D) queda como mejora futura si crece el volumen de acceso al dashboard, pero no soluciona la raíz del problema: la primera consulta pesada.

## Consecuencias

* El orden de despliegue importa: aplica `supabase/migrations/20241019_dashboard_aggregates.sql` antes de subir el refactor para que la RPC exista cuando la invoque Next.js.
* Expectativas de latencia del dashboard: la instrumentación apunta a `<150 ms` end-to-end en rangos amplios una vez activa la RPC (frente a ~1,5 s por consulta anterior). El payload se reduce a un único JSON agregado (<1 KB) más la tabla de 20 filas (2–3 KB con los volúmenes actuales).
* Mejoras futuras: si el volumen supera ~100k facturas, valora refrescar agregados en una vista materializada o añadir índices trigram para la búsqueda de clientes. Quedan apuntadas como tareas pendientes.
