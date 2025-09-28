import { NextRequest } from 'next/server'
import { getAdminClient, HttpError } from '../../../../lib/supabase'
import { logAudit } from '../../../../lib/logger'
import { ensureCustomer } from '@/lib/customers'
import { ingestInvoiceSubmission } from '@/lib/invoices/intake'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function requireInboundSecret(req: NextRequest) {
  const configured = process.env.INBOUND_EMAIL_SECRET
  if (!configured) throw new Error('Missing INBOUND_EMAIL_SECRET env var')
  const provided = req.headers.get('x-inbound-secret') || req.headers.get('X-Inbound-Secret')
  if (!provided || provided !== configured) {
    throw new HttpError(403, 'Invalid inbound secret')
  }
}

function extractEmail(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.trim()
  // Try to extract from Name <email@example.com>
  const m = s.match(/<([^>]+)>/)?.[1] || s
  const email = m.toLowerCase()
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return email
  return null
}

function extractName(raw: string | null, fallbackEmail?: string | null): string {
  if (raw) {
    const trimmed = raw.trim()
    const nameMatch = trimmed.match(/^"?([^<>"]+)"?\s*<[^>]+>/)
    if (nameMatch?.[1]) return nameMatch[1].trim()
    const withoutEmail = trimmed.replace(/<[^>]+>/, '').trim()
    if (withoutEmail) return withoutEmail
  }
  if (fallbackEmail) {
    const local = fallbackEmail.split('@')[0]
    if (local) return local
  }
  return 'Cliente'
}

function findPdfAttachment(form: FormData): Blob | null {
  const entries: [string, FormDataEntryValue][] = []
  form.forEach((value, key) => {
    entries.push([key, value])
  })
  for (const [, value] of entries) {
    if (value instanceof Blob) {
      const name = value instanceof File ? value.name.toLowerCase() : ''
      const type = (value.type || '').toLowerCase()
      if (type === 'application/pdf' || name.endsWith('.pdf')) return value
    }
  }
  return null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export async function POST(req: NextRequest) {
  const admin = getAdminClient()
  try {
    requireInboundSecret(req)

    const form = await req.formData()
    const fromHeader = (form.get('from') as string | null) || null
    // SendGrid sends an 'envelope' JSON with { from, to }
    let envelopeFrom: string | null = null
    const envelopeRaw = form.get('envelope') as string | null
    if (envelopeRaw) {
      try {
        const env = JSON.parse(envelopeRaw)
        envelopeFrom = env?.from || null
      } catch {
        // ignore malformed envelope
      }
    }
    const fromEmail = extractEmail(fromHeader) || extractEmail(envelopeFrom)
    const subject = (form.get('subject') as string | null) || ''

    await logAudit({ event: 'email_inbound_received', entity: 'system', meta: { from: fromEmail, subject } })

    const pdf = findPdfAttachment(form)
    if (!pdf) {
      await logAudit({ event: 'email_inbound_no_pdf', entity: 'system', level: 'warn', meta: { from: fromEmail } })
      throw new HttpError(400, 'No PDF attachment found')
    }

    if (!fromEmail) {
      await logAudit({ event: 'email_inbound_no_from', entity: 'system', level: 'warn' })
      throw new HttpError(400, 'Missing sender email')
    }

    const customerName = extractName(fromHeader, fromEmail)
    let customer
    try {
      customer = await ensureCustomer(admin, { name: customerName, email: fromEmail, userId: process.env.ADMIN_USER_ID || null })
    } catch (err: unknown) {
      const message = getErrorMessage(err)
      await logAudit({ event: 'email_inbound_customer_error', entity: 'system', level: 'error', meta: { error: message } })
      throw new HttpError(400, message || 'Customer resolution failed')
    }

    const buf = await pdf.arrayBuffer()
    const cloned = new Blob([buf], { type: 'application/pdf' })
    const actorId = (customer.user_id && /[0-9a-f-]{36}/i.test(customer.user_id)) ? customer.user_id : (process.env.ADMIN_USER_ID || 'system')
    const issuedAt = new Date()

    const { invoiceId, storagePath } = await ingestInvoiceSubmission({
      admin,
      file: cloned,
      customerName,
      customerEmail: fromEmail,
      actorUserId: actorId,
      issuedAt,
      customer,
      events: {
        received: undefined,
        customerError: undefined,
        failure: 'email_inbound_failed',
        success: undefined,
      },
    })

    await logAudit({
      event: 'email_inbound_delegated',
      entity: 'system',
      meta: {
        invoice_id: invoiceId,
        storage_path: storagePath,
        via: 'helper',
      },
    })
    return new Response(JSON.stringify({ ok: true, id: invoiceId }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof HttpError ? err.message : 'Internal server error'
    if (!(err instanceof HttpError)) {
      await logAudit({ event: 'email_inbound_failed', entity: 'system', level: 'error', meta: { step: 'unhandled', error: getErrorMessage(err) } })
    }
    return new Response(JSON.stringify({ error: message, debug: getErrorMessage(err) }), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  }
}
