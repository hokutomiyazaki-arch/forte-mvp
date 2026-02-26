'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LineSessionPage() {
  const [status, setStatus] = useState('ログイン中...')
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    async function createSession() {
      const params = new URLSearchParams(window.location.search)
      const credentialsParam = params.get('credentials')
      const next = params.get('next') || '/dashboard'

      if (!credentialsParam) {
        console.error('[line-session] No credentials param')
        setStatus('認証情報が見つかりません')
        setHasError(true)
        setTimeout(() => { window.location.href = '/login' }, 2000)
        return
      }

      try {
        // 1. 認証情報をデコード
        const decoded = atob(credentialsParam.replace(/-/g, '+').replace(/_/g, '/'))
        const { email, password } = JSON.parse(decoded)

        console.log('[line-session] Starting session creation for:', email)
        const supabase = createClient() as any

        // 2. まず既存セッションを完全にサインアウト
        console.log('[line-session] Step 1: Sign out existing session')
        await supabase.auth.signOut()

        // 3. localStorage から Supabase 関連を全削除
        console.log('[line-session] Step 2: Clear all auth storage')
        Object.keys(localStorage).forEach((key: string) => {
          if (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth-token')) {
            localStorage.removeItem(key)
          }
        })
        try { sessionStorage.clear() } catch (_) { /* ignore */ }

        // 4. 少し待つ（signOut の完了を確実にする）
        await new Promise(r => setTimeout(r, 300))

        // 5. signInWithPassword
        console.log('[line-session] Step 3: signInWithPassword')
        setStatus('セッションを作成中...')

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          console.error('[line-session] signInWithPassword error:', error.message)
          setStatus('ログインに失敗しました。もう一度お試しください。')
          setHasError(true)
          setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)
          return
        }

        if (data?.session) {
          console.log('[line-session] Session created successfully!')
          setStatus('ログイン成功！リダイレクト中...')

          // URLからクレデンシャルを消す（履歴に残さない）
          window.history.replaceState(null, '', '/auth/line-session')

          // 少し待ってからリダイレクト（セッションの保存を確実にする）
          await new Promise(r => setTimeout(r, 500))
          window.location.href = next
        } else {
          console.error('[line-session] No session returned')
          setStatus('セッション作成に失敗しました')
          setHasError(true)
          setTimeout(() => { window.location.href = '/login?error=line_no_session' }, 2000)
        }
      } catch (err) {
        console.error('[line-session] Error:', err)
        setStatus('エラーが発生しました')
        setHasError(true)
        setTimeout(() => { window.location.href = '/login?error=line_session_error' }, 2000)
      }
    }

    createSession()
  }, [])

  if (hasError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAF7] px-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-sm font-bold tracking-widest text-[#C4A35A] mb-8">REAL PROOF</p>
          <div className="text-4xl mb-4">!</div>
          <p className="text-red-500 text-sm mb-6">{status}</p>
          <button
            onClick={() => { window.location.href = '/login' }}
            className="px-8 py-3 bg-[#1A1A2E] text-white text-sm font-medium rounded-xl hover:bg-[#2a2a4e] transition"
          >
            ログインページに戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAF7] px-6">
      <div className="max-w-sm w-full text-center">
        <p className="text-sm font-bold tracking-widest text-[#C4A35A] mb-8">REAL PROOF</p>
        <div className="animate-spin w-8 h-8 border-4 border-[#C4A35A] border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-500 text-sm">{status}</p>
      </div>
    </div>
  )
}
