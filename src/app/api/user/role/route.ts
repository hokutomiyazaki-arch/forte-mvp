import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ isPro: false, isClient: false })
  }

  const supabase = getSupabaseAdmin()

  const [proResult, clientResult] = await Promise.all([
    supabase.from('professionals')
      .select('id, photo_url')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('clients')
      .select('id, photo_url')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const pro = proResult.data
  const client = clientResult.data

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

  return NextResponse.json({
    isPro: !!pro,
    isClient: !!client,
  })
}
