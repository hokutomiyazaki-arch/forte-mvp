import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { organizationId, orgName, email } = await req.json()

    if (!organizationId || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // 1. auth.usersからメールでユーザーを検索
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const targetUser = users.find((u: any) => u.email?.toLowerCase() === normalizedEmail)

    if (!targetUser) {
      return NextResponse.json(
        { error: 'このメールアドレスのプロは見つかりませんでした' },
        { status: 404 }
      )
    }

    // 2. そのユーザーがprofessionalsに登録されているか確認
    const { data: proData } = await supabaseAdmin
      .from('professionals')
      .select('id')
      .eq('user_id', targetUser.id)
      .maybeSingle()

    if (!proData) {
      return NextResponse.json(
        { error: 'このメールアドレスのプロは見つかりませんでした' },
        { status: 404 }
      )
    }

    // 3. 既に所属済みか確認
    const { data: existingMember } = await supabaseAdmin
      .from('org_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('professional_id', proData.id)
      .in('status', ['pending', 'active'])
      .maybeSingle()

    if (existingMember) {
      return NextResponse.json(
        { error: 'このプロは既にメンバーまたは招待済みです' },
        { status: 409 }
      )
    }

    // 4. 重複招待チェック
    const { data: existingInv } = await supabaseAdmin
      .from('org_invitations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('invited_email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingInv) {
      return NextResponse.json(
        { error: 'このメールアドレスには既に招待を送信済みです' },
        { status: 409 }
      )
    }

    // 5. 招待レコード作成
    const token = crypto.randomUUID()

    const { error: insertError } = await supabaseAdmin
      .from('org_invitations')
      .insert({
        organization_id: organizationId,
        invited_email: normalizedEmail,
        invite_token: token,
        status: 'pending',
      })

    if (insertError) throw insertError

    // 6. org_membersにpendingレコードを作成（プロ側ダッシュボードで表示用）
    const { error: memberError } = await supabaseAdmin
      .from('org_members')
      .insert({
        organization_id: organizationId,
        professional_id: proData.id,
        status: 'pending',
      })

    if (memberError) {
      console.error('[org-invite] org_members insert error:', memberError)
      // 招待レコードは作成済みなので続行（メンバーレコードは承認時に再作成可能）
    }

    // 7. Resendでメール送信
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://forte-mvp.vercel.app'

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'REAL PROOF <info@proof-app.jp>',
          to: normalizedEmail,
          subject: `${orgName}からREALPROOFへの招待が届いています`,
          html: `
            <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
              <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
                <h1 style="color:#C4A35A;font-size:14px;margin:0;">REAL PROOF</h1>
              </div>
              <div style="padding:24px;background:#fff;border:1px solid #eee;">
                <p style="color:#333;font-size:15px;font-weight:bold;">
                  ${orgName}からの招待
                </p>
                <p style="color:#333;font-size:14px;">
                  ${orgName}のオーナーから、スタッフとしての招待が届いています。<br>
                  ダッシュボードから招待を確認・承認してください。
                </p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${appUrl}/dashboard"
                     style="display:inline-block;background:#1A1A2E;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;">
                    ダッシュボードを開く
                  </a>
                </div>
              </div>
              <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
                <p style="color:#999;font-size:11px;margin:0;">REAL PROOF — 強みで証明されたプロに出会う</p>
              </div>
            </div>
          `,
        }),
      })

      console.log('[org-invite] Email sent to:', normalizedEmail)
    } else {
      console.log('[org-invite] No RESEND_API_KEY, skipping email')
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[org-invite] Error:', err)
    return NextResponse.json({ error: '招待の送信に失敗しました' }, { status: 500 })
  }
}
