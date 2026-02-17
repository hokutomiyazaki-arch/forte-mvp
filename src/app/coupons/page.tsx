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

export default function CouponsPage() {
  const supabase = createClient()
  const [rewards, setRewards] = useState<RewardWithPro[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) {
        window.location.href = '/login?role=client&redirect=/coupons'
        return
      }
      setUser(u)

      // clientsレコードがなければ自動作成
      const { data: existing } = await (supabase as any)
        .from('clients')
        .select('id')
        .eq('user_id', u.id)
        .maybeSingle()

      if (!existing) {
        const nn = u.user_metadata?.full_name || u.email?.split('@')[0] || 'ユーザー'
        await (supabase as any).from('clients').upsert({
          user_id: u.id,
          nickname: nn,
        }, { onConflict: 'user_id' })
      }

      // client_rewards を取得
      const { data: clientRewards } = await (supabase as any)
        .from('client_rewards')
        .select('id, reward_id, professional_id, status')
        .eq('client_email', u.email)
        .in('status', ['active', 'used'])
        .order('created_at', { ascending: false })

      if (!clientRewards || clientRewards.length === 0) {
        setLoading(false)
        return
      }

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

      // マージ
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
      setRewards(prev => prev.map(r =>
        r.id === clientRewardId ? { ...r, status: 'used' } : r
      ))
      setMessage('リワードを使用しました！')
    }

    setRedeeming(false)
    setConfirmingId(null)
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  // タブ用: ユーザーが持っているリワードタイプ
  const rewardTypeSet = Array.from(new Set(rewards.map(r => r.reward_type).filter(Boolean)))
  const filteredRewards = activeTab === 'all'
    ? rewards
    : rewards.filter(r => r.reward_type === activeTab)
  const activeRewards = filteredRewards.filter(r => r.status === 'active')
  const usedRewards = filteredRewards.filter(r => r.status === 'used')

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">リワード</h1>
      <p className="text-sm text-gray-500 mb-6">
        プルーフを贈ったプロからのリワードです。対面時に「使用する」を押してください。
      </p>

      {message && (
        <div className={`p-3 rounded-lg mb-4 text-sm ${
          message.startsWith('リワードを使用') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

      {rewards.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">まだリワードはありません</p>
          <a href="/explore" className="text-[#C4A35A] text-sm underline mt-2 inline-block">
            プロを探してプルーフを贈る
          </a>
        </div>
      ) : (
        <>
          {/* タブ */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition ${
                activeTab === 'all'
                  ? 'bg-[#1A1A2E] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              全て ({rewards.length})
            </button>
            {rewardTypeSet.map(type => (
              <button
                key={type}
                onClick={() => setActiveTab(type)}
                className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition ${
                  activeTab === type
                    ? 'bg-[#1A1A2E] text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {getRewardLabel(type)} ({rewards.filter(r => r.reward_type === type).length})
              </button>
            ))}
          </div>

          {/* アクティブなリワード */}
          {activeRewards.map(reward => (
            <div key={reward.id} className="bg-white border border-gray-200 rounded-xl p-5 mb-4 shadow-sm">
              <a href={`/card/${reward.professional_id}`} className="text-sm text-gray-500 mb-1 hover:text-[#C4A35A] transition inline-block">
                {reward.pro_name}さんからのリワード
              </a>
              <p className="text-xs text-[#C4A35A] mb-1">{getRewardLabel(reward.reward_type)}</p>
              <p className="text-xl font-bold text-[#1A1A2E] mb-4">「{reward.content}」</p>

              {confirmingId === reward.id ? (
                <div className="space-y-2">
                  <p className="text-sm text-center text-orange-600 font-medium">
                    本当に使用しますか？この操作は取り消せません。
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRedeem(reward.id)}
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
                  onClick={() => setConfirmingId(reward.id)}
                  className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition text-sm"
                >
                  使用する
                </button>
              )}
            </div>
          ))}

          {/* 使用済みリワード */}
          {usedRewards.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-medium text-gray-400 mb-3">使用済み</h2>
              {usedRewards.map(reward => (
                <div key={reward.id} className="bg-gray-50 text-gray-400 rounded-xl p-4 mb-2">
                  <p className="text-xs mb-1">{reward.pro_name}さんからのリワード</p>
                  <p className="text-xs text-gray-300 mb-1">{getRewardLabel(reward.reward_type)}</p>
                  <p className="text-sm line-through">「{reward.content}」</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
