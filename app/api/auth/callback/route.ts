import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = supabaseRoute()
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  } else {
    // Fallback for helper versions that accept full URL
    // @ts-expect-error – compatible en versiones recientes
    await supabase.auth.exchangeCodeForSession(req.url)
  }
  return NextResponse.redirect(new URL('/dashboard', process.env.NEXT_PUBLIC_APP_URL))
}
