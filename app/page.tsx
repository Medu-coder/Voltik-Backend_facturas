import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

export default async function Home() {
  const { data: { session } } = await supabaseServer().auth.getSession()
  if (session) redirect('/dashboard')
  redirect('/login')
}

