'use client'
import Link from 'next/link'

type Row = {
  id: string
  customer_name: string | null
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
                <td colSpan={6}>
                  <em>No hay facturas en el rango seleccionado.</em>
                </td>
              </tr>
            )}
            {invoices.map((r) => (
              <tr key={r.id}>
                <td><code>{r.id.slice(0, 8)}</code></td>
                <td>{r.customer_name || '—'}</td>
                <td>{fmtDate(r.date_start)} — {fmtDate(r.date_end)}</td>
                <td><span className={`badge badge-${badge(r.status)}`}>{r.status}</span></td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(r.total)}</td>
                <td><Link className="button" href={`/invoices/${r.id}`}>Ver</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString() } catch { return d as string }
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

