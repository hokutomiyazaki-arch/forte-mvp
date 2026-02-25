'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface ProInfo {
  display_name: string
  name: string
  photo_url: string | null
}

export default function VotePreparingPage() {
  const params = useParams()
  const proId = params.id as string
  const supabase = createClient()

  const [pro, setPro] = useState<ProInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await (supabase as any)
        .from('professionals')
        .select('display_name, name, photo_url')
        .eq('id', proId)
        .maybeSingle()

      if (data) {
        setPro(data)
      }
      setLoading(false)
    }
    load()
  }, [proId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#C4A35A] border-t-transparent rounded-full"></div>
      </div>
    )
  }

  const displayName = pro?.display_name || pro?.name || 'プロ'
  const initials = displayName.charAt(0)

  return (
    <>
      {/* ナビバー・フッターを非表示 */}
      <style>{`
        nav, footer { display: none !important; }
        main { padding: 0 !important; max-width: 100% !important; }
      `}</style>

      <div className="min-h-screen bg-[#FAFAF7] flex flex-col items-center justify-center px-6">
        <div className="max-w-sm w-full text-center">

          {/* ロゴ */}
          <p className="text-sm font-bold tracking-widest text-[#C4A35A] mb-10">
            REAL PROOF
          </p>

          {/* プロの写真 */}
          <div className="mb-6">
            {pro?.photo_url ? (
              <img
                src={pro.photo_url}
                alt={displayName}
                className="w-24 h-24 rounded-full mx-auto object-cover border-3 border-[#C4A35A]/30"
              />
            ) : (
              <div className="w-24 h-24 rounded-full mx-auto bg-[#1A1A2E] flex items-center justify-center border-3 border-[#C4A35A]/30">
                <span className="text-3xl font-bold text-[#C4A35A]">{initials}</span>
              </div>
            )}
          </div>

          {/* メインメッセージ */}
          <h1 className="text-xl font-bold text-[#1A1A2E] mb-3 leading-relaxed">
            現在 <span className="text-[#C4A35A]">{displayName}</span> さんは<br />
            投票の準備中です
          </h1>

          <p className="text-sm text-gray-500 mb-10 leading-relaxed">
            {displayName}さんが設定を完了次第、<br />
            投票できるようになります。
          </p>

          {/* 区切り線 */}
          <div className="w-12 h-px bg-[#C4A35A]/40 mx-auto mb-10"></div>

          {/* REALPROOFの説明 */}
          <div className="text-left bg-white rounded-xl p-5 shadow-sm mb-8">
            <p className="text-sm font-bold text-[#1A1A2E] mb-2">
              REALPROOFとは？
            </p>
            <p className="text-sm text-gray-500 leading-relaxed">
              あなたが受けたサービスの「強み」に投票できるプラットフォームです。
              クライアントの声で、プロの実力が証明されます。
            </p>
          </div>

          {/* キャッチフレーズ */}
          <p className="text-xs text-gray-400 tracking-wider">
            強みが、あなたを定義する。
          </p>

        </div>
      </div>
    </>
  )
}
