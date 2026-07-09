'use client'

import { useState } from 'react'

/**
 * NFCカード購入CTA（3箇所共通コンポーネント）。
 * クリック → /api/card-order/checkout へPOST → 返却された Stripe Checkout URL へリダイレクト。
 * ※ Checkout API は Phase 3 で実装。それまでは押すとエラー表示になる（設計通り）。
 */
export default function CheckoutButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/card-order/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) {
        setError('決済ページを開けませんでした。時間をおいて再度お試しください。')
        setLoading(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('通信エラーが発生しました。時間をおいて再度お試しください。')
      setLoading(false)
    }
  }

  return (
    <div className="w-full flex flex-col items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-[#C4A35A] text-[#1A1A2E] font-bold text-base px-10 py-4 rounded-full shadow-lg hover:bg-[#9A7B3A] hover:text-white transition disabled:opacity-60"
      >
        {loading ? '読み込み中…' : label}
      </button>
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </div>
  )
}
