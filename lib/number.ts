const EURO_FORMATTER = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(value?: number | null): string {
  if (value == null) return '—'
  return EURO_FORMATTER.format(value)
}
