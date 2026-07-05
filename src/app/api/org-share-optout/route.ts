import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * 団体IGシェア オプトアウト API（プロ本人専用）
 *
 * org_share_optouts:
 *   行が「ある」  = そのプロは、その団体からの紹介を拒否（顔写真ブロックから除外）
 *   行が「ない」  = デフォルト公開（紹介OK）
 *
 * 認証は常に「ログイン中プロ本人の professional_id」に限定するため、
 * 他人のオプトアウト設定は変更・閲覧できない。
 * professional_id 取得は /api/my/organizations と同じパターン
 * （deactivated_at は問わない = プロ解除済みでも所属バッジは残るため）。
 */

/**
 * GET /api/org-share-optout
 * ログイン中プロがオプトアウトしている organization_id 一覧を返す。
 * → プロ側トグルの初期状態（行あり=OFF表示）に使う。
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    const { data: pro } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (!pro) {
      return NextResponse.json({ organization_ids: [] })
    }

    const { data, error } = await supabase
      .from('org_share_optouts')
      .select('organization_id')
      .eq('professional_id', pro.id)

    if (error) throw error

    return NextResponse.json({
      organization_ids: (data || []).map((r: any) => r.organization_id),
    })
  } catch (error: any) {
    console.error('[org-share-optout GET] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/org-share-optout
 * body: { organization_id: string, optout: boolean }
 *   optout === true  → org_share_optouts に該当行を INSERT（既存あれば維持）
 *   optout === false → 該当行を DELETE
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const organizationId = body?.organization_id
    const optout = body?.optout

    if (typeof organizationId !== 'string' || !organizationId || typeof optout !== 'boolean') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 本人の professional_id を取得（他人の設定は触れない）
    const { data: pro } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (!pro) {
      return NextResponse.json({ error: 'Professional not found' }, { status: 404 })
    }

    if (optout) {
      // 拒否 = 行を作成（UNIQUE制約により重複時は既存維持）
      const { error } = await supabase
        .from('org_share_optouts')
        .upsert(
          { professional_id: pro.id, organization_id: organizationId },
          { onConflict: 'professional_id,organization_id', ignoreDuplicates: true }
        )
      if (error) throw error
    } else {
      // 許可（デフォルト）= 行を削除
      const { error } = await supabase
        .from('org_share_optouts')
        .delete()
        .eq('professional_id', pro.id)
        .eq('organization_id', organizationId)
      if (error) throw error
    }

    return NextResponse.json({ ok: true, optout })
  } catch (error: any) {
    console.error('[org-share-optout POST] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
