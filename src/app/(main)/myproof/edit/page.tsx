'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import ImageCropper from '@/components/ImageCropper'

interface VotedPro {
  id: string
  display_name: string
  photo_url: string | null
  specialty: string | null
  selected: boolean
}

interface ThingItem {
  id?: string
  category: string
  title: string
  comment: string
  photo_url: string
  uploading: boolean
}

const PROOF_THING_CATEGORIES = [
  { value: 'book', label: '信頼する本' },
  { value: 'restaurant', label: '信頼するレストラン' },
  { value: 'cafe', label: '信頼するカフェ' },
  { value: 'product', label: '信頼するプロダクト' },
  { value: 'place', label: '信頼する場所' },
  { value: 'movie', label: '信頼する映画・作品' },
  { value: 'music', label: '信頼する音楽' },
  { value: 'podcast', label: '信頼するPodcast' },
  { value: 'other', label: '自由記述' },
]

export default function MyProofEditPage() {
  const supabase = createClient()
  const { user: authUser, session, isLoaded } = useAuth()

  const [votedPros, setVotedPros] = useState<VotedPro[]>([])
  const [things, setThings] = useState<ThingItem[]>([])
  const [existingThingIds, setExistingThingIds] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [cropTargetIndex, setCropTargetIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!isLoaded || !authUser) return
    loadData()
  }, [isLoaded, authUser])

  async function loadData() {
    if (!authUser?.id) return
    setLoading(true)

    const email = authUser.email || ''
    const lineUserId = authUser.user_metadata?.line_user_id || ''

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

    const { data: existingProofs } = await (supabase as any)
      .from('my_proofs')
      .select('*')
      .eq('user_id', authUser.id)

    const selectedProIds = new Set(
      (existingProofs || []).filter((p: any) => p.type === 'pro').map((p: any) => p.target_pro_id)
    )

    if (uniqueProIds.length > 0) {
      const { data: prosData } = await (supabase as any)
        .from('professionals')
        .select('id, display_name, name, title, photo_url, specialty')
        .in('id', uniqueProIds)

      setVotedPros((prosData || []).map((p: any) => ({
        ...p,
        display_name: p.display_name || p.name || 'プロ',
        specialty: p.title || p.specialty || '',
        selected: selectedProIds.has(p.id),
      })))
    }

    const existingThings = (existingProofs || []).filter((p: any) => p.type === 'thing')
    const idMap = new Map<string, string>()
    const thingItems: ThingItem[] = existingThings.map((t: any) => {
      idMap.set(t.title + t.photo_url, t.id)
      const matchedCat = PROOF_THING_CATEGORIES.find(c => t.title?.startsWith(c.label))
      return {
        id: t.id,
        category: matchedCat?.value || 'other',
        title: t.title || '',
        comment: t.comment || '',
        photo_url: t.photo_url || '',
        uploading: false,
      }
    })
    setExistingThingIds(idMap)
    setThings(thingItems)

    setLoading(false)
  }

  function togglePro(proId: string) {
    setVotedPros(prev => prev.map(p =>
      p.id === proId ? { ...p, selected: !p.selected } : p
    ))
  }

  function addThing() {
    if (things.length >= 3) return
    setThings(prev => [...prev, { category: '', title: '', comment: '', photo_url: '', uploading: false }])
  }

  function updateThing(index: number, field: keyof ThingItem, value: string) {
    setThings(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t))
  }

  function handleCategoryChange(index: number, value: string) {
    const cat = PROOF_THING_CATEGORIES.find(c => c.value === value)
    setThings(prev => prev.map((t, i) => {
      if (i !== index) return t
      return {
        ...t,
        category: value,
        title: value === 'other' ? '' : (cat?.label || ''),
      }
    }))
  }

  function removeThing(index: number) {
    setThings(prev => prev.filter((_, i) => i !== index))
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, index: number) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setMessage('エラー: 5MB以下の画像を選択してください'); return }
    setCropTargetIndex(index)
    const reader = new FileReader()
    reader.onload = () => setCropImageSrc(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleCropComplete(croppedBlob: Blob) {
    setCropImageSrc(null)
    if (cropTargetIndex === null) return
    const file = new File([croppedBlob], `cropped-${Date.now()}.jpg`, { type: 'image/jpeg' })
    await uploadPhoto(file, cropTargetIndex)
    setCropTargetIndex(null)
  }

  async function uploadPhoto(file: File, index: number) {
    if (!authUser?.id) return
    if (file.size > 2 * 1024 * 1024) {
      setMessage('エラー: 画像は2MB以下にしてください')
      return
    }
    setThings(prev => prev.map((t, i) => i === index ? { ...t, uploading: true } : t))

    const fileExt = file.name.split('.').pop()
    const fileName = `${authUser.id}/${Date.now()}.${fileExt}`
    const { error } = await (supabase.storage.from('my-proof-images') as any).upload(fileName, file, { cacheControl: '3600', upsert: false })

    if (error) {
      setMessage('エラー: 画像のアップロードに失敗しました')
      setThings(prev => prev.map((t, i) => i === index ? { ...t, uploading: false } : t))
      return
    }

    const { data } = supabase.storage.from('my-proof-images').getPublicUrl(fileName)
    setThings(prev => prev.map((t, i) => i === index ? { ...t, photo_url: data.publicUrl, uploading: false } : t))
  }

  async function handleSave() {
    if (!authUser?.id) return
    setSaving(true)
    setMessage('')

    for (const t of things) {
      if (!t.title.trim()) {
        setMessage('エラー: タイトルは必須です')
        setSaving(false)
        return
      }
      if (!t.photo_url) {
        setMessage('エラー: 写真は必須です')
        setSaving(false)
        return
      }
    }

    await (supabase as any).from('my_proofs').delete().eq('user_id', authUser.id)

    let order = 0
    const inserts: any[] = []

    for (const pro of votedPros) {
      if (pro.selected) {
        inserts.push({
          user_id: authUser.id,
          type: 'pro',
          target_pro_id: pro.id,
          title: pro.display_name,
          comment: null,
          photo_url: pro.photo_url,
          display_order: order++,
        })
      }
    }

    for (const t of things) {
      inserts.push({
        user_id: authUser.id,
        type: 'thing',
        target_pro_id: null,
        title: t.title.trim(),
        comment: t.comment.trim() || null,
        photo_url: t.photo_url,
        display_order: order++,
      })
    }

    if (inserts.length > 0) {
      const { error } = await (supabase as any).from('my_proofs').insert(inserts)
      if (error) {
        setMessage('エラー: 保存に失敗しました')
        setSaving(false)
        return
      }
    }

    setMessage('保存しました')
    setSaving(false)
  }

  if (!isLoaded || loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888' }}>読み込み中...</p>
      </div>
    )
  }

  if (!authUser) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888' }}>ログインが必要です</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', marginBottom: 24 }}>
        マイプルーフ編集
      </h1>

      {/* A. プルーフしたプロ */}
      {votedPros.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E', marginBottom: 12 }}>
            私がプルーフするプロ
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {votedPros.map(pro => (
              <label key={pro.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', background: '#fff', borderRadius: 8,
                border: pro.selected ? '2px solid #C4A35A' : '1px solid #E8E4DC',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={pro.selected}
                  onChange={() => togglePro(pro.id)}
                  style={{ accentColor: '#C4A35A', width: 18, height: 18 }}
                />
                <img
                  src={pro.photo_url || '/default-avatar.png'}
                  alt={pro.display_name}
                  style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
                    {pro.display_name}
                  </div>
                  {pro.specialty && (
                    <div style={{ fontSize: 12, color: '#888' }}>{pro.specialty}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* B. プルーフするもの */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>
            プルーフするもの（最大3つ）
          </h2>
          <button
            onClick={addThing}
            disabled={things.length >= 3}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 600,
              background: things.length >= 3 ? '#ddd' : '#C4A35A',
              color: things.length >= 3 ? '#999' : '#fff',
              border: 'none', borderRadius: 6, cursor: things.length >= 3 ? 'default' : 'pointer',
            }}
          >
            + 追加
          </button>
        </div>

        {things.map((thing, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: 12, padding: 16,
            border: '1px solid #E8E4DC', marginBottom: 12,
          }}>
            {/* 写真 */}
            <div style={{ marginBottom: 12 }}>
              {thing.photo_url ? (
                <div style={{ position: 'relative' as const, display: 'flex', justifyContent: 'center' }}>
                  <div style={{
                    width: 120, height: 120, borderRadius: '50%', overflow: 'hidden',
                    background: '#F0EDE6',
                  }}>
                    <img src={thing.photo_url} alt="" style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                    }} />
                  </div>
                  <button
                    onClick={() => updateThing(i, 'photo_url', '')}
                    style={{
                      position: 'absolute' as const, top: 0, right: 'calc(50% - 72px)',
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.5)', color: '#fff',
                      border: 'none', cursor: 'pointer', fontSize: 14,
                    }}
                  >✕</button>
                </div>
              ) : (
                <label style={{
                  display: 'flex', flexDirection: 'column' as const,
                  alignItems: 'center', justifyContent: 'center',
                  width: 120, height: 120, borderRadius: '50%',
                  border: '2px dashed #ccc', cursor: 'pointer',
                  color: '#888', fontSize: 13, margin: '0 auto',
                  background: '#F9F8F5',
                }}>
                  {thing.uploading ? '...' : '📷'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => handleFileSelect(e, i)}
                  />
                </label>
              )}
            </div>

            {/* カテゴリ選択 */}
            <select
              value={thing.category}
              onChange={e => handleCategoryChange(i, e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14,
                border: '1px solid #ddd', borderRadius: 6, marginBottom: 8,
                boxSizing: 'border-box' as const, background: '#fff',
                color: thing.category ? '#1A1A2E' : '#999',
              }}
            >
              <option value="" disabled>カテゴリを選択</option>
              {PROOF_THING_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            {/* タイトル */}
            <input
              type="text"
              value={thing.title}
              onChange={e => updateThing(i, 'title', e.target.value)}
              placeholder={thing.category === 'other' ? 'タイトル（自由記述・必須）' : 'タイトル（編集可・必須）'}
              maxLength={100}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14,
                border: '1px solid #ddd', borderRadius: 6, marginBottom: 8,
                boxSizing: 'border-box' as const,
              }}
            />

            {/* コメント */}
            <textarea
              value={thing.comment}
              onChange={e => updateThing(i, 'comment', e.target.value)}
              placeholder="コメント（任意）"
              rows={2}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                border: '1px solid #ddd', borderRadius: 6, marginBottom: 8,
                resize: 'vertical' as const, boxSizing: 'border-box' as const,
              }}
            />

            {/* 削除 */}
            <button
              onClick={() => removeThing(i)}
              style={{
                fontSize: 13, color: '#e74c3c', background: 'none',
                border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              削除する
            </button>
          </div>
        ))}
      </div>

      {/* メッセージ */}
      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: message.startsWith('エラー') ? '#FEE2E2' : '#D1FAE5',
          color: message.startsWith('エラー') ? '#991B1B' : '#065F46',
        }}>
          {message}
        </div>
      )}

      {/* 保存・戻る */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1, padding: '14px 0', fontSize: 15, fontWeight: 700,
            background: saving ? '#ddd' : '#C4A35A', color: '#fff',
            border: 'none', borderRadius: 8, cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? '保存中...' : '保存する'}
        </button>
        <a
          href={`/myproof/${authUser.id}`}
          style={{
            flex: 1, padding: '14px 0', fontSize: 15, fontWeight: 700,
            background: '#fff', color: '#1A1A2E', textAlign: 'center' as const,
            border: '1px solid #ddd', borderRadius: 8, textDecoration: 'none',
            display: 'block',
          }}
        >
          戻る
        </a>
      </div>

      {/* ImageCropper モーダル */}
      {cropImageSrc && (
        <ImageCropper
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => { setCropImageSrc(null); setCropTargetIndex(null) }}
          cropShape="round"
          aspectRatio={1}
        />
      )}
    </div>
  )
}
