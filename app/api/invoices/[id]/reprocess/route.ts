import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function parseBearer(h?: string | null) {
  if (!h) return null
  const [scheme, token] = h.split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null
  return token
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseRoute()
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  const bearer = parseBearer(authHeader)
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (user.app_metadata as any)?.role
  const adminEmails = (process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
  const isAdmin = role === 'admin' || (user.email && adminEmails.includes(user.email.toLowerCase()))
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: 'core' } })
  // Ensure ownership via customer
  const { data: inv, error } = await admin
    .from('invoices')
    .select('id, customer_id')
    .eq('id', params.id)
    .single()
  if (error || !inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await admin.from('invoices').update({ status: 'reprocess' }).eq('id', params.id)

  return NextResponse.redirect(new URL(`/invoices/${params.id}`, process.env.NEXT_PUBLIC_APP_URL))
}
