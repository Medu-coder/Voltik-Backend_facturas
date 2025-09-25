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

type AggregatedStatusCounts = Record<StatusCategoryKey, number>

type AggregatedMonthBucket = {
  monthAnchor: string
  rangeStart: string
  rangeEnd: string
  currentCount: number
  previousYearCount: number
}

type NormalizedAggregates = {
  currentTotal: number
  previousTotal: number
  statusCounts: AggregatedStatusCounts
  monthlyBuckets: AggregatedMonthBucket[]
}

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

  const [{ data: aggregates, error: aggregatesError }, { data: invoiceRows, error: invoicesError }] =
    await Promise.all([
      admin.rpc('dashboard_invoice_aggregates', {
        p_from: sanitized.from,
        p_to: sanitized.to,
        p_query: sanitized.q ?? null,
      }),
      buildInvoicesQuery(
        admin,
        {
          from: startOfDayUtc(sanitized.fromDate).toISOString(),
          to: endOfDayUtc(sanitized.toDate).toISOString(),
          q: sanitized.q,
        },
        { limit: 20 }
      ),
    ])

  if (aggregatesError) throw aggregatesError
  if (invoicesError) throw invoicesError

  const normalizedInvoices = (invoiceRows || []).map((row) => normalizeInvoiceRow(row))
  const normalizedAggregates = normalizeAggregates(aggregates)

  const deltaRaw = computeDelta(normalizedAggregates.currentTotal, normalizedAggregates.previousTotal)
  const deltaDirection = deltaRaw == null ? 'flat' : deltaRaw > 0 ? 'up' : deltaRaw < 0 ? 'down' : 'flat'

  const dailySeries = buildMonthlySeries(sanitized.fromDate, normalizedAggregates.monthlyBuckets)
  const monthlyComparisons = buildMonthlyComparisons(
    monthSlices,
    previousYearSlices,
    normalizedAggregates.monthlyBuckets
  )

  const statusBreakdown = buildStatusBreakdown(normalizedAggregates.statusCounts)

  return {
    filters: {
      from: sanitized.from,
      to: sanitized.to,
      q: sanitized.q,
      previousFrom: isoDateString(previousRange.from),
      previousTo: isoDateString(previousRange.to),
    },
    headerRangeLabel: formatDateRange(sanitized.fromDate, sanitized.toDate),
    totalInvoicesCurrent: normalizedAggregates.currentTotal,
    totalInvoicesPrevious: normalizedAggregates.previousTotal,
    deltaVsPrevious: deltaRaw,
    deltaDirection,
    summaryRangeText: formatRangeSummary(sanitized.fromDate, sanitized.toDate),
    previousRangeText: formatRangeSummary(previousRange.from, previousRange.to),
    dailySeries,
    monthlyComparisons,
    statusBreakdown,
    invoices: normalizedInvoices.map((row) => ({
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
  filters: { from: string; to: string; q?: string | null },
  options?: { limit?: number }
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

  if (options?.limit) {
    query = query.limit(options.limit)
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

function normalizeAggregates(raw: any): NormalizedAggregates {
  const statusCountsRaw = raw?.statusCounts ?? {}
  const bucketsRaw = Array.isArray(raw?.monthlyBuckets) ? raw.monthlyBuckets : []

  return {
    currentTotal: Number(raw?.currentTotal ?? 0),
    previousTotal: Number(raw?.previousTotal ?? 0),
    statusCounts: {
      pending: Number(statusCountsRaw.pending ?? 0),
      processed: Number(statusCountsRaw.processed ?? 0),
      success: Number(statusCountsRaw.success ?? 0),
    },
    monthlyBuckets: bucketsRaw.map((bucket: any) => ({
      monthAnchor: bucket.monthAnchor as string,
      rangeStart: bucket.rangeStart as string,
      rangeEnd: bucket.rangeEnd as string,
      currentCount: Number(bucket.currentCount ?? 0),
      previousYearCount: Number(bucket.previousYearCount ?? 0),
    })),
  }
}

function computeDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null
  const delta = ((current - previous) / previous) * 100
  return Number.isFinite(delta) ? delta : null
}

function buildMonthlySeries(from: Date, buckets: AggregatedMonthBucket[]): DailySeries {
  const year = from.getUTCFullYear()
  const counts = new Array(12).fill(0)
  buckets.forEach((bucket) => {
    const parsed = new Date(bucket.monthAnchor)
    if (Number.isNaN(parsed.getTime())) return
    if (parsed.getUTCFullYear() !== year) return
    counts[parsed.getUTCMonth()] = bucket.currentCount
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
  monthRanges: DateRange[],
  previousYearRanges: DateRange[],
  buckets: AggregatedMonthBucket[]
): MonthlyComparison[] {
  return monthRanges.map((range, index) => {
    const previousRange = previousYearRanges[index]
    const month = range.from.getUTCMonth()
    const year = range.from.getUTCFullYear()
    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    const label = `${MONTH_LABELS[month]} ${year}`
    const title = `${capitalize(MONTH_LONG_FORMATTER.format(range.from))} ${year}`
    const bucket = buckets.find((item) => bucketKey(item.monthAnchor) === key)
    const currentCount = bucket?.currentCount ?? 0
    const previousCount = bucket?.previousYearCount ?? 0

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

function bucketKey(anchor: string): string {
  const date = new Date(anchor)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function buildStatusBreakdown(counts: AggregatedStatusCounts): StatusBreakdown {
  const total = counts.pending + counts.processed + counts.success

  return STATUS_CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    value: counts[key],
    percentage: total === 0 ? 0 : (counts[key] / total) * 100,
  }))
}
