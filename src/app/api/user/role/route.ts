import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

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
      // §17-13(2026-08-06): 呼び出し側(useProStatus)がプロのidを必要とするようになったため追加。
      // 既存フィールドは一切変えない(追加のみ)。自分のidなので開示上の問題は無い。
      proId: pro.id,
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
