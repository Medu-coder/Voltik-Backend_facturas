# Configuración de Supabase Auth - Voltik Invoices

## Configuración Requerida en Supabase Dashboard

### 1. Deshabilitar Registro de Nuevos Usuarios

1. Ve a **Authentication** > **Settings** en tu dashboard de Supabase
2. En la sección **User Signups**, desactiva **Enable email confirmations**
3. Desactiva **Enable phone confirmations** si está habilitado
4. En **User Management**, desactiva **Enable user signups**

### 2. Configurar URLs de Redirección

1. En **Authentication** > **URL Configuration**:
   - **Site URL**: `https://tu-dominio.com` (tu dominio de producción)
   - **Redirect URLs**: Añade las siguientes URLs:
     ```
     https://tu-dominio.com/api/auth/callback
     https://tu-dominio.com/api/auth/callback?type=recovery
     http://localhost:3000/api/auth/callback
     http://localhost:3000/api/auth/callback?type=recovery
     ```

### 3. Configurar Email Templates

1. Ve a **Authentication** > **Email Templates**
2. **Password Recovery**:
   - Subject: `Recuperar contraseña - Voltik Invoices`
   - Body: Personaliza el template para incluir tu branding
   - Asegúrate de que el enlace use `{{ .ConfirmationURL }}`

### 4. Configurar Políticas de Seguridad

1. En **Authentication** > **Policies**:
   - Asegúrate de que solo los usuarios existentes puedan autenticarse
   - Configura políticas RLS apropiadas para las tablas

### 5. Variables de Entorno Requeridas

Asegúrate de tener estas variables en tu `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

# App URL (IMPORTANTE para redirecciones)
NEXT_PUBLIC_APP_URL=https://tu-dominio.com

# Admin emails (separados por comas)
ADMIN_EMAIL=admin@tu-dominio.com
# O múltiples:
ADMIN_EMAILS=admin1@tu-dominio.com,admin2@tu-dominio.com
```

## Flujo de Autenticación Implementado

### Login Normal
1. Usuario ingresa email y contraseña
2. Supabase valida las credenciales
3. Si es válido, crea sesión y redirige a `/dashboard`

### Recuperación de Contraseña
1. Usuario hace clic en "¿Olvidaste tu contraseña?"
2. Ingresa su email
3. Supabase envía email con enlace de recuperación
4. Usuario hace clic en el enlace
5. Se redirige a `/reset-password` para cambiar contraseña

### Logout
1. Usuario hace clic en logout
2. Se limpia la sesión de Supabase
3. Se redirige a `/login`

## Verificación de Configuración

### 1. Verificar URLs de Redirección
```bash
# En desarrollo
curl -I http://localhost:3000/api/auth/callback

# En producción
curl -I https://tu-dominio.com/api/auth/callback
```

### 2. Verificar Variables de Entorno
```bash
# Verificar que las variables estén cargadas
echo $NEXT_PUBLIC_APP_URL
echo $NEXT_PUBLIC_SUPABASE_URL
```

### 3. Probar Flujos
1. **Login**: Intenta iniciar sesión con credenciales válidas
2. **Recuperación**: Prueba el flujo de "olvidé mi contraseña"
3. **Logout**: Verifica que el logout funcione correctamente

## Solución de Problemas

### Error: "Invalid redirect URL"
- Verifica que `NEXT_PUBLIC_APP_URL` esté configurado correctamente
- Asegúrate de que la URL esté en la lista de Redirect URLs en Supabase

### Error: "User not found" en login
- Verifica que el usuario exista en la tabla `auth.users`
- Asegúrate de que el email esté correctamente escrito

### Error: "Email not confirmed"
- Como deshabilitamos las confirmaciones de email, esto no debería ocurrir
- Si ocurre, verifica la configuración en Supabase Dashboard

### Magic link redirige a localhost en producción
- Verifica que `NEXT_PUBLIC_APP_URL` esté configurado con la URL de producción
- Asegúrate de que la variable esté disponible en el entorno de producción

## Comandos Útiles

```bash
# Verificar configuración de Supabase
npx supabase status

# Generar tipos actualizados
npx supabase gen types typescript --project-id <PROJECT_ID> --schema core > lib/types/supabase.ts

# Aplicar migraciones
npx supabase db push
```

## Notas Importantes

1. **Solo usuarios existentes**: Con esta configuración, solo los usuarios que ya estén en la base de datos podrán iniciar sesión
2. **Seguridad**: Los usuarios admin se determinan por email o metadata de usuario
3. **Redirecciones**: Asegúrate de que `NEXT_PUBLIC_APP_URL` esté configurado correctamente en todos los entornos
4. **Email**: Los emails de recuperación usarán las plantillas configuradas en Supabase


