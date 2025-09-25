import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import AppShell from '@/components/AppShell'
import InvoiceTable from '@/components/InvoiceTable'

const PAGE_SIZE = 50

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  await requireAdmin()
  const admin = supabaseAdmin()

  const q = sanitizeQuery(pickFirst(searchParams.q))
  const page = clampPage(parsePage(pickFirst(searchParams.page)))
  const limit = PAGE_SIZE
  const offset = (page - 1) * limit

  let query = admin
    .from('invoices')
    .select(
      'id, created_at, status, total_amount_eur, billing_start_date, billing_end_date, customer:customer_id (id, name, email)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (q) {
    const like = `%${escapeLike(q)}%`
    query = query.or(`id.ilike.${like},customer.email.ilike.${like},customer.name.ilike.${like}`) as any
  }

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  const invoices = data || []
  const totalCount = typeof count === 'number' ? count : invoices.length
  const totalPages = totalCount === 0 ? 1 : Math.max(1, Math.ceil(totalCount / limit))

  if (totalCount === 0 && page !== 1) {
    redirect(buildHref({ q }))
  }

  if (totalCount > 0 && page > totalPages) {
    redirect(buildHref({ q, page: totalPages }))
  }

  const startItem = totalCount === 0 ? 0 : offset + 1
  const endItem = totalCount === 0 ? 0 : offset + invoices.length
  const hasPrevious = page > 1
  const hasNext = totalCount > 0 ? page < totalPages : false

  const rows = invoices.map((r: any) => ({
    id: r.id,
    customer_name: r.customer?.name || r.customer?.email || r.customer?.id || null,
    customer_email: r.customer?.email || null,
    date_start: r.billing_start_date,
    date_end: r.billing_end_date,
    status: r.status,
    total: r.total_amount_eur,
    created_at: r.created_at,
  }))

  const topbar = (
    <>
      <form className="search" role="search" aria-label="Buscar facturas" action="/invoices" method="get">
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
    <AppShell active="invoices" topbar={topbar}>
      <section className="page-header">
        <div>
          <h1>Facturas</h1>
          <p className="muted">Listado completo de facturas sin filtros aplicados.</p>
        </div>
        <div className="page-header__actions">
          <Link className="btn btn-secondary" href="/dashboard">Ver dashboard</Link>
          <Link className="btn btn-primary" href="/upload">Subir factura</Link>
        </div>
      </section>

      <section className="table-section" aria-labelledby="invoices-table">
        <div className="section-heading">
          <div>
            <h2 id="invoices-table">Facturas registradas</h2>
            <p className="muted">Ordenadas por fecha de creación descendente.</p>
          </div>
        </div>
        <InvoiceTable invoices={rows} />
        <PaginationControls
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          startItem={startItem}
          endItem={endItem}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          q={q}
        />
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

function parsePage(value?: string) {
  if (!value) return 1
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.floor(parsed)
}

function clampPage(page: number) {
  return page < 1 ? 1 : page
}

function buildHref({ page, q }: { page?: number; q?: string | null }) {
  const params = new URLSearchParams()
  if (page && page > 1) params.set('page', page.toString())
  if (q) params.set('q', q)
  const query = params.toString()
  return query ? `/invoices?${query}` : '/invoices'
}

function PaginationControls({
  page,
  totalPages,
  totalCount,
  startItem,
  endItem,
  hasPrevious,
  hasNext,
  q,
}: {
  page: number
  totalPages: number
  totalCount: number
  startItem: number
  endItem: number
  hasPrevious: boolean
  hasNext: boolean
  q: string | null
}) {
  if (totalCount <= PAGE_SIZE) return null

  const previousHref = hasPrevious ? buildHref({ page: page - 1, q }) : null
  const nextHref = hasNext ? buildHref({ page: page + 1, q }) : null

  return (
    <nav className="pagination" aria-label="Paginación de facturas">
      <p className="muted">
        Mostrando {startItem}–{endItem} de {totalCount} facturas
      </p>
      <div className="pagination-actions">
        {hasPrevious ? (
          <Link className="btn btn-secondary" href={previousHref!}>
            Anterior
          </Link>
        ) : (
          <span className="btn btn-secondary" aria-disabled="true" style={{ pointerEvents: 'none', opacity: 0.5 }}>
            Anterior
          </span>
        )}
        <span className="muted">Página {page} de {totalPages}</span>
        {hasNext ? (
          <Link className="btn btn-secondary" href={nextHref!}>
            Siguiente
          </Link>
        ) : (
          <span className="btn btn-secondary" aria-disabled="true" style={{ pointerEvents: 'none', opacity: 0.5 }}>
            Siguiente
          </span>
        )}
      </div>
    </nav>
  )
}
