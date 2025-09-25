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
  year: number
  labels: string[]
  counts: number[]
}

export type MonthlyComparisonSlice = {
  year: number
  count: number
  from: string
  to: string
  rangeLabel: string
}

export type MonthlyComparison = {
  key: string
  label: string
  title: string
  current: MonthlyComparisonSlice
  previous: MonthlyComparisonSlice
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
  monthlyComparisons: MonthlyComparison[]
  statusBreakdown: StatusBreakdown
  invoices: DashboardTableRow[]
}

type StatusCategoryKey = 'pending' | 'processed' | 'success'

const STATUS_CATEGORIES: Array<{
  key: StatusCategoryKey
  label: string
  matches: string[]
}> = [
  { key: 'pending', label: 'Pending', matches: ['pending', 'queued', 'reprocess', 'error'] },
  { key: 'processed', label: 'Processed', matches: ['processed'] },
  { key: 'success', label: 'Success', matches: ['done', 'success'] },
]

export async function fetchDashboardData(
  admin: SupabaseClient<any, any, any>,
  filters: DashboardFilters
): Promise<DashboardData> {
  const sanitized = normalizeFilters(filters)
  const previousRange = shiftRangeByMonths({ from: sanitized.fromDate, to: sanitized.toDate }, -1)
  const monthSlices = sliceRangeByMonths({ from: sanitized.fromDate, to: sanitized.toDate })
  const previousYearSlices = monthSlices.map((slice) => shiftRangeByYears(slice, -1))
  const previousYearFullRange = shiftRangeByYears({ from: sanitized.fromDate, to: sanitized.toDate }, -1)

  const currentQuery = buildInvoicesQuery(admin, {
    from: startOfDayUtc(sanitized.fromDate).toISOString(),
    to: endOfDayUtc(sanitized.toDate).toISOString(),
    q: sanitized.q,
  })
  const previousQuery = buildInvoicesQuery(admin, {
    from: startOfDayUtc(previousRange.from).toISOString(),
    to: endOfDayUtc(previousRange.to).toISOString(),
    q: sanitized.q,
  })
  const previousYearQuery = buildInvoicesQuery(admin, {
    from: startOfDayUtc(previousYearFullRange.from).toISOString(),
    to: endOfDayUtc(previousYearFullRange.to).toISOString(),
    q: sanitized.q,
  })

  const [
    { data: currentRows, error: currentError },
    { data: previousRows, error: previousError },
    { data: previousYearRows, error: previousYearError },
  ] = await Promise.all([currentQuery, previousQuery, previousYearQuery])

  if (currentError) throw currentError
  if (previousError) throw previousError
  if (previousYearError) throw previousYearError

  const normalizedCurrent = (currentRows || []).map((row) => normalizeInvoiceRow(row))
  const normalizedPrevious = (previousRows || []).map((row) => normalizeInvoiceRow(row))
  const normalizedPreviousYear = (previousYearRows || []).map((row) => normalizeInvoiceRow(row))

  const currentTotals = computeTotals(normalizedCurrent)
  const previousTotals = computeTotals(normalizedPrevious)

  const deltaRaw = computeDelta(currentTotals.count, previousTotals.count)
  const deltaDirection = deltaRaw == null ? 'flat' : deltaRaw > 0 ? 'up' : deltaRaw < 0 ? 'down' : 'flat'

  const dailySeries = buildMonthlySeries(sanitized.fromDate, normalizedCurrent)
  const monthlyComparisons = buildMonthlyComparisons(
    normalizedCurrent,
    normalizedPreviousYear,
    monthSlices,
    previousYearSlices
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
    monthlyComparisons,
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
    .gte('created_at', filters.from)
    .lte('created_at', filters.to)
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

function buildMonthlySeries(from: Date, rows: DashboardInvoiceRow[]): DailySeries {
  const year = from.getUTCFullYear()
  const counts = new Array(12).fill(0)
  rows.forEach((row) => {
    const baseDate = row.created_at
    if (!baseDate) return
    const parsed = new Date(baseDate)
    if (Number.isNaN(parsed.getTime())) return
    if (parsed.getUTCFullYear() !== year) return
    const month = parsed.getUTCMonth()
    counts[month] += 1
  })
  return {
    year,
    labels: MONTH_LABELS,
    counts,
  }
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const MONTH_LONG_FORMATTER = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' })

function buildMonthlyComparisons(
  currentRows: DashboardInvoiceRow[],
  previousYearRows: DashboardInvoiceRow[],
  monthRanges: DateRange[],
  previousYearRanges: DateRange[]
): MonthlyComparison[] {
  return monthRanges.map((range, index) => {
    const previousRange = previousYearRanges[index]
    const currentCount = countInvoicesInRange(currentRows, range)
    const previousCount = countInvoicesInRange(previousYearRows, previousRange)
    const month = range.from.getUTCMonth()
    const year = range.from.getUTCFullYear()
    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    const label = `${MONTH_LABELS[month]} ${year}`
    const title = `${capitalize(MONTH_LONG_FORMATTER.format(range.from))} ${year}`

    return {
      key,
      label,
      title,
      current: {
        year,
        count: currentCount,
        from: isoDateString(range.from),
        to: isoDateString(range.to),
        rangeLabel: formatDateRange(range.from, range.to),
      },
      previous: {
        year: previousRange.from.getUTCFullYear(),
        count: previousCount,
        from: isoDateString(previousRange.from),
        to: isoDateString(previousRange.to),
        rangeLabel: formatDateRange(previousRange.from, previousRange.to),
      },
    }
  })
}

function countInvoicesInRange(rows: DashboardInvoiceRow[], range: DateRange): number {
  if (rows.length === 0) return 0
  const start = startOfDayUtc(range.from).getTime()
  const end = endOfDayUtc(range.to).getTime()
  let total = 0
  rows.forEach((row) => {
    const date = resolveInvoiceDate(row)
    if (!date) return
    const time = date.getTime()
    if (time >= start && time <= end) {
      total += 1
    }
  })
  return total
}

function resolveInvoiceDate(row: DashboardInvoiceRow): Date | null {
  const baseDate = row.created_at
  if (!baseDate) return null
  const parsed = new Date(baseDate)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function shiftRangeByYears(range: DateRange, years: number): DateRange {
  return {
    from: addYearsUtc(range.from, years),
    to: addYearsUtc(range.to, years),
  }
}

function sliceRangeByMonths(range: DateRange): DateRange[] {
  const slices: DateRange[] = []
  let cursor = startOfDayUtc(range.from)
  const lastDay = startOfDayUtc(range.to)

  while (cursor.getTime() <= lastDay.getTime()) {
    const sliceFrom = cursor
    const monthEnd = endOfMonthUtc(sliceFrom)
    const rawEnd = monthEnd.getTime() > lastDay.getTime() ? lastDay : monthEnd
    const sliceTo = startOfDayUtc(rawEnd)
    slices.push({ from: sliceFrom, to: sliceTo })
    cursor = startOfDayUtc(new Date(Date.UTC(sliceFrom.getUTCFullYear(), sliceFrom.getUTCMonth() + 1, 1)))
  }

  return slices
}

function addYearsUtc(date: Date, years: number): Date {
  const year = date.getUTCFullYear() + years
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const daysInTarget = daysInUtcMonth(year, month)
  const clampedDay = Math.min(day, daysInTarget)
  return new Date(Date.UTC(year, month, clampedDay))
}

function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function endOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999))
}

function endOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function capitalize(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function buildStatusBreakdown(rows: DashboardInvoiceRow[]): StatusBreakdown {
  const totals: Record<StatusCategoryKey, number> = {
    pending: 0,
    processed: 0,
    success: 0,
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
    percentage: totalCount === 0 ? 0 : Math.round((totals[key] / totalCount) * 100),
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
