import 'server-only'

import { getAdminClient } from './supabase'

export type LogLevel = 'info' | 'warn' | 'error'

export type LogAuditParams = {
  event: string
  entity: 'invoice' | 'customer' | 'system' | 'storage'
  entity_id?: string | null
  customer_id?: string | null
  actor_user_id?: string | null
  actor_role?: string | null
  level?: LogLevel
  meta?: unknown
}

function toMeta(meta: unknown): any | null {
  if (meta == null) return null
  if (typeof meta === 'string') return { message: meta }
  if (typeof meta === 'object') return meta as any
  return { value: String(meta) }
}

/**
 * Inserts an audit log row into core.audit_logs using the service role client.
 * Never throws; failures are swallowed to avoid impacting request flow.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const supabase = getAdminClient()
    const payload: any = {
      event: params.event,
      entity: params.entity,
      entity_id: params.entity_id ?? null,
      customer_id: params.customer_id ?? null,
      actor_user_id: params.actor_user_id ?? null,
      actor_role: params.actor_role ?? null,
      level: params.level ?? 'info',
      meta: toMeta(params.meta),
    }
    const { error } = await supabase.from('audit_logs').insert(payload)
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[audit_logs] insert error', error)
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[audit_logs] unexpected error', err)
  }
}
