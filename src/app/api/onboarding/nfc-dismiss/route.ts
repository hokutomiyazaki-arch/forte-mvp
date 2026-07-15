import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/onboarding/nfc-dismiss
 * NFCカードのオンボーディング購入画面(/onboarding/nfc)を「購入する」「あとで(スキップ)」
 * どちらのボタンからも呼ばれる共通エンドポイント。
 * professionals.nfc_onboarding_dismissed_at に現在時刻(ISO文字列)をセットし、
 * 以後この画面を再表示しないようにする。既に dismissed 済みでも冪等に成功扱いにする。
 */
export async function POST() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data: pro, error: findError } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (findError) {
    console.error('[onboarding/nfc-dismiss] find professional failed:', findError.message)
    return NextResponse.json({ error: 'failed to find professional' }, { status: 500 })
  }

  if (!pro) {
    // professionals レコードが無い(未登録)場合も画面をブロックしない
    return NextResponse.json({ success: true })
  }

  const { error: updateError } = await supabase
    .from('professionals')
    .update({ nfc_onboarding_dismissed_at: new Date().toISOString() })
    .eq('id', pro.id)

  if (updateError) {
    console.error('[onboarding/nfc-dismiss] update failed:', updateError.message)
    return NextResponse.json({ error: 'failed to update' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
