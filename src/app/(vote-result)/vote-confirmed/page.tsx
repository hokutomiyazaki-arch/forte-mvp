'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import RewardReveal from '@/components/RewardReveal'
import { Suspense } from 'react'
import { useProStatus } from '@/lib/useProStatus'
import { getRewardLabel } from '@/lib/types'

interface RewardInfo {
  reward_type: string
  content: string
  title: string
}

interface AvailableReward {
  id: string
  reward_type: string
  title: string
  content: string
}

function ConfirmedContent() {
  const searchParams = useSearchParams()
  const proId = searchParams.get('pro') || searchParams.get('proId') || ''
  const voteId = searchParams.get('vote_id') || ''
  const rewardParam = searchParams.get('reward') || ''
  const hasAccount = searchParams.get('has_account') === 'true'
  const roleParam = searchParams.get('role')
  const rid = searchParams.get('rid') || ''
  const supabase = createClient()
  const { isPro } = useProStatus()
  // OAuth後はClerk未認証のためisPro判定不可。URLパラメータをフォールバック
  const isProUser = isPro || roleParam === 'pro'

  const [proName, setProName] = useState('')
  const [reward, setReward] = useState<RewardInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [nearbyPros, setNearbyPros] = useState<any[]>([])
  const [currentRid, setCurrentRid] = useState(rid)
  const [copyToast, setCopyToast] = useState('')

  // リワード選択フェーズ: 'selecting' = 選択中, 'revealed' = 選択済み表示, 'none' = リワードなし
  const [rewardPhase, setRewardPhase] = useState<'selecting' | 'revealed' | 'none'>('none')
  const [proRewards, setProRewards] = useState<AvailableReward[]>([])
  const [claimingReward, setClaimingReward] = useState(false)

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

  // シェア: プロを友達に紹介
  const handleShare = async () => {
    const shareData = {
      title: `${proName} | REALPROOF`,
      text: `${proName}さん、おすすめです！`,
      url: `${window.location.origin}/card/${proId}`
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err)
        }
      }
    } else {
      await navigator.clipboard.writeText(shareData.url)
      setCopyToast('URLをコピーしました')
      setTimeout(() => setCopyToast(''), 3000)
    }
  }

  // シェア: リワードページを保存
  const handleSaveReward = async () => {
    const url = currentRid
      ? `${window.location.origin}/vote-confirmed?pro=${proId}&rid=${currentRid}`
      : window.location.href
    const shareData = {
      title: `${proName}さんからのリワード | REALPROOF`,
      text: `${proName}さんからのリワード`,
      url,
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err)
        }
      }
    } else {
      await navigator.clipboard.writeText(shareData.url)
      setCopyToast('URLをコピーしました')
      setTimeout(() => setCopyToast(''), 3000)
    }
  }

  // リワード選択ハンドラ
  const handleRewardSelect = async (rewardId: string) => {
    if (!voteId || claimingReward) return
    setClaimingReward(true)

    try {
      // 投票レコードからvoter_emailを取得
      const { data: voteRecord } = await (supabase as any)
        .from('votes')
        .select('voter_email')
        .eq('id', voteId)
        .maybeSingle()

      // client_rewards INSERT
      const { data: crData } = await (supabase as any)
        .from('client_rewards')
        .insert({
          vote_id: voteId,
          reward_id: rewardId,
          professional_id: proId,
          client_email: voteRecord?.voter_email || '',
          status: 'active',
        })
        .select('id')
        .maybeSingle()

      // votes.selected_reward_id を UPDATE
      await (supabase as any)
        .from('votes')
        .update({ selected_reward_id: rewardId })
        .eq('id', voteId)

      // 選択したリワードの内容をセット
      const selectedReward = proRewards.find(r => r.id === rewardId)
      if (selectedReward) {
        setReward({
          reward_type: selectedReward.reward_type,
          content: selectedReward.content || '',
          title: selectedReward.title || '',
        })
      }

      if (crData?.id) {
        setCurrentRid(crData.id)
        // URLにridを追加（ブックマーク可能に）
        const url = new URL(window.location.href)
        url.searchParams.set('rid', crData.id)
        window.history.replaceState({}, '', url.toString())
      }

      setRewardPhase('revealed')
    } catch (err) {
      console.error('[vote-confirmed] reward claim error:', err)
    }
    setClaimingReward(false)
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
            .is('deactivated_at', null)
            .limit(6)

          if (nearby && nearby.length > 0) {
            const proIds = nearby.map((p: any) => p.id)

            // vote_summary + proof_items を一括取得（検索ページと同じパターン）
            const [voteRes, proofRes] = await Promise.all([
              (supabase as any)
                .from('vote_summary')
                .select('professional_id, proof_id, vote_count')
                .in('professional_id', proIds)
                .order('vote_count', { ascending: false }),
              (supabase as any)
                .from('proof_items')
                .select('id, label'),
            ])

            // ラベルマップ
            const labelMap = new Map<string, string>()
            if (proofRes.data) {
              for (const pi of proofRes.data) labelMap.set(pi.id, pi.label)
            }

            // プロごとのトップ1プルーフ + 合計票数
            const topProofMap = new Map<string, { label: string; count: number }>()
            const totalMap = new Map<string, number>()
            if (voteRes.data) {
              for (const v of voteRes.data) {
                totalMap.set(v.professional_id, (totalMap.get(v.professional_id) || 0) + v.vote_count)
                if (!topProofMap.has(v.professional_id)) {
                  const label = labelMap.get(v.proof_id)
                  if (label) {
                    topProofMap.set(v.professional_id, { label, count: v.vote_count })
                  }
                }
              }
            }

            const prosWithProofs = nearby.map((p: any) => ({
              ...p,
              totalProofs: totalMap.get(p.id) || 0,
              topProof: topProofMap.get(p.id) || null,
            }))
            prosWithProofs.sort((a: any, b: any) => b.totalProofs - a.totalProofs)
            setNearbyPros(prosWithProofs)
          }
        }
      }

      // ── リワード処理 ──
      let rewardFound = false

      // 1. ridパラメータがあればAPIから取得（既に選択済みの場合）
      if (rid) {
        try {
          const res = await fetch(`/api/reward/${rid}`)
          if (res.ok) {
            const data = await res.json()
            setReward({
              reward_type: data.reward_type || '',
              content: data.content || '',
              title: data.title || '',
            })
            if (data.proName && !proId) {
              setProName(data.proName)
            }
            setCurrentRid(rid)
            setRewardPhase('revealed')
            rewardFound = true
          }
        } catch (err) {
          console.error('[vote-confirmed] rid fetch failed:', err)
        }
      }

      // 2. フォールバック: クエリパラメータから取得
      if (!rewardFound && !rid) {
        const paramReward = decodeRewardParam()
        if (paramReward) {
          setReward(paramReward)
          setRewardPhase('revealed')
          rewardFound = true
        }

        // 3. フォールバック: DBから既存client_rewardsを確認
        if (voteId && !paramReward) {
          const { data: crData } = await (supabase as any)
            .from('client_rewards')
            .select('id, reward_id')
            .eq('vote_id', voteId)
            .maybeSingle()

          if (crData) {
            setCurrentRid(crData.id)
            // URLにridを追加（ブックマーク可能に）
            const url = new URL(window.location.href)
            url.searchParams.set('rid', crData.id)
            window.history.replaceState({}, '', url.toString())

            const { data: rewardData } = await (supabase as any)
              .from('rewards')
              .select('reward_type, content, title')
              .eq('id', crData.reward_id)
              .maybeSingle()

            if (rewardData) {
              setReward({
                reward_type: rewardData.reward_type || '',
                content: rewardData.content || '',
                title: rewardData.title || '',
              })
            }
            setRewardPhase('revealed')
            rewardFound = true
          }
        }
      }

      // 4. リワードが未選択の場合: プロの利用可能リワードを取得して選択UIを表示
      if (!rewardFound && proId) {
        const { data: availableRewards } = await (supabase as any)
          .from('rewards')
          .select('id, reward_type, title, content')
          .eq('professional_id', proId)
          .order('sort_order')

        if (availableRewards && availableRewards.length > 0) {
          setProRewards(availableRewards)
          setRewardPhase('selecting')
        } else {
          setRewardPhase('none')
        }
      }

      setLoading(false)
    }
    load()
  }, [proId, voteId, rid])

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
    <div className="min-h-screen bg-[#FAFAF7]" style={{ overflowX: 'hidden' }}>
      {/* コピートースト */}
      {copyToast && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1A1A2E', color: '#fff', padding: '10px 24px',
          borderRadius: 8, fontSize: 14, fontWeight: 600, zIndex: 9999,
        }}>
          {copyToast}
        </div>
      )}

      {/* ヘッダー: シンプルにロゴだけ */}
      <div className="bg-[#1A1A2E] py-4 px-6">
        <span className="text-white text-xl font-bold tracking-widest">
          REALPROOF
        </span>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8 space-y-8">

        {/* ===== セクション1: 完了メッセージ ===== */}
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[#C4A35A]/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-[#C4A35A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">
            完了しました！ありがとうございます。
          </h1>
          <p className="text-lg text-[#666666]">
            {proName ? `${proName}さんにあなたの声が届きました。` : 'あなたの声が届きました。'}
          </p>
        </div>

        {/* ===== セクション2: リワード選択（未選択の場合） ===== */}
        {rewardPhase === 'selecting' && proRewards.length > 0 && (
          <div className="text-center">
            <p className="text-lg font-bold text-[#1A1A2E] mb-6">
              {proName ? `${proName}さんからお礼が届いています` : 'お礼が届いています'} 🎁
            </p>
            <div className="space-y-3 mb-4">
              {proRewards.map(r => {
                const displayLabel = r.reward_type === 'surprise'
                  ? 'シークレット — 何が出るかお楽しみ！'
                  : r.title && (r.reward_type === 'selfcare' || r.reward_type === 'freeform')
                    ? r.title
                    : getRewardLabel(r.reward_type)
                return (
                  <button
                    key={r.id}
                    onClick={() => handleRewardSelect(r.id)}
                    disabled={claimingReward}
                    className="block w-full text-left"
                    style={{
                      padding: '16px 20px',
                      borderRadius: 14,
                      background: '#fff',
                      border: '1.5px solid rgba(196,163,90,0.25)',
                      cursor: claimingReward ? 'wait' : 'pointer',
                      opacity: claimingReward ? 0.6 : 1,
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div style={{ color: '#1A1A2E', fontWeight: 600, fontSize: 15 }}>
                          {displayLabel}
                        </div>
                        <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                          タップして受け取る
                        </div>
                      </div>
                      <span style={{ color: '#C4A35A', fontSize: 20, flexShrink: 0 }}>→</span>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-gray-400">
              ※ リワードの受け取りは任意です。
            </p>
          </div>
        )}

        {/* ===== セクション2: リワード表示（選択済みの場合） ===== */}
        {rewardPhase === 'revealed' && reward && (
          <>
            <RewardReveal reward={reward} proName={proName || ''} />

            {/* リワード保存導線 */}
            {currentRid && (
              <div className="text-center space-y-2">
                <p className="text-xs text-gray-400">
                  このページをブックマークすると、いつでもリワードを確認できます
                </p>
                <button
                  onClick={handleSaveReward}
                  className="text-sm text-[#C4A35A] font-medium hover:underline"
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  リワードページを保存する
                </button>
              </div>
            )}
          </>
        )}

        {/* ===== セクション2.5: リワード受け取り確認 ===== */}
        {hasAccount && (
          <div className="bg-[#1A1A2E] rounded-2xl p-6 text-center">
            <p className="text-white text-lg font-bold mb-2">
              {isProUser ? 'ダッシュボードに戻る' : 'ありがとうございました'}
            </p>
            {isProUser && (
              <p className="text-gray-400 text-sm mb-5 leading-relaxed">
                プロダッシュボードで状況を確認できます
              </p>
            )}
            {isProUser ? (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/user/role')
                    const data = await res.json()
                    const isProResult = data.isPro || roleParam === 'pro'
                    window.location.href = isProResult ? '/dashboard' : '/mycard'
                  } catch {
                    window.location.href = isProUser ? '/dashboard' : '/mycard'
                  }
                }}
                className="block w-full py-4 rounded-xl font-bold text-lg text-[#1A1A2E] bg-[#C4A35A] hover:bg-[#b3923f] transition cursor-pointer"
              >
                ダッシュボードを見る →
              </button>
            ) : (
              <>
                {proId && (
                  <a
                    href={`/card/${proId}`}
                    className="block w-full py-4 rounded-xl font-bold text-lg text-[#1A1A2E] bg-[#C4A35A] hover:bg-[#b3923f] transition mb-3"
                  >
                    {proName ? `${proName}さんのプロフィールを見る →` : 'プロフィールを見る →'}
                  </a>
                )}
                {proId && (
                  <button
                    onClick={handleShare}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#C4A35A',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '8px 0',
                    }}
                  >
                    このプロを友達に紹介する
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ===== プロフィール導線 + シェア（未ログインユーザー向け） ===== */}
        {!hasAccount && proId && (
          <div className="text-center space-y-3">
            <a
              href={`/card/${proId}`}
              className="block w-full py-4 rounded-xl font-bold text-lg border-2 border-[#1A1A2E] text-[#1A1A2E]"
            >
              {proName ? `${proName}さんのプロフィールを見る →` : 'プロフィールを見る →'}
            </a>
            <button
              onClick={handleShare}
              style={{
                background: 'none',
                border: 'none',
                color: '#C4A35A',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '8px 0',
              }}
            >
              このプロを友達に紹介する
            </button>
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

                  {/* トップ強み */}
                  {p.topProof && (
                    <div style={{
                      fontSize: 11, color: '#C4A35A', background: 'rgba(196,163,90,0.06)',
                      borderRadius: 99, padding: '2px 8px', fontWeight: 500,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: '100%', marginBottom: 8,
                    }}>
                      {p.topProof.label} <span style={{ fontWeight: 'bold', fontFamily: 'ui-monospace, monospace' }}>{p.topProof.count}</span>
                    </div>
                  )}

                  {/* エリア */}
                  <div className="text-xs text-gray-500" style={{ wordBreak: 'break-word' }}>
                    {p.prefecture}
                    {p.is_online_available && (
                      <span className="ml-1 text-[#C4A35A] font-bold">● オンライン可</span>
                    )}
                  </div>
                </a>
              ))}
            </div>

          </div>
        )}

        {/* 下部余白 */}
        <div className="pb-8">
          <a
            href="/search"
            className="block text-center text-lg text-[#666666] underline"
          >
            もっと見る
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
