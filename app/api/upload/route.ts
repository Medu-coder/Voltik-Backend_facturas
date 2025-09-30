import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/auth'
import { ingestInvoiceSubmission } from '@/lib/invoices/intake'
import { HttpError } from '@/lib/supabase'

function parseBearer(h?: string | null) {
  if (!h) return null
  const [scheme, token] = h.split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null
  return token
}

export async function POST(req: Request) {
  const supabase = supabaseRoute()
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  const bearer = parseBearer(authHeader)
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  const internalKey = req.headers.get('x-internal-key') || req.headers.get('X-INTERNAL-KEY')
  const secret = process.env.INTERNAL_API_SECRET
  const isInternal = secret && internalKey === secret
  if (!user && !isInternal) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user && !isAdminUser(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const actingUserId = user?.id || process.env.ADMIN_USER_ID || 'admin'

  const form = await req.formData()
  const file = form.get('file') as File | null
  const customer_name = String(form.get('customer_name') || '')
  const customer_email = String(form.get('customer_email') || '')
  const customer_phone_raw = form.get('customer_phone')
  const customer_phone = typeof customer_phone_raw === 'string' ? customer_phone_raw : ''
  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (!customer_name.trim()) return NextResponse.json({ error: 'Missing customer_name' }, { status: 400 })
  if (!customer_email.trim()) return NextResponse.json({ error: 'Missing customer_email' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Invalid mime' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Too large' }, { status: 400 })

  const bucket = process.env.STORAGE_INVOICES_BUCKET || 'invoices'

  const admin = supabaseAdmin()

  try {
    const { invoiceId } = await ingestInvoiceSubmission({
      admin,
      file,
      customerName: customer_name,
      customerEmail: customer_email,
      customerPhone: customer_phone,
      actorUserId: actingUserId,
      bucket,
      events: {
        received: 'invoice_upload_received',
        customerError: 'invoice_upload_customer_error',
        failure: 'invoice_upload_failed',
        success: 'invoice_upload_success',
      },
    })

    return NextResponse.json({ ok: true, id: invoiceId })
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof Error) {
      // eslint-disable-next-line no-console
      console.error('[api/upload] unexpected error', err)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
