'use client'

/**
 * BookingUrlBanner — booking_url 未入力プロ向けの促進バナー
 *
 * 表示条件 (親側で制御):
 *   - pro.setup_completed === true
 *   - pro.booking_url が null / 空文字
 *   - voteCount > 0 (1 票も入ってないプロには出さない)
 *
 * 配置: dashboard/page.tsx で「姓名未設定バナー」の直下、QR コード/タブの上。
 *       全タブ共通エリアなのでどのタブにいても可視。
 *
 * CTA は Link で `/dashboard?tab=profile&edit=true` へ。同ページ内では
 * 既存の useSearchParams 経由 useEffect で setEditing(true) が反応する。
 * 月次通知メールからの直リンクも同 URL を共有。
 */

import Link from 'next/link'

interface Props {
  proName: string
  voteCount: number
}

export default function BookingUrlBanner({ proName, voteCount }: Props) {
  return (
    <div
      className="flex gap-4 p-5 mb-4 rounded-xl items-start"
      style={{
        background: 'linear-gradient(135deg, #FAFAF7, #F5EFDF)',
        border: '1px solid #C4A35A',
      }}
    >
      <div className="text-2xl flex-shrink-0" aria-hidden="true">⚠️</div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-bold text-[#1A1A2E] mb-2">
          予約・連絡先URLが未設定です
        </h3>
        <p className="text-sm text-[#1A1A2E] mb-3 leading-relaxed">
          {proName ? `${proName}さん` : 'あなた'}を応援したお客さん{' '}
          <strong className="text-[#C4A35A]">{voteCount}人</strong>。
          <br />
          「予約したい」と思った時の連絡先がプロフィールにありません。
        </p>
        <Link
          href="/dashboard?tab=profile&edit=true"
          className="inline-block px-5 py-2 rounded-md text-sm font-bold no-underline"
          style={{ background: '#1A1A2E', color: '#FAFAF7' }}
        >
          予約・連絡先URLを設定する →
        </Link>
      </div>
    </div>
  )
}
