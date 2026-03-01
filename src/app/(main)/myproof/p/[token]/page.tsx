'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import html2canvas from 'html2canvas'
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
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/myproof/public/${token}`)
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

  async function generateAndShare(format: 'stories' | 'feed') {
    const el = document.getElementById('myproof-card-for-export')
    if (!el) return

    setSharing(true)
    try {
      const targetWidth = 1080
      const targetHeight = format === 'stories' ? 1920 : 1350

      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
        width: el.offsetWidth,
        height: el.offsetHeight,
      })

      const finalCanvas = document.createElement('canvas')
      finalCanvas.width = targetWidth
      finalCanvas.height = targetHeight
      const ctx = finalCanvas.getContext('2d')
      if (!ctx) return

      ctx.fillStyle = t.bg
      ctx.fillRect(0, 0, targetWidth, targetHeight)

      const scale = Math.min(
        (targetWidth * 0.9) / canvas.width,
        (targetHeight * 0.85) / canvas.height
      )
      const scaledWidth = canvas.width * scale
      const scaledHeight = canvas.height * scale
      const x = (targetWidth - scaledWidth) / 2
      const y = (targetHeight - scaledHeight) / 2
      ctx.drawImage(canvas, x, y, scaledWidth, scaledHeight)

      const blob = await new Promise<Blob>((resolve) => {
        finalCanvas.toBlob((b) => resolve(b!), 'image/png')
      })

      const fileName = format === 'stories'
        ? 'realproof-myproof-stories.png'
        : 'realproof-myproof-feed.png'
      const file = new File([blob], fileName, { type: 'image/png' })

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'REALPROOF - My Proof',
            text: '強みが、あなたを定義する。',
          })
          setSharing(false)
          return
        } catch (e) {
          if ((e as Error).name === 'AbortError') {
            setSharing(false)
            return
          }
        }
      }

      // フォールバック: ダウンロード
      const link = document.createElement('a')
      link.download = fileName
      link.href = finalCanvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      console.error('[myproof share] error:', e)
    }
    setSharing(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#1A1A2E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: "'Noto Sans JP', 'Inter', sans-serif" }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px' }}>

        {/* キャプチャ対象エリア */}
        <div id="myproof-card-for-export" style={{ background: t.bg, padding: '0 0 16px' }}>
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

                      {/* おすすめ理由（引用符付き） */}
                      {item.description && (
                        <div style={{
                          fontSize: 13, color: t.subtext, marginTop: 10,
                          lineHeight: 1.6, paddingLeft: 60,
                        }}>
                          &quot;{item.description}&quot;
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
          /* 自分のカード → シェアボタン表示 */
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: t.subtext, marginBottom: 16 }}>
              マイプルーフをシェアする
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => generateAndShare('stories')}
                disabled={sharing}
                style={{
                  flex: '1 1 0', maxWidth: 160, borderRadius: 8, padding: '12px 0',
                  fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: t.accent,
                  color: t.isLight ? '#fff' : t.bg,
                  opacity: sharing ? 0.5 : 1,
                }}
              >
                ストーリーズ用
              </button>
              <button
                onClick={() => generateAndShare('feed')}
                disabled={sharing}
                style={{
                  flex: '1 1 0', maxWidth: 160, borderRadius: 8, padding: '12px 0',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  background: 'transparent',
                  border: `2px solid ${t.accent}`,
                  color: t.accent,
                  opacity: sharing ? 0.5 : 1,
                }}
              >
                フィード用
              </button>
            </div>
            {sharing && (
              <p style={{ fontSize: 12, color: t.subtext, marginTop: 8 }}>画像を生成中...</p>
            )}
          </div>
        ) : (
          /* 他人のカード → CTA表示（従来通り） */
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: t.subtext, marginBottom: 16, lineHeight: 1.6 }}>
              あなたも「本気のおすすめ」を<br />証明しませんか？
            </p>
            <Link href="/sign-up" style={{
              display: 'inline-block',
              background: t.isLight
                ? `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)`
                : `linear-gradient(135deg, ${t.accent}, ${t.accent}dd)`,
              color: t.isLight ? '#fff' : t.bg,
              border: 'none', borderRadius: 8, padding: '14px 40px',
              fontSize: 15, fontWeight: 700, letterSpacing: 1, textDecoration: 'none',
            }}>
              REALPROOFに登録する
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}
