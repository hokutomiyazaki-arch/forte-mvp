import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const

const VALID_POPUP_TYPES = ['random', 'milestone', 'first'] as const
const VALID_USER_ACTIONS = ['shared', 'edited', 'dismissed'] as const
const VALID_BADGE_EVENTS = ['PROVEN', 'SPECIALIST', 'MASTER'] as const

type PopupType = typeof VALID_POPUP_TYPES[number]
type UserAction = typeof VALID_USER_ACTIONS[number]
type BadgeEvent = typeof VALID_BADGE_EVENTS[number]

/**
 * POST /api/dashboard/popup-action
 *
 * v1.2 §12.6.2 シェア促進ポップアップのユーザーアクションを記録する。
 *
 * Body:
 *   {
 *     vote_id: UUID,
 *     popup_type: 'random' | 'milestone' | 'first',
 *     badge_event: 'PROVEN' | 'SPECIALIST' | 'MASTER' | null,
 *     user_action: 'shared' | 'edited' | 'dismissed'
 *   }
 *
 * 処理:
 *   1. popup_history に INSERT
 *   2. professionals.popup_last_shown_at を now() で更新
 *      popup_first_shown_at が NULL なら同時に now() で埋める（初回フラグ）
 *
 * 所有権:
 *   vote_id の vote が呼び出し元プロのものでなければ 404
 *
 * 冪等性なし:
 *   同じ vote_id で複数回 INSERT 可能。フロント側で重複防止する想定。
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Clerk 認証
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. リクエストボディの取得・検証
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Bad Request', reason: 'invalid json body' },
        { status: 400 }
      )
    }

    const { vote_id, popup_type, badge_event, user_action } = body as {
      vote_id?: unknown
      popup_type?: unknown
      badge_event?: unknown
      user_action?: unknown
    }

    if (typeof vote_id !== 'string' || vote_id === '') {
      return NextResponse.json(
        { error: 'Bad Request', reason: 'missing or invalid vote_id' },
        { status: 400 }
      )
    }
    if (
      typeof popup_type !== 'string' ||
      !(VALID_POPUP_TYPES as readonly string[]).includes(popup_type)
    ) {
      return NextResponse.json(
        { error: 'Bad Request', reason: 'invalid popup_type' },
        { status: 400 }
      )
    }
    if (
      typeof user_action !== 'string' ||
      !(VALID_USER_ACTIONS as readonly string[]).includes(user_action)
    ) {
      return NextResponse.json(
        { error: 'Bad Request', reason: 'invalid user_action' },
        { status: 400 }
      )
    }
    // badge_event は null 許容、文字列なら enum チェック
    if (
      badge_event !== null &&
      badge_event !== undefined &&
      (typeof badge_event !== 'string' ||
        !(VALID_BADGE_EVENTS as readonly string[]).includes(badge_event))
    ) {
      return NextResponse.json(
        { error: 'Bad Request', reason: 'invalid badge_event' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    // 3. プロ情報取得
    const { data: pro, error: proError } = await supabase
      .from('professionals')
      .select('id, popup_first_shown_at')
      .eq('user_id', userId)
      .is('deactivated_at', null)
      .maybeSingle()

    if (proError) throw proError
    if (!pro) {
      return NextResponse.json(
        { error: 'Unauthorized', reason: 'not a pro' },
        { status: 401 }
      )
    }

    // 4. vote の存在 + 所有権チェック
    //    別プロの vote を popup_history に登録できないよう必ず照合する
    const { data: vote, error: voteError } = await supabase
      .from('votes')
      .select('id, professional_id')
      .eq('id', vote_id)
      .maybeSingle()

    if (voteError) throw voteError
    if (!vote || vote.professional_id !== pro.id) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }

    // 5. popup_history に INSERT
    //    shown_at は DEFAULT now() に任せる
    const { error: insertError } = await supabase
      .from('popup_history')
      .insert({
        professional_id: pro.id,
        vote_id,
        popup_type: popup_type as PopupType,
        user_action: user_action as UserAction,
        badge_event: (badge_event ?? null) as BadgeEvent | null,
      })

    if (insertError) {
      console.error('[popup-action] insert error:', insertError)
      return NextResponse.json(
        { error: 'Internal Server Error', reason: insertError.message },
        { status: 500 }
      )
    }

    // 6. professionals の popup_*_shown_at を更新
    //    popup_first_shown_at は NULL の時だけ埋める（初回フラグ）
    //    popup_last_shown_at は毎回 now() に更新
    const now = new Date().toISOString()
    const updates: { popup_last_shown_at: string; popup_first_shown_at?: string } = {
      popup_last_shown_at: now,
    }
    if (pro.popup_first_shown_at === null) {
      updates.popup_first_shown_at = now
    }

    const { error: updateError } = await supabase
      .from('professionals')
      .update(updates)
      .eq('id', pro.id)

    if (updateError) {
      console.error('[popup-action] update error:', updateError)
      return NextResponse.json(
        { error: 'Internal Server Error', reason: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true },
      { headers: NO_STORE_HEADERS }
    )
  } catch (err: any) {
    console.error('[popup-action] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal error' },
      { status: 500 }
    )
  }
}
