import { NextRequest } from 'next/server'
import { getAdminClient, HttpError, getClaimsFromAuthHeader } from '../../../lib/supabase'
import { logAudit } from '../../../lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getLimitBytes(): number {
  const mb = Number(process.env.LIMITE_PDF_MB || 10)
  return Math.max(1, Math.floor(mb)) * 1024 * 1024
}

function isUUID(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function isPdfFile(file: File): boolean {
  const ct = (file.type || '').toLowerCase()
  if (ct === 'application/pdf') return true
  if (ct === 'application/octet-stream' && file.name?.toLowerCase().endsWith('.pdf')) return true
  return false
}

function ymd(date = new Date()): { y: number; m: number } {
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1 }
}

export async function POST(req: NextRequest) {
  const admin = getAdminClient()

  try {
    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      throw new HttpError(400, 'Content-Type must be multipart/form-data')
    }

    const form = await req.formData()
    const file = form.get('file') as File | null
    const customerId = String(form.get('customer_id') || '')

    if (!file) throw new HttpError(400, 'Missing file')
    if (!customerId) throw new HttpError(400, 'Missing customer_id')
    if (!isUUID(customerId)) throw new HttpError(400, 'customer_id must be a valid UUID')

    const limit = getLimitBytes()
    if (file.size > limit) throw new HttpError(413, 'File too large')
    if (!isPdfFile(file)) throw new HttpError(415, 'Unsupported media type (PDF required)')

    const claims = await getClaimsFromAuthHeader(req)

    // Validate customer exists
    const { data: cust, error: custErr } = await admin
      .from('customers')
      .select('id,user_id')
      .eq('id', customerId)
      .maybeSingle()
    if (custErr) throw new HttpError(500, `Customer lookup failed: ${custErr.message}`)
    if (!cust) throw new HttpError(404, 'Customer not found')

    const invoiceId = crypto.randomUUID()
    const { y, m } = ymd()
    const actorUserId = (claims?.sub && isUUID(String(claims.sub))) ? String(claims.sub) : (cust?.user_id && isUUID(String(cust.user_id)) ? String(cust.user_id) : 'system')
    const path = `${y}/${String(m).padStart(2, '0')}/${invoiceId}__${actorUserId}.pdf`

    // Log request now that we know actor and path
    await logAudit({
      event: 'invoice_upload_requested',
      entity: 'invoice',
      customer_id: customerId,
      actor_user_id: actorUserId,
      meta: { customer_id: customerId, filename: (file as any).name, size: file.size, storage_path: path }
    })

    // Upload file to Storage
    const { error: upErr } = await admin.storage
      .from('invoices')
      .upload(path, file, { contentType: 'application/pdf', upsert: false, metadata: { customer_id: customerId, actor_user_id: actorUserId } as any })
    if (upErr) {
      await logAudit({ event: 'invoice_upload_failed', entity: 'invoice', level: 'error', customer_id: customerId, actor_user_id: actorUserId, meta: { step: 'upload', error: upErr.message } })
      throw new HttpError(500, `Storage upload failed: ${upErr.message}`)
    }

    // Insert invoice row (pending)
    const { error: insErr } = await admin
      .from('invoices')
      .insert({ id: invoiceId, customer_id: customerId, status: 'pending', storage_object_path: path })
    if (insErr) {
      // best-effort cleanup of uploaded file
      await admin.storage.from('invoices').remove([path]).catch(() => {})
      await logAudit({ event: 'invoice_upload_failed', entity: 'invoice', level: 'error', customer_id: customerId, actor_user_id: actorUserId, meta: { step: 'insert', error: insErr.message } })
      throw new HttpError(500, `DB insert failed: ${insErr.message}`)
    }

    await logAudit({ event: 'invoice_upload_success', entity: 'invoice', entity_id: invoiceId, customer_id: customerId, actor_user_id: actorUserId, meta: { storage_path: path } })

    return new Response(JSON.stringify({ invoice_id: invoiceId, storage_path: path }), {
      status: 201,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    })
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof HttpError ? err.message : 'Internal server error'
    if (!(err instanceof HttpError)) {
      await logAudit({ event: 'invoice_upload_failed', entity: 'invoice', level: 'error', meta: { step: 'unhandled', error: String(err?.message || err) } })
    }
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    })
  }
}
