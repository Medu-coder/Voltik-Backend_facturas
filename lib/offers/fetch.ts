import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/supabase'
import { logAudit } from '@/lib/logger'

export type OfferRow = Database['core']['Tables']['offers']['Row']

export async function fetchOffersByInvoiceId(
  admin: SupabaseClient<Database, 'core'>,
  invoiceId: string
): Promise<OfferRow[]> {
  const { data, error } = await admin
    .from('offers')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch offers: ${error.message}`)
  }

  return data || []
}

export async function fetchOfferById(
  admin: SupabaseClient<Database, 'core'>,
  offerId: string
): Promise<OfferRow | null> {
  const { data, error } = await admin
    .from('offers')
    .select('*')
    .eq('id', offerId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null
    }
    throw new Error(`Failed to fetch offer: ${error.message}`)
  }

  return data
}

export async function deleteOffer(
  admin: SupabaseClient<Database, 'core'>,
  offerId: string,
  actorUserId: string,
  bucket: string = 'offers'
): Promise<void> {
  // Primero obtener los datos de la oferta para auditoría
  const offer = await fetchOfferById(admin, offerId)
  if (!offer) {
    throw new Error(`Offer ${offerId} not found`)
  }

  // Eliminar archivo de Storage
  const { error: storageError } = await admin.storage
    .from(bucket)
    .remove([offer.storage_object_path])

  if (storageError) {
    // Log error pero continuar con la eliminación de DB
    await logAudit({
      event: 'offer_delete_storage_error',
      entity: 'storage',
      level: 'warn',
      actor_user_id: actorUserId,
      meta: {
        offer_id: offerId,
        storage_path: offer.storage_object_path,
        error: storageError.message,
      },
    })
  }

  // Eliminar registro de base de datos
  const { error: deleteError } = await admin
    .from('offers')
    .delete()
    .eq('id', offerId)

  if (deleteError) {
    throw new Error(`Failed to delete offer from database: ${deleteError.message}`)
  }

  // Registrar evento de auditoría
  await logAudit({
    event: 'offer_deleted',
    entity: 'offer',
    entity_id: offerId,
    actor_user_id: actorUserId,
    meta: {
      invoice_id: offer.invoice_id,
      provider_name: offer.provider_name,
      storage_path: offer.storage_object_path,
      storage_deleted: !storageError,
    },
  })
}

export async function fetchOffersCountByInvoiceId(
  admin: SupabaseClient<Database, 'core'>,
  invoiceId: string
): Promise<number> {
  const { count, error } = await admin
    .from('offers')
    .select('*', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId)

  if (error) {
    throw new Error(`Failed to count offers: ${error.message}`)
  }

  return count || 0
}
