import type { User } from '@supabase/supabase-js'
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

function hasAdminRole(user: User | null): boolean {
  const metadata = user?.app_metadata as Record<string, unknown> | undefined
  const role = typeof metadata?.role === 'string' ? metadata.role : undefined
  const isAdminFlag = typeof metadata?.admin === 'boolean' ? metadata.admin : false
  return role === 'admin' || isAdminFlag
}

export async function requireAdmin() {
  const supabase = supabaseServer()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  if (!isAdminUser(user)) redirect('/login')
  return user
}

export async function getAdminSession() {
  const supabase = supabaseServer()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return isAdminUser(user) ? user : null
}

export function isAdminUser(user: User | null): boolean {
  if (!user) return false
  return hasAdminRole(user) || isAdminEmail(user.email)
}
