import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ isPro: false, isClient: false, role: null })
  }

  const supabase = getSupabaseAdmin()

  // professionals テーブルを確認（deactivated_at も取得）
  const { data: pro } = await supabase
    .from('professionals')
    .select('id, photo_url, deactivated_at')
    .eq('user_id', userId)
    .maybeSingle()

  // clients テーブルを確認
  const { data: client } = await supabase
    .from('clients')
    .select('id, photo_url')
    .eq('user_id', userId)
    .maybeSingle()

  // LINE/Googleプロフ画像のデフォルト反映
  // photo_urlがNULLの場合のみClerk画像をセット
  try {
    const user = await currentUser()
    const clerkImageUrl = user?.imageUrl || null

    if (clerkImageUrl) {
      if (pro && !pro.photo_url) {
        await supabase.from('professionals')
          .update({ photo_url: clerkImageUrl })
          .eq('user_id', userId)
          .is('photo_url', null)
      }

      if (client && !client.photo_url) {
        await supabase.from('clients')
          .update({ photo_url: clerkImageUrl })
          .eq('user_id', userId)
          .is('photo_url', null)
      }
    }
  } catch (e) {
    // 画像反映に失敗しても、ロール判定は返す
    console.error('[api/user/role] image fallback error:', e)
  }

  // ロール判定: role フィールド追加 + 既存 isPro/isClient 維持
  if (pro && !pro.deactivated_at) {
    return NextResponse.json({
      role: 'professional',
      isPro: true,
      isClient: !!client,
    })
  } else if (client) {
    return NextResponse.json({
      role: 'client',
      isPro: false,
      isClient: true,
      proDeactivated: !!pro,
    })
  } else {
    // DBにレコードなし → onboardingが必要
    return NextResponse.json({
      role: null,
      isPro: false,
      isClient: false,
    })
  }
}
