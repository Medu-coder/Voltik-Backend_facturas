import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import ResetPasswordForm from './reset-password-form'

export default async function ResetPasswordPage() {
  const supabase = supabaseServer()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    redirect('/login')
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Cambiar contraseña</h1>
        <p>Ingresa tu nueva contraseña</p>
        <ResetPasswordForm />
      </div>
    </div>
  )
}


