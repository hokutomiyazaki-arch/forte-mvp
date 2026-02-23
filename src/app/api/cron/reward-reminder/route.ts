import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// リマインドスケジュール（時間単位）
const REMINDER_SCHEDULE = [
  { number: 1, hoursAfter: 24 },   // 24時間後
  { number: 2, hoursAfter: 72 },   // 3日後
  { number: 3, hoursAfter: 168 },  // 7日後
]

function getEmailHtml(proName: string, reminderNumber: number, claimUrl: string): { subject: string; html: string } {
  const subjects: Record<number, string> = {
    1: `${proName}さんからリワードが届いています`,
    2: `${proName}さんのリワード、まだ受け取っていません`,
    3: `${proName}さんのリワードの受け取り期限が近づいています`,
  }

  const bodies: Record<number, string> = {
    1: `
      <p style="color:#333;font-size:15px;">${proName}さんからリワードが届いています。</p>
      <p style="color:#333;font-size:14px;">先日の投票ありがとうございました。<br>${proName}さんが、あなたのためにリワードを用意しています。</p>
    `,
    2: `
      <p style="color:#333;font-size:15px;">${proName}さんのリワードが待っています。</p>
      <p style="color:#333;font-size:14px;">まだリワードを受け取っていないようです。<br>アカウントを作成して、リワードを受け取りましょう。</p>
    `,
    3: `
      <p style="color:#333;font-size:15px;">${proName}さんからのリワード、お忘れではありませんか？</p>
      <p style="color:#333;font-size:14px;">これが最後のお知らせです。<br>リワードを受け取るには、アカウントの作成が必要です。</p>
    `,
  }

  const footer3 = reminderNumber === 3
    ? '<p style="color:#999;font-size:11px;margin-top:12px;">※ 今後、このメールは届きません。</p>'
    : ''

  return {
    subject: subjects[reminderNumber],
    html: `
      <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
        <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
          <h1 style="color:#C4A35A;font-size:14px;margin:0;">REAL PROOF</h1>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #eee;">
          ${bodies[reminderNumber]}
          <div style="text-align:center;margin:24px 0;">
            <a href="${claimUrl}"
               style="display:inline-block;background:#C4A35A;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;">
              リワードを受け取る →
            </a>
          </div>
          ${footer3}
        </div>
        <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
          <p style="color:#999;font-size:11px;margin:0;">REAL PROOF — 強みがあなたを定義する。</p>
          <p style="color:#bbb;font-size:10px;margin:4px 0 0;">このメールは ${proName} さんへの投票後にお送りしています。</p>
        </div>
      </div>
    `,
  }
}

export async function GET(req: NextRequest) {
  // Vercel Cron の認証
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://forte-mvp.vercel.app'
  const now = new Date()
  let totalSent = 0

  try {
    // 対象: 投票確認済み（confirmed）& リワードあり & 3通未送信
    // 7日以内の投票のみ対象（それ以上古いものはスキップ）
    const sevenDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()

    const { data: targets, error: queryError } = await supabaseAdmin
      .from('votes')
      .select(`
        id,
        voter_email,
        professional_id,
        created_at,
        professionals(id, name),
        client_rewards(id, reward_id)
      `)
      .eq('status', 'confirmed')
      .not('voter_email', 'is', null)
      .gte('created_at', sevenDaysAgo)

    if (queryError) {
      console.error('[reward-reminder] Query error:', queryError.message)
      return NextResponse.json({ error: queryError.message }, { status: 500 })
    }

    if (!targets || targets.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No targets' })
    }

    // リワードのある投票のみフィルタ
    const votesWithRewards = targets.filter((v: any) => v.client_rewards && v.client_rewards.length > 0)

    if (votesWithRewards.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No votes with rewards' })
    }

    // 対象投票IDの既存リマインダーをまとめて取得
    const voteIds = votesWithRewards.map((v: any) => v.id)
    const { data: allReminders } = await supabaseAdmin
      .from('reward_reminders')
      .select('vote_id, reminder_number')
      .in('vote_id', voteIds)

    const reminderMap = new Map<string, Set<number>>()
    for (const r of (allReminders || [])) {
      if (!reminderMap.has(r.vote_id)) reminderMap.set(r.vote_id, new Set())
      reminderMap.get(r.vote_id)!.add(r.reminder_number)
    }

    // 対象メールアドレスでアカウント作成済みかチェック（一括）
    const emails = Array.from(new Set(votesWithRewards.map((v: any) => v.voter_email as string)))
    const { data: existingClients } = await supabaseAdmin
      .from('clients')
      .select('user_id')

    // auth.usersからメールアドレスを取得してclientsと照合
    const registeredEmails = new Set<string>()
    if (existingClients && existingClients.length > 0) {
      const userIds = existingClients.map((c: any) => c.user_id)
      // バッチでユーザー情報を取得
      for (const uid of userIds) {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(uid)
        if (userData?.user?.email) {
          registeredEmails.add(userData.user.email.toLowerCase())
        }
      }
    }

    for (const vote of votesWithRewards) {
      const email = (vote.voter_email as string).toLowerCase()
      const pro = (vote as any).professionals
      const proName = pro?.name || 'プロ'
      const voteCreatedAt = new Date(vote.created_at)
      const hoursSinceVote = (now.getTime() - voteCreatedAt.getTime()) / (1000 * 60 * 60)

      // アカウント作成済み → スキップ
      if (registeredEmails.has(email)) continue

      const sentNumbers = reminderMap.get(vote.id) || new Set<number>()

      // 3通送信済み → スキップ
      if (sentNumbers.size >= 3) continue

      // 送信すべきリマインドを判定
      for (const schedule of REMINDER_SCHEDULE) {
        if (sentNumbers.has(schedule.number)) continue
        if (hoursSinceVote < schedule.hoursAfter) continue

        // 前のリマインドが未送信なら飛ばさない（1→2→3の順）
        if (schedule.number > 1 && !sentNumbers.has(schedule.number - 1)) continue

        // メール送信
        const claimUrl = `${appUrl}/login?role=client&redirect=/mycard&email=${encodeURIComponent(email)}`
        const { subject, html } = getEmailHtml(proName, schedule.number, claimUrl)

        try {
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'REAL PROOF <info@proof-app.jp>',
              to: email,
              subject,
              html,
            }),
          })

          if (emailRes.ok) {
            await supabaseAdmin.from('reward_reminders').insert({
              vote_id: vote.id,
              client_email: email,
              reminder_number: schedule.number,
            })
            totalSent++
            console.log(`[reward-reminder] Sent #${schedule.number} to ${email} for pro ${proName}`)
          } else {
            const errBody = await emailRes.text()
            console.error(`[reward-reminder] Resend error for ${email}:`, emailRes.status, errBody)
          }
        } catch (err) {
          console.error(`[reward-reminder] Send error for ${email}:`, err)
        }

        break // 1回の実行では各投票につき1通まで
      }
    }

    return NextResponse.json({ sent: totalSent, checked: votesWithRewards.length })
  } catch (err) {
    console.error('[reward-reminder] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
