import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { formatDate } from '@/lib/date'
import AppShell from '@/components/AppShell'
import type { Database } from '@/lib/types/supabase'

type CustomerRow = {
  id: string
  name: string
  email: string
  invoiceCount: number
  lastInvoiceAt: string | null
}

type CustomerQueryRow = Database['core']['Tables']['customers']['Row'] & {
  invoices: Array<{ count: number | null }> | null
}

type LastInvoiceRow = {
  customer_id: string
  last_invoice_at: string | null
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  await requireAdmin()
  const admin = supabaseAdmin()

  const q = sanitizeQuery(pickFirst(searchParams.q))

  let customersQuery = admin
    .from('customers')
    .select('id, name, email, created_at, invoices:invoices(count)')
    .order('name', { ascending: true })

  if (q) {
    const like = `%${escapeLike(q)}%`
    customersQuery = customersQuery.or(`name.ilike.${like},email.ilike.${like}`) as typeof customersQuery
  }

  const { data: customersData, error } = await customersQuery
  if (error) throw new Error(error.message)

  let lastInvoices: LastInvoiceRow[] = []
  const customerRows: CustomerQueryRow[] = (customersData ?? []) as CustomerQueryRow[]
  const customerIds = customerRows.map((row) => row.id).filter(Boolean)
  if (customerIds.length > 0) {
    const { data: invoiceRows, error: invoiceErr } = await admin.rpc('get_customers_last_invoice', {
      p_customer_ids: customerIds,
    })
    if (invoiceErr) throw new Error(invoiceErr.message)
    lastInvoices = (invoiceRows ?? []) as LastInvoiceRow[]
  }

  const lastMap = new Map<string, string | null>()
  for (const row of lastInvoices) {
    lastMap.set(row.customer_id, row.last_invoice_at)
  }

  const rows: CustomerRow[] = customerRows.map((c) => ({
    id: c.id,
    name: c.name || '—',
    email: c.email || '—',
    invoiceCount: c.invoices?.[0]?.count ?? 0,
    lastInvoiceAt: lastMap.get(c.id) || null,
  }))

  const topbar = (
    <>
      <form className="search" role="search" aria-label="Buscar clientes" action="/customers" method="get">
        <input
          className="search-input"
          type="search"
          name="q"
          placeholder="Buscar…"
          aria-label="Buscar"
          defaultValue={q ?? ''}
        />
        <button className="btn btn-icon" type="submit" aria-label="Aplicar búsqueda">
          <SearchIcon />
        </button>
      </form>
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
          <h1>Clientes</h1>
          <p className="muted">Listado completo de clientes y facturación relacionada.</p>
        </div>
        <Link className="btn btn-primary" href="/upload">Subir factura</Link>
      </section>

      <section className="table-section" aria-labelledby="customers-table">
        <div className="section-heading">
          <div>
            <h2 id="customers-table">Clientes</h2>
            <p className="muted">Ordenados alfabéticamente.</p>
          </div>
        </div>
        <div className="card table-card">
          <div className="table-responsive">
            <table className="table" role="table" aria-label="Listado de clientes">
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Email</th>
                  <th scope="col" className="table-num">Facturas</th>
                  <th scope="col">Última factura</th>
                  <th scope="col" className="table-actions">Acciones</th>
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
                    <td className="table-num">{row.invoiceCount}</td>
                    <td>{formatDate(row.lastInvoiceAt)}</td>
                    <td className="table-actions">
                      <Link className="btn btn-link" href={`/customers/${row.id}`}>
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  )
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icon">
      <path
        d="M10.5 3a7.5 7.5 0 0 1 5.93 12.16l4.2 4.2-1.42 1.42-4.2-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11Z"
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

function pickFirst(value: string | string[] | undefined) {
  if (!value) return undefined
  return Array.isArray(value) ? value[0] : value
}

function sanitizeQuery(value?: string) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function escapeLike(value: string) {
  return value.replace(/%/g, '\\%').replace(/_/g, '\\_')
}
