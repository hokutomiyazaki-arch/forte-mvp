'use client'
import { useState } from 'react'
import { COLORS, FONTS } from '@/lib/design-tokens'
import { getSurname } from '@/lib/display-name-utils'
import { SupportersModal } from './SupportersModal'
import type { Supporter } from './types'

const T = { ...COLORS, font: FONTS.main, fontMono: FONTS.mono }

interface Props {
  supporters: Supporter[]
  onSupporterClick: (voteId: string) => void
}

/**
 * 件数に応じた動的サイジング設定（仕様 §2.1 v2）
 *
 * | 件数      | アイコン | gap  | 表示数        | 行数 | 名前 |
 * |-----------|---------|------|--------------|-----|------|
 * | 1〜3      | 64px    | 12px | 全件         | 1   | あり |
 * | 4〜8      | 48px    | 10px | 全件         | 1   | あり |
 * | 9〜16     | 40px    |  8px | 全件         | 2   | あり(小)|
 * | 17件以上  | 32px    |  6px | 16件 + +N    | 2   | なし |
 */
function getSizingConfig(count: number) {
  if (count <= 3) return { iconSize: 64, gap: 12, fontSize: 12, showName: true }
  if (count <= 8) return { iconSize: 48, gap: 10, fontSize: 11, showName: true }
  // 9-16件は名前非表示（FV高さ130px以内に収めるため）
  if (count <= 16) return { iconSize: 40, gap: 8, fontSize: 0, showName: false }
  return { iconSize: 32, gap: 6, fontSize: 0, showName: false }
}

const VISIBLE_LIMIT = 16

export function SupportersStrip({ supporters, onSupporterClick }: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  if (!supporters || supporters.length === 0) return null

  const config = getSizingConfig(supporters.length)
  const hasMore = supporters.length > VISIBLE_LIMIT
  const visibleSupporters = hasMore
    ? supporters.slice(0, VISIBLE_LIMIT)
    : supporters

  // 横スクロール禁止 → flex-wrap で自然な折り返し（仕様の動的サイジングで2行以内に収める前提）
  // checkmark バッジが iconSize から食み出すため、外周に少し余白を持たせる
  const slotWidth = config.iconSize
  const checkmarkSize = 12

  return (
    <>
      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: 14,
          padding: '12px 14px',
          marginBottom: 12,
          fontFamily: T.font,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: T.textMuted,
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          支持しているクライアント
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: config.gap,
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
          }}
        >
          {visibleSupporters.map((s) => (
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
                width: slotWidth,
                gap: 4,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: config.iconSize,
                  height: config.iconSize,
                }}
              >
                <img
                  src={s.photo_url}
                  alt=""
                  loading="lazy"
                  style={{
                    width: config.iconSize,
                    height: config.iconSize,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                {s.is_pro && (
                  <div
                    aria-label="プロアカウント"
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: checkmarkSize,
                      height: checkmarkSize,
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
              {config.showName && (
                <span
                  style={{
                    fontSize: config.fontSize,
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

          {/* +N ボタン（17件以上で表示） */}
          {hasMore && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              style={{
                background: '#F0EDE6',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                width: config.iconSize,
                height: config.iconSize,
                borderRadius: '50%',
                color: T.textSub,
                fontSize: config.iconSize >= 40 ? 12 : 10,
                fontWeight: 700,
                fontFamily: T.fontMono,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              +{supporters.length - VISIBLE_LIMIT}
            </button>
          )}
        </div>
      </div>

      {modalOpen && (
        <SupportersModal
          supporters={supporters}
          onClose={() => setModalOpen(false)}
          onSupporterClick={(voteId) => {
            setModalOpen(false)
            onSupporterClick(voteId)
          }}
        />
      )}
    </>
  )
}
