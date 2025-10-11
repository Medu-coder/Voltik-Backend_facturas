import { NextResponse } from 'next/server'
import { supabaseRoute } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/auth'
import { deleteOffer } from '@/lib/offers/fetch'

// DELETE /api/offers/[invoiceId]/[offerId] - Eliminar oferta
export async function DELETE(req: Request, { params }: { params: { invoiceId: string; offerId: string } }) {
  const supabase = supabaseRoute()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const bucket = process.env.STORAGE_OFFERS_BUCKET || 'offers'
    const admin = supabaseAdmin()

    await deleteOffer(admin, params.offerId, user.id, bucket)
    
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    
    // Si la oferta no existe, retornar 404
    if (message.includes('not found')) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }
    
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
