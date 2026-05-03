'use client'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import RewardReveal from '@/components/RewardReveal'
import VoteConsentSection, { VoteConsentVote } from '@/components/vote-consent/VoteConsentSection'
import RewardOptinSection from '@/components/vote-consent/RewardOptinSection'
import { Suspense } from 'react'
import Link from 'next/link'
import { useProStatus } from '@/lib/useProStatus'
interface RewardInfo {
  reward_type: string
  content: string
  title: string
  url?: string
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
  // Phase 2: 同意 UI 用の vote レコード（consent 対象フィールドのみ）
  const [consentVote, setConsentVote] = useState<VoteConsentVote | null>(null)
  // Phase 2: リワード表示ゲート
  // - consentDone: 今回 YES/NO 押下後 true (VoteConsentSection から onComplete で通知、揮発)
  // - consentSkipped: voter_professional_id !== null は同意UI不要(pro_link)
  // - consentAlreadyDone: display_mode が既にセット済み(過去のセッションで同意済み)→ リロードでもUI再表示しない
  const [consentDone, setConsentDone] = useState(false)
  const consentSkipped =
    !!consentVote?.voter_professional_id ||
    consentVote?.auth_method === 'email_code' ||
    consentVote?.auth_method === 'sms'
  const consentAlreadyDone = !!consentVote?.display_mode
  // Phase 1.5 拡張: 過去同意済みでも reward_optin 未済なら Step B を尋ねるため、
  // rewardUnlocked は (consentAlreadyDone && reward_optin) を条件に含める。
  const rewardUnlocked =
    consentDone ||
    consentSkipped ||
    (consentAlreadyDone && !!consentVote?.reward_optin) ||
    !consentVote

  // リワード配信トリガーの二重起動防止 (StrictMode dev / 連続クリック対策)
  const deliveryTriggeredRef = useRef(false)

  const handleRewardOptinChange = (optin: boolean) => {
    if (!optin) return
    if (deliveryTriggeredRef.current) return
    if (!voteId) return
    deliveryTriggeredRef.current = true

    // fire-and-forget: UI ブロックしない
    fetch('/api/deliver-reward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ vote_id: voteId }),
    }).catch((e) => {
      console.error('[vote-confirmed] deliver-reward trigger failed:', e)
    })
  }

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
        url: data.url || '',
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

  useEffect(() => {
    async function load() {
      // Phase 2: 同意 UI 用の vote レコード取得（consent 分岐判定に使う）
      if (voteId) {
        const { data: voteData } = await (supabase as any)
          .from('votes')
          .select('id, professional_id, auth_method, auth_display_name, client_photo_url, voter_professional_id, display_mode, reward_optin')
          .eq('id', voteId)
          .maybeSingle()
        if (voteData) {
          setConsentVote(voteData as VoteConsentVote)
        }
      }

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

      // ── リワード取得（選択済みリワードの開示用） ──
      // 1. ridパラメータがあればAPIから取得
      if (rid) {
        try {
          const res = await fetch(`/api/reward/${rid}`)
          if (res.ok) {
            const data = await res.json()
            setReward({
              reward_type: data.reward_type || '',
              content: data.content || '',
              title: data.title || '',
              url: data.url || '',
            })
            if (data.proName && !proId) {
              setProName(data.proName)
            }
            setCurrentRid(rid)
          }
        } catch (err) {
          console.error('[vote-confirmed] rid fetch failed:', err)
        }
      }

      // 2. フォールバック: クエリパラメータから取得
      if (!rid) {
        const paramReward = decodeRewardParam()
        if (paramReward) {
          setReward(paramReward)
        }

        // 3. フォールバック: DBから取得 + ridを取得してURL更新
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
              .select('reward_type, content, title, url')
              .eq('id', crData.reward_id)
              .maybeSingle()

            if (rewardData) {
              setReward({
                reward_type: rewardData.reward_type || '',
                content: rewardData.content || '',
                title: rewardData.title || '',
                url: rewardData.url || '',
              })
            }
          }
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
        <Link href="/" className="text-white text-xl font-bold tracking-widest no-underline">
          REALPROOF
        </Link>
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
          <p className="text-sm text-gray-400 mt-3">
            次回のセッションでも、ぜひ声を届けてください。7日後からまた投票できます。
          </p>
        </div>

        {/* ===== セクション1.5: 同意 UI (Phase 1.5: 2 段階同意フロー) =====
            consentVote の状態に応じて 3 ケースに分岐:

            ケース1: 完全な新規投票 (display_mode 未セット)
              → VoteConsentSection を Step A から開始 (initialStep デフォルト)

            ケース2: 過去同意済み (display_mode セット済み) + reward_optin=false
              → VoteConsentSection を Step B (notification) から開始
              → Step A はスキップしお知らせ受け取り同意のみ尋ねる

            ケース3: スキップケース (consentSkipped=true)
              → 写真同意 UI 不要なので RewardOptinSection 単独表示
              → voter_professional_id !== null / email_code / sms 認証
              → SMS 認証は RewardOptinSection 内で null 返却

            consentDone || rewardUnlocked になればこのセクション全体を出さない。
        */}
        {consentVote && !consentDone && (
          <>
            {/* ケース1: 写真同意未済 */}
            {!consentAlreadyDone && !consentSkipped && (
              <VoteConsentSection
                vote={consentVote}
                proName={proName}
                onComplete={() => setConsentDone(true)}
                onRewardOptinChange={handleRewardOptinChange}
              />
            )}

            {/* ケース2: 写真同意済み + reward_optin 未同意 → Step B のみ */}
            {consentAlreadyDone && !consentVote.reward_optin && !consentSkipped && (
              <VoteConsentSection
                vote={consentVote}
                proName={proName}
                onComplete={() => setConsentDone(true)}
                onRewardOptinChange={handleRewardOptinChange}
                initialStep="notification"
              />
            )}

            {/* ケース3: スキップケース (RewardOptinSection 単独) */}
            {consentSkipped && proName && (
              <RewardOptinSection
                voteId={voteId}
                proName={proName}
                authMethod={consentVote?.auth_method ?? undefined}
                onChange={handleRewardOptinChange}
              />
            )}
          </>
        )}

        {/* ===== Step 5: 削除案内 (ケース1+2 のみ) ===== */}
        {consentVote && !consentDone && !consentSkipped && proName && (
          <p className="text-xs text-[#999999] mt-4 mb-4 leading-relaxed whitespace-pre-line">
            {`※ 表示内容を後から変更したい場合は、${proName}さんに直接ご連絡ください。\nプロのダッシュボードから写真やコメントを削除できます。`}
          </p>
        )}

        {/* ===== セクション2: リワード開示（選択済みの場合） ===== */}
        {rewardUnlocked && reward && (
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
        {rewardUnlocked && hasAccount && (
          <div className="bg-[#1A1A2E] rounded-2xl p-6 text-center">
            <p className="text-white text-lg font-bold mb-2">
              ありがとうございました
            </p>
            {isProUser ? (
              // Phase 2 暫定: プロ投票者（ケース🅰）は投票先プロのプロフィールを主ボタンに。
              //               ダッシュボード導線は副ボタンとして残す。Phase 3 で正式調整。
              <>
                {proId && (
                  <a
                    href={`/card/${proId}`}
                    className="block w-full py-4 rounded-xl font-bold text-lg text-[#1A1A2E] bg-[#C4A35A] hover:bg-[#b3923f] transition mb-3"
                  >
                    {proName ? `${proName}さんのプロフィールを見る →` : 'プロフィールを見る →'}
                  </a>
                )}
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/user/role')
                      const data = await res.json()
                      const isProResult = data.isPro || roleParam === 'pro'
                      window.location.href = isProResult ? '/dashboard' : '/mycard'
                    } catch {
                      window.location.href = '/dashboard'
                    }
                  }}
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
                  ダッシュボードに戻る
                </button>
              </>
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
        {rewardUnlocked && !hasAccount && proId && (
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
