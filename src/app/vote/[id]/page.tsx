'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Vote, Professional, getResultForteLabel, getPersonalityForteLabel } from '@/lib/types'

interface VoteWithPro extends Vote {
  professionals: Professional
}

interface Coupon {
  id: string
  client_user_id: string
  professional_id: string
  coupon_text: string
  used_at: string | null
  created_at: string
  professionals: Professional
}

export default function MyCardPage() {
  const supabase = createClient() as any
  const [votes, setVotes] = useState<VoteWithPro[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(true)
  const [usingCouponId, setUsingCouponId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { window.location.href = '/login?role=client'; return }

      const { data: clientData } = await supabase
        .from('clients').select('nickname').eq('user_id', user.id).single()
      if (clientData) setNickname(clientData.nickname)

      const { data: voteData } = await supabase
        .from('votes')
        .select('*, professionals(*)')
        .eq('client_user_id', user.id)
        .order('created_at', { ascending: false })

      if (voteData) setVotes(voteData as VoteWithPro[])

      // 未使用クーポンを取得
      const { data: couponData } = await supabase
        .from('coupons')
        .select('*, professionals(*)')
        .eq('client_user_id', user.id)
        .is('used_at', null)
        .order('created_at', { ascending: false })

      if (couponData) setCoupons(couponData as Coupon[])

      setLoading(false)
    }
    load()
  }, [])

  async function useCoupon(couponId: string) {
    setUsingCouponId(couponId)
    const { error } = await supabase
      .from('coupons')
      .update({ used_at: new Date().toISOString() })
      .eq('id', couponId)

    if (!error) {
      setCoupons(prev => prev.filter(c => c.id !== couponId))
    }
    setUsingCouponId(null)
  }

  if (loading) return <div className="text-center py-16 text-gray-400">読み込み中...</div>

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#1A1A2E]">{nickname || 'My'} のカード</h1>
        <p className="text-gray-500 text-sm mt-1">あなたがプルーフを贈ったプロのコレクション</p>
      </div>

      {/* クーポンセクション */}
      {coupons.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">獲得済みクーポン</h2>
          <div className="space-y-3">
            {coupons.map(c => (
              <div key={c.id} className="bg-white rounded-xl shadow-sm overflow-hidden border border-[#C4A35A]/20">
                {/* クーポン上部：切り取り線風 */}
                <div className="bg-gradient-to-r from-[#C4A35A]/10 via-[#C4A35A]/5 to-[#C4A35A]/10 px-5 py-3 flex items-center gap-3">
                  {c.professionals?.photo_url ? (
                    <img src={c.professionals.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white font-bold text-sm">
                      {c.professionals?.name?.charAt(0) || '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[#1A1A2E] text-sm truncate">{c.professionals?.name}</div>
                    <div className="text-xs text-gray-500 truncate">{c.professionals?.title}</div>
                  </div>
                  <span className="text-xs text-[#C4A35A] font-medium flex-shrink-0">COUPON</span>
                </div>

                {/* 切り取り線 */}
                <div className="border-t border-dashed border-[#C4A35A]/30 mx-4"></div>

                {/* クーポン内容 */}
                <div className="px-5 py-4">
                  <p className="text-[#1A1A2E] font-medium mb-3">{c.coupon_text}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {new Date(c.created_at).toLocaleDateString('ja-JP')} 獲得
                    </span>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        if (confirm('クーポンを使用しますか？\n一度使用すると元に戻せません。')) {
                          useCoupon(c.id)
                        }
                      }}
                      disabled={usingCouponId === c.id}
                      className="px-4 py-2 bg-[#C4A35A] text-white text-sm font-medium rounded-lg hover:bg-[#b3944f] transition disabled:opacity-50"
                    >
                      {usingCouponId === c.id ? '処理中...' : '使用する'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 投票履歴 */}
      <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">プルーフ履歴</h2>
      {votes.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-4">まだプルーフを贈ったプロがいません</p>
          <a href="/explore" className="text-[#C4A35A] hover:underline">プロを探す</a>
        </div>
      ) : (
        <div className="space-y-4">
          {votes.map(v => (
            <a key={v.id} href={`/card/${v.professional_id}`}
              className="block bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition">
              <div className="flex items-center gap-4">
                {v.professionals.photo_url ? (
                  <img src={v.professionals.photo_url} alt="" className="w-14 h-14 rounded-full object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white text-xl font-bold">
                    {v.professionals.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-bold text-[#1A1A2E]">{v.professionals.name}</div>
                  <div className="text-sm text-gray-500">{v.professionals.title}</div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 bg-[#1A1A2E]/10 text-[#1A1A2E] rounded-full">
                      {getResultForteLabel(v.result_category, v.professionals)}
                    </span>
                    {v.personality_categories?.map(pc => (
                      <span key={pc} className="text-xs px-2 py-0.5 bg-[#C4A35A]/10 text-[#C4A35A] rounded-full">
                        {getPersonalityForteLabel(pc, v.professionals)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {v.comment && (
                <p className="text-sm text-gray-600 mt-3 border-l-2 border-[#C4A35A] pl-3">{v.comment}</p>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
