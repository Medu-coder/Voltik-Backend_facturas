// Next.js server-only module: Supabase clients and auth helpers
import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/supabase'
import { jwtVerify, type JWTPayload } from 'jose'

// Lightweight HTTP error for guards
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

type CoreClient = SupabaseClient<Database, 'core'>
type PublicClient = SupabaseClient<Database>

let _adminClient: CoreClient | null = null
let _anonClient: PublicClient | null = null

export function getAdminClient(): CoreClient {
  if (_adminClient) return _adminClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  }
  _adminClient = createClient<Database, 'core'>(url, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'core' }
  })
  return _adminClient
}

export function getBrowserClient(): PublicClient {
  if (_anonClient) return _anonClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars')
  }
  _anonClient = createClient<Database>(url, anonKey, {
    auth: { persistSession: false }
  })
  return _anonClient
}

function getJwtSecretKey(): Uint8Array {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) throw new Error('Missing SUPABASE_JWT_SECRET env var')
  // Try base64 decode first (typical for Supabase), fallback to raw text
  try {
    return new Uint8Array(Buffer.from(secret, 'base64'))
  } catch {
    return new TextEncoder().encode(secret)
  }
}

export type AdminClaims = JWTPayload & {
  app_metadata?: { role?: string } | Record<string, unknown>
  admin?: boolean
}

function parseBearer(authorization?: string): string | null {
  if (!authorization) return null
  const [scheme, token] = authorization.split(' ')
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null
  return token
}

export async function verifyJwt(token: string): Promise<AdminClaims> {
  const secret = getJwtSecretKey()
  const { payload } = await jwtVerify(token, secret)
  return payload as AdminClaims
}

export async function getClaimsFromAuthHeader(req: Request): Promise<AdminClaims | null> {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || undefined
  const token = parseBearer(auth)
  if (!token) return null
  try {
    return await verifyJwt(token)
  } catch {
    return null
  }
}

function hasAdminClaim(claims: AdminClaims): boolean {
  if (!claims.app_metadata) return claims.admin === true
  const metadata = claims.app_metadata as Record<string, unknown>
  const roleValue = metadata?.role
  return (typeof roleValue === 'string' && roleValue === 'admin') || claims.admin === true
}

export async function assertAdminFromAuthHeader(req: Request): Promise<AdminClaims> {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || undefined
  const token = parseBearer(auth)
  if (!token) throw new HttpError(401, 'Missing or invalid Authorization header')
  let claims: AdminClaims
  try {
    claims = await verifyJwt(token)
  } catch (error) {
    void error
    throw new HttpError(401, 'Invalid token')
  }
  const isAdmin = hasAdminClaim(claims)
  if (!isAdmin) throw new HttpError(403, 'Admin privileges required')
  return claims
}

export function requireInternalKey(req: Request): void {
  const configured = process.env.INTERNAL_API_SECRET
  if (!configured) throw new Error('Missing INTERNAL_API_SECRET env var')
  const provided = req.headers.get('x-internal-key') || req.headers.get('X-Internal-Key')
  if (!provided || provided !== configured) {
    throw new HttpError(403, 'Invalid internal key')
  }
}
