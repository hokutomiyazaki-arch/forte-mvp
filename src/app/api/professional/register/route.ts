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

    // 既存NFCカードにprofessional_idを自動セット
    await supabase.from('nfc_cards')
      .update({ professional_id: existingPro.id, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')

    return NextResponse.json({ success: true, action: 'reactivated' })
  }

  // 新規作成 — clientsからlast_name/first_nameを取得してコピー
  const user = await currentUser()
  const clerkImageUrl = user?.imageUrl || null

  const { data: clientData } = await supabase
    .from('clients')
    .select('last_name, first_name')
    .eq('user_id', userId)
    .maybeSingle()

  const lastName = clientData?.last_name || ''
  const firstName = clientData?.first_name || ''
  const fullName = lastName && firstName ? `${lastName} ${firstName}` : (user?.firstName || user?.username || '')

  const { data: newPro } = await supabase.from('professionals').insert({
    user_id: userId,
    name: fullName, // name は NOT NULL
    last_name: lastName || null,
    first_name: firstName || null,
    title: '', // title は NOT NULL、ダッシュボードで後から設定
    photo_url: clerkImageUrl,
  }).select('id').maybeSingle()

  if (newPro) {
    // 既存NFCカードにprofessional_idを自動セット
    await supabase.from('nfc_cards')
      .update({ professional_id: newPro.id, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')

    // org_membersにuser_idで仮登録されたレコードのprofessional_idを自動補完
    await supabase.from('org_members')
      .update({ professional_id: newPro.id })
      .eq('user_id', userId)
      .is('professional_id', null)
  }

  return NextResponse.json({ success: true, action: 'created' })
}
