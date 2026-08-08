import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { ensureOwnClient, createGuestClient } from '@/lib/referral-auth'
import { notifyBookingRequested, notifyBookingReceivedToClient } from '@/lib/referral-notify'
import { parseSlot, snapToHalfHourUp } from '@/lib/referral-format'
import { normalizeBookingMode } from '@/lib/booking-mode'
// §17-25: import ゼロの純関数モジュール（チャンクグラフに何も足さない・CLAUDE.md §G）
import { isKnownUndeliverableEmail } from '@/lib/booking-email-fix'
import { sendSms } from '@/lib/sms'

const APP_URL = 'https://realproof.jp'

export const dynamic = 'force-dynamic'

/**
 * POST /api/bookings — REALPROOF の直接予約（§17-1・CEO決定 2026-08-06）
 *
 * 「既存の仕組みに、予約金なしにすればok」。新しいテーブルは作らず referral_bookings に
 * 紹介元なし(list_id/sender_pro_id = null)・予約金なし(payment_status='not_required')で入れる。
 * 受け手側の確定/辞退/別日時提案/完了・48h失効cronは既存のものがそのまま動く。
 *
 * 紹介予約(/api/referral/bookings)との違いはこの3点だけ:
 *   - リスト検証(verifyReceiverAllowedInList)が無い
 *   - 受付判定が accepting_status(紹介の受付) ではなく booking_enabled + booking_mode
 *   - 決済(Stripe)を一切通らない
 *
 * ★ ログイン不要（紹介予約と同じくアカウントレス）。連絡先は行に保存し、
 *    レスポンスには絶対含めない（確定後に受け手プロへだけ開示・received APIのゲートを通る）。
 */

/** 紹介予約と揃える: requested から48時間で自動失効（cron/expire-referral-bookings が拾う） */
const BOOKING_EXPIRES_HOURS = 48
const MAX_THEME_LEN = 100
const MAX_NOTE_LEN = 500
const MAX_NAME_LEN = 50
const MAX_PHONE_LEN = 20
const MAX_EMAIL_LEN = 254
/** 封鎖攻撃のバックストップ（主防御は同一メール×同一プロの重複チェック）。紹介予約と同値。 */
const MAX_PENDING_PER_RECEIVER = 50
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, '').length >= 10
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    const body = await request.json().catch(() => ({}))
    const proId = typeof body.pro_id === 'string' ? body.pro_id : ''
    const menuId = typeof body.menu_id === 'string' && body.menu_id ? body.menu_id : null
    const theme = typeof body.theme === 'string' ? body.theme.trim().slice(0, MAX_THEME_LEN) : ''
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE_LEN) : null
    const consent = body.info_share_consent === true

    const clientName = typeof body.client_name === 'string' ? body.client_name.trim().slice(0, MAX_NAME_LEN) : ''
    const clientPhone = typeof body.client_phone === 'string' ? body.client_phone.trim().slice(0, MAX_PHONE_LEN) : ''
    const clientEmail =
      typeof body.client_email === 'string' ? body.client_email.trim().slice(0, MAX_EMAIL_LEN).toLowerCase() : ''

    // 30分刻みへの正規化（拒否ではなく丸め）。フロントでも揃えるが直叩き対策でサーバーでも行う。
    const slot1 = parseSlot(snapToHalfHourUp(typeof body.slot1 === 'string' ? body.slot1 : null))
    const slot2 = parseSlot(snapToHalfHourUp(typeof body.slot2 === 'string' ? body.slot2 : null))
    const slot3 = parseSlot(snapToHalfHourUp(typeof body.slot3 === 'string' ? body.slot3 : null))

    if (!proId) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
    }
    if (!slot1) {
      return NextResponse.json({ error: 'slot1_required' }, { status: 400 })
    }
    const providedSlots = [slot1, slot2, slot3].filter((s): s is string => !!s)
    if (providedSlots.some((iso) => new Date(iso).getTime() <= Date.now())) {
      return NextResponse.json({ error: 'invalid_slots' }, { status: 400 })
    }
    if (!consent) {
      return NextResponse.json({ error: 'consent_required' }, { status: 400 })
    }
    if (
      !clientName ||
      !clientPhone ||
      !clientEmail ||
      !isValidPhone(clientPhone) ||
      !EMAIL_PATTERN.test(clientEmail)
    ) {
      return NextResponse.json({ error: 'contact_required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: pro } = await supabase
      .from('professionals')
      .select('id, name, contact_email, line_messaging_user_id, booking_url, booking_enabled, booking_mode, deactivated_at')
      .eq('id', proId)
      .maybeSingle()

    if (!pro || pro.deactivated_at) {
      return NextResponse.json({ error: 'pro_not_found' }, { status: 404 })
    }
    // §16-29: 予約の受付スイッチ。false のときだけ止める（カラム未作成は受付中に倒す）。
    if ((pro as any).booking_enabled === false) {
      return NextResponse.json({ error: 'not_accepting' }, { status: 409 })
    }
    // §17-1: 「自分のサイトで受ける」を選んでいるプロはRPで予約を受け取らない。
    // ここで通してしまうと、本人が見ていない受信箱に予約が溜まる（受け口2本の事故）。
    // ただしメニュー指定の予約だけは常にRPで受ける（外部サイトにメニューを渡せないため・CEO決定）。
    if (normalizeBookingMode((pro as any).booking_mode) === 'external' && (pro as any).booking_url && !menuId) {
      return NextResponse.json({ error: 'external_booking' }, { status: 409 })
    }

    // メニュー指定がある場合のみ検証する。直接予約は予約金が無いので price_jpy=0 でも成立させる
    // （紹介予約の「0円だと決済を素通りできる」という制約はこの経路には無い）。
    let priceJpy = 0
    let menuName: string | null = null
    if (menuId) {
      const { data: menu } = await supabase
        .from('pro_menus')
        .select('id, name, professional_id, price_jpy, is_referral_bookable, is_active')
        .eq('id', menuId)
        .maybeSingle()

      if (
        !menu ||
        menu.professional_id !== proId ||
        menu.is_active === false ||
        // プロが「このメニューで予約を受ける」を外していたら、そのメニューでは予約させない
        // （メニュー単位の受付スイッチ＝外部サイト運用のプロの逃げ道でもある）
        !menu.is_referral_bookable
      ) {
        return NextResponse.json({ error: 'invalid_menu' }, { status: 400 })
      }
      priceJpy = typeof menu.price_jpy === 'number' && menu.price_jpy > 0 ? menu.price_jpy : 0
      menuName = menu.name
    }

    // スパム対策（緩めのバックストップ）。取得失敗時は fail open。
    const { count: pendingCount, error: pendingCountError } = await supabase
      .from('referral_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_pro_id', proId)
      .eq('status', 'requested')

    if (!pendingCountError && (pendingCount || 0) >= MAX_PENDING_PER_RECEIVER) {
      return NextResponse.json({ error: 'too_many_requests' }, { status: 429 })
    }

    // 同一メール × 同一プロの未処理リクエストは1件まで（二重送信・催促の重複を防ぐ）
    const { data: existingRequest } = await supabase
      .from('referral_bookings')
      .select('id')
      .eq('client_email', clientEmail)
      .eq('receiver_pro_id', proId)
      .eq('status', 'requested')
      .maybeSingle()

    if (existingRequest) {
      return NextResponse.json({ error: 'already_requested' }, { status: 409 })
    }

    const ownClient = userId ? await ensureOwnClient(userId) : await createGuestClient()
    if (!ownClient) {
      return NextResponse.json({ error: 'client_setup_failed' }, { status: 500 })
    }

    const expiresAt = new Date(Date.now() + BOOKING_EXPIRES_HOURS * 60 * 60 * 1000).toISOString()

    // §17-25: 過去に同じアドレスで未達だったなら、作成時点で未達として扱う。
    // Resend は一度ハードバウンスしたアドレスを抑制し、次からは送信もバウンス通知もしないため、
    // webhook を待っていても印が永久に立たない（同じ打ち間違いの2回目以降が丸ごと抜ける）。
    const knownBadEmail = await isKnownUndeliverableEmail(supabase, clientEmail)

    const row: Record<string, unknown> = {
      // 紹介元なし。list_id / sender_pro_id は null のまま（受け手側UIは null を許容済み）。
      receiver_pro_id: proId,
      client_id: ownClient.id,
      menu_id: menuId,
      theme_tags: theme ? [theme] : null,
      preferred_slots: {
        slots: [slot1, slot2, slot3],
        note: note || null,
        // §17-25: 既知の不達アドレス。プロ側にすぐ「お電話でご連絡を」が出る。
        ...(knownBadEmail
          ? { receipt_email_failed: true, receipt_email_failed_at: new Date().toISOString() }
          : {}),
      },
      status: 'requested',
      price_jpy: priceJpy,
      // 予約金なし。紹介フィーの計算に使われないよう 0 を明示する
      // （DEFAULT はPhase 2の 4000/2800/1200 のため、放置すると紹介予約として集計される）。
      fee_total_bps: 0,
      fee_sender_bps: 0,
      fee_platform_bps: 0,
      info_share_consent: true,
      expires_at: expiresAt,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail,
      // 予約金なし。確定時に決済リンクを出さないための明示（received PATCH の分岐が見る）。
      payment_status: 'not_required',
      source: 'direct',
    }

    let booking: { id: string; status: string; expires_at: string | null } | null = null
    {
      const res = await supabase.from('referral_bookings').insert(row).select('id, status, expires_at').maybeSingle()
      if (res.error) {
        if (res.error.code === '23505') {
          return NextResponse.json({ error: 'already_requested' }, { status: 409 })
        }
        // fail-soft: migration 056(source) / 036(payment_status) 未実行の環境ではキーを外して入れる。
        // 予約が1件も取れなくなるより、紹介予約と同じ形で入れて受け取れる方がよい。
        const { source: _s, payment_status: _p, ...minimal } = row
        const retry = await supabase.from('referral_bookings').insert(minimal).select('id, status, expires_at').maybeSingle()
        if (retry.error || !retry.data) {
          if (retry.error?.code === '23505') {
            return NextResponse.json({ error: 'already_requested' }, { status: 409 })
          }
          console.error('[api/bookings] insert error:', res.error.message, retry.error?.message)
          return NextResponse.json({ error: 'failed_to_create' }, { status: 500 })
        }
        booking = retry.data as any
      } else {
        booking = res.data as any
      }
    }

    if (!booking) {
      console.error('[api/bookings] insert succeeded but no row returned')
      return NextResponse.json({ error: 'failed_to_create' }, { status: 500 })
    }

    // CEO指示(2026-08-08・SMSクリック検知方式): 既知の不達アドレスなら、クライアントへSMSで
    // リンクを送る(紹介予約POST・bounce webhookと同じ役割分担)。リンクが開かれた時点で
    // プロへ通知が飛ぶ(/booking/[id]?via=sms)。SMSが送れない場合は従来どおりカードの
    // 人力フロー(直予約は受け手が電話)に任せる(失敗しても予約自体は成功扱い)。
    if (knownBadEmail) {
      try {
        await sendSms(
          clientPhone,
          `【REAL PROOF】ご登録のメールアドレスにご案内が届きませんでした。` +
            `お手数ですが、こちらからご予約の状況をご確認ください。\nhttps://realproof.jp/booking/${booking.id}?via=sms`,
        )
      } catch (smsErr) {
        console.error('[api/bookings] recovery sms error (fail-soft):', smsErr)
      }
    }

    // プロへ通知（失敗しても予約リクエスト自体は成功扱い）
    try {
      await notifyBookingRequested(
        {
          name: pro.name,
          contact_email: pro.contact_email,
          line_messaging_user_id: (pro as any).line_messaging_user_id,
        },
        clientName || ownClient.nickname || 'クライアント',
        { direct: true, bookingId: booking.id },
      )
    } catch (notifyErr) {
      console.error('[api/bookings] pro notify error:', notifyErr)
    }

    // クライアントへ受付メール（届いていないと不安になるため必ず出す）
    //
    // CEO指摘(2026-08-06):「クライアントがe-mailを誤って入力していたらどうする？
    //   クライアントはなんも通知なくて、プロには予約が入ってる、が起こりうる。」
    //   → 送信できたかを receipt_sent で返し、フロントの完了画面でその場で伝える。
    //   → 送信できなかったことはプロにも渡す（確定後に電話へ切り替えてもらうため。
    //      電話番号はこのフォームの必須項目なので、連絡手段は必ず1つ残っている）。
    //   ※ 形式が正しいまま宛先が存在しない場合(gmial.com 等)はここでは成功になる。
    //      その層は入力時のドメイン候補表示(src/lib/email-typo.ts)と、完了画面の
    //      「この宛先に送りました」の読み上げで潰す。
    let receiptSent = false
    try {
      const receipt = await notifyBookingReceivedToClient(
        { userId, email: clientEmail },
        pro.name,
        `${APP_URL}/card/${proId}`,
        {
          // 直接予約は予約金なし。支払い案内の文言を出さない。
          paymentFlowActive: false,
          menuName,
          menuPriceJpy: menuId ? priceJpy : null,
          slot1,
          slot2,
          slot3,
          theme: theme || null,
          note,
        },
      )
      receiptSent = receipt.sent
    } catch (notifyErr) {
      console.error('[api/bookings] client receipt notify error:', notifyErr)
    }

    if (!receiptSent) {
      // 受け手プロの画面に「メールが届いていない」を出すための印。
      // 新カラムを足さず preferred_slots に持つ（既存のマーカーと同じ作法）。
      try {
        await supabase
          .from('referral_bookings')
          .update({
            preferred_slots: {
              slots: [slot1, slot2, slot3],
              note: note || null,
              receipt_email_failed: true,
            },
          })
          .eq('id', booking.id)
      } catch (markErr) {
        console.error('[api/bookings] receipt failure mark error:', markErr)
      }
    }

    return NextResponse.json({
      booking: { id: booking.id, status: booking.status, expires_at: booking.expires_at },
      receipt_sent: receiptSent,
    })
  } catch (err: any) {
    console.error('[api/bookings] POST error:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
