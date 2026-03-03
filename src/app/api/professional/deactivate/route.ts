import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // professional_id を取得
    const { data: pro } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    const { error } = await supabase
      .from('professionals')
      .update({ deactivated_at: new Date().toISOString() })
      .eq('user_id', userId)

    if (error) {
      console.error('[api/professional/deactivate] error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // NFCカードを一般モードに移行
    if (pro) {
      const { error: nfcError } = await supabase
        .from('nfc_cards')
        .update({
          professional_id: null,
          user_id: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('professional_id', pro.id)
        .eq('status', 'active')

      if (nfcError) {
        console.error('[api/professional/deactivate] nfc update error:', nfcError.message)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[api/professional/deactivate] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
