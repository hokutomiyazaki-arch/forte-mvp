import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { memberId, action, userId, userEmail, orgId } = await req.json()

    if (!memberId || !action || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. org_memberレコードが本人のものか確認
    const { data: member } = await supabaseAdmin
      .from('org_members')
      .select('id, professional_id, organization_id, status')
      .eq('id', memberId)
      .maybeSingle()

    if (!member) {
      return NextResponse.json({ error: '招待が見つかりません' }, { status: 404 })
    }

    if (member.status !== 'pending') {
      return NextResponse.json({ error: 'この招待は既に処理済みです' }, { status: 409 })
    }

    // 本人確認: professional_idのuser_idがリクエストのuserIdと一致するか
    const { data: proData } = await supabaseAdmin
      .from('professionals')
      .select('id, user_id')
      .eq('id', member.professional_id)
      .maybeSingle()

    if (!proData || proData.user_id !== userId) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    if (action === 'accept') {
      // 承認: status → active
      const { error: updateError } = await supabaseAdmin
        .from('org_members')
        .update({ status: 'active', accepted_at: new Date().toISOString() })
        .eq('id', memberId)

      if (updateError) throw updateError

      // org_invitationsのstatusも更新
      if (userEmail && orgId) {
        await supabaseAdmin
          .from('org_invitations')
          .update({ status: 'accepted' })
          .eq('organization_id', orgId)
          .eq('invited_email', userEmail.toLowerCase())
          .eq('status', 'pending')
      }

      return NextResponse.json({ success: true, action: 'accepted' })
    } else if (action === 'decline') {
      // 拒否: status → removed
      const { error: updateError } = await supabaseAdmin
        .from('org_members')
        .update({ status: 'removed', removed_at: new Date().toISOString() })
        .eq('id', memberId)

      if (updateError) throw updateError

      return NextResponse.json({ success: true, action: 'declined' })
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (err) {
    console.error('[org-accept] Error:', err)
    return NextResponse.json({ error: '処理に失敗しました' }, { status: 500 })
  }
}
