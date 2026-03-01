'use client'
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useUser, useClerk } from '@clerk/nextjs'
import { getRewardLabel } from '@/lib/types'
import RewardContent from '@/components/RewardContent'
import CardModeSwitch from '@/components/CardModeSwitch'
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
  pro_title?: string
  pro_photo_url?: string
  pro_prefecture?: string
  pro_area?: string
}

function MyCardContent() {
  const searchParams = useSearchParams()
  const emailParam = searchParams.get('email') || ''
  const supabase = createClient()
  const { user: clerkUser, isLoaded: authLoaded, isSignedIn } = useUser()
  const { signOut } = useClerk()
  const authUser = clerkUser ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress, user_metadata: {} as Record<string, any> } : null

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
  const [tab, setTab] = useState<'rewards' | 'history' | 'bookmarked' | 'myproof' | 'card'>('rewards')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [message, setMessage] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [isPro, setIsPro] = useState(false)
  const [bookmarkedPros, setBookmarkedPros] = useState<any[]>([])
  const [bookmarkCount, setBookmarkCount] = useState(0)
  const [userEmail, setUserEmail] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [isPasswordReset, setIsPasswordReset] = useState(false)
  const [resetLinkError, setResetLinkError] = useState(false)
  const [isLineUser, setIsLineUser] = useState(false)
  const passwordSectionRef = useRef<HTMLDivElement>(null)
  const [myProofQrUrl, setMyProofQrUrl] = useState('')
  const [nickname, setNickname] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)

  function generateMyProofQR() {
    if (!authUser?.id) return
    const url = `${window.location.origin}/myproof/${authUser.id}`
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`
    setMyProofQrUrl(qrApiUrl)
  }

  // データ取得（セッション確立後に呼ぶ）
  async function loadData(email: string, userId: string) {
    setDataLoading(true)
    timerRef.current = setTimeout(() => setTimedOut(true), 10000)
    try {
      console.log('[mycard] loadData start, email:', email, 'userId:', userId)

      // プロ確認
      const { data: proCheck } = await (supabase as any)
        .from('professionals').select('id').eq('user_id', userId).maybeSingle()
      setIsPro(!!proCheck)

      // ニックネーム取得
      const { data: clientData } = await (supabase as any)
        .from('clients').select('nickname').eq('user_id', userId).maybeSingle()
      if (clientData?.nickname) setNickname(clientData.nickname)

      // LINE認証ユーザー判定 + LINE userId抽出
      const isLine = email.startsWith('line_') && email.endsWith('@line.realproof.jp')
      const lineUserId = isLine ? email.replace('line_', '').replace('@line.realproof.jp', '') : null
      console.log('[mycard] isLine:', isLine, 'lineUserId:', lineUserId)

      // client_rewards を取得 — 複数方法で検索
      let allClientRewards: any[] = []

      // 方法1: client_email ベース
      const { data: clientRewards, error: crError } = await (supabase as any)
        .from('client_rewards')
        .select('id, reward_id, professional_id, status')
        .eq('client_email', email)
        .in('status', ['active', 'used'])
        .order('created_at', { ascending: false })
      console.log('[mycard] client_rewards by email:', { count: clientRewards?.length, error: crError?.message })

      if (clientRewards && clientRewards.length > 0) {
        allClientRewards = clientRewards
      }

      // 方法2: LINE認証の場合 auth_provider_id → votes → client_rewards
      if (allClientRewards.length === 0 && lineUserId) {
        const { data: lineVotes } = await (supabase as any)
          .from('votes')
          .select('id')
          .eq('auth_provider_id', lineUserId)
          .eq('auth_method', 'line')
        if (lineVotes && lineVotes.length > 0) {
          const voteIds = lineVotes.map((v: any) => v.id)
          const { data: crByVote } = await (supabase as any)
            .from('client_rewards')
            .select('id, reward_id, professional_id, status')
            .in('vote_id', voteIds)
            .in('status', ['active', 'used'])
            .order('created_at', { ascending: false })
          if (crByVote && crByVote.length > 0) allClientRewards = crByVote
          console.log('[mycard] client_rewards by auth_provider_id:', { count: crByVote?.length })
        }
      }

      // 方法3: client_user_id ベースフォールバック
      if (allClientRewards.length === 0 && userId) {
        const { data: userVotes } = await (supabase as any)
          .from('votes')
          .select('id, selected_reward_id')
          .eq('client_user_id', userId)
          .not('selected_reward_id', 'is', null)
        if (userVotes && userVotes.length > 0) {
          const voteIds = userVotes.map((v: any) => v.id)
          const { data: crByVote } = await (supabase as any)
            .from('client_rewards')
            .select('id, reward_id, professional_id, status')
            .in('vote_id', voteIds)
            .in('status', ['active', 'used'])
            .order('created_at', { ascending: false })
          if (crByVote && crByVote.length > 0) allClientRewards = crByVote
          console.log('[mycard] client_rewards by client_user_id:', { count: crByVote?.length })
        }
      }

      if (allClientRewards && allClientRewards.length > 0) {
        const rewardIds = Array.from(new Set(allClientRewards.map((cr: any) => cr.reward_id)))
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

        const proIds = Array.from(new Set(allClientRewards.map((cr: any) => cr.professional_id)))
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

        const merged: RewardWithPro[] = allClientRewards.map((cr: any) => {
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

      // 投票履歴取得（複数方法で検索）
      let voteData: any[] | null = null

      // 方法1: voter_email ベース
      const { data: voteByEmail } = await (supabase as any)
        .from('votes')
        .select('id, professional_id, result_category, created_at')
        .eq('voter_email', email)
        .order('created_at', { ascending: false })
      if (voteByEmail && voteByEmail.length > 0) voteData = voteByEmail

      // 方法2: LINE認証の場合 auth_provider_id ベース
      if ((!voteData || voteData.length === 0) && lineUserId) {
        const { data: voteByLine } = await (supabase as any)
          .from('votes')
          .select('id, professional_id, result_category, created_at')
          .eq('auth_provider_id', lineUserId)
          .eq('auth_method', 'line')
          .order('created_at', { ascending: false })
        if (voteByLine && voteByLine.length > 0) voteData = voteByLine
      }

      // 方法3: client_user_id ベースフォールバック
      if ((!voteData || voteData.length === 0) && userId) {
        const { data: voteByUserId } = await (supabase as any)
          .from('votes')
          .select('id, professional_id, result_category, created_at')
          .eq('client_user_id', userId)
          .order('created_at', { ascending: false })
        if (voteByUserId && voteByUserId.length > 0) voteData = voteByUserId
      }

      if (voteData && voteData.length > 0) {
        const voteProIds = Array.from(new Set(voteData.map((v: any) => v.professional_id)))
        const { data: voteProData } = await (supabase as any)
          .from('professionals')
          .select('id, name, title, photo_url, prefecture, area_description')
          .in('id', voteProIds)

        const voteProMap = new Map<string, any>()
        if (voteProData) {
          for (const p of voteProData) {
            voteProMap.set(p.id, p)
          }
        }

        setVoteHistory(voteData.map((v: any) => {
          const p = voteProMap.get(v.professional_id)
          return {
            ...v,
            pro_name: p?.name || '不明',
            pro_title: p?.title || '',
            pro_photo_url: p?.photo_url || '',
            pro_prefecture: p?.prefecture || '',
            pro_area: p?.area_description || '',
          }
        }))
      }

      // ブックマーク一覧取得
      const { data: bookmarks } = await (supabase as any)
        .from('bookmarks')
        .select(`
          id,
          created_at,
          professional_id,
          professionals (
            id,
            name,
            title,
            photo_url,
            prefecture,
            area_description
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (bookmarks) {
        setBookmarkedPros(bookmarks)
        setBookmarkCount(bookmarks.length)
      }

      console.log('[mycard] loadData complete')
    } catch (e) {
      console.error('[mycard] loadData error:', e)
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    setDataLoading(false)
  }

  // 初回: セッション確認（AuthProviderから取得、setSessionもProvider側で完了済み）
  useEffect(() => {
    if (!authLoaded) return

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

      if (isSignedIn && authUser) {
        const email = authUser.email || ''
        setUserEmail(email)
        // LINE認証ユーザー判定
        const lineUser = (email.startsWith('line_') && email.endsWith('@line.realproof.jp'))
        setIsLineUser(lineUser)
        if (lineUser) setIsPasswordReset(false) // LINEユーザーにはパスワードリセット不要
        setAuthMode('ready')
        await loadData(email, authUser.id)
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
  }, [authLoaded, authUser])

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

  // Clerk handles authentication — redirect to sign-in page
  function handleAuthRedirect() {
    window.location.href = '/sign-in?redirect_url=/mycard'
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

  // パスワード変更 — Clerk handles password management via user profile
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

    try {
      if (clerkUser) {
        await clerkUser.updatePassword({ newPassword, currentPassword: '' })
        setMessage('パスワードを変更しました。')
        setNewPassword('')
        setNewPasswordConfirm('')
        setShowSettings(false)
      }
    } catch {
      setMessage('エラー：パスワードの変更に失敗しました。')
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
        <a href="/sign-in" className="px-6 py-3 bg-[#1A1A2E] text-white rounded-lg font-medium">
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

  // ========== 未ログイン: Clerkログインページへリダイレクト ==========
  if (authMode === 'auth') {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-[#C4A35A]/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#C4A35A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">ログインが必要です</h1>
          <p className="text-sm text-gray-500">リワードや投票履歴を確認できます</p>
        </div>

        <button
          onClick={handleAuthRedirect}
          className="w-full py-3 bg-[#C4A35A] text-white font-medium rounded-lg hover:bg-[#b3923f] transition"
        >
          ログイン / 新規登録
        </button>
      </div>
    )
  }

  // ========== データ取得中: スケルトンUI ==========
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
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-28 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mb-6"></div>
        {/* タブスケルトン */}
        <div className="flex border-b border-gray-200 mb-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-1 py-3 flex justify-center">
              <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
        {/* カードスケルトン */}
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
              <div className="h-4 w-32 bg-gray-200 rounded mb-3 mx-auto"></div>
              <div className="h-8 w-full bg-gray-100 rounded mb-3"></div>
              <div className="h-10 w-full bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ========== 通常のmycard表示 ==========
  const activeRewards = rewards.filter(r => r.status === 'active')
  const usedRewards = rewards.filter(r => r.status === 'used')

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* マイプルーフ QRコード */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 24,
        textAlign: 'center' as const,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', marginBottom: 8 }}>
          マイプルーフ QRコード
        </h2>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
          あなたがプルーフしたものを見せましょう
        </p>
        {myProofQrUrl ? (
          <img src={myProofQrUrl} alt="My Proof QR" style={{ margin: '0 auto 12px', maxWidth: 200, display: 'block' }} />
        ) : (
          <button onClick={generateMyProofQR} style={{
            padding: '12px 24px', fontSize: 14, fontWeight: 700,
            background: '#C4A35A', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
          }}>
            QRコードを発行する
          </button>
        )}
      </div>

      {isPasswordReset && !isLineUser && (
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
        <p className="text-sm text-gray-400 mb-6 truncate max-w-[300px]">
          {userEmail.startsWith('line_') && userEmail.endsWith('@line.realproof.jp') ? 'LINE連携済み' : userEmail}
        </p>
      )}

      {/* 設定パネル */}
      {showSettings && (
        <div ref={passwordSectionRef} className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm space-y-6">

          {/* ニックネーム編集 */}
          <div>
            <h2 className="text-sm font-bold text-[#1A1A2E] mb-3">ニックネーム</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                maxLength={20}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none text-sm"
                placeholder="ニックネームを入力"
              />
              <button
                onClick={async () => {
                  if (!nickname.trim()) return
                  setSavingNickname(true)
                  if (authUser) {
                    await (supabase as any).from('clients').upsert({
                      user_id: authUser.id,
                      nickname: nickname.trim(),
                    }, { onConflict: 'user_id' })
                    setMessage('ニックネームを保存しました')
                  }
                  setSavingNickname(false)
                }}
                disabled={savingNickname}
                className="px-4 py-2 bg-[#1A1A2E] text-white text-sm font-medium rounded-lg hover:bg-[#2a2a4e] transition disabled:opacity-50"
              >
                {savingNickname ? '...' : '保存'}
              </button>
            </div>
          </div>

          {/* パスワード変更 */}
          {isLineUser ? (
            <div className="text-center">
              <p className="text-sm text-green-600 font-medium mb-1">LINE連携済み</p>
              <p className="text-xs text-gray-500">LINEアカウントでログインしています</p>
            </div>
          ) : (
          <div>
            <h2 className="text-sm font-bold text-[#1A1A2E] mb-3">パスワード変更</h2>
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

          {/* アカウント削除 */}
          <div className="pt-4 border-t border-gray-100">
            <button
              onClick={async () => {
                if (!window.confirm('本当にアカウントを削除しますか？この操作は取り消せません。')) return
                try {
                  const { error } = await (supabase as any).rpc('delete_user_account')
                  if (error) {
                    alert('アカウント削除に失敗しました。')
                    return
                  }
                  await signOut()
                  window.location.href = '/'
                } catch (e) {
                  alert('アカウント削除に失敗しました。')
                }
              }}
              className="text-xs text-red-400 hover:text-red-600 transition"
            >
              アカウントを削除する
            </button>
          </div>
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
      <div style={{
        display: 'flex',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        borderBottom: '1px solid #E5E7EB',
        marginBottom: 24,
        scrollbarWidth: 'none',
        gap: 0,
      }}>
        {([
          { key: 'rewards' as const, label: 'リワード', count: activeRewards.length },
          { key: 'history' as const, label: 'プルーフ済み', count: voteHistory.length },
          { key: 'bookmarked' as const, label: '気になる', count: bookmarkCount },
          { key: 'myproof' as const, label: 'マイプルーフ', count: 0 },
          { key: 'card' as const, label: 'カード管理', count: 0 },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: '0 0 auto',
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? '#C4A35A' : '#9CA3AF',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid #C4A35A' : '2px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 0.2s, border-color 0.2s',
            }}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 700 }}>{t.count}</span>
            )}
          </button>
        ))}
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
                      <p className="text-base text-[#C4A35A] font-semibold mb-3 text-center">
                        {reward.title || getRewardLabel(reward.reward_type)}
                      </p>
                      <RewardContent content={reward.content} className="text-lg font-bold text-[#1A1A2E] mb-4 text-center" />

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
                        <RewardContent content={reward.content} className="text-sm" strikethrough />
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
        <div>
          {voteHistory.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">まだ投票していません</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {voteHistory.map(v => (
                <a
                  key={v.id}
                  href={`/card/${v.professional_id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: 16,
                    background: '#fff',
                    border: '1px solid #E8E4DC',
                    borderRadius: 14,
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: '#F0EDE6', overflow: 'hidden', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {v.pro_photo_url ? (
                      <img src={v.pro_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 20, color: '#999' }}>
                        {v.pro_name?.charAt(0) || '?'}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>
                      {v.pro_name}
                    </div>
                    {v.pro_title && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#C4A35A', marginTop: 2 }}>
                        {v.pro_title}
                      </div>
                    )}
                    {(v.pro_prefecture || v.pro_area) && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                        {[v.pro_prefecture, v.pro_area].filter(Boolean).join('・')}
                      </div>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {new Date(v.created_at).toLocaleDateString('ja-JP')}
                    </div>
                    {v.result_category && (
                      <div style={{ fontSize: 10, color: '#C4A35A', marginTop: 2 }}>
                        {v.result_category}
                      </div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 気になるタブ */}
      {tab === 'bookmarked' && (
        <div>
          {bookmarkedPros.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>♡</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#666', marginBottom: 8 }}>
                まだブックマークしたプロがいません
              </div>
              <div style={{ fontSize: 13, color: '#999', lineHeight: 1.8 }}>
                プロのページで「♡ 気になる」を押すと<br />
                ここに追加されます
              </div>
              <a href="/search" style={{
                display: 'inline-block',
                marginTop: 24,
                padding: '12px 32px',
                background: '#C4A35A',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                textDecoration: 'none',
                borderRadius: 8,
              }}>
                プロを探す →
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {bookmarkedPros.map(bookmark => {
                const bPro = bookmark.professionals
                if (!bPro) return null
                return (
                  <a
                    key={bookmark.id}
                    href={`/card/${bPro.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      padding: 16,
                      background: '#fff',
                      border: '1px solid #E8E4DC',
                      borderRadius: 14,
                      textDecoration: 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%',
                      background: '#F0EDE6', overflow: 'hidden', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {bPro.photo_url ? (
                        <img src={bPro.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: 20, color: '#999' }}>
                          {bPro.name?.charAt(0) || '?'}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>
                        {bPro.name}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#C4A35A', marginTop: 2 }}>
                        {bPro.title}
                      </div>
                      {(bPro.prefecture || bPro.area_description) && (
                        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                          {[bPro.prefecture, bPro.area_description].filter(Boolean).join('・')}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={async (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        await (supabase as any)
                          .from('bookmarks')
                          .delete()
                          .eq('id', bookmark.id)
                        setBookmarkedPros(prev => prev.filter(b => b.id !== bookmark.id))
                        setBookmarkCount(prev => prev - 1)
                      }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 18, color: '#C4A35A', padding: 8, flexShrink: 0,
                      }}
                      title="ブックマーク解除"
                    >
                      ♥
                    </button>
                  </a>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* マイプルーフタブ */}
      {tab === 'myproof' && (
        <div>
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
              あなたがプルーフしたプロや、お気に入りのものを公開ページで表示できます。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <a
                href={`/myproof/${authUser?.id}`}
                style={{
                  display: 'inline-block', padding: '12px 32px',
                  fontSize: 14, fontWeight: 700,
                  background: '#1A1A2E', color: '#C4A35A',
                  borderRadius: 8, textDecoration: 'none',
                }}
              >
                マイプルーフを見る
              </a>
              <a
                href="/myproof/edit"
                style={{
                  display: 'inline-block', padding: '12px 32px',
                  fontSize: 14, fontWeight: 700,
                  background: '#C4A35A', color: '#fff',
                  borderRadius: 8, textDecoration: 'none',
                }}
              >
                マイプルーフを編集する
              </a>
            </div>
          </div>
        </div>
      )}

      {/* カード管理タブ */}
      {tab === 'card' && (
        <div>
          <CardModeSwitch />
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
