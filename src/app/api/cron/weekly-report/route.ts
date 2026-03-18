/**
 * Weekly Proof Report — Vercel Cron エントリーポイント
 *
 * 毎週月曜 00:00 UTC = 09:00 JST に実行
 * 全プロの週次レポートを集計し、LINE or メールで配信
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateAllWeeklyReports, getWeeklyReportContent } from '@/lib/weekly-report'
import { generateEmailHTML } from './email-template'
import { sendWeeklyEmail } from './send-email'
import { sendWeeklyLineMessage } from './send-line'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // 最大2分

export async function GET(req: NextRequest) {
  // 1. Cron認証チェック
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // テストモード判定
  const isTest = req.nextUrl.searchParams.get('test') === 'true'
  const testProfessionalId = req.nextUrl.searchParams.get('professionalId')

  try {
    // 2. 今週のコンテンツ取得（管理画面で入力されたHIGHLIGHT/TIPS）
    const now = new Date()
    const jstOffset = 9 * 60 * 60 * 1000
    const jstDate = new Date(now.getTime() + jstOffset)
    const day = jstDate.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    jstDate.setUTCDate(jstDate.getUTCDate() + diff)
    const weekStartStr = jstDate.toISOString().split('T')[0]

    const content = await getWeeklyReportContent(weekStartStr)

    // 3. 全プロのデータ集計
    console.log(`[weekly-report] Generating reports...${isTest ? ' (TEST MODE)' : ''}`)
    const allReports = await generateAllWeeklyReports()
    console.log(`[weekly-report] Generated ${allReports.length} reports`)

    // ── テストモード: ドライラン（professionalId指定なし） ──
    if (isTest && !testProfessionalId) {
      let wouldSendEmail = 0
      let wouldSendLine = 0
      let wouldSkip = 0
      for (const data of allReports) {
        if (data.line_messaging_user_id) wouldSendLine++
        else if (data.contact_email) wouldSendEmail++
        else wouldSkip++
      }
      return NextResponse.json({
        test: true,
        dryRun: true,
        total: allReports.length,
        wouldSendEmail,
        wouldSendLine,
        wouldSkip,
        week_start: weekStartStr,
      })
    }

    // ── テストモード: 1人指定 ──
    if (isTest && testProfessionalId) {
      const target = allReports.find(r => r.professional_id === testProfessionalId)
      if (!target) {
        return NextResponse.json({
          test: true,
          error: `Professional ${testProfessionalId} not found in reports`,
        }, { status: 404 })
      }

      // LINE優先で送信
      if (target.line_messaging_user_id) {
        const lineResult = await sendWeeklyLineMessage(
          target.line_messaging_user_id,
          target,
          content,
        )
        console.log(`[weekly-report][TEST] LINE ${lineResult.success ? 'sent' : 'failed'}: ${target.name}`)
        return NextResponse.json({
          test: true,
          professionalId: testProfessionalId,
          name: target.name,
          channel: 'line',
          status: lineResult.success ? 'sent' : 'failed',
          error: lineResult.error || undefined,
        })
      } else if (target.contact_email) {
        const emailHtml = generateEmailHTML(target, content)
        const emailResult = await sendWeeklyEmail(
          target.contact_email,
          target.name,
          emailHtml,
        )
        console.log(`[weekly-report][TEST] Email ${emailResult.success ? 'sent' : 'failed'}: ${target.name}`)
        return NextResponse.json({
          test: true,
          professionalId: testProfessionalId,
          name: target.name,
          channel: 'email',
          status: emailResult.success ? 'sent' : 'failed',
          error: emailResult.error || undefined,
        })
      } else {
        return NextResponse.json({
          test: true,
          professionalId: testProfessionalId,
          name: target.name,
          channel: 'none',
          status: 'skipped',
          error: 'No contact method (no email, no LINE)',
        })
      }
    }

    // ── 通常モード: 全プロに配信 ──

    // 4. 配信ログ
    const results: Array<{
      professional_id: string
      channel: 'email' | 'line'
      status: 'sent' | 'failed' | 'skipped'
      error_message?: string
    }> = []

    for (const data of allReports) {
      // LINE優先
      if (data.line_messaging_user_id) {
        const lineResult = await sendWeeklyLineMessage(
          data.line_messaging_user_id,
          data,
          content,
        )

        const logEntry = {
          professional_id: data.professional_id,
          channel: 'line' as const,
          status: lineResult.success ? 'sent' as const : 'failed' as const,
          error_message: lineResult.error || undefined,
        }
        results.push(logEntry)

        // ログ記録
        await supabase.from('weekly_report_logs').insert({
          professional_id: data.professional_id,
          week_start: weekStartStr,
          channel: 'line',
          status: lineResult.success ? 'sent' : 'failed',
          error_message: lineResult.error || null,
        })

        console.log(`[weekly-report] LINE ${lineResult.success ? 'sent' : 'failed'}: ${data.name}`)
      } else if (data.weekly_report_unsubscribed) {
        // メール配信停止中 → スキップ
        results.push({
          professional_id: data.professional_id,
          channel: 'email',
          status: 'skipped',
          error_message: 'Unsubscribed',
        })
        await supabase.from('weekly_report_logs').insert({
          professional_id: data.professional_id,
          week_start: weekStartStr,
          channel: 'email',
          status: 'skipped',
          error_message: 'Unsubscribed from email',
        })
        console.log(`[weekly-report] Skipped (unsubscribed): ${data.name}`)
      } else if (data.contact_email) {
        // メール送信
        const emailHtml = generateEmailHTML(data, content)
        const emailResult = await sendWeeklyEmail(
          data.contact_email,
          data.name,
          emailHtml,
        )

        const logEntry = {
          professional_id: data.professional_id,
          channel: 'email' as const,
          status: emailResult.success ? 'sent' as const : 'failed' as const,
          error_message: emailResult.error || undefined,
        }
        results.push(logEntry)

        // ログ記録
        await supabase.from('weekly_report_logs').insert({
          professional_id: data.professional_id,
          week_start: weekStartStr,
          channel: 'email',
          status: emailResult.success ? 'sent' : 'failed',
          error_message: emailResult.error || null,
        })

        console.log(`[weekly-report] Email ${emailResult.success ? 'sent' : 'failed'}: ${data.name}`)
      } else {
        // どちらもない → スキップ
        results.push({
          professional_id: data.professional_id,
          channel: 'email',
          status: 'skipped',
          error_message: 'No contact method',
        })

        await supabase.from('weekly_report_logs').insert({
          professional_id: data.professional_id,
          week_start: weekStartStr,
          channel: 'email',
          status: 'skipped',
          error_message: 'No contact method (no email, no LINE)',
        })

        console.log(`[weekly-report] Skipped: ${data.name} (no contact)`)
      }
    }

    // 5. サマリー
    const summary = {
      total: results.length,
      sent_email: results.filter(r => r.channel === 'email' && r.status === 'sent').length,
      sent_line: results.filter(r => r.channel === 'line' && r.status === 'sent').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      week_start: weekStartStr,
    }

    console.log('[weekly-report] Summary:', JSON.stringify(summary))

    return NextResponse.json(summary)
  } catch (err: any) {
    console.error('[weekly-report] Unexpected error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
