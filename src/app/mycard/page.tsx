'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getRewardLabel } from '@/lib/types'

interface RewardWithPro {
  id: string
  reward_id: string
  reward_type: string
  content: string
  status: string
  professional_id: string
  pro_name: string
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
  const [rewards, setRewards] = useState<RewardWithPro[]>([])
  const [voteHistory, setVoteHistory] = useState<VoteHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'rewards' | 'history'>('rewards')
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
        // リワード取得
        const { data: clientRewards } = await (supabase as any)
          .from('client_rewards')
          .select('id, reward_id, professional_id, status')
          .eq('client_email', email)
          .eq('status', 'active')
          .order('created_at', { ascending: false })

        if (clientRewards && clientRewards.length > 0) {
          // reward詳細を一括取得
          const rewardIds = Array.from(new Set(clientRewards.map((cr: any) => cr.reward_id)))
          const { data: rewardData } = await (supabase as any)
            .from('rewards')
            .select('id, reward_type, content')
            .in('id', rewardIds)

          const rewardMap = new Map<string, { reward_type: string; content: string }>()
          if (rewardData) {
            for (const r of rewardData) {
              rewardMap.set(r.id, { reward_type: r.reward_type, content: r.content })
            }
          }

          // プロ名を一括取得
          const proIds = Array.from(new Set(clientRewards.map((cr: any) => cr.professional_id)))
          const { data: proData } = await (supabase as any)
            .from('professionals')
            .select('id, name')
            .in('id', proIds)

          const proMap = new Map<string, string>()
          if (proData) {
            for (const p of proData) {
              proMap.set(p.id, p.name)
            }
          }

          const merged: RewardWithPro[] = clientRewards.map((cr: any) => {
            const reward = rewardMap.get(cr.reward_id)
            return {
              id: cr.id,
              reward_id: cr.reward_id,
              reward_type: reward?.reward_type || '',
              content: reward?.content || '',
              status: cr.status,
              professional_id: cr.professional_id,
              pro_name: proMap.get(cr.professional_id) || 'プロ',
            }
          })
          setRewards(merged)
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

  async function handleRedeem(clientRewardId: string) {
    setRedeeming(true)
    setMessage('')

    const { error } = await (supabase as any)
      .from('client_rewards')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', clientRewardId)

    if (error) {
      setMessage('エラーが発生しました。もう一度お試しください。')
    } else {
      setRewards(prev => prev.filter(r => r.id !== clientRewardId))
      setMessage('リワードを使用しました！')
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
        <p className="text-gray-500 mb-6">プロにプルーフを贈ると、リワードや投票履歴がここに表示されます。</p>
        <a href="/explore" className="text-[#C4A35A] underline">プロを探す</a>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-6">リワード</h1>

      {message && (
        <div className={`p-3 rounded-lg mb-4 text-sm ${
          message.startsWith('リワードを使用') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

      {/* タブ */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab('rewards')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${
            tab === 'rewards'
              ? 'border-[#C4A35A] text-[#C4A35A]'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          リワード ({rewards.length})
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

      {/* リワードタブ */}
      {tab === 'rewards' && (
        <div className="space-y-4">
          {rewards.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">リワードはまだありません</p>
              <p className="text-xs text-gray-300 mt-2">プロにプルーフを贈ると、リワードがもらえることがあります。</p>
            </div>
          ) : (
            rewards.map(r => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <a href={`/card/${r.professional_id}`} className="text-sm text-gray-500 mb-1 hover:text-[#C4A35A] transition inline-block">
                  {r.pro_name}さんからのリワード
                </a>
                <p className="text-xs text-[#C4A35A] mb-1">{getRewardLabel(r.reward_type)}</p>
                <p className="text-xl font-bold text-[#1A1A2E] mb-4">「{r.content}」</p>

                {confirmingId === r.id ? (
                  <div className="space-y-2">
                    <p className="text-sm text-center text-orange-600 font-medium">
                      本当に使用しますか？この操作は取り消せません。
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRedeem(r.id)}
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
                    onClick={() => setConfirmingId(r.id)}
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
          他のプロを探す
        </a>
      </div>
    </div>
  )
}
