import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import { isReferralEnabled } from '@/lib/feature-flags'
import { computeReferralSignal, isReferralReachable } from '@/lib/referral-accepting'
import { getValidDelegateListIds } from '@/lib/referral-delegate'

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
    let dbQuery = supabase
      .from('professionals')
      .select('id, name, title, photo_url, prefecture, accepting_status, delegate_list_id')
      .is('deactivated_at', null)
      .neq('id', ownPro.id)
      .ilike('name', `%${safeQ}%`)

    // レビュー指摘: 20件limitの前にDB側で「候補を広めに」絞る(delegate_list_idが設定済みという
    // 粗い条件のまま)。§2-2改訂で🟡の実際の点灯条件は「そのリストに承諾済み+受付中のメンバーが
    // 1名以上」に厳格化したため、ここで拾った delegate_list_id 設定済みだが無効(空/全員停止中)な
    // 候補は下のisReferralReachableによる最終絞りで正しく除外される(有効性はwithSignalで判定)。
    // 先行テスト第3弾(fail-open): accepting_status IS NULL も受付中として含める。
    if (referralOnly) {
      dbQuery = dbQuery.or(
        'accepting_status.is.null,accepting_status.neq.closed,delegate_list_id.not.is.null'
      )
    }

    const { data, error } = await dbQuery.limit(20)

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

    const validDelegateListIds = await getValidDelegateListIds(
      supabase,
      rows.map((p) => p.delegate_list_id)
    )
    const withSignal = rows.map((p) => ({
      ...p,
      referralSignal: computeReferralSignal(
        p.accepting_status,
        !!p.delegate_list_id && validDelegateListIds.has(p.delegate_list_id)
      ),
    }))

    // DB側で既に絞り込み済みだが、述語を共通化するため念のためここでも同じ関数で絞る
    const result = referralOnly
      ? withSignal.filter((p) => isReferralReachable(p.referralSignal))
      : withSignal

    return NextResponse.json({ professionals: result })
  } catch (err: any) {
    console.error('[api/referral/pro-search] GET error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
