'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useUser, useSignUp, useSignIn } from '@clerk/nextjs'
import { Professional, getRewardLabel } from '@/lib/types'
import { normalizeEmail } from '@/lib/normalize-email'
import { Suspense } from 'react'
// AuthMethodSelector は login ページで使用。投票ページはフォーム内のためインライン実装

interface ProofItem {
  id: string
  label: string
  tab: string
  strength_label: string
  sort_order: number
}

interface CustomProof {
  id: string
  label: string
}

interface PersonalityItem {
  id: string
  label: string
  personality_label: string
  sort_order: number
}

interface RewardItem {
  id: string
  reward_type: string
  title: string
}

// ── アコーディオンコンポーネント ──
function Accordion({
  title,
  count,
  max,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  count: number
  max: number
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (contentRef.current) {
      setHeight(contentRef.current.scrollHeight)
    }
  }, [isOpen, children])

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3.5"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#9CA3AF]">{isOpen ? '\u25BC' : '\u25B6'}</span>
          <span className="text-sm font-bold text-[#1A1A2E]">{title}（{count}/{max}）</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-[#9CA3AF] rounded-full">任意</span>
      </button>
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: isOpen ? height + 'px' : '0px' }}
      >
        <div ref={contentRef} className="px-4 pb-4">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── スプラッシュスクリーン ──
function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 120);
    const t2 = setTimeout(() => setPhase("exit"),  1900);
    const t3 = setTimeout(() => onDone(),           2500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrapOpacity = phase === "hold" ? 1 : 0;
  const wrapFilter  = phase === "exit" ? "blur(8px)" : "blur(0px)";
  const logoScale   = phase === "enter" ? 0.88 : phase === "hold" ? 1 : 1.05;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#1A1A2E",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      opacity: wrapOpacity,
      filter: wrapFilter,
      transition: "opacity 0.5s ease, filter 0.5s ease",
    }}>
      <style>{`
        @keyframes splashBar { from { width: 0 } to { width: 100% } }
      `}</style>

      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
        transform: `scale(${logoScale})`,
        transition: "transform 0.65s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}>
        <img
          src="/images/icon.png"
          alt="REALPROOF"
          style={{
            width: 120,
            height: "auto",
            filter: "drop-shadow(0 0 24px rgba(196,163,90,0.55))",
          }}
        />
        {/* ロゴのみ表示 */}
      </div>

      {/* ローディングバー */}
      <div style={{
        position: "absolute", bottom: 56,
        width: 56, height: 2, borderRadius: 100,
        background: "rgba(255,255,255,0.07)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 100,
          background: "linear-gradient(90deg, #C4A35A, #D4B56A)",
          animation: "splashBar 1.9s ease forwards",
        }} />
      </div>
    </div>
  );
}

// ── ステップ管理型 ──
type VoteStep =
  | "intro"
  | "session_count"
  | "reward"
  | "proofs"
  | "personality"
  | "comment"
  | "auth"
  | "done"
  | "hopeful_done"

// ── 共通スタイル定数 ──
const S = {
  title: {
    color: "#FAFAF7", fontWeight: 700, fontSize: 20,
    marginBottom: 8, textAlign: "center" as const,
  },
  subtitle: {
    color: "#8B8B9A", fontSize: 13, lineHeight: 1.7,
    textAlign: "center" as const, marginBottom: 28,
  },
  primaryBtn: {
    width: "100%", padding: "15px", borderRadius: 14,
    background: "linear-gradient(135deg, #C4A35A, #D4B56A)",
    border: "none", color: "#1A1A2E",
    fontSize: 15, fontWeight: 700, cursor: "pointer",
    marginBottom: 10,
  },
  secondaryBtn: {
    width: "100%", padding: "13px", borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
    border: "1.5px solid rgba(255,255,255,0.12)",
    color: "#8B8B9A", fontSize: 14, cursor: "pointer",
    marginBottom: 10,
  },
  skipBtn: {
    background: "transparent", border: "none",
    color: "#8B8B9A", fontSize: 13, cursor: "pointer",
    textDecoration: "underline", textDecorationColor: "rgba(139,139,154,0.35)",
    padding: "8px",
  },
}

// ── 全ステップ共通のフェードラッパー ──
function StepWrapper({
  children,
  isTransitioning,
  step,
  totalSteps,
  onBack,
  showBack = true,
}: {
  children: React.ReactNode
  isTransitioning: boolean
  step?: number
  totalSteps?: number
  onBack?: () => void
  showBack?: boolean
}) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#1A1A2E",
      display: "flex",
      flexDirection: "column",
      opacity: isTransitioning ? 0 : 1,
      transform: isTransitioning ? "translateY(6px)" : "translateY(0)",
      transition: "opacity 0.22s ease, transform 0.22s ease",
    }}>
      {/* プログレスバー（step指定時のみ表示） */}
      {step !== undefined && totalSteps !== undefined && (
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          background: "#1A1A2E",
          borderBottom: "1px solid rgba(196,163,90,0.1)",
          padding: "12px 20px",
        }}>
          {/* 戻るボタン */}
          {showBack && onBack && (
            <button
              onClick={onBack}
              style={{
                background: "transparent", border: "none",
                color: "#8B8B9A", fontSize: 13, cursor: "pointer",
                marginBottom: 10, padding: 0,
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              ← 戻る
            </button>
          )}
          {/* バー */}
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 3, borderRadius: 100,
                background: i < step
                  ? "#C4A35A"
                  : i === step - 1
                    ? "rgba(196,163,90,0.4)"
                    : "rgba(255,255,255,0.07)",
                transition: "background 0.4s ease",
              }} />
            ))}
          </div>
          <div style={{ color: "#8B8B9A", fontSize: 11, textAlign: "center" }}>
            ステップ {step} / {totalSteps}
          </div>
        </div>
      )}

      {/* コンテンツ */}
      <div style={{
        flex: 1,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "32px 24px",
        maxWidth: 480, width: "100%", margin: "0 auto",
      }}>
        {children}
      </div>
    </div>
  )
}

// ── メインフォーム ──
function VoteForm() {
  const params = useParams()
  const searchParams = useSearchParams()
  const proId = params.id as string
  const qrToken = searchParams.get('token')
  const isPreview = searchParams.get('preview') === 'true'
  const supabase = createClient()
  const { user: clerkUser, isLoaded: authLoaded } = useUser()
  const { signUp, setActive: setSignUpActive } = useSignUp()
  const { signIn, setActive: setSignInActive } = useSignIn()

  // 基本 state
  const [pro, setPro] = useState<Professional | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [alreadyVoted, setAlreadyVoted] = useState(false)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [isSelfVote, setIsSelfVote] = useState(false)
  const [showPreviewBanner, setShowPreviewBanner] = useState(true)

  // メール確認コード認証（新フロー）
  const [emailCodeStep, setEmailCodeStep] = useState<'input' | 'verify'>('input')
  const [emailCode, setEmailCode] = useState('')
  const [emailCodeSending, setEmailCodeSending] = useState(false)
  const [emailCodeVerifying, setEmailCodeVerifying] = useState(false)
  const [emailResendCooldown, setEmailResendCooldown] = useState(0)

  // セッション（ログイン済みユーザー）
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const voteMethodRef = useRef<'session' | 'email'>('email')

  // フォーム state
  const [sessionCount, setSessionCount] = useState<'first' | 'repeat' | 'regular' | ''>('')
  const [voterEmail, setVoterEmail] = useState('')
  const [comment, setComment] = useState('')
  const [selectedRewardId, setSelectedRewardId] = useState('')

  // 強みプルーフ
  const [proofItems, setProofItems] = useState<ProofItem[]>([])
  const [customProofs, setCustomProofs] = useState<CustomProof[]>([])
  const [selectedProofIds, setSelectedProofIds] = useState<Set<string>>(new Set())
  const [isHopeful, setIsHopeful] = useState(false)
  const MAX_PROOF = 3

  // 人柄プルーフ
  const [personalityItems, setPersonalityItems] = useState<PersonalityItem[]>([])
  const [selectedPersonalityIds, setSelectedPersonalityIds] = useState<Set<string>>(new Set())
  const MAX_PERSONALITY = 3

  // リワード
  const [proRewards, setProRewards] = useState<RewardItem[]>([])

  // アコーディオン
  const [accordionOpen, setAccordionOpen] = useState({ proof: false, personality: false, reward: false })

  // スプラッシュ
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === 'undefined') return true
    return !new URLSearchParams(window.location.search).has('error')
  })

  // セッション確認（null=未回答, true=受けた, false=気になっている）
  // OAuth認証エラーで戻ってきた場合はセッション確認をスキップ
  const [sessionConfirmed, setSessionConfirmed] = useState<boolean | null>(
    searchParams.get('error') ? true : null
  )

  const loadedRef = useRef(false)

  // ── ステップ管理 ──
  const [voteStep, setVoteStep] = useState<VoteStep>(() => {
    if (typeof window === 'undefined') return "intro"
    return new URLSearchParams(window.location.search).has('error') ? "auth" : "intro"
  })
  const [isTransitioning, setIsTransitioning] = useState(false)
  const stepHistory = useRef<VoteStep[]>([])
  const [showEmailInput, setShowEmailInput] = useState(false)

  // 電話番号認証（SMS）
  const [showPhoneInput, setShowPhoneInput] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneSending, setPhoneSending] = useState(false)
  const [phoneVerifying, setPhoneVerifying] = useState(false)
  const [phoneStep, setPhoneStep] = useState<'input' | 'verify'>('input')

  // フォールバック認証
  const [showFallback, setShowFallback] = useState(false)
  const [fallbackName, setFallbackName] = useState('')
  // 生年月日は削除済み（B-4）
  const [fallbackPhone, setFallbackPhone] = useState('')
  const [isFallbackVote, setIsFallbackVote] = useState(false)

  // ── ユニバーサルデザインモード（デフォルトON） ──
  const [largeMode, setLargeMode] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('realproof_large_mode')
    return stored === null ? true : stored === 'true'
  })

  const goTo = (next: VoteStep) => {
    setIsTransitioning(true)
    setTimeout(() => {
      setVoteStep(next)
      setIsTransitioning(false)
    }, 220)
  }

  const goBack = () => {
    const prev = stepHistory.current.pop()
    if (prev) {
      setIsTransitioning(true)
      setTimeout(() => {
        setVoteStep(prev)
        setIsTransitioning(false)
      }, 220)
    }
  }

  const goToWithHistory = (next: VoteStep) => {
    stepHistory.current.push(voteStep)
    goTo(next)
  }

  // ── largeMode変更時にlocalStorageに保存 ──
  useEffect(() => {
    localStorage.setItem('realproof_large_mode', largeMode ? 'true' : 'false')
  }, [largeMode])

  // URLバーからトークンを消す（カジュアルな拡散への心理的摩擦）
  // ただし ?error= がある場合はsearchParamsが読まれるまで保持する
  // プレビューモードではURLを保持する
  useEffect(() => {
    if (isPreview) return // プレビューモードではURL変更しない
    const params = new URLSearchParams(window.location.search)
    if (params.has('error')) {
      // エラーパラメータだけ残してパスをクリーン化
      window.history.replaceState(null, '', `/vote/${proId}?error=${params.get('error')}`)
    } else {
      window.history.replaceState(null, '', `/vote/${proId}`)
    }
  }, [])

  useEffect(() => {
    // authLoaded が false の間は待機
    if (!authLoaded) return
    // 既にロード済みなら再実行しない（Clerk auth state変更による再レンダー防止）
    if (loadedRef.current) return
    loadedRef.current = true

    async function load() {
      // LINE/Google認証からのエラーハンドリング
      const authError = searchParams.get('error')
      if (authError === 'already_voted') {
        setAlreadyVoted(true)
      } else if (authError === 'self_vote') {
        setError('ご自身への回答はできません')
      } else if (authError === 'line_cancelled') {
        setError('LINE認証がキャンセルされました')
      } else if (authError === 'line_expired') {
        setError('認証の有効期限が切れました。もう一度お試しください。')
      } else if (authError === 'line_no_email') {
        setError('LINEからメールアドレスを取得できませんでした。メールアドレスを入力して回答してください。')
      } else if (authError === 'cooldown') {
        setError('このプロへの回答は30分に1件まで。しばらくお待ちください。')
      } else if (authError === 'vote_failed') {
        setError('送信に失敗しました。もう一度お試しください。')
      } else if (authError === 'invalid_vote_data') {
        setError('データが無効です。もう一度お試しください。')
      } else if (authError === 'google_cancelled') {
        setError('Google認証がキャンセルされました')
      } else if (authError === 'google_failed') {
        setError('Google認証に失敗しました。もう一度お試しください。')
      } else if (authError === 'google_no_email') {
        setError('Googleアカウントからメールアドレスを取得できませんでした。メールアドレスで回答してください。')
      }

      // ── ウェーブ1: QRチェック・プロ情報・人柄を並列取得 ──
      const [tokenResult, proResult, persResult] = await Promise.all([
        // QRトークン期限チェック（プレビューモードではスキップ）
        isPreview
          ? Promise.resolve({ data: { expires_at: new Date(Date.now() + 86400000).toISOString() } })
          : qrToken
            ? (supabase as any).from('qr_tokens').select('expires_at').eq('token', qrToken).maybeSingle()
            : Promise.resolve({ data: { expires_at: new Date(Date.now() + 86400000).toISOString() } }),
        // プロ情報
        (supabase as any).from('professionals').select('*').eq('id', proId).maybeSingle(),
        // 人柄プルーフ（プロ情報に依存しない）
        (supabase as any).from('personality_items').select('id, label, personality_label, sort_order').order('sort_order'),
      ])

      // QRチェック結果（プレビューモードではスキップ）
      if (!isPreview && qrToken) {
        if (!tokenResult.data) { setTokenExpired(true); setLoading(false); return }
        if (new Date(tokenResult.data.expires_at) < new Date()) { setTokenExpired(true); setLoading(false); return }
      }

      // プロ情報チェック
      const proData = proResult.data
      if (proData?.deactivated_at) {
        setError('このプロは現在受け付けていません')
        setLoading(false)
        return
      }
      if (proData) setPro(proData)

      // 人柄プルーフセット
      if (persResult.data) setPersonalityItems(persResult.data)

      // 強み未設定チェック → 準備中ページにリダイレクト
      if (proData) {
        const proofsList: string[] = proData.selected_proofs || []
        if (proofsList.length === 0) {
          fetch('/api/nfc-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ professional_id: proId }),
          }).catch(() => {})
          window.location.href = `/vote/preparing/${proId}`
          return
        }
      }

      // ── ウェーブ2: 強みプルーフ・リワードを並列取得 ──
      if (proData) {
        const selectedProofs: string[] = proData.selected_proofs || []
        const regularProofIds = selectedProofs.filter(id => !id.startsWith('custom_'))

        const [piResult, rewardResult] = await Promise.all([
          regularProofIds.length > 0
            ? (supabase as any).from('proof_items').select('id, label, tab, strength_label, sort_order').in('id', regularProofIds).order('sort_order')
            : Promise.resolve({ data: [] }),
          (supabase as any).from('rewards').select('id, reward_type, title').eq('professional_id', proId).order('sort_order'),
        ])

        if (piResult.data && piResult.data.length > 0) setProofItems(piResult.data)
        if (proData.custom_proofs && proData.custom_proofs.length > 0) setCustomProofs(proData.custom_proofs)
        if (rewardResult.data && rewardResult.data.length > 0) {
          setProRewards(rewardResult.data)
          setSelectedRewardId(rewardResult.data[0].id)
        }
      }

      // ── ウェーブ3: セッション確認・重複チェック（プレビューモードではスキップ） ──
      if (!isPreview) {
        const sessionUserEmail = clerkUser?.primaryEmailAddress?.emailAddress
        const sessionUserPhone = clerkUser?.primaryPhoneNumber?.phoneNumber
        const sessionIdentifier = sessionUserEmail || sessionUserPhone
        if (sessionIdentifier) {
          setSessionEmail(sessionIdentifier) // メールまたは電話番号を識別子としてセット
          setIsLoggedIn(true)

          if (clerkUser?.id && proData?.user_id) {
            if (clerkUser.id === proData.user_id) {
              setIsSelfVote(true)
              setLoading(false)
              return
            }
          }

          const { data: existing } = await (supabase as any)
            .from('votes')
            .select('id')
            .eq('professional_id', proId)
            .eq('normalized_email', normalizeEmail(sessionIdentifier))
            .maybeSingle()
          if (existing) setAlreadyVoted(true)
        } else {
          const savedEmail = localStorage.getItem('proof_voter_email')
          if (savedEmail) {
            setVoterEmail(savedEmail)
            const { data: existing } = await (supabase as any)
              .from('votes')
              .select('id')
              .eq('professional_id', proId)
              .eq('normalized_email', normalizeEmail(savedEmail))
              .maybeSingle()
            if (existing) setAlreadyVoted(true)
          }
        }
      }

      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proId, authLoaded])

  // ── 強みプルーフ選択 ──
  function toggleProofId(id: string) {
    if (isHopeful) return
    setSelectedProofIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= MAX_PROOF) return prev
        next.add(id)
      }
      return next
    })
  }

  function toggleHopeful() {
    if (selectedProofIds.size > 0) return
    setIsHopeful(!isHopeful)
  }

  // ── 人柄プルーフ選択 ──
  function togglePersonalityId(id: string) {
    setSelectedPersonalityIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (next.size >= MAX_PERSONALITY) return prev
        next.add(id)
      }
      return next
    })
  }

  // ── vote_type 算出 ──
  function determineVoteType(): string {
    const allSelectedProofIds = Array.from(selectedProofIds)
    const hasProofs = allSelectedProofIds.length > 0
    if (isHopeful) return 'hopeful'
    if (hasProofs) return 'proof'
    return 'personality_only'
  }

  // ── 投票データをsessionStorageに保存（LINE/Google認証用） ──
  function saveVoteDataToSession() {
    const allSelectedProofIds = Array.from(selectedProofIds)
    const hasProofs = allSelectedProofIds.length > 0
    const proofIdsToSend = isHopeful ? null : (hasProofs ? allSelectedProofIds : null)

    const voteData = {
      professional_id: proId,
      selected_proof_ids: proofIdsToSend,
      selected_personality_ids: selectedPersonalityIds.size > 0 ? Array.from(selectedPersonalityIds) : null,
      selected_reward_id: selectedRewardId || null,
      comment: comment.trim() || null,
      vote_type: determineVoteType(),
      session_count: sessionCount,
      qr_token: qrToken,
    }
    sessionStorage.setItem('pending_vote', JSON.stringify(voteData))
  }

  // ── 投票データをオブジェクトとして構築 ──
  function buildVoteData() {
    const allSelectedProofIds = Array.from(selectedProofIds)
    const hasProofs = allSelectedProofIds.length > 0
    const proofIdsToSend = isHopeful ? null : (hasProofs ? allSelectedProofIds : null)

    return {
      professional_id: proId,
      selected_proof_ids: proofIdsToSend,
      selected_personality_ids: selectedPersonalityIds.size > 0 ? Array.from(selectedPersonalityIds) : null,
      selected_reward_id: selectedRewardId || null,
      comment: comment.trim() || null,
      vote_type: determineVoteType(),
      session_count: sessionCount || 'first',
      qr_token: qrToken,
    }
  }

  // ── hopeful投票（「気になっている」用） ──
  const submitHopefulVote = async () => {
    if (!pro) return
    if (isPreview) return // プレビューモードでは投票しない
    try {
      await (supabase as any).from('votes').insert({
        professional_id: proId,
        voter_email: null,
        normalized_email: null,
        client_user_id: null,
        vote_type: 'hopeful',
        selected_proof_ids: null,
        selected_personality_ids: null,
        selected_reward_id: null,
        comment: null,
        qr_token: qrToken || null,
        status: 'confirmed',
        session_count: 'first',
        vote_weight: 0.5,
        auth_method: 'hopeful',
      })
    } catch (e) {
      console.error('hopeful vote error:', e)
      // エラーでも完了画面は表示する（UXを壊さない）
    }
  }

  // ── LINE認証で投票 ──
  function handleLineVote() {
    if (isPreview) return // プレビューモードでは投票しない
    const effectiveSessionCount = sessionCount || 'first'
    setError('')
    // 投票データを構築してLINE認証に直接遷移（Clerkを使わない）
    const voteData = buildVoteData()
    const voteDataParam = encodeURIComponent(JSON.stringify(voteData))
    window.location.href = `/api/vote-auth/line?professional_id=${proId}&qr_token=${qrToken || ''}&vote_data=${voteDataParam}`
  }

  // ── Google認証で投票 ──
  function handleGoogleVote() {
    if (isPreview) return // プレビューモードでは投票しない
    const effectiveSessionCount = sessionCount || 'first'
    setError('')
    // 投票データを構築してGoogle認証に直接遷移
    const voteData = buildVoteData()
    const voteDataParam = encodeURIComponent(JSON.stringify(voteData))
    window.location.href = `/api/vote-auth/google?professional_id=${proId}&qr_token=${qrToken || ''}&vote_data=${voteDataParam}`
  }

  // ── 電話番号認証: SMS送信 ──
  async function handlePhoneSend() {
    if (isPreview) return // プレビューモードでは投票しない
    if (!phoneNumber.trim()) {
      setError('電話番号を入力してください')
      return
    }
    setError('')
    setPhoneSending(true)

    let formattedPhone = phoneNumber.trim().replace(/[-\s()]/g, '')
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+81' + formattedPhone.slice(1)
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+81' + formattedPhone
    }

    try {
      // ── 重複投票チェック（SMS送信前に確認） ──
      const { data: existingVote } = await (supabase as any)
        .from('votes')
        .select('id')
        .eq('professional_id', proId)
        .eq('normalized_email', normalizeEmail(formattedPhone))
        .maybeSingle()

      if (existingVote) {
        setError('この電話番号では既にこのプロに回答済みです')
        setPhoneSending(false)
        return
      }

      // まず signIn（既存ユーザー）
      try {
        await signIn!.create({ identifier: formattedPhone })
        const phoneFactor = signIn!.supportedFirstFactors?.find(
          (f: any) => f.strategy === 'phone_code'
        ) as any
        if (phoneFactor?.phoneNumberId) {
          await signIn!.prepareFirstFactor({
            strategy: 'phone_code',
            phoneNumberId: phoneFactor.phoneNumberId,
          })
          setPhoneStep('verify')
          setPhoneSending(false)
          return
        }
      } catch (signInErr: any) {
        if (signInErr?.errors?.[0]?.code !== 'form_identifier_not_found') {
          throw signInErr
        }
      }

      // signUp（新規ユーザー）
      await signUp!.create({ phoneNumber: formattedPhone })
      await signUp!.preparePhoneNumberVerification()
      setPhoneStep('verify')
    } catch (err: any) {
      console.error('[handlePhoneSend] Full error:', JSON.stringify(err, null, 2))
      console.error('[handlePhoneSend] Error message:', err?.message)
      console.error('[handlePhoneSend] Clerk errors:', err?.errors)
      const clerkError = err?.errors?.[0]
      if (clerkError?.code === 'form_phone_number_blocked') {
        setError('この電話番号は使用できません')
      } else if (clerkError?.message) {
        setError(clerkError.message)
      } else {
        setError('SMSの送信に失敗しました。番号を確認してください。')
      }
    }
    setPhoneSending(false)
  }

  // ── 電話番号認証: コード確認 + 投票送信 ──
  async function handlePhoneVerify() {
    if (isPreview) return // プレビューモードでは投票しない
    if (!phoneCode.trim() || phoneCode.length < 6) {
      setError('6桁の認証コードを入力してください')
      return
    }
    setError('')
    setPhoneVerifying(true)

    try {
      let formattedPhone = phoneNumber.trim().replace(/[-\s()]/g, '')
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '+81' + formattedPhone.slice(1)
      } else if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+81' + formattedPhone
      }

      // signIn or signUp の検証
      if (signIn?.status === 'needs_first_factor') {
        const result = await signIn.attemptFirstFactor({
          strategy: 'phone_code',
          code: phoneCode,
        })
        console.log('[handlePhoneVerify] signIn result status:', result.status, 'sessionId:', result.createdSessionId)
        if (result.status === 'complete' && result.createdSessionId) {
          // ⚠️ setActiveは呼ばない — 投票ページ内でセッション確立するとClerkが
          // 再レンダー→リダイレクトを起こし、投票送信コードに到達しない
          // await setSignInActive!({ session: result.createdSessionId })
          console.log('[handlePhoneVerify] signIn complete, session created but setActive skipped to prevent redirect')
        }
      } else {
        const result = await signUp!.attemptPhoneNumberVerification({ code: phoneCode })
        console.log('[handlePhoneVerify] signUp result status:', result.status, 'sessionId:', result.createdSessionId)
        if (result.status === 'complete' && result.createdSessionId) {
          // ⚠️ setActiveは呼ばない（理由は上と同じ）
          // await setSignUpActive!({ session: result.createdSessionId })
          console.log('[handlePhoneVerify] signUp complete, session created but setActive skipped to prevent redirect')
        }
      }

      // 認証成功 → 投票送信

      // ── 30分クールダウンチェック（全プロ横断） ──
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const { data: recentCooldownVote } = await (supabase as any)
        .from('votes')
        .select('created_at')
        .eq('normalized_email', normalizeEmail(formattedPhone))
        .eq('status', 'confirmed')
        .gt('created_at', thirtyMinAgo)
        .limit(1)
        .maybeSingle()

      if (recentCooldownVote) {
        const nextAvailable = new Date(new Date(recentCooldownVote.created_at).getTime() + 30 * 60 * 1000)
        const waitMin = Math.ceil((nextAvailable.getTime() - Date.now()) / 60000)
        setError(`回答は30分に1件まで。あと約${waitMin}分お待ちください。`)
        setPhoneVerifying(false)
        return
      }

      await new Promise(resolve => setTimeout(resolve, 500))
      const voteData = buildVoteData()

      const { data: insertedVote, error: voteError } = await (supabase as any).from('votes').insert({
        professional_id: proId,
        voter_email: formattedPhone,
        normalized_email: normalizeEmail(formattedPhone),
        client_user_id: null,
        session_count: voteData.session_count,
        vote_weight: voteData.session_count === 'first' ? 0.5 : 1.0,
        vote_type: voteData.vote_type,
        selected_proof_ids: voteData.selected_proof_ids,
        selected_personality_ids: voteData.selected_personality_ids,
        selected_reward_id: voteData.selected_reward_id,
        comment: voteData.comment,
        qr_token: voteData.qr_token,
        status: 'confirmed',
        auth_method: 'sms',
      }).select().maybeSingle()

      if (voteError) {
        if (voteError.code === '23505') {
          setError('この電話番号では既に回答済みです')
        } else {
          setError(`送信に失敗しました: ${voteError.message}`)
        }
        setPhoneVerifying(false)
        return
      }

      let clientRewardId = ''
      if (selectedRewardId && insertedVote) {
        const { data: crData } = await (supabase as any).from('client_rewards').insert({
          vote_id: insertedVote.id,
          reward_id: selectedRewardId,
          professional_id: proId,
          client_email: formattedPhone,
          status: 'active',
        }).select('id').maybeSingle()
        if (crData?.id) clientRewardId = crData.id
      }

      window.location.href = `/vote-confirmed?proId=${proId}&vote_id=${insertedVote.id}&has_account=true${clientRewardId ? `&rid=${clientRewardId}` : ''}`
    } catch (err: any) {
      console.error('[handlePhoneVerify] Full error:', JSON.stringify(err, null, 2))
      console.error('[handlePhoneVerify] Error type:', typeof err)
      console.error('[handlePhoneVerify] Error message:', err?.message)
      console.error('[handlePhoneVerify] Clerk errors:', err?.errors)

      const clerkError = err?.errors?.[0]
      if (clerkError?.code === 'form_code_incorrect') {
        setError('認証コードが正しくありません')
      } else if (clerkError?.code === 'verification_expired') {
        setError('認証コードの有効期限が切れました。再送信してください。')
        setPhoneStep('input')
      } else if (clerkError?.code === 'form_identifier_exists') {
        setError('この電話番号は既に別のアカウントで使用されています。LINEまたはGoogleで認証してください。')
      } else if (clerkError?.code === 'session_exists') {
        setError('既にログイン済みです。ページを再読み込みしてください。')
      } else if (clerkError?.longMessage || clerkError?.message) {
        setError(`認証エラー: ${clerkError.longMessage || clerkError.message}`)
      } else if (err?.message) {
        setError(`エラー: ${err.message}`)
      } else {
        setError('認証に失敗しました。もう一度お試しください。')
      }
    }
    setPhoneVerifying(false)
  }

  // ── フォールバック認証: 名前+生年月日+電話番号で認証なし投票 ──
  async function handleFallbackSubmit() {
    if (isPreview) return // プレビューモードでは投票しない
    setError('')

    // バリデーション
    if (fallbackName.trim().length < 2) {
      setError('お名前を入力してください')
      return
    }
    const rawPhone = fallbackPhone.replace(/[-\s()]/g, '')
    if (rawPhone.length < 10 || !rawPhone.startsWith('0')) {
      setError('携帯番号を正しく入力してください')
      return
    }

    let formattedPhone = rawPhone
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+81' + formattedPhone.slice(1)
    }

    // 重複投票チェック
    const { data: existingVote } = await (supabase as any).from('votes')
      .select('id')
      .eq('professional_id', proId)
      .eq('normalized_email', normalizeEmail(formattedPhone))
      .maybeSingle()

    if (existingVote) {
      setError('この電話番号では既にこのプロに回答済みです')
      return
    }

    // ── 30分クールダウンチェック（全プロ横断） ──
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: recentCooldownVote } = await (supabase as any)
      .from('votes')
      .select('created_at')
      .eq('normalized_email', normalizeEmail(formattedPhone))
      .eq('status', 'confirmed')
      .gt('created_at', thirtyMinAgo)
      .limit(1)
      .maybeSingle()

    if (recentCooldownVote) {
      const nextAvailable = new Date(new Date(recentCooldownVote.created_at).getTime() + 30 * 60 * 1000)
      const waitMin = Math.ceil((nextAvailable.getTime() - Date.now()) / 60000)
      setError(`回答は30分に1件まで。あと約${waitMin}分お待ちください。`)
      return
    }

    const voteData = buildVoteData()

    const { data: insertedVote, error: voteError } = await (supabase as any).from('votes').insert({
      professional_id: proId,
      voter_email: formattedPhone, // 電話番号を識別子として使用
      normalized_email: normalizeEmail(formattedPhone),
      client_user_id: null,
      session_count: voteData.session_count,
      vote_weight: voteData.session_count === 'first' ? 0.5 : 1.0,
      vote_type: voteData.vote_type,
      selected_proof_ids: voteData.selected_proof_ids,
      selected_personality_ids: voteData.selected_personality_ids,
      selected_reward_id: voteData.selected_reward_id,
      comment: `[FB:${fallbackName.trim()}] ${voteData.comment || ''}`.trim(),
      qr_token: voteData.qr_token,
      status: 'confirmed', // フォールバックは即確定（後で認証を促す）
      auth_method: 'sms_fallback',
    }).select().maybeSingle()

    if (voteError) {
      if (voteError.code === '23505') {
        setError('この電話番号では既に回答済みです')
      } else {
        setError(`送信に失敗しました: ${voteError.message}`)
      }
      return
    }

    let clientRewardId2 = ''
    if (selectedRewardId && insertedVote) {
      const { data: crData } = await (supabase as any).from('client_rewards').insert({
        vote_id: insertedVote.id,
        reward_id: selectedRewardId,
        professional_id: proId,
        client_email: formattedPhone,
        status: 'pending',
      }).select('id').maybeSingle()
      if (crData?.id) clientRewardId2 = crData.id
    }

    window.location.href = `/vote-confirmed?proId=${proId}&vote_id=${insertedVote.id}&has_account=false${clientRewardId2 ? `&rid=${clientRewardId2}` : ''}`
  }

  // ── 投票送信（メール認証用） ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isPreview) return // プレビューモードでは投票しない
    setError('')

    // バリデーション
    if (!sessionCount) {
      setError('セッション回数を選択してください')
      return
    }

    // メール: セッション投票ならセッションから、それ以外はフォーム入力値
    const email = (voteMethodRef.current === 'session' && isLoggedIn && sessionEmail)
      ? sessionEmail.trim().toLowerCase()
      : voterEmail.trim().toLowerCase()

    // セッション投票（電話番号の場合あり）はメール形式チェックをスキップ
    const isSessionVoteAttempt = voteMethodRef.current === 'session' && isLoggedIn
    if (!isSessionVoteAttempt) {
      if (!email || !email.includes('@')) {
        setError('メールアドレスを入力してください')
        return
      }
      if (/https?:\/\/|www\./i.test(email)) {
        setError('正しいメールアドレスを入力してください')
        return
      }
    }

    // 自己投票チェック（Clerkユーザー直接照合）
    if (clerkUser && pro) {
      // user_id 照合
      if (clerkUser.id === pro.user_id) {
        setError('ご自身への回答はできません')
        return
      }
      // Clerkメールアドレス照合
      const clerkEmail = clerkUser.primaryEmailAddress?.emailAddress
      if (clerkEmail && pro.contact_email &&
          clerkEmail.toLowerCase() === pro.contact_email.toLowerCase()) {
        setError('ご自身への回答はできません')
        return
      }
    }

    // 自己投票チェック（メールアドレスベース — API経由フォールバック）
    try {
      const checkRes = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, proId }),
      })
      if (!checkRes.ok) {
        setError('確認中にエラーが発生しました。もう一度お試しください。')
        return
      }
      const checkData = await checkRes.json()
      if (checkData.isSelf) {
        setError('ご自身への回答はできません')
        return
      }
    } catch (err) {
      console.error('[vote] check-email error:', err)
      setError('確認中にエラーが発生しました。もう一度お試しください。')
      return
    }

    // 30分クールダウン（全プロ横断: 同一ユーザーは30分に1投票のみ）
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: recentVote } = await (supabase as any)
      .from('votes')
      .select('created_at')
      .eq('normalized_email', normalizeEmail(email))
      .eq('status', 'confirmed')
      .gt('created_at', thirtyMinAgo)
      .limit(1)
      .maybeSingle()

    if (recentVote) {
      const nextAvailable = new Date(new Date(recentVote.created_at).getTime() + 30 * 60 * 1000)
      const waitMin = Math.ceil((nextAvailable.getTime() - Date.now()) / 60000)
      setError(`回答は30分に1件まで。あと約${waitMin}分お待ちください。`)
      return
    }

    // メアドをローカルストレージに保存（メール入力時のみ）
    if (voteMethodRef.current === 'email') {
      localStorage.setItem('proof_voter_email', email)
    }

    // 選択IDを分類（UUID vs カスタム）
    const allSelectedProofIds = Array.from(selectedProofIds)
    const uuidProofIds = allSelectedProofIds.filter(id => !id.startsWith('custom_'))
    const customProofIds = allSelectedProofIds.filter(id => id.startsWith('custom_'))
    const hasProofs = allSelectedProofIds.length > 0

    // vote_type 判定
    let voteType = 'personality_only'
    if (isHopeful) {
      voteType = 'hopeful'
    } else if (hasProofs) {
      voteType = 'proof'
    }

    // selected_proof_ids: UUID と カスタムID を両方 TEXT[] として送信
    const proofIdsToSend = isHopeful ? null : (hasProofs ? allSelectedProofIds : null)

    // ── ログイン済みユーザー: メール認証スキップ、直接確定 ──
    const isSessionVote = voteMethodRef.current === 'session' && isLoggedIn && !!sessionEmail
    const voteStatus = isSessionVote ? 'confirmed' : 'pending'

    // 投票INSERT
    const { data: voteData, error: voteError } = await (supabase as any).from('votes').insert({
      professional_id: proId,
      voter_email: email,
      normalized_email: normalizeEmail(email) || null,
      client_user_id: null,
      session_count: sessionCount,
      vote_weight: sessionCount === 'first' ? 0.5 : 1.0,
      vote_type: voteType,
      selected_proof_ids: proofIdsToSend,
      selected_personality_ids: selectedPersonalityIds.size > 0 ? Array.from(selectedPersonalityIds) : null,
      selected_reward_id: selectedRewardId || null,
      comment: comment.trim() || null,
      qr_token: qrToken,
      status: voteStatus,
      auth_method: 'email',
    }).select().maybeSingle()

    if (voteError) {
      console.error('[handleSubmit] Vote INSERT error:', {
        code: voteError.code,
        message: voteError.message,
        details: voteError.details,
        hint: voteError.hint,
        status: (voteError as any).status,
        statusText: (voteError as any).statusText,
      })
      console.error('[handleSubmit] Vote payload:', {
        professional_id: proId,
        voter_email: email,
        session_count: sessionCount,
        vote_type: voteType,
        selected_proof_ids: proofIdsToSend,
        selected_personality_ids: selectedPersonalityIds.size > 0 ? Array.from(selectedPersonalityIds) : null,
        selected_reward_id: selectedRewardId || null,
        qr_token: qrToken,
      })
      if (voteError.code === '23505') {
        setError('このメールアドレスでは既に回答済みです')
      } else {
        setError(`送信に失敗しました (${voteError.code || 'unknown'}): ${voteError.message || '不明なエラー'}`)
      }
      return
    }

    // メアドをPROOFリストに保存
    const { error: emailInsertError } = await (supabase as any).from('vote_emails').insert({
      email,
      professional_id: proId,
      source: 'vote',
    })
    if (emailInsertError) {
      console.error('[handleSubmit] vote_emails INSERT error:', emailInsertError)
    }

    // リワード選択をclient_rewardsに保存
    let submittedRid = ''
    if (selectedRewardId && voteData) {
      const { data: crData, error: rewardInsertError } = await (supabase as any).from('client_rewards').insert({
        vote_id: voteData.id,
        reward_id: selectedRewardId,
        professional_id: proId,
        client_email: email,
        status: isSessionVote ? 'active' : 'pending',
      }).select('id').maybeSingle()
      if (rewardInsertError) {
        console.error('[handleSubmit] client_rewards INSERT error:', rewardInsertError)
      }
      if (crData?.id) submittedRid = crData.id
    }

    // ── ログイン済み（Clerk認証済み）: メール認証不要 → 完了画面へ直接遷移 ──
    if (isSessionVote) {
      window.location.href = `/vote-confirmed?proId=${proId}&vote_id=${voteData.id}&has_account=true${submittedRid ? `&rid=${submittedRid}` : ''}`
      return
    }

    // メール投票は新フロー（send-code → verify-code）に移行済み
    // handleSubmitはセッション投票専用。ここに到達することは想定外。
    console.error('[handleSubmit] Unexpected: non-session vote reached end of handleSubmit')
    setError('予期しないエラーが発生しました。もう一度お試しください。')
  }

  // ── メール確認コード送信ハンドラー（新フロー） ──
  async function handleEmailSendCode() {
    const email = voterEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) return
    setError('')
    setEmailCodeSending(true)

    try {
      const res = await fetch('/api/vote-auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, professional_id: proId }),
      })

      if (res.ok) {
        localStorage.setItem('proof_voter_email', email)
        setEmailCodeStep('verify')
        // 30秒クールダウン開始
        setEmailResendCooldown(30)
        const timer = setInterval(() => {
          setEmailResendCooldown(prev => {
            if (prev <= 1) { clearInterval(timer); return 0 }
            return prev - 1
          })
        }, 1000)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || '確認コードの送信に失敗しました')
      }
    } catch {
      setError('エラーが発生しました。もう一度お試しください。')
    }
    setEmailCodeSending(false)
  }

  // ── メール確認コード検証ハンドラー（新フロー） ──
  async function handleEmailVerifyCode() {
    const email = voterEmail.trim().toLowerCase()
    if (!email || emailCode.length < 6) return
    setError('')
    setEmailCodeVerifying(true)

    // 投票データを組み立て
    const allSelectedProofIds = Array.from(selectedProofIds)
    const hasProofs = allSelectedProofIds.length > 0
    let voteType = 'personality_only'
    if (isHopeful) {
      voteType = 'hopeful'
    } else if (hasProofs) {
      voteType = 'proof'
    }
    const proofIdsToSend = isHopeful ? null : (hasProofs ? allSelectedProofIds : null)

    try {
      const res = await fetch('/api/vote-auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code: emailCode,
          professional_id: proId,
          vote_data: {
            session_count: sessionCount,
            vote_type: voteType,
            selected_proof_ids: proofIdsToSend,
            selected_personality_ids: selectedPersonalityIds.size > 0 ? Array.from(selectedPersonalityIds) : null,
            selected_reward_id: selectedRewardId || null,
            comment: comment.trim() || null,
            qr_token: qrToken,
          },
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.ok && data.success) {
        const rid = data.client_reward_id || ''
        window.location.href = `/vote-confirmed?proId=${proId}&vote_id=${data.vote_id}${rid ? `&rid=${rid}` : ''}`
        return
      }

      // エラーハンドリング
      if (data.error === 'invalid_code') {
        setError('確認コードが正しくありません')
      } else if (data.error === 'expired_code') {
        setError('確認コードの有効期限が切れました。再送信してください。')
      } else if (data.error === 'already_voted') {
        setError('このメールアドレスでは既に回答済みです')
      } else {
        setError(data.error || '認証に失敗しました。もう一度お試しください。')
      }
    } catch {
      setError('エラーが発生しました。もう一度お試しください。')
    }
    setEmailCodeVerifying(false)
  }

  // ── スプラッシュ（データはバックグラウンドで読み込み中） ──
  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />
  }

  // ── ローディング ──
  if (loading) {
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  if (tokenExpired) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">QRコードの有効期限が切れています</h1>
        <p className="text-gray-500 mb-6">このQRコードは24時間の有効期限が過ぎています。プロに新しいQRコードを発行してもらってください。</p>
      </div>
    )
  }

  if (isSelfVote) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <div className="w-16 h-16 rounded-full bg-[#C4A35A]/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#C4A35A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">ご自身のプロフィールには回答できません</h1>
        <p className="text-gray-500 mb-6">クライアントにNFCカードを見せて、回答を依頼してください。</p>
        <a
          href="/dashboard"
          className="inline-block px-6 py-3 bg-[#1A1A2E] text-[#C4A35A] font-bold rounded-xl hover:opacity-90 transition"
        >
          ダッシュボードに戻る
        </a>
      </div>
    )
  }

  if (!pro) {
    return <div className="text-center py-16 text-gray-400">プロが見つかりません</div>
  }

  // ── 投票済み ──
  if (alreadyVoted) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <div className="w-16 h-16 rounded-full bg-[#C4A35A]/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#C4A35A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">回答済みです</h1>
        <p className="text-gray-500 mb-6">{pro.name}さんへの回答は既に送信済みです。</p>
        <a href={`/card/${pro.id}`} className="text-[#C4A35A] underline">
          {pro.name}さんのカードを見る
        </a>
      </div>
    )
  }


  // ── ステップUI用の変数 ──
  const hasRewards = proRewards.length > 0
  const totalSteps = hasRewards ? 6 : 5

  // 強みプルーフの表示項目（プロが設定した項目）
  const allProofDisplayItems = [
    ...proofItems.map(p => ({ id: p.id, label: p.label, isCustom: false })),
    ...customProofs.filter(c => c.label?.trim()).map(c => ({ id: c.id, label: c.label, isCustom: true })),
  ]

  // ステップ番号計算（intro/confirm/hopeful_doneはundefined）
  const stepNum = (s: VoteStep): number | undefined => {
    const order = hasRewards
      ? ['session_count', 'proofs', 'personality', 'comment', 'reward', 'auth']
      : ['session_count', 'proofs', 'personality', 'comment', 'auth']
    const idx = order.indexOf(s)
    return idx >= 0 ? idx + 1 : undefined
  }

  // ── 文字サイズ切替ボタン ──
  const fontSizeToggle = (
    <button
      onClick={() => setLargeMode(!largeMode)}
      aria-label={largeMode ? '標準の文字サイズに戻す' : '文字を大きくする'}
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 100,
        width: 48,
        height: 48,
        borderRadius: '50%',
        border: '1.5px solid rgba(196,163,90,0.4)',
        background: largeMode ? 'rgba(196,163,90,0.2)' : 'rgba(26,26,46,0.85)',
        backdropFilter: 'blur(8px)',
        color: '#C4A35A',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        transition: 'background 0.2s ease, transform 0.15s ease',
      }}
    >
      {largeMode ? 'Aa' : 'Aa+'}
    </button>
  )

  return (
    <>
      <style>{`
        nav, footer { display: none !important; }
        main { padding: 0 !important; max-width: 100% !important; }
      `}</style>

      {/* ── 文字サイズ切替ボタン（固定位置） ── */}
      {!showSplash && !loading && fontSizeToggle}

      {/* ── zoom ラッパー ── */}
      <div style={{ zoom: largeMode ? 1.25 : 1, transition: 'zoom 0.2s ease' }}>

      {/* ── プレビューバナー ── */}
      {isPreview && showPreviewBanner && (
        <div style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "#FFF8E1",
          border: "1px solid #C4A35A",
          padding: "12px 16px",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          gap: 12,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1A1A2E", marginBottom: 4 }}>
              👁️ これはプレビューです
            </div>
            <div style={{ fontSize: 12, color: "#1A1A2E", lineHeight: 1.6 }}>
              クライアントに表示される投票画面を確認しています。<br />
              実際の投票は反映されません。
            </div>
          </div>
          <button
            onClick={() => setShowPreviewBanner(false)}
            style={{
              background: "transparent", border: "none",
              color: "#1A1A2E", fontSize: 16, cursor: "pointer",
              padding: "2px 6px", flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── イントロ画面 ── */}
      {voteStep === "intro" && (
        <StepWrapper isTransitioning={isTransitioning} showBack={false}>
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: 20 }}>
              {pro.photo_url ? (
                <img src={pro.photo_url} alt={pro.name} style={{
                  width: 80, height: 80, borderRadius: "50%",
                  objectFit: "cover", margin: "0 auto", display: "block",
                  boxShadow: "0 4px 20px rgba(196,163,90,0.35)",
                }} />
              ) : (
                <div style={{
                  width: 80, height: 80, borderRadius: "50%",
                  background: "linear-gradient(135deg, #C4A35A, #D4B56A)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, fontWeight: 700, color: "#1A1A2E",
                  margin: "0 auto",
                  boxShadow: "0 4px 20px rgba(196,163,90,0.35)",
                }}>
                  {pro.name?.[0] ?? "?"}
                </div>
              )}
            </div>

            <div style={{ color: "#C4A35A", fontWeight: 700, fontSize: 18, marginBottom: 2 }}>
              {pro.name}さんへ
            </div>
            {pro.store_name && (
              <div style={{ color: "rgba(250,250,247,0.6)", fontSize: 12, marginBottom: 6 }}>{pro.store_name}</div>
            )}
            <div style={{ color: "#FAFAF7", fontSize: 15, marginBottom: 20, lineHeight: 1.6 }}>
              プロの技術向上のための<br />
              かんたんアンケート
            </div>

            {/* 約30秒バッジ */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(196,163,90,0.12)",
              border: "1px solid rgba(196,163,90,0.35)",
              borderRadius: 100, padding: "6px 16px", marginBottom: 28,
            }}>
              <span style={{ fontSize: 14 }}>⏱️</span>
              <span style={{ color: "#C4A35A", fontWeight: 700, fontSize: 13 }}>
                約30秒で終わります
              </span>
            </div>

            <div style={{ color: "#8B8B9A", fontSize: 12, lineHeight: 1.8, marginBottom: 32 }}>
              あなたが感じたことを<br />
              そのまま伝えてください。
            </div>

            <button
              onClick={() => goToWithHistory("session_count")}
              style={{ ...S.primaryBtn, fontSize: 16 }}
            >
              はじめる →
            </button>
          </div>
        </StepWrapper>
      )}

      {/* ── ステップ1/5: 何回目（旧confirm+session_count統合） ── */}
      {voteStep === "session_count" && (
        <StepWrapper
          isTransitioning={isTransitioning}
          step={stepNum("session_count")} totalSteps={totalSteps}
          onBack={goBack} showBack={false}
        >
          <div style={{ textAlign: "center", width: "100%" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>🙏</div>
            <div style={S.title}>
              <span style={{ color: "#C4A35A" }}>{pro.name}</span>さんの
              <br />セッション・施術・レッスン・指導を
              <br />受けたのは何回目ですか？
            </div>
            <div style={{ height: 28 }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
              {([
                { value: 'first' as const, label: 'はじめて' },
                { value: 'repeat' as const, label: '2〜4回目' },
                { value: 'regular' as const, label: '5回以上' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSessionConfirmed(true)
                    setSessionCount(opt.value)
                    goToWithHistory("proofs")
                  }}
                  style={S.primaryBtn}
                >
                  {opt.label}
                </button>
              ))}

              <button
                onClick={async () => {
                  await submitHopefulVote()
                  goTo("hopeful_done")
                }}
                style={S.secondaryBtn}
              >
                まだですが、気になっています
              </button>
            </div>
          </div>
        </StepWrapper>
      )}

      {/* ── STEP 1: 強みプルーフ選択 ── */}
      {voteStep === "proofs" && (
        <StepWrapper
          isTransitioning={isTransitioning}
          step={stepNum("proofs")} totalSteps={totalSteps}
          onBack={goBack}
        >
          <div style={{ width: "100%" }}>
            <div style={S.title}>
              どんなところがよかったですか？
            </div>
            <div style={S.subtitle}>あてはまるものを選んでください（最大3つ）</div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
              {allProofDisplayItems.map(item => {
                const isSelected = selectedProofIds.has(item.id)
                const disabled = isHopeful || (!isSelected && selectedProofIds.size >= MAX_PROOF)
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleProofId(item.id)}
                    disabled={disabled}
                    style={{
                      padding: "9px 15px", borderRadius: 100,
                      border: isSelected
                        ? "2px solid #C4A35A"
                        : "1.5px solid rgba(196,163,90,0.24)",
                      background: isSelected ? "rgba(196,163,90,0.13)" : "rgba(255,255,255,0.03)",
                      color: isSelected ? "#C4A35A" : "#FAFAF7",
                      fontSize: 13, fontWeight: isSelected ? 600 : 400,
                      cursor: disabled ? "default" : "pointer",
                      opacity: disabled && !isSelected ? 0.32 : 1,
                    }}
                  >
                    {item.label}
                  </button>
                )
              })}
              {/* 期待できそう！チップ */}
              <button
                onClick={toggleHopeful}
                disabled={selectedProofIds.size > 0}
                style={{
                  padding: "9px 15px", borderRadius: 100,
                  border: isHopeful
                    ? "2px solid #C4A35A"
                    : "1.5px solid rgba(196,163,90,0.24)",
                  background: isHopeful ? "rgba(196,163,90,0.13)" : "rgba(255,255,255,0.03)",
                  color: isHopeful ? "#C4A35A" : "#FAFAF7",
                  fontSize: 13, fontWeight: isHopeful ? 600 : 400,
                  cursor: selectedProofIds.size > 0 ? "default" : "pointer",
                  opacity: selectedProofIds.size > 0 ? 0.32 : 1,
                }}
              >
                期待できそう！
              </button>
            </div>

            <button
              onClick={() => goToWithHistory("personality")}
              disabled={selectedProofIds.size === 0 && !isHopeful}
              style={{
                ...S.primaryBtn,
                opacity: selectedProofIds.size === 0 && !isHopeful ? 0.4 : 1,
              }}
            >
              次へ →
            </button>
            <button
              onClick={() => goToWithHistory("personality")}
              style={{ ...S.skipBtn, display: "block", margin: "0 auto" }}
            >
              スキップ
            </button>
          </div>
        </StepWrapper>
      )}

      {/* ── STEP 3: 人柄選択 ── */}
      {voteStep === "personality" && (
        <StepWrapper
          isTransitioning={isTransitioning}
          step={stepNum("personality")} totalSteps={totalSteps}
          onBack={goBack}
        >
          <div style={{ width: "100%" }}>
            <div style={S.title}>
              <span style={{ color: "#C4A35A" }}>{pro.name?.split(/[\s　]/)[0]}</span>さんはどんな人でしたか？
            </div>
            <div style={S.subtitle}>あてはまるものがあれば（任意・最大3つ）</div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
              {personalityItems.map(item => {
                const isSelected = selectedPersonalityIds.has(item.id)
                const disabled = selectedPersonalityIds.size >= 3 && !isSelected
                return (
                  <button
                    key={item.id}
                    onClick={() => togglePersonalityId(item.id)}
                    disabled={disabled}
                    style={{
                      padding: "9px 15px", borderRadius: 100,
                      border: isSelected
                        ? "2px solid #C4A35A"
                        : "1.5px solid rgba(196,163,90,0.24)",
                      background: isSelected ? "rgba(196,163,90,0.13)" : "rgba(255,255,255,0.03)",
                      color: isSelected ? "#C4A35A" : "#FAFAF7",
                      fontSize: 13, fontWeight: isSelected ? 600 : 400,
                      cursor: disabled ? "default" : "pointer",
                      opacity: disabled && !isSelected ? 0.32 : 1,
                    }}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => goToWithHistory("comment")}
              disabled={selectedPersonalityIds.size === 0}
              style={{
                ...S.primaryBtn,
                opacity: selectedPersonalityIds.size === 0 ? 0.4 : 1,
              }}
            >
              次へ →
            </button>
            <button
              onClick={() => goToWithHistory("comment")}
              style={{ ...S.skipBtn, display: "block", margin: "0 auto" }}
            >
              スキップ
            </button>
          </div>
        </StepWrapper>
      )}

      {/* ── STEP 4: コメント入力 ── */}
      {voteStep === "comment" && (
        <StepWrapper
          isTransitioning={isTransitioning}
          step={stepNum("comment")} totalSteps={totalSteps}
          onBack={goBack}
        >
          <div style={{ width: "100%" }}>
            <div style={S.title}>ひとこと伝えるとしたら？</div>
            <div style={S.subtitle}>100文字まで（任意です）</div>

            <textarea
              value={comment}
              onChange={e => setComment(e.target.value.slice(0, 100))}
              placeholder="例: 長年悩んでいた腰痛が1回で改善しました…"
              style={{
                width: "100%", borderRadius: 12, resize: "none",
                border: "1.5px solid rgba(196,163,90,0.27)",
                background: "#16213E", color: "#FAFAF7",
                fontSize: 14, padding: "14px", minHeight: 100,
                lineHeight: 1.7, marginBottom: 8,
                boxSizing: "border-box",
              }}
            />
            <div style={{ color: "#8B8B9A", fontSize: 12, textAlign: "right", marginBottom: 20 }}>
              {comment.length}/100
            </div>

            <button
              onClick={() => goToWithHistory(hasRewards ? "reward" : "auth")}
              style={S.primaryBtn}
            >
              次へ →
            </button>
            <button
              onClick={() => goToWithHistory(hasRewards ? "reward" : "auth")}
              style={{ ...S.skipBtn, display: "block", margin: "0 auto" }}
            >
              スキップ
            </button>
          </div>
        </StepWrapper>
      )}

      {/* ── STEP 5: リワード選択（リワードがあるプロのみ） ── */}
      {voteStep === "reward" && (
        <StepWrapper
          isTransitioning={isTransitioning}
          step={stepNum("reward")} totalSteps={totalSteps}
          onBack={goBack}
        >
          <div style={{ width: "100%" }}>
            <div style={S.title}>
              {pro.name}さんからお礼が届いています 🎁
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {proRewards.map(reward => {
                const displayLabel = reward.reward_type === 'surprise'
                  ? 'シークレット — 何が出るかお楽しみ！'
                  : reward.title && (reward.reward_type === 'selfcare' || reward.reward_type === 'freeform')
                    ? reward.title
                    : getRewardLabel(reward.reward_type)
                const isSelected = selectedRewardId === reward.id
                return (
                  <button
                    key={reward.id}
                    onClick={() => {
                      setSelectedRewardId(isSelected ? '' : reward.id)
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "14px 16px", borderRadius: 14,
                      border: isSelected
                        ? "1.5px solid #C4A35A"
                        : "1.5px solid rgba(196,163,90,0.22)",
                      background: isSelected
                        ? "rgba(196,163,90,0.12)"
                        : "rgba(196,163,90,0.04)",
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#FAFAF7", fontWeight: 600, fontSize: 14 }}>
                        {displayLabel}
                      </div>
                    </div>
                    {isSelected && (
                      <span style={{ color: "#C4A35A", fontSize: 16, flexShrink: 0 }}>✓</span>
                    )}
                  </button>
                )
              })}
            </div>

            <div style={{ color: "#8B8B9A", fontSize: 12, textAlign: "center", marginBottom: 20 }}>
              ※ リワードの受け取りは任意です。
            </div>

            <button
              onClick={() => goToWithHistory("auth")}
              style={S.primaryBtn}
            >
              次へ →
            </button>
            <button
              onClick={() => {
                setSelectedRewardId('')
                goToWithHistory("auth")
              }}
              style={{ ...S.skipBtn, display: "block", margin: "0 auto" }}
            >
              スキップ
            </button>
          </div>
        </StepWrapper>
      )}

      {/* ── STEP 6: 認証 ── */}
      {voteStep === "auth" && (
        <StepWrapper
          isTransitioning={isTransitioning}
          step={stepNum("auth")} totalSteps={totalSteps}
          onBack={goBack}
        >
          <div style={{ width: "100%" }}>
            {isPreview ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 16, textAlign: "center" }}>👁️</div>
                <div style={S.title}>プレビューはここまでです</div>
                <div style={S.subtitle}>
                  ここから先は認証ステップです。<br />
                  クライアントはLINE・SMS・Googleなどで<br />
                  本人確認をして回答を送信します。
                </div>
                <button
                  onClick={() => window.close()}
                  style={S.primaryBtn}
                >
                  プレビューを閉じる
                </button>
                <button
                  onClick={goBack}
                  style={{ ...S.skipBtn, display: "block", margin: "0 auto" }}
                >
                  ← 前のステップに戻る
                </button>
              </>
            ) : (
            <>
            <div style={S.title}>あと少しで届きます！</div>
            <div style={S.subtitle}>
              あなたの声を届けるために<br />
              確認をお願いしています。
            </div>

            {error && (
              <div style={{
                background: "rgba(220,38,38,0.1)",
                border: "1px solid rgba(220,38,38,0.3)",
                borderRadius: 12, padding: "10px 14px", marginBottom: 16,
              }}>
                <div style={{ color: "#FCA5A5", fontSize: 13 }}>{error}</div>
              </div>
            )}

            {isLoggedIn && sessionEmail ? (
              <button
                onClick={() => {
                  voteMethodRef.current = 'session'
                  handleSubmit({ preventDefault: () => {} } as React.FormEvent)
                }}
                style={S.primaryBtn}
              >
                このアカウントで回答する
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* LINE */}
                {!showFallback && emailCodeStep === 'input' && (
                  <button
                    onClick={() => handleLineVote()}
                    style={{
                      ...S.primaryBtn, marginBottom: 0,
                      background: "#06C755",
                      display: "flex", alignItems: "center",
                      justifyContent: "center", gap: 10,
                    }}
                  >
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="white">
                      <path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                    </svg>
                    LINEで続ける
                  </button>
                )}

                {/* ── 電話番号認証（ボタン） ── */}
                {!showPhoneInput && phoneStep === 'input' && !showFallback && emailCodeStep === 'input' && (
                  <button
                    onClick={() => { setShowPhoneInput(true); setShowFallback(false); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      width: "100%", padding: "14px 0", borderRadius: 12,
                      border: "1.5px solid rgba(196,163,90,0.27)", background: "#16213E",
                      color: "#FAFAF7", fontSize: 16, fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    📱 電話番号で確認する
                  </button>
                )}

                {/* ── 電話番号入力フォーム ── */}
                {showPhoneInput && phoneStep === 'input' && !showFallback && emailCodeStep === 'input' && (
                  <div style={{ animation: "fadeUp .18s ease" }}>
                    <div style={{
                      color: "#8B8B9A", fontSize: 11, textAlign: "center",
                      marginBottom: 8,
                    }}>
                      SMSで届く6桁のコードで確認します
                    </div>
                    <div style={{ position: "relative" }}>
                      <span style={{
                        position: "absolute", left: 14, top: "50%",
                        transform: "translateY(-50%)",
                        color: "#8B8B9A", fontSize: 14,
                      }}>+81</span>
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value.replace(/[^\d-]/g, ''))}
                        placeholder="090-1234-5678"
                        style={{
                          width: "100%", padding: "12px 14px 12px 50px", borderRadius: 12,
                          border: "1.5px solid rgba(196,163,90,0.27)",
                          background: "#16213E", color: "#FAFAF7",
                          fontSize: 16, marginBottom: 10,
                          boxSizing: "border-box", outline: "none",
                          letterSpacing: 1,
                        }}
                      />
                    </div>
                    <button
                      onClick={handlePhoneSend}
                      disabled={phoneSending || !phoneNumber.trim()}
                      style={{
                        ...S.primaryBtn,
                        opacity: phoneSending || !phoneNumber.trim() ? 0.5 : 1,
                      }}
                    >
                      {phoneSending ? '送信中...' : '認証コードを送信する'}
                    </button>
                  </div>
                )}

                {/* ── 認証コード入力（SMS） ── */}
                {phoneStep === 'verify' && !showFallback && emailCodeStep === 'input' && (
                  <div style={{ animation: "fadeUp .18s ease" }}>
                    <div style={{
                      color: "#C4A35A", fontSize: 14, fontWeight: 600,
                      textAlign: "center", marginBottom: 6,
                    }}>
                      認証コードを送信しました
                    </div>
                    <div style={{
                      color: "#8B8B9A", fontSize: 12, textAlign: "center",
                      marginBottom: 16,
                    }}>
                      {phoneNumber} に届いた6桁のコードを入力
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={phoneCode}
                      onChange={e => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      autoFocus
                      style={{
                        width: "100%", padding: "14px", borderRadius: 12,
                        border: "1.5px solid rgba(196,163,90,0.27)",
                        background: "#16213E", color: "#FAFAF7",
                        fontSize: 24, textAlign: "center",
                        letterSpacing: 8, marginBottom: 10,
                        boxSizing: "border-box", outline: "none",
                      }}
                    />
                    <button
                      onClick={handlePhoneVerify}
                      disabled={phoneVerifying || phoneCode.length < 6}
                      style={{
                        ...S.primaryBtn,
                        opacity: phoneVerifying || phoneCode.length < 6 ? 0.5 : 1,
                      }}
                    >
                      {phoneVerifying ? '確認中...' : '認証して送信する'}
                    </button>
                    <button
                      onClick={() => { setPhoneStep('input'); setPhoneCode(''); setError(''); }}
                      style={{ ...S.skipBtn, display: "block", margin: "4px auto 0" }}
                    >
                      電話番号を変更する
                    </button>
                  </div>
                )}

                {/* Google */}
                {!showFallback && emailCodeStep === 'input' && (
                  <button
                    onClick={() => handleGoogleVote()}
                    style={{
                      ...S.secondaryBtn, marginBottom: 0,
                      display: "flex", alignItems: "center",
                      justifyContent: "center", gap: 10,
                    }}
                  >
                    <svg width={16} height={16} viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Googleで続ける
                  </button>
                )}

                {/* ── 区切り線 ── */}
                {!showFallback && emailCodeStep === 'input' && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 12,
                    margin: "10px 0 6px",
                  }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                    <span style={{ color: "rgba(139,139,154,0.5)", fontSize: 10 }}>その他</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                  </div>
                )}

                {/* メール認証（確認コード方式） */}
                {!showFallback && emailCodeStep === 'input' && (
                  !showEmailInput ? (
                    <button
                      onClick={() => setShowEmailInput(true)}
                      style={{
                        background: "transparent", border: "none",
                        color: "#8B8B9A", fontSize: 13, cursor: "pointer",
                        textDecoration: "underline", padding: "8px",
                        textAlign: "center",
                      }}
                    >
                      メールアドレスで続ける
                    </button>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <input
                        type="email"
                        value={voterEmail}
                        onChange={e => setVoterEmail(e.target.value)}
                        placeholder="メールアドレスを入力"
                        style={{
                          width: "100%", padding: "12px 14px", borderRadius: 12,
                          border: "1.5px solid rgba(196,163,90,0.27)",
                          background: "#16213E", color: "#FAFAF7",
                          fontSize: 14, marginBottom: 10,
                          boxSizing: "border-box",
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={handleEmailSendCode}
                        disabled={emailCodeSending || !voterEmail.trim() || !voterEmail.includes('@')}
                        style={{
                          ...S.primaryBtn,
                          opacity: emailCodeSending || !voterEmail.trim() || !voterEmail.includes('@') ? 0.4 : 1,
                        }}
                      >
                        {emailCodeSending ? '送信中...' : '確認コードを送信'}
                      </button>
                    </div>
                  )
                )}

                {/* メール確認コード入力 */}
                {!showFallback && emailCodeStep === 'verify' && (
                  <div style={{ animation: "fadeUp .18s ease" }}>
                    <div style={{
                      color: "#C4A35A", fontSize: 14, fontWeight: 600,
                      textAlign: "center", marginBottom: 6,
                    }}>
                      確認コードを送信しました
                    </div>
                    <div style={{
                      color: "#8B8B9A", fontSize: 12, textAlign: "center",
                      marginBottom: 16,
                    }}>
                      {voterEmail} に届いた6桁のコードを入力
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={emailCode}
                      onChange={e => setEmailCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      autoFocus
                      style={{
                        width: "100%", padding: "14px", borderRadius: 12,
                        border: "1.5px solid rgba(196,163,90,0.27)",
                        background: "#16213E", color: "#FAFAF7",
                        fontSize: 24, textAlign: "center",
                        letterSpacing: 8, marginBottom: 10,
                        boxSizing: "border-box", outline: "none",
                      }}
                    />
                    <button
                      onClick={handleEmailVerifyCode}
                      disabled={emailCodeVerifying || emailCode.length < 6}
                      style={{
                        ...S.primaryBtn,
                        opacity: emailCodeVerifying || emailCode.length < 6 ? 0.5 : 1,
                      }}
                    >
                      {emailCodeVerifying ? '確認中...' : '認証して送信する'}
                    </button>
                    <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8 }}>
                      <button
                        onClick={() => {
                          if (emailResendCooldown > 0) return
                          handleEmailSendCode()
                        }}
                        disabled={emailResendCooldown > 0 || emailCodeSending}
                        style={{
                          background: "transparent", border: "none",
                          color: emailResendCooldown > 0 ? "#555" : "#C4A35A",
                          fontSize: 13, cursor: emailResendCooldown > 0 ? "default" : "pointer",
                          textDecoration: "underline", padding: "4px",
                        }}
                      >
                        {emailResendCooldown > 0 ? `再送信(${emailResendCooldown}秒)` : 'コードを再送信する'}
                      </button>
                      <button
                        onClick={() => { setEmailCodeStep('input'); setEmailCode(''); setError(''); }}
                        style={{
                          background: "transparent", border: "none",
                          color: "#8B8B9A", fontSize: 13, cursor: "pointer",
                          padding: "4px",
                        }}
                      >
                        メールアドレスを変更
                      </button>
                    </div>
                  </div>
                )}

                {/* ── フォールバック認証リンク ── */}
                {!showFallback && phoneStep === 'input' && emailCodeStep === 'input' && (
                  <div style={{ textAlign: "center" }}>
                    <button
                      onClick={() => { setShowFallback(true); setShowPhoneInput(false); }}
                      style={{
                        background: "transparent", border: "none",
                        color: "rgba(139,139,154,0.42)", fontSize: 12,
                        cursor: "pointer", padding: "4px",
                      }}
                    >
                      認証がうまくいかない方はこちら
                    </button>
                  </div>
                )}

                {/* ── フォールバックフォーム ── */}
                {showFallback && (
                  <div style={{ animation: "fadeUp .18s ease" }}>
                    <button
                      onClick={() => setShowFallback(false)}
                      style={{
                        background: "transparent", border: "none",
                        color: "#8B8B9A", fontSize: 13, cursor: "pointer",
                        marginBottom: 14, padding: 0,
                      }}
                    >
                      ← 戻る
                    </button>

                    <div style={{ marginBottom: 14 }}>
                      <label style={{ color: "rgba(250,250,247,0.55)", fontSize: 12, marginBottom: 6, display: "block" }}>
                        お名前
                      </label>
                      <input
                        type="text"
                        value={fallbackName}
                        onChange={e => setFallbackName(e.target.value)}
                        placeholder="田中 花子"
                        style={{
                          width: "100%", padding: "13px 14px", borderRadius: 10,
                          border: `1.5px solid ${fallbackName.trim().length >= 2 ? "rgba(196,163,90,0.5)" : "rgba(255,255,255,0.12)"}`,
                          background: "#16213E", color: "#FAFAF7",
                          fontSize: 15, boxSizing: "border-box", outline: "none",
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 18 }}>
                      <label style={{ color: "rgba(250,250,247,0.55)", fontSize: 12, marginBottom: 6, display: "block" }}>
                        携帯番号
                      </label>
                      <input
                        type="tel"
                        value={fallbackPhone}
                        onChange={e => {
                          const d = e.target.value.replace(/\D/g, '').slice(0, 11)
                          if (d.length <= 3) setFallbackPhone(d)
                          else if (d.length <= 7) setFallbackPhone(`${d.slice(0,3)}-${d.slice(3)}`)
                          else setFallbackPhone(`${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`)
                        }}
                        placeholder="090-1234-5678"
                        style={{
                          width: "100%", padding: "13px 14px", borderRadius: 10,
                          border: "1.5px solid rgba(255,255,255,0.12)",
                          background: "#16213E", color: "#FAFAF7",
                          fontSize: 15, boxSizing: "border-box", outline: "none",
                          letterSpacing: 1,
                        }}
                      />
                      <div style={{ color: "#8B8B9A", fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
                        📨 回答後、この番号にアカウント登録のご案内をお送りします
                      </div>
                    </div>

                    <button
                      onClick={handleFallbackSubmit}
                      disabled={
                        fallbackName.trim().length < 2 ||
                        fallbackPhone.replace(/\D/g, '').length < 10
                      }
                      style={{
                        ...S.primaryBtn,
                        opacity: (
                          fallbackName.trim().length < 2 ||
                          fallbackPhone.replace(/\D/g, '').length < 10
                        ) ? 0.4 : 1,
                      }}
                    >
                      回答を送信する →
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 16, textAlign: "center" }}>
              <span style={{ color: "#8B8B9A", fontSize: 11 }}>
                ※ 匿名です。プロに連絡先は公開されません。
              </span>
            </div>
            </>
            )}
          </div>
        </StepWrapper>
      )}

      {/* ── STEP 6: 完了・リワード開示 ── */}
      {voteStep === "done" && (
        <StepWrapper isTransitioning={isTransitioning} showBack={false}>
          <div style={{ textAlign: "center", width: "100%" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
            <div style={S.title}>回答が完了しました！</div>
            <div style={S.subtitle}>
              あなたの声が、{pro.name}さんの<br />
              実力の証明になります。
            </div>

            {isFallbackVote ? (
              <div style={{ width: "100%" }}>
                <div style={{
                  background: "rgba(196,163,90,0.07)",
                  border: "1px solid rgba(196,163,90,0.2)",
                  borderRadius: 12, padding: "14px",
                  marginBottom: 16, textAlign: "left",
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, color: "#C4A35A", fontSize: 14 }}>
                    リワードを保存しませんか？
                  </div>
                  <div style={{ color: "#FAFAF7", fontSize: 13, lineHeight: 1.7 }}>
                    アカウントを作ると、リワードをいつでも確認できます。
                  </div>
                </div>

                {/* SMS認証で登録 */}
                <button
                  onClick={() => {
                    setPhoneNumber(fallbackPhone)
                    setShowPhoneInput(true)
                    setPhoneStep('input')
                    goTo('auth')
                  }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    width: "100%", padding: "14px", borderRadius: 12,
                    background: "rgba(74,144,217,0.1)",
                    border: "1.5px solid rgba(74,144,217,0.4)",
                    cursor: "pointer", marginBottom: 8, color: "#FAFAF7",
                    fontSize: 14, fontWeight: 700,
                  }}
                >
                  📱 SMS認証を完了する
                </button>

                {/* LINE登録 */}
                <button
                  onClick={() => handleLineVote()}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    width: "100%", padding: "13px", borderRadius: 12,
                    background: "#06C755", border: "none",
                    cursor: "pointer", marginBottom: 8,
                  }}
                >
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="white">
                    <path d="M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                  </svg>
                  <span style={{ color: "white", fontSize: 14, fontWeight: 700 }}>LINEで登録</span>
                </button>

                {/* Google登録 */}
                <button
                  onClick={() => handleGoogleVote()}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    width: "100%", padding: "12px", borderRadius: 12,
                    background: "rgba(255,255,255,0.04)",
                    border: "1.5px solid rgba(255,255,255,0.14)",
                    cursor: "pointer", marginBottom: 8,
                  }}
                >
                  <svg width={16} height={16} viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span style={{ color: "#8B8B9A", fontSize: 13 }}>Googleで登録</span>
                </button>

                {/* このまま閉じる */}
                <button
                  onClick={() => { window.location.href = "/" }}
                  style={{
                    width: "100%", padding: "10px", borderRadius: 12,
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#8B8B9A", fontSize: 13, cursor: "pointer",
                  }}
                >
                  このまま閉じる
                </button>
              </div>
            ) : (
              <button
                onClick={() => { window.location.href = "/mycard" }}
                style={S.primaryBtn}
              >
                マイページでリワードを保存する
              </button>
            )}
          </div>
        </StepWrapper>
      )}

      {/* ── hopeful完了画面 ── */}
      {voteStep === "hopeful_done" && (
        <StepWrapper isTransitioning={isTransitioning} showBack={false}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>💫</div>
            <div style={S.title}>気持ちが届きました！</div>
            <div style={{
              color: "#FAFAF7", fontSize: 14, lineHeight: 1.9, marginBottom: 8,
            }}>
              「期待できそう！」を<br />
              <span style={{ color: "#C4A35A", fontWeight: 600 }}>
                {pro.name}
              </span>
              さんに送りました。
            </div>
            <div style={{ color: "#8B8B9A", fontSize: 12, lineHeight: 1.8 }}>
              ぜひ一度セッションを受けてみてください。<br />
              受けた後にまた回答できます ✨
            </div>
          </div>
        </StepWrapper>
      )}

      </div>{/* zoom ラッパー閉じ */}
    </>
  )
}

export default function VotePage() {
  return (
    <Suspense fallback={<div className="text-center py-16">読み込み中...</div>}>
      <VoteForm />
    </Suspense>
  )
}
