import { NextRequest } from 'next/server'
import { getAdminClient, HttpError } from '../../../../lib/supabase'
import { logAudit } from '../../../../lib/logger'

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

function findPdfAttachment(form: FormData): Blob | null {
  const entries = Array.from(form.entries())
  for (const [key, value] of entries) {
    if (value instanceof Blob) {
      const anyVal: any = value
      const name = (anyVal?.name || '').toLowerCase()
      const type = (anyVal?.type || '').toLowerCase()
      if (type === 'application/pdf' || name.endsWith('.pdf')) return value
    }
  }
  return null
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

    // Find customer by email
    const { data: customer, error: custErr } = await admin
      .from('customers')
      .select('id,email,user_id')
      .eq('email', fromEmail)
      .maybeSingle()
    if (custErr) throw new HttpError(500, `Customer lookup failed: ${custErr.message}`)
    if (!customer) {
      await logAudit({ event: 'email_inbound_customer_not_found', entity: 'system', level: 'warn', meta: { from: fromEmail } })
      throw new HttpError(404, 'Customer not found')
    }

    // Delegate to /api/upload
    const fd = new FormData()
    // Recreate the file as Blob to avoid stream/body issues across fetch boundaries
    const anyPdf: any = pdf as any
    const fileName = anyPdf?.name || 'invoice.pdf'
    const buf = await (pdf as any).arrayBuffer()
    const cloned = new Blob([buf], { type: 'application/pdf' })
    fd.set('file', cloned, fileName)
    fd.set('customer_id', customer.id)

    const internalKey = process.env.INTERNAL_API_SECRET
    if (!internalKey) throw new Error('Missing INTERNAL_API_SECRET env var')

    const url = new URL('/api/upload', req.url)
    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'X-INTERNAL-KEY': internalKey },
        body: fd,
      })
      const text = await res.text()
      let payload: any
      try { payload = JSON.parse(text) } catch { payload = { raw: text } }
      if (!res.ok) {
        await logAudit({ event: 'email_inbound_failed', entity: 'system', level: 'error', meta: { status: res.status, body: payload } })
        return new Response(JSON.stringify({ error: 'Upload failed', details: payload }), {
          status: res.status,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        })
      }
      await logAudit({ event: 'email_inbound_delegated', entity: 'system', meta: payload })
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } })
    } catch (fetchErr: any) {
      // Fallback: perform upload directly if internal fetch fails
      await logAudit({ event: 'email_inbound_fallback', entity: 'system', level: 'warn', meta: { reason: String(fetchErr?.message || fetchErr) } })
      const admin = getAdminClient()
      const invoiceId = crypto.randomUUID()
      const now = new Date(); const y = now.getUTCFullYear(); const m = String(now.getUTCMonth()+1).padStart(2,'0')
      const actorId = (customer.user_id && /[0-9a-f-]{36}/i.test(customer.user_id)) ? customer.user_id : 'system'
      const storagePath = `${y}/${m}/${invoiceId}__${actorId}.pdf`
      const { error: upErr } = await admin.storage.from('invoices').upload(storagePath, cloned, { contentType: 'application/pdf', upsert: false, metadata: { customer_id: customer.id, actor_user_id: actorId } as any })
      if (upErr) {
        await logAudit({ event: 'email_inbound_failed', entity: 'system', level: 'error', meta: { step: 'fallback_upload', error: upErr.message } })
        throw new HttpError(500, `Storage upload failed: ${upErr.message}`)
      }
      const { error: insErr } = await admin.from('invoices').insert({ id: invoiceId, customer_id: customer.id, status: 'pending', storage_object_path: storagePath })
      if (insErr) {
        await admin.storage.from('invoices').remove([storagePath]).catch(() => {})
        await logAudit({ event: 'email_inbound_failed', entity: 'system', level: 'error', meta: { step: 'fallback_insert', error: insErr.message } })
        throw new HttpError(500, `DB insert failed: ${insErr.message}`)
      }
      const payload = { invoice_id: invoiceId, storage_path: storagePath, fallback: true }
      await logAudit({ event: 'email_inbound_fallback_uploaded', entity: 'system', meta: payload })
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } })
    }
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof HttpError ? err.message : 'Internal server error'
    if (!(err instanceof HttpError)) {
      await logAudit({ event: 'email_inbound_failed', entity: 'system', level: 'error', meta: { step: 'unhandled', error: String(err?.message || err) } })
    }
    return new Response(JSON.stringify({ error: message, debug: String(err?.message || err) }), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  }
}
