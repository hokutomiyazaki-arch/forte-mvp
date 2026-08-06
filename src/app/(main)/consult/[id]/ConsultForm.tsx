'use client'

import { useState } from 'react'

const T = {
  dark: '#1A1A2E',
  gold: '#C4A35A',
  bg: '#FAFAF7',
  border: '#E5E7EB',
  muted: '#6B7280',
  faint: '#9CA3AF',
  danger: '#E24B4A',
}

const NAME_MAX = 50
const BODY_MAX = 2000

interface Props {
  proId: string
  proName: string
  proPhotoUrl: string | null
  proTitle: string | null
  proStoreName: string | null
  accepting: boolean
}

/**
 * 相談フォーム本体（§16-19）
 *
 * 入れるのは「お名前 / メールアドレス / 相談内容」の3つだけ。日時は聞かない。
 * 送信後は「メールを見てください」で終わらせる。やりとりの続きはメール内のリンクから。
 * （Resend は送信専用でメール返信を受け取れないため、リンクで戻ってもらう設計）
 */
export default function ConsultForm({ proId, proName, proPhotoUrl, proTitle, proStoreName, accepting }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [body, setBody] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [doneToken, setDoneToken] = useState<string | null>(null)

  const canSubmit = !!name.trim() && !!email.trim() && !!body.trim() && agreed && !sending

  async function submit() {
    if (!canSubmit) return
    // 認証・非同期の前に全stateを固定（stale state対策）
    const snapshot = {
      pro_id: proId,
      client_name: name.trim(),
      client_email: email.trim(),
      body: body.trim(),
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(snapshot),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 429 && json.token) {
          // 直前に同じ相談を送っている。新しいスレッドを作らず既存のやりとりへ送る。
          window.location.href = `/consult/thread/${json.token}`
          return
        }
        setError(
          json.error === 'not_accepting'
            ? `${proName}さんは現在ご相談を受け付けていません。`
            : json.error === 'email_invalid'
              ? 'メールアドレスの形式をご確認ください。'
              : json.error === 'pro_not_found'
                ? 'この方は現在ご利用いただけません。'
                : '送信できませんでした。時間をおいてお試しください。',
        )
        return
      }
      setDoneToken(json.token || '')
    } catch {
      setError('送信できませんでした。通信環境をご確認ください。')
    } finally {
      setSending(false)
    }
  }

  const wrap: React.CSSProperties = {
    maxWidth: 560, margin: '0 auto', padding: '24px 20px 60px',
    background: T.bg, minHeight: '100vh', color: T.dark,
  }
  const label: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6,
  }
  const input: React.CSSProperties = {
    width: '100%', padding: '12px 14px', fontSize: 16,
    border: `1px solid ${T.border}`, borderRadius: 10,
    boxSizing: 'border-box', background: '#fff',
  }

  // ── 送信完了 ──
  if (doneToken !== null) {
    return (
      <div style={wrap}>
        <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>ご相談を送りました</h1>
          <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.8 }}>
            {proName}さんにお伝えしました。<br />
            お返事が届いたらメールでお知らせします。
          </p>
          <p style={{ fontSize: 13, color: T.faint, lineHeight: 1.8, marginTop: 16 }}>
            受付のメールをお送りしています。届いていない場合は迷惑メールフォルダをご確認ください。
          </p>
          {doneToken && (
            <a
              href={`/consult/thread/${doneToken}`}
              style={{
                display: 'inline-block', marginTop: 20, padding: '12px 20px',
                background: T.dark, color: T.gold, borderRadius: 10,
                fontWeight: 700, fontSize: 14, textDecoration: 'none',
              }}
            >
              やりとりを見る
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      {/* 相手の確認（誰に送ろうとしているかを取り違えないように） */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
        background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 16,
      }}>
        {proPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proPhotoUrl} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: T.dark,
            color: T.gold, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 18,
          }}>{proName.charAt(0)}</div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{proName} さん</div>
          {(proTitle || proStoreName) && (
            <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>
              {[proTitle, proStoreName].filter(Boolean).join(' / ')}
            </div>
          )}
        </div>
      </div>

      {!accepting ? (
        <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.8 }}>
            {proName}さんは現在、新規のご相談を受け付けていません。
          </p>
          <a href={`/card/${proId}`} style={{ display: 'inline-block', marginTop: 16, fontSize: 13, color: T.gold, textDecoration: 'none' }}>
            プロフィールに戻る →
          </a>
        </div>
      ) : (
        <>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>ご相談内容をお聞かせください</h1>
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.8, marginBottom: 20 }}>
            日時を決める必要はありません。気になっていることをそのまま書いてください。
            お返事はご登録のメールアドレスに届きます。
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={label}>お名前</label>
            <input
              type="text"
              value={name}
              maxLength={NAME_MAX}
              onChange={e => setName(e.target.value)}
              placeholder="山田 太郎"
              style={input}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label}>メールアドレス</label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={input}
            />
            <p style={{ fontSize: 12, color: T.faint, marginTop: 6, lineHeight: 1.6 }}>
              お返事の受け取りに使います。{proName}さんにお伝えします。
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label}>ご相談内容</label>
            <textarea
              value={body}
              maxLength={BODY_MAX}
              onChange={e => setBody(e.target.value)}
              rows={7}
              placeholder="例: 半年ほど前から肩の痛みが続いていて、デスクワーク中につらくなります。どのような施術になるか知りたいです。"
              style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7 }}
            />
            <div style={{ fontSize: 11, color: T.faint, textAlign: 'right', marginTop: 4 }}>
              {body.length} / {BODY_MAX}
            </div>
          </div>

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            fontSize: 13, color: T.dark, cursor: 'pointer', marginBottom: 20, lineHeight: 1.7,
          }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ width: 16, height: 16, marginTop: 3, flexShrink: 0 }}
            />
            <span>お名前・メールアドレス・ご相談内容が{proName}さんに共有されることに同意します。</span>
          </label>

          {error && (
            <p style={{ fontSize: 13, color: T.danger, marginBottom: 12, lineHeight: 1.7 }}>{error}</p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={{
              width: '100%', padding: 16, borderRadius: 12, border: 'none',
              background: canSubmit ? T.dark : T.border,
              color: canSubmit ? T.gold : T.faint,
              fontSize: 15, fontWeight: 700,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {sending ? '送信中…' : '相談を送る'}
          </button>

          <p style={{ fontSize: 11, color: T.faint, textAlign: 'center', marginTop: 12, lineHeight: 1.7 }}>
            送信すると、{proName}さんに通知が届きます。
          </p>
        </>
      )}
    </div>
  )
}
