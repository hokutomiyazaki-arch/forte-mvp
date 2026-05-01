'use client'

/**
 * SEO Step 5 Phase A-1: プレースホルダ
 *   既存 page.tsx (旧 'use client') の全 UI ロジックは Phase A-2 で
 *   このファイルへ移植する。A-1 段階では view-source で SEO HTML が
 *   出力されることを CEO が確認するためだけのスタブ。
 */

import type { CardData } from '@/lib/card-data'
import { COLORS } from '@/lib/design-tokens'

interface Props {
  cardData: CardData
}

export default function CardClient({ cardData }: Props) {
  if (!cardData.pro) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: COLORS.textMuted }}>
        プロフィールが見つかりません
      </div>
    )
  }
  if (cardData.pro.deactivated_at) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: COLORS.textMuted }}>
        <p style={{ fontSize: 14 }}>このプロフィールは現在非公開です</p>
      </div>
    )
  }

  // A-1 プレースホルダ表示 (A-2 で削除)
  return (
    <div style={{ textAlign: 'center', padding: '64px 0', color: COLORS.textMuted, fontSize: 14 }}>
      読み込み中...
    </div>
  )
}
