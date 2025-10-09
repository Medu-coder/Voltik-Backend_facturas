# Flujo de creación de clientes y facturas en Voltik Invoices

Este documento detalla cómo el backend procesa cada solicitud de ingreso de facturas (subida manual, webhook de email o formulario público), cuándo crea clientes nuevos y cómo se almacenan los PDF en Supabase Storage.

## 1. Punto de entrada
Todas las rutas de ingesta convergen en `lib/invoices/intake.ts`:
- `/api/upload` (panel admin o integraciones internas)
- `/api/email/inbound` (webhook desde proveedores como SendGrid)
- `/api/public/intake` (formularios públicos)

Cada endpoint valida su contexto (auth, captcha, rate limit, origen) y luego invoca `ingestInvoiceSubmission` con:
- `file`: PDF aportado por el usuario/proveedor.
- `customerName`, `customerEmail`, `customerPhone` (opcional).
- `actorUserId`: ID del usuario que ejecuta la acción (sesión admin o `ADMIN_USER_ID`).
- Flags opcionales (`bucket`, `issuedAt`, eventos de auditoría).

## 2. Resolución del cliente (`ensureCustomer`)
La función `ensureCustomer` (`lib/customers.ts`) es la única responsable de buscar o crear clientes.

Pasos:
1. Normaliza el email (`trim().toLowerCase()`) y valida que no quede vacío.
2. Normaliza el nombre, comprobando que tenga contenido.
3. Normaliza el teléfono (`trim()`) y lo convierte en `null` si viene vacío; si existe una coincidencia previa se actualiza el campo `mobile_phone`.
4. Busca coincidencias exactas por email: `admin.from('customers').select(...).eq('email', normalizedEmail)`.
5. Si encuentra filas, compara el nombre en minúsculas (`(row.name || '').trim().toLowerCase()`) y reutiliza la coincidencia exacta.
6. Si el email coincide pero el nombre no, intenta crear un segundo registro con la combinación `email + nombre`. Requiere disponer de `actorUserId` o `ADMIN_USER_ID` (para setear `user_id`).
7. Si falta `actorUserId` o el nombre/email están vacíos, lanza error HTTP 400.

**Restricción clave**: índice único `customers_email_name_idx` en Postgres (email + nombre minúsculas). Permite múltiples registros por email siempre que el nombre sea distinto, útil para casos donde se quiere diferenciar representaciones del mismo email.

## 3. Persistencia del PDF y la factura (`persistInvoicePdf`)
Una vez resuelto el cliente:
1. `persistInvoicePdf` genera un `invoiceId` (`crypto.randomUUID()`) y transforma el archivo en `Uint8Array`.
2. Determina la ruta de almacenamiento `segmento_email/YYYY/MM/DD/invoiceId.pdf`:
   - `segmento_email` se deriva de `buildInvoiceStoragePath`, sustituyendo caracteres no permitidos por `_`.
   - Usa la fecha `issuedAt` (si se aporta) o la fecha actual.
3. Sube el PDF a Supabase Storage (`bucket` privado, por defecto `invoices`) con metadata:
   - `customer_id`: ID del cliente asociado.
   - `actor_user_id`: quien originó la ingesta (sesión admin, proceso interno, etc.).
4. Inserta la fila en `core.invoices` con:
   - `id`: `invoiceId`.
   - `customer_id`: FK al cliente.
   - `storage_object_path`: ruta del PDF.
   - `status`: `'pending'` (a la espera de procesamiento posterior).
5. En caso de error al insertar, elimina el PDF recién subido para evitar basura en Storage.

### Relación de tablas
- **Clientes → Facturas**: 1:N (`core.customers.id` ↔ `core.invoices.customer_id`).
- **Facturas → PDF**: 1:1 (cada factura referencia un objeto único en Storage mediante `storage_object_path`).

## 4. Auditoría (`logAudit`)
Durante el proceso se registran eventos en `core.audit_logs`, por ejemplo:
- `invoice_intake_received` / `public_intake_received` cuando entra la solicitud.
- `invoice_intake_success` / `public_intake_success` tras crear factura y subir PDF.
- Eventos de error específicos (`invoice_upload_failed`, `email_inbound_failed`, etc.).

Estos ayudan a reconstruir el flujo y diagnosticar problemas sin revisar logs del proveedor.

## 5. Casuística y escenarios edge
| Escenario | Comportamiento |
| --- | --- |
| Mismo email + mismo nombre (cambio solo en mayúsculas) | Reutiliza el cliente existente (comparación de nombre case-insensitive). |
| Mismo email + nombre distinto | Crea segundo cliente con la combinación nueva; futuras facturas con ese nombre/email apuntarán a dicho cliente. |
| Cliente existente sin teléfono y nuevo submission con teléfono | Se actualiza `mobile_phone` en la fila existente antes de continuar. |
| Falta `ADMIN_USER_ID` o `actorUserId` | No se puede crear cliente nuevo; la ingesta falla con error 400. |
| Nombre o email vacíos | La ingesta se detiene con error 400 (mensaje `Customer name/email is required`). |
| Error al subir el PDF (Storage) | Responde 500 y no inserta factura. |
| Error al insertar la factura | El PDF se elimina para no dejar objetos huérfanos; se devuelve error 500. |
| PDF superior a 10 MB o MIME incorrecto | Los endpoints lo rechazan antes de llegar a `ingestInvoiceSubmission` (responses 400). |
| Reintento con PDF idéntico | Se genera nueva factura (nuevo UUID); no hay deduplicación automática. |

## 6. Resumen gráfico
```
Solicitud (upload/email/public)
        |
        v
Validaciones (auth, captcha, rate limit)
        |
        v
ingestInvoiceSubmission
        |
        +--> ensureCustomer --(reutiliza o crea cliente)--> core.customers
        |
        +--> persistInvoicePdf --(sube PDF)--> Supabase Storage
        |
        +--> core.invoices.insert(status='pending')
        |
        +--> logAudit eventos success/error
        |
        v
Respuesta OK (invoiceId) o error controlado
```

## 7. Recomendaciones operativas
- Mantener `ADMIN_USER_ID` configurado en entornos productivos para evitar fallos en integraciones automáticas.
- Revisar periódicamente `core.audit_logs` para detectar clientes duplicados por variaciones de nombre.
- Si se desea prohibir múltiples nombres por email, sustituir el índice compuesto por una restricción única solo en `email` (implica ajustar `ensureCustomer`).
- Considerar lógica de deduplicación de PDF si el proveedor externo no la aporta.

Con este flujo se garantiza que toda factura tiene un cliente asociado, un PDF almacenado en Storage con metadata de trazabilidad y registros de auditoría completos.
