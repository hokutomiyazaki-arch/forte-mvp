'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LineSessionPage() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('セッションを設定中...')
  const [error, setError] = useState('')

  useEffect(() => {
    const accessToken = searchParams.get('access_token')
    const refreshToken = searchParams.get('refresh_token')
    const redirect = searchParams.get('redirect') || '/dashboard'

    console.log('[line-session] access_token:', accessToken ? 'present' : 'missing', 'refresh_token:', refreshToken ? 'present' : 'missing', 'redirect:', redirect)

    if (!accessToken || !refreshToken) {
      setError('認証情報が見つかりません')
      setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)
      return
    }

    const setSession = async () => {
      try {
        const supabase = createClient()
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (sessionError) {
          console.error('[line-session] setSession error:', sessionError.message)
          setError('セッション設定に失敗しました')
          setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)
          return
        }

        console.log('[line-session] session set successfully, redirecting to:', redirect)
        setStatus('ログイン成功！リダイレクト中...')
        // URLからトークンを消す（履歴に残さない）
        window.history.replaceState(null, '', '/auth/line-session')
        window.location.href = redirect
      } catch (err) {
        console.error('[line-session] unexpected error:', err)
        setError('予期しないエラーが発生しました')
        setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)
      }
    }

    setSession()
  }, [searchParams])

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAF7] px-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-sm font-bold tracking-widest text-[#C4A35A] mb-8">REAL PROOF</p>
          <div className="text-4xl mb-4">!</div>
          <p className="text-red-500 text-sm mb-6">{error}</p>
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
