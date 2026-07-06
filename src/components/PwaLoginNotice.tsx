'use client'

import { useEffect, useState } from 'react'

/**
 * PWA(ホーム画面アプリ)から開かれている時だけ表示する案内。
 * iOSのPWA standalone では LINE/Google の OAuth セッションが分離し、
 * ログインが authorization_invalid になるため、通常ブラウザ(Safari)へ誘導する。
 * ※ 今回は「PWAから同一オリジンをSafari.appで開けるか」を検証するミニテスト。
 */
export default function PwaLoginNotice() {
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const iosStandalone = (window.navigator as any).standalone === true
    const displayModeStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches === true
    setIsStandalone(iosStandalone || displayModeStandalone)
  }, [])

  if (!isStandalone) return null

  const browserLoginUrl = `${window.location.origin}/sign-in`

  return (
    <div className="w-full max-w-sm mb-6 rounded-xl border border-[#C4A35A]/40 bg-[#C4A35A]/10 p-4">
      <p className="text-sm font-bold text-[#1A1A2E] mb-1">
        ホーム画面のアプリからはログインできません
      </p>
      <p className="text-xs text-gray-600 mb-3 leading-relaxed">
        ホーム画面に追加したアプリでは、LINE・Googleログインが正しく動きません。下のボタンからブラウザ（Safari）で開いてログインしてください。
      </p>
      <a
        href={browserLoginUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full text-center rounded-lg bg-[#1A1A2E] py-3 text-sm font-bold text-white hover:bg-[#2a2a4e] transition-colors"
      >
        ブラウザで開いてログイン →
      </a>
    </div>
  )
}
