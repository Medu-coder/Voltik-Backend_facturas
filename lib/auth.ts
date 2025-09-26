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

function hasAdminRole(user: any): boolean {
  const role = user?.app_metadata?.role
  const isAdminFlag = user?.app_metadata?.admin
  return role === 'admin' || isAdminFlag === true
}

export async function requireAdmin() {
  const supabase = supabaseServer()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  const email = user.email
  if (!hasAdminRole(user) && !isAdminEmail(email)) {
    redirect('/login')
  }
  return user
}

export async function getAdminSession() {
  const supabase = supabaseServer()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const email = user.email
  if (!hasAdminRole(user) && !isAdminEmail(email)) return null

  return user
}
