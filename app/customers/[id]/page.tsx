import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import InvoiceTable from '@/components/InvoiceTable'
import { formatDate } from '@/lib/date'
import AppShell from '@/components/AppShell'

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
    customer_email: customer.email || '—',
    date_start: inv.billing_start_date,
    date_end: inv.billing_end_date,
    status: inv.status,
    total: inv.total_amount_eur,
    created_at: inv.created_at,
  }))

  const topbar = (
    <>
      <Link className="btn btn-icon" href="/customers" aria-label="Volver a clientes">
        <BackIcon />
      </Link>
      <div className="topbar-actions" role="group" aria-label="Acciones de usuario">
        <a className="btn btn-icon" href="/logout" aria-label="Cerrar sesión">
          <LogoutIcon />
        </a>
      </div>
    </>
  )

  return (
    <AppShell active="customers" topbar={topbar}>
      <section className="page-header">
        <div>
          <h1>{customer.name || customer.email}</h1>
          <p className="muted">{customer.email}</p>
        </div>
        <div className="page-header__actions">
          <Link className="btn btn-secondary" href="/customers">Ver todos</Link>
          <Link className="btn btn-primary" href="/upload">Subir factura</Link>
        </div>
      </section>

      <section className="card" aria-labelledby="customer-data">
        <h2 id="customer-data">Datos del cliente</h2>
        <dl className="definition-grid">
          <div><dt>Nombre</dt><dd>{customer.name || '—'}</dd></div>
          <div><dt>Email</dt><dd>{customer.email || '—'}</dd></div>
          <div><dt>Creado</dt><dd>{formatDate(customer.created_at)}</dd></div>
          <div><dt>Nº de facturas</dt><dd>{invoices?.length || 0}</dd></div>
        </dl>
      </section>

      <section className="table-section" aria-labelledby="customer-invoices">
        <div className="section-heading">
          <div>
            <h2 id="customer-invoices">Facturas del cliente</h2>
            <p className="muted">Ordenadas por creación desc.</p>
          </div>
        </div>
        <InvoiceTable invoices={rows} />
      </section>
    </AppShell>
  )
}

function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
      <path
        d="M11 5v4h8v6h-8v4l-6-7z"
        fill="currentColor"
      />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
      <path
        d="M13 3v2H6v14h7v2H4V3Zm2.8 4.2 5 4.8-5 4.8-1.4-1.4 2.6-2.4H10v-2h7l-2.6-2.4Z"
        fill="currentColor"
      />
    </svg>
  )
}
