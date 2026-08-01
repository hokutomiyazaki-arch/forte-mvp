'use client'

/**
 * §2-4 予約リクエストフォーム(クライアント向け・/r/[slug]/request)
 *
 * - 未ログイン: Clerkサインアップへ誘導(redirect_urlでこのページに復帰)
 * - ログイン済み: フォーム送信 → POST /api/referral/bookings
 * - clientsレコードの作成はサーバー側(ensureOwnClient)で送信時に1回だけ行う
 */

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'

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
    acceptingStatus: 'open' | 'conditional' | 'closed' | null
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
  const { isLoaded, isSignedIn } = useUser()

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

  function goToSignUp() {
    const returnTo = `/r/${slug}/request?pro=${receiverPro.id}`
    window.location.href = `/sign-up?redirect_url=${encodeURIComponent(returnTo)}`
  }

  async function handleSubmit() {
    if (submitting) return
    setErrorMsg('')
    if (!slot1) {
      setErrorMsg('第1希望日時を入力してください')
      return
    }
    if (!consent) {
      setErrorMsg('情報共有への同意が必要です')
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
        }),
      })
      if (res.ok) {
        setDone(true)
      } else {
        const data = await res.json().catch(() => ({}))
        if (data.error === 'already_requested') {
          setErrorMsg('すでにリクエスト済みです。確定のご連絡をお待ちください。')
        } else if (data.error === 'receiver_not_accepting') {
          setErrorMsg('現在この先生は新規のご相談を受け付けていません。')
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

  if (!isSignedIn) {
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
          <div style={{ fontSize: 15, fontWeight: 700, color: T.dark, marginBottom: 10 }}>
            {receiverPro.name}さんへのご相談
          </div>
          <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8, marginBottom: 20 }}>
            ご相談・ご予約には会員登録が必要です。
            ご入力いただいた内容を保存し、確定のご連絡をお届けするために使用します。
          </p>
          <button
            onClick={goToSignUp}
            style={{
              width: '100%',
              padding: '13px 0',
              borderRadius: 10,
              border: 'none',
              background: T.dark,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            登録してご相談を申し込む
          </button>
        </div>
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

  if (receiverPro.acceptingStatus === 'closed') {
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
        {menus.length > 0 && (
          <div>
            <label style={labelStyle}>メニュー</label>
            <select value={menuId} onChange={(e) => setMenuId(e.target.value)} style={inputStyle}>
              <option value="">相談内容に応じて決める(未選択)</option>
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}(¥{m.price_jpy.toLocaleString()})
                </option>
              ))}
            </select>
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
          <span>お名前・ご希望日時・ご相談のテーマが、紹介元と紹介先の先生に共有されることに同意します</span>
        </label>

        {errorMsg && <p style={{ fontSize: 12, color: '#B00020' }}>{errorMsg}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !slot1 || !consent}
          style={{
            width: '100%',
            padding: '13px 0',
            borderRadius: 10,
            border: 'none',
            background: submitting || !slot1 || !consent ? '#E8E4DC' : T.dark,
            color: submitting || !slot1 || !consent ? T.textMuted : '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: submitting || !slot1 || !consent ? 'default' : 'pointer',
          }}
        >
          {submitting ? '送信中...' : 'この内容でリクエストする'}
        </button>
      </div>
    </div>
  )
}
