/**
 * リフェラル系APIの共通「自分のプロ特定」ヘルパー。
 * /api/dashboard の Phase1 パターン（auth() → professionals を user_id で引く）を踏襲。
 * .maybeSingle() 必須・deactivated_at は null のみ有効。
 */

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
