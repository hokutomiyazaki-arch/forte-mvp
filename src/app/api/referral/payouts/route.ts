import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'

export const dynamic = 'force-dynamic'

/** テーブル/カラム未反映(migration 039 未実行)を示すエラーコード。この場合のみfail-soft対象。 */
function isMissingSchemaError(err: { code?: string } | null | undefined): boolean {
  if (!err) return false
  const code = err.code || ''
  return code === '42P01' || code === 'PGRST205' || code === '42703'
}

/**
 * GET /api/referral/payouts
 * ステージ4(送り手分配・CEO決定): 自分が送り手(sender_pro_id)の分配行(referral_payouts・
 * migration 039)一覧+サマリーを返す。PIIなし(amount/status/created_at/booking_idのみ)。
 *
 * レビュー指摘(軽微8): サマリー(pending合計・paid累計)はサーバー側で全件を集計してレスポンスに
 * 含める(表示用の一覧は直近500件のままでよいが、合計は一覧の件数上限に依存させない)。
 * 現状は全行取得→JS reduceで集計する(分配行は紹介経由の完了予約のみで発生数が少ない前提)。
 * 件数が増えて Supabase の1000行キャップに掛かる規模になったら、Postgres側RPC/VIEWでの
 * SUM集計へ移行すること(教訓: /api/search等と同種のスケールリスク)。
 *
 * レビュー指摘(軽微10): fail-softはスキーマ未反映系(42P01/PGRST205/42703・migration 039未実行)
 * に限定する。それ以外のDBエラーは500を返す(サイレントな0円表示で気づけない事故を防ぐ)。
 */
export async function GET() {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // サマリー集計用(全件・limitなし=現状のSupabase既定キャップの範囲内で足りる規模の前提)
    const { data: aggregateRows, error: aggregateError } = await supabase
      .from('referral_payouts')
      .select('amount_jpy, status')
      .eq('sender_pro_id', ownPro.id)

    if (aggregateError) {
      if (isMissingSchemaError(aggregateError)) {
        console.error('[api/referral/payouts] GET aggregate schema not ready (fail-soft):', aggregateError.message)
        return NextResponse.json({ payouts: [], pending_total_jpy: 0, paid_total_jpy: 0 })
      }
      console.error('[api/referral/payouts] GET aggregate error:', aggregateError)
      return NextResponse.json({ error: 'failed_to_fetch' }, { status: 500 })
    }

    let pendingTotalJpy = 0
    let paidTotalJpy = 0
    for (const row of (aggregateRows || []) as Array<{ amount_jpy: number; status: string }>) {
      if (row.status === 'pending') pendingTotalJpy += row.amount_jpy
      else if (row.status === 'paid') paidTotalJpy += row.amount_jpy
    }

    // 表示用一覧(直近500件)
    const { data: payouts, error } = await supabase
      .from('referral_payouts')
      .select('id, booking_id, amount_jpy, status, created_at, paid_at')
      .eq('sender_pro_id', ownPro.id)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      if (isMissingSchemaError(error)) {
        console.error('[api/referral/payouts] GET list schema not ready (fail-soft):', error.message)
        return NextResponse.json({ payouts: [], pending_total_jpy: pendingTotalJpy, paid_total_jpy: paidTotalJpy })
      }
      console.error('[api/referral/payouts] GET list error:', error)
      return NextResponse.json({ error: 'failed_to_fetch' }, { status: 500 })
    }

    const result = ((payouts || []) as any[]).map((p) => ({
      id: p.id,
      booking_id: p.booking_id,
      amount_jpy: p.amount_jpy,
      status: p.status,
      created_at: p.created_at,
      paid_at: p.paid_at,
    }))

    return NextResponse.json({
      payouts: result,
      pending_total_jpy: pendingTotalJpy,
      paid_total_jpy: paidTotalJpy,
    })
  } catch (err: any) {
    // 想定外(getOwnPro等の例外)はfail-softにしない: ページ側は0円/空表示を捨てて再試行できるよう500を返す
    console.error('[api/referral/payouts] GET unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'internal_error' }, { status: 500 })
  }
}
