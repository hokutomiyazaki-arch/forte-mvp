'use client'

import { useEffect, useState } from 'react'

export default function BookmarksPage() {
  const [bookmarkedPros, setBookmarkedPros] = useState<any[]>([])
  const [bookmarkCount, setBookmarkCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBookmarks()
  }, [])

  async function loadBookmarks() {
    try {
      const res = await fetch('/api/bookmarks', { cache: 'no-store' })
      if (res.status === 401) {
        window.location.href = '/login?redirect=/bookmarks'
        return
      }
      if (!res.ok) {
        console.error('[bookmarks] API error:', res.status)
        return
      }
      const data = await res.json()
      setBookmarkedPros(data.bookmarks || [])
      setBookmarkCount((data.bookmarks || []).length)
    } catch (e) {
      console.error('[bookmarks] load error:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>
          ブックマーク
        </h1>
        {bookmarkCount > 0 && (
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            {bookmarkCount}件
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
          <div style={{ fontSize: 14 }}>読み込み中...</div>
        </div>
      ) : bookmarkedPros.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>♡</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#666', marginBottom: 8 }}>
            まだブックマークしたプロがいません
          </div>
          <div style={{ fontSize: 13, color: '#999', lineHeight: 1.8 }}>
            プロのページで「♡ 気になる」を押すと<br />
            ここに追加されます
          </div>
          <a href="/search" style={{
            display: 'inline-block',
            marginTop: 24,
            padding: '12px 32px',
            background: '#C4A35A',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
            borderRadius: 8,
          }}>
            プロを探す →
          </a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bookmarkedPros.map(bookmark => {
            const bPro = bookmark.professionals
            if (!bPro) return null
            return (
              <a
                key={bookmark.id}
                href={`/card/${bPro.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: 16,
                  background: '#fff',
                  border: '1px solid #E8E4DC',
                  borderRadius: 14,
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: '#F0EDE6', overflow: 'hidden', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {bPro.photo_url ? (
                    <img src={bPro.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 20, color: '#999' }}>
                      {bPro.name?.charAt(0) || '?'}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>
                    {bPro.name}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#C4A35A', marginTop: 2 }}>
                    {bPro.title}
                  </div>
                  {(bPro.prefecture || bPro.area_description) && (
                    <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                      {[bPro.prefecture, bPro.area_description].filter(Boolean).join('・')}
                    </div>
                  )}
                </div>
                <button
                  onClick={async (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    try {
                      const res = await fetch('/api/db', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'delete',
                          table: 'bookmarks',
                          query: { eq: { id: bookmark.id } }
                        })
                      })
                      const result = await res.json()
                      if (result.error) {
                        console.error('Bookmark delete error:', result.error)
                        return
                      }
                      setBookmarkedPros(prev => prev.filter(b => b.id !== bookmark.id))
                      setBookmarkCount(prev => prev - 1)
                    } catch (err) {
                      console.error('Bookmark remove error:', err)
                    }
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 18, color: '#C4A35A', padding: 8, flexShrink: 0,
                  }}
                  title="ブックマーク解除"
                >
                  ♥
                </button>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
