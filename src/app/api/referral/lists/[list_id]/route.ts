import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import { isReferralEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

const ALLOWED_VISIBILITY = ['link', 'private', 'public']

/**
 * PATCH /api/referral/lists/[list_id]
 * body: { title?, comment?, visibility?, criteria? }
 * 所有者本人のみ更新可。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { list_id: string } }
) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getSupabaseAdmin()
    const { data: list } = await supabase
      .from('referral_lists')
      .select('id, owner_id')
      .eq('id', params.list_id)
      .maybeSingle()

    if (!list || list.owner_id !== ownPro.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const update: Record<string, any> = { updated_at: new Date().toISOString() }

    if (typeof body.title === 'string') {
      const title = body.title.trim()
      if (!title) return NextResponse.json({ error: 'title_required' }, { status: 400 })
      if (title.length > 200) return NextResponse.json({ error: 'title_too_long' }, { status: 400 })
      update.title = title
    }
    if (typeof body.comment === 'string' || body.comment === null) {
      update.comment = typeof body.comment === 'string' ? body.comment.trim() : null
    }
    if (body.visibility !== undefined) {
      if (!ALLOWED_VISIBILITY.includes(body.visibility)) {
        return NextResponse.json({ error: 'invalid_visibility' }, { status: 400 })
      }
      update.visibility = body.visibility
    }
    if (body.criteria !== undefined) {
      update.criteria = body.criteria && typeof body.criteria === 'object' ? body.criteria : null
    }

    const { data, error } = await supabase
      .from('referral_lists')
      .update(update)
      .eq('id', params.list_id)
      .select('id, title, comment, visibility, criteria, slug, is_delegate, created_at, updated_at')
      .maybeSingle()

    if (error) {
      console.error('[api/referral/lists/[list_id]] PATCH error:', error)
      return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
    }

    return NextResponse.json({ list: data })
  } catch (err: any) {
    console.error('[api/referral/lists/[list_id]] PATCH error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}

/**
 * DELETE /api/referral/lists/[list_id]
 * 所有者本人のみ削除可。referral_list_items は ON DELETE CASCADE で連動削除される。
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { list_id: string } }
) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getSupabaseAdmin()
    const { data: list } = await supabase
      .from('referral_lists')
      .select('id, owner_id')
      .eq('id', params.list_id)
      .maybeSingle()

    if (!list || list.owner_id !== ownPro.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // レビュー指摘: professionals.delegate_list_id がこのリストを指したまま削除すると
    // FK制約違反(23503)で行き止まりになる。削除前に参照を先に外す。
    const { error: unlinkError } = await supabase
      .from('professionals')
      .update({ delegate_list_id: null })
      .eq('delegate_list_id', params.list_id)

    if (unlinkError) {
      console.error('[api/referral/lists/[list_id]] DELETE unlink error:', unlinkError)
      return NextResponse.json({ error: 'failed_to_delete' }, { status: 500 })
    }

    // §16-20: professionals.delegate_criteria(jsonb)がこのリストをmode='list'で指している場合、
    // FK制約は無いためエラーにはならないが、削除後は「代理案内ON+存在しないリスト」の空約束が
    // 残ってしまう(getDelegateCandidates側はfail-softでnullを返すが、本人はONのまま気づけない)。
    // delegate_criteria.list_idが一致する本人だけをJSで特定し、無効化する。
    const { data: pointingPros } = await supabase
      .from('professionals')
      .select('id, delegate_criteria')
      .eq('delegate_criteria->>list_id', params.list_id)
    for (const p of (pointingPros || []) as Array<{ id: string; delegate_criteria: unknown }>) {
      const { error: criteriaUnlinkError } = await supabase
        .from('professionals')
        .update({ delegate_criteria: { enabled: false, mode: 'list', list_id: null, min_support_records: null } })
        .eq('id', p.id)
      if (criteriaUnlinkError) {
        console.error('[api/referral/lists/[list_id]] DELETE delegate_criteria unlink error:', criteriaUnlinkError)
      }
    }

    // CEO報告(2026-08-06)「リスト削除できない」の真因:
    //   referral_bookings.list_id が referral_lists(id) を **ON DELETE 指定なし** で参照している
    //   （migration 032）。そのリスト経由の予約が1件でもあると 23503 で DELETE が丸ごと失敗し、
    //   画面には「リストの削除に失敗しました」としか出なかった。
    //   delegate_list_id（上でnull化済み）と同じ処置を、予約側にも先に行う。
    //
    //   紹介の実体（誰が誰に紹介したか）は referral_bookings.sender_pro_id に残るので、
    //   list_id を外しても記録は失われない。リスト自体が消える以上、参照を残す方法は無い。
    //   ※ referral_list_items / referral_invites は ON DELETE CASCADE、
    //     consultation_messages.list_id は ON DELETE SET NULL のため対処不要。
    const { error: bookingUnlinkError } = await supabase
      .from('referral_bookings')
      .update({ list_id: null })
      .eq('list_id', params.list_id)

    if (bookingUnlinkError) {
      console.error('[api/referral/lists/[list_id]] DELETE booking unlink error:', bookingUnlinkError)
      return NextResponse.json({ error: 'failed_to_delete' }, { status: 500 })
    }

    const { error } = await supabase
      .from('referral_lists')
      .delete()
      .eq('id', params.list_id)

    if (error) {
      // 何が邪魔したか分からないまま「失敗しました」で終わらせない（今回の再発防止）。
      // 23503 = 他のテーブルからまだ参照されている。コードを返して画面に出す。
      console.error('[api/referral/lists/[list_id]] DELETE error:', error.code, error.message, error.details)
      return NextResponse.json(
        { error: (error as any).code === '23503' ? 'still_referenced' : 'failed_to_delete', code: (error as any).code || null },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[api/referral/lists/[list_id]] DELETE error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
