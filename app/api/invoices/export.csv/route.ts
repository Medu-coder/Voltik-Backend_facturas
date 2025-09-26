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

export async function GET(req: Request) {
  const supabase = supabaseRoute()
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  const bearer = parseBearer(authHeader)
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminUser(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') || '1900-01-01'
  const to = searchParams.get('to') || '2999-12-31'

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('invoices')
    .select('id, customer_id, billing_start_date, billing_end_date, status, total_amount_eur, customer:customer_id (name, email)')
    .gte('billing_start_date', from)
    .lte('billing_end_date', to)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type InvoiceWithCustomer = Database['core']['Tables']['invoices']['Row'] & {
    customer?: Pick<Database['core']['Tables']['customers']['Row'], 'name' | 'email' | 'id'> | null
  }

  const rows = (data ?? []).map((row) => {
    const invoice = row as InvoiceWithCustomer
    const customerName = invoice.customer?.name
    const customerEmail = invoice.customer?.email
    const customerIdentifier = customerName || customerEmail || invoice.customer_id || ''
    return {
      id: invoice.id,
      customer: customerIdentifier,
      date_start: invoice.billing_start_date,
      date_end: invoice.billing_end_date,
      status: invoice.status,
      total: invoice.total_amount_eur ?? '',
    }
  })
  const header = ['id','customer','date_start','date_end','status','total']
  const csv = [header.join(','), ...rows.map(r => [r.id, q(r.customer), r.date_start, r.date_end, r.status, r.total].join(','))].join('\n')

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="invoices_${from}_${to}.csv"`,
    }
  })
}

function q(value: unknown): string {
  if (value == null) return ''
  const s = String(value).replace(/"/g, '""')
  return `"${s}"`
}
