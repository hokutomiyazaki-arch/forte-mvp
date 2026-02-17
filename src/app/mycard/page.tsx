'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface CouponWithPro {
  id: string
  pro_user_id: string
  status: string
  pro_name: string
  coupon_text: string
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
  const [coupons, setCoupons] = useState<CouponWithPro[]>([])
  const [voteHistory, setVoteHistory] = useState<VoteHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'coupons' | 'history'>('coupons')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [message, setMessage] = useState('')

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
          .select('id, pro_user_id, status')
          .eq('client_email', email)
          .eq('status', 'active')
          .order('created_at', { ascending: false })

        if (couponData && couponData.length > 0) {
          // プロ情報を一括取得
          const proIds = Array.from(new Set(couponData.map((c: any) => c.pro_user_id)))
          const { data: proData } = await (supabase as any)
            .from('professionals')
            .select('id, name, coupon_text')
            .in('id', proIds)

          const proMap = new Map<string, { name: string; coupon_text: string }>()
          if (proData) {
            for (const p of proData) {
              proMap.set(p.id, { name: p.name, coupon_text: p.coupon_text || '' })
            }
          }

          const merged: CouponWithPro[] = couponData.map((c: any) => {
            const pro = proMap.get(c.pro_user_id)
            return {
              id: c.id,
              pro_user_id: c.pro_user_id,
              status: c.status,
              pro_name: pro?.name || 'プロ',
              coupon_text: pro?.coupon_text || '',
            }
          })
          setCoupons(merged)
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
                .maybeSingle()
              return { ...v, pro_name: (proData as any)?.name || '不明' }
            })
          )
          setVoteHistory(enrichedVotes)
        }
      }

      setLoading(false)
    }
    load()
  }, [])

  async function handleRedeem(couponId: string) {
    setRedeeming(true)
    setMessage('')

    const { data, error } = await (supabase as any).rpc('redeem_coupon', {
      coupon_id: couponId,
    })

    if (error) {
      setMessage('エラーが発生しました。もう一度お試しください。')
      setRedeeming(false)
      setConfirmingId(null)
      return
    }

    if (data?.success) {
      setCoupons(prev => prev.filter(c => c.id !== couponId))
      setMessage('クーポンを使用しました！')
    } else {
      setMessage(data?.error || 'クーポンの使用に失敗しました。')
    }

    setRedeeming(false)
    setConfirmingId(null)
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  if (!clientEmail) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">リワード</h1>
        <p className="text-gray-500 mb-6">プロにプルーフを贈ると、クーポンや投票履歴がここに表示されます。</p>
        <a href="/explore" className="text-[#C4A35A] underline">プロを探す →</a>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-6">リワード</h1>

      {message && (
        <div className={`p-3 rounded-lg mb-4 text-sm ${
          message.startsWith('クーポンを使用') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

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
              <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <p className="text-sm text-gray-500 mb-1">🎁 {c.pro_name}さんからのクーポン</p>
                <p className="text-xl font-bold text-[#1A1A2E] mb-4">「{c.coupon_text}」</p>

                {confirmingId === c.id ? (
                  <div className="space-y-2">
                    <p className="text-sm text-center text-orange-600 font-medium">
                      本当に使用しますか？この操作は取り消せません。
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRedeem(c.id)}
                        disabled={redeeming}
                        className="flex-1 py-2 bg-[#C4A35A] text-white font-bold rounded-lg hover:bg-[#b3923f] transition disabled:opacity-50"
                      >
                        {redeeming ? '処理中...' : '使用する'}
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingId(c.id)}
                    className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition text-sm"
                  >
                    使用する
                  </button>
                )}
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
          <p className="text-sm text-gray-600 mb-2">あなたも強みを証明しませんか？</p>
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
