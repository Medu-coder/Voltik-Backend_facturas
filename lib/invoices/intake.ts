import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/supabase'
import { ensureCustomer } from '@/lib/customers'
import { persistInvoicePdf, InvoicePersistError } from '@/lib/invoices/upload'
import { logAudit, type LogAuditParams } from '@/lib/logger'
import { HttpError } from '@/lib/supabase'

export type IntakeEventMap = {
  received?: string
  customerError?: string
  failure?: string
  success?: string
}

export type IntakeParams = {
  admin: SupabaseClient<Database, 'core'>
  file: Blob | File | ArrayBuffer | Uint8Array
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  actorUserId: string
  bucket?: string
  issuedAt?: Date
  events?: IntakeEventMap
  customer?: Database['core']['Tables']['customers']['Row']
}

export type IntakeResult = {
  invoiceId: string
  storagePath: string
  customerId: string
  customer: Database['core']['Tables']['customers']['Row']
}

function resolveEvent(events: IntakeEventMap | undefined, key: keyof IntakeEventMap, fallback: string): string {
  return events?.[key] ?? fallback
}

async function logEvent(event: string | undefined, payload: Omit<LogAuditParams, 'event'>): Promise<void> {
  if (!event) return
  await logAudit({ event, ...payload })
}

export async function ingestInvoiceSubmission(params: IntakeParams): Promise<IntakeResult> {
  const {
    admin,
    file,
    customerName,
    customerEmail,
    customerPhone,
    actorUserId,
    bucket,
    issuedAt,
    events,
    customer: providedCustomer,
  } = params

  const receivedEvent = resolveEvent(events, 'received', 'invoice_intake_received')
  const customerErrorEvent = resolveEvent(events, 'customerError', 'invoice_intake_customer_error')
  const failureEvent = resolveEvent(events, 'failure', 'invoice_intake_failed')
  const successEvent = resolveEvent(events, 'success', 'invoice_intake_success')

  await logEvent(receivedEvent, {
    entity: 'customer',
    actor_user_id: actorUserId,
    meta: { email: customerEmail.trim().toLowerCase() },
  })

  let customer = providedCustomer
  if (!customer) {
    try {
      customer = await ensureCustomer(admin, {
        name: customerName,
        email: customerEmail,
        userId: actorUserId,
        mobilePhone: customerPhone ?? null,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Customer resolution failed'
      await logEvent(customerErrorEvent, {
        entity: 'customer',
        level: 'error',
        actor_user_id: actorUserId,
        meta: { message, email: customerEmail },
      })
      throw new HttpError(400, message || 'Customer resolution failed')
    }
  }

  if (!customer) {
    throw new HttpError(500, 'Customer resolution failed')
  }

  try {
    const { invoiceId, storagePath } = await persistInvoicePdf({
      admin,
      file,
      customerId: customer.id,
      customerEmail: customer.email || customerEmail,
      actorUserId,
      bucket,
      issuedAt,
    })

    await logEvent(successEvent, {
      entity: 'invoice',
      entity_id: invoiceId,
      customer_id: customer.id,
      actor_user_id: actorUserId,
      meta: { path: storagePath },
    })

    return { invoiceId, storagePath, customerId: customer.id, customer }
  } catch (err: unknown) {
    if (err instanceof InvoicePersistError) {
      await logEvent(failureEvent, {
        entity: err.step === 'upload' ? 'storage' : 'invoice',
        level: 'error',
        entity_id: err.invoiceId,
        customer_id: customer.id,
        actor_user_id: actorUserId,
        meta: {
          step: err.step,
          error: err.message,
          storage_path: err.storagePath,
        },
      })
      throw new HttpError(500, err.message)
    }

    const message = err instanceof Error ? err.message : 'Unknown error'
    await logEvent(failureEvent, {
      entity: 'system',
      level: 'error',
      customer_id: customer.id,
      actor_user_id: actorUserId,
      meta: { error: message },
    })
    throw err
  }
}
