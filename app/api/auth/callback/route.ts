import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')

  const origin = process.env.NEXT_PUBLIC_APP_URL || `${requestUrl.protocol}//${requestUrl.host}`

  if (!code) {
    return NextResponse.redirect(new URL('/login', origin))
  }

  // Para recuperación de contraseña, redirigir a una página de cambio de contraseña
  const redirectUrl = type === 'recovery' 
    ? new URL('/reset-password', origin)
    : new URL('/dashboard', origin)

  const response = NextResponse.redirect(redirectUrl)
  const cookieStore = cookies()

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.delete({ name, ...options })
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('Supabase exchangeCodeForSession error', error)
    return NextResponse.redirect(new URL('/login', origin))
  }

  return response
}
