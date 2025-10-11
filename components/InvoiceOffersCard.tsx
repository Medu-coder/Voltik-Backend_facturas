'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface InvoiceOffersCardProps {
  invoiceId: string
}

export default function InvoiceOffersCard({ invoiceId }: InvoiceOffersCardProps) {
  const [offersCount, setOffersCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchOffersCount() {
      try {
        const response = await fetch(`/api/offers/${invoiceId}`)
        if (response.ok) {
          const data = await response.json()
          setOffersCount(data.offers.length)
        } else {
          setOffersCount(0)
        }
      } catch (err) {
        console.error('Error fetching offers count:', err)
        setOffersCount(0)
      } finally {
        setLoading(false)
      }
    }

    fetchOffersCount()
  }, [invoiceId])

  if (loading) {
    return (
      <section className="card" aria-labelledby="ofertas">
        <h2 id="ofertas">Ofertas</h2>
        <p className="muted">Cargando...</p>
      </section>
    )
  }

  const count = offersCount || 0

  return (
    <section className="card" aria-labelledby="ofertas">
      <h2 id="ofertas">Ofertas</h2>
      <p className="muted">
        {count === 0 
          ? 'No hay ofertas para esta factura'
          : count === 1 
            ? '1 oferta registrada'
            : `${count} ofertas registradas`
        }
      </p>
      <div className="button-group">
        <Link 
          className="btn btn-outline" 
          href={`/invoices/${invoiceId}/offers`}
        >
          Ver todas las ofertas
        </Link>
      </div>
    </section>
  )
}
