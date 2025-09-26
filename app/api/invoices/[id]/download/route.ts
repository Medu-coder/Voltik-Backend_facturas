import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/auth'
import type { Database } from '@/lib/types/supabase'

function parseBearer(h?: string | null) {
  if (!h) return null
  const [scheme, token] = h.split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null
  return token
}

function resolveBaseUrl(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromEnv) return fromEnv
  const current = new URL(req.url)
  return `${current.protocol}//${current.host}`
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseRoute()
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  const bearer = parseBearer(authHeader)
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  const baseUrl = resolveBaseUrl(req)
  if (!user) return NextResponse.redirect(new URL('/login', baseUrl))
  if (!isAdminUser(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch invoice and ensure ownership via customers table
  type InvoiceMinimal = Pick<Database['core']['Tables']['invoices']['Row'], 'id' | 'customer_id' | 'storage_object_path'>

  const admin = supabaseAdmin()
  const { data: inv, error } = await admin
    .from('invoices')
    .select('id, customer_id, storage_object_path')
    .eq('id', params.id)
    .single<InvoiceMinimal>()
  if (error || !inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const bucket = process.env.STORAGE_INVOICES_BUCKET || 'invoices'
  const ttl = Number(process.env.STORAGE_SIGNED_URL_TTL_SECS || '120')

  // reutiliza el mismo cliente admin (sirve tanto para DB como Storage)
  const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUrl(inv.storage_object_path, ttl)
  if (signErr || !signed) return NextResponse.json({ error: signErr?.message || 'Sign error' }, { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}
