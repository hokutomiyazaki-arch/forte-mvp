'use client'

import { useEffect, useState } from 'react'
import { useProStatus } from '@/lib/useProStatus'
import BookmarkedProsSection from '@/components/referral/BookmarkedProsSection'

export default function BookmarksPage() {
  // CEO追加指示(2026-08-04・タスク1): プロの「気になるプロ」(非公開referral_list、
  // /api/referral/lists由来)をダッシュボードの紹介するタブから撤去し、ここ(ホームの
  // ブックマーク)に統合した(§16次回対応の実施)。
  // レビュー指摘(軽微4): このページ下部の「以前のブックマーク」(旧bookmarksテーブル由来、
  // /api/bookmarks経由)は完全に別のデータソース・別のテーブルのため、上の「気になるプロ」
  // と項目が重複することは無い(同じプロが両方に載ることはあっても、それは正常=同一データの
  // 二重表示ではない)。見出しを分けて両方残す。
  const { isPro } = useProStatus()
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
      {/* レビュー指摘(重大2): 見出し「気になるプロ」はBookmarkedProsSection内へ移した。
          ページ側はisProゲートのみ(403・401・ロード中はコンポーネントがreturn nullするため、
          allowlist外プロには従来と完全に同一の画面になる)。 */}
      {isPro && <BookmarkedProsSection />}
      <div style={{ marginBottom: 20 }}>
        {/* レビュー指摘(軽微4): 「気になるプロ」と同じ「ブックマーク」見出しが並ぶと紛らわしい
            ため、isPro時はこちらを「以前のブックマーク」に変える(h1の重複も解消・h2に統一)。 */}
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>
          {isPro ? '以前のブックマーク' : 'ブックマーク'}
        </h2>
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
            {isPro ? '以前のブックマークはありません' : 'まだブックマークしたプロがいません'}
          </div>
          {/* レビュー指摘(軽微4): プロは今後♡を押しても「気になるプロ」(referral_list)に
              積まれる(旧bookmarksテーブルには増えない)ため、この案内はプロには出さない。 */}
          {!isPro && (
            <div style={{ fontSize: 13, color: '#999', lineHeight: 1.8 }}>
              プロのページで「♡ 気になる」を押すと<br />
              ここに追加されます
            </div>
          )}
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
