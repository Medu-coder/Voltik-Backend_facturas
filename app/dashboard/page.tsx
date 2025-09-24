import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'
import InvoiceTable from '@/components/InvoiceTable'

export default async function DashboardPage() {
  await requireAdmin()
  const admin = supabaseAdmin()

  const { data: invoices, error } = await admin
    .from('invoices')
    .select('id, status, total_amount_eur, billing_start_date, billing_end_date, customer:customer_id (id, name, email)')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const rows = (invoices || [])
    .map((r: any) => ({
      id: r.id,
      customer_name: r.customer?.name || r.customer?.email || r.customer?.id,
      customer_email: r.customer?.email || '—',
      date_start: r.billing_start_date,
      date_end: r.billing_end_date,
      status: r.status,
      total: r.total_amount_eur,
    }))
    .sort((a, b) => (a.customer_email || '').localeCompare(b.customer_email || '', undefined, { sensitivity: 'base' }))

  const exportUrl = `/api/invoices/export.csv`

  return (
    <main className="container">
      <div className="hstack" style={{ justifyContent: 'space-between', margin: '1rem 0' }}>
        <h1>Dashboard</h1>
        <div className="hstack" style={{ gap: '0.5rem' }}>
          <Link className="button" href="/customers">Clientes</Link>
          <Link className="button" href="/upload">Subir factura</Link>
          <a className="button" href={exportUrl} download>Export CSV</a>
          <a className="button" href="/logout">Cerrar sesión</a>
        </div>
      </div>

      <InvoiceTable invoices={rows} />
    </main>
  )
}
