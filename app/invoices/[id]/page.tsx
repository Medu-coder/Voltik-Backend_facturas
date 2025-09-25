import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import JsonViewer from '@/components/JsonViewer'
import { formatDate } from '@/lib/date'
import AppShell from '@/components/AppShell'

export default async function InvoiceDetail({ params }: { params: { id: string } }) {
  await requireAdmin()
  const admin = supabaseAdmin()
  // Fetch invoice
  const { data, error } = await admin
    .from('invoices')
    .select('*, customer:customer_id (id, name, email)')
    .eq('id', params.id)
    .single()

  if (error || !data) return notFound()

  const downloadHref = `/api/invoices/${params.id}/download`
  const reprocessHref = `/api/invoices/${params.id}/reprocess`
  const customer = (data as any).customer || {}

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
          <p className="muted">Cliente: {customer.name || customer.email || (data as any).customer_id}</p>
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
          <div><dt>Cliente</dt><dd>{customer.name || customer.email || (data as any).customer_id}</dd></div>
          <div><dt>Email</dt><dd>{customer.email || '—'}</dd></div>
          <div><dt>Periodo</dt><dd>{formatDate((data as any).billing_start_date)} — {formatDate((data as any).billing_end_date)}</dd></div>
          <div><dt>Fecha emisión</dt><dd>{formatDate((data as any).issue_date)}</dd></div>
          <div><dt>Estado</dt><dd><span className={`badge badge-${badge(data.status)}`}>{data.status}</span></dd></div>
          <div><dt>Total</dt><dd>{money((data as any).total_amount_eur)}</dd></div>
          <div><dt>CUPS</dt><dd>{(data as any).cups || '—'}</dd></div>
          <div><dt>Tarifa</dt><dd>{(data as any).tariff || '—'}</dd></div>
          <div><dt>€/kWh</dt><dd>{(data as any).energy_price_eur_per_kwh ?? '—'}</dd></div>
          <div><dt>€/kW</dt><dd>{(data as any).power_price_eur_per_kw ?? '—'}</dd></div>
        </dl>
      </section>

      <section className="card" aria-labelledby="raw">
        <h2 id="raw">extracted_raw</h2>
        <JsonViewer value={(data as any).extracted_raw} />
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
