import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await currentUser()
  const body = await request.json()
  const { role } = body

  if (!role || !['client', 'professional'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const clerkImageUrl = user?.imageUrl || null
  const clerkLastName = user?.lastName || ''
  const clerkFirstName = user?.firstName || ''
  const clerkFullName = (clerkLastName + ' ' + clerkFirstName).trim()
  const displayName = clerkFullName || user?.username || '未設定'

  // 全員 clients レコードを作成
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!existingClient) {
    await supabase.from('clients').insert({
      user_id: userId,
      nickname: displayName,
      last_name: clerkLastName || '未設定',
      first_name: clerkFirstName || '',
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
        name: displayName, // /setup の Step 1 で上書き
        last_name: clerkLastName || '未設定',
        first_name: clerkFirstName || '',
        store_name: null,
        title: '', // /setup の Step 1 で上書き
        photo_url: clerkImageUrl,
      })
    }
  }

  return NextResponse.json({ success: true, role })
}
