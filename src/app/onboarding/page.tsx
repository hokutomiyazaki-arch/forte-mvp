'use client'
import { useUser } from '@clerk/nextjs'
import { useState, useEffect } from 'react'

export default function OnboardingPage() {
  const { user, isLoaded } = useUser()
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  // 既にDB登録済みならリダイレクト
  useEffect(() => {
    if (!isLoaded) return
    if (!user) { window.location.href = '/sign-in'; return }

    fetch('/api/user/role')
      .then(res => res.json())
      .then(data => {
        if (data.role === 'professional') {
          window.location.href = '/dashboard'
        } else if (data.role === 'client') {
          window.location.href = '/mycard'
        } else {
          setChecking(false) // DBにレコードなし → 選択画面を表示
        }
      })
      .catch(() => setChecking(false))
  }, [isLoaded, user])

  const handleSelectRole = async (role: 'client' | 'professional') => {
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const data = await res.json()
      if (data.success) {
        window.location.href = role === 'professional' ? '/dashboard' : '/mycard'
      }
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  if (!isLoaded || checking) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100vh', background: '#FAFAF7',
      }}>
        <div className="animate-pulse" style={{ color: '#888' }}>読み込み中...</div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#FAFAF7',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '24px',
      fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
    }}>
      {/* ロゴ */}
      <div style={{
        fontSize: 14, fontWeight: 800, letterSpacing: 4,
        color: '#1A1A2E', marginBottom: 8,
      }}>
        REALPROOF
      </div>
      <div style={{
        fontSize: 12, color: '#C4A35A', letterSpacing: 2, marginBottom: 40,
      }}>
        強みが、あなたを定義する。
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#1A1A2E' }}>
        ようこそ！
      </h1>
      <p style={{ fontSize: 14, color: '#888', marginBottom: 32, textAlign: 'center' }}>
        あなたに合った使い方を選んでください
      </p>

      {/* 選択肢 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 400 }}>

        {/* プロとして始める */}
        <button
          onClick={() => handleSelectRole('professional')}
          disabled={loading}
          style={{
            background: '#1A1A2E', color: '#fff', border: 'none',
            borderRadius: 12, padding: '20px 24px', cursor: 'pointer',
            textAlign: 'left', opacity: loading ? 0.6 : 1,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            プロとして始める
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
            トレーナー・治療家・インストラクター等<br/>
            クライアントからの「強み」を集めて可視化します
          </div>
        </button>

        {/* 一般として始める */}
        <button
          onClick={() => handleSelectRole('client')}
          disabled={loading}
          style={{
            background: '#fff', color: '#1A1A2E',
            border: '1.5px solid #ddd', borderRadius: 12,
            padding: '20px 24px', cursor: 'pointer',
            textAlign: 'left', opacity: loading ? 0.6 : 1,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            一般として始める
          </div>
          <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
            プロに投票する・マイプルーフでおすすめを共有する
          </div>
        </button>
      </div>

      {loading && (
        <div style={{ marginTop: 16, fontSize: 13, color: '#C4A35A' }}>
          登録中...
        </div>
      )}
    </div>
  )
}
