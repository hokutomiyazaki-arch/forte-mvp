'use client'
import { useState, useCallback, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import { getCroppedImage } from '@/lib/image-utils'

interface Props {
  currentPhotoUrl?: string | null
  onCropComplete: (blob: Blob) => void
  /** クロップのアスペクト比（幅/高さ）。既定 1（正方形・プロフィール写真用） */
  aspect?: number
  /** 出力画像の幅/高さ(px)。既定 400x400（プロフィール写真用） */
  outputWidth?: number
  outputHeight?: number
  /**
   * 外部制御モード: 親がファイル選択（トリガーUI）を自前で持つ場合に、選択済み画像の
   * dataURLを直接渡す。指定時（undefined以外）は内部のサムネイル表示・ファイル入力を出さず
   * クロップモーダルのみ表示する（例: MediaSectionのサービス写真ギャラリー）。
   */
  imageSrc?: string | null
  onCancel?: () => void
}

export default function PhotoCropper({
  currentPhotoUrl,
  onCropComplete,
  aspect = 1,
  outputWidth = 400,
  outputHeight = 400,
  imageSrc: controlledImageSrc,
  onCancel,
}: Props) {
  const isControlled = controlledImageSrc !== undefined
  const [internalImageSrc, setInternalImageSrc] = useState<string | null>(null)
  const imageSrc = isControlled ? controlledImageSrc : internalImageSrc
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState('')

  // 画像が変わるたびに前回のクロップ座標/ズーム/確定エラーを初期化する(保険)。
  // 通常はcropSrcのnull化で親側が本コンポーネントを丸ごとアンマウントするため
  // 毎回フレッシュな状態になるが、依存配列はimageSrc(文字列|null)のプリミティブのみとし、
  // 将来アンマウントされない構成に変わっても残留状態で「決定」が無反応にならないようにする。
  useEffect(() => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setConfirmError('')
    setConfirming(false)
  }, [imageSrc])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0]
      if (file.size > 5 * 1024 * 1024) {
        alert('画像サイズは5MB以下にしてください')
        return
      }
      const reader = new FileReader()
      reader.onload = () => setInternalImageSrc(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const onCropDone = useCallback((_: any, croppedPixels: any) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const handleCancel = () => {
    if (isControlled) {
      onCancel?.()
    } else {
      setInternalImageSrc(null)
    }
  }

  const handleConfirm = async () => {
    // 画像デコード完了前(croppedAreaPixels未設定)に押された場合はボタンをdisabledにしているため
    // 通常到達しないが、念のためのガード。以前はここが無言でreturnし「決定を押しても反応しない」
    // という無反応バグの原因だったため、ユーザーに見えるメッセージを出す。
    if (!imageSrc || confirming) return
    if (!croppedAreaPixels) {
      setConfirmError('画像を読み込み中です。少し待ってから再度お試しください')
      return
    }
    setConfirmError('')
    setConfirming(true)
    try {
      const blob = await getCroppedImage(imageSrc, croppedAreaPixels, outputWidth, outputHeight)
      onCropComplete(blob)
      if (!isControlled) setInternalImageSrc(null)
    } catch {
      setConfirmError('画像の処理に失敗しました。もう一度お試しください')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div>
      {/* 現在の写真 or プレースホルダー（外部制御モードでは非表示。親が自前のトリガーUIを持つため） */}
      {!isControlled && (
        <>
          <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 mb-2 mx-auto">
            {currentPhotoUrl ? (
              <img src={currentPhotoUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-3xl">
                👤
              </div>
            )}
          </div>
          <label className="block text-center text-sm text-[#C4A35A] cursor-pointer hover:underline">
            写真を変更
            <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
          </label>
        </>
      )}

      {/* クロッパーモーダル */}
      {imageSrc && (
        <div className="fixed inset-0 bg-black/70 z-50 flex flex-col">
          <div className="relative flex-1">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropDone}
            />
          </div>
          <div className="bg-white p-4 flex flex-col items-center gap-2">
            {confirmError && (
              <p className="text-xs text-center" style={{ color: '#E24B4A' }}>{confirmError}</p>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={handleCancel}
                className="px-6 py-2 border rounded text-sm">
                キャンセル
              </button>
              <button onClick={handleConfirm}
                disabled={confirming || !croppedAreaPixels}
                className="px-6 py-2 bg-[#C4A35A] text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                {confirming ? '処理中…' : (!croppedAreaPixels ? '読み込み中…' : '決定')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
