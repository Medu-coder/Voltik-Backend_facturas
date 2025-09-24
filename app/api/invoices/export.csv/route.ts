import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function parseBearer(h?: string | null) {
  if (!h) return null
  const [scheme, token] = h.split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null
  return token
}

export async function GET(req: Request) {
  const supabase = supabaseRoute()
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  const bearer = parseBearer(authHeader)
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (user.app_metadata as any)?.role
  const adminEmails = (process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
  const isAdmin = role === 'admin' || (user.email && adminEmails.includes(user.email.toLowerCase()))
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') || '1900-01-01'
  const to = searchParams.get('to') || '2999-12-31'

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: 'core' } })
  const { data, error } = await admin
    .from('invoices')
    .select('id, customer_id, billing_start_date, billing_end_date, status, total_amount_eur, customer:customer_id (name, email)')
    .gte('billing_start_date', from)
    .lte('billing_end_date', to)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []).map(r => ({
    id: r.id,
    customer: (r as any).customer?.name || (r as any).customer?.email || r.customer_id,
    date_start: (r as any).billing_start_date,
    date_end: (r as any).billing_end_date,
    status: r.status,
    total: (r as any).total_amount_eur ?? '',
  }))
  const header = ['id','customer','date_start','date_end','status','total']
  const csv = [header.join(','), ...rows.map(r => [r.id, q(r.customer), r.date_start, r.date_end, r.status, r.total].join(','))].join('\n')

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="invoices_${from}_${to}.csv"`,
    }
  })
}

function q(v: any) {
  if (v == null) return ''
  const s = String(v).replace(/"/g, '""')
  return `"${s}"`
}
