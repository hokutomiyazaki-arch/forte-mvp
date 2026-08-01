import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import { isReferralEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

const SHARE_ORIGIN = 'https://realproof.jp'
const MAX_PENDING_INVITES_PER_INVITER = 10
const MAX_INVITEE_NAME_LEN = 100

/** 招待トークンは推測不能な英数24桁(処方箋リストslugの12桁パターンを踏襲・より長く)。 */
function generateInviteToken(): string {
  return (crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')).slice(0, 24)
}

/**
 * POST /api/referral/invites
 * body: { list_id, invitee_name }
 * §2-9: 処方箋リスト作成時に、RP未登録のプロを招待する。isReferralEnabledでゲート
 * （リスト作成者=送り手側の機能）。未登録招待(registered_pro_id IS NULL)が
 * 既に10件あれば429（乱発防止）。
 */
export async function POST(request: NextRequest) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const listId = typeof body.list_id === 'string' ? body.list_id : ''
    const inviteeName = typeof body.invitee_name === 'string' ? body.invitee_name.trim().slice(0, MAX_INVITEE_NAME_LEN) : ''

    if (!listId || !inviteeName) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: list } = await supabase
      .from('referral_lists')
      .select('id, owner_id')
      .eq('id', listId)
      .maybeSingle()

    if (!list || list.owner_id !== ownPro.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // §2-9: 未登録招待の同時保留は1人(招待者)あたり10件まで。全リスト横断でカウントする。
    const { count } = await supabase
      .from('referral_invites')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_pro_id', ownPro.id)
      .is('registered_pro_id', null)

    if ((count || 0) >= MAX_PENDING_INVITES_PER_INVITER) {
      return NextResponse.json({ error: 'too_many_pending_invites' }, { status: 429 })
    }

    const inviteToken = generateInviteToken()

    const { data: invite, error } = await supabase
      .from('referral_invites')
      .insert({
        list_id: listId,
        inviter_pro_id: ownPro.id,
        invitee_name: inviteeName,
        invite_token: inviteToken,
      })
      .select('id, list_id, invitee_name, invite_token, registered_pro_id, created_at, registered_at')
      .maybeSingle()

    if (error) {
      console.error('[api/referral/invites] POST insert error:', error)
      return NextResponse.json({ error: 'failed_to_create' }, { status: 500 })
    }

    return NextResponse.json({
      invite,
      invite_url: `${SHARE_ORIGIN}/invite/${inviteToken}`,
    })
  } catch (err: any) {
    console.error('[api/referral/invites] POST error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
