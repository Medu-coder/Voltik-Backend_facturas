'use client'
import { useState } from 'react'
import { supabaseClient } from '@/lib/supabase/client'
import { useToast } from '@/components/Toaster'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  async function onSubmit(e: React.FormEvent) {
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
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${base}/api/auth/callback` },
      })
      if (error) throw error
      toast('Enlace enviado. Revisa tu email.', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al enviar enlace'
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="vstack" aria-label="Formulario de acceso">
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
      <button className="button" type="submit" disabled={loading} aria-busy={loading}>
        {loading ? 'Enviando…' : 'Enviar enlace mágico'}
      </button>
    </form>
  )
}
