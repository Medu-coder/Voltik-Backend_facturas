'use client'
import Link from 'next/link'
import { formatDate } from '@/lib/date'

type Row = {
  id: string
  customer_name: string | null
  customer_email: string | null
  date_start: string | null
  date_end: string | null
  status: string | null
  total: number | null
}

export default function InvoiceTable({ invoices }: { invoices: Row[] }) {
  return (
    <div className="card">
      <div className="table-responsive">
        <table className="table" role="table" aria-label="Listado de facturas">
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Cliente</th>
              <th>Periodo</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th></th>
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
                <td><span className={`badge badge-${badge(row.status)}`}>{row.status}</span></td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(row.total)}</td>
                <td><Link className="button" href={`/invoices/${row.id}`}>Ver</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmtMoney(n?: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(n)
}
function badge(status?: string | null) {
  switch ((status || '').toLowerCase()) {
    case 'queued':
    case 'pending': return 'warn'
    case 'processed':
    case 'done': return 'ok'
    case 'error': return 'error'
    default: return 'neutral'
  }
}
