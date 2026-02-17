'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Professional, getAllResultOptions, getAllPersonalityOptions, getRewardLabel } from '@/lib/types'
import { Suspense } from 'react'

function VoteForm() {
  const params = useParams()
  const searchParams = useSearchParams()
  const proId = params.id as string
  const qrToken = searchParams.get('token')
  const supabase = createClient()

  const [pro, setPro] = useState<Professional | null>(null)
  const [voterEmail, setVoterEmail] = useState('')
  const [selectedResult, setSelectedResult] = useState('')
  const [selectedPersonalities, setSelectedPersonalities] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [alreadyVoted, setAlreadyVoted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submittedVoteId, setSubmittedVoteId] = useState('')
  const [submittedToken, setSubmittedToken] = useState('')
  const [showEmailFix, setShowEmailFix] = useState(false)
  const [fixEmail, setFixEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [proRewards, setProRewards] = useState<{ id: string; reward_type: string }[]>([])
  const [selectedRewardId, setSelectedRewardId] = useState('')

  const MAX_PERSONALITY = 3

  useEffect(() => {
    async function load() {
      // プロ情報取得
      const { data: proData } = await supabase
        .from('professionals')
        .select('*')
        .eq('id', proId)
        .single()
      if (proData) setPro(proData)

      // リワード取得
      const { data: rewardData } = await (supabase as any)
        .from('rewards')
        .select('id, reward_type')
        .eq('professional_id', proId)
        .order('sort_order')
      if (rewardData && rewardData.length > 0) {
        setProRewards(rewardData)
      }

      // ローカルストレージからメアド復元（2回目以降入力不要）
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

  function togglePersonality(key: string) {
    setSelectedPersonalities(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key)
      if (prev.length >= MAX_PERSONALITY) return prev
      return [...prev, key]
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // バリデーション
    const email = voterEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      setError('メールアドレスを入力してください')
      return
    }
    if (/https?:\/\/|www\./i.test(email)) {
      setError('正しいメールアドレスを入力してください')
      return
    }
    if (!selectedResult) {
      setError('強みプルーフを1つ選んでください')
      return
    }

    // 自己投票チェック（ログインユーザーID）
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (currentUser && pro?.user_id && currentUser.id === pro.user_id) {
      setError('自分自身にはプルーフを贈れません')
      return
    }

    // 自己投票チェック（メールアドレスベース）
    try {
      const checkRes = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, proId }),
      })
      const checkData = await checkRes.json()
      if (checkData.isSelf) {
        setError('ご自身のプルーフには投票できません')
        return
      }
    } catch (err) {
      console.error('[vote] check-email error:', err)
    }

    // 30分クールダウン: このプロが最後にプルーフを受け取ってから30分以内は受付不可
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

    // 投票INSERT（pendingステータスで保存）
    const { data: voteData, error: voteError } = await (supabase as any).from('votes').insert({
      professional_id: proId,
      voter_email: email,
      client_user_id: null,
      result_category: selectedResult,
      personality_categories: selectedPersonalities,
      comment: comment.trim() || null,
      qr_token: qrToken,
      status: 'pending',
    }).select().single()

    if (voteError) {
      if (voteError.code === '23505') {
        setError('このメールアドレスでは既に投票済みです')
      } else {
        console.error('Vote error:', voteError)
        setError('送信に失敗しました。もう一度お試しください。')
      }
      return
    }

    // メアドをPROOFリストに保存
    await (supabase as any).from('vote_emails').insert({
      email,
      professional_id: proId,
      source: 'vote',
    }).then(() => {}) // エラーは無視（重複の場合）

    // 確認トークンを作成
    const { data: confirmation } = await (supabase as any)
      .from('vote_confirmations')
      .insert({ vote_id: voteData.id })
      .select()
      .single()

    // リワード選択をclient_rewardsに保存
    if (selectedRewardId && voteData) {
      await (supabase as any).from('client_rewards').insert({
        vote_id: voteData.id,
        reward_id: selectedRewardId,
        professional_id: proId,
        client_email: email,
        status: 'pending',
      })
    }

    // 確認メール送信
    if (confirmation) {
      setSubmittedVoteId(voteData.id)
      setSubmittedToken(confirmation.token)
      try {
        await fetch('/api/send-confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            proName: pro.name,
            token: confirmation.token,
          }),
        })
      } catch (err) {
        console.error('Confirmation email send failed:', err)
      }
    }

    setSubmitted(true)
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  if (!pro) {
    return <div className="text-center py-16 text-gray-400">プロが見つかりません</div>
  }

  if (alreadyVoted) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <div className="text-5xl mb-4">✓</div>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">投票済みです</h1>
        <p className="text-gray-500 mb-6">{pro.name}さんへのプルーフは既に送信済みです。</p>
        <a href={`/card/${pro.id}`} className="text-[#C4A35A] underline">
          {pro.name}さんのカードを見る
        </a>
      </div>
    )
  }

  // メールアドレス修正+再送信
  async function handleResend() {
    const newEmail = fixEmail.trim().toLowerCase()
    if (!newEmail || !newEmail.includes('@')) return
    setResending(true)
    setResendMessage('')

    // votesテーブルのvoter_emailを更新
    const { error: updateError } = await (supabase as any)
      .from('votes')
      .update({ voter_email: newEmail })
      .eq('id', submittedVoteId)
    if (updateError) {
      setResendMessage('メールアドレスの更新に失敗しました。')
      setResending(false)
      return
    }

    // ローカルストレージも更新
    localStorage.setItem('proof_voter_email', newEmail)
    setVoterEmail(newEmail)

    // 確認メールを再送信
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

  // 投票完了画面（メール確認待ち）
  if (submitted) {
    return (
      <div className="max-w-md mx-auto text-center py-12 px-4">
        <div className="text-5xl mb-4">📩</div>
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">確認メールを送信しました</h1>
        <p className="text-gray-500 mb-4">
          <span className="font-medium text-[#1A1A2E]">{voterEmail}</span> に確認メールを送信しました。<br />
          メール内のリンクをクリックして、プルーフを確定してください。
        </p>

        <div className="bg-[#f8f6f0] border border-[#C4A35A]/30 rounded-xl p-4 mb-4 text-left">
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

        {/* メールが届かない場合 */}
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

        {/* カードを見る */}
        <a
          href={`/card/${pro.id}`}
          className="block w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition mb-3"
        >
          {pro.name}さんのカードを見る
        </a>
      </div>
    )
  }

  // 投票フォーム
  const resultOptions = getAllResultOptions(pro)
  const personalityOptions = getAllPersonalityOptions(pro)

  return (
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
        <p className="text-sm text-gray-500">{pro.title}</p>
        <p className="text-xs text-gray-400 mt-1">セッション後24時間限定</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* メールアドレス入力 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            メールアドレス
          </label>
          <input
            type="email"
            value={voterEmail}
            onChange={e => setVoterEmail(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] focus:border-transparent outline-none"
            placeholder="your@email.com"
            required
          />
          <p className="text-xs text-gray-400 mt-1">
            リワードの送付に使用します。プロには公開されません。
          </p>
        </div>

        {/* 強みプルーフ選択（1つ） */}
        <div>
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-1">強みプルーフ</h2>
          <p className="text-xs text-gray-500 mb-3">一番大きく変わったことを1つ選んでください</p>
          <div className="space-y-2">
            {resultOptions.map(opt => (
              <label
                key={opt.key}
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                  selectedResult === opt.key
                    ? 'border-[#C4A35A] bg-[#C4A35A]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="result"
                  value={opt.key}
                  checked={selectedResult === opt.key}
                  onChange={() => setSelectedResult(opt.key)}
                  className="accent-[#C4A35A] w-4 h-4"
                />
                <div>
                  <div className={`font-medium ${selectedResult === opt.key ? 'text-[#C4A35A]' : 'text-[#1A1A2E]'}`}>
                    {opt.label}
                  </div>
                  <div className="text-xs text-gray-500">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 人柄プルーフ選択（最大3つ） */}
        <div>
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-1">人柄プルーフ（任意）</h2>
          <p className="text-xs text-gray-500 mb-3">当てはまるものを最大{MAX_PERSONALITY}つまで</p>
          <div className="space-y-2">
            {personalityOptions.map(opt => {
              const isSelected = selectedPersonalities.includes(opt.key)
              const isDisabled = !isSelected && selectedPersonalities.length >= MAX_PERSONALITY
              return (
                <label
                  key={opt.key}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                    isSelected
                      ? 'border-[#C4A35A] bg-[#C4A35A]/5'
                      : isDisabled
                        ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                        : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => !isDisabled && togglePersonality(opt.key)}
                    disabled={isDisabled}
                    className="mt-1 accent-[#C4A35A] w-4 h-4"
                  />
                  <div>
                    <div className={`font-medium ${isSelected ? 'text-[#C4A35A]' : 'text-[#1A1A2E]'}`}>{opt.label}</div>
                    <div className="text-xs text-gray-500">{opt.desc}</div>
                  </div>
                </label>
              )
            })}
          </div>
          {selectedPersonalities.length > 0 && (
            <p className="text-xs text-[#C4A35A] mt-2">{selectedPersonalities.length}/{MAX_PERSONALITY} 選択中</p>
          )}
        </div>

        {/* コメント */}
        <div>
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-1">ひとこと（任意）</h2>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            maxLength={100}
            rows={2}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] focus:border-transparent outline-none resize-none"
            placeholder="このプロへのメッセージ（100文字以内）"
          />
          <p className="text-xs text-gray-400 text-right">{comment.length}/100</p>
        </div>

        {/* リワード選択 */}
        {proRewards.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-[#1A1A2E] mb-1">お礼リワードを選ぶ（任意）</h2>
            <p className="text-xs text-gray-500 mb-3">プルーフ確定後にリワードの内容が届きます</p>
            <div className="space-y-2">
              {proRewards.map(reward => (
                <label
                  key={reward.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                    selectedRewardId === reward.id
                      ? 'border-[#C4A35A] bg-[#C4A35A]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="reward"
                    value={reward.id}
                    checked={selectedRewardId === reward.id}
                    onChange={() => setSelectedRewardId(reward.id)}
                    className="accent-[#C4A35A] w-4 h-4"
                  />
                  <div className={`font-medium ${selectedRewardId === reward.id ? 'text-[#C4A35A]' : 'text-[#1A1A2E]'}`}>
                    {getRewardLabel(reward.reward_type)}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition"
        >
          プルーフを贈る
        </button>
      </form>
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
