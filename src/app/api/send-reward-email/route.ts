/**
 * /api/send-reward-email
 *
 * vote_id を受け取り、その voter にリワード/お礼メールを Resend で送信。
 *
 * 設計変更 (2026-04-29):
 *   配信先メアドは votes.voter_email から取得 (client_rewards は任意)。
 *   全 1099 件中 924 件 (84%) が client_rewards 未作成 (リワード未設定プロ) で、
 *   従来は 'no_client_reward' として一律スキップしていたが、
 *   これらにも「応援ありがとうございます」のお礼メールを送るように変更。
 *
 * 既存パターン踏襲:
 *   - Resend SDK ではなく fetch 直叩き (welcome-email/route.ts と統一)
 *   - 送信元: REAL PROOF <info@proof-app.jp>
 *
 * スキップ条件 (200 で skipped を返す):
 *   - reward_optin が false / 未設定                   → 'reward_optin_false'
 *   - voter_email が無い / @ を含まない               → 'no_valid_email'
 *   - voter_email が @line.realproof.jp ダミー        → 'line_dummy_email'
 *   - client_rewards.sent_email_at NOT NULL          → 'already_sent' (冪等性)
 *   - client_rewards.status !== 'active'             → `status_${value}`
 *
 * 重複送信防止フラグ (sent_email_at) は client_rewards 側のみ更新。
 * client_rewards が無い「応援メール」は idempotency なし
 * (Phase 2 で必要なら vote_email_logs テーブル新設を検討)。
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

    // 1. votes 取得 (voter_email を必須で取得)
    const { data: vote, error: voteError } = await supabase
      .from('votes')
      .select('id, professional_id, reward_optin, voter_email')
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

    // 2. 配信先メアドの検証 (votes.voter_email を採用)
    const recipientEmail = String((vote as any).voter_email || '').trim()
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return NextResponse.json({ skipped: 'no_valid_email' }, { status: 200 })
    }
    if (recipientEmail.toLowerCase().endsWith('@line.realproof.jp')) {
      // LINE 認証のダミー voter_email — DNS 未登録 → bounce 確実
      return NextResponse.json({ skipped: 'line_dummy_email' }, { status: 200 })
    }

    // 3. client_rewards (任意) を取得。
    //    無ければ「応援ありがとう」テンプレートで送信。
    //    あれば status='active' / sent_email_at NULL を確認。
    const { data: cr, error: crError } = await supabase
      .from('client_rewards')
      .select(`
        id,
        status,
        sent_email_at,
        reward_id,
        rewards:rewards (
          id,
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

    // 冪等性: client_rewards 既送信ならスキップ
    if ((cr as any)?.sent_email_at) {
      return NextResponse.json(
        { skipped: 'already_sent', sent_at: (cr as any).sent_email_at },
        { status: 200 }
      )
    }

    // status='active' でないリワードは未確定状態とみなしてスキップ
    if (cr && (cr as any).status !== 'active') {
      return NextResponse.json(
        { skipped: `status_${(cr as any).status}` },
        { status: 200 }
      )
    }

    // 4. プロ情報取得 (両パターン共通)
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

    // 5. reward の正規化 (client_rewards あれば rewards を embed、無ければ null)
    const embeddedReward = cr
      ? Array.isArray((cr as any).rewards)
        ? (cr as any).rewards[0]
        : (cr as any).rewards
      : null

    const reward = embeddedReward
      ? {
          title: embeddedReward.title || null,
          content: embeddedReward.content || '',
          url: embeddedReward.url || null,
        }
      : null

    // 6. テンプレート生成 (reward の有無で件名・本文分岐)
    const { subject, html, text } = buildRewardEmail({
      proName,
      proPhotoUrl: (pro as any).photo_url || null,
      proTitle: (pro as any).title || '',
      proId: (pro as any).id,
      reward,
      bookingUrl: (pro as any).booking_url || null,
      voteId: (vote as any).id,
      voterEmail: recipientEmail,
    })

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://realproof.jp'

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
        to: recipientEmail,
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

    // 8. 送信完了フラグ更新 (client_rewards がある場合のみ)
    //    無いケース (応援メール) では idempotency 記録なし — Phase 2 課題
    if (cr) {
      const { error: updateError } = await (supabase as any)
        .from('client_rewards')
        .update({ sent_email_at: new Date().toISOString() })
        .eq('id', (cr as any).id)

      if (updateError) {
        console.warn('[send-reward-email] sent_email_at update failed (mail already sent):', updateError)
      }
    }

    return NextResponse.json({
      success: true,
      message_id: sendData?.id,
      email: recipientEmail,
      pattern: reward ? 'reward' : 'thanks',
    })
  } catch (err: any) {
    console.error('[send-reward-email] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message || String(err) },
      { status: 500 }
    )
  }
}
