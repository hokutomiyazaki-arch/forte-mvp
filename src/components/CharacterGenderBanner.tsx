'use client'

/**
 * CharacterGenderBanner — character_gender 未選択プロ向けの告知バナー(2026-08-05・CEO指示)
 *
 * 表示条件 (親側で制御):
 *   - pro が存在する
 *   - pro.character_gender が null(未選択)
 *
 * 配置: dashboard/page.tsx で BookingUrlBanner と同じ並び(姓名未設定バナーの下・QRコードの上)。
 * CTA は Link で `/dashboard?tab=profile&edit=true` へ(BookingUrlBannerと同一パターン)。
 * 何かを選んで保存すれば(neutral含む) character_gender が null でなくなり自動的に消える。
 */

import Link from 'next/link'

export default function CharacterGenderBanner() {
  return (
    <div
      className="flex gap-4 p-5 mb-4 rounded-xl items-start"
      style={{
        background: 'linear-gradient(135deg, #FAFAF7, #F5EFDF)',
        border: '1px solid #C4A35A',
      }}
    >
      <div className="text-2xl flex-shrink-0" aria-hidden="true">🎨</div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-bold text-[#1A1A2E] mb-2">
          タイプ分析のキャラクターが新しくなりました
        </h3>
        <p className="text-sm text-[#1A1A2E] mb-3 leading-relaxed">
          あなたのキャラクターの見た目（男性/女性/スタンダード）を選んでください。
        </p>
        <Link
          href="/dashboard?tab=profile&edit=true"
          className="inline-block px-5 py-2 rounded-md text-sm font-bold no-underline"
          style={{ background: '#1A1A2E', color: '#FAFAF7' }}
        >
          プロフィール編集で選ぶ →
        </Link>
      </div>
    </div>
  )
}
