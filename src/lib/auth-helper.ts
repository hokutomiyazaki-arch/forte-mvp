import { createClient } from './supabase'

/**
 * モバイルで getSession() がハングする問題の回避策。
 * localStorageから直接セッションを読み、getSession()はフォールバック。
 */
export async function getSessionSafe() {
  // まずlocalStorageから直接読む（ネットワーク不要）
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
    if (keys.length > 0) {
      const raw = localStorage.getItem(keys[0])
      if (raw) {
        const parsed = JSON.parse(raw)
        // access_token が存在すればセッションとして扱う
        if (parsed?.access_token && parsed?.user) {
          return {
            session: {
              access_token: parsed.access_token,
              refresh_token: parsed.refresh_token,
              user: parsed.user,
            },
            user: parsed.user,
            source: 'localStorage' as const,
          }
        }
      }
    }
  } catch (e) {
    console.warn('[auth-helper] localStorage read failed:', e)
  }

  // localStorageになければ getSession() を2秒タイムアウトで試行
  try {
    const supabase = createClient()
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getSession timeout')), 2000)
      )
    ]) as any

    if (result?.data?.session) {
      return {
        session: result.data.session,
        user: result.data.session.user,
        source: 'getSession' as const,
      }
    }
  } catch (e) {
    console.warn('[auth-helper] getSession failed:', e)
  }

  return { session: null, user: null, source: 'none' as const }
}

/**
 * getSessionSafe() でユーザーIDを取得
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { user } = await getSessionSafe()
  return user?.id || null
}

/**
 * getSessionSafe() でアクセストークンを取得（Supabase RLSクエリ用）
 */
export async function getAccessToken(): Promise<string | null> {
  const { session } = await getSessionSafe()
  return session?.access_token || null
}
