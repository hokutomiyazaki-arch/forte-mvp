'use client'
import { COLORS, FONTS } from '@/lib/design-tokens'
import { getSurname } from '@/lib/display-name-utils'

const T = { ...COLORS, font: FONTS.main, fontMono: FONTS.mono }

export interface VoiceComment {
  id: string
  comment: string
  created_at: string
  display_mode: string | null
  client_photo_url: string | null
  auth_display_name: string | null
  voter_pro: {
    id: string
    name: string
    title: string | null
    photo_url: string | null
  } | null
  voter_vote_count: number
}

interface Props {
  vote: VoiceComment
  /** 検索ワードハイライト（?highlight=...）が当たっている */
  isSearchHighlighted?: boolean
  /** Supporters Strip タップによる一時的ハイライト（2秒点滅、親側で setTimeout） */
  isTapHighlighted?: boolean
  /** 検索ワード本文（マッチ時に <mark> でハイライト） */
  highlightWord?: string
}

/** 円形アイコン（32x32）— display_mode に応じて切り替え */
function ClientIcon({
  type,
  imageUrl,
  initial,
  isPro,
}: {
  type: 'image' | 'initial'
  imageUrl?: string | null
  initial?: string
  isPro?: boolean
}) {
  return (
    <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
      {type === 'image' && imageUrl ? (
        <img
          src={imageUrl}
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
      ) : (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#E8E4DC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#888',
            fontSize: 13,
            fontWeight: 700,
            fontFamily: T.font,
          }}
        >
          {initial || '〇'}
        </div>
      )}
      {isPro && (
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
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          ✓
        </div>
      )}
    </div>
  )
}

export function VoiceCommentCard({
  vote,
  isSearchHighlighted,
  isTapHighlighted,
  highlightWord,
}: Props) {
  const renderClientHeader = () => {
    switch (vote.display_mode) {
      case 'photo': {
        if (!vote.client_photo_url) return null
        const surname = getSurname(vote.auth_display_name)
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <ClientIcon type="image" imageUrl={vote.client_photo_url} />
            {surname && (
              <span style={{ fontSize: 13, fontWeight: 600, color: T.textSub }}>
                {surname}さん
              </span>
            )}
          </div>
        )
      }
      case 'nickname_only': {
        const surname = getSurname(vote.auth_display_name)
        const initial = surname ? surname.charAt(0) : '〇'
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <ClientIcon type="initial" initial={initial} />
            {surname && (
              <span style={{ fontSize: 13, fontWeight: 600, color: T.textSub }}>
                {surname}さん
              </span>
            )}
          </div>
        )
      }
      case 'pro_link': {
        if (!vote.voter_pro) return null
        return (
          <a
            href={`/card/${vote.voter_pro.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              textDecoration: 'none',
              color: T.textSub,
            }}
          >
            <ClientIcon
              type="image"
              imageUrl={vote.voter_pro.photo_url}
              isPro
              initial={vote.voter_pro.name.charAt(0)}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: T.dark }}>
              {vote.voter_pro.name}
            </span>
          </a>
        )
      }
      // 'hidden' / null / その他: 既存の匿名表示のまま（ヘッダーなし）
      default:
        return null
    }
  }

  // 背景・ボーダー: tap > search > 通常
  const background = isTapHighlighted
    ? 'linear-gradient(170deg, #FFF3B0 0%, #FFE680 100%)'
    : isSearchHighlighted
    ? 'linear-gradient(170deg, #FFF8E1 0%, #FFF3CD 100%)'
    : 'linear-gradient(170deg, #FAF8F4 0%, #F3EFE7 100%)'
  const border = isTapHighlighted
    ? '2px solid #C4A35A'
    : isSearchHighlighted
    ? '1.5px solid #C4A35A'
    : '1px solid #E8E4DC'

  // 検索ハイライト用の本文レンダリング（既存ロジックを保持）
  const renderComment = () => {
    if (highlightWord && vote.comment.includes(highlightWord)) {
      const parts = vote.comment.split(highlightWord)
      return (
        <>
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < parts.length - 1 && (
                <mark
                  style={{
                    background: 'rgba(196,163,90,0.25)',
                    color: '#1A1A2E',
                    padding: '0 2px',
                    borderRadius: 2,
                  }}
                >
                  {highlightWord}
                </mark>
              )}
            </span>
          ))}
        </>
      )
    }
    return vote.comment
  }

  return (
    <div
      id={`vote-${vote.id}`}
      data-highlight-match={isSearchHighlighted ? 'true' : undefined}
      style={{
        background,
        border,
        borderRadius: 14,
        padding: '20px',
        transition: 'background 0.4s ease, border-color 0.4s ease',
      }}
    >
      {/* display_mode 別ヘッダー */}
      {renderClientHeader()}

      {/* 引用符 */}
      <div
        style={{
          fontSize: 32,
          color: 'rgba(196, 163, 90, 0.3)',
          fontFamily: 'Georgia, serif',
          lineHeight: 1,
        }}
      >
        &ldquo;
      </div>

      {/* コメント本文 */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#1A1A2E',
          lineHeight: 1.8,
          margin: '4px 0 10px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {renderComment()}
      </div>

      {/* 日付 + リピーター/常連マーク（既存維持） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono }}>
          {new Date(vote.created_at).toLocaleDateString('ja-JP')}
        </div>
        {vote.voter_vote_count >= 3 && (
          <div style={{ fontSize: 11, fontWeight: 600, color: '#C4A35A' }}>⭐ 常連</div>
        )}
        {vote.voter_vote_count === 2 && (
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999' }}>🔄 リピーター</div>
        )}
      </div>
    </div>
  )
}
