/**
 * GET /api/cron/send-booking-url-reminders
 *
 * Vercel Cron で週 1 起動。booking_url 未設定 + 累積票 ≥1 のプロに対し、
 * 設定促進メールを送る (per-pro 30 日 cooldown により実質月次)。
 *
 * 認証: Authorization: Bearer ${CRON_SECRET}
 *
 * 送信フロー:
 *   1. アクティブ + contact_email あり のプロを全件取得
 *   2. JS で booking_url 未入力のみフィルタ (PostgREST .or() の空文字 eq 取扱を避ける)
 *   3. 各プロについて:
 *      a. booking_url_reminders から直近 30 日以内の履歴チェック → あれば skip
 *      b. votes COUNT 取得 → 0 なら skip
 *      c. Resend で送信 (welcome-email/route.ts と同じ fetch パターン)
 *      d. booking_url_reminders に履歴 INSERT
 *   4. summary { sent / skipped / error } を JSON で返却
 *
 * 既存 reward-reminder/route.ts のパターン踏襲。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildBookingUrlReminderEmail } from '@/lib/email-templates/booking-url-reminder-email'
import { getProVoteCount } from '@/lib/vote-count'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function buildProName(pro: {
  name?: string | null
  last_name?: string | null
  first_name?: string | null
}): string {
  if (pro.name && pro.name.trim()) return pro.name.trim()
  const composed = `${pro.last_name || ''}${pro.first_name || ''}`.trim()
  return composed || 'プロ'
}

export async function GET(req: NextRequest) {
  // Vercel Cron 認証
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. アクティブプロ一覧 (200 件規模、メタデータのみなので 1 ラウンドトリップで取得)
  const { data: allPros, error: prosError } = await supabase
    .from('professionals')
    .select('id, last_name, first_name, name, contact_email, booking_url')
    .is('deactivated_at', null)
    .not('contact_email', 'is', null)

  if (prosError) {
    console.error('[booking-url-reminders] pros query error:', prosError)
    return NextResponse.json(
      { error: 'pros query failed', details: prosError.message },
      { status: 500 }
    )
  }

  // 2. JS で booking_url 未入力のみに絞る (空文字 / null どちらも対象)
  const targetPros = (allPros || []).filter(
    (p) => !p.booking_url || String(p.booking_url).trim() === ''
  )

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = []
  let sentCount = 0
  let skippedCount = 0
  let errorCount = 0

  for (const pro of targetPros) {
    const recipientEmail = (pro.contact_email || '').trim()
    if (!recipientEmail || !recipientEmail.includes('@')) {
      results.push({ pro_id: pro.id, skipped: 'invalid_contact_email' })
      skippedCount++
      continue
    }

    // 3-a. 30 日 cooldown
    const { data: recent } = await supabase
      .from('booking_url_reminders')
      .select('sent_at')
      .eq('professional_id', pro.id)
      .gte('sent_at', thirtyDaysAgo)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recent) {
      results.push({
        pro_id: pro.id,
        skipped: 'recently_sent',
        sent_at: (recent as { sent_at: string }).sent_at,
      })
      skippedCount++
      continue
    }

    // 3-b. 累積票数
    const voteCount = await getProVoteCount(supabase, pro.id)
    if (voteCount < 1) {
      results.push({ pro_id: pro.id, skipped: 'no_votes' })
      skippedCount++
      continue
    }

    const proName = buildProName(pro)
    const { subject, html, text } = buildBookingUrlReminderEmail({
      proName,
      voteCount,
      recipientEmail,
      proId: pro.id,
    })

    // 3-c. Resend 送信 (welcome-email/route.ts パターン)
    try {
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
        }),
      })

      if (!resendRes.ok) {
        const errBody = await resendRes.text()
        console.error('[booking-url-reminders] Resend error:', resendRes.status, errBody)
        results.push({
          pro_id: pro.id,
          error: `resend_${resendRes.status}`,
          details: errBody,
        })
        errorCount++
        continue
      }

      // 3-d. 履歴 INSERT (失敗しても警告のみ — メールは送信済み)
      const { error: insertError } = await supabase
        .from('booking_url_reminders')
        .insert({
          professional_id: pro.id,
          vote_count_at_send: voteCount,
        })

      if (insertError) {
        console.warn(
          '[booking-url-reminders] history insert failed (mail already sent):',
          insertError
        )
      }

      results.push({
        pro_id: pro.id,
        sent: true,
        vote_count: voteCount,
        email: recipientEmail,
      })
      sentCount++
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown'
      console.error('[booking-url-reminders] send error:', e)
      results.push({ pro_id: pro.id, error: msg })
      errorCount++
    }
  }

  return NextResponse.json({
    success: true,
    summary: {
      sent: sentCount,
      skipped: skippedCount,
      error: errorCount,
      target_filtered: targetPros.length,
      total_active: allPros?.length || 0,
    },
    details: results,
  })
}
