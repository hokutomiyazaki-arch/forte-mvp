'use client'
import { useState, useEffect } from 'react'

interface MyProofItem {
  id: string
  item_type: 'professional' | 'custom'
  professional_id: string | null
  title: string | null
  description: string | null
  photo_url: string | null
  sort_order: number
  // enriched fields
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

  // Add pro modal
  const [showAddProModal, setShowAddProModal] = useState(false)
  const [votedPros, setVotedPros] = useState<VotedPro[]>([])
  const [loadingPros, setLoadingPros] = useState(false)

  // Add custom form
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [customPhotoUrl, setCustomPhotoUrl] = useState('')
  const [addingItem, setAddingItem] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

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

  async function addPro(proId: string) {
    setAddingItem(true)
    try {
      const res = await fetch('/api/myproof/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_type: 'professional', professional_id: proId }),
      })
      if (res.ok) {
        setShowAddProModal(false)
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
      const res = await fetch('/api/myproof/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'custom',
          title: customTitle.trim(),
          description: customDesc.trim() || null,
          photo_url: customPhotoUrl || null,
        }),
      })
      if (res.ok) {
        setShowCustomForm(false)
        setCustomTitle('')
        setCustomDesc('')
        setCustomPhotoUrl('')
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

  async function handleCustomPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('画像サイズは5MB以下にしてください')
      return
    }
    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload/avatar', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.url) setCustomPhotoUrl(data.url)
    } catch (e) {
      console.error('[MyProofTab] photo upload error:', e)
    }
    setUploadingPhoto(false)
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-400 text-sm">読み込み中...</div>
  }

  const qrUrl = card?.qr_token
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin + '/myproof/p/' + card.qr_token : 'https://realproof.jp/myproof/p/' + card.qr_token)}`
    : ''

  const publicUrl = card?.qr_token
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://realproof.jp'}/myproof/p/${card.qr_token}`
    : ''

  return (
    <>
      {/* タグライン */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">マイプルーフ</h2>
        <p className="text-sm text-gray-500 mb-4">
          あなたが本気でオススメする人や物を集めて、シェアしよう。
        </p>

        <div className="mb-4">
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
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg">
                {/* 並べ替えボタン */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveItem(idx, 'up')}
                    disabled={idx === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveItem(idx, 'down')}
                    disabled={idx === items.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs"
                  >
                    ▼
                  </button>
                </div>

                {/* 写真 */}
                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                  {(item.item_type === 'professional' ? item.pro_photo_url : item.photo_url) ? (
                    <img
                      src={(item.item_type === 'professional' ? item.pro_photo_url : item.photo_url)!}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                      {item.item_type === 'professional' ? '👤' : '📦'}
                    </div>
                  )}
                </div>

                {/* 情報 */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#1A1A2E] truncate">
                    {item.item_type === 'professional' ? item.pro_name : item.title}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {item.item_type === 'professional'
                      ? `${item.pro_title || ''} · プルーフ ${item.pro_vote_count || 0}`
                      : (item.description || '')}
                  </div>
                </div>

                {/* タイプバッジ */}
                <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${
                  item.item_type === 'professional'
                    ? 'bg-[#C4A35A]/10 text-[#C4A35A]'
                    : 'bg-[#1A1A2E]/10 text-[#1A1A2E]'
                }`}>
                  {item.item_type === 'professional' ? 'プロ' : 'カスタム'}
                </span>

                {/* 削除 */}
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* カスタム追加フォーム */}
      {showCustomForm && (
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h3 className="text-sm font-bold text-[#1A1A2E] mb-3">おすすめを追加</h3>
          <div className="space-y-3">
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
              placeholder="説明（任意）"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#C4A35A] outline-none resize-none"
            />
            <div>
              <label className="text-xs text-gray-500">写真（任意）</label>
              {customPhotoUrl ? (
                <div className="mt-1 flex items-center gap-2">
                  <img src={customPhotoUrl} alt="" className="w-12 h-12 rounded object-cover" />
                  <button onClick={() => setCustomPhotoUrl('')} className="text-xs text-red-400">削除</button>
                </div>
              ) : (
                <label className="block mt-1 text-sm text-[#C4A35A] cursor-pointer hover:underline">
                  {uploadingPhoto ? 'アップロード中...' : '写真を選択'}
                  <input type="file" accept="image/*" onChange={handleCustomPhotoUpload} className="hidden" />
                </label>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowCustomForm(false); setCustomTitle(''); setCustomDesc(''); setCustomPhotoUrl('') }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={addCustom}
                disabled={addingItem || !customTitle.trim()}
                className="px-4 py-2 text-sm bg-[#C4A35A] text-white rounded-lg hover:bg-[#b3944f] disabled:opacity-50"
              >
                {addingItem ? '追加中...' : '追加する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QRコード & URL */}
      {card && (
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6 text-center">
          <h3 className="text-sm font-bold text-[#1A1A2E] mb-3">マイプルーフ QRコード</h3>
          <p className="text-xs text-gray-400 mb-4">スキャンするとあなたのマイプルーフページが開きます（期限なし）</p>
          {qrUrl && (
            <img src={qrUrl} alt="マイプルーフ QR" className="mx-auto mb-4" style={{ width: 200, height: 200 }} />
          )}
          {publicUrl && (
            <div className="flex items-center gap-2 justify-center">
              <input
                type="text"
                value={publicUrl}
                readOnly
                className="text-xs border border-gray-200 rounded px-2 py-1 w-64 text-gray-500"
              />
              <button
                onClick={() => { navigator.clipboard.writeText(publicUrl) }}
                className="text-xs text-[#C4A35A] hover:underline"
              >
                コピー
              </button>
            </div>
          )}
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
                    onClick={() => addPro(pro.id)}
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
    </>
  )
}
