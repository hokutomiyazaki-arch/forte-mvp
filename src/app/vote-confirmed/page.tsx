'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getRewardLabel } from '@/lib/types'
import { Suspense } from 'react'

interface RewardInfo {
  reward_type: string
  content: string
  title: string
}

function ConfirmedContent() {
  const searchParams = useSearchParams()
  const proId = searchParams.get('pro') || ''
  const voteId = searchParams.get('vote_id') || ''
  const supabase = createClient()

  const [proName, setProName] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [voterEmail, setVoterEmail] = useState('')
  const [reward, setReward] = useState<RewardInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // セッション確認
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setLoggedIn(true)
      }

      // プロ名取得
      if (proId) {
        const { data: proData } = await (supabase as any)
          .from('professionals')
          .select('name')
          .eq('id', proId)
          .maybeSingle()
        if (proData) setProName(proData.name)
      }

      // vote_id ベースでDBからリワード情報を取得
      if (voteId) {
        // 投票データ取得
        const { data: vote } = await (supabase as any)
          .from('votes')
          .select('voter_email, selected_reward_id, professional_id')
          .eq('id', voteId)
          .maybeSingle()

        if (vote) {
          setVoterEmail(vote.voter_email || '')

          // リワード取得
          if (vote.selected_reward_id) {
            const { data: rewardData } = await (supabase as any)
              .from('rewards')
              .select('reward_type, content, title')
              .eq('id', vote.selected_reward_id)
              .maybeSingle()

            if (rewardData) {
              setReward({
                reward_type: rewardData.reward_type || '',
                content: rewardData.content || '',
                title: rewardData.title || '',
              })
            }
          }
        }
      }

      setLoading(false)
    }
    load()
  }, [proId, voteId])

  if (loading) {
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  // リワードの表示名を決定
  const rewardDisplayName = reward
    ? (reward.title || getRewardLabel(reward.reward_type))
    : ''

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <div className="max-w-md mx-auto text-center py-12 px-4">
        {/* 確定メッセージ */}
        <div className="w-16 h-16 rounded-full bg-[#C4A35A]/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#C4A35A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">プルーフが確定しました！</h1>
        <p className="text-gray-500 mb-6">
          {proName ? `${proName}さんにあなたのプルーフが届きました。` : 'プルーフが正常に確認されました。'}
        </p>

        {/* リワード表示 */}
        {reward && (
          <div className="bg-white border-2 border-dashed border-[#C4A35A] rounded-xl p-6 mb-6">
            <p className="text-xs text-[#C4A35A] font-medium mb-1">
              {getRewardLabel(reward.reward_type)}
            </p>
            {reward.title && (
              <p className="text-sm text-gray-500 mb-2">{reward.title}</p>
            )}

            {/* クーポンは即表示、それ以外はログイン後に表示 */}
            {reward.reward_type === 'coupon' ? (
              <p className="text-lg font-semibold text-[#1A1A2E] mb-4">
                {reward.content}
              </p>
            ) : loggedIn ? (
              <p className="text-lg font-semibold text-[#1A1A2E] mb-4">
                {reward.content}
              </p>
            ) : (
              <p className="text-sm text-gray-500 mb-4">
                アカウント登録後にリワードの中身を確認できます
              </p>
            )}

            {loggedIn ? (
              <>
                <div className="flex items-center justify-center gap-2 text-sm text-green-600 mb-4">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>リワードをコレクションに保存しました</span>
                </div>
                <a
                  href="/mycard"
                  className="inline-block w-full py-3 bg-[#C4A35A] text-white text-sm font-bold rounded-lg hover:bg-[#b3923f] transition"
                >
                  マイカードを見る
                </a>
              </>
            ) : (
              <>
                <a
                  href={`/login?role=client&redirect=/mycard&email=${encodeURIComponent(voterEmail)}`}
                  className="inline-block w-full py-3 bg-[#C4A35A] text-white text-sm font-bold rounded-lg hover:bg-[#b3923f] transition"
                >
                  リワードをコレクションする
                </a>
                <p className="text-xs text-gray-400 mt-2">パスワードを設定するだけ</p>
              </>
            )}
          </div>
        )}

        {/* プロのカードを見るボタン */}
        {proId && (
          <a
            href={`/card/${proId}`}
            className="block w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition mb-3"
          >
            {proName ? `${proName}さんのカードを見る` : 'カードを見る'}
          </a>
        )}
      </div>
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
