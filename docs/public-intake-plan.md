# Plan para endpoint público de intake

## Objetivo
Permitir que formularios públicos remitan datos de clientes potenciales (nombre, apellidos, email y PDF de factura) al backend sin exponer credenciales privilegiadas, manteniendo controles de seguridad y auditoría.

## Pasos principales
1. **Helpers de seguridad**
   - Crear `lib/security/captcha.ts` para verificar tokens de captcha o firmas HMAC (`PUBLIC_INTAKE_SHARED_SECRET` o `PUBLIC_INTAKE_CAPTCHA_SECRET`).
   - Añadir `lib/security/rate-limit.ts` con limitador en memoria por IP (configurable vía `PUBLIC_INTAKE_RATE_LIMIT` y `PUBLIC_INTAKE_RATE_WINDOW_MS`).
   - Exponer errores tipados (`CaptchaError`, `RateLimitError`) reutilizables en rutas API.

2. **Extraer lógica de ingestión**
   - Implementar `lib/invoices/intake.ts` con función `ingestInvoiceSubmission({ adminClient, file, customerName, customerEmail, actorUserId, issuedAt })` que encapsule `ensureCustomer`, `persistInvoicePdf` y audit logs.
   - Refactorizar `app/api/upload/route.ts` para usar `ingestInvoiceSubmission`, manteniendo la verificación admin/`INTERNAL_API_SECRET` existente.

3. **Endpoint público**
   - Crear `app/api/public/intake/route.ts` con `POST` que:
     - Valide origen/referer contra `PUBLIC_INTAKE_ALLOWED_ORIGINS`.
     - Limite tamaño (`≤10MB`) y tipo del archivo (PDF) reutilizando lógica existente.
     - Exija campos `first_name`, `last_name`, `email`, `privacy_ack==='true'`, `captcha_token` y `file` (multipart/form-data).
     - Aplique rate limiting por IP antes de procesar.
     - Llame al verificador de captcha/token.
     - Construya `customerName = \
${first_name} ${last_name}` y normalice email.
     - Obtenga `actorUserId` de `process.env.PUBLIC_INTAKE_ACTOR_ID` (obligatorio) y delegue en `ingestInvoiceSubmission`.
     - Registre eventos con `logAudit` (`public_intake_received`, `public_intake_success`, `public_intake_failed`).
     - Devuelva `{ ok: true, invoiceId }` o error JSON con mensajes controlados.

4. **Variables de entorno y documentación**
   - Añadir en `.env.example` y `docs/architecture.md` las nuevas variables (`PUBLIC_INTAKE_ALLOWED_ORIGINS`, `PUBLIC_INTAKE_SHARED_SECRET`/`PUBLIC_INTAKE_CAPTCHA_SECRET`, `PUBLIC_INTAKE_ACTOR_ID`, límites de rate limit).
   - Documentar flujo de auditoría y casos de error.

5. **Pruebas**
   - Tests unitarios para helpers de captcha/rate limit (p.ej. `vitest` bajo `lib/security/__tests__/`).
   - Tests de integración del endpoint (`app/api/public/intake`) cubriendo:
     - Caso feliz con archivo válido.
     - Captcha/token inválido.
     - Archivo >10 MB.
     - Rate limit excedido.
   - Pruebas manuales con `curl` o Postman simulando multipart.

## Detalle del POST desde la web pública
- **Método**: `POST`
- **URL**: `/api/public/intake` (ajustar si se expone mediante un dominio distinto).
- **Encabezados recomendados**:
  - `Origin`: dominio autorizado (debe coincidir con `PUBLIC_INTAKE_ALLOWED_ORIGINS`).
  - `Content-Type`: `multipart/form-data` (el navegador lo gestiona al enviar `FormData`).

- **Campos del cuerpo (FormData)**:
  - `first_name` (string, requerido)
  - `last_name` (string, requerido)
  - `email` (string, requerido; formato email)
  - `privacy_ack` (string, debe ser `'true'` cuando el usuario acepta la política de privacidad)
  - `captcha_token` (string, requerido según el mecanismo anti-abuso configurado)
  - `file` (File, requerido; debe ser PDF ≤10 MB)

- **Respuesta esperada**:
  ```json
  { "ok": true, "invoiceId": "uuid" }
  ```
  En caso de error se devolverá `{ "error": "mensaje legible" }` y código HTTP 4xx/5xx.

- **Recomendaciones para la web**:
  - Validar cliente (tamaño y tipo del archivo, campos obligatorios) antes de enviar.
  - Mostrar errores según el cuerpo JSON devuelto.
  - Adjuntar token de captcha (hCaptcha/Recaptcha) o firma HMAC proporcionada por el backend antes del `POST`.

> Nota: La implementación del formulario público se realizará externamente; este plan cubre los cambios necesarios en el backend para soportar el flujo.
