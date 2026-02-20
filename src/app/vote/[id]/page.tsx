'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Professional, getRewardLabel } from '@/lib/types'
import { Suspense } from 'react'

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
        }
      }

      // 人柄プルーフ: 全10項目取得
      const { data: persItems } = await (supabase as any)
        .from('personality_items')
        .select('id, label, personality_label, sort_order')
        .order('sort_order')
      if (persItems) setPersonalityItems(persItems)

      // ローカルストレージからメアド復元
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

      setLoading(false)
    }
    load()
  }, [proId])

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

  // ── 投票送信 ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // バリデーション
    if (!sessionCount) {
      setError('セッション回数を選択してください')
      return
    }
    const email = voterEmail.trim().toLowerCase()
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

    // メアドをローカルストレージに保存
    localStorage.setItem('proof_voter_email', email)

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
    return (
      <div className="max-w-md mx-auto text-center py-12 px-4">
        <div className="w-16 h-16 rounded-full bg-[#1A1A2E] flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#C4A35A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">確認メールを送信しました</h1>
        <p className="text-gray-500 mb-4">
          <span className="font-medium text-[#1A1A2E]">{voterEmail}</span> に確認メールを送信しました。<br />
          メール内のリンクをクリックして、プルーフを確定してください。
        </p>

        <div className="bg-[#FAFAF7] border border-[#C4A35A]/30 rounded-xl p-4 mb-4 text-left">
          <p className="text-xs text-gray-500">
            メールが届かない場合は、迷惑メールフォルダをご確認ください。
          </p>
        </div>

        {resendMessage && (
          <div className={`p-3 rounded-lg mb-4 text-sm ${
            resendMessage.startsWith('再送信しました') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {resendMessage}
          </div>
        )}

        {!showEmailFix ? (
          <button
            onClick={() => { setShowEmailFix(true); setFixEmail(voterEmail) }}
            className="text-sm text-gray-400 underline mb-6 inline-block"
          >
            メールが届かない場合（アドレスを修正して再送信）
          </button>
        ) : (
          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm font-medium text-[#1A1A2E] mb-2">メールアドレスを修正して再送信</p>
            <input
              type="email"
              value={fixEmail}
              onChange={e => setFixEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none mb-2"
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

        <a
          href={`/card/${pro.id}`}
          className="block w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition mb-3"
        >
          {pro.name}さんのカードを見る
        </a>
      </div>
    )
  }

  // ── 投票フォーム ──
  const proofCount = isHopeful ? 1 : selectedProofIds.size
  const personalityCount = selectedPersonalityIds.size
  const rewardCount = selectedRewardId ? 1 : 0
  const hasRewards = proRewards.length > 0
  const rewardSatisfied = !hasRewards || !!selectedRewardId
  const canSubmit = !!sessionCount && voterEmail.trim().length > 0 && voterEmail.includes('@') && rewardSatisfied

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

          {/* ── 5. メールアドレス ── */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="block text-sm font-bold text-[#1A1A2E] mb-1">
              メールアドレス <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={voterEmail}
              onChange={e => setVoterEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#FAFAF7] border border-[#E5E7EB] rounded-lg text-sm focus:ring-2 focus:ring-[#C4A35A] focus:border-[#C4A35A] outline-none"
              placeholder="your@email.com"
              required
            />
            <p className="text-xs text-[#9CA3AF] mt-1">
              投票の認証に使用します
            </p>
          </div>

          {/* リワードセクションは上部に移動済み */}

          {/* エラー表示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* ── 7. 投票ボタン ── */}
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
                {hasRewards ? 'リワード・セッション回数・メールアドレスを入力してください' : 'セッション回数とメールアドレスを入力してください'}
              </p>
            )}
          </div>

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
