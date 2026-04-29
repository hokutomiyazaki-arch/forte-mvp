/**
 * /api/send-reward-email
 *
 * vote_id を受け取り、その voter にリワードメールを Resend で送信。
 *
 * 既存パターン踏襲:
 *   - Resend SDK ではなく fetch 直叩き (welcome-email/route.ts と統一)
 *   - 送信元: REAL PROOF <info@proof-app.jp>
 *
 * スキップ条件 (200 で skipped を返す):
 *   - reward_optin が false / 未設定
 *   - client_rewards が無い / status='active' でない
 *   - client_email が @ を含まない (電話番号フォーマットなど)
 *   - sent_email_at が NOT NULL (冪等性: 既送信)
 *
 * 重複送信防止フラグ (sent_email_at) は client_rewards 側に持つ。
 * voter × reward の組合せ単位 (= 1 投票につき 1 送信) で記録。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildRewardEmail } from '@/lib/email-templates/reward-email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function buildProName(pro: {
  name?: string | null
  last_name?: string | null
  first_name?: string | null
}): string {
  if (pro.name && pro.name.trim()) return pro.name.trim()
  const composed = `${pro.last_name || ''}${pro.first_name || ''}`.trim()
  return composed || 'プロ'
}

export async function POST(req: NextRequest) {
  try {
    const { vote_id } = await req.json().catch(() => ({}))
    if (!vote_id) {
      return NextResponse.json({ error: 'vote_id is required' }, { status: 400 })
    }

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      console.error('[send-reward-email] RESEND_API_KEY not set')
      return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1. votes 取得 + reward_optin 確認
    const { data: vote, error: voteError } = await supabase
      .from('votes')
      .select('id, professional_id, reward_optin')
      .eq('id', vote_id)
      .maybeSingle()

    if (voteError || !vote) {
      return NextResponse.json(
        { error: 'Vote not found', details: voteError?.message },
        { status: 404 }
      )
    }

    if (!(vote as any).reward_optin) {
      return NextResponse.json({ skipped: 'reward_optin_false' }, { status: 200 })
    }

    // 2. client_rewards (vote_id 単位) + reward 結合
    //    rewards.status='active' のものだけ配信対象。
    const { data: cr, error: crError } = await supabase
      .from('client_rewards')
      .select(`
        id,
        client_email,
        sent_email_at,
        reward_id,
        rewards:rewards (
          id,
          status,
          title,
          content,
          url,
          reward_type
        )
      `)
      .eq('vote_id', vote_id)
      .maybeSingle()

    if (crError) {
      console.error('[send-reward-email] client_rewards query error:', crError)
      return NextResponse.json(
        { error: 'client_rewards query failed', details: crError.message },
        { status: 500 }
      )
    }

    if (!cr) {
      return NextResponse.json({ skipped: 'no_client_reward' }, { status: 200 })
    }

    // Supabase の embedded relation は単一 or 配列 — 単一参照に正規化
    const reward = Array.isArray((cr as any).rewards) ? (cr as any).rewards[0] : (cr as any).rewards
    if (!reward) {
      return NextResponse.json({ skipped: 'no_reward' }, { status: 200 })
    }
    if (reward.status !== 'active') {
      return NextResponse.json({ skipped: 'not_active' }, { status: 200 })
    }

    // 3. メールアドレス検証 (@ 含まない = 電話番号など)
    const email = ((cr as any).client_email || '').trim()
    if (!email.includes('@')) {
      return NextResponse.json({ skipped: 'phone_format' }, { status: 200 })
    }

    // 4. 冪等性: 既送信ならスキップ
    if ((cr as any).sent_email_at) {
      return NextResponse.json(
        { skipped: 'already_sent', sent_at: (cr as any).sent_email_at },
        { status: 200 }
      )
    }

    // 5. プロ情報取得 (name 優先、フォールバックで last_name+first_name)
    const { data: pro, error: proError } = await supabase
      .from('professionals')
      .select('id, name, last_name, first_name, title, photo_url, booking_url')
      .eq('id', (vote as any).professional_id)
      .maybeSingle()

    if (proError || !pro) {
      return NextResponse.json(
        { error: 'Professional not found', details: proError?.message },
        { status: 404 }
      )
    }

    const proName = buildProName(pro as any)

    // 6. メールテンプレート生成
    const { subject, html, text } = buildRewardEmail({
      proName,
      proPhotoUrl: (pro as any).photo_url || null,
      proTitle: (pro as any).title || '',
      reward: {
        title: reward.title || null,
        content: reward.content || '',
        url: reward.url || null,
      },
      bookingUrl: (pro as any).booking_url || null,
      voteId: (vote as any).id,
      voterEmail: email,
    })

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'

    // 7. Resend (fetch 直叩き — welcome-email/route.ts パターン)
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        from: 'REAL PROOF <info@proof-app.jp>',
        to: email,
        subject,
        html,
        text,
        headers: {
          'List-Unsubscribe': `<${siteUrl}/unsubscribe?vote_id=${encodeURIComponent((vote as any).id)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    })

    if (!resendRes.ok) {
      const errBody = await resendRes.text()
      console.error('[send-reward-email] Resend error:', resendRes.status, errBody)
      return NextResponse.json(
        { error: 'Resend send failed', status: resendRes.status, details: errBody },
        { status: 502 }
      )
    }

    const sendData = await resendRes.json().catch(() => ({}))

    // 8. 送信完了フラグ更新 (失敗時は警告のみ — メール自体は送信済み)
    const { error: updateError } = await (supabase as any)
      .from('client_rewards')
      .update({ sent_email_at: new Date().toISOString() })
      .eq('id', (cr as any).id)

    if (updateError) {
      console.warn('[send-reward-email] sent_email_at update failed (mail already sent):', updateError)
    }

    return NextResponse.json({
      success: true,
      message_id: sendData?.id,
      email,
    })
  } catch (err: any) {
    console.error('[send-reward-email] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message || String(err) },
      { status: 500 }
    )
  }
}
