'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getRewardLabel } from '@/lib/types'
import RewardContent from '@/components/RewardContent'
import { Suspense } from 'react'
import RelatedPros from '@/components/RelatedPros'

interface RewardInfo {
  reward_type: string
  content: string
  title: string
}

function getRewardIcon(rewardType: string): string {
  const icons: Record<string, string> = {
    coupon: '🎟️', secret: '🤫', selfcare: '🧘', book: '📚',
    spot: '📍', media: '🎬', surprise: '🎁', freeform: '✨',
  }
  return icons[rewardType] || '🎁'
}

type Phase = 'processing' | 'confirmed'

function VoteProcessingContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const token = searchParams.get('token') || ''
  const proId = searchParams.get('pro') || ''
  const voteId = searchParams.get('vote_id') || ''
  const rewardParam = searchParams.get('reward') || ''
  const authMethodParam = searchParams.get('auth_method') || 'line'

  const supabase = createClient() as any

  const [phase, setPhase] = useState<Phase>('processing')
  const [proName, setProName] = useState('')
  const [proPrefecture, setProPrefecture] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [reward, setReward] = useState<RewardInfo | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  // PWA
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(ios)
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (installPrompt) installPrompt.prompt()
    else if (isIOS) setShowIOSGuide(true)
  }

  function decodeRewardParam(): RewardInfo | null {
    if (!rewardParam) return null
    try {
      const base64 = rewardParam.replace(/-/g, '+').replace(/_/g, '/')
      const json = decodeURIComponent(escape(atob(base64)))
      const data = JSON.parse(json)
      return {
        reward_type: data.reward_type || '',
        content: data.content || '',
        title: data.title || '',
      }
    } catch {
      return null
    }
  }

  useEffect(() => {
    async function process() {
      // 1. リワードを即座にデコード（DB不要）
      const r = decodeRewardParam()
      if (r) setReward(r)

      // 2. セッション作成（バックグラウンド）
      if (email && token) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email, password: token,
          })
          if (!error && data?.session) {
            setLoggedIn(true)
            console.log('[vote-processing] session created')
          } else {
            console.warn('[vote-processing] signIn failed:', error?.message)
          }
        } catch (e) {
          console.warn('[vote-processing] session creation failed:', e)
        }
      }

      // 3. プロ情報取得
      if (proId) {
        try {
          const { data: proData } = await supabase
            .from('professionals')
            .select('name, prefecture')
            .eq('id', proId)
            .maybeSingle()
          if (proData) {
            setProName(proData.name || '')
            setProPrefecture(proData.prefecture || '')
          }
        } catch {}
      }

      // 4. URLからセンシティブなパラメータを消す
      window.history.replaceState(null, '', `/vote-processing?pro=${proId}&vote_id=${voteId}`)

      // 5. 確認画面に遷移
      setPhase('confirmed')
    }
    process()
  }, [])

  // ========== 処理中フェーズ ==========
  if (phase === 'processing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAF7] px-6">
        <div className="max-w-sm w-full text-center">
          <div className="w-20 h-20 rounded-full bg-[#C4A35A]/10 flex items-center justify-center mx-auto mb-6">
            <div className="animate-spin w-10 h-10 border-4 border-[#C4A35A] border-t-transparent rounded-full"></div>
          </div>
          <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">投票を処理中...</h1>
          <p className="text-sm text-gray-500">少々お待ちください</p>
        </div>
      </div>
    )
  }

  // ========== 確認済みフェーズ ==========
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
        {reward && (
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

export default function VoteProcessingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAF7] px-6">
        <div className="max-w-sm w-full text-center">
          <div className="w-20 h-20 rounded-full bg-[#C4A35A]/10 flex items-center justify-center mx-auto mb-6">
            <div className="animate-spin w-10 h-10 border-4 border-[#C4A35A] border-t-transparent rounded-full"></div>
          </div>
          <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">投票を処理中...</h1>
          <p className="text-sm text-gray-500">少々お待ちください</p>
        </div>
      </div>
    }>
      <VoteProcessingContent />
    </Suspense>
  )
}
