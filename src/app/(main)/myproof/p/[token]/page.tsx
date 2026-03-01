'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

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
}

export default function MyProofPublicPage() {
  const params = useParams()
  const token = params.token as string
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [card, setCard] = useState<MyProofCard | null>(null)
  const [owner, setOwner] = useState<Owner | null>(null)
  const [items, setItems] = useState<MyProofItem[]>([])

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
      } catch (e) {
        console.error('[myproof public] load error:', e)
        setNotFound(true)
      }
      setLoading(false)
    }
    load()
  }, [token])

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

  const proItems = items.filter(i => i.item_type === 'professional')
  const customItems = items.filter(i => i.item_type === 'custom')

  return (
    <div style={{ minHeight: '100vh', background: '#1A1A2E', fontFamily: "'Noto Sans JP', 'Inter', sans-serif" }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px' }}>

        {/* ヘッダー */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {/* オーナー写真 */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 12px',
            overflow: 'hidden', background: 'rgba(255,255,255,0.1)',
            border: '2px solid rgba(196,163,90,0.3)',
          }}>
            {owner?.photo_url ? (
              <img src={owner.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4A35A', fontSize: 28, fontWeight: 'bold' }}>
                {(owner?.name || 'U').charAt(0)}
              </div>
            )}
          </div>
          <div style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
            {owner?.name || 'ユーザー'}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#C4A35A', textTransform: 'uppercase' as const, marginBottom: 8 }}>
            MY PROOF
          </div>
          {card?.tagline && (
            <p style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 1.6 }}>{card.tagline}</p>
          )}
        </div>

        {/* おすすめのプロ */}
        {proItems.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#C4A35A', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' as const }}>
              RECOMMENDED PROS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {proItems.map(item => (
                <Link
                  key={item.id}
                  href={`/card/${item.professional_id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: 14,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(196,163,90,0.2)',
                    borderRadius: 12, textDecoration: 'none', transition: 'border-color 0.2s',
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', overflow: 'hidden',
                    background: 'rgba(255,255,255,0.1)', flexShrink: 0,
                  }}>
                    {item.pro_photo_url ? (
                      <img src={item.pro_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                        {(item.pro_name || '?').charAt(0)}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700 }}>{item.pro_name}</div>
                    <div style={{ color: '#C4A35A', fontSize: 11, fontWeight: 600, marginTop: 2 }}>{item.pro_title}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ color: '#C4A35A', fontSize: 18, fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>{item.pro_vote_count || 0}</div>
                    <div style={{ color: '#9CA3AF', fontSize: 9 }}>proofs</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* おすすめの人や物 */}
        {customItems.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#C4A35A', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' as const }}>
              RECOMMENDATIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {customItems.map(item => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: 14,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(196,163,90,0.2)',
                    borderRadius: 12,
                  }}
                >
                  {item.photo_url ? (
                    <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                      <img src={item.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ) : (
                    <div style={{
                      width: 44, height: 44, borderRadius: 8, background: 'rgba(196,163,90,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, flexShrink: 0,
                    }}>
                      ✦
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>{item.title}</div>
                    {item.description && (
                      <div style={{ color: '#9CA3AF', fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>{item.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div style={{ textAlign: 'center', padding: '32px 0 16px', borderTop: '1px solid rgba(196,163,90,0.15)' }}>
          <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
            あなたも「本気のおすすめ」を<br />証明しませんか？
          </p>
          <Link href="/sign-up" style={{
            display: 'inline-block', padding: '12px 32px',
            background: '#C4A35A', color: '#fff', borderRadius: 8,
            fontSize: 14, fontWeight: 600, textDecoration: 'none',
          }}>
            REALPROOFに登録する
          </Link>
        </div>

        {/* フッター */}
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', letterSpacing: 2 }}>REALPROOF</div>
          <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4 }}>強みが、あなたを定義する。</div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>realproof.jp</div>
        </div>

      </div>
    </div>
  )
}
