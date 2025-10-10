const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC' })
const RANGE_SUMMARY_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const DATETIME_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit', 
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC'
})

export function formatDate(value?: string | Date | null): string {
  const date = coerceDate(value)
  if (!date) {
    return typeof value === 'string' ? value : '—'
  }
  return DATE_FORMATTER.format(date)
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—'
  
  let date: Date
  if (value instanceof Date) {
    date = value
  } else {
    // Para timestamps ISO completos, parsear directamente
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '—'
    date = parsed
  }
  
  return DATETIME_FORMATTER.format(date)
}

export function formatDateRange(start?: string | Date | null, end?: string | Date | null): string {
  const from = formatDate(start)
  const to = formatDate(end)
  return `${from} — ${to}`
}

export function formatRangeSummary(start?: string | Date | null, end?: string | Date | null): string {
  const fromDate = coerceDate(start)
  const toDate = coerceDate(end)
  if (!fromDate || !toDate) return '—'
  return `Del ${RANGE_SUMMARY_FORMATTER.format(fromDate)} al ${RANGE_SUMMARY_FORMATTER.format(toDate)}`
}

export function parseISODate(value?: string | null): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.length === 10 ? `${trimmed}T00:00:00Z` : trimmed
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

export function isoDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function todayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function shiftRangeByMonths(range: DateRangeInput, months: number): { from: Date; to: Date } {
  return {
    from: addMonthsUtc(range.from, months),
    to: addMonthsUtc(range.to, months),
  }
}

type DateRangeInput = {
  from: Date
  to: Date
}

function coerceDate(value?: string | Date | null): Date | null {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  return parseISODate(value)
}

function addMonthsUtc(date: Date, months: number): Date {
  const base = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  base.setUTCMonth(base.getUTCMonth() + months)
  const daysInTarget = daysInUtcMonth(base.getUTCFullYear(), base.getUTCMonth())
  const clampedDay = Math.min(date.getUTCDate(), daysInTarget)
  base.setUTCDate(clampedDay)
  return base
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}
