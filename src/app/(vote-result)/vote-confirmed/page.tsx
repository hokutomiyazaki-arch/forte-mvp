'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getRewardLabel, FNT_NEURO_APPS } from '@/lib/types'
import RewardContent from '@/components/RewardContent'
import { Suspense } from 'react'
import { useProStatus } from '@/lib/useProStatus'

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
    fnt_neuro_app: '🧠',
  }
  return icons[rewardType] || '🎁'
}

function ConfirmedContent() {
  const searchParams = useSearchParams()
  const proId = searchParams.get('pro') || searchParams.get('proId') || ''
  const voteId = searchParams.get('vote_id') || ''
  const rewardParam = searchParams.get('reward') || ''
  const authMethod = searchParams.get('auth_method') || ''
  const hasAccount = searchParams.get('has_account') === 'true'
  const roleParam = searchParams.get('role')
  const supabase = createClient()
  const { isPro } = useProStatus()
  // OAuth後はClerk未認証のためisPro判定不可。URLパラメータをフォールバック
  const isProUser = isPro || roleParam === 'pro'

  const [proName, setProName] = useState('')
  const [reward, setReward] = useState<RewardInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [nearbyPros, setNearbyPros] = useState<any[]>([])

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

      // 近くのプロを取得
      if (proId) {
        const { data: votedPro } = await (supabase as any)
          .from('professionals')
          .select('prefecture')
          .eq('id', proId)
          .maybeSingle()

        if (votedPro?.prefecture) {
          const { data: nearby } = await (supabase as any)
            .from('professionals')
            .select('id, name, title, photo_url, prefecture, is_online_available')
            .eq('prefecture', votedPro.prefecture)
            .neq('id', proId)
            .eq('is_active', true)
            .limit(6)

          if (nearby && nearby.length > 0) {
            const prosWithProofs = await Promise.all(
              nearby.map(async (p: any) => {
                const { count } = await (supabase as any)
                  .from('votes')
                  .select('*', { count: 'exact', head: true })
                  .eq('professional_id', p.id)
                  .eq('status', 'confirmed')

                return {
                  ...p,
                  totalProofs: count || 0,
                }
              })
            )
            prosWithProofs.sort((a: any, b: any) => b.totalProofs - a.totalProofs)
            setNearbyPros(prosWithProofs)
          }
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
              {reward.reward_type === 'fnt_neuro_app' && reward.content ? (
                <div className="mt-4">
                  <p className="text-sm text-[#666666] mb-3">
                    トレーナーからのプレゼント：神経科学アプリを体験してみてください
                  </p>
                  <a
                    href={reward.content}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3 px-6 bg-[#C4A35A] text-[#1A1A2E] font-bold text-center rounded-lg hover:opacity-90 transition-opacity"
                  >
                    アプリを開く →
                  </a>
                  <p className="text-xs text-[#9CA3AF] mt-2 text-center">
                    {FNT_NEURO_APPS.find(app => app.url === reward.content)?.name ?? 'FNT神経科学アプリ'}
                  </p>
                </div>
              ) : reward.content ? (
                <RewardContent
                  content={reward.content}
                  className="text-lg text-[#333333] leading-relaxed"
                />
              ) : null}
            </div>
          </div>
        )}

        {/* ===== セクション2.5: アカウント登録CTA or マイカード誘導 ===== */}
        {hasAccount ? (
          <div className="bg-[#1A1A2E] rounded-2xl p-6 text-center">
            <p className="text-white text-lg font-bold mb-2">
              {isProUser ? 'ダッシュボードに戻る' : 'リワードを保存しました'}
            </p>
            <p className="text-gray-400 text-sm mb-5 leading-relaxed">
              {isProUser ? 'プロダッシュボードで投票状況を確認できます' : 'マイカードからいつでもリワードを確認できます'}
            </p>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/user/role')
                  const data = await res.json()
                  const isProResult = data.isPro || roleParam === 'pro'
                  window.location.href = isProResult ? '/dashboard' : '/mycard'
                } catch {
                  // フォールバック: URLパラメータ → useProStatus の結果
                  window.location.href = isProUser ? '/dashboard' : '/mycard'
                }
              }}
              className="block w-full py-4 rounded-xl font-bold text-lg text-[#1A1A2E] bg-[#C4A35A] hover:bg-[#b3923f] transition cursor-pointer"
            >
              {isProUser ? 'ダッシュボードを見る →' : 'マイカードを見る →'}
            </button>
          </div>
        ) : (
          <div className="bg-[#1A1A2E] rounded-2xl p-6 text-center">
            <p className="text-white text-lg font-bold mb-2">
              アカウントを作ると便利
            </p>
            <p className="text-gray-400 text-sm mb-5 leading-relaxed">
              リワードの保存・他のプロの発見が
              <br />いつでもできるようになります
            </p>

            {authMethod === 'line' ? (
              <>
                <a
                  href="/sign-up"
                  className="block w-full py-4 rounded-xl font-bold text-lg text-white transition"
                  style={{ background: '#06C755' }}
                >
                  LINEで登録する →
                </a>
                <p className="text-gray-500 text-xs mt-3">
                  さっきのLINEアカウントで、そのまま登録できます
                </p>
              </>
            ) : (
              <div className="text-center p-5 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-2xl mb-2">✉️</p>
                <p className="font-semibold text-gray-800">メールを確認してください</p>
                <p className="text-sm text-gray-500 mt-2">
                  パスワードを設定するとリワードをいつでも確認できます
                </p>
              </div>
            )}
          </div>
        )}

        {/* ===== セクション: 近くで活躍するプロ ===== */}
        {nearbyPros.length > 0 && (
          <div>
            <div className="bg-[#1A1A2E] rounded-2xl px-5 py-4 mb-4 text-center">
              <p className="text-white text-lg font-bold leading-relaxed">
                <span className="text-[#C4A35A]">{nearbyPros[0]?.prefecture}</span>
                で活躍するプロが
                <br />
                あと<span className="text-[#C4A35A] text-2xl font-black mx-1">{nearbyPros.length}</span>人います
              </p>
            </div>

            {/* 横スクロールカルーセル */}
            <div
              className="flex gap-3 overflow-x-auto pb-3 -mx-2 px-2"
              style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
            >
              {nearbyPros.map((p: any) => (
                <a
                  key={p.id}
                  href={`/card/${p.id}`}
                  className="flex-shrink-0 bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                  style={{ width: 200, scrollSnapAlign: 'start', textDecoration: 'none' }}
                >
                  {/* プロ写真+名前 */}
                  <div className="flex items-center gap-3 mb-3">
                    {p.photo_url ? (
                      <img
                        src={p.photo_url}
                        alt={p.name}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {p.name?.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#1A1A2E] truncate">{p.name}</div>
                      <div className="text-xs text-[#C4A35A] truncate">{p.title || ''}</div>
                    </div>
                  </div>

                  {/* プルーフ数 */}
                  {p.totalProofs > 0 && (
                    <div className="bg-[#C4A35A]/10 border border-[#C4A35A]/20 rounded-lg px-3 py-2 mb-2">
                      <span className="text-xs font-bold text-[#1A1A2E]">
                        {p.totalProofs} proofs
                      </span>
                    </div>
                  )}

                  {/* エリア */}
                  <div className="text-xs text-gray-500">
                    {p.prefecture}
                    {p.is_online_available && (
                      <span className="ml-1 text-[#C4A35A] font-bold">● オンライン可</span>
                    )}
                  </div>
                </a>
              ))}
            </div>

            {/* もっと見る */}
            <a
              href="/search"
              className="block text-center text-base text-[#C4A35A] font-bold mt-2"
            >
              プロをもっと見る →
            </a>
          </div>
        )}

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
