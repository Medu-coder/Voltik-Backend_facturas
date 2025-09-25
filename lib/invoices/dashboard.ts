import type { SupabaseClient } from '@supabase/supabase-js'
import { formatDateRange, formatRangeSummary, isoDateString, parseISODate, shiftRangeByMonths, startOfMonthUtc, todayUtc } from '@/lib/date'

export type DashboardFilters = {
  from?: string | null
  to?: string | null
  q?: string | null
}

export type DashboardInvoiceRow = {
  id: string
  created_at: string | null
  status: string | null
  total_amount_eur: number | null
  billing_start_date: string | null
  billing_end_date: string | null
  customer: {
    id: string | null
    name: string | null
    email: string | null
  } | null
}

export type DashboardTableRow = {
  id: string
  customer_name: string | null
  customer_email: string | null
  date_start: string | null
  date_end: string | null
  status: string | null
  total: number | null
  created_at: string | null
}

export type DailySeries = {
  labels: string[]
  current: number[]
  previous: number[]
}

export type StatusBreakdown = Array<{
  key: StatusCategoryKey
  label: string
  value: number
  percentage: number
}>

export type DashboardData = {
  filters: {
    from: string
    to: string
    q?: string | null
    previousFrom: string
    previousTo: string
  }
  headerRangeLabel: string
  totalInvoicesCurrent: number
  totalInvoicesPrevious: number
  deltaVsPrevious: number | null
  deltaDirection: 'up' | 'down' | 'flat'
  summaryRangeText: string
  previousRangeText: string
  dailySeries: DailySeries
  statusBreakdown: StatusBreakdown
  invoices: DashboardTableRow[]
}

type StatusCategoryKey = 'pending' | 'processed' | 'issue'

const STATUS_CATEGORIES: Array<{
  key: StatusCategoryKey
  label: string
  matches: string[]
}> = [
  { key: 'pending', label: 'Pendiente', matches: ['pending', 'queued', 'reprocess'] },
  { key: 'processed', label: 'Procesada', matches: ['processed', 'done'] },
  { key: 'issue', label: 'Incidencia', matches: ['error'] },
]

export async function fetchDashboardData(
  admin: SupabaseClient<any, any, any>,
  filters: DashboardFilters
): Promise<DashboardData> {
  const sanitized = normalizeFilters(filters)
  const previousRange = shiftRangeByMonths({ from: sanitized.fromDate, to: sanitized.toDate }, -1)

  const currentQuery = buildInvoicesQuery(admin, {
    from: sanitized.from,
    to: sanitized.to,
    q: sanitized.q,
  })
  const previousQuery = buildInvoicesQuery(admin, {
    from: isoDateString(previousRange.from),
    to: isoDateString(previousRange.to),
    q: sanitized.q,
  })

  const [{ data: currentRows, error: currentError }, { data: previousRows, error: previousError }] = await Promise.all([currentQuery, previousQuery])

  if (currentError) throw currentError
  if (previousError) throw previousError

  const normalizedCurrent = (currentRows || []).map((row) => normalizeInvoiceRow(row))
  const normalizedPrevious = (previousRows || []).map((row) => normalizeInvoiceRow(row))

  const currentTotals = computeTotals(normalizedCurrent)
  const previousTotals = computeTotals(normalizedPrevious)

  const deltaRaw = computeDelta(currentTotals.count, previousTotals.count)
  const deltaDirection = deltaRaw == null ? 'flat' : deltaRaw > 0 ? 'up' : deltaRaw < 0 ? 'down' : 'flat'

  const dailySeries = buildDailySeries(
    sanitized.fromDate,
    sanitized.toDate,
    normalizedCurrent,
    normalizedPrevious
  )

  const statusBreakdown = buildStatusBreakdown(normalizedCurrent)

  return {
    filters: {
      from: sanitized.from,
      to: sanitized.to,
      q: sanitized.q,
      previousFrom: isoDateString(previousRange.from),
      previousTo: isoDateString(previousRange.to),
    },
    headerRangeLabel: formatDateRange(sanitized.fromDate, sanitized.toDate),
    totalInvoicesCurrent: currentTotals.count,
    totalInvoicesPrevious: previousTotals.count,
    deltaVsPrevious: deltaRaw,
    deltaDirection,
    summaryRangeText: formatRangeSummary(sanitized.fromDate, sanitized.toDate),
    previousRangeText: formatRangeSummary(previousRange.from, previousRange.to),
    dailySeries,
    statusBreakdown,
    invoices: normalizedCurrent
      .sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0
        return bDate - aDate
      })
      .slice(0, 20)
      .map((row) => ({
        id: row.id,
        customer_name: row.customer?.name || row.customer?.email || row.customer?.id || null,
        customer_email: row.customer?.email || null,
        date_start: row.billing_start_date,
        date_end: row.billing_end_date,
        status: row.status,
        total: row.total_amount_eur,
        created_at: row.created_at,
      })),
  }
}

type FiltersNormalized = {
  from: string
  to: string
  q?: string | null
  fromDate: Date
  toDate: Date
}

type DateRange = {
  from: Date
  to: Date
}

function normalizeFilters(filters: DashboardFilters): FiltersNormalized {
  const today = todayUtc()
  const defaultFromDate = startOfMonthUtc(today)
  const fromDate = filters.from ? parseISODate(filters.from) ?? defaultFromDate : defaultFromDate
  const toDate = filters.to ? parseISODate(filters.to) ?? today : today

  if (fromDate > toDate) {
    return {
      from: isoDateString(toDate),
      to: isoDateString(toDate),
      q: sanitizeQuery(filters.q),
      fromDate: toDate,
      toDate,
    }
  }

  return {
    from: isoDateString(fromDate),
    to: isoDateString(toDate),
    q: sanitizeQuery(filters.q),
    fromDate,
    toDate,
  }
}

function sanitizeQuery(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function buildInvoicesQuery(
  admin: SupabaseClient,
  filters: { from: string; to: string; q?: string | null }
) {
  let query = admin
    .from('invoices')
    .select(
      'id, created_at, status, total_amount_eur, billing_start_date, billing_end_date, customer:customer_id (id, name, email)'
    )
    .gte('billing_start_date', filters.from)
    .lte('billing_end_date', filters.to)
    .order('created_at', { ascending: false })

  if (filters.q) {
    const like = `%${filters.q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
    query = query.or(
      `id.ilike.${like},customer.email.ilike.${like},customer.name.ilike.${like}`
    ) as any
  }

  return query
}

function normalizeInvoiceRow(row: any): DashboardInvoiceRow {
  return {
    id: row.id,
    created_at: row.created_at ?? null,
    status: row.status ?? null,
    total_amount_eur: row.total_amount_eur ?? null,
    billing_start_date: row.billing_start_date ?? null,
    billing_end_date: row.billing_end_date ?? null,
    customer: row.customer
      ? {
          id: row.customer.id ?? null,
          name: row.customer.name ?? null,
          email: row.customer.email ?? null,
        }
      : null,
  }
}

function computeTotals(rows: DashboardInvoiceRow[]) {
  return {
    count: rows.length,
  }
}

function computeDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null
  const delta = ((current - previous) / previous) * 100
  return Number.isFinite(delta) ? delta : null
}

function buildDailySeries(
  from: Date,
  to: Date,
  currentRows: DashboardInvoiceRow[],
  previousRows: DashboardInvoiceRow[]
): DailySeries {
  const labels = buildDayLabels(from, to)
  const currentCounts = countByDay(currentRows)
  const previousCounts = countByDay(previousRows)

  return {
    labels,
    current: labels.map((label) => currentCounts[label] ?? 0),
    previous: labels.map((label) => previousCounts[label] ?? 0),
  }
}

function buildDayLabels(from: Date, to: Date): string[] {
  const labels: string[] = []
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const limit = to.getTime()

  while (cursor.getTime() <= limit) {
    labels.push(String(cursor.getUTCDate()).padStart(2, '0'))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return labels
}

function countByDay(rows: DashboardInvoiceRow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = extractDayKey(row)
    if (!key) return acc
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

function extractDayKey(row: DashboardInvoiceRow) {
  const baseDate = row.created_at || row.billing_start_date || row.billing_end_date
  if (!baseDate) return null
  const parsed = new Date(baseDate)
  if (Number.isNaN(parsed.getTime())) return null
  return String(parsed.getUTCDate()).padStart(2, '0')
}

function buildStatusBreakdown(rows: DashboardInvoiceRow[]): StatusBreakdown {
  const totals: Record<StatusCategoryKey, number> = {
    pending: 0,
    processed: 0,
    issue: 0,
  }

  rows.forEach((row) => {
    const key = mapStatusToCategory(row.status)
    totals[key] += 1
  })

  const totalCount = rows.length

  return STATUS_CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    value: totals[key],
    percentage: totalCount === 0 ? 0 : Math.round((totals[key] / totalCount) * 1000) / 10,
  }))
}

function mapStatusToCategory(status?: string | null): StatusCategoryKey {
  if (!status) return 'pending'
  const normalized = status.toLowerCase()
  const match = STATUS_CATEGORIES.find((category) =>
    category.matches.includes(normalized)
  )
  return match ? match.key : 'pending'
}
