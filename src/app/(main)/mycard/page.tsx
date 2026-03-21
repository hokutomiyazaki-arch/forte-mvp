'use client'
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useUser, useClerk } from '@clerk/nextjs'
import CardModeSwitch from '@/components/CardModeSwitch'
import PhotoCropper from '@/components/PhotoCropper'
import MyProofTab from '@/components/MyProofTab'
import InstallPrompt from '@/components/InstallPrompt'
import { Suspense } from 'react'

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
  const [voteHistory, setVoteHistory] = useState<VoteHistory[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const tabParam = searchParams.get('tab')
  const [tab, setTab] = useState<'history' | 'bookmarked' | 'myproof' | 'card' | 'myorgs'>(
    tabParam === 'card' || tabParam === 'history' || tabParam === 'bookmarked' || tabParam === 'myorgs'
      ? tabParam : 'myproof'
  )
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
  const [myProofQrToken, setMyProofQrToken] = useState('')
  const [showMyProofQR, setShowMyProofQR] = useState(false)
  const [nickname, setNickname] = useState('')
  const [clientLastName, setClientLastName] = useState('')
  const [clientFirstName, setClientFirstName] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)
  const [clientPhotoUrl, setClientPhotoUrl] = useState<string | null>(null)
  const [birthYear, setBirthYear] = useState('')
  const [birthMonth, setBirthMonth] = useState('')
  const [birthDay, setBirthDay] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [proDeactivated, setProDeactivated] = useState(false)
  const [proId, setProId] = useState<string | null>(null)
  const [proCardMode, setProCardMode] = useState<'pro' | 'general'>('pro')
  const [credentialBadges, setCredentialBadges] = useState<{id: string; name: string; description: string | null; image_url: string | null; org_name: string; org_id: string}[]>([])

  // 団体リソース state
  const [memberOrgs, setMemberOrgs] = useState<{id: string; name: string; description: string | null; logo_url: string | null}[]>([])
  const [selectedMemberOrgId, setSelectedMemberOrgId] = useState<string | null>(null)
  const [memberResources, setMemberResources] = useState<any[]>([])
  const [memberResourcesLoading, setMemberResourcesLoading] = useState(false)
  const [hasOrgMembership, setHasOrgMembership] = useState(false)
  const [memberAccordionOpen, setMemberAccordionOpen] = useState<Record<string, boolean>>({})

  // NFC カード管理 state
  const [nfcCard, setNfcCard] = useState<any>(null)
  const [nfcInput, setNfcInput] = useState('')
  const [nfcLoading, setNfcLoading] = useState(false)
  const [nfcError, setNfcError] = useState('')
  const [nfcSuccess, setNfcSuccess] = useState('')

  function generateMyProofQR() {
    if (!authUser?.id) return
    const url = `${window.location.origin}/myproof/${authUser.id}`
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`
    setMyProofQrUrl(qrApiUrl)
  }

  // データ取得（専用APIで1リクエスト、サーバー側Promise.all並列）
  async function loadData() {
    setDataLoading(true)
    timerRef.current = setTimeout(() => setTimedOut(true), 10000)
    try {
      console.log('[mycard] loadData start via /api/mycard')

      const res = await fetch('/api/mycard')
      if (!res.ok) {
        console.error('[mycard] API error:', res.status)
        return
      }
      const data = await res.json()

      setIsPro(data.isPro)
      if (data.proId) setProId(data.proId)
      if (data.proCardMode) setProCardMode(data.proCardMode)
      if (data.proDeactivated) setProDeactivated(true)
      if (data.nickname) setNickname(data.nickname)
      if (data.clientLastName) setClientLastName(data.clientLastName)
      if (data.clientFirstName) setClientFirstName(data.clientFirstName)
      setUserEmail(data.email)
      setIsLineUser(data.isLine)
      if (data.voteHistory) setVoteHistory(data.voteHistory)
      if (data.bookmarks) {
        setBookmarkedPros(data.bookmarks)
        setBookmarkCount(data.bookmarks.length)
      }
      if (data.credentialBadges) setCredentialBadges(data.credentialBadges)

      // 所属団体一覧を取得（バッジ持ちユーザー用）
      try {
        const orgsRes = await fetch('/api/my/organizations')
        if (orgsRes.ok) {
          const orgsData = await orgsRes.json()
          if (Array.isArray(orgsData) && orgsData.length > 0) {
            setMemberOrgs(orgsData)
            setHasOrgMembership(true)
            setSelectedMemberOrgId(orgsData[0].id)
          }
        }
      } catch (e) {
        console.error('[mycard] member orgs load error:', e)
      }

      // マイプルーフのqr_token取得
      try {
        const myproofRes = await fetch('/api/myproof')
        if (myproofRes.ok) {
          const myproofData = await myproofRes.json()
          if (myproofData.card?.qr_token) {
            setMyProofQrToken(myproofData.card.qr_token)
          }
        }
      } catch (e) {
        console.error('[mycard] myproof token load error:', e)
      }

      // NFCカード情報の取得
      if (authUser?.id) {
        try {
          const { data: nfcData } = await (supabase as any)
            .from('nfc_cards')
            .select('id, card_uid, status, linked_at')
            .eq('user_id', authUser.id)
            .eq('status', 'active')
            .maybeSingle()
          if (nfcData) {
            setNfcCard(nfcData)
          }
        } catch (e) {
          console.error('[mycard] nfc card load error:', e)
        }
      }

      // クライアントプロフィール取得
      try {
        const profileRes = await fetch('/api/client/profile')
        if (profileRes.ok) {
          const profileData = await profileRes.json()
          if (profileData.profile) {
            if (profileData.profile.photo_url) setClientPhotoUrl(profileData.profile.photo_url)
            if (profileData.profile.date_of_birth) {
              const d = new Date(profileData.profile.date_of_birth)
              setBirthYear(String(d.getFullYear()))
              setBirthMonth(String(d.getMonth() + 1))
              setBirthDay(String(d.getDate()))
            }
          }
        }
      } catch (e) {
        console.error('[mycard] profile load error:', e)
      }

      console.log('[mycard] loadData complete via API')
    } catch (e) {
      console.error('[mycard] loadData error:', e)
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    setDataLoading(false)
  }

  // メンバー用: 所属団体のリソース取得
  async function loadMemberResources(orgId: string) {
    setMemberResourcesLoading(true)
    try {
      const res = await fetch(`/api/my/organizations/${orgId}/resources`)
      if (res.ok) {
        const data = await res.json()
        setMemberResources(data)
        // 全アコーディオンをデフォルト開く
        const openState: Record<string, boolean> = {}
        const keys = new Set<string>()
        for (const r of data) {
          keys.add(r.credential_level_id || '__all__')
        }
        keys.forEach(k => { openState[k] = true })
        setMemberAccordionOpen(openState)
      } else {
        setMemberResources([])
      }
    } catch (err) {
      console.error('[mycard] member resources load error:', err)
      setMemberResources([])
    } finally {
      setMemberResourcesLoading(false)
    }
  }

  function handleMyOrgsTab() {
    setTab('myorgs')
    if (selectedMemberOrgId) {
      loadMemberResources(selectedMemberOrgId)
    }
  }

  function handleMemberOrgChange(orgId: string) {
    setSelectedMemberOrgId(orgId)
    loadMemberResources(orgId)
  }

  // メンバー用: リソースをバッジ別グループに変換
  function getMemberResourceGroups() {
    const grouped = new Map<string, any[]>()
    for (const r of memberResources) {
      const key = r.credential_level_id || '__all__'
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(r)
    }
    const groups: { key: string; badgeName: string; resources: any[] }[] = []
    // 「全メンバー向け」を先頭
    if (grouped.has('__all__')) {
      groups.push({ key: '__all__', badgeName: '全メンバー向け', resources: grouped.get('__all__')! })
    }
    grouped.forEach((resources, key) => {
      if (key !== '__all__') {
        const badgeName = resources[0]?.credential_level_name || 'バッジ'
        groups.push({ key, badgeName: `${badgeName} 専用`, resources })
      }
    })
    return groups
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
        // ロールチェック: DBにレコードなし → /onboarding
        try {
          const roleRes = await fetch('/api/user/role')
          const roleData = await roleRes.json()
          if (roleData.role === null) {
            window.location.href = '/onboarding'
            return
          }
          if (roleData.proDeactivated) {
            setProDeactivated(true)
          }
        } catch (e) {
          console.error('[mycard] role check error:', e)
        }
        setAuthMode('ready')
        await loadData()
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
  }, [authLoaded, clerkUser?.id])

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

  // アカウント削除
  async function handleDeleteAccount() {
    setDeletingAccount(true)
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        await signOut()
        window.location.href = '/'
      } else {
        alert('アカウント削除に失敗しました。')
        setDeletingAccount(false)
      }
    } catch (err) {
      console.error('[mycard] delete account error:', err)
      alert('アカウント削除に失敗しました。')
      setDeletingAccount(false)
    }
  }

  // NFC カード登録（一般ユーザー = user_id ベース）
  async function linkNfcCard() {
    if (!authUser?.id) return
    const cardUid = nfcInput.trim().toUpperCase()
    if (!cardUid) { setNfcError('カードIDを入力してください。'); return }

    setNfcLoading(true)
    setNfcError('')
    setNfcSuccess('')

    try {
      // 1. card_uid が存在し、unlinked状態か確認
      const { data: card } = await (supabase as any)
        .from('nfc_cards')
        .select('id, status, user_id, professional_id')
        .eq('card_uid', cardUid)
        .maybeSingle()

      if (!card) {
        setNfcError('カードIDが見つかりません。カード裏面のIDを確認してください。')
        setNfcLoading(false)
        return
      }
      if (card.status !== 'unlinked' && (card.user_id || card.professional_id)) {
        setNfcError('このカードは既に使用されています。')
        setNfcLoading(false)
        return
      }

      // 2. 既存のアクティブカードがないことを確認
      const { data: existing } = await (supabase as any)
        .from('nfc_cards')
        .select('id, card_uid')
        .eq('user_id', authUser.id)
        .eq('status', 'active')
        .maybeSingle()

      if (existing) {
        setNfcError(`既にカード（${existing.card_uid}）が登録されています。先に解除してください。`)
        setNfcLoading(false)
        return
      }

      // 3. カードを紐付け（user_id ベース）
      // プロの場合は professional_id も同時にセット
      const updateData: any = {
        user_id: authUser.id,
        status: 'active',
        linked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (isPro && proId) {
        updateData.professional_id = proId
      }

      const { error } = await (supabase as any)
        .from('nfc_cards')
        .update(updateData)
        .eq('id', card.id)

      if (error) {
        setNfcError('カードの登録に失敗しました。')
        setNfcLoading(false)
        return
      }

      setNfcCard({ id: card.id, card_uid: cardUid, status: 'active', linked_at: new Date().toISOString() })
      setNfcInput('')
      setNfcSuccess('カードが登録されました ✓')
      setTimeout(() => setNfcSuccess(''), 3000)
    } catch {
      setNfcError('エラーが発生しました。')
    }
    setNfcLoading(false)
  }

  // NFC カード紐付け解除
  async function unlinkNfcCard() {
    if (!authUser?.id || !nfcCard) return
    setNfcLoading(true)
    setNfcError('')

    try {
      const { error } = await (supabase as any)
        .from('nfc_cards')
        .update({
          user_id: null,
          professional_id: null,
          status: 'unlinked',
          updated_at: new Date().toISOString(),
        })
        .eq('id', nfcCard.id)

      if (error) {
        setNfcError('解除に失敗しました。')
        setNfcLoading(false)
        return
      }

      setNfcCard(null)
      setNfcSuccess('カードの紐付けを解除しました。')
      setTimeout(() => setNfcSuccess(''), 3000)
    } catch {
      setNfcError('エラーが発生しました。')
    }
    setNfcLoading(false)
  }

  // プロ昇格/再登録
  async function handleUpgradeToPro() {
    try {
      const res = await fetch('/api/professional/register', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        window.location.href = '/dashboard'
      } else {
        alert('プロ登録に失敗しました。')
      }
    } catch (err) {
      console.error('[mycard] upgrade to pro error:', err)
      alert('プロ登録に失敗しました。')
    }
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
          <p className="text-sm text-gray-500">投票履歴やプルーフカードを確認できます</p>
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

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* プロ管理画面ボタン */}
      {isPro && (
        <button
          onClick={() => { window.location.href = '/dashboard' }}
          className="w-full mb-4 py-3 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: '#C4A35A' }}
        >
          プロ管理画面へ
        </button>
      )}

      {/* マイプルーフ QRコード */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-6 text-center">
        <h2 className="text-base font-bold text-[#1A1A2E] mb-1">プルーフカード QRコード</h2>
        <p className="text-xs text-gray-500 mb-4">
          スキャンするとあなたのプルーフカードページが開きます（期限なし）
        </p>
        {myProofQrToken ? (
          <>
            {showMyProofQR ? (
              <>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/myproof/p/${myProofQrToken}`)}`}
                  alt="プルーフカード QR"
                  className="mx-auto mb-4"
                  style={{ width: 200, height: 200 }}
                />
                <button
                  onClick={() => setShowMyProofQR(false)}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  &#10005; 閉じる
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowMyProofQR(true)}
                className="bg-[#C4A35A] text-white rounded-lg px-6 py-3 text-sm font-semibold"
              >
                QRコードを表示する
              </button>
            )}
          </>
        ) : (
          <button
            onClick={generateMyProofQR}
            className="bg-[#C4A35A] text-white rounded-lg px-6 py-3 text-sm font-semibold"
          >
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
        <h1 className="text-2xl font-bold text-[#1A1A2E]">ダッシュボード</h1>
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

      {/* 姓名未設定バナー */}
      {!clientFirstName?.trim() && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-amber-800 font-medium mb-2">
            姓名が未設定です。プロフィールを更新してください。
          </p>
          <button
            onClick={() => setShowSettings(true)}
            className="text-sm font-bold text-[#C4A35A] hover:underline"
          >
            プロフィール編集へ →
          </button>
        </div>
      )}

      {/* 設定パネル */}
      {showSettings && (
        <div ref={passwordSectionRef} className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm space-y-6">

          {/* プロフィール */}
          <div>
            <h2 className="text-sm font-bold text-[#1A1A2E] mb-3">プロフィール</h2>

            {/* 写真クロッパー */}
            <PhotoCropper
              currentPhotoUrl={clientPhotoUrl}
              onCropComplete={async (blob: Blob) => {
                if (!authUser) return
                setUploadingAvatar(true)
                try {
                  const formData = new FormData()
                  formData.append('file', blob, 'avatar.jpg')
                  const res = await fetch('/api/upload/avatar', { method: 'POST', body: formData })
                  const data = await res.json()
                  if (data.url) {
                    setClientPhotoUrl(data.url + '?t=' + Date.now())
                    await fetch('/api/client/profile', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ photo_url: data.url }),
                    })
                    setMessage('写真を更新しました')
                  }
                } catch (e) {
                  console.error('[mycard] avatar upload error:', e)
                }
                setUploadingAvatar(false)
              }}
            />
            {uploadingAvatar && <p className="text-xs text-gray-400 text-center mt-1">アップロード中...</p>}

            {/* 姓名 */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-600">姓</label>
                <input
                  type="text"
                  value={clientLastName}
                  onChange={e => setClientLastName(e.target.value)}
                  placeholder="山田"
                  maxLength={20}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm focus:ring-2 focus:ring-[#C4A35A] outline-none"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">名</label>
                <input
                  type="text"
                  value={clientFirstName}
                  onChange={e => setClientFirstName(e.target.value)}
                  placeholder="太郎"
                  maxLength={20}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm focus:ring-2 focus:ring-[#C4A35A] outline-none"
                />
              </div>
            </div>

            {/* 生年月日 */}
            <div className="mt-4">
              <label className="text-sm text-gray-600">生年月日</label>
              <div className="flex gap-2 mt-1">
                <select value={birthYear} onChange={(e) => setBirthYear(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm flex-1 focus:ring-2 focus:ring-[#C4A35A] outline-none">
                  <option value="">年</option>
                  {Array.from({ length: 71 }, (_, i) => 1940 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm w-20 focus:ring-2 focus:ring-[#C4A35A] outline-none">
                  <option value="">月</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select value={birthDay} onChange={(e) => setBirthDay(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm w-20 focus:ring-2 focus:ring-[#C4A35A] outline-none">
                  <option value="">日</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={async () => {
                setSavingProfile(true)
                try {
                  const dateOfBirth = birthYear && birthMonth && birthDay
                    ? `${birthYear}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`
                    : undefined
                  await fetch('/api/client/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      last_name: clientLastName.trim() || undefined,
                      first_name: clientFirstName.trim() || undefined,
                      nickname: clientLastName.trim() && clientFirstName.trim()
                        ? `${clientLastName.trim()} ${clientFirstName.trim()}`
                        : nickname.trim() || undefined,
                      date_of_birth: dateOfBirth || undefined,
                    }),
                  })
                  setMessage('プロフィールを保存しました')
                } catch (e) {
                  console.error('[mycard] profile save error:', e)
                }
                setSavingProfile(false)
              }}
              disabled={savingProfile}
              className="mt-4 w-full bg-[#1A1A2E] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a4e] transition disabled:opacity-50"
            >
              {savingProfile ? '保存中...' : '保存する'}
            </button>
          </div>

          {/* プロ登録再開（deactivated proのみ表示） */}
          {proDeactivated && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">
                プロ登録を再開しますか？
              </p>
              <p className="text-xs text-gray-400 mb-3">
                以前のプルーフデータはそのまま残っています。
              </p>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/professional/reactivate', { method: 'POST' })
                    if (res.ok) {
                      window.location.href = '/dashboard'
                    } else {
                      alert('復活に失敗しました')
                    }
                  } catch (e) {
                    console.error('[mycard] reactivate error:', e)
                    alert('復活に失敗しました')
                  }
                }}
                className="px-4 py-2 bg-[#1A1A2E] text-white rounded-lg text-sm hover:opacity-90"
              >
                プロ登録を再開する →
              </button>
            </div>
          )}

          {/* プロ登録（一般ユーザー向け） */}
          {!isPro && !proDeactivated && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">
                プロとしても登録しませんか？
              </p>
              <p className="text-xs text-gray-400 mb-3">
                クライアントからのプルーフ（投票）を受け取れるようになります。
              </p>
              <button
                onClick={handleUpgradeToPro}
                className="px-4 py-2 bg-[#1A1A2E] text-white rounded-lg text-sm hover:opacity-90"
              >
                プロとして登録する →
              </button>
            </div>
          )}

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
              onClick={() => setShowDeleteAccountModal(true)}
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
          { key: 'myproof' as const, label: 'プルーフカード', count: 0 },
          { key: 'history' as const, label: 'プルーフ済み', count: voteHistory.length },
          { key: 'bookmarked' as const, label: 'ブックマーク', count: bookmarkCount },
          ...(hasOrgMembership ? [{ key: 'myorgs' as const, label: '📋 団体', count: 0 }] : []),
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => t.key === 'myorgs' ? handleMyOrgsTab() : setTab(t.key)}
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

      {/* ブックマークタブ */}
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
                        try {
                          const res = await fetch('/api/db', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'delete',
                              table: 'bookmarks',
                              query: { eq: { id: bookmark.id } }
                            })
                          })
                          const result = await res.json()
                          if (result.error) {
                            console.error('Bookmark delete error:', result.error)
                            return
                          }
                          setBookmarkedPros(prev => prev.filter(b => b.id !== bookmark.id))
                          setBookmarkCount(prev => prev - 1)
                        } catch (err) {
                          console.error('Bookmark remove error:', err)
                        }
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

      {/* プルーフカードタブ */}
      {tab === 'myproof' && (
        <>
          {/* 保有バッジ */}
          {credentialBadges.length > 0 && (
            <div className="mb-4">
              <h3 style={{ color: '#1A1A2E', fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>
                保有バッジ
              </h3>
              <div className="space-y-2">
                {credentialBadges.map((badge) => (
                  <div key={badge.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: '#fff', border: '1px solid #E8E4DC' }}>
                    {badge.image_url ? (
                      <img src={badge.image_url} alt={badge.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #C4A35A, #E8D5A0)' }}>
                        <span className="text-white font-bold">{badge.name.charAt(0)}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A1A2E' }}>{badge.name}</p>
                      <p style={{ fontSize: '11px', color: '#888' }}>{badge.org_name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {myProofQrToken && (
            <a
              href={`/myproof/p/${myProofQrToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 mb-4 bg-white rounded-xl shadow-sm text-sm font-medium hover:bg-gray-50 transition"
              style={{ color: '#C4A35A' }}
            >
              プルーフカードを確認する &#8594;
            </a>
          )}
          <MyProofTab />
        </>
      )}

      {/* カード管理タブ */}
      {tab === 'card' && (
        <div>
          {/* NFC カード管理セクション */}
          <div style={{
            background: '#fff', borderRadius: 12,
            border: '1px solid #E8E4DC', padding: 20,
            marginBottom: 16,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E', marginBottom: 16 }}>
              NFCカード設定
            </h3>

            {nfcCard ? (
              /* カード登録済み */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'rgba(196,163,90,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                  }}>
                    📇
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>
                      カードID: {nfcCard.card_uid}
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      ステータス: 使用中 ✅
                      {nfcCard.linked_at && (
                        <span style={{ marginLeft: 12 }}>
                          登録日: {new Date(nfcCard.linked_at).toLocaleDateString('ja-JP')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={unlinkNfcCard}
                  disabled={nfcLoading}
                  style={{
                    fontSize: 13, fontWeight: 600,
                    color: '#EF4444', background: 'transparent',
                    border: '1px solid #FCA5A5', borderRadius: 8,
                    padding: '8px 16px', cursor: 'pointer',
                    opacity: nfcLoading ? 0.5 : 1,
                  }}
                >
                  {nfcLoading ? '処理中...' : '紐付けを解除する'}
                </button>
              </div>
            ) : (
              /* カード未登録 */
              <div>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                  カード裏面記載のRから始まるIDを入力してください
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={nfcInput}
                    onChange={(e) => { setNfcInput(e.target.value); setNfcError('') }}
                    placeholder="XXXX"
                    style={{
                      padding: '10px 14px', fontSize: 14, fontWeight: 600,
                      border: '1px solid #E5E7EB', borderRadius: 8,
                      width: 160, fontFamily: "'Inter', sans-serif",
                      letterSpacing: 1,
                    }}
                  />
                  <button
                    onClick={linkNfcCard}
                    disabled={nfcLoading || !nfcInput.trim()}
                    style={{
                      padding: '10px 20px', fontSize: 14, fontWeight: 700,
                      background: (!nfcLoading && nfcInput.trim()) ? '#1A1A2E' : '#ddd',
                      color: (!nfcLoading && nfcInput.trim()) ? '#C4A35A' : '#999',
                      border: 'none', borderRadius: 8,
                      cursor: (!nfcLoading && nfcInput.trim()) ? 'pointer' : 'default',
                    }}
                  >
                    {nfcLoading ? '処理中...' : '登録'}
                  </button>
                </div>
              </div>
            )}

            {/* エラー / 成功メッセージ */}
            {nfcError && (
              <p style={{ fontSize: 13, color: '#EF4444', marginTop: 12 }}>{nfcError}</p>
            )}
            {nfcSuccess && (
              <p style={{ fontSize: 13, color: '#059669', marginTop: 12 }}>{nfcSuccess}</p>
            )}
          </div>

          {/* カードモード切替（プロユーザーのみ表示） */}
          {isPro && proId && <CardModeSwitch professionalId={proId} initialCardMode={proCardMode} />}
        </div>
      )}

      {/* 団体タブ（メンバー用リソース閲覧） */}
      {tab === 'myorgs' && hasOrgMembership && (
        <div>
          {/* 複数団体の場合: セレクター */}
          {memberOrgs.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <select
                value={selectedMemberOrgId || ''}
                onChange={(e) => handleMemberOrgChange(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10,
                  border: '1px solid #E5E7EB', fontSize: 14, color: '#1A1A2E',
                  backgroundColor: '#fff', boxSizing: 'border-box' as const,
                }}
              >
                {memberOrgs.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 団体名（1団体のみの場合） */}
          {memberOrgs.length === 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
              padding: '14px 16px', background: '#fff', borderRadius: 12,
              border: '1px solid #E5E7EB',
            }}>
              {memberOrgs[0].logo_url ? (
                <img src={memberOrgs[0].logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
              ) : (
                <div style={{
                  width: 36, height: 36, borderRadius: 8, background: '#1A1A2E',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 16, fontWeight: 700,
                }}>
                  {memberOrgs[0].name.charAt(0)}
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>
                {memberOrgs[0].name}
              </div>
            </div>
          )}

          {/* 共有資料セクション */}
          <div style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 12 }}>
              共有資料
            </h3>
          </div>

          {memberResourcesLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div className="animate-spin" style={{
                width: 32, height: 32, border: '2px solid #C4A35A',
                borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto',
              }} />
              <p style={{ color: '#9CA3AF', marginTop: 12, fontSize: 13 }}>読み込み中...</p>
            </div>
          ) : memberResources.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ color: '#9CA3AF', fontSize: 14 }}>まだ共有資料はありません</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {getMemberResourceGroups().map(group => (
                <div key={group.key}>
                  {/* アコーディオンヘッダー */}
                  <button
                    onClick={() => setMemberAccordionOpen(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', background: '#F3F4F6', borderRadius: 10,
                      border: 'none', cursor: 'pointer', marginBottom: memberAccordionOpen[group.key] ? 8 : 0,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
                      <span style={{ color: '#6B7280', marginRight: 6 }}>{memberAccordionOpen[group.key] ? '▼' : '▶'}</span>
                      {group.badgeName}
                    </span>
                    <span style={{ fontSize: 13, color: '#9CA3AF' }}>({group.resources.length}件)</span>
                  </button>
                  {/* アコーディオンコンテンツ */}
                  {memberAccordionOpen[group.key] && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {group.resources.map((r: any) => (
                        <div key={r.id} style={{
                          background: '#fff', borderRadius: 14, padding: '18px 16px',
                          border: '1px solid #E5E7EB',
                        }}>
                          <h4 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', marginBottom: 4 }}>
                            {r.title}
                          </h4>
                          {r.description && (
                            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginBottom: 12 }}>
                              {r.description}
                            </p>
                          )}
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '8px 16px', borderRadius: 10,
                              background: '#C4A35A', color: '#fff',
                              fontSize: 13, fontWeight: 600, textDecoration: 'none',
                              transition: 'background 0.2s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#B3923F')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#C4A35A')}
                          >
                            資料を開く
                            <span aria-hidden="true">→</span>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* アカウント削除確認モーダル */}
      {showDeleteAccountModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-2 text-red-600">アカウントを削除しますか？</h3>
            <p className="text-sm text-gray-600 mb-4">この操作は取り消せません。以下のデータが全て削除されます：</p>
            <ul className="text-sm text-gray-600 space-y-1 mb-6">
              <li>・プルーフカードのデータ</li>
              <li>・投票履歴</li>
              <li>・アカウント情報</li>
            </ul>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteAccountModal(false)}
                className="px-4 py-2 text-sm border rounded"
              >
                キャンセル
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
              >
                {deletingAccount ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      <InstallPrompt />
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
