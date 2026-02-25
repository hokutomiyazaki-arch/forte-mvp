'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getRewardLabel } from '@/lib/types'
import RewardContent from '@/components/RewardContent'
import { Suspense } from 'react'

interface RewardInfo {
  reward_type: string
  content: string
  title: string
}

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
  const supabase = createClient()

  const [proName, setProName] = useState('')
  const [reward, setReward] = useState<RewardInfo | null>(null)
  const [loading, setLoading] = useState(true)

  // PWA インストール
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
  const [isLineBrowser, setIsLineBrowser] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream)
    setIsAndroid(/Android/.test(ua))
    setIsLineBrowser(/\bLine\//i.test(ua))

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
    }
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
    } catch (e) {
      console.warn('[vote-confirmed] reward param decode failed:', e)
      return null
    }
  }

  useEffect(() => {
    async function load() {
      // プロ名取得（RLS問題なし）
      if (proId) {
        const { data: proData } = await (supabase as any)
          .from('professionals')
          .select('name')
          .eq('id', proId)
          .maybeSingle()
        if (proData) {
          setProName(proData.name || '')
        }
      }

      // リワード: クエリパラメータから優先取得
      const paramReward = decodeRewardParam()
      if (paramReward) {
        setReward(paramReward)
      }

      // フォールバック: DBから取得
      if (voteId && !paramReward) {
        const { data: vote } = await (supabase as any)
          .from('votes')
          .select('selected_reward_id')
          .eq('id', voteId)
          .maybeSingle()

        if (vote?.selected_reward_id) {
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

      setLoading(false)
    }
    load()
  }, [proId, voteId])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAF7]">
        <div className="w-20 h-20 rounded-full bg-[#C4A35A]/10 flex items-center justify-center mx-auto mb-6">
          <div className="animate-spin w-10 h-10 border-4 border-[#C4A35A] border-t-transparent rounded-full" />
        </div>
        <p className="text-lg text-[#666666]">読み込み中...</p>
      </div>
    )
  }

  // モバイル判定（ホーム画面追加セクションの表示制御用）
  const isMobile = isIOS || isAndroid || !!installPrompt

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      {/* ヘッダー: シンプルにロゴだけ */}
      <div className="bg-[#1A1A2E] py-4 px-6">
        <span className="text-white text-xl font-bold tracking-widest">
          REALPROOF
        </span>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-8">

        {/* ===== セクション1: 投票完了 ===== */}
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[#C4A35A]/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-[#C4A35A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">
            プルーフが確定しました！
          </h1>
          <p className="text-lg text-[#666666]">
            {proName ? `${proName}さんにあなたの声が届きました。` : 'プルーフが正常に確認されました。'}
          </p>
        </div>

        {/* ===== セクション2: リワード ===== */}
        {reward && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#C4A35A]/25 overflow-hidden">
            <div className="bg-[#C4A35A]/10 px-6 py-4 border-b border-[#C4A35A]/20">
              <p className="text-xl font-bold text-[#C4A35A] text-center">
                🎁 こちらがリワードです
              </p>
            </div>
            <div className="px-6 py-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{getRewardIcon(reward.reward_type)}</span>
                <p className="text-lg font-bold text-[#1A1A2E]">
                  {reward.title || getRewardLabel(reward.reward_type)}
                </p>
              </div>
              {reward.content && (
                <RewardContent
                  content={reward.content}
                  className="text-lg text-[#333333] leading-relaxed"
                />
              )}
            </div>
          </div>
        )}

        {/* ===== セクション3: 今後のリワードの見方 ===== */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-xl font-bold text-[#1A1A2E] mb-4 text-center">
            📱 リワードをまた見るには
          </h2>

          <div className="space-y-4">
            {/* ステップ1: ブックマーク */}
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-[#C4A35A] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-lg">1</span>
              </div>
              <div>
                <p className="text-lg font-bold text-[#1A1A2E]">
                  このページをブックマーク
                </p>
                <p className="text-base text-[#666666] mt-1 leading-relaxed">
                  今見ているこのページを保存しておけば、
                  いつでもリワードを確認できます。
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* ステップ2: ホーム画面追加 */}
            {isMobile && (
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-[#C4A35A] flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-lg">2</span>
                </div>
                <div>
                  <p className="text-lg font-bold text-[#1A1A2E]">
                    ホーム画面に追加すると便利
                  </p>
                  <p className="text-base text-[#666666] mt-1 leading-relaxed">
                    ホーム画面に追加すれば、
                    アプリのようにすぐ開けます。
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* LINE内ブラウザ: Safariで開く案内 */}
          {isLineBrowser && isIOS && (
            <div className="mt-6 p-5 rounded-xl bg-[#F5F5F0] space-y-4">
              <p className="text-lg font-bold text-center text-[#1A1A2E]">
                Safariで開く方法
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-[#1A1A2E] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">①</span>
                  </div>
                  <p className="text-lg text-[#1A1A2E]">
                    右下の <span className="inline-block mx-1 px-2 py-1 bg-white rounded border text-xl">···</span> メニューをタップ
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-[#1A1A2E] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">②</span>
                  </div>
                  <p className="text-lg text-[#1A1A2E]">
                    「Safariで開く」をタップ
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* iOS（Safari）: ホーム画面追加の手順 */}
          {isIOS && !isLineBrowser && (
            <div className="mt-6 p-5 rounded-xl bg-[#F5F5F0] space-y-4">
              <p className="text-lg font-bold text-center text-[#1A1A2E]">
                ホーム画面への追加方法
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-[#1A1A2E] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">①</span>
                  </div>
                  <p className="text-lg text-[#1A1A2E]">
                    画面下の <span className="inline-block mx-1 px-2 py-1 bg-white rounded border text-xl">⬆️</span> をタップ
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-[#1A1A2E] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">②</span>
                  </div>
                  <p className="text-lg text-[#1A1A2E]">
                    「ホーム画面に追加」をタップ
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-[#1A1A2E] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">③</span>
                  </div>
                  <p className="text-lg text-[#1A1A2E]">
                    右上の「追加」をタップ
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Android: インストールボタン */}
          {(isAndroid || installPrompt) && !isIOS && (
            <button
              onClick={handleInstall}
              className="mt-6 w-full py-4 rounded-xl font-bold text-lg text-white bg-[#1A1A2E]"
            >
              📲 ホーム画面に追加する
            </button>
          )}
        </div>

        {/* ===== セクション4: ログイン方法の案内 ===== */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-xl font-bold text-[#1A1A2E] mb-4 text-center">
            🔑 次回のログイン方法
          </h2>
          <div className="space-y-3">
            <p className="text-lg text-[#333333] text-center leading-relaxed">
              次回 REALPROOF にアクセスした時は、
              <br />
              <span className="font-bold text-[#06C755]">「LINEでログイン」</span>
              を押すだけ。
            </p>
            <p className="text-lg text-[#333333] text-center leading-relaxed">
              パスワードは不要です。
            </p>
          </div>

          <div className="mt-4 py-4 px-6 bg-[#F5F5F0] rounded-xl text-center">
            <p className="text-base text-[#666666] mb-1">アクセス先</p>
            <p className="text-2xl font-bold text-[#1A1A2E] tracking-wide">
              realproof.jp
            </p>
          </div>
        </div>

        {/* ===== セクション5: プロのカード ===== */}
        <div className="text-center space-y-4 pb-8">
          {proId && (
            <a
              href={`/card/${proId}`}
              className="block w-full py-4 rounded-xl font-bold text-lg border-2 border-[#1A1A2E] text-[#1A1A2E]"
            >
              {proName ? `${proName}さんのカードを見る →` : 'カードを見る →'}
            </a>
          )}
          <a
            href="/search"
            className="block text-lg text-[#666666] underline"
          >
            他のプロを探す
          </a>
        </div>
      </div>
    </div>
  )
}

export default function VoteConfirmedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAF7]">
        <div className="w-20 h-20 rounded-full bg-[#C4A35A]/10 flex items-center justify-center mx-auto mb-6">
          <div className="animate-spin w-10 h-10 border-4 border-[#C4A35A] border-t-transparent rounded-full" />
        </div>
        <p className="text-lg text-[#666666]">読み込み中...</p>
      </div>
    }>
      <ConfirmedContent />
    </Suspense>
  )
}
