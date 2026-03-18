/**
 * Admin Broadcast — メール/LINE一斉送信 API
 *
 * POST /api/admin/broadcast
 *
 * 管理者がプロフェッショナル全員（またはフィルタ条件付き）に
 * メール/LINEでメッセージを一斉送信する。
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateAllWeeklyReports } from '@/lib/weekly-report'
import { sendWeeklyEmail } from '@/app/api/cron/weekly-report/send-email'
import { sendLinePushText } from '@/lib/line-push'
import { generateBroadcastEmailHTML } from './email-template'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// 認証チェック: rp_admin_auth クッキー
async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const auth = cookieStore.get('rp_admin_auth')
  return auth?.value === 'authenticated'
}

// 変数展開: {{name}} {{votes}} を実際の値に置換
function expandVariables(
  text: string,
  name: string,
  votes: number,
): string {
  return text
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{votes\}\}/g, String(votes))
}

export async function POST(req: NextRequest) {
  // 1. 認証チェック
  const isAdmin = await checkAdminAuth()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      target,         // 'all' | 'line' | 'email' | 'professional'
      professionalId, // target='professional' の場合のみ
      channel,        // 'auto' | 'line' | 'email'
      subject,        // メール件名
      body: messageBody, // メッセージ本文（{{name}}, {{votes}} 変数）
      preview,        // true = ドライラン
    } = body

    // バリデーション
    if (!target || !channel || !messageBody) {
      return NextResponse.json(
        { error: 'target, channel, body are required' },
        { status: 400 },
      )
    }

    if (target === 'professional' && !professionalId) {
      return NextResponse.json(
        { error: 'professionalId is required when target=professional' },
        { status: 400 },
      )
    }

    // 2. 全プロデータ取得
    console.log(`[broadcast] Generating pro data...`)
    const allReports = await generateAllWeeklyReports()
    console.log(`[broadcast] Got ${allReports.length} professionals`)

    // 3. ターゲットフィルタリング
    let targets = allReports

    if (target === 'line') {
      targets = targets.filter(r => !!r.line_messaging_user_id)
    } else if (target === 'email') {
      targets = targets.filter(r => !!r.contact_email)
    } else if (target === 'professional') {
      targets = targets.filter(r => r.professional_id === professionalId)
    }
    // target === 'all' → フィルタなし

    // 4. 送信チャネル決定
    type Recipient = {
      professional_id: string
      name: string
      total_proofs: number
      sendChannel: 'line' | 'email' | 'skip'
      lineUserId?: string
      email?: string
    }

    const recipients: Recipient[] = targets.map(r => {
      let sendChannel: 'line' | 'email' | 'skip' = 'skip'
      if (channel === 'auto') {
        if (r.line_messaging_user_id) sendChannel = 'line'
        else if (r.contact_email) sendChannel = 'email'
      } else if (channel === 'line') {
        if (r.line_messaging_user_id) sendChannel = 'line'
      } else if (channel === 'email') {
        if (r.contact_email) sendChannel = 'email'
      }

      return {
        professional_id: r.professional_id,
        name: r.name,
        total_proofs: r.total_proofs,
        sendChannel,
        lineUserId: r.line_messaging_user_id || undefined,
        email: r.contact_email || undefined,
      }
    })

    // 5. プレビューモード
    if (preview) {
      const wouldSendLine = recipients.filter(r => r.sendChannel === 'line').length
      const wouldSendEmail = recipients.filter(r => r.sendChannel === 'email').length
      const wouldSkip = recipients.filter(r => r.sendChannel === 'skip').length

      // サンプル受信者（最大5名）
      const sampleRecipients = recipients
        .filter(r => r.sendChannel !== 'skip')
        .slice(0, 5)
        .map(r => ({ name: r.name, channel: r.sendChannel }))

      return NextResponse.json({
        preview: true,
        total: recipients.length,
        wouldSendLine,
        wouldSendEmail,
        wouldSkip,
        sampleRecipients,
      })
    }

    // 6. 実送信モード
    const supabase = getSupabaseAdmin()
    const emailSubject = subject || '【REALPROOF】お知らせ'

    let sentLine = 0
    let sentEmail = 0
    let failed = 0
    let skipped = 0
    const errors: Array<{ name: string; error: string }> = []

    for (const r of recipients) {
      if (r.sendChannel === 'skip') {
        skipped++
        continue
      }

      const expandedBody = expandVariables(messageBody, r.name, r.total_proofs)

      if (r.sendChannel === 'line' && r.lineUserId) {
        const result = await sendLinePushText(r.lineUserId, expandedBody)
        if (result.success) {
          sentLine++
        } else {
          failed++
          errors.push({ name: r.name, error: result.error || 'LINE send failed' })
        }

        // ログ記録
        await supabase.from('broadcast_logs').insert({
          professional_id: r.professional_id,
          channel: 'line',
          status: result.success ? 'sent' : 'failed',
          subject: emailSubject,
          body_preview: expandedBody.substring(0, 200),
          error_message: result.error || null,
        })

        console.log(`[broadcast] LINE ${result.success ? 'sent' : 'failed'}: ${r.name}`)
      } else if (r.sendChannel === 'email' && r.email) {
        const emailHtml = generateBroadcastEmailHTML(r.name, expandedBody)
        const result = await sendWeeklyEmail(r.email, r.name, emailHtml)
        if (result.success) {
          sentEmail++
        } else {
          failed++
          errors.push({ name: r.name, error: result.error || 'Email send failed' })
        }

        // ログ記録
        await supabase.from('broadcast_logs').insert({
          professional_id: r.professional_id,
          channel: 'email',
          status: result.success ? 'sent' : 'failed',
          subject: emailSubject,
          body_preview: expandedBody.substring(0, 200),
          error_message: result.error || null,
        })

        console.log(`[broadcast] Email ${result.success ? 'sent' : 'failed'}: ${r.name}`)
      }
    }

    // 7. サマリー
    const summary = {
      sent: { line: sentLine, email: sentEmail },
      failed,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    }

    console.log('[broadcast] Summary:', JSON.stringify(summary))
    return NextResponse.json(summary)
  } catch (err: any) {
    console.error('[broadcast] Unexpected error:', err)
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 },
    )
  }
}
