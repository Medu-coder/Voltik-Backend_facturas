import { supabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LoginForm from './login-form'
import Image from 'next/image'

export default async function LoginPage() {
  const supabase = supabaseServer()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (!error && user) redirect('/dashboard')

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Logo y Header */}
        <div className="login-header">
          <div className="login-logo">
            <Image
              src="/voltik-logo-web_873x229.svg"
              alt="Voltik"
              width={200}
              height={52}
              priority
            />
          </div>
          <h1 className="login-title">Bienvenido</h1>
          <p className="login-subtitle">Accede a tu panel de administración</p>
        </div>

        {/* Formulario de Login */}
        <div className="login-form-container">
          <LoginForm />
        </div>

        {/* Footer */}
        <div className="login-footer">
          <p className="login-footer-text">
            Sistema de gestión de facturas eléctricas
          </p>
        </div>
      </div>
    </div>
  )
}
