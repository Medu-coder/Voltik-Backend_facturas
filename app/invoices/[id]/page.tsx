import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import JsonViewer from '@/components/JsonViewer'
import { formatDate } from '@/lib/date'
import AppShell from '@/components/AppShell'
import type { Database } from '@/lib/types/supabase'

type InvoiceDetailRow = Database['core']['Tables']['invoices']['Row'] & {
  customer?: Pick<Database['core']['Tables']['customers']['Row'], 'id' | 'name' | 'email' | 'mobile_phone'> | null
}

export default async function InvoiceDetail({ params }: { params: { id: string } }) {
  await requireAdmin()
  const admin = supabaseAdmin()
  // Fetch invoice
  const { data, error } = await admin
    .from('invoices')
    .select('*, customer:customer_id (id, name, email, mobile_phone)')
    .eq('id', params.id)
    .single<InvoiceDetailRow>()
  if (error || !data) return notFound()

  const invoice = data as InvoiceDetailRow
  const customer = invoice.customer ?? { id: null, name: null, email: null, mobile_phone: null }

  const downloadHref = `/api/invoices/${params.id}/download`
  const reprocessHref = `/api/invoices/${params.id}/reprocess`

  const topbar = (
    <>
      <Link className="btn btn-icon" href="/invoices" aria-label="Volver a facturas">
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
    <AppShell active="invoices" topbar={topbar}>
      <section className="page-header">
        <div>
          <h1>Factura {params.id.slice(0, 8)}</h1>
          <p className="muted">Cliente: {customer.name || customer.email || invoice.customer_id}</p>
        </div>
        <div className="page-header__actions">
          <a className="btn btn-secondary" href={downloadHref}>Descargar PDF</a>
          <form action={reprocessHref} method="post">
            <button className="btn btn-primary" type="submit">Reprocesar</button>
          </form>
        </div>
      </section>

      <section className="card" aria-labelledby="resumen">
        <h2 id="resumen">Resumen</h2>
        <dl className="definition-grid">
          <div><dt>Cliente</dt><dd>{customer.name || customer.email || invoice.customer_id}</dd></div>
          <div><dt>Email</dt><dd>{customer.email || '—'}</dd></div>
          <div><dt>Teléfono</dt><dd>{customer.mobile_phone || '—'}</dd></div>
          <div><dt>Periodo</dt><dd>{formatDate(invoice.billing_start_date)} — {formatDate(invoice.billing_end_date)}</dd></div>
          <div><dt>Fecha emisión</dt><dd>{formatDate(invoice.issue_date)}</dd></div>
          <div><dt>Estado</dt><dd><span className={`badge badge-${badge(invoice.status)}`}>{invoice.status}</span></dd></div>
          <div><dt>Total</dt><dd>{money(invoice.total_amount_eur)}</dd></div>
          <div><dt>CUPS</dt><dd>{invoice.cups || '—'}</dd></div>
          <div><dt>Tarifa</dt><dd>{invoice.tariff || '—'}</dd></div>
          <div><dt>€/kWh</dt><dd>{invoice.energy_price_eur_per_kwh ?? '—'}</dd></div>
          <div><dt>€/kW</dt><dd>{invoice.power_price_eur_per_kw ?? '—'}</dd></div>
        </dl>
      </section>

      <section className="card" aria-labelledby="raw">
        <h2 id="raw">extracted_raw</h2>
        <JsonViewer value={invoice.extracted_raw ?? null} />
      </section>
    </AppShell>
  )
}

function money(n?: number | null) {
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
