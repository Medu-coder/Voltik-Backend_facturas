import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { ensureCustomer } from '@/lib/customers'
import { buildInvoiceStoragePath } from '@/lib/storage'

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
  const adminEmails = (process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
  const role = (user?.app_metadata as any)?.role
  const isAdminUser = !!user && (role === 'admin' || (user.email && adminEmails.includes(user.email.toLowerCase())))
  const isInternal = secret && internalKey === secret
  if (!user && !isInternal) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user && !isAdminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const actingUserId = user?.id || process.env.ADMIN_USER_ID || 'admin'

  const form = await req.formData()
  const file = form.get('file') as File | null
  const customer_name = String(form.get('customer_name') || '')
  const customer_email = String(form.get('customer_email') || '')
  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (!customer_name.trim()) return NextResponse.json({ error: 'Missing customer_name' }, { status: 400 })
  if (!customer_email.trim()) return NextResponse.json({ error: 'Missing customer_email' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Invalid mime' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Too large' }, { status: 400 })

  const invoiceId = crypto.randomUUID()


  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const bucket = process.env.STORAGE_INVOICES_BUCKET || 'invoices'

  const admin = createClient(url, serviceKey, { db: { schema: 'core' } })

  let customer
  try {
    customer = await ensureCustomer(admin, { name: customer_name, email: customer_email, userId: actingUserId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Customer resolution failed' }, { status: 400 })
  }

  const { path } = buildInvoiceStoragePath(invoiceId, customer.email || customer_email)

  const arrayBuffer = await file.arrayBuffer()
  const { error: upErr } = await admin.storage.from(bucket).upload(path, new Uint8Array(arrayBuffer), {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { error: insErr } = await admin.from('invoices').insert({
    id: invoiceId,
    customer_id: customer.id,
    storage_object_path: path,
    status: 'pending',
  })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: invoiceId })
}
