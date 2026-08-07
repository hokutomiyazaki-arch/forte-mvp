import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro, pinToInterestedList } from '@/lib/referral-auth'
import { notifyProInviteRegistered } from '@/lib/referral-notify'

export const dynamic = 'force-dynamic'

/**
 * POST /api/referral/pro-invite/[proId]
 * §17-13(CEO指示 2026-08-06): プロ招待QR（紹介タブ・気になるプロの先頭に常設）から来た人が
 * 登録を完了したときの処理。
 *
 * 既存の招待（/invite/[token]）との違い:
 *   - 招待トークンは **1人1回**（referral_invites.registered_pro_id・list_id は NOT NULL）で、
 *     指定した紹介リストに載せる導線。目の前の1人に渡すもの。
 *   - このQRは **1枚を何人にでも見せる**もの。だから referral_invites は使えないし、
 *     使ってはいけない（誰が読むか分からないQRで公開の紹介リストが勝手に増える）。
 *
 * CEO決定:
 *   「トップのqrから登録したら、気になるプロだけに入るようにして。だけど、メールかLINEで
 *     ○○さんが登録しました。紹介リストにいれましょうの通知が行くように。」
 *   → 入る先は**非公開の「気になるプロ」だけ**。公開の紹介リストに載せるかは持ち主が決める。
 *     決められるように、登録の瞬間に通知を出す。
 *
 * 新規テーブルは作らない（気になるプロ = 既存の非公開 referral_lists 行）。SQLも不要。
 */
export async function POST(_request: Request, { params }: { params: { proId: string } }) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      // 未ログイン、またはprofessionalsレコードがまだ無い(オンボーディング未完了)。
      // 呼び出し側(ProInviteAcceptPanel)でサインアップ/オンボーディング導線を出す。
      return NextResponse.json({ error: 'no_professional_profile' }, { status: 409 })
    }

    const inviterProId = params.proId
    if (!inviterProId) {
      return NextResponse.json({ error: 'pro_id_required' }, { status: 400 })
    }
    if (inviterProId === ownPro.id) {
      // 自分のQRを自分で読んだ。何もしない（自分を自分の気になるプロに入れない）。
      return NextResponse.json({ error: 'self_invite_not_allowed' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: inviterPro } = await supabase
      .from('professionals')
      .select('id, name, contact_email, line_messaging_user_id, deactivated_at')
      .eq('id', inviterProId)
      .maybeSingle()

    if (!inviterPro || inviterPro.deactivated_at) {
      return NextResponse.json({ error: 'inviter_not_found' }, { status: 404 })
    }

    // ① QRの持ち主の「気になるプロ」に、登録した本人を入れる（CEO指示の本体）。
    const ownerSide = await pinToInterestedList(supabase, inviterPro.id, ownPro.id)

    // ② 登録した側の「気になるプロ」にも、QRの持ち主を入れる。
    //    片側だけだと、読んだ本人の画面には何も起きず「登録して終わり」になる。
    //    どちらも非公開なので、勝手に公開されることはない。
    const scannerSide = await pinToInterestedList(supabase, ownPro.id, inviterPro.id)
    if (scannerSide.failed) {
      console.error('[api/referral/pro-invite] scanner side pin failed:', ownPro.id, inviterPro.id)
    }

    // ③ 通知は**新しく入った時だけ**。開き直し・LINE内蔵ブラウザの2回発火で
    //    同じ通知が何度も飛ぶのを防ぐ（冪等）。通知の失敗は登録の失敗にしない。
    let notified = false
    if (ownerSide.added) {
      try {
        const result = await notifyProInviteRegistered(
          {
            name: inviterPro.name,
            contact_email: inviterPro.contact_email,
            line_messaging_user_id: inviterPro.line_messaging_user_id,
          },
          ownPro.name,
        )
        notified = result.sent
      } catch (notifyErr) {
        console.error('[api/referral/pro-invite] notify error:', notifyErr)
      }
    }

    return NextResponse.json({
      success: true,
      already: !ownerSide.added,
      notified,
      inviter_name: inviterPro.name,
    })
  } catch (err: any) {
    console.error('[api/referral/pro-invite] error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
