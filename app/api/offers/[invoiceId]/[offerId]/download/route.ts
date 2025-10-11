import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/auth'
import { fetchOfferById } from '@/lib/offers/fetch'
import { logAudit } from '@/lib/logger'

function resolveBaseUrl(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromEnv) return fromEnv
  const current = new URL(req.url)
  return `${current.protocol}//${current.host}`
}

function clampExpires(seconds: number | null | undefined): number {
  const def = 120 // 2 minutos por defecto
  const max = 300 // 5 minutos máximo
  const n = seconds && Number.isFinite(+seconds) ? Math.floor(+seconds) : def
  return Math.min(Math.max(n, 10), max)
}

// GET /api/offers/[invoiceId]/[offerId]/download - Descargar PDF de oferta
export async function GET(req: Request, { params }: { params: { invoiceId: string; offerId: string } }) {
  const supabase = supabaseRoute()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const admin = supabaseAdmin()
    const bucket = process.env.STORAGE_OFFERS_BUCKET || 'offers'

    // Verificar que la oferta existe
    const offer = await fetchOfferById(admin, params.offerId)
    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    // Verificar que la oferta pertenece a la factura especificada
    if (offer.invoice_id !== params.invoiceId) {
      return NextResponse.json({ error: 'Offer does not belong to this invoice' }, { status: 400 })
    }

    // Obtener TTL de configuración
    const ttlSeconds = clampExpires(Number(process.env.STORAGE_SIGNED_URL_TTL_SECS || '120'))

    // Generar signed URL
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(offer.storage_object_path, ttlSeconds)

    if (error) {
      if (error.message?.toLowerCase().includes('not found')) {
        return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
      }
      return NextResponse.json({ error: `Storage error: ${error.message}` }, { status: 500 })
    }

    // Registrar evento de auditoría
    await logAudit({
      event: 'offer_download_requested',
      entity: 'offer',
      entity_id: params.offerId,
      actor_user_id: user.id,
      meta: {
        invoice_id: params.invoiceId,
        provider_name: offer.provider_name,
        storage_path: offer.storage_object_path,
        expires_in_seconds: ttlSeconds,
      },
    })

    // Devolver la signed URL como JSON
    return NextResponse.json({
      downloadUrl: data.signedUrl,
      expiresIn: ttlSeconds,
      fileName: `${offer.provider_name}_oferta.pdf`
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
