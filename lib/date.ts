const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC' })

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '—'
  }
  return DATE_FORMATTER.format(date)
}

export function formatDateRange(start?: string | Date | null, end?: string | Date | null): string {
  const from = formatDate(start)
  const to = formatDate(end)
  return `${from} — ${to}`
}
