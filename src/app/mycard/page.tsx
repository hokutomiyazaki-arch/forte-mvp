'use client'
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getRewardLabel } from '@/lib/types'
import { Suspense } from 'react'

interface RewardWithPro {
  id: string
  reward_id: string
  reward_type: string
  title: string
  content: string
  status: string
  professional_id: string
  pro_name: string
}

interface VoteHistory {
  id: string
  professional_id: string
  result_category: string
  created_at: string
  pro_name?: string
}

function MyCardContent() {
  const searchParams = useSearchParams()
  const emailParam = searchParams.get('email') || ''
  const supabase = createClient()

  // 認証状態: 'loading' | 'auth' | 'ready'
  const [authMode, setAuthMode] = useState<'loading' | 'auth' | 'ready'>('loading')

  // インラインログインフォーム用
  const [authEmail, setAuthEmail] = useState(emailParam)
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authFormMode, setAuthFormMode] = useState<'signup' | 'login'>('signup')
  const [authEmailSent, setAuthEmailSent] = useState(false)
  const [checkingEmail, setCheckingEmail] = useState(false)

  // 通常のmycard用state
  const [rewards, setRewards] = useState<RewardWithPro[]>([])
  const [voteHistory, setVoteHistory] = useState<VoteHistory[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [tab, setTab] = useState<'rewards' | 'history'>('rewards')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [message, setMessage] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [isPro, setIsPro] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [isPasswordReset, setIsPasswordReset] = useState(false)
  const [resetLinkError, setResetLinkError] = useState(false)
  const passwordSectionRef = useRef<HTMLDivElement>(null)

  // データ取得（セッション確立後に呼ぶ）
  async function loadData(email: string, userId: string) {
    setDataLoading(true)
    timerRef.current = setTimeout(() => setTimedOut(true), 5000)
    try {
      console.log('[mycard] loadData start, email:', email, 'userId:', userId)

      // プロ確認
      const { data: proCheck } = await (supabase as any)
        .from('professionals').select('id').eq('user_id', userId).maybeSingle()
      setIsPro(!!proCheck)

      // client_rewards を取得（active + used）
      const { data: clientRewards, error: crError } = await (supabase as any)
        .from('client_rewards')
        .select('id, reward_id, professional_id, status')
        .eq('client_email', email)
        .in('status', ['active', 'used'])
        .order('created_at', { ascending: false })
      console.log('[mycard] client_rewards:', { count: clientRewards?.length, error: crError?.message })

      if (clientRewards && clientRewards.length > 0) {
        const rewardIds = Array.from(new Set(clientRewards.map((cr: any) => cr.reward_id)))
        const { data: rewardData } = await (supabase as any)
          .from('rewards')
          .select('id, reward_type, title, content')
          .in('id', rewardIds)

        const rewardMap = new Map<string, { reward_type: string; title: string; content: string }>()
        if (rewardData) {
          for (const r of rewardData) {
            rewardMap.set(r.id, { reward_type: r.reward_type, title: r.title || '', content: r.content })
          }
        }

        const proIds = Array.from(new Set(clientRewards.map((cr: any) => cr.professional_id)))
        const { data: proData } = await (supabase as any)
          .from('professionals')
          .select('id, name')
          .in('id', proIds)

        const proMap = new Map<string, string>()
        if (proData) {
          for (const p of proData) {
            proMap.set(p.id, p.name)
          }
        }

        const merged: RewardWithPro[] = clientRewards.map((cr: any) => {
          const reward = rewardMap.get(cr.reward_id)
          return {
            id: cr.id,
            reward_id: cr.reward_id,
            reward_type: reward?.reward_type || '',
            title: reward?.title || '',
            content: reward?.content || '',
            status: cr.status,
            professional_id: cr.professional_id,
            pro_name: proMap.get(cr.professional_id) || 'プロ',
          }
        })
        setRewards(merged)
      }

      // 投票履歴取得
      const { data: voteData } = await (supabase as any)
        .from('votes')
        .select('id, professional_id, result_category, created_at')
        .eq('voter_email', email)
        .order('created_at', { ascending: false })

      if (voteData && voteData.length > 0) {
        const voteProIds = Array.from(new Set(voteData.map((v: any) => v.professional_id)))
        const { data: voteProData } = await (supabase as any)
          .from('professionals')
          .select('id, name')
          .in('id', voteProIds)

        const voteProMap = new Map<string, string>()
        if (voteProData) {
          for (const p of voteProData) {
            voteProMap.set(p.id, p.name)
          }
        }

        setVoteHistory(voteData.map((v: any) => ({
          ...v,
          pro_name: voteProMap.get(v.professional_id) || '不明',
        })))
      }

      console.log('[mycard] loadData complete')
    } catch (e) {
      console.error('[mycard] loadData error:', e)
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    setDataLoading(false)
  }

  // 初回: セッション確認
  useEffect(() => {
    async function checkSession() {
      const hash = window.location.hash
      if (hash.includes('error=access_denied') || hash.includes('otp_expired')) {
        setResetLinkError(true)
        window.location.hash = ''
      }
      if (hash.includes('type=recovery')) {
        setIsPasswordReset(true)
        setShowSettings(true)
      }
      console.log('[mycard] checkSession start')
      const { data: { session } } = await supabase.auth.getSession()
      console.log('[mycard] session:', session?.user?.email || 'none')

      if (session?.user) {
        const email = session.user.email || ''
        setUserEmail(email)
        setAuthMode('ready')
        await loadData(email, session.user.id)
      } else {
        // 未ログイン: インラインフォーム表示
        setAuthMode('auth')
        // emailパラメータがある場合、既存ユーザーかチェック
        if (emailParam && emailParam.includes('@')) {
          checkExistingEmail(emailParam)
        }
      }
    }
    checkSession()
  }, [])

  // パスワードリセット着地時にスクロール
  useEffect(() => {
    if (isPasswordReset && authMode === 'ready') {
      setTimeout(() => {
        passwordSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 300)
    }
  }, [isPasswordReset, authMode])

  // 既存ユーザーチェック
  async function checkExistingEmail(emailToCheck: string) {
    setCheckingEmail(true)
    try {
      const res = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToCheck }),
      })
      const data = await res.json()
      if (data.exists) {
        setAuthFormMode('login')
      }
    } catch (_) {}
    setCheckingEmail(false)
  }

  // インラインログイン/新規登録
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthError('')
    setAuthSubmitting(true)

    try {
      if (authFormMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: { data: { role: 'client' } },
        })
        if (error) throw error

        // 既存ユーザー検知: identities が空 = このメールは既に登録済み
        if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
          setAuthError('このメールアドレスは既に登録されています。ログインしてください。')
          setAuthFormMode('login')
          setAuthSubmitting(false)
          return
        }

        // Supabaseの設定によってはメール確認が必要
        if (data.session) {
          // メール確認不要: そのままセッション確立
          const user = data.session.user
          const email = user.email || ''
          setUserEmail(email)

          // clients テーブルにupsert
          try {
            const nn = user.user_metadata?.full_name || email.split('@')[0] || 'ユーザー'
            await (supabase as any).from('clients').upsert({
              user_id: user.id,
              nickname: nn,
            }, { onConflict: 'user_id' })
          } catch (_) {}

          // ウェルカムメール送信
          try {
            await fetch('/api/welcome-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, isGoogle: false }),
            })
          } catch (_) {}

          setAuthMode('ready')
          await loadData(email, user.id)
        } else {
          // メール確認が必要
          setAuthEmailSent(true)
        }
      } else {
        // ログイン
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        })
        if (error) throw error

        if (data.session?.user) {
          const user = data.session.user
          const email = user.email || ''
          setUserEmail(email)
          setAuthMode('ready')
          await loadData(email, user.id)
        }
      }
    } catch (err: any) {
      const msg = err.message || ''
      if (msg.includes('Invalid login credentials')) {
        setAuthError('メールアドレスまたはパスワードが正しくありません')
      } else if (msg.includes('User already registered')) {
        setAuthError('このメールアドレスは既に登録されています。ログインしてください。')
        setAuthFormMode('login')
      } else {
        setAuthError(msg || 'エラーが発生しました')
      }
    }
    setAuthSubmitting(false)
  }

  // リワード使用/削除
  async function handleRedeem(clientRewardId: string) {
    setRedeeming(true)
    setMessage('')

    const reward = rewards.find(r => r.id === clientRewardId)
    const isCoupon = reward?.reward_type === 'coupon'

    const { error } = await (supabase as any)
      .from('client_rewards')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', clientRewardId)

    if (error) {
      setMessage('エラーが発生しました。もう一度お試しください。')
    } else {
      setRewards(prev => prev.map(r =>
        r.id === clientRewardId ? { ...r, status: 'used' } : r
      ))
      setMessage(isCoupon ? 'リワードを使用しました！' : 'リワードを削除しました。')
    }

    setRedeeming(false)
    setConfirmingId(null)
  }

  // パスワード変更
  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setChangingPassword(true)
    setMessage('')

    if (newPassword.length < 6) {
      setMessage('エラー：パスワードは6文字以上で入力してください')
      setChangingPassword(false)
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setMessage('エラー：パスワードが一致しません')
      setChangingPassword(false)
      return
    }

    const { error: updateError } = await (supabase as any).auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      setMessage('エラー：パスワードの変更に失敗しました。')
    } else {
      setMessage('パスワードを変更しました。')
      setNewPassword('')
      setNewPasswordConfirm('')
      setShowSettings(false)
    }
    setChangingPassword(false)
  }

  // ========== リセットリンク期限切れ ==========
  if (resetLinkError) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">
          リンクの有効期限が切れています
        </h1>
        <p className="text-gray-500 mb-6">
          もう一度パスワードリセットをお試しください
        </p>
        <a href="/login" className="px-6 py-3 bg-[#1A1A2E] text-white rounded-lg font-medium">
          ログインページへ
        </a>
      </div>
    )
  }

  // ========== ローディング画面 ==========
  if (authMode === 'loading') {
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  // ========== メール確認待ち画面 ==========
  if (authEmailSent) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4">
        <div className="w-16 h-16 rounded-full bg-[#C4A35A]/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#C4A35A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-[#1A1A2E] mb-4">確認メールを送信しました</h1>
        <p className="text-sm text-gray-500">
          {authEmail} にメールを送信しました。<br />
          メール内のリンクをクリックして登録を完了してください。
        </p>
      </div>
    )
  }

  // ========== インラインログインフォーム ==========
  if (authMode === 'auth') {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-[#C4A35A]/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#C4A35A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">リワードを保存するには<br />アカウント登録が必要です</h1>
          <p className="text-sm text-gray-500">パスワードを設定するだけで完了します</p>
        </div>

        {/* 新規登録/ログイン切替 */}
        <div className="flex mb-6 text-sm">
          <button
            onClick={() => { setAuthFormMode('signup'); setAuthError('') }}
            className={`flex-1 py-2 border-b-2 transition ${authFormMode === 'signup' ? 'border-[#C4A35A] text-[#1A1A2E] font-medium' : 'border-transparent text-gray-400'}`}
          >
            新規登録
          </button>
          <button
            onClick={() => { setAuthFormMode('login'); setAuthError('') }}
            className={`flex-1 py-2 border-b-2 transition ${authFormMode === 'login' ? 'border-[#C4A35A] text-[#1A1A2E] font-medium' : 'border-transparent text-gray-400'}`}
          >
            ログイン
          </button>
        </div>

        {checkingEmail && (
          <p className="text-xs text-gray-400 text-center mb-4">アカウント確認中...</p>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
            {emailParam ? (
              <>
                <input type="email" value={authEmail} readOnly
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700" />
                <p className="text-xs text-green-600 mt-1">投票時のメールアドレスが入力されています</p>
              </>
            ) : (
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required
                onBlur={() => authEmail && authEmail.includes('@') && checkExistingEmail(authEmail)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
                placeholder="メールアドレス" />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
            <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required minLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
              placeholder="パスワード" />
            <p className="text-xs text-gray-400 mt-1">6文字以上で設定してください</p>
          </div>

          {authError && <p className="text-red-500 text-sm">{authError}</p>}

          <button type="submit" disabled={authSubmitting}
            className="w-full py-3 bg-[#C4A35A] text-white font-medium rounded-lg hover:bg-[#b3923f] transition disabled:opacity-50">
            {authSubmitting ? '処理中...' : authFormMode === 'signup' ? 'アカウント作成' : 'ログイン'}
          </button>
        </form>
      </div>
    )
  }

  // ========== データ取得中 ==========
  if (dataLoading) {
    if (timedOut) {
      return (
        <div className="text-center py-16 px-4">
          <p className="text-gray-500 mb-4">データの取得に問題がありました。ページを再読み込みしてください。</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-[#1A1A2E] text-white rounded-lg hover:bg-[#2a2a4e] transition text-sm"
          >
            再読み込み
          </button>
        </div>
      )
    }
    return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  }

  // ========== 通常のmycard表示 ==========
  const activeRewards = rewards.filter(r => r.status === 'active')
  const usedRewards = rewards.filter(r => r.status === 'used')

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {isPasswordReset && (
        <div className="bg-[#C4A35A]/10 border border-[#C4A35A] rounded-lg p-4 mb-4 text-center">
          <p className="text-sm font-bold text-[#1A1A2E]">パスワードを再設定してください</p>
          <p className="text-xs text-gray-500 mt-1">下のパスワード変更欄から新しいパスワードを設定できます</p>
        </div>
      )}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-[#1A1A2E]">リワード</h1>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 text-gray-400 hover:text-[#1A1A2E] transition"
          title="設定"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
      {userEmail && (
        <p className="text-sm text-gray-400 mb-6">{userEmail}</p>
      )}

      {/* 設定パネル */}
      {showSettings && (
        <div ref={passwordSectionRef} className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-bold text-[#1A1A2E] mb-4">パスワード変更</h2>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none text-sm"
              placeholder="新しいパスワード（6文字以上）"
            />
            <input
              type="password"
              value={newPasswordConfirm}
              onChange={e => setNewPasswordConfirm(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none text-sm"
              placeholder="新しいパスワード（確認）"
            />
            <button
              type="submit"
              disabled={changingPassword}
              className="w-full py-2 bg-[#1A1A2E] text-white text-sm font-medium rounded-lg hover:bg-[#2a2a4e] transition disabled:opacity-50"
            >
              {changingPassword ? '変更中...' : 'パスワードを変更'}
            </button>
          </form>
        </div>
      )}

      {message && (
        <div className={`p-3 rounded-lg mb-4 text-sm ${
          message.startsWith('エラー') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          {message}
        </div>
      )}

      {/* タブ */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab('rewards')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${
            tab === 'rewards'
              ? 'border-[#C4A35A] text-[#C4A35A]'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          リワード ({activeRewards.length})
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 py-3 text-sm font-medium border-b-2 transition ${
            tab === 'history'
              ? 'border-[#C4A35A] text-[#C4A35A]'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          投票履歴 ({voteHistory.length})
        </button>
      </div>

      {/* リワードタブ */}
      {tab === 'rewards' && (
        <div className="space-y-4">
          {activeRewards.length === 0 && usedRewards.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">リワードはまだありません</p>
              <p className="text-xs text-gray-300 mt-2">プロにプルーフを贈ると、リワードがもらえることがあります。</p>
            </div>
          ) : (
            <>
              {activeRewards.map(reward => {
                const isCoupon = reward.reward_type === 'coupon'
                return (
                  <div key={reward.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    {/* リワード情報エリア */}
                    <div className="p-5">
                      <p className="text-xs text-[#C4A35A] font-medium mb-1">
                        {reward.title || getRewardLabel(reward.reward_type)}
                      </p>
                      <p className="text-xl font-bold text-[#1A1A2E] mb-4">{reward.content}</p>

                      {confirmingId === reward.id ? (
                        <div className="space-y-2">
                          <p className="text-sm text-center text-orange-600 font-medium">
                            {isCoupon ? '本当に使用しますか？この操作は取り消せません。' : 'このリワードを削除しますか？'}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRedeem(reward.id)}
                              disabled={redeeming}
                              className={`flex-1 py-2 text-white font-bold rounded-lg transition disabled:opacity-50 ${
                                isCoupon ? 'bg-[#C4A35A] hover:bg-[#b3923f]' : 'bg-red-500 hover:bg-red-600'
                              }`}
                            >
                              {redeeming ? '処理中...' : isCoupon ? '使用する' : '削除する'}
                            </button>
                            <button
                              onClick={() => setConfirmingId(null)}
                              className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingId(reward.id)}
                          className={`w-full py-3 font-medium rounded-lg transition text-sm ${
                            isCoupon
                              ? 'bg-[#1A1A2E] text-white hover:bg-[#2a2a4e]'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          {isCoupon ? '使用する' : '削除する'}
                        </button>
                      )}
                    </div>

                    {/* プロ情報エリア */}
                    <div className="border-t border-gray-100 px-5 py-3 bg-[#FAFAF7] flex items-center justify-between">
                      <p className="text-sm text-gray-500">{reward.pro_name}さん</p>
                      {reward.professional_id && (
                        <a
                          href={`/card/${reward.professional_id}`}
                          className="text-xs text-[#C4A35A] font-medium hover:underline transition"
                        >
                          このプロのカードを見る →
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}

              {usedRewards.length > 0 && (
                <div className="mt-4">
                  <h2 className="text-sm font-medium text-gray-400 mb-3">使用済み / 削除済み</h2>
                  {usedRewards.map(reward => (
                    <div key={reward.id} className="bg-gray-50 text-gray-400 rounded-xl overflow-hidden mb-2">
                      <div className="p-4">
                        <p className="text-xs text-gray-300 mb-1">
                          {reward.title || getRewardLabel(reward.reward_type)}
                        </p>
                        <p className="text-sm line-through">{reward.content}</p>
                        <p className="text-xs mt-1">
                          {reward.reward_type === 'coupon' ? '使用済み' : '削除済み'}
                        </p>
                      </div>
                      <div className="border-t border-gray-200 px-4 py-2 flex items-center justify-between">
                        <p className="text-xs text-gray-300">{reward.pro_name}さん</p>
                        {reward.professional_id && (
                          <a
                            href={`/card/${reward.professional_id}`}
                            className="text-xs text-gray-400 hover:text-[#C4A35A] transition"
                          >
                            カードを見る →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 投票履歴タブ */}
      {tab === 'history' && (
        <div className="space-y-3">
          {voteHistory.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">まだ投票していません</p>
            </div>
          ) : (
            voteHistory.map(v => (
              <a
                key={v.id}
                href={`/card/${v.professional_id}`}
                className="block p-4 border border-gray-200 rounded-lg hover:border-[#C4A35A] transition"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-[#1A1A2E]">{v.pro_name}</p>
                    <p className="text-xs text-gray-400">{v.result_category}</p>
                  </div>
                  <p className="text-xs text-gray-400">
                    {new Date(v.created_at).toLocaleDateString('ja-JP')}
                  </p>
                </div>
              </a>
            ))
          )}
        </div>
      )}

      {/* フッター */}
      <div className="mt-8 space-y-3 text-center">
        <a
          href="/explore"
          className="inline-block px-6 py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition"
        >
          他のプロを探す
        </a>
        {!isPro && (
          <div>
            <a
              href="/dashboard"
              className="inline-block text-sm text-[#C4A35A] hover:underline"
            >
              プロとしても登録する
            </a>
          </div>
        )}
      </div>

      {/* アカウント削除 */}
      <div className="mt-12 text-center">
        <button
          onClick={async () => {
            if (!window.confirm('本当にアカウントを削除しますか？この操作は取り消せません。')) return
            try {
              const { error } = await (supabase as any).rpc('delete_user_account')
              if (error) {
                console.error('[delete_user_account] error:', error.message)
                alert('アカウント削除に失敗しました。もう一度お試しください。')
                return
              }
            } catch (e) {
              console.error('[delete_user_account] exception:', e)
              alert('アカウント削除に失敗しました。もう一度お試しください。')
              return
            }
            await supabase.auth.signOut()
            window.location.href = '/'
          }}
          className="text-sm text-red-400 hover:text-red-600 transition"
        >
          アカウントを削除する
        </button>
      </div>
    </div>
  )
}

export default function MyCardPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-gray-400">読み込み中...</div>}>
      <MyCardContent />
    </Suspense>
  )
}
