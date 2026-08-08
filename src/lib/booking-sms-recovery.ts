/**
 * CEO指示(2026-08-08): メール未達予約のSMSフォールバックの「クリック検知」。
 *
 * 流れ:
 *   1. メール未達を検知(作成時の既知不達 or bounce webhook)すると、クライアントへ
 *      SMSで予約ページのリンク(?via=sms)を送る。**この時点では警告は消さない**。
 *   2. クライアントがリンクを開いたら(/booking/[booking_id]?via=sms)、ここで
 *      contact_recovered_by_sms_at を立て、送り手・受け手へ「連絡がつきました」を通知する。
 *      これにより赤い対応ブロックが消える(resolveEmailFixOwnerがnullを返す既存構造)。
 *      ヘッダーの「メール届かず」チップは事実として残す(メール自体は依然死んでいる)。
 *   3. クライアントとのチャット導線(メッセージを送る)は回復後も出さない(§17-22の既存ガード)。
 *
 * すべて fail-soft: どこで失敗してもクライアントの予約ページ表示は止めない。冪等(初回クリックのみ)。
 */
import { getSupabaseAdmin } from '@/lib/supabase'
import { notifySmsLinkOpenedToPro } from '@/lib/referral-notify'

export async function markBookingSmsLinkOpened(bookingId: string): Promise<void> {
  if (!bookingId) return
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('referral_bookings')
      .select('id, sender_pro_id, receiver_pro_id, status, preferred_slots, clients(nickname)')
      .eq('id', bookingId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any
    if (!row) return
    const slots = (row.preferred_slots || {}) as Record<string, unknown>
    // メール未達の予約だけが対象。初回クリックのみ(冪等: 2回目以降は何もしない)
    if (!slots.receipt_email_failed) return
    if (slots.contact_recovered_by_sms_at) return
    if (row.status !== 'requested' && row.status !== 'confirmed') return

    const { error } = await supabase
      .from('referral_bookings')
      .update({
        preferred_slots: { ...slots, contact_recovered_by_sms_at: new Date().toISOString() },
      })
      .eq('id', bookingId)
    if (error) {
      console.error('[booking-sms-recovery] mark error (fail-soft):', error.message)
      return
    }

    const clientNickname = row.clients?.nickname || 'クライアント'
    const proIds = [row.receiver_pro_id, row.sender_pro_id].filter(Boolean) as string[]
    if (proIds.length === 0) return
    const { data: pros } = await supabase
      .from('professionals')
      .select('id, name, contact_email, line_messaging_user_id')
      .in('id', proIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const pro of (pros || []) as any[]) {
      const role = pro.id === row.sender_pro_id ? 'sender' : 'receiver'
      try {
        await notifySmsLinkOpenedToPro(
          { name: pro.name, contact_email: pro.contact_email, line_messaging_user_id: pro.line_messaging_user_id },
          clientNickname,
          role,
          bookingId,
        )
      } catch (notifyErr) {
        console.error('[booking-sms-recovery] notify error (fail-soft):', notifyErr)
      }
    }
  } catch (err) {
    console.error('[booking-sms-recovery] threw (fail-soft):', err)
  }
}
