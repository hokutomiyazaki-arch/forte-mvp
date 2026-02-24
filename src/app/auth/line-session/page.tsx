'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LineSessionPage() {
  const [error, setError] = useState('')
  const [status, setStatus] = useState('LINE認証を完了しています...')

  useEffect(() => {
    async function createSession() {
      const params = new URLSearchParams(window.location.search)
      const email = params.get('email')
      const token = params.get('token')

      if (!email || !token) {
        setError('認証パラメータが不足しています')
        return
      }

      try {
        const supabase = createClient() as any
        setStatus('セッションを作成中...')

        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email,
          password: token,
        })

        if (signInError) {
          console.error('LINE session signIn error:', signInError)
          setError('セッションの作成に失敗しました。もう一度お試しください。')
          return
        }

        if (data?.session) {
          setStatus('ログイン成功！リダイレクト中...')
          // URLからトークンを消す（履歴に残さない）
          window.history.replaceState(null, '', '/auth/line-session')
          window.location.href = '/dashboard'
        } else {
          setError('セッションの取得に失敗しました')
        }
      } catch (err) {
        console.error('LINE session error:', err)
        setError('予期しないエラーが発生しました')
      }
    }

    createSession()
  }, [])

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
