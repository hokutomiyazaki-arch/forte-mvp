import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro, MAX_REFERRAL_PINS_PER_LIST } from '@/lib/referral-auth'
import { notifyInviteRegistered } from '@/lib/referral-notify'

export const dynamic = 'force-dynamic'

/**
 * POST /api/referral/invites/[token]/complete
 * §2-9: 招待経由の登録完了処理。ログイン済み＋professionalsレコードありの本人が呼ぶ。
 * 冪等: registered_pro_id が既に自分であれば成功扱いで即返す(二重実行対策)。
 * isReferralEnabled ではゲートしない(招待される側は先行アクセス対象外でも登録できる必要がある)。
 */
export async function POST(_request: Request, { params }: { params: { token: string } }) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      // 未ログイン、またはprofessionalsレコードがまだ無い(オンボーディング未完了)。
      // 呼び出し側(フロント)でサインアップ/オンボーディング導線を出す。
      return NextResponse.json({ error: 'no_professional_profile' }, { status: 409 })
    }

    const supabase = getSupabaseAdmin()
    const { data: invite, error: fetchError } = await supabase
      .from('referral_invites')
      .select('id, list_id, inviter_pro_id, invitee_name, registered_pro_id')
      .eq('invite_token', params.token)
      .maybeSingle()

    if (fetchError) {
      console.error('[api/referral/invites/[token]/complete] fetch error:', fetchError)
      return NextResponse.json({ error: 'failed_to_fetch' }, { status: 500 })
    }
    if (!invite) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // 冪等: 既に自分自身が登録済みなら成功として返す(LINEブラウザの2回発火・リロード対策)。
    if (invite.registered_pro_id === ownPro.id) {
      return NextResponse.json({ success: true, already: true })
    }
    if (invite.registered_pro_id) {
      // 別のプロが既にこの招待で登録済み。
      return NextResponse.json({ error: 'invite_already_used' }, { status: 409 })
    }

    // registered_pro_id IS NULL の場合のみ更新(競合時のガード)。
    const { data: updated, error: updateError } = await supabase
      .from('referral_invites')
      .update({ registered_pro_id: ownPro.id, registered_at: new Date().toISOString() })
      .eq('id', invite.id)
      .is('registered_pro_id', null)
      .select('id')
      .maybeSingle()

    if (updateError) {
      console.error('[api/referral/invites/[token]/complete] update error:', updateError)
      return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
    }
    if (!updated) {
      // 直前に別リクエストが埋めた(race)。再取得して自分なら成功扱い。
      const { data: recheck } = await supabase
        .from('referral_invites')
        .select('registered_pro_id')
        .eq('id', invite.id)
        .maybeSingle()
      if (recheck?.registered_pro_id === ownPro.id) {
        return NextResponse.json({ success: true, already: true })
      }
      return NextResponse.json({ error: 'invite_already_used' }, { status: 409 })
    }

    // 🔴3レビュー指摘: §3-0承諾ゲート撤廃に合わせ、招待経由の登録も他のピン追加経路と同様
    // consent_status='approved'で即時掲載する(ピン上限3を超える場合はスキップ)。
    let listAdded = false
    try {
      const { count } = await supabase
        .from('referral_list_items')
        .select('id', { count: 'exact', head: true })
        .eq('list_id', invite.list_id)

      if ((count || 0) < MAX_REFERRAL_PINS_PER_LIST) {
        const { data: existingItem } = await supabase
          .from('referral_list_items')
          .select('id')
          .eq('list_id', invite.list_id)
          .eq('pro_id', ownPro.id)
          .maybeSingle()

        if (!existingItem) {
          const { error: itemError } = await supabase.from('referral_list_items').insert({
            list_id: invite.list_id,
            pro_id: ownPro.id,
            note: null,
            sort_order: count || 0,
            consent_status: 'approved',
          })
          if (itemError) {
            console.error('[api/referral/invites/[token]/complete] list item insert error:', itemError)
          } else {
            listAdded = true
          }
        }
      } else {
        console.warn('[api/referral/invites/[token]/complete] list pin limit reached, skipping item insert:', invite.list_id)
      }
    } catch (listErr) {
      console.error('[api/referral/invites/[token]/complete] list item error:', listErr)
    }

    // 招待者へ通知(失敗しても登録完了自体は成功扱い)。
    try {
      const { data: inviterPro } = await supabase
        .from('professionals')
        .select('name, contact_email, line_messaging_user_id')
        .eq('id', invite.inviter_pro_id)
        .maybeSingle()

      if (inviterPro) {
        await notifyInviteRegistered(
          {
            name: inviterPro.name,
            contact_email: inviterPro.contact_email,
            line_messaging_user_id: inviterPro.line_messaging_user_id,
          },
          ownPro.name,
        )
      }
    } catch (notifyErr) {
      console.error('[api/referral/invites/[token]/complete] notify error:', notifyErr)
    }

    return NextResponse.json({ success: true, already: false, list_added: listAdded })
  } catch (err: any) {
    console.error('[api/referral/invites/[token]/complete] error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
