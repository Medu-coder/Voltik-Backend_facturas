import { NextRequest } from 'next/server'
import { assertAdminFromAuthHeader, getAdminClient, HttpError } from '../../../../lib/supabase'
import { logAudit } from '../../../../lib/logger'
import { buildInvoicesCsv } from '@/lib/export/invoicesCsv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function defaultRange(): { from: Date; to: Date } {
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { from, to }
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
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

    const { rows, csv } = await buildInvoicesCsv(admin, { from: fromIso, to: toIso, field: 'created_at' })
    const filename = `invoices_${fromIso.replace(/-/g, '')}-${toIso.replace(/-/g, '')}.csv`
    await logAudit({ event: 'export_csv_success', entity: 'invoice', meta: { rows: rows.length } })

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename=${filename}`,
      },
    })
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof HttpError ? err.message : 'Internal server error'
    if (!(err instanceof HttpError)) {
      await logAudit({ event: 'export_csv_failed', entity: 'invoice', level: 'error', meta: { step: 'unhandled', error: getErrorMessage(err) } })
    }
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
}
