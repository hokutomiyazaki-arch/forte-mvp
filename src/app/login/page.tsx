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
  const [status, setStatus] = useState('読み込み中...')
  const supabase = createClient() as any

  const isClient = role === 'client'

  useEffect(() => {
    let done = false

    async function init() {
      // Step 1: Wait a moment for supabase to detect tokens from URL hash
      setStatus('セッション確認中...')
      await new Promise(r => setTimeout(r, 500))

      try {
        const { data: { session } } = await supabase.auth.getSession()
        console.log('Session check:', session ? 'found' : 'none')

        if (session?.user && !done) {
          done = true
          setStatus('ログイン済み、リダイレクト中...')
          await doRedirect(session.user)
          return
        }
      } catch (e) {
        console.error('Session check error:', e)
      }

      if (!done) {
        done = true
        setReady(true)
      }
    }

    init()

    // Listen for auth changes (handles OAuth hash detection)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: string, session: any) => {
        console.log('Auth event:', event)
        if (event === 'SIGNED_IN' && session?.user && !done) {
          done = true
          setStatus('ログイン成功、リダイレクト中...')
          await doRedirect(session.user)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function doRedirect(user: any) {
    const urlRole = searchParams.get('role') || 'pro'

    try {
      if (urlRole === 'client') {
        const nn = searchParams.get('nickname') || user.user_metadata?.full_name || user.email?.split('@')[0] || 'ユーザー'
        await supabase.from('clients').upsert(
          { user_id: user.id, nickname: nn },
          { onConflict: 'user_id' }
        )
        window.location.replace('/mycard')
        return
      }

      // role=pro → always go to dashboard
      window.location.replace('/dashboard')
    } catch (e) {
      console.error('Redirect error:', e)
      setReady(true)
    }
  }

  async function handleGoogleLogin() {
    setError('')
    setGoogleLoading(true)
    // Redirect back to THIS page after OAuth — supabase will add tokens to hash
    const redirectUrl = window.location.origin + '/login?role=' + role
      + (isClient && nickname ? '&nickname=' + encodeURIComponent(nickname) : '')
    console.log('OAuth redirectTo:', redirectUrl)
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl }
    })
    if (authError) {
      setError(authError.message)
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    if (isClient && mode === 'signup' && !nickname.trim()) {
      setError('ニックネームを入力してください')
      setSubmitting(false)
      return
    }

    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください')
      setSubmitting(false)
      return
    }

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin + '/login?role=' + role
              + (isClient && nickname ? '&nickname=' + encodeURIComponent(nickname) : ''),
          }
        })
        if (signUpError) {
          if (signUpError.message.includes('already') || signUpError.message.includes('exist')) {
            setError('このメールアドレスは既に登録されています。ログインしてください。')
            setMode('login')
          } else {
            setError(signUpError.message)
          }
          setSubmitting(false)
          return
        }
        if (data.user && !data.session) {
          setEmailSent(true)
          setSubmitting(false)
          return
        }
        if (data.user && data.session) {
          await doRedirect(data.user)
        }
      } else {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password })
        if (loginError) {
          if (loginError.message.includes('Invalid login')) {
            setError('メールアドレスまたはパスワードが正しくありません')
          } else if (loginError.message.includes('Email not confirmed')) {
            setError('メールアドレスが未確認です。受信トレイの確認メールをクリックしてください。')
          } else {
            setError(loginError.message)
          }
          setSubmitting(false)
          return
        }
        if (data.user) {
          await doRedirect(data.user)
        }
      }
    } catch (e: any) {
      setError(e.message || 'エラーが発生しました')
    }
    setSubmitting(false)
  }

  if (!ready) {
    return <div className="text-center py-16 text-gray-400">{status}</div>
  }

  if (emailSent) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">📧</div>
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">確認メールを送信しました</h1>
        <p className="text-gray-600 mb-2">
          <strong>{email}</strong> に確認メールを送信しました。
        </p>
        <p className="text-gray-500 text-sm mb-8">
          メール内のリンクをクリックして登録を完了してください。
        </p>
        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500 mb-6">
          メールが届かない場合は、迷惑メールフォルダをご確認ください。
        </div>
        <button onClick={() => { setEmailSent(false); setMode('login'); setError('') }}
          className="text-sm text-[#C4A35A] hover:underline">
          確認済みの方はこちらからログイン →
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-6 text-center">
        {mode === 'signup' ? '新規登録' : 'ログイン'}
      </h1>

      <div className="flex mb-8 bg-gray-100 rounded-lg p-1">
        <button onClick={() => setRole('pro')}
          className={'flex-1 py-3 rounded-md text-sm font-medium transition ' + (role === 'pro' ? 'bg-[#1A1A2E] text-white shadow' : 'text-gray-600 hover:text-gray-800')}>
          プロとして
        </button>
        <button onClick={() => setRole('client')}
          className={'flex-1 py-3 rounded-md text-sm font-medium transition ' + (role === 'client' ? 'bg-[#1A1A2E] text-white shadow' : 'text-gray-600 hover:text-gray-800')}>
          クライアントとして
        </button>
      </div>

      <p className="text-gray-500 text-sm text-center mb-6">
        {isClient ? 'あなたが信頼するプロにプルーフを贈りましょう' : 'クライアントの声で、あなたの「選ばれる理由」を可視化'}
      </p>

      <button onClick={handleGoogleLogin}
        disabled={googleLoading || (isClient && mode === 'signup' && !nickname.trim())}
        className="w-full py-3 bg-white border-2 border-gray-200 text-gray-700 font-medium rounded-lg hover:border-gray-300 hover:bg-gray-50 transition flex items-center justify-center gap-3 disabled:opacity-50">
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {googleLoading ? '接続中...' : 'Googleで続ける'}
      </button>

      <div className="flex items-center gap-4 my-6">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">または</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isClient && mode === 'signup' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ニックネーム</label>
            <input type="text" value={nickname} onChange={e => setNickname(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] focus:border-transparent outline-none"
              placeholder="表示名（本名不要）" />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] focus:border-transparent outline-none"
            placeholder="your@email.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
          <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] focus:border-transparent outline-none"
            placeholder={mode === 'signup' ? '6文字以上' : 'パスワード'} />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button type="submit" disabled={submitting}
          className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition disabled:opacity-50">
          {submitting ? '処理中...' : mode === 'signup' ? '新規登録' : 'ログイン'}
        </button>
      </form>

      <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
        className="w-full text-center text-sm text-gray-500 hover:text-[#C4A35A] mt-4 transition">
        {mode === 'login' ? 'アカウントをお持ちでない方 → 新規登録' : '既にアカウントをお持ちの方 → ログイン'}
      </button>
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
