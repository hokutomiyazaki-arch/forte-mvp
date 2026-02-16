'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Suspense } from 'react'

function ConfirmedContent() {
  const searchParams = useSearchParams()
  const proId = searchParams.get('pro')
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

      <div className="bg-[#f8f6f0] border border-[#C4A35A]/30 rounded-xl p-4 mb-6 text-left">
        <p className="text-sm text-[#1A1A2E] font-medium">🎁 クーポンについて</p>
        <p className="text-xs text-gray-500 mt-1">
          プロがクーポンを設定している場合、別途メールでクーポンが届きます。
        </p>
      </div>

      {proId && (
        <a
          href={`/card/${proId}`}
          className="block w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition mb-3"
        >
          {proName ? `${proName}さんのカードを見る` : 'カードを見る'}
        </a>
      )}

      <div className="mt-8 p-4 bg-gray-50 rounded-xl">
        <p className="text-sm text-gray-600 mb-2">あなたも強みを証明しませんか？</p>
        <p className="text-xs text-gray-400 mb-3">
          PROOFに登録して、あなたのクライアントからプルーフを集めましょう。
        </p>
        <a
          href="/login?role=pro"
          className="inline-block px-6 py-2 bg-[#C4A35A] text-white text-sm font-medium rounded-lg hover:bg-[#b3923f] transition"
        >
          プロとして無料登録
        </a>
      </div>

      <a href="/explore" className="block mt-4 text-sm text-[#C4A35A] underline">
        他のプロを探す →
      </a>
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
