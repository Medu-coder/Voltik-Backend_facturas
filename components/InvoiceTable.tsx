'use client'
import Link from 'next/link'
import { formatDate } from '@/lib/date'
import { formatCurrency } from '@/lib/number'

type Row = {
  id: string
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  date_start: string | null
  date_end: string | null
  status: string | null
  total: number | null
  created_at?: string | null
}

export default function InvoiceTable({ invoices }: { invoices: Row[] }) {
  return (
    <div className="card table-card">
      <div className="table-responsive">
        <table className="table" role="table" aria-label="Listado de facturas">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Email</th>
              <th scope="col">Teléfono</th>
              <th scope="col">Cliente</th>
              <th scope="col">Periodo</th>
              <th scope="col">Estado</th>
              <th scope="col" className="table-num">Total</th>
              <th scope="col" className="table-actions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <em>No hay facturas registradas todavía.</em>
                </td>
              </tr>
            )}
            {invoices.map((row) => (
              <tr key={row.id}>
                <td><code>{row.id.slice(0, 8)}</code></td>
                <td>{row.customer_email || '—'}</td>
                <td>{row.customer_phone || '—'}</td>
                <td>{row.customer_name || '—'}</td>
                <td>{formatDate(row.date_start)} — {formatDate(row.date_end)}</td>
                <td><span className={`badge badge-${badge(row.status)}`}>{friendlyStatus(row.status)}</span></td>
                <td className="table-num">{formatCurrency(row.total)}</td>
                <td className="table-actions">
                  <Link className="btn btn-link" href={`/invoices/${row.id}`}>
                    Ver factura
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
function badge(status?: string | null) {
  switch (status) {
    case 'Pendiente': return 'neutral'
    case 'Ofertada': return 'warn'
    case 'Tramitando': return 'warn'
    case 'Contratando': return 'warn'
    case 'Cancelado': return 'error'
    case 'Contratado': return 'ok'
    default: return 'neutral'
  }
}

function friendlyStatus(status?: string | null) {
  switch (status) {
    case 'Pendiente': return 'Pendiente'
    case 'Ofertada': return 'Enviada oferta'
    case 'Tramitando': return 'Iniciada contratación'
    case 'Contratando': return 'En trámite contratación'
    case 'Cancelado': return 'Cancelado'
    case 'Contratado': return 'Contratado'
    default:
      return status || 'Sin estado'
  }
}
