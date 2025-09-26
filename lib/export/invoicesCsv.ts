import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/supabase'

export type CsvRangeField = 'created_at' | 'billing_period'

export type CsvRangeParams = {
  from: string
  to: string
  field?: CsvRangeField
}

export type InvoiceCsvRow = {
  id: string
  customer_id: string | null
  billing_start_date: string | null
  billing_end_date: string | null
  issue_date: string | null
  status: string | null
  total_amount_eur: number | null
  created_at: string | null
}

function escapeCsvValue(value: unknown): string {
  if (value == null) return ''
  const str = String(value)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function rowsToCsv(rows: InvoiceCsvRow[]): string {
  const header = ['id', 'customer_id', 'status', 'issue_date', 'billing_start_date', 'billing_end_date', 'total_amount_eur', 'created_at']
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push([
      escapeCsvValue(row.id),
      escapeCsvValue(row.customer_id),
      escapeCsvValue(row.status),
      escapeCsvValue(row.issue_date),
      escapeCsvValue(row.billing_start_date),
      escapeCsvValue(row.billing_end_date),
      escapeCsvValue(row.total_amount_eur),
      escapeCsvValue(row.created_at),
    ].join(','))
  }
  return `${lines.join('\n')}\n`
}

export async function fetchInvoiceRows(
  admin: SupabaseClient<Database, 'core'>,
  params: CsvRangeParams
): Promise<InvoiceCsvRow[]> {
  const { from, to, field = 'created_at' } = params

  let query = admin
    .from('invoices')
    .select('id,customer_id,status,issue_date,billing_start_date,billing_end_date,total_amount_eur,created_at')
    .order('created_at', { ascending: false })

  if (field === 'billing_period') {
    query = query
      .gte('billing_start_date', from)
      .lte('billing_end_date', to)
  } else {
    query = query
      .gte('created_at', from)
      .lte('created_at', to)
  }

  const { data, error } = await query
  if (error) throw error

  return (data ?? []) as InvoiceCsvRow[]
}

export async function buildInvoicesCsv(
  admin: SupabaseClient<Database, 'core'>,
  params: CsvRangeParams
): Promise<{ rows: InvoiceCsvRow[]; csv: string }> {
  const rows = await fetchInvoiceRows(admin, params)
  return {
    rows,
    csv: rowsToCsv(rows),
  }
}
