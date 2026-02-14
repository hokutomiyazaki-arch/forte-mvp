'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Suspense } from 'react'

function LoginForm() {
  const searchParams = useSearchParams()
  const initialRole = searchParams.get('role') || 'pro'
  const [role, setRole] = useState<'pro' | 'client'>(initialRole === 'client' ? 'client' : 'pro')
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [sent, setSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const supabase = createClient() as any

  const isClient = role === 'client'

  const [isInAppBrowser, setIsInAppBrowser] = useState(false)
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase()
    setIsInAppBrowser(/line|instagram|fbav|fban/.test(ua))
  }, [])

  useEffect(() => {
    async function checkSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          await handlePostLogin(session.user)
          return
        }
      } catch (e) {
        console.error('Session check error:', e)
      }
      setCheckingSession(false)
    }
    checkSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        try {
          await handlePostLogin(session.user)
        } catch (e) {
          console.error('Post login error:', e)
          setCheckingSession(false)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handlePostLogin(user: any) {
    const nickParam = searchParams.get('nickname')
    const roleParam = searchParams.get('role') || 'pro'

    try {
      if (roleParam === 'client') {
        const nn = nickParam || user.user_metadata?.full_name || user.email?.split('@')[0] || 'ユーザー'
        await supabase.from('clients').upsert({
          user_id: user.id,
          nickname: nn,
        }, { onConflict: 'user_id' })
        window.location.href = '/mycard'
      } else {
        // Check if user has pro profile, if not check client
        const { data: proData } = await supabase
          .from('professionals').select('id').eq('user_id', user.id).single()
        if (proData) {
          window.location.href = '/dashboard'
        } else {
          const { data: clientData } = await supabase
            .from('clients').select('id').eq('user_id', user.id).single()
          if (clientData) {
            window.location.href = '/mycard'
          } else {
            window.location.href = '/dashboard'
          }
        }
      }
    } catch (e) {
      console.error('handlePostLogin error:', e)
      setCheckingSession(false)
    }
  }

  async function handleGoogleLogin() {
    setError('')
    setGoogleLoading(true)
    const redirectUrl = window.location.origin + '/login?role=' + role + (isClient && nickname ? '&nickname=' + encodeURIComponent(nickname) : '')

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl }
    })

    if (authError) {
      setError(authError.message)
      setGoogleLoading(false)
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (isClient && !nickname.trim()) {
      setError('ニックネームを入力してください')
      return
    }

    const redirectUrl = window.location.origin + '/login?role=' + role + (isClient && nickname ? '&nickname=' + encodeURIComponent(nickname) : '')

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

  async function handleOtpVerify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setVerifying(true)

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })

    if (verifyError) {
      setError('コードが正しくありません。もう一度お試しください。')
      setVerifying(false)
      return
    }

    if (data.session?.user) {
      await handlePostLogin(data.session.user)
    }
    setVerifying(false)
  }

  if (checkingSession) {
    return <div className="text-center py-16 text-gray-400">確認中...</div>
  }

  if (sent) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-4xl mb-4">✉️</div>
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">メールを送信しました</h1>
        <p className="text-gray-600 mb-6">
          <strong>{email}</strong> にログインメールを送信しました。
        </p>

        <div className="bg-gray-50 rounded-lg p-6 text-left">
          <p className="text-sm font-medium text-[#1A1A2E] mb-3">
            {isInAppBrowser
              ? '⚠️ LINEなどのアプリ内ブラウザをお使いの場合、メール内のボタンが動作しないことがあります。下の欄にメールに記載されたコードを入力してください。'
              : 'メール内のリンクをクリックするか、メールに記載されたコードを入力してください。'}
          </p>
          <form onSubmit={handleOtpVerify} className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] focus:border-transparent outline-none text-center text-lg tracking-widest"
              placeholder="コードを入力"
            />
            <button
              type="submit"
              disabled={otp.length < 6 || verifying}
              className="px-6 py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition disabled:opacity-50"
            >
              {verifying ? '...' : '確認'}
            </button>
          </form>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        <button
          onClick={() => { setSent(false); setOtp(''); setError('') }}
          className="mt-4 text-sm text-gray-400 hover:text-gray-600"
        >
          ← メールアドレスを変更する
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-6 text-center">ログイン / 新規登録</h1>

      <div className="flex mb-8 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setRole('pro')}
          className={'flex-1 py-3 rounded-md text-sm font-medium transition ' + (
            role === 'pro'
              ? 'bg-[#1A1A2E] text-white shadow'
              : 'text-gray-600 hover:text-gray-800'
          )}
        >
          プロとして
        </button>
        <button
          onClick={() => setRole('client')}
          className={'flex-1 py-3 rounded-md text-sm font-medium transition ' + (
            role === 'client'
              ? 'bg-[#1A1A2E] text-white shadow'
              : 'text-gray-600 hover:text-gray-800'
          )}
        >
          クライアントとして
        </button>
      </div>

      <p className="text-gray-500 text-sm text-center mb-6">
        {isClient
          ? 'あなたが信頼するプロにフォルテを贈りましょう'
          : 'クライアントの声で、あなたの「選ばれる理由」を可視化'}
      </p>

      <button
        onClick={handleGoogleLogin}
        disabled={googleLoading || (isClient && !nickname.trim())}
        className="w-full py-3 bg-white border-2 border-gray-200 text-gray-700 font-medium rounded-lg hover:border-gray-300 hover:bg-gray-50 transition flex items-center justify-center gap-3 disabled:opacity-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {googleLoading ? '接続中...' : 'Googleで続ける'}
      </button>

      {isClient && (
        <p className="text-xs text-gray-400 text-center mt-2">
          ※ クライアントの場合、先にニックネームを入力してからGoogleで続けてください
        </p>
      )}

      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">または</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <form onSubmit={handleEmailSubmit} className="space-y-4">
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

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition"
        >
          メールでログイン
        </button>
      </form>

      <p className="text-xs text-gray-400 text-center mt-6">
        アカウントがない場合は自動的に作成されます。
      </p>
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
