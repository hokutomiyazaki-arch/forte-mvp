'use client'

import { useEffect, useState } from 'react'
import BookingThread from '@/components/dashboard/BookingThread'

/** タスク⑥改(CEO指摘): 完了した紹介(受け手側)。
 * CEO指示(2026-08-08): 予約タブ「完了済み」サブタブに常設するため、カードをコンパクトな
 * 折りたたみ行にし、名前検索とページ送り(20件ずつ)を付けた。連絡先・案件スレッドは展開後のみ。 */
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
  /** UI再構成(2026-08-04・CEO承認済み): 空状態判定用に完了件数と読み込み完了フラグを親へ通知。 */
  onCountChange?: (count: number, loaded: boolean) => void
  /** 'accordion'(旧・紹介タブ内の折りたたみ箱・0件なら非表示) / 'list'(予約タブの完了済みサブタブ・
   * 0件でも空状態表示・検索とページ送りつき)。 */
  variant?: 'accordion' | 'list'
}

const PAGE_SIZE = 20

export default function ReferralCompletedList({ proId, onCountChange, variant = 'accordion' }: Props) {
  const [completedItems, setCompletedItems] = useState<CompletedBookingItem[]>([])
  const [completedOpen, setCompletedOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  // CEO指示(2026-08-08): 行はコンパクトに畳み、開いた1件だけ連絡先・スレッドを見せる
  const [openId, setOpenId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)

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

  // 名前・メニュー・紹介元でのクライアントサイド絞り込み(APIは completed_at desc・limit 200)
  // CEO指示(2026-08-08): 名字と名前の間のスペース(半角・全角)を無視して一致させる
  const stripSpaces = (s: string) => s.replace(/[\s　]/g, '')
  const trimmedQuery = stripSpaces(searchQuery)
  const filteredItems = trimmedQuery
    ? completedItems.filter((item) => {
        const haystack = stripSpaces(
          `${item.client_nickname || ''}${item.client_contact?.name || ''}${item.menu_name || ''}${item.sender_pro?.name || ''}`
        )
        return haystack.includes(trimmedQuery)
      })
    : completedItems
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageItems = filteredItems.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('ja-JP') : null

  function renderCompactItem(item: CompletedBookingItem) {
    const isOpen = openId === item.id
    return (
      <div
        key={item.id}
        style={{
          background: '#fff',
          border: '1px solid #E5E7EB',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setOpenId(isOpen ? null : item.id)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, padding: '10px 14px', background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E', lineHeight: 1.4 }}>
              {item.client_nickname}さん
            </div>
            <div style={{
              fontSize: 12, color: '#9CA3AF', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {formatDate(item.completed_at) ? `完了: ${formatDate(item.completed_at)}` : '完了済み'}
              {' ・ '}
              {item.sender_pro?.name ? `紹介元: ${item.sender_pro.name}さん` : 'REALPROOF直'}
              {item.menu_name ? ` ・ ${item.menu_name}` : ''}
            </div>
          </div>
          <span style={{ fontSize: 12, color: '#9CA3AF', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
        </button>

        {isOpen && (
          <div style={{ padding: '0 14px 12px' }}>
            {item.menu_name && (
              <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>メニュー: {item.menu_name}</div>
            )}
            {/* §2-4ステージ3(決済確認後の連絡先開示・CEO決定): 履歴としても確認できるよう表示する。 */}
            {item.client_contact && (
              <div
                style={{
                  padding: '10px 12px',
                  background: '#FAFAFA',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  marginBottom: 8,
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
        )}
      </div>
    )
  }

  // 検索＋ページ送り＋一覧の共通ブロック(CEO指示 2026-08-08: list/accordion両方に同じ操作を付ける)
  const searchAndPagedBody = (
    <>
      {completedItems.length > 0 && (
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(0); setOpenId(null) }}
          placeholder="お名前・メニュー・紹介元で検索"
          style={{
            width: '100%', padding: '9px 12px', fontSize: 14, boxSizing: 'border-box',
            border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 10, background: '#fff',
          }}
        />
      )}
      {trimmedQuery && filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#9CA3AF', fontSize: 13 }}>
          「{trimmedQuery}」に一致する完了済みの予約はありません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pageItems.map(renderCompactItem)}
        </div>
      )}
      {pageCount > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 14 }}>
          <button
            type="button"
            onClick={() => { setPage(Math.max(0, safePage - 1)); setOpenId(null) }}
            disabled={safePage === 0}
            style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid #D1D5DB',
              background: '#fff', fontSize: 13, fontWeight: 600,
              color: safePage === 0 ? '#D1D5DB' : '#1A1A2E',
              cursor: safePage === 0 ? 'default' : 'pointer',
            }}
          >
            ← 前へ
          </button>
          <span style={{ fontSize: 13, color: '#6B7280' }}>{safePage + 1} / {pageCount}</span>
          <button
            type="button"
            onClick={() => { setPage(Math.min(pageCount - 1, safePage + 1)); setOpenId(null) }}
            disabled={safePage >= pageCount - 1}
            style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid #D1D5DB',
              background: '#fff', fontSize: 13, fontWeight: 600,
              color: safePage >= pageCount - 1 ? '#D1D5DB' : '#1A1A2E',
              cursor: safePage >= pageCount - 1 ? 'default' : 'pointer',
            }}
          >
            次へ →
          </button>
        </div>
      )}
    </>
  )

  // ---- 'list'(予約タブの完了済みサブタブ) ----
  if (variant === 'list') {
    if (!loading && completedItems.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#9CA3AF', fontSize: 13 }}>
          <div>完了した予約はまだありません</div>
          <div style={{ marginTop: 4 }}>セッションが完了した予約がここに表示されます</div>
        </div>
      )
    }
    return <div>{searchAndPagedBody}</div>
  }

  // ---- 'accordion'(旧・紹介タブ内。到達不能UIだが受け皿として既存挙動を維持) ----
  if (completedItems.length === 0) return null

  return (
    <div
      style={{
        background: '#FAFAFA',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: '10px 16px',
      }}
    >
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

      {completedOpen && (
        <div style={{ marginTop: 10 }}>
          {searchAndPagedBody}
        </div>
      )}
    </div>
  )
}
