import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { userId, professionalId, levelId, organizationId } = await req.json()

    if (!userId || !professionalId || !levelId || !organizationId) {
      return NextResponse.json({ error: 'パラメータが不足しています' }, { status: 400 })
    }

    // 1. プロの所有権確認
    const { data: proData } = await supabaseAdmin
      .from('professionals')
      .select('id, user_id')
      .eq('id', professionalId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!proData) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    // 2. バッジ（credential_level）の存在・有効性確認
    const { data: levelData } = await supabaseAdmin
      .from('credential_levels')
      .select('id, organization_id, claim_url_active')
      .eq('id', levelId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!levelData) {
      return NextResponse.json({ error: 'バッジが見つかりません' }, { status: 404 })
    }

    if (!levelData.claim_url_active) {
      return NextResponse.json({ error: 'このバッジの取得URLは無効です' }, { status: 400 })
    }

    // 3. 重複チェック
    const { data: existing } = await supabaseAdmin
      .from('org_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('professional_id', professionalId)
      .eq('credential_level_id', levelId)
      .eq('status', 'active')
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'このバッジは既に取得済みです' }, { status: 409 })
    }

    // 4. org_membersにレコード追加（status: active）
    const { error: insertError } = await supabaseAdmin
      .from('org_members')
      .insert({
        organization_id: organizationId,
        professional_id: professionalId,
        credential_level_id: levelId,
        status: 'active',
        accepted_at: new Date().toISOString(),
      })

    if (insertError) throw insertError

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'サーバーエラー' }, { status: 500 })
  }
}
