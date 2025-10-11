import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/supabase'
import { buildOfferStoragePath } from '@/lib/storage'
import { logAudit } from '@/lib/logger'

export class OfferPersistError extends Error {
  constructor(
    message: string,
    public step: 'validation' | 'upload' | 'insert',
    public offerId?: string,
    public storagePath?: string
  ) {
    super(message)
    this.name = 'OfferPersistError'
  }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

function validateFile(file: Blob | File | ArrayBuffer | Uint8Array): void {
  if (file instanceof File) {
    if (file.type !== 'application/pdf') {
      throw new OfferPersistError('File must be a PDF', 'validation')
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new OfferPersistError('File too large (max 10MB)', 'validation')
    }
  } else if (file instanceof Blob) {
    if (file.type !== 'application/pdf') {
      throw new OfferPersistError('File must be a PDF', 'validation')
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new OfferPersistError('File too large (max 10MB)', 'validation')
    }
  }
}

function validateProviderName(providerName: string): void {
  const trimmed = (providerName || '').trim()
  if (!trimmed) {
    throw new OfferPersistError('Provider name is required', 'validation')
  }
  if (trimmed.length > 100) {
    throw new OfferPersistError('Provider name too long (max 100 characters)', 'validation')
  }
}

export type PersistOfferPdfParams = {
  admin: SupabaseClient<Database, 'core'>
  file: Blob | File | ArrayBuffer | Uint8Array
  invoiceId: string
  providerName: string
  actorUserId: string
  bucket?: string
}

export type PersistOfferPdfResult = {
  offerId: string
  storagePath: string
}

export async function persistOfferPdf(params: PersistOfferPdfParams): Promise<PersistOfferPdfResult> {
  const { admin, file, invoiceId, providerName, actorUserId, bucket = 'offers' } = params

  // Validaciones
  validateFile(file)
  validateProviderName(providerName)

  // Verificar que la factura existe
  const { data: invoice, error: invoiceError } = await admin
    .from('invoices')
    .select('id, customer_id')
    .eq('id', invoiceId)
    .single()

  if (invoiceError || !invoice) {
    throw new OfferPersistError(`Invoice ${invoiceId} not found`, 'validation')
  }

  // Generar IDs y rutas
  const offerId = crypto.randomUUID()
  const { path: storagePath } = buildOfferStoragePath(invoiceId, offerId)

  // Subir archivo a Storage
  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(storagePath, file, {
      contentType: 'application/pdf',
      metadata: {
        invoice_id: invoiceId,
        offer_id: offerId,
        actor_user_id: actorUserId,
        provider_name: providerName.trim(),
        uploaded_at: new Date().toISOString(),
      },
    })

  if (uploadError) {
    throw new OfferPersistError(
      `Storage upload failed: ${uploadError.message}`,
      'upload',
      offerId,
      storagePath
    )
  }

  // Insertar registro en base de datos
  const { error: insertError } = await admin
    .from('offers')
    .insert({
      id: offerId,
      invoice_id: invoiceId,
      provider_name: providerName.trim(),
      storage_object_path: storagePath,
    })

  if (insertError) {
    // Rollback: eliminar archivo de Storage
    await admin.storage.from(bucket).remove([storagePath])
    
    throw new OfferPersistError(
      `Database insert failed: ${insertError.message}`,
      'insert',
      offerId,
      storagePath
    )
  }

  // Registrar evento de auditoría
  await logAudit({
    event: 'offer_upload_success',
    entity: 'offer',
    entity_id: offerId,
    customer_id: invoice.customer_id,
    actor_user_id: actorUserId,
    meta: {
      invoice_id: invoiceId,
      provider_name: providerName.trim(),
      storage_path: storagePath,
      file_size: file instanceof File ? file.size : file instanceof Blob ? file.size : 'unknown',
    },
  })

  return { offerId, storagePath }
}
