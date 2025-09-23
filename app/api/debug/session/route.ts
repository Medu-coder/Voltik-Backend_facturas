import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'

function ok<T>(data: T, init: number | ResponseInit = 200) {
  return new NextResponse(JSON.stringify(data, null, 2), { status: typeof init === 'number' ? init : 200, headers: { 'content-type': 'application/json; charset=utf-8' }, ...(typeof init === 'object' ? init : {}) })
}

export async function GET(req: Request) {
  // Dev-only helper to fetch current session access_token for local testing
  if (process.env.NODE_ENV !== 'development') {
    return ok({ error: 'Not available in production' }, 404)
  }

  const secret = process.env.INTERNAL_API_SECRET
  const url = new URL(req.url)
  const key = req.headers.get('x-internal-key') || req.headers.get('X-Internal-Key') || url.searchParams.get('key')
  if (!secret || !key || key !== secret) {
    return ok({ error: 'Forbidden' }, 403)
  }

  const supabase = supabaseRoute()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return ok({ error: 'No session' }, 401)
  const { access_token, refresh_token, user } = session
  return ok({ access_token, refresh_token, user })
}

