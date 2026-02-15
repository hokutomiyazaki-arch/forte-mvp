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
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const supabase = createClient() as any

  const isClient = role === 'client'

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user && !cancelled) {
          await redirectUser(session.user)
          return
        }
      } catch (e) {
        console.error('Session check error:', e)
      }
      if (!cancelled) setReady(true)
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
      if (event === 'SIGNED_IN' && session?.user && !cancelled) {
        cancelled = true
        try {
          const urlRole = searchParams.get('role') || 'pro'
          if (urlRole === 'client') {
            const nn = searchParams.get('nickname') || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'ユーザー'
            await (supabase.from('clients') as any).upsert({
              user_id: session.user.id,
              nickname: nn,
            }, { onConflict: 'user_id' })
            window.location.href = '/mycard'
          } else {
            await redirectUser(session.user)
          }
        } catch (e) {
          console.error('Auth callback error:', e)
          cancelled = false
          setReady(true)
        }
      }
    })

    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  async function redirectUser(user: any) {
    // Check pro first
    try {
      const { data: proData, error: proError } = await (supabase
        .from('professionals').select('id').eq('user_id', user.id).single()) as any
      if (proData && !proError) {
        window.location.href = '/dashboard'
        return
      }
    } catch (_) { /* no pro record — continue */ }

    // Check client
    try {
      const { data: clientData, error: clientError } = await (supabase
        .from('clients').select('id').eq('user_id', user.id).single()) as any
      if (clientData && !clientError) {
        window.location.href = '/mycard'
        return
      }
    } catch (_) { /* no client record — continue */ }

    // New user — show login form so they can choose role
    window.location.href = '/dashboard'
  }

  async function handleGoogleLogin() {
    setError('')
    setGoogleLoading(true)
    const redirectUrl = window.location.origin + '/login?role=' + role
      + (isClient && nickname ? '&nickname=' + encodeURIComponent(nickname) : '')
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl }
    })
    if (err) {
      setError(err.message)
      setGoogleLoading(false)
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { role } }
        })
        if (err) throw err
        setEmailSent(true)
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        if (data.session?.user) {
          await redirectUser(data.session.user)
        }
      }
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました')
    }
    setSubmitting(false)
  }

  if (!ready) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-[#C4A35A] border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-500">確認中...</p>
      </div>
    )
  }

  if (emailSent) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">✉️</div>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">確認メールを送信しました</h1>
        <p className="text-gray-500">メール内のリンクをクリックして登録を完了してください。</p>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2 text-center">PROOF</h1>
      <p className="text-sm text-gray-500 mb-6 text-center">
        {isClient ? 'クライアントとしてログイン' : 'プロとしてログイン'}
      </p>

      {/* Role Toggle */}
      <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setRole('pro')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
            !isClient ? 'bg-[#1A1A2E] text-white shadow' : 'text-gray-600'
          }`}
        >
          プロとして
        </button>
        <button
          onClick={() => setRole('client')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
            isClient ? 'bg-[#C4A35A] text-white shadow' : 'text-gray-600'
          }`}
        >
          クライアントとして
        </button>
      </div>

      {/* Nickname for client */}
      {isClient && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">ニックネーム</label>
          <input value={nickname} onChange={e => setNickname(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
            placeholder="表示名（任意）" />
        </div>
      )}

      {/* Google Login */}
      <button onClick={handleGoogleLogin} disabled={googleLoading}
        className="w-full py-3 mb-4 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-2 text-sm font-medium">
        {googleLoading ? (
          <div className="animate-spin w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full"></div>
        ) : (
          <>
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Googleでログイン
          </>
        )}
      </button>

      <div className="text-center text-sm text-gray-400 mb-4">または</div>

      {/* Mode Toggle */}
      <div className="flex mb-4 text-sm">
        <button onClick={() => setMode('login')}
          className={`flex-1 py-2 border-b-2 transition ${mode === 'login' ? 'border-[#1A1A2E] text-[#1A1A2E] font-medium' : 'border-transparent text-gray-400'}`}>
          ログイン
        </button>
        <button onClick={() => setMode('signup')}
          className={`flex-1 py-2 border-b-2 transition ${mode === 'signup' ? 'border-[#1A1A2E] text-[#1A1A2E] font-medium' : 'border-transparent text-gray-400'}`}>
          新規登録
        </button>
      </div>

      {/* Email/Password */}
      <form onSubmit={handleEmailAuth} className="space-y-4">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
          placeholder="メールアドレス" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
          placeholder="パスワード（6文字以上）" />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit" disabled={submitting}
          className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition disabled:opacity-50">
          {submitting ? '処理中...' : mode === 'signup' ? '新規登録' : 'ログイン'}
        </button>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-gray-400">読み込み中...</div>}>
      <LoginForm />
    </Suspense>
  )
}
