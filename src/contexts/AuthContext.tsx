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

    // sb-keysがなければセッション確認不要 → 即「未ログイン」
    const sbKeys = Object.keys(localStorage).filter((k: string) => k.startsWith('sb-'))
    if (sbKeys.length === 0) {
      setUser(null)
      setSession(null)
      setIsPro(false)
      setIsClient(false)
      setIsLoaded(true)
      return
    }

    try {
      // getSessionSafe で統一（モバイルでのハング防止）
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

      // モバイル対策: localStorageから読んだセッションをSupabaseクライアントにセット
      // これを一元化することで、各ページでのコピペを排除
      if (source === 'localStorage' && sess?.access_token && sess?.refresh_token) {
        try {
          await supabase.auth.setSession({
            access_token: sess.access_token,
            refresh_token: sess.refresh_token,
          })
        } catch (_) {}
      }

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
