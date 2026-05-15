'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useUser } from '@clerk/nextjs'

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
    ? (item.pro_photo_url || '')
    : (item.photo_url || '')

  return (
    <div style={{
      background: '#fff', borderRadius: 12,
      border: '1px solid #E8E4DC',
      padding: '16px 12px',
      textAlign: 'center' as const,
    }}>
      <div style={{
        width: 100, height: 100,
        borderRadius: '50%',
        overflow: 'hidden',
        margin: '0 auto 8px',
        background: '#F0EDE6',
      }}>
        {photoSrc
          ? <img src={photoSrc} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#AAA', fontSize: 24 }}>
              {item.type === 'pro' ? '👤' : '📷'}
            </div>
        }
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#2D2D2D' }}>
        {item.title}
      </div>
      {item.comment && (
        <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 4 }}>
          {item.comment}
        </div>
      )}
    </div>
  )
}

export default function MyProofPage() {
  const params = useParams()
  const userId = params.userId as string
  const supabase = createClient()
  const { user: clerkUser } = useUser()
  const authUser = clerkUser ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress || '' } : null
  const isPro = false // determined by checking role

  const [userName, setUserName] = useState('')
  const [userPhoto, setUserPhoto] = useState('')
  const [myProofs, setMyProofs] = useState<MyProofItem[]>([])
  const [votedPros, setVotedPros] = useState<{ id: string; name: string; photo_url: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

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
      .select('name, photo_url')
      .eq('user_id', userId)
      .maybeSingle()

    if (proData) {
      name = proData.name || ''
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
          .select('id, name, photo_url')
          .in('id', proIds)

        const proMap = new Map((prosData || []).map((p: any) => [p.id, p]))

        const enriched = proofs.map((p: any) => {
          if (p.type === 'pro' && p.target_pro_id && proMap.has(p.target_pro_id)) {
            const pro = proMap.get(p.target_pro_id) as any
            return { ...p, pro_name: pro?.name, pro_photo_url: pro?.photo_url }
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

    // オーナーの場合: 投票済みプロを取得
    if (authUser?.id === userId) {
      const email = authUser.email || ''
      const lineUserId = '' // LINE auth removed with Clerk migration
      let votePros: any[] = []

      const { data: voteByEmail } = await (supabase as any)
        .from('votes')
        .select('professional_id')
        .eq('voter_email', email)
      if (voteByEmail) votePros = [...votePros, ...voteByEmail]

      if (lineUserId) {
        const { data: voteByLine } = await (supabase as any)
          .from('votes')
          .select('professional_id')
          .eq('auth_provider_id', lineUserId)
        if (voteByLine) votePros = [...votePros, ...voteByLine]
      }

      const uniqueProIds = Array.from(new Set(votePros.map((v: any) => v.professional_id)))
      // my_proofsに既に追加済みのプロを除外
      const existingProIds = new Set((proofs || []).filter((p: any) => p.type === 'pro').map((p: any) => p.target_pro_id))
      const newProIds = uniqueProIds.filter(id => !existingProIds.has(id))

      if (newProIds.length > 0) {
        const { data: prosData } = await (supabase as any)
          .from('professionals')
          .select('id, name, photo_url')
          .in('id', newProIds)
        setVotedPros(prosData || [])
      }
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
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ color: '#888' }}>ユーザーが見つかりません</p>
        <a href="/" style={{ fontSize: 14, color: '#C4A35A', textDecoration: 'none' }}>
          ← マイページに戻る
        </a>
      </div>
    )
  }

  return (
    <div style={{ background: '#FAF8F4', minHeight: '80vh', padding: '32px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* マイページに戻るボタン */}
        <div style={{ marginBottom: 16 }}>
          <a href={isOwner ? (isPro ? '/dashboard' : '/') : '/'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 14, color: '#666', textDecoration: 'none',
            }}>
            ← マイページに戻る
          </a>
        </div>
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

        {/* 投票したプロ（オーナーのみ表示） */}
        {isOwner && votedPros.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E', marginBottom: 8 }}>
              投票したプロ
            </h2>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
              マイプルーフに追加できます
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {votedPros.map(pro => (
                <div key={pro.id} style={{
                  background: '#fff', borderRadius: 12, border: '1px dashed #C4A35A',
                  padding: '16px 12px', textAlign: 'center' as const,
                }}>
                  <div style={{
                    width: 60, height: 60, borderRadius: '50%', overflow: 'hidden',
                    margin: '0 auto 8px', background: '#F0EDE6',
                  }}>
                    {pro.photo_url
                      ? <img src={pro.photo_url} alt={pro.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#AAA', fontSize: 20 }}>👤</div>
                    }
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#2D2D2D', marginBottom: 8 }}>
                    {pro.name}
                  </div>
                  <a href="/myproof/edit" style={{
                    display: 'inline-block', fontSize: 11, fontWeight: 600,
                    padding: '4px 12px', borderRadius: 16,
                    background: '#C4A35A', color: '#fff', textDecoration: 'none',
                  }}>
                    追加する
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* シェアボタン */}
        <div style={{
          background: '#fff', borderRadius: 12, border: '1px solid #E8E4DC',
          padding: 20, marginTop: 24, textAlign: 'center' as const,
        }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 14 }}>
            シェアする
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* LINE */}
            <button
              onClick={() => {
                const baseUrl = `${window.location.origin}/myproof/${userId}`
                const shareUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(baseUrl + '?utm_source=line&utm_medium=share&utm_campaign=myproof')}`
                window.open(shareUrl, '_blank')
              }}
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: '#06C755', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 16, fontWeight: 700,
              }}
              title="LINEでシェア"
            >
              L
            </button>

            {/* X (Twitter) */}
            <button
              onClick={() => {
                const baseUrl = `${window.location.origin}/myproof/${userId}`
                const text = encodeURIComponent('私がプルーフするもの #REALPROOF')
                const url = encodeURIComponent(baseUrl + '?utm_source=twitter&utm_medium=share&utm_campaign=myproof')
                window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank')
              }}
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: '#000', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 16, fontWeight: 700,
              }}
              title="Xでシェア"
            >
              𝕏
            </button>

            {/* Instagram */}
            <button
              onClick={async () => {
                const baseUrl = `${window.location.origin}/myproof/${userId}`
                const url = baseUrl + '?utm_source=instagram&utm_medium=share&utm_campaign=myproof'
                await navigator.clipboard.writeText(url)
                alert('URLをコピーしました。Instagramのストーリーズやプロフィールに貼り付けてください。')
              }}
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 16, fontWeight: 700,
              }}
              title="Instagramでシェア"
            >
              IG
            </button>

            {/* Facebook */}
            <button
              onClick={() => {
                const baseUrl = `${window.location.origin}/myproof/${userId}`
                const url = encodeURIComponent(baseUrl + '?utm_source=facebook&utm_medium=share&utm_campaign=myproof')
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank')
              }}
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: '#1877F2', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 16, fontWeight: 700,
              }}
              title="Facebookでシェア"
            >
              f
            </button>

            {/* URLコピー */}
            <button
              onClick={async () => {
                const baseUrl = `${window.location.origin}/myproof/${userId}`
                await navigator.clipboard.writeText(baseUrl + '?utm_source=clipboard&utm_medium=share&utm_campaign=myproof')
                setShareCopied(true)
                setTimeout(() => setShareCopied(false), 2000)
              }}
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: '#C4A35A', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 14, fontWeight: 700,
              }}
              title="URLをコピー"
            >
              {shareCopied ? '✓' : '🔗'}
            </button>
          </div>
          {shareCopied && (
            <p style={{ fontSize: 12, color: '#C4A35A', marginTop: 8 }}>
              URLをコピーしました
            </p>
          )}
        </div>

        {/* 編集ボタン + シェアカード作成（自分のページのみ） */}
        {isOwner && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
            <a href="/myproof/edit" style={{
              display: 'inline-block',
              padding: '12px 32px', fontSize: 14, fontWeight: 700,
              background: '#1A1A2E', color: '#C4A35A',
              borderRadius: 8, textDecoration: 'none',
            }}>
              編集する
            </a>
            <a href={`/myproof/${userId}/share`} style={{
              display: 'inline-block',
              padding: '12px 32px', fontSize: 14, fontWeight: 700,
              background: '#C4A35A', color: '#fff',
              borderRadius: 8, textDecoration: 'none',
            }}>
              カードを作成
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
