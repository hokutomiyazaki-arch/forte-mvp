'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Professional, getRewardLabel } from '@/lib/types'
import { Suspense } from 'react'
// AuthMethodSelector は login ページで使用。投票ページはフォーム内のためインライン実装

interface ProofItem {
  id: string
  label: string
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

// ── メインフォーム ──
function VoteForm() {
  const params = useParams()
  const searchParams = useSearchParams()
  const proId = params.id as string
  const qrToken = searchParams.get('token')
  const supabase = createClient()
  const { user: authUser, isLoaded: authLoaded } = useAuth()

  // 基本 state
  const [pro, setPro] = useState<Professional | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [alreadyVoted, setAlreadyVoted] = useState(false)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [submittedVoteId, setSubmittedVoteId] = useState('')
  const [submittedToken, setSubmittedToken] = useState('')
  const [showEmailFix, setShowEmailFix] = useState(false)
  const [fixEmail, setFixEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  // セッション（ログイン済みユーザー）
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  // フォーム state
  const [sessionCount, setSessionCount] = useState<'first' | 'repeat' | ''>('')
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

  useEffect(() => {
    async function load() {
      // LINE/Google認証からのエラーハンドリング
      const authError = searchParams.get('error')
      if (authError === 'already_voted') {
        setAlreadyVoted(true)
      } else if (authError === 'self_vote') {
        setError('ご自身のプルーフには投票できません')
      } else if (authError === 'line_cancelled') {
        setError('LINE認証がキャンセルされました')
      } else if (authError === 'line_expired') {
        setError('認証の有効期限が切れました。もう一度お試しください。')
      }

      // QRトークン期限チェック
      if (qrToken) {
        const { data: tokenData } = await (supabase as any)
          .from('qr_tokens')
          .select('expires_at')
          .eq('token', qrToken)
          .maybeSingle()

        if (!tokenData) {
          setTokenExpired(true)
          setLoading(false)
          return
        }

        const expiresAt = new Date(tokenData.expires_at)
        if (expiresAt < new Date()) {
          setTokenExpired(true)
          setLoading(false)
          return
        }
      }

      // プロ情報取得
      const { data: proData } = await (supabase as any)
        .from('professionals')
        .select('*')
        .eq('id', proId)
        .maybeSingle()
      if (proData) setPro(proData)

      // 強み未設定チェック → 準備中ページにリダイレクト
      if (proData) {
        const proofsList: string[] = proData.selected_proofs || []
        if (proofsList.length === 0) {
          // プロに通知メールを送信（バックグラウンド）
          fetch('/api/nfc-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ professional_id: proId }),
          }).catch(() => {})
          // 準備中ページへリダイレクト
          window.location.href = `/vote/preparing/${proId}`
          return
        }
      }

      if (proData) {
        // 強みプルーフ: プロが選んだ proof_items を取得
        const selectedProofs: string[] = proData.selected_proofs || []
        const regularProofIds = selectedProofs.filter(id => !id.startsWith('custom_'))
        if (regularProofIds.length > 0) {
          const { data: piData } = await (supabase as any)
            .from('proof_items')
            .select('id, label, strength_label, sort_order')
            .in('id', regularProofIds)
            .order('sort_order')
          if (piData) setProofItems(piData)
        }

        // カスタムプルーフ
        if (proData.custom_proofs && proData.custom_proofs.length > 0) {
          setCustomProofs(proData.custom_proofs)
        }

        // リワード取得
        const { data: rewardData } = await (supabase as any)
          .from('rewards')
          .select('id, reward_type, title')
          .eq('professional_id', proId)
          .order('sort_order')
        if (rewardData && rewardData.length > 0) {
          setProRewards(rewardData)
          // 最初のリワードをデフォルト選択
          setSelectedRewardId(rewardData[0].id)
        }
      }

      // 人柄プルーフ: 全10項目取得
      const { data: persItems } = await (supabase as any)
        .from('personality_items')
        .select('id, label, personality_label, sort_order')
        .order('sort_order')
      if (persItems) setPersonalityItems(persItems)

      // セッション確認（AuthProviderから取得）
      const sessionUser = authUser
      if (sessionUser?.email) {
        setSessionEmail(sessionUser.email)
        setIsLoggedIn(true)
        // ログイン済みならセッションメールで重複投票チェック
        const { data: existing } = await (supabase as any)
          .from('votes')
          .select('id')
          .eq('professional_id', proId)
          .eq('voter_email', sessionUser.email)
          .maybeSingle()
        if (existing) setAlreadyVoted(true)
      } else {
        // 未ログイン: ローカルストレージからメアド復元
        const savedEmail = localStorage.getItem('proof_voter_email')
        if (savedEmail) {
          setVoterEmail(savedEmail)
          // 既に投票済みかチェック
          const { data: existing } = await (supabase as any)
            .from('votes')
            .select('id')
            .eq('professional_id', proId)
            .eq('voter_email', savedEmail)
            .maybeSingle()
          if (existing) setAlreadyVoted(true)
        }
      }

      setLoading(false)
    }
    load()
  }, [proId, authLoaded, authUser])

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
      session_count: sessionCount,
      qr_token: qrToken,
    }
  }

  // ── LINE認証で投票 ──
  function handleLineVote() {
    if (!sessionCount) {
      setError('セッション回数を選択してください')
      return
    }
    if (proRewards.length > 0 && !selectedRewardId) {
      setError('リワードを選択してください')
      return
    }
    setError('')
    // サーバーサイドAPI経由でLINE認証URLにリダイレクト
    const voteData = buildVoteData()
    const voteDataParam = encodeURIComponent(JSON.stringify(voteData))
    window.location.href = `/api/auth/line?context=vote&professional_id=${proId}&qr_token=${qrToken || ''}&vote_data=${voteDataParam}`
  }

  // ── Google認証で投票 ──
  function handleGoogleVote() {
    if (!sessionCount) {
      setError('セッション回数を選択してください')
      return
    }
    if (proRewards.length > 0 && !selectedRewardId) {
      setError('リワードを選択してください')
      return
    }
    setError('')
    // TODO: Google OAuth投票フロー（Phase 2で実装）
    // 現時点ではメールでの投票を促す
    setError('Google認証での投票は準備中です。メールアドレスで投票してください。')
  }

  // ── 投票送信（メール認証用） ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // バリデーション
    if (!sessionCount) {
      setError('セッション回数を選択してください')
      return
    }

    // メール: ログイン済みならセッションから、未ログインならフォーム入力値
    const email = isLoggedIn
      ? (sessionEmail || '').trim().toLowerCase()
      : voterEmail.trim().toLowerCase()

    if (!email || !email.includes('@')) {
      setError('メールアドレスを入力してください')
      return
    }
    if (/https?:\/\/|www\./i.test(email)) {
      setError('正しいメールアドレスを入力してください')
      return
    }

    // 自己投票チェック（メールアドレスベース）
    try {
      const checkRes = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, proId }),
      })
      if (!checkRes.ok) {
        setError('投票の確認中にエラーが発生しました。もう一度お試しください。')
        return
      }
      const checkData = await checkRes.json()
      if (checkData.isSelf) {
        setError('ご自身のプルーフには投票できません')
        return
      }
    } catch (err) {
      console.error('[vote] check-email error:', err)
      setError('投票の確認中にエラーが発生しました。もう一度お試しください。')
      return
    }

    // 30分クールダウン
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: recentVote } = await (supabase as any)
      .from('votes')
      .select('created_at')
      .eq('professional_id', proId)
      .gt('created_at', thirtyMinAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentVote) {
      const nextAvailable = new Date(new Date(recentVote.created_at).getTime() + 30 * 60 * 1000)
      const waitMin = Math.ceil((nextAvailable.getTime() - Date.now()) / 60000)
      setError(`このプロへのプルーフは30分に1件まで。あと約${waitMin}分お待ちください。`)
      return
    }

    // メアドをローカルストレージに保存（未ログイン時のみ）
    if (!isLoggedIn) {
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

    console.log('[handleSubmit] proof IDs:', { uuidProofIds, customProofIds, proofIdsToSend })

    // 投票INSERT
    const { data: voteData, error: voteError } = await (supabase as any).from('votes').insert({
      professional_id: proId,
      voter_email: email,
      client_user_id: null,
      session_count: sessionCount,
      vote_type: voteType,
      selected_proof_ids: proofIdsToSend,
      selected_personality_ids: selectedPersonalityIds.size > 0 ? Array.from(selectedPersonalityIds) : null,
      selected_reward_id: selectedRewardId || null,
      comment: comment.trim() || null,
      qr_token: qrToken,
      status: 'pending',
    }).select().single()

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
        setError('このメールアドレスでは既に投票済みです')
      } else {
        setError(`送信に失敗しました (${voteError.code || 'unknown'}): ${voteError.message || '不明なエラー'}`)
      }
      return
    }

    console.log('[handleSubmit] Vote INSERT OK - vote_id:', voteData.id)

    // メアドをPROOFリストに保存
    const { error: emailInsertError } = await (supabase as any).from('vote_emails').insert({
      email,
      professional_id: proId,
      source: 'vote',
    })
    if (emailInsertError) {
      console.error('[handleSubmit] vote_emails INSERT error:', emailInsertError)
    }

    // 確認トークンを作成
    const { data: confirmation, error: confirmError } = await (supabase as any)
      .from('vote_confirmations')
      .insert({ vote_id: voteData.id })
      .select()
      .single()

    if (confirmError) {
      console.error('[handleSubmit] vote_confirmations INSERT error:', confirmError)
    }

    // リワード選択をclient_rewardsに保存
    if (selectedRewardId && voteData) {
      const { error: rewardInsertError } = await (supabase as any).from('client_rewards').insert({
        vote_id: voteData.id,
        reward_id: selectedRewardId,
        professional_id: proId,
        client_email: email,
        status: 'pending',
      })
      if (rewardInsertError) {
        console.error('[handleSubmit] client_rewards INSERT error:', rewardInsertError)
      }
    }

    // 確認メール送信
    if (confirmation) {
      setSubmittedVoteId(voteData.id)
      setSubmittedToken(confirmation.token)
      try {
        const emailRes = await fetch('/api/send-confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            proName: pro!.name,
            token: confirmation.token,
          }),
        })
        if (!emailRes.ok) {
          console.error('[handleSubmit] send-confirmation API error:', emailRes.status, await emailRes.text())
        } else {
          console.log('[handleSubmit] Confirmation email sent OK')
        }
      } catch (err) {
        console.error('[handleSubmit] Confirmation email send failed:', err)
      }
    } else {
      console.error('[handleSubmit] No confirmation created - skipping email send')
    }

    setSubmitted(true)
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
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">投票済みです</h1>
        <p className="text-gray-500 mb-6">{pro.name}さんへのプルーフは既に送信済みです。</p>
        <a href={`/card/${pro.id}`} className="text-[#C4A35A] underline">
          {pro.name}さんのカードを見る
        </a>
      </div>
    )
  }

  // ── メールアドレス修正+再送信 ──
  async function handleResend() {
    const newEmail = fixEmail.trim().toLowerCase()
    if (!newEmail || !newEmail.includes('@')) return
    setResending(true)
    setResendMessage('')

    const { error: updateError } = await (supabase as any)
      .from('votes')
      .update({ voter_email: newEmail })
      .eq('id', submittedVoteId)
    if (updateError) {
      setResendMessage('メールアドレスの更新に失敗しました。')
      setResending(false)
      return
    }

    localStorage.setItem('proof_voter_email', newEmail)
    setVoterEmail(newEmail)

    try {
      await fetch('/api/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          proName: pro!.name,
          token: submittedToken,
        }),
      })
      setResendMessage('再送信しました。新しいメールアドレスをご確認ください。')
      setShowEmailFix(false)
    } catch {
      setResendMessage('再送信に失敗しました。もう一度お試しください。')
    }
    setResending(false)
  }

  // ── 投票完了画面 ──
  if (submitted) {
    const displayEmail = isLoggedIn ? sessionEmail : voterEmail
    const emailDomain = (displayEmail || '').split('@')[1] || ''

    const MAIL_LINKS: Record<string, { label: string; url: string }> = {
      'gmail.com': { label: 'Gmailを開く', url: 'https://mail.google.com' },
      'yahoo.co.jp': { label: 'Yahoo!メールを開く', url: 'https://mail.yahoo.co.jp' },
      'icloud.com': { label: 'iCloudメールを開く', url: 'https://www.icloud.com/mail' },
      'outlook.com': { label: 'Outlookを開く', url: 'https://outlook.live.com' },
      'hotmail.com': { label: 'Outlookを開く', url: 'https://outlook.live.com' },
      'docomo.ne.jp': { label: 'ドコモメールを開く', url: 'https://mail.smt.docomo.ne.jp' },
      'softbank.ne.jp': { label: 'ソフトバンクメールを開く', url: 'https://webmail.softbank.jp' },
      'ezweb.ne.jp': { label: 'auメールを開く', url: 'mailto:' },
      'au.com': { label: 'auメールを開く', url: 'mailto:' },
    }
    const mailLink = MAIL_LINKS[emailDomain]

    return (
      <>
        {/* ナビバー・フッターを非表示にする */}
        <style>{`
          nav, footer { display: none !important; }
          main { padding: 0 !important; max-width: 100% !important; }
        `}</style>

        <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            {/* メールアイコン */}
            <div className="text-6xl mb-6">✉️</div>

            <h1 className="text-2xl font-bold text-[#1A1A2E] mb-3">
              メールを確認してください
            </h1>

            <p className="text-base text-gray-600 mb-6">
              <span className="font-bold text-[#1A1A2E]">{displayEmail}</span><br />
              宛に確認メールを送りました
            </p>

            {/* ステップ説明 */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6 text-left">
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#1A1A2E] text-[#C4A35A] flex items-center justify-center flex-shrink-0 font-bold text-sm">1</div>
                  <p className="text-base text-[#1A1A2E] pt-1">メールアプリを開く</p>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#1A1A2E] text-[#C4A35A] flex items-center justify-center flex-shrink-0 font-bold text-sm">2</div>
                  <p className="text-base text-[#1A1A2E] pt-1">REALPROOFからのメールを見つける</p>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#1A1A2E] text-[#C4A35A] flex items-center justify-center flex-shrink-0 font-bold text-sm">3</div>
                  <p className="text-base text-[#1A1A2E] pt-1">メール内のボタンを押す</p>
                </div>
              </div>
            </div>

            {/* メールアプリへの直接リンクボタン */}
            {mailLink ? (
              <a
                href={mailLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-4 bg-[#C4A35A] text-white text-lg font-bold rounded-xl hover:bg-[#b3923f] transition mb-6 shadow-lg"
              >
                {mailLink.label} →
              </a>
            ) : (
              <p className="text-base text-gray-500 mb-6">メールアプリを開いてください</p>
            )}

            {/* メールが届かない場合 */}
            <div className="bg-white rounded-xl p-4 mb-6 text-left text-sm text-gray-500 space-y-2">
              <p className="font-medium text-[#1A1A2E]">メールが届かない場合:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>迷惑メールフォルダを確認してください</li>
              </ul>

              {/* 未ログイン: メアド修正+再送信 */}
              {!isLoggedIn && (
                <>
                  {!showEmailFix ? (
                    <button
                      onClick={() => { setShowEmailFix(true); setFixEmail(voterEmail) }}
                      className="text-[#C4A35A] underline font-medium mt-2 inline-block"
                    >
                      メールを再送信する
                    </button>
                  ) : (
                    <div className="mt-3 bg-[#FAFAF7] rounded-lg p-3">
                      <p className="text-sm font-medium text-[#1A1A2E] mb-2">メールアドレスを修正して再送信</p>
                      <input
                        type="email"
                        value={fixEmail}
                        onChange={e => setFixEmail(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none mb-2 text-base"
                        placeholder="正しいメールアドレス"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleResend}
                          disabled={resending || !fixEmail.trim()}
                          className="flex-1 py-2 bg-[#C4A35A] text-white text-sm font-medium rounded-lg hover:bg-[#b3923f] transition disabled:opacity-50"
                        >
                          {resending ? '送信中...' : '再送信する'}
                        </button>
                        <button
                          onClick={() => setShowEmailFix(false)}
                          className="px-4 py-2 bg-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-300 transition"
                        >
                          閉じる
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ログイン済み: 再送信のみ */}
              {isLoggedIn && (
                <button
                  onClick={async () => {
                    setResending(true)
                    setResendMessage('')
                    try {
                      await fetch('/api/send-confirmation', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          email: sessionEmail,
                          proName: pro!.name,
                          token: submittedToken,
                        }),
                      })
                      setResendMessage('再送信しました。メールをご確認ください。')
                    } catch {
                      setResendMessage('再送信に失敗しました。')
                    }
                    setResending(false)
                  }}
                  disabled={resending}
                  className="text-[#C4A35A] underline font-medium mt-2 inline-block disabled:opacity-50"
                >
                  {resending ? '送信中...' : 'メールを再送信する'}
                </button>
              )}

              {resendMessage && (
                <div className={`mt-2 p-2 rounded-lg text-sm ${
                  resendMessage.includes('再送信しました') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {resendMessage}
                </div>
              )}
            </div>

            {/* 警告メッセージ */}
            <p className="text-red-500 font-bold text-base">
              ※ メールを確認するまで投票は完了しません
            </p>
          </div>
        </div>
      </>
    )
  }

  // ── 投票フォーム ──
  const proofCount = isHopeful ? 1 : selectedProofIds.size
  const personalityCount = selectedPersonalityIds.size
  const rewardCount = selectedRewardId ? 1 : 0
  const hasRewards = proRewards.length > 0
  const rewardSatisfied = !hasRewards || !!selectedRewardId
  const emailSatisfied = isLoggedIn
    ? !!sessionEmail
    : (voterEmail.trim().length > 0 && voterEmail.includes('@'))
  const canSubmit = !!sessionCount && emailSatisfied && rewardSatisfied

  // 強みプルーフの表示項目（プロが設定した9項目）
  const allProofDisplayItems = [
    ...proofItems.map(p => ({ id: p.id, label: p.label, isCustom: false })),
    ...customProofs.filter(c => c.label?.trim()).map(c => ({ id: c.id, label: c.label, isCustom: true })),
  ]

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* プロ情報ヘッダー */}
        <div className="text-center mb-8">
          {pro.photo_url && (
            <img
              src={pro.photo_url}
              alt={pro.name}
              className="w-20 h-20 rounded-full mx-auto mb-3 object-cover border-2 border-[#C4A35A]"
            />
          )}
          <h1 className="text-xl font-bold text-[#1A1A2E]">{pro.name}</h1>
          {pro.title && <p className="text-sm text-gray-500">{pro.title}</p>}
          {isLoggedIn && sessionEmail && (
            <p className="text-xs text-gray-400 mt-2">
              ✓ {sessionEmail} でログイン中
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── 1. リワード選択（常時展開、必須） ── */}
          {hasRewards && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-[#1A1A2E]">
                  リワードを選ぶ <span className="text-red-400">*</span>
                </p>
                <span className="text-xs text-[#9CA3AF]">{rewardCount}/1</span>
              </div>
              <div className="space-y-2">
                {proRewards.map(reward => {
                  const isSelected = selectedRewardId === reward.id
                  const displayLabel = reward.reward_type === 'surprise'
                    ? 'シークレット — 何が出るかお楽しみ！'
                    : reward.title && (reward.reward_type === 'selfcare' || reward.reward_type === 'freeform')
                      ? reward.title
                      : getRewardLabel(reward.reward_type)
                  return (
                    <label
                      key={reward.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#FAFAF7]' : 'hover:bg-[#FAFAF7]'
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        <input
                          type="radio"
                          name="reward"
                          value={reward.id}
                          checked={isSelected}
                          onChange={() => setSelectedRewardId(isSelected ? '' : reward.id)}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'border-[#C4A35A]'
                            : 'border-[#E5E7EB]'
                        }`}>
                          {isSelected && (
                            <div className="w-2.5 h-2.5 rounded-full bg-[#C4A35A]" />
                          )}
                        </div>
                      </div>
                      <span className={`text-sm ${isSelected ? 'text-[#1A1A2E] font-medium' : 'text-[#1A1A2E]'}`}>
                        {displayLabel}
                      </span>
                    </label>
                  )
                })}
              </div>
              <p className="text-xs text-[#9CA3AF] mt-3">
                リワードの内容は投票後に開示されます
              </p>
            </div>
          )}

          {/* ── 2. セッション回数セレクター ── */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-sm font-bold text-[#1A1A2E] mb-3">
              {pro.name}さんのセッションは？
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'first' as const, label: '1回目' },
                { value: 'repeat' as const, label: '2回目以降' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSessionCount(opt.value)}
                  className={`py-3 px-4 rounded-lg text-sm font-medium border-2 transition-colors ${
                    sessionCount === opt.value
                      ? 'border-[#C4A35A] bg-[#1A1A2E] text-[#C4A35A]'
                      : 'border-[#E5E7EB] bg-white text-[#1A1A2E] hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── 2. 強みプルーフ（アコーディオン） ── */}
          <Accordion
            title="強みプルーフ"
            count={proofCount}
            max={MAX_PROOF}
            isOpen={accordionOpen.proof}
            onToggle={() => setAccordionOpen(prev => ({ ...prev, proof: !prev.proof }))}
          >
            <p className="text-sm text-gray-500 mb-2">{pro.name}さんの強みを0〜3つ選んでください</p>
            <p className="text-xs text-gray-400 mb-3">選ばなくてもOKです</p>
            {allProofDisplayItems.length > 0 ? (
              <div className="space-y-2">
                {allProofDisplayItems.map(item => {
                  const isChecked = selectedProofIds.has(item.id)
                  const isDisabled = isHopeful || (!isChecked && selectedProofIds.size >= MAX_PROOF)
                  return (
                    <label
                      key={item.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-[#FAFAF7]'
                      } ${isChecked ? 'bg-[#FAFAF7]' : ''}`}
                    >
                      <div className="relative flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => toggleProofId(item.id)}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                          isChecked
                            ? 'bg-[#C4A35A] border-[#C4A35A]'
                            : 'bg-white border-[#E5E7EB]'
                        }`}>
                          {isChecked && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <span className="text-sm text-[#1A1A2E]">{item.label}</span>
                    </label>
                  )
                })}
              </div>
            ) : null}

            {/* 区切り線 + 期待できそう！ */}
            <div className="border-t border-[#E5E7EB] mt-3 pt-3">
              <label
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  selectedProofIds.size > 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-[#FAFAF7]'
                } ${isHopeful ? 'bg-[#FAFAF7]' : ''}`}
              >
                <div className="relative flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={isHopeful}
                    disabled={selectedProofIds.size > 0}
                    onChange={toggleHopeful}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                    isHopeful
                      ? 'bg-[#C4A35A] border-[#C4A35A]'
                      : 'bg-white border-[#E5E7EB]'
                  }`}>
                    {isHopeful && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-[#1A1A2E]">期待できそう！</span>
              </label>
              {isHopeful && (
                <p className="text-xs text-[#9CA3AF] ml-11 mt-1">
                  「期待できそう！」を選ぶと他の項目は選択できません
                </p>
              )}
              {selectedProofIds.size > 0 && (
                <p className="text-xs text-[#9CA3AF] ml-11 mt-1">
                  他の項目を選択中は「期待できそう！」は選択できません
                </p>
              )}
            </div>
          </Accordion>

          {/* ── 3. 人柄プルーフ（アコーディオン） ── */}
          <Accordion
            title="人柄プルーフ"
            count={personalityCount}
            max={MAX_PERSONALITY}
            isOpen={accordionOpen.personality}
            onToggle={() => setAccordionOpen(prev => ({ ...prev, personality: !prev.personality }))}
          >
            <p className="text-sm text-gray-500 mb-2">{pro.name}さんの人柄を0〜3つ選んでください</p>
            <p className="text-xs text-gray-400 mb-3">選ばなくてもOKです</p>
            <div className="space-y-2">
              {personalityItems.map(item => {
                const isChecked = selectedPersonalityIds.has(item.id)
                const isDisabled = !isChecked && selectedPersonalityIds.size >= MAX_PERSONALITY
                return (
                  <label
                    key={item.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-[#FAFAF7]'
                    } ${isChecked ? 'bg-[#FAFAF7]' : ''}`}
                  >
                    <div className="relative flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isDisabled}
                        onChange={() => togglePersonalityId(item.id)}
                        className="sr-only"
                      />
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                        isChecked
                          ? 'bg-[#C4A35A] border-[#C4A35A]'
                          : 'bg-white border-[#E5E7EB]'
                      }`}>
                        {isChecked && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-[#1A1A2E]">{item.label}</span>
                  </label>
                )
              })}
            </div>
          </Accordion>

          {/* ── 4. ひとことコメント ── */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="block text-sm font-bold text-[#1A1A2E] mb-1">
              ひとことコメント（任意）
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={100}
              rows={2}
              className="w-full px-3 py-2.5 bg-[#FAFAF7] border border-[#E5E7EB] rounded-lg text-sm focus:ring-2 focus:ring-[#C4A35A] focus:border-[#C4A35A] outline-none resize-none"
              placeholder="このプロへのメッセージ（100文字以内）"
            />
            <p className="text-xs text-[#9CA3AF] text-right mt-1">{comment.length}/100</p>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* ── 5. 認証方法選択 / 送信 ── */}
          {!isLoggedIn ? (
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <p className="text-sm font-bold text-[#1A1A2E] mb-1">プルーフを送信する</p>

              {/* LINE ボタン */}
              <button
                type="button"
                onClick={handleLineVote}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl text-white font-bold text-base transition-all hover:opacity-90"
                style={{ backgroundColor: '#06C755' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                </svg>
                LINE連携で投票する
              </button>

              {/* Google ボタン */}
              <button
                type="button"
                onClick={handleGoogleVote}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-bold text-base border-2 border-gray-300 bg-white text-gray-700 transition-all hover:bg-gray-50"
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google連携で投票する
              </button>

              {/* Divider */}
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-400">または</span>
                </div>
              </div>

              {/* メールアドレス入力 */}
              <div>
                <input
                  type="email"
                  value={voterEmail}
                  onChange={e => setVoterEmail(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#FAFAF7] border border-[#E5E7EB] rounded-lg text-sm focus:ring-2 focus:ring-[#C4A35A] focus:border-[#C4A35A] outline-none"
                  placeholder="メールアドレスで送信する"
                />
              </div>

              {/* メール送信ボタン */}
              <button
                type="submit"
                disabled={!canSubmit}
                className={`w-full py-3.5 rounded-xl text-sm font-medium tracking-wider transition-colors ${
                  canSubmit
                    ? 'bg-[#1A1A2E] text-[#C4A35A] hover:bg-[#2a2a4e]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                メールで送信する
              </button>

              <p className="text-center text-[#9CA3AF] text-xs">
                ※ 投票は匿名です。プロにメールアドレスは公開されません。
              </p>
            </div>
          ) : (
            /* ── ログイン済みユーザー用送信ボタン ── */
            <div>
              <button
                type="submit"
                disabled={!canSubmit}
                className={`w-full py-3.5 rounded-xl text-sm font-medium tracking-wider transition-colors ${
                  canSubmit
                    ? 'bg-[#1A1A2E] text-[#C4A35A] hover:bg-[#2a2a4e]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                投票する
              </button>
              {!canSubmit && (
                <p className="text-xs text-[#9CA3AF] text-center mt-2">
                  {hasRewards ? 'リワードとセッション回数を選択してください' : 'セッション回数を選択してください'}
                </p>
              )}
            </div>
          )}

        </form>
      </div>
    </div>
  )
}

export default function VotePage() {
  return (
    <Suspense fallback={<div className="text-center py-16">読み込み中...</div>}>
      <VoteForm />
    </Suspense>
  )
}
