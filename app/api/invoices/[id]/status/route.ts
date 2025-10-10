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

const VALID_STATUSES = ['Pendiente', 'Ofertada', 'Tramitando', 'Contratando', 'Cancelado', 'Contratado']

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseRoute()
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  const bearer = parseBearer(authHeader)
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminUser(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Obtener nuevo estado del body (formulario HTML)
  const formData = await req.formData()
  const new_status = formData.get('new_status') as string
  
  if (!new_status || !VALID_STATUSES.includes(new_status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  type InvoiceOwner = Pick<Database['core']['Tables']['invoices']['Row'], 'id' | 'customer_id' | 'status'>
  
  // Obtener factura actual para verificar existencia y estado anterior
  const { data: inv, error } = await admin
    .from('invoices')
    .select('id, customer_id, status')
    .eq('id', params.id)
    .single<InvoiceOwner>()
  
  if (error || !inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Actualizar estado
  const { error: updateError } = await admin
    .from('invoices')
    .update({ status: new_status })
    .eq('id', params.id)
  
  if (updateError) {
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }

  // Registrar cambio en audit_logs
  await admin.from('audit_logs').insert({
    event: 'invoice_status_changed',
    entity: 'invoice',
    entity_id: params.id,
    level: 'info',
    actor_user_id: user.id,
    meta: {
      from_status: inv.status,
      to_status: new_status,
      changed_at: new Date().toISOString()
    }
  })

  const baseUrl = resolveBaseUrl(req)
  return NextResponse.redirect(new URL(`/invoices/${params.id}`, baseUrl))
}
