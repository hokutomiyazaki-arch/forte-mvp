'use client'
import { useEffect, useState, useRef } from 'react'
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

export default function MyPage() {
  const supabase = createClient()
  const [rewards, setRewards] = useState<RewardWithPro[]>([])
  const [voteHistory, setVoteHistory] = useState<VoteHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [timedOut, setTimedOut] = useState(false)
  const [tab, setTab] = useState<'rewards' | 'history'>('rewards')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [message, setMessage] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [isPro, setIsPro] = useState(false)

  useEffect(() => {
    timerRef.current = setTimeout(() => setTimedOut(true), 5000)

    async function load() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
          window.location.href = '/login?role=client&redirect=/mycard'
          return
        }

        const email = user.email || ''

        // プロ確認
        const { data: proCheck } = await (supabase as any)
          .from('professionals').select('id').eq('user_id', user.id).maybeSingle()
        setIsPro(!!proCheck)

        // client_rewards を取得（active + used）
        const { data: clientRewards } = await (supabase as any)
          .from('client_rewards')
          .select('id, reward_id, professional_id, status')
          .eq('client_email', email)
          .in('status', ['active', 'used'])
          .order('created_at', { ascending: false })

        if (clientRewards && clientRewards.length > 0) {
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

        if (voteData && voteData.length > 0) {
          const voteProIds = Array.from(new Set(voteData.map((v: any) => v.professional_id)))
          const { data: voteProData } = await (supabase as any)
            .from('professionals')
            .select('id, name')
            .in('id', voteProIds)

          const voteProMap = new Map<string, string>()
          if (voteProData) {
            for (const p of voteProData) {
              voteProMap.set(p.id, p.name)
            }
          }

          setVoteHistory(voteData.map((v: any) => ({
            ...v,
            pro_name: voteProMap.get(v.professional_id) || '不明',
          })))
        }
      } catch (e) {
        console.error('[mypage] load error:', e)
      }
      setLoading(false)
    }

    load()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!loading && timerRef.current) {
      clearTimeout(timerRef.current)
    }
  }, [loading])

  async function handleRedeem(clientRewardId: string) {
    setRedeeming(true)
    setMessage('')

    const reward = rewards.find(r => r.id === clientRewardId)
    const isCoupon = reward?.reward_type === 'coupon'

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
      setMessage(isCoupon ? 'リワードを使用しました！' : 'リワードを削除しました。')
    }

    setRedeeming(false)
    setConfirmingId(null)
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setChangingPassword(true)
    setMessage('')

    if (newPassword.length < 6) {
      setMessage('エラー：パスワードは6文字以上で入力してください')
      setChangingPassword(false)
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setMessage('エラー：パスワードが一致しません')
      setChangingPassword(false)
      return
    }

    const { error: updateError } = await (supabase as any).auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      setMessage('エラー：パスワードの変更に失敗しました。')
    } else {
      setMessage('パスワードを変更しました。')
      setNewPassword('')
      setNewPasswordConfirm('')
      setShowSettings(false)
    }
    setChangingPassword(false)
  }

  if (loading) {
    if (timedOut) {
      return (
        <div className="text-center py-16 px-4">
          <p className="text-gray-500 mb-4">データの取得に問題がありました。ページを再読み込みしてください。</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-[#1A1A2E] text-white rounded-lg hover:bg-[#2a2a4e] transition text-sm"
          >
            再読み込み
          </button>
        </div>
      )
    }
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  const activeRewards = rewards.filter(r => r.status === 'active')
  const usedRewards = rewards.filter(r => r.status === 'used')

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1A1A2E]">マイページ</h1>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 text-gray-400 hover:text-[#1A1A2E] transition"
          title="設定"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* 設定パネル */}
      {showSettings && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-bold text-[#1A1A2E] mb-4">パスワード変更</h2>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none text-sm"
              placeholder="新しいパスワード（6文字以上）"
            />
            <input
              type="password"
              value={newPasswordConfirm}
              onChange={e => setNewPasswordConfirm(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none text-sm"
              placeholder="新しいパスワード（確認）"
            />
            <button
              type="submit"
              disabled={changingPassword}
              className="w-full py-2 bg-[#1A1A2E] text-white text-sm font-medium rounded-lg hover:bg-[#2a2a4e] transition disabled:opacity-50"
            >
              {changingPassword ? '変更中...' : 'パスワードを変更'}
            </button>
          </form>
        </div>
      )}

      {message && (
        <div className={`p-3 rounded-lg mb-4 text-sm ${
          message.startsWith('エラー') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
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
          リワード ({activeRewards.length})
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
          {activeRewards.length === 0 && usedRewards.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">リワードはまだありません</p>
              <p className="text-xs text-gray-300 mt-2">プロにプルーフを贈ると、リワードがもらえることがあります。</p>
            </div>
          ) : (
            <>
              {activeRewards.map(reward => {
                const isCoupon = reward.reward_type === 'coupon'
                return (
                  <div key={reward.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                    <a href={`/card/${reward.professional_id}`} className="text-sm text-gray-500 mb-1 hover:text-[#C4A35A] transition inline-block">
                      {reward.pro_name}さんからのリワード
                    </a>
                    <p className="text-xs text-[#C4A35A] mb-1">{getRewardLabel(reward.reward_type)}</p>
                    <p className="text-xl font-bold text-[#1A1A2E] mb-4">{reward.content}</p>

                    {confirmingId === reward.id ? (
                      <div className="space-y-2">
                        <p className="text-sm text-center text-orange-600 font-medium">
                          {isCoupon ? '本当に使用しますか？この操作は取り消せません。' : 'このリワードを削除しますか？'}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRedeem(reward.id)}
                            disabled={redeeming}
                            className={`flex-1 py-2 text-white font-bold rounded-lg transition disabled:opacity-50 ${
                              isCoupon ? 'bg-[#C4A35A] hover:bg-[#b3923f]' : 'bg-red-500 hover:bg-red-600'
                            }`}
                          >
                            {redeeming ? '処理中...' : isCoupon ? '使用する' : '削除する'}
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
                        className={`w-full py-3 font-medium rounded-lg transition text-sm ${
                          isCoupon
                            ? 'bg-[#1A1A2E] text-white hover:bg-[#2a2a4e]'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                      >
                        {isCoupon ? '使用する' : '削除する'}
                      </button>
                    )}
                  </div>
                )
              })}

              {usedRewards.length > 0 && (
                <div className="mt-4">
                  <h2 className="text-sm font-medium text-gray-400 mb-3">使用済み / 削除済み</h2>
                  {usedRewards.map(reward => (
                    <div key={reward.id} className="bg-gray-50 text-gray-400 rounded-xl p-4 mb-2">
                      <p className="text-xs mb-1">{reward.pro_name}さんからのリワード</p>
                      <p className="text-xs text-gray-300 mb-1">{getRewardLabel(reward.reward_type)}</p>
                      <p className="text-sm line-through">{reward.content}</p>
                      <p className="text-xs mt-1">
                        {reward.reward_type === 'coupon' ? '使用済み' : '削除済み'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
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

      {/* フッター */}
      <div className="mt-8 space-y-3 text-center">
        <a
          href="/explore"
          className="inline-block px-6 py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition"
        >
          他のプロを探す
        </a>
        {!isPro && (
          <div>
            <a
              href="/dashboard"
              className="inline-block text-sm text-[#C4A35A] hover:underline"
            >
              プロとしても登録する
            </a>
          </div>
        )}
      </div>

      {/* アカウント削除 */}
      <div className="mt-12 text-center">
        <button
          onClick={async () => {
            if (!window.confirm('本当にアカウントを削除しますか？この操作は取り消せません。')) return
            await supabase.auth.signOut()
            window.location.href = '/'
          }}
          className="text-sm text-red-400 hover:text-red-600 transition"
        >
          アカウントを削除する
        </button>
      </div>
    </div>
  )
}
