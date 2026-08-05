'use client'

import { useRef, useState } from 'react'
import { uploadFile } from '@/lib/db'
import { resizeImageLongSide } from '@/lib/image-utils'
import { extractYouTubeVideoId } from '@/lib/validation'

/** §15-3: サービス・案内タブの「写真（最大6枚）」「紹介動画（YouTube）」。
 * タスクB: 「ヘッダー写真（1枚・任意）」も同セクションに追加(カードページ最上部に横長表示)。
 * 既存の受付時間/外部リンク保存(AccessLinksSection→doSaveLogic)と同じ流儀: ローカルstateを編集→「保存」で professionals へ反映。
 * DBカラム(gallery_image_urls/intro_video_url/hero_image_url)が未作成の環境でも壊れないfail-soft
 * (保存はdoSaveLogic側のPGRST204再試行に委ねる。本コンポーネントはUIのみ)。 */

const MAX_PHOTOS = 6
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 元ファイル10MBまで受け付け、クライアント側リサイズで縮む

export interface MediaFormPart {
  gallery_image_urls: string[]
  intro_video_url: string
  hero_image_url: string
}

interface Props {
  media: MediaFormPart
  onMediaChange: (next: Partial<MediaFormPart>) => void
  onSave: () => void | Promise<void>
  saving: boolean
  /** アップロード先パスの一意性確保用(professionals.user_id)。無い場合はアップロードボタンを無効化。 */
  userId: string | null | undefined
  saveNote?: string
}

export default function MediaSection({ media, onMediaChange, onSave, saving, userId, saveNote }: Props) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [videoError, setVideoError] = useState('')
  const [savedToast, setSavedToast] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // §15-2改訂(タスクB): ヘッダー写真(LP的な1枚・任意)。gallery(最大6枚)とは別カラム(hero_image_url)。
  const [uploadingHero, setUploadingHero] = useState(false)
  const [uploadErrorHero, setUploadErrorHero] = useState('')
  const heroFileInputRef = useRef<HTMLInputElement>(null)

  const photos = Array.isArray(media.gallery_image_urls) ? media.gallery_image_urls : []
  const atLimit = photos.length >= MAX_PHOTOS

  const handleHeroFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!userId) {
      setUploadErrorHero('アップロードに失敗しました。もう一度お試しください。')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadErrorHero('ファイルサイズは10MB以内にしてください')
      return
    }
    setUploadErrorHero('')
    setUploadingHero(true)
    try {
      const resized = await resizeImageLongSide(file, 1600, 0.85)
      const path = `${userId}/hero/${Date.now()}.jpg`
      const result = await uploadFile('gallery-images', path, resized, { upsert: true })
      if (result.publicUrl) {
        onMediaChange({ hero_image_url: result.publicUrl })
      } else {
        setUploadErrorHero('アップロードに失敗しました。もう一度お試しください。')
      }
    } catch {
      setUploadErrorHero('アップロードに失敗しました。もう一度お試しください。')
    } finally {
      setUploadingHero(false)
    }
  }

  const removeHero = () => {
    onMediaChange({ hero_image_url: '' })
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!userId) {
      setUploadError('アップロードに失敗しました。もう一度お試しください。')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('ファイルサイズは10MB以内にしてください')
      return
    }
    setUploadError('')
    setUploading(true)
    try {
      const resized = await resizeImageLongSide(file, 1600, 0.85)
      const path = `${userId}/gallery/${Date.now()}.jpg`
      const result = await uploadFile('gallery-images', path, resized, { upsert: true })
      if (result.publicUrl) {
        onMediaChange({ gallery_image_urls: [...photos, result.publicUrl] })
      } else {
        setUploadError('アップロードに失敗しました。もう一度お試しください。')
      }
    } catch {
      setUploadError('アップロードに失敗しました。もう一度お試しください。')
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = (index: number) => {
    onMediaChange({ gallery_image_urls: photos.filter((_, i) => i !== index) })
  }

  const handleSubmit = async () => {
    const trimmedVideo = media.intro_video_url.trim()
    if (trimmedVideo && !extractYouTubeVideoId(trimmedVideo)) {
      setVideoError('YouTubeの動画URLを入力してください')
      return
    }
    setVideoError('')
    await onSave()
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2000)
  }

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 6,
  }
  const inputStyle = (hasError: boolean) => ({
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: `1px solid ${hasError ? '#E24B4A' : '#E5E7EB'}`,
    borderRadius: 6,
    boxSizing: 'border-box' as const,
  })
  const errorTextStyle = { color: '#E24B4A', fontSize: 12, marginTop: 4 }
  const sectionTitleStyle = {
    fontSize: 15,
    fontWeight: 700,
    color: '#1A1A2E',
    marginTop: 32,
    marginBottom: 4,
  }
  const sectionDescStyle = {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 1.6,
  }

  return (
    <>
      <hr style={{ margin: '32px 0 0', border: 'none', borderTop: '1px solid #E5E7EB' }} />

      {/* ── ヘッダー写真(1枚・任意) ── */}
      <h3 style={sectionTitleStyle}>ヘッダー写真（1枚・任意）</h3>
      <p style={sectionDescStyle}>
        カードページの最上部に横長で表示されます。未設定の場合は表示されません。
      </p>

      {media.hero_image_url ? (
        <div style={{ position: 'relative' as const, width: '100%', maxWidth: 320, marginBottom: 8 }}>
          <img
            src={media.hero_image_url}
            alt=""
            style={{ width: '100%', aspectRatio: '2 / 1', borderRadius: 10, objectFit: 'cover', display: 'block' }}
          />
          <button
            type="button"
            onClick={removeHero}
            aria-label="削除"
            style={{
              position: 'absolute', top: -6, right: -6,
              width: 22, height: 22, borderRadius: '50%',
              background: '#1A1A2E', color: '#fff', border: '2px solid #fff',
              fontSize: 12, lineHeight: 1, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => heroFileInputRef.current?.click()}
          disabled={uploadingHero}
          style={{
            width: '100%', maxWidth: 320, aspectRatio: '2 / 1', borderRadius: 10,
            background: 'white', border: '1px dashed #C4A35A',
            color: '#C4A35A', fontSize: 12, fontWeight: 600,
            cursor: uploadingHero ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 8,
          }}
        >
          {uploadingHero ? '…' : '+ 追加'}
        </button>
      )}

      {media.hero_image_url && (
        <button
          type="button"
          onClick={() => heroFileInputRef.current?.click()}
          disabled={uploadingHero}
          style={{
            fontSize: 12, fontWeight: 600, color: '#C4A35A',
            background: 'transparent', border: 'none', padding: 0, marginBottom: 8,
            cursor: uploadingHero ? 'not-allowed' : 'pointer',
          }}
        >
          {uploadingHero ? '差し替え中…' : '差し替える'}
        </button>
      )}

      <input
        ref={heroFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleHeroFileSelect}
        style={{ display: 'none' }}
      />

      {uploadErrorHero && <p style={errorTextStyle}>{uploadErrorHero}</p>}

      {/* ── 写真 ── */}
      <h3 style={sectionTitleStyle}>写真（最大{MAX_PHOTOS}枚）</h3>
      <p style={sectionDescStyle}>
        施術風景や店舗の様子など、カードページの「サービス・案内」タブに表示されます。すべて任意です。
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 10, marginBottom: 8 }}>
        {photos.map((url, i) => (
          <div key={`${url}-${i}`} style={{ position: 'relative' as const, width: 88, height: 88 }}>
            <img
              src={url}
              alt=""
              style={{ width: 88, height: 88, borderRadius: 10, objectFit: 'cover', display: 'block' }}
            />
            <button
              type="button"
              onClick={() => removePhoto(i)}
              aria-label="削除"
              style={{
                position: 'absolute', top: -6, right: -6,
                width: 22, height: 22, borderRadius: '50%',
                background: '#1A1A2E', color: '#fff', border: '2px solid #fff',
                fontSize: 12, lineHeight: 1, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        ))}

        {!atLimit && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              width: 88, height: 88, borderRadius: 10,
              background: 'white', border: '1px dashed #C4A35A',
              color: '#C4A35A', fontSize: 12, fontWeight: 600,
              cursor: uploading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {uploading ? '…' : '+ 追加'}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {uploadError && <p style={errorTextStyle}>{uploadError}</p>}

      {/* ── 紹介動画 ── */}
      <h3 style={sectionTitleStyle}>紹介動画（YouTube）</h3>
      <p style={sectionDescStyle}>
        YouTubeの動画URLを1本登録できます。カードページの「サービス・案内」タブに埋め込み表示されます。
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>YouTube URL</label>
        <input
          type="url"
          value={media.intro_video_url}
          onChange={e => {
            onMediaChange({ intro_video_url: e.target.value })
            if (videoError) setVideoError('')
          }}
          placeholder="例: https://www.youtube.com/watch?v=xxxxxxxxxxx"
          style={inputStyle(!!videoError)}
        />
        {videoError && <p style={errorTextStyle}>{videoError}</p>}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving || uploading}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: (saving || uploading) ? '#E5E7EB' : '#C4A35A',
          color: (saving || uploading) ? '#9CA3AF' : '#1A1A2E',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 700,
          cursor: (saving || uploading) ? 'not-allowed' : 'pointer',
          marginBottom: 8,
        }}
      >
        {saving ? '保存中…' : '写真・動画を保存'}
      </button>

      {savedToast && (
        <>
          <p style={{ fontSize: 13, color: '#10B981', textAlign: 'center' as const, marginTop: 4 }}>
            ✓ 保存しました
          </p>
          {saveNote && (
            <p style={{ fontSize: 13, color: '#B45309', textAlign: 'center' as const, marginTop: 2 }}>
              {saveNote}
            </p>
          )}
        </>
      )}
    </>
  )
}
