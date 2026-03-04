import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ isPro: false, isClient: false, role: null })
  }

  const supabase = getSupabaseAdmin()

  // professionals と clients を並列取得
  const [{ data: pro }, { data: client }] = await Promise.all([
    supabase.from('professionals')
      .select('id, deactivated_at')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('clients')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  // ロール判定
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
    return NextResponse.json({
      role: null,
      isPro: false,
      isClient: false,
    })
  }
}
