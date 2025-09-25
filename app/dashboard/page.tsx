import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import InvoiceTable from '@/components/InvoiceTable'
import AppShell from '@/components/AppShell'
import { fetchDashboardData } from '@/lib/invoices/dashboard'
import MonthlyInvoicesCard from './components/MonthlyInvoicesCard'
import InvoicesStatusCard from './components/InvoicesStatusCard'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  await requireAdmin()
  const admin = supabaseAdmin()

  const filters = extractFilters(searchParams)
  const data = await fetchDashboardData(admin, filters)

  const exportUrl = `/api/invoices/export.csv?from=${encodeURIComponent(data.filters.from)}&to=${encodeURIComponent(data.filters.to)}`

  const topbar = (
    <>
      <div aria-hidden="true" />
      <div className="topbar-actions" role="group" aria-label="Acciones de usuario">
        <button className="btn btn-icon" type="button" aria-label="Notificaciones">
          <BellIcon />
        </button>
        <button className="btn btn-icon" type="button" aria-label="Cuenta de usuario">
          <UserIcon />
        </button>
        <a className="btn btn-icon" href="/logout" aria-label="Cerrar sesión">
          <LogoutIcon />
        </a>
      </div>
    </>
  )

  return (
    <AppShell active="dashboard" exportHref={exportUrl} topbar={topbar}>
      <section className="page-header">
        <div>
          <h1 id="dashboard-title">Dashboard</h1>
          <p className="muted">{data.headerRangeLabel}</p>
        </div>
        <form className="filters" action="/dashboard" method="get" aria-label="Filtrar por fechas">
          <label className="filter-field">
            <span>Desde</span>
            <input type="date" name="from" defaultValue={data.filters.from} />
          </label>
          <label className="filter-field">
            <span>Hasta</span>
            <input type="date" name="to" defaultValue={data.filters.to} />
          </label>
          <button className="btn btn-primary" type="submit">Aplicar</button>
        </form>
      </section>

      <section className="cards cards--stacked" aria-label="Indicadores principales">
        <MonthlyInvoicesCard
          comparison={data.monthlyComparison}
          total={data.totalInvoicesCurrent}
        />

        <InvoicesStatusCard
          breakdown={data.statusBreakdown}
          total={data.totalInvoicesCurrent}
          summary={`${data.summaryRangeText}.`}
        />
      </section>

      <section className="table-section" aria-labelledby="latest-invoices">
        <div className="section-heading">
          <div>
            <h2 id="latest-invoices">Últimas facturas</h2>
            <p className="muted">Ordenadas por creación desc.</p>
          </div>
          <Link className="btn btn-outline" href="#invoices-table">Ir a la tabla</Link>
        </div>
        <div id="invoices-table">
          <InvoiceTable invoices={data.invoices} />
        </div>
      </section>
    </AppShell>
  )
}

function extractFilters(searchParams: Record<string, string | string[] | undefined>) {
  return {
    from: pickFirst(searchParams.from),
    to: pickFirst(searchParams.to),
    q: pickFirst(searchParams.q),
  }
}

function pickFirst(value: string | string[] | undefined) {
  if (!value) return undefined
  return Array.isArray(value) ? value[0] : value
}

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
      <path
        d="m5 18 1.7-1.7V11a5.3 5.3 0 0 1 9.9-2.7c.6 1 .9 2 .9 3.2v4.8L19 18Zm7 4a3 3 0 0 1-3-3h6a3 3 0 0 1-3 3Z"
        fill="currentColor"
      />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
      <path
        d="M12 3a5 5 0 1 1 0 10a5 5 0 0 1 0-10Zm0 12c4.4 0 8 2.2 8 5v2H4v-2c0-2.8 3.6-5 8-5Z"
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
