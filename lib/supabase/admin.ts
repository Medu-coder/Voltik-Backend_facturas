// Server-only admin client using service role key
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/supabase'

export function supabaseAdmin(): SupabaseClient<Database, 'core'> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient<Database, 'core'>(url, serviceKey, { db: { schema: 'core' } })
}
