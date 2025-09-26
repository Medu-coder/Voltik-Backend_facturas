import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = supabaseServer()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (!error && user) {
    redirect('/dashboard')
  }
  redirect('/login')
}
