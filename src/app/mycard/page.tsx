'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Coupon {
  id: string
  code: string
  discount_type: string
  discount_value: number
  status: string
  expires_at: string
  created_at: string
  pro_user_id: string
  pro_name?: string
}

interface VoteHistory {
  id: string
  professional_id: string
  result_category: string
  created_at: string
  pro_name?: string
}

export default function MyCardPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [clientEmail, setClientEmail] = useState('')
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [voteHistory, setVoteHistory] = useState<VoteHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'coupons' | 'history'>('coupons')

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser()
      setUser(u)

      // メールアドレス取得（ログイン済みならauth、未ログインならlocalStorage）
      let email = ''
      if (u?.email) {
        email = u.email
      } else {
        email = localStorage.getItem('proof_voter_email') || ''
      }
      setClientEmail(email)

      if (email) {
        // クーポン取得
        const { data: couponData } = await (supabase as any)
          .from('coupons')
          .select('*')
          .eq('client_email', email)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
        
        if (couponData) {
          // プロ名を取得
          const enriched = await Promise.all(
            couponData.map(async (c: any) => {
              const { data: proData } = await supabase
                .from('professionals')
                .select('name')
                .eq('id', c.pro_user_id)
                .single()
              return { ...c, pro_name: proData?.name || '不明' }
            })
          )
          setCoupons(enriched)
        }

        // 投票履歴取得
        const { data: voteData } = await (supabase as any)
          .from('votes')
          .select('id, professional_id, result_category, created_at')
          .eq('voter_email', email)
          .order('created_at', { ascending: false })

        if (voteData) {
          const enrichedVotes = await Promise.all(
            voteData.map(async (v: any) => {
              const { data: proData } = await supabase
                .from('professionals')
                .select('name')
                .eq('id', v.professional_id)
                .single()
              return { ...v, pro_name: proData?.name || '不明' }
            })
          )
          setVoteHistory(enrichedVotes)
        }
      }

      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  if (!clientEmail) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">マイカード</h1>
        <p className="text-gray-500 mb-6">プロにプルーフを贈ると、クーポンや投票履歴がここに表示されます。</p>
        <a href="/explore" className="text-[#C4A35A] underline">プロを探す →</a>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-6">マイカード</h1>

      {/* タブ */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab('coupons')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${
            tab === 'coupons'
              ? 'border-[#C4A35A] text-[#C4A35A]'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          クーポン ({coupons.length})
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${
            tab === 'history'
              ? 'border-[#C4A35A] text-[#C4A35A]'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          投票履歴 ({voteHistory.length})
        </button>
      </div>

      {/* クーポンタブ */}
      {tab === 'coupons' && (
        <div className="space-y-4">
          {coupons.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">クーポンはまだありません</p>
              <p className="text-xs text-gray-300 mt-2">プロにプルーフを贈ると、クーポンがもらえることがあります。</p>
            </div>
          ) : (
            coupons.map(c => (
              <div key={c.id} className="bg-gradient-to-r from-[#1A1A2E] to-[#2a2a4e] text-white rounded-xl p-5">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-[#C4A35A] text-xs font-bold">COUPON</p>
                    <p className="font-bold">{c.pro_name}さんから</p>
                  </div>
                  <span className="text-xs bg-[#C4A35A]/20 text-[#C4A35A] px-2 py-1 rounded">
                    {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `¥${c.discount_value} OFF`}
                  </span>
                </div>
                <div className="bg-white/10 rounded-lg px-4 py-2 text-center mt-3">
                  <p className="text-xs text-gray-300 mb-1">コード</p>
                  <p className="text-xl font-mono font-bold tracking-wider text-[#C4A35A]">{c.code}</p>
                </div>
                <div className="flex justify-between mt-3 text-xs text-gray-400">
                  <span>有効期限: {new Date(c.expires_at).toLocaleDateString('ja-JP')}</span>
                  <a href={`/card/${c.pro_user_id}`} className="text-[#C4A35A] underline">
                    カードを見る
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 投票履歴タブ */}
      {tab === 'history' && (
        <div className="space-y-3">
          {voteHistory.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">まだ投票していません</p>
            </div>
          ) : (
            voteHistory.map(v => (
              <a
                key={v.id}
                href={`/card/${v.professional_id}`}
                className="block p-4 border border-gray-200 rounded-lg hover:border-[#C4A35A] transition"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-[#1A1A2E]">{v.pro_name}</p>
                    <p className="text-xs text-gray-400">{v.result_category}</p>
                  </div>
                  <p className="text-xs text-gray-400">
                    {new Date(v.created_at).toLocaleDateString('ja-JP')}
                  </p>
                </div>
              </a>
            ))
          )}
        </div>
      )}

      {/* 他のプロを探す */}
      <div className="mt-8 text-center">
        <a
          href="/explore"
          className="inline-block px-6 py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition"
        >
          他のプロを探す →
        </a>
      </div>

      {/* プロ登録CTA */}
      {!user && (
        <div className="mt-6 p-4 bg-gray-50 rounded-xl text-center">
          <p className="text-sm text-gray-600 mb-2">あなたも実力を証明しませんか？</p>
          <a
            href="/login?role=pro"
            className="inline-block px-6 py-2 bg-[#C4A35A] text-white text-sm font-medium rounded-lg hover:bg-[#b3923f] transition"
          >
            プロとして無料登録
          </a>
        </div>
      )}
    </div>
  )
}
