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
  /** §16-27-3: プロが提案したメニュー。null なら通常のメッセージ。 */
  menu: { id: string; name: string; price_text: string; description: string | null } | null
  /** §16-35: プロが送った紹介リスト。null なら通常のメッセージ。 */
  list: { id: string; title: string; comment: string | null; slug: string } | null
}

interface ThreadData {
  consultation: { client_name: string; status: string; created_at: string }
  pro: { id: string; name: string; photo_url: string | null; booking_url: string | null } | null
  messages: Message[]
  /** §16-27-2: 最後のプロの返信より後に、クライアントが送った通数 */
  client_streak: number
  streak_limit: number
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
  // §16-27-4 通報
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportSending, setReportSending] = useState(false)
  const [reportDone, setReportDone] = useState(false)

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
            : json.error === 'awaiting_reply'
              ? '返信をお待ちください。'
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

  async function sendReport() {
    // CEO指示(2026-08-06): 理由を必須にしてハードルを上げる。
    // ワンタップで送れると軽い気持ちの通報が増え、運営が読む価値のない通報で埋まる。
    if (reportSending || reportReason.trim().length < 10) return
    setReportSending(true)
    try {
      const res = await fetch(`/api/consultations/${token}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ reason: reportReason.trim() }),
      })
      if (!res.ok) {
        // 届いていないのに「受け付けました」と出さない
        setError('通報を送信できませんでした。時間をおいてお試しください。')
        return
      }
      setReportDone(true)
      setReportOpen(false)
    } catch {
      setError('通報を送信できませんでした。')
    } finally {
      setReportSending(false)
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

      {/* §16-27-1 返信期待値の設定。
          「返信が来ない → 不満」の連鎖を最初から断つ。スレッドの一番上に固定で置く。 */}
      <div style={{
        background: '#FFF8E7', border: `1px solid ${T.gold}40`, borderRadius: 12,
        padding: '12px 14px', marginBottom: 20,
        fontSize: 13, color: T.muted, lineHeight: 1.8,
      }}>
        返信は施術の合間になるため、お時間をいただくことがあります。
      </div>

      {/* やりとり */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {data.messages.map(m => {
          const isPro = m.sender === 'pro'
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: isPro ? 'flex-start' : 'flex-end' }}>
              <div style={{ maxWidth: '85%' }}>
                {m.list ? (
                  /* §16-35 紹介リスト。公開カードに一覧を出すのをやめた代わりの導線。
                     プロが「この人たちをどうぞ」と手渡す形なので、紹介の実体が残る。 */
                  <div style={{
                    background: '#fff', border: `1.5px solid ${T.dark}`,
                    borderRadius: 14, padding: 14,
                  }}>
                    <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginBottom: 6 }}>
                      {proName}さんからのご紹介
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{m.list.title}</div>
                    {m.list.comment && (
                      <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, marginTop: 6 }}>
                        {m.list.comment}
                      </p>
                    )}
                    <a
                      href={`/r/${m.list.slug}`}
                      style={{
                        display: 'block', textAlign: 'center', marginTop: 12,
                        padding: '10px 16px', borderRadius: 10,
                        background: T.dark, color: T.gold,
                        fontSize: 14, fontWeight: 700, textDecoration: 'none',
                      }}
                    >
                      紹介された先生を見る
                    </a>
                  </div>
                ) : m.menu ? (
                  /* §16-27-3 相談→予約の接続。提案されたメニューをカードで出し、
                     その場で予約に進めるようにする。遷移先は §16-26 の予約ボタンと揃える
                     （将来どちらも内部予約システムに差し替える）。 */
                  <div style={{
                    background: '#fff', border: `1.5px solid ${T.gold}`,
                    borderRadius: 14, padding: 14,
                  }}>
                    <div style={{ fontSize: 11, color: T.gold, fontWeight: 700, marginBottom: 6 }}>
                      おすすめのメニュー
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{m.menu.name}</div>
                    <div style={{ fontSize: 13, color: T.gold, fontWeight: 600 }}>{m.menu.price_text}</div>
                    {m.menu.description && (
                      <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, marginTop: 8 }}>
                        {m.menu.description}
                      </p>
                    )}
                    {data.pro && (
                      <a
                        href={data.pro.booking_url || `/card/${data.pro.id}`}
                        {...(data.pro.booking_url ? { target: '_blank', rel: 'noopener' } : {})}
                        style={{
                          display: 'block', textAlign: 'center', marginTop: 12,
                          padding: '10px 16px', borderRadius: 10,
                          background: T.dark, color: T.gold,
                          fontSize: 14, fontWeight: 700, textDecoration: 'none',
                        }}
                      >
                        このメニューで予約に進む
                      </a>
                    )}
                  </div>
                ) : (
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
                )}
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
      ) : data.client_streak >= data.streak_limit ? (
        /* §16-27-2 連投制限。催促を重ねるほど返しづらくなるので、ここで一度止める。 */
        <div style={{
          background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14,
          padding: 20, textAlign: 'center',
        }}>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>返信をお待ちください</p>
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.8 }}>
            {proName}さんからのお返事が届くと、また送れるようになります。
          </p>
        </div>
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

      {/* 予約導線（§16-26・CEO指示 2026-08-06）
          相談の途中で「じゃあ予約しよう」となった人を行き止まりにしないため、
          やりとりが終了していても**常に**出す。
          ⚠️ 遷移先は暫定。将来この予約リンクは**内部の予約システム**に差し替える（CEOメモ）。
          いまは プロの booking_url（外部）、未設定ならカードページ（予約・連絡先が載っている）。 */}
      {data.pro && (
        <a
          href={data.pro.booking_url || `/card/${data.pro.id}`}
          {...(data.pro.booking_url ? { target: '_blank', rel: 'noopener' } : {})}
          style={{
            display: 'block', textAlign: 'center', marginTop: 16,
            padding: 14, borderRadius: 10,
            background: 'transparent', border: `1.5px solid ${T.dark}`, color: T.dark,
            fontSize: 15, fontWeight: 700, textDecoration: 'none',
          }}
        >
          予約する
        </a>
      )}

      {/* §16-27-4 通報とプライバシー。
          「常時見られている」息苦しさを避けつつ、記録が残る安心は担保する。
          この文言はUIと規約の両方に出す（片方だけだと意味がない）。 */}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${T.border}` }}>
        <p style={{ fontSize: 12, color: T.faint, lineHeight: 1.9, marginBottom: 10 }}>
          通常、運営はチャットを閲覧しません。通報があった場合のみ確認します。
        </p>

        {reportDone ? (
          <p style={{ fontSize: 12, color: '#2E7D32', lineHeight: 1.8 }}>
            通報を受け付けました。運営が内容を確認します。
          </p>
        ) : reportOpen ? (
          <div>
            <textarea
              value={reportReason}
              maxLength={500}
              onChange={e => setReportReason(e.target.value)}
              rows={3}
              placeholder="どのような点が問題でしたか（10文字以上）"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14,
                border: `1px solid ${T.border}`, borderRadius: 10,
                boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7,
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={sendReport}
                disabled={reportSending || reportReason.trim().length < 10}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
                  background: reportReason.trim().length >= 10 ? T.danger : T.border,
                  color: reportReason.trim().length >= 10 ? '#fff' : T.faint,
                  fontSize: 13, fontWeight: 700,
                  cursor: reportSending || reportReason.trim().length < 10 ? 'default' : 'pointer',
                  opacity: reportSending ? 0.6 : 1,
                }}
              >
                {reportSending ? '送信中…' : '通報する'}
              </button>
              <button
                type="button"
                onClick={() => { setReportOpen(false); setReportReason('') }}
                style={{
                  padding: '10px 14px', borderRadius: 8, border: `1px solid ${T.border}`,
                  background: '#fff', color: T.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                やめる
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: 11, color: T.faint, textDecoration: 'underline',
            }}
          >
            通報する
          </button>
        )}
      </div>
    </div>
  )
}
