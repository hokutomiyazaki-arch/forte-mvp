/**
 * リフェラル系APIの共通「自分のプロ特定」ヘルパー。
 * /api/dashboard の Phase1 パターン（auth() → professionals を user_id で引く）を踏襲。
 * .maybeSingle() 必須・deactivated_at は null のみ有効。
 */

import crypto from 'crypto'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

/** §2-1: ピン指名は1リストあたり最大3名（人への保証の上限） */
export const MAX_REFERRAL_PINS_PER_LIST = 3

export interface OwnPro {
  id: string
  name: string
  contact_email: string | null
  line_messaging_user_id: string | null
}

/**
 * 認証済みユーザーの own professional を返す。
 * 未ログイン・プロ未登録・deactivated の場合は null。
 */
export async function getOwnPro(): Promise<OwnPro | null> {
  const { userId } = await auth()
  if (!userId) return null

  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('professionals')
    .select('id, name, contact_email, line_messaging_user_id, deactivated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data || data.deactivated_at) return null

  return {
    id: data.id,
    name: data.name,
    contact_email: data.contact_email,
    line_messaging_user_id: data.line_messaging_user_id,
  }
}

/**
 * 🔴1(再レビュー): 招待経由で登録したプロ(allowlist外)のオプトアウト手段確保。
 * allowlist外でも、共有リスト(visibility != 'private')に consent_status='approved' で
 * 1件以上掲載されていれば true を返す。受付状態(accepting_status)は本人だけが決める
 * 唯一のオプトアウト手段のため、この判定を accepting PATCH / ダッシュボードのウィジェット
 * 表示条件に使う（allowlist外でも自分の掲載状況だけは操作できるようにする）。
 * private(連携候補)リストへの掲載は含めない(POST /items が非privateのみを対象にする既存仕様と揃える)。
 */
export async function isPinnedOnSharedList(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  proId: string,
  opts?: { failOpenOnError?: boolean }
): Promise<boolean> {
  if (!proId) return false

  const { data: items, error: itemsError } = await supabase
    .from('referral_list_items')
    .select('list_id')
    .eq('pro_id', proId)
    .eq('consent_status', 'approved')

  if (itemsError) {
    console.error('[isPinnedOnSharedList] query error:', itemsError)
    return !!opts?.failOpenOnError
  }
  if (!items || items.length === 0) return false

  const listIds = Array.from(new Set((items as Array<{ list_id: string }>).map((i) => i.list_id)))
  if (listIds.length === 0) return false

  const { count, error: listsError } = await supabase
    .from('referral_lists')
    .select('id', { count: 'exact', head: true })
    .in('id', listIds)
    .neq('visibility', 'private')

  if (listsError) {
    console.error('[isPinnedOnSharedList] query error:', listsError)
    return !!opts?.failOpenOnError
  }
  return (count || 0) > 0
}

/**
 * 「気になるプロ」= 所有者の最古の private リスト。無ければ作る。
 *
 * §17-13(CEO指示 2026-08-06)でプロ招待QRからも同じ置き場所に入れる必要が出たため、
 * /api/referral/interested にあった実装をここへ移して単一情報源にした
 * （置き場所の判定が2箇所にあると、片方だけ直して「♡の判定と入る先がズレる」が起きる）。
 * 判定条件（owner_id × visibility='private' × created_at,id 昇順の1件目）は移設前と同じ。
 *
 * 新しい lib を作らず既存の referral-auth に置くのは、API ルートへの新規 import が
 * Webpack のチャンクグラフを変える既知のリスク(CLAUDE.md §G)を避けるため
 * （呼ぶ側は既に referral-auth を import している）。
 */
export async function getOrCreateInterestedList(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ownProId: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('referral_lists')
    .select('id')
    .eq('owner_id', ownProId)
    .eq('visibility', 'private')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existing) return existing.id

  const slug = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const { data: created, error } = await supabase
    .from('referral_lists')
    .insert({
      owner_id: ownProId,
      title: '気になるプロ',
      visibility: 'private',
      slug,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[referral-auth] getOrCreateInterestedList create error:', error)
    return null
  }
  return created?.id || null
}

/**
 * 「気になるプロ」に1人ピンする（冪等）。
 * 戻り値 added=false は「既に入っていた」= 通知を出してはいけないケース。
 * private リストなので consent_status='pending'（公開・通知を発生させない）で入れる — §3-1。
 */
export async function pinToInterestedList(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ownProId: string,
  targetProId: string
): Promise<{ added: boolean; listId: string | null; failed: boolean }> {
  const listId = await getOrCreateInterestedList(supabase, ownProId)
  if (!listId) return { added: false, listId: null, failed: true }

  const { data: existingItem } = await supabase
    .from('referral_list_items')
    .select('id')
    .eq('list_id', listId)
    .eq('pro_id', targetProId)
    .maybeSingle()

  if (existingItem) return { added: false, listId, failed: false }

  const { count } = await supabase
    .from('referral_list_items')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', listId)

  const { error } = await supabase.from('referral_list_items').insert({
    list_id: listId,
    pro_id: targetProId,
    sort_order: count || 0,
    consent_status: 'pending',
  })

  if (error) {
    console.error('[referral-auth] pinToInterestedList insert error:', error)
    return { added: false, listId, failed: true }
  }
  return { added: true, listId, failed: false }
}

export interface OwnClient {
  id: string
  nickname: string
}

/**
 * 認証済みユーザーの own client(clientsテーブルの行)を返す。無ければ null。
 * §2-4 予約リクエスト用。
 */
export async function getOwnClient(userId: string): Promise<OwnClient | null> {
  if (!userId) return null

  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('clients')
    .select('id, nickname')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null
  return { id: data.id, nickname: data.nickname }
}

/**
 * §4-2「登録は予約の瞬間のみ」: clients レコードが無い場合、予約リクエスト送信時に
 * その場で作成する（/onboarding への誘導はしない。/onboarding はプロ専用の文言・導線のため
 * 紹介経由のクライアントに見せると混乱を招く仮決定）。
 * 既存 /api/onboarding の clients insert ロジック（写真の永続化を除く軽量版）を踏襲。
 */
export async function ensureOwnClient(userId: string): Promise<OwnClient | null> {
  if (!userId) return null

  const existing = await getOwnClient(userId)
  if (existing) return existing

  const user = await currentUser()
  const clerkFirstName = user?.firstName || ''
  const clerkLastName = user?.lastName || ''
  let finalLastName = clerkLastName
  let finalFirstName = clerkFirstName
  if (!clerkLastName && clerkFirstName) {
    finalLastName = clerkFirstName
    finalFirstName = ''
  }
  const displayName = (finalLastName + ' ' + finalFirstName).trim() || user?.username || '未設定'

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('clients')
    .insert({
      user_id: userId,
      nickname: displayName,
      last_name: finalLastName || '未設定',
      first_name: finalFirstName,
    })
    .select('id, nickname')
    .maybeSingle()

  if (error) {
    console.error('[referral-auth] ensureOwnClient insert error:', error)
    return null
  }
  return data
}

/**
 * §2-4ステージ1(CEO決定・アカウントレス化): 未ログインでも予約リクエストを送れるように、
 * clients 行を user_id なしで作成する(ゲストクライアント)。永続的な同一人物識別は行わない
 * (毎回新規clients行を作る仮決定)。
 * レビューFAIL修正(重大1): nickname は受け手/送り手のAPI・通知・ダッシュボードに露出するため、
 * 実名は決済確認・確定まで開示しない(CEO決定)。よって実名を入れず固定文言にする
 * (受け手には requested 段階では「ご相談者さん」と表示される)。実名は
 * referral_bookings.client_name のみに保存する(clientsには保存しない)。
 */
export async function createGuestClient(): Promise<OwnClient | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('clients')
    .insert({
      user_id: null,
      nickname: 'ご相談者',
      last_name: 'ご相談者',
      first_name: '',
    })
    .select('id, nickname')
    .maybeSingle()

  if (error) {
    console.error('[referral-auth] createGuestClient insert error:', error)
    return null
  }
  return data
}
