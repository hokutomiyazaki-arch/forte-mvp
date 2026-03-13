import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await currentUser()
  const body = await request.json()
  const { role, last_name, first_name, store_name } = body

  if (!role || !['client', 'professional'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // バリデーション: 姓名必須、各20文字以内
  if (!last_name?.trim() || !first_name?.trim()) {
    return NextResponse.json({ error: '姓と名は必須です' }, { status: 400 })
  }
  if (last_name.trim().length > 20 || first_name.trim().length > 20) {
    return NextResponse.json({ error: '姓名は各20文字以内で入力してください' }, { status: 400 })
  }
  if (store_name && store_name.trim().length > 50) {
    return NextResponse.json({ error: '店舗名は50文字以内で入力してください' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const clerkImageUrl = user?.imageUrl || null
  const trimmedLastName = last_name.trim()
  const trimmedFirstName = first_name.trim()
  const fullName = `${trimmedLastName} ${trimmedFirstName}`

  // 全員 clients レコードを作成
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!existingClient) {
    await supabase.from('clients').insert({
      user_id: userId,
      nickname: fullName, // nickname は NOT NULL（トリガーでlast_name+first_nameから同期）
      last_name: trimmedLastName,
      first_name: trimmedFirstName,
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
        name: fullName, // name は NOT NULL（トリガーでlast_name+first_nameから同期）
        last_name: trimmedLastName,
        first_name: trimmedFirstName,
        store_name: store_name?.trim() || null,
        title: '', // title は NOT NULL、ダッシュボードで後から設定
        photo_url: clerkImageUrl,
      })
    }
  }

  return NextResponse.json({ success: true, role })
}
