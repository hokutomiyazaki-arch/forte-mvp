import { auth } from '@clerk/nextjs/server'
import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  // 1. プロ情報を取得（プロ関連テーブル削除に必要）
  const { data: pro } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  // 2. クライアント情報を取得（client_rewards削除にemailが必要な場合）
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  // 3. DBからデータ削除（外部キー依存順序で削除）

  // マイプルーフ関連
  await supabase.from('my_proof_items').delete().eq('user_id', userId)
  await supabase.from('my_proof_cards').delete().eq('user_id', userId)

  // ブックマーク
  await supabase.from('bookmarks').delete().eq('user_id', userId)

  // 投票関連（votesテーブルは client_user_id カラム）
  await supabase.from('votes').delete().eq('client_user_id', userId)

  // プロ関連テーブル（professional_id で紐づく）
  if (pro) {
    await supabase.from('rewards').delete().eq('professional_id', pro.id)
    await supabase.from('qr_tokens').delete().eq('professional_id', pro.id)
    await supabase.from('nfc_cards').delete().eq('professional_id', pro.id)

    // 団体メンバーシップ
    await supabase.from('org_members').delete().eq('professional_id', pro.id)
  }

  // client_rewards（client_id で紐づく）
  if (client) {
    await supabase.from('client_rewards').delete().eq('client_id', client.id)
  }

  // メインテーブル
  await supabase.from('professionals').delete().eq('user_id', userId)
  await supabase.from('clients').delete().eq('user_id', userId)

  // 4. Clerkアカウント削除
  try {
    const clerk = await clerkClient()
    await clerk.users.deleteUser(userId)
  } catch (err) {
    // DB削除は完了しているので、Clerkの削除失敗はログのみ
    console.error('[api/account/delete] Clerk user deletion failed:', err)
  }

  return NextResponse.json({ success: true })
}
