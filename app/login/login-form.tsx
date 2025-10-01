'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase/client'
import { useToast } from '@/components/Toaster'

type LoginMode = 'password' | 'forgot-password'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<LoginMode>('password')
  const { toast } = useToast()
  const router = useRouter()

  // Verificar si ya hay una sesión activa
  useEffect(() => {
    const checkSession = async () => {
      const supabase = supabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/dashboard')
      }
    }
    checkSession()
  }, [router])

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const supabase = supabaseClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      
      toast('Inicio de sesión exitoso', 'success')
      
      // Redirección manual después del login exitoso
      setTimeout(() => {
        router.push('/dashboard')
      }, 1000) // Pequeño delay para que se vea el mensaje de éxito
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión'
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const supabase = supabaseClient()
      // Build absolute redirect URL safely (Safari requiere URL absoluta válida)
      let base = (process.env.NEXT_PUBLIC_APP_URL || '').trim()
      if (!base && typeof window !== 'undefined') base = window.location.origin
      if (!/^https?:\/\//i.test(base)) {
        throw new Error('Config: NEXT_PUBLIC_APP_URL debe ser una URL absoluta (p.ej. http://localhost:3000)')
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${base}/api/auth/callback?type=recovery`,
      })
      if (error) throw error
      toast('Enlace de recuperación enviado. Revisa tu email.', 'success')
      setMode('password') // Volver al modo normal
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al enviar enlace de recuperación'
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="vstack">
      <form 
        onSubmit={mode === 'password' ? handlePasswordLogin : handleForgotPassword} 
        className="vstack" 
        aria-label="Formulario de acceso"
      >
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          placeholder="tu@email.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-required
        />
        
        {mode === 'password' && (
          <>
            <label className="label" htmlFor="password">Contraseña</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              placeholder="Tu contraseña"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-required
            />
          </>
        )}

        <div className="hstack gap-2">
          <button 
            className="button" 
            type="submit" 
            disabled={loading} 
            aria-busy={loading}
          >
            {loading 
              ? 'Procesando…' 
              : mode === 'password' 
                ? 'Iniciar sesión' 
                : 'Enviar enlace de recuperación'
            }
          </button>
          
          {mode === 'password' && (
            <button 
              type="button"
              className="button secondary"
              onClick={() => setMode('forgot-password')}
              disabled={loading}
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}
          
          {mode === 'forgot-password' && (
            <button 
              type="button"
              className="button secondary"
              onClick={() => setMode('password')}
              disabled={loading}
            >
              Volver al login
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
