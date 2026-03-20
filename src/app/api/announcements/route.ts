import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  // Clerk認証（未ログインでもエラーにしない）
  let userId: string | null = null
  try {
    const session = await auth()
    userId = session.userId
  } catch {
    // 未ログイン
  }

  // アクティブなバナーを取得
  const { data: allAnnouncements, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', now)
    .order('starts_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 期限切れを除外
  const activeAnnouncements = (allAnnouncements || []).filter(
    (a: any) => !a.expires_at || new Date(a.expires_at) > new Date()
  )

  // ユーザー属性を判定（ログイン時のみ）
  let isPro = false
  let isFoundingMember = false
  let badgeIds: string[] = []

  if (userId) {
    // プロ判定
    const { data: proData } = await supabase
      .from('professionals')
      .select('id, is_founding_member')
      .eq('user_id', userId)
      .is('deactivated_at', null)
      .maybeSingle()

    if (proData) {
      isPro = true
      isFoundingMember = !!proData.is_founding_member

      // バッジ判定
      const { data: badges } = await supabase
        .from('org_members')
        .select('credential_level_id')
        .eq('professional_id', proData.id)
        .eq('status', 'active')
        .not('credential_level_id', 'is', null)

      if (badges) {
        badgeIds = badges.map((b: any) => b.credential_level_id)
      }
    }
  }

  // ターゲットフィルタ
  const filteredAnnouncements = activeAnnouncements.filter((a: any) => {
    if (a.target === 'all') return true
    if (!userId) return false // ログイン必須のターゲット

    if (a.target === 'professionals') return isPro
    if (a.target === 'founding_members') return isFoundingMember
    if (a.target.startsWith('badge:')) {
      const targetBadgeId = a.target.replace('badge:', '')
      return badgeIds.includes(targetBadgeId)
    }
    return false
  })

  // dismiss済みバナーを取得
  let dismissedIds: string[] = []
  if (userId) {
    const { data: dismissals } = await supabase
      .from('announcement_dismissals')
      .select('announcement_id')
      .eq('user_id', userId)

    if (dismissals) {
      dismissedIds = dismissals.map((d: any) => d.announcement_id)
    }
  }

  // 未dismissのバナー
  const undismissed = filteredAnnouncements.filter(
    (a: any) => !dismissedIds.includes(a.id)
  )

  return NextResponse.json({
    announcements: filteredAnnouncements,
    latest: undismissed.length > 0 ? undismissed[0] : null,
    unread_count: undismissed.length,
  })
}
