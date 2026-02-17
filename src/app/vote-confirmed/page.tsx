'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getRewardLabel } from '@/lib/types'
import { Suspense } from 'react'

function ConfirmedContent() {
  const searchParams = useSearchParams()
  const proId = searchParams.get('pro')
  const rewardType = searchParams.get('reward_type') || ''
  const rewardContent = searchParams.get('reward_content') || ''
  const voterEmail = searchParams.get('email') || ''
  const supabase = createClient()
  const [proName, setProName] = useState('')

  useEffect(() => {
    async function load() {
      if (proId) {
        const { data } = await (supabase as any)
          .from('professionals')
          .select('name')
          .eq('id', proId)
          .single()
        if (data) setProName(data.name)
      }
    }
    load()
  }, [proId])

  return (
    <div className="max-w-md mx-auto text-center py-12 px-4">
      <div className="text-5xl mb-4">🎉</div>
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">プルーフが確定しました！</h1>
      <p className="text-gray-500 mb-6">
        {proName ? `${proName}さんにあなたのプルーフが届きました。` : 'プルーフが正常に確認されました。'}
      </p>

      {/* リワード表示 */}
      {rewardType && rewardContent ? (
        <div className="bg-[#f8f6f0] border-2 border-dashed border-[#C4A35A] rounded-xl p-6 mb-6">
          <p className="text-sm text-[#666] mb-1">{getRewardLabel(rewardType)}</p>
          <p className="text-xl font-bold text-[#1A1A2E] mb-3">{rewardContent}</p>
          <p className="text-xs text-gray-500">
            リワードを使用するには、アカウント登録が必要です。
          </p>
          <a
            href={`/login?role=client&redirect=/coupons&email=${encodeURIComponent(voterEmail)}`}
            className="inline-block mt-4 px-6 py-2 bg-[#C4A35A] text-white text-sm font-medium rounded-lg hover:bg-[#b3923f] transition"
          >
            登録してリワードを受け取る
          </a>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
          <p className="text-sm text-gray-600">プルーフが正常に反映されました。</p>
        </div>
      )}

      {proId && (
        <a
          href={`/card/${proId}`}
          className="block w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition mb-3"
        >
          {proName ? `${proName}さんのカードを見る` : 'カードを見る'}
        </a>
      )}

    </div>
  )
}

export default function VoteConfirmedPage() {
  return (
    <Suspense fallback={<div className="text-center py-16">読み込み中...</div>}>
      <ConfirmedContent />
    </Suspense>
  )
}
