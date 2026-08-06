'use client'

import { useEffect, useState } from 'react'

const T = {
  dark: '#1A1A2E',
  gold: '#C4A35A',
  bg: '#FAFAF7',
  border: '#E5E7EB',
  muted: '#6B7280',
  faint: '#9CA3AF',
  danger: '#E24B4A',
}

const BODY_MAX = 2000

interface Message {
  id: string
  sender: string
  body: string
  created_at: string
}

interface ThreadData {
  consultation: { client_name: string; status: string; created_at: string }
  pro: { id: string; name: string; photo_url: string | null } | null
  messages: Message[]
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export default function ConsultThread({ token }: { token: string }) {
  const [data, setData] = useState<ThreadData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    try {
      const res = await fetch(`/api/consultations/${token}`, { cache: 'no-store' })
      if (!res.ok) {
        setNotFound(true)
        return
      }
      setData(await res.json())
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  // 依存配列はプリミティブのみ（token は string）
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function send() {
    const snapshot = reply.trim()
    if (!snapshot || sending) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/consultations/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ body: snapshot }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          json.error === 'closed'
            ? 'このご相談は終了しています。'
            : json.error === 'limit_reached'
              ? 'このやりとりは上限に達しました。'
              : '送信できませんでした。時間をおいてお試しください。',
        )
        return
      }
      setReply('')
      await load()
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

  if (loading) {
    return <div style={wrap}><p style={{ color: T.faint, fontSize: 14 }}>読み込み中…</p></div>
  }

  if (notFound || !data) {
    return (
      <div style={wrap}>
        <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.8 }}>
            このやりとりは見つかりませんでした。<br />
            リンクが古い可能性があります。
          </p>
        </div>
      </div>
    )
  }

  const proName = data.pro?.name || 'プロフェッショナル'
  const closed = data.consultation.status === 'closed'

  return (
    <div style={wrap}>
      {/* 相手 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
        background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 16,
      }}>
        {data.pro?.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.pro.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: T.dark, color: T.gold,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
          }}>{proName.charAt(0)}</div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{proName} さん</div>
          <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>ご相談のやりとり</div>
        </div>
        {data.pro && (
          <a href={`/card/${data.pro.id}`} style={{ fontSize: 12, color: T.gold, textDecoration: 'none', flexShrink: 0 }}>
            プロフィール →
          </a>
        )}
      </div>

      {/* やりとり */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {data.messages.map(m => {
          const isPro = m.sender === 'pro'
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: isPro ? 'flex-start' : 'flex-end' }}>
              <div style={{ maxWidth: '85%' }}>
                <div style={{
                  background: isPro ? '#fff' : T.dark,
                  color: isPro ? T.dark : '#FAFAF7',
                  border: isPro ? `1px solid ${T.border}` : 'none',
                  borderRadius: 14, padding: '12px 14px',
                  fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {m.body}
                </div>
                <div style={{
                  fontSize: 11, color: T.faint, marginTop: 4,
                  textAlign: isPro ? 'left' : 'right',
                }}>
                  {isPro ? proName : 'あなた'}・{formatDate(m.created_at)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 追記 */}
      {closed ? (
        <p style={{ fontSize: 13, color: T.faint, textAlign: 'center', lineHeight: 1.8 }}>
          このご相談は終了しています。
        </p>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            続けて伝える
          </label>
          <textarea
            value={reply}
            maxLength={BODY_MAX}
            onChange={e => setReply(e.target.value)}
            rows={4}
            placeholder="追加でお伝えしたいことがあればどうぞ"
            style={{
              width: '100%', padding: '12px 14px', fontSize: 16,
              border: `1px solid ${T.border}`, borderRadius: 10,
              boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7,
            }}
          />
          <div style={{ fontSize: 11, color: T.faint, textAlign: 'right', marginTop: 4 }}>
            {reply.length} / {BODY_MAX}
          </div>
          {error && <p style={{ fontSize: 13, color: T.danger, marginTop: 8, lineHeight: 1.7 }}>{error}</p>}
          <button
            type="button"
            onClick={send}
            disabled={!reply.trim() || sending}
            style={{
              width: '100%', marginTop: 10, padding: 14, borderRadius: 10, border: 'none',
              background: reply.trim() && !sending ? T.dark : T.border,
              color: reply.trim() && !sending ? T.gold : T.faint,
              fontSize: 15, fontWeight: 700,
              cursor: reply.trim() && !sending ? 'pointer' : 'not-allowed',
            }}
          >
            {sending ? '送信中…' : '送る'}
          </button>
        </div>
      )}
    </div>
  )
}
