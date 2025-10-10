# Voltik Invoices - Documentacion Funcional

## Propuesta de Valor
Voltik Invoices centraliza la recepcion de facturas PDF de clientes electricos (subida manual, email, formularios publicos) y ofrece un panel admin para revisar volumen, estados de procesamiento y detalles por cliente. El objetivo es tener un repositorio auditado de facturas que pueda alimentar procesos de analitica energetica.

## Roles y Permisos
| Rol | Acceso | Notas |
| --- | --- | --- |
| Admin (panel) | Navegacion completa (`/dashboard`, `/invoices`, `/customers`, `/upload`), descarga y reprocesos, export CSV | Identificado por `app_metadata.role='admin'`, flag `admin` o email listado en `ADMIN_EMAILS`. |
| Integracion interna | Invoca `/api/upload` con `X-INTERNAL-KEY` o `/api/export/csv` con JWT admin | Diseñado para pipelines batch o cronjobs. |
| Webhook email | Llama `/api/email/inbound` con `X-INBOUND-SECRET` | Permite ingestiones desde servicios como SendGrid. |
| Formulario publico | Usa `/api/public/intake` con captcha o secreto compartido | Pensado para leads que suben su factura desde la web comercial. |

## Casos de Uso Principales
1. **Admin revisa KPIs**: entra a `/dashboard`, filtra por fechas, descarga CSV.
2. **Admin busca facturas**: usa `/invoices` con buscador (ID, email, nombre) y revisa detalle.
3. **Admin gestiona clientes**: lista `/customers`, consulta ultima factura, accede al detalle.
4. **Admin sube PDF manualmente**: formulario `/upload` valida archivo, captura teléfono opcional y registra auditoria.
5. **Webhook email**: convierte emails con adjuntos en facturas pendientes.
6. **Formulario publico**: recoge datos del cliente final (nombre, email, PDF) con controles anti abuso.
7. **Descarga segura**: admin genera enlace firmado para entregar PDF a interesados.
8. **Reprocesar**: admin marca una factura para reprocesamiento externo (`status=reprocess`).

## Flujos Funcionales
### 1. Subida manual (admin)
```
Admin -> (/upload) -> Formulario client
  -> POST /api/upload (PDF, nombre, email)
      -> Validaciones (tamano, MIME, campos)
      -> ensureCustomer / persistInvoicePdf
      -> core.invoices.status = 'Pendiente'
      -> logAudit invoice_upload_*
  <- Toast "Encolado para procesamiento"
  <- Redireccion /dashboard
```

### 2. Email entrante
```
Proveedor email -> POST /api/email/inbound (multipart)
  -> Valida X-INBOUND-SECRET
  -> Extrae remitente, PDF (primer adjunto application/pdf)
  -> ensureCustomer (crea si no existe)
  -> ingestInvoiceSubmission (actor: ADMIN_USER_ID o user_id del cliente)
  -> logAudit email_inbound_*
<- Respuesta { ok: true, id }
```

### 3. Intake publico
```
Formulario web -> POST /api/public/intake (FormData)
  -> Comprueba Origin en PUBLIC_INTAKE_ALLOWED_ORIGINS
  -> assertNotRateLimited por IP
  -> verifyCaptcha (captcha o secreto compartido)
  -> Valida campos (nombre, email, teléfono opcional) y PDF <=10MB
  -> ingestInvoiceSubmission (actor: PUBLIC_INTAKE_ACTOR_ID)
  -> logAudit public_intake_*
<- JSON { ok: true, invoiceId }
```

### 4. Consumo del dashboard
- Admin elige rango `from`/`to`; se recalculan:
  - Total de facturas (`totalInvoicesCurrent` vs `totalInvoicesPrevious`).
  - Delta porcentual (`deltaDirection`).
  - Distribucion de estados (pending/processed/success).
  - Grafico mensual comparando mismo mes del anio anterior.
  - Tabla de 20 ultimas facturas con enlace a detalle.

## Vistas y Comportamiento Esperado
| Vista | Objetivo | Comportamiento |
| --- | --- | --- |
| Login | Acceso admin | Solicita email, envia link magico. Mensajes via toaster. Redirige a dashboard si ya hay sesion. |
| Dashboard | KPI facturacion | Filtros de fecha (`Desde`, `Hasta`), tarjetas de grafico, boton export CSV (usa rango filtrado), tabla accesible. |
| Facturas (listado) | Exploracion | Paginacion 50 items, buscador libre (incluye telefono), enlaces a detalle. Muestra badge por estado y totales con formato EUR. |
| Factura (detalle) | Resolucion de incidencias | Resumen con periodo, montos, CUPS, JSON bruto, acciones descargar/reprocesar. |
| Clientes (listado) | Gestion de cartera | Buscador, telefono y email visibles, conteo de facturas, fecha de ultima factura (RPC), enlaces a detalle. |
| Cliente (detalle) | Seguimiento | Datos basicos (nombre/email/telefono) + tabla de facturas filtrada por cliente. |
| Upload | Captura manual | Valida nombre, email, PDF y teléfono opcional; feedback inmediato via toaster; redirecciona a dashboard tras exito. |

## Estados de Factura
| Valor almacenado | Etiqueta UI | Significado funcional |
| --- | --- | --- |
| `pending`, `queued` | Pendiente | Recien ingerida, falta procesamiento externo. |
| `processed` | Procesada | Analisis completado (estado intermedio). |
| `done`, `success` | Procesada | Resultado final exitoso. |
| `error` | Con incidencia | Hubo fallo en pipeline externo. |
| `reprocess` | Reprocesar | Admin solicito reejecucion (marcado manual). |
| Otro valor | Sin estado | Se muestra tal cual para seguimiento. |

## Entradas y Salidas Clave
| Flujo | Entradas requeridas | Salidas / efectos |
| --- | --- | --- |
| `/api/upload` | FormData `file` (PDF), `customer_name`, `customer_email`, `customer_phone` (opcional); sesion admin o `X-INTERNAL-KEY` | Insercion en `core.invoices` (`status='Pendiente'`), objeto en Storage con metadata, evento `invoice_upload_success`, toast en UI. |
| `/api/email/inbound` | Headers `X-INBOUND-SECRET`, FormData `from`, opcional `envelope`, adjunto PDF | Crea/actualiza cliente, factura `Pendiente`, eventos `email_inbound_*`, respuesta `{ ok: true, id }`. |
| `/api/public/intake` | Origin permitido, captcha valido, FormData `first_name`, `last_name`, `email`, `phone` (o `mobile_phone`, opcional), `privacy_ack`, `file`, `captcha_token` | Factura `Pendiente`, evento `public_intake_success`, respuesta `{ ok: true, invoiceId }`. |
| `/api/invoices/[id]/download` | Sesion admin | Redireccion a URL firmada Supabase (expira segun TTL). |
| `/api/invoices/[id]/reprocess` | Sesion admin, POST vacio | Actualiza `status` a `reprocess`, redirecciona a `/invoices/{id}`. |
| `/api/export/csv` | Bearer token admin, query `from`, `to` | CSV con columnas `id,customer_id,status,issue_date,billing_start_date,billing_end_date,total_amount_eur,created_at`. |

## Escenarios de Error y Manejo
| Situacion | Respuesta | Feedback al usuario/tester |
| --- | --- | --- |
| Admin no autenticado | 302 a `/login` (paginas) o `401` JSON (API) | Toast en login tras reenviar OTP. |
| Usuario no admin | Redirige a `/login` o `403` JSON | Revisar configuracion `ADMIN_EMAILS` y metadata Supabase. |
| PDF invalido (tipo/tamano) | `400` JSON con mensaje (ej. "Invalid mime" o "File too large") | Toast rojo en formulario. |
| Falta captcha compartido | `400` JSON "Captcha verification is not configured" | Revisar variables `PUBLIC_INTAKE_*`. |
| Rate limit superado | `429` JSON `{ error, retryAfter }` + header `retry-after` | UI deberia mostrar tiempo de espera; formulario publico debe respetar. |
| Email inbound sin PDF | `400` JSON "No PDF attachment found" | Evento `email_inbound_no_pdf` en auditoria. |
| Descarga sin permisos | `/api/invoices/[id]/download` retorna `403` JSON | UI muestra error; revisar sesion. |
| Reprocesar factura inexistente | `404` JSON "Not found" | Confirmar ID antes de lanzar accion. |

## Integraciones y Terceros
- **Autenticacion**: Supabase magic link, emails enviados por Supabase.
- **Almacenamiento**: Supabase Storage (bucket privado `invoices`).
- **Email inbound**: Compatible con SendGrid Inbound Parse u otro servicio que remita multipart.
- **Captcha**: hCaptcha/Recaptcha (POST hacia `https://hcaptcha.com/siteverify` por defecto) o token compartido simple.
- **Exportaciones**: CSV descargable desde UI o API (consumible por BI/analitica).

## Limitaciones Conocidas
- Procesamiento de facturas es externo al repositorio; solo se cambia `status` (no hay OCR/analitica incluida).
- Rate limiting en memoria: despliegues con multiples instancias necesitan estrategia compartida (Redis, etc.).
- No hay notificaciones en tiempo real cuando la factura cambia de estado (se requiere refrescar).
- `JsonViewer` muestra datos sin sanitizar; puede incluir informacion sensible si la pipeline externa no la filtra.
- El panel solo soporta idioma espanol y un estilo de rol (admin).

## Roadmap Sugerido
1. **Procesamiento asincrono**: integrar cola/worker que consuma facturas `pending` y actualice `status`/`extracted_raw`.
2. **Notificaciones**: enviar email o webhook cuando una factura cambia de estado o termina con `error`.
3. **Rate limit distribuido**: mover `lib/security/rate-limit` a un almacenamiento compartido (Redis) para despliegues multi instancia.
4. **Historial de cambios**: exponer vista de auditoria (`core.audit_logs`) en el panel para soporte.
5. **Roles adicionales**: separar permisos de lectura/escritura para dar acceso restringido a otros equipos.
6. **Validacion de PDF**: incorporar analisis basico (paginas, metadatos) antes de aceptar la factura.
7. **Automatizar exports**: programar envio diario/semanal del CSV a almacenamiento seguro.
8. **Internacionalizacion**: parametrizar idioma y formatos segun region.

## Recomendaciones para QA y Analistas
- Verificar que cada flujo registra eventos en `core.audit_logs` (buscar por `event` en Supabase).
- Probar `public intake` con origen permitido y denegado, captcha valido/invalidado y archivos >10 MB.
- Confirmar que `/api/upload` rechaza usuarios sin sesion admin y acepta `X-INTERNAL-KEY`.
- Validar graficos del dashboard: crear facturas con diferentes fechas y estados, comparar totales.
- Revisar que `reprocess` cambia el estado y permanece visible en UI.
- Asegurar que `download` expira segun TTL configurado (intentar reutilizar URL luego de 2 minutos por defecto).
- Simular errores de email inbound (sin PDF, remitente invalido) y revisar respuestas.

## Recursos de Apoyo
- PDF de prueba: `supabase/test.pdf`.
- Datos semilla: `tmp/seed_customers_invoices.json` y `tmp/seed_insert.sql` para poblar entornos.
- Informes previos: `docs/review/`, `docs/operations.md`, `docs/security.md` para procedimientos.
- ADR relevante: `docs/adr/ADR-dashboard-aggregates.md` explica la agregacion mensual usada por el dashboard.
