'use client'
import { useState, useEffect } from 'react'
import OffersList from '@/components/OffersList'
import OfferUploadForm from '@/components/OfferUploadForm'
import type { Database } from '@/lib/types/supabase'

type OfferRow = Database['core']['Tables']['offers']['Row']

interface OffersPageClientProps {
  invoiceId: string
  initialOffers: OfferRow[]
}

export default function OffersPageClient({ invoiceId, initialOffers }: OffersPageClientProps) {
  const [offers, setOffers] = useState<OfferRow[]>(initialOffers)
  const [loading, setLoading] = useState(false)

  async function fetchOffers() {
    setLoading(true)
    try {
      const response = await fetch(`/api/offers/${invoiceId}`)
      if (response.ok) {
        const data = await response.json()
        setOffers(data.offers)
      }
    } catch (err) {
      console.error('Error fetching offers:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleOffersChange() {
    fetchOffers()
  }

  return (
    <>
      <section className="card" aria-labelledby="ofertas-existentes">
        <h2 id="ofertas-existentes">Ofertas existentes ({offers.length})</h2>
        {loading ? (
          <div className="loading-state">
            <p>Cargando ofertas...</p>
          </div>
        ) : (
          <OffersList 
            invoiceId={invoiceId} 
            offers={offers}
            onOffersChange={handleOffersChange}
          />
        )}
      </section>

      <section className="card" aria-labelledby="nueva-oferta">
        <h2 id="nueva-oferta">Subir nueva oferta</h2>
        <OfferUploadForm 
          invoiceId={invoiceId}
          onUploadSuccess={handleOffersChange}
        />
      </section>
    </>
  )
}
