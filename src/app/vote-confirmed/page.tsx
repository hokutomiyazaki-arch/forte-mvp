'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getSessionSafe } from '@/lib/auth-helper'
import { getRewardLabel } from '@/lib/types'
import { Suspense } from 'react'
import RelatedPros from '@/components/RelatedPros'

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
  const [proPrefecture, setProPrefecture] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [sessionEmail, setSessionEmail] = useState('')
  const [voterEmail, setVoterEmail] = useState('')
  const [reward, setReward] = useState<RewardInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [shareCopied, setShareCopied] = useState(false)

  useEffect(() => {
    async function load() {
      console.log('[vote-confirmed] load start, proId:', proId, 'voteId:', voteId)

      // セッション確認
      const { session, user: sessionUser } = await getSessionSafe()
      console.log('[vote-confirmed] session:', sessionUser?.email || 'none')
      if (sessionUser) {
        setLoggedIn(true)
        setSessionEmail(sessionUser.email || '')
      }

      // プロ名・都道府県取得
      if (proId) {
        const { data: proData, error: proError } = await (supabase as any)
          .from('professionals')
          .select('name, prefecture')
          .eq('id', proId)
          .maybeSingle()
        console.log('[vote-confirmed] pro fetch:', { proData, proError: proError?.message })
        if (proData) {
          setProName(proData.name)
          setProPrefecture(proData.prefecture || '')
        }
      }

      // vote_id ベースでDBからリワード情報を取得
      if (voteId) {
        // 投票データ取得
        const { data: vote, error: voteError } = await (supabase as any)
          .from('votes')
          .select('voter_email, selected_reward_id, professional_id')
          .eq('id', voteId)
          .maybeSingle()

        console.log('[vote-confirmed] vote fetch:', { vote, voteError: voteError?.message })

        if (vote) {
          setVoterEmail(vote.voter_email || '')

          // リワード取得
          if (vote.selected_reward_id) {
            const { data: rewardData, error: rewardError } = await (supabase as any)
              .from('rewards')
              .select('reward_type, content, title')
              .eq('id', vote.selected_reward_id)
              .maybeSingle()

            console.log('[vote-confirmed] reward fetch:', { rewardData, rewardError: rewardError?.message })

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

      console.log('[vote-confirmed] load complete')
      setLoading(false)
    }
    load()
  }, [proId, voteId])

  if (loading) {
    return <div className="text-center py-16 text-gray-500">読み込み中...</div>
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <div className="max-w-md mx-auto text-center py-12 px-4">
        {/* 確定メッセージ */}
        <div className="w-16 h-16 rounded-full bg-[#C4A35A]/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#C4A35A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold text-[#1A1A2E] mb-2">プルーフが確定しました！</h1>
        <p className="text-gray-600 mb-6">
          {proName ? `${proName}さんにあなたのプルーフが届きました。` : 'プルーフが正常に確認されました。'}
        </p>

        {/* リワード表示 — 種類ラベルのみ。内容はマイページでのみ確認可能 */}
        {reward && (() => {
          const isDifferentAccount = loggedIn && voterEmail && sessionEmail && sessionEmail !== voterEmail
          return (
            <div className="bg-white border-2 border-dashed border-[#C4A35A] rounded-xl p-6 mb-6">
              {isDifferentAccount ? (
                <>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-orange-700 font-medium mb-1">
                      別のアカウントでログイン中です
                    </p>
                    <p className="text-xs text-orange-600">
                      リワードを受け取るには {voterEmail} でログインしてください
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      try { await (supabase as any).auth.signOut({ scope: 'local' }) } catch (e) { console.error('signOut error:', e) }
                      try {
                        Object.keys(localStorage).forEach(key => { if (key.startsWith('sb-') || key.includes('supabase')) localStorage.removeItem(key) })
                        Object.keys(sessionStorage).forEach(key => { if (key.startsWith('sb-') || key.includes('supabase')) sessionStorage.removeItem(key) })
                      } catch (e) { console.error('storage clear error:', e) }
                      window.location.href = `/mycard?email=${encodeURIComponent(voterEmail)}`
                    }}
                    className="inline-block w-full py-3 bg-[#1A1A2E] text-white text-sm font-bold rounded-lg hover:bg-[#2a2a4e] transition"
                  >
                    ログアウトしてアカウントを切り替える
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-[#C4A35A] font-semibold mb-2">
                    {reward.title || getRewardLabel(reward.reward_type)}
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    リワードの中身はリワードタブで確認できます
                  </p>
                  {loggedIn ? (
                    <>
                      <div className="flex items-center justify-center gap-2 text-sm text-green-600 mb-4">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>コレクションに保存しました</span>
                      </div>
                      <a
                        href="/mycard"
                        className="inline-block w-full py-3 bg-[#C4A35A] text-white text-sm font-bold rounded-lg hover:bg-[#b3923f] transition"
                      >
                        リワードで確認する
                      </a>
                    </>
                  ) : (
                    <>
                      <a
                        href={`/mycard${voterEmail ? '?email=' + encodeURIComponent(voterEmail) : ''}`}
                        className="inline-block w-full py-3 bg-[#C4A35A] text-white text-sm font-bold rounded-lg hover:bg-[#b3923f] transition"
                      >
                        アカウント登録してリワードを受け取る
                      </a>
                      <p className="text-xs text-gray-400 mt-2">アカウント登録してコレクションに保存できます</p>
                    </>
                  )}
                </>
              )}
            </div>
          )
        })()}

        {/* プロのカードを見るボタン */}
        {proId && (
          <a
            href={`/card/${proId}`}
            className="block w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition mb-3"
          >
            {proName ? `${proName}さんのカードを見る` : 'カードを見る'}
          </a>
        )}

        {/* 同地域のプロ */}
        {proId && proPrefecture && (
          <>
            <div className="my-6 border-t border-gray-200" />
            <div className="text-left">
              <RelatedPros currentProId={proId} prefecture={proPrefecture} maxDisplay={3} />
            </div>
          </>
        )}

        {/* 紹介リンク */}
        {proId && (
          <>
            <div className="my-6 border-t border-gray-200" />
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-sm font-bold text-[#1A1A2E] mb-2">
                このプロを友だちに紹介する
              </p>
              <p className="text-xs text-gray-500 mb-4">
                あなたの紹介で信頼がつながります
              </p>
              <button
                onClick={async () => {
                  const url = `${window.location.origin}/card/${proId}`
                  if (navigator.share) {
                    try {
                      await navigator.share({ title: `${proName || 'プロ'}のカード`, url })
                    } catch { /* cancelled */ }
                  } else {
                    await navigator.clipboard.writeText(url)
                    setShareCopied(true)
                    setTimeout(() => setShareCopied(false), 2000)
                  }
                }}
                className="w-full py-3 bg-[#C4A35A] text-white text-sm font-bold rounded-lg hover:bg-[#b3923f] transition"
              >
                {shareCopied ? 'コピーしました！' : 'リンクをシェア'}
              </button>
            </div>
          </>
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
