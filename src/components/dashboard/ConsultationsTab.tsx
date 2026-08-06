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
  // §16-27-3: 提案できるメニュー（予約可能なメニューのみ）と、開いているピッカー
  const [menus, setMenus] = useState<{ id: string; name: string; price_text: string }[]>([])
  const [menuPickerId, setMenuPickerId] = useState<string | null>(null)
  // §16-35: 相談チャットから送れる紹介リスト。公開カードに一覧を出すのをやめた代わりの導線。
  const [lists, setLists] = useState<{ id: string; title: string }[]>([])
  const [listPickerId, setListPickerId] = useState<string | null>(null)
  // §16-27-4: 通報はプロ側からも（CEO指摘「お互いに必要」）。理由は必須にしてハードルを上げる。
  const [reportId, setReportId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportedIds, setReportedIds] = useState<Record<string, boolean>>({})

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
      if (Array.isArray(json.menus)) setMenus(json.menus)
      if (Array.isArray(json.lists)) setLists(json.lists)
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

  /** §16-27-3 相談→予約の接続。選んだメニューがカードとしてスレッドに入る。 */
  async function proposeMenu(consultationId: string, menuId: string) {
    if (sendingId) return
    setSendingId(consultationId)
    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/pro/consultations/${consultationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ menu_id: menuId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error === 'menu_not_found' ? 'このメニューは提案できません。' : '提案を送れませんでした。')
        return
      }
      setMenuPickerId(null)
      setNotice(json.delivered ? 'メニューを提案しました。' : 'メニューを提案しましたが、メールを送れませんでした。')
      await load()
    } catch {
      setError('提案を送れませんでした。')
    } finally {
      setSendingId(null)
    }
  }

  /** §16-35 紹介リストを送る。ワンクリックで「◯◯さんが紹介した」実体を残す。 */
  async function sendList(consultationId: string, listId: string) {
    if (sendingId) return
    setSendingId(consultationId)
    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/pro/consultations/${consultationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ list_id: listId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error === 'list_not_found' ? 'このリストは送れません。' : 'リストを送れませんでした。')
        return
      }
      setListPickerId(null)
      setNotice(json.delivered ? '紹介リストを送りました。' : '紹介リストを送りましたが、メールを送れませんでした。')
      await load()
    } catch {
      setError('リストを送れませんでした。')
    } finally {
      setSendingId(null)
    }
  }

  async function sendReport(consultationId: string) {
    if (reportReason.trim().length < 10 || sendingId) return
    setSendingId(consultationId)
    setError('')
    try {
      const res = await fetch(`/api/pro/consultations/${consultationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ report_reason: reportReason.trim() }),
      })
      if (!res.ok) {
        // 届いていないのに「受け付けました」と出さない
        setError('通報を送信できませんでした。時間をおいてお試しください。')
        return
      }
      setReportedIds(prev => ({ ...prev, [consultationId]: true }))
      setReportId(null)
      setReportReason('')
    } catch {
      setError('通報を送信できませんでした。')
    } finally {
      setSendingId(null)
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

                  {/* 連絡先は出さない（CEO決定 2026-08-06「完全に消して。リードはこっちで握る」）。
                      返信はここに書けばメールが飛ぶので、プロ側がアドレスを持つ必要がない。
                      APIレスポンスからも外してある。 */}

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

                      {/* §16-27-3 相談→予約の接続。相談で温まった人を、その場で予約に接続する。
                          出せるのは「予約可能なメニュー」だけ（料金あり × 紹介予約を受け付ける）。
                          0件のときはボタン自体を出さない（押しても選べないため）。 */}
                      {menus.length > 0 && (
                        menuPickerId === c.id ? (
                          <div style={{
                            marginTop: 12, background: '#fff', border: '1px solid #E5E7EB',
                            borderRadius: 10, padding: 12,
                          }}>
                            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
                              提案するメニューを選んでください
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {menus.map(menu => (
                                <button
                                  key={menu.id}
                                  type="button"
                                  onClick={() => proposeMenu(c.id, menu.id)}
                                  disabled={sendingId === c.id}
                                  style={{
                                    textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                                    border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer',
                                  }}
                                >
                                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E' }}>{menu.name}</div>
                                  <div style={{ fontSize: 12, color: '#C4A35A', marginTop: 2 }}>{menu.price_text}</div>
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => setMenuPickerId(null)}
                              style={{
                                marginTop: 10, background: 'none', border: 'none', padding: 0,
                                fontSize: 12, color: '#9CA3AF', cursor: 'pointer',
                              }}
                            >
                              やめる
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setMenuPickerId(c.id)}
                            style={{
                              width: '100%', marginTop: 8, padding: '12px 16px', borderRadius: 8,
                              border: '1.5px solid #C4A35A', background: '#fff', color: '#C4A35A',
                              fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            このメニューを提案する
                          </button>
                        )
                      )}

                      {/* §16-35 紹介リストを送る（CEO決定 2026-08-06）。
                          公開カードに一覧を出すのをやめた代わりの導線。
                          こちらは「◯◯さんが紹介した」という実体が残るので、ちゃんと紹介になる。
                          共有可能なリストが無い人にはボタンを出さない（押しても選べないため）。 */}
                      {lists.length > 0 && (
                        listPickerId === c.id ? (
                          <div style={{
                            marginTop: 8, background: '#fff', border: '1px solid #E5E7EB',
                            borderRadius: 10, padding: 12,
                          }}>
                            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
                              送る紹介リストを選んでください
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {lists.map(l => (
                                <button
                                  key={l.id}
                                  type="button"
                                  onClick={() => sendList(c.id, l.id)}
                                  disabled={sendingId === c.id}
                                  style={{
                                    textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                                    border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer',
                                    fontSize: 13, fontWeight: 700, color: '#1A1A2E',
                                  }}
                                >
                                  {l.title}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => setListPickerId(null)}
                              style={{
                                marginTop: 10, background: 'none', border: 'none', padding: 0,
                                fontSize: 12, color: '#9CA3AF', cursor: 'pointer',
                              }}
                            >
                              やめる
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setListPickerId(c.id)}
                            style={{
                              width: '100%', marginTop: 8, padding: '12px 16px', borderRadius: 8,
                              border: '1.5px solid #1A1A2E', background: '#fff', color: '#1A1A2E',
                              fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            紹介リストを送る
                          </button>
                        )
                      )}
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

                  {/* CEO報告(2026-08-06)「対応済みカードがアーカイブできない」の修正。
                      返信ブロックの中に置いていたため、status='closed' で返信欄ごと
                      隠れてボタンも消えていた。返信の可否と関係なく押せる位置へ出す。 */}
                  {c.status !== 'archived' && (
                    <button
                      type="button"
                      onClick={() => updateStatus(c.id, 'archived')}
                      style={{
                        display: 'block', marginTop: 12, background: 'none', border: 'none', padding: 0,
                        fontSize: 12, color: '#9CA3AF', cursor: 'pointer', textDecoration: 'underline',
                      }}
                    >
                      アーカイブする（一覧から隠す）
                    </button>
                  )}

                  {/* §16-27-4 通報（プロ側）。小さく置く。理由は必須。
                      「通常、運営はチャットを閲覧しません。通報があった場合のみ確認します」を
                      ここにも書く（UIと規約の両方に出す方針）。 */}
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #E5E7EB' }}>
                    <p style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.8, marginBottom: 6 }}>
                      通常、運営はチャットを閲覧しません。通報があった場合のみ確認します。
                    </p>
                    {reportedIds[c.id] ? (
                      <p style={{ fontSize: 11, color: '#2E7D32' }}>通報を受け付けました。</p>
                    ) : reportId === c.id ? (
                      <div>
                        <textarea
                          value={reportReason}
                          maxLength={500}
                          onChange={e => setReportReason(e.target.value)}
                          rows={3}
                          placeholder="どのような点が問題でしたか（10文字以上）"
                          style={{
                            width: '100%', padding: '8px 10px', fontSize: 13,
                            border: '1px solid #E5E7EB', borderRadius: 8, boxSizing: 'border-box',
                            resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7, background: '#fff',
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          <button
                            type="button"
                            onClick={() => sendReport(c.id)}
                            disabled={reportReason.trim().length < 10 || sendingId === c.id}
                            style={{
                              padding: '8px 14px', borderRadius: 8, border: 'none',
                              background: reportReason.trim().length >= 10 ? '#E24B4A' : '#E5E7EB',
                              color: reportReason.trim().length >= 10 ? '#fff' : '#9CA3AF',
                              fontSize: 12, fontWeight: 700,
                              cursor: reportReason.trim().length >= 10 ? 'pointer' : 'default',
                            }}
                          >
                            通報する
                          </button>
                          <button
                            type="button"
                            onClick={() => { setReportId(null); setReportReason('') }}
                            style={{
                              padding: '8px 14px', borderRadius: 8, border: '1px solid #E5E7EB',
                              background: '#fff', color: '#6B7280', fontSize: 12, cursor: 'pointer',
                            }}
                          >
                            やめる
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setReportId(c.id); setReportReason('') }}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontSize: 11, color: '#9CA3AF', textDecoration: 'underline',
                        }}
                      >
                        通報する
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
