'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toaster'

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null
    if (!f) return setFile(null)
    if (f.type !== 'application/pdf') {
      toast('El archivo debe ser PDF', 'error'); e.currentTarget.value = ''; return
    }
    if (f.size > 10 * 1024 * 1024) {
      toast('Máximo 10MB', 'error'); e.currentTarget.value = ''; return
    }
    setFile(f)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return toast('Selecciona un PDF', 'error')
    if (!customerName.trim()) return toast('Indica el nombre del cliente', 'error')
    if (!customerEmail.trim()) return toast('Indica el email del cliente', 'error')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('customer_name', customerName.trim())
      fd.append('customer_email', customerEmail.trim())
      if (customerPhone.trim()) {
        fd.append('customer_phone', customerPhone.trim())
      }
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      toast('Encolado para procesamiento', 'success')
      setTimeout(() => router.push('/dashboard'), 600)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al subir'
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="vstack" aria-label="Subida de factura">
      <label className="label" htmlFor="customer_name">Nombre del cliente</label>
      <input
        id="customer_name"
        name="customer_name"
        className="input"
        placeholder="Cliente Demo"
        required
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
      />

      <label className="label" htmlFor="customer_email">Email del cliente</label>
      <input
        id="customer_email"
        name="customer_email"
        className="input"
        type="email"
        placeholder="cliente@ejemplo.com"
        required
        value={customerEmail}
        onChange={(e) => setCustomerEmail(e.target.value)}
      />

      <label className="label" htmlFor="customer_phone">Teléfono móvil</label>
      <input
        id="customer_phone"
        name="customer_phone"
        className="input"
        type="tel"
        placeholder="600 000 000"
        value={customerPhone}
        onChange={(e) => setCustomerPhone(e.target.value)}
      />

      <label className="label" htmlFor="file">PDF (≤10MB)</label>
      <input id="file" name="file" className="input" type="file" accept="application/pdf" onChange={onFileChange} required />

      <button className="button" type="submit" disabled={loading} aria-busy={loading}>
        {loading ? 'Subiendo…' : 'Subir y procesar'}
      </button>
    </form>
  )
}
