'use client'
import { useUser } from '@clerk/nextjs'
import { useState, useEffect } from 'react'

export default function OnboardingPage() {
  const { user, isLoaded } = useUser()
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [selectedRole, setSelectedRole] = useState<'client' | 'professional' | null>(null)

  // 姓名入力
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [storeName, setStoreName] = useState('')
  const [lineNotice, setLineNotice] = useState(false)
  const [formError, setFormError] = useState('')

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

  // ロール選択後に Clerk ユーザー情報から姓名をプリフィル
  useEffect(() => {
    if (!selectedRole || !user) return

    // LINE OAuth判定: externalAccountsにlineが含まれるか
    const isLine = user.externalAccounts?.some(
      (acc: any) => acc.provider === 'line' || acc.provider === 'oauth_line'
    )

    if (isLine) {
      // LINE: 表示名をlastNameに仮入力
      const lineDisplayName = user.firstName || user.username || ''
      if (lineDisplayName) {
        setLastName(lineDisplayName)
        setLineNotice(true)
      }
    } else if (user.lastName && user.firstName) {
      // Google/Email: Clerkの姓名をそのまま使用
      setLastName(user.lastName)
      setFirstName(user.firstName)
    } else if (user.firstName) {
      // firstNameのみ
      setLastName(user.firstName)
    } else if (user.username) {
      setLastName(user.username)
    }
  }, [selectedRole, user])

  const handleSubmit = async () => {
    setFormError('')

    if (!lastName.trim() || !firstName.trim()) {
      setFormError('姓と名を入力してください')
      return
    }
    if (lastName.trim().length > 20) {
      setFormError('姓は20文字以内で入力してください')
      return
    }
    if (firstName.trim().length > 20) {
      setFormError('名は20文字以内で入力してください')
      return
    }
    if (storeName.trim().length > 50) {
      setFormError('店舗名は50文字以内で入力してください')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: selectedRole,
          last_name: lastName.trim(),
          first_name: firstName.trim(),
          store_name: selectedRole === 'professional' ? storeName.trim() : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || '登録に失敗しました')
        setLoading(false)
        return
      }
      if (data.success) {
        window.location.href = selectedRole === 'professional' ? '/dashboard' : '/mycard'
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

      {!selectedRole ? (
        <>
          {/* ステップ1: ロール選択 */}
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#1A1A2E' }}>
            ようこそ！
          </h1>
          <p style={{ fontSize: 14, color: '#888', marginBottom: 32, textAlign: 'center' }}>
            あなたに合った使い方を選んでください
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 400 }}>
            <button
              onClick={() => setSelectedRole('professional')}
              style={{
                background: '#1A1A2E', color: '#fff', border: 'none',
                borderRadius: 12, padding: '20px 24px', cursor: 'pointer',
                textAlign: 'left',
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

            <button
              onClick={() => setSelectedRole('client')}
              style={{
                background: '#fff', color: '#1A1A2E',
                border: '1.5px solid #ddd', borderRadius: 12,
                padding: '20px 24px', cursor: 'pointer',
                textAlign: 'left',
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
        </>
      ) : (
        <>
          {/* ステップ2: 姓名入力 */}
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#1A1A2E' }}>
            お名前を入力
          </h1>
          <p style={{ fontSize: 14, color: '#888', marginBottom: 24, textAlign: 'center' }}>
            {selectedRole === 'professional' ? 'プロフィールに表示されます' : 'マイカードに表示されます'}
          </p>

          <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 姓名入力 */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', display: 'block', marginBottom: 4 }}>
                  姓 *
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  maxLength={20}
                  placeholder="山田"
                  style={{
                    width: '100%', padding: '12px 14px', border: '1.5px solid #ddd',
                    borderRadius: 10, fontSize: 16, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', display: 'block', marginBottom: 4 }}>
                  名 *
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  maxLength={20}
                  placeholder="太郎"
                  style={{
                    width: '100%', padding: '12px 14px', border: '1.5px solid #ddd',
                    borderRadius: 10, fontSize: 16, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* LINE注意メッセージ */}
            {lineNotice && (
              <p style={{ fontSize: 12, color: '#C4A35A', margin: 0, lineHeight: 1.5 }}>
                LINEの表示名から自動入力しました。正しい姓名に修正してください。
              </p>
            )}

            {/* 店舗名（プロのみ） */}
            {selectedRole === 'professional' && (
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', display: 'block', marginBottom: 4 }}>
                  店舗名・所属（任意）
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  maxLength={50}
                  placeholder="〇〇整体院 / フリーランス"
                  style={{
                    width: '100%', padding: '12px 14px', border: '1.5px solid #ddd',
                    borderRadius: 10, fontSize: 16, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: 11, color: '#AAA', marginTop: 4 }}>
                  50文字以内。プロフィールに表示されます
                </p>
              </div>
            )}

            {formError && (
              <p style={{ fontSize: 13, color: '#e74c3c', margin: 0 }}>{formError}</p>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                onClick={() => {
                  setSelectedRole(null)
                  setLastName('')
                  setFirstName('')
                  setStoreName('')
                  setLineNotice(false)
                  setFormError('')
                }}
                disabled={loading}
                style={{
                  flex: 1, padding: '14px', border: '1.5px solid #ddd',
                  borderRadius: 10, background: '#fff', color: '#888',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                戻る
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  flex: 2, padding: '14px', border: 'none',
                  borderRadius: 10, background: '#1A1A2E', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? '登録中...' : '始める'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
