'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LineSessionPage() {
  const [error, setError] = useState('')
  const [status, setStatus] = useState('LINE認証を完了しています...')

  useEffect(() => {
    async function createSession() {
      const params = new URLSearchParams(window.location.search)
      const tokenHash = params.get('token_hash')
      const next = params.get('next') || '/dashboard'

      console.log('[line-session] token_hash:', tokenHash ? 'present' : 'missing', 'next:', next)

      if (!tokenHash) {
        setError('認証パラメータが不足しています')
        return
      }

      try {
        const supabase = createClient() as any
        setStatus('セッションを作成中...')

        // verifyOtp で hashed_token を検証してセッションを作成
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'magiclink',
        })

        console.log('[line-session] verifyOtp result:', data?.session ? 'SESSION OK' : 'NO SESSION', 'error:', verifyError?.message || 'none')

        if (verifyError) {
          console.error('[line-session] verifyOtp error:', verifyError)
          setError('セッションの作成に失敗しました。もう一度LINEログインをお試しください。')
          return
        }

        if (data?.session) {
          setStatus('ログイン成功！リダイレクト中...')
          // URLからトークンを消す（履歴に残さない）
          window.history.replaceState(null, '', '/auth/line-session')
          window.location.href = next
        } else {
          setError('セッションの取得に失敗しました')
        }
      } catch (err) {
        console.error('[line-session] unexpected error:', err)
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
