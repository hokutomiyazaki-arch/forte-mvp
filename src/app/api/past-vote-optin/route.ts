import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyOptinToken } from '@/lib/optin-token'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/past-vote-optin?token=<HMAC>&email=<URL_ENCODED_NORMALIZED_EMAIL>
 *
 * Phase 4: 過去票オプトイン受付エンドポイント
 *   メール本文の「承認する」リンクから飛んでくる。HMAC検証OKなら
 *   votes.reward_optin = TRUE に更新して /optin-success にリダイレクト。
 *
 * 冪等性:
 *   - 既に reward_optin=TRUE の場合は更新件数 0 だが /optin-success に飛ばす。
 *     (リプレイ・ダブルクリック・バックフィル後再クリックでもユーザー体験を壊さない)
 *
 * セキュリティ:
 *   - HMAC-SHA256 (timingSafeEqual) で token を検証
 *   - status='confirmed' のみ更新対象 (pending は同意取得対象外)
 *   - email / token そのものはログに出さない (件数と成否のみ)
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://realproof.jp'

function redirectTo(path: string): NextResponse {
  return NextResponse.redirect(`${SITE_URL}${path}`, { status: 302 })
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    const email = req.nextUrl.searchParams.get('email')

    if (!token || !email) {
      console.warn('[past-vote-optin] missing token or email')
      return redirectTo('/optin-error?reason=invalid_link')
    }

    if (!verifyOptinToken(email, token)) {
      console.warn('[past-vote-optin] invalid token')
      return redirectTo('/optin-error?reason=invalid_token')
    }

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      console.error('[past-vote-optin] Supabase env vars not set')
      return redirectTo('/optin-error?reason=db_error')
    }

    const supabase = getSupabaseAdmin()

    const { error, count } = await supabase
      .from('votes')
      .update({ reward_optin: true }, { count: 'exact' })
      .eq('normalized_email', email)
      .eq('reward_optin', false)
      .eq('status', 'confirmed')

    if (error) {
      console.error('[past-vote-optin] DB error:', error.message)
      return redirectTo('/optin-error?reason=db_error')
    }

    console.log(`[past-vote-optin] success: updated ${count ?? 0} row(s)`)
    return redirectTo('/optin-success')
  } catch (e) {
    console.error(
      '[past-vote-optin] unexpected error:',
      e instanceof Error ? e.message : 'unknown'
    )
    return redirectTo('/optin-error?reason=server_error')
  }
}
