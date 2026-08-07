import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { ensureOwnClient, createGuestClient } from '@/lib/referral-auth'
import { verifyReceiverAllowedInList } from '@/lib/referral-data'
import { notifyBookingRequested, notifyBookingReceivedToClient } from '@/lib/referral-notify'
import { isAcceptingOpen } from '@/lib/referral-accepting'
import { isReferralPaymentEnabled, REFERRAL_MIN_FEE_JPY } from '@/lib/feature-flags'
import { parseSlot, snapToHalfHourUp } from '@/lib/referral-format'

const APP_URL = 'https://realproof.jp'

export const dynamic = 'force-dynamic'

/** §2-4: requested から48時間で自動失効 */
const BOOKING_EXPIRES_HOURS = 48
/**
 * §2-4ステージ3(予約フィー方式・CEO決定): オンライン決済は予約フィーのみ
 * (fee_amount = price_jpy * FEE_TOTAL_BPS / 10000)。残額は当日先生へ直接払い。
 * Phase 1固定値(送り手30% + 決済実費3.6%)。
 */
const FEE_TOTAL_BPS = 3360
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

    // 追加1(2026-08-05・CEO指示): 30分刻みへの正規化(拒否ではなく丸め・秒は切り捨て)。
    // 直叩き対策として、フロント側のstep/onChangeスナップに関わらずサーバー側でも丸める。
    const slot1 = parseSlot(snapToHalfHourUp(typeof body.slot1 === 'string' ? body.slot1 : null))
    const slot2 = parseSlot(snapToHalfHourUp(typeof body.slot2 === 'string' ? body.slot2 : null))
    const slot3 = parseSlot(snapToHalfHourUp(typeof body.slot3 === 'string' ? body.slot3 : null))

    if (!listId || !receiverProId) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 })
    }
    if (!slot1) {
      return NextResponse.json({ error: 'slot1_required' }, { status: 400 })
    }
    // 日時選択UX改善(2026-08-05・CEO指示): 過去日時のブロック。フロント側にmin属性+送信時
    // バリデーションを入れたが、直叩き対策としてサーバー側でも検証する。1件でも過去日時が
    // 含まれる場合は、その枠だけ静かに落とすのではなく400で明示してクライアントに直させる。
    const providedSlots = [slot1, slot2, slot3].filter((s): s is string => !!s)
    if (providedSlots.some((iso) => new Date(iso).getTime() <= Date.now())) {
      return NextResponse.json({ error: 'invalid_slots' }, { status: 400 })
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

    // メニュー未設定プロの予約穴の閉塞(2026-08-05・CEO指示・launch checklistの穴埋め): 受け手に
    // price_jpy > 0 の予約可能メニューが1件も無い場合は予約リクエスト自体を作れない
    // (price_jpy=0での無決済成立→連絡先の即時開示を防ぐ。/r/[slug]・requestページのUI非表示の
    // 直叩き対策)。旧仕様(メニュー0件の受け手のみメニューなし無料相談を許容)はここで終了する。
    // カウント取得自体が失敗した場合は既存の他カウントチェック(pendingCountError等)と同様にfail open。
    const { count: bookableMenuCount, error: menuCountError } = await supabase
      .from('pro_menus')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', receiverProId)
      .eq('is_referral_bookable', true)
      .neq('is_active', false)
      .gt('price_jpy', 0)

    if (!menuCountError && (bookableMenuCount || 0) === 0) {
      return NextResponse.json({ error: 'receiver_not_bookable' }, { status: 400 })
    }

    // CEO決定(2026-08-03): 受け手に紹介予約可能なメニューが1件以上あるならメニュー選択は必須。
    // 未選択(=0円)を許すと決済(与信)を素通りできてしまうため(ステージ2の狙いの無効化防止)。
    if (!menuId) {
      return NextResponse.json({ error: 'menu_required' }, { status: 400 })
    }

    let priceJpy = 0
    // 申し込み内容の控え(2026-08-05・CEO指示): 受付メールにメニュー名を載せるため保持する。
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
        typeof menu.price_jpy !== 'number' ||
        // メニュー未設定プロの予約穴の閉塞(2026-08-05): 0円メニューの直接指定も同じ穴になるため拒否
        menu.price_jpy <= 0
      ) {
        return NextResponse.json({ error: 'invalid_menu' }, { status: 400 })
      }
      priceJpy = menu.price_jpy
      menuName = menu.name
    }

    // §2-4ステージ3(予約フィー方式・CEO決定): 相談送信時は決済を挟まない(従来の無決済フローに戻す)。
    // 決済(予約フィーのみ)は受け手プロが日時を確定した後に発生する(bookings/received PATCH confirm参照)。
    const paymentEnabled = isReferralPaymentEnabled()

    // レビュー指摘(軽微6)から継続: 極端に低いメニュー価格設定への安全策として維持する。
    if (paymentEnabled && priceJpy > 0 && priceJpy < REFERRAL_MIN_FEE_JPY) {
      return NextResponse.json({ error: 'invalid_menu_price' }, { status: 400 })
    }

    // §2-4ステージ3: 決済対象は総額(priceJpy)ではなく予約フィー(fee_amount)のみ。
    // fee_amountがStripeの最低決済額未満になる場合は決済自体をスキップし、
    // 従来通り無決済で成立させる(payment_status: 'not_required'。理由: 数十円の決済はStripe側で
    // エラーになるうえ実費に対して不合理なため、この場合は現地決済のみで完了とする)。
    const feeAmountJpy = priceJpy > 0 ? Math.floor((priceJpy * FEE_TOTAL_BPS) / 10000) : 0
    const paymentRequired = paymentEnabled && priceJpy > 0 && feeAmountJpy >= REFERRAL_MIN_FEE_JPY

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

    // §2-4ステージ3(予約フィー方式): 相談送信時は決済を挟まないため、常に'requested'で作成し
    // 即時に48h後の失効期限を設定する(旧draft方式の分岐を撤去)。
    const expiresAt = new Date(Date.now() + BOOKING_EXPIRES_HOURS * 60 * 60 * 1000).toISOString()

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
        status: 'requested',
        price_jpy: priceJpy,
        // レビュー指摘(中2): Phase 1の料率(送り手30%+決済実費3.6%・リアプル利益0)は
        // paymentEnabledに関わらず常時上書きする(referral_bookingsのデフォルトはPhase 2値の
        // 4000/2800/1200)。決済フローの有効/無効はStripe連携の有無のみを制御する。
        fee_total_bps: FEE_TOTAL_BPS,
        fee_sender_bps: 3000,
        fee_platform_bps: 360,
        info_share_consent: true,
        expires_at: expiresAt,
        client_name: clientName,
        client_phone: clientPhone,
        client_email: clientEmail,
        // payment_statusは決済有効時のみ(migration 036依存のカラム)。予約フィー方式では
        // 実際の決済は確定時(bookings/received PATCH confirm)に発生するため、ここでは
        // 「支払いが必要かどうか」だけを記録する('unpaid'|'not_required')。
        ...(paymentEnabled ? { payment_status: paymentRequired ? 'unpaid' : 'not_required' } : {}),
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

    // §2-4ステージ3: 相談送信時は常に無決済で成立し、受け手へ即時通知する
    // (失敗しても予約リクエスト自体は成功扱い)。
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

    // タスクC: 送信直後の受付メール(クライアント向け)。失敗しても予約リクエスト自体は成功扱い。
    // §17-3④/§17-9(CEO報告 2026-08-06「紹介予約でのメール間違いが反映されてない」):
    //   直接予約(/api/bookings)にだけ入れていた「受付メールが送れなかった印」を、
    //   紹介予約にも入れる。紹介予約では決済リンクのメールも届かなくなるため、
    //   気づけないと予約が支払い待ちのまま自動キャンセルされて終わる。
    let receiptSent = false
    try {
      const listUrl = list.slug ? `${APP_URL}/r/${list.slug}` : APP_URL
      if (userId || clientEmail) {
        const receipt = await notifyBookingReceivedToClient(
          { userId, email: clientEmail },
          receiverPro.name,
          listUrl,
          {
            paymentFlowActive: paymentRequired,
            // 申し込み内容の控え(2026-08-05・CEO指示): お名前・電話番号は渡さない(PII最小化)。
            menuName,
            menuPriceJpy: menuId ? priceJpy : null,
            slot1,
            slot2,
            slot3,
            theme: theme || null,
            note,
          }
        )
        receiptSent = receipt.sent
      }
    } catch (notifyErr) {
      console.error('[api/referral/bookings] receipt notify error:', notifyErr)
    }

    if (!receiptSent) {
      // 受け手プロのカードに「お客さんに受付メールが届いていません」を出すための印。
      // 新カラムは作らず preferred_slots に持つ（既存のマーカーと同じ作法）。
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
        console.error('[api/referral/bookings] receipt failure mark error:', markErr)
      }
    }

    return NextResponse.json({ booking, receipt_sent: receiptSent })
  } catch (err: any) {
    console.error('[api/referral/bookings] POST error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
