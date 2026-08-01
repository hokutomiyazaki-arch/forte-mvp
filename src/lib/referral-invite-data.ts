/**
 * §2-9 招待ランディング(/invite/[token])のデータ取得。
 * /r/[slug] (src/lib/referral-data.ts) と同じ流儀：Server Componentから直接呼ぶ集約関数・
 * getSupabaseAdmin・.maybeSingle()。
 *
 * fail-soft: booking_messages/referral_invites は migration 031 が未反映の環境でも
 * ページ自体は落とさない(取得失敗時は null を返し、ページ側で汎用エラー表示)。
 */

import { getSupabaseAdmin } from '@/lib/supabase'

export interface InviteData {
  token: string
  inviteeName: string
  /** 既に登録完了済みか(registered_pro_id が入っている) */
  alreadyRegistered: boolean
  inviter: {
    id: string
    name: string
  }
}

export async function getInviteByToken(token: string): Promise<InviteData | null> {
  if (!token) return null

  try {
    const supabase = getSupabaseAdmin()
    const { data: invite, error } = await supabase
      .from('referral_invites')
      .select('id, invitee_name, invite_token, inviter_pro_id, registered_pro_id')
      .eq('invite_token', token)
      .maybeSingle()

    if (error) {
      console.error('[referral-invite-data] fetch error (fail-soft):', error)
      return null
    }
    if (!invite) return null

    const { data: inviter } = await supabase
      .from('professionals')
      .select('id, name, deactivated_at')
      .eq('id', invite.inviter_pro_id)
      .maybeSingle()

    if (!inviter || inviter.deactivated_at) return null

    return {
      token: invite.invite_token,
      inviteeName: invite.invitee_name,
      alreadyRegistered: !!invite.registered_pro_id,
      inviter: { id: inviter.id, name: inviter.name },
    }
  } catch (err) {
    console.error('[referral-invite-data] error (fail-soft):', err)
    return null
  }
}
