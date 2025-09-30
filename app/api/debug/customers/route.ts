import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/auth'

function ok<T>(data: T, status = 200) {
  return new NextResponse(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

function parseBearer(h?: string | null) {
  if (!h) return null
  const [scheme, token] = (h || '').split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null
  return token
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== 'development') return ok({ error: 'Not available' }, 404)

  const supabase = supabaseRoute()
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  const bearer = parseBearer(authHeader)
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  if (!user) return ok({ error: 'Unauthorized' }, 401)
  if (!isAdminUser(user)) return ok({ error: 'Forbidden' }, 403)

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('customers')
    .select('id,name,email,mobile_phone')
    .order('created_at', { ascending: true })
  if (error) return ok({ error: error.message }, 500)
  return ok({ items: data || [] })
}
