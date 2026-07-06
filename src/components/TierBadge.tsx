// ============================================================
// TierBadge — 強みプルーフのティア表示用共通コンポーネント
// ============================================================
// PROVEN: 絵文字 🛡 (+ optional ラベル "PROVEN")
// SPECIALIST/MASTER/LEGEND: メダル画像 /medals/{lower}-64.png (+ optional ラベル)
//
// 触らない箇所:
// - 認定申請バナー、CertificationModal、Navbar 認定申請メニュー
// - 認定書PDF、Featured Proof リスト、獲得バッジビュー、パーソナリティ系
// ============================================================

import {
  getCertificationTier,
  type CertificationTier,
} from '@/lib/constants'

export type Tier = CertificationTier
export type TierSize = 'sm' | 'md' | 'lg'

interface TierBadgeProps {
  tier: Tier
  size?: TierSize
  /** ティア名テキストを横に併記するか (デフォルト true) */
  showLabel?: boolean
  /** 外側 wrapper への追加 className */
  className?: string
  /** 外側 wrapper への追加 style */
  style?: React.CSSProperties
}

// 表示サイズ (画像/絵文字本体の高さ・幅 px)
const SIZE_PX: Record<TierSize, number> = {
  sm: 24,
  md: 32,
  lg: 48,
}

// 併記ラベルのフォントサイズ
const LABEL_FONT_PX: Record<TierSize, number> = {
  sm: 10,
  md: 12,
  lg: 14,
}

// メダル画像パス (PROVEN 以外＝SPECIALIST/MASTER/LEGEND/IMMORTAL。/public/medals/ 配下)
const MEDAL_PATHS: Record<Exclude<CertificationTier, 'PROVEN'>, string> = {
  SPECIALIST: '/medals/specialist-64.png',
  MASTER: '/medals/master-64.png',
  LEGEND: '/medals/legend-64.png',
  IMMORTAL: '/medals/immortal-64.png',
}

const GOLD = '#C4A35A'

/**
 * 強みプルーフのティアバッジ。
 *
 * 例:
 *   <TierBadge tier="MASTER" size="sm" showLabel />
 *   <TierBadge tier="SPECIALIST" size="sm" showLabel={false} />
 *   <TierBadge tier="PROVEN" size="sm" />  // 絵文字 🛡 + PROVEN テキスト
 */
export function TierBadge({
  tier,
  size = 'sm',
  showLabel = true,
  className,
  style,
}: TierBadgeProps) {
  const px = SIZE_PX[size]
  const fontPx = LABEL_FONT_PX[size]

  // PROVEN: 絵文字のまま
  if (tier === 'PROVEN') {
    return (
      <span
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          ...style,
        }}
      >
        <span
          aria-hidden="true"
          style={{ fontSize: Math.round(px * 0.7), lineHeight: 1 }}
        >
          🛡
        </span>
        {showLabel && (
          <span
            style={{
              fontSize: fontPx,
              fontWeight: 700,
              letterSpacing: 2,
              color: GOLD,
            }}
          >
            PROVEN
          </span>
        )}
      </span>
    )
  }

  // SPECIALIST / MASTER / LEGEND: メダル画像
  const medalPath = MEDAL_PATHS[tier]
  const altText = `${tier}認定`

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
    >
      <img
        src={medalPath}
        alt={altText}
        width={px}
        height={px}
        style={{
          width: px,
          height: px,
          objectFit: 'contain',
          flexShrink: 0,
        }}
      />
      {showLabel && (
        <span
          style={{
            fontSize: fontPx,
            fontWeight: 700,
            letterSpacing: 1,
            color: GOLD,
          }}
        >
          {tier}
        </span>
      )}
    </span>
  )
}

/**
 * 共通ヘルパー: 票数からティアを取得。
 * 既存 getCertificationTier の薄いラッパで、TierBadge と組み合わせて使う想定。
 *
 * 戻り値:
 *   votes >= 100 → 'LEGEND'
 *   votes >=  50 → 'MASTER'
 *   votes >=  30 → 'SPECIALIST'
 *   votes >=  15 → 'PROVEN'
 *   votes <  15  → null
 */
export function getTierFromVotes(votes: number): CertificationTier | null {
  if (typeof votes !== 'number' || votes <= 0) return null
  return getCertificationTier(votes)
}
