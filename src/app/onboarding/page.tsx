'use client'
import { useUser } from '@clerk/nextjs'
import { useState, useEffect } from 'react'

export default function OnboardingPage() {
  const { user, isLoaded } = useUser()
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [formError, setFormError] = useState('')
  // 退会済みプロ: 復活は任意のため「クライアントとして続ける」出口を表示する
  const [isDeactivatedPro, setIsDeactivatedPro] = useState(false)

  // 既にDB登録済みならリダイレクト
  useEffect(() => {
    if (!isLoaded) return
    if (!user) { window.location.href = '/sign-in'; return }

    fetch('/api/user/role', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.role === 'professional') {
          window.location.href = '/dashboard'
        } else if (data.role === 'client' && !data.proDeactivated) {
          // safety net: 既存client(52名)の /onboarding 直アクセス時の事故防止
          // STOP 4 では削除せず保持。clients テーブル廃止STOPで同時削除予定
          // ※退会済みプロ(proDeactivated)は例外: 選択画面を出して「プロとして始める」
          //   → /api/onboarding の再アクティベートに到達させる（復活導線の応急処置A）
          window.location.href = '/'
        } else if (data.role === 'client' && data.proDeactivated) {
          setIsDeactivatedPro(true)
          setChecking(false) // 退会済みプロ → 復活用に選択画面を表示
        } else {
          setChecking(false) // DBにレコードなし → 選択画面を表示
        }
      })
      .catch(() => setChecking(false))
  }, [isLoaded, user])

  const handleSubmit = async () => {
    setFormError('')
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'professional' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || '登録に失敗しました')
        setLoading(false)
        return
      }
      if (data.success) {
        window.location.href = '/setup'
      }
    } catch (err) {
      console.error(err)
      setFormError('登録に失敗しました。もう一度お試しください。')
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

      {/* ロール選択 */}
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#1A1A2E' }}>
        ようこそ！
      </h1>
      <p style={{ fontSize: 14, color: '#888', marginBottom: 32, textAlign: 'center' }}>
        プロフェッショナルアカウントを作成します
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 400 }}>
        <button
          onClick={handleSubmit}
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
      </div>

      {/* 退会済みプロの出口: auth-redirect がこのページへ誘導するため、
          復活しない選択肢（クライアントとして続ける）を必ず残す（閉じ込め防止） */}
      {isDeactivatedPro && (
        <button
          onClick={() => { window.location.href = '/' }}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#888', fontSize: 13, marginTop: 20, textDecoration: 'underline',
          }}
        >
          プロ登録は再開せず、クライアントとして続ける
        </button>
      )}

      {formError && (
        <p style={{ fontSize: 13, color: '#e74c3c', marginTop: 16 }}>{formError}</p>
      )}

      {loading && (
        <p style={{ fontSize: 14, color: '#888', marginTop: 16 }}>登録中...</p>
      )}
    </div>
  )
}
