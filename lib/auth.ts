import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false
  const fromEnv = process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS
  if (!fromEnv) return false
  const allowed = fromEnv
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(email.toLowerCase())
}

function hasAdminRole(session: any): boolean {
  const role = session?.user?.app_metadata?.role
  const isAdminFlag = session?.user?.app_metadata?.admin
  return role === 'admin' || isAdminFlag === true
}

export async function requireAdmin() {
  const supabase = supabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const email = session.user?.email
  if (!hasAdminRole(session) && !isAdminEmail(email)) {
    redirect('/login')
  }
  return session
}

export async function getAdminSession() {
  const supabase = supabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const email = session.user?.email
  if (!hasAdminRole(session) && !isAdminEmail(email)) return null
  return session
}
