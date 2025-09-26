import { NextRequest } from 'next/server'
import { assertAdminFromAuthHeader, getAdminClient, HttpError } from '../../../../lib/supabase'
import { logAudit } from '../../../../lib/logger'
import type { Database } from '@/lib/types/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseDate(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function defaultRange(): { from: Date; to: Date } {
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { from, to }
}

function toISODate(d: Date): string { return d.toISOString().slice(0, 10) }

type InvoiceCsvRow = {
  id: string | null
  customer_id: string | null
  status: string | null
  issue_date: string | null
  billing_start_date: string | null
  billing_end_date: string | null
  total_amount_eur: number | null
  created_at: string | null
}

function escapeCsvValue(value: unknown): string {
  if (value == null) return ''
  const str = String(value)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function toCsv(rows: InvoiceCsvRow[]): string {
  const header = ['id','customer_id','status','issue_date','billing_start_date','billing_end_date','total_amount_eur','created_at']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push([
      escapeCsvValue(r.id),
      escapeCsvValue(r.customer_id),
      escapeCsvValue(r.status),
      escapeCsvValue(r.issue_date),
      escapeCsvValue(r.billing_start_date),
      escapeCsvValue(r.billing_end_date),
      escapeCsvValue(r.total_amount_eur),
      escapeCsvValue(r.created_at)
    ].join(','))
  }
  return lines.join('\n') + '\n'
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export async function GET(req: NextRequest) {
  const admin = getAdminClient()
  try {
    await assertAdminFromAuthHeader(req)

    const { searchParams } = new URL(req.url)
    const fromStr = searchParams.get('from')
    const toStr = searchParams.get('to')
    const range = defaultRange()
    const from = parseDate(fromStr) || range.from
    const to = parseDate(toStr) || range.to

    const fromIso = toISODate(from)
    const toIso = toISODate(to)

    await logAudit({ event: 'export_csv_requested', entity: 'invoice', meta: { from: fromIso, to: toIso } })

    const { data, error } = await admin
      .from('invoices')
      .select('id,customer_id,status,issue_date,billing_start_date,billing_end_date,total_amount_eur,created_at')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })

    if (error) {
      await logAudit({ event: 'export_csv_failed', entity: 'invoice', level: 'error', meta: { error: error.message } })
      throw new HttpError(500, `DB query failed: ${error.message}`)
    }

    const invoiceRows = (data ?? []) as Database['core']['Tables']['invoices']['Row'][]
    const csv = toCsv(invoiceRows.map((row) => ({
      id: row.id,
      customer_id: row.customer_id,
      status: row.status,
      issue_date: row.issue_date,
      billing_start_date: row.billing_start_date,
      billing_end_date: row.billing_end_date,
      total_amount_eur: row.total_amount_eur,
      created_at: row.created_at,
    })))
    const filename = `invoices_${fromIso.replace(/-/g,'')}-${toIso.replace(/-/g,'')}.csv`
    await logAudit({ event: 'export_csv_success', entity: 'invoice', meta: { rows: data?.length ?? 0 } })

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename=${filename}`
      }
    })
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof HttpError ? err.message : 'Internal server error'
    if (!(err instanceof HttpError)) {
      await logAudit({ event: 'export_csv_failed', entity: 'invoice', level: 'error', meta: { step: 'unhandled', error: getErrorMessage(err) } })
    }
    return new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  }
}
