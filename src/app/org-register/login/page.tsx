'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function OrgLoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      const redirect = searchParams.get('redirect') || '/org-register'
      window.location.href = redirect
    } else {
      setError('パスワードが正しくありません')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0A',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#1A1A2E',
        borderRadius: 12,
        padding: 40,
        width: 360,
      }}>
        <div style={{
          color: '#C9A84C',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.1em',
          marginBottom: 8,
        }}>
          REALPROOF
        </div>
        <h1 style={{
          color: '#FAFAF7',
          fontSize: 22,
          fontWeight: 700,
          margin: '0 0 24px',
        }}>
          団体登録
        </h1>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="招待パスワード"
          autoFocus
          style={{
            width: '100%',
            padding: '12px 16px',
            background: '#0A0A0A',
            border: '1px solid #374151',
            borderRadius: 8,
            color: '#FAFAF7',
            fontSize: 16,
            outline: 'none',
            marginBottom: 16,
            boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{
            color: '#EF4444',
            fontSize: 14,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: '#C9A84C',
            color: '#0A0A0A',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '...' : 'ログイン'}
        </button>
      </form>
    </div>
  )
}

export default function OrgRegisterLoginPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: '#0A0A0A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FAFAF7',
      }}>
        読み込み中...
      </div>
    }>
      <OrgLoginForm />
    </Suspense>
  )
}
