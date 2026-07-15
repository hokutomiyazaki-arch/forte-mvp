import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/onboarding/nfc-gate
 * /setup 完了直後に叩く出し分け判定。次の両方を満たす時だけ購入画面(/onboarding/nfc)を表示する。
 *   1. professionals.nfc_onboarding_dismissed_at IS NULL
 *   2. この user_id に status='active' の nfc_cards が無い
 * ⚠️ fail open: 判定に失敗したら showNfc: false を返す(=呼び出し側はダッシュボードへ通す)。
 * 新規ログインを絶対にブロックしない。
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      // 未認証は判定不能。fail open でダッシュボードへ通す。
      return NextResponse.json({ showNfc: false })
    }

    const supabase = getSupabaseAdmin()

    const { data: pro, error: proError } = await supabase
      .from('professionals')
      .select('id, nfc_onboarding_dismissed_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (proError || !pro) {
      // professionals が見つからない/エラー → fail open
      return NextResponse.json({ showNfc: false })
    }

    if (pro.nfc_onboarding_dismissed_at) {
      return NextResponse.json({ showNfc: false })
    }

    const { data: activeCard, error: cardError } = await supabase
      .from('nfc_cards')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()

    if (cardError) {
      // カード判定に失敗 → fail open
      return NextResponse.json({ showNfc: false })
    }

    return NextResponse.json({ showNfc: !activeCard })
  } catch (err) {
    console.error('[onboarding/nfc-gate] unexpected error:', err)
    // fail open: どんな例外でも購入画面を出さずダッシュボードへ通す
    return NextResponse.json({ showNfc: false })
  }
}
