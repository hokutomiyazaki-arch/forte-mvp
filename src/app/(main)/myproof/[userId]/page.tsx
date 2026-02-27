'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface MyProofItem {
  id: string
  type: 'pro' | 'thing'
  target_pro_id: string | null
  title: string
  comment: string | null
  photo_url: string | null
  display_order: number
  pro_name?: string
  pro_photo_url?: string
}

function ProofCard({ item }: { item: MyProofItem }) {
  const photoSrc = item.type === 'pro'
    ? (item.pro_photo_url || '/default-avatar.png')
    : (item.photo_url || '/default-avatar.png')

  return (
    <div style={{
      background: '#fff', borderRadius: 12,
      border: '1px solid #E8E4DC',
      overflow: 'hidden',
    }}>
      <div style={{ width: '100%', aspectRatio: '1', overflow: 'hidden' }}>
        <img src={photoSrc} alt={item.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#2D2D2D' }}>
          {item.title}
        </div>
        {item.comment && (
          <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 4 }}>
            {item.comment}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MyProofPage() {
  const params = useParams()
  const userId = params.userId as string
  const supabase = createClient()
  const { user: authUser } = useAuth()

  const [userName, setUserName] = useState('')
  const [userPhoto, setUserPhoto] = useState('')
  const [myProofs, setMyProofs] = useState<MyProofItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const isOwner = authUser?.id === userId

  useEffect(() => {
    if (!userId) return
    loadData()
  }, [userId])

  async function loadData() {
    setLoading(true)

    let name = ''
    let photo = ''

    const { data: proData } = await (supabase as any)
      .from('professionals')
      .select('display_name, photo_url')
      .eq('user_id', userId)
      .maybeSingle()

    if (proData) {
      name = proData.display_name || ''
      photo = proData.photo_url || ''
    }

    if (!name) {
      const { data: clientData } = await (supabase as any)
        .from('clients')
        .select('nickname')
        .eq('user_id', userId)
        .maybeSingle()

      if (clientData) {
        name = clientData.nickname || ''
      }
    }

    if (!name) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setUserName(name)
    setUserPhoto(photo)

    const { data: proofs } = await (supabase as any)
      .from('my_proofs')
      .select('*')
      .eq('user_id', userId)
      .order('display_order', { ascending: true })

    if (proofs && proofs.length > 0) {
      const proTypeItems = proofs.filter((p: any) => p.type === 'pro' && p.target_pro_id)
      if (proTypeItems.length > 0) {
        const proIds = proTypeItems.map((p: any) => p.target_pro_id)
        const { data: prosData } = await (supabase as any)
          .from('professionals')
          .select('id, display_name, photo_url')
          .in('id', proIds)

        const proMap = new Map((prosData || []).map((p: any) => [p.id, p]))

        const enriched = proofs.map((p: any) => {
          if (p.type === 'pro' && p.target_pro_id && proMap.has(p.target_pro_id)) {
            const pro = proMap.get(p.target_pro_id) as any
            return { ...p, pro_name: pro?.display_name, pro_photo_url: pro?.photo_url }
          }
          return p
        })
        setMyProofs(enriched)
      } else {
        setMyProofs(proofs)
      }
    } else {
      setMyProofs([])
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888' }}>読み込み中...</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888' }}>ユーザーが見つかりません</p>
      </div>
    )
  }

  return (
    <div style={{ background: '#FAF8F4', minHeight: '80vh', padding: '32px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* ヘッダー */}
        <div style={{ textAlign: 'center' as const, marginBottom: 32 }}>
          {userPhoto ? (
            <img src={userPhoto} alt={userName}
              style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 12px', display: 'block' }} />
          ) : (
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: '#E8E4DC', margin: '0 auto 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32, color: '#999',
            }}>
              {userName.charAt(0)}
            </div>
          )}
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>
            {userName}
          </h1>
          <p style={{ fontSize: 14, color: '#888' }}>
            {userName}さんのREALPROOF
          </p>
        </div>

        {/* プルーフ一覧 */}
        {myProofs.length > 0 ? (
          <>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E', marginBottom: 16 }}>
              私がプルーフするもの
            </h2>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
              marginBottom: 32,
            }}>
              {myProofs.map(item => (
                <ProofCard key={item.id} item={item} />
              ))}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center' as const, padding: '40px 0', color: '#999' }}>
            <p style={{ fontSize: 14 }}>まだプルーフが登録されていません</p>
          </div>
        )}

        {/* 編集ボタン（自分のページのみ） */}
        {isOwner && (
          <div style={{ textAlign: 'center' as const, marginTop: 16 }}>
            <a href="/myproof/edit" style={{
              display: 'inline-block',
              padding: '12px 32px', fontSize: 14, fontWeight: 700,
              background: '#1A1A2E', color: '#C4A35A',
              borderRadius: 8, textDecoration: 'none',
            }}>
              編集する
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
