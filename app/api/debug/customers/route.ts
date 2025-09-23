import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

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
  const adminEmails = (process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
  const role = (user.app_metadata as any)?.role
  const isAdmin = role === 'admin' || (user.email && adminEmails.includes(user.email.toLowerCase()))
  if (!isAdmin) return ok({ error: 'Forbidden' }, 403)

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: 'core' } })
  const { data, error } = await admin.from('customers').select('id,name,email').order('created_at', { ascending: true })
  if (error) return ok({ error: error.message }, 500)
  return ok({ items: data || [] })
}
