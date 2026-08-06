'use client'

import { useEffect, useState } from 'react'

const BODY_MAX = 2000

interface Message {
  id: string
  sender: string
  body: string
  created_at: string
}

interface Consultation {
  id: string
  client_name: string
  /** PII。この画面（プロ本人のダッシュボード）でだけ表示する。 */
  client_email: string
  status: string
  created_at: string
  updated_at: string
  messages: Message[]
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * 相談タブ（§16-19・プロ側）
 *
 * 「プロはダッシュボードで返信を書き込むだけ。クライアントにはメールが届く」がこの機能の肝。
 * 未返信（status='new'）を上に出し、1件ずつ開いて返信する。
 */
export default function ConsultationsTab({ onUnreadChange }: { onUnreadChange?: (n: number) => void }) {
  const [list, setList] = useState<Consultation[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // CEO指示(2026-08-06): アーカイブしたスレッドは既定で出さない。切り替えて見返せる。
  const [showArchived, setShowArchived] = useState(false)
  // §16-25(CEO指示 2026-08-06): 相談を受け付けるかのスイッチ。既定は受け付ける。
  const [accepting, setAccepting] = useState(true)
  const [savingAccepting, setSavingAccepting] = useState(false)
  // CEO指摘(2026-08-06)「ここに連絡先だす必要ある？」→ 既定では隠す。
  // 返信はダッシュボードに書けばメールが飛ぶので、返信するだけならアドレスは要らない。
  // ただし消しはしない（クライアントが返信をやめた時の唯一の連絡手段であり、
  // §16-19の狙い②「クライアントリストが取れる」の実体でもあるため）。
  const [emailShownIds, setEmailShownIds] = useState<Record<string, boolean>>({})

  async function load(archived = showArchived) {
    try {
      const res = await fetch(`/api/pro/consultations${archived ? '?archived=1' : ''}`, { cache: 'no-store' })
      if (!res.ok) {
        setList([])
        return
      }
      const json = await res.json()
      const items: Consultation[] = Array.isArray(json.consultations) ? json.consultations : []
      setList(items)
      if (typeof json.accepting === 'boolean') setAccepting(json.accepting)
      // アーカイブ表示中の件数でバッジを上書きしない（通常一覧のときだけ報告する）
      if (!archived && onUnreadChange) onUnreadChange(items.filter(c => c.status === 'new').length)
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function sendReply(id: string) {
    const snapshot = draft.trim()
    if (!snapshot || sendingId) return
    setSendingId(id)
    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/pro/consultations/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ body: snapshot }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error === 'limit_reached' ? 'このやりとりは上限に達しました。' : '送信できませんでした。')
        return
      }
      setDraft('')
      // メールが飛ばなかった場合は黙って成功にしない（相手に届いていないため）
      setNotice(json.delivered
        ? 'お客さんにメールを送りました。'
        : '返信を保存しましたが、メールを送れませんでした。しばらくしてからもう一度お試しください。')
      await load()
    } catch {
      setError('送信できませんでした。')
    } finally {
      setSendingId(null)
    }
  }

  async function toggleAccepting(next: boolean) {
    if (savingAccepting) return
    setSavingAccepting(true)
    setError('')
    // 楽観更新はしない。保存できたことを確認してから反映する
    // （migration 051 未実行だと保存できず、スイッチだけ動いて見える事故を避ける）。
    try {
      const res = await fetch('/api/pro/consultations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ accepting: next }),
      })
      if (!res.ok) {
        setError('設定を保存できませんでした。時間をおいてお試しください。')
        return
      }
      setAccepting(next)
    } catch {
      setError('設定を保存できませんでした。')
    } finally {
      setSavingAccepting(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    setError('')
    try {
      const res = await fetch(`/api/pro/consultations/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        // 'archived' が DB の CHECK 制約で弾かれるケースがある（migration 050 の確認手順）。
        // 黙って失敗すると「押したのに消えない」になるので必ず出す。
        setError(status === 'archived'
          ? 'アーカイブできませんでした。時間をおいてお試しください。'
          : '変更できませんでした。')
        return
      }
      setOpenId(null)
      await load()
    } catch {
      setError('変更できませんでした。')
    }
  }

  if (loading) {
    return <p style={{ fontSize: 13, color: '#9CA3AF' }}>読み込み中…</p>
  }

  const acceptingSwitch = (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
      padding: '14px 16px', marginBottom: 16,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>
          {accepting ? 'ご相談を受け付けています' : 'ご相談を停止しています'}
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, lineHeight: 1.6 }}>
          {accepting
            ? 'カードに「相談する」が表示されます。'
            : 'カードから「相談する」が消えます。予約の受付はそのままです。'}
        </div>
      </div>
      <div
        role="switch"
        aria-checked={accepting}
        aria-label="相談の受付"
        onClick={() => toggleAccepting(!accepting)}
        style={{
          width: 48, height: 28, borderRadius: 14, flexShrink: 0,
          background: accepting ? '#C4A35A' : '#D1D5DB',
          position: 'relative', transition: 'background 0.2s',
          cursor: savingAccepting ? 'default' : 'pointer',
          opacity: savingAccepting ? 0.6 : 1,
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3, left: accepting ? 23 : 3,
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </div>
  )

  const archiveToggle = (
    <button
      type="button"
      onClick={() => { const next = !showArchived; setShowArchived(next); setOpenId(null); setLoading(true); load(next) }}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontSize: 12, color: '#C4A35A', fontWeight: 600,
      }}
    >
      {showArchived ? '← 受信箱に戻る' : 'アーカイブを見る'}
    </button>
  )

  if (list.length === 0) {
    return (
      <div>
      {acceptingSwitch}
      {error && <p style={{ fontSize: 12, color: '#E24B4A', marginBottom: 10 }}>{error}</p>}
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, textAlign: 'center', border: '1px solid #E5E7EB' }}>
        <div style={{ textAlign: 'right', marginBottom: 8 }}>{archiveToggle}</div>
        <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.9 }}>
          {showArchived ? 'アーカイブしたご相談はありません。' : 'まだご相談は届いていません。'}
        </p>
        <p style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.9, marginTop: 10 }}>
          あなたのカードの「相談する」から、お客さんが日時を決めずに問い合わせできます。
          届いたらここに表示され、メールかLINEでもお知らせします。
        </p>
      </div>
      </div>
    )
  }

  // 未返信を上に。同じ状態なら新しい順。
  const sorted = [...list].sort((a, b) => {
    const an = a.status === 'new' ? 0 : 1
    const bn = b.status === 'new' ? 0 : 1
    return an - bn || b.updated_at.localeCompare(a.updated_at)
  })

  return (
    <div style={{ paddingBottom: 40 }}>
      {acceptingSwitch}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.8, margin: 0 }}>
          {showArchived
            ? 'アーカイブしたご相談です。戻すと受信箱に再表示されます。'
            : 'カードの「相談する」から届いたご相談です。ここに返信を書くと、お客さんにメールで届きます。'}
        </p>
        <div style={{ flexShrink: 0, paddingTop: 2 }}>{archiveToggle}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(c => {
          const isOpen = openId === c.id
          const isNew = c.status === 'new'
          const last = c.messages[c.messages.length - 1]
          return (
            <div key={c.id} style={{
              background: '#fff', border: `1px solid ${isNew ? '#C4A35A' : '#E5E7EB'}`,
              borderRadius: 12, overflow: 'hidden',
            }}>
              <button
                type="button"
                onClick={() => { setOpenId(isOpen ? null : c.id); setDraft(''); setError(''); setNotice('') }}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 12, padding: '14px 16px', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>{c.client_name}</span>
                    {isNew && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: '#C4A35A', color: '#1A1A2E',
                      }}>未返信</span>
                    )}
                    {c.status === 'closed' && (
                      <span style={{ fontSize: 10, color: '#9CA3AF' }}>対応済み</span>
                    )}
                  </div>
                  {last && !isOpen && (
                    <div style={{
                      fontSize: 12, color: '#6B7280', marginTop: 4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {last.sender === 'pro' ? 'あなた: ' : ''}{last.body}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                    {formatDate(c.updated_at)}
                  </div>
                </div>
                <span style={{ color: '#C4A35A', fontSize: 16, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div style={{ background: '#F9FAFB', borderTop: '1px solid #E5E7EB', padding: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    {c.messages.map(m => {
                      const mine = m.sender === 'pro'
                      return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                          <div style={{ maxWidth: '85%' }}>
                            <div style={{
                              background: mine ? '#1A1A2E' : '#fff',
                              color: mine ? '#FAFAF7' : '#1A1A2E',
                              border: mine ? 'none' : '1px solid #E5E7EB',
                              borderRadius: 12, padding: '10px 12px',
                              fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                              {m.body}
                            </div>
                            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>
                              {mine ? 'あなた' : c.client_name}・{formatDate(m.created_at)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* 連絡先（PII）。既定は非表示。会話より上に常時出さない。 */}
                  <div style={{ marginBottom: 12 }}>
                    {emailShownIds[c.id] ? (
                      <div style={{ fontSize: 12, color: '#6B7280', wordBreak: 'break-all' }}>
                        連絡先: <span style={{ color: '#1A1A2E' }}>{c.client_email}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEmailShownIds(prev => ({ ...prev, [c.id]: true }))}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontSize: 12, color: '#9CA3AF', textDecoration: 'underline',
                        }}
                      >
                        連絡先を表示
                      </button>
                    )}
                  </div>

                  {c.status !== 'closed' && c.status !== 'archived' && (
                    <>
                      <textarea
                        value={draft}
                        maxLength={BODY_MAX}
                        onChange={e => setDraft(e.target.value)}
                        rows={4}
                        placeholder="返信を書くと、お客さんにメールで届きます"
                        style={{
                          width: '100%', padding: '10px 12px', fontSize: 14,
                          border: '1px solid #E5E7EB', borderRadius: 8, boxSizing: 'border-box',
                          resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7, background: '#fff',
                        }}
                      />
                      <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 4 }}>
                        {draft.length} / {BODY_MAX}
                      </div>
                      {error && <p style={{ fontSize: 12, color: '#E24B4A', marginTop: 4 }}>{error}</p>}
                      {notice && <p style={{ fontSize: 12, color: '#2E7D32', marginTop: 4, lineHeight: 1.7 }}>{notice}</p>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={() => sendReply(c.id)}
                          disabled={!draft.trim() || sendingId === c.id}
                          style={{
                            flex: 1, padding: '12px 16px', borderRadius: 8, border: 'none',
                            background: draft.trim() && sendingId !== c.id ? '#C4A35A' : '#E5E7EB',
                            color: draft.trim() && sendingId !== c.id ? '#1A1A2E' : '#9CA3AF',
                            fontSize: 14, fontWeight: 700,
                            cursor: draft.trim() && sendingId !== c.id ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {sendingId === c.id ? '送信中…' : '返信する'}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatus(c.id, 'closed')}
                          style={{
                            padding: '12px 16px', borderRadius: 8, border: '1px solid #E5E7EB',
                            background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          対応済みにする
                        </button>
                      </div>
                      {/* CEO指示(2026-08-06): 一覧から隠す。削除ではないので後から見返せる。 */}
                      <button
                        type="button"
                        onClick={() => updateStatus(c.id, 'archived')}
                        style={{
                          marginTop: 10, background: 'none', border: 'none', padding: 0,
                          fontSize: 12, color: '#9CA3AF', cursor: 'pointer', textDecoration: 'underline',
                        }}
                      >
                        アーカイブする（一覧から隠す）
                      </button>
                    </>
                  )}

                  {(c.status === 'closed' || c.status === 'archived') && (
                    <button
                      type="button"
                      onClick={() => updateStatus(c.id, 'open')}
                      style={{
                        padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB',
                        background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {c.status === 'archived' ? '受信箱に戻す' : 'やりとりを再開する'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
