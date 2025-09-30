import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ingestInvoiceSubmission } from '@/lib/invoices/intake'
import { verifyCaptcha, CaptchaError } from '@/lib/security/captcha'
import { assertNotRateLimited, RateLimitError } from '@/lib/security/rate-limit'
import { HttpError } from '@/lib/supabase'
import { logAudit } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') || ''
  const allowedOrigins = parseAllowedOrigins()
  
  // Verificar si el origin está permitido
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : (allowedOrigins.length === 0 ? '*' : allowedOrigins[0])
  
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Origin',
      'Access-Control-Max-Age': '86400',
    },
  })
}

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024 // 10 MB

function parseAllowedOrigins(): string[] {
  const raw = process.env.PUBLIC_INTAKE_ALLOWED_ORIGINS
  if (!raw) return []
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function assertOriginAllowed(req: NextRequest): void {
  const allowed = parseAllowedOrigins()
  if (allowed.length === 0) return
  const origin = req.headers.get('origin') || ''
  if (!allowed.includes(origin)) {
    throw new HttpError(403, 'Origin not allowed')
  }
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const [first] = forwarded.split(',').map((s) => s.trim())
    if (first) return first
  }
  return req.headers.get('x-real-ip') || 'unknown'
}

function assertPrivacyAck(value: string | null): void {
  if (value !== 'true') {
    throw new HttpError(400, 'Privacy policy must be accepted')
  }
}

function normalizeEmail(value: string | null): string {
  const email = (value || '').trim().toLowerCase()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, 'Invalid email')
  }
  return email
}

function buildCustomerName(firstName: string | null, lastName: string | null): string {
  const first = (firstName || '').trim()
  const last = (lastName || '').trim()
  const full = `${first} ${last}`.trim()
  if (!full) throw new HttpError(400, 'Missing customer name')
  return full
}

function normalizePhone(value: string | null): string | null {
  const phone = (value || '').trim()
  return phone.length > 0 ? phone : null
}

function validateFile(file: File | null): File {
  if (!file) throw new HttpError(400, 'Missing file')
  if (file.type !== 'application/pdf') throw new HttpError(400, 'Invalid file type')
  if (file.size > MAX_UPLOAD_SIZE) throw new HttpError(400, 'File too large')
  return file
}

export async function POST(req: NextRequest) {
  const actorId = process.env.PUBLIC_INTAKE_ACTOR_ID
  if (!actorId) {
    throw new Error('Missing PUBLIC_INTAKE_ACTOR_ID env var')
  }

  const origin = req.headers.get('origin') || ''

  assertOriginAllowed(req)

  const clientIp = getClientIp(req)
  try {
    assertNotRateLimited(`public-intake:${clientIp}`)
  } catch (err) {
    if (err instanceof RateLimitError) {
      return new Response(JSON.stringify({ error: err.message, retryAfter: err.retryAfter }), {
        status: 429,
        headers: { 'content-type': 'application/json; charset=utf-8', 'retry-after': String(err.retryAfter) },
      })
    }
    throw err
  }

  const form = await req.formData()
  
  const file = validateFile(form.get('archivo') as File | null)
  const fecha = form.get('fecha') as string | null
  const nombre = form.get('nombre') as string | null
  const email = normalizeEmail(form.get('email') as string | null)
  const telefono = normalizePhone(form.get('telefono') as string | null)
  const recaptchaToken = (form.get('recaptchaToken') as string | null) || ''
  
  // Validar fecha
  if (!fecha) {
    throw new HttpError(400, 'Missing fecha field')
  }
  
  // Validar nombre (usando el campo nombre en lugar de first_name/last_name)
  if (!nombre || !nombre.trim()) {
    throw new HttpError(400, 'Missing nombre field')
  }

  try {
    await verifyCaptcha({ token: recaptchaToken, remoteIp: clientIp })
  } catch (err) {
    if (err instanceof CaptchaError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 
          'content-type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Origin',
        },
      })
    }
    throw err
  }

  const admin = supabaseAdmin()
  const customerName = nombre.trim()
  const issuedAt = new Date(fecha)

  try {
    const { invoiceId } = await ingestInvoiceSubmission({
      admin,
      file,
      customerName,
      customerEmail: email,
      customerPhone: telefono,
      actorUserId: actorId,
      issuedAt,
      events: {
        received: 'public_intake_received',
        customerError: 'public_intake_customer_error',
        failure: 'public_intake_failed',
        success: 'public_intake_success',
      },
    })

    return new Response(JSON.stringify({ ok: true, invoiceId }), {
      status: 200,
      headers: { 
        'content-type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Origin',
      },
    })
  } catch (err) {
    if (err instanceof RateLimitError) {
      return new Response(JSON.stringify({ error: err.message, retryAfter: err.retryAfter }), {
        status: 429,
        headers: { 
          'content-type': 'application/json; charset=utf-8', 
          'retry-after': String(err.retryAfter),
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Origin',
        },
      })
    }
    if (err instanceof HttpError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 
          'content-type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Origin',
        },
      })
    }
    if (err instanceof CaptchaError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 
          'content-type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Origin',
        },
      })
    }
    await logAudit({
      event: 'public_intake_failed',
      entity: 'system',
      level: 'error',
      actor_user_id: actorId,
      meta: { error: err instanceof Error ? err.message : String(err) },
    })
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 
        'content-type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Origin',
      },
    })
  }
}
