import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ingestInvoiceSubmission } from '@/lib/invoices/intake'
import { verifyCaptcha, CaptchaError } from '@/lib/security/captcha'
import { assertNotRateLimited, RateLimitError } from '@/lib/security/rate-limit'
import { HttpError } from '@/lib/supabase'
import { logAudit } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  const file = validateFile(form.get('file') as File | null)
  const firstName = form.get('first_name') as string | null
  const lastName = form.get('last_name') as string | null
  const email = normalizeEmail(form.get('email') as string | null)
  assertPrivacyAck(form.get('privacy_ack') as string | null)
  const captchaToken = (form.get('captcha_token') as string | null) || ''

  try {
    await verifyCaptcha({ token: captchaToken, remoteIp: clientIp })
  } catch (err) {
    if (err instanceof CaptchaError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    }
    throw err
  }

  const admin = supabaseAdmin()
  const customerName = buildCustomerName(firstName, lastName)
  const issuedAt = new Date()

  try {
    const { invoiceId } = await ingestInvoiceSubmission({
      admin,
      file,
      customerName,
      customerEmail: email,
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
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  } catch (err) {
    if (err instanceof RateLimitError) {
      return new Response(JSON.stringify({ error: err.message, retryAfter: err.retryAfter }), {
        status: 429,
        headers: { 'content-type': 'application/json; charset=utf-8', 'retry-after': String(err.retryAfter) },
      })
    }
    if (err instanceof HttpError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    }
    if (err instanceof CaptchaError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
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
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }
}
