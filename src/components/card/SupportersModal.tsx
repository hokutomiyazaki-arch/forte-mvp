'use client'
import { useEffect } from 'react'
import { COLORS, FONTS } from '@/lib/design-tokens'
import { getSurname } from '@/lib/display-name-utils'

const T = { ...COLORS, font: FONTS.main }

export interface Supporter {
  vote_id: string
  photo_url: string
  display_name: string
  is_pro: boolean
  created_at: string
}

interface Props {
  supporters: Supporter[]
  onClose: () => void
  onSupporterClick: (voteId: string) => void
}

/**
 * Supporters の全件表示モーダル（17件以上で "+N" タップ時に開く）
 *
 * - ボトムシート風（モバイル基準）
 * - 5列グリッド、32x32px のアイコン
 * - 21件以上は苗字を非表示にして詰める
 * - 閉じるトリガー: ✕ / 背景タップ / ESC
 */
export function SupportersModal({ supporters, onClose, onSupporterClick }: Props) {
  // ESC キーで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // 21件以上は苗字非表示（密集表示）
  const showNames = supporters.length < 21

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        fontFamily: T.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: '80vh',
          background: T.cardBg,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ヘッダー */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: `1px solid ${T.divider}`,
            background: T.cardBg,
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: T.dark }}>
            支持しているクライアント（{supporters.length}人）
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              lineHeight: 1,
              color: T.textMuted,
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {/* グリッド本体 */}
        <div style={{ overflowY: 'auto', padding: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 12,
            }}
          >
            {supporters.map((s) => (
              <button
                key={s.vote_id}
                type="button"
                onClick={() => onSupporterClick(s.vote_id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div style={{ position: 'relative', width: 32, height: 32 }}>
                  <img
                    src={s.photo_url}
                    alt=""
                    loading="lazy"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                  {s.is_pro && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: '#1976D2',
                        border: '1.5px solid #fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 8,
                        lineHeight: 1,
                        fontWeight: 700,
                      }}
                    >
                      ✓
                    </div>
                  )}
                </div>
                {showNames && (
                  <span
                    style={{
                      fontSize: 10,
                      color: T.textSub,
                      lineHeight: 1.2,
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {getSurname(s.display_name)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
