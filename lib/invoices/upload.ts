import type { SupabaseClient } from '@supabase/supabase-js'
import { buildInvoiceStoragePath } from '@/lib/storage'
import type { Database } from '@/lib/types/supabase'

export class InvoicePersistError extends Error {
  step: 'upload' | 'insert'
  invoiceId: string
  storagePath: string
  constructor(step: 'upload' | 'insert', message: string, invoiceId: string, storagePath: string) {
    super(message)
    this.name = 'InvoicePersistError'
    this.step = step
    this.invoiceId = invoiceId
    this.storagePath = storagePath
  }
}

export type InvoicePersistParams = {
  admin: SupabaseClient<Database, 'core'>
  file: Blob | File | ArrayBuffer | Uint8Array
  customerId: string
  customerEmail: string
  actorUserId: string
  bucket?: string
  invoiceId?: string
  issuedAt?: Date
}

export type InvoicePersistResult = {
  invoiceId: string
  storagePath: string
}

function isUint8Array(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer
}

async function toUint8Array(source: Blob | File | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (isUint8Array(source)) return source
  if (isArrayBuffer(source)) return new Uint8Array(source)
  const arrayBuffer = await source.arrayBuffer()
  return new Uint8Array(arrayBuffer)
}

export async function persistInvoicePdf(params: InvoicePersistParams): Promise<InvoicePersistResult> {
  const bucket = params.bucket || process.env.STORAGE_INVOICES_BUCKET || 'invoices'
  const invoiceId = params.invoiceId || crypto.randomUUID()
  const { path } = buildInvoiceStoragePath(invoiceId, params.customerEmail, params.issuedAt)
  const binary = await toUint8Array(params.file)

  const { error: uploadError } = await params.admin.storage.from(bucket).upload(path, binary, {
    contentType: 'application/pdf',
    upsert: false,
    metadata: {
      customer_id: params.customerId,
      actor_user_id: params.actorUserId,
    },
  })
  if (uploadError) {
    throw new InvoicePersistError('upload', uploadError.message, invoiceId, path)
  }

  const insertPayload: Database['core']['Tables']['invoices']['Insert'] = {
    id: invoiceId,
    customer_id: params.customerId,
    storage_object_path: path,
    status: 'pending',
  }

  const { error: insertError } = await params.admin.from('invoices').insert(insertPayload)
  if (insertError) {
    await params.admin.storage.from(bucket).remove([path]).catch(() => {})
    throw new InvoicePersistError('insert', insertError.message, invoiceId, path)
  }

  return { invoiceId, storagePath: path }
}
