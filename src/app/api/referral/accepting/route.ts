import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro, isPinnedOnSharedList } from '@/lib/referral-auth'
import { isReferralEnabled } from '@/lib/feature-flags'
import { getFounderInstructorOrgs } from '@/lib/org-role'

export const dynamic = 'force-dynamic'

// §2-2改訂: ステータスはopen/closedの2値のみ（'conditional'は選ばせない。DBのCHECK制約自体は
// 実データ0件のため変更しない）
const ALLOWED_STATUS = ['open', 'closed']

/**
 * PATCH /api/referral/accepting
 * body: { accepting_status, accepting_note?, delegate_list_id?, delegate_criteria? }
 *   - accepting_status: 'open' | 'closed'（必須）
 *   - accepting_note: 常時保存可（表示はopen時のみ。フロント側の責務）
 *   - delegate_list_id: bodyに含まれる場合のみ更新。null で解除、文字列なら
 *     「自分がownerで、visibilityがprivateでない（共有URLを持つ）リスト」であることを検証してから設定
 *   - delegate_criteria: §16-8+§16-14。bodyに含まれる場合のみ更新。null で解除、オブジェクトなら
 *     { enabled: boolean, org_id: string, min_support_records?: number } を検証してから設定。
 *     org_id は自分がfounder(団体オーナー)/instructor(growth_role='instructor')である団体のみ許可
 *     (founder/instructor限定・§16-8)。強みは自動算出のため保存しない。
 * §2-2 受け入れステータス。紹介リストタブ内に置くため、他の紹介APIと同様に
 * isReferralEnabled でゲートする（仮決定: タブ自体がフラグ配下のため整合を取った）。
 *
 * 🔴1(再レビュー): ただし allowlist外でも、共有リストに承諾済みで掲載されている本人は
 * 通す。受付状態は本人だけが決める唯一のオプトアウト手段のため、allowlist外でも共有リストに
 * 掲載されている本人には開放する（旧consents APIが意図的にフラグを外していた設計意図の継承）。
 */
export async function PATCH(request: NextRequest) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const supabase = getSupabaseAdmin()
    // 軽微指摘: 本人の唯一のオプトアウト手段がDB一時障害で403にならないようfail-open
    // (自分の受付状態の更新のため fail-open でも危険なし)
    if (!isReferralEnabled(ownPro.id) && !(await isPinnedOnSharedList(supabase, ownPro.id, { failOpenOnError: true }))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const acceptingStatus = body.accepting_status
    const acceptingNote = typeof body.accepting_note === 'string' ? body.accepting_note.trim() : null

    if (!ALLOWED_STATUS.includes(acceptingStatus)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
    }
    if (acceptingNote && acceptingNote.length > 200) {
      return NextResponse.json({ error: 'note_too_long' }, { status: 400 })
    }

    const update: Record<string, unknown> = {
      accepting_status: acceptingStatus,
      accepting_note: acceptingNote,
      accepting_updated_at: new Date().toISOString(),
    }

    // delegate_list_id はbodyに明示的に含まれている時のみ扱う(未指定なら現状維持)
    if ('delegate_list_id' in body) {
      const delegateListId = body.delegate_list_id
      if (delegateListId === null) {
        update.delegate_list_id = null
      } else if (typeof delegateListId === 'string' && delegateListId) {
        const { data: targetList } = await supabase
          .from('referral_lists')
          .select('id, owner_id, visibility')
          .eq('id', delegateListId)
          .maybeSingle()

        if (!targetList || targetList.owner_id !== ownPro.id) {
          return NextResponse.json({ error: 'delegate_list_not_found' }, { status: 400 })
        }
        if (targetList.visibility === 'private') {
          return NextResponse.json({ error: 'delegate_list_must_be_shareable' }, { status: 400 })
        }
        update.delegate_list_id = delegateListId
      } else {
        return NextResponse.json({ error: 'invalid_delegate_list_id' }, { status: 400 })
      }
    }

    // delegate_criteria(§16-8+§16-14): bodyに明示的に含まれている時のみ扱う(未指定なら現状維持)。
    // fail-soft: professionals.delegate_criteria カラムが未作成(移行前)の環境では、bodyにこの
    // キーを含まない限りこの分岐に入らないため、既存のPATCH呼び出しは無改修で動く(後方互換)。
    if ('delegate_criteria' in body) {
      const raw = body.delegate_criteria
      if (raw === null) {
        update.delegate_criteria = null
      } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const enabled = raw.enabled === true
        const orgId = typeof raw.org_id === 'string' ? raw.org_id : ''
        const minSupportRaw = raw.min_support_records
        const minSupport =
          typeof minSupportRaw === 'number' && Number.isFinite(minSupportRaw) && minSupportRaw >= 0
            ? Math.floor(minSupportRaw)
            : null

        if (enabled) {
          if (!orgId) {
            return NextResponse.json({ error: 'org_id_required' }, { status: 400 })
          }
          // founder(団体オーナー)/instructor(growth_role='instructor')限定(§16-8)
          const { userId } = await auth()
          const eligibleOrgs = await getFounderInstructorOrgs(supabase, ownPro.id, userId || null)
          if (!eligibleOrgs.some((o) => o.organizationId === orgId)) {
            return NextResponse.json({ error: 'org_not_eligible' }, { status: 400 })
          }
        }

        update.delegate_criteria = {
          enabled,
          org_id: orgId || null,
          min_support_records: minSupport,
        }
      } else {
        return NextResponse.json({ error: 'invalid_delegate_criteria' }, { status: 400 })
      }
    }

    // 教訓(デプロイ順序 DB先→コード後): .select() に delegate_criteria を明示指定すると、
    // 移行(047)未実行の本番で既存のaccepting_status切替(delegate_criteriaをbodyに含まない
    // 全呼び出し)まで42703で落ちてしまう。呼び出し元は既にローカルstateから楽観更新しており
    // レスポンスのdelegate_criteria値に依存しないため、select列には追加しない(fail-soft)。
    const { data, error } = await supabase
      .from('professionals')
      .update(update)
      .eq('id', ownPro.id)
      .select('id, accepting_status, accepting_note, accepting_updated_at, delegate_list_id')
      .maybeSingle()

    if (error) {
      console.error('[api/referral/accepting] PATCH error:', error)
      return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
    }

    return NextResponse.json({ professional: data })
  } catch (err: any) {
    console.error('[api/referral/accepting] PATCH error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
