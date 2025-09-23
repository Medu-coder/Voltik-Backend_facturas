import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

type CustomerRow = {
  id: string
  name: string
  email: string
  invoiceCount: number
  lastInvoiceAt: string | null
}

function fmtDate(value: string | null) {
  if (!value) return '—'
  try { return new Date(value).toLocaleDateString() } catch { return value }
}

export default async function CustomersPage() {
  await requireAdmin()
  const admin = supabaseAdmin()

  const { data: customersData, error } = await admin
    .from('customers')
    .select('id, name, email, created_at, invoices:invoices(count)')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)

  const { data: invoicesMeta } = await admin
    .from('invoices')
    .select('customer_id, created_at')
    .order('created_at', { ascending: false })

  const lastMap = new Map<string, string>()
  for (const row of invoicesMeta || []) {
    if (!lastMap.has((row as any).customer_id)) {
      lastMap.set((row as any).customer_id, (row as any).created_at)
    }
  }

  const rows: CustomerRow[] = (customersData || []).map((c: any) => ({
    id: c.id,
    name: c.name || '—',
    email: c.email || '—',
    invoiceCount: c.invoices?.[0]?.count ?? 0,
    lastInvoiceAt: lastMap.get(c.id) || null,
  }))

  return (
    <main className="container">
      <div className="hstack" style={{ justifyContent: 'space-between', margin: '1rem 0' }}>
        <h1>Clientes</h1>
        <Link className="button" href="/upload">Subir factura</Link>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table" role="table" aria-label="Listado de clientes">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Email</th>
                <th style={{ textAlign: 'right' }}>Facturas</th>
                <th>Última factura</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5}><em>No hay clientes registrados todavía.</em></td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.email}</td>
                  <td style={{ textAlign: 'right' }}>{row.invoiceCount}</td>
                  <td>{fmtDate(row.lastInvoiceAt)}</td>
                  <td><Link className="button" href={`/customers/${row.id}`}>Ver</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}

