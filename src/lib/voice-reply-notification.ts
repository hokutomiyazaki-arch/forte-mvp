/**
 * Phase 3 Step 2: Voice 返信の配信ロジック
 *
 * POST /api/dashboard/reply で vote_replies INSERT が成功した直後、
 * クライアントへ Email (Resend) または LINE Push を送信する。
 *
 * チャネル選択:
 *   - LINE Auth で投票した voter (auth_method='line' + auth_provider_id あり) → LINE Push のみ
 *   - それ以外 → Email のみ
 *   (排他。両方は送らない。LINE Auth voter は @line.realproof.jp ダミーアドレスが入っているため
 *    Email を送ると bounce 確実)
 *
 * スキップ条件:
 *   - reward_optin が false / 未設定 → 'opt_in_false'
 *   - normalized_email が NULL/空 → 'no_email'
 *   - normalized_email が @line.realproof.jp で終わる + LINE userId 無 → 'line_dummy'
 *
 * 配信成功時:
 *   - vote_replies.delivered_at = NOW()
 *   - vote_replies.delivered_via = 'email' or 'line'
 *
 * 配信失敗 / スキップ時:
 *   - DB は触らない (delivered_via の CHECK 制約 IN ('line','email') に違反するため
 *     'failed' / 'skipped:reason' を入れない。詳細は console.log/error にだけ出す)
 *   - レスポンスは常に成功扱い (返信自体は保存できているため)
 *
 * PATCH (編集) からは呼び出さない (サイレント編集仕様、再通知しない)。
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  generateSubject,
  generateTextBody,
  generateHtmlBody,
} from './email-templates/voice-reply-notification-email'
import { buildVoiceReplyFlexMessage } from './line-templates/voice-reply-notification-flex'

const FROM_EMAIL = 'REAL PROOF <noreply@realproof.jp>'
const DELIVERY_TIMEOUT_MS = 5000

type ChannelResult = { channel: 'email' | 'line'; success: boolean }

interface VoteRow {
  id: string
  normalized_email: string | null
  auth_method: string | null
  auth_display_name: string | null
  reward_optin: boolean | null
  auth_provider_id: string | null
}

interface ProRow {
  id: string
  name: string
}

function shouldSkipDelivery(
  vote: VoteRow,
  isLineUser: boolean
): { skip: boolean; reason?: string } {
  if (!vote.reward_optin) return { skip: true, reason: 'opt_in_false' }
  // LINE Auth ユーザーは LINE Push を使うので Email チェックはバイパス
  if (isLineUser) return { skip: false }
  if (!vote.normalized_email) return { skip: true, reason: 'no_email' }
  if (vote.normalized_email.endsWith('@line.realproof.jp')) {
    return { skip: true, reason: 'line_dummy' }
  }
  return { skip: false }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ])
}

async function sendReplyEmail(params: {
  to: string
  clientName: string | null
  professionalName: string
  deepLinkUrl: string
  unsubscribeUrl: string
}): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.error('[reply-notify] RESEND_API_KEY not set')
    return false
  }

  try {
    const subject = generateSubject(params.professionalName)
    const text = generateTextBody({
      clientName: params.clientName,
      professionalName: params.professionalName,
      deepLinkUrl: params.deepLinkUrl,
      unsubscribeUrl: params.unsubscribeUrl,
    })
    const html = generateHtmlBody({
      clientName: params.clientName,
      professionalName: params.professionalName,
      deepLinkUrl: params.deepLinkUrl,
      unsubscribeUrl: params.unsubscribeUrl,
    })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: params.to,
        subject,
        text,
        html,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[reply-notify] Resend error:', res.status, body.slice(0, 200))
      return false
    }
    return true
  } catch (e) {
    console.error('[reply-notify] Resend exception:', e)
    return false
  }
}

async function sendReplyLine(params: {
  lineUserId: string
  professionalName: string
  deepLinkUrl: string
}): Promise<boolean> {
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
  if (!accessToken) {
    console.error('[reply-notify] LINE_MESSAGING_CHANNEL_ACCESS_TOKEN not set')
    return false
  }

  try {
    const flex = buildVoiceReplyFlexMessage({
      professionalName: params.professionalName,
      deepLinkUrl: params.deepLinkUrl,
    })

    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        to: params.lineUserId,
        messages: [flex],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[reply-notify] LINE push error:', res.status, body.slice(0, 200))
      return false
    }
    return true
  } catch (e) {
    console.error('[reply-notify] LINE push exception:', e)
    return false
  }
}

export async function deliverVoiceReplyNotification(params: {
  voteId: string
  professionalId: string
  replyId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
}): Promise<void> {
  // 1. 配信先情報取得
  const [voteRes, proRes] = await Promise.all([
    params.supabase
      .from('votes')
      .select('id, normalized_email, auth_method, auth_display_name, reward_optin, auth_provider_id')
      .eq('id', params.voteId)
      .maybeSingle(),
    params.supabase
      .from('professionals')
      .select('id, name')
      .eq('id', params.professionalId)
      .maybeSingle(),
  ])

  const voteData = voteRes.data as VoteRow | null
  const proData = proRes.data as ProRow | null
  if (!voteData || !proData) {
    console.error('[reply-notify] failed to fetch vote/pro data', {
      vote_id: params.voteId,
    })
    return
  }

  // 2. チャネル判定 (LINE Auth は LINE Push、それ以外は Email)
  const isLineUser =
    voteData.auth_method === 'line' && !!voteData.auth_provider_id

  // 3. スキップ判定
  const skip = shouldSkipDelivery(voteData, isLineUser)
  if (skip.skip) {
    console.log('[reply-notify] skipped:', skip.reason, {
      vote_id: params.voteId,
    })
    return
  }

  // 4. 配信先 URL
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://realproof.jp'
  const deepLinkUrl = `${siteUrl}/card/${proData.id}#vote-${voteData.id}`
  const unsubscribeUrl = `${siteUrl}/unsubscribe?vote_id=${voteData.id}`

  // 5. 並行配信 (5秒タイムアウト)
  const tasks: Promise<ChannelResult>[] = []

  if (isLineUser && voteData.auth_provider_id) {
    tasks.push(
      withTimeout(
        sendReplyLine({
          lineUserId: voteData.auth_provider_id,
          professionalName: proData.name,
          deepLinkUrl,
        }),
        DELIVERY_TIMEOUT_MS
      ).then(ok => ({ channel: 'line' as const, success: !!ok }))
    )
  } else if (voteData.normalized_email) {
    tasks.push(
      withTimeout(
        sendReplyEmail({
          to: voteData.normalized_email,
          clientName: voteData.auth_display_name,
          professionalName: proData.name,
          deepLinkUrl,
          unsubscribeUrl,
        }),
        DELIVERY_TIMEOUT_MS
      ).then(ok => ({ channel: 'email' as const, success: !!ok }))
    )
  }

  if (tasks.length === 0) {
    console.log('[reply-notify] no eligible channel', { vote_id: params.voteId })
    return
  }

  const results = await Promise.all(tasks)
  const successChannels = results.filter(r => r.success).map(r => r.channel)

  // 6. delivered_at / delivered_via 更新
  // CHECK 制約 (delivered_via IN ('line','email')) を尊重し、
  // 単一チャネルが成功した場合のみその値を入れる。
  // 実装上、Email と LINE は排他なので successChannels.length は 0 か 1 のいずれか。
  if (successChannels.length > 0) {
    const { error: updErr } = await params.supabase
      .from('vote_replies')
      .update({
        delivered_at: new Date().toISOString(),
        delivered_via: successChannels[0],
      })
      .eq('id', params.replyId)
    if (updErr) {
      console.error('[reply-notify] delivered_at update failed:', updErr)
    }
  } else {
    console.error('[reply-notify] all channels failed', {
      vote_id: params.voteId,
      attempted_line: isLineUser,
      attempted_email: !isLineUser,
    })
  }
}
