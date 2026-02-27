'use client'
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import { getSessionSafe, signOutAndClear } from '@/lib/auth-helper'

interface AuthContextType {
  user: any | null
  session: any | null
  isPro: boolean
  isClient: boolean
  isLoaded: boolean
  signOut: (redirectTo?: string) => Promise<void>
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isPro: false,
  isClient: false,
  isLoaded: false,
  signOut: async () => {},
  refreshAuth: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [session, setSession] = useState<any>(null)
  const [isPro, setIsPro] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  const checkAuth = useCallback(async () => {
    const supabase = createClient() as any

    try {
      // getSessionSafe で統一（localStorage → backup → getSession の順で試行）
      // sb-keysチェックのearly returnは削除: Supabase JSがrefresh失敗でsb-*を消す場合があり、
      // backupキーからの復元を阻害していた
      const { session: sess, user: sessionUser, source } = await getSessionSafe()

      if (!sessionUser) {
        setUser(null)
        setSession(null)
        setIsPro(false)
        setIsClient(false)
        setIsLoaded(true)
        return
      }

      setUser(sessionUser)
      setSession(sess)

      // Note: setSession() は使わない。内部でrefresh tokenの検証を実行し、
      // LINE認証のサーバー作成トークンが "Invalid Refresh Token" で失敗→sb-*キー削除を引き起こす。
      // Supabase client は persistSession: true でlocalStorageを自動読み取りするので不要。

      // プロ/クライアント判定（2クエリを1回だけ実行）
      try {
        const [{ data: proData }, { data: clientData }] = await Promise.all([
          supabase.from('professionals').select('id').eq('user_id', sessionUser.id).maybeSingle(),
          supabase.from('clients').select('id').eq('user_id', sessionUser.id).maybeSingle(),
        ])
        setIsPro(!!proData)
        setIsClient(!!clientData)
      } catch (_) {
        // DB問い合わせ失敗時はプロ判定せず
        setIsPro(false)
        setIsClient(true)
      }
    } catch (_) {
      setUser(null)
      setSession(null)
      setIsPro(false)
      setIsClient(false)
    }

    setIsLoaded(true)
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const handleSignOut = useCallback(async (redirectTo?: string) => {
    await signOutAndClear(redirectTo || '/')
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isPro,
      isClient,
      isLoaded,
      signOut: handleSignOut,
      refreshAuth: checkAuth,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
