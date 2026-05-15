'use client'

import { useState } from 'react'
import { SignedIn, useClerk } from '@clerk/nextjs'

export default function AccountPage() {
  const { signOut } = useClerk()
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        cache: 'no-store',
      })
      const data = await res.json()
      if (data.success) {
        await signOut()
        window.location.href = '/'
      } else {
        alert('アカウント削除に失敗しました。')
        setDeleting(false)
      }
    } catch (err) {
      console.error('[account] delete error:', err)
      alert('アカウント削除に失敗しました。')
      setDeleting(false)
    }
  }

  return (
    <SignedIn>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px 80px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A2E', margin: '0 0 32px 0' }}>
          アカウント
        </h1>

        <div style={{
          marginTop: 24,
          padding: 24,
          background: '#FFFFFF',
          border: '1px solid #FFDBDB',
          borderRadius: 12,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#C72A2A', margin: '0 0 16px 0' }}>
            アカウントを削除する
          </h2>
          <p style={{ fontSize: 14, color: '#444', lineHeight: 1.8, margin: '0 0 12px 0' }}>
            アカウントを削除すると、以下のデータがすべて削除されます:
          </p>
          <ul style={{ fontSize: 13, color: '#666', lineHeight: 1.8, paddingLeft: 24, margin: '0 0 16px 0' }}>
            <li>プロフィール情報</li>
            <li>ブックマーク</li>
            <li>(プロの方)強み・リワード・NFCカード紐付け情報</li>
            <li>(団体所属の方)所属情報</li>
          </ul>
          <p style={{ fontSize: 13, color: '#C72A2A', fontWeight: 600, margin: '0 0 20px 0' }}>
            この操作は取り消せません。
          </p>
          <button
            onClick={() => setShowConfirm(true)}
            style={{
              padding: '10px 20px',
              background: '#FFFFFF',
              border: '1px solid #C72A2A',
              color: '#C72A2A',
              fontWeight: 600,
              fontSize: 14,
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            アカウントを削除する
          </button>
        </div>

        {showConfirm && (
          <div
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 20,
            }}
            onClick={() => !deleting && setShowConfirm(false)}
          >
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 14,
                padding: 28,
                maxWidth: 420,
                width: '100%',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1A1A2E', margin: '0 0 12px 0' }}>
                本当にアカウントを削除しますか?
              </h3>
              <p style={{ fontSize: 14, color: '#666', lineHeight: 1.7, margin: '0 0 24px 0' }}>
                この操作は取り消せません。すべてのデータが完全に削除されます。
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={deleting}
                  style={{
                    padding: '10px 20px',
                    background: '#F5F5F5',
                    border: 'none',
                    color: '#444',
                    fontWeight: 600,
                    fontSize: 14,
                    borderRadius: 8,
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.5 : 1,
                  }}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    padding: '10px 20px',
                    background: '#C72A2A',
                    border: 'none',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    fontSize: 14,
                    borderRadius: 8,
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? '削除中...' : '削除する'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SignedIn>
  )
}
