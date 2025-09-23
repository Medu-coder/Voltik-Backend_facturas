import { SupabaseClient } from '@supabase/supabase-js'

type EnsureCustomerInput = {
  name: string
  email: string
  userId?: string | null
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function ensureCustomer(
  admin: SupabaseClient,
  { name, email, userId }: EnsureCustomerInput
) {
  const trimmedName = name?.trim() || ''
  const normalizedEmail = normalizeEmail(email || '')
  if (!trimmedName) throw new Error('Customer name is required')
  if (!normalizedEmail) throw new Error('Customer email is required')

  const { data: existing, error: searchErr } = await admin
    .from('customers')
    .select('id, name, email, user_id')
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (searchErr) throw new Error(`Customer lookup failed: ${searchErr.message}`)
  if (existing) {
    if (existing.name !== trimmedName) {
      await admin.from('customers').update({ name: trimmedName }).eq('id', existing.id)
      existing.name = trimmedName
    }
    return existing
  }

  const fallbackUserId = userId || process.env.ADMIN_USER_ID || null
  if (!fallbackUserId) {
    throw new Error('Missing ADMIN_USER_ID env var to create customers')
  }

  const insertPayload = {
    name: trimmedName,
    email: normalizedEmail,
    user_id: fallbackUserId,
  }

  const { data: created, error: insertErr } = await admin
    .from('customers')
    .insert(insertPayload)
    .select('id, name, email, user_id')
    .single()
  if (insertErr) throw new Error(`Customer creation failed: ${insertErr.message}`)
  return created
}

