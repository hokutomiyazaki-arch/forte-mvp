'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Professional, RESULT_FORTES, PERSONALITY_FORTE, getAllForteOptions } from '@/lib/types'
import { Suspense } from 'react'

function VoteForm() {
  const params = useParams()
  const searchParams = useSearchParams()
  const proId = params.id as string
  const qrToken = searchParams.get('token')
  const supabase = createClient()

  const [pro, setPro] = useState<Professional | null>(null)
  const [user, setUser] = useState<any>(null)
  const [selectedResult, setSelectedResult] = useState('')
  const [personalityVote, setPersonalityVote] = useState(false)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [alreadyVoted, setAlreadyVoted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser()
      setUser(u)

      const { data: proData } = await supabase
        .from('professionals')
        .select('*')
        .eq('id', proId)
        .single()
      if (proData) setPro(proData)

      // Check if already voted
      if (u) {
        const { data: existing } = await supabase
          .from('votes')
          .select('id')
          .eq('professional_id', proId)
          .eq('client_user_id', u.id)
          .single()
        if (existing) setAlreadyVoted(true)

        // Check self-vote
        if (proData && proData.user_id === u.id) {
          setError('自分自身には投票できません')
        }
      }

      setLoading(false)
    }
    load()
  }, [proId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) {
      window.location.href = `/login?role=client`
      return
    }
    if (!selectedResult) {
      setError('結果フォルテを1つ選んでください')
      return
    }

    // Verify QR token if provided
    if (qrToken) {
      const { data: tokenData } = await supabase
        .from('qr_tokens')
        .select('*')
        .eq('token', qrToken)
        .eq('professional_id', proId)
        .gt('expires_at', new Date().toISOString())
        .single()
      
      if (!tokenData) {
        setError('QRコードの有効期限が切れています。プロに新しいQRコードを発行してもらってください。')
        return
      }
    }

    const { error: voteError } = await supabase.from('votes').insert({
      professional_id: proId,
      client_user_id: user.id,
      result_category: selectedResult,
      personality_vote: personalityVote,
      comment: comment.trim() || null,
      qr_token: qrToken,
    })

    if (voteError) {
      if (voteError.code === '23505') {
        setError('このプロにはすでに投票済みです')
      } else {
        setError(voteError.message)
      }
    } else {
      // Ensure client record exists
      const { data: clientCheck } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single()
      
      if (!clientCheck) {
        await supabase.from('clients').insert({
          user_id: user.id,
          nickname: user.email?.split('@')[0] || 'ユーザー',
        })
      }
      setSubmitted(true)
    }
  }

  if (loading) return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  if (!pro) return <div className="text-center py-16 text-gray-400">プロが見つかりません</div>

  if (!user) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">ログインが必要です</h1>
        <p className="text-gray-600 mb-6">フォルテを贈るにはクライアント登録が必要です。</p>
        <a href="/login?role=client" className="px-8 py-3 bg-[#1A1A2E] text-white rounded-lg hover:bg-[#2a2a4e] transition inline-block">
          クライアントとして登録
        </a>
      </div>
    )
  }

  if (alreadyVoted) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">投票済みです</h1>
        <p className="text-gray-600 mb-6">{pro.name} さんにはすでにフォルテを贈っています。</p>
        <a href={`/card/${pro.id}`} className="text-[#C4A35A] hover:underline">カードを見る</a>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-4xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">フォルテを贈りました！</h1>
        <p className="text-gray-600 mb-6">{pro.name} さんにフォルテが届きました。</p>
        {pro.coupon_text && (
          <div className="bg-[#C4A35A]/10 border border-[#C4A35A] rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-[#C4A35A]">お礼の特典</p>
            <p className="text-[#1A1A2E] mt-1">{pro.coupon_text}</p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          <a href="/mycard" className="px-6 py-3 bg-[#1A1A2E] text-white rounded-lg hover:bg-[#2a2a4e] transition inline-block">
            マイカードを見る
          </a>
          <a href={`/card/${pro.id}`} className="text-[#C4A35A] hover:underline text-sm">
            {pro.name} さんのカードを見る
          </a>
        </div>
      </div>
    )
  }

  const forteOptions = getAllForteOptions(pro)

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#1A1A2E]">{pro.name} さんにフォルテを贈る</h1>
        <p className="text-gray-500 text-sm mt-1">あなたの体験を投票してください</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Result Forte */}
        <div>
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-1">何が変わりましたか？</h2>
          <p className="text-sm text-gray-500 mb-4">1つ選んでください</p>
          <div className="space-y-2">
            {forteOptions.map(opt => (
              <label
                key={opt.key}
                className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
                  selectedResult === opt.key
                    ? 'border-[#1A1A2E] bg-[#1A1A2E]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="result"
                  value={opt.key}
                  checked={selectedResult === opt.key}
                  onChange={() => setSelectedResult(opt.key)}
                  className="mt-1 accent-[#1A1A2E]"
                />
                <div>
                  <div className="font-medium text-[#1A1A2E]">{opt.label}</div>
                  <div className="text-xs text-gray-500">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Personality Forte */}
        <div>
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-1">この人の人柄は？</h2>
          <p className="text-sm text-gray-500 mb-4">任意</p>
          <label
            className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
              personalityVote
                ? 'border-[#C4A35A] bg-[#C4A35A]/5'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <input
              type="checkbox"
              checked={personalityVote}
              onChange={() => setPersonalityVote(!personalityVote)}
              className="accent-[#C4A35A] w-5 h-5"
            />
            <div>
              <div className="font-medium text-[#C4A35A]">{PERSONALITY_FORTE.label}</div>
              <div className="text-xs text-gray-500">{PERSONALITY_FORTE.desc}</div>
            </div>
          </label>
        </div>

        {/* Comment */}
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
          フォルテを贈る
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
