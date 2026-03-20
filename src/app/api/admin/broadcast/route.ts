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

// Recipient 型
type Recipient = {
  professional_id: string
  name: string
  total_proofs: number
  sendChannel: 'line' | 'email' | 'skip'
  lineUserId?: string
  email?: string
}

// 個別プロのデータを軽量取得（generateAllWeeklyReports をスキップ）
async function getSingleProRecipient(
  professionalId: string,
  channel: string,
): Promise<Recipient | null> {
  const supabase = getSupabaseAdmin()

  const { data: pro } = await supabase
    .from('professionals')
    .select('id, name, last_name, first_name, contact_email, line_messaging_user_id')
    .eq('id', professionalId)
    .is('deactivated_at', null)
    .maybeSingle()

  if (!pro) return null

  // 総投票数
  const { count } = await supabase
    .from('votes')
    .select('id', { count: 'exact', head: true })
    .eq('professional_id', professionalId)
    .eq('status', 'confirmed')

  const name = (pro.last_name && pro.first_name)
    ? `${pro.last_name} ${pro.first_name}`
    : (pro.name || '—')

  let sendChannel: 'line' | 'email' | 'skip' = 'skip'
  if (channel === 'auto') {
    if (pro.line_messaging_user_id) sendChannel = 'line'
    else if (pro.contact_email) sendChannel = 'email'
  } else if (channel === 'line') {
    if (pro.line_messaging_user_id) sendChannel = 'line'
  } else if (channel === 'email') {
    if (pro.contact_email) sendChannel = 'email'
  }

  return {
    professional_id: pro.id,
    name,
    total_proofs: count || 0,
    sendChannel,
    lineUserId: pro.line_messaging_user_id || undefined,
    email: pro.contact_email || undefined,
  }
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

    // 2. プレビューモード（軽量クエリのみ、generateAllWeeklyReports をスキップ）
    if (preview) {
      console.log(`[broadcast] Preview mode (lightweight)`)
      const supabasePreview = getSupabaseAdmin()

      if (target === 'professional' && professionalId) {
        const single = await getSingleProRecipient(professionalId, channel)
        const recipients = single ? [single] : []
        return NextResponse.json({
          preview: true,
          total: recipients.length,
          wouldSendLine: recipients.filter(r => r.sendChannel === 'line').length,
          wouldSendEmail: recipients.filter(r => r.sendChannel === 'email').length,
          wouldSkip: recipients.filter(r => r.sendChannel === 'skip').length,
          sampleRecipients: recipients
            .filter(r => r.sendChannel !== 'skip')
            .map(r => ({ name: r.name, channel: r.sendChannel })),
        })
      }

      // 一斉プレビュー: プロ一覧から件数とサンプルだけ取得
      const { data: pros } = await supabasePreview
        .from('professionals')
        .select('id, name, last_name, first_name, contact_email, line_messaging_user_id')
        .is('deactivated_at', null)

      const allPros = pros || []
      let filtered = allPros
      if (target === 'line') {
        filtered = filtered.filter(p => !!p.line_messaging_user_id)
      } else if (target === 'email') {
        filtered = filtered.filter(p => !!p.contact_email)
      }

      const previewRecipients = filtered.map(p => {
        let sendChannel: 'line' | 'email' | 'skip' = 'skip'
        if (channel === 'auto') {
          if (p.line_messaging_user_id) sendChannel = 'line'
          else if (p.contact_email) sendChannel = 'email'
        } else if (channel === 'line') {
          if (p.line_messaging_user_id) sendChannel = 'line'
        } else if (channel === 'email') {
          if (p.contact_email) sendChannel = 'email'
        }
        const name = (p.last_name && p.first_name)
          ? `${p.last_name} ${p.first_name}`
          : (p.name || '—')
        return { name, sendChannel }
      })

      return NextResponse.json({
        preview: true,
        total: previewRecipients.length,
        wouldSendLine: previewRecipients.filter(r => r.sendChannel === 'line').length,
        wouldSendEmail: previewRecipients.filter(r => r.sendChannel === 'email').length,
        wouldSkip: previewRecipients.filter(r => r.sendChannel === 'skip').length,
        sampleRecipients: previewRecipients
          .filter(r => r.sendChannel !== 'skip')
          .slice(0, 5)
          .map(r => ({ name: r.name, channel: r.sendChannel })),
      })
    }

    // 3. 受信者リスト構築（実送信時のみ）
    let recipients: Recipient[]

    if (target === 'professional' && professionalId) {
      // 個別送信: 全プロレポート生成をスキップ
      console.log(`[broadcast] Single target: ${professionalId}`)
      const single = await getSingleProRecipient(professionalId, channel)
      recipients = single ? [single] : []
      console.log(`[broadcast] Single target resolved: ${recipients.length > 0 ? recipients[0].name : 'not found'}`)
    } else {
      // 一斉送信: 全プロデータ取得
      console.log(`[broadcast] Generating pro data...`)
      const allReports = await generateAllWeeklyReports()
      console.log(`[broadcast] Got ${allReports.length} professionals`)

      // ターゲットフィルタリング
      let targets = allReports
      if (target === 'line') {
        targets = targets.filter(r => !!r.line_messaging_user_id)
      } else if (target === 'email') {
        targets = targets.filter(r => !!r.contact_email)
      }

      recipients = targets.map(r => {
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
    }

    // 4. 実送信モード（5件ずつ並列）
    const supabase = getSupabaseAdmin()
    const emailSubject = subject || '【REALPROOF】お知らせ'

    let sentLine = 0
    let sentEmail = 0
    let failed = 0
    let skipped = 0
    const errors: Array<{ name: string; error: string }> = []
    const logs: Array<{
      professional_id: string
      channel: string
      status: string
      subject: string
      body_preview: string
      error_message: string | null
    }> = []

    // 1件の受信者を送信する関数
    const sendToRecipient = async (r: Recipient) => {
      if (r.sendChannel === 'skip') {
        skipped++
        return
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
        logs.push({
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
        logs.push({
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

    // 5件ずつ並列送信
    const BATCH_SIZE = 5
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(batch.map(r => sendToRecipient(r)))
    }

    // バッチINSERT（ログをまとめて記録）
    if (logs.length > 0) {
      await supabase.from('broadcast_logs').insert(logs)
    }

    // 5. サマリー
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
