import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
// §17-16: import ゼロの純関数モジュール（チャンクグラフに何も足さない・CLAUDE.md §G）
import { resolveEmailFixOwner } from '@/lib/booking-email-fix'
import { resendClientGuidanceAfterEmailFix } from '@/lib/referral-email-fix-resend'

export const dynamic = 'force-dynamic'

/**
 * GET /api/referral/bookings/sent
 * §2-10: 送り手本人の成立予約(全ステータス)一覧。案件スレッド・引き継ぎメモの
 * 表示/編集の入口として使う。PIIはnicknameのみ(normalized_email等は含めない)。
 * ★ isReferralEnabled ではゲートしない(リスト作成後にフラグが変わっても既存予約は閲覧できる必要がある)。
 * ★ fail-soft: handover_note 列が未反映などで取得に失敗した場合は空配列を返す(ページを落とさない)。
 *
 * §17-16(CEO指示 2026-08-06): メールが届かなかった予約だけ、送り手にも
 * client_contact(お名前・電話番号)を返す。開示条件は下の canDiscloseToSender() が唯一のゲート。
 */

/**
 * ★ 送り手へのPII開示の唯一のゲート。変更する場合は必ずレビューを通すこと。
 *
 * 開示するのは次が**すべて**揃うときだけ:
 *   ① メールが届いていない印が立っている（＝連絡手段が電話しか残っていない）
 *   ② 進行中(requested/confirmed)
 *   ③ いま直す担当が送り手（＝24時間の預かり期間内。過ぎたら受け手に移り、送り手からは消える）
 * 返すのは**お名前と電話番号だけ**。メールアドレスは §17-6 のとおり誰にも返さない。
 *
 * 妥当性: 送り手はそのクライアントを自分で紹介した本人で、元々の知り合い。
 * 「会ったこともない他人の番号が出てくる」構図にはならない。
 */
function canDiscloseToSender(input: {
  status: string
  receiptEmailFailed: boolean
  emailFixOwner: 'sender' | 'receiver' | null
}): boolean {
  if (!input.receiptEmailFailed) return false
  if (input.status !== 'requested' && input.status !== 'confirmed') return false
  return input.emailFixOwner === 'sender'
}

export async function GET() {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()
    const { data: bookings, error } = await supabase
      .from('referral_bookings')
      .select(
        'id, list_id, receiver_pro_id, client_id, client_name, client_phone, menu_id, theme_tags, status, payment_status, price_jpy, preferred_slots, handover_note, confirmed_at, completed_at, created_at, clients(id, nickname), pro_menus(name)'
      )
      .eq('sender_pro_id', ownPro.id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[api/referral/bookings/sent] GET error (fail-soft):', error)
      return NextResponse.json({ bookings: [] })
    }

    const receiverIds = Array.from(
      new Set(((bookings || []) as any[]).map((b) => b.receiver_pro_id).filter(Boolean))
    )
    let receiversMap: Record<string, { id: string; name: string }> = {}
    if (receiverIds.length > 0) {
      const { data: receivers } = await supabase.from('professionals').select('id, name').in('id', receiverIds)
      for (const r of (receivers || []) as Array<{ id: string; name: string }>) {
        receiversMap[r.id] = r
      }
    }

    const result = ((bookings || []) as any[]).map((b) => {
      const receiptEmailFailed = !!b.preferred_slots?.receipt_email_failed
      const emailFixOwner = resolveEmailFixOwner({
        // このクエリは sender_pro_id = 自分 で絞っているので、必ず送り手がいる。
        hasSender: true,
        receiptEmailFailed,
        status: b.status,
        failedAt: b.preferred_slots?.receipt_email_failed_at || null,
        createdAt: b.created_at,
        contactRecoveredBySms: !!b.preferred_slots?.contact_recovered_by_sms_at,
      })
      return {
        id: b.id,
        list_id: b.list_id,
        menu_name: b.pro_menus?.name || null,
        theme_tags: b.theme_tags,
        status: b.status,
        price_jpy: b.price_jpy,
        handover_note: b.handover_note || null,
        confirmed_at: b.confirmed_at,
        completed_at: b.completed_at,
        created_at: b.created_at,
        client_nickname: b.clients?.nickname || 'クライアント',
        // CEO指摘(2026-08-08)「相談者の名前が入ってない」: アカウントレス予約の nickname は
        // 「ご相談者」固定のため、本人が入力したお名前を送り手に出す（送り手は紹介元＝
        // §17-16 で既にメール未達時の氏名開示を認めている相手。電話・メールはここでは出さない）。
        client_name: b.client_name || null,
        // CEO指示(2026-08-08): 紹介したカードに「お支払い待ち/予約金支払い済み」等の状態ラベルを
        // 出すため。金額は返さない(状態のみ)。
        payment_status: b.payment_status || null,
        // CEO指示(2026-08-08): 送り手がアドレスを直した後は、クライアントとの相談チャット導線を出す。
        client_email_fixed_by_sender: b.preferred_slots?.client_email_fixed_by === 'sender',
        receiver_pro: b.receiver_pro_id ? receiversMap[b.receiver_pro_id] || null : null,
        // §17-16: メールが届いていない案件だけ、送り手にやることを出す。
        receipt_email_failed: receiptEmailFailed,
        email_fix_owner: emailFixOwner,
        client_contact: canDiscloseToSender({ status: b.status, receiptEmailFailed, emailFixOwner })
          ? { name: b.client_name || null, phone: b.client_phone || null }
          : null,
      }
    })

    return NextResponse.json({ bookings: result })
  } catch (err: any) {
    console.error('[api/referral/bookings/sent] GET error (fail-soft):', err)
    return NextResponse.json({ bookings: [] })
  }
}

/**
 * PATCH /api/referral/bookings/sent
 * body: { booking_id, action: 'fix_client_email', client_email }
 *
 * §17-16(CEO指示 2026-08-06): 紹介予約でクライアントのメールが届かなかったとき、
 * 電話して正しいアドレスを聞き、ここで直すのは**紹介元（送り手）**の仕事。
 *
 * 受け手側(/received の fix_client_email)と同じく、これは**他人の連絡先を書き換える操作**なので
 * 通す条件を絞る: ①送り手プロ本人 ②メールが届いていない予約 ③進行中 ④まだ送り手の担当期間内。
 * 旧アドレスは行内に残して後から追えるようにする。
 */
export async function PATCH(request: NextRequest) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : ''
    const action = typeof body?.action === 'string' ? body.action : ''
    if (!bookingId || action !== 'fix_client_email') {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
    }

    const nextEmail =
      typeof body.client_email === 'string' ? body.client_email.trim().slice(0, 254).toLowerCase() : ''
    if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      return NextResponse.json({ error: 'email_invalid' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: booking } = await supabase
      .from('referral_bookings')
      .select(
        'id, sender_pro_id, receiver_pro_id, client_email, status, price_jpy, payment_status, fee_total_bps, preferred_slots, created_at, clients(id, user_id, nickname), referral_lists(id, slug), pro_menus(name)'
      )
      .eq('id', bookingId)
      .maybeSingle()

    if (!booking) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    // 送り手本人以外はここへ来られない（他人の予約のアドレスを書き換えられない）
    if ((booking as any).sender_pro_id !== ownPro.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const b = booking as any
    if (!b.preferred_slots?.receipt_email_failed) {
      return NextResponse.json({ error: 'not_allowed' }, { status: 409 })
    }
    if (b.status !== 'requested' && b.status !== 'confirmed') {
      return NextResponse.json({ error: 'not_pending' }, { status: 409 })
    }
    if (
      resolveEmailFixOwner({
        hasSender: true,
        receiptEmailFailed: true,
        status: b.status,
        failedAt: b.preferred_slots?.receipt_email_failed_at || null,
        createdAt: b.created_at,
        contactRecoveredBySms: !!b.preferred_slots?.contact_recovered_by_sms_at,
      }) !== 'sender'
    ) {
      // 24時間を過ぎて受け手に移っている。両側から別のアドレスを入れられる状態を作らない。
      return NextResponse.json({ error: 'receiver_is_fixing' }, { status: 409 })
    }
    if (nextEmail === (b.client_email || '').toLowerCase()) {
      return NextResponse.json({ error: 'email_unchanged' }, { status: 400 })
    }

    const { data: fixedRows, error: fixError } = await supabase
      .from('referral_bookings')
      .update({
        client_email: nextEmail,
        preferred_slots: {
          ...(b.preferred_slots || {}),
          // 直したので未達フラグは下ろす。届かなければ webhook がまた立てる。
          receipt_email_failed: false,
          receipt_email_failed_at: null,
          client_email_fixed_at: new Date().toISOString(),
          client_email_fixed_by: 'sender',
          client_email_before_fix: b.client_email || null,
        },
      })
      .eq('id', bookingId)
      .in('status', ['requested', 'confirmed'])
      .select('id')

    if (fixError) {
      console.error('[api/referral/bookings/sent] PATCH fix_client_email error:', fixError)
      return NextResponse.json({ error: 'failed_to_update' }, { status: 500 })
    }
    if (!fixedRows || fixedRows.length === 0) {
      return NextResponse.json({ error: 'not_pending' }, { status: 409 })
    }

    // 案内メールの差出人として名乗るのは**受け手プロ**（クライアントが予約した相手）。
    // 送り手が直したからといって文面の担当者名が変わってはいけない。
    const { data: receiverPro } = await supabase
      .from('professionals')
      .select('name')
      .eq('id', b.receiver_pro_id)
      .maybeSingle()

    const resent = await resendClientGuidanceAfterEmailFix({
      bookingId: b.id,
      status: b.status,
      priceJpy: b.price_jpy,
      paymentStatus: b.payment_status ?? null,
      feeTotalBps: b.fee_total_bps ?? null,
      menuName: b.pro_menus?.name || null,
      preferredSlots: b.preferred_slots || null,
      listSlug: b.referral_lists?.slug || null,
      clientEmail: nextEmail,
      clientUserId: b.clients?.user_id || null,
      receiverProName: (receiverPro as any)?.name || 'ご担当',
    })

    return NextResponse.json({ success: true, resent })
  } catch (err: any) {
    console.error('[api/referral/bookings/sent] PATCH error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
