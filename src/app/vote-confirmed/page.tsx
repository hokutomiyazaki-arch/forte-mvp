'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { signOutAndClear } from '@/lib/auth-helper'
import { useAuth } from '@/contexts/AuthContext'
import { getRewardLabel, REWARD_TYPES } from '@/lib/types'
import RewardContent from '@/components/RewardContent'
import { Suspense } from 'react'
import RelatedPros from '@/components/RelatedPros'

interface RewardInfo {
  reward_type: string
  content: string
  title: string
}

// リワードタイプのアイコン
function getRewardIcon(rewardType: string): string {
  const icons: Record<string, string> = {
    coupon: '🎟️',
    secret: '🤫',
    selfcare: '🧘',
    book: '📚',
    spot: '📍',
    media: '🎬',
    surprise: '🎁',
    freeform: '✨',
  }
  return icons[rewardType] || '🎁'
}

function ConfirmedContent() {
  const searchParams = useSearchParams()
  const proId = searchParams.get('pro') || searchParams.get('proId') || ''
  const voteId = searchParams.get('vote_id') || ''
  const rewardParam = searchParams.get('reward') || ''
  const authMethodParam = searchParams.get('auth_method') || ''
  const supabase = createClient()

  const [proName, setProName] = useState('')
  const [proPrefecture, setProPrefecture] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [sessionEmail, setSessionEmail] = useState('')
  const [voterEmail, setVoterEmail] = useState('')
  const [authMethod, setAuthMethod] = useState(authMethodParam)
  const [reward, setReward] = useState<RewardInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [shareCopied, setShareCopied] = useState(false)

  // PWA インストール
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    // iOS判定
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(ios)

    // Android: beforeinstallprompt イベント
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt()
    } else if (isIOS) {
      setShowIOSGuide(true)
    }
  }

  // クエリパラメータからリワードをデコード（DB不要、RLS不要）
  function decodeRewardParam(): RewardInfo | null {
    if (!rewardParam) return null
    try {
      // base64url → base64 変換してからデコード（ブラウザ互換）
      const base64 = rewardParam.replace(/-/g, '+').replace(/_/g, '/')
      const json = decodeURIComponent(escape(atob(base64)))
      const data = JSON.parse(json)
      return {
        reward_type: data.reward_type || '',
        content: data.content || '',
        title: data.title || '',
      }
    } catch (e) {
      console.warn('[vote-confirmed] reward param decode failed:', e)
      return null
    }
  }

  const { user: authUser, isLoaded: authLoaded } = useAuth()

  useEffect(() => {
    if (!authLoaded) return

    async function load() {
      // セッション確認（AuthProviderから取得、setSessionもProvider側で済み）
      if (authUser) {
        setLoggedIn(true)
        setSessionEmail(authUser.email || '')
      }

      // プロ名・都道府県取得（publicsテーブルなのでRLS問題なし）
      if (proId) {
        const { data: proData } = await (supabase as any)
          .from('professionals')
          .select('name, prefecture')
          .eq('id', proId)
          .maybeSingle()
        if (proData) {
          setProName(proData.name)
          setProPrefecture(proData.prefecture || '')
        }
      }

      // リワード: クエリパラメータから優先取得（DB不要でモバイルでも確実）
      const paramReward = decodeRewardParam()
      if (paramReward) {
        setReward(paramReward)
        console.log('[vote-confirmed] reward loaded from query param')
      }

      // auth_method がパラメータにあればそれを使う
      if (authMethodParam) {
        setAuthMethod(authMethodParam)
      }

      // フォールバック: DBから取得（PCやパラメータなしの場合）
      if (voteId && !paramReward) {
        const { data: vote } = await (supabase as any)
          .from('votes')
          .select('voter_email, selected_reward_id, professional_id, auth_method')
          .eq('id', voteId)
          .maybeSingle()

        if (vote) {
          setVoterEmail(vote.voter_email || '')
          if (!authMethodParam) setAuthMethod(vote.auth_method || '')

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
  }, [proId, voteId, authLoaded, authUser])

  if (loading) {
    return <div className="text-center py-16 text-gray-500">読み込み中...</div>
  }

  // LINE/Google認証の場合はアカウント一致チェックをスキップ
  const isOAuthVote = authMethod === 'line' || authMethod === 'google'
  const isDifferentAccount = !isOAuthVote && loggedIn && voterEmail && sessionEmail && sessionEmail !== voterEmail

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
          {proName ? `${proName}さんにあなたの声が届きました。` : 'プルーフが正常に確認されました。'}
        </p>

        {/* リワード表示 */}
        {reward && !isDifferentAccount && (
          <div className="bg-white border-2 border-dashed border-[#C4A35A] rounded-xl p-6 mb-6 text-left">
            <p className="text-sm font-bold text-[#C4A35A] mb-4 text-center">
              こちらがリワードです
            </p>

            <div className="bg-[#FAFAF7] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{getRewardIcon(reward.reward_type)}</span>
                <span className="text-sm font-bold text-[#1A1A2E]">
                  {reward.title || getRewardLabel(reward.reward_type)}
                </span>
              </div>
              {reward.content && (
                <RewardContent
                  content={reward.content}
                  className="text-sm text-gray-700 leading-relaxed"
                />
              )}
            </div>

            {loggedIn && (
              <div className="flex items-center justify-center gap-2 text-sm text-green-600 mt-4">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>コレクションに保存しました</span>
              </div>
            )}
          </div>
        )}

        {/* 別アカウント警告 — メール認証の場合のみ表示 */}
        {reward && isDifferentAccount && (
          <div className="bg-white border-2 border-dashed border-[#C4A35A] rounded-xl p-6 mb-6">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-orange-700 font-medium mb-1">
                別のアカウントでログイン中です
              </p>
              <p className="text-xs text-orange-600">
                リワードを受け取るには {voterEmail} でログインしてください
              </p>
            </div>
            <button
              onClick={() => signOutAndClear(`/mycard?email=${encodeURIComponent(voterEmail)}`)}
              className="inline-block w-full py-3 bg-[#1A1A2E] text-white text-sm font-bold rounded-lg hover:bg-[#2a2a4e] transition"
            >
              ログアウトしてアカウントを切り替える
            </button>
          </div>
        )}

        {/* ホーム画面に追加 */}
        {loggedIn && (
          <div className="bg-white rounded-xl p-5 border border-gray-200 mb-6">
            <p className="text-sm font-bold text-[#1A1A2E] mb-1">ホーム画面に追加</p>
            <p className="text-xs text-gray-500 mb-4">
              次回からLINEログインでいつでもリワードを確認できます
            </p>

            {showIOSGuide ? (
              <div className="bg-[#FAFAF7] rounded-lg p-4 text-left text-sm text-gray-700 space-y-2">
                <p className="font-medium text-[#1A1A2E]">ホーム画面への追加方法：</p>
                <p>① 画面下の共有ボタン（□↑）をタップ</p>
                <p>② 「ホーム画面に追加」をタップ</p>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-xs text-gray-400 underline mt-2"
                >
                  閉じる
                </button>
              </div>
            ) : (
              <button
                onClick={handleInstall}
                className="w-full py-3 bg-[#1A1A2E] text-white text-sm font-bold rounded-lg hover:bg-[#2a2a4e] transition flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                ホーム画面に追加する
              </button>
            )}
          </div>
        )}

        <div className="my-6 border-t border-gray-200" />

        {/* プロのカードを見るボタン */}
        {proId && (
          <a
            href={`/card/${proId}`}
            className="block w-full py-3 text-[#1A1A2E] font-medium text-sm hover:underline transition mb-2"
          >
            {proName ? `${proName}さんのカードを見る →` : 'カードを見る →'}
          </a>
        )}

        {/* 同地域のプロ */}
        {proId && proPrefecture && (
          <>
            <div className="my-4 border-t border-gray-200" />
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
