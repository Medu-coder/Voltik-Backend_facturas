import { NextRequest } from 'next/server'
import { assertAdminFromAuthHeader, getAdminClient, HttpError } from '../../../../lib/supabase'
import { logAudit } from '../../../../lib/logger'

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

function toCsv(rows: any[]): string {
  const header = ['id','customer_id','status','issue_date','billing_start_date','billing_end_date','total_amount_eur','created_at']
  const esc = (v: any) => {
    if (v == null) return ''
    const s = String(v)
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push([
      esc(r.id),
      esc(r.customer_id),
      esc(r.status),
      esc(r.issue_date),
      esc(r.billing_start_date),
      esc(r.billing_end_date),
      esc(r.total_amount_eur),
      esc(r.created_at)
    ].join(','))
  }
  return lines.join('\n') + '\n'
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

    await logAudit({ event: 'export_csv_requested', entity: 'invoice', details: { from: fromIso, to: toIso } })

    const { data, error } = await admin
      .from('invoices')
      .select('id,customer_id,status,issue_date,billing_start_date,billing_end_date,total_amount_eur,created_at')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })

    if (error) {
      await logAudit({ event: 'export_csv_failed', entity: 'invoice', level: 'error', details: { error: error.message } })
      throw new HttpError(500, `DB query failed: ${error.message}`)
    }

    const csv = toCsv(data || [])
    const filename = `invoices_${fromIso.replace(/-/g,'')}-${toIso.replace(/-/g,'')}.csv`
    await logAudit({ event: 'export_csv_success', entity: 'invoice', details: { rows: data?.length ?? 0 } })

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename=${filename}`
      }
    })
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof HttpError ? err.message : 'Internal server error'
    if (!(err instanceof HttpError)) {
      await logAudit({ event: 'export_csv_failed', entity: 'invoice', level: 'error', details: { step: 'unhandled', error: String(err?.message || err) } })
    }
    return new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  }
}
