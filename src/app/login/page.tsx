'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Suspense } from 'react'

function LoginForm() {
  const searchParams = useSearchParams()
  const role = searchParams.get('role') || 'pro'
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const isClient = role === 'client'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    
    if (isClient && !nickname.trim()) {
      setError('ニックネームを入力してください')
      return
    }

    const redirectUrl = `${window.location.origin}/login?role=${role}${isClient ? `&nickname=${encodeURIComponent(nickname)}` : ''}`
    
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl }
    })

    if (authError) {
      setError(authError.message)
    } else {
      setSent(true)
    }
  }

  // Handle callback after magic link
  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const nickParam = searchParams.get('nickname')
        
        if (isClient && nickParam) {
          // Create client record
          await supabase.from('clients').upsert({
            user_id: session.user.id,
            nickname: nickParam,
          }, { onConflict: 'user_id' })
          window.location.href = '/mycard'
        } else {
          // Check if pro profile exists
          const { data } = await supabase
            .from('professionals')
            .select('id')
            .eq('user_id', session.user.id)
            .single()
          
          if (data) {
            window.location.href = '/dashboard'
          } else {
            window.location.href = '/dashboard'
          }
        }
      }
    })
  }, [])

  if (sent) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-4xl mb-4">✉️</div>
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">メールを送信しました</h1>
        <p className="text-gray-600">
          <strong>{email}</strong> にログインリンクを送信しました。<br />
          メールを確認してリンクをクリックしてください。
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto py-16">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2 text-center">
        {isClient ? 'クライアント登録' : 'プロとして登録'}
      </h1>
      <p className="text-gray-500 text-sm text-center mb-8">
        {isClient
          ? 'あなたが信頼するプロにフォルテを贈りましょう'
          : 'クライアントの声で、あなたの「選ばれる理由」を可視化'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] focus:border-transparent outline-none"
            placeholder="your@email.com"
          />
        </div>

        {isClient && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ニックネーム</label>
            <input
              type="text"
              required
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] focus:border-transparent outline-none"
              placeholder="表示名（本名不要）"
            />
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition"
        >
          マジックリンクを送信
        </button>
      </form>

      <div className="mt-6 text-center">
        <a
          href={isClient ? '/login?role=pro' : '/login?role=client'}
          className="text-sm text-[#C4A35A] hover:underline"
        >
          {isClient ? 'プロとして登録する方はこちら' : 'クライアントとして登録する方はこちら'}
        </a>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center py-16">読み込み中...</div>}>
      <LoginForm />
    </Suspense>
  )
}
