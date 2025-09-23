function sanitizeEmailSegment(email: string): string {
  const trimmed = (email || '').trim()
  if (trimmed === '') return 'cliente'
  const lower = trimmed.toLowerCase()
  const safe = lower
    .split('')
    .map((char) => {
      if (/^[a-z0-9@._-]$/i.test(char)) return char
      return '_'
    })
    .join('')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return safe || 'cliente'
}

export function buildInvoiceStoragePath(invoiceId: string, email: string, issuedAt: Date = new Date()): { path: string; year: string; month: string; segment: string } {
  const year = String(issuedAt.getUTCFullYear())
  const month = String(issuedAt.getUTCMonth() + 1).padStart(2, '0')
  const segment = sanitizeEmailSegment(email || 'cliente')
  return {
    path: `${year}/${month}/${segment}/${invoiceId}.pdf`,
    year,
    month,
    segment,
  }
}
