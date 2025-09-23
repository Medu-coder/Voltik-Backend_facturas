import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function parseBearer(h?: string | null) {
  if (!h) return null
  const [scheme, token] = h.split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null
  return token
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseRoute()
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  const bearer = parseBearer(authHeader)
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL))
  const role = (user.app_metadata as any)?.role
  const adminEmails = (process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
  const isAdmin = role === 'admin' || (user.email && adminEmails.includes(user.email.toLowerCase()))
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch invoice and ensure ownership via customers table
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: 'core' } })
  const { data: inv, error } = await admin
    .from('invoices')
    .select('id, customer_id, storage_object_path')
    .eq('id', params.id)
    .single()
  if (error || !inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const bucket = process.env.STORAGE_INVOICES_BUCKET || 'invoices'
  const ttl = Number(process.env.STORAGE_SIGNED_URL_TTL_SECS || '120')

  // reutiliza el mismo cliente admin (sirve tanto para DB como Storage)
  const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUrl(inv.storage_object_path, ttl)
  if (signErr || !signed) return NextResponse.json({ error: signErr?.message || 'Sign error' }, { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}
