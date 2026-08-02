import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import { isReferralEnabled } from '@/lib/feature-flags'
import { computeReferralSignal } from '@/lib/referral-accepting'

export const dynamic = 'force-dynamic'

/**
 * ilikeパターンの特殊文字(% _)をエスケープし、PostgRESTのフィルタ構文で意味を持つ
 * カンマは除去する(軽微指摘: ユーザー入力をそのままilikeへ渡さない)。
 */
function sanitizeIlikeQuery(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '')
}

/**
 * GET /api/referral/pro-search?q=xxx
 * 処方箋リストへのピン指名対象プロを名前部分一致で検索する軽量専用API。
 * 既存 /api/search は「プルーフ0件除外」「isSearchPrivateゲート」等の検索ページ向け
 * ロジックを持つため、ピン選定という別用途には流用せず専用エンドポイントとした（仮決定）。
 * 返すのは公開プロフィール項目のみ（PIIなし）。
 */
export async function GET(request: NextRequest) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()
    // §2-2改訂: 「紹介につながる人のみ表示」フィルタ(デフォルトOFF=全件)。対象は🟢+🟡。
    const referralOnly = searchParams.get('referral_only') === '1'
    if (!q) {
      return NextResponse.json({ professionals: [] })
    }

    const supabase = getSupabaseAdmin()
    const safeQ = sanitizeIlikeQuery(q)
    const { data, error } = await supabase
      .from('professionals')
      .select('id, name, title, photo_url, prefecture, accepting_status, delegate_list_id')
      .is('deactivated_at', null)
      .neq('id', ownPro.id)
      .ilike('name', `%${safeQ}%`)
      .limit(20)

    if (error) {
      console.error('[api/referral/pro-search] GET error:', error)
      return NextResponse.json({ error: 'failed_to_fetch' }, { status: 500 })
    }

    const rows = (data || []) as Array<{
      id: string
      name: string
      title: string | null
      photo_url: string | null
      prefecture: string | null
      accepting_status: string | null
      delegate_list_id: string | null
    }>

    const withSignal = rows.map((p) => ({
      ...p,
      referralSignal: computeReferralSignal(p.accepting_status, p.delegate_list_id),
    }))

    const result = referralOnly
      ? withSignal.filter((p) => p.referralSignal !== 'closed')
      : withSignal

    return NextResponse.json({ professionals: result })
  } catch (err: any) {
    console.error('[api/referral/pro-search] GET error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
