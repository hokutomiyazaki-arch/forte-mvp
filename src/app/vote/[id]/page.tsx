'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Professional, getAllResultOptions, getAllPersonalityOptions } from '@/lib/types'
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
  const [coupon, setCoupon] = useState<{ code: string; discount_type: string; discount_value: number } | null>(null)

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
    if (!selectedResult) {
      setError('強みプルーフを1つ選んでください')
      return
    }

    // 自己投票チェック
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (currentUser && pro?.user_id && currentUser.id === pro.user_id) {
      setError('自分自身にはプルーフを贈れません')
      return
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

    // 投票INSERT
    const { error: voteError } = await (supabase as any).from('votes').insert({
      professional_id: proId,
      voter_email: email,
      client_user_id: null,
      result_category: selectedResult,
      personality_categories: selectedPersonalities,
      comment: comment.trim() || null,
      qr_token: qrToken,
    })

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

    // プロがクーポン設定済みならクーポン発行
    if (pro?.coupon_text) {
      const couponCode = Math.random().toString(36).substring(2, 10).toUpperCase()
      const { data: couponData } = await (supabase as any).from('coupons').insert({
        pro_user_id: pro.id,
        client_email: email,
        discount_type: 'percentage',
        discount_value: 10,
        code: couponCode,
        status: 'active',
      }).select().single()
      
      if (couponData) {
        setCoupon(couponData)
        // メール送信（API Route経由）
        try {
          await fetch('/api/send-coupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              proName: pro.name,
              couponCode,
              couponText: pro.coupon_text,
              proId: pro.id,
            }),
          })
        } catch (err) {
          console.error('Coupon email send failed:', err)
          // メール送信失敗しても投票は成功扱い
        }
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

  // 投票完了画面
  if (submitted) {
    return (
      <div className="max-w-md mx-auto text-center py-12 px-4">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">プルーフを贈りました！</h1>
        <p className="text-gray-500 mb-6">
          {pro.name}さんにあなたのプルーフが届きました。
        </p>

        {/* クーポン表示 */}
        {coupon && (
          <div className="bg-gradient-to-r from-[#1A1A2E] to-[#2a2a4e] text-white rounded-xl p-6 mb-6 text-left">
            <p className="text-[#C4A35A] text-xs font-bold mb-1">THANK YOU COUPON</p>
            <p className="text-lg font-bold mb-2">{pro.coupon_text}</p>
            <div className="bg-white/10 rounded-lg px-4 py-2 text-center">
              <p className="text-xs text-gray-300 mb-1">クーポンコード</p>
              <p className="text-2xl font-mono font-bold tracking-wider text-[#C4A35A]">{coupon.code}</p>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {pro.name}さんに直接このコードをお伝えください。
              メールにも送信しました。
            </p>
          </div>
        )}

        {/* カードを見る */}
        <a
          href={`/card/${pro.id}`}
          className="block w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition mb-3"
        >
          {pro.name}さんのカードを見る
        </a>

        {/* プロ向けCTA */}
        <div className="mt-8 p-4 bg-gray-50 rounded-xl">
          <p className="text-sm text-gray-600 mb-2">あなたも実力を証明しませんか？</p>
          <p className="text-xs text-gray-400 mb-3">
            PROOFに登録して、あなたのクライアントからプルーフを集めましょう。
          </p>
          <a
            href="/login?role=pro"
            className="inline-block px-6 py-2 bg-[#C4A35A] text-white text-sm font-medium rounded-lg hover:bg-[#b3923f] transition"
          >
            プロとして無料登録
          </a>
        </div>

        {/* Explore導線 */}
        <a href="/explore" className="block mt-4 text-sm text-[#C4A35A] underline">
          他のプロを探す →
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
        <p className="text-xs text-gray-400 mt-1">施術後24時間限定</p>
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
            クーポンの送付に使用します。プロには公開されません。
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
