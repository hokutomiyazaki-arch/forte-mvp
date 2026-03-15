import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ organizations: [] })
    }

    const supabase = getSupabaseAdmin()

    // 1. professionals テーブルから professional_id を取得（プロ会員の場合）
    const { data: proData } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    const professionalId = proData?.id || null

    // 2. org_members を検索（プロ: professional_id、一般: user_id）
    let allMemberships: any[] = []

    if (professionalId) {
      const { data: proMemberships } = await supabase
        .from('org_members')
        .select('organization_id, credential_level_id')
        .eq('professional_id', professionalId)
        .eq('status', 'active')
      allMemberships = proMemberships || []
    }

    // 一般会員としての所属も検索（user_id で）
    const { data: generalMemberships } = await supabase
      .from('org_members')
      .select('organization_id, credential_level_id')
      .eq('user_id', userId)
      .is('professional_id', null)
      .eq('status', 'active')

    // マージ（重複排除）
    const seenKeys = new Set(allMemberships.map((m: any) => `${m.organization_id}_${m.credential_level_id}`))
    for (const gm of (generalMemberships || [])) {
      const key = `${gm.organization_id}_${gm.credential_level_id}`
      if (!seenKeys.has(key)) {
        allMemberships.push(gm)
        seenKeys.add(key)
      }
    }

    if (allMemberships.length === 0) {
      return NextResponse.json({ organizations: [] })
    }

    // 3. organization_id 一覧を取得
    const orgIds = Array.from(new Set(allMemberships.map((m: any) => m.organization_id)))

    const { data: orgsData } = await supabase
      .from('organizations')
      .select('id, name, type, logo_url')
      .in('id', orgIds)

    // 4. credential_level_id 一覧からバッジ情報を取得
    const levelIds = allMemberships
      .map((m: any) => m.credential_level_id)
      .filter(Boolean)
    const uniqueLevelIds = Array.from(new Set(levelIds))

    let levelsMap = new Map<string, any>()
    if (uniqueLevelIds.length > 0) {
      const { data: levelsData } = await supabase
        .from('credential_levels')
        .select('id, name, image_url')
        .in('id', uniqueLevelIds)
      for (const lv of (levelsData || [])) {
        levelsMap.set(lv.id, lv)
      }
    }

    // 5. 団体ごとにバッジをグループ化
    const orgMap = new Map<string, any>()
    for (const org of (orgsData || [])) {
      orgMap.set(org.id, { ...org, badges: [] })
    }

    for (const m of allMemberships) {
      const org = orgMap.get(m.organization_id)
      if (!org) continue
      if (m.credential_level_id) {
        const level = levelsMap.get(m.credential_level_id)
        if (level) {
          org.badges.push({
            credential_level_id: level.id,
            name: level.name,
            image_url: level.image_url,
          })
        }
      }
    }

    const organizations = Array.from(orgMap.values())

    return NextResponse.json({ organizations })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
