'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function LineSessionContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('ログイン中...')
  const [error, setError] = useState('')

  useEffect(() => {
    const encoded = searchParams.get('d')

    if (!encoded) {
      setError('認証情報が見つかりません')
      setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)
      return
    }

    const doSignIn = async () => {
      try {
        // base64url デコード
        const jsonStr = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
        const { email, password, redirect } = JSON.parse(jsonStr)

        if (!email || !password) {
          setError('認証情報が不正です')
          setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)
          return
        }

        console.log('[line-session] starting client-side signInWithPassword for:', email)

        // クライアント側で signInWithPassword を実行
        // これにより Supabase JS が自分で管理できるセッションが作成される
        // サーバー側で作ったセッションと違い、refresh tokenが正常に動作する
        const supabase = createClient()
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError || !data?.session) {
          console.error('[line-session] signInWithPassword failed:', signInError?.message)
          setError('ログインに失敗しました')
          setTimeout(() => { window.location.href = '/login?error=line_signin_failed' }, 2000)
          return
        }

        console.log('[line-session] signInWithPassword success, redirecting to:', redirect || '/dashboard')
        setStatus('ログイン成功！リダイレクト中...')

        window.location.href = redirect || '/dashboard'
      } catch (err) {
        console.error('[line-session] unexpected error:', err)
        setError('予期しないエラーが発生しました')
        setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)
      }
    }

    doSignIn()
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

export default function LineSessionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAF7] px-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-sm font-bold tracking-widest text-[#C4A35A] mb-8">REAL PROOF</p>
          <div className="animate-spin w-8 h-8 border-4 border-[#C4A35A] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500 text-sm">ログイン中...</p>
        </div>
      </div>
    }>
      <LineSessionContent />
    </Suspense>
  )
}
