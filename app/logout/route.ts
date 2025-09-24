import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = supabaseRoute()
  await supabase.auth.signOut()
  const url = new URL('/login', process.env.NEXT_PUBLIC_APP_URL || req.url)
  return NextResponse.redirect(url)
}

export async function POST(req: Request) {
  return GET(req)
}
