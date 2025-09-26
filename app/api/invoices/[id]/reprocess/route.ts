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

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseRoute()
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  const bearer = parseBearer(authHeader)
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminUser(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = supabaseAdmin()
  type InvoiceOwner = Pick<Database['core']['Tables']['invoices']['Row'], 'id' | 'customer_id'>
  // Ensure ownership via customer
  const { data: inv, error } = await admin
    .from('invoices')
    .select('id, customer_id')
    .eq('id', params.id)
    .single<InvoiceOwner>()
  if (error || !inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await admin.from('invoices').update({ status: 'reprocess' }).eq('id', params.id)

  const baseUrl = resolveBaseUrl(req)
  return NextResponse.redirect(new URL(`/invoices/${params.id}`, baseUrl))
}
