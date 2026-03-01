import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await currentUser()
  const body = await request.json()
  const { role } = body // 'client' or 'professional'

  if (!role || !['client', 'professional'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const clerkImageUrl = user?.imageUrl || null
  const displayName = user?.firstName || user?.username || ''

  // 全員 clients レコードを作成
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!existingClient) {
    await supabase.from('clients').insert({
      user_id: userId,
      nickname: displayName || 'ユーザー', // nickname は NOT NULL
      photo_url: clerkImageUrl,
    })
  }

  // professional を選んだ場合は professionals レコードも作成
  if (role === 'professional') {
    const { data: existingPro } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (!existingPro) {
      await supabase.from('professionals').insert({
        user_id: userId,
        name: displayName || '', // name は NOT NULL
        title: '', // title は NOT NULL、ダッシュボードで後から設定
        photo_url: clerkImageUrl,
      })
    }
  }

  return NextResponse.json({ success: true, role })
}
