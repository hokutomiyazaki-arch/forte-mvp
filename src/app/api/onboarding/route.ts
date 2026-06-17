import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { persistExternalImage } from '@/lib/server-image'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await currentUser()
  const body = await request.json()
  const { role } = body

  if (role !== 'professional') {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const clerkImageUrl = user?.imageUrl || null
  const clerkFirstName = user?.firstName || ''
  const clerkLastName = user?.lastName || ''
  // LINE等で姓が取れない場合、firstName にフルネーム全体が入ってる
  // その場合は firstName を last_name に入れて、first_name は空にする
  let finalLastName = clerkLastName
  let finalFirstName = clerkFirstName
  if (!clerkLastName && clerkFirstName) {
    finalLastName = clerkFirstName
    finalFirstName = ''
  }
  const displayName = (finalLastName + ' ' + finalFirstName).trim() || user?.username || '未設定'

  // clients レコードを作成(プロも含む / 名前同期用 / TODO: clients テーブル廃止STOPで見直し予定)
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!existingClient) {
    // Clerk の揮発URLを Storage(avatars) にコピー。professionals とは衝突しないキーで保存。
    const persistedClientPhotoUrl = await persistExternalImage({
      sourceUrl: clerkImageUrl,
      bucket: 'avatars',
      path: `${userId}/client-avatar.jpg`,
      cacheBust: true,
    })
    await supabase.from('clients').insert({
      user_id: userId,
      nickname: displayName,
      last_name: finalLastName || '未設定',
      first_name: finalFirstName,
      photo_url: persistedClientPhotoUrl,
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
      // Clerk の揮発URLを Storage(avatars) にコピーして永続化。
      const persistedProPhotoUrl = await persistExternalImage({
        sourceUrl: clerkImageUrl,
        bucket: 'avatars',
        path: `${userId}/avatar.jpg`,
        cacheBust: true,
      })
      const { data: newPro } = await supabase.from('professionals').insert({
        user_id: userId,
        name: displayName, // /setup の Step 1 で上書き
        last_name: finalLastName || '未設定',
        first_name: finalFirstName,
        store_name: null,
        title: '', // /setup の Step 1 で上書き
        photo_url: persistedProPhotoUrl,
      }).select('id').maybeSingle()

      // org_membersにuser_idで仮登録されたレコードのprofessional_idを自動補完
      if (newPro) {
        await supabase.from('org_members')
          .update({ professional_id: newPro.id })
          .eq('user_id', userId)
          .is('professional_id', null)
      }
    }
  }

  return NextResponse.json({ success: true, role })
}
