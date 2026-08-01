/**
 * リフェラル系APIの共通「自分のプロ特定」ヘルパー。
 * /api/dashboard の Phase1 パターン（auth() → professionals を user_id で引く）を踏襲。
 * .maybeSingle() 必須・deactivated_at は null のみ有効。
 */

import { auth } from '@clerk/nextjs/server'
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
