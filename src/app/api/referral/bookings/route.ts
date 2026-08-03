import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { ensureOwnClient, createGuestClient } from '@/lib/referral-auth'
import { verifyReceiverAllowedInList } from '@/lib/referral-data'
import { notifyBookingRequested } from '@/lib/referral-notify'
import { isAcceptingOpen } from '@/lib/referral-accepting'
import { isReferralPaymentEnabled } from '@/lib/feature-flags'
// 中1レビュー指摘: Stripe importはこのAPI routeに持たせない(Webpackチャンクグラフ対策)。
// Checkout Session作成はsrc/lib/referral-payment.tsの関数呼び出しに委譲する。
import { createReferralCheckoutSession } from '@/lib/referral-payment'

export const dynamic = 'force-dynamic'

/** §2-4: requested から48時間で自動失効 */
const BOOKING_EXPIRES_HOURS = 48
const MAX_THEME_LEN = 100
const MAX_NOTE_LEN = 500
const MAX_NAME_LEN = 50
const MAX_PHONE_LEN = 20
const MAX_EMAIL_LEN = 254
/**
 * レビューFAIL修正(重大2): 受け手単位のグローバル上限だけだと「封鎖攻撃」(悪意の第三者が
 * 特定プロ宛にrequestedを埋めて新規リクエストを止める)に使われる。同一メール×同一受け手の
 * 409重複チェックを主防御にし、この上限は緩めのバックストップとして残す。
 */
const MAX_PENDING_PER_RECEIVER = 50
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** レビューFAIL修正(軽微5): 表記(+81/空白/括弧/ハイフン)は許容し、数字だけで10桁以上かで判定する */
function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, '').length >= 10
}

/**
 * datetime-local由来のオフセット無し文字列("2026-08-05T14:00")はUTC環境で
 * パースすると9時間ズレる。オフセット/Zが既に付いている場合はそのまま、
 * 無い場合は Asia/Tokyo(+09:00) を明示付与してからパースする。
 */
function parseSlot(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(raw)
  const withOffset = hasOffset ? raw : `${raw}+09:00`
  const d = new Date(withOffset)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/**
 * POST /api/referral/bookings
 * body: { list_id, receiver_pro_id, menu_id?, slot1, slot2?, slot3?, theme?, note?,
 *          info_share_consent, client_name, client_phone, client_email }
 *
 * §2-4ステージ1(CEO決定・アカウントレス化): 会員登録なしで送信できる。ログイン済みなら
 * 従来通り ensureOwnClient() で own client に紐付け、未ログインなら createGuestClient() で
 * その場限りの clients 行(user_id無し)を作る。
 * 連絡先(client_name/client_phone/client_email)は referral_bookings の行に保存し、
 * clients には保存しない。レスポンス/他APIには絶対含めない(開示は別ステージで扱う)。
 * ★ isReferralEnabled ではゲートしない(クライアント向け申込経路は非ゲートが仕様)。
 */
export async function POST(request: NextRequest) {
  try {
    // §2-4ステージ1: 認証はoptional。未ログインでも送信できる(fail openではなく仕様として許可)。
    const { userId } = await auth()

    const body = await request.json().catch(() => ({}))
    const listId = typeof body.list_id === 'string' ? body.list_id : ''
    const receiverProId = typeof body.receiver_pro_id === 'string' ? body.receiver_pro_id : ''
    const menuId = typeof body.menu_id === 'string' && body.menu_id ? body.menu_id : null
    const theme = typeof body.theme === 'string' ? body.theme.trim().slice(0, MAX_THEME_LEN) : ''
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE_LEN) : null
    const infoShareConsent = body.info_share_consent === true

    const clientName = typeof body.client_name === 'string' ? body.client_name.trim().slice(0, MAX_NAME_LEN) : ''
    const clientPhone = typeof body.client_phone === 'string' ? body.client_phone.trim().slice(0, MAX_PHONE_LEN) : ''
    // レビューFAIL修正(重大2): メールは正規化(trim+lowercase)して比較・保存する(表記揺れ吸収)
    const clientEmail =
      typeof body.client_email === 'string' ? body.client_email.trim().slice(0, MAX_EMAIL_LEN).toLowerCase() : ''

    const slot1 = parseSlot(body.slot1)
    const slot2 = parseSlot(body.slot2)
    const slot3 = parseSlot(body.slot3)

    if (!listId || !receiverProId) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
    }
    if (!slot1) {
      return NextResponse.json({ error: 'slot1_required' }, { status: 400 })
    }
    if (!infoShareConsent) {
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

    const { data: list } = await supabase
      .from('referral_lists')
      .select('id, owner_id, slug, criteria')
      .eq('id', listId)
      .maybeSingle()

    if (!list) {
      return NextResponse.json({ error: 'list_not_found' }, { status: 404 })
    }

    // リストの候補(ピン+基準行・代理一段展開込み)に受け手が含まれるかを軽量検証
    // (Voice sanitize/強み集計まで走る getReferralPageData の丸ごと呼び出しは避ける)
    const allowed = await verifyReceiverAllowedInList(
      supabase,
      { id: list.id, criteria: list.criteria },
      receiverProId
    )
    if (!allowed) {
      return NextResponse.json({ error: 'receiver_not_in_list' }, { status: 400 })
    }

    const { data: receiverPro } = await supabase
      .from('professionals')
      .select('id, name, contact_email, line_messaging_user_id, accepting_status, deactivated_at')
      .eq('id', receiverProId)
      .maybeSingle()

    if (!receiverPro || receiverPro.deactivated_at) {
      return NextResponse.json({ error: 'receiver_not_found' }, { status: 404 })
    }
    // レビュー指摘: fail safeを徹底するため「'closed'かどうか」ではなく「'open'かどうか」で判定する
    // (想定外の値は非受付扱いに倒す。isAcceptingOpenに統一)
    if (!isAcceptingOpen(receiverPro.accepting_status)) {
      return NextResponse.json({ error: 'receiver_not_accepting' }, { status: 409 })
    }

    // CEO決定(2026-08-03): 受け手に紹介予約可能なメニューが1件以上あるならメニュー選択は必須。
    // 未選択(=0円)を許すと決済(与信)を素通りできてしまうため(ステージ2の狙いの無効化防止)。
    // メニューが1件も無い受け手のみ、従来通りメニューなし相談を許容する。
    if (!menuId) {
      const { count: bookableMenuCount, error: menuCountError } = await supabase
        .from('pro_menus')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', receiverProId)
        .eq('is_referral_bookable', true)
        .neq('is_active', false)
      if (!menuCountError && (bookableMenuCount || 0) > 0) {
        return NextResponse.json({ error: 'menu_required' }, { status: 400 })
      }
    }

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
        menu.professional_id !== receiverProId ||
        !menu.is_referral_bookable ||
        menu.is_active === false ||
        typeof menu.price_jpy !== 'number'
      ) {
        return NextResponse.json({ error: 'invalid_menu' }, { status: 400 })
      }
      priceJpy = menu.price_jpy
      menuName = menu.name
    }

    // §2-4ステージ2: REFERRAL_STRIPE_SECRET_KEY未設定の間はここがfalse固定 → 決済フロー・
    // referral_bookings新カラム(payment_status等・migration 036)には一切触れない(従来動作を維持)。
    const paymentEnabled = isReferralPaymentEnabled()

    // レビュー指摘(軽微6): 決済有効時、Stripeの最低決済額(JPY 50円)未満のメニュー価格は
    // Checkout Session作成時にStripe側エラーになる。事前に400で弾く。
    if (paymentEnabled && priceJpy > 0 && priceJpy < 50) {
      return NextResponse.json({ error: 'invalid_menu_price' }, { status: 400 })
    }

    // §2-4ステージ2(重大2/3設計変更・draft方式): 決済有効かつ有料メニューの予約は
    // 'draft' で作成し、オーソリ完了まで受け手一覧・重複チェック・48h失効の対象外にする
    // (いずれも既存クエリが status='requested' 基準のため draft は自然に除外される)。
    const isDraft = paymentEnabled && priceJpy > 0
    const initialStatus: 'draft' | 'requested' = isDraft ? 'draft' : 'requested'

    // §2-4ステージ1: アカウントレス化に伴うスパム対策(緩めのバックストップ)。
    // 取得に失敗した場合はfail open(この保護自体をブロッカーにしない)。
    const { count: pendingCount, error: pendingCountError } = await supabase
      .from('referral_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_pro_id', receiverProId)
      .eq('status', 'requested')

    if (!pendingCountError && (pendingCount || 0) >= MAX_PENDING_PER_RECEIVER) {
      return NextResponse.json({ error: 'too_many_requests' }, { status: 429 })
    }

    // レビューFAIL修正(重大2): 同一メール×同一受け手への未処理(requested)重複を防ぐ
    // (ゲスト・ログイン済み共通。ゲストはclients行を都度新規作成するためclient_idでは防げない)
    const { data: existingEmailRequest } = await supabase
      .from('referral_bookings')
      .select('id')
      .eq('client_email', clientEmail)
      .eq('receiver_pro_id', receiverProId)
      .eq('status', 'requested')
      .maybeSingle()

    if (existingEmailRequest) {
      return NextResponse.json({ error: 'already_requested' }, { status: 409 })
    }

    const ownClient = userId ? await ensureOwnClient(userId) : await createGuestClient()
    if (!ownClient) {
      return NextResponse.json({ error: 'client_setup_failed' }, { status: 500 })
    }

    // §2-4ステージ2(draft方式): draft作成時はexpires_atをセットしない
    // (オーソリ完了時に昇格処理側で48hをセットする。src/lib/referral-payment.ts参照)。
    // draft以外(決済無効 or 0円予約)は従来通り即時に48h後を設定する。
    const expiresAt = isDraft ? null : new Date(Date.now() + BOOKING_EXPIRES_HOURS * 60 * 60 * 1000).toISOString()

    const { data: booking, error } = await supabase
      .from('referral_bookings')
      .insert({
        list_id: list.id,
        sender_pro_id: list.owner_id,
        receiver_pro_id: receiverProId,
        client_id: ownClient.id,
        menu_id: menuId,
        theme_tags: theme ? [theme] : null,
        preferred_slots: { slots: [slot1, slot2, slot3], note: note || null },
        status: initialStatus,
        price_jpy: priceJpy,
        // レビュー指摘(中2): Phase 1の料率(送り手30%+決済実費3.6%・リアプル利益0)は
        // paymentEnabledに関わらず常時上書きする(referral_bookingsのデフォルトはPhase 2値の
        // 4000/2800/1200)。決済フローの有効/無効はStripe連携の有無のみを制御する。
        fee_total_bps: 3360,
        fee_sender_bps: 3000,
        fee_platform_bps: 360,
        info_share_consent: true,
        expires_at: expiresAt,
        client_name: clientName,
        client_phone: clientPhone,
        client_email: clientEmail,
        // payment_statusは決済有効時のみ(migration 036依存のカラム)
        ...(paymentEnabled ? { payment_status: priceJpy > 0 ? 'unpaid' : 'not_required' } : {}),
      })
      .select('id, status, expires_at')
      .maybeSingle()

    if (error) {
      // 部分UNIQUE(uniq_referral_bookings_requested)違反 = 同一受け手への申請が既に進行中
      if (error.code === '23505') {
        return NextResponse.json({ error: 'already_requested' }, { status: 409 })
      }
      console.error('[api/referral/bookings] POST insert error:', error)
      return NextResponse.json({ error: 'failed_to_create' }, { status: 500 })
    }
    if (!booking) {
      console.error('[api/referral/bookings] insert succeeded but no row returned')
      return NextResponse.json({ error: 'failed_to_create' }, { status: 500 })
    }

    // §2-4ステージ2(draft方式): 決済有効かつ有料メニュー選択時のみStripe Checkout(オーソリのみ)を
    // 挟む。この場合、受け手通知はINSERT直後には送らず、オーソリ完了後(webhook/フォールバック)に送る。
    if (isDraft) {
      if (!list.slug) {
        // 重大4: 無決済で成立させない。Checkout URLを組めない場合は作成済みdraft行を削除して502
        console.error('[api/referral/bookings] missing list.slug; aborting checkout session creation')
        await supabase.from('referral_bookings').delete().eq('id', booking.id)
        return NextResponse.json({ error: 'payment_setup_failed' }, { status: 502 })
      }

      const checkout = await createReferralCheckoutSession({
        bookingId: booking.id,
        priceJpy,
        menuName,
        clientEmail,
        successUrl: `https://realproof.jp/r/${list.slug}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `https://realproof.jp/r/${list.slug}?payment=canceled&session_id={CHECKOUT_SESSION_ID}`,
      })

      if (!checkout) {
        // 重大4: Checkout Session作成失敗時は無決済のまま成立させず、draft行を削除して502を返す
        await supabase.from('referral_bookings').delete().eq('id', booking.id)
        return NextResponse.json({ error: 'payment_setup_failed' }, { status: 502 })
      }

      const { error: sessionUpdateError } = await supabase
        .from('referral_bookings')
        .update({ stripe_checkout_session_id: checkout.sessionId })
        .eq('id', booking.id)
      if (sessionUpdateError) {
        console.error('[api/referral/bookings] stripe_checkout_session_id update failed:', sessionUpdateError.message)
      }

      return NextResponse.json({ booking, checkout_url: checkout.url })
    }

    // 決済無効 / 0円予約(メニュー未選択)時: 従来通り即時通知(失敗しても予約リクエスト自体は成功扱い)
    try {
      await notifyBookingRequested(
        {
          name: receiverPro.name,
          contact_email: receiverPro.contact_email,
          line_messaging_user_id: receiverPro.line_messaging_user_id,
        },
        ownClient.nickname || 'クライアント',
      )
    } catch (notifyErr) {
      console.error('[api/referral/bookings] notify error:', notifyErr)
    }

    return NextResponse.json({ booking, checkout_url: null })
  } catch (err: any) {
    console.error('[api/referral/bookings] POST error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
