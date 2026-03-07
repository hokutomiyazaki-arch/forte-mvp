'use client'
import { useState, useEffect, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import ImageCropper from '@/components/ImageCropper'

export default function NewBadgePage() {
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [cropperSrc, setCropperSrc] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [existingCount, setExistingCount] = useState(0)

  const { user: clerkUser, isLoaded: authLoaded } = useUser()
  const authUser = clerkUser ? { id: clerkUser.id } : null

  useEffect(() => {
    if (!authLoaded) return
    if (!authUser) { window.location.href = '/login?role=pro'; return }
    load()
  }, [authLoaded, authUser])

  async function load() {
    try {
      // まず org-dashboard から団体情報を取得
      const dashRes = await fetch('/api/org-dashboard')
      if (!dashRes.ok) throw new Error('データの取得に失敗しました')
      const dashData = await dashRes.json()

      if (!dashData.org) {
        window.location.href = '/org/register'
        return
      }

      setOrg(dashData.org)

      // バッジ件数を取得
      const badgeRes = await fetch(`/api/org-badge?org_id=${dashData.org.id}`)
      if (!badgeRes.ok) throw new Error('バッジ情報の取得に失敗しました')
      const badgeData = await badgeRes.json()

      setExistingCount(badgeData.badgeCount || 0)
    } catch (err: any) {
      setError(err.message || 'データの取得に失敗しました')
    }
    setLoading(false)
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setError('画像は5MB以下にしてください')
      return
    }

    const reader = new FileReader()
    reader.onload = () => setCropperSrc(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleCropComplete(blob: Blob) {
    setCropperSrc(null)
    setImageBlob(blob)
    const url = URL.createObjectURL(blob)
    setImagePreview(url)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      if (!name.trim()) throw new Error('バッジ名を入力してください')

      let imageUrl: string | null = null

      // 画像アップロード
      if (imageBlob) {
        const filePath = `${org.id}/${Date.now()}.jpg`

        const formData = new FormData()
        formData.append('bucket', 'badge-images')
        formData.append('path', filePath)
        formData.append('file', imageBlob, 'badge.jpg')

        const uploadRes = await fetch('/api/storage', { method: 'POST', body: formData })
        const uploadData = await uploadRes.json()
        if (!uploadRes.ok) throw new Error('画像のアップロードに失敗しました: ' + (uploadData.error || ''))

        imageUrl = uploadData.publicUrl
      }

      // バッジ作成（API経由）
      const createRes = await fetch('/api/org-badge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: org.id,
          name: name.trim(),
          description: description.trim() || null,
          image_url: imageUrl,
          sort_order: existingCount,
        }),
      })

      const createData = await createRes.json()
      if (!createRes.ok) throw new Error(createData.error || 'バッジの作成に失敗しました')

      window.location.href = '/org/dashboard/badges'
    } catch (err: any) {
      setError(err.message || 'バッジの作成に失敗しました')
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#C4A35A] border-t-transparent rounded-full mx-auto" />
        <p className="text-gray-400 mt-4 text-sm">読み込み中...</p>
      </div>
    )
  }

  if (!org) return null

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <button
        onClick={() => window.location.href = '/org/dashboard/badges'}
        className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1"
      >
        ← バッジ一覧に戻る
      </button>

      <h1 className="text-xl font-bold text-[#1A1A2E] mb-1">新しいバッジを作成</h1>
      <p className="text-sm text-gray-500 mb-8">
        {org.name}のバッジを作成します。作成後に取得URLが発行されます。
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* バッジ画像 */}
        <div>
          <label className="block text-sm font-medium text-[#1A1A2E] mb-2">
            バッジ画像（任意）
          </label>
          <div className="flex items-center gap-4">
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="プレビュー"
                className="w-20 h-20 rounded-xl object-cover bg-white"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#C4A35A] to-[#E8D5A0] flex items-center justify-center text-white text-2xl font-bold">
                {name.charAt(0) || '?'}
              </div>
            )}
            <div>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="cursor-pointer px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition inline-block"
              >
                画像を選択
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                style={{ display: 'none' }}
              />
              <p className="text-xs text-gray-400 mt-1">PNG/JPG 5MB以下</p>
            </div>
          </div>
        </div>

        {/* バッジ名 */}
        <div>
          <label className="block text-sm font-medium text-[#1A1A2E] mb-2">
            バッジ名 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            maxLength={100}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#C4A35A] outline-none"
            placeholder="例: ヘッドスパ認定"
          />
        </div>

        {/* 説明 */}
        <div>
          <label className="block text-sm font-medium text-[#1A1A2E] mb-2">
            説明（任意）
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#C4A35A] outline-none resize-none"
            placeholder="バッジの説明を入力..."
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-xl hover:bg-[#2a2a4e] transition disabled:opacity-50"
        >
          {submitting ? '作成中...' : 'バッジを作成'}
        </button>
      </form>

      {/* 画像クロッパー */}
      {cropperSrc && (
        <ImageCropper
          imageSrc={cropperSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropperSrc(null)}
          cropShape="rect"
        />
      )}
    </div>
  )
}
