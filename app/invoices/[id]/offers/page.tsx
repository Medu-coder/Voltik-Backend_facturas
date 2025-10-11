import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import OffersPageClient from '@/components/OffersPageClient'
import { formatDate } from '@/lib/date'
import type { Database } from '@/lib/types/supabase'

type InvoiceDetailRow = Database['core']['Tables']['invoices']['Row'] & {
  customer?: Pick<Database['core']['Tables']['customers']['Row'], 'id' | 'name' | 'email' | 'mobile_phone'> | null
}

type OfferRow = Database['core']['Tables']['offers']['Row']

interface OffersPageProps {
  params: { id: string }
}

export default async function OffersPage({ params }: OffersPageProps) {
  await requireAdmin()
  const admin = supabaseAdmin()

  // Fetch invoice
  const { data: invoiceData, error: invoiceError } = await admin
    .from('invoices')
    .select('*, customer:customer_id (id, name, email, mobile_phone)')
    .eq('id', params.id)
    .single<InvoiceDetailRow>()

  if (invoiceError || !invoiceData) return notFound()

  const invoice = invoiceData as InvoiceDetailRow
  const customer = invoice.customer ?? { id: null, name: null, email: null, mobile_phone: null }

  // Fetch offers
  const { data: offersData, error: offersError } = await admin
    .from('offers')
    .select('*')
    .eq('invoice_id', params.id)
    .order('created_at', { ascending: false })

  if (offersError) {
    console.error('Error fetching offers:', offersError)
  }

  const offers: OfferRow[] = offersData || []

  const topbar = (
    <>
      <Link className="btn btn-icon" href={`/invoices/${params.id}`} aria-label="Volver a factura">
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
          <nav aria-label="Breadcrumb">
            <ol className="breadcrumb">
              <li><Link href="/invoices">Facturas</Link></li>
              <li><Link href={`/invoices/${params.id}`}>Factura {params.id.slice(0, 8)}</Link></li>
              <li aria-current="page">Ofertas</li>
            </ol>
          </nav>
          <h1>Ofertas - Factura {params.id.slice(0, 8)}</h1>
          <p className="muted">
            Cliente: {customer.name || customer.email || invoice.customer_id}
            {customer.email && customer.email !== customer.name && ` (${customer.email})`}
          </p>
          <p className="muted">
            Período: {formatDate(invoice.billing_start_date)} — {formatDate(invoice.billing_end_date)}
          </p>
        </div>
      </section>

      <OffersPageClient invoiceId={params.id} initialOffers={offers} />
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
