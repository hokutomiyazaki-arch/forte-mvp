import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { VOICE_CARD_PRESETS } from '@/lib/voiceCardThemes'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/popup-suggestion
 *
 * v1.2 §12.6.1 シェア促進ポップアップの表示判定 + 提案データ生成。
 *
 * 発火優先順位:
 *   1. 達成記念チェック（最優先）  → popup_type='milestone'
 *   2. ランダム提案チェック
 *      a. popup_first_shown_at IS NULL → popup_type='first'
 *      b. popup_last_shown_at 以降の新着 Voice 5件以上 → popup_type='random'
 *
 * Voice 抽選プール:
 *   - 自分のプロ宛て (eq professional_id)
 *   - status='confirmed'
 *   - display_mode IN ('photo', 'nickname_only')
 *   - comment が non-empty（シェア対象として成立するもののみ）
 *   - 過去90日以内
 *   - popup_history に未記録
 *
 * 提案データ (v1.2.1 §12.4.2):
 *   - suggested_theme: { type: 'preset' | 'custom', preset, custom } オブジェクト
 *       プロが voice_card_theme を保存していればそれを優先（preset/custom そのまま）
 *       未保存ならランダム15色プリセット
 *   - suggested_phrase_id: gratitude_phrases.id（ランダム）
 *
 * レスポンスは Cache-Control: no-store。
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // ────────────────────────────────────────
    // 1. プロ情報取得（voice_card_theme もまとめて取得して N+1 を回避）
    // ────────────────────────────────────────
    const { data: pro } = await supabase
      .from('professionals')
      .select('id, popup_first_shown_at, popup_last_shown_at, voice_card_theme')
      .eq('user_id', userId)
      .is('deactivated_at', null)
      .maybeSingle()

    if (!pro) {
      return notShow('not_a_pro')
    }

    // ── デバッグログ（一時、本番で実値の型/内容を確認するため） ──
    // 'below_threshold' 誤発火の原因切り分け用。
    // 本番ログで pro state の実値・型を確認できたら削除する。
    console.log('[popup-suggestion] pro state:', {
      id: pro.id,
      popup_first_shown_at: pro.popup_first_shown_at,
      popup_first_shown_at_type: typeof pro.popup_first_shown_at,
      popup_last_shown_at: pro.popup_last_shown_at,
      popup_last_shown_at_type: typeof pro.popup_last_shown_at,
      voice_card_theme_type: typeof pro.voice_card_theme,
    })

    // pro が確定したら、テーマ抽選結果は popup_type に依らず同じ
    // （プロ保存テーマ優先 → 未保存ならランダム15色、v1.2.1 §確定 #13/#15）
    const suggestedTheme = pickThemeForPopup(pro.voice_card_theme)

    // ────────────────────────────────────────
    // 2. 達成記念チェック（最優先）
    // ────────────────────────────────────────
    const milestone = await checkMilestone(supabase, pro.id)
    if (milestone) {
      const phraseId = await pickRandomPhrase(supabase)
      return showResponse({
        popup_type: 'milestone',
        badge_event: milestone.badge,
        vote: milestone.vote,
        suggested_theme: suggestedTheme,
        suggested_phrase_id: phraseId,
      })
    }

    // ────────────────────────────────────────
    // 3. ランダム提案 — 初回判定
    //
    // 'below_threshold' 誤発火対策（defense in depth）:
    //   - `== null` (loose equality) で null と undefined を両方 catch
    //   - popup_last_shown_at も条件に含める。両者は popup-action で
    //     ペアでセットされる前提なので、片方だけ null は異常状態 →
    //     初回扱いに集約して threshold check に進ませない
    // ────────────────────────────────────────
    if (pro.popup_first_shown_at == null || pro.popup_last_shown_at == null) {
      const vote = await pickRandomEligibleVote(supabase, pro.id)
      if (!vote) return notShow('no_eligible_voice')
      const phraseId = await pickRandomPhrase(supabase)
      return showResponse({
        popup_type: 'first',
        badge_event: null,
        vote,
        suggested_theme: suggestedTheme,
        suggested_phrase_id: phraseId,
      })
    }

    // ────────────────────────────────────────
    // 4. 5件閾値チェック（前回ポップアップ以降の新着 Voice）
    // ────────────────────────────────────────
    const { count: newVoteCount } = await supabase
      .from('votes')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', pro.id)
      .eq('status', 'confirmed')
      .in('display_mode', ['photo', 'nickname_only'])
      .gt('created_at', pro.popup_last_shown_at)

    if ((newVoteCount ?? 0) < 5) {
      return notShow('below_threshold')
    }

    // ────────────────────────────────────────
    // 5. ランダム抽選
    // ────────────────────────────────────────
    const vote = await pickRandomEligibleVote(supabase, pro.id)
    if (!vote) return notShow('no_eligible_voice')

    const phraseId = await pickRandomPhrase(supabase)
    return showResponse({
      popup_type: 'random',
      badge_event: null,
      vote,
      suggested_theme: suggestedTheme,
      suggested_phrase_id: phraseId,
    })
  } catch (err: any) {
    console.error('[popup-suggestion] error:', err)
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    )
  }
}

// ────────────────────────────────────────────────────────────────
// ヘルパー: レスポンス
// ────────────────────────────────────────────────────────────────

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const

/**
 * 提案テーマ（v1.2.1 §12.4.2）
 *
 *   type='preset': preset に preset 名（"Cream" / "Sunset" 等）、custom は null
 *   type='custom': preset は null、custom に bg/text/accent + showProof/showProInfo
 *
 * フロントは type で分岐し、preset 名なら VOICE_CARD_PRESETS から復元、
 * custom なら buildCustomTheme(...) で復元する想定。
 */
interface SuggestedTheme {
  type: 'preset' | 'custom'
  preset: string | null
  custom: {
    bg: string
    text: string
    accent: string
    showProof: boolean
    showProInfo: boolean
  } | null
}

function showResponse(body: {
  popup_type: 'random' | 'milestone' | 'first'
  badge_event: 'PROVEN' | 'SPECIALIST' | 'MASTER' | null
  vote: any
  suggested_theme: SuggestedTheme
  suggested_phrase_id: number | null
}) {
  return NextResponse.json(
    { should_show: true, ...body },
    { headers: NO_STORE_HEADERS }
  )
}

function notShow(
  reason: 'no_eligible_voice' | 'below_threshold' | 'no_milestone' | 'not_a_pro'
) {
  return NextResponse.json(
    { should_show: false, reason },
    { headers: NO_STORE_HEADERS }
  )
}

// ────────────────────────────────────────────────────────────────
// ヘルパー: 抽選
// ────────────────────────────────────────────────────────────────

/**
 * テーマ抽選 (v1.2.1 §12.4.2 §確定 #13/#15):
 *
 *   1. プロが voice_card_theme に preset を保存していれば、それを優先
 *   2. プロが voice_card_theme に custom を保存していれば、それをそのまま提示
 *   3. 未保存（NULL）or 不正なデータならランダム15色
 *
 * 非破壊で動作することを最優先（NULL や欠落を全て random に fallback）。
 */
function pickThemeForPopup(savedTheme: any): SuggestedTheme {
  // (1) preset 保存
  if (
    savedTheme &&
    savedTheme.type === 'preset' &&
    typeof savedTheme.preset === 'string' &&
    savedTheme.preset.length > 0
  ) {
    return {
      type: 'preset',
      preset: savedTheme.preset,
      custom: null,
    }
  }

  // (2) custom 保存（bg/text/accent が全て埋まっている時のみ）
  if (
    savedTheme &&
    savedTheme.type === 'custom' &&
    typeof savedTheme.bg === 'string' &&
    savedTheme.bg.length > 0 &&
    typeof savedTheme.text === 'string' &&
    savedTheme.text.length > 0 &&
    typeof savedTheme.accent === 'string' &&
    savedTheme.accent.length > 0
  ) {
    return {
      type: 'custom',
      preset: null,
      custom: {
        bg: savedTheme.bg,
        text: savedTheme.text,
        accent: savedTheme.accent,
        // showProof / showProInfo は未指定なら true（VoiceShareCard の初期値と一致）
        showProof: savedTheme.showProof !== false,
        showProInfo: savedTheme.showProInfo !== false,
      },
    }
  }

  // (3) 未保存 or 不正データ: ランダム15色
  const idx = Math.floor(Math.random() * VOICE_CARD_PRESETS.length)
  return {
    type: 'preset',
    preset: VOICE_CARD_PRESETS[idx].name,
    custom: null,
  }
}

/**
 * 感謝フレーズ抽選: gratitude_phrases から全件取得してランダム1件。
 * is_active カラムは存在しないためフィルタなし。
 * 該当データが空なら null を返す（フロントは default フレーズで補完）。
 */
async function pickRandomPhrase(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<number | null> {
  const { data } = await supabase
    .from('gratitude_phrases')
    .select('id')

  if (!data || data.length === 0) return null
  const idx = Math.floor(Math.random() * data.length)
  return data[idx].id as number
}

/**
 * Voice 抽選プールから 1 件ランダムに取得。
 *
 * 条件:
 *   - そのプロ宛て (status='confirmed')
 *   - display_mode IN ('photo', 'nickname_only')
 *   - comment が non-empty（シェア対象として成立する Voice）
 *   - 過去90日以内
 *   - popup_history に未記録
 *
 * 戻り値: VoiceCommentCard が消費可能な形（voter_pro / voter_vote_count 付き、
 *         normalized_email / voter_professional_id は除外）
 */
async function pickRandomEligibleVote(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  proId: string
) {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  // popup_history で除外する vote_id を一括取得
  const { data: shownHistory } = await supabase
    .from('popup_history')
    .select('vote_id')
    .eq('professional_id', proId)

  const shownVoteIds = new Set(
    (shownHistory || []).map((h: any) => h.vote_id as string)
  )

  // 候補取得（popup_history 除外は JS 側で行う:
  // PostgREST の .not('id', 'in', ...) は配列構文の edge case があるため）
  const { data: candidates } = await supabase
    .from('votes')
    .select(
      'id, comment, created_at, display_mode, client_photo_url, auth_display_name, voter_professional_id, normalized_email'
    )
    .eq('professional_id', proId)
    .eq('status', 'confirmed')
    .in('display_mode', ['photo', 'nickname_only'])
    .not('comment', 'is', null)
    .neq('comment', '')
    .gte('created_at', ninetyDaysAgo.toISOString())

  const eligible = (candidates || []).filter(c => !shownVoteIds.has(c.id))
  if (eligible.length === 0) return null

  const pick = eligible[Math.floor(Math.random() * eligible.length)] as {
    id: string
    comment: string
    created_at: string
    display_mode: string | null
    client_photo_url: string | null
    auth_display_name: string | null
    voter_professional_id: string | null
    normalized_email: string | null
  }

  // voter_vote_count: このプロ宛ての同一 normalized_email 投票数
  // VoiceCommentCard が「常連 / リピーター」バッジ表示に使用するため整える
  let voter_vote_count = 1
  if (pick.normalized_email) {
    const { count } = await supabase
      .from('votes')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', proId)
      .eq('status', 'confirmed')
      .eq('normalized_email', pick.normalized_email)
    voter_vote_count = count ?? 1
  }

  // voter_pro 解決（display_mode が photo/nickname_only でも voter_professional_id が
  // non-null な可能性はある — 投票者プロが photo/nickname を選んだ場合）
  let voter_pro: {
    id: string
    name: string
    title: string | null
    photo_url: string | null
  } | null = null
  if (pick.voter_professional_id) {
    const { data: vp } = await supabase
      .from('professionals')
      .select('id, name, title, photo_url')
      .eq('id', pick.voter_professional_id)
      .is('deactivated_at', null)
      .maybeSingle()
    voter_pro = vp || null
  }

  // ★ PII 除外: normalized_email / voter_professional_id を外す
  const { normalized_email, voter_professional_id, ...safe } = pick
  return {
    ...safe,
    voter_pro,
    voter_vote_count,
  }
}

/**
 * 達成記念チェック（仮実装）
 *
 * 想定される本実装（Phase 4-2 内の別タスクで詰める）:
 *   1. このプロが org_members 経由で持っている credential_levels.name を取得
 *      （Phase A 報告書: src/app/api/dashboard/route.ts:160-166 参照）
 *   2. その credential_level に対応する popup_history が
 *      (popup_type='milestone', badge_event = 当該レベル名) で既存かチェック
 *   3. 未提示の達成記念があれば、直近の eligible vote を 1 件取得して
 *      { badge: 'PROVEN' | 'SPECIALIST' | 'MASTER', vote: ... } を返す
 *
 * 関連ロジック:
 *   - org_members の credential_level_id 付与（バッジ取得）
 *   - certification_applications（Lv.2 SPECIALIST 昇格申請）
 *
 * 仮実装方針: 常に null を返してミルストーンチェックをスキップ。
 *             ランダム提案ロジックの動作確認を優先する。
 */
async function checkMilestone(
  _supabase: ReturnType<typeof getSupabaseAdmin>,
  _proId: string
): Promise<{ badge: 'PROVEN' | 'SPECIALIST' | 'MASTER'; vote: any } | null> {
  return null
}
