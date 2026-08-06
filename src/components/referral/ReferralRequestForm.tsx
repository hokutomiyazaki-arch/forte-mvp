'use client'

/**
 * §2-4 予約リクエストフォーム(クライアント向け・/r/[slug]/request)
 *
 * §2-4ステージ1(CEO決定・アカウントレス化): 会員登録なしで誰でも送信できる。
 * - 未ログイン: そのままフォームを表示・送信できる(clientsレコードはサーバー側でゲスト作成)
 * - ログイン済み: 従来通りフォーム送信 → POST /api/referral/bookings(own clientに紐付け)
 * - お名前・電話番号・メールアドレスは必須収集(referral_bookings行に保存。開示は別ステージ)
 */

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { isAcceptingOpen } from '@/lib/referral-accepting'
// レビューFAIL修正(軽微2): ローカル実装(ReferralBookingReceivedCard.tsxと重複)を撤去し、
// src/lib/referral-format.ts の formatSlotWithWeekday に統一する(referral-formatはimport 0本の
// リーフでチャンクグラフ安全)。
// 日時選択UX改善(2026-08-05・CEO指示): 過去日時ブロック・確定期限48h警告・受付時間の
// 選択肢生成で使う純関数(datetime-local廃止・SlotPickerで自前ピッカーに統一)。
import {
  isPastDatetimeLocalValue,
  isWithinHoursFromNow,
  snapToHalfHourUp,
  formatBusinessHoursText,
  isOutsideBusinessHours,
  buildHalfHourTimeOptions,
  type BusinessHours,
} from '@/lib/referral-format'
// カード化(2026-08-05・CEO指示): 第1〜第3希望を独立カード+段階的追加で表示する共通ラッパー。
import SlotCardGroup from '@/components/referral/SlotCardGroup'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** レビューFAIL修正(軽微5): 表記(+81/空白/括弧/ハイフン)は許容し、数字だけで10桁以上かで判定する */
function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, '').length >= 10
}

interface BookableMenu {
  id: string
  name: string
  price_jpy: number
  duration_min: number | null
}

interface Props {
  /** 紹介リストのslug（表示には使っていないが、呼び出し元の文脈を残すため受け取る）。直接予約では null */
  slug: string | null
  /** 直接予約(variant='direct')では紹介元リストが無いので null */
  listId: string | null
  /**
   * §17-1(CEO決定 2026-08-06): REALPROOFの直接予約でも同じフォームを使う。
   * 別フォームを作らない理由は、日時ピッカー・進行順・警告表示がまったく同じで、
   * コピーすると必ず片方だけ直る状態になるため（CLAUDE.md §G）。
   * 違いは「送信先API」「予約金の説明を出さない」「同意文」の3点だけ。
   */
  variant?: 'referral' | 'direct'
  /** メニューから来た場合の初期選択（?menu=...） */
  initialMenuId?: string | null
  receiverPro: {
    id: string
    name: string
    photoUrl: string | null
    title: string | null
    acceptingStatus: 'open' | 'closed' | null
    /** 追加3(2026-08-05・CEO指示・設計variantB): 受付時間(未設定/カラム未作成時はnull=非表示・fail-soft)。 */
    businessHours?: BusinessHours | null
  }
  menus: BookableMenu[]
}

const T = {
  bg: '#FAF8F4',
  cardBg: '#FFFFFF',
  cardBorder: '#E8E4DC',
  dark: '#1A1A2E',
  gold: '#C4A35A',
  text: '#2D2D2D',
  textSub: '#555555',
  textMuted: '#888888',
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${T.cardBorder}`,
  fontSize: 13,
  boxSizing: 'border-box' as const,
}

const labelStyle = {
  fontSize: 12,
  fontWeight: 700 as const,
  color: T.dark,
  display: 'block',
  marginBottom: 6,
}

export default function ReferralRequestForm({
  slug,
  listId,
  receiverPro,
  menus,
  variant = 'referral',
  initialMenuId = null,
}: Props) {
  const { isLoaded, user } = useUser()
  const isDirect = variant === 'direct'

  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [menuId, setMenuId] = useState(initialMenuId || '')
  const [slot1, setSlot1] = useState('')
  const [slot2, setSlot2] = useState('')
  const [slot3, setSlot3] = useState('')
  const [theme, setTheme] = useState('')
  const [note, setNote] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [done, setDone] = useState(false)

  // レビューFAIL修正(中4): useUser()は遅延ロードのため、初回レンダー時のuseState初期値では
  // Clerkの氏名を拾えないことがある。isLoaded/user.idが確定した時点で1回だけ反映する
  // (依存配列はプリミティブのみ。既に入力済みの場合は上書きしない)。
  useEffect(() => {
    if (!isLoaded || !user) return
    setClientName((prev) => prev || `${user.lastName || ''} ${user.firstName || ''}`.trim() || user.username || '')
  }, [isLoaded, user?.id])

  // CEO決定(2026-08-03): メニューがある受け手ではメニュー選択必須(未選択=0円で決済を素通りさせない)
  const missingReason = !clientName
    ? 'お名前を入力すると送信できます'
    : !clientPhone
      ? '電話番号を入力すると送信できます'
      : !isValidPhone(clientPhone)
        ? '電話番号の桁数をご確認ください(10桁以上)'
        : !clientEmail
          ? 'メールアドレスを入力すると送信できます'
          : !EMAIL_PATTERN.test(clientEmail)
            ? 'メールアドレスの形式をご確認ください'
            : menus.length > 0 && !menuId
              ? 'メニューを選択すると送信できます'
              : !slot1
                ? '第1希望日時を入力すると送信できます'
                : isPastDatetimeLocalValue(slot1) || isPastDatetimeLocalValue(slot2) || isPastDatetimeLocalValue(slot3)
                  ? '過去の日時は選択できません'
                  : !consent
                    ? '情報共有への同意にチェックすると送信できます'
                    : ''

  // プログレッシブフォーム(2026-08-05・CEO指示): 上から順に「メニュー→日時→お名前→電話番号→
  // メールアドレス→テーマ・補足・同意・送信」の順で1項目ずつ出現させる。表示済みの項目は
  // 畳まない(値を消しても隠さない)ため、各段の「出現済みか」はuseStateで一方向にのみtrueへ
  // 遷移させる(いわゆる高水位線パターン)。Reactは「レンダー中の条件付きsetState」を
  // 公式にサポートしており、useEffectに依存しないためdeps配列の懸念自体が発生しない。
  const hasMenus = menus.length > 0
  const menuDone = !hasMenus || !!menuId
  const slot1Done = !!slot1
  const nameDone = clientName.trim().length > 0
  const phoneDone = isValidPhone(clientPhone)
  const emailDone = !!clientEmail && EMAIL_PATTERN.test(clientEmail)

  const [slotRevealed, setSlotRevealed] = useState(menuDone)
  if (menuDone && !slotRevealed) setSlotRevealed(true)

  const [nameRevealed, setNameRevealed] = useState(slotRevealed && slot1Done)
  if (slotRevealed && slot1Done && !nameRevealed) setNameRevealed(true)

  const [phoneRevealed, setPhoneRevealed] = useState(nameRevealed && nameDone)
  if (nameRevealed && nameDone && !phoneRevealed) setPhoneRevealed(true)

  const [emailRevealed, setEmailRevealed] = useState(phoneRevealed && phoneDone)
  if (phoneRevealed && phoneDone && !emailRevealed) setEmailRevealed(true)

  // 最終ブロック(テーマ・補足・同意・送信ボタン)。テーマ・補足は任意項目のため個別の出現ゲートを
  // 設けず、メールアドレスの妥当な入力後にまとめて表示する。
  const [finalRevealed, setFinalRevealed] = useState(emailRevealed && emailDone)
  if (emailRevealed && emailDone && !finalRevealed) setFinalRevealed(true)

  // 「最新出現の項目」の強調表示用(左ボーダー)。優先順位は出現順の末尾から判定する。
  const latestStep: 'menu' | 'slot' | 'name' | 'phone' | 'email' | 'final' = finalRevealed
    ? 'final'
    : emailRevealed
      ? 'email'
      : phoneRevealed
        ? 'phone'
        : nameRevealed
          ? 'name'
          : slotRevealed
            ? 'slot'
            : 'menu'
  const activeBorderStyle = { borderLeft: `3px solid ${T.gold}`, paddingLeft: 10 }

  // 送信ボタンの「あと◯項目です」進捗表示(任意実装・CEO指示)。missingReasonと同じ必須項目を数える。
  const remainingRequiredCount = [
    nameDone,
    phoneDone,
    emailDone,
    ...(hasMenus ? [!!menuId] : []),
    slot1Done,
    consent,
  ].filter((d) => !d).length

  // CEO指示(2026-08-05・タスク2): プロの確定期限(48時間)に近い希望日時が1件でもあれば警告(ブロックしない)。
  const hasNear48hSlot =
    isWithinHoursFromNow(slot1, 48) || isWithinHoursFromNow(slot2, 48) || isWithinHoursFromNow(slot3, 48)

  // 追加3(2026-08-05・CEO指示)/日時ピッカー設計最終版: 受付時間の表示テキスト・時刻選択肢
  // (business_hours設定済みならその範囲・終了の30分前まで。未設定なら07:00〜22:00)・
  // 受付時間外/定休日の警告(ブロックしない)。
  const businessHours = receiverPro.businessHours ?? null
  const businessHoursText = formatBusinessHoursText(businessHours)
  const timeOptions = buildHalfHourTimeOptions(businessHours?.start || '07:00', businessHours?.end || '22:00')
  const hasOutsideBusinessHoursSlot =
    isOutsideBusinessHours(slot1, businessHours) ||
    isOutsideBusinessHours(slot2, businessHours) ||
    isOutsideBusinessHours(slot3, businessHours)

  async function handleSubmit() {
    if (submitting) return
    setErrorMsg('')
    if (missingReason) {
      setErrorMsg(missingReason)
      return
    }
    setSubmitting(true)
    try {
      // §17-1: 直接予約は紹介元(list)が無く、予約金も通らない別APIへ送る。
      const res = await fetch(isDirect ? '/api/bookings' : '/api/referral/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          ...(isDirect ? { pro_id: receiverPro.id } : { list_id: listId, receiver_pro_id: receiverPro.id }),
          menu_id: menuId || null,
          // 追加1(2026-08-05・CEO指示): 送信時にも30分刻みへスナップする(onChangeで既に揃っているはず
          // だが、二重の安全網としてここでも正規化する)。
          slot1: snapToHalfHourUp(slot1),
          slot2: slot2 ? snapToHalfHourUp(slot2) : null,
          slot3: slot3 ? snapToHalfHourUp(slot3) : null,
          theme,
          note,
          info_share_consent: true,
          client_name: clientName,
          client_phone: clientPhone,
          client_email: clientEmail,
        }),
      })
      if (res.ok) {
        // §2-4ステージ3(予約フィー方式・設計変更): 相談送信時はStripe Checkoutへ遷移しない
        // (無決済フローに戻す。決済はプロが日時を確定した後、メールの決済リンク経由で発生する)。
        setDone(true)
      } else {
        const data = await res.json().catch(() => ({}))
        if (data.error === 'already_requested') {
          setErrorMsg(
            isDirect
              ? 'この先生へのご予約リクエストは既に送信済みです。確定のご連絡をお待ちください。'
              : 'この先生への相談リクエストは既に送信済みです。確定のご連絡をお待ちください。',
          )
        } else if (data.error === 'receiver_not_accepting' || data.error === 'not_accepting') {
          setErrorMsg(
            isDirect
              ? '現在この先生はご予約を受け付けていません。'
              : '現在この先生は新規のご相談を受け付けていません。',
          )
        } else if (data.error === 'external_booking') {
          // 送信直前にプロが「自分のサイトで受ける」に切り替えた場合の保険
          setErrorMsg('この先生のご予約は、先生ご自身のサイトで受け付けています。プロフィールからお進みください。')
        } else if (data.error === 'invalid_menu') {
          setErrorMsg('このメニューは現在ご予約いただけません。別のメニューをお選びください。')
        } else if (data.error === 'contact_required') {
          setErrorMsg('お名前・電話番号・メールアドレスをご確認ください。')
        } else if (data.error === 'too_many_requests') {
          setErrorMsg('現在リクエストが集中しています。しばらくしてからお試しください。')
        } else if (data.error === 'invalid_slots') {
          setErrorMsg('過去の日時は選択できません。ご希望日時をご確認ください。')
        } else if (data.error === 'menu_required') {
          setErrorMsg('メニューを選択してください。')
        } else if (data.error === 'receiver_not_bookable') {
          // メニュー未設定プロの予約穴の閉塞(2026-08-05): 通常はページ側で事前にフォーム非表示にするため
          // このエラーは主に直叩き/タイミング差(送信直前にメニューが削除された等)への保険。
          setErrorMsg('この先生は現在オンライン予約を準備中です。')
        } else if (data.error === 'invalid_menu_price') {
          setErrorMsg('このメニューは現在オンライン決済に対応していません。先生に直接お問い合わせください。')
        } else {
          setErrorMsg('送信に失敗しました。もう一度お試しください。')
        }
      }
    } catch {
      setErrorMsg('送信に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isLoaded) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 16px', textAlign: 'center', color: T.textMuted }}>
        読み込み中...
      </div>
    )
  }

  if (done) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px', background: T.bg, minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', marginBottom: 20, marginTop: 20 }}>
          <span style={{ fontSize: 12, letterSpacing: 2, color: T.gold, fontWeight: 700 }}>REAL PROOF</span>
        </div>
        <div
          style={{
            background: T.cardBg,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 16,
            padding: '32px 20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: T.dark, marginBottom: 10 }}>
            リクエストを送信しました
          </div>
          <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>
            {receiverPro.name}さんが確定すると、メールでお知らせします。
            <br />
            48時間以内に確定のご連絡がなかった場合は、自動的に無効になります。
          </p>
        </div>
      </div>
    )
  }

  // レビュー指摘: fail safeを徹底するため「'closed'かどうか」ではなく「'open'かどうか」で判定する(isAcceptingOpenに統一)
  // §17-1: 直接予約の受付可否は accepting_status(=紹介の受付) ではなく booking_enabled で決まる。
  // 判定はページ側(/book/[proId])で済ませてあるので、ここでは紹介予約のときだけ見る。
  if (!isDirect && !isAcceptingOpen(receiverPro.acceptingStatus)) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px', background: T.bg, minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', marginBottom: 20, marginTop: 20 }}>
          <span style={{ fontSize: 12, letterSpacing: 2, color: T.gold, fontWeight: 700 }}>REAL PROOF</span>
        </div>
        <div
          style={{
            background: T.cardBg,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: 16,
            padding: '24px 20px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>
            現在、{receiverPro.name}さんは新規のご相談を受け付けていません。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 40px', background: T.bg }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 12, letterSpacing: 2, color: T.gold, fontWeight: 700 }}>REAL PROOF</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        {receiverPro.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={receiverPro.photoUrl}
            alt=""
            style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E8E4DC', flexShrink: 0 }} />
        )}
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.dark }}>
            {receiverPro.name}さんへの{isDirect ? 'ご予約' : 'ご相談'}
          </div>
          {receiverPro.title && <div style={{ fontSize: 12, color: T.textSub }}>{receiverPro.title}</div>}
        </div>
      </div>

      <p style={{ fontSize: 12, color: T.textSub, lineHeight: 1.7, marginBottom: 16 }}>
        {isDirect ? (
          <>
            {/* §17-1: 直接予約は予約金なし（CEO決定）。お金の話をここに書かない。 */}
            会員登録もお支払いも不要です。ご希望の日時を送ると、{receiverPro.name}さんが確定して
            メールでお知らせします。
            <br />
            この時点ではまだ確定ではありません（先生の確定をもって予約成立です）。
          </>
        ) : (
          <>
            決済・会員登録は不要です。プロが日時を確定した後、担当の先生から直接ご連絡します。
            <br />
            プロが日時を確定すると、予約金のお支払いご案内がメールで届きます(お支払いで紹介予約成立・総額は変わりません)。
          </>
        )}
      </p>

      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: 16,
          padding: '18px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* プログレッシブフォーム(2026-08-05・CEO指示): ①メニュー→②日時→③お名前→④電話番号→
            ⑤メールアドレス→⑥テーマ・⑦補足(+同意・送信)の順で1項目ずつ出現させる。
            表示済みの項目は畳まない(値を消しても隠れない・高水位線パターン)。 */}
        {hasMenus && (
          <div style={latestStep === 'menu' ? activeBorderStyle : undefined}>
            <label style={labelStyle}>メニュー（必須）</label>
            <select value={menuId} onChange={(e) => setMenuId(e.target.value)} style={inputStyle}>
              <option value="">選択してください</option>
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.price_jpy > 0 ? `(¥${m.price_jpy.toLocaleString()})` : ''}
                </option>
              ))}
            </select>
            {/* §2-4ステージ3(§0-6静かに・CEO決定): 予約フィー方式の総額不変を軽く明示。
                §17-1: 直接予約はオンライン決済が無いので、この一文自体を出さない。 */}
            {!isDirect && (
              <p style={{ fontSize: 11, color: T.textMuted, marginTop: 6, lineHeight: 1.6 }}>
                オンラインでのお支払いは予約金のみ。総額は変わりません。
              </p>
            )}
            {isDirect && (
              <p style={{ fontSize: 11, color: T.textMuted, marginTop: 6, lineHeight: 1.6 }}>
                お支払いは当日、{receiverPro.name}さんへ直接お願いします。
              </p>
            )}
          </div>
        )}

        {slotRevealed && (
          <div style={latestStep === 'slot' ? activeBorderStyle : undefined}>
            {/* 追加3(2026-08-05・CEO指示・設計variantB): 受け手プロの受付時間(設定済みの場合のみ表示)。 */}
            {businessHoursText && (
              <div style={{ fontSize: 13, color: T.textSub, marginBottom: 8 }}>
                受付時間: {businessHoursText}
              </div>
            )}
            {/* カード化(2026-08-05・CEO指示): 第1〜第3希望を独立カード+段階的追加で表示する
                (境界を明確化・第1希望のみ最初に表示・完了後に次の希望を追加できる)。 */}
            <SlotCardGroup
              values={[slot1, slot2, slot3]}
              onChangeAt={(index, next) => {
                if (index === 0) setSlot1(next)
                else if (index === 1) setSlot2(next)
                else setSlot3(next)
              }}
              timeOptions={timeOptions}
            />
            {hasNear48hSlot && (
              <div
                style={{
                  background: '#FFF8E1',
                  border: '1px solid #F0D98C',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 13,
                  color: '#8A6D00',
                  lineHeight: 1.7,
                  marginTop: 10,
                }}
              >
                先生のご確定には最大48時間かかることがあります。直近の日時はご希望に添えない場合があります。
              </div>
            )}
            {/* 追加3(2026-08-05・CEO指示): 受付時間外/定休日の可能性がある枠の警告(ブロックしない)。 */}
            {hasOutsideBusinessHoursSlot && (
              <div
                style={{
                  background: '#FFF8E1',
                  border: '1px solid #F0D98C',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 13,
                  color: '#8A6D00',
                  lineHeight: 1.7,
                  marginTop: 10,
                }}
              >
                この日時は{receiverPro.name}さんの受付時間外の可能性があります。
              </div>
            )}
          </div>
        )}

        {nameRevealed && (
          <div style={latestStep === 'name' ? activeBorderStyle : undefined}>
            <label style={labelStyle}>お名前(必須)</label>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value.slice(0, 50))}
              placeholder="山田 太郎"
              style={inputStyle}
            />
          </div>
        )}

        {phoneRevealed && (
          <div style={latestStep === 'phone' ? activeBorderStyle : undefined}>
            <label style={labelStyle}>電話番号(必須)</label>
            <input
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value.slice(0, 20))}
              placeholder="090-1234-5678"
              inputMode="tel"
              style={inputStyle}
            />
          </div>
        )}

        {emailRevealed && (
          <div style={latestStep === 'email' ? activeBorderStyle : undefined}>
            <label style={labelStyle}>メールアドレス(必須)</label>
            <input
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value.slice(0, 254))}
              placeholder="example@mail.com"
              inputMode="email"
              style={inputStyle}
            />
          </div>
        )}

        {finalRevealed && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              ...(latestStep === 'final' ? activeBorderStyle : {}),
            }}
          >
            <div>
              <label style={labelStyle}>ご相談のテーマ(任意)</label>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value.slice(0, 100))}
                placeholder="例: 産後の骨盤ケアについて"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>補足(任意)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                placeholder="伝えておきたいことがあればご記入ください"
                style={{ ...inputStyle, minHeight: 70, resize: 'vertical' as const }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                {isDirect ? (
                  <>
                    お名前・ご希望日時・ご相談のテーマが{receiverPro.name}さんに共有されることに同意します。
                    お名前・電話番号・メールアドレスは、日程確定のご連絡と、確定後に{receiverPro.name}さんへ
                    お伝えするために保存されます。
                  </>
                ) : (
                  <>
                    お名前・ご希望日時・ご相談のテーマが、紹介元と紹介先の先生に共有されることに同意します。
                    お名前・電話番号・メールアドレスは、日程確定のご連絡と、確定後に担当の先生への共有のために保存されます。
                  </>
                )}
              </span>
            </label>

            {errorMsg && <p style={{ fontSize: 12, color: '#B00020' }}>{errorMsg}</p>}
            {!errorMsg && missingReason && (
              <p style={{ fontSize: 12, color: T.textMuted }}>{missingReason}</p>
            )}
            {/* 進捗表示(任意実装・CEO指示): 送信ボタンがdisabledの間、残り必須項目数を1行で示す。 */}
            {remainingRequiredCount > 0 && (
              <p style={{ fontSize: 13, color: T.textMuted }}>あと{remainingRequiredCount}項目です</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || !!missingReason}
              style={{
                width: '100%',
                padding: '13px 0',
                borderRadius: 10,
                border: 'none',
                background: submitting || missingReason ? '#E8E4DC' : T.dark,
                color: submitting || missingReason ? T.textMuted : '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: submitting || missingReason ? 'default' : 'pointer',
              }}
            >
              {submitting ? '送信中...' : 'この内容でリクエストする'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
