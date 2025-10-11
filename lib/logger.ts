import 'server-only'

import { getAdminClient } from './supabase'
import type { Database, Json } from '@/lib/types/supabase'

export type LogLevel = 'info' | 'warn' | 'error'

export type LogAuditParams = {
  event: string
  entity: 'invoice' | 'customer' | 'system' | 'storage' | 'offer'
  entity_id?: string | null
  customer_id?: string | null
  actor_user_id?: string | null
  actor_role?: string | null
  level?: LogLevel
  meta?: unknown
}

type AuditLogInsert = Database['core']['Tables']['audit_logs']['Insert']

function toJson(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJson(item))
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, toJson(val)] as const)
    return Object.fromEntries(entries)
  }
  return String(value)
}

function toMeta(meta: unknown): AuditLogInsert['meta'] {
  if (meta == null) return null
  return toJson(meta)
}

/**
 * Inserts an audit log row into core.audit_logs using the service role client.
 * Never throws; failures are swallowed to avoid impacting request flow.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const supabase = getAdminClient()
    const payload: AuditLogInsert = {
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
