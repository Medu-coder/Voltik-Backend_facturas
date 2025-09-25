'use client'
import Link from 'next/link'
import { formatDate } from '@/lib/date'
import { formatCurrency } from '@/lib/number'

type Row = {
  id: string
  customer_name: string | null
  customer_email: string | null
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
                <td colSpan={7}>
                  <em>No hay facturas registradas todavía.</em>
                </td>
              </tr>
            )}
            {invoices.map((row) => (
              <tr key={row.id}>
                <td><code>{row.id.slice(0, 8)}</code></td>
                <td>{row.customer_email || '—'}</td>
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
  switch ((status || '').toLowerCase()) {
    case 'queued':
    case 'pending': return 'warn'
    case 'processed':
    case 'done': return 'ok'
    case 'error': return 'error'
    case 'reprocess': return 'warn'
    default: return 'neutral'
  }
}

function friendlyStatus(status?: string | null) {
  switch ((status || '').toLowerCase()) {
    case 'processed':
    case 'done':
      return 'Procesada'
    case 'error':
      return 'Con incidencia'
    case 'reprocess':
      return 'Reprocesar'
    case 'queued':
    case 'pending':
      return 'Pendiente'
    default:
      return status || 'Sin estado'
  }
}
