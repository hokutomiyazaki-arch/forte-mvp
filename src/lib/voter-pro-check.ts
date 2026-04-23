import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * 投票者がプロとして登録されているか判定する。
 *
 * 判定順序:
 *   1. Clerk user_id で professionals.user_id を検索（最も確実）
 *   2. normalized_email で professionals.contact_email を検索（フォールバック）
 *
 * @param normalizedEmail - 投票者の正規化メールアドレス
 * @param clerkUserId - Clerk の user_id（あれば）
 * @returns プロの場合は professional_id、そうでなければ null
 */
export async function checkVoterIsPro(
  normalizedEmail: string | null,
  clerkUserId: string | null
): Promise<string | null> {
  const supabase = getSupabaseAdmin()

  // 1. Clerk user_id で検索（最も確実）
  //    deactivated_at IS NULL を必須に — 削除済みプロが voter として紐付くバグ修正（2026-04-23）
  if (clerkUserId) {
    const { data: proByUserId } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', clerkUserId)
      .is('deactivated_at', null)
      .maybeSingle()

    if (proByUserId) return proByUserId.id
  }

  // 2. normalized_email で contact_email を検索（フォールバック）
  if (normalizedEmail) {
    const { data: proByEmail } = await supabase
      .from('professionals')
      .select('id')
      .eq('contact_email', normalizedEmail)
      .is('deactivated_at', null)
      .maybeSingle()

    if (proByEmail) return proByEmail.id
  }

  return null
}
