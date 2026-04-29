/**
 * /api/send-reward-line
 *
 * vote_id を受け取り、LINE 認証で投票した voter にリワードを Flex Message で Push 送信。
 *
 * 既存パターン踏襲:
 *   - LINE Push API へは fetch 直叩き (line-push.ts と同じパターン)
 *   - Flex Message 構築は cron/weekly-report/send-line.ts のブランドカラーに合わせる
 *
 * LINE userId の保存先:
 *   votes.auth_provider_id (auth_method='line' の時のみ意味を持つ)
 *
 * スキップ条件 (200 で skipped を返す):
 *   - reward_optin が false / 未設定
 *   - auth_method !== 'line' or auth_provider_id 無し → Email へフォールバック
 *   - client_rewards / reward が無い、または rewards.status !== 'active'
 *   - sent_line_at が NOT NULL (冪等性)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { appendUtmParams } from '@/lib/email-templates/reward-email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ─── ブランドカラー (cron/weekly-report/send-line.ts と統一) ───
const DARK = '#1A1A2E'
const GOLD = '#C4A35A'
const CREAM = '#FAFAF7'
const GRAY = '#888888'
const BAR_BG = '#2A2A3E'

function buildProName(pro: {
  name?: string | null
  last_name?: string | null
  first_name?: string | null
}): string {
  if (pro.name && pro.name.trim()) return pro.name.trim()
  const composed = `${pro.last_name || ''}${pro.first_name || ''}`.trim()
  return composed || 'プロ'
}

interface FlexParams {
  proName: string
  proPhotoUrl: string | null
  reward: { title: string | null; content: string; url?: string | null }
  bookingUrl: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRewardFlex(p: FlexParams): any {
  const { proName, proPhotoUrl, reward, bookingUrl } = p

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyContents: any[] = [
    { type: 'text', text: 'REWARD', size: 'xxs', color: GOLD, weight: 'bold', letterSpacing: '2px' },
    { type: 'text', text: `${proName}さん`, size: 'lg', color: CREAM, weight: 'bold', margin: 'sm', wrap: true },
    { type: 'separator', margin: 'md', color: '#333355' },
    { type: 'text', text: 'メッセージとリワードが届いています', size: 'sm', color: CREAM, margin: 'lg', wrap: true },
  ]

  if (reward.title) {
    bodyContents.push({
      type: 'text',
      text: reward.title,
      weight: 'bold',
      color: CREAM,
      margin: 'lg',
      wrap: true,
      size: 'md',
    })
  }

  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    margin: 'sm',
    paddingAll: 'md',
    backgroundColor: BAR_BG,
    cornerRadius: 'md',
    contents: [
      { type: 'text', text: reward.content, size: 'sm', color: CREAM, wrap: true },
    ],
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const footerContents: any[] = []

  if (reward.url) {
    footerContents.push({
      type: 'button',
      action: { type: 'uri', label: 'リワードを開く', uri: reward.url },
      style: 'primary',
      color: GOLD,
      height: 'sm',
    })
  }

  if (bookingUrl) {
    footerContents.push({
      type: 'button',
      action: { type: 'uri', label: `${proName}さんに予約する`, uri: bookingUrl },
      style: 'secondary',
      height: 'sm',
      margin: 'sm',
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bubble: any = {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      paddingAll: 'lg',
      backgroundColor: DARK,
    },
    styles: {
      body: { backgroundColor: DARK },
      footer: { backgroundColor: DARK },
    },
  }

  if (proPhotoUrl) {
    bubble.hero = {
      type: 'image',
      url: proPhotoUrl,
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
    }
  }

  if (footerContents.length > 0) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      contents: footerContents,
      paddingAll: 'lg',
      backgroundColor: DARK,
    }
  }

  return {
    type: 'flex',
    altText: `${proName}さんからメッセージとリワードが届きました`,
    contents: bubble,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { vote_id } = await req.json().catch(() => ({}))
    if (!vote_id) {
      return NextResponse.json({ error: 'vote_id is required' }, { status: 400 })
    }

    const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
    if (!accessToken) {
      console.error('[send-reward-line] LINE_MESSAGING_CHANNEL_ACCESS_TOKEN not set')
      return NextResponse.json({ error: 'LINE token not set' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1. votes 取得
    const { data: vote, error: voteError } = await supabase
      .from('votes')
      .select('id, professional_id, reward_optin, auth_method, auth_provider_id')
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

    // 2. LINE 認証以外はフォールバック (Email 側で配信)
    const lineUserId = (vote as any).auth_provider_id as string | null
    if ((vote as any).auth_method !== 'line' || !lineUserId) {
      return NextResponse.json({ skipped: 'not_line_auth' }, { status: 200 })
    }

    // 3. client_rewards + rewards 取得
    //    status カラムは client_rewards 側にあり (rewards 側には無い)。
    const { data: cr, error: crError } = await supabase
      .from('client_rewards')
      .select(`
        id,
        status,
        sent_line_at,
        reward_id,
        rewards:rewards (
          id,
          title,
          content,
          url
        )
      `)
      .eq('vote_id', vote_id)
      .maybeSingle()

    if (crError) {
      console.error('[send-reward-line] client_rewards query error:', crError)
      return NextResponse.json(
        { error: 'client_rewards query failed', details: crError.message },
        { status: 500 }
      )
    }

    if (!cr) {
      return NextResponse.json({ skipped: 'no_client_reward' }, { status: 200 })
    }

    if ((cr as any).status !== 'active') {
      return NextResponse.json({ skipped: 'not_active' }, { status: 200 })
    }

    const reward = Array.isArray((cr as any).rewards) ? (cr as any).rewards[0] : (cr as any).rewards
    if (!reward) {
      return NextResponse.json({ skipped: 'no_reward' }, { status: 200 })
    }

    // 4. 冪等性
    if ((cr as any).sent_line_at) {
      return NextResponse.json(
        { skipped: 'already_sent', sent_at: (cr as any).sent_line_at },
        { status: 200 }
      )
    }

    // 5. プロ情報
    const { data: pro, error: proError } = await supabase
      .from('professionals')
      .select('id, name, last_name, first_name, photo_url, booking_url')
      .eq('id', (vote as any).professional_id)
      .maybeSingle()

    if (proError || !pro) {
      return NextResponse.json(
        { error: 'Professional not found', details: proError?.message },
        { status: 404 }
      )
    }

    const proName = buildProName(pro as any)

    // 6. 予約 URL に UTM 付与
    const trackedBookingUrl = (pro as any).booking_url
      ? appendUtmParams((pro as any).booking_url, {
          utm_source: 'realproof',
          utm_medium: 'reward_line',
          utm_campaign: 'next_booking',
          utm_content: (vote as any).id,
        })
      : null

    // 7. Flex Message 構築
    const flex = buildRewardFlex({
      proName,
      proPhotoUrl: (pro as any).photo_url || null,
      reward: {
        title: reward.title || null,
        content: reward.content || '',
        url: reward.url || null,
      },
      bookingUrl: trackedBookingUrl,
    })

    // 8. LINE Push (line-push.ts と同じ fetch パターン)
    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      body: JSON.stringify({
        to: lineUserId,
        messages: [flex],
      }),
    })

    if (!lineRes.ok) {
      const errBody = await lineRes.text()
      console.error('[send-reward-line] LINE push error:', lineRes.status, errBody)
      return NextResponse.json(
        { error: 'LINE push failed', status: lineRes.status, details: errBody },
        { status: 502 }
      )
    }

    // 9. 送信フラグ更新
    const { error: updateError } = await (supabase as any)
      .from('client_rewards')
      .update({ sent_line_at: new Date().toISOString() })
      .eq('id', (cr as any).id)

    if (updateError) {
      console.warn('[send-reward-line] sent_line_at update failed (push already sent):', updateError)
    }

    return NextResponse.json({
      success: true,
      line_user_id: lineUserId,
    })
  } catch (err: any) {
    console.error('[send-reward-line] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message || String(err) },
      { status: 500 }
    )
  }
}
