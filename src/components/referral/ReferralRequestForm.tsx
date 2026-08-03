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
  slug: string
  listId: string
  receiverPro: {
    id: string
    name: string
    photoUrl: string | null
    title: string | null
    acceptingStatus: 'open' | 'closed' | null
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

export default function ReferralRequestForm({ slug, listId, receiverPro, menus }: Props) {
  const { isLoaded, user } = useUser()

  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [menuId, setMenuId] = useState('')
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
                : !consent
                  ? '情報共有への同意にチェックすると送信できます'
                  : ''

  async function handleSubmit() {
    if (submitting) return
    setErrorMsg('')
    if (missingReason) {
      setErrorMsg(missingReason)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/referral/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          list_id: listId,
          receiver_pro_id: receiverPro.id,
          menu_id: menuId || null,
          slot1,
          slot2: slot2 || null,
          slot3: slot3 || null,
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
          setErrorMsg('この先生への相談リクエストは既に送信済みです。確定のご連絡をお待ちください。')
        } else if (data.error === 'receiver_not_accepting') {
          setErrorMsg('現在この先生は新規のご相談を受け付けていません。')
        } else if (data.error === 'contact_required') {
          setErrorMsg('お名前・電話番号・メールアドレスをご確認ください。')
        } else if (data.error === 'too_many_requests') {
          setErrorMsg('現在リクエストが集中しています。しばらくしてからお試しください。')
        } else if (data.error === 'menu_required') {
          setErrorMsg('メニューを選択してください。')
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
  if (!isAcceptingOpen(receiverPro.acceptingStatus)) {
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
          <div style={{ fontSize: 16, fontWeight: 700, color: T.dark }}>{receiverPro.name}さんへのご相談</div>
          {receiverPro.title && <div style={{ fontSize: 12, color: T.textSub }}>{receiverPro.title}</div>}
        </div>
      </div>

      <p style={{ fontSize: 12, color: T.textSub, lineHeight: 1.7, marginBottom: 16 }}>
        決済・会員登録は不要です。プロが日時を確定した後、担当の先生から直接ご連絡します。
        <br />
        プロが日時を確定すると、予約フィーのお支払いご案内がメールで届きます(お支払いで予約成立・総額は変わりません)。
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
        <div>
          <label style={labelStyle}>お名前(必須)</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value.slice(0, 50))}
            placeholder="山田 太郎"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>電話番号(必須)</label>
          <input
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value.slice(0, 20))}
            placeholder="090-1234-5678"
            inputMode="tel"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>メールアドレス(必須)</label>
          <input
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value.slice(0, 254))}
            placeholder="example@mail.com"
            inputMode="email"
            style={inputStyle}
          />
        </div>

        {menus.length > 0 && (
          <div>
            <label style={labelStyle}>メニュー（必須）</label>
            <select value={menuId} onChange={(e) => setMenuId(e.target.value)} style={inputStyle}>
              <option value="">選択してください</option>
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}(¥{m.price_jpy.toLocaleString()})
                </option>
              ))}
            </select>
            {/* §2-4ステージ3(§0-6静かに・CEO決定): 予約フィー方式の総額不変を軽く明示 */}
            <p style={{ fontSize: 11, color: T.textMuted, marginTop: 6, lineHeight: 1.6 }}>
              オンラインでのお支払いは予約フィーのみ。総額は変わりません。
            </p>
          </div>
        )}

        <div>
          <label style={labelStyle}>第1希望(必須)</label>
          <input type="datetime-local" value={slot1} onChange={(e) => setSlot1(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>第2希望(任意)</label>
          <input type="datetime-local" value={slot2} onChange={(e) => setSlot2(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>第3希望(任意)</label>
          <input type="datetime-local" value={slot3} onChange={(e) => setSlot3(e.target.value)} style={inputStyle} />
        </div>

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
            お名前・ご希望日時・ご相談のテーマが、紹介元と紹介先の先生に共有されることに同意します。
            お名前・電話番号・メールアドレスは、日程確定のご連絡と、確定後に担当の先生への共有のために保存されます。
          </span>
        </label>

        {errorMsg && <p style={{ fontSize: 12, color: '#B00020' }}>{errorMsg}</p>}
        {!errorMsg && missingReason && (
          <p style={{ fontSize: 12, color: T.textMuted }}>{missingReason}</p>
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
    </div>
  )
}
