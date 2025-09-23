import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import InvoiceTable from '@/components/InvoiceTable'
import { formatDate } from '@/lib/date'

export default async function CustomerDetail({ params }: { params: { id: string } }) {
  await requireAdmin()
  const admin = supabaseAdmin()

  const { data: customer, error } = await admin
    .from('customers')
    .select('id, name, email, created_at')
    .eq('id', params.id)
    .single()
  if (error || !customer) return notFound()

  const { data: invoices, error: invErr } = await admin
    .from('invoices')
    .select('id, status, total_amount_eur, billing_start_date, billing_end_date, created_at')
    .eq('customer_id', params.id)
    .order('created_at', { ascending: false })
  if (invErr) throw new Error(invErr.message)

  const rows = (invoices || []).map((inv: any) => ({
    id: inv.id,
    customer_name: customer.name || customer.email || customer.id,
    date_start: inv.billing_start_date,
    date_end: inv.billing_end_date,
    status: inv.status,
    total: inv.total_amount_eur,
  }))

  return (
    <main className="container">
      <div className="hstack" style={{ justifyContent: 'space-between', margin: '1rem 0' }}>
        <div>
          <h1>{customer.name || customer.email}</h1>
          <p className="muted">{customer.email}</p>
        </div>
        <div className="hstack" style={{ gap: '0.5rem' }}>
          <Link className="button" href="/customers">Volver</Link>
          <Link className="button" href="/upload">Subir factura</Link>
        </div>
      </div>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2>Datos del cliente</h2>
        <dl className="grid">
          <div><dt>Nombre</dt><dd>{customer.name || '—'}</dd></div>
          <div><dt>Email</dt><dd>{customer.email || '—'}</dd></div>
          <div><dt>Creado</dt><dd>{formatDate(customer.created_at)}</dd></div>
          <div><dt>Nº de facturas</dt><dd>{invoices?.length || 0}</dd></div>
        </dl>
      </section>

      <InvoiceTable invoices={rows} />
    </main>
  )
}
