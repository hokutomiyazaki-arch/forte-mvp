'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function LineSessionContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('ログイン中...')
  const [error, setError] = useState('')

  useEffect(() => {
    const mode = searchParams.get('mode')
    const redirect = searchParams.get('redirect')
    const encoded = searchParams.get('d') // 旧方式（vote-callback用）

    const doSignIn = async () => {
      try {
        const supabase = createClient()

        // === Fix 8.1 PKCE mode ===
        if (mode === 'pkce') {
          const code = searchParams.get('code')
          if (!code) {
            setError('認証コードが見つかりません')
            setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)
            return
          }

          console.log('[line-session] Fix 8.1: exchangeCodeForSession (PKCE mode)')
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

          if (exchangeError || !data?.session) {
            console.error('[line-session] exchangeCodeForSession failed:', exchangeError?.message)
            setError('ログインに失敗しました')
            setTimeout(() => { window.location.href = '/login?error=line_signin_failed' }, 2000)
            return
          }

          console.log('[line-session] PKCE session created, redirecting to:', redirect || '/dashboard')
          setStatus('ログイン成功！リダイレクト中...')
          window.location.href = redirect || '/dashboard'
          return
        }

        // === Fix 8.1 Implicit mode (hash fragment) ===
        if (mode === 'implicit') {
          const hash = window.location.hash.substring(1)
          const hashParams = new URLSearchParams(hash)
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')

          if (!accessToken || !refreshToken) {
            console.error('[line-session] implicit mode but no tokens in hash')
            setError('認証情報が見つかりません')
            setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)
            return
          }

          console.log('[line-session] Fix 8.1: setSession (implicit mode)')
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (sessionError) {
            console.error('[line-session] setSession failed:', sessionError.message)
            setError('ログインに失敗しました')
            setTimeout(() => { window.location.href = '/login?error=line_signin_failed' }, 2000)
            return
          }

          console.log('[line-session] implicit session set, redirecting to:', redirect || '/dashboard')
          setStatus('ログイン成功！リダイレクト中...')
          window.location.href = redirect || '/dashboard'
          return
        }

        // === Fix 8.1 Direct mode (tokens in query params) ===
        if (mode === 'direct') {
          const accessToken = searchParams.get('access_token')
          const refreshToken = searchParams.get('refresh_token')

          if (!accessToken || !refreshToken) {
            setError('認証情報が見つかりません')
            setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)
            return
          }

          console.log('[line-session] Fix 8.1: setSession (direct mode)')
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (sessionError) {
            console.error('[line-session] setSession failed:', sessionError.message)
            setError('ログインに失敗しました')
            setTimeout(() => { window.location.href = '/login?error=line_signin_failed' }, 2000)
            return
          }

          console.log('[line-session] direct session set, redirecting to:', redirect || '/dashboard')
          setStatus('ログイン成功！リダイレクト中...')
          window.location.href = redirect || '/dashboard'
          return
        }

        // === 旧方式: signInWithPassword（vote-callback互換）===
        if (encoded) {
          console.log('[line-session] starting signInWithPassword (legacy mode)')

          const decoded = JSON.parse(
            typeof Buffer !== 'undefined'
              ? Buffer.from(encoded, 'base64url').toString('utf-8')
              : atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
          )
          const { email, password, redirect: legacyRedirect } = decoded

          if (!email || !password) {
            setError('認証情報が不正です')
            setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)
            return
          }

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

          console.log('[line-session] signInWithPassword success, redirecting to:', legacyRedirect || '/dashboard')
          setStatus('ログイン成功！リダイレクト中...')
          window.location.href = legacyRedirect || '/dashboard'
          return
        }

        // === どのモードにも該当しない ===
        console.error('[line-session] no valid auth mode detected. mode:', mode, 'encoded:', !!encoded)
        setError('認証情報が見つかりません')
        setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)

      } catch (err) {
        console.error('[line-session] unexpected error:', err)
        setError('予期しないエラーが発生しました')
        setTimeout(() => { window.location.href = '/login?error=line_session_failed' }, 2000)
      }
    }

    doSignIn()
  }, []) // 依存配列を空に（searchParamsの変更で再発火しない）

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
