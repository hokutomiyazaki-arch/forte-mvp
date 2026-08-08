'use client'

import { useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { PROOF_REQUEST_DEFAULT_MESSAGE } from '@/lib/referral-format'

/**
 * §16-41(CEO決定 2026-08-08)修正6(レビュー指摘・中8): クライアントへの記録依頼パネル。
 *
 * ReferralBookingReceivedCard(受付中・確定済み+日時過去のカード)とReferralCompletedList
 * (完了済みカード)にほぼ同一の依頼パネル+requestProofハンドラが丸コピーされていたのを
 * この1箇所に集約する。見た目・文言は元のまま(背景色の差だけ background prop で吸収)。
 * 呼び出し側は表示条件(confirmedSlotIsoが過去かどうか等)と、このパネルを囲む
 * ボーダー付きラッパーdiv(枠線の向き・margin/paddingが2箇所で異なる)を持ち続ける。
 *
 * CEOフィードバック修正B(2026-08-08): その場にいるクライアント向けに「QRを見せる」を
 * メール送信と併設した(qrcode.reactは既存依存・ProInviteQrCard.tsxと同じ流儀で利用)。
 */

interface Props {
  bookingId: string
  /** null/未送信ならまだ一度も送っていない。 */
  sentAt: string | null
  /** 送信済み回数(最大2)。 */
  count: number
  /** 依頼したトークンで記録(投票)が完了しているか。 */
  recorded: boolean
  /** 送信成功後に親へ通知する(一覧の該当行を更新 or 再取得する)。 */
  onSent: () => void
  /** 展開時の入力欄コンテナ背景色。ReferralBookingReceivedCardは'#fff'、ReferralCompletedListは'#FAFAFA'。 */
  background?: string
}

/**
 * §16-41修正4(中7): エラーコード3点セット(API→mapping→表示文言)のうちmapping+表示文言部分。
 * too_soon/limit_reached/message_too_long は既存3種。not_completable/sms_unavailableを追加。
 * 修正F(2026-08-08): self_request(自分のメールアドレス宛)を追加。
 */
function mapProofRequestError(code: string | undefined): string {
  switch (code) {
    case 'too_soon':
      return '送信から24時間はあけてください'
    case 'limit_reached':
      return 'お願いできるのは2回までです'
    case 'message_too_long':
      return 'メッセージは300文字以内で入力してください'
    case 'not_completable':
      return 'セッションの日時を過ぎてからお願いできます'
    case 'sms_unavailable':
      return 'この予約はメールが届かないため、いまは送れません'
    case 'self_request':
      return 'ご自身のメールアドレス宛には送れません（ご自身の記録はお願いできません）'
    default:
      return '送信に失敗しました'
  }
}

export default function ProofRequestPanel({ bookingId, sentAt, count, recorded, onSent, background = '#fff' }: Props) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState(PROOF_REQUEST_DEFAULT_MESSAGE)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  // レビュー指摘: 連打の二重発火は state(sending) のクロージャ読みでは止められない
  // (setSendingの反映前に次のクリックが素通りする)。refで即時にガードする。
  const sendingRef = useRef(false)

  // 修正B: 「QRを見せる」(その場のクライアント向け)。回数制限なし=ダッシュボードQRと同格。
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState('')
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const qrSendingRef = useRef(false)

  function openPanel() {
    setMessage((prev) => prev || PROOF_REQUEST_DEFAULT_MESSAGE)
    setError('')
    setOpen(true)
  }

  async function requestProof() {
    if (sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/referral/bookings/received', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          booking_id: bookingId,
          action: 'request_proof',
          message: message.trim().slice(0, 300),
        }),
      })
      if (res.ok) {
        setOpen(false)
        onSent()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(mapProofRequestError(data.error))
      }
    } catch {
      setError('送信に失敗しました')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  /** 修正B: QRトークンを発行してその場で見せる(メール送信・preferred_slots更新は一切なし)。 */
  async function requestProofQr() {
    if (qrSendingRef.current) return
    qrSendingRef.current = true
    setQrLoading(true)
    setQrError('')
    try {
      const res = await fetch('/api/referral/bookings/received', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ booking_id: bookingId, action: 'request_proof_qr' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && typeof data.voteUrl === 'string') {
        setQrUrl(data.voteUrl)
      } else {
        setQrError(mapProofRequestError(data.error))
      }
    } catch {
      setQrError('発行に失敗しました')
    } finally {
      qrSendingRef.current = false
      setQrLoading(false)
    }
  }

  const qrButton = (
    <div>
      <button
        type="button"
        onClick={requestProofQr}
        disabled={qrLoading}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #1A1A2E',
          background: '#fff', color: '#1A1A2E', fontSize: 13, fontWeight: 700,
          cursor: qrLoading ? 'default' : 'pointer', opacity: qrLoading ? 0.6 : 1,
        }}
      >
        {qrLoading ? '発行中...' : 'QRを見せる'}
      </button>
      {qrError && <div style={{ fontSize: 13, color: '#B00020', marginTop: 4 }}>{qrError}</div>}
    </div>
  )

  // 修正B(CEOフィードバック 2026-08-08): 「モーダル表示」の指示どおり全画面オーバーレイにする
  // (BadgeQRModal.tsxと同じ構成・このファイルのみinline styleで踏襲)。
  const qrModal = qrUrl && (
    <div
      onClick={() => setQrUrl(null)}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, padding: '28px 24px',
          maxWidth: 320, width: '100%', textAlign: 'center' as const,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <QRCodeSVG value={qrUrl} size={200} />
        </div>
        {/* CEO追加指示(2026-08-08): ホーム画面の通常QRとの取り違え防止・入力不要である旨の注記(1行のみ)。 */}
        <div style={{ fontSize: 13, color: '#B45309', marginBottom: 10, lineHeight: 1.6 }}>
          ※ホーム画面のQRではなく、こちらを見せてください（入力なしで記録できます）
        </div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20, lineHeight: 1.6 }}>
          お客さまのスマホで読み取ってもらってください
        </div>
        <button
          type="button"
          onClick={() => setQrUrl(null)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none',
            background: '#1A1A2E', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  )

  const form = open && (
    <div style={{ marginTop: 8, padding: '10px 12px', background, borderRadius: 8, border: '1px solid #D1D5DB' }}>
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 6 }}>
        クライアントへ一言メッセージを添えて送ります
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, 300))}
        rows={4}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #D1D5DB',
          fontSize: 13, boxSizing: 'border-box', resize: 'vertical' as const,
        }}
      />
      <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'right' as const, marginTop: 2 }}>
        {message.length}/300
      </div>
      {error && <div style={{ fontSize: 13, color: '#B00020', marginTop: 4 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={requestProof}
          disabled={sending}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
            background: '#1A1A2E', color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: sending ? 'default' : 'pointer',
            opacity: sending ? 0.6 : 1,
          }}
        >
          送信する
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB',
            background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ← 一覧に戻る
        </button>
      </div>
    </div>
  )

  // 修正B: 既に記録済みなら、これ以上お願いする導線は不要(QRもメールも出さない)。
  if (recorded) {
    return (
      <div>
        {sentAt && (
          <div style={{ fontSize: 13, color: '#6B7280' }}>
            記録のお願いを送信済み（
            {new Date(sentAt).toLocaleString('ja-JP', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
            ）
          </div>
        )}
        <div style={{ fontSize: 13, color: '#C4A35A', fontWeight: 700, marginTop: sentAt ? 4 : 0 }}>
          記録していただきました
        </div>
      </div>
    )
  }

  if (sentAt) {
    return (
      <div>
        {/* 修正B: メールは送信済みだが、その場にいればQRでも重ねてお願いできる(回数制限なし)。 */}
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 6 }}>
          その場にいれば、QRでもお願いできます
        </div>
        {qrButton}
        {qrModal}
        {/* CEO追加指示(2026-08-08): §16-44の認証スキップをプロに簡潔に伝える(1行のみ・sentAt分岐にも適用)。 */}
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 6 }}>
          この予約のお客さま専用です。どちらも面倒な入力なしでそのまま記録できます。
        </div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 10 }}>
          記録のお願いを送信済み（
          {new Date(sentAt).toLocaleString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
          ）
        </div>
        {count < 2 && Date.now() - new Date(sentAt).getTime() >= 24 * 60 * 60 * 1000 && !open && (
          <button
            type="button"
            onClick={openPanel}
            style={{
              marginTop: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid #C4A35A',
              background: '#fff', color: '#C4A35A', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            もう一度メールでお願いする（あと1回）
          </button>
        )}
        {form}
      </div>
    )
  }

  return (
    <div>
      {/* 修正B(CEOフィードバック 2026-08-08): その場/離れているかで2択にする。 */}
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 6 }}>
        その場にいますか？離れていますか？（どちらかでお願いできます）
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>{qrButton}</div>
        {!open && (
          <button
            type="button"
            onClick={openPanel}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #C4A35A',
              background: '#fff', color: '#C4A35A', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            メールでお願いする
          </button>
        )}
      </div>
      {/* CEO追加指示(2026-08-08): §16-44の認証スキップをプロに簡潔に伝える(1行のみ)。 */}
      <div style={{ fontSize: 13, color: '#6B7280', marginTop: 6 }}>
        この予約のお客さま専用です。どちらも面倒な入力なしでそのまま記録できます。
      </div>
      {qrModal}
      {form}
    </div>
  )
}
