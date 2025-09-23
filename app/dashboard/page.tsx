import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import Link from 'next/link'
import InvoiceTable from '@/components/InvoiceTable'

export default async function DashboardPage({ searchParams }: { searchParams: { from?: string, to?: string } }) {
  await requireAdmin()
  const admin = supabaseAdmin()

  const from = searchParams.from || new Date(Date.now() - 1000*60*60*24*90).toISOString().slice(0,10)
  const to = searchParams.to || new Date().toISOString().slice(0,10)

  const { data: invoices, error } = await admin
    .from('invoices')
    .select('id, status, total_amount_eur, billing_start_date, billing_end_date, customer:customer_id (id, name, email)')
    .gte('billing_start_date', from)
    .lte('billing_end_date', to)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const rows = (invoices || []).map((r: any) => ({
    id: r.id,
    customer_name: r.customer?.name || r.customer?.email || r.customer?.id,
    date_start: r.billing_start_date,
    date_end: r.billing_end_date,
    status: r.status,
    total: r.total_amount_eur,
  }))

  const exportUrl = `/api/invoices/export.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`

  return (
    <main className="container">
      <div className="hstack" style={{ justifyContent: 'space-between', margin: '1rem 0' }}>
        <h1>Dashboard</h1>
        <div className="hstack" style={{ gap: '0.5rem' }}>
          <Link className="button" href="/customers">Clientes</Link>
          <Link className="button" href="/upload">Subir factura</Link>
          <a className="button" href={exportUrl} download>Export CSV</a>
        </div>
      </div>

      <form className="hstack" role="search" aria-label="Filtrar por fechas" style={{ gap: '0.5rem', marginBottom: '1rem' }}>
        <label className="label" htmlFor="from">Desde</label>
        <input className="input" id="from" name="from" type="date" defaultValue={from} />
        <label className="label" htmlFor="to">Hasta</label>
        <input className="input" id="to" name="to" type="date" defaultValue={to} />
        <button className="button" type="submit">Filtrar</button>
      </form>

      <InvoiceTable invoices={rows} />
    </main>
  )
}
