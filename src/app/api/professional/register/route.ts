import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  // 既にプロ登録があるか確認
  const { data: existingPro } = await supabase
    .from('professionals')
    .select('id, deactivated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (existingPro && !existingPro.deactivated_at) {
    // 既にアクティブなプロ
    return NextResponse.json({ success: true, action: 'already_active' })
  }

  if (existingPro && existingPro.deactivated_at) {
    // 解除済み → 再アクティベート
    await supabase.from('professionals')
      .update({ deactivated_at: null })
      .eq('user_id', userId)
    return NextResponse.json({ success: true, action: 'reactivated' })
  }

  // 新規作成
  const user = await currentUser()
  const clerkImageUrl = user?.imageUrl || null
  const displayName = user?.firstName || user?.username || ''

  await supabase.from('professionals').insert({
    user_id: userId,
    name: displayName || '', // name は NOT NULL
    title: '', // title は NOT NULL、ダッシュボードで後から設定
    photo_url: clerkImageUrl,
  })

  return NextResponse.json({ success: true, action: 'created' })
}
