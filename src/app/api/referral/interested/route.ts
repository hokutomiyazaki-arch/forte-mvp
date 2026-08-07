import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro, pinToInterestedList } from '@/lib/referral-auth'

export const dynamic = 'force-dynamic'

/**
 * POST/DELETE /api/referral/interested
 * body: { pro_id }
 *
 * カード♡(プロ専用「気になるプロ」)の単一情報源。プロが閲覧しているカードで♡を押すと、
 * 自分の最古のprivate(非公開)リストに consent_status='pending' でピンする（§3-1 private二段構え。
 * 表示系は consent_status='approved' 絞りのため非公開のまま・通知も発生しない）。
 *
 * 🔴 isReferralEnabled()でゲートしない: 通知も公開も発生しない私的機能のため。ただし
 * UI側(card/[id]/page.tsx)が♡表示を isReferralEnabled(viewerProId) でゲートしているので、
 * allowlist期間中にこのAPIへ到達する導線はallowlist内プロのみ(FEATURE_REFERRAL_LISTS='all'
 * 切替でUI側が自動解禁され、このAPIは無変更で全プロに開く)。
 *
 * DELETEは「所有する全privateリストから外す」: ♡のON判定(card-data.ts)が
 * 「いずれかのprivateリストに入っているか」のため、対称にしないと♡が消えない。
 * 共有リスト(link/public)のピンには触れない。
 */

// §17-13(2026-08-06): 「気になるプロ」の取得/作成とピンは referral-auth.ts へ移した
// （プロ招待QRの登録処理と同じ置き場所を使うため。判定が2箇所にあるとズレる）。

export async function POST(request: NextRequest) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const proId = typeof body.pro_id === 'string' ? body.pro_id : ''
    if (!proId) {
      return NextResponse.json({ error: 'pro_id_required' }, { status: 400 })
    }
    if (proId === ownPro.id) {
      return NextResponse.json({ error: 'self_pin_not_allowed' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: targetPro } = await supabase
      .from('professionals')
      .select('id, deactivated_at')
      .eq('id', proId)
      .maybeSingle()

    if (!targetPro || targetPro.deactivated_at) {
      return NextResponse.json({ error: 'target_pro_not_found' }, { status: 404 })
    }

    // 冪等: 既に入っていれば成功扱い(UNIQUE(list_id,pro_id)への衝突を避ける)
    const { listId, failed } = await pinToInterestedList(supabase, ownPro.id, proId)
    if (!listId) {
      return NextResponse.json({ error: 'failed_to_create_list' }, { status: 500 })
    }
    if (failed) {
      return NextResponse.json({ error: 'failed_to_create' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[api/referral/interested] POST error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const proId = typeof body.pro_id === 'string' ? body.pro_id : ''
    if (!proId) {
      return NextResponse.json({ error: 'pro_id_required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: ownPrivateLists } = await supabase
      .from('referral_lists')
      .select('id')
      .eq('owner_id', ownPro.id)
      .eq('visibility', 'private')

    const listIds = (ownPrivateLists || []).map((l) => l.id)
    if (listIds.length === 0) {
      return NextResponse.json({ success: true })
    }

    // 仕様(R7で明文化): ♡のON判定は「いずれかのprivateリストに入っているか」(card-data)なので、
    // ♡OFFは全privateリストから外す(1本だけ外すと♡が点いたままになり判定と非対称になる)。
    // 共有リスト(link/public)のピンには触れない。
    const { error } = await supabase
      .from('referral_list_items')
      .delete()
      .in('list_id', listIds)
      .eq('pro_id', proId)

    if (error) {
      console.error('[api/referral/interested] DELETE error:', error)
      return NextResponse.json({ error: 'failed_to_delete' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[api/referral/interested] DELETE error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
