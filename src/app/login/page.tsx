'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Suspense } from 'react'

function LoginForm() {
  const searchParams = useSearchParams()
  const initialRole = searchParams.get('role') || 'pro'
  const redirectTo = searchParams.get('redirect') || ''
  const emailParam = searchParams.get('email') || ''
  const isCouponFlow = initialRole === 'client' && (redirectTo === '/coupons' || redirectTo === '/mycard')
  const isProSignupFlow = initialRole === 'pro' && !!emailParam

  const [role, setRole] = useState<'pro' | 'client'>(initialRole === 'client' ? 'client' : 'pro')
  const [email, setEmail] = useState(emailParam)
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>(isCouponFlow || isProSignupFlow ? 'signup' : 'login')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [emailCheckResult, setEmailCheckResult] = useState<{ exists: boolean; provider: string | null } | null>(null)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const supabase = createClient() as any
  const isRedirecting = useRef(false)

  const isClient = role === 'client'

  useEffect(() => {
    let cancelled = false

    // OAuth リダイレクト後のエラーチェック（URLハッシュ + クエリパラメータ両対応）
    if (typeof window !== 'undefined') {
      let errorDesc: string | null = null

      if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        errorDesc = hashParams.get('error_description')
      }
      if (!errorDesc) {
        const qp = new URLSearchParams(window.location.search)
        errorDesc = qp.get('error_description')
      }

      if (errorDesc) {
        if (errorDesc.includes('already registered') || errorDesc.includes('already exists') || errorDesc.includes('identity is already linked')) {
          setError('このメールアドレスは既にパスワードで登録されています。メールアドレスとパスワードでログインしてください。')
        } else {
          setError(errorDesc)
        }
        window.location.hash = ''
        setReady(true)
        return
      }
    }

    async function init() {
      try {
        // URLから直接 redirect パラメータを取得（searchParamsに依存しない）
        const urlParams = new URLSearchParams(window.location.search)
        const directRedirect = urlParams.get('redirect')

        const { data: { session } } = await supabase.auth.getSession()

        // ログイン済み + redirect がある場合は即座にリダイレクト
        if (session?.user && directRedirect && !cancelled) {
          cancelled = true
          const urlRole = urlParams.get('role') || ''
          if (urlRole === 'client') {
            try {
              const nn = urlParams.get('nickname') || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'ユーザー'
              await (supabase.from('clients') as any).upsert({
                user_id: session.user.id,
                nickname: nn,
              }, { onConflict: 'user_id' })
            } catch (_) {}
          }
          window.location.href = directRedirect
          return
        }

        // ログイン済みだが redirect なし → 通常のredirectUser
        if (session?.user && !cancelled) {
          cancelled = true
          await redirectUser(session.user)
          return
        }
      } catch (e) {
        console.error('[init] session check error:', e)
      }
      if (!cancelled) setReady(true)
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
      // URLから直接パラメータ取得（searchParamsに依存しない）
      const urlParams = new URLSearchParams(window.location.search)
      const directRedirect = urlParams.get('redirect')
      console.log('[onAuthStateChange] event:', event, 'cancelled:', cancelled, 'directRedirect:', directRedirect)

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user && !cancelled) {
        cancelled = true

        // redirect がある場合は即座にリダイレクト（DB問い合わせを避ける）
        if (directRedirect) {
          if (isRedirecting.current) return
          isRedirecting.current = true
          const urlRole = urlParams.get('role') || ''
          if (urlRole === 'client') {
            try {
              const nn = urlParams.get('nickname') || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'ユーザー'
              await (supabase.from('clients') as any).upsert({
                user_id: session.user.id,
                nickname: nn,
              }, { onConflict: 'user_id' })
            } catch (_) {}
          }
          console.log('[onAuthStateChange] → directRedirect (skip DB):', directRedirect)
          window.location.href = directRedirect
          return
        }

        try {
          await redirectUser(session.user)
        } catch (e) {
          console.error('[onAuthStateChange] error:', e)
          isRedirecting.current = false
          cancelled = false
          setReady(true)
        }
      }
    })

    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  // couponフローでメールアドレスが入力済みの場合、既存ユーザーかチェック
  useEffect(() => {
    if (isCouponFlow && ready && email && email.includes('@')) {
      checkEmail(email)
    }
  }, [ready])

  async function checkEmail(emailToCheck: string) {
    if (!emailToCheck || !emailToCheck.includes('@')) return
    setCheckingEmail(true)
    try {
      const res = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToCheck }),
      })
      const data = await res.json()
      setEmailCheckResult(data)
      if (data.exists) {
        setMode('login')
      }
    } catch (_) {}
    setCheckingEmail(false)
  }

  async function redirectUser(user: any) {
    if (isRedirecting.current) {
      console.log('[redirectUser] already redirecting, skip')
      return
    }
    isRedirecting.current = true

    // URLから直接パラメータ取得（searchParamsに依存しない）
    const urlParams = new URLSearchParams(window.location.search)
    const urlRole = urlParams.get('role') || ''
    const directRedirect = urlParams.get('redirect') || ''
    const isGoogleUser = user.app_metadata?.provider === 'google'
    console.log('[redirectUser] start, urlRole:', urlRole, 'directRedirect:', directRedirect, 'isGoogle:', isGoogleUser)

    // redirect がある場合: DB問い合わせをスキップして即座に遷移
    if (directRedirect) {
      if (urlRole === 'client') {
        try {
          const nn = urlParams.get('nickname') || user.user_metadata?.full_name || user.email?.split('@')[0] || 'ユーザー'
          await (supabase.from('clients') as any).upsert({
            user_id: user.id,
            nickname: nn,
          }, { onConflict: 'user_id' })
        } catch (_) {}
      }
      console.log('[redirectUser] → directRedirect (skip DB):', directRedirect)
      window.location.href = directRedirect
      return
    }

    // redirect がない場合のみ: DB問い合わせでリダイレクト先を判定
    const [{ data: proData }, { data: clientData }] = await Promise.all([
      (supabase.from('professionals').select('id').eq('user_id', user.id).maybeSingle()) as any,
      (supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle()) as any,
    ])
    const isNewUser = !proData && !clientData

    if (isNewUser && isGoogleUser) {
      try {
        await fetch('/api/welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, isGoogle: true }),
        })
      } catch (_) {}
    }

    if (proData) {
      console.log('[redirectUser] → /dashboard (existing pro)')
      window.location.href = '/dashboard'
      return
    }

    if (clientData) {
      console.log('[redirectUser] → /mycard (existing client)')
      window.location.href = '/mycard'
      return
    }

    if (urlRole === 'pro') {
      console.log('[redirectUser] → /dashboard (new pro)')
      window.location.href = '/dashboard'
    } else if (urlRole === 'client') {
      try {
        const nn = urlParams.get('nickname') || user.user_metadata?.full_name || user.email?.split('@')[0] || 'ユーザー'
        await (supabase.from('clients') as any).upsert({
          user_id: user.id,
          nickname: nn,
        }, { onConflict: 'user_id' })
      } catch (_) {}
      console.log('[redirectUser] → /mycard (new client)')
      window.location.href = '/mycard'
    } else {
      console.log('[redirectUser] → /explore (no role)')
      window.location.href = '/explore'
    }
  }

  async function handleGoogleLogin() {
    setError('')
    setGoogleLoading(true)
    const redirectUrl = window.location.origin + '/login?role=' + role
      + (redirectTo ? '&redirect=' + encodeURIComponent(redirectTo) : '')
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
        const signUpOptions: any = { data: { role } }
        if (isCouponFlow) {
          signUpOptions.emailRedirectTo = window.location.origin + '/login?role=client&redirect=/mycard&email=' + encodeURIComponent(email)
        }
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: signUpOptions,
        })
        if (err) throw err

        try {
          await fetch('/api/welcome-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, isGoogle: false }),
          })
        } catch (_) {}

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

  async function handleResetPassword() {
    if (!resetEmail || !resetEmail.includes('@')) return
    setResettingPassword(true)
    setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin + '/mycard',
    })
    if (err) {
      setError(err.message)
    } else {
      setResetSent(true)
    }
    setResettingPassword(false)
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

  // パスワードリセットUI
  const resetUI = (
    <>
      {showReset ? (
        resetSent ? (
          <p className="text-sm text-green-600 text-center mt-4">パスワードリセットメールを送信しました</p>
        ) : (
          <div className="mt-4 space-y-2">
            <input
              type="email"
              value={resetEmail}
              onChange={e => setResetEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none text-sm"
              placeholder="メールアドレス"
            />
            <button
              onClick={handleResetPassword}
              disabled={resettingPassword}
              className="w-full py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
            >
              {resettingPassword ? '送信中...' : 'リセットメールを送信'}
            </button>
          </div>
        )
      ) : (
        <button
          onClick={() => { setShowReset(true); setResetEmail(email) }}
          className="block w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-4 transition"
        >
          パスワードを忘れた方はこちら
        </button>
      )}
    </>
  )

  // クーポン受け取りフロー
  if (isCouponFlow) {
    return (
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🎁</div>
          <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">リワードを受け取る</h1>
          <p className="text-sm text-gray-500">
            リワードを利用するにはアカウントが必要です。<br />
            パスワードを設定して登録してください。
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex mb-4 text-sm">
          <button onClick={() => setMode('signup')}
            className={`flex-1 py-2 border-b-2 transition ${mode === 'signup' ? 'border-[#C4A35A] text-[#1A1A2E] font-medium' : 'border-transparent text-gray-400'}`}>
            新規登録
          </button>
          <button onClick={() => setMode('login')}
            className={`flex-1 py-2 border-b-2 transition ${mode === 'login' ? 'border-[#C4A35A] text-[#1A1A2E] font-medium' : 'border-transparent text-gray-400'}`}>
            既にアカウントがある方
          </button>
        </div>

        {checkingEmail && (
          <p className="text-xs text-gray-400 text-center mb-4">アカウント確認中...</p>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
            {emailParam ? (
              <>
                <input type="email" value={email} readOnly
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700" />
                <p className="text-xs text-green-600 mt-1">✓ 投票時のメールアドレスが入力されています</p>
              </>
            ) : (
              <>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  onBlur={() => email && email.includes('@') && checkEmail(email)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
                  placeholder="メールアドレス" />
                <p className="text-xs text-gray-400 mt-1">※ 投票時に入力したメールアドレスで登録してください</p>
              </>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
              placeholder="パスワード" />
            <p className="text-xs text-gray-400 mt-1">6文字以上で設定してください</p>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={submitting}
            className="w-full py-3 bg-[#C4A35A] text-white font-medium rounded-lg hover:bg-[#b3923f] transition disabled:opacity-50">
            {submitting ? '処理中...' : mode === 'signup' ? '登録してリワードを受け取る' : 'ログイン'}
          </button>
        </form>
        {resetUI}
      </div>
    )
  }

  // 通常のログイン画面
  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2 text-center">REAL PROOF</h1>
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
        <div>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
            placeholder="パスワード" />
          {mode === 'signup' && (
            <p className="text-xs text-gray-400 mt-1">6文字以上で設定してください</p>
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit" disabled={submitting}
          className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition disabled:opacity-50">
          {submitting ? '処理中...' : mode === 'signup' ? '新規登録' : 'ログイン'}
        </button>
      </form>
      {mode === 'login' && resetUI}
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
