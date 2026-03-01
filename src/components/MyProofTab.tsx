'use client'
import { useState, useEffect } from 'react'
import { THEMES, CATEGORIES, getCategoryByKey, getCategoryShortLabel } from '@/lib/myproof-themes'
import type { ThemeKey, CategoryKey } from '@/lib/myproof-themes'
import ImageCropper from '@/components/ImageCropper'

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

interface VotedPro {
  id: string
  name: string
  title: string
  photo_url: string | null
}

export default function MyProofTab() {
  const [card, setCard] = useState<MyProofCard | null>(null)
  const [items, setItems] = useState<MyProofItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tagline, setTagline] = useState('')
  const [savingTagline, setSavingTagline] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>('dark')

  // Add pro modal
  const [showAddProModal, setShowAddProModal] = useState(false)
  const [votedPros, setVotedPros] = useState<VotedPro[]>([])
  const [loadingPros, setLoadingPros] = useState(false)

  // Add custom form
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [customPhotoUrl, setCustomPhotoUrl] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<CategoryKey>('other')
  const [addingItem, setAddingItem] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Photo cropper
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [croppedPhotoBlob, setCroppedPhotoBlob] = useState<Blob | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Pro description modal
  const [proDescModal, setProDescModal] = useState<{ proId: string; proName: string } | null>(null)
  const [proDesc, setProDesc] = useState('')

  useEffect(() => {
    loadMyProof()
  }, [])

  async function loadMyProof() {
    try {
      const res = await fetch('/api/myproof')
      if (!res.ok) return
      const data = await res.json()
      setCard(data.card)
      setItems(data.items || [])
      setTagline(data.card?.tagline || '')
      setSelectedTheme((data.card?.theme as ThemeKey) || 'dark')
    } catch (e) {
      console.error('[MyProofTab] load error:', e)
    }
    setLoading(false)
  }

  async function saveTagline() {
    setSavingTagline(true)
    try {
      await fetch('/api/myproof/card', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagline }),
      })
    } catch (e) {
      console.error('[MyProofTab] tagline save error:', e)
    }
    setSavingTagline(false)
  }

  async function handleThemeChange(theme: ThemeKey) {
    setSelectedTheme(theme)
    try {
      await fetch('/api/myproof/card', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      })
    } catch (e) {
      console.error('[MyProofTab] theme save error:', e)
    }
  }

  async function openAddProModal() {
    setShowAddProModal(true)
    setLoadingPros(true)
    try {
      const res = await fetch('/api/myproof/voted-pros')
      if (res.ok) {
        const data = await res.json()
        setVotedPros(data.pros || [])
      }
    } catch (e) {
      console.error('[MyProofTab] voted pros error:', e)
    }
    setLoadingPros(false)
  }

  async function addPro(proId: string, description?: string) {
    setAddingItem(true)
    try {
      const res = await fetch('/api/myproof/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'professional',
          professional_id: proId,
          description: description || null,
          category: 'professional',
        }),
      })
      if (res.ok) {
        setShowAddProModal(false)
        setProDescModal(null)
        setProDesc('')
        await loadMyProof()
      } else {
        const data = await res.json()
        alert(data.error || '追加に失敗しました')
      }
    } catch (e) {
      console.error('[MyProofTab] addPro error:', e)
    }
    setAddingItem(false)
  }

  async function addCustom() {
    if (!customTitle.trim()) {
      alert('タイトルは必須です')
      return
    }
    setAddingItem(true)
    try {
      // クロップ済み画像がある場合はまずアップロード
      let photoUrl = customPhotoUrl || null
      if (croppedPhotoBlob && !customPhotoUrl) {
        setUploadingPhoto(true)
        const formData = new FormData()
        formData.append('file', croppedPhotoBlob, 'cropped.jpg')
        const uploadRes = await fetch('/api/upload/avatar', { method: 'POST', body: formData })
        const uploadData = await uploadRes.json()
        if (uploadData.url) {
          photoUrl = uploadData.url
        }
        setUploadingPhoto(false)
      }

      const res = await fetch('/api/myproof/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'custom',
          title: customTitle.trim(),
          description: customDesc.trim() || null,
          photo_url: photoUrl,
          category: newItemCategory,
        }),
      })
      if (res.ok) {
        setShowCustomForm(false)
        setCustomTitle('')
        setCustomDesc('')
        setCustomPhotoUrl('')
        setNewItemCategory('other')
        setCroppedPhotoBlob(null)
        setPhotoPreview(null)
        await loadMyProof()
      } else {
        const data = await res.json()
        alert(data.error || '追加に失敗しました')
      }
    } catch (e) {
      console.error('[MyProofTab] addCustom error:', e)
    }
    setAddingItem(false)
  }

  async function removeItem(id: string) {
    if (!window.confirm('このおすすめを削除しますか？')) return
    try {
      await fetch(`/api/myproof/items/${id}`, { method: 'DELETE' })
      await loadMyProof()
    } catch (e) {
      console.error('[MyProofTab] remove error:', e)
    }
  }

  async function moveItem(index: number, direction: 'up' | 'down') {
    const newItems = [...items]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newItems.length) return

    ;[newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]]
    const reordered = newItems.map((item, i) => ({ ...item, sort_order: i + 1 }))
    setItems(reordered)

    try {
      await fetch('/api/myproof/items/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: reordered.map(item => ({ id: item.id, sort_order: item.sort_order })),
        }),
      })
    } catch (e) {
      console.error('[MyProofTab] reorder error:', e)
    }
  }

  function handleCustomPhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('画像サイズは5MB以下にしてください')
      return
    }
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setCropImageSrc(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleCropComplete(croppedBlob: Blob) {
    setCropImageSrc(null)
    setCroppedPhotoBlob(croppedBlob)
    setPhotoPreview(URL.createObjectURL(croppedBlob))
    setCustomPhotoUrl('') // URLはaddCustom時にアップロードで取得
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-400 text-sm">読み込み中...</div>
  }

  return (
    <>
      {/* テーマ選択 + タグライン */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">マイプルーフ</h2>
        <p className="text-sm text-gray-500 mb-4">
          あなたが本気でオススメする人や物を集めて、シェアしよう。
        </p>

        {/* テーマ選択 */}
        <div className="mb-5">
          <p className="text-sm font-medium text-gray-700 mb-2">カードテーマ</p>
          <div className="flex gap-3">
            {Object.values(THEMES).map((t) => (
              <button
                key={t.key}
                onClick={() => handleThemeChange(t.key)}
                className="relative transition-all"
                style={{
                  width: 44, height: 44, borderRadius: '50%',
                  backgroundColor: t.selectorColor,
                  border: selectedTheme === t.key
                    ? `3px solid ${t.accent}`
                    : t.isLight ? '2px solid #ccc' : '2px solid #555',
                  boxShadow: selectedTheme === t.key
                    ? `0 0 0 2px #fff, 0 0 0 4px ${t.accent}`
                    : 'none',
                  cursor: 'pointer',
                }}
                title={t.label}
              >
                {selectedTheme === t.key && (
                  <div style={{
                    position: 'absolute', top: -6, right: -6,
                    background: t.accent, borderRadius: '50%',
                    width: 16, height: 16, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: '#fff',
                  }}>✓</div>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            {THEMES[selectedTheme]?.label}
          </p>
        </div>

        {/* タグライン */}
        <div>
          <label className="text-sm text-gray-600">タグライン（一言紹介）</label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={tagline}
              onChange={e => setTagline(e.target.value)}
              maxLength={100}
              placeholder="例: 健康オタクがガチでオススメする人たち"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#C4A35A] outline-none"
            />
            <button
              onClick={saveTagline}
              disabled={savingTagline}
              className="px-4 py-2 bg-[#1A1A2E] text-white text-sm rounded-lg hover:bg-[#2a2a4e] disabled:opacity-50"
            >
              {savingTagline ? '...' : '保存'}
            </button>
          </div>
        </div>
      </div>

      {/* アイテム一覧 */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-[#1A1A2E]">おすすめ一覧（{items.length}/10）</h3>
          <div className="flex gap-2">
            <button
              onClick={openAddProModal}
              className="px-3 py-1.5 text-xs bg-[#C4A35A] text-white rounded-lg hover:bg-[#b3944f]"
            >
              + プロを追加
            </button>
            <button
              onClick={() => setShowCustomForm(true)}
              className="px-3 py-1.5 text-xs border border-[#C4A35A] text-[#C4A35A] rounded-lg hover:bg-[#C4A35A]/5"
            >
              + 自由に追加
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            まだおすすめがありません。上のボタンから追加してみましょう。
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => {
              const cat = getCategoryByKey(item.category || 'other')
              return (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  {/* 並べ替えボタン */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => moveItem(idx, 'up')}
                      disabled={idx === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs"
                    >▲</button>
                    <button
                      onClick={() => moveItem(idx, 'down')}
                      disabled={idx === items.length - 1}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs"
                    >▼</button>
                  </div>

                  {/* 写真（丸形） */}
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                    {(item.item_type === 'professional' ? item.pro_photo_url : item.photo_url) ? (
                      <img
                        src={(item.item_type === 'professional' ? item.pro_photo_url : item.photo_url)!}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                        {item.item_type === 'professional' ? '👤' : cat.icon}
                      </div>
                    )}
                  </div>

                  {/* 情報 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[#1A1A2E] truncate">
                        {item.item_type === 'professional' ? item.pro_name : item.title}
                      </p>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: cat.color + '20',
                          color: cat.color,
                        }}
                      >
                        {cat.icon} {getCategoryShortLabel(cat)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">&quot;{item.description}&quot;</p>
                    )}
                    {!item.description && item.item_type === 'professional' && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {item.pro_title || ''} · プルーフ {item.pro_vote_count || 0}
                      </p>
                    )}
                  </div>

                  {/* 削除 */}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                  >✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* カスタム追加モーダル */}
      {showCustomForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[#1A1A2E] mb-4">おすすめを追加</h3>
            <div className="space-y-3">
              {/* カテゴリ選択ピル */}
              <div>
                <p className="text-xs text-gray-500 mb-1">カテゴリ</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.filter(c => c.key !== 'professional').map((cat) => (
                    <button
                      key={cat.key}
                      onClick={() => setNewItemCategory(cat.key as CategoryKey)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        newItemCategory === cat.key
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      style={newItemCategory === cat.key ? { backgroundColor: cat.color } : {}}
                    >
                      {cat.icon} {getCategoryShortLabel(cat)}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="text"
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                maxLength={100}
                placeholder="タイトル（例: 〇〇の腸活サプリ）"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#C4A35A] outline-none"
              />
              <textarea
                value={customDesc}
                onChange={e => setCustomDesc(e.target.value)}
                placeholder="おすすめ理由（任意）"
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#C4A35A] outline-none resize-none"
              />
              <div>
                <label className="text-xs text-gray-500">写真（任意）</label>
                <div className="mt-1 flex items-center gap-3">
                  {photoPreview ? (
                    <div className="relative">
                      <img src={photoPreview} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-[#C4A35A]" />
                      <button
                        onClick={() => { setPhotoPreview(null); setCroppedPhotoBlob(null); setCustomPhotoUrl('') }}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
                      >×</button>
                    </div>
                  ) : (
                    <label className="w-14 h-14 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer text-[10px] text-gray-400 text-center leading-tight">
                      写真
                      <input type="file" accept="image/*" onChange={handleCustomPhotoSelect} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowCustomForm(false); setCustomTitle(''); setCustomDesc(''); setCustomPhotoUrl(''); setNewItemCategory('other'); setCroppedPhotoBlob(null); setPhotoPreview(null) }}
                  className="flex-1 py-2 text-sm border border-gray-300 rounded-lg"
                >
                  キャンセル
                </button>
                <button
                  onClick={addCustom}
                  disabled={addingItem || uploadingPhoto || !customTitle.trim()}
                  className="flex-1 py-2 text-sm bg-[#C4A35A] text-white rounded-lg hover:bg-[#b3944f] disabled:opacity-50"
                >
                  {addingItem || uploadingPhoto ? 'アップロード中...' : '追加する'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* プロ追加モーダル */}
      {showAddProModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[#1A1A2E] mb-4">投票済みプロから追加</h3>
            {loadingPros ? (
              <p className="text-sm text-gray-400 text-center py-4">読み込み中...</p>
            ) : votedPros.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">追加可能なプロがいません</p>
            ) : (
              <div className="space-y-2">
                {votedPros.map(pro => (
                  <button
                    key={pro.id}
                    onClick={() => {
                      setProDescModal({ proId: pro.id, proName: pro.name })
                      setProDesc('')
                    }}
                    disabled={addingItem}
                    className="w-full flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:border-[#C4A35A] transition text-left disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                      {pro.photo_url ? (
                        <img src={pro.photo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                          {pro.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#1A1A2E]">{pro.name}</div>
                      <div className="text-xs text-gray-400">{pro.title}</div>
                    </div>
                    <span className="text-xs text-[#C4A35A]">追加</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowAddProModal(false)}
              className="mt-4 w-full py-2 text-sm border border-gray-300 rounded-lg"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* プロおすすめ理由入力モーダル */}
      {proDescModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-base font-bold text-[#1A1A2E] mb-2">
              {proDescModal.proName} のおすすめ理由
            </h3>
            <p className="text-xs text-gray-500 mb-3">なぜこのプロをオススメしますか？（任意）</p>
            <textarea
              value={proDesc}
              onChange={e => setProDesc(e.target.value)}
              placeholder="例: 根本から改善してくれる施術が素晴らしい"
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#C4A35A] outline-none resize-none mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setProDescModal(null); setProDesc('') }}
                className="flex-1 py-2 text-sm border border-gray-300 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={() => addPro(proDescModal.proId, proDesc)}
                disabled={addingItem}
                className="flex-1 py-2 text-sm bg-[#C4A35A] text-white rounded-lg hover:bg-[#b3944f] disabled:opacity-50"
              >
                {addingItem ? '追加中...' : '追加する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 写真クロッパー */}
      {cropImageSrc && (
        <ImageCropper
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImageSrc(null)}
          cropShape="round"
          aspectRatio={1}
        />
      )}
    </>
  )
}
