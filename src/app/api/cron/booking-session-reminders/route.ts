/**
 * GET /api/cron/booking-session-reminders（毎時30分・vercel.json）
 *
 * CEO GO(2026-08-08): セッション前日リマインド。確定済み予約のクライアントへ、
 * セッション開始のおよそ24時間前に1回だけリマインドを送る。
 * - 通常: メール（確定時と同じ notifyClientByEmail / emailShell の流儀）
 * - メール未達(receipt_email_failed)の予約: SMS（?via=sms リンク。開けば既存の
 *   クリック検知が「連絡がついた」処理も行う。booking-sms-recovery.ts）
 *
 * 対象window: 確定日時が [now+24h, now+25h) のもの（毎時実行で幅1時間＝漏れ・重複なし）。
 * 冪等: preferred_slots.session_reminder_sent_at を立て、立っている行はスキップ。
 * 支払い待ち(payment_status='awaiting')はまだ成立前のためリマインドしない。
 *
 * 認可・流儀は expire-referral-bookings/route.ts を踏襲（Bearer CRON_SECRET）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { notifyClientByEmail, emailShell } from '@/lib/referral-notify'
import { resolveConfirmedSlotIso, formatSlotWithWeekday } from '@/lib/referral-format'
import { sendSms } from '@/lib/sms'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const APP_URL = 'https://realproof.jp'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const now = Date.now()
  const windowStart = now + 24 * 60 * 60 * 1000
  const windowEnd = now + 25 * 60 * 60 * 1000

  let remindedEmail = 0
  let remindedSms = 0
  let skipped = 0

  try {
    // 確定済みは常時アクティブな件数が限られる想定だが、規約どおり order+range で決定的に取る
    const { data, error } = await supabase
      .from('referral_bookings')
      .select('id, receiver_pro_id, client_email, client_phone, payment_status, preferred_slots, clients(user_id, nickname)')
      .eq('status', 'confirmed')
      .order('id', { ascending: true })
      .range(0, 999)
    if (error) {
      console.error('[cron/booking-session-reminders] select error:', error.message)
      return NextResponse.json({ error: 'select_failed' }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (data || []) as any[]) {
      const slots = (row.preferred_slots || {}) as Record<string, unknown>
      if (slots.session_reminder_sent_at) continue
      if (row.payment_status === 'awaiting') continue
      const slotIso = resolveConfirmedSlotIso(row.preferred_slots)
      if (!slotIso) continue
      const slotMs = new Date(slotIso).getTime()
      if (Number.isNaN(slotMs) || slotMs < windowStart || slotMs >= windowEnd) continue

      const slotText = formatSlotWithWeekday(slotIso) || ''
      const { data: receiverPro } = await supabase
        .from('professionals')
        .select('name')
        .eq('id', row.receiver_pro_id)
        .maybeSingle()
      const proName = receiverPro?.name || '担当の先生'
      const bookingUrl = `${APP_URL}/booking/${row.id}`

      let sent = false
      if (slots.receipt_email_failed) {
        // メールが死んでいる予約はSMSで（?via=sms は既存のクリック検知に接続）
        const sms = await sendSms(
          row.client_phone,
          `【REAL PROOF】明日のご予約のご確認です。${proName}(${slotText})。詳細はこちら。\n${bookingUrl}?via=sms`,
        )
        sent = sms.sent
        if (sent) remindedSms++
      } else {
        const result = await notifyClientByEmail(
          { userId: row.clients?.user_id, email: row.client_email },
          '明日のご予約のご確認',
          emailShell(
            'ご予約前日のお知らせ',
            `${proName}さんとのご予約は <strong>${slotText}</strong> です。<br>ご都合が変わった場合は、お早めに担当の先生へご連絡ください。`,
            'ご予約の詳細を見る',
            bookingUrl,
          ),
        )
        sent = result.sent
        if (sent) remindedEmail++
      }

      if (!sent) {
        skipped++
        continue
      }

      const { error: markError } = await supabase
        .from('referral_bookings')
        .update({
          preferred_slots: { ...slots, session_reminder_sent_at: new Date().toISOString() },
        })
        .eq('id', row.id)
      if (markError) {
        // 印が書けないと次回も再送されうる。ログで検知できるようにする(送信自体は成功済み)
        console.error('[cron/booking-session-reminders] mark error:', row.id, markError.message)
      }
    }

    console.log(`[cron/booking-session-reminders] email=${remindedEmail} sms=${remindedSms} skipped=${skipped}`)
    return NextResponse.json({ ok: true, email: remindedEmail, sms: remindedSms, skipped })
  } catch (err) {
    console.error('[cron/booking-session-reminders] error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
