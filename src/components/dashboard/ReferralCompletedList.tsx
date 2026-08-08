'use client'

import { useEffect, useState } from 'react'
import BookingThread from '@/components/dashboard/BookingThread'

/** タスク⑥改(CEO指摘): 完了した紹介(受け手側)。ダッシュボード最上部に常駐させると
 * 邪魔になるため、紹介タブ内に移設した独立コンポーネント。デフォルト閉の折りたたみ。 */
interface CompletedBookingItem {
  id: string
  list_id: string
  menu_id: string | null
  menu_name: string | null
  status: 'completed'
  price_jpy: number
  handover_note: { theme?: string; history?: string; tried?: string; notes?: string } | null
  confirmed_at: string | null
  completed_at: string | null
  created_at: string
  client_nickname: string
  sender_pro: { id: string; name: string } | null
  /** §2-4ステージ3(決済確認後の連絡先開示・CEO決定): 開示条件を満たす場合のみAPIから入る。 */
  client_contact: { name: string | null; phone: string | null; email: string | null } | null
}

interface Props {
  proId: string
  /** UI再構成(2026-08-04・CEO承認済み): 「紹介を受ける」サブタブの空状態判定用に、
   * 完了件数と読み込み完了フラグを親へ通知する(データ取得ロジックは変更しない・
   * 既存fetch結果の件数を渡すだけ)。レビュー指摘(軽微7): loadedを渡し、
   * received/completedの到着順による空状態フラッシュを防ぐ。 */
  onCountChange?: (count: number, loaded: boolean) => void
  /** CEO指示(2026-08-08): 予約タブの「完了済み」サブタブとして使う表示モード。
   * 'accordion'(既定・従来どおり折りたたみ箱・0件なら非表示) / 'list'(常時展開・0件でも空状態を表示)。 */
  variant?: 'accordion' | 'list'
}

export default function ReferralCompletedList({ proId, onCountChange, variant = 'accordion' }: Props) {
  const [completedItems, setCompletedItems] = useState<CompletedBookingItem[]>([])
  const [completedOpen, setCompletedOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/referral/bookings/received', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.completed) setCompletedItems(data.completed)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const completedCount = completedItems.length
  useEffect(() => {
    onCountChange?.(completedCount, !loading)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedCount, loading])

  // CEO指示(2026-08-08): 'list'は予約タブの「完了済み」サブタブ用（常時展開・0件でも空状態を出す）
  if (variant === 'list' && !loading && completedItems.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '30px 0', color: '#9CA3AF', fontSize: 13 }}>
        <div>完了した予約はまだありません</div>
        <div style={{ marginTop: 4 }}>セッションが完了した予約がここに表示されます</div>
      </div>
    )
  }
  if (variant === 'accordion' && completedItems.length === 0) return null

  return (
    <div
      style={
        variant === 'list'
          ? undefined
          : {
              background: '#FAFAFA',
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              padding: '10px 16px',
            }
      }
    >
      {variant === 'accordion' && (
        <button
          onClick={() => setCompletedOpen((prev) => !prev)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 700,
            color: '#1A1A2E',
          }}
        >
          <span>完了した紹介({completedItems.length}件)</span>
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>{completedOpen ? '▲' : '▼'}</span>
        </button>
      )}

      {(variant === 'list' || completedOpen) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {completedItems.map((item) => (
            <div
              key={item.id}
              style={{
                background: '#fff',
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              {/* CEO追加指示(2026-08-04): 「〜とのセッションは完了しています」は完了リスト自体が
                  完了済みを示すため冗長。名前大きく太く＋紹介元1行の統一パターンに合わせる。 */}
              <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1A2E', lineHeight: 1.4 }}>
                {item.client_nickname}さん
              </div>
              {/* CEO指示(2026-08-08): 予約カードと同じ「紹介元orRP直」の1行表記に統一 */}
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                {item.sender_pro?.name ? `紹介元: ${item.sender_pro.name}さん` : 'REALPROOFからのご予約'}
              </div>
              {item.completed_at && (
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                  完了日: {new Date(item.completed_at).toLocaleDateString('ja-JP')}
                </div>
              )}
              {item.menu_name && (
                <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>メニュー: {item.menu_name}</div>
              )}
              {/* §2-4ステージ3(決済確認後の連絡先開示・CEO決定): 履歴としても確認できるよう表示する。 */}
              {item.client_contact && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    background: '#FAFAFA',
                    border: '1px solid #E5E7EB',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>
                    クライアント連絡先
                  </div>
                  {item.client_contact.name && (
                    <div style={{ fontSize: 12, color: '#1A1A2E' }}>{item.client_contact.name}さん</div>
                  )}
                  {item.client_contact.phone && (
                    <div style={{ fontSize: 12, color: '#1A1A2E' }}>
                      電話:{' '}
                      <a href={`tel:${encodeURIComponent(item.client_contact.phone)}`} style={{ color: '#1A6B3C' }}>
                        {item.client_contact.phone}
                      </a>
                    </div>
                  )}
                  {item.client_contact.email && (
                    <div style={{ fontSize: 12, color: '#1A1A2E' }}>
                      メール:{' '}
                      <a href={`mailto:${encodeURIComponent(item.client_contact.email)}`} style={{ color: '#1A6B3C' }}>
                        {item.client_contact.email}
                      </a>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                    日程の調整・当日のご連絡はこちらへ直接どうぞ
                  </div>
                </div>
              )}
              <BookingThread
                bookingId={item.id}
                ownProId={proId}
                isSender={false}
                initialHandoverNote={item.handover_note}
                partnerRoleLabel={item.sender_pro ? '紹介元' : undefined}
                partnerName={item.sender_pro?.name}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
