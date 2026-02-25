import { createClient } from './supabase'

/**
 * 全ストレージからSupabase関連データを完全クリアする。
 * signOut前でも後でも呼べる安全な関数。
 */
export function clearAllAuthStorage() {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (
        key.startsWith('sb-') ||
        key.startsWith('supabase') ||
        key.includes('auth-token') ||
        key.includes('session')
      )) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch (e) {
    console.warn('[auth-helper] localStorage clear failed:', e)
  }
  try {
    sessionStorage.clear()
  } catch (e) {
    console.warn('[auth-helper] sessionStorage clear failed:', e)
  }
}

/**
 * 完全なログアウト処理。
 * 1. Supabase signOut
 * 2. localStorage/sessionStorage から全Supabase関連データ削除
 * 3. キャッシュ無効化付きリダイレクト
 */
export async function signOutAndClear(redirectTo: string = '/') {
  try {
    const supabase = createClient()
    await supabase.auth.signOut()
  } catch (e) {
    console.warn('[auth-helper] signOut failed:', e)
  }
  clearAllAuthStorage()
  window.location.href = redirectTo + (redirectTo.includes('?') ? '&' : '?') + 't=' + Date.now()
}

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
