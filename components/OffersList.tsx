'use client'
import { useState } from 'react'
import { useToast } from '@/components/Toaster'
import { formatDateTime } from '@/lib/date'

interface Offer {
  id: string
  invoice_id: string
  provider_name: string
  storage_object_path: string
  created_at: string
  updated_at: string
}

interface OffersListProps {
  invoiceId: string
  offers: Offer[]
  onOffersChange: () => void
}

export default function OffersList({ invoiceId, offers, onOffersChange }: OffersListProps) {
  const [deletingOfferId, setDeletingOfferId] = useState<string | null>(null)
  const { toast } = useToast()

  async function handleDownload(offerId: string) {
    try {
      const response = await fetch(`/api/offers/${invoiceId}/${offerId}/download`)
      
      if (!response.ok) {
        if (response.status === 404) {
          toast('Oferta no encontrada', 'error')
        } else if (response.status === 403) {
          toast('No tienes permisos para descargar esta oferta', 'error')
        } else {
          toast('Error al descargar oferta', 'error')
        }
        return
      }
      
      const data = await response.json()
      
      // Crear enlace temporal para descarga
      const link = document.createElement('a')
      link.href = data.downloadUrl
      link.download = data.fileName
      link.target = '_blank'
      
      // Agregar al DOM, hacer clic y remover
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      toast('Descarga iniciada', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al descargar'
      toast(message, 'error')
    }
  }

  async function handleDelete(offerId: string) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta oferta?')) {
      return
    }
    
    setDeletingOfferId(offerId)
    
    try {
      const response = await fetch(`/api/offers/${invoiceId}/${offerId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        if (response.status === 404) {
          toast('Oferta no encontrada', 'error')
        } else {
          toast('Error al eliminar oferta', 'error')
        }
        return
      }
      
      toast('Oferta eliminada correctamente', 'success')
      onOffersChange()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar'
      toast(message, 'error')
    } finally {
      setDeletingOfferId(null)
    }
  }

  if (offers.length === 0) {
    return (
      <div className="empty-state">
        <p>No hay ofertas para esta factura.</p>
      </div>
    )
  }

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Comercializadora</th>
            <th>Fecha de creación</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => (
            <tr key={offer.id}>
              <td>
                <strong>{offer.provider_name}</strong>
              </td>
              <td>
                <time dateTime={offer.created_at}>
                  {formatDateTime(new Date(offer.created_at))}
                </time>
              </td>
              <td>
                <div className="button-group">
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => handleDownload(offer.id)}
                    aria-label={`Descargar oferta de ${offer.provider_name}`}
                  >
                    <DownloadIcon />
                    Descargar
                  </button>
                  <button
                    className="btn btn-sm btn-outline btn-danger"
                    onClick={() => handleDelete(offer.id)}
                    disabled={deletingOfferId === offer.id}
                    aria-busy={deletingOfferId === offer.id}
                    aria-label={`Eliminar oferta de ${offer.provider_name}`}
                  >
                    {deletingOfferId === offer.id ? (
                      <SpinnerIcon />
                    ) : (
                      <DeleteIcon />
                    )}
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
      <path
        d="M12 15l-4-4h3V4h2v7h3l-4 4zm-7 4h14v2H5v-2z"
        fill="currentColor"
      />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
      <path
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
        fill="currentColor"
      />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon animate-spin">
      <path
        d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"
        fill="currentColor"
      />
    </svg>
  )
}
