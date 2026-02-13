'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })

    if (error) {
      setError('エラーが発生しました。もう一度お試しください。')
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="text-5xl mb-6">✉️</div>
          <h1 className="text-2xl font-bold text-forte-dark mb-4">
            メールを送信しました
          </h1>
          <p className="text-gray-600 mb-2">
            <span className="font-medium">{email}</span> に
          </p>
          <p className="text-gray-600 mb-8">
            ログインリンクを送信しました。メールを確認してリンクをクリックしてください。
          </p>
          <button
            onClick={() => setSent(false)}
            className="text-forte-gold hover:underline"
          >
            別のメールアドレスで試す
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <Link href="/" className="block text-center mb-8">
          <h1 className="text-3xl font-bold tracking-wider text-forte-dark">FORTE</h1>
          <p className="text-forte-gold text-sm italic">本物が輝く社会へ。</p>
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-forte-dark mb-2 text-center">
            プロとしてログイン
          </h2>
          <p className="text-gray-500 text-sm text-center mb-6">
            メールアドレスにログインリンクをお送りします
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forte-gold focus:border-transparent text-lg"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-forte-dark text-white rounded-xl font-medium text-lg hover:bg-opacity-90 transition disabled:opacity-50"
            >
              {loading ? '送信中...' : 'ログインリンクを送信'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-400 mt-6">
          Founding Member — 全機能永久無料
        </p>
      </div>
    </main>
  )
}
