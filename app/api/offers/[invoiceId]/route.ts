import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/auth'
import { fetchOffersByInvoiceId } from '@/lib/offers/fetch'
import { persistOfferPdf, OfferPersistError } from '@/lib/offers/upload'
import { HttpError } from '@/lib/supabase'

// GET /api/offers/[invoiceId] - Listar ofertas de una factura
export async function GET(req: Request, { params }: { params: { invoiceId: string } }) {
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
    const offers = await fetchOffersByInvoiceId(admin, params.invoiceId)
    
    return NextResponse.json({ offers })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/offers/[invoiceId] - Crear nueva oferta
export async function POST(req: Request, { params }: { params: { invoiceId: string } }) {
  const supabase = supabaseRoute()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const providerName = form.get('provider_name') as string | null

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    if (!providerName || !providerName.trim()) {
      return NextResponse.json({ error: 'Missing provider_name' }, { status: 400 })
    }

    const bucket = process.env.STORAGE_OFFERS_BUCKET || 'offers'
    const admin = supabaseAdmin()

    const { offerId, storagePath } = await persistOfferPdf({
      admin,
      file,
      invoiceId: params.invoiceId,
      providerName: providerName.trim(),
      actorUserId: user.id,
      bucket,
    })

    return NextResponse.json({ ok: true, offerId, storagePath })
  } catch (err: unknown) {
    if (err instanceof OfferPersistError) {
      const status = err.step === 'validation' ? 400 : 500
      return NextResponse.json({ error: err.message }, { status })
    }
    
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
