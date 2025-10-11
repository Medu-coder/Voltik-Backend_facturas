'use client'
import { useState } from 'react'
import { useToast } from '@/components/Toaster'

interface OfferUploadFormProps {
  invoiceId: string
  onUploadSuccess: () => void
}

export default function OfferUploadForm({ invoiceId, onUploadSuccess }: OfferUploadFormProps) {
  const [file, setFile] = useState<File | null>(null)
  const [providerName, setProviderName] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null
    if (!f) return setFile(null)
    
    if (f.type !== 'application/pdf') {
      toast('El archivo debe ser PDF', 'error')
      e.currentTarget.value = ''
      return
    }
    
    if (f.size > 10 * 1024 * 1024) {
      toast('Máximo 10MB', 'error')
      e.currentTarget.value = ''
      return
    }
    
    setFile(f)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (!file) {
      toast('Selecciona un PDF', 'error')
      return
    }
    
    if (!providerName.trim()) {
      toast('Indica el nombre de la comercializadora', 'error')
      return
    }
    
    setLoading(true)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('provider_name', providerName.trim())
      
      const res = await fetch(`/api/offers/${invoiceId}`, {
        method: 'POST',
        body: formData,
      })
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Error al subir oferta')
      }
      
      const result = await res.json()
      toast('Oferta subida correctamente', 'success')
      
      // Limpiar formulario
      setFile(null)
      setProviderName('')
      const fileInput = document.getElementById('file') as HTMLInputElement
      if (fileInput) fileInput.value = ''
      
      // Notificar al componente padre
      onUploadSuccess()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al subir oferta'
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="vstack" aria-label="Subir nueva oferta">
      <div className="form-group">
        <label className="label" htmlFor="provider_name">
          Comercializadora
        </label>
        <input
          id="provider_name"
          name="provider_name"
          className="input"
          placeholder="Ej: Endesa, Iberdrola, Naturgy..."
          required
          value={providerName}
          onChange={(e) => setProviderName(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label className="label" htmlFor="file">
          PDF de la oferta (≤10MB)
        </label>
        <input
          id="file"
          name="file"
          className="input"
          type="file"
          accept="application/pdf"
          onChange={onFileChange}
          required
          disabled={loading}
        />
        {file && (
          <p className="muted">
            Archivo seleccionado: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
          </p>
        )}
      </div>

      <button
        className="button"
        type="submit"
        disabled={loading || !file || !providerName.trim()}
        aria-busy={loading}
      >
        {loading ? 'Subiendo…' : 'Subir oferta'}
      </button>
    </form>
  )
}
