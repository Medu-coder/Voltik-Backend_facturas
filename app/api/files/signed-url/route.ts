import { NextRequest } from 'next/server'
import { assertAdminFromAuthHeader, getAdminClient, HttpError } from '../../../../lib/supabase'
import { logAudit } from '../../../../lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function sanitizePath(p: string): string {
  // prohibit path traversal; path must be relative to bucket root
  if (!p) throw new HttpError(400, 'Path is required')
  if (p.includes('..')) throw new HttpError(400, 'Invalid path')
  if (p.startsWith('/') || p.startsWith('\\')) throw new HttpError(400, 'Path must be relative')
  return p
}

function clampExpires(seconds: number | null | undefined): number {
  const def = 60
  const max = 300
  const n = seconds && Number.isFinite(+seconds) ? Math.floor(+seconds) : def
  return Math.min(Math.max(n, 10), max)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export async function GET(req: NextRequest) {
  const adminClient = getAdminClient()
  try {
    await assertAdminFromAuthHeader(req)

    const { searchParams } = new URL(req.url)
    const path = sanitizePath(searchParams.get('path') || '')
    const expiresIn = clampExpires(Number(searchParams.get('expiresIn') || '60'))

    await logAudit({ event: 'signed_url_requested', entity: 'storage', meta: { path, expiresIn } })

    const { data, error } = await adminClient.storage.from('invoices').createSignedUrl(path, expiresIn)
    if (error) {
      if (error.message?.toLowerCase().includes('not found')) {
        throw new HttpError(404, 'Object not found')
      }
      await logAudit({ event: 'signed_url_failed', entity: 'storage', level: 'error', meta: { error: error.message } })
      throw new HttpError(500, `Signed URL failed: ${error.message}`)
    }

    await logAudit({ event: 'signed_url_success', entity: 'storage', meta: { path } })
    return new Response(JSON.stringify({ url: data.signedUrl, expiresIn }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    })
  } catch (err: unknown) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof HttpError ? err.message : 'Internal server error'
    if (!(err instanceof HttpError)) {
      await logAudit({ event: 'signed_url_failed', entity: 'storage', level: 'error', meta: { step: 'unhandled', error: getErrorMessage(err) } })
    }
    return new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  }
}
