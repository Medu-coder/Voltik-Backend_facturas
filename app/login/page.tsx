import { supabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LoginForm from './login-form'

export default async function LoginPage() {
  const supabase = supabaseServer()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (!error && user) redirect('/dashboard')

  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 420, margin: '4rem auto' }}>
        <h1>Accede</h1>
        <p className="muted">Te enviaremos un enlace mágico al email.</p>
        <LoginForm />
      </div>
    </main>
  )
}
