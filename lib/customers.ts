import type { Database } from '@/lib/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

type EnsureCustomerInput = {
  name: string
  email: string
  userId?: string | null
  mobilePhone?: string | null
}

type CustomerRow = Database['core']['Tables']['customers']['Row']
type CustomerInsert = Database['core']['Tables']['customers']['Insert']

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function normalizePhone(phone?: string | null): string | null {
  const candidate = (phone ?? '').trim()
  return candidate.length > 0 ? candidate : null
}

export async function ensureCustomer(
  admin: SupabaseClient<Database, 'core'>,
  { name, email, userId, mobilePhone }: EnsureCustomerInput
): Promise<CustomerRow> {
  const trimmedName = name?.trim() || ''
  const normalizedEmail = normalizeEmail(email || '')
  const normalizedMobilePhone = normalizePhone(mobilePhone)
  if (!trimmedName) throw new Error('Customer name is required')
  if (!normalizedEmail) throw new Error('Customer email is required')

  const { data: matches, error: searchErr } = await admin
    .from('customers')
    .select('id, user_id, name, email, mobile_phone, is_active, created_at, updated_at')
    .eq('email', normalizedEmail)
  if (searchErr) throw new Error(`Customer lookup failed: ${searchErr.message}`)

  const normalizedName = trimmedName.toLowerCase()
  const rows: CustomerRow[] = matches ?? []
  const existing = rows.find((row) => (row.name || '').trim().toLowerCase() === normalizedName)
  if (existing) {
    if (normalizedMobilePhone && (existing.mobile_phone || null) !== normalizedMobilePhone) {
      const { data: updated, error: updateErr } = await admin
        .from('customers')
        .update({ mobile_phone: normalizedMobilePhone })
        .eq('id', existing.id)
        .select('id, user_id, name, email, mobile_phone, is_active, created_at, updated_at')
        .single<CustomerRow>()
      if (updateErr) throw new Error(`Customer update failed: ${updateErr.message}`)
      return (updated as CustomerRow) || { ...existing, mobile_phone: normalizedMobilePhone }
    }
    return existing
  }

  const fallbackUserId = userId || process.env.ADMIN_USER_ID || null
  if (!fallbackUserId) {
    throw new Error('Missing ADMIN_USER_ID env var to create customers')
  }

  const insertPayload: CustomerInsert = {
    name: trimmedName,
    email: normalizedEmail,
    user_id: fallbackUserId,
    mobile_phone: normalizedMobilePhone,
  }

  const { data: created, error: insertErr } = await admin
    .from('customers')
    .insert(insertPayload)
    .select('id, user_id, name, email, mobile_phone, is_active, created_at, updated_at')
    .single<CustomerRow>()
  if (insertErr) throw new Error(`Customer creation failed: ${insertErr.message}`)
  if (!created) throw new Error('Customer creation failed: no row returned')
  return created
}
