'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'

import { getTheme, CATEGORIES } from '@/lib/myproof-themes'

interface Owner {
  name: string
  photo_url: string | null
}

interface MyProofItem {
  id: string
  item_type: 'professional' | 'custom'
  professional_id: string | null
  title: string | null
  description: string | null
  photo_url: string | null
  sort_order: number
  category?: string
  pro_name?: string
  pro_title?: string
  pro_photo_url?: string | null
  pro_vote_count?: number
}

interface MyProofCard {
  id: string
  qr_token: string
  tagline: string | null
  is_public: boolean
  theme?: string
}

export default function MyProofPublicPage() {
  const params = useParams()
  const token = params.token as string
  const { user } = useUser()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [card, setCard] = useState<MyProofCard | null>(null)
  const [owner, setOwner] = useState<Owner | null>(null)
  const [items, setItems] = useState<MyProofItem[]>([])
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/myproof/public/${token}?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) {
          setNotFound(true)
          setLoading(false)
          return
        }
        const data = await res.json()
        setCard(data.card)
        setOwner(data.owner)
        setItems(data.items || [])
        setOwnerUserId(data.owner_user_id || null)
      } catch (e) {
        console.error('[myproof public] load error:', e)
        setNotFound(true)
      }
      setLoading(false)
    }
    load()
  }, [token])

  const t = getTheme(card?.theme)
  const isOwner = !!(user?.id && ownerUserId && user.id === ownerUserId)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#FAFAF7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#9CA3AF', fontSize: 14 }}>読み込み中...</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: '#1A1A2E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#9CA3AF', fontSize: 14 }}>このマイプルーフは見つかりません</p>
          <Link href="/" style={{ color: '#C4A35A', fontSize: 13, marginTop: 12, display: 'inline-block' }}>
            トップページへ
          </Link>
        </div>
      </div>
    )
  }

  // カテゴリでグループ化
  const grouped: Record<string, MyProofItem[]> = {}
  for (const item of items) {
    const cat = item.category || (item.item_type === 'professional' ? 'professional' : 'other')
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(item)
  }

  // URL自動ボタン変換ヘルパー
  function renderDescription(text: string, theme: typeof t) {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = text.split(urlRegex)
    const urls = text.match(urlRegex) || []
    const textParts = parts.filter(part => !urlRegex.test(part)).join('').trim()

    return (
      <>
        {textParts && (
          <div style={{ fontSize: 13, color: theme.subtext, lineHeight: 1.6 }}>
            &quot;{textParts}&quot;
          </div>
        )}
        {urls.map((url, i) => {
          let label = '詳しく見る'
          try {
            const hostname = new URL(url).hostname.replace('www.', '')
            if (hostname.includes('instagram')) label = 'Instagramを見る'
            else if (hostname.includes('youtube')) label = 'YouTubeを見る'
            else if (hostname.includes('twitter') || hostname.includes('x.com')) label = 'Xを見る'
            else if (hostname.includes('amazon')) label = 'Amazonで見る'
            else if (hostname.includes('tabelog')) label = '食べログで見る'
            else if (hostname.includes('hotpepper')) label = 'ホットペッパーで見る'
            else if (hostname.includes('google.com/maps')) label = 'Google Mapで見る'
            else label = hostname + ' を見る'
          } catch {}

          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 600,
                color: theme.accent,
                border: `1.5px solid ${theme.accent}`,
                borderRadius: 8,
                textDecoration: 'none',
                transition: 'background 0.2s',
              }}
            >
              {label} →
            </a>
          )
        })}
      </>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: "'Noto Sans JP', 'Inter', sans-serif" }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px' }}>

        {/* キャプチャ対象エリア */}
        <div style={{ background: t.bg, padding: '0 0 16px' }}>
          {/* ヘッダー */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            {/* オーナー写真（丸） */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: t.isLight ? `${t.accent}15` : 'rgba(255,255,255,0.08)',
              border: `2px solid ${t.accent}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px', overflow: 'hidden',
            }}>
              {owner?.photo_url ? (
                <img src={owner.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 28, color: t.accent, fontWeight: 'bold' }}>
                  {(owner?.name || 'U').charAt(0)}
                </span>
              )}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>
              {owner?.name || 'ユーザー'}
            </div>
            <div style={{ fontSize: 12, color: t.accent, letterSpacing: 2, marginTop: 4 }}>
              MY PROOF
            </div>
            {card?.tagline && (
              <div style={{ fontSize: 14, color: t.subtext, marginTop: 8, fontStyle: 'italic' }}>
                &quot;{card.tagline}&quot;
              </div>
            )}
          </div>

          {/* カテゴリ別グループ表示 */}
          {CATEGORIES.map(cat => {
            const catItems = grouped[cat.key]
            if (!catItems || catItems.length === 0) return null

            return (
              <div key={cat.key} style={{ marginBottom: 28 }}>
                {/* カテゴリヘッダー */}
                <div style={{
                  fontSize: 11, color: t.isLight ? cat.color : t.accent,
                  letterSpacing: 2, marginBottom: 12, fontWeight: 600,
                }}>
                  {cat.icon} {cat.label}
                </div>

                {/* アイテムカード */}
                {catItems.map(item => {
                  const photoUrl = item.item_type === 'professional' ? item.pro_photo_url : item.photo_url
                  const isPro = item.item_type === 'professional'

                  return (
                    <div key={item.id} style={{
                      background: t.cardBg, border: `1px solid ${t.cardBorder}`,
                      borderRadius: 12, padding: 16, marginBottom: 10,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* 丸写真 */}
                        <div style={{
                          width: 48, height: 48, borderRadius: '50%',
                          background: isPro
                            ? (t.isLight ? `${t.accent}15` : 'rgba(255,255,255,0.08)')
                            : (t.isLight ? '#f5f5f5' : 'rgba(255,255,255,0.04)'),
                          border: isPro
                            ? `1.5px solid ${t.accent}`
                            : `1.5px solid ${t.cardBorder}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, overflow: 'hidden',
                        }}>
                          {photoUrl ? (
                            <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: 20 }}>
                              {isPro ? '👤' : cat.icon}
                            </span>
                          )}
                        </div>

                        {/* テキスト部分 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>
                            {isPro ? item.pro_name : item.title}
                          </div>
                          {isPro && item.pro_title && (
                            <div style={{ fontSize: 12, color: t.subtext, marginTop: 2 }}>
                              {item.pro_title}
                            </div>
                          )}
                          {isPro && (
                            <div style={{ fontSize: 11, color: t.accent, marginTop: 4 }}>
                              プルーフ {item.pro_vote_count || 0}票
                            </div>
                          )}
                        </div>

                        {/* プロの場合は → リンク */}
                        {isPro && item.professional_id && (
                          <Link
                            href={`/card/${item.professional_id}`}
                            style={{ color: t.accent, fontSize: 18, textDecoration: 'none', flexShrink: 0 }}
                          >
                            →
                          </Link>
                        )}
                      </div>

                      {/* おすすめ理由（URL自動ボタン対応） */}
                      {item.description && (
                        <div style={{ marginTop: 10, paddingLeft: 60 }}>
                          {renderDescription(item.description, t)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* フッターロゴ（キャプチャに含める） */}
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3, color: t.subtextMuted }}>REALPROOF</div>
            <div style={{ fontSize: 11, color: t.subtextMuted, marginTop: 4 }}>強みが、あなたを定義する。</div>
          </div>
        </div>
        {/* キャプチャ対象ここまで */}

        {/* 区切り線 */}
        <div style={{ height: 1, background: t.divider, margin: '32px 0' }} />

        {isOwner ? (
          /* ========================================
             自分のカード → シェアボタン（Web Share API）
             ======================================== */
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: t.subtext, marginBottom: 16 }}>
              マイプルーフをシェアする
            </p>

            <button
              onClick={async () => {
                const url = window.location.href
                const shareData = {
                  title: 'REALPROOF - マイプルーフ',
                  text: '私の「本気のおすすめ」を見てみて！',
                  url: url,
                }

                // Web Share API対応 → ネイティブ共有メニュー
                if (navigator.share) {
                  try {
                    await navigator.share(shareData)
                  } catch (e) {
                    // ユーザーがキャンセルした場合は何もしない
                    if ((e as Error).name !== 'AbortError') {
                      console.error('Share failed:', e)
                    }
                  }
                } else {
                  // PC等で Web Share API 非対応 → クリップボードにコピー
                  try {
                    await navigator.clipboard.writeText(url)
                    alert('URLをコピーしました！')
                  } catch {
                    // clipboard APIも非対応の場合
                    prompt('以下のURLをコピーしてください:', url)
                  }
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                maxWidth: 280,
                borderRadius: 12,
                padding: '14px 24px',
                fontSize: 15,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: t.accent,
                color: t.isLight ? '#fff' : t.bg,
                letterSpacing: 0.5,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              シェアする
            </button>
          </div>
        ) : (
          /* ========================================
             他人のカード → REALPROOF 登録促進バナー
             ======================================== */
          <div style={{
            background: 'linear-gradient(135deg, #1A1A2E 0%, #2a2a4e 100%)',
            borderRadius: 16,
            padding: '28px 24px',
            textAlign: 'center',
          }}>
            {/* REALPROOF ロゴ */}
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: '#C4A35A', fontFamily: 'Inter, sans-serif' }}>
                REAL
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: '#FFFFFF', fontFamily: 'Inter, sans-serif' }}>
                PROOF
              </span>
            </div>

            {/* メインコピー */}
            <p style={{
              fontSize: 17,
              fontWeight: 700,
              color: '#FFFFFF',
              lineHeight: 1.6,
              marginBottom: 8,
            }}>
              あなたの「本気のおすすめ」を<br />
              シェアしよう。
            </p>

            {/* サブコピー */}
            <p style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.6,
              marginBottom: 20,
            }}>
              行きつけのお店、推しの一冊、秘密のスポット——<br />
              あなたの「本物」を、カードにして届けよう。
            </p>

            {/* CTA */}
            <Link href="/sign-up" style={{
              display: 'inline-block',
              background: '#C4A35A',
              color: '#1A1A2E',
              border: 'none',
              borderRadius: 10,
              padding: '13px 36px',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              textDecoration: 'none',
            }}>
              無料ではじめる →
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}
