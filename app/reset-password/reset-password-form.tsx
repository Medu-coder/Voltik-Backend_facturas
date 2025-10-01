'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase/client'
import { useToast } from '@/components/Toaster'

export default function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      toast('Las contraseñas no coinciden', 'error')
      return
    }

    if (password.length < 6) {
      toast('La contraseña debe tener al menos 6 caracteres', 'error')
      return
    }

    setLoading(true)
    try {
      const supabase = supabaseClient()
      const { error } = await supabase.auth.updateUser({
        password: password
      })
      
      if (error) throw error
      
      toast('Contraseña actualizada correctamente', 'success')
      router.push('/dashboard')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al actualizar contraseña'
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="vstack" aria-label="Formulario de cambio de contraseña">
      <label className="label" htmlFor="password">Nueva contraseña</label>
      <input
        id="password"
        name="password"
        type="password"
        className="input"
        placeholder="Mínimo 6 caracteres"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-required
        minLength={6}
      />
      
      <label className="label" htmlFor="confirmPassword">Confirmar contraseña</label>
      <input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        className="input"
        placeholder="Repite la contraseña"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        aria-required
        minLength={6}
      />

      <button className="button" type="submit" disabled={loading} aria-busy={loading}>
        {loading ? 'Actualizando…' : 'Actualizar contraseña'}
      </button>
    </form>
  )
}


